/**
 * Same-turn self-repair: the lint gate only speaks when the model calls
 * `visualize`, so a turn can still end with a card the user cannot use. At
 * the host's stop boundary this module looks at what the turn did and, when
 * one of the gaps below is plainly there, steers one short correction into
 * the same turn, so the model takes another step instead of closing.
 *
 * Host contract (dsh 0.1.1 through 0.2.1-rc.2, unchanged): the serial event
 * `agent/turn-stopping` with `{ agent, turn, signal }` fires when a step
 * finished `completed` or `max-tokens` with no next-step input queued; a
 * listener that calls `agent.steer(message)` makes the loop run another step.
 * A failed step throws before the boundary and a cancelled one aborts
 * `signal`, so neither reaches a steer here. Facts about the turn come from
 * the durable `session/event` stream as it is written (synchronous history
 * reads are deprecated in 0.2.x). Both names are feature-detected at use: a
 * host that never emits them, or an agent without `steer`, gets nothing.
 *
 * Gaps and the signals each one needs (all of them, not any):
 *
 * 1. `failed-call` — the last `visualize` result of the turn is our own
 *    rejection (`invalid visualization…`), no later call succeeded, the
 *    rejection is not the lint gate's STOP (the model was told to give up
 *    and explain), and the text written after it does not already admit the
 *    failure (fail/error/cannot/无法/失败…). Host refusals (approval denied,
 *    aborted dispatch) never start with that prefix, so a user who said no is
 *    not overruled.
 * 2. `card-warnings` — a card created or patched this turn, re-linted in its
 *    final state, still has a finding that breaks it: VZ102 (the script looks
 *    up an id nothing has, so the interaction is dead), VZ106 (a relative
 *    URL that cannot load in the sandbox) or VZ107 (a relative image path
 *    that should have been `data-viz-src`). Taste warnings — hard-coded
 *    colours (VZ101), loose CDN ranges (VZ105), the canvas font (VZ104), a
 *    missing root id (VZ103), skipped stages (VZ199) — never steer: the card
 *    works, and VZ101 in particular fires on product-mockup colours the skill
 *    allows.
 * 3. `pasted-markup` — no `visualize` call and no file write (`write`,
 *    `edit`, …) this turn; the final reply has a *closed* ```html / ```htm /
 *    ```svg fence whose body is card-shaped: no document skeleton (a full
 *    document is a file deliverable), at least {@link MIN_FENCE_LINES}
 *    non-blank lines, and a `<script>`, `<svg>` or `<canvas>`; and the user's
 *    prompt this turn asks to see something (visualize, chart, draw, 可视化,
 *    画, 演示…) while saying nothing about code, files or web tech (html,
 *    css, code, file, component, page, 代码, 文件, 网页…) and containing no
 *    code itself.
 * 4. `promised-card` — no `visualize` call and no file write this turn, the
 *    user did not ask for code, and the reply's last sentence is an
 *    unconditional promise to draw a card ("Let me visualize this:", "I'll
 *    render an interactive card…", "我来画一张卡片：") — not "if you want…",
 *    not a question, not a chart in their app.
 *
 * False positives, and why they stay rare:
 * - "Write me an HTML page / give me the SVG code": the prompt names code or
 *   web tech, which vetoes 3 and 4 outright. The skill sends such requests to
 *   project files, and a file write this turn vetoes them too.
 * - A teaching snippet ("how does flexbox work?"): no visual verb in the
 *   prompt, usually under {@link MIN_FENCE_LINES} lines, usually no script,
 *   svg or canvas. Each alone vetoes it.
 * - A user who pasted markup and asked about it: the prompt contains code.
 * - A deliberate stop after a failure: the lint gate's STOP and any
 *   admission in the reply both veto 1. A cancelled or errored turn never
 *   reaches the boundary.
 * - Subagent sessions are skipped: their reply goes to a parent, not a user.
 * - Every correction still lets the model decline ("if the user wanted the
 *   code, end with one line"), so a miss-fire costs one short extra step.
 *
 * It can never loop: at most {@link MAX_STEERS_PER_TURN} corrections per
 * turn, each trigger fingerprinted by its content and corrected at most once
 * per turn, and both are counted before `steer` is called. State lives only
 * for the open turn, keyed by session id, and is dropped at `turn/end`; a
 * plugin loaded mid-turn has not seen that turn start and stays silent.
 *
 * @module @nagi-ovo/dsh-visualize/self-repair
 */

import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { visualizeMetaFrom, VISUALIZE_TOOL_NAME } from './fragment.ts'
import { formatFindings, lintFragment, type LintCode, type LintFinding } from './lint.ts'

