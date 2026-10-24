/**
 * Same-turn self-repair: drive the module through the host's own event
 * sequence — `session/event` for every durable record, then the serial
 * `agent/turn-stopping` boundary — and check what, if anything, it steers.
 */

import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'
import {
  installSelfRepair,
  MAX_STEERS_PER_TURN,
  SELF_REPAIR_PLUGIN,
  SELF_REPAIR_SOURCE_KIND,
} from '../src/self-repair.ts'

type Listener = (...args: unknown[]) => unknown

/** A host that records listeners and lets a test replay one session's turn. */
function host(options: { version?: number; origin?: 'subagent'; steer?: boolean } = {}) {
  const listeners = new Map<string, Listener[]>()
  const ctx = {
    on(name: string, listener: Listener) {
      listeners.set(name, [...listeners.get(name) ?? [], listener])
    },
  } as unknown as Context
  const session = { id: 's1', header: { id: 's1', version: options.version ?? 4, ...options.origin ? { origin: options.origin } : {} } }
  const steered: { content: { text: string }[]; source: Record<string, unknown>; role: string; id: string }[] = []
  const agent = {
    session,
    ...options.steer === false ? {} : { steer: (message: never) => steered.push(message) },
  }
  let turn = 0
  let calls = 0
  const record = (type: string, data: unknown) => listeners.get('session/event')?.forEach(l => l(session, { type, data }))
  const api = {
    ctx,
    steered,
    listeners,
    startTurn(userText: string) {
      turn += 1
      record('turn/start', { turn })
      record('user/message', { id: `u${turn}`, role: 'user', content: [{ type: 'text', text: userText }], source: { kind: 'user' } })
      return api
    },
    say(text: string, extra: Record<string, unknown> = {}) {
      record('assistant/message', { turn, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] }, ...extra })
      return api
    },
    call(name: string, result: { error?: string; meta?: unknown; text?: string } = {}) {
      const callId = `c${++calls}`
      record('tool/call', { turn, step: 1, callId, name, arguments: '{}' })
      const text = result.error === undefined ? result.text ?? 'ok' : `Error: ${result.error}`
      record('tool/result', {
        turn,
        step: 1,
        message: { role: 'tool', toolCallId: callId, source: { kind: 'tool', callId }, content: [{ type: 'text', text }], ...result.error === undefined ? {} : { isError: true } },
        ...result.meta === undefined ? {} : { meta: result.meta },
      })
      return api
    },
    /** Fire the stop boundary as the loop does; returns how many messages were steered by it. */
    async stop(signal: AbortSignal = new AbortController().signal) {
      const before = steered.length
      for (const l of listeners.get('agent/turn-stopping') ?? []) await l({ agent, turn, signal })
      return steered.length - before
    },
    endTurn() {
      record('turn/end', { turn, reason: { kind: 'completed' } })
      return api
    },
  }
  return api
}

function installed(options?: Parameters<typeof host>[0]) {
  const h = host(options)
  installSelfRepair(h.ctx)
  return h
}

const cardMeta = (fragment: string, path = '/home/.dsh/visualize/sessions/s1/sort-0000aaaa.whale.html') =>
  ({ kind: 'visualize', fragment, title: 'Sort', mode: 'inline', path, style: 'whale' })

const LINT_REJECTION = 'invalid visualization: nothing was rendered. Fix the error below and call visualize again (positions are line:column in the fragment you sent).\nVZ007 error at 3:1: network API'

const CARD_FENCE = [
  'Here is the visualization:',
  '',
  '```html',
  '<div id="sort-viz">',
  '  <svg viewBox="0 0 300 120" width="100%">',
  '    <rect x="10" y="40" width="20" height="80" fill="var(--viz-series-1)"/>',
  '    <rect x="40" y="20" width="20" height="100" fill="var(--viz-series-1)"/>',
  '  </svg>',
  '  <button id="step">Step</button>',
  '</div>',
  '<script>',
  "  const root = document.getElementById('sort-viz')",
  "  root.querySelector('#step').addEventListener('click', () => {})",
  '</script>',
  '```',
].join('\n')

