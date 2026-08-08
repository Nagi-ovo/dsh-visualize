/**
 * dsh-visualize, browser half: the settled visualization card under the
 * `visualize` key of the atomic toolview hole, plus the streaming preview in
 * the composer's input dock. Clients without this half degrade to the tool's
 * generic result text by the documented toolview fallback.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the `tool.call.toolview` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
// Type-only: pulls the `conversation.input.dock` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { VisualizeCard } from './VisualizeCard.tsx'
import { StreamingPreview } from './StreamingPreview.tsx'

export const name = 'dsh-visualize'

export const inject = ['slots']

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
}
