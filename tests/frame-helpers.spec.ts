// @vitest-environment jsdom

/**
 * The frame helpers that stand in for the boilerplate nearly every card
 * writes: controls wired to one render and its readouts (`dshViz.bind`),
 * numbers formatted for reading (`dshViz.fmt`), a Chart.js chart that can be
 * fed before its fonts are ready (`dshViz.chart`), and tabs that switch
 * without script. Each runs inside a real frame document.
 */

import { describe, expect, it } from 'vitest'
import { buildFrameDoc, STATE_MESSAGE_TYPE } from '../src/shell.ts'
import type { CardState } from '../src/viz-helper.ts'
import { runFrame } from './run-frame.ts'

const BASE = { title: 'T', themeVars: {}, colorScheme: 'light', reportToken: 'call-1', savesState: true } as const

/** Run a fragment, optionally from saved state and with extra globals. */
function frame(fragment: string, saved?: CardState, setup?: (window: Window & typeof globalThis) => void) {
  return runFrame(buildFrameDoc({ ...BASE, fragment, savedState: saved }), setup)
}

type Fmt = (n: unknown, o?: unknown) => string

describe('dshViz.fmt', () => {
  const fmt = frame('').window['dshViz'] as { fmt: Fmt }
  const f: Fmt = (n, o = {}) => fmt.fmt(n, { locale: 'en-US', ...(typeof o === 'number' ? { digits: o } : o as object) })

  it('groups thousands and picks readable precision by default', () => {
    expect(f(1234567.891)).toBe('1,234,567.89')
    expect(f(42)).toBe('42')
    expect(f(0.000123)).toBe('0.00012')
    expect(f(0)).toBe('0')
  })

  it('takes fixed digits, significant digits and a unit', () => {
    expect(f(3, 2)).toBe('3.00')
    expect(f(0.1, { digits: 2, unit: '/min' })).toBe('0.10/min')
    expect(f(123456, { sig: 2 })).toBe('120,000')
  })

  it('formats percent, compact, signed and currency values', () => {
    expect(f(0.1234, { percent: true })).toBe('12.3%')
    expect(f(1530000, { compact: true })).toBe('1.5M')
    expect(f(0.032, { percent: true, sign: true })).toBe('+3.2%')
    expect(f(-5, { sign: true })).toBe('-5')
    expect(f(1999.5, { currency: 'USD' })).toBe('$1,999.50')
  })

  it('shows a dash for a missing number', () => {
    expect(f(NaN)).toBe('—')
    expect(f(null)).toBe('—')
    expect(f(Infinity)).toBe('Infinity')
  })
})

const FORM = `<div id="lab">
  <input name="n" type="range" min="1" max="10" value="4">
  <input name="on" type="checkbox" checked>
  <select name="size"><option value="8">8</option><option value="16" selected>16</option></select>
  <select name="algo"><option>quick</option><option selected>merge</option></select>
  <input type="radio" name="shape" value="sq"><input type="radio" name="shape" value="ci" checked>
  <input data-viz-param="label" name="ignored" type="text" value="hi">
  <button name="go">go</button>
  <output data-viz-out="n"></output><output data-viz-out="double"></output><output data-viz-out="big"></output>
</div>`

describe('dshViz.bind', () => {
  it('renders once on load with typed params and fills readouts from params and the return value', () => {
    const running = frame(`${FORM}<script>
      window.calls = [];
      dshViz.bind('#lab', function (p) { calls.push(p); return { double: p.n * 2 + ' items', big: 12345.678 }; });
    </script>`)
    expect(running.window['calls']).toEqual([{ n: 4, on: true, size: 16, algo: 'merge', shape: 'ci', label: 'hi' }])
    const out = (k: string) => running.document.querySelector(`[data-viz-out="${k}"]`)!.textContent
    expect(out('n')).toBe('4')
    expect(out('double')).toBe('8 items')
    expect(out('big')).toBe(running.window['dshViz'] && (running.window['dshViz'] as { fmt: Fmt }).fmt(12345.678))
  })

  it('renders again on a change, once per distinct state, and on demand', () => {
    const running = frame(`${FORM}<script>
      window.calls = 0;
      window.again = dshViz.bind(document.getElementById('lab'), function () { calls++; });
    </script>`)
    const range = running.document.querySelector('[name=n]') as HTMLInputElement
    range.value = '7'
    range.dispatchEvent(new running.window.Event('input', { bubbles: true }))
    // A slider's release fires change with the same value: no second draw.
    range.dispatchEvent(new running.window.Event('change', { bubbles: true }))
    expect(running.window['calls']).toBe(2)
    expect(running.document.querySelector('[data-viz-out="n"]')!.textContent).toBe('7')
    expect((running.window['again'] as () => { n: number })().n).toBe(7)
    expect(running.window['calls']).toBe(3)
  })

  it('draws its first render from kept values', () => {
    const running = frame(`<div id="lab" data-viz-keep><input id="lab-n" name="n" type="range" value="4"></div><script>
      window.first = null;
      dshViz.bind('#lab', function (p) { if (first === null) first = p.n; });
    </script>`, { 'keep:lab-n': '9' })
    expect(running.window['first']).toBe(9)
  })
})

