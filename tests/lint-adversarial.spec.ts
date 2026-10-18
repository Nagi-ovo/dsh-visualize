import { afterEach, describe, expect, it, vi } from 'vitest'
import { lintFragment } from '../src/lint.ts'
import { FragmentLintGate } from '../src/lint-gate.ts'

/** The tool's own ceiling: fragments up to this size are scanned. */
const MAX = 1_000_000

/**
 * Wall-clock budget for one lint of a near-limit input on the reference
 * machine; the host event loop blocks for this long. Slower machines (CI
 * runners) scale it by how much slower they lint a realistic baseline, so
 * the test still catches the quadratic blow-ups it exists for (those run
 * 10-100x over) without flaking on hardware.
 */
const BUDGET_MS = 200

/** Median ms to lint {@link calibrationFragment} on the reference machine (Apple M-series, Node 26). */
const REFERENCE_CALIBRATION_MS = 5

/** `head + unit * k + tail`, with k as large as keeps it just under the size limit (ASCII, so chars are bytes). */
function fill(head: string, unit: string, tail = ''): string {
  const k = Math.floor((MAX - 1_000 - head.length - tail.length) / unit.length)
  return head + unit.repeat(k) + tail
}

/** A realistic small card, repeated: the non-adversarial baseline. */
const CARD = `<div id="lab-%">
  <style>#lab-% .bar { background: var(--viz-series-1); color: var(--foreground); padding: 4px 8px; }</style>
  <div class="bar" id="lab-%-bar">p99 480ms</div>
</div>
<script>
  (function () {
    var root = document.getElementById('lab-%');
    var rows = [1, 2, 3].map(function (n) { return n / 2; });
    root.querySelector('#lab-%-bar').textContent = \`rows: \${rows.length}\`;
  })();
</script>
`

/** Inputs near the size limit aimed at every scanner and rule. */
const ADVERSARIAL: Record<string, string> = {
  'realistic cards': Array.from({ length: Math.floor(MAX / (CARD.length + 30)) },(_, i) => CARD.replaceAll('%', String(i))).join(''),
  'regex restart on /[ (Codex repro, scaled)': fill('<script>', '/['),
  'regex restart after =': fill('<script>x', '=/a'),
  'unterminated regex class': fill('<script>x = /[', 'a'),
  'unterminated double-quoted string': fill('<script>"', 'a'),
  'unterminated template literal': fill('<script>`', 'a'),
  'unterminated block comment': fill('<script>/*', 'a'),
  'unterminated html comment': fill('<!--', 'a'),
  'deep template nesting': fill('<script>', '`${'),
  'deep template nesting behind Chart.defaults': fill('<script>', 'Chart.defaults.font.family=`${'),
  'deep brace and paren nesting': fill('<script>', '{(['),
  'many script blocks with unterminated comments': fill('', '<script>/*</script>'),
  'many script blocks with line comments on one line': fill('', '<script>//</script>'),
  'many style attributes with unterminated comments': fill('', '<p style="/*">'),
  'many <': fill('', '<'),
  'many <a': fill('', '<a'),
  'many </': fill('', '</'),
  'many <!': fill('', '<!'),
  'many unterminated attribute quotes': fill('', '<a b="'),
  '< then a long blank run': fill('<', ' ', 'x'),
  'tag with a long blank run': fill('<a', ' ', '>'),
  'self-closing check on a long pre tag': fill('<pre', ' /', '>'),
  'long single line of hex colours': fill('', '<p style="color:#fff">'),
  'many CSS custom properties (Codex repro)': fill('<style>a{', '--x:0;', '}</style>'),
  'many CSS colour declarations': fill('<style>a{', 'color:red;', '}</style>'),
  'deep CSS nesting with colours': `<style>a{color:${'f('.repeat(150_000)}${'#fff '.repeat(130_000)}}</style>`,
  'many url(': fill('<style>a{b:', 'url(', '}</style>'),
  'many unbalanced rgb(': fill('<style>a{color:', 'rgb(', '}</style>'),
  'many fetch( calls': fill('<div id="a"></div><script>', 'fetch(1);'),
  'nested fetch(': fill('<div id="a"></div><script>', 'fetch('),
  'many method-like fetch() {': fill('<div id="a"></div><script>', 'fetch( '),
  'many member fetches behind blanks': fill('<div id="a"></div><script>', 'o /**/ . fetch(1);'),
  'many absent getElementById ids': (() => {
    let out = '<div id="a"></div><script>'
    for (let i = 0; out.length < MAX - 1_000; i++) out += `getElementById("m${i}");`
    return out
  })(),
  'many absent free-form ids': (() => {
    let out = '<div id="a"></div><script>'
    for (let i = 0; out.length < MAX - 1_000; i++) out += `getElementById("m.${i}");`
    return out
  })(),
  'many "id" pairs': fill('<script>', '"id","'),
  'many imports behind blanks': fill('<script type="module">', 'import /**/ '),
  'many from tokens': fill('<script>', 'from '),
  'many literal \\n between tags': fill('<p>', '\\n'),
  'many escaped attributes': fill('', '<a href=\\"x\\">'),
  'many style.setProperty': fill('<script>', 'e.style.setProperty("color", "red");'),
  'many markup strings with fill': fill('<script>', '"<rect fill=\'#fff\'>";'),
  'long identifier': fill('<script>', 'a'),
  'long BorderColor identifier': fill('<script>', 'aBorderColor'),
  // Codex repro: two adjacent \s* around an optional `*` backtracked quadratically over one blank run.
  'function, 50k blanks, a declaration, then fetch( (Codex repro)': (() => {
    const head = `<div id="a"></div><script>function${' '.repeat(50_000)}f(){} fetch("/x");`
    return head + ' '.repeat(990_000 - head.length)
  })(),
  'function then a blank run to the end': fill('<div id="a"></div><script>fetch("/x");function', ' ', 'f(){}'),
  'function * with blank runs on both sides': `<div id="a"></div><script>fetch("/x");function${' '.repeat(450_000)}*${' '.repeat(450_000)}f(){}`,
  'class then a blank run': fill('<div id="a"></div><script>new WebSocket("/x");class', ' ', 'WebSocketX{}'),
  'const then a blank run': fill('<div id="a"></div><script>fetch("/x");const', ' ', 'fetchX=1'),
  'many declarations behind blank runs': fill('<div id="a"></div><script>fetch("/x");', `function${' '.repeat(500)}`),
  'new then a blank run': fill('<div id="a"></div><script>new', ' ', 'WebSocket("/x")'),
  'window . fetch ( across blank runs': `<div id="a"></div><script>window${' '.repeat(300_000)}.${' '.repeat(300_000)}fetch${' '.repeat(300_000)}("/x")`,
  'many bare fetch references': fill('<div id="a"></div><script>', 'fetch;'),
  'many method definitions with long parameter lists': fill('<div id="a"></div><script>', `({fetch(${'a,'.repeat(400)}){}});`),
  'many calls followed by a block on the next line': fill('<div id="a"></div><script>', 'fetch(1)\n{}'),
  'long global-receiver chain before WebSocket': fill('<div id="a"></div><script>new x', '.window', '.WebSocket()'),
  'many qualified network constructors': fill('<div id="a"></div><script>', 'new a.window.WebSocket.window.WebSocket;'),
  'many sendBeacon chains': fill('<div id="a"></div><script>', 'a.navigator.sendBeacon(1);'),
  'many currentScript reads': fill('<div id="a"></div><script>', 'document.currentScript;'),
  'non-ASCII text': '<p>' + '中'.repeat(Math.floor((MAX - 1_000) / 3)) + '</p>',
}