describe('self-repair: a failed call the model never retried', () => {
  it('steers a retry into the same turn, attributed to the plugin', async () => {
    const h = installed().startTurn('可视化一下快速排序').call('visualize', { error: LINT_REJECTION }).say('卡片在上面。')
    expect(await h.stop()).toBe(1)
    const [message] = h.steered
    expect(message!.role).toBe('user')
    expect(message!.source).toEqual({ kind: SELF_REPAIR_SOURCE_KIND, form: 'notice', summary: 'visualize self-repair requested' })
    expect(message!.content[0]!.text).toMatch(/last visualize call failed.*call visualize again now/su)
  })

  it('uses the plugin source wrapper on sessions older than format v4', async () => {
    const h = installed({ version: 3 }).startTurn('show me a chart').call('visualize', { error: LINT_REJECTION }).say('Done.')
    await h.stop()
    expect(h.steered[0]!.source).toMatchObject({ kind: 'plugin', plugin: SELF_REPAIR_PLUGIN, form: 'notice' })
  })

  it('stays quiet after the lint gate told the model to stop', async () => {
    const stop = `${LINT_REJECTION}\n\nSTOP: VZ007 has now rejected 3 visualize calls in a row. Do not call visualize again for this card.`
    const h = installed().startTurn('chart it').call('visualize', { error: stop }).say('The card keeps needing network access.')
    expect(await h.stop()).toBe(0)
  })

  it('stays quiet when the reply already admits the failure', async () => {
    const h = installed().startTurn('chart it').call('visualize', { error: LINT_REJECTION }).say('I could not render the card: it needs live data the sandbox blocks.')
    expect(await h.stop()).toBe(0)
  })

  it('never overrides a host refusal such as a denied approval', async () => {
    const h = installed().startTurn('chart it').call('visualize', { error: 'user denied this tool call' }).say('OK.')
    expect(await h.stop()).toBe(0)
  })

  it('stays quiet when a later call succeeded', async () => {
    const ok = cardMeta('<div id="ok">fine</div>')
    const h = installed().startTurn('chart it').call('visualize', { error: LINT_REJECTION }).call('visualize', { meta: ok }).say('Here it is.')
    expect(await h.stop()).toBe(0)
  })
})

describe('self-repair: warnings left on the final card', () => {
  const deadLookup = `<div id="viz-a"><button id="go">Go</button></div>\n<script>\nconst root = document.getElementById('viz-a')\ndocument.getElementById('missing-out').textContent = '1'\n</script>`

  it('asks for a patch when the card looks up an id that does not exist', async () => {
    const h = installed().startTurn('visualize it').call('visualize', { meta: cardMeta(deadLookup) }).say('Here it is.')
    expect(await h.stop()).toBe(1)
    const text = h.steered[0]!.content[0]!.text
    expect(text).toContain('VZ102')
    expect(text).toContain('action "update", path "/home/.dsh/visualize/sessions/s1/sort-0000aaaa.whale.html"')
  })

  it('asks for a patch when a resource uses a relative URL', async () => {
    const h = installed().startTurn('visualize it').call('visualize', { meta: cardMeta('<div id="viz-c"><link rel="stylesheet" href="chart.css"></div>') }).say('Here.')
    expect(await h.stop()).toBe(1)
    expect(h.steered[0]!.content[0]!.text).toContain('VZ106')
  })

  it('asks for data-viz-src when an image uses a relative path', async () => {
    const h = installed().startTurn('visualize it').call('visualize', { meta: cardMeta('<div id="viz-c"><img src="chart.png"></div>') }).say('Here.')
    expect(await h.stop()).toBe(1)
    expect(h.steered[0]!.content[0]!.text).toContain('data-viz-src')
  })

  it('ignores taste warnings such as hard-coded colours', async () => {
    const coloured = `<div id="viz-b" style="color: #ff0000">Hi</div>\n<script>\nconst root = document.getElementById('viz-b')\nroot.style.background = '#123456'\n</script>`
    const h = installed().startTurn('visualize it').call('visualize', { meta: cardMeta(coloured) }).say('Here.')
    expect(await h.stop()).toBe(0)
  })

  it('judges the card in its final state: a patch that fixed it ends the matter', async () => {
    const fixed = deadLookup.replace('missing-out', 'go')
    const h = installed().startTurn('visualize it')
      .call('visualize', { meta: cardMeta(deadLookup) })
      .call('visualize', { meta: cardMeta(fixed) })
      .say('Here.')
    expect(await h.stop()).toBe(0)
  })
})

describe('self-repair: markup pasted into the reply instead of rendered', () => {
  it('steers a visualize call when the user asked to see something', async () => {
    const h = installed().startTurn('帮我可视化一下冒泡排序的过程').say(CARD_FENCE)
    expect(await h.stop()).toBe(1)
    expect(h.steered[0]!.content[0]!.text).toMatch(/pastes HTML\/SVG markup.*Call visualize now/su)
  })

  it('leaves it alone when the user asked for HTML code', async () => {
    for (const prompt of ['Write me an HTML snippet that animates bubble sort', '给我一段画冒泡排序动画的代码', '做一个演示冒泡排序的网页']) {
      const h = installed().startTurn(prompt).say(CARD_FENCE)
      expect(await h.stop(), prompt).toBe(0)
    }
  })

  it('leaves it alone when the turn wrote project files', async () => {
    const h = installed().startTurn('visualize bubble sort').call('write').say(CARD_FENCE)
    expect(await h.stop()).toBe(0)
  })

  it('leaves short teaching snippets and full documents alone', async () => {
    const snippet = 'Like this:\n\n```html\n<svg><circle r="4"/></svg>\n<script>go()</script>\n```'
    expect(await installed().startTurn('show me how a circle is drawn').say(snippet).stop()).toBe(0)
    const page = CARD_FENCE.replace('```html\n', '```html\n<!doctype html>\n<html>\n')
    expect(await installed().startTurn('visualize bubble sort').say(page).stop()).toBe(0)
  })

  it('leaves an unclosed fence alone (the reply was cut off)', async () => {
    const cut = CARD_FENCE.slice(0, CARD_FENCE.lastIndexOf('```'))
    expect(await installed().startTurn('visualize bubble sort').say(cut).stop()).toBe(0)
  })
})