/** Package name the steered messages are attributed to. */
export const SELF_REPAIR_PLUGIN = '@nagi-ovo/dsh-visualize'
/**
 * Source kind of a steered correction in session format v4 (dsh 0.1.7+). It
 * is the kind the v3→v4 migration gives a `{ kind: 'plugin', plugin }`
 * record of this package, so old and new corrections read the same.
 */
export const SELF_REPAIR_SOURCE_KIND = `plugin:${SELF_REPAIR_PLUGIN}`
/** Corrections steered into one turn, whatever their kind. */
export const MAX_STEERS_PER_TURN = 2
/** Non-blank lines a fenced block needs before it reads as a whole card. */
export const MIN_FENCE_LINES = 8

/** Warning codes whose card is broken, not merely off-style. */
const BREAKING_WARNINGS: ReadonlySet<LintCode> = new Set<LintCode>(['VZ102', 'VZ106', 'VZ107'])
/** Tools that put files in the project; a turn that used one built a deliverable. */
const FILE_TOOLS: ReadonlySet<string> = new Set(['write', 'edit', 'multi_edit', 'apply_patch', 'write_file', 'edit_file', 'create_file', 'notebook_edit'])
/** Open turns tracked at once; a host never has this many, the bound only guards a leak. */
const MAX_TRACKED_TURNS = 256

/** What one turn did, as far as the gaps care. */
export interface TurnFacts {
  /** Text of the user's own messages this turn (source `user`). */
  userText: string
  /** Text of the latest assistant message. */
  finalText: string
  /** The latest assistant message was cut off by cancellation. */
  finalInterrupted: boolean
  /** Assistant text written after the latest `visualize` result. */
  textAfterVisualize: string
  /** Any `visualize` call this turn, whatever its outcome. */
  visualizeCalled: boolean
  /** Any project-file write this turn. */
  fileToolCalled: boolean
  /** Outcome of the latest `visualize` result this turn. */
  lastVisualize: { ok: true } | { ok: false; text: string } | undefined
  /** Cards created or patched this turn, by path, in their latest state. */
  cards: Map<string, { title: string; fragment: string }>
}

/** One correction the turn qualifies for. */
export interface RepairPlan {
  kind: 'failed-call' | 'card-warnings' | 'pasted-markup' | 'promised-card'
  /** Content fingerprint: the same trigger is corrected at most once per turn. */
  fingerprint: string
  /** The model-facing correction. */
  text: string
}

/** Empty facts for a turn that just started. */
export function emptyTurnFacts(): TurnFacts {
  return {
    userText: '',
    finalText: '',
    finalInterrupted: false,
    textAfterVisualize: '',
    visualizeCalled: false,
    fileToolCalled: false,
    lastVisualize: undefined,
    cards: new Map(),
  }
}

/**
 * Every correction the turn qualifies for, most urgent first.
 * @param facts - what the turn did.
 * @returns the candidate corrections; empty when the turn is fine.
 */
export function planRepairs(facts: TurnFacts): RepairPlan[] {
  const plans: RepairPlan[] = []
  const last = facts.lastVisualize
  if (last !== undefined && !last.ok && isOwnRejection(last.text) && !admitsFailure(facts.textAfterVisualize)) {
    plans.push({
      kind: 'failed-call',
      fingerprint: fingerprint('failed-call', last.text),
      text: `${TAG} Your last visualize call failed, so nothing rendered and the user sees no card. `
        + 'Apply the fixes that error listed and call visualize again now. '
        + 'If the card cannot be made to pass, tell the user in one sentence what blocks it instead.',
    })
  }
  for (const [path, card] of facts.cards) {
    const findings = breakingFindings(card.fragment)
    if (findings.length === 0) continue
    plans.push({
      kind: 'card-warnings',
      fingerprint: fingerprint('card-warnings', path, ...findings.map(f => `${f.code}@${f.offset}:${f.excerpt}`)),
      text: `${TAG} The card "${card.title}" rendered, but these findings leave it broken:\n${formatFindings(findings)}\n`
        + `Patch it now: visualize with action "update", path "${path}", its title restated. `
        + 'Then end your reply; do not mention this check.',
    })
  }
  if (facts.visualizeCalled || facts.fileToolCalled || facts.finalInterrupted || asksForCode(facts.userText)) return plans
  const fence = wantsVisual(facts.userText) ? cardShapedFence(facts.finalText) : undefined
  if (fence !== undefined) {
    plans.push({
      kind: 'pasted-markup',
      fingerprint: fingerprint('pasted-markup', fence),
      text: `${TAG} Your reply pastes HTML/SVG markup as a code block, so the user sees source code, not a rendered card. `
        + 'Call visualize now with that markup as `fragment` (a fragment only; load the visualize skill first if you have not), '
        + 'then add one or two sentences and do not paste the markup again. '
        + 'If the user wanted the code itself, end your turn with one short line instead.',
    })
  }
  const promise = fence === undefined ? promisedCard(facts.finalText) : undefined
  if (promise !== undefined) {
    plans.push({
      kind: 'promised-card',
      fingerprint: fingerprint('promised-card', promise),
      text: `${TAG} You said you would show a card, but the turn is ending without a visualize call. `
        + 'Call visualize now. If you decided against a card, end your turn with one short line.',
    })
  }
  return plans
}

