/**
 * The card→composer bridge behind `dshViz.prompt`: a frame asks for some text
 * to be put into the chat composer, and the card puts it there as a draft the
 * reader reviews and sends. Nothing is ever sent on the frame's behalf — the
 * frame runs model-written script, so the reader stays the one who speaks.
 *
 * Every gate lives on the parent side, since the frame's own code is
 * untrusted: the message must come from this card's own frame window (the
 * token alone is readable by the fragment), while the reader is interacting
 * with that frame (so a card cannot fill the draft on load), within the
 * length and rate limits, and into an empty, idle composer — `setDraft` replaces the whole draft, chips included, so a draft
 * the reader is writing is never overwritten.
 *
 * Host surface (dsh 0.1.7+): `sessions.scope(id).get('conversation').input
 * .for(scope)` yields the session's input facade (`setDraft`, `focus`,
 * `notify`, `state`). Older hosts lack it and the bridge stays off.
 *
 * @module @nagi-ovo/dsh-visualize/client/prompt-bridge
 */

import { PROMPT_MESSAGE_TYPE } from '../shell.ts'

/** Longest prompt text accepted, in UTF-16 code units. */
export const PROMPT_MAX_CHARS = 2000

/** Minimum gap between two accepted prompts from one frame. */
export const PROMPT_INTERVAL_MS = 1000

/** What became of one prompt request. */
export type PromptOutcome =
  /** The text is in the composer, focused, waiting for the reader. */
  | 'drafted'
  /** The reader already has a draft; it stays and a notice says why. */
  | 'kept-draft'
  /** The composer is mid-submission; nothing changed. */
  | 'busy'
  /** The host or session offers no input facade. */
  | 'unavailable'

/** Card-side sink a registration injects: put text into this session's composer. */
export type PromptSink = (text: string) => PromptOutcome

/** The slice of the host's per-session input facade the bridge uses. */
export interface ComposerInput {
  setDraft(text: string): void
  focus?(): void
  notify?(level: 'info' | 'error', text: string): void
  readonly state?: { getSnapshot(): { readonly draft?: string; readonly phase?: string } }
}

/**
 * Read one frame message as a prompt request.
 * @param data - the message payload.
 * @param token - this frame's correlation token.
 * @returns the cleaned prompt text, or undefined when the message is not a valid prompt.
 */
export function readPromptMessage(data: unknown, token: string): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const message = data as { type?: unknown; token?: unknown; text?: unknown }
  if (message.type !== PROMPT_MESSAGE_TYPE || message.token !== token) return undefined
  if (typeof message.text !== 'string') return undefined
  // Control characters other than tab and newline have no place in a draft.
  // eslint-disable-next-line no-control-regex
  const text = message.text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/gu, '').trim()
  if (text === '' || text.length > PROMPT_MAX_CHARS) return undefined
  return text
}

/**
 * Whether the reader is interacting with this frame right now. Activation
 * alone is not enough: it lingers for seconds after any click on the chat
 * page, so a card that loads right after the reader opens a session would
 * pass. Focus pins it to this frame — a click inside the frame makes it the
 * page's active element, and a cross-origin frame cannot take focus without
 * the reader's own gesture. Browsers without `userActivation` rely on focus.
 * @param frame - the card's iframe.
 * @returns true when the frame holds focus during a user activation.
 */
export function readerIsInFrame(frame: HTMLIFrameElement): boolean {
  if (frame.ownerDocument.activeElement !== frame) return false
  const activation = (navigator as { userActivation?: { isActive?: boolean } }).userActivation
  return typeof activation?.isActive !== 'boolean' || activation.isActive
}

/**
 * Put prompt text into the composer when it is idle and empty.
 * @param input - the session's input facade.
 * @param text - cleaned prompt text.
 * @returns the outcome.
 */
export function draftPrompt(input: ComposerInput, text: string): PromptOutcome {
  const state = input.state?.getSnapshot()
  if (state?.phase !== undefined && state.phase !== 'plain') return 'busy'
  if (state?.draft !== undefined && state.draft.trim() !== '') {
    input.notify?.('info', keptDraftNotice())
    return 'kept-draft'
  }
  input.setDraft(text)
  input.focus?.()
  return 'drafted'
}

/** Minimal host shape the sink resolves through, feature-detected at call time. */
interface SessionsHost {
  get(name: string): unknown
}

/**
 * Resolve a session's input facade, or undefined on hosts without one.
 * @param host - client context.
 * @param sessionId - the session the card belongs to.
 * @returns the facade.
 */
export function composerFor(host: SessionsHost, sessionId: unknown): ComposerInput | undefined {
  if (typeof sessionId !== 'string' || sessionId === '') return undefined
  try {
    const sessions = host.get('sessions') as { scope?(id: string): SessionsHost | undefined } | undefined
    const scope = typeof sessions?.scope === 'function' ? sessions.scope(sessionId) : undefined
    const conversation = scope?.get('conversation') as { input?: { for?(scope: unknown): unknown } } | undefined
    if (scope === undefined || typeof conversation?.input?.for !== 'function') return undefined
    const input = conversation.input.for(scope) as Partial<ComposerInput> | undefined
    return typeof input?.setDraft === 'function' ? input as ComposerInput : undefined
  } catch {
    // `input.for` throws for a session that is no longer retained.
    return undefined
  }
}

/**
 * The sink a slot registration injects for one session, or undefined where
 * the host has no session input facade (dsh before 0.1.7) — the card then
 * builds its frame with `canPrompt` false. The facade itself resolves on
 * every prompt, so a session that went away since mount just declines.
 * @param host - client context.
 * @param sessionId - the session the card renders in.
 * @returns the sink, or undefined.
 */
export function promptSinkFor(host: SessionsHost, sessionId: unknown): PromptSink | undefined {
  if (typeof sessionId !== 'string' || sessionId === '') return undefined
  try {
    const sessions = host.get('sessions') as { scope?(id: string): SessionsHost | undefined } | undefined
    const scope = typeof sessions?.scope === 'function' ? sessions.scope(sessionId) : undefined
    const conversation = scope?.get('conversation') as { input?: { for?: unknown } } | undefined
    if (typeof conversation?.input?.for !== 'function') return undefined
  } catch {
    return undefined
  }
  return (text) => {
    const input = composerFor(host, sessionId)
    return input === undefined ? 'unavailable' : draftPrompt(input, text)
  }
}

/** Notice shown when a card's prompt meets a draft the reader is writing. */
function keptDraftNotice(): string {
  return document.documentElement.lang.toLowerCase().startsWith('zh')
    ? '输入框里已有草稿，卡片的内容没有写入'
    : 'The composer already has a draft, so the card’s text was not inserted'
}
