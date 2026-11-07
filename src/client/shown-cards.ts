/**
 * Which toolview cards are on screen right now.
 *
 * A folded turn keeps its process rows mounted and hides them (the host sets
 * `hidden="until-found"` once the collapse settles), so mounting says nothing
 * about whether a reader can see a card. The toolview reports the card as
 * shown while nothing hides it, and the turn tail skips any card already
 * shown there — the reader opened the fold, or the host does not fold that
 * mode at all.
 */

import { useEffect, useSyncExternalStore, type RefObject } from 'react'

/** Shown toolview boxes per call id; a count, since one call may mount twice. */
const shown = new Map<string, number>()
const listeners = new Set<() => void>()
/** Bumped on every change so snapshots compare cheaply. */
let version = 0

function change(callId: string, delta: 1 | -1): void {
  const next = (shown.get(callId) ?? 0) + delta
  if (next > 0) shown.set(callId, next)
  else shown.delete(callId)
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Whether a call's toolview card is on screen.
 * @param callId - the host call id.
 * @returns true while at least one toolview box for it has layout.
 */
export function isShownInToolview(callId: string): boolean {
  return shown.has(callId)
}

/**
 * Re-render when any toolview card appears or disappears.
 * @returns the store version, only to drive the re-render.
 */
export function useShownToolviewVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version)
}

/**
 * Whether a reader can see the box. The host folds with `hidden="until-found"`,
 * which keeps the box's size but skips painting it, so size alone is not
 * enough; any `hidden` ancestor counts, and so does a display:none one.
 * @param element - the card's outer box.
 * @returns true when nothing above it hides it.
 */
export function boxIsShown(element: HTMLElement): boolean {
  return element.closest('[hidden]') === null && element.getClientRects().length > 0
}

/**
 * Report a toolview card as shown while a reader can see it. The host flips
 * `hidden` on fold rows, so attribute changes anywhere above the card are
 * watched along with the card's own size. Without the observers nothing is
 * reported and the turn tail keeps its copy: a duplicate beats a card nobody
 * can see.
 * @param ref - the card's outer box.
 * @param callId - the host call id.
 */
export function useReportShown(ref: RefObject<HTMLElement | null>, callId: string): void {
  useEffect(() => {
    const element = ref.current
    if (element === null || typeof ResizeObserver !== 'function' || typeof MutationObserver !== 'function') return
    let reported = false
    const measure = () => {
      const visible = element.isConnected && boxIsShown(element)
      if (visible === reported) return
      reported = visible
      change(callId, visible ? 1 : -1)
    }
    const sized = new ResizeObserver(measure)
    sized.observe(element)
    const folded = new MutationObserver(measure)
    folded.observe(element.ownerDocument.documentElement, { subtree: true, attributeFilter: ['hidden'] })
    measure()
    return () => {
      sized.disconnect()
      folded.disconnect()
      if (reported) change(callId, -1)
    }
  }, [ref, callId])
}