/** Prefix that tells the model (and a reader of the log) who is speaking. */
const TAG = '[dsh-visualize]'

/** Our tool's own rejection, as the host words a thrown execute error, and not the gate's STOP. */
function isOwnRejection(text: string): boolean {
  return /^(?:Error:\s*)?invalid visualization/u.test(text.trimStart()) && !/\bSTOP:/u.test(text)
}

/** The model already told the user the card did not work. */
function admitsFailure(text: string): boolean {
  return /\b(?:fail(?:s|ed|ing|ure)?|errors?|couldn't|could not|can't|cannot|unable|blocked|didn't render|did not render|not render)\b/iu.test(text)
    || /失败|错误|报错|无法|没能|未能|不能|渲染不了|没有渲染|没渲染/u.test(text)
}

/** Breaking findings of a card in its final state. */
function breakingFindings(fragment: string): LintFinding[] {
  try {
    return lintFragment(fragment, Number.MAX_SAFE_INTEGER).findings
      .filter(f => f.severity === 'warn' && BREAKING_WARNINGS.has(f.code))
  } catch {
    // The linter fails open per stage; anything else is a reason not to steer.
    return []
  }
}

/** The prompt mentions code, files, or web tech, or carries code itself. */
function asksForCode(text: string): boolean {
  return /\b(?:html?|css|svg|xml|js|javascript|typescript|jsx|tsx|react|vue|svelte|angular|tailwind|code|snippets?|source|markup|files?|template|components?|website|web ?page|landing page|front-?end|embed|copy|paste|download|save|export)\b/iu.test(text)
    || /代码|源码|源文件|文件|模板|组件|网页|网站|前端|落地页|片段|嵌入|复制|粘贴|下载|保存|导出|页面|标签/u.test(text)
    || /```|<\/?[a-z][\w-]*[\s/>]/iu.test(text)
}

/** The prompt asks to see something. */
function wantsVisual(text: string): boolean {
  return /visuali[sz]|\bchart|\bplot|\bgraph|diagram|\bdraw|sketch|animat|simulat|interactive|illustrat|\bdemo|show me|dashboard|explorable/iu.test(text)
    || /可视化|画|图|演示|动画|模拟|交互|直观|展示|卡片/u.test(text)
}

/**
 * The body of the last closed, card-shaped html/svg fence in a reply.
 * @param text - the assistant reply.
 * @returns the fence body, or undefined when no fence qualifies.
 */
export function cardShapedFence(text: string): string | undefined {
  let found: string | undefined
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const open = /^ {0,3}(`{3,}|~{3,})[ \t]*([\w-]*)[^\n`]*$/u.exec(lines[i]!)
    if (open === null) continue
    const marker = open[1]!
    const closeAt = lines.findIndex((line, j) => j > i && new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`, 'u').test(line))
    if (closeAt === -1) break
    const body = lines.slice(i + 1, closeAt).join('\n')
    if (/^(?:html?|svg)$/iu.test(open[2]!) && isCardShaped(body)) found = body
    i = closeAt
  }
  return found
}

/** A whole card fragment, not a document and not a snippet. */
function isCardShaped(body: string): boolean {
  if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/iu.test(body)) return false
  if (body.split('\n').filter(line => line.trim().length > 0).length < MIN_FENCE_LINES) return false
  return /<(?:script|svg|canvas)[\s>]/iu.test(body)
}

