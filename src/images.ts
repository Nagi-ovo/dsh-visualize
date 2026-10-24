/**
 * Images a card cannot load itself. The frame CSP admits images only from
 * `data:`, `blob:` and the CDN allowlist, and the frame cannot fetch, so a
 * workspace figure or an arbitrary web image never renders from a plain
 * `src`. The model writes `<img data-viz-src="…">` instead, and at execute
 * time this module resolves each one on the node side:
 *
 * - a workspace path is read through the host's `ctx.fs` seam, relative to
 *   the session workspace root, and must stay inside it lexically and after
 *   the backend resolves symlinks (`ctx.fs.contains`);
 * - an http(s) URL is fetched by node with a bounded size, an overall
 *   timeout and a few redirects, and every hop must connect to a public
 *   address: the check runs inside the socket's DNS lookup, so a name that
 *   rebinds between check and connect cannot reach loopback, a private
 *   network or cloud metadata.
 *
 * Every image is identified by its magic bytes, not by its name or the
 * server's content type: PNG, JPEG, GIF, WebP, or SVG. SVG is kept as is,
 * unsanitised, because it only ever renders through `<img>` — script-inert,
 * with no external loads — inside the sandboxed frame, and the image route
 * serves its bytes as a download, never as a document.
 *
 * Bytes go to the card store (storage.ts), not into the fragment, the
 * model-facing result, or the persisted meta, which carries only references.
 * Failures are per image: each comes back with a reason the model can act
 * on, and the card shows a placeholder for it.
 *
 * @module @nagi-ovo/dsh-visualize/images
 */

import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { resolve as resolvePath } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { FsInfo, FsTarget } from '@deepseek-ai/dsh-fs'
import type { CardImage, CardImageType } from './fragment.ts'
import { imageSources } from './lint.ts'
import { inside, type ImageStore, type StoredImage } from './storage.ts'

/** Caps on what one card embeds. */
export interface ImageLimits {
  /** Largest single image, in bytes. */
  maxImageBytes: number
  /** Largest total of one card's images, in bytes. */
  maxCardBytes: number
  /** Most distinct `data-viz-src` values one card resolves. */
  maxImages: number
  /** Overall time one URL may take, redirects included. */
  timeoutMs: number
  /** Redirects one URL may follow. */
  maxRedirects: number
}

/** The shipped caps; see the README for why these numbers. */
export const DEFAULT_IMAGE_LIMITS: ImageLimits = {
  maxImageBytes: 5 * 1024 * 1024,
  maxCardBytes: 12 * 1024 * 1024,
  maxImages: 16,
  timeoutMs: 10_000,
  maxRedirects: 3,
}

/** One image that could not be embedded, and why, in words the model can act on. */
export interface ImageFailure {
  src: string
  reason: string
}

/** An image refusal whose message is the model-facing reason. */
export class ImageError extends Error {}

/** Reads one workspace image: `(path, signal, maxBytes) → bytes`. */
export type FileReader = (path: string, signal: AbortSignal, maxBytes: number) => Promise<Uint8Array>

/** Fetches one URL's body: `(url, signal, maxBytes) → bytes`. */
export type UrlFetcher = (url: URL, signal: AbortSignal, maxBytes: number) => Promise<Uint8Array>

/** What {@link resolveCardImages} needs from its surroundings. */
export interface ResolveOptions {
  readFile: FileReader
  fetchUrl: UrlFetcher
  /** Where bytes go; undefined when this session has no card store. */
  store: ImageStore | undefined
  /** Why images cannot reach the card on this host at all, when they cannot. */
  unavailable?: string
  /** The card's images before this call (an `update`); URL images among them are carried. */
  previous?: readonly StoredImage[]
  limits?: ImageLimits
  signal: AbortSignal
}

/** What one card resolved. */
export interface ResolvedImages {
  /** Embedded images, one per distinct source, in document order. */
  images: StoredImage[]
  failures: ImageFailure[]
}