/** A stand-in for Chart.js: records configs and updates. */
function fakeChart(window: Window & typeof globalThis) {
  const charts: { config: { data: { labels?: unknown[]; datasets: { data?: unknown[] }[] }; options: Record<string, unknown> }; updates: number }[] = []
  class Chart {
    static defaults = { font: {}, scale: { grid: {}, border: {} }, elements: { line: {}, point: {} }, plugins: { legend: { labels: {} } } }
    config: (typeof charts)[number]['config']
    updates = 0
    constructor(_canvas: unknown, config: (typeof charts)[number]['config']) {
      this.config = config
      charts.push(this)
    }
    get data() { return this.config.data }
    update() { this.updates++ }
  }
  Object.assign(window, { Chart, charts })
  // jsdom has no canvas; the colour probe only needs a writable fillStyle.
  window.HTMLCanvasElement.prototype.getContext = (() => ({ fillStyle: '#000' })) as never
}

describe('dshViz.chart', () => {
  it('takes data before fonts are ready, then draws once with the latest', async () => {
    const running = frame(`<div id="c"><canvas id="c-plot"></canvas></div><script>
      window.plot = dshViz.chart('#c-plot', function (theme) {
        return { type: 'line', data: { datasets: [{ borderColor: theme.series[0], backgroundColor: theme.fade(theme.series[0]) }] } };
      });
      plot.update([0, 1], [5, 6]);
      plot.update([0, 1, 2], [5, 6, 7]);
    </script>`, undefined, fakeChart)
    const charts = running.window['charts'] as ReturnType<typeof Array<{ config: any; updates: number }>>
    expect(charts).toHaveLength(0)
    await (running.window['plot'] as { ready: Promise<unknown> }).ready
    expect(charts).toHaveLength(1)
    const { config } = charts[0]!
    expect(config.data.labels).toEqual([0, 1, 2])
    expect(config.data.datasets[0].data).toEqual([5, 6, 7])
    expect(config.options).toMatchObject({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } })
    expect(charts[0]!.updates).toBe(0)
    ;(running.window['plot'] as { update(...args: unknown[]): void }).update(undefined, [1, 1, 1])
    expect(config.data.datasets[0].data).toEqual([1, 1, 1])
    expect(config.data.labels).toEqual([0, 1, 2])
    expect(charts[0]!.updates).toBe(1)
  })

  it('keeps an explicit legend and sizing, and fades a fill down the plot area', async () => {
    const running = frame(`<div id="c"><canvas id="c-plot"></canvas></div><script>
      window.plot = dshViz.chart(document.getElementById('c-plot'), {
        type: 'bar', data: { labels: ['a'], datasets: [{ data: [1] }] },
        options: { maintainAspectRatio: true, plugins: { legend: { position: 'top' } } },
      });
    </script>`, undefined, fakeChart)
    const plot = running.window['plot'] as { ready: Promise<{ config: any }>; theme: { fade(c: string, a?: number): (ctx: unknown) => unknown } }
    const chart = await plot.ready
    expect(chart.config.options).toMatchObject({ responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } })
    const stops: [number, string][] = []
    const gradient = { addColorStop: (at: number, c: string) => stops.push([at, c]) }
    const fill = plot.theme.fade('rgba(10, 20, 30, 1)', 0.5)
    expect(fill({ chart: { chartArea: undefined } })).toBeNull()
    expect(fill({ chart: { chartArea: { top: 0, bottom: 200 }, ctx: { createLinearGradient: () => gradient } } })).toBe(gradient)
    expect(stops.map(([at]) => at)).toEqual([0, 1])
  })
})

const TABS = `<div id="dash" data-viz-keep><div class="viz-tabs" id="views">
  <button class="viz-tab" role="tab" aria-selected="true" aria-controls="p-a">A</button>
  <button class="viz-tab" role="tab" aria-selected="false" aria-controls="p-b">B</button>
</div></div>
<section id="p-a">a</section><section id="p-b">b</section>`

describe('tabs', () => {
  it('show the selected tab’s panel from the start and switch on click', async () => {
    const running = frame(TABS)
    await running.settle()
    const doc = running.document
    expect([doc.getElementById('p-a')!.hidden, doc.getElementById('p-b')!.hidden]).toEqual([false, true])
    // Showing the default pick is not a choice the reader made.
    expect(running.posted.filter(m => (m as { type?: unknown }).type === STATE_MESSAGE_TYPE)).toEqual([])
    ;(doc.querySelectorAll('.viz-tab')[1] as HTMLButtonElement).click()
    expect([doc.getElementById('p-a')!.hidden, doc.getElementById('p-b')!.hidden]).toEqual([true, false])
    expect(doc.querySelectorAll('.viz-tab')[1]!.getAttribute('aria-selected')).toBe('true')
    expect(running.posted).toContainEqual({ type: STATE_MESSAGE_TYPE, token: 'call-1', state: { 'tab:views': 1 } })
  })

  it('click a kept pick back on load, so the card’s own handlers run', async () => {
    const running = frame(`${TABS}<script>
      window.picked = [];
      document.getElementById('views').addEventListener('click', function (e) { picked.push(e.target.textContent); });
    </script>`, { 'tab:views': 1 })
    await running.settle()
    expect(running.window['picked']).toEqual(['B'])
    expect(running.document.getElementById('p-b')!.hidden).toBe(false)
    expect(running.document.getElementById('p-a')!.hidden).toBe(true)
  })
})
