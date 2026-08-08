import { describe, expect, it } from 'vitest'
import { buildFrameDoc, FRAME_CSP, HEIGHT_MESSAGE_TYPE, sanitizeCssValue } from '../src/shell.ts'

const options = {
  fragment: '<div id="lab">hi</div>',
  title: 'A <Lab> & Co',
  themeVars: { primary: 'rgb(65, 118, 230)', border: 'red; } body { background: hotpink' },
  colorScheme: 'dark',
  reportToken: 'call-1',
} as const

describe('buildFrameDoc', () => {
  const doc = buildFrameDoc({ ...options })

  it('confines the frame with its own CSP', () => {
    expect(doc).toContain(`<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">`)
    expect(FRAME_CSP).toContain("default-src 'none'")
    expect(FRAME_CSP).toContain('connect-src blob: data:')
    expect(FRAME_CSP).toContain("frame-src 'none'")
  })

  it('embeds the fragment verbatim and escapes the title', () => {
    expect(doc).toContain(options.fragment)
    expect(doc).toContain('<title>A &lt;Lab&gt; &amp; Co</title>')
  })

  it('bridges sane palette values and drops malformed ones', () => {
    expect(doc).toContain('--dsh-viz-primary: rgb(65, 118, 230);')
    expect(doc).not.toContain('hotpink')
    expect(doc).toContain('color-scheme: dark;')
  })

  it('installs the height reporter tagged with the report token', () => {
    expect(doc).toContain(HEIGHT_MESSAGE_TYPE)
    expect(doc).toContain('"call-1"')
    expect(doc).toContain('ResizeObserver')
  })
})

describe('sanitizeCssValue', () => {
  it('passes resolved colors and trims whitespace', () => {
    expect(sanitizeCssValue(' rgba(0, 0, 0, 0.1) ')).toBe('rgba(0, 0, 0, 0.1)')
  })

  it('drops values carrying declaration or markup delimiters', () => {
    for (const hostile of ['red;', 'red }', 'url(x){', '<script>']) {
      expect(sanitizeCssValue(hostile)).toBe('')
    }
  })
})
