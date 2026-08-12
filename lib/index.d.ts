import z from "@deepseek-ai/schemastery";
import "@deepseek-ai/dsh-tools";
import { Context } from "@deepseek-ai/cordis";
//#region src/fragment.d.ts
/**
 * Pure fragment contract shared by the tool (validation at execute time), the
 * browser card (meta narrowing at render time), and the specs. No I/O and no
 * DOM so both halves and vitest can load it unchanged.
 *
 * A *fragment* is the model-authored inline-HTML body of one visualization:
 * literal markup without a document skeleton. The card owns the skeleton — it
 * wraps the fragment in a sandboxed iframe document with its own CSP — so a
 * fragment that ships its own `<!doctype>`/`<html>`/`<head>`/`<body>` would
 * nest documents and is rejected loudly instead of rendered broken.
 *
 * @module @dsh-external/dsh-visualize/fragment
 */
/**
 * Wire name of the tool, the keyed toolview, and the streaming-preview match.
 * Lives in this pure module so the browser half can import it without pulling
 * the node-side tool implementation into the client bundle.
 */
declare const VISUALIZE_TOOL_NAME = "visualize";
/** Width intent of one visualization card. */
type VisualizeMode = 'inline' | 'wide';
/** The `tool/result` meta descriptor persisted for replay-stable rendering. */
interface VisualizeMeta {
  /** Discriminant for consumers sharing the meta channel. */
  kind: 'visualize';
  /** The validated fragment body, inlined so replay never re-reads the file. */
  fragment: string;
  /** Concise human title shown in the card header. */
  title: string;
  /** Width intent; `wide` asks the card for the expanded inline surface. */
  mode: VisualizeMode;
  /** Session-relative or absolute source path, kept for provenance display. */
  path: string;
}
/**
 * Validate one fragment against the inline contract.
 * @param fragment - the file content the model wrote.
 * @param maxBytes - deployment size ceiling for one fragment.
 * @returns the fragment's UTF-8 size in bytes.
 * @throws Error naming the violated rule; the tool surfaces it as `isError`.
 */
declare function validateFragment(fragment: string, maxBytes: number): number;
/**
 * Narrow one persisted `tool/result` meta value to a {@link VisualizeMeta}.
 * Wire data cannot be trusted to match the compiled shape (an older or newer
 * host may have logged it), so a mismatch declines to `undefined` — the caller
 * falls back to the generic presentation instead of throwing on replay.
 * @param meta - the raw persisted meta value.
 * @returns the narrowed descriptor, or `undefined` for the generic path.
 */
declare function visualizeMetaFrom(meta: unknown): VisualizeMeta | undefined;
//#endregion
//#region src/index.d.ts
/** Cordis plugin name. */
declare const name = "dsh-visualize";
/** Required services: the tool registry, the skill registry, and the fs seam. */
declare const inject: string[];
/** Deployment configuration. */
interface Config {
  /**
   * Size ceiling in bytes for one fragment file. Oversized fragments are
   * rejected at execute time with guidance to downsample inline data; the
   * same ceiling bounds what one call adds to the session log.
   */
  maxFragmentBytes: number;
}
/** Schemastery configuration validated by the Loader. */
declare const Config: z<Config>;
/**
 * Register the tool and the bundled skill provider.
 * @param ctx - registrant context.
 * @param config - validated deployment configuration.
 */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { Config, VISUALIZE_TOOL_NAME, type VisualizeMeta, type VisualizeMode, apply, inject, name, validateFragment, visualizeMetaFrom };