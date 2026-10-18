/**
 * `mode: "page"` builds a whole browser page rather than a chat card: the
 * tool accepts it with a one-line summary, keeps a patched page a page, and
 * tells the model the user opens it from a launcher rather than seeing it.
 */

import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { visualizeMetaFrom, visualizeMetaFromArgs, type VisualizeMeta } from '../src/fragment.ts'
import { visualizeTool } from '../src/tool.ts'

const PAGE: VisualizeMeta = {
  kind: 'visualize',
  fragment: '<div id="dash">x</div>',
  title: '销售数据看板',
  mode: 'page',
  path: '/home/visualize/sessions/s/dash-0badf00d.page.html',
  summary: '按地区和日期筛选的销售概览',
  style: 'whale',
}

/** Workspace-fallback host: no home path, an in-memory fs seam. */
function host(files: Record<string, string> = {}) {
  const ctx = {
    get: () => undefined,
    fs: {
      resolve: async (path: string, options: { cwd?: string }) => ({ displayPath: `${options.cwd}/${path}`, path }),
      readText: async (target: { path: string }) => files[target.path]!,
      writeText: async (target: { path: string }, content: string) => {
        files[target.path] = content
        return { version: 1 }
      },
    },
  } as unknown as Context
  const exec = { agent: { session: { header: { cwd: '/work' } } } } as never
  return { tool: visualizeTool(ctx, 10_000), exec, files }
}

type Value = { mode: string; summary?: string; path: string; action: 'create' | 'update'; title: string; sizeBytes: number }

describe('visualize page mode, tool side', () => {
  it('creates a page card with its summary and says it opens from a launcher', async () => {
    const { tool, exec } = host()
    const value = await tool.execute(
      { fragment: '<div id="dash">x</div>', title: 'Dash', mode: 'page', summary: '  filter\n by   region ' },
      exec,
    ) as Value
    expect(value.mode).toBe('page')
    expect(value.summary).toBe('filter by region')
    expect(value.path).toMatch(/\/viz\/dash-[0-9a-f]{8}\.whale\.page\.html$/)

    const text = tool.output!.render!({} as never, value as never) as { text: string }[]
    expect(text[0]!.text).toMatch(/^Rendered "Dash" as a page/)
    expect(text[0]!.text).toContain('launcher')
    const meta = visualizeMetaFrom(tool.output!.presentationMeta!({} as never, value as never))
    expect(meta).toMatchObject({ mode: 'page', summary: 'filter by region' })
  })

  it('refuses a mode it does not know instead of rendering a default card', async () => {
    const { tool, exec } = host()
    await expect(tool.execute({ fragment: '<div id="a">x</div>', mode: 'fullscreen' }, exec))
      .rejects.toThrow(/mode.? must be one of/)
  })

  it('keeps a patched page a page when the update does not restate the mode', async () => {
    const { tool, exec } = host({ 'viz/dash-0badf00d.page.html': '<div id="dash"><h1>Q3</h1></div>' })
    const value = await tool.execute(
      { action: 'update', path: 'viz/dash-0badf00d.page.html', title: 'Dash', old_str: 'Q3', new_str: 'Q4' },
      exec,
    ) as Value
    expect(value.mode).toBe('page')
    const text = tool.output!.render!({} as never, value as never) as { text: string }[]
    expect(text[0]!.text).toMatch(/^Patched page "Dash" in place/)
    expect(text[0]!.text).toContain('already opened keeps the old version')
  })
})

describe('visualize page mode, meta narrowing', () => {
  it('accepts page meta, keeps a summary, and drops a malformed one without declining', () => {
    expect(visualizeMetaFrom({ ...PAGE })).toEqual(PAGE)
    expect(visualizeMetaFrom({ ...PAGE, summary: 42 })).not.toHaveProperty('summary')
    expect(visualizeMetaFrom({ ...PAGE, mode: 'fullscreen' })).toBeUndefined()
  })

  it('rebuilds a page from the call arguments, complete or still streaming', () => {
    const args = { mode: 'page', title: 'Dash', summary: 'S', fragment: '<div id="d">x</div>' }
    expect(visualizeMetaFromArgs(JSON.stringify(args))).toMatchObject({ mode: 'page', summary: 'S' })
    // The object is still open, but mode and fragment have both closed.
    const open = JSON.stringify(args).slice(0, -1) + ', "extra'
    expect(visualizeMetaFromArgs(open)).toMatchObject({ mode: 'page', fragment: '<div id="d">x</div>' })
  })
})
