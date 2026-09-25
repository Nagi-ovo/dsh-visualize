// @vitest-environment jsdom

/**
 * Hosts from dsh 0.1.2 fold a finished turn's process rows, visualize cards
 * included, in their default work-details mode. The plugin re-shows the
 * turn's cards on the turn tail — only while the host folds, only cards
 * settled before the closing reply, once per card path — and must keep
 * loading on hosts that have neither the Conversation registry nor a folding
 * preference.
 */

import { act, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.tsx'
import { configFormsFolds, foldingSource, settingsScopeFolds } from '../src/client/folding.ts'
import {
  cardsBefore, foldCard, selectTurnCards, TURN_CARDS_KEY, turnCardsDefinition, TurnCards, type TurnCard,
} from '../src/client/TurnCards.tsx'
import type { VisualizeMeta } from '../src/fragment.ts'

/** A well-formed persisted descriptor. */
function meta(path: string, title = path): VisualizeMeta {
  return { kind: 'visualize', fragment: `<div>${title}</div>`, title, mode: 'inline', path }
}

/** A `tool/result` event as the host logs it. */
function result(seq: number, callId: string, resultMeta: unknown, isError = false) {
  return {
    type: 'tool/result', seq,
    data: { turn: 1, meta: resultMeta, message: { isError, source: { callId } } },
  } as never
}

const TURN_START = { type: 'turn/start', seq: 0, data: { turn: 1 } } as never

/** A Turn Location whose data store holds the given cards. */
function turnWith(cards: readonly TurnCard[]) {
  return { data: { get: (key: string) => key === TURN_CARDS_KEY ? { cards } : undefined } } as never
}

/**
 * Drive the Definition the way the Conversation engine does for one turn.
 * @param events - events after `turn/start`.
 * @returns the final state.
 */
function reduce(events: readonly never[]) {
  const def = turnCardsDefinition
  let state = def.start({} as never, { event: TURN_START, role: 'start' } as never, {} as never)
  for (const event of events) {
    if (def.match(event) === null) continue
    state = def.update({ state } as never, { event, role: 'update' } as never)
  }
  return state
}

beforeAll(() => {
  // jsdom lacks matchMedia; the frame only subscribes to appearance flips.
  window.matchMedia ??= (() => ({ addEventListener() {}, removeEventListener() {} })) as never
})

describe('turn cards definition', () => {
  it('claims turn starts and successful visualize results only', () => {
    const def = turnCardsDefinition
    expect(def.match(TURN_START)).toEqual({ id: '1', role: 'start' })
    expect(def.match(result(3, 'a', meta('viz/a.html')))).toEqual({ id: '1', role: 'update' })
    expect(def.match(result(3, 'a', meta('viz/a.html'), true))).toBeNull()
    expect(def.match(result(3, 'b', { kind: 'other' }))).toBeNull()
    expect(def.match({ type: 'tool/call', seq: 2, data: { turn: 1 } } as never)).toBeNull()
  })

  it('keeps one card per path, first call id wins, patched cards stay in place', () => {
    const state = reduce([
      result(3, 'a', meta('viz/a.html', 'A1')),
      result(5, 'b', meta('viz/b.html', 'B')),
      result(6, 'a', meta('viz/a.html', 'replaced surface')),
      result(8, 'c', meta('viz/a.html', 'A2')),
    ])
    expect(state.cards.map(card => [card.callId, card.meta.title])).toEqual([['c', 'A2'], ['b', 'B']])
  })

  it('publishes Turn data only, reusing the previous value while unchanged', () => {
    const state = reduce([result(3, 'a', meta('viz/a.html'))])
    const def = turnCardsDefinition
    const context = { state } as never
    expect(def.buildLocationData!(context, 'step', null)).toBeNull()
    const first = def.buildLocationData!(context, 'turn', null)
    expect(first).toEqual({ kind: 'turn', turn: 1, key: TURN_CARDS_KEY, value: { cards: state.cards } })
    expect(def.buildLocationData!(context, 'turn', first)).toBe(first)
  })

  it('folds unrelated cards without touching the list', () => {
    const cards = [{ callId: 'a', seq: 1, meta: meta('viz/a.html') }]
    expect(foldCard(cards, { callId: 'a', seq: 9, meta: meta('viz/z.html') })).toBe(cards)
  })
})

describe('turn tail selection', () => {
  const cards = [
    { callId: 'a', seq: 3, meta: meta('viz/a.html') },
    { callId: 'b', seq: 12, meta: meta('viz/b.html') },
  ]

  it('shows only cards settled before the closing reply', () => {
    expect(cardsBefore(turnWith(cards), 10).map(card => card.callId)).toEqual(['a'])
    expect(selectTurnCards({ turn: turnWith(cards), seq: 2 })).toBeNull()
  })

  it('tolerates hosts without a Turn data store', () => {
    expect(cardsBefore(undefined, 10)).toEqual([])
    expect(cardsBefore({} as never, 10)).toEqual([])
  })
})

describe('folding preference', () => {
  it('reads each host generation by its own rule', () => {
    expect(['compact', 'standard', 'detailed', undefined, 'normal'].map(configFormsFolds)).toEqual([true, true, true, true, true])
    expect(configFormsFolds('verbose')).toBe(false)
    expect([undefined, 'compact'].map(settingsScopeFolds)).toEqual([true, true])
    expect(settingsScopeFolds('normal')).toBe(false)
  })

  it('prefers configForms, falls back to settingsScope, and otherwise never folds', () => {
    const face = (transcriptView: string) => ({ getSnapshot: () => ({ value: { transcriptView } }), subscribe: () => () => undefined })
    const forms = { get: () => face('normal') }
    const scope = { bind: () => face('normal') }
    expect(foldingSource({ get: name => ({ configForms: forms, settingsScope: scope } as Record<string, unknown>)[name] }).getSnapshot()).toBe(true)
    expect(foldingSource({ get: name => (name === 'settingsScope' ? scope : undefined) }).getSnapshot()).toBe(false)
    expect(foldingSource({ get: () => undefined }).getSnapshot()).toBe(false)
  })

  it('forwards live preference changes', () => {
    let view = 'standard'
    const listeners = new Set<() => void>()
    const forms = { get: () => ({ getSnapshot: () => ({ value: { transcriptView: view } }), subscribe: (l: () => void) => { listeners.add(l) } }) }
    const source = foldingSource({ get: name => (name === 'configForms' ? forms : undefined) })
    let seen = 0
    const dispose = source.subscribe(() => { seen += 1 })
    view = 'verbose'
    for (const listener of listeners) listener()
    expect(seen).toBe(1)
    expect(source.getSnapshot()).toBe(false)
    expect(typeof dispose).toBe('function')
  })
})

describe('client registration', () => {
  /**
   * Apply against a fake host.
   * @param services - optional services visible through `get`.
   * @returns what was registered.
   */
  function boot(services: Record<string, unknown>) {
    const registered = new Map<string, { options: Record<string, unknown>; component: ComponentType<Record<string, unknown>> }>()
    const definitions: string[] = []
    const slots = {
      inject(_name: string, install: () => unknown) { install() },
      register(options: Record<string, unknown>, component: ComponentType<Record<string, unknown>>) {
        registered.set(options.name as string, { options, component })
        return () => { registered.delete(options.name as string) }
      },
    }
    const events = { register: (def: { kind: string }) => { definitions.push(def.kind); return () => undefined } }
    const all: Record<string, unknown> = { uiConversation: { events }, ...services }
    apply({ slots, get: (name: string) => all[name] } as never)
    return { registered, definitions }
  }

  it('registers the turn cards with both slot shapes when the registry exists', () => {
    const { registered, definitions } = boot({})
    expect(definitions).toEqual([TURN_CARDS_KEY])
    const tail = registered.get('conversation.chat.turnTail')
    expect(tail?.options.id).toBe('dsh-visualize-cards')
    expect(tail?.options.select).toBe(selectTurnCards)
  })

  it('skips the turn cards on a host without the Conversation registry', () => {
    const { registered, definitions } = boot({ uiConversation: undefined })
    expect(definitions).toEqual([])
    expect(registered.has('conversation.chat.turnTail')).toBe(false)
    expect(registered.has('tool.call.toolview')).toBe(true)
  })
})

describe('turn cards view', () => {
  /**
   * Render the entry once.
   * @param folds - host folding state.
   * @param cards - the turn's cards.
   * @returns the rendered iframe titles.
   */
  function render(folds: boolean, cards: readonly TurnCard[]): string[] {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const Entry = TurnCards as unknown as ComponentType<Record<string, unknown>>
    act(() => {
      root.render(<Entry turn={turnWith(cards)} seq={10} useVisualizeFolds={<S,>(pick: (value: boolean) => S) => pick(folds)} />)
    })
    const titles = [...host.querySelectorAll('iframe')].map(frame => frame.title)
    act(() => { root.unmount() })
    host.remove()
    return titles
  }

  const cards = [{ callId: 'a', seq: 3, meta: meta('viz/a.html', 'Arch') }]

  it('shows the cards while the host folds', () => {
    expect(render(true, cards)).toEqual(['Arch'])
  })

  it('stays empty when the toolview card is already in view', () => {
    expect(render(false, cards)).toEqual([])
    expect(render(true, [])).toEqual([])
  })
})
