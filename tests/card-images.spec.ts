import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { visualizeTool } from '../src/tool.ts'
import { visualizeMetaFrom } from '../src/fragment.ts'
import { handleImageRequest, inside, realpathOfDeepest } from '../src/storage.ts'
import type { UrlFetcher } from '../src/images.ts'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
/** A second PNG with different bytes, standing in for a regenerated figure. */
const PNG2 = Uint8Array.from([...PNG, 1, 2, 3, 4])
/** A realistic figure size, so the log-size assertion means something. */
const FIGURE = Uint8Array.from([...PNG, ...new Uint8Array(200 * 1024).fill(7)])

let home: string
let workspace: string

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), 'viz-home-')))
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'viz-ws-')))
  await mkdir(join(workspace, 'figs'))
  await writeFile(join(workspace, 'figs', 'loss.png'), FIGURE)
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
})

/** Host context: a real home, the session sandbox policy, and an fs seam over the real disk. */
function host() {
  return {
    get: (name: string) => {
      if (name === 'dshHomePath') return (...segments: string[]) => join(home, ...segments)
      if (name === 'sandboxPolicy') return { resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }) }
      return undefined
    },
    fs: {
      async resolve(path: string, opts: { cwd?: string } = {}) {
        const absolute = resolve(opts.cwd ?? workspace, path)
        return { targetKey: await realpathOfDeepest(absolute), displayPath: absolute }
      },
      contains: (parent: { targetKey: string }, child: { targetKey: string }) =>
        parent.targetKey === child.targetKey || inside(parent.targetKey, child.targetKey),
      async stat(target: { targetKey: string }) {
        const info = await stat(target.targetKey).catch(() => undefined)
        return info && { version: 'v', type: info.isFile() ? 'file' : 'directory', size: info.size }
      },
      readBytes: async (target: { targetKey: string }) => new Uint8Array(await readFile(target.targetKey)),
    },
  } as unknown as Context
}

/** A URL fetcher that serves one PNG per URL and counts calls. */
function fakeWeb() {
  const calls: string[] = []
  const fetchUrl: UrlFetcher = async (url) => {
    calls.push(url.href)
    if (url.pathname.endsWith('/missing.png')) throw new Error('the server answered HTTP 404')
    return PNG
  }
  return { calls, fetchUrl }
}

const exec = { agent: { session: { id: 'sess-1', header: { cwd: '' } } }, signal: new AbortController().signal } as never

type Value = { path: string; fragment: string; images?: { src: string; id: string; type: string; bytes: number }[]; imageReport?: string }

function setup(delivery = true) {
  const web = fakeWeb()
  const tool = visualizeTool(host(), 100_000, 'whale', { delivery: () => delivery, fetchUrl: web.fetchUrl })
  const run = async (args: Record<string, unknown>) => await tool.execute(args, exec) as Value
  const text = (value: Value) => tool.output.render({} as never, value as never).map(b => (b as { text: string }).text).join('\n')
  const meta = (value: Value) => tool.output.presentationMeta!({} as never, value as never)
  return { tool, web, run, text, meta }
}

const FRAGMENT = '<div id="lab"><h3>Loss</h3>\n'
  + '<img data-viz-src="./figs/loss.png" alt="training loss" width="320">\n'
  + '<img data-viz-src="https://example.com/a.png" alt="reference">\n'
  + '<img data-viz-src="./figs/los.png" alt="typo"></div>'