/** Unconditional "I'll draw a card" as the reply's final sentence. */
const PROMISE_EN = /\b(?:I(?:'ll| will| am going to|'m going to)|let me|let's)\s+(?:now\s+|also\s+|quickly\s+|first\s+)?(?:(?:draw|render|build|create|make|show|put together|sketch)\b[^.!?\n]{0,80}?\b(?:card|visuali[sz]ation|interactive (?:chart|demo|diagram|simulation|widget|explorer))\b|visuali[sz]e\b)[^.!?\n]{0,60}[.:!…]*$/iu
const PROMISE_ZH = /(?:我|下面|接下来|现在|让我)(?:来|将|会|现在|先|再|就)*(?:为你|给你|帮你)?(?:画|绘制|做|生成|渲染|制作|画出|展示|可视化)[^。！？?!\n]{0,30}?(?:卡片|可视化|交互式?(?:图|演示|动画|模拟|图表))?[^。！？?!\n]{0,20}[。：:…]*$/u
/** Words that make the final sentence an offer rather than a promise. */
const CONDITIONAL = /\b(?:if|would|could|can|should|want|like|whether|maybe|perhaps)\b|如果|的话|要不要|是否|可以|需要吗|想要|吗/iu

/**
 * The final sentence of a reply when it promises a card and nothing follows.
 * @param text - the assistant reply.
 * @returns the promising sentence, or undefined.
 */
export function promisedCard(text: string): string | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  // The final sentence: everything after the last terminator that has text behind it.
  const sentence = /[^.!?。！？\n]*[.!?。！？:：…]*\s*$/u.exec(trimmed)?.[0]?.trim() ?? ''
  if (sentence.length === 0 || /[?？]$/u.test(sentence) || CONDITIONAL.test(sentence)) return undefined
  if (PROMISE_EN.test(sentence)) return sentence
  // The Chinese pattern names a visual object or verb on its own, so require one of them.
  if (PROMISE_ZH.test(sentence) && /卡片|可视化|交互/u.test(sentence)) return sentence
  return undefined
}

/** Stable short hash of the trigger's identifying content. */
function fingerprint(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 16)
}

/** Text of a message's text blocks, joined. */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map(block => (typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text'
      ? String((block as { text?: unknown }).text ?? '')
      : ''))
    .filter(part => part.length > 0)
    .join('\n')
}

/** The pieces of a `tool/result` event this module reads, across message shapes. */
interface ObservedResult {
  callId: string | undefined
  isError: boolean
  text: string
  meta: unknown
}

/**
 * Read a `tool/result` payload. dsh 0.1.7+ logs a tool-role message with
 * `toolCallId`/`isError` and text content; earlier hosts wrap one
 * `tool-result` block in a user-role message. Both carry `source.callId`.
 */
function observedResult(data: unknown): ObservedResult {
  const record = (data ?? {}) as { message?: Record<string, unknown>; error?: unknown; meta?: unknown }
  const message = record.message ?? {}
  const source = message['source'] as { callId?: unknown } | undefined
  const content = message['content']
  const block = Array.isArray(content) && content.length === 1 && (content[0] as { type?: unknown } | undefined)?.type === 'tool-result'
    ? content[0] as { toolCallId?: unknown; isError?: unknown; content?: unknown }
    : undefined
  const callId = [message['toolCallId'], source?.callId, block?.toolCallId].find(v => typeof v === 'string') as string | undefined
  return {
    callId,
    isError: message['isError'] === true || block?.isError === true || record.error !== undefined,
    text: textOf(block?.content ?? content),
    meta: record.meta,
  }
}

/** Per-turn bookkeeping. */
interface TurnState {
  turn: number
  subagent: boolean
  facts: TurnFacts
  /** Call id → tool name, so a result knows which tool it answers. */
  calls: Map<string, string>
  steers: number
  fingerprints: Set<string>
}

/** The structural slice of a Session this module touches. */
interface SessionLike {
  id?: unknown
  header?: { id?: unknown; version?: unknown; origin?: unknown }
}

/** The structural slice of an Agent this module touches. */
interface AgentLike {
  session?: SessionLike
  steer?: (message: never) => void
}

/** A session event as `session/event` delivers it. */
interface EventLike {
  type?: unknown
  data?: unknown
}

function sessionKey(session: SessionLike | undefined): string | undefined {
  const id = session?.id ?? session?.header?.id
  return id === undefined ? undefined : String(id)
}

/**
 * Build the steered message. Format v4 sessions (dsh 0.1.7+) refuse the
 * retired `plugin` wrapper and take a producer-owned kind; older ones use it.
 * @param text - the correction.
 * @param formatVersion - the session's on-disk format version.
 * @returns a frozen, identified user-role message.
 */
export function correctionMessage(text: string, formatVersion: unknown): Record<string, unknown> {
  const summary = 'visualize self-repair requested'
  const source = typeof formatVersion === 'number' && formatVersion >= 4
    ? { kind: SELF_REPAIR_SOURCE_KIND, form: 'notice', summary }
    : { kind: 'plugin', plugin: SELF_REPAIR_PLUGIN, form: 'notice', summary }
  const content = Object.freeze([Object.freeze({ type: 'text', text })])
  return Object.freeze({ id: randomUUID(), role: 'user', content, source: Object.freeze(source) })
}

