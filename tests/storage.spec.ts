import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { visualizeTool } from '../src/tool.ts'
import { ownedPath, sessionSegment, workspacePath } from '../src/storage.ts'

let home: string
let workspace: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'viz-home-'))
  workspace = await mkdtemp(join(tmpdir(), 'viz-ws-'))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
})

/** Host context: a real home-path joiner and an fs seam that records every call. */
function host(options: { homePath?: boolean; files?: Record<string, string> } = {}) {
  const files = options.files ?? {}
  const seam: { resolved: string[]; written: Record<string, string>; policies: unknown[] } = { resolved: [], written: {}, policies: [] }
  const policy = { mode: 'workspace-write', workspaceRoot: workspace }
  const ctx = {
    get: (name: string) => {
      if (name === 'dshHomePath') return options.homePath === false ? undefined : (...segments: string[]) => join(home, ...segments)
      if (name === 'sandboxPolicy') return { resolve: () => policy }
      return undefined
    },
    fs: {
      resolve: async (path: string) => {
        seam.resolved.push(path)
        return { displayPath: path, path }
      },
      readText: async (target: { path: string }) => {
        const text = files[target.path]
        if (text === undefined) throw new Error(`ENOENT ${target.path}`)
        return text
      },
      writeText: async (target: { path: string }, content: string, _e: unknown, _s: unknown, sandboxPolicy: unknown) => {
        seam.written[target.path] = content
        seam.policies.push(sandboxPolicy)
        return { version: 1 }
      },
    },
  } as unknown as Context
  return { ctx, seam, policy }
}

const exec = (id: string) => ({ agent: { session: { id, header: { cwd: workspace } } } }) as never

