// @vitest-environment jsdom

/**
 * `mode: "page"` builds a whole browser page rather than a chat card. In the
 * conversation it is a launcher — title, summary, an inert thumbnail, and an
 * open button — and the page itself only ever runs inside the sandboxed frame
 * of a script-free tab, never at the dsh web origin.
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { VisualizeMeta } from '../src/fragment.ts'
import { buildFrameDoc, FRAME_CSP, HEIGHT_MESSAGE_TYPE } from '../src/shell.ts'
import { buildWindowDoc } from '../src/window-doc.ts'
import { Frame } from '../src/client/VisualizeCard.tsx'

/** A fragment written to break out of the frame's `srcdoc` attribute. */
const HOSTILE = `<div id="dash">"'></iframe><script>window.pwned = localStorage.getItem('token')</script></div>`

const PAGE: VisualizeMeta = {
  kind: 'visualize',
  fragment: HOSTILE,
  title: '销售数据看板',
  mode: 'page',
  path: '/home/visualize/sessions/s/dash-0badf00d.page.html',
  summary: '按地区和日期筛选的销售概览',
  style: 'whale',
}

describe('page frame document', () => {
  const base = { fragment: '<div id="d">x</div>', title: 'T', themeVars: { page: 'rgb(1, 2, 3)' }, colorScheme: 'light', reportToken: 'r' } as const

  it('lays a page out for a tab and keeps the card confinement', () => {
    const page = buildFrameDoc({ ...base, variant: 'page' })
    const card = buildFrameDoc(base)
    for (const doc of [page, card]) {
      expect(doc).toContain(`content="${FRAME_CSP}"`)
      expect(doc).toContain(HEIGHT_MESSAGE_TYPE)
    }
    // An opaque surface for sticky headers, and the page layout classes.
    expect(page).toContain('--background: var(--dsh-viz-page')
    expect(page).toContain('.viz-page-header')
    expect(page).not.toContain('body { padding: 4px 2px; }')
    expect(card).not.toContain('.viz-page-header')
    expect(card).toContain('body { padding: 4px 2px; }')
    expect(page).toContain('--dsh-viz-page: rgb(1, 2, 3);')
  })

  it('opens a page edge to edge, still only inside the sandboxed frame', () => {
    const frameDoc = buildFrameDoc({ ...base, fragment: HOSTILE, variant: 'page' })
    const html = buildWindowDoc({ frameDoc, title: 'T', colorScheme: 'light', background: 'rgb(1, 2, 3)', variant: 'page' })
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelectorAll('script')).toHaveLength(0)
    const frame = doc.querySelector('iframe')!
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('srcdoc')).toBe(frameDoc)
    expect(doc.querySelector('style')!.textContent).toContain('padding: 0;')
  })
})

describe('page launcher', () => {
  beforeAll(() => {
    window.matchMedia ??= (() => ({ addEventListener() {}, removeEventListener() {} })) as never
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  function mount(meta: VisualizeMeta) {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => root.render(<Frame meta={meta} callId="call-1" />))
    return container
  }

  it('shows title, summary, an inert sandboxed thumbnail, and an open button — never the page itself', () => {
    const container = mount(PAGE)
    expect(container.textContent).toContain('销售数据看板')
    expect(container.textContent).toContain('按地区和日期筛选的销售概览')
    const frames = container.querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    const thumb = frames[0]!
    expect(thumb.getAttribute('sandbox')).toBe('allow-scripts')
    expect(thumb.getAttribute('tabindex')).toBe('-1')
    expect(thumb.style.pointerEvents).toBe('none')
    expect(thumb.closest('[aria-hidden="true"]')).not.toBeNull()
    // The fragment reaches the DOM only as the frame's srcdoc.
    expect(container.querySelectorAll('script')).toHaveLength(0)
    expect(thumb.getAttribute('srcdoc')).toContain('.viz-page-header')
    expect([...container.querySelectorAll('button')].map(b => b.textContent)).toContain('Open page')
  })

  it('opens the page in a new tab whose only content is the sandboxed frame', async () => {
    const blobs: Blob[] = []
    URL.createObjectURL = ((blob: Blob) => {
      blobs.push(blob)
      return 'blob:dsh/1'
    }) as never
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const container = mount(PAGE)
    const button = [...container.querySelectorAll('button')].find(b => b.textContent === 'Open page')!
    act(() => button.click())

    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('blob:dsh/1', '_blank', 'noopener')
    // jsdom's Blob has no text(); FileReader reads it the way the tab would.
    const html = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsText(blobs[0]!)
    })
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.title).toBe('销售数据看板')
    expect(doc.querySelectorAll('script')).toHaveLength(0)
    const frames = doc.querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    expect(frames[0]!.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frames[0]!.getAttribute('srcdoc')).toContain(HOSTILE)
    expect(frames[0]!.getAttribute('srcdoc')).toContain('.viz-page-header')
  })

  it('renders the page in place where the browser cannot open a tab', () => {
    const saved = window.open
    ;(window as { open?: unknown }).open = undefined
    try {
      const container = mount(PAGE)
      expect(container.querySelectorAll('button')).toHaveLength(0)
      const frame = container.querySelector('iframe')!
      expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
      expect(frame.style.pointerEvents).not.toBe('none')
    } finally {
      window.open = saved
    }
  })

  it('leaves inline and wide cards as they were', () => {
    const container = mount({ ...PAGE, mode: 'inline' })
    expect(container.querySelector('[data-visualize-launcher]')).toBeNull()
    expect(container.querySelector('iframe')!.getAttribute('srcdoc')).not.toContain('.viz-page-header')
  })
})