/**
 * Watch every session's open turn and steer a correction at its stop boundary
 * when a gap is plainly there.
 * @param ctx - registrant context.
 */
export function installSelfRepair(ctx: Context): void {
  const turns = new Map<string, TurnState>()
  const events = ctx as unknown as {
    on(name: 'session/event', listener: (session: SessionLike, event: EventLike) => void): unknown
    on(name: 'agent/turn-stopping', listener: (payload: { agent?: AgentLike; turn?: unknown; signal?: AbortSignal }) => void): unknown
  }
  const logger = (ctx as unknown as { logger?: { warn?: (message: string) => void } }).logger

  events.on('session/event', (session, event) => {
    try {
      observe(turns, session, event)
    } catch (error) {
      // Observation must never break the host's append path.
      logger?.warn?.(`dsh-visualize: self-repair observer failed (${error instanceof Error ? error.message : String(error)})`)
    }
  })

  events.on('agent/turn-stopping', ({ agent, turn, signal }) => {
    if (signal?.aborted === true || typeof agent?.steer !== 'function') return
    const key = sessionKey(agent.session)
    const state = key === undefined ? undefined : turns.get(key)
    if (state === undefined || state.turn !== turn || state.subagent) return
    if (state.steers >= MAX_STEERS_PER_TURN) return
    const plan = planRepairs(state.facts).find(p => !state.fingerprints.has(p.fingerprint))
    if (plan === undefined) return
    // Counted before sending: a re-entrant boundary must not deliver twice.
    state.fingerprints.add(plan.fingerprint)
    state.steers += 1
    try {
      agent.steer(correctionMessage(plan.text, agent.session?.header?.version) as never)
    } catch (error) {
      logger?.warn?.(`dsh-visualize: self-repair steer failed (${error instanceof Error ? error.message : String(error)})`)
    }
  })
}

/** Fold one durable session event into its open turn's state. */
function observe(turns: Map<string, TurnState>, session: SessionLike, event: EventLike): void {
  const key = sessionKey(session)
  if (key === undefined) return
  const data = event.data as Record<string, unknown> | undefined
  if (event.type === 'turn/start') {
    turns.delete(key)
    turns.set(key, {
      turn: Number(data?.['turn']),
      subagent: session.header?.origin === 'subagent',
      facts: emptyTurnFacts(),
      calls: new Map(),
      steers: 0,
      fingerprints: new Set(),
    })
    if (turns.size > MAX_TRACKED_TURNS) {
      const oldest = turns.keys().next().value
      if (oldest !== undefined) turns.delete(oldest)
    }
    return
  }
  if (event.type === 'turn/end') {
    turns.delete(key)
    return
  }
  const state = turns.get(key)
  if (state === undefined || data === undefined) return
  const facts = state.facts
  switch (event.type) {
    case 'user/message': {
      // Only the person's own words count as the request; steering from
      // plugins (ours included) and injected context do not.
      if ((data['source'] as { kind?: unknown } | undefined)?.kind !== 'user') return
      facts.userText += `${textOf(data['content'])}\n`
      return
    }
    case 'assistant/message': {
      const text = textOf((data['message'] as { content?: unknown } | undefined)?.content)
      facts.finalText = text
      facts.finalInterrupted = data['interrupted'] === true
      if (text.length > 0) facts.textAfterVisualize += `${text}\n`
      return
    }
    case 'tool/call': {
      const name = data['name']
      const callId = data['callId']
      if (typeof name !== 'string') return
      if (typeof callId === 'string') state.calls.set(callId, name)
      if (name === VISUALIZE_TOOL_NAME) facts.visualizeCalled = true
      if (FILE_TOOLS.has(name)) facts.fileToolCalled = true
      return
    }
    case 'tool/result': {
      const result = observedResult(data)
      if (result.callId === undefined || state.calls.get(result.callId) !== VISUALIZE_TOOL_NAME) return
      facts.textAfterVisualize = ''
      if (result.isError) {
        facts.lastVisualize = { ok: false, text: result.text }
        return
      }
      facts.lastVisualize = { ok: true }
      const meta = visualizeMetaFrom(result.meta)
      if (meta === undefined) return
      facts.cards.delete(meta.path)
      facts.cards.set(meta.path, { title: meta.title, fragment: meta.fragment })
      return
    }
    default:
      return
  }
}
