/**
 * Fragment linter: the inline contract the `visualize` skill states, enforced
 * as a table of coded rules whose findings go back to the model verbatim.
 *
 * Severity is a promise about precision. An `error` rejects the call — nothing
 * renders and nothing is written — so error rules only fire on patterns that
 * reliably break the card or violate its policy. Anything heuristic is a
 * `warn`: the card renders and the finding rides along in the success text.
 * An error rule whose match it cannot read with certainty — script text whose
 * meaning depends on scope, a property chain, or a shape that parses two ways —
 * reports that finding as a `warn` with the same code and fix. A false error
 * blocks a valid card; a missed one only leaves part of a card to the CSP.
 *
 * There is no HTML or JS parser here. One linear pass splits the fragment into
 * markup, comments, and `<script>`/`<style>` bodies; script bodies are then
 * tokenised just far enough to tell code from comments, strings, and regex
 * literals, and style bodies just far enough to tell selectors from
 * declaration values. Every rule queries those views, so a `fetch(` in a
 * comment, a hex digit run in an id selector, or a `\n` inside a JS string
 * never trips anything. Pure and DOM-free so vitest loads it unchanged.
 *
 * @module @nagi-ovo/dsh-visualize/lint
 */

import { RESOURCE_ORIGINS } from './shell.ts'

/** Whether a finding blocks the call or only accompanies the rendered card. */
export type LintSeverity = 'error' | 'warn'

/** One row of the rule table. */
export interface LintRule {
  /** `error` rejects the call; `warn` renders and reports. */
  readonly severity: LintSeverity
  /** One-line statement of what is wrong. */
  readonly message: string
  /** A concrete fix the model can apply in its next call. */
  readonly fix: string
}

/** Hosts a fragment may load static resources from, as the frame CSP lists them. */
export const ALLOWED_HOSTS: readonly string[] = RESOURCE_ORIGINS.map(origin => origin.slice('https://'.length))

const HOST_LIST = ALLOWED_HOSTS.join(', ')

/**
 * The rule table. Codes are stable: the model sees them, and a repeated code
 * is what the loop guard counts. Error rules are `VZ0xx`, warn rules `VZ1xx`.
 * A rule's severity is what a certain match reports; an uncertain match of an
 * error rule is downgraded to `warn` per finding.
 */
export const LINT_RULES = {
  VZ001: {
    severity: 'error',
    message: 'the fragment is empty',
    fix: 'pass the visualization markup itself in `fragment`',
  },
  VZ002: {
    severity: 'error',
    message: 'the fragment is over the size limit',
    fix: 'shrink the inline data first (fewer rows, coarser buckets, fewer decimals, no unused fields)',
  },
  VZ003: {
    severity: 'error',
    message: 'the fragment contains a document-skeleton tag',
    fix: 'write only the inline body; the host supplies <!doctype>, <html>, <head>, and <body>',
  },
  VZ004: {
    severity: 'error',
    message: 'the markup is string-escaped (literal \\" or \\n where real quotes and line breaks belong)',
    fix: 'send the markup itself, with real " quotes and real line breaks, not a JSON-escaped rendition of it',
  },
  VZ005: {
    severity: 'error',
    message: 'external resource the card blocks',
    fix: `load it over https from an allowlisted host (${HOST_LIST}), or inline it`,
  },
  VZ006: {
    severity: 'error',
    message: 'CDN resource without a pinned version',
    fix: 'pin an exact version in the URL, e.g. https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js',
  },
  VZ007: {
    severity: 'error',
    message: 'network API, blocked inside the card (it fails without an error message)',
    fix: 'inline the data in the script as a literal, reduced first; the card cannot reach any server',
  },
  VZ008: {
    severity: 'error',
    message: 'form submission, blocked inside the card',
    fix: 'drop action/method/formaction and handle the input in a submit listener that calls event.preventDefault()',
  },
  VZ009: {
    severity: 'error',
    message: 'declares color-scheme, which flips every light-dark() against the host theme',
    fix: 'delete the color-scheme declaration; the card document already carries the host scheme',
  },
  VZ010: {
    severity: 'error',
    message: 'document.currentScript is used to locate the root',
    fix: 'give the root element a unique id and find it with document.getElementById(...)',
  },
  VZ101: {
    severity: 'warn',
    message: 'hard-coded colour, which ignores the host theme',
    fix: 'use a theme variable (var(--foreground), var(--viz-series-1), …) or a light-dark(<light>, <dark>) pair; '
      + 'for canvas, resolve the variable through a probe element',
  },
  VZ102: {
    severity: 'warn',
    message: 'the script looks up an id no element in the fragment has',
    fix: 'add that id to the element, or correct the lookup',
  },
  VZ103: {
    severity: 'warn',
    message: 'no element has an id for the script to find its root by',
    fix: 'give the root element a unique id and find it with document.getElementById(...)',
  },
  VZ104: {
    severity: 'warn',
    message: "Chart.defaults.font.family = 'inherit' is not a canvas font, so chart text falls back to the browser default",
    fix: 'call dshViz.chartDefaults(Chart, root), which sets the card style\'s computed font, or set Chart.defaults.font.family = getComputedStyle(document.body).fontFamily',
  },
  VZ105: {
    severity: 'warn',
    message: 'CDN version is a range or partial version, so the build can change under the card',
    fix: 'pin the exact major.minor.patch version',
  },
  VZ106: {
    severity: 'warn',
    message: 'relative or bare URL, which cannot resolve inside the sandboxed card',
    fix: 'use a full https URL on an allowlisted host, or inline the resource (data: URLs work)',
  },
  VZ199: {
    severity: 'warn',
    message: 'a lint stage failed and was skipped, so its rules were not checked',
    fix: 'nothing to change for this warning; check the card by eye against the rules that stage covers',
  },
} as const satisfies Record<string, LintRule>

/** A stable rule code. */
export type LintCode = keyof typeof LINT_RULES

/** One rule violation at one place in the fragment. */
export interface LintFinding {
  readonly code: LintCode
  readonly severity: LintSeverity
  /** The rule message, with the specific detail (host, API, value) appended. */
  readonly message: string
  readonly fix: string
  /** UTF-16 offset of the offending text. */
  readonly offset: number
  /** Length of the offending text (at least 1). */
  readonly length: number
  /** 1-based line of {@link offset}. */
  readonly line: number
  /** 1-based column of {@link offset}. */
  readonly column: number
  /** The offending line, trimmed to a short window around the column. */
  readonly excerpt: string
}

/** What one lint pass found. */
export interface LintReport {
  /** UTF-8 size of the fragment. */
  readonly sizeBytes: number
  /** Findings in document order, errors and warnings mixed. */
  readonly findings: readonly LintFinding[]
  /**
   * Linter stages that threw and were skipped. The linter fails open: a bug in
   * one stage drops that stage's findings rather than rejecting a valid card.
   */
  readonly skipped?: readonly string[]
}

/**
 * Lint one fragment against the inline contract.
 * @param fragment - the markup the card would render.
 * @param maxBytes - deployment size ceiling for one fragment.
 * @returns the size and every finding; the caller decides what to reject.
 */
export function lintFragment(fragment: string, maxBytes: number): LintReport {
  const sizeBytes = new TextEncoder().encode(fragment).length
  const sink = new FindingSink(fragment)
  if (fragment.trim().length === 0) {
    sink.add('VZ001', 0, 0)
    return { sizeBytes, findings: sink.sorted() }
  }
  if (sizeBytes > maxBytes) {
    // Oversized input is not scanned: the fix is to shrink it first anyway.
    sink.add('VZ002', 0, 0, `${sizeBytes} bytes, over the ${maxBytes}-byte limit`)
    return { sizeBytes, findings: sink.sorted() }
  }
  const skipped: string[] = []
  const reasons: string[] = []
  // Fail open: the input is untrusted, and a linter bug must cost at most the
  // findings of the stage that hit it, never a valid card or the host.
  const guard = (stage: string, run: () => void): void => {
    try {
      run()
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      skipped.push(`${stage}: ${reason}`)
      reasons.push(`${stage} (${reason})`)
    }
  }
  let doc: Doc | undefined
  guard('scan', () => {
    doc = scanDocument(fragment)
  })
  if (doc !== undefined) {
    const scanned = doc
    for (const [stage, check] of RULE_STAGES) guard(stage, () => check(scanned, sink))
  }
  // Never silent: a skipped stage is a warning the model and the user both see.
  if (reasons.length > 0) sink.add('VZ199', 0, 0, reasons.join('; '))
  return { sizeBytes, findings: sink.sorted(), ...skipped.length > 0 ? { skipped } : {} }
}

/** The rule passes, in the order they run; each is guarded on its own. */
const RULE_STAGES: readonly (readonly [string, (doc: Doc, sink: FindingSink) => void])[] = [
  ['skeleton', (doc, sink) => checkSkeleton(doc, sink)],
  ['escaped-markup', (doc, sink) => checkEscapedMarkup(doc, sink)],
  ['resources', (doc, sink) => checkResources(doc, sink)],
  ['forms', (doc, sink) => checkForms(doc, sink)],
  ['scripts', (doc, sink) => checkScripts(doc, sink)],
  ['styles', (doc, sink) => checkStyles(doc, sink)],
  ['ids', (doc, sink) => checkIds(doc, sink)],
]

