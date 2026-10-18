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
import { DEFAULT_STYLE, PAGE_CONFIG_GLOBAL, STYLE_IDS, STYLES, type StyleId } from './style.ts'

export { VISUALIZE_TOOL_NAME } from './tool.ts'
export { visualizeMetaFrom, type VisualizeMeta, type VisualizeMode } from './fragment.ts'
export { validateFragment } from './lint.ts'
export { STYLE_IDS, type StyleId } from './style.ts'

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
   * style it was created with.
   */
  style: StyleId
}

/** Schemastery configuration validated by the Loader. */
export const Config: z<Config> = z.object({
  maxFragmentBytes: z.natural().default(1_000_000),
  style: z.union(STYLE_IDS.map(id => z.const(id).description(STYLES[id].label)))
    .default(DEFAULT_STYLE)
    .description('Card style · 卡片风格'),
})

/**
 * Register the tool and the bundled skill provider.
 * @param ctx - registrant context.
 * @param config - validated deployment configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const style = config.style ?? DEFAULT_STYLE
  ctx.tools.register(visualizeTool(ctx, config.maxFragmentBytes, style))
  ctx.skills.registerProvider(() => visualizeSkillProvider(style, cwd => styleFileLocations(ctx, cwd)))
  injectPageConfig(ctx, style)
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
 * settles. The page reads the value when it loads, so a changed setting
 * reaches open pages on their next reload. Hosts without a web server never
 * emit the event, and the listener is inert there.
 * @param ctx - registrant context.
 * @param style - the configured card style.
 */
function injectPageConfig(ctx: Context, style: StyleId): void {
  // The event is declared by the host web server, which this package does not depend on.
  const events = ctx as unknown as { on(name: 'webserver/index-inject', listener: (table: GlobalRow[]) => void): unknown }
  events.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: PAGE_CONFIG_GLOBAL, value: { style } })
  })
}
