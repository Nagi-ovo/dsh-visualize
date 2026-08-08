/**
 * Pure assembly of the sandboxed frame document a visualization renders in.
 * DOM-free so the node-side specs exercise it directly; the browser card is
 * its only production caller.
 *
 * Security model (aligned with Codex's /visualize render pipeline): the card
 * mounts `<iframe sandbox="allow-scripts">` — an opaque origin with no access
 * to the host page — and this document's own CSP meta tag confines what runs
 * inside: inline script/style plus a fixed CDN allowlist, no fetch/XHR/
 * WebSocket (`connect-src` covers only blob/data), no nested frames, no form
 * posts. The allowlist is a protocol constant shared with the bundled skill
 * text, not configuration.
 *
 * @module @dsh-external/dsh-visualize/shell
 */

import { FRAME_CSS } from './frame-css.ts'

/** CDN origins a fragment may load static resources from. */
export const RESOURCE_ORIGINS = [
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net',
  'https://esm.sh',
  'https://fonts.bunny.net',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://unpkg.com',
] as const

const RESOURCE_SOURCES = ['blob:', 'data:', ...RESOURCE_ORIGINS].join(' ')

/** The frame document's Content-Security-Policy. */
export const FRAME_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${RESOURCE_SOURCES}`,
  `style-src 'unsafe-inline' ${RESOURCE_SOURCES}`,
  `img-src ${RESOURCE_SOURCES}`,
  `font-src ${RESOURCE_SOURCES}`,
  `media-src ${RESOURCE_SOURCES}`,
  "worker-src blob:",
  'connect-src blob: data:',
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/** Wire type of the frame→card height report message. */
export const HEIGHT_MESSAGE_TYPE = 'dsh-visualize:height'

/** Wire type of the card→frame streaming fragment update message. */
export const STREAM_MESSAGE_TYPE = 'dsh-visualize:stream'

/** Inputs to one frame document assembly. */
export interface FrameDocOptions {
  /** The validated fragment body. */
  fragment: string
  /** Document title (escaped here). */
  title: string
  /**
   * Host palette bridged into the frame as `--dsh-viz-*` custom properties on
   * `:root`. Values pass through {@link sanitizeCssValue}; entries that
   * sanitize to empty are dropped so the stylesheet fallbacks apply.
   */
  themeVars: Record<string, string>
  /** Host `color-scheme` so `light-dark()` in the frame follows the host theme. */
  colorScheme: 'light' | 'dark'
  /**
   * Correlation token echoed in every height report, letting a card with
   * several sibling frames attribute messages; the tool callId in production.
   */
  reportToken: string
}

/**
 * Assemble the complete srcdoc document for one visualization frame.
 * @param options - fragment, title, bridged palette, and report token.
 * @returns the HTML document string for the iframe's `srcDoc`.
 */
export function buildFrameDoc(options: FrameDocOptions): string {
  const rootVars = Object.entries(options.themeVars)
    .map(([name, value]) => [name, sanitizeCssValue(value)] as const)
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => `--dsh-viz-${name}: ${value};`)
    .join(' ')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
<title>${escapeHtml(options.title)}</title>
<style>${FRAME_CSS}
:root { ${rootVars} color-scheme: ${options.colorScheme}; }
body { padding: 4px 2px; }</style>
</head>
<body>
${options.fragment}
<script>${heightReporter(options.reportToken)}</script>
</body>
</html>
`
}

/**
 * The frame-side height reporter: posts the document's scroll height to the
 * parent on load and on every resize, so the card can size the iframe to its
 * content (a sandboxed frame's document is unreachable from the parent).
 * @param reportToken - correlation token echoed in each message.
 * @returns the inline script body.
 */
function heightReporter(reportToken: string): string {
  const token = JSON.stringify(reportToken)
  return `
(function () {
  var post = function () {
    parent.postMessage({
      type: ${JSON.stringify(HEIGHT_MESSAGE_TYPE)},
      token: ${token},
      height: document.documentElement.scrollHeight,
    }, '*');
  };
  new ResizeObserver(post).observe(document.documentElement);
  addEventListener('load', post);
  post();
})();
`
}

