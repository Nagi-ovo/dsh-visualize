/**
 * The model-facing `visualize` tool: take one inline-HTML fragment as a direct
 * argument, validate it against the inline contract, and project it into the
 * persisted `tool/result` meta so a capable UI renders it as a sandboxed card
 * and replay reproduces the same card byte for byte. Passing the markup as an
 * argument (rather than a file path) lets the browser half live-render the
 * argument stream while the model is still generating; the settled fragment
 * is also written to the session workspace as an exportable artifact, and the
 * model-facing result stays a one-line confirmation.
 *
 * @module @dsh-external/dsh-visualize/tool
 */

import type { Context } from 'cordis'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
// Type-only: pulls the `ctx.fs` Context merge.
import type {} from '@deepseek-ai/dsh-fs'
// Type-only: pulls the `ctx.get('sandboxPolicy')` Context merge.
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { validateFragment, visualizeMetaFrom, VISUALIZE_TOOL_NAME, type VisualizeMode } from './fragment.ts'

export { VISUALIZE_TOOL_NAME } from './fragment.ts'

const DESCRIPTION =
  'Show the user an interactive HTML visualization, rendered as a live card in '
  + 'the conversation. Pass the markup in `fragment`: literal inline HTML only '
  + '(no <!doctype>, <html>, <head>, or <body> — the card supplies the '
  + 'document, stylesheet, and theme). The card appears while you generate; a '
  + 'copy of the finished fragment is saved into the session workspace. Load '
  + 'the `visualize` skill for the authoring contract before your first call.'

/**
 * Build the `visualize` tool definition over the composed filesystem seam.
 * @param ctx - registrant context carrying `ctx.fs` for the workspace copy.
 * @param maxFragmentBytes - deployment size ceiling for one fragment.
 * @returns the tool definition to register on `ctx.tools`.
 */
export function visualizeTool(ctx: Context, maxFragmentBytes: number): ToolDefinition {
  return defineTool({
    name: VISUALIZE_TOOL_NAME,
    description: DESCRIPTION,
    parameters: {
      fragment: {
        type: 'string',
        required: true,
        description: 'The inline HTML fragment to render (markup, style, and script — no document skeleton).',
      },
      title: {
        type: 'string',
        description: 'Concise card title. Defaults to "Visualization".',
      },
      mode: {
        type: 'string',
        enum: ['inline', 'wide'],
        description: 'Card width: `inline` (default) or `wide` for side-by-side panel comparisons.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          title: { type: 'string', required: true },
          mode: { type: 'string', required: true, enum: ['inline', 'wide'] },
          sizeBytes: { type: 'integer', required: true },
          fragment: { type: 'string', required: true },
        },
      },
      // Model-facing text stays a confirmation: the fragment is already in the
      // model's own output (the argument) and re-echoing it would double its
      // context cost.
      render: (_args, value) => [{
        type: 'text',
        text: `Rendered "${value.title}" inline (${value.sizeBytes} bytes; workspace copy at ${value.path}). The user sees the interactive visualization in the conversation.`,
      }],
      // Project the fragment into persisted meta so the card survives replay:
      // the canonical value is not on the wire, only content + meta are.
      presentationMeta: (_args, value) => ({
        kind: 'visualize',
        fragment: value.fragment,
        title: value.title,
        mode: value.mode,
        path: value.path,
      }),
    },
    // Writes only a content-addressed file under viz/; concurrent sibling
    // calls target distinct names or identical bytes, so they cannot conflict.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const sizeBytes = validateFragment(args.fragment, maxFragmentBytes)
      const title = args.title?.trim() || 'Visualization'
      // Content-addressed workspace copy: <slug>-<hash>.html under viz/,
      // resolved against the calling agent's session workspace (mirroring the
      // official fs tools); a re-render of identical bytes reuses its name.
      const relative = `viz/${slugOf(title)}-${contentHash(args.fragment)}.html`
      // Session-level sandbox policy, as the official fs tools resolve it: the
      // calling session's cwd becomes the workspace root. Without this, a
      // confining backend falls back to its process-level default root and
      // denies the write whenever the session cwd lies elsewhere.
      const sandboxPolicy = ctx.get('sandboxPolicy')?.resolve({
        ...exec.agent ? { session: exec.agent.session } : {},
      })
      const cwd = sandboxPolicy?.workspaceRoot ?? exec.agent?.session.header.cwd
      const target = await ctx.fs.resolve(relative, {
        ...cwd !== undefined ? { cwd } : {},
        signal: exec.signal,
      })
      await ctx.fs.writeText(target, args.fragment, undefined, exec.signal, sandboxPolicy)
      return {
        path: target.displayPath,
        title,
        mode: (args.mode ?? 'inline') as VisualizeMode,
        sizeBytes,
        fragment: args.fragment,
      }
    },
    presentCall: () => ({
      card: 'generic',
      title: 'Visualize',
      kind: 'other',
    }),
    // The completed title derives from persisted meta, not args, so replay of
    // a defaulted title still shows the resolved one. A malformed or absent
    // meta declines to the generic fallback.
    presentResult(_args, result) {
      if (result.isError) return undefined
      const meta = visualizeMetaFrom(result.meta)
      if (meta === undefined) return undefined
      return { card: 'generic', title: `Visualization · ${meta.title}` }
    },
  })
}

/**
 * Lowercase, hyphenated, ASCII-safe file slug of a card title.
 * @param title - the resolved card title.
 * @returns a non-empty slug.
 */
function slugOf(title: string): string {
  const slug = title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 48)
  return slug.length > 0 ? slug : 'visualization'
}

/**
 * Stable 8-hex-digit content hash (FNV-1a) naming the workspace copy.
 * @param text - the fragment content.
 * @returns the hash as fixed-width hex.
 */
function contentHash(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