/**
 * Resolve every `<img data-viz-src>` in a fragment. Never throws for one
 * image: each failure is recorded and the rest continue.
 * @param fragment - the card's markup, as it will be stored.
 * @param options - readers, store, previous images, caps.
 * @returns the embedded images and the failures.
 */
export async function resolveCardImages(fragment: string, options: ResolveOptions): Promise<ResolvedImages> {
  const limits = options.limits ?? DEFAULT_IMAGE_LIMITS
  const all = imageSources(fragment).map(source => source.raw)
  const sources = [...new Set(all)]
  // The card splices the whole image into every tag that names it, so an
  // image costs its size once per reference, not once per source.
  const uses = new Map<string, number>()
  for (const src of all) uses.set(src, (uses.get(src) ?? 0) + 1)
  const failures: ImageFailure[] = []
  if (sources.length === 0) return { images: [], failures }
  const { store } = options
  const unavailable = options.unavailable ?? (store === undefined ? 'this session has no card store to keep images in' : undefined)
  if (unavailable !== undefined || store === undefined) {
    return { images: [], failures: sources.map(src => ({ src, reason: unavailable! })) }
  }
  const carried = new Map((options.previous ?? []).filter(image => image.origin === 'url').map(image => [image.src, image]))
  const wanted = sources.slice(0, limits.maxImages)
  for (const src of sources.slice(limits.maxImages)) {
    failures.push({ src, reason: `the card already embeds ${limits.maxImages} images, the most one card takes` })
  }
  // Fetched together, so a slow host costs one timeout, not one per image.
  const fetched = await Promise.all(wanted.map(async (src) => {
    const kept = carried.get(src)
    if (kept !== undefined && await store.exists(kept.id)) return { src, kept }
    try {
      return { src, image: await resolveOne(src, options, limits) }
    } catch (error) {
      if (options.signal.aborted) throw error
      return { src, reason: reasonOf(error) }
    }
  }))
  // The card budget is spent in document order, so which image misses it
  // does not depend on network timing. Each reference counts.
  let budget = limits.maxCardBytes
  const images: StoredImage[] = []
  for (const entry of fetched) {
    if (entry.reason !== undefined) {
      failures.push({ src: entry.src, reason: entry.reason })
      continue
    }
    const bytes = entry.kept?.bytes ?? entry.image!.data.byteLength
    const count = uses.get(entry.src) ?? 1
    if (bytes * count > budget) {
      failures.push({
        src: entry.src,
        reason: count === 1
          ? cardBudgetReason(limits)
          : `${cardBudgetReason(limits)} — it is referenced ${count} times and every reference embeds a full copy, so reference it once or use a smaller image`,
      })
      continue
    }
    budget -= bytes * count
    if (entry.kept !== undefined) {
      images.push(entry.kept)
      continue
    }
    const { data, type, origin } = entry.image!
    images.push({ src: entry.src, id: await store.put(data, type), type, bytes, origin })
  }
  failures.sort((a, b) => sources.indexOf(a.src) - sources.indexOf(b.src))
  return { images, failures }
}

/** The meta form of an embedded image: the manifest entry without its origin. */
export function cardImageOf({ src, id, type, bytes }: StoredImage): CardImage {
  return { src, id, type, bytes }
}

/**
 * Fetch or read one source and identify it.
 * @param src - the attribute value as written.
 * @param options - readers.
 * @param limits - the per-image cap and the timeout.
 * @returns the bytes, their type, and their origin.
 */