/**
 * Assemble the persistent streaming shell: an initially empty document that
 * receives fragment prefixes over `postMessage` and syncs them into its DOM
 * incrementally — unchanged elements persist (no reload churn) and newly
 * arrived elements float in via an enter animation, the Claude-style
 * component-by-component reveal. Scripts inside synced markup stay inert by
 * the `innerHTML` parsing rule, which is exactly right for a half-generated
 * fragment; the settled card runs the finished scripts.
 * @param options - bridged palette, scheme, and correlation token (fragment is ignored).
 * @returns the HTML document string for the preview iframe's `srcDoc`.
 */
export function buildStreamShellDoc(options: Omit<FrameDocOptions, 'fragment' | 'title'>): string {
  const shell = buildFrameDoc({
    ...options,
    title: 'Streaming preview',
    fragment: `<div id="dsh-viz-stream-root"></div>
<style>
.dsh-viz-enter { animation: dsh-viz-enter 0.4s cubic-bezier(0.2, 0.7, 0.3, 1) both; }
@keyframes dsh-viz-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
</style>
<script>${streamSync(options.reportToken)}</script>`,
  })
  return shell
}

/**
 * The frame-side incremental DOM sync: parses each posted fragment prefix
 * into a detached tree and reconciles it against the live root by child
 * index — same tag syncs attributes and recurses, a mismatch replaces, a new
 * node appends with the enter class, extras drop. Index-based reconciliation
 * is exact for streamed markup, which only ever grows or refines its tail.
 * @param reportToken - correlation token accepted on incoming messages.
 * @returns the inline script body.
 */
function streamSync(reportToken: string): string {
  return `
(function () {
  var root = document.getElementById('dsh-viz-stream-root');
  var token = ${JSON.stringify(reportToken)};
  function syncAttrs(cur, next) {
    var i, attrs = cur.attributes;
    for (i = attrs.length - 1; i >= 0; i--) {
      if (!next.hasAttribute(attrs[i].name)) cur.removeAttribute(attrs[i].name);
    }
    attrs = next.attributes;
    for (i = 0; i < attrs.length; i++) {
      if (cur.getAttribute(attrs[i].name) !== attrs[i].value) cur.setAttribute(attrs[i].name, attrs[i].value);
    }
  }
  function executable(node) {
    // Scripts parsed via innerHTML are permanently inert; an executable clone
    // runs on insertion. Streamed markup only ever appends, so each complete
    // script block arrives at its index exactly once and runs exactly once.
    var script = document.createElement('script');
    for (var i = 0; i < node.attributes.length; i++) {
      script.setAttribute(node.attributes[i].name, node.attributes[i].value);
    }
    script.textContent = node.textContent;
    return script;
  }
  function sync(cur, next) {
    var want = next.childNodes, have = cur.childNodes, i;
    for (i = 0; i < want.length; i++) {
      var target = want[i], live = have[i];
      if (live === undefined) {
        var added = target.nodeName === 'SCRIPT' ? executable(target) : target.cloneNode(true);
        if (added.nodeType === 1 && added.nodeName !== 'SCRIPT') added.classList.add('dsh-viz-enter');
        cur.appendChild(added);
        continue;
      }
      if (live.nodeType !== target.nodeType || live.nodeName !== target.nodeName) {
        cur.replaceChild(target.cloneNode(true), live);
        continue;
      }
      if (live.nodeType === 3 || live.nodeType === 8) {
        if (live.nodeValue !== target.nodeValue) live.nodeValue = target.nodeValue;
        continue;
      }
      if (live.nodeType === 1) {
        syncAttrs(live, target);
        sync(live, target);
      }
    }
    while (cur.childNodes.length > want.length) cur.removeChild(cur.lastChild);
  }
  addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== ${JSON.stringify(STREAM_MESSAGE_TYPE)} || data.token !== token) return;
    if (typeof data.fragment !== 'string') return;
    var next = document.createElement('div');
    next.innerHTML = data.fragment;
    sync(root, next);
  });
})();
`
}

/**
 * Keep one bridged palette value inert inside a style block: resolved
 * computed-style colors never contain declaration or block delimiters, so any
 * occurrence marks a malformed value, dropped rather than repaired.
 * @param value - the raw computed-style value.
 * @returns the trimmed value, or empty when it must be dropped.
 */
export function sanitizeCssValue(value: string): string {
  const trimmed = value.trim()
  return /[;{}<>]/u.test(trimmed) ? '' : trimmed
}

/**
 * Minimal HTML text escape for the frame `<title>`.
 * @param text - raw text.
 * @returns the escaped text.
 */
function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
