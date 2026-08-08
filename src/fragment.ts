/**
 * Pure fragment contract shared by the tool (validation at execute time), the
 * browser card (meta narrowing at render time), and the specs. No I/O and no
 * DOM so both halves and vitest can load it unchanged.
 *
 * A *fragment* is the model-authored inline-HTML body of one visualization:
 * literal markup without a document skeleton. The card owns the skeleton — it
 * wraps the fragment in a sandboxed iframe document with its own CSP — so a
 * fragment that ships its own `<!doctype>`/`<html>`/`<head>`/`<body>` would
 * nest documents and is rejected loudly instead of rendered broken.
 *
 * @module @dsh-external/dsh-visualize/fragment
 */

/**
 * Wire name of the tool, the keyed toolview, and the streaming-preview match.
 * Lives in this pure module so the browser half can import it without pulling
 * the node-side tool implementation into the client bundle.
 */
export const VISUALIZE_TOOL_NAME = 'visualize'

/** Width intent of one visualization card. */
export type VisualizeMode = 'inline' | 'wide'

/** The `tool/result` meta descriptor persisted for replay-stable rendering. */
export interface VisualizeMeta {
  /** Discriminant for consumers sharing the meta channel. */
  kind: 'visualize'
  /** The validated fragment body, inlined so replay never re-reads the file. */
  fragment: string
  /** Concise human title shown in the card header. */
  title: string
  /** Width intent; `wide` asks the card for the expanded inline surface. */
  mode: VisualizeMode
  /** Session-relative or absolute source path, kept for provenance display. */
  path: string
}

/** Document-skeleton tags a fragment must not contain (case-insensitive). */
const SKELETON_TAG = /<!doctype\b|<\s*(?:html|head|body)\b/iu

/**
 * Validate one fragment against the inline contract.
 * @param fragment - the file content the model wrote.
 * @param maxBytes - deployment size ceiling for one fragment.
 * @returns the fragment's UTF-8 size in bytes.
 * @throws Error naming the violated rule; the tool surfaces it as `isError`.
 */
export function validateFragment(fragment: string, maxBytes: number): number {
  if (fragment.trim().length === 0) {
    throw new Error('invalid visualization: the fragment file is empty')
  }
  const sizeBytes = byteLength(fragment)
  if (sizeBytes > maxBytes) {
    throw new Error(
      `invalid visualization: fragment is ${sizeBytes} bytes, over the ${maxBytes}-byte limit — `
      + 'shrink the inline data first (fewer rows, coarser buckets, fewer decimals)',
    )
  }
  const skeleton = SKELETON_TAG.exec(fragment)
  if (skeleton) {
    throw new Error(
      `invalid visualization: fragment contains a document-skeleton tag (${JSON.stringify(skeleton[0])}) — `
      + 'write only the inline body; the host supplies <!doctype>, <html>, <head>, and <body>',
    )
  }
  return sizeBytes
}

/**
 * Narrow one persisted `tool/result` meta value to a {@link VisualizeMeta}.
 * Wire data cannot be trusted to match the compiled shape (an older or newer
 * host may have logged it), so a mismatch declines to `undefined` — the caller
 * falls back to the generic presentation instead of throwing on replay.
 * @param meta - the raw persisted meta value.
 * @returns the narrowed descriptor, or `undefined` for the generic path.
 */
export function visualizeMetaFrom(meta: unknown): VisualizeMeta | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const record = meta as Record<string, unknown>
  if (record['kind'] !== 'visualize') return undefined
  const { fragment, title, mode, path } = record
  if (typeof fragment !== 'string' || typeof title !== 'string' || typeof path !== 'string') return undefined
  if (mode !== 'inline' && mode !== 'wide') return undefined
  return { kind: 'visualize', fragment, title, mode, path }
}

/**
 * UTF-8 byte length without Buffer, so the browser bundle needs no polyfill.
 * @param text - the string to measure.
 * @returns its UTF-8 encoding length in bytes.
 */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/** JSON short escapes, keyed by the character after the backslash. */
const JSON_ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

/**
 * Extract the `fragment` string value from a *possibly incomplete* streaming
 * tool-call JSON argument prefix. The streaming preview calls this on every
 * accumulated delta: it scans for the `"fragment":"` opener, then unescapes
 * characters until the (possibly absent) closing quote, dropping a trailing
 * half-finished escape sequence rather than misreading it.
 * @param argsRaw - the accumulated raw argument text, valid JSON or a prefix.
 * @returns the fragment decoded so far, or `undefined` before the opener streams in.
 */
export function extractStreamingFragment(argsRaw: string): string | undefined {
  const opener = /"fragment"\s*:\s*"/u.exec(argsRaw)
  if (!opener) return undefined
  let out = ''
  for (let i = opener.index + opener[0].length; i < argsRaw.length; i++) {
    const ch = argsRaw[i]!
    if (ch === '"') return out
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = argsRaw[i + 1]
    if (next === undefined) return out // trailing lone backslash: escape still streaming
    if (next === 'u') {
      const hex = argsRaw.slice(i + 2, i + 6)
      if (hex.length < 4) return out // \uXXXX still streaming
      const code = Number.parseInt(hex, 16)
      if (Number.isNaN(code)) return out
      out += String.fromCharCode(code)
      i += 5
      continue
    }
    const short = JSON_ESCAPES[next]
    if (short === undefined) return out // malformed escape: stop rather than guess
    out += short
    i += 1
  }
  return out
}

/** Matches the last script opener (complete or still missing its `>`). */
const LAST_SCRIPT_OPEN = /<script\b[^>]*>?(?![\s\S]*<script\b)/iu

/**
 * Prepare a streamed fragment prefix for the live preview: complete
 * `<script>…</script>` blocks are kept — they are finished JavaScript the
 * preview shell executes on arrival, which is how a script-drawn chart paints
 * during generation — while a trailing block whose `</script>` has not
 * streamed in yet is dropped whole (a half-streamed body is almost never
 * valid JavaScript).
 * @param fragment - the fragment prefix streamed so far.
 * @returns the preview-safe markup.
 */
export function trimStreamingScripts(fragment: string): string {
  const opener = LAST_SCRIPT_OPEN.exec(fragment)
  if (!opener) return fragment
  const rest = fragment.slice(opener.index + opener[0].length)
  return /<\/script\s*>/iu.test(rest) ? fragment : fragment.slice(0, opener.index)
}
