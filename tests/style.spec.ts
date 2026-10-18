import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { buildFrameDoc, RESOURCE_ORIGINS, sanitizeCssValue } from '../src/shell.ts'
import { PAGE_CONFIG_GLOBAL, STYLE_IDS, STYLES, styleIdFrom } from '../src/style.ts'
import { apply } from '../src/index.ts'
import { activeStyleSection, CUSTOM_STYLE_MAX_BYTES, readCustomStyles, styleFileLocations } from '../src/style-guide.ts'
import { visualizeSkillProvider } from '../src/skill.ts'
import { visualizeTool } from '../src/tool.ts'

const host = {
  fragment: '<div id="lab">hi</div>',
  title: 'Lab',
  themeVars: { primary: 'rgb(65, 118, 230)', foreground: 'rgb(15, 17, 21)' },
  colorScheme: 'light',
  reportToken: 'call-1',
} as const

describe('frame styles', () => {
  it('leaves the default frame as it was without a style', () => {
    const plain = buildFrameDoc({ ...host })
    expect(buildFrameDoc({ ...host, style: 'whale' })).toBe(plain)
    expect(plain).not.toContain('<link rel="stylesheet"')
    expect(plain).toContain('--dsh-viz-primary: rgb(65, 118, 230);')
  })

  it('overrides the host palette with one light-dark value for both appearances', () => {
    for (const colorScheme of ['light', 'dark'] as const) {
      const doc = buildFrameDoc({ ...host, colorScheme, style: 'editorial' })
      expect(doc).toContain('--dsh-viz-primary: light-dark(#b24032, #f07a62);')
      expect(doc).toContain('--dsh-viz-series-2: light-dark(#28659d, #78ade8);')
      expect(doc).not.toContain('rgb(65, 118, 230)')
      expect(doc).toContain(`color-scheme: ${colorScheme};`)
    }
  })

  it('loads a webfont only for styles that set one, from an origin the CSP allows', () => {
    for (const id of STYLE_IDS) {
      const doc = buildFrameDoc({ ...host, style: id })
      const links = [...doc.matchAll(/<link rel="stylesheet" href="([^"]+)">/gu)].map(m => m[1]!)
      if (STYLES[id].fontHref === undefined) {
        expect(links).toEqual([])
        continue
      }
      expect(links).toHaveLength(1)
      expect(RESOURCE_ORIGINS).toContain(new URL(links[0]!.replaceAll('&amp;', '&')).origin)
    }
  })

  it('keeps every preset value through the frame sanitizer', () => {
    for (const id of STYLE_IDS) {
      for (const [name, value] of Object.entries(STYLES[id].vars)) {
        expect(sanitizeCssValue(value), `${id} ${name}`).toBe(value)
      }
    }
  })

  it('installs the chart helper before the fragment runs', () => {
    const doc = buildFrameDoc({ ...host, style: 'terminal' })
    expect(doc.indexOf('window.dshViz')).toBeGreaterThan(-1)
    expect(doc.indexOf('window.dshViz')).toBeLessThan(doc.indexOf(host.fragment))
    expect(doc).toContain('var STYLE = "terminal";')
  })

  it('narrows unknown style ids to the default', () => {
    expect(styleIdFrom('paper')).toBe('paper')
    expect(styleIdFrom('neon')).toBe('whale')
    expect(styleIdFrom(undefined)).toBe('whale')
  })
})

let home: string
let workspace: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'viz-style-home-'))
  workspace = await mkdtemp(join(tmpdir(), 'viz-style-ws-'))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
})

async function writeStyles(global?: string, local?: string): Promise<void> {
  if (global !== undefined) await writeFile(join(home, 'style.md'), global)
  if (local !== undefined) {
    await mkdir(join(workspace, '.dsh'), { recursive: true })
    await writeFile(join(workspace, '.dsh', 'visualize-style.md'), local)
  }
}

