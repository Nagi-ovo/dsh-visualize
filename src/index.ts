/**
 * dsh-visualize, node half: registers the `visualize` tool on `ctx.tools` and
 * the bundled `visualize` skill on `ctx.skills`. The browser half
 * (`src/client/`) registers the sandboxed card under the same wire name; a
 * client without it falls back to the tool's generic result text — the
 * documented render-intent degradation, so TUI and headless surfaces keep
 * working with the fragment path alone.
 *
 * @module @nagi-ovo/dsh-visualize
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { visualizeTool } from './tool.ts'
import { visualizeSkillProvider } from './skill.ts'
import { styleFileLocations } from './style-guide.ts'
import { PAGE_CONFIG_GLOBAL, STYLE_FILES_PATH, type StyleId } from './style.ts'
import { readStyle, styleFieldSchema, type StyleSetting } from './style-setting.ts'
import { handleStyleFiles, styleFilesHost } from './style-files.ts'

export { VISUALIZE_TOOL_NAME } from './tool.ts'
export { visualizeMetaFrom, type VisualizeMeta, type VisualizeMode } from './fragment.ts'
export { validateFragment } from './lint.ts'
export { STYLE_IDS, type StyleId } from './style.ts'
export { readStyle, type StyleSetting } from './style-setting.ts'
export { STYLE_FILES_PATH } from './style.ts'

/** Cordis plugin name. */
export const name = 'dsh-visualize'
/** Required services: the tool registry, the skill registry, and the fs seam. */
export const inject = ['tools', 'skills', 'fs']

/** Deployment configuration. */
export interface Config {
  /**
   * Size ceiling in bytes for one fragment file. Oversized fragments are
   * rejected at execute time with guidance to downsample inline data; the
   * same ceiling bounds what one call adds to the session log.
   */
  maxFragmentBytes: number
  /**
   * Card style for new cards: colours, fonts and chart defaults the frame
   * applies, plus a style guide appended to the skill. Each card keeps the
   * style it was created with. The field is volatile, so the host's settings
   * form can change it while the plugin runs: read it with
   * {@link readStyle}, never once at startup.
   */
  style: StyleSetting
}

/** Schemastery configuration validated by the Loader. */
export const Config: z<Config> = z.object({
  maxFragmentBytes: z.natural().default(1_000_000),
  style: styleFieldSchema(),
}) as unknown as z<Config>

/**
 * Register the tool, the bundled skill provider, the page config, and the
 * style-file route of the settings page.
 * @param ctx - registrant context.
 * @param config - validated deployment configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const style = () => readStyle(config.style)
  // The tool's description names the style, so it is rebuilt when the
  // setting changes; calls already read the style per call.
  let toolStyle = style()
  let disposeTool = ctx.tools.register(visualizeTool(ctx, config.maxFragmentBytes, style))
  const events = ctx as unknown as { on(name: 'loader/volatile-update', listener: () => void): unknown }
  events.on('loader/volatile-update', () => {
    if (style() === toolStyle) return
    disposeTool()
    toolStyle = style()
    disposeTool = ctx.tools.register(visualizeTool(ctx, config.maxFragmentBytes, style))
  })
  ctx.skills.registerProvider(() => visualizeSkillProvider(style, cwd => styleFileLocations(ctx, cwd)))
  injectPageConfig(ctx, style)
  registerStyleFiles(ctx)
  declineGeneratedSettingsPage(ctx)
}

/** The structured index row this plugin contributes (see `@deepseek-ai/dsh-host-webserver`). */
interface GlobalRow {
  kind: 'global'
  name: string
  value: unknown
}

/**
 * Tell the browser half the configured style through the web server's index
 * injection table (dsh 0.1.1+): a card still streaming has no persisted meta
 * yet, and nothing else in the tool call carries server data before it
 * settles. Each page render reads the setting then, so a reload picks up a
 * change; the settings page also updates the value on its own page when it
 * saves. Hosts without a web server never emit the event, and the listener is
 * inert there.
 * @param ctx - registrant context.
 * @param style - reads the configured card style.
 */
function injectPageConfig(ctx: Context, style: () => StyleId): void {
  // The event is declared by the host web server, which this package does not depend on.
  const events = ctx as unknown as { on(name: 'webserver/index-inject', listener: (table: GlobalRow[]) => void): unknown }
  events.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: PAGE_CONFIG_GLOBAL, value: { style: style() } })
  })
}

/** The exact-route registry on the host's authenticated `/api` channel (dsh 0.1.7+). */
interface ConnectionFetch {
  register(route: {
    path: string
    methods: readonly ('GET' | 'HEAD' | 'POST')[]
    requestBody: 'buffered' | 'streaming'
    fetch: (request: Request) => Promise<Response>
  }): () => unknown
}

/**
 * Serve the settings page's style-file editor on the host's `/api` channel,
 * which authenticates the browser and checks Host/Origin before the route
 * runs. Optional: a host without the channel, or with an older connection
 * service, simply has no editor, and the page says where the files are.
 * @param ctx - registrant context.
 */
function registerStyleFiles(ctx: Context): void {
  const host = styleFilesHost(ctx)
  ctx.inject(['connection'], (scope) => {
    const fetch = (scope.get('connection') as { fetch?: Partial<ConnectionFetch> } | undefined)?.fetch
    if (typeof fetch?.register !== 'function') return
    const register = fetch.register.bind(fetch) as ConnectionFetch['register']
    scope.effect(() => register({
      path: STYLE_FILES_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async request => await handleStyleFiles(host, request),
    }), 'dsh-visualize: style files route')
  })
}

/**
 * Tell the host's settings service that this plugin ships its own page for
 * its volatile field, so a client that generates forms from schemas does not
 * add a second one. Optional, like the service.
 * @param ctx - registrant context.
 */
function declineGeneratedSettingsPage(ctx: Context): void {
  ctx.inject(['settings'], (scope) => {
    const settings = scope.get('settings') as { configure?: (policy: { auto: boolean }, owner: unknown) => () => void } | undefined
    if (typeof settings?.configure !== 'function') return
    const configure = settings.configure.bind(settings)
    scope.effect(() => configure({ auto: false }, ctx.fiber), 'dsh-visualize: settings page policy')
  })
}
