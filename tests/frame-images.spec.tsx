// @vitest-environment jsdom

/**
 * A settled card with `data-viz-src` images fetches their bytes from the
 * plugin's image route and renders them as data URLs inside the frame
 * document, under the frame CSP exactly as it was; an image that cannot be
 * loaded keeps no `src`, so the frame draws its placeholder.
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { VisualizeMeta } from '../src/fragment.ts'
import { Frame } from '../src/client/VisualizeCard.tsx'
import { setImageFetch } from '../src/client/images.ts'
import { dataUrlOf, embedImages } from '../src/image-embed.ts'
import { FRAME_CSP, RESOURCE_ORIGINS } from '../src/shell.ts'
import { FRAME_CSS } from '../src/frame-css.ts'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_URL = dataUrlOf('image/png', PNG)

const CARD: VisualizeMeta = {
  kind: 'visualize',
  fragment: '<div id="lab"><img data-viz-src="./figs/loss.png" alt="loss"><img data-viz-src="https://x.test/gone.png" alt="gone"></div>',
  title: 'Lab',
  mode: 'inline',
  path: '',
  style: 'whale',
  images: [
    { src: './figs/loss.png', id: 'sess-1/aa.png', type: 'image/png', bytes: PNG.byteLength },
    { src: 'https://x.test/gone.png', id: 'sess-1/bb.png', type: 'image/png', bytes: 9 },
  ],
}

/** The image route as the browser sees it: one stored image, everything else 404. */
const requested: string[] = []
const route: typeof fetch = async (input) => {
  const url = new URL(String(input))
  requested.push(`${url.pathname}?${url.searchParams.toString()}`)
  return url.searchParams.get('id') === 'sess-1/aa.png'
    ? new Response(PNG as Uint8Array<ArrayBuffer>, { status: 200 })
    : new Response('not found', { status: 404 })
}

async function mount(meta: VisualizeMeta) {
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () => {
    createRoot(container).render(<Frame meta={meta} callId="call-1" />)
  })
  // Let the route responses settle and the card re-render.
  for (let i = 0; i < 5; i++) await act(async () => await new Promise(done => setTimeout(done, 0)))
  return container
}

/** The `<img>` tags of the frame document's body. */
function frameImages(container: HTMLElement): HTMLImageElement[] {
  const doc = new DOMParser().parseFromString(container.querySelector('iframe')!.getAttribute('srcdoc')!, 'text/html')
  return [...doc.body.querySelectorAll('img')]
}

describe('card images in the frame', () => {
  beforeAll(() => {
    window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })
  afterEach(() => {
    document.body.innerHTML = ''
    requested.length = 0
  })

  it('renders loaded images as data URLs and leaves a failed one to its placeholder', async () => {
    setImageFetch(route)
    const container = await mount(CARD)
    expect(requested).toEqual(['/api/dsh-visualize/image?id=sess-1%2Faa.png', '/api/dsh-visualize/image?id=sess-1%2Fbb.png'])
    const [loss, gone] = frameImages(container)
    expect(loss!.getAttribute('src')).toBe(PNG_URL)
    expect(loss!.getAttribute('alt')).toBe('loss')
    expect(gone!.hasAttribute('src')).toBe(false)
    expect(gone!.getAttribute('alt')).toBe('gone')
    expect(FRAME_CSS).toContain('img[data-viz-src]:not([src])')
  })

  it('keeps the frame CSP as it is: images arrive as data:, which it already admits', async () => {
    setImageFetch(route)
    const container = await mount(CARD)
    const srcdoc = container.querySelector('iframe')!.getAttribute('srcdoc')!
    expect(srcdoc).toContain(`<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">`)
    const imgSrc = /(?:^|; )img-src ([^;]*)/u.exec(FRAME_CSP)![1]!.split(' ')
    expect(imgSrc.sort()).toEqual(['blob:', 'data:', ...RESOURCE_ORIGINS].sort())
    expect(FRAME_CSP).toContain('connect-src blob: data:')
    for (const img of frameImages(container)) {
      const src = img.getAttribute('src')
      if (src !== null) expect(src.startsWith('data:image/png;base64,')).toBe(true)
    }
  })

  it('shows a loading line, not a frame, until the images settle', async () => {
    let release: () => void = () => {}
    setImageFetch(async (...args) => {
      await new Promise<void>(done => {
        release = done
      })
      return await route(...args)
    })
    const container = document.createElement('div')
    document.body.append(container)
    await act(async () => {
      createRoot(container).render(<Frame meta={{ ...CARD, images: [CARD.images![0]!] }} callId="call-1" />)
    })
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.textContent).toContain('loading images')
    await act(async () => {
      release()
      await new Promise(done => setTimeout(done, 0))
    })
    expect(frameImages(container)[0]!.getAttribute('src')).toBe(PNG_URL)
  })

  it('mounts a card without images at once, without asking the route', async () => {
    setImageFetch(route)
    const container = document.createElement('div')
    document.body.append(container)
    const { images: _, ...plain } = CARD
    act(() => createRoot(container).render(<Frame meta={plain} callId="call-1" />))
    expect(container.querySelector('iframe')).not.toBeNull()
    expect(frameImages(container).every(img => !img.hasAttribute('src'))).toBe(true)
    expect(requested).toEqual([])
  })
})

describe('embedImages', () => {
  const urls = new Map([['a.png', PNG_URL], ['b c.png', PNG_URL]])

  it('sets src first, so it wins over a src the fragment also wrote', () => {
    expect(embedImages('<img alt="x > y" data-viz-src="a.png" src="https://blocked.test/a.png">', urls))
      .toBe(`<img src="${PNG_URL}" alt="x > y" data-viz-src="a.png" src="https://blocked.test/a.png">`)
    expect(embedImages("<IMG data-viz-src='b c.png'>", urls)).toBe(`<img src="${PNG_URL}" data-viz-src='b c.png'>`)
    expect(embedImages('<img data-viz-src=a.png>', urls)).toBe(`<img src="${PNG_URL}" data-viz-src=a.png>`)
  })

  it('leaves scripts, styles, comments, other tags and unknown sources alone', () => {
    const untouched = '<script>el.innerHTML = "<img data-viz-src=\'a.png\'>"</script>'
      + '<style>/* <img data-viz-src="a.png"> */</style><!-- <img data-viz-src="a.png"> -->'
      + '<image data-viz-src="a.png"></image><img data-viz-src="other.png">'
    expect(embedImages(untouched, urls)).toBe(untouched)
  })

  it('refuses anything but a data URL', () => {
    const hostile = new Map([['a.png', 'javascript:alert(1)'], ['b.png', 'data:image/png;base64,x" onerror="alert(1)']])
    const fragment = '<img data-viz-src="a.png"><img data-viz-src="b.png">'
    expect(embedImages(fragment, hostile)).toBe(fragment)
  })
})