describe('visualize with data-viz-src images', () => {
  it('stores the bytes beside the card and keeps them out of the fragment, the result text and the meta', async () => {
    const { run, text, meta } = setup()
    const value = await run({ fragment: FRAGMENT, title: 'Lab' })

    // The fragment the model wrote is what the card stores and replays.
    expect(value.fragment).toBe(FRAGMENT)
    expect(await readFile(value.path, 'utf8')).toBe(FRAGMENT)
    expect(value.images!.map(i => [i.src, i.type, i.bytes])).toEqual([
      ['./figs/loss.png', 'image/png', FIGURE.byteLength],
      ['https://example.com/a.png', 'image/png', PNG.byteLength],
    ])
    // Content-addressed under the session's images/ directory.
    const stored = await readdir(join(home, 'visualize', 'sessions', 'sess-1', 'images'))
    const digest = createHash('sha256').update(FIGURE).digest('hex')
    expect(stored).toContain(`${digest}.png`)
    expect(value.images![0]!.id).toBe(`sess-1/${digest}.png`)

    // The persisted meta carries references only: a few hundred bytes for a 200 KB figure.
    const persisted = meta(value)
    expect(visualizeMetaFrom(persisted)!.images).toEqual(value.images)
    const metaBytes = JSON.stringify(persisted).length
    expect(metaBytes).toBeLessThan(FRAGMENT.length + 600)
    expect(JSON.stringify(persisted)).not.toContain('base64')

    // The model hears which image failed and why, and nothing it did not need.
    const result = text(value)
    expect(result).toContain('Embedded 2 images')
    expect(result).toContain('1 image could not be embedded and shows a placeholder')
    expect(result).toContain('"./figs/los.png": not found in the workspace')
    expect(result.length).toBeLessThan(800)
  })

  it('re-reads workspace files and carries fetched URLs on update', async () => {
    const { run, web } = setup()
    const created = await run({ fragment: FRAGMENT, title: 'Lab' })
    expect(web.calls).toEqual(['https://example.com/a.png'])

    // The figure is regenerated, then an unrelated line is patched.
    await writeFile(join(workspace, 'figs', 'loss.png'), PNG2)
    const patched = await run({ action: 'update', path: created.path, title: 'Lab', old_str: '<h3>Loss</h3>', new_str: '<h3>Loss, epoch 2</h3>' })
    expect(patched.path).toBe(created.path)
    expect(web.calls).toEqual(['https://example.com/a.png'])
    expect(patched.images!.find(i => i.src === './figs/loss.png')!.bytes).toBe(PNG2.byteLength)
    expect(patched.images!.find(i => i.src === 'https://example.com/a.png')).toEqual(created.images![1])

    // Fixing the typo'd path resolves the image that failed before.
    const fixed = await run({ action: 'update', path: created.path, title: 'Lab', old_str: './figs/los.png', new_str: './figs/loss.png' })
    expect(fixed.imageReport).toBe('Embedded 2 images (1 KB, stored beside the card).')
    expect(fixed.images!.map(i => i.src)).toEqual(['./figs/loss.png', 'https://example.com/a.png'])
    // A new URL is fetched; the carried one still is not.
    const added = await run({ action: 'update', path: created.path, title: 'Lab', old_str: '<h3>', new_str: '<img data-viz-src="https://example.com/b.png"><h3>' })
    expect(web.calls).toEqual(['https://example.com/a.png', 'https://example.com/b.png'])
    expect(added.images).toHaveLength(3)
  })

  it('renders the card and says why on a host that cannot deliver images', async () => {
    const { run, text } = setup(false)
    const value = await run({ fragment: FRAGMENT, title: 'Lab' })
    expect(value.images).toBeUndefined()
    expect(await readFile(value.path, 'utf8')).toBe(FRAGMENT)
    expect(text(value)).toContain('3 images could not be embedded')
    expect(text(value)).toContain('needs dsh 0.1.7 or later')
  })

  it('leaves a card without images exactly as before', async () => {
    const { run, text, meta } = setup()
    const value = await run({ fragment: '<div id="lab">x</div>', title: 'Lab' })
    expect(value.images).toBeUndefined()
    expect(value.imageReport).toBeUndefined()
    expect('images' in (meta(value) as object)).toBe(false)
    expect(text(value)).not.toContain('image')
  })
})

describe('image route', () => {
  const get = async (id: string, method = 'GET') => await handleImageRequest(
    join(home, 'visualize'),
    new Request(`http://dsh.test/api/dsh-visualize/image?id=${encodeURIComponent(id)}`, { method }),
  )

  it('serves a stored image as an opaque, sandboxed download', async () => {
    const { run } = setup()
    const value = await run({ fragment: FRAGMENT, title: 'Lab' })
    const response = await get(value.images![0]!.id)
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(FIGURE)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    expect((await get(value.images![0]!.id, 'HEAD')).status).toBe(200)
  })

  it('opens nothing but a well-formed id of an intact regular file below the store', async () => {
    const digest = createHash('sha256').update(PNG).digest('hex')
    const dir = join(home, 'visualize', 'sessions', 'sess-1', 'images')
    await mkdir(dir, { recursive: true })
    const outside = join(workspace, 'secret.png')
    await writeFile(outside, PNG)
    await symlink(outside, join(dir, `${digest}.png`))
    await writeFile(join(dir, `${'0'.repeat(64)}.png`), PNG)
    for (const id of [
      `sess-1/${digest}.png`, // a symlink, even to an image
      `sess-1/${'0'.repeat(64)}.png`, // bytes that no longer match their digest
      `../../${digest}.png`,
      `sess-1/../sess-1/${digest}.png`,
      `sess-1/${digest}.html`,
      '/etc/passwd',
      '',
    ]) {
      expect((await get(id)).status, id).toBe(404)
    }
    expect((await handleImageRequest(undefined, new Request(`http://dsh.test/x?id=sess-1/${digest}.png`))).status).toBe(404)
    expect((await handleImageRequest(home, new Request('http://dsh.test/x', { method: 'POST', body: '' }))).status).toBe(405)
  })
})
