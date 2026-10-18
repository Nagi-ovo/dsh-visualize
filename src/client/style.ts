/**
 * The style a card that has no persisted meta yet renders in: the dock
 * preview and a running call's live frame. The node half writes the
 * configured style into every page it serves (index.ts), which is the answer
 * from dsh 0.1.1 on. Where that value is missing — a host page that does not
 * run the plugin's node half, or a static build — the card borrows the style
 * of the most recently settled card created on this page, which the next card
 * will almost always share. The settled card re-renders in its own style
 * either way.
 */

import { DEFAULT_STYLE, PAGE_CONFIG_GLOBAL, STYLE_IDS, type StyleId } from '../style.ts'

let lastCreated: StyleId = DEFAULT_STYLE

/**
 * Note the style of a settled card. Only a create speaks for the setting: an
 * update keeps the style its card was created with, however old.
 * @param style - that card's style.
 * @param argsRaw - the call's raw arguments, for its action.
 */
export function noteSettledStyle(style: StyleId, argsRaw: string | undefined): void {
  if (argsRaw !== undefined && /"action"\s*:\s*"update"/u.test(argsRaw)) return
  lastCreated = style
}

/**
 * The style a card whose meta has not arrived yet renders in.
 * @returns the configured style from the page, else the last created card's.
 */
export function liveStyle(): StyleId {
  return configuredStyle() ?? lastCreated
}

/** The configured style the node half put on this page, when it is a known id. */
function configuredStyle(): StyleId | undefined {
  const config = (globalThis as Record<string, unknown>)[PAGE_CONFIG_GLOBAL] as { style?: unknown } | undefined
  const style = config?.style
  return typeof style === 'string' && (STYLE_IDS as readonly string[]).includes(style) ? style as StyleId : undefined
}
