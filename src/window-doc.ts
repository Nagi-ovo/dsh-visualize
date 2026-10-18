/**
 * The page a card opens as when the reader takes it into its own browser tab.
 * DOM-free so the node-side specs exercise it directly.
 *
 * Security model: the card hands this page to the browser as a Blob URL, and a
 * Blob URL created by the dsh web page has the dsh web origin — anything that
 * ran as this page's own script could read the host's token and storage and
 * call its APIs. So the page carries no script and no model text of its own:
 * it is one full-viewport `<iframe sandbox="allow-scripts">` (the same
 * sandbox, referrer policy, and frame document as the in-chat card), with the
 * frame document passed only inside the escaped `srcdoc` attribute. Inside
 * the frame the fragment has an opaque origin, exactly as in the chat.
 *
 * @module @nagi-ovo/dsh-visualize/window-doc
 */

import { sanitizeCssValue, type FrameVariant } from './shell.ts'

/** Sandbox flags shared by the in-chat card and the windowed page. */
export const FRAME_SANDBOX = 'allow-scripts'

/** Inputs to one windowed page assembly. */
export interface WindowDocOptions {
  /** The complete frame document, as {@link buildFrameDoc} returns it. */
  frameDoc: string
  /** Tab title: the card title. */
  title: string
  /** Host color scheme at open time. */
  colorScheme: 'light' | 'dark'
  /** Host surface color at open time (a computed-style value); empty for the scheme default. */
  background: string
  /**
   * The frame document's variant. A `page` lays out its own margins, so the
   * frame fills the tab edge to edge; a `card` keeps a reading inset.
   */
  variant?: FrameVariant
}

/**
 * Assemble the windowed page around one frame document.
 * @param options - the frame document, title, and host theme at open time.
 * @returns the HTML for the Blob the new tab opens.
 */
export function buildWindowDoc(options: WindowDocOptions): string {
  const surface = sanitizeCssValue(options.background)
  const background = surface.length > 0
    ? surface
    : options.colorScheme === 'dark' ? '#1b1b1f' : '#ffffff'
  const inset = options.variant === 'page' ? '0' : '16px 24px'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(options.title)}</title>
<style>
:root { color-scheme: ${options.colorScheme}; background: ${background}; }
html, body { margin: 0; height: 100%; }
iframe { display: block; box-sizing: border-box; width: 100%; height: 100%; border: 0; padding: ${inset}; background: transparent; }
</style>
</head>
<body><iframe sandbox="${FRAME_SANDBOX}" referrerpolicy="no-referrer" title="${escapeHtml(options.title)}" srcdoc="${escapeHtml(options.frameDoc)}"></iframe></body>
</html>
`
}

/**
 * HTML escape safe for text and double-quoted attribute values. `&` goes
 * first so the later entities are not double-escaped; `"` is what keeps the
 * frame document inside its `srcdoc` attribute.
 * @param text - raw text.
 * @returns the escaped text.
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
