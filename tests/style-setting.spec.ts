/**
 * The `style` setting is volatile: the host's settings form rewrites it while
 * the plugin runs, the Loader commits the new value into the running
 * reference, and every reader must see it on its next use — the tool per
 * call, the skill per load, the page config per page served.
 */

import { describe, expect, it, vi } from 'vitest'
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { apply, Config } from '../src/index.ts'
import { readStyle, styleFieldSchema, type StyleSetting } from '../src/style-setting.ts'
import { PAGE_CONFIG_GLOBAL, STYLE_FILES_PATH, type StyleId } from '../src/style.ts'

/** A stand-in for the Loader's volatile reference. */
function live(initial: StyleId | undefined) {
  let current = initial
  return { ref: { get: () => current }, set: (next: StyleId | undefined) => { current = next } }
}

/** A host context recording registrations and event listeners. */
function host(services: Record<string, unknown> = {}) {
  const tools: { description: string; execute: (args: unknown, exec: unknown) => Promise<unknown>; disposed: boolean }[] = []
  const providers: (() => { get: (c: unknown, o: unknown) => Promise<{ content: string }> })[] = []
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  const effects: unknown[] = []
  const ctx = {
    get: (name: string) => name in services ? services[name] : undefined,
    tools: {
      register(definition: { description: string; execute: (args: unknown, exec: unknown) => Promise<unknown> }) {
        const entry = { ...definition, disposed: false }
        tools.push(entry)
        return () => { entry.disposed = true }
      },
    },
    skills: { registerProvider: (provider: never) => providers.push(provider) },
    on(name: string, listener: (...args: unknown[]) => void) {
      listeners.set(name, [...listeners.get(name) ?? [], listener])
    },
    // Optional services resolve immediately when present, never otherwise.
    inject(names: string[], callback: (scope: unknown) => void) {
      if (!names.every(name => name in services)) return
      callback({ get: (name: string) => services[name], effect: (make: () => unknown) => effects.push(make()) })
    },
    fiber: { id: 'fiber' },
    fs: {
      resolve: async (path: string) => ({ displayPath: path, path }),
      writeText: async () => ({ version: 1 }),
    },
  } as unknown as Context
  const emit = (name: string, ...args: unknown[]) => listeners.get(name)?.forEach(listener => listener(...args))
  return { ctx, tools, providers, emit, effects }
}

const exec = { agent: { session: { header: { cwd: '/w' } } }, signal: new AbortController().signal } as never

describe('style setting', () => {
  it('parses to a live reference that defaults to whale and rejects unknown ids', () => {
    const parsed = Config({} as never) as unknown as { style: StyleSetting }
    expect(typeof (parsed.style as { get?: unknown }).get).toBe('function')
    expect(readStyle(parsed.style)).toBe('whale')
    expect(readStyle((Config({ style: 'sketch' } as never) as unknown as { style: StyleSetting }).style)).toBe('sketch')
    expect(() => Config({ style: 'neon' } as never)).toThrow()
  })

  it('stays a plain field where schemastery has no volatile', () => {
    const wrap = (schema: object): object => new Proxy(schema, {
      get(target, key, receiver) {
        if (key === 'volatile') return undefined
        const value = Reflect.get(target, key, receiver)
        return key === 'default' || key === 'description'
          ? (...args: unknown[]) => wrap((value as (...a: unknown[]) => object).apply(target, args))
          : value
      },
    })
    const legacy = new Proxy(z, {
      get: (target, key, receiver) => key === 'union'
        ? (...args: unknown[]) => wrap((target.union as (...a: unknown[]) => object)(...args))
        : Reflect.get(target, key, receiver),
    }) as typeof z
    const field = styleFieldSchema(legacy)
    expect(field('paper')).toBe('paper')
    expect(field(undefined as never)).toBe('whale')
  })

  it('reads a reference, a plain id, and anything else as the default', () => {
    expect(readStyle({ get: () => 'terminal' })).toBe('terminal')
    expect(readStyle('editorial')).toBe('editorial')
    expect(readStyle({ get: () => 'neon' as never })).toBe('whale')
    expect(readStyle({ get: () => undefined })).toBe('whale')
    expect(readStyle(undefined)).toBe('whale')
  })
})

describe('a changed style without a restart', () => {
  it('records the style current at each call in the new card', async () => {
    const style = live('sketch')
    const { ctx, tools } = host()
    apply(ctx, { maxFragmentBytes: 10_000, style: style.ref })
    const first = await tools[0]!.execute({ fragment: '<p>a</p>', title: 'A' }, exec) as { style: string; path: string }
    style.set('paper')
    const second = await tools[0]!.execute({ fragment: '<p>b</p>', title: 'B' }, exec) as { style: string; path: string }
    expect([first.style, second.style]).toEqual(['sketch', 'paper'])
    expect(second.path).toMatch(/\.paper\.html$/u)
  })

  it('rebuilds the tool description when the Loader commits a different style, and only then', () => {
    const style = live('sketch')
    const { ctx, tools, emit } = host()
    apply(ctx, { maxFragmentBytes: 10_000, style: style.ref })
    expect(tools).toHaveLength(1)
    emit('loader/volatile-update', [['maxFragmentBytes']])
    expect(tools).toHaveLength(1)
    style.set('terminal')
    emit('loader/volatile-update', [['style']])
    expect(tools).toHaveLength(2)
    expect(tools[0]!.disposed).toBe(true)
    expect(tools[1]!.disposed).toBe(false)
    expect(tools[1]!.description).toContain('"terminal" card style')
  })

  it('appends the current style guide on each skill load and writes it into each page served', async () => {
    const style = live('editorial')
    const { ctx, providers, emit } = host()
    apply(ctx, { maxFragmentBytes: 10_000, style: style.ref })
    const provider = providers[0]!()
    expect((await provider.get({}, {})).content).toContain('### Built-in style: editorial')
    style.set('sketch')
    expect((await provider.get({}, {})).content).toContain('### Built-in style: sketch')
    const table: unknown[] = []
    emit('webserver/index-inject', table)
    expect(table).toEqual([{ kind: 'global', name: PAGE_CONFIG_GLOBAL, value: { style: 'sketch' } }])
  })
})

describe('optional host seams', () => {
  it('loads without the connection and settings services', () => {
    const { ctx, effects } = host()
    expect(() => apply(ctx, { maxFragmentBytes: 1, style: 'whale' })).not.toThrow()
    expect(effects).toEqual([])
  })

  it('skips the style-file route on a connection without exact routes (dsh 0.1.1)', () => {
    const { ctx, effects } = host({ connection: { rpc: {} }, settings: {} })
    apply(ctx, { maxFragmentBytes: 1, style: 'whale' })
    expect(effects).toEqual([])
  })

  it('registers the route on the authenticated channel and declines a generated settings page', () => {
    const register = vi.fn(() => () => {})
    const configure = vi.fn(() => () => {})
    const { ctx } = host({ connection: { fetch: { register } }, settings: { configure } })
    apply(ctx, { maxFragmentBytes: 1, style: 'whale' })
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      path: STYLE_FILES_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
    }))
    expect(configure).toHaveBeenCalledWith({ auto: false }, { id: 'fiber' })
  })
})
