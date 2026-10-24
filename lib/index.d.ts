import z from "@deepseek-ai/schemastery";
import "@deepseek-ai/dsh-tools";
import { Context } from "@deepseek-ai/cordis";
//#region src/style.d.ts
/**
 * Card style presets: the user-chosen half of a card's look. The base
 * contract (fragment rules, CSP, size, theme-variable use, the 11px floor,
 * lint) belongs to the plugin and no style can change it; a style only
 * supplies
 *
 * - hard style, injected by the frame shell and therefore deterministic:
 *   values for the frame's `--dsh-viz-*` hooks (one `light-dark()` value
 *   covers both appearances, because the frame's `color-scheme` follows the
 *   host), an optional webfont stylesheet, a small scoped CSS block, and the
 *   chart defaults `dshViz.chartDefaults` applies on top of the tokens;
 * - soft style, a short prose guide (`assets/styles/<id>.md`) the skill
 *   provider appends to the skill body, which overrides only the taste
 *   guidance in `references/design.md`.
 *
 * Every preset leaves the background transparent so the card sits on the
 * host's chat surface. Values were contrast- and colour-vision-checked
 * against the host surfaces (light #ffffff/#f5f6f7, dark #151517/#232324).
 *
 * Pure and DOM-free: the node half reads ids and prose paths, the browser
 * card reads the hard style for the id persisted in each card's meta.
 *
 * @module @nagi-ovo/dsh-visualize/style
 */
/** Every built-in style id, in settings order; the first is the default. */
declare const STYLE_IDS: readonly ["whale", "editorial", "paper", "sketch", "terminal"];
/** One built-in style id. */
type StyleId = typeof STYLE_IDS[number];
/**
 * Path of the node half's style-file route on the host's `/api` channel,
 * which the settings page calls (style-files.ts).
 */
declare const STYLE_FILES_PATH = "/api/dsh-visualize/style-files";
//#endregion
//#region src/style-setting.d.ts
/** A live setting: the value read through its owner's reference. */
interface LiveValue<T> {
  get(): T;
}
/** The configured style as `apply` receives it. */
type StyleSetting = StyleId | LiveValue<StyleId | undefined>;
/**
 * Read the configured style now.
 * @param setting - the `style` value `apply` received.
 * @returns a known style id; anything else reads as the default.
 */
declare function readStyle(setting: StyleSetting | undefined): StyleId;
//#endregion
//#region src/fragment.d.ts
/**
 * Wire name of the tool, the keyed toolview, and the streaming-preview match.
 * Lives in this pure module so the browser half can import it without pulling
 * the node-side tool implementation into the client bundle.
 */
declare const VISUALIZE_TOOL_NAME = "visualize";
/**
 * Surface of one visualization: `inline` and `wide` render the fragment in
 * the conversation at the chat column's or the expanded width; `page` renders
 * a launcher card there and the fragment itself as a full page in its own tab.
 */
type VisualizeMode = 'inline' | 'wide' | 'page';
/** The `tool/result` meta descriptor persisted for replay-stable rendering. */
interface VisualizeMeta {
  /** Discriminant for consumers sharing the meta channel. */
  kind: 'visualize';
  /** The validated fragment body, inlined so replay never re-reads the file. */
  fragment: string;
  /** Concise human title shown in the card header. */
  title: string;
  /** Surface; `wide` asks for the expanded inline surface, `page` for a launcher and its own tab. */
  mode: VisualizeMode;
  /** Session-relative or absolute source path, kept for provenance display. */
  path: string;
  /** One-line description a page launcher shows under its title; absent when none was given. */
  summary?: string;
  /**
   * Card style the card was created under, so replay and the windowed view
   * keep its look after the setting changes. Absent on cards from before
   * styles existed, which read as the default.
   */
  style: StyleId;
  /**
   * Images the tool resolved from the fragment's `data-viz-src` attributes,
   * as references only: the bytes stay in the plugin's card store and reach
   * the card through {@link IMAGE_ROUTE_PATH}. Absent when there are none.
   */
  images?: CardImage[];
}
/** Image formats a card embeds; the tool verifies each by its magic bytes. */
type CardImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml';
/** One resolved `data-viz-src`, as persisted meta carries it. */
interface CardImage {
  /** The attribute value exactly as the fragment spells it, entities undecoded. */
  src: string;
  /** Store id the image route serves: `<session segment>/<sha256>.<ext>`. */
  id: string;
  type: CardImageType;
  bytes: number;
}
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
//#region src/lint.d.ts
/**
 * Validate one fragment against the inline contract.
 * @param fragment - the markup the model sent.
 * @param maxBytes - deployment size ceiling for one fragment.
 * @returns the fragment's UTF-8 size in bytes.
 * @throws Error listing every `error` finding; the tool surfaces it as `isError`.
 */
declare function validateFragment(fragment: string, maxBytes: number): number;
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
  /**
   * Card style for new cards: colours, fonts and chart defaults the frame
   * applies, plus a style guide appended to the skill. Each card keeps the
   * style it was created with. The field is volatile, so the host's settings
   * form can change it while the plugin runs: read it with
   * {@link readStyle}, never once at startup.
   */
  style: StyleSetting;
}
/** Schemastery configuration validated by the Loader. */
declare const Config: z<Config>;
/**
 * Register the tool, the bundled skill provider, the page config, and the
 * style-file route of the settings page.
 * @param ctx - registrant context.
 * @param config - validated deployment configuration.
 */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { Config, STYLE_FILES_PATH, STYLE_IDS, type StyleId, type StyleSetting, VISUALIZE_TOOL_NAME, type VisualizeMeta, type VisualizeMode, apply, inject, name, readStyle, validateFragment, visualizeMetaFrom };