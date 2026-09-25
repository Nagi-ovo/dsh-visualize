/**
 * dsh-visualize, browser half: the settled visualization card under the
 * `visualize` key of the atomic toolview hole, the streaming preview in the
 * composer's input dock, and — on hosts that fold finished turns — the turn's
 * cards again under its final answer. Clients without this half degrade to
 * the tool's generic result text by the documented toolview fallback.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the `ctx.slots` Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the `tool.call.toolview` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
// Type-only: pulls the `conversation.input.dock` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { VisualizeCard } from './VisualizeCard.tsx'
import { StreamingPreview } from './StreamingPreview.tsx'
import { foldingSource, type FoldingHost } from './folding.ts'
import { selectTurnCards, turnCardsDefinition, TurnCards } from './TurnCards.tsx'

export const name = 'dsh-visualize'

export const inject = ['slots']

/** The Conversation event registry, where the host has one (dsh 0.1.2+). */
interface ConversationEvents {
  register(definition: ConversationNodeDefinition): () => void
}

/**
 * Look up the Conversation event registry without declaring the service, so
 * hosts that predate it still load the plugin.
 * @param host - client context.
 * @returns the registry, or undefined on dsh 0.1.1.
 */
function conversationEvents(host: FoldingHost): ConversationEvents | undefined {
  const service = host.get('uiConversation') as { events?: Partial<ConversationEvents> } | undefined
  return typeof service?.events?.register === 'function' ? service.events as ConversationEvents : undefined
}

/**
 * Turn-tail registration valid on both slot shapes the host has shipped: dsh
 * 0.1.5 and earlier declare a chain (register requires `select`, orders by
 * `priority`), 0.1.6 onward a list (register requires `id`, orders by
 * `order`). Each register validates only its own kind's field. The cards sit
 * after the host's deliverables and before other plugins' low-rank entries.
 * @param host - client context, for the folding preference.
 * @returns the register options.
 */
function turnTailOptions(host: FoldingHost) {
  const folds = foldingSource(host)
  return {
    name: 'conversation.chat.turnTail',
    id: 'dsh-visualize-cards',
    order: 100,
    priority: 100,
    select: selectTurnCards,
    inject: () => ({ hooks: { visualizeFolds: folds } }),
  } as const
}

/**
 * Register the keyed toolview and the dock preview. Waiting on each hole's
 * declaration mirrors the official registrants: entry application order is
 * loader-driven, and a direct register racing the declaration fails boot.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'visualize' },
    VisualizeCard,
  ))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
    { name: 'conversation.input.dock', id: 'visualize-stream', order: 30 },
    StreamingPreview,
  ))
  // The Chat target declares the turn tail after its own settings and the
  // Conversation registry are up, so both are resolvable here.
  ctx.slots.inject('conversation.chat.turnTail', () => {
    const events = conversationEvents(ctx)
    if (events === undefined) return () => undefined
    const disposeDefinition = events.register(turnCardsDefinition as ConversationNodeDefinition)
    const disposeTail = ctx.slots.register(turnTailOptions(ctx), TurnCards)
    return () => {
      disposeTail()
      disposeDefinition()
    }
  })
}
