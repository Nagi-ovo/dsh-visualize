/**
 * dsh-visualize, node half: registers the `visualize` tool on `ctx.tools` and
 * the bundled `visualize` skill on `ctx.skills`. The browser half
 * (`src/client/`) registers the sandboxed card under the same wire name; a
 * client without it falls back to the tool's generic result text — the
 * documented render-intent degradation, so TUI and headless surfaces keep
 * working with the fragment path alone.
 *
 * @module @dsh-external/dsh-visualize
 */

import type { Context } from 'cordis'
import z from 'schemastery'
import { visualizeTool } from './tool.ts'
import { visualizeSkillProvider } from './skill.ts'

export { VISUALIZE_TOOL_NAME } from './tool.ts'
export { validateFragment, visualizeMetaFrom, type VisualizeMeta, type VisualizeMode } from './fragment.ts'

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
}

/** Schemastery configuration validated by the Loader. */
export const Config: z<Config> = z.object({
  maxFragmentBytes: z.natural().default(1_000_000),
})

/**
 * Register the tool and the bundled skill provider.
 * @param ctx - registrant context.
 * @param config - validated deployment configuration.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(visualizeTool(ctx, config.maxFragmentBytes))
  ctx.skills.registerProvider(() => visualizeSkillProvider)
}