describe('custom style files', () => {
  it('reads nothing when neither file exists', async () => {
    expect(await readCustomStyles({ home, workspace })).toEqual([])
    const section = await activeStyleSection('paper', { home, workspace })
    expect(section).toContain('### Built-in style: paper')
    expect(section).toContain('KaTeX 0.16.29')
    expect(section).not.toContain('### User style')
  })

  it('appends the global file, then the workspace file, so the workspace reads last', async () => {
    await writeStyles('Use teal for the accent.', 'Label axes in English.')
    const section = await activeStyleSection('whale', { home, workspace })
    const global = section.indexOf('Use teal for the accent.')
    const local = section.indexOf('Label axes in English.')
    expect(global).toBeGreaterThan(section.indexOf('### Built-in style: whale'))
    expect(local).toBeGreaterThan(global)
  })

  it('reads only the global file without a workspace', async () => {
    await writeStyles('Global only.', 'Workspace only.')
    const found = await readCustomStyles({ home, workspace: undefined })
    expect(found.map(file => file.scope)).toEqual(['global'])
  })

  it('caps each file and says so', async () => {
    await writeStyles(`${'界'.repeat(CUSTOM_STYLE_MAX_BYTES)}`)
    const [file] = await readCustomStyles({ home })
    expect(Buffer.byteLength(file!.text)).toBeLessThanOrEqual(CUSTOM_STYLE_MAX_BYTES)
    expect(file!.text.endsWith('界')).toBe(true)
    expect(file!.truncated).toBe(true)
    expect(await activeStyleSection('whale', { home })).toContain(`longer than ${CUSTOM_STYLE_MAX_BYTES} bytes`)
  })

  it('finds the global file under the host home and the workspace from the skill lookup', async () => {
    await writeStyles('From home.', 'From workspace.')
    const ctx = { get: (name: string) => name === 'dshHomePath' ? (...s: string[]) => join(home, '..', ...s) : undefined } as unknown as Context
    expect(styleFileLocations(ctx, workspace).home).toBe(join(home, '..', 'visualize'))
    const provider = visualizeSkillProvider('sketch', cwd => ({ home, workspace: cwd }))
    const skill = await provider.get({} as never, { cwd: workspace })
    expect(skill?.content).toContain('## Fragment rules')
    expect(skill?.content).toContain('### Built-in style: sketch')
    expect(skill?.content).toContain('From home.')
    expect(skill?.content).toContain('From workspace.')
    const sessionless = await provider.get({} as never, {})
    expect(sessionless?.content).toContain('From home.')
    expect(sessionless?.content).not.toContain('From workspace.')
  })
})

describe('card style meta', () => {
  it('records the configured style in the persisted meta', async () => {
    const ctx = {
      get: () => undefined,
      fs: {
        resolve: async (path: string, options: { cwd?: string }) => ({ displayPath: `${options.cwd}/${path}` }),
        writeText: async () => ({ version: 1 }),
      },
    } as unknown as Context
    const tool = visualizeTool(ctx, 1000, 'terminal')
    const value = await tool.execute({ fragment: '<div id="lab">x</div>', title: 'Lab' }, { agent: { session: { header: { cwd: '/w' } } } } as never)
    const meta = tool.output!.presentationMeta!({} as never, value as never) as { style?: string }
    expect(meta.style).toBe('terminal')
    expect(tool.description).toContain('"terminal" card style')
  })
})

describe('page style config', () => {
  it('puts the configured style on every page the web server renders', () => {
    const listeners = new Map<string, (table: unknown[]) => void>()
    const ctx = {
      tools: { register() {} },
      skills: { registerProvider() {} },
      on: (name: string, listener: (table: unknown[]) => void) => listeners.set(name, listener),
    } as unknown as Context
    apply(ctx, { maxFragmentBytes: 1000, style: 'sketch' })
    const table: unknown[] = []
    listeners.get('webserver/index-inject')!(table)
    // The browser half reads this global for cards that have not settled yet.
    expect(table).toEqual([{ kind: 'global', name: PAGE_CONFIG_GLOBAL, value: { style: 'sketch' } }])
  })
})
