import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { imageSources, lintFragment, type LintCode } from '../src/lint.ts'

const MAX = 1_000_000

/** Codes found in a fragment, in document order. */
function codes(fragment: string, maxBytes = MAX): LintCode[] {
  return lintFragment(fragment, maxBytes).findings.map(f => f.code)
}

/** `CODE severity` of every finding, in document order. */
function severities(fragment: string): string[] {
  return lintFragment(fragment, MAX).findings.map(f => `${f.code} ${f.severity}`)
}

/** The single finding of one code, asserting there is exactly one. */
function only(fragment: string, code: LintCode) {
  const hits = lintFragment(fragment, MAX).findings.filter(f => f.code === code)
  expect(hits).toHaveLength(1)
  return hits[0]!
}

/** A small, clean card: root id, theme variables, pinned CDN script. */
const CLEAN = `<div id="lab">
  <style>#lab .bar { background: var(--viz-series-1); color: var(--foreground); }</style>
  <div class="bar" id="lab-bar"></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"></script>
<script>
  var root = document.getElementById('lab');
  root.querySelector('#lab-bar').textContent = 'ok';
</script>`

describe('lintFragment', () => {
  it('finds nothing in a clean card', () => {
    expect(codes(CLEAN)).toEqual([])
  })

  it('reports line, column, and an excerpt of the offending line', () => {
    const f = only('<div id="a">\n  <p>x</p>\n</div>\n<script>\n  fetch("/api/rows")\n</script>', 'VZ007')
    expect([f.line, f.column]).toEqual([5, 3])
    expect(f.excerpt).toBe('fetch("/api/rows")')
    expect(f.severity).toBe('error')
  })

  it('lints every bundled example without an error', () => {
    const dir = new URL('../assets/examples/', import.meta.url)
    const files = readdirSync(dir).filter(name => name.endsWith('.html'))
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const errors = lintFragment(readFileSync(new URL(name, dir), 'utf8'), MAX).findings.filter(f => f.severity === 'error')
      expect(errors, name).toEqual([])
    }
  })
})

describe('VZ001 / VZ002 / VZ003 structure', () => {
  it('VZ001: empty or whitespace-only fragment', () => {
    expect(codes(' \n\t')).toEqual(['VZ001'])
    expect(codes('<p>x</p>')).not.toContain('VZ001')
  })

  it('VZ002: over the byte ceiling, measured in UTF-8', () => {
    expect(codes('x'.repeat(11), 10)).toEqual(['VZ002'])
    // 3 CJK characters are 9 UTF-8 bytes: under a 10-byte ceiling.
    expect(codes('你好吗', 10)).toEqual([])
  })

  it('VZ003: skeleton tags, but not lookalikes, comments, or script text', () => {
    expect(codes('<!DOCTYPE html><div id="a"></div>')).toContain('VZ003')
    expect(codes('< body class="x"><div id="a"></div>')).toContain('VZ003')
    expect(codes('<div id="a"></div></body>')).toContain('VZ003')
    expect(codes('<header id="h"><h1>heads or bodies</h1></header>')).toEqual([])
    expect(codes('<!-- no <html> here --><div id="a"></div>')).toEqual([])
    expect(codes('<div id="a"></div><script>var tpl = "<body>";</script>')).toEqual([])
  })
})

describe('VZ004 string-escaped markup', () => {
  it('flags attributes quoted with \\"', () => {
    expect(codes('<div id=\\"lab\\" class=\\"x\\">hi</div>')).toContain('VZ004')
  })

  it('flags literal \\n between tags', () => {
    expect(codes('<div id="lab">\\n  <p>a</p>\\n  <p>b</p>\\n</div>')).toContain('VZ004')
  })

  it('flags a script body that opens with a literal \\n', () => {
    expect(codes('<div id="a"></div><script>\\nvar a = 1;\\n</script>')).toContain('VZ004')
  })

  it('leaves JS string escapes, prose about escapes, and code samples alone', () => {
    expect(codes('<div id="a"></div><script>document.getElementById("a").innerHTML = "<b class=\\"x\\">1</b>\\n";</script>')).toEqual([])
    expect(codes('<p id="a">Split on \\n to get lines.</p>')).toEqual([])
    expect(codes('<pre id="a">\\n\n<code>a\\nb</code>\\n</pre>')).toEqual([])
    // A single escape next to a tag can be prose ("\n is a newline").
    expect(codes('<p id="a">\\n is a newline</p>')).toEqual([])
  })
})

