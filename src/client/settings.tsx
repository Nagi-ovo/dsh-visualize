/**
 * Register the plugin's page in the host's settings dialog, the way dsh-ads
 * registers its own: one `settings.section` entry (dsh 0.1.1+), labelled
 * 「可视化」/ Visualize, placed after the host's pages. A host that never
 * declares the slot never runs the registration, so nothing changes there.
 *
 * Everything the page needs beyond the slot is looked up, not injected, so a
 * host that lacks it still loads the plugin: the locale service (the page
 * then follows the document language), the settings forms (`configForms`,
 * dsh 0.1.7+; without them the page shows the YAML route), and the
 * style-file route (dsh 0.1.7+; without it the page names the files).
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { StyleFilesView, StyleFileView } from '../style-files.ts'
import { STYLE_FILES_PATH } from '../style.ts'
import { documentLang, settingsLang, type SettingsLang } from './settings-locale.ts'
import { VisualizeSection, type StyleFilesClient, type StyleForm } from './VisualizeSection.tsx'

/** The plugin's profile entry id, which names its settings form. */
export const ENTRY_ID = 'dsh-visualize'

/** Section id in the settings dialog. */
export const SECTION_ID = 'dsh-visualize'

/** The host locale service, as far as the page reads it. */
interface LocaleService {
  getSnapshot(): { active: string }
  subscribe(listener: () => void): () => void
}

/** The host's settings forms, as far as the page reads them. */
interface ConfigForms {
  get(entryId: string): StyleForm
}

/** A slot registry loose enough for a slot this package has no types for. */
interface LooseSlots {
  inject(name: string, register: () => () => void): unknown
  register(options: Record<string, unknown>, component: (props: never) => unknown): () => void
}

/**
 * Look a service up without declaring it.
 * @param ctx - client context.
 * @param name - service name.
 * @returns the service, or undefined.
 */
function lookup(ctx: ClientContext, name: string): unknown {
  try {
    return ctx.get(name as never)
  } catch {
    return undefined
  }
}

/**
 * The locale service when it has the shape the page reads.
 * @param ctx - client context.
 * @returns the service, or undefined.
 */
function localeOf(ctx: ClientContext): LocaleService | undefined {
  const locale = lookup(ctx, 'locale') as Partial<LocaleService> | undefined
  return typeof locale?.getSnapshot === 'function' && typeof locale.subscribe === 'function'
    ? locale as LocaleService
    : undefined
}

/**
 * The host form for this plugin's entry, when the host has settings forms.
 * @param ctx - client context.
 * @returns the form, or undefined.
 */
export function styleFormOf(ctx: ClientContext): StyleForm | undefined {
  const forms = lookup(ctx, 'configForms') as Partial<ConfigForms> | undefined
  if (typeof forms?.get !== 'function') return undefined
  const form = forms.get(ENTRY_ID) as Partial<StyleForm> | undefined
  return typeof form?.getSnapshot === 'function' && typeof form.subscribe === 'function' && typeof form.set === 'function'
    ? form as StyleForm
    : undefined
}

/**
 * The style-file route over the page's own fetch, resolved against the
 * document like the host's other `/api` routes, so a mounted app path keeps
 * working; the browser's session cookie authenticates it.
 * @param fetchImpl - fetch to use.
 * @param base - base URL the route resolves against.
 * @returns the client.
 */
export function styleFilesClient(fetchImpl: typeof fetch = fetch, base: () => string = () => document.baseURI): StyleFilesClient {
  const url = () => new URL(STYLE_FILES_PATH.slice(1), base()).href
  return {
    async load() {
      const response = await fetchImpl(url(), { credentials: 'same-origin', headers: { accept: 'application/json' } })
      if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return undefined
      const view = await response.json() as Partial<StyleFilesView>
      return Array.isArray(view.files) && typeof view.maxBytes === 'number' ? view as StyleFilesView : undefined
    },
    async save(request) {
      try {
        const response = await fetchImpl(url(), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(request),
        })
        const body = await response.json().catch(() => ({})) as { message?: unknown; error?: unknown }
        if (response.ok) return { ok: true, file: body as unknown as StyleFileView }
        const reason = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : `HTTP ${response.status}`
        return { ok: false, reason }
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/** Injected into the section entry. */
interface SectionInjected {
  readonly useLocale?: <T>(selector: (snapshot: { active: string }) => T) => T
  readonly form: StyleForm | undefined
  readonly files: StyleFilesClient
}

/**
 * The section entry the host mounts.
 * @param props - the injected locale hook, form and route client.
 * @returns the page.
 */
function VisualizeSectionEntry({ useLocale, form, files }: SectionInjected) {
  // The hook is either always present or always absent for one registration.
  const lang: SettingsLang = useLocale === undefined ? documentLang() : useLocale(snapshot => settingsLang(snapshot.active))
  return <VisualizeSection lang={lang} form={form} files={files} />
}

/**
 * Register the settings page.
 * @param ctx - client root context.
 */
export function registerSettingsSection(ctx: ClientContext): void {
  const slots = ctx.slots as unknown as LooseSlots
  const files = styleFilesClient()
  slots.inject('settings.section', () => {
    const locale = localeOf(ctx)
    const lang = (): SettingsLang => locale === undefined ? documentLang() : settingsLang(locale.getSnapshot().active)
    return slots.register(
      {
        name: 'settings.section',
        id: SECTION_ID,
        order: 95,
        label: () => lang() === 'en' ? 'Visualize' : '可视化',
        inject: () => ({
          ...locale === undefined ? {} : { hooks: { locale } },
          form: styleFormOf(ctx),
          files,
        }),
      },
      VisualizeSectionEntry,
    )
  })
}
