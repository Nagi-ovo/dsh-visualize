/**
 * Where a card's interaction state lives between loads: what the reader set
 * through `data-viz-keep` controls and `dshViz.state` (viz-helper.ts), so a
 * page refresh, a reopened session, a theme switch or a patch brings the card
 * back as the reader left it.
 *
 * Storage is the dsh web page's `localStorage`, one entry per card under
 * {@link STORAGE_PREFIX}. The host offers no client-side per-session store
 * to plugins (its own persisted UI stores are `localStorage` too), so state
 * is per browser profile and per dsh origin, and does not follow the session
 * to another device. Every access is wrapped: a browser that refuses storage
 * (private mode, blocked site data, quota) still keeps state in memory for
 * the life of the page.
 *
 * Identity: a card is its session plus its `path`. A create takes a
 * content-addressed path (`<slug>-<hash>`), so new markup starts clean, while
 * an `update` patches the same path and keeps what the reader set: a patch is
 * almost always a correction the reader asked for while looking at their own
 * settings. A kept control that no longer accepts its value (a removed
 * option, a type that changed) is left at its markup default by the frame.
 * Cards without a path (arguments-only replays) fall back to their call id.
 *
 * Trust: the frame runs model-written script, so the card takes a state
 * message only from its own frame window with its token, decides the key
 * itself (the message never names one), caps each card at
 * {@link CARD_STATE_MAX_CHARS} and all cards together at
 * {@link STATE_TOTAL_MAX_CHARS}, evicting the cards changed longest ago.
 * Writes are debounced and flushed when the page hides.
 *
 * @module @nagi-ovo/dsh-visualize/client/card-state
 */

import { CARD_STATE_MAX_CHARS, STATE_MESSAGE_TYPE, type CardState } from '../viz-helper.ts'

export { CARD_STATE_MAX_CHARS }

/** Prefix of every `localStorage` key this module owns. */
export const STORAGE_PREFIX = 'dsh-visualize:state:'

/**
 * Most characters (keys plus JSON) all saved cards may take in `localStorage`.
 * The origin's quota (about 5 MB) is shared with the host's own stores.
 */
export const STATE_TOTAL_MAX_CHARS = 256 * 1024

/** Quiet period after the last change before it is written. */
export const STATE_WRITE_DELAY_MS = 400

/** The slice of `Storage` the store uses. */
export interface StateStorage {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** One card's state as stored: when it last changed, and its values. */
interface StoredEntry {
  t: number
  s: CardState
}

/**
 * The key a card's state is kept under.
 * @param session - the card's session id, when the host provides one.
 * @param path - the card's path from its meta; empty for arguments-only cards.
 * @param callId - the producing call id, the identity of a card without a path.
 * @returns the store key.
 */
export function cardStateKey(session: string | undefined, path: string, callId: string): string {
  return `${session ?? ''}|${path === '' ? `call:${callId}` : path}`
}

/**
 * Whether a value is a plain JSON-style object (not an array, class instance or null).
 * @param value - candidate.
 * @returns true for a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}

/**
 * Normalise a state object through JSON, within the per-card cap.
 * @param value - candidate state.
 * @param maxChars - cap on its JSON length.
 * @returns the JSON-clean state and its JSON, or undefined when it is not one or too big.
 */
function cleanState(value: unknown, maxChars: number): { values: CardState; json: string } | undefined {
  if (!isPlainObject(value)) return undefined
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    // Cycles and BigInts survive structured clone but not JSON.
    return undefined
  }
  if (json.length > maxChars) return undefined
  return { values: JSON.parse(json) as CardState, json }
}

/**
 * Read one frame message as a state snapshot.
 * @param data - the message payload.
 * @param token - this frame's correlation token.
 * @param maxChars - per-card cap on the snapshot's JSON.
 * @returns the snapshot, or undefined when the message is not a valid one.
 */
export function readStateMessage(data: unknown, token: string, maxChars = CARD_STATE_MAX_CHARS): CardState | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const message = data as { type?: unknown; token?: unknown; state?: unknown }
  if (message.type !== STATE_MESSAGE_TYPE || message.token !== token) return undefined
  return cleanState(message.state, maxChars)?.values
}

/** A store of card states. */
export interface CardStateStore {
  /**
   * The state a card should start from: the latest change this page saw, or
   * what storage holds.
   * @param key - from {@link cardStateKey}.
   * @returns a copy of the values, or undefined when nothing is saved.
   */
  read(key: string): CardState | undefined
  /**
   * Record a card's new state; storage is written after the quiet period.
   * @param key - from {@link cardStateKey}.
   * @param values - the whole state, already JSON-clean.
   */
  write(key: string, values: CardState): void
  /** Write every pending change now. */
  flush(): void
}