async function resolveOne(
  src: string,
  options: ResolveOptions,
  limits: ImageLimits,
): Promise<{ data: Uint8Array; type: CardImageType; origin: 'url' | 'file' }> {
  const maxBytes = limits.maxImageBytes
  const value = decodeEntities(src).trim()
  const target = classify(value)
  let data: Uint8Array
  try {
    if (target.kind === 'url') {
      const signal = withTimeout(options.signal, limits.timeoutMs)
      data = await options.fetchUrl(target.url, signal, maxBytes)
    } else {
      data = await options.readFile(target.path, options.signal, maxBytes)
    }
  } catch (error) {
    if (error instanceof TooLarge) throw new ImageError(`larger than the ${mib(limits.maxImageBytes)} limit for one image`)
    throw error
  }
  const type = sniffImageType(data)
  if (type === undefined) {
    throw new ImageError(`not a PNG, JPEG, GIF, WebP or SVG image (the content starts ${JSON.stringify(preview(data))})`)
  }
  return { data, type, origin: target.kind === 'url' ? 'url' : 'file' }
}

/** Where a decoded `data-viz-src` points. */
type SourceTarget = { kind: 'url'; url: URL } | { kind: 'file'; path: string }

/**
 * Tell a URL from a workspace path, refusing every other scheme with the fix.
 * @param value - the decoded attribute value.
 * @returns the target.
 * @throws ImageError for an unusable value.
 */
function classify(value: string): SourceTarget {
  const scheme = /^([a-z][\w+.-]*):/iu.exec(value)?.[1]?.toLowerCase()
  if (value.startsWith('//')) return { kind: 'url', url: parseUrl(`https:${value}`) }
  // A one-letter "scheme" is a Windows drive, which is a path.
  if (scheme === undefined || scheme.length === 1) return { kind: 'file', path: value }
  if (scheme === 'http' || scheme === 'https') return { kind: 'url', url: parseUrl(value) }
  if (scheme === 'data' || scheme === 'blob') throw new ImageError(`a ${scheme}: URL already loads in the card; put it in src, not data-viz-src`)
  throw new ImageError(`${scheme}: URLs are not supported; use an http(s) URL or a path relative to the workspace root`)
}

/** Parse a URL, refusing what cannot be fetched. */
function parseUrl(value: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new ImageError('not a valid URL')
  }
}

/** Bytes that exceed the cap a reader was given. */
export class TooLarge extends Error {}

/** The card-budget refusal. */
function cardBudgetReason(limits: ImageLimits): string {
  return `the card's images would exceed the ${mib(limits.maxCardBytes)} limit for one card; use smaller images or fewer of them`
}

