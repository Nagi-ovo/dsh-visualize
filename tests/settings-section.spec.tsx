// @vitest-environment jsdom

/**
 * The 设置 → 可视化 page: a style picker over the host's settings form for this
 * plugin's entry, live previews built by the card's own frame builder, and
 * the style-file editor over the plugin's route. On hosts without the form
 * or the route it says how to do the same by hand; on hosts without the
 * settings dialog it never registers.
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { PAGE_CONFIG_GLOBAL, STYLE_IDS, STYLES } from '../src/style.ts'
import type { StyleFilesView } from '../src/style-files.ts'
import { VisualizeSection, type StyleFilesClient, type StyleForm, type StyleFormSnapshot } from '../src/client/VisualizeSection.tsx'
import { registerSettingsSection, styleFilesClient } from '../src/client/settings.tsx'

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  document.body.innerHTML = ''
  delete (globalThis as Record<string, unknown>)[PAGE_CONFIG_GLOBAL]
})

/** A settings form whose host accepts or refuses writes. */
function fakeForm(initial: Partial<StyleFormSnapshot> = {}, accept = true) {
  let snapshot: StyleFormSnapshot = { status: 'ready', value: { style: 'whale' }, user: {}, writable: true, ...initial }
  const listeners = new Set<() => void>()
  const publish = (next: StyleFormSnapshot) => {
    snapshot = next
    listeners.forEach(listener => listener())
  }
  const form: StyleForm = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: vi.fn(async (_field: string, value: unknown) => {
      if (accept) publish({ ...snapshot, value: { style: value }, user: { style: value } })
      return accept
    }),
    unset: vi.fn(async () => {
      publish({ ...snapshot, value: { style: 'whale' }, user: {} })
      return true
    }),
  }
  return { form, publish }
}

const FILES: StyleFilesView = {
  maxBytes: 4096,
  files: [
    { scope: 'global', path: '/h/visualize/style.md', exists: true, text: 'Use teal.', bytes: 9 },
    { scope: 'workspace', path: '/w/.dsh/visualize-style.md', workspaceId: 'ws-1', title: 'demo', exists: false, text: '', bytes: 0 },
  ],
}

function fakeFiles(view: StyleFilesView | undefined = FILES): StyleFilesClient & { save: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn(async () => view),
    save: vi.fn(async (request: { scope: string; text: string }) => ({
      ok: true as const,
      file: { ...FILES.files[request.scope === 'global' ? 0 : 1]!, text: request.text, exists: request.text.trim() !== '' },
    })),
  }
}

async function render(form: StyleForm | undefined, files: StyleFilesClient = fakeFiles(), lang: 'zh' | 'en' = 'zh') {
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () => createRoot(container).render(<VisualizeSection lang={lang} form={form} files={files} />))
  return container
}

const radios = (root: HTMLElement) => [...root.querySelectorAll<HTMLInputElement>('input[type=radio]')]

