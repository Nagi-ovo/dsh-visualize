import z from "schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
//#region src/fragment.ts
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
const VISUALIZE_TOOL_NAME = "visualize";
/** Document-skeleton tags a fragment must not contain (case-insensitive). */
const SKELETON_TAG = /<!doctype\b|<\s*(?:html|head|body)\b/iu;
/**
* Validate one fragment against the inline contract.
* @param fragment - the file content the model wrote.
* @param maxBytes - deployment size ceiling for one fragment.
* @returns the fragment's UTF-8 size in bytes.
* @throws Error naming the violated rule; the tool surfaces it as `isError`.
*/
function validateFragment(fragment, maxBytes) {
	if (fragment.trim().length === 0) throw new Error("invalid visualization: the fragment file is empty");
	const sizeBytes = byteLength(fragment);
	if (sizeBytes > maxBytes) throw new Error(`invalid visualization: fragment is ${sizeBytes} bytes, over the ${maxBytes}-byte limit — shrink the inline data first (fewer rows, coarser buckets, fewer decimals)`);
	const skeleton = SKELETON_TAG.exec(fragment);
	if (skeleton) throw new Error(`invalid visualization: fragment contains a document-skeleton tag (${JSON.stringify(skeleton[0])}) — write only the inline body; the host supplies <!doctype>, <html>, <head>, and <body>`);
	return sizeBytes;
}
/**
* Narrow one persisted `tool/result` meta value to a {@link VisualizeMeta}.
* Wire data cannot be trusted to match the compiled shape (an older or newer
* host may have logged it), so a mismatch declines to `undefined` — the caller
* falls back to the generic presentation instead of throwing on replay.
* @param meta - the raw persisted meta value.
* @returns the narrowed descriptor, or `undefined` for the generic path.
*/
function visualizeMetaFrom(meta) {
	if (typeof meta !== "object" || meta === null) return void 0;
	const record = meta;
	if (record["kind"] !== "visualize") return void 0;
	const { fragment, title, mode, path } = record;
	if (typeof fragment !== "string" || typeof title !== "string" || typeof path !== "string") return void 0;
	if (mode !== "inline" && mode !== "wide") return void 0;
	return {
		kind: "visualize",
		fragment,
		title,
		mode,
		path
	};
}
/**
* UTF-8 byte length without Buffer, so the browser bundle needs no polyfill.
* @param text - the string to measure.
* @returns its UTF-8 encoding length in bytes.
*/
function byteLength(text) {
	return new TextEncoder().encode(text).length;
}
//#endregion
//#region src/tool.ts
const DESCRIPTION = "Show the user an interactive HTML visualization, rendered as a live card in the conversation. Pass the markup in `fragment`: literal inline HTML only (no <!doctype>, <html>, <head>, or <body> — the card supplies the document, stylesheet, and theme). The card appears while you generate; a copy of the finished fragment is saved into the session workspace. Load the `visualize` skill for the authoring contract before your first call.";
/**
* Build the `visualize` tool definition over the composed filesystem seam.
* @param ctx - registrant context carrying `ctx.fs` for the workspace copy.
* @param maxFragmentBytes - deployment size ceiling for one fragment.
* @returns the tool definition to register on `ctx.tools`.
*/
function visualizeTool(ctx, maxFragmentBytes) {
	return defineTool({
		name: VISUALIZE_TOOL_NAME,
		description: DESCRIPTION,
		parameters: {
			fragment: {
				type: "string",
				required: true,
				description: "The inline HTML fragment to render (markup, style, and script — no document skeleton)."
			},
			title: {
				type: "string",
				description: "Concise card title. Defaults to \"Visualization\"."
			},
			mode: {
				type: "string",
				enum: ["inline", "wide"],
				description: "Card width: `inline` (default) or `wide` for side-by-side panel comparisons."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: {
						type: "string",
						required: true
					},
					title: {
						type: "string",
						required: true
					},
					mode: {
						type: "string",
						required: true,
						enum: ["inline", "wide"]
					},
					sizeBytes: {
						type: "integer",
						required: true
					},
					fragment: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Rendered "${value.title}" inline (${value.sizeBytes} bytes; workspace copy at ${value.path}). The user sees the interactive visualization in the conversation.`
			}],
			presentationMeta: (_args, value) => ({
				kind: "visualize",
				fragment: value.fragment,
				title: value.title,
				mode: value.mode,
				path: value.path
			})
		},
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const sizeBytes = validateFragment(args.fragment, maxFragmentBytes);
			const title = args.title?.trim() || "Visualization";
			const relative = `viz/${slugOf(title)}-${contentHash(args.fragment)}.html`;
			const sandboxPolicy = ctx.get("sandboxPolicy")?.resolve({ ...exec.agent ? { session: exec.agent.session } : {} });
			const cwd = sandboxPolicy?.workspaceRoot ?? exec.agent?.session.header.cwd;
			const target = await ctx.fs.resolve(relative, {
				...cwd !== void 0 ? { cwd } : {},
				signal: exec.signal
			});
			await ctx.fs.writeText(target, args.fragment, void 0, exec.signal, sandboxPolicy);
			return {
				path: target.displayPath,
				title,
				mode: args.mode ?? "inline",
				sizeBytes,
				fragment: args.fragment
			};
		},
		presentCall: () => ({
			card: "generic",
			title: "Visualize",
			kind: "other"
		}),
		presentResult(_args, result) {
			if (result.isError) return void 0;
			const meta = visualizeMetaFrom(result.meta);
			if (meta === void 0) return void 0;
			return {
				card: "generic",
				title: `Visualization · ${meta.title}`
			};
		}
	});
}
/**
* Lowercase, hyphenated, ASCII-safe file slug of a card title.
* @param title - the resolved card title.
* @returns a non-empty slug.
*/
function slugOf(title) {
	const slug = title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-").replaceAll(/^-+|-+$/gu, "").slice(0, 48);
	return slug.length > 0 ? slug : "visualization";
}
/**
* Stable 8-hex-digit content hash (FNV-1a) naming the workspace copy.
* @param text - the fragment content.
* @returns the hash as fixed-width hex.
*/
function contentHash(text) {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}
//#endregion
//#region src/skill.ts
/**
* Bundled `visualize` skill provider: the fragment-authoring contract the
* model loads before its first `visualize` call. Mirrors the official
* `dsh-skill-badge` provider shape — one bundled candidate whose body ships
* in this package's `assets/`.
*
* @module @dsh-external/dsh-visualize/skill
*/
const PROVIDER_NAME = "dsh-visualize";
const SKILL_BODY_URL = new URL("../assets/visualize-skill.md", import.meta.url);
const RESOURCE_BASE = {
	kind: "directory",
	path: fileURLToPath(new URL("../assets/", import.meta.url))
};
const CANDIDATE = {
	name: "visualize",
	description: "Authoring contract for the visualize tool, which renders interactive cards in the conversation: simulations, algorithm walkthroughs, charts, comparisons, and product-screen mockups. Load before the first visualize call in a session — it defines the fragment structure, theming variables, size ceiling, and allowed resources the tool validates against.",
	invocation: {
		modelInvocable: true,
		userInvocable: true
	},
	provider: PROVIDER_NAME,
	source: "bundled",
	resourceBase: RESOURCE_BASE,
	rank: BUNDLED_SKILL_RANK,
	locator: SKILL_BODY_URL
};
/** The bundled provider registered on `ctx.skills`. */
const visualizeSkillProvider = {
	name: PROVIDER_NAME,
	list: () => Promise.resolve([CANDIDATE]),
	async get(_candidate) {
		return {
			name: CANDIDATE.name,
			description: CANDIDATE.description,
			invocation: CANDIDATE.invocation,
			provider: CANDIDATE.provider,
			source: CANDIDATE.source,
			resourceBase: RESOURCE_BASE,
			content: await readFile(SKILL_BODY_URL, "utf8")
		};
	}
};
//#endregion
//#region src/index.ts
/** Cordis plugin name. */
const name = "dsh-visualize";
/** Required services: the tool registry, the skill registry, and the fs seam. */
const inject = [
	"tools",
	"skills",
	"fs"
];
/** Schemastery configuration validated by the Loader. */
const Config = z.object({ maxFragmentBytes: z.natural().default(1e6) });
/**
* Register the tool and the bundled skill provider.
* @param ctx - registrant context.
* @param config - validated deployment configuration.
*/
function apply(ctx, config) {
	ctx.tools.register(visualizeTool(ctx, config.maxFragmentBytes));
	ctx.skills.registerProvider(() => visualizeSkillProvider);
}
//#endregion
export { Config, VISUALIZE_TOOL_NAME, apply, inject, name, validateFragment, visualizeMetaFrom };