/**
 * Validate one fragment against the inline contract.
 * @param fragment - the markup the model sent.
 * @param maxBytes - deployment size ceiling for one fragment.
 * @returns the fragment's UTF-8 size in bytes.
 * @throws Error listing every `error` finding; the tool surfaces it as `isError`.
 */
export function validateFragment(fragment: string, maxBytes: number): number {
  const { sizeBytes, findings } = lintFragment(fragment, maxBytes)
  const errors = findings.filter(f => f.severity === 'error')
  if (errors.length > 0) throw new Error(formatRejection(errors, findings.filter(f => f.severity === 'warn')))
  return sizeBytes
}

/** How a finding relates to the patch that produced the linted card. */
export type FindingOrigin = 'new' | 'edit' | 'preexisting'

/** A finding plus where it came from, for messages about patched cards. */
export interface PlacedFinding {
  readonly finding: LintFinding
  readonly origin: FindingOrigin
}

/** At most this many findings of one code are spelled out in a message. */
const SHOWN_PER_CODE = 3

/**
 * Format the rejection text the model sees when a call has errors.
 * @param errors - the blocking findings.
 * @param warnings - non-blocking findings, listed so one retry fixes everything.
 * @param patched - whether positions refer to a card a patch produced.
 * @returns the message body (no loop-guard suffix).
 */
export function formatRejection(
  errors: readonly (LintFinding | PlacedFinding)[],
  warnings: readonly (LintFinding | PlacedFinding)[] = [],
  patched = false,
): string {
  const count = errors.length === 1 ? 'the error' : `the ${errors.length} errors`
  const where = patched ? 'the card as your patch would leave it' : 'the fragment you sent'
  const head = `invalid visualization: nothing was rendered. Fix ${count} below and call visualize again `
    + `(positions are line:column in ${where}).`
  const parts = [head, formatFindings(errors)]
  if (warnings.length > 0) parts.push('Warnings (not blocking; fix them in the same call if cheap):', formatFindings(warnings))
  return parts.join('\n')
}

/**
 * Format findings one per entry, at most {@link SHOWN_PER_CODE} per code with
 * the remaining positions summarised, so 200 hex literals do not flood context.
 * @param findings - findings to list, optionally tagged with their origin.
 * @returns the formatted block.
 */
