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

import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
// FsTarget is a value-free type; the import also pulls the `ctx.fs` Context merge.
import type { FsTarget } from '@deepseek-ai/dsh-fs'
// Type-only: pulls the `ctx.get('sandboxPolicy')` Context merge.
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import {
  applyFragmentPatch,
  validateFragment,
  visualizeMetaFrom,
  VISUALIZE_TOOL_NAME,
  type VisualizeAction,
  type VisualizeMode,
} from './fragment.ts'

export { VISUALIZE_TOOL_NAME } from './fragment.ts'

const DESCRIPTION =
  'Show the user an interactive HTML visualization, rendered as a live card in '
  + 'the conversation. `create` (the default) takes the whole markup in '
  + '`fragment`: literal inline HTML only (no <!doctype>, <html>, <head>, or '
  + '<body> — the card supplies the document, stylesheet, and theme). To '
  + 'correct a card you already rendered, call `update` with its `path` and one '
  + 'exact `old_str`/`new_str` replacement instead of re-sending the whole '
  + 'fragment. The card appears while you generate; a copy of the finished '
  + 'fragment is saved into the session workspace. Load the `visualize` skill '
  + 'for the authoring contract before your first call.'

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
      action: {
        type: 'string',
        enum: ['create', 'update'],
        description:
          '`create` (default) renders a new card from `fragment`. `update` patches the card at `path`, '
          + 'replacing `old_str` with `new_str` — use it for a correction touching fewer than 20 lines in '
          + 'fewer than 5 places, and at most 4 times per reply; re-create the card for anything larger.',
      },
      fragment: {
        type: 'string',
        description:
          'create only, required: the inline HTML fragment to render (markup, style, and script — '
          + 'no document skeleton).',
      },
      title: {
        type: 'string',
        description: 'Concise card title. Defaults to "Visualization" on create; required on update.',
      },
      mode: {
        type: 'string',
        enum: ['inline', 'wide'],
        description: 'Card width: `inline` (default) or `wide` for side-by-side panel comparisons.',
      },
      path: {
        type: 'string',
        description: 'update only, required: workspace path of the card to patch, as its own call reported it.',
      },
      old_str: {
        type: 'string',
        description:
          'update only, required: the exact card text to replace, whitespace included. It must appear '
          + 'exactly once — keep it as short as stays unique.',
      },
      new_str: {
        type: 'string',
        description: 'update only, required: the replacement text. Empty deletes the matched region.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true, enum: ['create', 'update'] },
          path: { type: 'string', required: true },
          title: { type: 'string', required: true },
          mode: { type: 'string', required: true, enum: ['inline', 'wide'] },
          sizeBytes: { type: 'integer', required: true },
          fragment: { type: 'string', required: true },
        },
      },
      // Model-facing text stays a confirmation: the fragment is already in the
      // model's own output (the argument, whole or patched) and re-echoing it
      // would double its context cost. The patched path is named so a further
      // correction patches the new card rather than the superseded one.
      render: (_args, value) => [{
        type: 'text',
        text: value.action === 'update'
          ? `Patched "${value.title}" in place (${value.sizeBytes} bytes; updated card at ${value.path}). The user sees the corrected visualization in the conversation; patch that path for any further correction.`
          : `Rendered "${value.title}" inline (${value.sizeBytes} bytes; workspace copy at ${value.path}). The user sees the interactive visualization in the conversation.`,
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
    // A create writes only a content-addressed file under viz/; concurrent
    // siblings target distinct names or identical bytes, so they cannot
    // conflict. An update reads a card before rewriting it, so parallel
    // updates would each patch a base the other has already superseded.
    isConcurrencySafe: args => (args.action ?? 'create') === 'create',
    async execute(args, exec) {
      const action = (args.action ?? 'create') as VisualizeAction
      // Session-level sandbox policy, as the official fs tools resolve it: the
      // calling session's cwd becomes the workspace root. Without this, a
      // confining backend falls back to its process-level default root and
      // denies the write whenever the session cwd lies elsewhere.
      const sandboxPolicy = ctx.get('sandboxPolicy')?.resolve({
        ...exec.agent ? { session: exec.agent.session } : {},
      })
      const cwd = sandboxPolicy?.workspaceRoot ?? exec.agent?.session.header.cwd
      const resolveOpts = { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal }
      // An update patches the workspace copy, the one card state both halves
      // agree on: persisted meta is not readable from here, and the model's
      // own transcript may hold a fragment an earlier patch already replaced.
      // It rewrites that same file rather than deriving a new name, so a
      // second patch in the same reply builds on the first — a fresh path per
      // patch would leave later patches addressing a base already superseded,
      // and each would silently drop every edit but its own.
      let source: FsTarget | undefined
      let fragment: string
      if (action === 'update') {
        source = await ctx.fs.resolve(required(args.path, 'path', action), resolveOpts)
        fragment = applyFragmentPatch(
          await ctx.fs.readText(source, exec.signal),
          required(args.old_str, 'old_str', action),
          present(args.new_str, 'new_str', action),
        )
      } else {
        fragment = required(args.fragment, 'fragment', action)
      }
      const sizeBytes = validateFragment(fragment, maxFragmentBytes)
      // A patched card keeps its identity only if the caller restates it, so
      // the title is required on update rather than silently re-defaulted.
      const title = action === 'update' ? required(args.title, 'title', action).trim() : args.title?.trim() || 'Visualization'
      // A create takes a content-addressed name — <slug>-<hash>.html under
      // viz/, resolved against the calling agent's session workspace like the
      // official fs tools do — so re-rendering identical bytes reuses its name.
      const target = source ?? await ctx.fs.resolve(`viz/${slugOf(title)}-${contentHash(fragment)}.html`, resolveOpts)
      await ctx.fs.writeText(target, fragment, undefined, exec.signal, sandboxPolicy)
      return {
        action,
        path: target.displayPath,
        title,
        mode: (args.mode ?? 'inline') as VisualizeMode,
        sizeBytes,
        fragment,
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
 * Take one argument the chosen action cannot run without. The parameter schema
 * cannot express "required on update only", so the per-action requirement is
 * enforced here and fails loud rather than defaulting into a wrong card.
 * @param value - the raw argument value.
 * @param name - the parameter name, as the model wrote it.
 * @param action - the action that requires it, named in the message.
 * @returns the raw value, whitespace preserved.
 * @throws Error naming the missing parameter; the tool surfaces it as `isError`.
 */
function required(value: string | undefined, name: string, action: VisualizeAction): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`invalid visualization: \`${name}\` is required when action is "${action}"`)
  }
  return value
}

/**
 * Take one argument that must be supplied but may legitimately be empty — an
 * empty `new_str` is how a patch deletes the region it matched.
 * @param value - the raw argument value.
 * @param name - the parameter name, as the model wrote it.
 * @param action - the action that requires it, named in the message.
 * @returns the raw value, including the empty string.
 * @throws Error naming the missing parameter; the tool surfaces it as `isError`.
 */
function present(value: string | undefined, name: string, action: VisualizeAction): string {
  if (value === undefined) {
    throw new Error(`invalid visualization: \`${name}\` is required when action is "${action}"`)
  }
  return value
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
