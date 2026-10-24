/**
 * Put resolved card images into the markup the frame renders: each
 * `<img data-viz-src="…">` whose source has a data URL gets `src` set to it,
 * as its first attribute so it wins over any `src` the fragment also wrote.
 * An image without one keeps no `src` and the frame stylesheet draws its
 * placeholder. Data URLs are what the unchanged frame CSP already admits
 * (`img-src data:`), and the bytes are in the document before any fragment
 * script runs, so a script that measures an image sees the real one.
 *
 * The expanded size is capped ({@link MAX_EMBEDDED_CHARS}): every tag that
 * names an image carries a full copy, so a fragment repeating one image
 * could otherwise blow the srcdoc up past what a renderer can hold. The tool
 * already refuses that budget per reference; this cap is the defence for a
 * card whose meta did not come from it (an old or hand-edited log). Past the
 * cap the remaining tags keep their placeholder. One copy per distinct image
 * would need a `blob:` URL, but a blob the host page creates belongs to the
 * host's origin and does not load in the opaque-origin frame, so `data:`
 * with a cap it is.
 *
 * Only markup is touched: script and style bodies and comments are copied
 * verbatim, so a script that builds image markup in a string never has an
 * attribute spliced into its quotes. Pure and DOM-free.
 *
 * @module @nagi-ovo/dsh-visualize/image-embed
 */

/** Raw-text blocks and comments to skip, or one `<img>` tag (quoted `>` allowed inside values). */
const TOKEN = /<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->|<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu

/** The `data-viz-src` attribute inside one tag, by quoting form; unquoted runs to whitespace or `>` as the lint scanner reads it. */
const SOURCE_ATTR = /\sdata-viz-src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu

/**
 * Most data URL characters one frame document embeds: the tool's 12 MB card
 * budget is 16 MiB as base64, plus headroom.
 */
export const MAX_EMBEDDED_CHARS = 20 * 1024 * 1024

/**
 * Splice data URLs into the fragment's image tags, in document order, until
 * the cap is spent.
 * @param fragment - the card's markup.
 * @param urls - data URL per raw `data-viz-src` value.
 * @param maxChars - cap on the data URL characters spliced in.
 * @returns the markup the frame document embeds.
 */
export function embedImages(fragment: string, urls: ReadonlyMap<string, string>, maxChars = MAX_EMBEDDED_CHARS): string {
  if (urls.size === 0) return fragment
  let left = maxChars
  return fragment.replaceAll(TOKEN, (token) => {
    if (!/^<img\b/iu.test(token)) return token
    const m = SOURCE_ATTR.exec(token)
    const url = m === null ? undefined : urls.get(m[1] ?? m[2] ?? m[3]!)
    // A data URL is base64 or percent-encoded, so it carries no `"`; refuse anything else.
    if (url === undefined || !url.startsWith('data:') || url.includes('"')) return token
    if (url.length > left) return token
    left -= url.length
    return `<img src="${url}"${token.slice(4)}`
  })
}

/**
 * Encode bytes as a base64 data URL.
 * @param type - the image's media type.
 * @param data - the bytes.
 * @returns `data:<type>;base64,…`.
 */
export function dataUrlOf(type: string, data: Uint8Array): string {
  let binary = ''
  // Chunked: one apply over megabytes overflows the argument limit.
  for (let at = 0; at < data.byteLength; at += 0x8000) {
    binary += String.fromCharCode(...data.subarray(at, at + 0x8000))
  }
  return `data:${type};base64,${btoa(binary)}`
}