describe('VZ005 / VZ006 / VZ105 / VZ106 external resources', () => {
  it('VZ005: hosts outside the allowlist, in every loading position', () => {
    expect(only('<div id="a"></div><script src="https://cdn.example.com/x@1.0.0/x.js"></script>', 'VZ005').message)
      .toContain('cdn.example.com')
    expect(codes('<link id="a" rel="stylesheet" href="https://evil.test/a.css">')).toContain('VZ005')
    expect(codes('<video id="a" poster="https://upload.wikimedia.org/a.png"></video>')).toContain('VZ005')
    expect(codes('<style>@import url("https://evil.test/a.css");</style><div id="a"></div>')).toContain('VZ005')
    expect(codes('<div id="a" style="background: url(https://evil.test/bg.png)"></div>')).toContain('VZ005')
    // The column points at the URL itself, quoted or not.
    expect(only('<div id="a" style="background: url(\'https://evil.test/bg.png\')"></div>', 'VZ005').column).toBe(37)
    expect(only('<div id="a" style="background: url(https://evil.test/bg.png)"></div>', 'VZ005').column).toBe(36)
    expect(codes('<div id="a"></div><script type="module">import * as d3 from "https://skypack.dev/d3@7.9.0";</script>')).toContain('VZ005')
    expect(codes('<div id="a"></div><script type="module">const m = await import("https://evil.test/m.js");</script>')).toContain('VZ005')
  })

  it('VZ005/VZ006: a .src assignment only warns, since the receiver may not be an element', () => {
    expect(severities('<div id="a"></div><script>img.src = "https://evil.example/x.png"</script>')).toEqual(['VZ005 warn'])
    expect(severities('<div id="a"></div><script>s.src = "https://cdn.jsdelivr.net/npm/chart.js"</script>')).toEqual(['VZ006 warn'])
    expect(severities('<div id="a"></div><script type="module">import("https://evil.example/m.js")</script>')).toEqual(['VZ005 error'])
  })

  it('VZ005: tag names that are Object.prototype keys (Codex repro)', () => {
    const report = lintFragment('<constructor x="1"></constructor><img id="a" src="https://evil.example/x.png">', MAX)
    expect(report.skipped).toBeUndefined()
    expect(report.findings.map(f => f.code)).toEqual(['VZ011'])
    for (const name of ['__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      const r = lintFragment(`<${name} ${name}="1" src="https://evil.example/x.png"></${name}><img id="a" src="https://evil.example/y.png">`, MAX)
      expect(r.skipped).toBeUndefined()
      expect(r.findings.map(f => f.code)).toEqual(['VZ011'])
    }
  })

  it('VZ005: plain http to an allowlisted host', () => {
    expect(only('<div id="a"></div><script src="http://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>', 'VZ005').message)
      .toContain('https only')
  })

  it('accepts allowlisted, pinned, inline, and fragment-local URLs', () => {
    const fragment = `<div id="a">
<link rel="preconnect" href="https://example.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap">
<img src="data:image/png;base64,iVBORw0KGgo=" alt="">
<svg><rect fill="url(#g)"/><use href="#mark"/></svg>
<style>@font-face { font-family: X; src: url(https://fonts.gstatic.com/s/x.woff2); }</style>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"></script>
<script src="https://unpkg.com/@popperjs/core@2.11.8/dist/umd/popper.min.js"></script>
<script type="module">import confetti from 'https://esm.sh/canvas-confetti@1.9.3'; import { x } from "https://esm.sh/v135/lodash-es@4.17.21/x.js";</script>
<script>var link = 'see https://example.com for details';</script>`
    expect(codes(fragment)).toEqual([])
  })

  it('VZ006: CDN URL with no version or a moving tag', () => {
    expect(only('<div id="a"></div><script src="https://cdn.jsdelivr.net/npm/chart.js"></script>', 'VZ006').message).toContain('chart.js')
    expect(codes('<div id="a"></div><script src="https://unpkg.com/d3@latest/dist/d3.min.js"></script>')).toContain('VZ006')
    expect(codes('<div id="a"></div><script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/chart.min.js"></script>')).toContain('VZ006')
    expect(codes('<div id="a"></div><script type="module">import x from "https://esm.sh/@scope/pkg";</script>')).toContain('VZ006')
  })

  it('VZ105: a range or partial version only warns', () => {
    const f = only('<div id="a"></div><script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js"></script>', 'VZ105')
    expect(f.severity).toBe('warn')
    expect(codes('<div id="a"></div><script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js"></script>')).not.toContain('VZ006')
  })

  it('VZ106: relative and bare URLs warn; bare specifiers pass with an import map', () => {
    expect(only('<div id="a"></div><script src="chart.js"></script>', 'VZ106').severity).toBe('warn')
    expect(codes('<div id="a"></div><script type="module">import * as d3 from "d3";</script>')).toContain('VZ106')
    const mapped = '<div id="a"></div><script type="importmap">{"imports":{"d3":"https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm"}}</script>'
      + '<script type="module">import * as d3 from "d3";</script>'
    expect(codes(mapped)).toEqual([])
    expect(codes('<script type="importmap">{"imports":{"d3":"https://evil.test/d3.js"}}</script><div id="a"></div>')).toContain('VZ005')
  })
})

describe('VZ011 / VZ107 images the card cannot load', () => {
  it('VZ011: an <img src> on a blocked host is an error that points at data-viz-src', () => {
    const f = only('<img id="a" src="https://upload.wikimedia.org/a.png" alt="x">', 'VZ011')
    expect(f.severity).toBe('error')
    expect(f.fix).toContain('data-viz-src')
    expect(codes('<img id="a" src="//example.com/a.png">')).toEqual(['VZ011'])
    // Only images get the image fix; other tags keep the general rule.
    expect(codes('<video id="a" src="https://example.com/a.mp4"></video>')).toEqual(['VZ005'])
    // A scheme the tool cannot fetch either stays VZ005.
    expect(codes('<img id="a" src="ftp://example.com/a.png">')).toEqual(['VZ005'])
  })

  it('VZ107: a relative <img src> warns toward a workspace data-viz-src', () => {
    const f = only('<img id="a" src="figs/loss.png">', 'VZ107')
    expect(f.severity).toBe('warn')
    expect(f.fix).toContain('workspace root')
    expect(codes('<script id="a" src="chart.js"></script>')).toEqual(['VZ106'])
  })

  it('leaves data-viz-src, data: and allowlisted images alone', () => {
    expect(codes('<img id="a" data-viz-src="https://example.com/a.png">')).toEqual([])
    expect(codes('<img id="a" data-viz-src="./figs/loss.png">')).toEqual([])
    expect(codes('<img id="a" src="data:image/png;base64,iVBORw0KGgo=">')).toEqual([])
    expect(codes('<img id="a" src="https://cdn.jsdelivr.net/npm/simple-icons@13.0.0/icons/github.svg">')).toEqual([])
  })
})

describe('imageSources', () => {
  it('lists markup data-viz-src values as written, skipping scripts and comments', () => {
    const fragment = '<div id="a"><img data-viz-src="./a.png?x=1&amp;y=2" alt="a">\n'
      + '<IMG DATA-VIZ-SRC=b.png><img data-viz-src=""><!-- <img data-viz-src="c.png"> -->'
      + '<script>el.innerHTML = \'<img data-viz-src="d.png">\'</script><img src="e.png"></div>'
    expect(imageSources(fragment).map(s => s.raw)).toEqual(['./a.png?x=1&amp;y=2', 'b.png'])
  })
})

describe('VZ007 network APIs', () => {
  it('flags fetch, XHR, WebSocket, EventSource, sendBeacon in script code', () => {
    const fragment = `<div id="a"></div><script>
window.fetch('/x');
var x = new XMLHttpRequest();
var ws = new WebSocket('wss://x');
var es = new EventSource('/s');
navigator.sendBeacon('/b', 'x');
</script>`
    expect(codes(fragment).filter(c => c === 'VZ007')).toHaveLength(5)
  })

  it('ignores fetch in comments, strings, regexes, markup text, methods, and blob/data reads', () => {
    const fragment = `<div id="a"><p>We never fetch() anything.</p></div>
<!-- fetch('/api') -->
<script>
// fetch('/api') would be blocked
/* new WebSocket('wss://x') */
var note = "fetch( is blocked here", re = /fetch\\(/;
var t = \`call fetch(\${1}) later\`;
cache.fetch('k');
async function prefetchRows() { return 1 }
fetch('data:application/json,[]');
</script>`
    expect(codes(fragment)).toEqual([])
  })

  it('only warns for a fetch the fragment also binds, since the call may reach either', () => {
    expect(severities('<div id="a"></div><script>function fetch(k) { return DATA[k] } fetch("rows")</script>')).toEqual(['VZ007 warn'])
    expect(severities('<div id="a"></div><script>const { fetch } = api; fetch("rows")</script>')).toEqual(['VZ007 warn'])
    expect(severities('<div id="a"></div><script>window.fetch = mock; fetch("rows")</script>')).toEqual(['VZ007 warn'])
    expect(severities('<div id="a"></div><script>var self = this; self.fetch("rows")</script>')).toEqual(['VZ007 warn'])
    // An arrow parameter is a binding, whatever precedes it.
    expect(severities('<div id="a"></div><script>const load = fetch => fetch("/x")</script>')).toEqual(['VZ007 warn'])
    expect(severities('<div id="a"></div><script>function f() { return fetch => fetch(1) }</script>')).toEqual(['VZ007 warn'])
    expect(severities('<div id="a"></div><script>const g = window => window.fetch(1)</script>')).toEqual(['VZ007 warn'])
  })

  it('ignores a local method named fetch and member calls of it (Codex repro)', () => {
    expect(codes('<div id="a"></div><script>const obj={fetch(){return 1}}; obj.fetch()</script>')).toEqual([])
    expect(codes(`<div id="a"></div><script>
class Store { async fetch(key) { return DATA[key] } static fetch () { return 1 } }
const api = { *fetch(a, b) { yield a } };
api . fetch(1); api?.fetch(2); this.fetch(3); super_.fetch /* c */ (4);
</script>`)).toEqual([])
  })

  it('still flags the global fetch, however it is reached', () => {
    const fragment = `<div id="a"></div><script>
fetch('/a');
window . fetch('/b');
globalThis.fetch('/c');
self /* c */ .fetch('/d');
fetch(url).then(r => r.json());
</script>`
    expect(severities(fragment)).toEqual(Array(5).fill('VZ007 error'))
  })

  it('reads a method definition past nested and long parameter lists (Codex repro)', () => {
    expect(codes('<div id="a"></div><script>const o={fetch(key=String(1)){return key}}</script>')).toEqual([])
    expect(codes(`<div id="a"></div><script>const o={fetch(${'a'.repeat(600)}){return 1}}</script>`)).toEqual([])
    // A real call next to such a method is still the global one.
    expect(severities('<div id="a"></div><script>const o={fetch(k=f(1)){return k}}; fetch("/x")</script>')).toEqual(['VZ007 error'])
  })

  it('warns, never misses, a call followed by a block on the next line (Codex repro)', () => {
    expect(severities('<div id="a"></div><script>fetch("/x")\n{console.log("done")}</script>')).toEqual(['VZ007 warn'])
    // A line break inside a block comment is a line break too.
    expect(severities('<div id="a"></div><script>fetch("/x")/*\n*/{console.log("done")}</script>')).toEqual(['VZ007 warn'])
    // An unclosed call reads neither way.
    expect(severities('<div id="a"></div><script>fetch("/x"</script>')).toEqual(['VZ007 warn'])
  })

  it('only warns for a global receiver reached through a local property chain (Codex repro)', () => {
    expect(severities('<div id="a"></div><script>const api={window:{fetch:()=>1}};api.window.fetch()</script>')).toEqual(['VZ007 warn'])
    expect(severities('<div id="a"></div><script>new frame.window.WebSocket("wss://x")</script>')).toEqual(['VZ007 warn'])
    expect(severities('<div id="a"></div><script>new api.window.XMLHttpRequest</script>')).toEqual(['VZ007 warn'])
  })

  it('warns for shadowed and chained receivers of the other network APIs', () => {
    expect(severities(`<div id="a"></div><script>
class WebSocket { send() {} }
new WebSocket('wss://x');
beacon.navigator.sendBeacon('/b');
frame.document.currentScript;
</script>`)).toEqual(['VZ007 warn', 'VZ007 warn', 'VZ010 warn'])
    expect(severities('<div id="a"></div><script>const navigator = {}; navigator.sendBeacon("/c")</script>')).toEqual(['VZ007 warn'])
    // Not a construction, or a member of a local object: nothing to report.
    expect(codes('<div id="a"></div><script>WebSocket.OPEN; x instanceof EventSource; new api.WebSocket()</script>')).toEqual([])
    const real = severities(`<div id="a"></div><script>
new window.WebSocket('wss://x');
new globalThis.XMLHttpRequest();
window.navigator.sendBeacon('/b');
new EventSource('/s');
</script>`)
    expect(real).toEqual(Array(4).fill('VZ007 error'))
    expect(severities('<div id="a"></div><script>window.document.currentScript</script>')).toEqual(['VZ010 error'])
  })
})

describe('VZ008 form submission', () => {
  it('flags action, method=post, and formaction', () => {
    expect(codes('<form id="a" action="/submit"><input></form>')).toContain('VZ008')
    expect(codes('<form id="a" method="POST"><input></form>')).toContain('VZ008')
    expect(codes('<form id="a"><button formaction="/x">Go</button></form>')).toContain('VZ008')
  })

  it('allows a bare form handled in script', () => {
    expect(codes('<form id="a"><input name="q"><button>Go</button></form><script>document.getElementById("a").addEventListener("submit", e => e.preventDefault())</script>'))
      .toEqual([])
  })
})

describe('VZ009 color-scheme', () => {
  it('flags declarations in style blocks, style attributes, meta, and script', () => {
    expect(codes('<style>#a { color-scheme: light dark; }</style><div id="a"></div>')).toContain('VZ009')
    expect(codes('<div id="a" style="color-scheme: dark"></div>')).toContain('VZ009')
    expect(codes('<meta name="color-scheme" content="dark"><div id="a"></div>')).toContain('VZ009')
    expect(codes('<div id="a"></div><script>document.getElementById("a").style.colorScheme = "dark"</script>')).toContain('VZ009')
    expect(codes('<div id="a"></div><script>document.getElementById("a").style.setProperty("color-scheme", "dark")</script>')).toContain('VZ009')
  })

  it('errors on certain style writes from script, warns where the string may never be applied', () => {
    expect(severities('<div id="a"></div><script>el.style.colorScheme = "dark"</script>')).toEqual(['VZ009 error'])
    expect(severities('<div id="a"></div><script>el.setAttribute("style", "color-scheme: dark")</script>')).toEqual(['VZ009 error'])
    // An attribute named color-scheme does nothing, and a string may be text rather than markup.
    expect(severities('<div id="a"></div><script>el.setAttribute("color-scheme", "dark")</script>')).toEqual(['VZ009 warn'])
    expect(severities('<div id="a"></div><script>var tip = "<p style=\'color-scheme: dark\'>";</script>')).toEqual(['VZ009 warn'])
  })

  it('leaves prefers-color-scheme queries and comments alone', () => {
    const fragment = `<style>
/* never set color-scheme: dark here */
@media (prefers-color-scheme: dark) { #a { opacity: 0.9; } }
</style><div id="a"></div>
<script>var dark = matchMedia('(prefers-color-scheme: dark)').matches;</script>`
    expect(codes(fragment)).toEqual([])
  })
})

describe('VZ010 document.currentScript', () => {
  it('flags it in code', () => {
    expect(codes('<div id="a"></div><script>var root = document.currentScript.parentElement;</script>')).toContain('VZ010')
  })

  it('ignores it in comments and strings', () => {
    expect(codes('<div id="a"></div><script>// not document.currentScript\nvar s = "document.currentScript";</script>')).toEqual([])
  })
})

describe('VZ101 hard-coded colours', () => {
  it('flags hex, functions, and named colours in declarations, attributes, and script styles', () => {
    const fragment = `<div id="a" style="color: #333; border: 1px solid red">
<style>#a .x { background: rgb(240, 240, 240); }</style>
<svg><rect fill="#4d6bfe" stroke="tomato"/></svg>
</div>
<script>
var el = document.getElementById('a');
el.style.backgroundColor = '#fafafa';
el.innerHTML = '<circle fill="#ff0000"/>';
new Chart(c, { data: { datasets: [{ borderColor: 'rgba(77, 107, 254, 1)' }] } });
</script>`
    const found = lintFragment(fragment, MAX).findings.filter(f => f.code === 'VZ101')
    expect(found.map(f => f.message.split(': ').at(-1))).toEqual([
      '#333', 'red', 'rgb(240, 240, 240)', '#4d6bfe', 'tomato', '#fafafa', '#ff0000', 'rgba(77, 107, 254, 1)',
    ])
    expect(found.every(f => f.severity === 'warn')).toBe(true)
  })

  it('ignores theme-aware values, keywords, transparency, selectors, and non-colour words', () => {
    const fragment = `<div id="cafe">
<style>
#cafe, #bad .add { color: var(--foreground); background: var(--dsh-viz-bg, #ffffff); white-space: nowrap; }
#cafe .bar { background: color-mix(in srgb, var(--dsh-viz-text,#888) 10%, transparent); border-color: currentColor; }
#cafe .pill { color: light-dark(#1f2328, #e6edf3); box-shadow: 0 1px 2px rgba(0,0,0,.2); fill: none; }
#cafe .fade { background: linear-gradient(rgba(0,0,0,0), var(--card)); content: "#fff red"; }
</style>
<svg><stop offset="1" stop-color="#4d6bfe" stop-opacity="0"/><path fill="inherit" stroke="url(#g)"/></svg>
</div>
<script>
var DATA = [{ name: 'red team', hex: '#ff0000' }, { name: 'blue', hex: '#0000ff' }];
gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
</script>`
    expect(codes(fragment)).toEqual([])
  })
})

describe('VZ102 lookups of absent ids', () => {
  it('flags getElementById and #id selectors with no matching element', () => {
    const f = only('<div id="lab"></div><script>document.getElementById("lab-chart").textContent = 1</script>', 'VZ102')
    expect(f.message).toContain('#lab-chart')
    expect(codes('<div id="lab"></div><script>document.querySelector("#lab-plot svg")</script>')).toContain('VZ102')
  })

  it('still checks lookups when a static id is set with a space after the comma', () => {
    // `\s*,\s*(?!["'])` let the second \s* give back one space, so a literal id read as a built one.
    expect(codes('<div id="lab"></div><script>n.setAttribute("id", "lab-x"); document.getElementById("lab-y")</script>')).toEqual(['VZ102'])
  })

  it('accepts ids from markup, script-built markup, and dynamic construction', () => {
    expect(codes('<div id="lab"></div><script>document.getElementById("lab").innerHTML = \'<svg id="lab-plot"></svg>\'; document.getElementById("lab-plot")</script>'))
      .toEqual([])
    expect(codes('<div id="lab"></div><script>var n = document.createElement("div"); n.id = "lab-x"; document.getElementById("lab-x")</script>'))
      .toEqual([])
    // Ids assembled at run time make static lookups unverifiable.
    expect(codes('<div id="lab"></div><script>["a","b"].forEach(k => { root.innerHTML += \'<p id="lab-\' + k + \'"></p>\' }); document.getElementById("lab-a")</script>'))
      .toEqual([])
    expect(codes('<div id="lab"></div><script>n.setAttribute("id", name); document.getElementById("lab-x")</script>')).toEqual([])
    // Non-literal and class selectors are out of scope.
    expect(codes('<div id="lab"></div><script>document.getElementById(name); document.querySelector(".row")</script>')).toEqual([])
  })
})

describe('VZ103 missing root id', () => {
  it('warns when a script has no id anywhere to anchor on', () => {
    expect(only('<div class="root"></div><script>document.querySelector(".root").textContent = 1</script>', 'VZ103').severity).toBe('warn')
  })

  it('stays quiet for static markup and for cards with an id', () => {
    expect(codes('<div class="root"><p>static</p></div>')).toEqual([])
    expect(codes('<div class="root"></div><script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>')).toEqual([])
    expect(codes(CLEAN)).not.toContain('VZ103')
  })
})

describe('VZ104 Chart.js inherit font', () => {
  it("flags Chart.defaults.font.family = 'inherit'", () => {
    expect(only('<div id="a"></div><script>Chart.defaults.font.family = \'inherit\';</script>', 'VZ104').severity).toBe('warn')
  })

  it('accepts a resolved family and ignores comments', () => {
    expect(codes('<div id="a"></div><script>// Chart.defaults.font.family = "inherit"\nChart.defaults.font.family = getComputedStyle(document.body).fontFamily;</script>'))
      .toEqual([])
  })
})
