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

/**
 * What one `visualize` call does: render a card from whole markup, or patch
 * the markup of a card an earlier call already rendered.
 */
export type VisualizeAction = 'create' | 'update'

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
 * Characters of real card content quoted back when a patch fails to apply, so
 * the model can correct `old_str` from the true bytes without re-reading the
 * whole card.
 */
const PATCH_CONTEXT_CHARS = 160

/**
 * Shortest matching prefix of a failed `old_str` still worth reporting as a
 * location hint; below this any HTML shares enough characters to point
 * somewhere misleading.
 */
const MIN_ANCHOR_CHARS = 12

/**
 * Replace one exact, unique occurrence of `oldStr` in a rendered card's
 * fragment. Iterating by patch instead of re-emitting the whole fragment is
 * what keeps a small correction small: the model re-states only the changed
 * region, and the card's markup never enters its output twice.
 *
 * A patch that does not resolve to exactly one site is refused rather than
 * guessed at, because both wrong outcomes are silent — a near-miss would edit
 * markup the model never saw, and an ambiguous match would edit an arbitrary
 * one of several sites. The thrown message carries the surrounding real
 * content so the caller can correct `old_str` within the same turn.
 *
 * @param base - the current fragment of the card being patched.
 * @param oldStr - exact text to replace, whitespace included.
 * @param newStr - replacement text; empty deletes the matched region.
 * @returns the patched fragment.
 * @throws Error naming why the patch did not apply; the tool surfaces it as `isError`.
 */
export function applyFragmentPatch(base: string, oldStr: string, newStr: string): string {
  if (oldStr.length === 0) {
    throw new Error('invalid visualization patch: old_str is empty — pass the exact card text to replace')
  }
  const first = base.indexOf(oldStr)
  if (first === -1) {
    throw new Error(`invalid visualization patch: old_str does not appear in the card. ${nearestAnchor(base, oldStr)}`)
  }
  if (base.indexOf(oldStr, first + oldStr.length) !== -1) {
    throw new Error(
      `invalid visualization patch: old_str appears ${countOccurrences(base, oldStr)} times in the card — `
      + 'extend it with neighbouring lines until exactly one site matches',
    )
  }
  return base.slice(0, first) + newStr + base.slice(first + oldStr.length)
}

/**
 * Describe where a failed `old_str` stopped matching: the longest prefix of it
 * that does occur, and the card's real text at that site. Prefix occurrence is
 * monotone in length, so the longest one is a binary search.
 * @param base - the current fragment of the card being patched.
 * @param oldStr - the `old_str` that failed to match.
 * @returns a sentence naming the divergence point, or advising a full re-render.
 */
function nearestAnchor(base: string, oldStr: string): string {
  let matched = 0
  let beyond = oldStr.length
  while (matched < beyond) {
    const mid = Math.ceil((matched + beyond) / 2)
    if (base.includes(oldStr.slice(0, mid))) matched = mid
    else beyond = mid - 1
  }
  if (matched < MIN_ANCHOR_CHARS) {
    return 'None of it matched, so the card is not in the state you assumed — re-render the whole card instead.'
  }
  const at = base.indexOf(oldStr.slice(0, matched))
  return `Its first ${matched} characters do match, at offset ${at}, where the card actually reads `
    + `${JSON.stringify(base.slice(at, at + PATCH_CONTEXT_CHARS))} — correct old_str against that and retry.`
}

/**
 * Count non-overlapping occurrences of a needle, matching the replacement
 * semantics {@link applyFragmentPatch} would apply.
 * @param base - the text to scan.
 * @param needle - the non-empty needle to count.
 * @returns the number of non-overlapping occurrences.
 */
function countOccurrences(base: string, needle: string): number {
  let count = 0
  for (let at = base.indexOf(needle); at !== -1; at = base.indexOf(needle, at + needle.length)) count += 1
  return count
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
