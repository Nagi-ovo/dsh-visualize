/**
 * Run one assembled frame document in its own jsdom window, scripts enabled,
 * the way the sandboxed iframe runs it: the helper in `<head>`, then the
 * fragment's scripts in order, then DOMContentLoaded. The window is its own
 * parent here, so `parent.postMessage` is captured into `posted`.
 *
 * jsdom does not deliver mutation records before each parser-inserted script
 * (browsers do), so what it proves about load order is the conservative case.
 */

import { JSDOM } from 'jsdom'

/** A running frame. */
export interface RunningFrame {
  window: Window & typeof globalThis & Record<string, unknown>
  document: Document
  posted: unknown[]
  /** Let DOMContentLoaded and queued tasks run. */
  settle(): Promise<void>
}

/**
 * Parse and run a frame document.
 * @param doc - the srcdoc string.
 * @param setup - extra globals before parsing (e.g. a fake Chart).
 * @returns the running frame.
 */
export function runFrame(doc: string, setup?: (window: Window & typeof globalThis) => void): RunningFrame {
  const posted: unknown[] = []
  const dom = new JSDOM(doc, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      ;(window as unknown as Record<string, unknown>)['ResizeObserver'] = class { observe() {} disconnect() {} }
      window.postMessage = ((message: unknown) => { posted.push(message) }) as typeof window.postMessage
      setup?.(window)
    },
  })
  const window = dom.window as RunningFrame['window']
  return {
    window,
    document: window.document,
    posted,
    settle: () => new Promise(done => window.setTimeout(done, 0)),
  }
}
