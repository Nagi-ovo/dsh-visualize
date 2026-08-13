import z from "@deepseek-ai/schemastery";
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
* Characters of real card content quoted back when a patch fails to apply, so
* the model can correct `old_str` from the true bytes without re-reading the
* whole card.
*/
const PATCH_CONTEXT_CHARS = 160;
/**
* Shortest matching prefix of a failed `old_str` still worth reporting as a
* location hint; below this any HTML shares enough characters to point
* somewhere misleading.
*/
const MIN_ANCHOR_CHARS = 12;
/**
* Replace one exact, unique occurrence of `oldStr` in a rendered card's
* fragment. Iterating by patch instead of re-emitting the whole fragment is
* what keeps a small correction small: the model re-states only the changed
* region, and the card's markup never enters its output twice.
*
* A patch that does not resolve to exactly one site is refused rather than
* guessed at, because both wrong outcomes are silent — a near-miss would edit
* markup the model never saw, and an ambiguous match would edit an arbitrary
* one of several sites. The thrown message carries the surrounding real
* content so the caller can correct `old_str` within the same turn.
*
* @param base - the current fragment of the card being patched.
* @param oldStr - exact text to replace, whitespace included.
* @param newStr - replacement text; empty deletes the matched region.
* @returns the patched fragment.
* @throws Error naming why the patch did not apply; the tool surfaces it as `isError`.
*/
function applyFragmentPatch(base, oldStr, newStr) {
	if (oldStr.length === 0) throw new Error("invalid visualization patch: old_str is empty — pass the exact card text to replace");
	const first = base.indexOf(oldStr);
	if (first === -1) throw new Error(`invalid visualization patch: old_str does not appear in the card. ${nearestAnchor(base, oldStr)}`);
	if (base.indexOf(oldStr, first + oldStr.length) !== -1) throw new Error(`invalid visualization patch: old_str appears ${countOccurrences(base, oldStr)} times in the card — extend it with neighbouring lines until exactly one site matches`);
	return base.slice(0, first) + newStr + base.slice(first + oldStr.length);
}
/**
* Describe where a failed `old_str` stopped matching: the longest prefix of it
* that does occur, and the card's real text at that site. Prefix occurrence is
* monotone in length, so the longest one is a binary search.
* @param base - the current fragment of the card being patched.
* @param oldStr - the `old_str` that failed to match.
* @returns a sentence naming the divergence point, or advising a full re-render.
*/
function nearestAnchor(base, oldStr) {
	let matched = 0;
	let beyond = oldStr.length;
	while (matched < beyond) {
		const mid = Math.ceil((matched + beyond) / 2);
		if (base.includes(oldStr.slice(0, mid))) matched = mid;
		else beyond = mid - 1;
	}
	if (matched < MIN_ANCHOR_CHARS) return "None of it matched, so the card is not in the state you assumed — re-render the whole card instead.";
	const at = base.indexOf(oldStr.slice(0, matched));
	return `Its first ${matched} characters do match, at offset ${at}, where the card actually reads ${JSON.stringify(base.slice(at, at + PATCH_CONTEXT_CHARS))} — correct old_str against that and retry.`;
}
/**
* Count non-overlapping occurrences of a needle, matching the replacement
* semantics {@link applyFragmentPatch} would apply.
* @param base - the text to scan.
* @param needle - the non-empty needle to count.
* @returns the number of non-overlapping occurrences.
*/
function countOccurrences(base, needle) {
	let count = 0;
	for (let at = base.indexOf(needle); at !== -1; at = base.indexOf(needle, at + needle.length)) count += 1;
	return count;
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
const DESCRIPTION = "Show the user an interactive HTML visualization, rendered as a live card in the conversation. `create` (the default) takes the whole markup in `fragment`: literal inline HTML only (no <!doctype>, <html>, <head>, or <body> — the card supplies the document, stylesheet, and theme). To correct a card you already rendered, call `update` with its `path` and one exact `old_str`/`new_str` replacement instead of re-sending the whole fragment. The card appears while you generate; a copy of the finished fragment is saved into the session workspace. Load the `visualize` skill for the authoring contract before your first call.";
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
			action: {
				type: "string",
				enum: ["create", "update"],
				description: "`create` (default) renders a new card from `fragment`. `update` patches the card at `path`, replacing `old_str` with `new_str` — use it for a correction touching fewer than 20 lines in fewer than 5 places, and at most 4 times per reply; re-create the card for anything larger."
			},
			fragment: {
				type: "string",
				description: "create only, required: the inline HTML fragment to render (markup, style, and script — no document skeleton)."
			},
			title: {
				type: "string",
				description: "Concise card title. Defaults to \"Visualization\" on create; required on update."
			},
			mode: {
				type: "string",
				enum: ["inline", "wide"],
				description: "Card width: `inline` (default) or `wide` for side-by-side panel comparisons."
			},
			path: {
				type: "string",
				description: "update only, required: workspace path of the card to patch, as its own call reported it."
			},
			old_str: {
				type: "string",
				description: "update only, required: the exact card text to replace, whitespace included. It must appear exactly once — keep it as short as stays unique."
			},
			new_str: {
				type: "string",
				description: "update only, required: the replacement text. Empty deletes the matched region."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					action: {
						type: "string",
						required: true,
						enum: ["create", "update"]
					},
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
				text: value.action === "update" ? `Patched "${value.title}" in place (${value.sizeBytes} bytes; updated card at ${value.path}). The user sees the corrected visualization in the conversation; patch that path for any further correction.` : `Rendered "${value.title}" inline (${value.sizeBytes} bytes; workspace copy at ${value.path}). The user sees the interactive visualization in the conversation.`
			}],
			presentationMeta: (_args, value) => ({
				kind: "visualize",
				fragment: value.fragment,
				title: value.title,
				mode: value.mode,
				path: value.path
			})
		},
		isConcurrencySafe: (args) => (args.action ?? "create") === "create",
		async execute(args, exec) {
			const action = args.action ?? "create";
			const sandboxPolicy = ctx.get("sandboxPolicy")?.resolve({ ...exec.agent ? { session: exec.agent.session } : {} });
			const cwd = sandboxPolicy?.workspaceRoot ?? exec.agent?.session.header.cwd;
			const resolveOpts = {
				...cwd !== void 0 ? { cwd } : {},
				signal: exec.signal
			};
			let source;
			let fragment;
			if (action === "update") {
				source = await ctx.fs.resolve(required(args.path, "path", action), resolveOpts);
				fragment = applyFragmentPatch(await ctx.fs.readText(source, exec.signal), required(args.old_str, "old_str", action), present(args.new_str, "new_str", action));
			} else fragment = required(args.fragment, "fragment", action);
			const sizeBytes = validateFragment(fragment, maxFragmentBytes);
			const title = action === "update" ? required(args.title, "title", action).trim() : args.title?.trim() || "Visualization";
			const target = source ?? await ctx.fs.resolve(`viz/${slugOf(title)}-${contentHash(fragment)}.html`, resolveOpts);
			await ctx.fs.writeText(target, fragment, void 0, exec.signal, sandboxPolicy);
			return {
				action,
				path: target.displayPath,
				title,
				mode: args.mode ?? "inline",
				sizeBytes,
				fragment
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
* Take one argument the chosen action cannot run without. The parameter schema
* cannot express "required on update only", so the per-action requirement is
* enforced here and fails loud rather than defaulting into a wrong card.
* @param value - the raw argument value.
* @param name - the parameter name, as the model wrote it.
* @param action - the action that requires it, named in the message.
* @returns the raw value, whitespace preserved.
* @throws Error naming the missing parameter; the tool surfaces it as `isError`.
*/
function required(value, name, action) {
	if (value === void 0 || value.trim().length === 0) throw new Error(`invalid visualization: \`${name}\` is required when action is "${action}"`);
	return value;
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
function present(value, name, action) {
	if (value === void 0) throw new Error(`invalid visualization: \`${name}\` is required when action is "${action}"`);
	return value;
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
