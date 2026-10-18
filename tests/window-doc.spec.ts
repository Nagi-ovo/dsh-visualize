// @vitest-environment jsdom

/**
 * The windowed page opens at the dsh web origin (a Blob URL), so model markup
 * must never become part of it: the fragment may only reach the browser
 * inside the sandboxed frame's `srcdoc`, whatever quotes or tags it contains.
 */

import { describe, expect, it } from 'vitest'
import { buildFrameDoc } from '../src/shell.ts'
import { buildWindowDoc } from '../src/window-doc.ts'

/** A fragment written to break out of a double-quoted attribute. */
const HOSTILE = `<p>"'></iframe><script>window.pwned = localStorage.getItem('token')</script><iframe srcdoc="</p>`
  + '&quot;><img src=x onerror="alert(1)">'

function windowPage(fragment: string, title = 'Lab') {
  const frameDoc = buildFrameDoc({ fragment, title, themeVars: {}, colorScheme: 'dark', reportToken: 'window:call-1' })
  const html = buildWindowDoc({ frameDoc, title, colorScheme: 'dark', background: '#101014' })
  return { frameDoc, doc: new DOMParser().parseFromString(html, 'text/html') }
}

describe('buildWindowDoc', () => {
  it('carries the fragment only inside one sandboxed frame', () => {
    const { frameDoc, doc } = windowPage(HOSTILE)

    expect(doc.querySelectorAll('script')).toHaveLength(0)
    expect(doc.querySelectorAll('img')).toHaveLength(0)
    const frames = doc.querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    const frame = frames[0]!
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
    // Byte for byte the in-chat frame document, CSP included.
    expect(frame.getAttribute('srcdoc')).toBe(frameDoc)
    expect(frame.getAttribute('srcdoc')).toContain('http-equiv="Content-Security-Policy"')
    expect(doc.body.children).toHaveLength(1)
  })

  it('titles the tab with the card title and themes it as the host was', () => {
    const { doc } = windowPage('<p>x</p>', 'p99 <延迟> & "吞吐"')
    expect(doc.title).toBe('p99 <延迟> & "吞吐"')
    const style = doc.querySelector('style')!.textContent!
    expect(style).toContain('color-scheme: dark')
    expect(style).toContain('background: #101014')
  })

  it('drops a host color that could escape the style block', () => {
    const html = buildWindowDoc({ frameDoc: '', title: 't', colorScheme: 'light', background: 'red}</style><script>x()</script>' })
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelectorAll('script')).toHaveLength(0)
    expect(doc.querySelector('style')!.textContent).toContain('background: #ffffff')
  })
})
