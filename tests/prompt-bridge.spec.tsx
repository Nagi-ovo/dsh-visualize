// @vitest-environment jsdom

/**
 * `dshViz.prompt(text)` hands a card's text back to the conversation as a
 * composer draft the reader sends. The frame runs model-written script, so
 * the parent decides: only this card's own frame, only on a click, only into
 * an empty idle composer, never a send — and hosts without a session input
 * (dsh before 0.1.7) keep the card exactly as it was.
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { VisualizeMeta } from '../src/fragment.ts'
import { buildFrameDoc, PROMPT_MESSAGE_TYPE } from '../src/shell.ts'
import { Frame } from '../src/client/VisualizeCard.tsx'
import { apply } from '../src/client/index.tsx'
import {
  draftPrompt, PROMPT_MAX_CHARS, promptSinkFor, readPromptMessage, type ComposerInput, type PromptSink,
} from '../src/client/prompt-bridge.ts'

/** A composer facade recording what the bridge did to it. */
function composer(draft = '', phase = 'plain') {
  const calls: string[] = []
  const input: ComposerInput = {
    setDraft: text => { calls.push(`draft:${text}`) },
    focus: () => { calls.push('focus') },
    notify: (level, text) => { calls.push(`notify:${level}:${text}`) },
    state: { getSnapshot: () => ({ draft, phase }) },
  }
  return { input, calls }
}

describe('frame helper', () => {
  const base = { fragment: '<div id="q">?</div>', title: 'Q', themeVars: {}, colorScheme: 'light', reportToken: 'call-7' } as const

  it('offers prompt only where the card relays it', () => {
    const on = buildFrameDoc({ ...base, promptable: true })
    expect(on).toContain('var PROMPT_TOKEN = "call-7";')
    expect(on).toContain(PROMPT_MESSAGE_TYPE)
    expect(on).toContain('canPrompt: PROMPT_TOKEN !== null')
    // New-window tabs, thumbnails and the streaming preview build without it.
    expect(buildFrameDoc(base)).toContain('var PROMPT_TOKEN = null;')
  })
})

describe('readPromptMessage', () => {
  const message = (text: unknown, extra: Record<string, unknown> = {}) =>
    ({ type: PROMPT_MESSAGE_TYPE, token: 't', text, ...extra })

  it('accepts trimmed text for this frame and drops control characters', () => {
    expect(readPromptMessage(message('  我选 B\u0007\n为什么？ '), 't')).toBe('我选 B\n为什么？')
  })

  it('rejects other types, other tokens, non-strings, blanks and oversized text', () => {
    expect(readPromptMessage(message('x', { type: 'dsh-visualize:height' }), 't')).toBeUndefined()
    expect(readPromptMessage(message('x'), 'other')).toBeUndefined()
    expect(readPromptMessage(message(42), 't')).toBeUndefined()
    expect(readPromptMessage(message(' \n '), 't')).toBeUndefined()
    expect(readPromptMessage(message('x'.repeat(PROMPT_MAX_CHARS + 1)), 't')).toBeUndefined()
    expect(readPromptMessage(null, 't')).toBeUndefined()
  })
})

describe('draftPrompt', () => {
  it('fills an empty idle composer and focuses it, never sending', () => {
    const { input, calls } = composer()
    expect(draftPrompt(input, 'hi')).toBe('drafted')
    expect(calls).toEqual(['draft:hi', 'focus'])
  })

  it('keeps a draft the reader is writing and says why', () => {
    const { input, calls } = composer('half a thought')
    expect(draftPrompt(input, 'hi')).toBe('kept-draft')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/^notify:info:/u)
  })

  it('leaves a composer mid-submission alone', () => {
    const { input, calls } = composer('', 'submitting')
    expect(draftPrompt(input, 'hi')).toBe('busy')
    expect(calls).toEqual([])
  })
})

describe('promptSinkFor', () => {
  /** A host whose session scope exposes the given conversation service. */
  function host(conversation: unknown) {
    const scope = { get: (name: string) => name === 'conversation' ? conversation : undefined }
    return { get: (name: string) => name === 'sessions' ? { scope: (id: string) => id === 's1' ? scope : undefined } : undefined }
  }

  it('resolves the session input facade on each prompt', () => {
    const { input, calls } = composer()
    let resolved: unknown
    const sink = promptSinkFor(host({ input: { for: (scope: unknown) => { resolved = scope; return input } } }), 's1')
    expect(sink?.('hello')).toBe('drafted')
    expect(resolved).toBeDefined()
    expect(calls).toEqual(['draft:hello', 'focus'])
  })

  it('offers nothing on hosts without a session input or without a session id', () => {
    expect(promptSinkFor(host({}), 's1')).toBeUndefined()
    expect(promptSinkFor(host({ input: { for: () => undefined } }), undefined)).toBeUndefined()
    expect(promptSinkFor({ get: () => undefined }, 's1')).toBeUndefined()
  })

  it('declines once the session is gone', () => {
    const sink = promptSinkFor(host({ input: { for: () => { throw new Error('not retained') } } }), 's1')
    expect(sink?.('hello')).toBe('unavailable')
  })
})

