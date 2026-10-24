// @vitest-environment jsdom

/**
 * What the reader sets inside a card survives a reload: the frame starts
 * from the saved values (readable before any fragment script runs), puts
 * them back into `data-viz-keep` controls with their events fired, and
 * reports each change to its own card, which stores it under the card's key
 * and nobody else's.
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { VisualizeMeta } from '../src/fragment.ts'
import { buildFrameDoc, STATE_MESSAGE_TYPE } from '../src/shell.ts'
import { CARD_STATE_MAX_CHARS, type CardState } from '../src/viz-helper.ts'
import { Frame } from '../src/client/VisualizeCard.tsx'
import { cardStateKey, cardStates, resetCardStates, type StateStorage } from '../src/client/card-state.ts'
import { runFrame } from './run-frame.ts'

const BASE = { title: 'T', themeVars: {}, colorScheme: 'light', reportToken: 'call-1' } as const

/** Run a fragment in a frame that saves under `call-1`, starting from `saved`. */
function frame(fragment: string, saved?: CardState, saves = true) {
  return runFrame(buildFrameDoc({ ...BASE, fragment, savedState: saved, savesState: saves }))
}

/** The state snapshots a frame posted. */
function snapshots(posted: unknown[]): unknown[] {
  return posted.filter(m => (m as { type?: unknown }).type === STATE_MESSAGE_TYPE)
}

const CONTROLS = `<div id="sim" data-viz-keep>
  <input id="rate" type="range" min="0" max="100" value="10">
  <input id="on" type="checkbox">
  <select id="pick"><option value="a">A</option><option value="b">B</option></select>
  <label><input type="radio" name="shape" value="sq" checked>sq</label>
  <label><input type="radio" name="shape" value="ci">ci</label>
  <textarea id="note"></textarea>
  <input type="text" placeholder="no id or name: not kept">
</div>`

