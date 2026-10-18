// @vitest-environment jsdom

/**
 * A card's iframe uses the same `color-scheme` its document declares. When
 * the two differ the browser paints an opaque canvas behind the document, so
 * a transparent card shows a near-black slab on a dark host instead of the
 * chat surface; the iframe follows the host theme as the document does.
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { VisualizeMeta } from '../src/fragment.ts'
import { Frame } from '../src/client/VisualizeCard.tsx'

const CARD: VisualizeMeta = {
  kind: 'visualize',
  fragment: '<div id="lab">x</div>',
  title: 'Lab',
  mode: 'inline',
  path: '',
  style: 'sketch',
}

/** The scheme a frame document declares on its root. */
function declaredScheme(frame: HTMLIFrameElement): string | undefined {
  return /:root \{[^}]*color-scheme: (light|dark);/u.exec(frame.getAttribute('srcdoc') ?? '')?.[1]
}

describe('frame color scheme', () => {
  beforeAll(() => {
    window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })
  afterEach(() => {
    document.body.innerHTML = ''
    document.body.removeAttribute('data-ds-dark-theme')
  })

  it.each([['inline card', CARD], ['page thumbnail', { ...CARD, mode: 'page' } as VisualizeMeta]])(
    'gives the %s iframe its document\'s scheme and keeps it in step with the host theme',
    async (_name, meta) => {
      document.body.setAttribute('data-ds-dark-theme', '')
      const container = document.createElement('div')
      document.body.append(container)
      act(() => createRoot(container).render(<Frame meta={meta} callId="call-1" />))
      const frame = () => container.querySelector('iframe')!
      expect(declaredScheme(frame())).toBe('dark')
      expect(frame().style.colorScheme).toBe('dark')
      const dark = frame()

      // DSH switches theme with a body attribute; the observer re-renders.
      await act(async () => {
        document.body.removeAttribute('data-ds-dark-theme')
        await Promise.resolve()
      })
      expect(declaredScheme(frame())).toBe('light')
      expect(frame().style.colorScheme).toBe('light')
      // Chrome misses a sandboxed frame's scheme change that lands with a new
      // srcdoc (verified in a real browser), so the switch mounts a new frame.
      expect(frame()).not.toBe(dark)
    },
  )
})
