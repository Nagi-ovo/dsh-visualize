/**
 * The user's style files as the settings page edits them: the global file
 * (`<DSH_HOME>/visualize/style.md`) and one workspace file per registered
 * workspace (`<workspace>/.dsh/visualize-style.md`), read and written through
 * one exact route on the host's authenticated `/api` channel
 * (`ctx.connection.fetch`, dsh 0.1.7+). The channel applies the host's
 * Host/Origin checks and browser authentication before a request reaches
 * this module, and only the owner reaches an exact route.
 *
 * Containment is by construction: a request names a scope and, for a
 * workspace, a workspace id the host's registry knows — never a path — and
 * the file is resolved here from that. A file or directory on the way that
 * is a symlink out of its root is refused, as is a file that is a symlink at
 * all: replacing it would silently cut the user's link. Writes go through a
 * temporary file and a rename; saving empty text removes the file, which the
 * skill then no longer reads.
 *
 * @module @nagi-ovo/dsh-visualize/style-files
 */

import { lstat, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { inside, realpathOfDeepest, storeRoot, writeFileAtomic } from './storage.ts'
import { CUSTOM_STYLE_MAX_BYTES, GLOBAL_STYLE_FILE, WORKSPACE_STYLE_FILE } from './style-guide.ts'

export { STYLE_FILES_PATH } from './style.ts'

/** Bytes of an existing file the page is shown; the skill reads far less. */
const MAX_SHOWN_BYTES = 64 * 1024

/** Which style file. */
export type StyleFileScope = 'global' | 'workspace'

/** One style file as the page shows it. */
export interface StyleFileView {
  scope: StyleFileScope
  /** Absolute path. */
  path: string
  /** Workspace id, for a workspace file. */
  workspaceId?: string
  /** Workspace title, for a workspace file. */
  title?: string
  exists: boolean
  /** The file's text, empty when it does not exist or cannot be shown. */
  text: string
  /** The file's size in bytes. */
  bytes: number
  /** Why the file cannot be read or written here, when it cannot. */
  blocked?: 'symlink' | 'not-a-file' | 'outside'
}

/** The route's GET answer. */
export interface StyleFilesView {
  /** Byte cap the skill applies to each file. */
  maxBytes: number
  /** The global file, then one per workspace; empty without a host home. */
  files: StyleFileView[]
}

/** One workspace the host registry knows. */
export interface StyleWorkspace {
  readonly id: string
  readonly path: string
  readonly title?: string
}

/** What the route needs from the host. */
export interface StyleFilesHost {
  /** The plugin's home directory, `<DSH_HOME>/visualize`. */
  readonly home: string | undefined
  /** The registered workspaces, in registry order. */
  workspaces(): readonly StyleWorkspace[]
}

/**
 * The host facts the route reads, looked up per request so a registry that
 * arrives later is seen.
 * @param ctx - registrant context.
 * @returns the route host.
 */
export function styleFilesHost(ctx: Context): StyleFilesHost {
  return {
    home: storeRoot(ctx),
    workspaces() {
      let registry: unknown
      try {
        registry = ctx.get('workspaceRegistry')
      } catch {
        return []
      }
      const list = (registry as { list?: () => unknown } | undefined)?.list
      if (typeof list !== 'function') return []
      const rows = list.call(registry)
      if (!Array.isArray(rows)) return []
      return rows.flatMap((row: { id?: unknown; path?: unknown; title?: unknown }) =>
        typeof row?.id === 'string' && typeof row.path === 'string'
          ? [{ id: row.id, path: row.path, ...typeof row.title === 'string' ? { title: row.title } : {} }]
          : [])
    },
  }
}

/** A resolved style file: its path and the directory it must stay inside. */
interface Target {
  scope: StyleFileScope
  path: string
  root: string
  workspace?: StyleWorkspace
}

/** Every file the page can address, global first. */
function targets(host: StyleFilesHost): Target[] {
  if (host.home === undefined) return []
  const list: Target[] = [{ scope: 'global', path: join(host.home, GLOBAL_STYLE_FILE), root: host.home }]
  for (const workspace of host.workspaces()) {
    const root = resolve(workspace.path)
    list.push({ scope: 'workspace', path: join(root, WORKSPACE_STYLE_FILE), root, workspace })
  }
  return list
}

/**
 * Find the file a request names.
 * @param host - route host.
 * @param scope - requested scope.
 * @param workspaceId - requested workspace id, for a workspace file.
 * @returns the target, or undefined when the request names no known file.
 */
function targetOf(host: StyleFilesHost, scope: unknown, workspaceId: unknown): Target | undefined {
  return targets(host).find(target => target.scope === scope
    && (scope === 'global' || target.workspace?.id === workspaceId))
}

/**
 * Why a target cannot be used, or undefined when it can: its directory must
 * resolve inside its root (the root itself counts), and the file itself must
 * be a regular file when it exists.
 */
async function blockOf(target: Target): Promise<{ blocked?: StyleFileView['blocked']; size?: number }> {
  // The root may not exist yet (no style file saved so far); resolve what does.
  const realRoot = await realpathOfDeepest(target.root)
  const dir = await realpathOfDeepest(dirname(target.path))
  if (dir !== realRoot && !inside(realRoot, dir)) return { blocked: 'outside' }
  const stat = await lstat(target.path).catch(() => undefined)
  if (stat === undefined) return {}
  if (stat.isSymbolicLink()) return { blocked: 'symlink', size: 0 }
  if (!stat.isFile()) return { blocked: 'not-a-file', size: 0 }
  return { size: stat.size }
}

/** Read one target into its page view. */
async function viewOf(target: Target): Promise<StyleFileView> {
  const base = {
    scope: target.scope,
    path: target.path,
    ...target.workspace === undefined
      ? {}
      : { workspaceId: target.workspace.id, ...target.workspace.title === undefined ? {} : { title: target.workspace.title } },
  }
  const { blocked, size } = await blockOf(target)
  if (blocked !== undefined) return { ...base, exists: size !== undefined, text: '', bytes: 0, blocked }
  if (size === undefined) return { ...base, exists: false, text: '', bytes: 0 }
  const bytes = await readFile(target.path).catch(() => undefined)
  if (bytes === undefined) return { ...base, exists: false, text: '', bytes: 0 }
  // A cut inside a multi-byte character decodes to U+FFFD; drop it.
  const text = bytes.subarray(0, MAX_SHOWN_BYTES).toString('utf8').replace(/�+$/u, '')
  return { ...base, exists: true, text, bytes: bytes.byteLength }
}

/**
 * List every style file the page can edit.
 * @param host - route host.
 * @returns the GET answer.
 */
export async function listStyleFiles(host: StyleFilesHost): Promise<StyleFilesView> {
  return { maxBytes: CUSTOM_STYLE_MAX_BYTES, files: await Promise.all(targets(host).map(viewOf)) }
}

/** A refused save. */
export class StyleFileError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

/**
 * Save one style file: write the text, or remove the file for empty text.
 * @param host - route host.
 * @param body - the parsed request body: `{ scope, workspaceId?, text }`.
 * @returns the file's view after the save.
 * @throws StyleFileError for a request this route refuses.
 */
export async function saveStyleFile(host: StyleFilesHost, body: unknown): Promise<StyleFileView> {
  const request = (typeof body === 'object' && body !== null ? body : {}) as { scope?: unknown; workspaceId?: unknown; text?: unknown }
  if (typeof request.text !== 'string') throw new StyleFileError(400, 'invalid-text', '`text` must be a string')
  const target = targetOf(host, request.scope, request.workspaceId)
  if (target === undefined) throw new StyleFileError(404, 'unknown-file', 'no such style file')
  const size = Buffer.byteLength(request.text, 'utf8')
  if (size > CUSTOM_STYLE_MAX_BYTES) {
    throw new StyleFileError(413, 'too-large', `style file is ${size} bytes; the limit is ${CUSTOM_STYLE_MAX_BYTES}`)
  }
  const { blocked } = await blockOf(target)
  if (blocked !== undefined) throw new StyleFileError(409, blocked, `${target.path} cannot be edited here (${blocked})`)
  if (request.text.trim().length === 0) await rm(target.path, { force: true })
  else await writeFileAtomic(target.path, request.text)
  return await viewOf(target)
}

/** A JSON response. */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Answer one request on {@link STYLE_FILES_PATH}: GET lists, POST saves.
 * @param host - route host.
 * @param request - the request, already authenticated by the host channel.
 * @returns the response.
 */
export async function handleStyleFiles(host: StyleFilesHost, request: Request): Promise<Response> {
  if (request.method === 'GET') return json(200, await listStyleFiles(host))
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' })
  // A JSON body cannot be sent cross-site without a preflight this route never answers.
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json(415, { error: 'unsupported-media-type' })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'invalid-json' })
  }
  try {
    return json(200, await saveStyleFile(host, body))
  } catch (error) {
    if (error instanceof StyleFileError) return json(error.status, { error: error.code, message: error.message })
    throw error
  }
}