describe('self-repair: a promised card that never came', () => {
  it('steers when the reply ends promising a card', async () => {
    for (const reply of ['Bubble sort swaps neighbours. Let me visualize this:', '冒泡排序每轮把最大值移到末尾。我来画一张交互卡片：']) {
      const h = installed().startTurn('how does bubble sort work').say(reply)
      expect(await h.stop(), reply).toBe(1)
      expect(h.steered[0]!.content[0]!.text).toContain('without a visualize call')
    }
  })

  it('leaves offers and questions alone', async () => {
    for (const reply of ['If you want, I can draw an interactive card.', "If you'd like, I'll render an interactive card next.", '需要的话我来画一张交互卡片。', 'Shall I visualize this?', 'I will create the chart component in src/Chart.tsx.']) {
      expect(await installed().startTurn('how does bubble sort work').say(reply).stop(), reply).toBe(0)
    }
  })
})

describe('self-repair: when never to steer', () => {
  it('does nothing on a cancelled turn', async () => {
    const abort = new AbortController()
    abort.abort()
    const h = installed().startTurn('chart it').call('visualize', { error: LINT_REJECTION }).say('Done.')
    expect(await h.stop(abort.signal)).toBe(0)
  })

  it('does nothing in a subagent session', async () => {
    const h = installed({ origin: 'subagent' }).startTurn('chart it').call('visualize', { error: LINT_REJECTION }).say('Done.')
    expect(await h.stop()).toBe(0)
  })

  it('does nothing for a turn it did not see start (plugin loaded mid-turn)', async () => {
    const h = host()
    h.startTurn('chart it').call('visualize', { error: LINT_REJECTION })
    installSelfRepair(h.ctx)
    h.say('Done.')
    expect(await h.stop()).toBe(0)
  })

  it('does nothing, and does not throw, on a host whose agent has no steer', async () => {
    const h = installed({ steer: false }).startTurn('chart it').call('visualize', { error: LINT_REJECTION }).say('Done.')
    await expect(h.stop()).resolves.toBe(0)
  })

  it('is not installed when the setting is off, and is by default', () => {
    const make = () => {
      const listeners: string[] = []
      const ctx = {
        get: () => undefined,
        tools: { register: () => () => {} },
        skills: { registerProvider: () => {} },
        on: (name: string) => { listeners.push(name) },
        inject: () => {},
        fiber: {},
      } as unknown as Context
      return { ctx, listeners }
    }
    const off = make()
    apply(off.ctx, { maxFragmentBytes: 1000, style: 'whale', selfRepair: false })
    expect(off.listeners).not.toContain('agent/turn-stopping')
    const on = make()
    apply(on.ctx, { maxFragmentBytes: 1000, style: 'whale', selfRepair: true })
    expect(on.listeners).toContain('agent/turn-stopping')
  })
})

describe('self-repair: loop safety', () => {
  it('corrects one trigger once per turn, however often the boundary fires', async () => {
    const h = installed().startTurn('chart it').call('visualize', { error: LINT_REJECTION }).say('Done.')
    expect(await h.stop()).toBe(1)
    // The model ignored it and stopped again on the same failure.
    h.say('Done.')
    expect(await h.stop()).toBe(0)
  })

  it(`steers at most ${MAX_STEERS_PER_TURN} corrections per turn`, async () => {
    const h = installed().startTurn('chart it')
    let total = 0
    for (let i = 0; i < 5; i++) {
      h.call('visualize', { error: `${LINT_REJECTION} (attempt ${i})` }).say('Done.')
      total += await h.stop()
    }
    expect(total).toBe(MAX_STEERS_PER_TURN)
  })

  it('starts each turn with a fresh budget', async () => {
    const h = installed().startTurn('chart it').call('visualize', { error: LINT_REJECTION }).say('Done.')
    expect(await h.stop()).toBe(1)
    h.endTurn().startTurn('chart it again').call('visualize', { error: LINT_REJECTION }).say('Done.')
    expect(await h.stop()).toBe(1)
  })

  it('does not treat its own steered message as the user asking', async () => {
    // After a pasted-markup steer, the model complies with a real call; the
    // correction text must not count as user words (it names code).
    const h = installed().startTurn('visualize bubble sort').say(CARD_FENCE)
    expect(await h.stop()).toBe(1)
    const steer = h.steered[0]!
    h.listeners.get('session/event')?.forEach(l => l({ id: 's1', header: { id: 's1', version: 4 } }, { type: 'user/message', data: steer }))
    h.say(CARD_FENCE.replace('>Step<', '>Next<'))
    expect(await h.stop()).toBe(1)
  })
})