/** Set a textarea's value the way React notices. */
function type(textarea: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('style picker', () => {
  it('offers every style as one radio group with a live preview in that style', async () => {
    const root = await render(fakeForm({ value: { style: 'paper' } }).form)
    expect(radios(root).map(radio => radio.value)).toEqual([...STYLE_IDS])
    expect(radios(root).find(radio => radio.checked)?.value).toBe('paper')
    expect(root.querySelector('[role=radiogroup]')?.getAttribute('aria-labelledby')).toBeTruthy()
    const sketch = root.querySelector('[data-style=sketch] iframe')!
    expect(sketch.getAttribute('sandbox')).toBe('allow-scripts')
    expect(sketch.getAttribute('srcdoc')).toContain(STYLES.sketch.fontHref!.replaceAll('&', '&amp;'))
    expect(sketch.getAttribute('srcdoc')).toContain('本周注册量上涨 18%')
    expect(root.textContent).toContain('白板手绘')
  })

  it('saves a choice through the host form and hands it to this page right away', async () => {
    const { form } = fakeForm()
    const root = await render(form)
    await act(async () => radios(root).find(radio => radio.value === 'terminal')!.click())
    expect(form.set).toHaveBeenCalledWith('style', 'terminal')
    expect((globalThis as Record<string, unknown>)[PAGE_CONFIG_GLOBAL]).toEqual({ style: 'terminal' })
    expect(radios(root).find(radio => radio.checked)?.value).toBe('terminal')
    expect(root.querySelector('[role=status]')?.textContent).toContain('终端')
  })

  it('follows a save made elsewhere', async () => {
    const { form, publish } = fakeForm()
    const root = await render(form)
    await act(async () => publish({ ...form.getSnapshot(), value: { style: 'editorial' } }))
    expect(radios(root).find(radio => radio.checked)?.value).toBe('editorial')
    expect((globalThis as Record<string, unknown>)[PAGE_CONFIG_GLOBAL]).toEqual({ style: 'editorial' })
  })

  it('keeps the accepted style when the host refuses the write', async () => {
    const { form } = fakeForm({}, false)
    const root = await render(form)
    await act(async () => radios(root).find(radio => radio.value === 'paper')!.click())
    expect(radios(root).find(radio => radio.checked)?.value).toBe('whale')
    expect(root.querySelector('[role=status]')?.textContent).toBe('风格没有保存成功，请重试。')
  })

  it('resets a profile override back to the default', async () => {
    const { form } = fakeForm({ value: { style: 'sketch' }, user: { style: 'sketch' } })
    const root = await render(form, fakeFiles(), 'en')
    const reset = [...root.querySelectorAll('button')].find(button => button.textContent === 'Use the default')!
    await act(async () => reset.click())
    expect(form.unset).toHaveBeenCalledWith('style')
    expect(radios(root).find(radio => radio.checked)?.value).toBe('whale')
  })

  it('shows the YAML route and disables the choices without a host form', async () => {
    for (const form of [undefined, fakeForm({ status: 'unavailable', value: undefined }).form]) {
      ;(globalThis as Record<string, unknown>)[PAGE_CONFIG_GLOBAL] = { style: 'paper' }
      const root = await render(form)
      expect(radios(root).every(radio => radio.disabled)).toBe(true)
      expect(root.textContent).toContain('cordis.patch.yml')
      expect(root.querySelector('pre')?.textContent).toContain('style: paper')
      document.body.innerHTML = ''
    }
  })

  it('disables the choices on a read-only profile', async () => {
    const root = await render(fakeForm({ writable: false }).form)
    expect(radios(root).every(radio => radio.disabled)).toBe(true)
    expect(root.textContent).toContain('这个配置不能在这里修改。')
  })
})

describe('style files', () => {
  it('edits the global and workspace files within the byte limit', async () => {
    const files = fakeFiles()
    const root = await render(fakeForm().form, files)
    const [global, local] = [...root.querySelectorAll<HTMLTextAreaElement>('textarea')]
    expect(global!.value).toBe('Use teal.')
    expect(root.textContent).toContain('/w/.dsh/visualize-style.md')
    const save = () => [...root.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.textContent === '保存')
    expect(save().every(button => button.disabled)).toBe(true)
    await act(async () => type(local!, 'x'.repeat(4097)))
    expect(root.textContent).toContain('超出 4096 字节上限 1 字节。')
    expect(save()[1]!.disabled).toBe(true)
    await act(async () => type(local!, 'Axes in English.'))
    await act(async () => save()[1]!.click())
    expect(files.save).toHaveBeenCalledWith({ scope: 'workspace', workspaceId: 'ws-1', text: 'Axes in English.' })
    expect(root.textContent).toContain('已保存，下次加载 skill 时生效。')
  })

  it('names the files when the host has no route', async () => {
    // A load that answers nothing reads as no route.
    const root = await render(fakeForm().form, { ...fakeFiles(), load: async () => undefined })
    expect(root.querySelector('textarea')).toBeNull()
    expect(root.textContent).toContain('<DSH_HOME>/visualize/style.md')
  })

  it('treats a 404 as no route and reports a refused save', async () => {
    const notFound = vi.fn(async () => new Response('not found', { status: 404 }))
    expect(await styleFilesClient(notFound as never, () => 'http://h/app/').load()).toBeUndefined()
    expect(notFound).toHaveBeenCalledWith('http://h/app/api/dsh-visualize/style-files', expect.anything())
    const refused = vi.fn(async () => new Response(JSON.stringify({ error: 'too-large', message: 'too big' }), {
      status: 413, headers: { 'content-type': 'application/json' },
    }))
    expect(await styleFilesClient(refused as never, () => 'http://h/').save({ scope: 'global', text: 'x' }))
      .toEqual({ ok: false, reason: 'too big' })
  })
})

describe('settings registration', () => {
  /** A client context whose slot registry records registrations. */
  function client(services: Record<string, unknown>, declared: boolean) {
    const registered: { options: Record<string, unknown> }[] = []
    const ctx = {
      get: (name: string) => services[name],
      slots: {
        inject: (name: string, register: () => () => void) => {
          if (declared && name === 'settings.section') register()
        },
        register: (options: Record<string, unknown>) => {
          registered.push({ options })
          return () => {}
        },
      },
    } as unknown as Context
    return { ctx, registered }
  }

  it('adds a 可视化 page to the settings dialog with the host form', () => {
    const { form } = fakeForm()
    const locale = { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} }
    const { ctx, registered } = client({ locale, configForms: { get: (id: string) => id === 'dsh-visualize' ? form : undefined } }, true)
    registerSettingsSection(ctx)
    expect(registered).toHaveLength(1)
    const options = registered[0]!.options
    expect(options).toMatchObject({ name: 'settings.section', id: 'dsh-visualize' })
    expect((options.label as () => string)()).toBe('可视化')
    expect((options.inject as () => { form: unknown; hooks: unknown })()).toMatchObject({ form, hooks: { locale } })
  })

  it('labels the page in English for an English host, and without a form or locale service still registers', () => {
    const { ctx, registered } = client({ locale: { getSnapshot: () => ({ active: 'en' }), subscribe: () => () => {} } }, true)
    registerSettingsSection(ctx)
    expect((registered[0]!.options.label as () => string)()).toBe('Visualize')
    expect((registered[0]!.options.inject as () => { form: unknown })().form).toBeUndefined()
    const bare = client({}, true)
    registerSettingsSection(bare.ctx)
    expect((bare.registered[0]!.options.inject as () => Record<string, unknown>)()).not.toHaveProperty('hooks')
  })

  it('registers nothing on a host without the settings dialog slot', () => {
    const { ctx, registered } = client({}, false)
    registerSettingsSection(ctx)
    expect(registered).toEqual([])
  })
})