describe('frame state', () => {
  it('lets fragment scripts read saved values synchronously on load', () => {
    const running = frame('<script>window.seen = dshViz.state.get("zoom", 1); window.miss = dshViz.state.get("none", "dflt")</script>', { zoom: 3 })
    expect(running.window['seen']).toBe(3)
    expect(running.window['miss']).toBe('dflt')
  })

  it('restores kept controls before a script that reads through dshViz', () => {
    const saved = { 'keep:rate': '42', 'keep:on': true, 'keep:pick': 'b', 'keep:shape': 'ci', 'keep:note': '笔记 </script>' }
    const running = frame(`${CONTROLS}<script>
      dshViz.state.get('x');
      var $ = function (id) { return document.getElementById(id); };
      window.seen = [$('rate').value, $('on').checked, $('pick').value, document.querySelector('[name=shape]:checked').value, $('note').value];
    </script>`, saved)
    expect(running.window['seen']).toEqual(['42', true, 'b', 'ci', '笔记 </script>'])
  })

  it('fires input and change on restore so handlers wired before load redraw', async () => {
    const running = frame(`${CONTROLS}<script>
      window.draws = [];
      document.getElementById('rate').addEventListener('input', function (e) { draws.push('input:' + e.target.value); });
      document.getElementById('rate').addEventListener('change', function (e) { draws.push('change:' + e.target.value); });
    </script>`, { 'keep:rate': '42' })
    await running.settle()
    expect(running.window['draws']).toEqual(['input:42', 'change:42'])
    // Restoring a value is not a change of state: nothing is posted back.
    expect(snapshots(running.posted)).toEqual([])
  })

  it('saves kept controls on input and change, with the whole map', async () => {
    const running = frame(CONTROLS, { zoom: 2 })
    await running.settle()
    const doc = running.document
    const rate = doc.getElementById('rate') as HTMLInputElement
    rate.value = '77'
    rate.dispatchEvent(new running.window.Event('input', { bubbles: true }))
    const circle = doc.querySelector('[value=ci]') as HTMLInputElement
    circle.checked = true
    circle.dispatchEvent(new running.window.Event('change', { bubbles: true }))
    const posts = snapshots(running.posted)
    expect(posts).toEqual([
      { type: STATE_MESSAGE_TYPE, token: 'call-1', state: { zoom: 2, 'keep:rate': '77' } },
      { type: STATE_MESSAGE_TYPE, token: 'call-1', state: { zoom: 2, 'keep:rate': '77', 'keep:shape': 'ci' } },
    ])
    // The same value again posts nothing.
    rate.dispatchEvent(new running.window.Event('change', { bubbles: true }))
    expect(snapshots(running.posted)).toHaveLength(2)
  })

  it('leaves a control at its default when the saved value no longer fits it', async () => {
    const running = frame(CONTROLS, { 'keep:pick': 'gone', 'keep:on': 'yes', 'keep:shape': 'triangle' })
    await running.settle()
    const doc = running.document
    expect((doc.getElementById('pick') as HTMLSelectElement).value).toBe('a')
    expect((doc.getElementById('on') as HTMLInputElement).checked).toBe(false)
    expect((doc.querySelector('[name=shape]:checked') as HTMLInputElement).value).toBe('sq')
  })

  it('keys a control by its data-viz-keep value when it names one', async () => {
    const running = frame('<input id="a" data-viz-keep="speed" value="1">', { 'keep:speed': '5', 'keep:a': '9' })
    await running.settle()
    expect((running.document.getElementById('a') as HTMLInputElement).value).toBe('5')
  })

  it('waits for a radio or option that is still to be parsed', async () => {
    const running = frame(`<input type="radio" name="s" value="a" data-viz-keep checked>
<script>dshViz.state.get('x')</script>
<input type="radio" name="s" value="b" data-viz-keep>`, { 'keep:s': 'b' })
    await running.settle()
    expect((running.document.querySelector('[name=s]:checked') as HTMLInputElement).value).toBe('b')
  })

  it('restores a control a script creates after load', async () => {
    const running = frame('<div id="rows" data-viz-keep></div>', { 'keep:n': '9' })
    await running.settle()
    const input = running.document.createElement('input')
    input.name = 'n'
    input.value = '1'
    running.document.getElementById('rows')!.append(input)
    await running.settle()
    expect(input.value).toBe('9')
  })

  it('posts dshViz.state.set values and refuses ones over the cap', () => {
    const running = frame('<script>window.ok = dshViz.state.set("view", { x: 1, tags: ["a"] }); window.big = dshViz.state.set("blob", "x".repeat(' + CARD_STATE_MAX_CHARS + '))</script>')
    expect(running.window['ok']).toBe(true)
    expect(running.window['big']).toBe(false)
    expect(snapshots(running.posted)).toEqual([{ type: STATE_MESSAGE_TYPE, token: 'call-1', state: { view: { x: 1, tags: ['a'] } } }])
    const cleared = frame('<script>dshViz.state.clear()</script>', { a: 1 })
    expect(snapshots(cleared.posted)).toEqual([{ type: STATE_MESSAGE_TYPE, token: 'call-1', state: {} }])
  })

  it('works in memory but posts nothing where the card saves nothing', () => {
    const running = frame('<script>dshViz.state.set("a", 1); window.seen = dshViz.state.get("a")</script>', { b: 2 }, false)
    expect(running.window['seen']).toBe(1)
    expect(snapshots(running.posted)).toEqual([])
  })

  it('bakes saved text in without letting it close the script', () => {
    const hostile = '</script><script>window.pwned = 1</script><!--   & >'
    const running = frame('<script>window.seen = dshViz.state.get("t")</script>', { t: hostile })
    expect(running.window['pwned']).toBeUndefined()
    expect(running.window['seen']).toBe(hostile)
  })
})