/** Limits and clock of one store. */
export interface CardStateOptions {
  cardMaxChars?: number
  totalMaxChars?: number
  delayMs?: number
  now?: () => number
}

/**
 * Create a store over a storage accessor.
 * @param storage - returns the storage, or undefined (or throws) where there is none.
 * @param options - limits and clock; tests shrink them.
 * @returns the store.
 */
export function createCardStateStore(storage: () => StateStorage | undefined, options: CardStateOptions = {}): CardStateStore {
  const cardMax = options.cardMaxChars ?? CARD_STATE_MAX_CHARS
  const totalMax = options.totalMaxChars ?? STATE_TOTAL_MAX_CHARS
  const delay = options.delayMs ?? STATE_WRITE_DELAY_MS
  const now = options.now ?? Date.now
  // Latest known state per card for this page, so a frame rebuilt before the
  // write lands (or when storage refuses it) still starts from it.
  const memory = new Map<string, string>()
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  function open(): StateStorage | undefined {
    try {
      return storage()
    } catch {
      return undefined
    }
  }

  function parseEntry(raw: string | null): StoredEntry | undefined {
    if (raw === null) return undefined
    try {
      const entry = JSON.parse(raw) as Partial<StoredEntry> | null
      if (entry === null || typeof entry !== 'object') return undefined
      const state = cleanState(entry.s, cardMax)
      if (state === undefined) return undefined
      return { t: typeof entry.t === 'number' && Number.isFinite(entry.t) ? entry.t : 0, s: state.values }
    } catch {
      return undefined
    }
  }

  /** Our other entries in storage, oldest change first. */
  function others(store: StateStorage, except: string): { key: string; size: number; t: number }[] {
    const found: { key: string; size: number; t: number }[] = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key === null || !key.startsWith(STORAGE_PREFIX) || key === except) continue
      const raw = store.getItem(key) ?? ''
      found.push({ key, size: key.length + raw.length, t: parseEntry(raw)?.t ?? 0 })
    }
    return found.sort((a, b) => a.t - b.t)
  }

  function persist(store: StateStorage, key: string, json: string): void {
    const full = STORAGE_PREFIX + key
    if (json === '{}') {
      store.removeItem(full)
      return
    }
    const value = `{"t":${now()},"s":${json}}`
    const victims = others(store, full)
    let used = victims.reduce((sum, entry) => sum + entry.size, 0)
    while (used + full.length + value.length > totalMax && victims.length > 0) {
      const oldest = victims.shift()!
      store.removeItem(oldest.key)
      used -= oldest.size
    }
    // The host's stores share the quota: when it is full, give up our own
    // oldest cards before this one.
    for (;;) {
      try {
        store.setItem(full, value)
        return
      } catch (error) {
        const oldest = victims.shift()
        if (oldest === undefined) throw error
        store.removeItem(oldest.key)
      }
    }
  }

  function flush(): void {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    if (pending.size === 0) return
    const keys = [...pending]
    pending.clear()
    const store = open()
    if (store === undefined) return
    for (const key of keys) {
      try {
        persist(store, key, memory.get(key) ?? '{}')
      } catch {
        // Storage refused it; the page keeps it in memory.
      }
    }
  }

  return {
    read(key) {
      let json = memory.get(key)
      if (json === undefined) {
        try {
          const entry = parseEntry(open()?.getItem(STORAGE_PREFIX + key) ?? null)
          if (entry !== undefined) json = JSON.stringify(entry.s)
        } catch {
          // Unreadable storage reads as nothing saved.
        }
        if (json !== undefined) memory.set(key, json)
      }
      return json === undefined || json === '{}' ? undefined : JSON.parse(json) as CardState
    },
    write(key, values) {
      const state = cleanState(values, cardMax)
      if (state === undefined || memory.get(key) === state.json) return
      memory.set(key, state.json)
      pending.add(key)
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(flush, delay)
    },
    flush,
  }
}

/**
 * The page's `localStorage`, or undefined where reading it throws (blocked
 * site data) or it does not exist.
 * @returns the storage.
 */
function pageStorage(): StateStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

/** The store every card on the page shares. */
export let cardStates: CardStateStore = createCardStateStore(pageStorage)

/**
 * Replace the shared store with a fresh one over another storage (tests only).
 * @param storage - the storage accessor.
 * @param options - limits and clock.
 */
export function resetCardStates(storage: () => StateStorage | undefined = pageStorage, options?: CardStateOptions): void {
  cardStates = createCardStateStore(storage, options)
}

if (typeof window !== 'undefined') {
  // Changes inside the quiet period would otherwise be lost to a reload.
  addEventListener('pagehide', () => cardStates.flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cardStates.flush()
  })
}
