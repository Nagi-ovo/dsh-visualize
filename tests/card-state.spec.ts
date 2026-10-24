// @vitest-environment jsdom

/**
 * Where a card's interaction state is kept between loads: one bounded
 * `localStorage` entry per card, written after a quiet period, evicted
 * oldest-changed first, and never a reason for the card to fail when the
 * browser refuses storage.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cardStateKey, createCardStateStore, readStateMessage, STORAGE_PREFIX, type StateStorage,
} from '../src/client/card-state.ts'
import { CARD_STATE_MAX_CHARS, STATE_MESSAGE_TYPE } from '../src/viz-helper.ts'

/** An in-memory Storage, optionally with a quota in characters. */
function memoryStorage(quota = Infinity) {
  const items = new Map<string, string>()
  const used = () => [...items].reduce((sum, [k, v]) => sum + k.length + v.length, 0)
  const storage: StateStorage & { items: Map<string, string> } = {
    items,
    get length() { return items.size },
    key: i => [...items.keys()][i] ?? null,
    getItem: k => items.get(k) ?? null,
    setItem(k, v) {
      const before = items.get(k)
      items.set(k, v)
      if (used() > quota) {
        if (before === undefined) items.delete(k)
        else items.set(k, before)
        throw new DOMException('full', 'QuotaExceededError')
      }
    },
    removeItem: k => { items.delete(k) },
  }
  return storage
}

afterEach(() => {
  vi.useRealTimers()
})

describe('cardStateKey', () => {
  it('keeps a patched card (same path) on one key and separates sessions and pathless calls', () => {
    const path = '~/.dsh/visualize/sessions/s1/cooling-ab12.whale.html'
    expect(cardStateKey('s1', path, 'call-1')).toBe(cardStateKey('s1', path, 'call-2'))
    expect(cardStateKey('s1', path, 'call-1')).not.toBe(cardStateKey('s2', path, 'call-1'))
    expect(cardStateKey('s1', '', 'call-1')).not.toBe(cardStateKey('s1', '', 'call-2'))
  })
})

describe('readStateMessage', () => {
  const message = (state: unknown, extra: Record<string, unknown> = {}) => ({ type: STATE_MESSAGE_TYPE, token: 't', state, ...extra })

  it('accepts a plain object for this frame, normalised through JSON', () => {
    expect(readStateMessage(message({ 'keep:rate': '7', when: new Date(0), gone: undefined }), 't'))
      .toEqual({ 'keep:rate': '7', when: '1970-01-01T00:00:00.000Z' })
  })

  it('rejects other types and tokens, non-objects, cycles and oversized state', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    expect(readStateMessage(message({ a: 1 }, { type: 'dsh-visualize:prompt' }), 't')).toBeUndefined()
    expect(readStateMessage(message({ a: 1 }), 'other')).toBeUndefined()
    expect(readStateMessage(message([1, 2]), 't')).toBeUndefined()
    expect(readStateMessage(message('{"a":1}'), 't')).toBeUndefined()
    expect(readStateMessage(message(cyclic), 't')).toBeUndefined()
    expect(readStateMessage(message({ big: 'x'.repeat(CARD_STATE_MAX_CHARS) }), 't')).toBeUndefined()
    expect(readStateMessage(null, 't')).toBeUndefined()
  })
})

describe('card state store', () => {
  it('writes after the quiet period, and reads back in a fresh page', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const store = createCardStateStore(() => storage, { delayMs: 400 })
    store.write('s|a', { 'keep:rate': '3' })
    store.write('s|a', { 'keep:rate': '7' })
    // The page itself sees the change at once; storage only after the drag settles.
    expect(store.read('s|a')).toEqual({ 'keep:rate': '7' })
    expect(storage.items.size).toBe(0)
    vi.advanceTimersByTime(399)
    expect(storage.items.size).toBe(0)
    vi.advanceTimersByTime(1)
    expect(createCardStateStore(() => storage).read('s|a')).toEqual({ 'keep:rate': '7' })
  })

  it('hands out copies, so a caller cannot change what is stored', () => {
    const store = createCardStateStore(() => memoryStorage())
    store.write('k', { list: [1] })
    ;(store.read('k')!['list'] as number[]).push(2)
    expect(store.read('k')).toEqual({ list: [1] })
  })

  it('removes a card whose state was cleared', () => {
    const storage = memoryStorage()
    const store = createCardStateStore(() => storage)
    store.write('k', { a: 1 })
    store.flush()
    store.write('k', {})
    store.flush()
    expect(storage.items.size).toBe(0)
    expect(store.read('k')).toBeUndefined()
  })

  it('ignores a write over the per-card cap', () => {
    const storage = memoryStorage()
    const store = createCardStateStore(() => storage, { cardMaxChars: 32 })
    store.write('k', { a: 'small' })
    store.write('k', { a: 'x'.repeat(64) })
    store.flush()
    expect(store.read('k')).toEqual({ a: 'small' })
  })

  it('evicts the cards changed longest ago once the total cap is reached', () => {
    let clock = 0
    const storage = memoryStorage()
    const store = createCardStateStore(() => storage, { totalMaxChars: 200, now: () => ++clock })
    for (const key of ['a', 'b', 'c', 'd']) {
      store.write(key, { v: 'x'.repeat(10) })
      store.flush()
    }
    // Each entry is ~50 characters with its key, so the fourth pushes out the first.
    expect([...storage.items.keys()]).toEqual(['b', 'c', 'd'].map(k => STORAGE_PREFIX + k))
    store.write('b', { v: 'y' })
    store.flush()
    store.write('e', { v: 'x'.repeat(20) })
    store.flush()
    // b changed last of the old ones, so c goes next.
    expect([...storage.items.keys()].sort()).toEqual(['b', 'd', 'e'].map(k => STORAGE_PREFIX + k))
  })

  it('makes room among its own cards when the origin quota is full', () => {
    let clock = 0
    const storage = memoryStorage(160)
    storage.setItem('host:theme', 'x'.repeat(40))
    const store = createCardStateStore(() => storage, { now: () => ++clock })
    store.write('a', { v: 'x'.repeat(20) })
    store.flush()
    store.write('b', { v: 'x'.repeat(20) })
    store.flush()
    expect(storage.getItem(STORAGE_PREFIX + 'a')).toBeNull()
    expect(storage.getItem(STORAGE_PREFIX + 'b')).not.toBeNull()
    // The host's own entry is never touched.
    expect(storage.getItem('host:theme')).toBe('x'.repeat(40))
  })

  it('keeps state in memory when storage throws or is missing', () => {
    const throwing: StateStorage = {
      length: 0,
      key: () => null,
      getItem: () => { throw new DOMException('denied', 'SecurityError') },
      setItem: () => { throw new DOMException('denied', 'SecurityError') },
      removeItem: () => undefined,
    }
    for (const source of [() => throwing, () => { throw new DOMException('denied', 'SecurityError') }, () => undefined]) {
      const store = createCardStateStore(source)
      expect(store.read('k')).toBeUndefined()
      store.write('k', { a: 1 })
      expect(() => store.flush()).not.toThrow()
      expect(store.read('k')).toEqual({ a: 1 })
    }
  })

  it('reads a corrupt or foreign entry as nothing saved', () => {
    const storage = memoryStorage()
    storage.setItem(`${STORAGE_PREFIX}bad`, '{not json')
    storage.setItem(`${STORAGE_PREFIX}arr`, '{"t":1,"s":[1,2]}')
    const store = createCardStateStore(() => storage)
    expect(store.read('bad')).toBeUndefined()
    expect(store.read('arr')).toBeUndefined()
  })
})