export function formatFindings(findings: readonly (LintFinding | PlacedFinding)[]): string {
  const placed = findings.map(f => ('finding' in f ? f : { finding: f, origin: 'new' as const }))
  const byCode = new Map<LintCode, PlacedFinding[]>()
  for (const entry of placed) {
    const list = byCode.get(entry.finding.code) ?? []
    list.push(entry)
    byCode.set(entry.finding.code, list)
  }
  const lines: string[] = []
  for (const [code, list] of byCode) {
    for (const { finding, origin } of list.slice(0, SHOWN_PER_CODE)) {
      const tag = origin === 'edit' ? ' [in your new_str]' : origin === 'preexisting' ? ' [already in the card before this patch]' : ''
      lines.push(
        `${code} ${finding.severity} at ${finding.line}:${finding.column}${tag}: ${finding.message}`,
        `    | ${finding.excerpt}`,
      )
    }
    const rest = list.slice(SHOWN_PER_CODE)
    if (rest.length > 0) {
      const at = rest.slice(0, 10).map(({ finding }) => `${finding.line}:${finding.column}`).join(', ')
      lines.push(`    (+${rest.length} more ${code} at ${at}${rest.length > 10 ? ', …' : ''})`)
    }
    // One fix per code: it is the same for every occurrence.
    lines.push(`    fix: ${list[0]!.finding.fix}`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Findings

/** Collects findings with positions resolved against the fragment. */
class FindingSink {
  private readonly src: string
  private readonly lineStarts: number[] = [0]
  private readonly items: LintFinding[] = []
  /** Index into {@link items} per code and offset. */
  private readonly seen = new Map<string, number>()

  constructor(src: string) {
    this.src = src
    for (let i = src.indexOf('\n'); i !== -1; i = src.indexOf('\n', i + 1)) this.lineStarts.push(i + 1)
  }

  /**
   * Record one finding; a second one of the same code at the same offset is
   * dropped unless it is more severe.
   * @param cap - `warn` downgrades an error rule for a match read with doubt.
   */
  add(code: LintCode, offset: number, length: number, detail?: string, cap?: 'warn'): void {
    const rule: LintRule = LINT_RULES[code]
    const severity: LintSeverity = cap ?? rule.severity
    const key = `${code}:${offset}`
    const at = this.seen.get(key)
    if (at !== undefined && (this.items[at]!.severity === 'error' || severity === 'warn')) return
    const { line, column, excerpt } = this.locate(offset)
    const finding: LintFinding = {
      code,
      severity,
      message: detail === undefined ? rule.message : `${rule.message}: ${detail}`,
      fix: rule.fix,
      offset,
      length: Math.max(1, length),
      line,
      column,
      excerpt,
    }
    if (at === undefined) {
      this.seen.set(key, this.items.length)
      this.items.push(finding)
    } else {
      this.items[at] = finding
    }
  }

  sorted(): LintFinding[] {
    // A sorted copy: {@link seen} indexes the insertion order.
    return [...this.items].sort((a, b) => a.offset - b.offset)
  }

  private locate(offset: number): { line: number; column: number; excerpt: string } {
    let lo = 0
    let hi = this.lineStarts.length - 1
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (this.lineStarts[mid]! <= offset) lo = mid
      else hi = mid - 1
    }
    const start = this.lineStarts[lo]!
    // From the line table, not indexOf: a search per finding is quadratic on one long line.
    const next = this.lineStarts[lo + 1]
    const end = next === undefined ? this.src.length : next - 1
    const column = offset - start
    const from = Math.max(start, offset - 40)
    const to = Math.min(end, Math.max(offset + 60, from + 100))
    let excerpt = this.src.slice(from, to).replaceAll('\t', ' ').trim()
    if (from > start) excerpt = `…${excerpt}`
    if (to < end) excerpt = `${excerpt}…`
    return { line: lo + 1, column: column + 1, excerpt }
  }
}

// ---------------------------------------------------------------------------
// Document scan

interface Attr {
  /** Lowercased attribute name. */
  readonly name: string
  /** Value without quotes, or undefined for a bare attribute. */
  readonly value: string | undefined
  /** Offset of the attribute name. */
  readonly start: number
  /** Offset of the value's first character (inside the quotes). */
  readonly valueStart: number
  /** Raw value text as written, quotes included. */
  readonly raw: string
}

interface Tag {
  /** Lowercased tag name; `!doctype`-style declarations keep their `!`. */
  readonly name: string
  readonly start: number
  readonly end: number
  readonly closing: boolean
  readonly attrs: readonly Attr[]
}

interface Block {
  readonly kind: 'script' | 'style'
  readonly tag: Tag
  /** Body range, between the opening tag and its closing tag. */
  readonly start: number
  readonly end: number
}

interface TextRun {
  readonly start: number
  readonly end: number
  /** Inside `<pre>`/`<code>`/`<kbd>`/`<samp>`/`<textarea>`, where escapes are content. */
  readonly literal: boolean
}

interface JsString {
  /** Offset of the opening quote. */
  readonly start: number
  /** Offset just past the closing quote. */
  readonly end: number
  /** Raw text between the quotes, escapes unprocessed. */
  readonly value: string
  readonly interpolated: boolean
}

interface Decl {
  /** Lowercased property name. */
  readonly prop: string
  readonly propStart: number
  /** Raw value text, comments blanked. */
  readonly value: string
  readonly valueStart: number
}

interface Doc {
  readonly src: string
  readonly tags: readonly Tag[]
  readonly blocks: readonly Block[]
  readonly text: readonly TextRun[]
  /** The fragment with comments and script/style bodies blanked. */
  readonly markup: string
  /** Executable script code only: everything else, string contents included, blanked. */
  readonly js: string
  /** [start, end) of each executable script body within {@link js}. */
  readonly jsRanges: readonly (readonly [number, number])[]
  /** String literals of executable scripts, keyed by opening-quote offset. */
  readonly strings: ReadonlyMap<number, JsString>
  /**
   * Literal text of executable scripts' strings as [offset, text] runs that
   * never overlap: a template's text between interpolations, not the nested
   * code. Rules that scan string contents use these, since a template's
   * {@link JsString.value} contains every template nested inside it.
   */
  readonly literals: readonly (readonly [number, string])[]
  /** CSS declarations from `<style>` bodies and `style` attributes. */
  readonly decls: readonly Decl[]
  /** `@import` targets from `<style>` bodies: [offset, url]. */
  readonly imports: readonly (readonly [number, string])[]
  /** Whether any `<script type="importmap">` is present. */
  readonly importMap: boolean
  /** Absolute URLs named in import maps: [offset, url]. */
  readonly importMapUrls: readonly (readonly [number, string])[]
}

const LITERAL_TAGS = new Set(['pre', 'code', 'kbd', 'samp', 'textarea'])
const VOID_OR_SELF = /\/\s*$/u
const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module', 'text/ecmascript', 'application/ecmascript'])

/**
 * Split the fragment into tags, text, comments, and raw-text blocks, then
 * tokenise the script and style bodies.
 * @param src - the fragment.
 * @returns the scanned views every rule queries.
 */
function scanDocument(src: string): Doc {
  const n = src.length
  const tags: Tag[] = []
  const blocks: Block[] = []
  const text: TextRun[] = []
  const markupBlanks: [number, number][] = []
  let literalDepth = 0
  let i = 0
  const pushText = (start: number, end: number): void => {
    if (end > start) text.push({ start, end, literal: literalDepth > 0 })
  }
  while (i < n) {
    const lt = src.indexOf('<', i)
    if (lt === -1) {
      pushText(i, n)
      break
    }
    pushText(i, lt)
    if (src.startsWith('<!--', lt)) {
      const close = src.indexOf('-->', lt + 4)
      const end = close === -1 ? n : close + 3
      markupBlanks.push([lt, end])
      i = end
      continue
    }
    const next = src[lt + 1] ?? ''
    if (next === '/') {
      const closing = /<\/([a-z][\w:-]*)[^>]*>?/iuy
      closing.lastIndex = lt
      const m = closing.exec(src)
      if (m) {
        const name = m[1]!.toLowerCase()
        tags.push({ name, start: lt, end: lt + m[0].length, closing: true, attrs: [] })
        if (LITERAL_TAGS.has(name) && literalDepth > 0) literalDepth -= 1
        i = lt + m[0].length
        continue
      }
      i = lt + 1
      continue
    }
    if (next === '!' || next === '?') {
      const gt = src.indexOf('>', lt)
      const end = gt === -1 ? n : gt + 1
      const name = /^<([!?][a-z]*)/iu.exec(src.slice(lt, Math.min(end, lt + 12)))?.[1]?.toLowerCase() ?? '!'
      tags.push({ name, start: lt, end, closing: false, attrs: [] })
      i = end
      continue
    }
    if (!/[a-z]/iu.test(next)) {
      i = lt + 1
      continue
    }
    const tag = parseOpenTag(src, lt)
    tags.push(tag)
    i = tag.end
    if (tag.name === 'script' || tag.name === 'style') {
      const closer = tag.name === 'script' ? /<\/script\b[^>]*>?/giu : /<\/style\b[^>]*>?/giu
      closer.lastIndex = tag.end
      const m = closer.exec(src)
      const bodyEnd = m ? m.index : n
      blocks.push({ kind: tag.name, tag, start: tag.end, end: bodyEnd })
      markupBlanks.push([tag.end, bodyEnd])
      if (m) tags.push({ name: tag.name, start: m.index, end: m.index + m[0].length, closing: true, attrs: [] })
      i = m ? m.index + m[0].length : n
      continue
    }
    if (LITERAL_TAGS.has(tag.name) && !VOID_OR_SELF.test(src.slice(tag.start, tag.end - 1))) literalDepth += 1
  }

  const jsSegments: [number, string][] = []
  const strings = new Map<number, JsString>()
  const literals: [number, string][] = []
  const decls: Decl[] = []
  const imports: [number, string][] = []
  let importMap = false
  const importMapUrls: [number, string][] = []
  for (const block of blocks) {
    if (block.kind === 'script') {
      if (attr(block.tag, 'src') !== undefined) continue
      const type = (attr(block.tag, 'type') ?? '').trim().toLowerCase()
      if (type === 'importmap') {
        importMap = true
        // JSON strings are JS strings; the map's targets are URLs the module loader fetches.
        for (const s of scanJs(src, block.start, block.end).strings) {
          if (/^(?:https?:)?\/\//iu.test(s.value)) importMapUrls.push([s.start + 1, s.value])
        }
        continue
      }
      if (!JS_TYPES.has(type)) continue
      const scan = scanJs(src, block.start, block.end)
      jsSegments.push([block.start, scan.code])
      for (const s of scan.strings) strings.set(s.start, s)
      for (const run of scan.literals) literals.push(run)
    } else {
      const scan = scanCss(src, block.start, block.end)
      // Element-wise, never push(...xs): a spread of a large array overflows the argument limit.
      for (const decl of scan.decls) decls.push(decl)
      for (const entry of scan.imports) imports.push(entry)
    }
  }
  for (const tag of tags) {
    const style = tag.attrs.find(a => a.name === 'style')
    if (style?.value === undefined) continue
    for (const decl of scanCss(src, style.valueStart, style.valueStart + style.value.length).decls) decls.push(decl)
  }
  return {
    src,
    tags,
    blocks,
    text,
    markup: blank(src, markupBlanks),
    js: overlay(n, jsSegments),
    jsRanges: jsSegments.map(([start, code]) => [start, start + code.length] as const),
    strings,
    literals,
    decls,
    imports,
    importMap,
    importMapUrls,
  }
}

/**
 * Parse one opening tag starting at `<`.
 * @param src - the fragment.
 * @param lt - offset of the `<`.
 * @returns the tag with its attributes; an unterminated tag runs to the end.
 */
function parseOpenTag(src: string, lt: number): Tag {
  const n = src.length
  let i = lt + 1
  while (i < n && /[\w:-]/u.test(src[i]!)) i++
  const name = src.slice(lt + 1, i).toLowerCase()
  const attrs: Attr[] = []
  while (i < n) {
    const c = src[i]!
    if (c === '>') return { name, start: lt, end: i + 1, closing: false, attrs }
    if (/\s|\//u.test(c)) {
      i++
      continue
    }
    const nameStart = i
    while (i < n && !/[\s"'>/=]/u.test(src[i]!)) i++
    if (i === nameStart) {
      i++
      continue
    }
    const attrName = src.slice(nameStart, i).toLowerCase()
    let j = i
    while (j < n && /\s/u.test(src[j]!)) j++
    if (src[j] !== '=') {
      attrs.push({ name: attrName, value: undefined, start: nameStart, valueStart: i, raw: '' })
      continue
    }
    j++
    while (j < n && /\s/u.test(src[j]!)) j++
    const q = src[j]
    if (q === '"' || q === "'") {
      const close = src.indexOf(q, j + 1)
      const end = close === -1 ? n : close
      attrs.push({ name: attrName, value: src.slice(j + 1, end), start: nameStart, valueStart: j + 1, raw: src.slice(j, end + 1) })
      i = Math.min(n, end + 1)
    } else {
      let end = j
      while (end < n && !/[\s>]/u.test(src[end]!)) end++
      attrs.push({ name: attrName, value: src.slice(j, end), start: nameStart, valueStart: j, raw: src.slice(j, end) })
      i = end
    }
  }
  return { name, start: lt, end: n, closing: false, attrs }
}

/** Value of one attribute, undefined when absent. */
function attr(tag: Tag, name: string): string | undefined {
  return tag.attrs.find(a => a.name === name)?.value
}

/**
 * Replace the given ranges with spaces, keeping every offset.
 * @param src - the text.
 * @param ranges - absolute ranges to blank.
 * @param from - start of the window to return.
 * @param to - end of the window to return.
 * @returns `src.slice(from, to)` with the ranges blanked.
 */
function blank(src: string, ranges: readonly (readonly [number, number])[], from = 0, to = src.length): string {
  if (ranges.length === 0) return src.slice(from, to)
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  let out = ''
  let at = from
  for (const [start, rawEnd] of sorted) {
    const end = Math.min(rawEnd, to)
    if (end <= at) continue
    const cut = Math.max(start, at)
    out += src.slice(at, cut) + ' '.repeat(end - cut)
    at = end
  }
  return out + src.slice(at, to)
}

/**
 * `src.indexOf(needle, from)` bounded to end before `to`. Plain indexOf runs on
 * to the end of the fragment, so a miss per script or style block is quadratic.
 * @returns the offset, or -1 when the needle does not end at or before `to`.
 */
function indexWithin(src: string, needle: string, from: number, to: number): number {
  if (from >= to) return -1
  const at = src.slice(from, to).indexOf(needle)
  return at === -1 ? -1 : from + at
}

/** A blank string of length `n` with the given segments written in place. */
function overlay(n: number, segments: readonly (readonly [number, string])[]): string {
  let out = ''
  let at = 0
  for (const [start, text] of segments) {
    out += ' '.repeat(start - at) + text
    at = start + text.length
  }
  return out + ' '.repeat(Math.max(0, n - at))
}

/** Keywords after which a `/` starts a regex literal rather than a division. */
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof'])
const REGEX_AFTER_PUNCT = new Set([...'(,=:[!&|?{};+-*%<>~^'])

/**
 * Tokenise a script body far enough to separate code from comments, strings,
 * and regex literals.
 * @param src - the fragment.
 * @param from - body start.
 * @param to - body end.
 * Linear in the body length on any input: template nesting is an explicit
 * stack rather than recursion, comment searches stop at the body end, and a
 * failed regex-literal scan is memoised so the next `/` cannot rescan it.
 * @returns the body with non-code blanked (quotes kept), its string literals,
 * and its literal text runs (template text between interpolations), which
 * never overlap one another.
 */
function scanJs(src: string, from: number, to: number): { code: string; strings: JsString[]; literals: [number, string][] } {
  const blanks: [number, number][] = []
  const strings: JsString[] = []
  const literals: [number, string][] = []
  const literal = (start: number, end: number): void => {
    blanks.push([start, end])
    if (end > start) literals.push([start, src.slice(start, end)])
  }
  /** Template literals suspended inside a `${`, innermost last, with the brace depth to restore. */
  const frames: { open: number; depth: number }[] = []
  let depth = 0
  let prev = ''

  /**
   * Scan template text from `j` (just past the backtick or a closing `}`).
   * @returns where code resumes: past the closing backtick, or inside a `${`.
   */
  const template = (open: number, start: number, interpolated: boolean): number => {
    let j = start
    while (j < to) {
      const c = src[j]!
      if (c === '\\') {
        j += 2
        continue
      }
      if (c === '`') break
      if (c === '$' && src[j + 1] === '{') {
        literal(start, j)
        frames.push({ open, depth })
        depth = 0
        prev = '{'
        return j + 2
      }
      j++
    }
    j = Math.min(j, to)
    literal(start, j)
    strings.push({ start: open, end: Math.min(j + 1, to), value: src.slice(open + 1, j), interpolated })
    prev = '`'
    return Math.min(j + 1, to)
  }

  // States (offset, inside a class) a failed regex scan passed through: any
  // later scan reaching one fails the same way, so it stops there.
  let failed: Uint8Array | undefined
  const path: number[] = []
  const scanRegex = (start: number): number => {
    let j = start + 1
    let inClass = false
    path.length = 0
    const fail = (): number => {
      failed ??= new Uint8Array(2 * (to - from) + 2)
      for (const state of path) failed[state] = 1
      return -1
    }
    while (j < to) {
      const state = 2 * (j - from) + (inClass ? 1 : 0)
      if (failed?.[state] === 1) return fail()
      path.push(state)
      const c = src[j]!
      if (c === '\n') return fail()
      if (c === '\\') {
        j += 2
        continue
      }
      if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === '/' && !inClass) {
        j++
        while (j < to && /[a-z]/u.test(src[j]!)) j++
        return j
      }
      j++
    }
    return fail()
  }

  let i = from
  while (i < to) {
    const c = src[i]!
    if (c === '/' && src[i + 1] === '/') {
      const nl = indexWithin(src, '\n', i, to)
      const end = nl === -1 ? to : nl
      blanks.push([i, end])
      i = end
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = indexWithin(src, '*/', i + 2, to)
      const end = close === -1 ? to : close + 2
      blanks.push([i, end])
      i = end
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < to && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      j = Math.min(j, to)
      strings.push({ start: i, end: Math.min(j + 1, to), value: src.slice(i + 1, j), interpolated: false })
      literal(i + 1, j)
      i = Math.min(j + 1, to)
      prev = '"'
      continue
    }
    if (c === '`') {
      i = template(i, i + 1, false)
      continue
    }
    if (c === '/' && (prev === '' || REGEX_AFTER_PUNCT.has(prev) || REGEX_AFTER_WORD.has(prev))) {
      const end = scanRegex(i)
      if (end !== -1) {
        blanks.push([i + 1, end])
        i = end
        prev = '/re'
        continue
      }
    }
    if (/[A-Za-z_$]/u.test(c)) {
      let j = i + 1
      while (j < to && /[\w$]/u.test(src[j]!)) j++
      prev = src.slice(i, j)
      i = j
      continue
    }
    if (c === '{') depth += 1
    if (c === '}') {
      const frame = frames.at(-1)
      if (frame !== undefined && depth === 0) {
        // The `}` closing an interpolation: back into that template's text.
        frames.pop()
        depth = frame.depth
        i = template(frame.open, i + 1, true)
        continue
      }
      depth -= 1
    }
    if (!/\s/u.test(c)) prev = c
    i++
  }
  // Templates left open by an unterminated interpolation run to the body end.
  for (let frame = frames.pop(); frame !== undefined; frame = frames.pop()) {
    strings.push({ start: frame.open, end: to, value: src.slice(frame.open + 1, to), interpolated: true })
  }
  return { code: blank(src, blanks, from, to), strings, literals }
}

/**
 * Tokenise CSS far enough to find declarations and `@import`s: comments are
 * blanked, strings and parentheses are respected, and only segments that end
 * in `;` or `}` (never `{`) count as declarations, so selectors are skipped.
 * @param src - the fragment.
 * @param from - CSS start.
 * @param to - CSS end.
 * @returns declarations and import targets, with absolute offsets.
 */
function scanCss(src: string, from: number, to: number): { decls: Decl[]; imports: [number, string][] } {
  const commentBlanks: [number, number][] = []
  for (let i = from; i < to; i++) {
    const c = src[i]!
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < to && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      i = j
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = indexWithin(src, '*/', i + 2, to)
      const end = close === -1 ? to : close + 2
      commentBlanks.push([i, end])
      i = end - 1
    }
  }
  const css = blank(src.slice(from, to), commentBlanks.map(([a, b]) => [a - from, b - from] as const))
  const decls: Decl[] = []
  const imports: [number, string][] = []
  let segStart = 0
  let parens = 0
  const flush = (end: number, terminator: string): void => {
    const segment = css.slice(segStart, end)
    if (terminator === '{') return
    const lead = segment.length - segment.trimStart().length
    const body = segment.trim()
    if (body.length === 0) return
    const at = from + segStart + lead
    if (body.startsWith('@')) {
      const m = /^@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/iu.exec(body)
      if (m) imports.push([at + body.indexOf(m[1]!), m[1]!])
      return
    }
    const colon = body.indexOf(':')
    if (colon <= 0) return
    const prop = body.slice(0, colon).trim()
    if (!/^-{0,2}[a-z][\w-]*$/iu.test(prop)) return
    const rawValue = body.slice(colon + 1)
    const valueLead = rawValue.length - rawValue.trimStart().length
    decls.push({ prop: prop.toLowerCase(), propStart: at, value: rawValue.trim(), valueStart: at + colon + 1 + valueLead })
  }
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < css.length && css[j] !== c && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1
      i = j
      continue
    }
    if (c === '(') parens += 1
    else if (c === ')') parens = Math.max(0, parens - 1)
    else if (parens === 0 && (c === '{' || c === '}' || c === ';')) {
      flush(i, c)
      segStart = i + 1
    }
  }
  flush(css.length, '')
  return { decls, imports }
}

// ---------------------------------------------------------------------------
// Rules: structure

/** VZ003: `<!doctype>`, `<html>`, `<head>`, `<body>` in markup. */
function checkSkeleton(doc: Doc, sink: FindingSink): void {
  // `<\s*(?:\/\s*)?`, not `<\s*\/?\s*`: two adjacent `\s*` backtrack quadratically over a long blank run.
  for (const m of doc.markup.matchAll(/<!doctype\b|<\s*(?:\/\s*)?(?:html|head|body)\b/giu)) {
    sink.add('VZ003', m.index, m[0].length, JSON.stringify(m[0]))
  }
}

/** Escape sequences that only appear in markup when it was JSON-stringified. */
const ESCAPE_SEQ = /\\[nrt]/gu

/**
 * VZ004: string-escaped markup. Three precise signals: an attribute value
 * quoted with `\"`; two or more `\n`-style escapes standing between tags in
 * ordinary text (one alone could be prose about escapes); a script body that
 * opens with a literal `\n`, which is a syntax error in any script.
 */
function checkEscapedMarkup(doc: Doc, sink: FindingSink): void {
  const { src } = doc
  for (const tag of doc.tags) {
    for (const a of tag.attrs) {
      if (a.raw.startsWith('\\"') || a.raw.startsWith("\\'")) {
        sink.add('VZ004', a.valueStart, 2, `attribute quoted as ${JSON.stringify(src.slice(a.start, a.valueStart + 2))}`)
      }
    }
  }
  const hits: number[] = []
  for (const run of doc.text) {
    if (run.literal) continue
    const body = src.slice(run.start, run.end)
    // Escapes adjacent to a tag on either side, through whitespace or more escapes only.
    const head = /^(?:\\[nrt]|\s)*/u.exec(body)![0]
    let tailStart = body.length
    while (tailStart > head.length) {
      const c = body[tailStart - 1]!
      if (/\s/u.test(c)) tailStart -= 1
      else if ('nrt'.includes(c) && body[tailStart - 2] === '\\') tailStart -= 2
      else break
    }
    const tail = body.slice(Math.max(tailStart, head.length))
    for (const m of head.matchAll(ESCAPE_SEQ)) hits.push(run.start + m.index)
    for (const m of tail.matchAll(ESCAPE_SEQ)) hits.push(run.start + body.length - tail.length + m.index)
  }
  if (hits.length >= 2) sink.add('VZ004', hits[0]!, 2, 'literal \\n between tags')
  for (const block of doc.blocks) {
    if (block.kind !== 'script') continue
    const body = src.slice(block.start, block.end)
    const lead = body.length - body.replace(/^[ \t]+/u, '').length
    if (/^\\[nr]/u.test(body.slice(lead))) sink.add('VZ004', block.start + lead, 2, 'script body starts with a literal \\n')
  }
}

/** VZ008: `<form action>` / `method=post` / `formaction`. */
function checkForms(doc: Doc, sink: FindingSink): void {
  for (const tag of doc.tags) {
    if (tag.closing) continue
    if (tag.name === 'form') {
      const action = tag.attrs.find(a => a.name === 'action')
      const method = tag.attrs.find(a => a.name === 'method' && /post/iu.test(a.value ?? ''))
      const hit = action ?? method
      if (hit) sink.add('VZ008', hit.start, hit.name.length, `<form ${hit.name}=…>`)
    }
    const formAction = tag.attrs.find(a => a.name === 'formaction')
    if (formAction) sink.add('VZ008', formAction.start, formAction.name.length, `formaction on <${tag.name}>`)
  }
}

// ---------------------------------------------------------------------------
// Rules: external resources

/**
 * Tag attributes that load a resource when the element is parsed. A `Map`, not
 * an object literal: tag names come from the input, and `<constructor>` must
 * not find `Object.prototype.constructor`.
 */
const RESOURCE_ATTRS: ReadonlyMap<string, readonly string[]> = new Map([
  ['script', ['src']],
  ['link', ['href']],
  ['img', ['src']],
  ['video', ['src', 'poster']],
  ['audio', ['src']],
  ['source', ['src']],
  ['track', ['src']],
  ['input', ['src']],
  ['embed', ['src']],
  ['object', ['data']],
  ['image', ['href', 'xlink:href']],
  ['feimage', ['href', 'xlink:href']],
])

/** VZ005/VZ006/VZ105/VZ106 over tags, CSS `url()`/`@import`, and JS imports. */
function checkResources(doc: Doc, sink: FindingSink): void {
  for (const tag of doc.tags) {
    if (tag.closing) continue
    const names = RESOURCE_ATTRS.get(tag.name)
    if (names === undefined) continue
    if (tag.name === 'link' && /\b(?:preconnect|dns-prefetch)\b/iu.test(attr(tag, 'rel') ?? '')) continue
    for (const a of tag.attrs) {
      if (a.value !== undefined && names.includes(a.name)) reportUrl(sink, a.value, a.valueStart, 'markup', false)
    }
  }
  for (const decl of doc.decls) {
    for (const m of decl.value.matchAll(/(?<![\w-])url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))/giu)) {
      const url = m[1] ?? m[2] ?? m[3] ?? ''
      // Quoted forms consume the closing quote, so locate the URL after `url(`.
      reportUrl(sink, url, decl.valueStart + m.index + m[0].indexOf(url, 4), 'markup', false)
    }
  }
  for (const [offset, url] of [...doc.imports, ...doc.importMapUrls]) reportUrl(sink, url, offset, 'markup', false)

  const { js } = doc
  const specifierAt = (pos: number): JsString | undefined => stringAt(doc, pos)
  for (const m of js.matchAll(/(?<![\w$.])(?:import\s*\(|from(?=\s*["'`])|import(?=\s*["'`]))/gu)) {
    const s = specifierAt(m.index + m[0].length)
    if (s && !s.interpolated) reportUrl(sink, s.value, s.start + 1, 'module', doc.importMap)
  }
  for (const m of js.matchAll(/\.src\s*=(?!=)/gu)) {
    const s = specifierAt(m.index + m[0].length)
    // Only a warning: the receiver may be a plain object, not an element that loads it.
    if (s && !s.interpolated && /^(?:https?:)?\/\//iu.test(s.value)) reportUrl(sink, s.value, s.start + 1, 'markup', false, 'warn')
  }
}

/**
 * Classify one resource URL and report it when it cannot load or is unpinned.
 * @param sink - finding sink.
 * @param raw - the URL as written.
 * @param offset - offset of its first character.
 * @param context - `module` for JS import specifiers, where bare names are legal with an import map.
 * @param importMap - whether the fragment ships an import map.
 * @param cap - `warn` when it is not certain the URL is ever loaded.
 */
function reportUrl(
  sink: FindingSink,
  raw: string,
  offset: number,
  context: 'markup' | 'module',
  importMap: boolean,
  cap?: 'warn',
): void {
  const url = raw.trim()
  if (url.length === 0 || url.startsWith('#') || url.includes('${')) return
  const lead = raw.length - raw.trimStart().length
  const at = offset + lead
  if (/^(?:data|blob|about|javascript|mailto|tel):/iu.test(url)) return
  const scheme = /^([a-z][\w+.-]*):/iu.exec(url)?.[1]?.toLowerCase()
  if (scheme === undefined && !url.startsWith('//')) {
    if (context === 'module' && importMap) return
    sink.add('VZ106', at, url.length, JSON.stringify(url))
    return
  }
  let parsed: URL
  try {
    parsed = new URL(url.startsWith('//') ? `https:${url}` : url)
  } catch {
    return
  }
  const host = parsed.host.toLowerCase()
  if (!ALLOWED_HOSTS.includes(host)) {
    sink.add('VZ005', at, url.length, `${host || url} is not on the allowlist`, cap)
    return
  }
  if (scheme !== undefined && scheme !== 'https') {
    sink.add('VZ005', at, url.length, `${scheme}: URL; the card loads ${host} over https only`, cap)
    return
  }
  const version = cdnVersion(host, parsed.pathname)
  if (version.kind === 'none') sink.add('VZ006', at, url.length, `${version.what} has no version in ${JSON.stringify(url)}`, cap)
  else if (version.kind === 'tag') sink.add('VZ006', at, url.length, `${version.what}@${version.version} is a moving tag`, cap)
  else if (version.kind === 'loose') sink.add('VZ105', at, url.length, `${version.what}@${version.version}`)
}

type VersionKind = 'pinned' | 'loose' | 'tag' | 'none' | 'n/a'

/**
 * Read the package version out of a CDN path, for the CDNs that version by path.
 * @param host - allowlisted host.
 * @param pathname - URL path.
 * @returns how pinned it is, plus the package name and version for messages.
 */
function cdnVersion(host: string, pathname: string): { kind: VersionKind; what: string; version: string } {
  const segs = pathname.split('/').filter(s => s.length > 0).map(s => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  })
  const na = { kind: 'n/a' as const, what: '', version: '' }
  const pkg = (at: number): { kind: VersionKind; what: string; version: string } => {
    const first = segs[at]
    if (first === undefined) return na
    const scoped = first.startsWith('@')
    const nameSeg = scoped ? segs[at + 1] : first
    if (nameSeg === undefined) return na
    const idx = nameSeg.indexOf('@')
    const name = idx === -1 ? nameSeg : nameSeg.slice(0, idx)
    const what = scoped ? `${first}/${name}` : name
    return classifyVersion(what, idx === -1 ? undefined : nameSeg.slice(idx + 1))
  }
  if (host === 'cdn.jsdelivr.net') {
    if (segs[0] === 'npm') return pkg(1)
    if (segs[0] === 'gh' && segs[2] !== undefined) {
      const idx = segs[2].indexOf('@')
      return classifyVersion(`${segs[1]}/${idx === -1 ? segs[2] : segs[2].slice(0, idx)}`, idx === -1 ? undefined : segs[2].slice(idx + 1))
    }
    return na
  }
  if (host === 'unpkg.com') return pkg(0)
  if (host === 'esm.sh') {
    let at = 0
    if (/^(?:v\d+|stable)$/u.test(segs[0] ?? '')) at = 1
    const head = segs[at]
    if (head === undefined || ['gh', 'jsr', 'pr', 'run', 'tsx', 'x'].includes(head)) return na
    if (head.startsWith('*')) segs[at] = head.slice(1)
    return pkg(at)
  }
  if (host === 'cdnjs.cloudflare.com') {
    if (segs[0] !== 'ajax' || segs[1] !== 'libs' || segs[2] === undefined) return na
    const version = segs[3]
    if (version === undefined || segs.length < 5 || !/^\d/u.test(version)) return { kind: 'none', what: segs[2], version: '' }
    return classifyVersion(segs[2], version)
  }
  return na
}

/** Exact semver, optionally with a prerelease or build suffix. */
const EXACT_VERSION = /^v?\d+\.\d+\.\d+(?:[-+][\w.+-]*)?$/u

function classifyVersion(what: string, version: string | undefined): { kind: VersionKind; what: string; version: string } {
  if (version === undefined || version.length === 0) return { kind: 'none', what, version: '' }
  if (EXACT_VERSION.test(version)) return { kind: 'pinned', what, version }
  if (/^[\^~>=<]*v?\d/u.test(version)) return { kind: 'loose', what, version }
  return { kind: 'tag', what, version }
}

// ---------------------------------------------------------------------------
// Rules: scripts

/** The string literal starting at the first non-space character from `pos`. */
function stringAt(doc: Doc, pos: number): JsString | undefined {
  let i = pos
  while (i < doc.src.length && /\s/u.test(doc.src[i]!)) i++
  return doc.strings.get(i)
}

/** The first non-space character at or after `pos`. */
function nextChar(src: string, pos: number): string {
  let i = pos
  while (i < src.length && /\s/u.test(src[i]!)) i++
  return src[i] ?? ''
}

/** VZ007, VZ009 (JS side), VZ010, VZ104, and colour-bearing JS style writes. */
function checkScripts(doc: Doc, sink: FindingSink): void {
  const { js, src } = doc
  checkGlobalApis(doc, sink)
  for (const m of js.matchAll(/\.\s*style\s*\.\s*colorScheme\s*=(?!=)/gu)) sink.add('VZ009', m.index, m[0].length, 'style.colorScheme')

  for (const m of js.matchAll(/\bChart\s*\.\s*defaults\s*\.\s*font\s*\.\s*family\s*=(?!=)/gu)) {
    const s = stringAt(doc, m.index + m[0].length)
    // Length first: an interpolated template's value spans everything nested in it.
    if (s && !s.interpolated && s.value.length <= 32 && s.value.trim().toLowerCase() === 'inherit') sink.add('VZ104', m.index, s.end - m.index)
  }

  // Colour literals written as styles from script.
  for (const m of js.matchAll(/\.\s*style\s*\.\s*([a-zA-Z]+)\s*=(?!=)/gu)) {
    const s = stringAt(doc, m.index + m[0].length)
    if (s && !s.interpolated) checkColorValue(sink, kebab(m[1]!), s.value, s.start + 1)
  }
  for (const m of js.matchAll(/\.\s*(setProperty|setAttribute|attr|style)\s*\(/gu)) {
    const name = stringAt(doc, m.index + m[0].length)
    if (!name || name.interpolated || nextChar(src, name.end) !== ',') continue
    const value = stringAt(doc, src.indexOf(',', name.end) + 1)
    if (!value || value.interpolated) continue
    const prop = name.value.trim().toLowerCase()
    // A `color-scheme` attribute does nothing; only the style forms flip the scheme for certain.
    const attribute = m[1] === 'setAttribute' || m[1] === 'attr'
    if (prop === 'color-scheme') sink.add('VZ009', name.start, name.end - name.start, `${JSON.stringify(name.value)} set from script`, attribute ? 'warn' : undefined)
    else if (prop === 'style') checkInlineCss(sink, src, value.start + 1, value.value.length)
    else checkColorValue(sink, prop, value.value, value.start + 1)
  }
  for (const m of js.matchAll(/\b(\w*(?:Background|Border)Color|backgroundColor|borderColor|fillStyle|strokeStyle|shadowColor)\s*[:=](?!=)/gu)) {
    const s = stringAt(doc, m.index + m[0].length)
    if (s && !s.interpolated) checkColorValue(sink, 'color', s.value, s.start + 1, m[1])
  }
  // Markup built in strings: presentation attributes and style attributes.
  // Over literal runs, which never overlap, so nested templates are scanned once.
  for (const [at, text] of doc.literals) {
    for (const m of text.matchAll(/(?<![\w-])(fill|stroke|stop-color|flood-color|lighting-color|color|bgcolor)\s*=\s*\\?["']([^"'\\]+)/giu)) {
      checkColorValue(sink, m[1]!.toLowerCase(), m[2]!, at + m.index + m[0].length - m[2]!.length)
    }
    for (const m of text.matchAll(/(?<![\w-])style\s*=\s*\\?["']([^"'\\]+)/giu)) {
      // A warning only: the string may be text, not markup that is ever inserted.
      checkInlineCss(sink, src, at + m.index + m[0].length - m[1]!.length, m[1]!.length, 'warn')
    }
  }
}

// ---------------------------------------------------------------------------
// Rules: global APIs reached from script
//
// Without a parser, a script reference is read from its neighbours: what
// precedes the name (`.`, a receiver, `new`, `function`) and what follows it
// (`(`, `=`, a `)` then `{`). A finding is an error only when that reading is
// certain — the bare global or one literal `window.`/`self.`/`globalThis.`
// at expression start, a plain call shape, and no binding of the name anywhere
// in the fragment. Every other reading that may still be the network API is a
// warning with the same code. Every helper is index-based and walks only the
// blanks and identifier next to one name, so the stage stays linear.

/** Receivers through which a global API is still the global one. */
const GLOBAL_RECEIVERS = new Set(['window', 'self', 'globalThis'])

/** Network constructors that open a connection when constructed. */
const NETWORK_CONSTRUCTORS = /(?<![\w$])(?:XMLHttpRequest|WebSocket|EventSource)(?![\w$])/gu

/** Every name whose rebinding changes what a global API reference means. */
const WATCHED_NAMES = /(?<![\w$])(?:fetch|XMLHttpRequest|WebSocket|EventSource|navigator|sendBeacon|document|currentScript|window|self|globalThis)(?![\w$])/gu

/** Keywords after which a name is read as a value, never declared. */
const VALUE_KEYWORDS = new Set(['new', 'typeof', 'instanceof', 'await', 'void', 'return', 'delete', 'throw', 'in', 'of', 'case', 'yield'])

/** Operators after which a name is read as a value, never declared. */
const VALUE_OPERATORS = new Set([...'=!+-*/%&|^~<>?:'])

/** Links of a property chain walked back to find its `new`, at most. */
const MAX_CHAIN_LINKS = 16

/** `/\s/u` on one character, with the ASCII cases decided without a regex. */
function isSpace(c: string | undefined): boolean {
  if (c === undefined) return false
  const code = c.charCodeAt(0)
  if (code < 0x80) return code === 0x20 || (code >= 0x09 && code <= 0x0d)
  return /\s/u.test(c)
}

/** `/[\w$]/u` on one character. */
function isWordChar(c: string | undefined): boolean {
  if (c === undefined) return false
  const code = c.charCodeAt(0)
  return (code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a) || (code >= 0x30 && code <= 0x39) || code === 0x5f || code === 0x24
}

/** Index of the last non-space character at or before `i`, or -1. */
function skipBack(js: string, i: number): number {
  let at = i
  while (at >= 0 && isSpace(js[at])) at--
  return at
}

/** Index of the first non-space character at or after `i`. */
function skipForward(js: string, i: number): number {
  let at = i
  while (at < js.length && isSpace(js[at])) at++
  return at
}

/** The identifier ending just before `index`, through blanks: [name, offset], name '' when there is none. */
function wordBefore(js: string, index: number): readonly [string, number] {
  let i = skipBack(js, index - 1)
  const end = i + 1
  while (i >= 0 && isWordChar(js[i])) i--
  return [js.slice(i + 1, end), i + 1]
}

/**
 * The receiver of the name at `index`: `x` in `x.name` or `x?.name`.
 * @returns undefined when no `.` precedes the name (a spread `...` is not
 * one); a receiver named '' when it is not an identifier, e.g. `f().name`.
 */
function receiverOf(js: string, index: number): { name: string; index: number } | undefined {
  let i = skipBack(js, index - 1)
  if (js[i] !== '.' || js[i - 1] === '.') return undefined
  i -= js[i - 1] === '?' ? 2 : 1
  const [name, at] = wordBefore(js, i + 1)
  return { name, index: at }
}

/**
 * How a global name at `index` is reached.
 * - `direct`: bare, nothing before it.
 * - `global`: through `window.`/`self.`/`globalThis.` at expression start.
 * - `chain`: through one of those receivers further down a property chain.
 * - `member`: a property of anything else, the fragment's own object.
 * @returns the kind, where the reference starts, and the global receiver used.
 */
function reach(js: string, index: number): { kind: 'direct' | 'global' | 'chain' | 'member'; start: number; via: string } {
  const r = receiverOf(js, index)
  if (r === undefined) return { kind: 'direct', start: index, via: '' }
  if (!GLOBAL_RECEIVERS.has(r.name)) return { kind: 'member', start: r.index, via: r.name }
  return { kind: receiverOf(js, r.index) === undefined ? 'global' : 'chain', start: r.index, via: r.name }
}

/** Start of the property chain ending in the identifier at `index`, or undefined past {@link MAX_CHAIN_LINKS} or a non-identifier link. */
function chainStart(js: string, index: number): number | undefined {
  let at = index
  for (let links = 0; links < MAX_CHAIN_LINKS; links++) {
    const r = receiverOf(js, at)
    if (r === undefined) return at
    if (r.name === '') return undefined
    at = r.index
  }
  return undefined
}

/**
 * Names the fragment may bind or replace, so a reference to them may not be
 * the global. One pass over every watched name: a bare name is read as a
 * binding unless its neighbours make it a use — a call or member access, a
 * construction, or a value after an operator or keyword. Destructuring,
 * parameters, and arguments look alike without a parser, so all of them count.
 * @param js - executable script code.
 * @returns names bound in the fragment, and global properties it assigns.
 */
function boundNames(js: string): { bound: ReadonlySet<string>; assigned: ReadonlySet<string> } {
  const bound = new Set<string>()
  const assigned = new Set<string>()
  for (const m of js.matchAll(WATCHED_NAMES)) {
    const name = m[0]
    const next = skipForward(js, m.index + name.length)
    const c = js[next]
    const assignment = c === '=' && js[next + 1] !== '=' && js[next + 1] !== '>'
    const r = receiverOf(js, m.index)
    if (r !== undefined) {
      // A property: it replaces the global only when assigned on a global object.
      if (assignment && (GLOBAL_RECEIVERS.has(r.name) || r.name === 'navigator' || r.name === 'document')) assigned.add(name)
      continue
    }
    // An assignment, or an arrow parameter `name =>` whatever precedes it.
    if (assignment || (c === '=' && js[next + 1] === '>')) {
      bound.add(name)
      continue
    }
    if (c === '(') {
      // A call or a method definition, unless it is `function name(` or `function* name(`.
      let i = skipBack(js, m.index - 1)
      if (js[i] === '*') i = skipBack(js, i - 1)
      if (wordBefore(js, i + 1)[0] === 'function') bound.add(name)
      continue
    }
    if (c === '.' || c === '`' || (c === '?' && js[next + 1] === '.')) continue
    const [word] = wordBefore(js, m.index)
    if (word !== '' && VALUE_KEYWORDS.has(word)) continue
    if (word === '' && VALUE_OPERATORS.has(js[skipBack(js, m.index - 1)] ?? '')) continue
    bound.add(name)
  }
  return { bound, assigned }
}

/**
 * For every `(` in the executable script code, the offset of its matching `)`,
 * or -1 when it is never closed. One stack pass per script body.
 */
function parenPairs(doc: Doc): Int32Array {
  const close = new Int32Array(doc.js.length).fill(-1)
  const stack: number[] = []
  for (const [from, to] of doc.jsRanges) {
    stack.length = 0
    for (let i = from; i < to; i++) {
      const c = doc.js.charCodeAt(i)
      if (c === 0x28) stack.push(i)
      else if (c === 0x29) {
        const open = stack.pop()
        if (open !== undefined) close[open] = i
      }
    }
  }
  return close
}

/** VZ007 (network APIs) and VZ010 (`document.currentScript`). */
function checkGlobalApis(doc: Doc, sink: FindingSink): void {
  const { js, src } = doc
  if (!/fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|currentScript/u.test(js)) return
  const { bound, assigned } = boundNames(js)
  const blobUrls = /\bcreateObjectURL\b/u.test(js)
  let pairs: Int32Array | undefined

  /**
   * Why a reference reached as `how` may not be the global `name`, or
   * undefined when it certainly is; `parent` is the global object `name` is
   * read from (`navigator`, `document`), when it is not itself global.
   */
  const doubt = (how: ReturnType<typeof reach>, name: string, parent?: string): string | undefined => {
    if (how.kind === 'member' || how.kind === 'chain') return 'reached through a property chain, which may be a local object'
    if (how.kind === 'global' && bound.has(how.via)) return `the fragment binds its own ${how.via}`
    const own = parent ?? name
    if (how.kind === 'direct' && bound.has(own)) return `the fragment binds its own ${own}, which this may reach instead`
    if (assigned.has(name) || (parent !== undefined && assigned.has(parent))) return `the fragment replaces ${parent ?? name} on a global object`
    return undefined
  }
  const report = (code: 'VZ007' | 'VZ010', start: number, end: number, what: string | undefined, why: string | undefined): void => {
    const detail = why === undefined ? what : `${what === undefined ? '' : `${what}; `}not certain: ${why}`
    sink.add(code, start, end - start, detail, why === undefined ? undefined : 'warn')
  }

  for (const m of js.matchAll(/(?<![\w$])fetch(?![\w$])/gu)) {
    const open = skipForward(js, m.index + 5)
    if (js[open] !== '(') continue
    const how = reach(js, m.index)
    // `cache.fetch(...)` is the fragment's own method; `function fetch(` declares one.
    if (how.kind === 'member') continue
    if (how.kind === 'direct' && wordBefore(js, m.index)[0] === 'function') continue
    pairs ??= parenPairs(doc)
    const close = pairs[open]!
    let why = doubt(how, 'fetch')
    if (close === -1) why ??= 'the call is never closed, so it reads neither way'
    else {
      const after = skipForward(js, close + 1)
      if (js[after] === '{') {
        // `fetch(…) {` on one line can only be a method definition: a call
        // statement cannot run into a block without a line break between.
        if (!/[\n\r\u2028\u2029]/u.test(src.slice(close + 1, after))) continue
        why ??= 'a block follows on the next line, so this may be a method definition'
      }
    }
    const arg = stringAt(doc, open + 1)
    if (arg && /^(?:data|blob):/iu.test(arg.value)) continue
    if (!arg && blobUrls) continue
    report('VZ007', how.start, open + 1, 'fetch()', why)
  }

  for (const m of js.matchAll(NETWORK_CONSTRUCTORS)) {
    const how = reach(js, m.index)
    // `api.WebSocket` is the fragment's own; only a construction connects.
    if (how.kind === 'member') continue
    const start = how.kind === 'chain' ? chainStart(js, how.start) : how.start
    if (start === undefined) continue
    const [word, at] = wordBefore(js, start)
    if (word !== 'new') continue
    report('VZ007', at, m.index + m[0].length, m[0], doubt(how, m[0]))
  }

  for (const m of js.matchAll(/(?<![\w$])sendBeacon(?![\w$])/gu)) {
    const r = receiverOf(js, m.index)
    if (r?.name !== 'navigator') continue
    const open = skipForward(js, m.index + 10)
    if (js[open] !== '(') continue
    const how = reach(js, r.index)
    report('VZ007', how.start, open + 1, 'navigator.sendBeacon()', doubt(how, 'sendBeacon', 'navigator'))
  }

  for (const m of js.matchAll(/(?<![\w$])currentScript(?![\w$])/gu)) {
    const r = receiverOf(js, m.index)
    if (r?.name !== 'document') continue
    const how = reach(js, r.index)
    report('VZ010', how.start, m.index + m[0].length, undefined, doubt(how, 'currentScript', 'document'))
  }
}

/** camelCase style property to its CSS name. */
function kebab(name: string): string {
  return name.replaceAll(/[A-Z]/gu, c => `-${c.toLowerCase()}`)
}

/** Colour and color-scheme checks over a CSS declaration list embedded in a string. */
function checkInlineCss(sink: FindingSink, src: string, start: number, length: number, cap?: 'warn'): void {
  for (const decl of scanCss(src, start, start + length).decls) {
    if (decl.prop === 'color-scheme') sink.add('VZ009', decl.propStart, decl.prop.length, `color-scheme: ${decl.value}`, cap)
    else checkColorValue(sink, decl.prop, decl.value, decl.valueStart)
  }
}

// ---------------------------------------------------------------------------
// Rules: styles and colours

/** VZ009 (CSS side), `<meta name=color-scheme>`, and VZ101 over CSS and SVG attributes. */
function checkStyles(doc: Doc, sink: FindingSink): void {
  for (const decl of doc.decls) {
    if (decl.prop === 'color-scheme') sink.add('VZ009', decl.propStart, decl.prop.length, `color-scheme: ${decl.value}`)
    else checkColorValue(sink, decl.prop, decl.value, decl.valueStart)
  }
  for (const tag of doc.tags) {
    if (tag.closing) continue
    if (tag.name === 'meta' && (attr(tag, 'name') ?? '').trim().toLowerCase() === 'color-scheme') {
      sink.add('VZ009', tag.start, tag.end - tag.start, '<meta name="color-scheme">')
    }
    // A stop that is fully transparent carries no visible colour.
    if (tag.name === 'stop' && Number(attr(tag, 'stop-opacity') ?? '1') === 0) continue
    for (const a of tag.attrs) {
      if (a.value !== undefined && PRESENTATION_COLOR_ATTRS.has(a.name)) checkColorValue(sink, a.name, a.value, a.valueStart)
    }
  }
}

/** SVG presentation and legacy HTML attributes that take a colour. */
const PRESENTATION_COLOR_ATTRS = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color', 'bgcolor'])

/** Properties whose named-colour keywords are colours (elsewhere `white` may be `white-space`). */
const COLOR_PROPS = /^(?:-webkit-)?(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|stop-color|flood-color|lighting-color|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|scrollbar-color|text-fill-color|text-stroke(?:-color)?|text-emphasis(?:-color)?|bgcolor)$/u

/** Properties left alone: shadows and filters are theme-neutral depth cues. */
const SKIP_PROPS = /^(?:box-shadow|text-shadow|filter|backdrop-filter|-webkit-box-shadow|content|font-family|font)$/u

/** CSS colour functions whose arguments are literal channels. */
const COLOR_FNS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'])

/** Functions whose arguments are theme-aware or not colours at all. */
const SUPPRESSING_FNS = new Set(['var', 'light-dark', 'url', 'env', 'attr'])

/** CSS named colours (transparent and currentColor deliberately absent). */
const NAMED_COLORS = new Set((
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood '
  + 'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod '
  + 'darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon '
  + 'darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray '
  + 'dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green '
  + 'greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon '
  + 'lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon '
  + 'lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta '
  + 'maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen '
  + 'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive '
  + 'olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru '
  + 'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell '
  + 'sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise '
  + 'violet wheat white whitesmoke yellow yellowgreen'
).split(' '))

/**
 * VZ101 over one CSS value: hex literals, colour functions, and (for colour
 * properties) named colours, skipping anything nested in `var()` (fallbacks),
 * `light-dark()`, or `url()`, and fully transparent literals.
 * @param sink - finding sink.
 * @param prop - property or attribute name the value belongs to.
 * @param value - the raw value.
 * @param valueStart - offset of the value's first character.
 * @param label - name shown in the finding, when it differs from the CSS property.
 */
function checkColorValue(sink: FindingSink, prop: string, value: string, valueStart: number, label = prop): void {
  if (SKIP_PROPS.test(prop)) return
  const named = COLOR_PROPS.test(prop) || PRESENTATION_COLOR_ATTRS.has(prop)
  const stack: string[] = []
  // A running count, not stack.some(): deep nesting times many literals is quadratic.
  let suppressing = 0
  const suppressed = (): boolean => suppressing > 0
  const open = (fn: string): void => {
    stack.push(fn)
    if (SUPPRESSING_FNS.has(fn)) suppressing += 1
  }
  for (let i = 0; i < value.length;) {
    const c = value[i]!
    if (c === '"' || c === "'") {
      const close = value.indexOf(c, i + 1)
      i = close === -1 ? value.length : close + 1
      continue
    }
    if (c === ')') {
      const fn = stack.pop()
      if (fn !== undefined && SUPPRESSING_FNS.has(fn)) suppressing -= 1
      i++
      continue
    }
    if (c === '(') {
      open('')
      i++
      continue
    }
    if (c === '#') {
      const m = /^#([0-9a-f]+)(?![\w-])/iu.exec(value.slice(i, i + 10))
      const hex = m?.[1]
      if (hex && [3, 4, 6, 8].includes(hex.length)) {
        if (!suppressed() && !transparentHex(hex)) sink.add('VZ101', valueStart + i, hex.length + 1, `${label}: #${hex}`)
        i += hex.length + 1
        continue
      }
      i++
      continue
    }
    if (/[a-z_-]/iu.test(c) && (i === 0 || !/[\w-]/u.test(value[i - 1]!))) {
      let j = i + 1
      while (j < value.length && /[\w-]/u.test(value[j]!)) j++
      const word = value.slice(i, j).toLowerCase()
      if (value[j] === '(') {
        if (COLOR_FNS.has(word)) {
          const close = matchParen(value, j)
          const args = value.slice(j + 1, close)
          if (!suppressed() && !/\b(?:var|light-dark)\(|\bfrom\b/iu.test(args) && !zeroAlpha(args)) {
            sink.add('VZ101', valueStart + i, close + 1 - i, `${label}: ${value.slice(i, close + 1)}`)
          }
          i = close + 1
          continue
        }
        open(word)
        i = j + 1
        continue
      }
      if (named && !suppressed() && NAMED_COLORS.has(word)) sink.add('VZ101', valueStart + i, word.length, `${label}: ${word}`)
      i = j
      continue
    }
    i++
  }
}

/** Index of the `)` closing the `(` at `open`, or the end of the string. */
function matchParen(value: string, open: number): number {
  let depth = 0
  for (let i = open; i < value.length; i++) {
    if (value[i] === '(') depth += 1
    else if (value[i] === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return value.length - 1
}

/** `#rgba` / `#rrggbbaa` with zero alpha. */
function transparentHex(hex: string): boolean {
  return (hex.length === 4 && hex[3] === '0') || (hex.length === 8 && hex.slice(6) === '00')
}

/** Colour-function arguments whose alpha channel is zero. */
function zeroAlpha(args: string): boolean {
  const slash = args.split('/')
  const alpha = slash.length > 1 ? slash[1]! : args.split(',')[3]
  if (alpha === undefined) return false
  const n = Number.parseFloat(alpha)
  return n === 0
}

// ---------------------------------------------------------------------------
// Rules: ids

/** VZ102 (lookups of absent ids) and VZ103 (no id anywhere for the root). */
function checkIds(doc: Doc, sink: FindingSink): void {
  const { src, js } = doc
  const markupIds = new Set<string>()
  for (const tag of doc.tags) {
    if (tag.closing) continue
    const id = attr(tag, 'id')
    if (id !== undefined && id.trim().length > 0) markupIds.add(id.trim())
  }
  const known = new Set(markupIds)
  for (const m of src.matchAll(/(?<![\w-])id\s*=\s*\\?["'`]([^"'`\\\s]+)/gu)) known.add(m[1]!)
  for (const m of src.matchAll(/["']id["']\s*,\s*["']([^"']+)["']/gu)) known.add(m[1]!)

  const inlineJs = doc.blocks.find(b => b.kind === 'script' && js.slice(b.start, b.end).trim().length > 0)
  if (inlineJs && known.size === 0) sink.add('VZ103', inlineJs.tag.start, inlineJs.tag.end - inlineJs.tag.start)

  // Ids built at run time make every static lookup unverifiable: skip the rule.
  // Over literal runs: a run ends where an interpolation starts, so `$` covers `id="${…}`.
  const builtIds = doc.literals.some(([, text]) => /(?<![\w-])id\s*=\s*\\?["']?[\w:.-]*(?:$|\$\{)/u.test(text))
    || [...js.matchAll(/\.\s*id\s*=(?!=)/gu)].some(m => !doc.strings.has(skipSpace(src, m.index + m[0].length)))
    || /\.(?:setAttribute|attr)\(\s*["']id["']\s*,(?!\s*["'])/u.test(src)
  if (builtIds) return

  const lookups: { id: string; s: JsString }[] = []
  for (const m of js.matchAll(/\bgetElementById\s*\(/gu)) {
    const s = stringAt(doc, m.index + m[0].length)
    if (!s || s.interpolated || nextChar(src, s.end) !== ')' || /\\/u.test(s.value)) continue
    lookups.push({ id: s.value.trim(), s })
  }
  for (const m of js.matchAll(/\bquerySelector(?:All)?\s*\(/gu)) {
    const s = stringAt(doc, m.index + m[0].length)
    if (!s || s.interpolated || nextChar(src, s.end) !== ')' || /[\\,]/u.test(s.value)) continue
    const id = /^\s*#([A-Za-z_][\w-]*)(?=$|[\s.:[>+~])/u.exec(s.value)?.[1]
    if (id !== undefined) lookups.push({ id, s })
  }
  const lookupCount = new Map<string, number>()
  for (const { id } of lookups) lookupCount.set(id, (lookupCount.get(id) ?? 0) + 1)
  const occurrences = wordCounter(src)
  for (const { id, s } of lookups) {
    if (id.length === 0 || known.has(id)) continue
    // The id text appearing anywhere else means it is assembled somewhere we cannot follow.
    if (occurrences(id) > (lookupCount.get(id) ?? 0)) continue
    sink.add('VZ102', s.start, s.end - s.start, `#${id}`)
  }
}

/** Distinct non-identifier ids (`a.b`, `x y`) counted by a full search before the rule gives up on the rest. */
const MAX_FREE_FORM_ID_SEARCHES = 16

/**
 * Count {@link countWord} occurrences without a full-text search per lookup:
 * an id made only of `[\w-]` occurs exactly where a maximal `[\w-]+` run
 * equals it, so one tokenising pass answers every such id. Other ids fall back
 * to a search, memoised and capped; past the cap they count as present, which
 * only silences the VZ102 warning.
 * @param src - the fragment.
 * @returns occurrences of an id as a whole word.
 */
function wordCounter(src: string): (word: string) => number {
  let runs: Map<string, number> | undefined
  const searched = new Map<string, number>()
  return (word) => {
    if (/^[\w-]+$/u.test(word)) {
      if (runs === undefined) {
        runs = new Map()
        for (const m of src.matchAll(/[\w-]+/gu)) runs.set(m[0], (runs.get(m[0]) ?? 0) + 1)
      }
      return runs.get(word) ?? 0
    }
    let count = searched.get(word)
    if (count === undefined) {
      count = searched.size < MAX_FREE_FORM_ID_SEARCHES ? countWord(src, word) : Number.POSITIVE_INFINITY
      searched.set(word, count)
    }
    return count
  }
}

function skipSpace(src: string, pos: number): number {
  let i = pos
  while (i < src.length && /\s/u.test(src[i]!)) i++
  return i
}

/** Occurrences of `word` not embedded in a longer identifier-like run. */
function countWord(src: string, word: string): number {
  let count = 0
  for (let at = src.indexOf(word); at !== -1; at = src.indexOf(word, at + word.length)) {
    const before = src[at - 1] ?? ''
    const after = src[at + word.length] ?? ''
    if (!/[\w-]/u.test(before) && !/[\w-]/u.test(after)) count += 1
  }
  return count
}