describe('registrations', () => {
  it('inject a per-session sink into the toolview and the turn tail', () => {
    const options = new Map<string, { inject?: (sessionId: unknown) => Record<string, unknown> }>()
    const conversation = { input: { for: () => composer().input } }
    const scope = { get: (name: string) => name === 'conversation' ? conversation : undefined }
    const all: Record<string, unknown> = {
      sessions: { scope: () => scope },
      uiConversation: { events: { register: () => () => undefined } },
    }
    const host = {
      slots: {
        inject(_name: string, install: () => unknown) { install() },
        register(entry: { name: string; inject?: (sessionId: unknown) => Record<string, unknown> }) {
          options.set(entry.name, entry)
          return () => undefined
        },
      },
      get: (name: string) => all[name],
      inject(deps: readonly string[], callback: (scope: unknown) => void) {
        if (deps.every(dep => all[dep] !== undefined)) callback(host)
      },
    }
    apply(host as never)
    for (const name of ['tool.call.toolview', 'conversation.chat.turnTail']) {
      const injected = options.get(name)?.inject?.('s1')
      expect(typeof injected?.visualizePrompt, name).toBe('function')
    }
    // No session, no sink: the card builds its frame with canPrompt false.
    expect(options.get('tool.call.toolview')?.inject?.(undefined).visualizePrompt).toBeUndefined()
  })
})

describe('card relay', () => {
  const META: VisualizeMeta = {
    kind: 'visualize', fragment: '<button id="b">B</button>', title: 'Quiz', mode: 'inline', path: '', style: 'whale',
  }

  beforeAll(() => {
    window.matchMedia ??= (() => ({ addEventListener() {}, removeEventListener() {} })) as never
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  /**
   * Mount one card.
   * @param prompt - injected sink, or undefined.
   * @returns the card's iframe.
   */
  function mount(prompt: PromptSink | undefined) {
    const root = document.createElement('div')
    document.body.append(root)
    act(() => { createRoot(root).render(<Frame meta={META} callId="call-1" prompt={prompt} />) })
    const frame = root.querySelector('iframe')!
    // A click inside the frame makes it the page's active element.
    frame.focus()
    return frame
  }

  /** Post a prompt message as if from `source`. */
  function post(source: MessageEventSource | null, text = '选 B') {
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: PROMPT_MESSAGE_TYPE, token: 'call-1', text }, source }))
    })
  }

  it('relays its own frame’s prompt into the sink', () => {
    const sink = vi.fn<PromptSink>(() => 'drafted')
    const frame = mount(sink)
    expect(frame.getAttribute('srcdoc')).toContain('var PROMPT_TOKEN = "call-1";')
    post(frame.contentWindow)
    expect(sink).toHaveBeenCalledWith('选 B')
  })

  it('ignores a message from any other window, even with the right token', () => {
    const sink = vi.fn<PromptSink>(() => 'drafted')
    mount(sink)
    post(window)
    post(null)
    expect(sink).not.toHaveBeenCalled()
  })

  it('ignores a prompt while the reader is elsewhere on the page, as on load', () => {
    const sink = vi.fn<PromptSink>(() => 'drafted')
    const frame = mount(sink)
    const elsewhere = document.body.appendChild(document.createElement('button'))
    elsewhere.focus()
    post(frame.contentWindow)
    expect(sink).not.toHaveBeenCalled()
  })

  it('ignores a prompt fired without a user activation', () => {
    const sink = vi.fn<PromptSink>(() => 'drafted')
    const frame = mount(sink)
    Object.defineProperty(navigator, 'userActivation', { value: { isActive: false }, configurable: true })
    try {
      post(frame.contentWindow)
    } finally {
      delete (navigator as { userActivation?: unknown }).userActivation
    }
    expect(sink).not.toHaveBeenCalled()
  })

  it('accepts at most one prompt per interval', () => {
    const sink = vi.fn<PromptSink>(() => 'drafted')
    const frame = mount(sink)
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000)
    post(frame.contentWindow, 'one')
    post(frame.contentWindow, 'two')
    now.mockReturnValue(11_500)
    post(frame.contentWindow, 'three')
    expect(sink.mock.calls.map(call => call[0])).toEqual(['one', 'three'])
  })

  it('builds a frame without prompt where nothing is injected', () => {
    const frame = mount(undefined)
    expect(frame.getAttribute('srcdoc')).toContain('var PROMPT_TOKEN = null;')
  })
})
