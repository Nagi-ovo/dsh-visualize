/**
 * The settings page's style-file route: it addresses files by scope and
 * workspace id, never by path, caps them at the skill's byte limit, writes
 * through a temporary file, and refuses links that would carry a read or a
 * write elsewhere.
 */

import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleStyleFiles, type StyleFilesHost, type StyleFilesView, type StyleFileView } from '../src/style-files.ts'
import { STYLE_FILES_PATH } from '../src/style.ts'

let home: string
let workspace: string
let outside: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'viz-files-home-'))
  workspace = await mkdtemp(join(tmpdir(), 'viz-files-ws-'))
  outside = await mkdtemp(join(tmpdir(), 'viz-files-out-'))
})

afterEach(async () => {
  for (const dir of [home, workspace, outside]) await rm(dir, { recursive: true, force: true })
})

const routeHost = (): StyleFilesHost => ({
  home: join(home, 'visualize'),
  workspaces: () => [{ id: 'ws-1', path: workspace, title: 'demo' }],
})

const url = `http://127.0.0.1:3104${STYLE_FILES_PATH}`

const get = async (host = routeHost()) => await handleStyleFiles(host, new Request(url))

const post = async (body: unknown, contentType = 'application/json') => await handleStyleFiles(routeHost(), new Request(url, {
  method: 'POST',
  headers: { 'content-type': contentType },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}))

const globalPath = () => join(home, 'visualize', 'style.md')
const workspacePath = () => join(workspace, '.dsh', 'visualize-style.md')

describe('style files route', () => {
  it('lists the global file and one file per workspace with what exists', async () => {
    await mkdir(join(home, 'visualize'), { recursive: true })
    await writeFile(globalPath(), 'Use teal.')
    const view = await (await get()).json() as StyleFilesView
    expect(view.maxBytes).toBe(4096)
    expect(view.files).toEqual([
      { scope: 'global', path: globalPath(), exists: true, text: 'Use teal.', bytes: 9 },
      { scope: 'workspace', path: workspacePath(), workspaceId: 'ws-1', title: 'demo', exists: false, text: '', bytes: 0 },
    ])
  })

  it('lists nothing on a host without a home', async () => {
    const view = await (await get({ home: undefined, workspaces: () => [] })).json() as StyleFilesView
    expect(view.files).toEqual([])
  })

  it('writes through a temporary file and leaves the rest of the directory alone', async () => {
    await mkdir(join(home, 'visualize', 'sessions', 's1'), { recursive: true })
    await writeFile(join(home, 'visualize', 'sessions', 's1', 'card.whale.html'), '<p>card</p>')
    await mkdir(join(workspace, '.dsh'), { recursive: true })
    await writeFile(workspacePath(), 'Workspace note.')
    const response = await post({ scope: 'global', text: '强调色用青绿色。' })
    expect(response.status).toBe(200)
    expect((await response.json() as StyleFileView).exists).toBe(true)
    expect(await readFile(globalPath(), 'utf8')).toBe('强调色用青绿色。')
    expect(await readdir(join(home, 'visualize'))).toEqual(expect.arrayContaining(['sessions', 'style.md']))
    expect((await readdir(join(home, 'visualize'))).some(name => name.endsWith('.tmp'))).toBe(false)
    expect(await readFile(join(home, 'visualize', 'sessions', 's1', 'card.whale.html'), 'utf8')).toBe('<p>card</p>')
    expect(await readFile(workspacePath(), 'utf8')).toBe('Workspace note.')
  })

  it('creates the workspace file under the registered workspace only', async () => {
    expect((await post({ scope: 'workspace', workspaceId: 'ws-1', text: 'Axes in English.' })).status).toBe(200)
    expect(await readFile(workspacePath(), 'utf8')).toBe('Axes in English.')
    // A path in the body is not an address; an unknown id names no file.
    const stray = await post({ scope: 'workspace', workspaceId: 'ws-2', path: join(outside, 'x.md'), text: 'x' })
    expect(stray.status).toBe(404)
    expect(await readdir(outside)).toEqual([])
    expect((await post({ scope: 'other', text: 'x' })).status).toBe(404)
  })

  it('removes the file when saved empty', async () => {
    await post({ scope: 'global', text: 'Something.' })
    const response = await post({ scope: 'global', text: '  \n' })
    expect((await response.json() as StyleFileView).exists).toBe(false)
    await expect(lstat(globalPath())).rejects.toThrow()
  })

  it('refuses text over the byte limit, counted in UTF-8', async () => {
    const response = await post({ scope: 'global', text: '界'.repeat(1366) })
    expect(response.status).toBe(413)
    expect((await response.json() as { error: string }).error).toBe('too-large')
    await expect(lstat(globalPath())).rejects.toThrow()
    expect((await post({ scope: 'global', text: '界'.repeat(1365) })).status).toBe(200)
  })

  it('refuses a style file that is a symlink, for reads and writes', async () => {
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await mkdir(join(home, 'visualize'), { recursive: true })
    await symlink(join(outside, 'secret.txt'), globalPath())
    const view = await (await get()).json() as StyleFilesView
    expect(view.files[0]).toMatchObject({ exists: true, text: '', blocked: 'symlink' })
    expect((await post({ scope: 'global', text: 'overwrite' })).status).toBe(409)
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('secret')
  })

  it('refuses a workspace whose .dsh directory links out of it', async () => {
    await symlink(outside, join(workspace, '.dsh'))
    const response = await post({ scope: 'workspace', workspaceId: 'ws-1', text: 'x' })
    expect(response.status).toBe(409)
    expect((await response.json() as { error: string }).error).toBe('outside')
    expect(await readdir(outside)).toEqual([])
  })

  it('accepts only a JSON POST besides GET', async () => {
    expect((await post('scope=global&text=x', 'application/x-www-form-urlencoded')).status).toBe(415)
    expect((await post('{', 'application/json')).status).toBe(400)
    expect((await post({ scope: 'global', text: 3 })).status).toBe(400)
    expect((await handleStyleFiles(routeHost(), new Request(url, { method: 'DELETE' }))).status).toBe(405)
  })
})