/** A byte count in MiB, for messages. */
function mib(bytes: number): string {
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`
}

/** The model-facing reason for one failure. */
function reasonOf(error: unknown): string {
  if (error instanceof ImageError) return error.message
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'timed out'
  const message = error instanceof Error ? error.message : String(error)
  return message.split('\n')[0]!.slice(0, 200)
}

/** The first few bytes as text, for a "not an image" message. */
function preview(data: Uint8Array): string {
  return Array.from(data.subarray(0, 16), byte => byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.').join('')
}

/** The caller's signal plus an overall deadline. */
function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)])
}

/** The named and numeric character references an attribute value can carry. */
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/**
 * Decode the character references the HTML parser would in an attribute
 * value, so `a.png?x=1&amp;y=2` fetches what the browser would have.
 * @param value - raw attribute text.
 * @returns the decoded value.
 */
function decodeEntities(value: string): string {
  return value.replaceAll(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/giu, (whole, dec?: string, hex?: string, name?: string) => {
    if (name !== undefined) return ENTITIES[name.toLowerCase()] ?? whole
    const code = Number.parseInt(dec ?? hex!, dec === undefined ? 16 : 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

/** Whether `data` holds `expected` at `offset`. */
function bytesAt(data: Uint8Array, offset: number, expected: readonly number[] | string): boolean {
  const codes = typeof expected === 'string' ? Array.from(expected, c => c.charCodeAt(0)) : expected
  return data.byteLength >= offset + codes.length && codes.every((byte, i) => data[offset + i] === byte)
}

/** An SVG document's start: optional BOM, XML declaration, comments and doctype, then the root element. */
const SVG_START = /^﻿?\s*(?:<\?xml[^>]*>\s*)?(?:(?:<!--[\s\S]*?-->|<!doctype[^>[]*(?:\[[\s\S]*?\])?\s*>)\s*)*<svg[\s>/]/iu

/**
 * Identify an image by its content.
 * @param data - the whole file or response body.
 * @returns the image type, or undefined for anything else.
 */
export function sniffImageType(data: Uint8Array): CardImageType | undefined {
  if (bytesAt(data, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (bytesAt(data, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (bytesAt(data, 0, 'GIF87a') || bytesAt(data, 0, 'GIF89a')) return 'image/gif'
  if (bytesAt(data, 0, 'RIFF') && bytesAt(data, 8, 'WEBP')) return 'image/webp'
  const head = new TextDecoder('utf-8', { fatal: false }).decode(data.subarray(0, 4096))
  return SVG_START.test(head) ? 'image/svg+xml' : undefined
}

/** The slice of `ctx.fs` the workspace reader uses, feature-detected per call. */
interface BinaryFs {
  resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>
  contains(parent: FsTarget, child: FsTarget): boolean
  stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>
  readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
}

/**
 * Read workspace images through the host's fs seam. Paths resolve against the
 * session workspace root; one that leaves it — lexically, or through a
 * symlink the backend follows — is refused before any byte is read.
 * @param ctx - registrant context carrying `ctx.fs`.
 * @param root - absolute session workspace root, undefined when the session has none.
 * @returns the reader.
 */
export function workspaceImageReader(ctx: Context, root: string | undefined): FileReader {
  return async (path, signal, maxBytes) => {
    if (root === undefined) throw new ImageError('this conversation has no workspace to read files from')
    if (path === '~' || path.startsWith('~/')) {
      throw new ImageError('~ is not expanded; give the path relative to the workspace root')
    }
    const base = resolvePath(root)
    const lexical = resolvePath(base, path)
    if (!inside(base, lexical)) throw new ImageError('outside the workspace; only files inside the workspace can be embedded')
    const fs = ctx.fs as unknown as Partial<BinaryFs> | undefined
    if (typeof fs?.resolve !== 'function' || typeof fs.contains !== 'function'
      || typeof fs.stat !== 'function' || typeof fs.readBytes !== 'function') {
      throw new ImageError('this dsh host cannot read binary workspace files; save the image somewhere with an https URL instead')
    }
    const opts = { cwd: base, signal }
    const [rootTarget, target] = await Promise.all([fs.resolve(base, opts), fs.resolve(lexical, opts)])
    if (!fs.contains(rootTarget, target)) {
      throw new ImageError('resolves outside the workspace through a symlink; only files inside the workspace can be embedded')
    }
    // Accepted: a symlink swapped in between contains() and readBytes() could
    // still redirect the read. Doing that needs write access to the
    // workspace, which the agent already has along with tools that read
    // anything this could.
    const info = await fs.stat(target, signal)
    if (info === undefined) throw new ImageError('not found in the workspace; check the path relative to the workspace root')
    if (info.type !== 'file') throw new ImageError('not a regular file')
    if (info.size !== undefined && info.size > maxBytes) throw new TooLarge()
    try {
      return await fs.readBytes(target, signal, maxBytes)
    } catch (error) {
      if ((error as { code?: unknown }).code === 'FS_TOO_LARGE') throw new TooLarge()
      throw error
    }
  }
}

/** Decides whether a resolved address may be connected to. */
export type AddressPolicy = (address: string, family: 4 | 6) => boolean

/** Addresses no card image may come from: everything not on the public internet. */
const NON_PUBLIC = (() => {
  const list = new BlockList()
  for (const [net, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ] as const) list.addSubnet(net, prefix, 'ipv4')
  for (const [net, prefix] of [
    ['::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23], ['2001:db8::', 32], ['2002::', 16],
    ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
  ] as const) list.addSubnet(net, prefix, 'ipv6')
  return list
})()

/**
 * Whether an address is on the public internet. An IPv6 address that embeds
 * an IPv4 one — mapped (`::ffff:a.b.c.d`) or NAT64 (`64:ff9b::/96`) — is
 * judged by the address it embeds.
 * @param address - a resolved IP address.
 * @param family - 4 or 6.
 * @returns false for loopback, private, link-local, shared, reserved, documentation and multicast space.
 */
export function isPublicAddress(address: string, family: 4 | 6): boolean {
  if (family === 4) return !NON_PUBLIC.check(address, 'ipv4')
  const groups = ipv6Groups(address)
  if (groups === undefined) return false
  const embedded = (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff)
    || (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every(g => g === 0))
  if (embedded) return isPublicAddress(`${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`, 4)
  return !NON_PUBLIC.check(address, 'ipv6')
}

/**
 * Expand an IPv6 address into its eight 16-bit groups.
 * @param address - IPv6 text, `::` and a dotted IPv4 tail allowed, zone id dropped.
 * @returns the groups, or undefined when it does not parse.
 */
function ipv6Groups(address: string): number[] | undefined {
  let text = address.toLowerCase().replace(/%.*$/u, '')
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/u.exec(text)
  if (dotted !== null) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number]
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return undefined
  const parse = (part: string) => part === '' ? [] : part.split(':').map(g => Number.parseInt(g, 16))
  const head = parse(halves[0]!)
  const tail = halves.length === 2 ? parse(halves[1]!) : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  const groups = [...head, ...Array.from({ length: fill }, () => 0), ...tail]
  return groups.length === 8 && groups.every(g => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : undefined
}

/** The default policy: public addresses only. */
const publicOnly: AddressPolicy = isPublicAddress

/** Options of {@link urlFetcher}. */
export interface FetcherOptions {
  maxRedirects: number
  /** Which addresses may be connected to; public only unless a test says otherwise. */
  policy?: AddressPolicy
}

/**
 * Fetch image URLs with node's own http stack, guarded against SSRF: only
 * http(s), no credentials in the URL, every hop's address checked by the
 * policy — an IP literal before the request, a name inside the socket's DNS
 * lookup — at most `maxRedirects` redirects, no content encoding, and the body
 * cut off past the cap. A fresh agent per request means no pooled socket
 * skips the lookup.
 * @param options - redirect budget and address policy.
 * @returns the fetcher.
 */
export function urlFetcher(options: FetcherOptions): UrlFetcher {
  const policy = options.policy ?? publicOnly
  return async (url, signal, maxBytes) => {
    let current = url
    for (let hop = 0; ; hop += 1) {
      checkUrl(current, policy)
      const response = await get(current, policy, signal)
      const status = response.statusCode ?? 0
      // A body we do not read is destroyed, not drained: resume() would keep
      // pulling an unbounded one until the deadline. agent:false, so no
      // pooled socket is lost.
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy()
        const location = response.headers.location
        if (location === undefined) throw new ImageError(`HTTP ${status} without a Location header`)
        if (hop >= options.maxRedirects) throw new ImageError(`more than ${options.maxRedirects} redirects`)
        current = parseUrl(new URL(location, current).href)
        continue
      }
      if (status !== 200) {
        response.destroy()
        throw new ImageError(`the server answered HTTP ${status}`)
      }
      const encoding = response.headers['content-encoding']
      if (encoding !== undefined && encoding !== 'identity') {
        response.destroy()
        throw new ImageError(`the server sent a ${encoding}-encoded body, which is not decoded here`)
      }
      const length = Number(response.headers['content-length'])
      if (Number.isFinite(length) && length > maxBytes) {
        response.destroy()
        throw new TooLarge()
      }
      return await readBody(response, maxBytes)
    }
  }
}

/**
 * Refuse a URL before any connection: scheme, credentials, and an IP-literal host.
 * @param url - the URL of this hop.
 * @param policy - address policy.
 */
function checkUrl(url: URL, policy: AddressPolicy): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ImageError(`redirected to a ${url.protocol} URL, which is not fetched`)
  if (url.username !== '' || url.password !== '') throw new ImageError('URLs with credentials are not fetched')
  const host = url.hostname.replace(/^\[|\]$/gu, '')
  const family = isIP(host)
  if (family !== 0 && !policy(host, family as 4 | 6)) throw new ImageError(blockedReason(url.hostname, host))
}

/** The SSRF refusal. */
function blockedReason(hostname: string, address: string): string {
  return `${hostname} is ${hostname === address ? '' : `${address}, `}a loopback, private or link-local address; `
    + 'card images are fetched from the public internet only — save a local image into the workspace and give its path'
}

/**
 * The guarded DNS lookup: every address a name resolves to must pass the
 * policy, or the connection fails before it is made.
 * @param policy - address policy.
 * @returns a `lookup` for `http.request`.
 */
function guardedLookup(policy: AddressPolicy) {
  return (hostname: string, options: LookupOptions, callback: (...args: unknown[]) => void): void => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
      if (error !== null) return callback(error)
      const blocked = addresses.find(entry => !policy(entry.address, entry.family as 4 | 6))
      if (blocked !== undefined || addresses.length === 0) {
        return callback(new ImageError(blocked === undefined ? `${hostname} has no address` : blockedReason(hostname, blocked.address)))
      }
      if (options.all === true) return callback(null, addresses)
      callback(null, addresses[0]!.address, addresses[0]!.family)
    })
  }
}

/**
 * One GET, resolved when the response head arrives.
 * @param url - the URL.
 * @param policy - address policy for the lookup.
 * @param signal - aborts the request.
 * @returns the response.
 */
async function get(url: URL, policy: AddressPolicy, signal: AbortSignal): Promise<IncomingMessage> {
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest
  return await new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET',
      agent: false,
      lookup: guardedLookup(policy) as never,
      signal,
      headers: {
        'accept': 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml;q=0.9,*/*;q=0.1',
        'accept-encoding': 'identity',
        'user-agent': 'dsh-visualize',
      },
    }, resolve)
    req.on('error', (error: Error & { cause?: unknown }) => reject(error instanceof ImageError ? error : error.cause instanceof ImageError ? error.cause : error))
    req.end()
  })
}

/**
 * Read a response body, cutting it off past the cap.
 * @param response - the response stream.
 * @param maxBytes - inclusive cap.
 * @returns the body.
 * @throws TooLarge past the cap.
 */
async function readBody(response: IncomingMessage, maxBytes: number): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of response as AsyncIterable<Buffer>) {
    total += chunk.byteLength
    if (total > maxBytes) {
      response.destroy()
      throw new TooLarge()
    }
    chunks.push(chunk)
  }
  const body = Buffer.concat(chunks)
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
}

/**
 * The model-facing report on a card's images, or undefined when it has none.
 * @param images - embedded images.
 * @param failures - images that were not.
 * @returns one short paragraph.
 */
export function imageReport(images: readonly CardImage[], failures: readonly ImageFailure[]): string | undefined {
  if (images.length === 0 && failures.length === 0) return undefined
  const kb = Math.ceil(images.reduce((sum, image) => sum + image.bytes, 0) / 1024)
  const embedded = images.length === 0
    ? ''
    : `Embedded ${images.length} image${images.length === 1 ? '' : 's'} (${kb} KB, stored beside the card).`
  if (failures.length === 0) return embedded
  const head = `${failures.length} image${failures.length === 1 ? '' : 's'} could not be embedded and show${failures.length === 1 ? 's' : ''} `
    + 'a placeholder; fix each data-viz-src and patch the card:'
  const lines = failures.map(failure => `- ${JSON.stringify(failure.src)}: ${failure.reason}`)
  return [embedded, head].filter(part => part.length > 0).join(' ') + '\n' + lines.join('\n')
}
