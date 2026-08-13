import { describe, expect, it } from 'vitest'
import {
  applyFragmentPatch,
  extractStreamingFragment,
  trimStreamingScripts,
  validateFragment,
  visualizeMetaFrom,
} from '../src/fragment.ts'

describe('applyFragmentPatch', () => {
  it('replaces the single matching site and leaves the rest byte-identical', () => {
    const base = '<div id="lab"><h2>Latency</h2><p>p99 480ms</p></div>'
    expect(applyFragmentPatch(base, 'p99 480ms', 'p99 120ms'))
      .toBe('<div id="lab"><h2>Latency</h2><p>p99 120ms</p></div>')
  })

  it('deletes the matched region when new_str is empty', () => {
    expect(applyFragmentPatch('<p>keep</p><p>drop</p>', '<p>drop</p>', '')).toBe('<p>keep</p>')
  })

  it('refuses an ambiguous old_str and names how many sites matched', () => {
    expect(() => applyFragmentPatch('<td>0</td><td>0</td><td>0</td>', '<td>0</td>', '<td>1</td>'))
      .toThrow(/appears 3 times/)
  })

  it('reports where a near-miss diverged, quoting the card\'s real bytes', () => {
    const base = '<div class="viz-stat"><span>P99 latency</span></div>'
    expect(() => applyFragmentPatch(base, '<span>P99 latency is 480ms</span>', '<span>ok</span>'))
      .toThrow(/first \d+ characters do match, at offset 22, where the card actually reads "<span>P99 latency<\/span>/)
  })

  it('tells the caller to re-render when nothing matched at all', () => {
    expect(() => applyFragmentPatch('<div>chart</div>', 'zzzzzzzzzzzzzzzzz', 'x'))
      .toThrow(/None of it matched/)
  })

  it('rejects an empty old_str rather than inserting at the start', () => {
    expect(() => applyFragmentPatch('<div>x</div>', '', 'y')).toThrow(/old_str is empty/)
  })
})

describe('validateFragment', () => {
  it('accepts an inline fragment and returns its UTF-8 size', () => {
    expect(validateFragment('<div id="lab">你好</div>', 1000)).toBe(new TextEncoder().encode('<div id="lab">你好</div>').length)
  })

  it('rejects an empty or whitespace-only fragment', () => {
    expect(() => validateFragment('   \n', 1000)).toThrow(/empty/)
  })

  it('rejects a fragment over the byte ceiling', () => {
    expect(() => validateFragment('x'.repeat(11), 10)).toThrow(/over the 10-byte limit/)
  })

  it('rejects document-skeleton tags case-insensitively', () => {
    for (const skeleton of ['<!DOCTYPE html>', '<HTML>', '<head>', '< body class="x">']) {
      expect(() => validateFragment(`${skeleton}<div>x</div>`, 1000)).toThrow(/document-skeleton/)
    }
  })

  it('does not misread non-skeleton tags or text mentions', () => {
    expect(validateFragment('<header><h1>heads or bodies</h1></header>', 1000)).toBeGreaterThan(0)
  })
})

describe('visualizeMetaFrom', () => {
  const valid = { kind: 'visualize', fragment: '<div id="x"></div>', title: 'X', mode: 'inline', path: 'viz/x.html' }

  it('narrows a well-formed persisted descriptor', () => {
    expect(visualizeMetaFrom(valid)).toEqual(valid)
  })

  it('declines wire shapes it cannot trust', () => {
    expect(visualizeMetaFrom(undefined)).toBeUndefined()
    expect(visualizeMetaFrom({ ...valid, kind: 'artifact' })).toBeUndefined()
    expect(visualizeMetaFrom({ ...valid, fragment: 42 })).toBeUndefined()
    expect(visualizeMetaFrom({ ...valid, mode: 'full' })).toBeUndefined()
  })
})

describe('extractStreamingFragment', () => {
  it('is undefined before the fragment key streams in', () => {
    expect(extractStreamingFragment('{"title": "X", "fr')).toBeUndefined()
  })

  it('decodes a complete argument object', () => {
    expect(extractStreamingFragment('{"fragment": "<div id=\\"x\\">a\\nb</div>", "mode": "wide"}'))
      .toBe('<div id="x">a\nb</div>')
  })

  it('decodes an unterminated prefix and drops a half-streamed escape', () => {
    expect(extractStreamingFragment('{"fragment": "<div>hi')).toBe('<div>hi')
    expect(extractStreamingFragment('{"fragment": "line\\')).toBe('line')
    expect(extractStreamingFragment('{"fragment": "u\\u26')).toBe('u')
  })

  it('decodes unicode escapes', () => {
    expect(extractStreamingFragment('{"fragment": "\\u4f60\\u597d"}')).toBe('你好')
  })
})

describe('trimStreamingScripts', () => {
  it('keeps complete script blocks for on-arrival execution', () => {
    const markup = '<div></div><script>draw()</script><p>x</p>'
    expect(trimStreamingScripts(markup)).toBe(markup)
  })

  it('drops a trailing script whose body is still streaming', () => {
    expect(trimStreamingScripts('<div></div><script>var x = 1;')).toBe('<div></div>')
    expect(trimStreamingScripts('<div></div><script defer src="x')).toBe('<div></div>')
  })

  it('judges completeness by the LAST script, not an earlier closed one', () => {
    expect(trimStreamingScripts('<script>a()</script><script>b(')).toBe('<script>a()</script>')
  })
})