describe('card state relay', () => {
  const card = (path: string): VisualizeMeta => ({
    kind: 'visualize', fragment: '<input id="r" type="range" data-viz-keep>', title: 'Card', mode: 'inline', path, style: 'whale',
  })
  const A = card('/s/a-1.whale.html')
  const B = card('/s/b-2.whale.html')
  let storage: Map<string, string>

  beforeAll(() => {
    window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })
  beforeEach(() => {
    storage = new Map()
    const fake: StateStorage = {
      get length() { return storage.size },
      key: i => [...storage.keys()][i] ?? null,
      getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => { storage.set(k, v) },
      removeItem: k => { storage.delete(k) },
    }
    resetCardStates(() => fake, { delayMs: 0 })
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  /** Mount cards; each gets its own key from session `s1`. */
  function mount(...cards: { meta: VisualizeMeta; callId: string }[]) {
    const root = document.createElement('div')
    document.body.append(root)
    const reactRoot = createRoot(root)
    const render = () => act(() => {
      reactRoot.render(<>{cards.map(({ meta, callId }) => (
        <Frame key={callId} meta={{ ...meta }} callId={callId} stateKey={cardStateKey('s1', meta.path, callId)} />
      ))}</>)
    })
    render()
    return { frames: [...root.querySelectorAll('iframe')], render, unmount: () => act(() => reactRoot.unmount()) }
  }

  function post(source: MessageEventSource | null, token: string, state: unknown) {
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: STATE_MESSAGE_TYPE, token, state }, source }))
    })
  }

  it('stores a frame’s snapshot under its own card only', () => {
    const { frames } = mount({ meta: A, callId: 'call-a' }, { meta: B, callId: 'call-b' })
    post(frames[0]!.contentWindow, 'call-a', { 'keep:r': '7' })
    expect(cardStates.read(cardStateKey('s1', A.path, 'call-a'))).toEqual({ 'keep:r': '7' })
    expect(cardStates.read(cardStateKey('s1', B.path, 'call-b'))).toBeUndefined()
  })

  it('ignores snapshots from another window, under another card’s token, or over the cap', () => {
    const { frames } = mount({ meta: A, callId: 'call-a' }, { meta: B, callId: 'call-b' })
    post(window, 'call-a', { 'keep:r': '1' })
    post(null, 'call-a', { 'keep:r': '1' })
    // Frame B names card A's token: still not A's state, and not B's either.
    post(frames[1]!.contentWindow, 'call-a', { 'keep:r': '1' })
    post(frames[0]!.contentWindow, 'call-a', { blob: 'x'.repeat(CARD_STATE_MAX_CHARS) })
    expect(cardStates.read(cardStateKey('s1', A.path, 'call-a'))).toBeUndefined()
    expect(cardStates.read(cardStateKey('s1', B.path, 'call-b'))).toBeUndefined()
  })

  it('bakes the saved state into the next load, but never reloads the frame because state changed', async () => {
    const first = mount({ meta: A, callId: 'call-a' })
    const before = first.frames[0]!.getAttribute('srcdoc')
    post(first.frames[0]!.contentWindow, 'call-a', { 'keep:r': '7' })
    // A host re-render with a freshly narrowed meta keeps the document as it is.
    first.render()
    expect(first.frames[0]!.getAttribute('srcdoc')).toBe(before)
    first.unmount()
    // Debounced write, then a fresh page: the store reads back from storage.
    await new Promise(done => setTimeout(done, 5))
    expect([...storage.keys()]).toEqual([`dsh-visualize:state:${cardStateKey('s1', A.path, 'call-a')}`])
    resetCardStates(() => ({
      get length() { return storage.size },
      key: i => [...storage.keys()][i] ?? null,
      getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => { storage.set(k, v) },
      removeItem: k => { storage.delete(k) },
    }))
    // A patch keeps the path, so the patched card starts from the same state.
    const patched = mount({ meta: { ...A, fragment: `${A.fragment}<p>fixed label</p>` }, callId: 'call-a2' })
    const running = runFrame(patched.frames[0]!.getAttribute('srcdoc')!)
    await running.settle()
    expect((running.document.getElementById('r') as HTMLInputElement).value).toBe('7')
  })
})