describe('card storage', () => {
  it('writes a new card into the session store, not the workspace, and patches it there', async () => {
    const { ctx, seam } = host()
    const tool = visualizeTool(ctx, 10_000)
    const created = await tool.execute({ fragment: '<p>p99 480ms</p>', title: 'Lab' }, exec('sess-1')) as { path: string }

    expect(created.path).toMatch(new RegExp(`^${home}/visualize/sessions/sess-1/lab-[0-9a-f]{8}\\.whale\\.html$`))
    expect(await readFile(created.path, 'utf8')).toBe('<p>p99 480ms</p>')
    expect(seam.resolved).toEqual([])
    expect(await readdir(workspace)).toEqual([])

    const patched = await tool.execute(
      { action: 'update', path: created.path, title: 'Lab', old_str: '480', new_str: '120' },
      exec('sess-1'),
    ) as { path: string; fragment: string }

    expect(patched.path).toBe(created.path)
    expect(patched.fragment).toBe('<p>p99 120ms</p>')
    expect(await readFile(created.path, 'utf8')).toBe('<p>p99 120ms</p>')
    expect(seam.resolved).toEqual([])
  })

  it('keeps conversations apart', async () => {
    const { ctx } = host()
    const tool = visualizeTool(ctx, 10_000)
    const a = await tool.execute({ fragment: '<p>x</p>', title: 'Lab' }, exec('sess-a')) as { path: string }
    const b = await tool.execute({ fragment: '<p>x</p>', title: 'Lab' }, exec('sess-b')) as { path: string }
    expect(a.path).not.toBe(b.path)
    expect(await readdir(join(home, 'visualize', 'sessions'))).toEqual(['sess-a', 'sess-b'])
  })

  it('patches a legacy viz/ workspace copy in place through the sandboxed fs seam', async () => {
    const { ctx, seam, policy } = host({ files: { 'viz/lab-0badf00d.html': '<p>old</p>' } })
    const tool = visualizeTool(ctx, 10_000)
    const value = await tool.execute(
      { action: 'update', path: 'viz/lab-0badf00d.html', title: 'Lab', old_str: 'old', new_str: 'new' },
      exec('sess-2'),
    ) as { path: string }

    expect(value.path).toBe('viz/lab-0badf00d.html')
    expect(seam.written).toEqual({ 'viz/lab-0badf00d.html': '<p>new</p>' })
    expect(seam.policies).toEqual([policy])
    await expect(readdir(join(home, 'visualize'))).rejects.toThrow()
  })

  it('keeps the style a card was created with when it is patched after the setting changed', async () => {
    const { ctx } = host()
    const created = await visualizeTool(ctx, 10_000, 'editorial')
      .execute({ fragment: '<p>p99 480ms</p>', title: 'Lab' }, exec('sess-7')) as { path: string; style: string }
    expect(created.style).toBe('editorial')

    const patched = await visualizeTool(ctx, 10_000, 'sketch').execute(
      { action: 'update', path: created.path, title: 'Lab', old_str: '480', new_str: '410' },
      exec('sess-7'),
    ) as { path: string; style: string; fragment: string }
    expect(patched.style).toBe('editorial')
    expect(patched.path).toBe(created.path)
    // The model reads and patches the stored copy: it carries no style marker.
    expect(await readFile(created.path, 'utf8')).toBe('<p>p99 410ms</p>')
  })

  it('patches a card named before styles existed in the current setting', async () => {
    const { ctx } = host({ files: { 'viz/lab-0badf00d.html': '<p>old</p>' } })
    const value = await visualizeTool(ctx, 10_000, 'sketch').execute(
      { action: 'update', path: 'viz/lab-0badf00d.html', title: 'Lab', old_str: 'old', new_str: 'new' },
      exec('sess-8'),
    ) as { style: string }
    expect(value.style).toBe('sketch')
  })

  it('falls back to the workspace copy when the host has no home path', async () => {
    const { ctx, seam } = host({ homePath: false })
    const tool = visualizeTool(ctx, 10_000)
    const value = await tool.execute({ fragment: '<p>x</p>', title: 'Lab' }, exec('sess-3')) as { path: string }
    expect(value.path).toMatch(/^viz\/lab-[0-9a-f]{8}\.whale\.html$/u)
    expect(Object.keys(seam.written)).toEqual([value.path])
  })

  it('never reads a file outside the store with its own fs', async () => {
    const secret = join(home, 'secret.html')
    await writeFile(secret, '<p>secret</p>')
    const outside = join(home, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, 'card.html'), '<p>secret</p>')
    await mkdir(join(home, 'visualize', 'sessions'), { recursive: true })
    await symlink(outside, join(home, 'visualize', 'sessions', 'linked'))

    const { ctx, seam } = host()
    const tool = visualizeTool(ctx, 10_000)
    for (const path of [
      join(home, 'visualize', '..', 'secret.html'),
      secret,
      join(home, 'visualize', 'sessions', 'linked', 'card.html'),
    ]) {
      // Not a store file and not inside the workspace either, so it is refused before any read.
      await expect(tool.execute(
        { action: 'update', path, title: 'Lab', old_str: 'secret', new_str: 'pwned' },
        exec('sess-4'),
      )).rejects.toThrow(/is not a card visualize can patch/u)
    }
    expect(await readFile(secret, 'utf8')).toBe('<p>secret</p>')
    expect(await readFile(join(outside, 'card.html'), 'utf8')).toBe('<p>secret</p>')
    expect(seam.resolved).toEqual([])
  })

  it('creates the same card concurrently in the same millisecond (Codex repro)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    try {
      const { ctx } = host()
      const tool = visualizeTool(ctx, 10_000)
      const args = { fragment: '<p>same</p>', title: 'Lab' }
      const results = await Promise.all(Array.from({ length: 8 }, () => tool.execute(args, exec('sess-5')))) as { path: string }[]
      expect(new Set(results.map(r => r.path)).size).toBe(1)
      expect(await readFile(results[0]!.path, 'utf8')).toBe('<p>same</p>')
      // No temp file is left behind.
      expect(await readdir(join(home, 'visualize', 'sessions', 'sess-5'))).toEqual([results[0]!.path.split('/').at(-1)])
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('legacy workspace cards', () => {
  /** A host whose fs seam really reads the disk, as the official local backend does. */
  function diskHost() {
    const resolved: string[] = []
    const ctx = {
      get: (name: string) => (name === 'sandboxPolicy' ? { resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }) } : undefined),
      fs: {
        resolve: async (path: string, options: { cwd?: string }) => {
          resolved.push(path)
          const absolute = path.startsWith('/') ? path : join(options.cwd!, path)
          return { displayPath: path, path: absolute }
        },
        readText: async (target: { path: string }) => await readFile(target.path, 'utf8'),
        writeText: async (target: { path: string }, content: string) => {
          await writeFile(target.path, content)
          return { version: 1 }
        },
      },
    } as unknown as Context
    return { tool: visualizeTool(ctx, 10_000), resolved }
  }

  /**
   * Patch `path` with an old_str that shares a prefix with the secret but does
   * not match, so a successful read would quote the file back as the nearest anchor.
   */
  async function probe(tool: ReturnType<typeof visualizeTool>, path: string): Promise<string> {
    try {
      await tool.execute({ action: 'update', path, title: 'Lab', old_str: '<p>secret token 0xBAD', new_str: 'x' }, exec('sess-6'))
    } catch (error) {
      return (error as Error).message
    }
    throw new Error('expected a rejection')
  }

  let secretDir: string
  beforeEach(async () => {
    secretDir = await mkdtemp(join(tmpdir(), 'viz-secret-'))
    await writeFile(join(secretDir, 'secret.html'), '<p>secret token 0xC0FFEE</p>')
    await mkdir(join(workspace, 'viz'))
    await writeFile(join(workspace, 'viz', 'lab-0badf00d.html'), '<p>old</p>')
  })
  afterEach(async () => {
    await rm(secretDir, { recursive: true, force: true })
  })

  it('patches a legacy card inside the workspace by relative and absolute path', async () => {
    const { tool } = diskHost()
    await tool.execute({ action: 'update', path: 'viz/lab-0badf00d.html', title: 'Lab', old_str: 'old', new_str: 'mid' }, exec('sess-6'))
    await tool.execute({ action: 'update', path: join(workspace, 'viz', 'lab-0badf00d.html'), title: 'Lab', old_str: 'mid', new_str: 'new' }, exec('sess-6'))
    expect(await readFile(join(workspace, 'viz', 'lab-0badf00d.html'), 'utf8')).toBe('<p>new</p>')
  })

  it('refuses an absolute path outside the workspace without reading it (Codex repro)', async () => {
    const { tool, resolved } = diskHost()
    const message = await probe(tool, join(secretDir, 'secret.html'))
    expect(message).toMatch(/is not a card visualize can patch/u)
    expect(message).not.toContain('0xC0FFEE')
    expect(resolved).toEqual([])
  })

  it('refuses .. traversal out of the workspace', async () => {
    const { tool, resolved } = diskHost()
    const climb = join(relative(workspace, secretDir), 'secret.html')
    expect(climb.startsWith('..')).toBe(true)
    for (const path of [climb, `viz/../${climb}`, join(workspace, 'viz', '..', climb)]) {
      expect(await probe(tool, path)).toMatch(/is not a card visualize can patch/u)
    }
    expect(resolved).toEqual([])
  })

  it('refuses a symlink inside the workspace that points out of it', async () => {
    await symlink(join(secretDir, 'secret.html'), join(workspace, 'viz', 'link.html'))
    await symlink(secretDir, join(workspace, 'viz', 'dir'))
    const { tool, resolved } = diskHost()
    for (const path of ['viz/link.html', 'viz/dir/secret.html', join(workspace, 'viz', 'dir', 'secret.html')]) {
      const message = await probe(tool, path)
      expect(message).toMatch(/is not a card visualize can patch/u)
      expect(message).not.toContain('0xC0FFEE')
    }
    expect(resolved).toEqual([])
  })

  it('expands ~ and contains the result like any other path', async () => {
    const { tool, resolved } = diskHost()
    // The secret dir is in the OS temp dir, never under the workspace.
    expect(await probe(tool, '~/.ssh/id_rsa.html')).toMatch(/is not a card visualize can patch/u)
    expect(await probe(tool, '~')).toMatch(/is not a card visualize can patch/u)
    expect(resolved).toEqual([])
    // A ~ path that lands inside the workspace is accepted and handed on as the absolute path.
    expect(await workspacePath(workspace, join(workspace, 'viz', 'a.html'))).toBe(join(workspace, 'viz', 'a.html'))
    const home = homedir()
    const underHome = join(home, '.dsh-visualize-spec-absent', 'ws')
    expect(await workspacePath(underHome, '~/.dsh-visualize-spec-absent/ws/viz/a.html')).toBe(join(underHome, 'viz', 'a.html'))
    expect(await workspacePath(underHome, '~/.dsh-visualize-spec-absent/other/a.html')).toBeUndefined()
  })

  it('refuses a non-.html file and a session without a workspace', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'secret')
    expect(await workspacePath(workspace, 'notes.txt')).toBeUndefined()
    expect(await workspacePath(workspace, 'viz/lab-0badf00d.html')).toBe('viz/lab-0badf00d.html')
    expect(await workspacePath(undefined, 'viz/lab-0badf00d.html')).toBeUndefined()
  })
})

describe('sessionSegment', () => {
  it('encodes any id as one segment that cannot climb', () => {
    for (const id of ['..', '.', '../../etc', 'a/b', 'a\\b', '~0041']) {
      const segment = sessionSegment(id)
      expect(segment).not.toMatch(/[/\\.]/u)
      expect(segment.length).toBeGreaterThan(0)
    }
    expect(sessionSegment('0198c2f1-7a3e')).toBe('0198c2f1-7a3e')
    // Injective: the escape character itself is escaped.
    expect(sessionSegment('~0041')).not.toBe(sessionSegment('A'))
  })
})

describe('ownedPath', () => {
  it('expands the ~ display form the result reports back to the store path', async () => {
    const root = join(homedir(), '.dsh-visualize-spec-absent', 'visualize')
    expect(await ownedPath(root, '~/.dsh-visualize-spec-absent/visualize/sessions/s/a.html'))
      .toBe(join(root, 'sessions', 's', 'a.html'))
    expect(await ownedPath(root, 'viz/a.html')).toBeUndefined()
    expect(await ownedPath(root, join(root, 'sessions', 's', 'a.txt'))).toBeUndefined()
  })
})