/**
 * Every regex site in the linter, fed its keyword, then a blank run to the
 * size limit, then a near miss: the shape that made `\s*\*?\s*` quadratic.
 * [head, tail] around the run.
 */
const BLANK_RUN_SITES: Record<string, readonly [string, string]> = {
  'skeleton tag': ['<', '/ htm'],
  'closing tag': ['</a', 'b'],
  'declaration tag': ['<!', 'x'],
  'attribute before =': ['<a b', '= c'],
  'self-closing pre': ['<pre /', 'x>'],
  'escaped markup': ['<p>\\n', '\\n x'],
  'script body lead': ['<script>', '\\n'],
  'css @import': ['<style>@import', 'url( x'],
  'css url(': ['<style>a{b:url(', 'x'],
  'css property': ['<style>a{color', ':red}'],
  'css colour fn': ['<style>a{color:rgb(', '1'],
  'js import(': ['<script type="module">import', '( x'],
  'js from': ['<script type="module">from', 'x'],
  'js .src =': ['<div id="a"></div><script>a.src', '= x'],
  'js function declaration': ['<div id="a"></div><script>fetch(1);function', '*  fetchX(){}'],
  'js window . fetch': ['<div id="a"></div><script>window', '. x'],
  'js fetch (': ['<div id="a"></div><script>fetch', '(1)'],
  'js fetch ( ) {': ['<div id="a"></div><script>fetch(1)', '\n{}'],
  'js new': ['<div id="a"></div><script>new', 'WebSocketX'],
  'js navigator . sendBeacon': ['<div id="a"></div><script>navigator.', 'sendBeacon (1)'],
  'js document . currentScript': ['<div id="a"></div><script>document', '. currentScriptX'],
  'js style . colorScheme': ['<div id="a"></div><script>a.style.colorScheme', '== 1'],
  'js Chart.defaults': ['<div id="a"></div><script>Chart.defaults.font.family', '== 1'],
  'js style . prop =': ['<div id="a"></div><script>a.style.color', '== 1'],
  'js setProperty(': ['<div id="a"></div><script>a.style.setProperty(', '"color"   x'],
  'js colour key': ['<div id="a"></div><script>fillStyle', '== 1'],
  'js markup fill= in a string': ['<div id="a"></div><script>"fill=', '\''],
  'js markup style= in a string': ['<div id="a"></div><script>"style', '= x'],
  'id attribute': ['<div id', '= x>'],
  '"id" pair': ['<script>"id"', ', x'],
  '.id =': ['<script>a.id', '== 1'],
  'setAttribute("id",': ['<script>a.setAttribute("id",', 'x)'],
  'getElementById(': ['<div id="a"></div><script>getElementById(', '"b")'],
  'querySelector(': ['<div id="a"></div><script>querySelector(', '"#b")'],
}
for (const [name, [head, tail]] of Object.entries(BLANK_RUN_SITES)) {
  ADVERSARIAL[`blank run at a regex site: ${name}`] = head + ' '.repeat(MAX - 1_000 - head.length - tail.length) + tail
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** A realistic ~170 KB fragment whose lint time measures this machine's speed. */
const calibrationFragment = Array.from({ length: 400 }, (_, i) => CARD.replaceAll('%', String(i))).join('')

/**
 * The budget scaled to this machine: the reference budget times how much
 * slower than the reference machine it lints the calibration fragment
 * (never below the reference budget).
 */
function machineBudget(): number {
  const runs: number[] = []
  for (let i = 0; i < 7; i++) {
    const started = performance.now()
    lintFragment(calibrationFragment, MAX)
    runs.push(performance.now() - started)
  }
  const median = runs.sort((a, b) => a - b)[3]!
  return BUDGET_MS * Math.max(1, median / REFERENCE_CALIBRATION_MS)
}

// Warm the JIT so neither the calibration nor the first case is charged for compilation.
lintFragment(CARD.replaceAll('%', 'w').repeat(50), MAX)
const budget = machineBudget()

describe('lintFragment on adversarial input', () => {
  const timings: [string, number][] = []

  for (const [name, fragment] of Object.entries(ADVERSARIAL)) {
    it(`stays under the machine budget (${BUDGET_MS} ms on the reference machine) and never throws: ${name}`, () => {
      expect(new TextEncoder().encode(fragment).length).toBeLessThanOrEqual(MAX)
      const started = performance.now()
      const report = lintFragment(fragment, MAX)
      const elapsed = performance.now() - started
      timings.push([name, elapsed])
      expect(report.skipped).toBeUndefined()
      expect(elapsed).toBeLessThan(budget)
    })
  }

  it('reports the slowest case', () => {
    const slowest = [...timings].sort((a, b) => b[1] - a[1]).slice(0, 5)
    console.log(`slowest lint cases (ms): ${slowest.map(([name, ms]) => `${name}=${ms.toFixed(1)}`).join(', ')}`)
    expect(timings.length).toBe(Object.keys(ADVERSARIAL).length)
  })

  it('keeps the gate linear when a card carries many errors', () => {
    const fragment = ADVERSARIAL['many fetch( calls']!
    const started = performance.now()
    expect(() => new FragmentLintGate().check({ fragment, maxBytes: MAX, sessionId: 's' })).toThrow(/VZ007/u)
    expect(performance.now() - started).toBeLessThan(2 * budget)
  })
})

describe('lintFragment never throws', () => {
  it('lints 140k CSS declarations without a RangeError (Codex repro)', () => {
    const report = lintFragment(`<style>a{${'--x:0;'.repeat(140_000)}}</style>`, MAX)
    expect(report.skipped).toBeUndefined()
    expect(report.findings.filter(f => f.severity === 'error')).toEqual([])
  })

  it('keeps the regex-literal scan linear (Codex repro: 64000 /[ in 128 KB)', () => {
    const started = performance.now()
    lintFragment(`<script>${'/['.repeat(64_000)}</script>`, MAX)
    expect(performance.now() - started).toBeLessThan(budget)
  })

  it('tokenises 300k nested template literals without recursion', () => {
    const report = lintFragment(`<div id="a"></div><script>${'`${'.repeat(300_000)}</script>`, MAX)
    expect(report.skipped).toBeUndefined()
  })

  it('fails open: a stage that throws is skipped, the others still report', () => {
    const real = String.prototype.matchAll
    let calls = 0
    vi.spyOn(String.prototype, 'matchAll').mockImplementation(function (this: string, regexp: RegExp) {
      // The first matchAll is the skeleton rule's; break only that one.
      if (calls++ === 0) throw new Error('boom')
      return real.call(this, regexp)
    } as typeof String.prototype.matchAll)
    const report = lintFragment('<!doctype html><div id="a"></div><script>fetch("/x")</script>', MAX)
    expect(report.skipped).toEqual(['skeleton: Error: boom'])
    expect(report.findings.map(f => `${f.code} ${f.severity}`)).toEqual(['VZ199 warn', 'VZ007 error'])
    // Never silent: the skipped stage is a visible warning.
    expect(report.findings[0]!.message).toContain('skeleton (Error: boom)')
  })

  it('lets a valid card through the gate when a stage throws, with a warning that says so', () => {
    vi.spyOn(String.prototype, 'matchAll').mockImplementation(() => {
      throw new Error('boom')
    })
    const pass = new FragmentLintGate().check({ fragment: '<p id="a">ok</p>', maxBytes: MAX, sessionId: 's' })
    expect(pass.warnings).toContain('VZ199 warn at 1:1')
    expect(pass.warnings).toContain('skeleton (Error: boom)')
  })
})
