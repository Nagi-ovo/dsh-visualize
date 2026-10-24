/**
 * Fetch a settled card's images from the plugin's image route and hand the
 * card a meta whose fragment already carries them as data URLs
 * (image-embed.ts), so every surface built from it — the in-chat frame, the
 * page thumbnail, "open in new window" — renders the same images. The route
 * is same-origin and the browser's session cookie authenticates it; the
 * sandboxed frame itself never fetches anything.
 *
 * Images are content-addressed, so loads are cached by id for the page's
 * lifetime, within a byte budget. A failed load is not cached: that image
 * shows its placeholder, and the next mount tries again.
 */

import { useEffect, useMemo, useState } from 'react'
import { IMAGE_ROUTE_PATH, type CardImage, type VisualizeMeta } from '../fragment.ts'
import { dataUrlOf, embedImages } from '../image-embed.ts'

/** How long one image load may take before the card shows its placeholder. */
const LOAD_TIMEOUT_MS = 15_000

/** Data URL characters kept in the cache before the oldest entries go. */
const CACHE_BUDGET = 96 * 1024 * 1024

const cache = new Map<string, Promise<string | undefined>>()
const sizes = new Map<string, number>()
let cached = 0

/** The fetch the loader uses; tests swap it. */
let fetchImpl: typeof fetch = (...args) => fetch(...args)

/**
 * Replace the loader's fetch and empty its cache (tests only).
 * @param impl - the fetch to use.
 */
export function setImageFetch(impl: typeof fetch): void {
  fetchImpl = impl
  cache.clear()
  sizes.clear()
  cached = 0
}

/**
 * Load one image as a data URL.
 * @param image - the reference from meta.
 * @returns the data URL, or undefined when it cannot be loaded.
 */
function loadImage(image: CardImage): Promise<string | undefined> {
  const hit = cache.get(image.id)
  if (hit !== undefined) return hit
  const url = new URL(`${IMAGE_ROUTE_PATH.slice(1)}?id=${encodeURIComponent(image.id)}`, document.baseURI).href
  const load = (async () => {
    try {
      const response = await fetchImpl(url, { credentials: 'same-origin', signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) })
      if (!response.ok) return undefined
      const data = new Uint8Array(await response.arrayBuffer())
      // The type comes from meta, which the tool set from the sniffed bytes.
      return dataUrlOf(image.type, data)
    } catch {
      return undefined
    }
  })()
  cache.set(image.id, load)
  void load.then((value) => {
    if (value === undefined) {
      cache.delete(image.id)
      return
    }
    sizes.set(image.id, value.length)
    cached += value.length
    for (const [id, size] of sizes) {
      if (cached <= CACHE_BUDGET || id === image.id) break
      cache.delete(id)
      sizes.delete(id)
      cached -= size
    }
  })
  return load
}

/**
 * The card's meta with its images embedded, once they have loaded. Hosts
 * narrow meta afresh on every render, so loading keys on the card's content,
 * not on the object.
 * @param meta - the card as persisted.
 * @returns the meta to render, or undefined while its images are loading. A
 *   card without images is returned as it is, synchronously.
 */
export function useCardImages(meta: VisualizeMeta): VisualizeMeta | undefined {
  const images = meta.images ?? []
  const key = images.map(image => `${image.src}\u0000${image.id}\u0000${image.type}`).join('\n')
  const [loaded, setLoaded] = useState<{ key: string; urls: ReadonlyMap<string, string> } | undefined>(undefined)
  useEffect(() => {
    if (images.length === 0) return
    let live = true
    void Promise.all(images.map(async image => [image.src, await loadImage(image)] as const)).then((settled) => {
      if (!live) return
      setLoaded({ key, urls: new Map(settled.flatMap(([src, url]) => url === undefined ? [] : [[src, url] as const])) })
    })
    return () => {
      live = false
    }
    // `key` stands for `images`, whose object identity changes every render.
  }, [key])
  const urls = loaded?.key === key ? loaded.urls : undefined
  const fragment = useMemo(
    () => urls === undefined ? undefined : embedImages(meta.fragment, urls),
    [meta.fragment, urls],
  )
  if (images.length === 0) return meta
  return fragment === undefined ? undefined : { ...meta, fragment }
}
