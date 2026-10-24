import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { lookup } from "node:dns";
import { request } from "node:http";
import { request as request$1 } from "node:https";
import { BlockList, isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
//#region src/style.ts
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
const STYLE_IDS = [
	"whale",
	"editorial",
	"paper",
	"sketch",
	"terminal"
];
/** The style a card takes when its meta names none, or one this build lacks. */
const DEFAULT_STYLE = "whale";
const SYSTEM_SANS = "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
/** `light-dark()` shorthand for the tables below. */
function ld(light, dark) {
	return `light-dark(${light}, ${dark})`;
}
/** Six series as `--dsh-viz-series-N` entries. */
function series(pairs) {
	return Object.fromEntries(pairs.map(([light, dark], i) => [`series-${i + 1}`, ld(light, dark)]));
}
const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?";
/** The built-in styles by id. */
const STYLES = {
	whale: {
		id: "whale",
		label: "鲸蓝 · Whale (default)",
		vars: {},
		chart: {}
	},
	editorial: {
		id: "editorial",
		label: "报刊 · Editorial",
		vars: {
			"foreground": ld("#1a1a1a", "#f2efe9"),
			"muted-foreground": ld("#5f5f5f", "#a8a39b"),
			"card": ld("rgb(140 110 60 / 6%)", "rgb(255 235 205 / 5%)"),
			"border": ld("rgb(0 0 0 / 12%)", "rgb(255 255 255 / 14%)"),
			"primary": ld("#b24032", "#f07a62"),
			"primary-foreground": ld("#ffffff", "#151517"),
			...series([
				["#b24032", "#f07a62"],
				["#28659d", "#78ade8"],
				["#26826b", "#5eccab"],
				["#a87810", "#e3b04b"],
				["#7a4e8c", "#c395d2"],
				["#6e6259", "#b2a696"]
			]),
			"context": ld("#8a8a8a", "#6f6f6f"),
			"grid": ld("rgb(0 0 0 / 8%)", "rgb(255 255 255 / 9%)"),
			"axis": ld("rgb(26 26 26 / 60%)", "rgb(242 239 233 / 60%)"),
			"font-display": "'Source Serif 4', 'Noto Serif SC', 'Songti SC', serif",
			"font-sans": "'Libre Franklin', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
			"radius": "2px"
		},
		fontHref: `${GOOGLE_FONTS}family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Libre+Franklin:wght@400;500;600&family=Noto+Serif+SC:wght@500;700&display=swap`,
		extraCss: "h1, h2, h3 { font-weight: 600; letter-spacing: -0.005em; }",
		chart: {
			pointRadius: 0,
			valueAxisLine: false
		}
	},
	paper: {
		id: "paper",
		label: "论文 · Paper",
		vars: {
			"foreground": ld("#111111", "#ececec"),
			"muted-foreground": ld("#555555", "#a6a6a6"),
			"card": ld("rgb(0 0 0 / 2.5%)", "rgb(255 255 255 / 4%)"),
			"border": ld("rgb(0 0 0 / 18%)", "rgb(255 255 255 / 18%)"),
			"primary": ld("#0072b2", "#58b6ed"),
			"primary-foreground": ld("#ffffff", "#111111"),
			...series([
				["#0072b2", "#58b6ed"],
				["#d55e00", "#e8743b"],
				["#0c9c67", "#35b67e"],
				["#c774a4", "#da91bd"],
				["#9d7d36", "#e69f00"],
				["#3b3b3b", "#d0d0d0"]
			]),
			"grid": ld("rgb(0 0 0 / 6%)", "rgb(255 255 255 / 7%)"),
			"grid-axes": "none",
			"axis": ld("rgb(17 17 17 / 70%)", "rgb(236 236 236 / 70%)"),
			"line-width": "1.5",
			"font-display": "'STIX Two Text', 'Noto Serif SC', 'Songti SC', serif",
			"font-sans": "'STIX Two Text', 'Noto Serif SC', 'Songti SC', serif",
			"radius": "2px"
		},
		fontHref: `${GOOGLE_FONTS}family=STIX+Two+Text:wght@400;500;600&family=Noto+Serif+SC:wght@400;600&display=swap`,
		chart: {
			pointRadius: 3,
			pointStyles: [
				"circle",
				"triangle",
				"rect",
				"rectRot",
				"crossRot",
				"star"
			],
			dashes: [
				[],
				[6, 3],
				[2, 2],
				[
					8,
					3,
					2,
					3
				]
			]
		}
	},
	sketch: {
		id: "sketch",
		label: "手绘 · Sketch",
		vars: {
			"foreground": ld("#1e1e1e", "#ececec"),
			"muted-foreground": ld("#5c5f66", "#a6a7ab"),
			"card": ld("rgb(250 176 5 / 9%)", "rgb(250 176 5 / 7%)"),
			"border": ld("rgb(30 30 30 / 35%)", "rgb(236 236 236 / 35%)"),
			"primary": ld("#2d71b7", "#74c0fc"),
			"primary-foreground": ld("#ffffff", "#1e1e1e"),
			...series([
				["#2d71b7", "#74c0fc"],
				["#cb1913", "#ff8787"],
				["#36a047", "#91ea91"],
				["#7048e8", "#9775fa"],
				["#e8590c", "#ffa94d"],
				["#108f6c", "#55e6c6"]
			]),
			"grid-axes": "none",
			"axis": ld("rgb(30 30 30 / 60%)", "rgb(236 236 236 / 60%)"),
			"line-width": "2.5",
			"font-display": "'Kalam', 'LXGW WenKai TC', 'Kaiti SC', 'STKaiti', cursive",
			"font-sans": "'Kalam', 'LXGW WenKai TC', 'Kaiti SC', 'STKaiti', cursive",
			"font-mono": "'LXGW WenKai Mono TC', ui-monospace, monospace",
			"font-size-base": "15px",
			"radius": "10px"
		},
		fontHref: `${GOOGLE_FONTS}family=Kalam:wght@400;700&family=LXGW+WenKai+TC:wght@400;700&family=LXGW+WenKai+Mono+TC:wght@400&display=swap`,
		extraCss: `.card { border-width: 1.5px; border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px; }
.viz-stat-value, table { font-family: ${SYSTEM_SANS}; }`,
		chart: {
			tension: .35,
			pointRadius: 0,
			axisWidth: 1.5
		}
	},
	terminal: {
		id: "terminal",
		label: "终端 · Terminal",
		vars: {
			"foreground": ld("#1f2328", "#d6dccf"),
			"muted-foreground": ld("#59636e", "#8f9a8c"),
			"card": ld("rgb(0 0 0 / 3.5%)", "rgb(50 216 135 / 5%)"),
			"border": ld("rgb(0 0 0 / 16%)", "rgb(214 220 207 / 16%)"),
			"primary": ld("#177a46", "#32d887"),
			"primary-foreground": ld("#ffffff", "#0d0f0d"),
			...series([
				["#1e9157", "#32d887"],
				["#8c5e03", "#f2b33d"],
				["#3a757f", "#8ac9d4"],
				["#9b0b9e", "#e07ce0"],
				["#cf222e", "#ff6b6b"],
				["#0a50ae", "#79a8ff"]
			]),
			"grid": ld("rgb(0 0 0 / 10%)", "rgb(214 220 207 / 10%)"),
			"grid-axes": "both",
			"grid-dash": "2 4",
			"line-width": "1.5",
			"font-display": "'JetBrains Mono', 'LXGW WenKai Mono TC', 'Sarasa Mono SC', ui-monospace, 'SF Mono', monospace",
			"font-sans": "'JetBrains Mono', 'LXGW WenKai Mono TC', 'Sarasa Mono SC', ui-monospace, 'SF Mono', monospace",
			"font-mono": "'JetBrains Mono', 'LXGW WenKai Mono TC', 'Sarasa Mono SC', ui-monospace, 'SF Mono', monospace",
			"font-size-base": "13px",
			"radius": "0px"
		},
		fontHref: `${GOOGLE_FONTS}family=JetBrains+Mono:wght@400;500;700&family=LXGW+WenKai+Mono+TC:wght@400;700&display=swap`,
		extraCss: "body { font-variant-numeric: tabular-nums; }",
		chart: {
			tension: 0,
			pointRadius: 2,
			pointStyles: ["rect"]
		}
	}
};
/**
* `globalThis` property the node half sets on every DSH web page it serves —
* `{ style }`, the configured card style — so the browser half knows the
* active style before any card in the page has settled.
*/
const PAGE_CONFIG_GLOBAL = "__DSH_VISUALIZE_CONFIG__";
/**
* Path of the node half's style-file route on the host's `/api` channel,
* which the settings page calls (style-files.ts).
*/
const STYLE_FILES_PATH = "/api/dsh-visualize/style-files";
/**
* Narrow a persisted or configured value to a style id. Wire data may come
* from an older card (no style) or a newer build (an id this one lacks); both
* render in the default rather than declining the card.
* @param value - the raw value.
* @returns a known style id.
*/
function styleIdFrom(value) {
	return typeof value === "string" && STYLE_IDS.includes(value) ? value : DEFAULT_STYLE;
}
//#endregion
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
* nest documents and is rejected loudly instead of rendered broken (see
* `lint.ts` for that rule and the rest of the contract's rule table).
*
* @module @nagi-ovo/dsh-visualize/fragment
*/
/**
* Wire name of the tool, the keyed toolview, and the streaming-preview match.
* Lives in this pure module so the browser half can import it without pulling
* the node-side tool implementation into the client bundle.
*/
const VISUALIZE_TOOL_NAME = "visualize";
/** Every {@link VisualizeMode}, in the order the tool schema lists them. */
const VISUALIZE_MODES = [
	"inline",
	"wide",
	"page"
];
/**
* Narrow one wire value to a {@link VisualizeMode}.
* @param value - the raw value.
* @returns whether it names a known mode.
*/
function isVisualizeMode(value) {
	return value === "inline" || value === "wide" || value === "page";
}
/** Every {@link CardImageType}. */
const CARD_IMAGE_TYPES = [
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/svg+xml"
];
/**
* Exact route on the host's authenticated `/api` channel (dsh 0.1.7+) that
* serves a stored card image by its {@link CardImage.id}.
*/
const IMAGE_ROUTE_PATH = "/api/dsh-visualize/image";
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
	const { fragment, title, mode, path, summary } = record;
	if (typeof fragment !== "string" || typeof title !== "string" || typeof path !== "string") return void 0;
	if (!isVisualizeMode(mode)) return void 0;
	return {
		kind: "visualize",
		fragment,
		title,
		mode,
		path,
		...summaryField(summary),
		style: styleIdFrom(record["style"]),
		...imagesField(record["images"])
	};
}
/**
* The optional image references as a spreadable field. A malformed entry is
* dropped on its own: that image shows its placeholder, the card still renders.
* @param images - the raw wire value.
* @returns `{ images }` with every well-formed entry, or an empty object.
*/
function imagesField(images) {
	if (!Array.isArray(images)) return {};
	const list = images.flatMap((entry) => {
		if (typeof entry !== "object" || entry === null) return [];
		const { src, id, type, bytes } = entry;
		if (typeof src !== "string" || typeof id !== "string" || typeof bytes !== "number") return [];
		if (!CARD_IMAGE_TYPES.includes(type)) return [];
		return [{
			src,
			id,
			type,
			bytes
		}];
	});
	return list.length > 0 ? { images: list } : {};
}
/**
* The optional summary as a spreadable field: a missing or malformed one is
* dropped rather than declining the whole card over a caption.
* @param summary - the raw wire value.
* @returns `{ summary }` for a non-blank string, otherwise an empty object.
*/
function summaryField(summary) {
	return typeof summary === "string" && summary.trim().length > 0 ? { summary: summary.trim() } : {};
}
//#endregion
//#region src/storage.ts
/**
* Where a card's settled fragment lives on disk, and how an `update` finds it
* again.
*
* New cards go to a per-session store under the harness home —
* `$DSH_HOME/visualize/sessions/<session>/<slug>-<hash>.<style>.html` — never into the
* user's project, so `git status` stays clean and conversations do not mix.
* The plugin owns these files and writes them with its own node fs: the store
* sits outside every sandbox write root, and the model never addresses it
* except by handing back a path this module reported.
*
* The home comes from the host's `dshHomePath` value, which app-boot provides
* on the root context from dsh 0.1.1 onward; a host without it (or a call
* without a session) keeps the original behaviour, a copy under `viz/` in the
* session workspace written through `ctx.fs` and the session sandbox policy.
*
* An `update` path is model-supplied, so it is only trusted as far as it
* proves itself: a path inside the store is read and rewritten with node fs;
* a legacy `viz/...` copy from an earlier session must be an `.html` file
* inside the session workspace, after `~` expansion, `..` normalization, and
* symlink resolution, and goes through `ctx.fs` under the sandbox policy. Any
* other path is refused before it is read: the sandbox confines writes, not
* reads, and a failed patch quotes card text back to the model.
*
* Images a card embeds (`data-viz-src`, see images.ts) are stored beside the
* session's cards, content-addressed under `images/`, and each store card
* keeps a sidecar manifest (`<card>.images.json`) of what it resolved so an
* `update` can carry them. The browser reads them back through one exact
* route ({@link handleImageRequest}) that only ever opens a file named by a
* well-formed id below the store root.
*
* @module @nagi-ovo/dsh-visualize/storage
*/
/** Directory under the harness home that holds every plugin-owned card. */
const STORE_DIR = "visualize";
/**
* Build the card store for one execution.
* @param ctx - registrant context carrying `ctx.fs`, `sandboxPolicy`, and the host home path.
* @param exec - the calling execution, for its session and signal.
* @returns the store; its `create` falls back to the workspace when the host lacks a home path.
*/
function cardStore(ctx, exec) {
	const root = storeRoot(ctx);
	const sessionId = exec.agent?.session.id;
	const workspace = workspaceFiles(ctx, exec);
	return {
		async create(name) {
			if (root === void 0 || typeof sessionId !== "string" || sessionId.length === 0) return await workspace.open(`viz/${name}`);
			return ownedFile(root, join(root, "sessions", sessionSegment(sessionId), name));
		},
		images: root === void 0 || typeof sessionId !== "string" || sessionId.length === 0 ? void 0 : sessionImages(root, sessionSegment(sessionId)),
		workspaceRoot: workspace.root,
		async open(path) {
			const owned = root === void 0 ? void 0 : await ownedPath(root, path);
			if (owned !== void 0) return ownedFile(root, owned);
			const legacy = await workspacePath(workspace.root, path);
			if (legacy === void 0) throw new Error(`invalid visualization patch: ${JSON.stringify(path)} is not a card visualize can patch — pass the path a visualize call reported (a card in the session store, or a legacy viz/ .html copy inside the workspace)`);
			return await workspace.open(legacy);
		}
	};
}
/**
* Accept a model-supplied path as a legacy workspace card only if it names an
* `.html` file inside the session workspace, lexically and after symlink
* resolution. The fs seam's sandbox confines writes but not reads, and a
* failed patch quotes the card text back, so an unconfined read would leak
* any file the host can open.
* @param root - the session workspace root, undefined when the session has none.
* @param path - the `update` path as the model passed it (`~/` allowed).
* @returns the path to resolve through the seam, or undefined when it is not contained.
*/
async function workspacePath(root, path) {
	if (root === void 0 || !isAbsolute(root)) return void 0;
	const tilde = path === "~" || path.startsWith("~/");
	const expanded = tilde ? join(homedir(), path.slice(1)) : path;
	const base = resolve(root);
	const target = resolve(base, expanded);
	if (!inside(base, target) || !target.endsWith(".html")) return void 0;
	if (!inside(await realpath(base).catch(() => base), await realpathOfDeepest(target))) return void 0;
	return tilde || isAbsolute(path) ? target : path;
}
/**
* Resolve symlinks in the longest existing prefix of `target`; the missing
* remainder cannot be a link yet.
* @param target - absolute path.
* @returns the real path of the deepest existing ancestor joined with the rest.
*/
async function realpathOfDeepest(target) {
	let existing = target;
	for (;;) try {
		return join(await realpath(existing), relative(existing, target));
	} catch {
		const parent = dirname(existing);
		if (parent === existing) return target;
		existing = parent;
	}
}
/**
* The store root under the harness home, when the host provides one.
* @param ctx - registrant context.
* @returns the absolute root, or undefined on a host without `dshHomePath`.
*/
function storeRoot(ctx) {
	let homePath;
	try {
		homePath = ctx.get("dshHomePath");
	} catch {
		return;
	}
	if (typeof homePath !== "function") return void 0;
	const root = homePath(STORE_DIR);
	return typeof root === "string" && isAbsolute(root) ? resolve(root) : void 0;
}
/**
* Encode a session id as exactly one path segment, injectively: every
* character outside `[A-Za-z0-9_-]` — separators, dots, `~` itself — becomes
* `~` plus its code point in hex, so no id can name `.`, `..`, or a nested path.
* @param id - the raw session id.
* @returns the directory name for that session.
*/
function sessionSegment(id) {
	return Array.from(id, (char) => /^[A-Za-z0-9_-]$/u.test(char) ? char : `~${char.codePointAt(0).toString(16).padStart(4, "0")}`).join("");
}
/**
* Accept a model-supplied path as a store file only if it names an `.html`
* file below the root after normalization and symlink resolution.
* @param root - absolute store root.
* @param path - the `update` path as the model passed it (`~/` allowed).
* @returns the absolute store path, or undefined when it is not a store file.
*/
async function ownedPath(root, path) {
	const expanded = path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
	if (!isAbsolute(expanded)) return void 0;
	const target = resolve(expanded);
	if (!inside(root, target) || !target.endsWith(".html")) return void 0;
	const real = await realpath(target).catch(async () => await realpath(dirname(target)).then((parent) => join(parent, "card.html"), () => void 0));
	if (real === void 0) return target;
	return inside(await realpath(root).catch(() => root), real) ? target : void 0;
}
/**
* Whether `target` lies strictly below `root`.
* @param root - absolute directory.
* @param target - absolute path.
* @returns true for a descendant, false for the root itself or anything outside.
*/
function inside(root, target) {
	const rel = relative(root, target);
	return rel.length > 0 && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}
/**
* A plugin-owned card file, read and written with node fs. Writes go through
* a sibling temporary file and a rename, so a reader never sees half a card.
* @param root - absolute store root, for the display form.
* @param path - absolute file path below the root.
* @returns the card file.
*/
function ownedFile(root, path) {
	return {
		displayPath: displayOf(path),
		read: async () => await readFile(path, "utf8"),
		write: async (content) => await writeFileAtomic(path, content),
		images: manifestAt(`${path.slice(0, -5)}.images.json`)
	};
}
/** Directory under a session's card directory that holds its images. */
const IMAGE_DIR = "images";
/** File extension each image type is stored under. */
const IMAGE_EXTENSIONS = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg"
};
/** A well-formed image id: one session segment, a sha256 digest, a known extension. */
const IMAGE_ID = /^([A-Za-z0-9_~-]+)\/([0-9a-f]{64})\.(png|jpg|gif|webp|svg)$/u;
/**
* The store path an image id names, or undefined for anything but a
* well-formed id: no separator, dot segment, or other extension gets through.
* @param root - absolute store root.
* @param id - the id as a request or a manifest carries it.
* @returns the absolute path below the root.
*/
function imagePath(root, id) {
	const m = IMAGE_ID.exec(id);
	return m === null ? void 0 : join(root, "sessions", m[1], IMAGE_DIR, `${m[2]}.${m[3]}`);
}
/**
* One session's image store.
* @param root - absolute store root.
* @param segment - the session's directory name ({@link sessionSegment}).
* @returns the store.
*/
function sessionImages(root, segment) {
	return {
		async put(data, type) {
			const id = `${segment}/${createHash("sha256").update(data).digest("hex")}.${IMAGE_EXTENSIONS[type]}`;
			const path = imagePath(root, id);
			if (!await exists(path)) await writeFileAtomic(path, data);
			return id;
		},
		async exists(id) {
			const path = imagePath(root, id);
			return path !== void 0 && await exists(path);
		}
	};
}
/** Whether a path exists. */
async function exists(path) {
	return await access(path).then(() => true, () => false);
}
/**
* A store card's sidecar manifest. Unreadable or malformed content reads as
* empty, so a damaged manifest costs a re-resolve, never the patch.
* @param path - absolute manifest path beside the card.
* @returns the manifest.
*/
function manifestAt(path) {
	return {
		async read() {
			let parsed;
			try {
				parsed = JSON.parse(await readFile(path, "utf8"));
			} catch {
				return [];
			}
			if (!Array.isArray(parsed)) return [];
			return parsed.flatMap((entry) => {
				if (typeof entry !== "object" || entry === null) return [];
				const { src, id, type, bytes, origin } = entry;
				if (typeof src !== "string" || typeof id !== "string" || IMAGE_ID.exec(id) === null) return [];
				if (typeof bytes !== "number" || !CARD_IMAGE_TYPES.includes(type) || origin !== "url" && origin !== "file") return [];
				return [{
					src,
					id,
					type,
					bytes,
					origin
				}];
			});
		},
		async write(images) {
			if (images.length === 0) await rm(path, { force: true });
			else await writeFileAtomic(path, JSON.stringify(images));
		}
	};
}
/**
* Read one stored image for the route: the id must be well formed, the file
* a regular file (not a symlink) whose real path stays below the store root,
* and its bytes must still hash to the digest the id names.
* @param root - absolute store root, undefined on a host without one.
* @param id - the requested id.
* @returns the bytes, or undefined when the id names nothing servable.
*/
async function readStoredImage(root, id) {
	if (root === void 0) return void 0;
	const path = imagePath(root, id);
	if (path === void 0) return void 0;
	const stat = await lstat(path).catch(() => void 0);
	if (stat === void 0 || !stat.isFile()) return void 0;
	const realRoot = await realpath(root).catch(() => root);
	const real = await realpath(path).catch(() => void 0);
	if (real === void 0 || !inside(realRoot, real)) return void 0;
	const data = await readFile(real).catch(() => void 0);
	if (data === void 0) return void 0;
	return createHash("sha256").update(data).digest("hex") === IMAGE_ID.exec(id)[2] ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : void 0;
}
/**
* Answer one request on the image route (`IMAGE_ROUTE_PATH`): `GET ?id=<image id>`. The
* host channel has already authenticated the browser as the owner. The bytes
* go out as an opaque download, never as a renderable type, so opening the
* URL directly cannot run an SVG's script on the app's origin; the card
* itself knows each image's type from its meta.
* @param root - absolute store root, undefined on a host without one.
* @param request - the request.
* @returns the response.
*/
async function handleImageRequest(root, request) {
	if (request.method !== "GET" && request.method !== "HEAD") return new Response("method not allowed", { status: 405 });
	const data = await readStoredImage(root, new URL(request.url).searchParams.get("id") ?? "");
	if (data === void 0) return new Response("not found", {
		status: 404,
		headers: { "cache-control": "no-store" }
	});
	return new Response(request.method === "HEAD" ? null : data, {
		status: 200,
		headers: {
			"content-type": "application/octet-stream",
			"content-length": String(data.byteLength),
			"content-disposition": "attachment",
			"content-security-policy": "default-src 'none'; sandbox",
			"x-content-type-options": "nosniff",
			"cache-control": "private, max-age=31536000, immutable"
		}
	});
}
/**
* Write a plugin-owned file through a sibling temporary file and a rename, so
* a reader never sees half of it. The rename replaces a symlink at `path`
* rather than writing through it.
* @param path - absolute file path; missing parent directories are created private.
* @param content - the new text, or raw bytes.
*/
async function writeFileAtomic(path, content) {
	await mkdir(dirname(path), {
		recursive: true,
		mode: 448
	});
	const temp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
	try {
		await writeFile(temp, content, {
			encoding: "utf8",
			mode: 384,
			flag: "wx"
		});
		await rename(temp, path);
	} catch (error) {
		if (error.code !== "EEXIST") await rm(temp, { force: true }).catch(() => {});
		throw error;
	}
}
/**
* Shorten an absolute store path for display: the OS home becomes `~`, which
* {@link ownedPath} expands again when the model hands the path back.
* @param path - absolute path.
* @returns the display path.
*/
function displayOf(path) {
	const home = homedir();
	return path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path;
}
/**
* Workspace files through the composed fs seam and the session-level sandbox
* policy, as the official fs tools resolve them: the calling session's cwd is
* the workspace root. Without the session policy a confining backend falls
* back to its process-level default root and denies the write whenever the
* session cwd lies elsewhere.
* @param ctx - registrant context.
* @param exec - the calling execution.
* @returns the workspace root (undefined when the session has none) and a
* resolver from a workspace-relative or absolute path to a card file.
*/
function workspaceFiles(ctx, exec) {
	const sandboxPolicy = ctx.get("sandboxPolicy")?.resolve({ ...exec.agent ? { session: exec.agent.session } : {} });
	const cwd = sandboxPolicy?.workspaceRoot ?? exec.agent?.session.header.cwd;
	const resolveOpts = {
		...cwd !== void 0 ? { cwd } : {},
		signal: exec.signal
	};
	return {
		root: cwd,
		async open(path) {
			const target = await ctx.fs.resolve(path, resolveOpts);
			return {
				displayPath: target.displayPath,
				read: async () => await ctx.fs.readText(target, exec.signal),
				async write(content) {
					await ctx.fs.writeText(target, content, void 0, exec.signal, sandboxPolicy);
				}
			};
		}
	};
}
//#endregion
//#region src/shell.ts
/** CDN origins a fragment may load static resources from. */
const RESOURCE_ORIGINS = [
	"https://cdnjs.cloudflare.com",
	"https://cdn.jsdelivr.net",
	"https://esm.sh",
	"https://fonts.bunny.net",
	"https://fonts.googleapis.com",
	"https://fonts.gstatic.com",
	"https://unpkg.com"
];
const RESOURCE_SOURCES = [
	"blob:",
	"data:",
	...RESOURCE_ORIGINS
].join(" ");
[
	"default-src 'none'",
	`script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${RESOURCE_SOURCES}`,
	`style-src 'unsafe-inline' ${RESOURCE_SOURCES}`,
	`img-src ${RESOURCE_SOURCES}`,
	`font-src ${RESOURCE_SOURCES}`,
	`media-src ${RESOURCE_SOURCES}`,
	"worker-src blob:",
	"connect-src blob: data:",
	"frame-src 'none'",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'none'"
].join("; ");
//#endregion
//#region src/lint.ts
/**
* Fragment linter: the inline contract the `visualize` skill states, enforced
* as a table of coded rules whose findings go back to the model verbatim.
*
* Severity is a promise about precision. An `error` rejects the call — nothing
* renders and nothing is written — so error rules only fire on patterns that
* reliably break the card or violate its policy. Anything heuristic is a
* `warn`: the card renders and the finding rides along in the success text.
* An error rule whose match it cannot read with certainty — script text whose
* meaning depends on scope, a property chain, or a shape that parses two ways —
* reports that finding as a `warn` with the same code and fix. A false error
* blocks a valid card; a missed one only leaves part of a card to the CSP.
*
* There is no HTML or JS parser here. One linear pass splits the fragment into
* markup, comments, and `<script>`/`<style>` bodies; script bodies are then
* tokenised just far enough to tell code from comments, strings, and regex
* literals, and style bodies just far enough to tell selectors from
* declaration values. Every rule queries those views, so a `fetch(` in a
* comment, a hex digit run in an id selector, or a `\n` inside a JS string
* never trips anything. Pure and DOM-free so vitest loads it unchanged.
*
* @module @nagi-ovo/dsh-visualize/lint
*/
/** Hosts a fragment may load static resources from, as the frame CSP lists them. */
const ALLOWED_HOSTS = RESOURCE_ORIGINS.map((origin) => origin.slice(8));
/**
* The rule table. Codes are stable: the model sees them, and a repeated code
* is what the loop guard counts. Error rules are `VZ0xx`, warn rules `VZ1xx`.
* A rule's severity is what a certain match reports; an uncertain match of an
* error rule is downgraded to `warn` per finding.
*/
const LINT_RULES = {
	VZ001: {
		severity: "error",
		message: "the fragment is empty",
		fix: "pass the visualization markup itself in `fragment`"
	},
	VZ002: {
		severity: "error",
		message: "the fragment is over the size limit",
		fix: "shrink the inline data first (fewer rows, coarser buckets, fewer decimals, no unused fields)"
	},
	VZ003: {
		severity: "error",
		message: "the fragment contains a document-skeleton tag",
		fix: "write only the inline body; the host supplies <!doctype>, <html>, <head>, and <body>"
	},
	VZ004: {
		severity: "error",
		message: "the markup is string-escaped (literal \\\" or \\n where real quotes and line breaks belong)",
		fix: "send the markup itself, with real \" quotes and real line breaks, not a JSON-escaped rendition of it"
	},
	VZ005: {
		severity: "error",
		message: "external resource the card blocks",
		fix: `load it over https from an allowlisted host (${ALLOWED_HOSTS.join(", ")}), or inline it`
	},
	VZ006: {
		severity: "error",
		message: "CDN resource without a pinned version",
		fix: "pin an exact version in the URL, e.g. https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"
	},
	VZ007: {
		severity: "error",
		message: "network API, blocked inside the card (it fails without an error message)",
		fix: "inline the data in the script as a literal, reduced first; the card cannot reach any server"
	},
	VZ008: {
		severity: "error",
		message: "form submission, blocked inside the card",
		fix: "drop action/method/formaction and handle the input in a submit listener that calls event.preventDefault()"
	},
	VZ009: {
		severity: "error",
		message: "declares color-scheme, which flips every light-dark() against the host theme",
		fix: "delete the color-scheme declaration; the card document already carries the host scheme"
	},
	VZ010: {
		severity: "error",
		message: "document.currentScript is used to locate the root",
		fix: "give the root element a unique id and find it with document.getElementById(...)"
	},
	VZ011: {
		severity: "error",
		message: "image from a host the card blocks",
		fix: "write data-viz-src=\"<the same URL>\" instead of src; the tool fetches the image and embeds it in the card"
	},
	VZ101: {
		severity: "warn",
		message: "hard-coded colour, which ignores the host theme",
		fix: "use a theme variable (var(--foreground), var(--viz-series-1), …) or a light-dark(<light>, <dark>) pair; for canvas, resolve the variable through a probe element"
	},
	VZ102: {
		severity: "warn",
		message: "the script looks up an id no element in the fragment has",
		fix: "add that id to the element, or correct the lookup"
	},
	VZ103: {
		severity: "warn",
		message: "no element has an id for the script to find its root by",
		fix: "give the root element a unique id and find it with document.getElementById(...)"
	},
	VZ104: {
		severity: "warn",
		message: "Chart.defaults.font.family = 'inherit' is not a canvas font, so chart text falls back to the browser default",
		fix: "call dshViz.chartDefaults(Chart, root), which sets the card style's computed font, or set Chart.defaults.font.family = getComputedStyle(document.body).fontFamily"
	},
	VZ105: {
		severity: "warn",
		message: "CDN version is a range or partial version, so the build can change under the card",
		fix: "pin the exact major.minor.patch version"
	},
	VZ106: {
		severity: "warn",
		message: "relative or bare URL, which cannot resolve inside the sandboxed card",
		fix: "use a full https URL on an allowlisted host, or inline the resource (data: URLs work)"
	},
	VZ107: {
		severity: "warn",
		message: "relative image path, which cannot resolve inside the sandboxed card",
		fix: "for a workspace file write data-viz-src=\"<path relative to the workspace root>\" instead of src; the tool reads the file and embeds it in the card"
	},
	VZ199: {
		severity: "warn",
		message: "a lint stage failed and was skipped, so its rules were not checked",
		fix: "nothing to change for this warning; check the card by eye against the rules that stage covers"
	}
};
/**
* Lint one fragment against the inline contract.
* @param fragment - the markup the card would render.
* @param maxBytes - deployment size ceiling for one fragment.
* @returns the size and every finding; the caller decides what to reject.
*/
function lintFragment(fragment, maxBytes) {
	const sizeBytes = new TextEncoder().encode(fragment).length;
	const sink = new FindingSink(fragment);
	if (fragment.trim().length === 0) {
		sink.add("VZ001", 0, 0);
		return {
			sizeBytes,
			findings: sink.sorted()
		};
	}
	if (sizeBytes > maxBytes) {
		sink.add("VZ002", 0, 0, `${sizeBytes} bytes, over the ${maxBytes}-byte limit`);
		return {
			sizeBytes,
			findings: sink.sorted()
		};
	}
	const skipped = [];
	const reasons = [];
	const guard = (stage, run) => {
		try {
			run();
		} catch (error) {
			const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
			skipped.push(`${stage}: ${reason}`);
			reasons.push(`${stage} (${reason})`);
		}
	};
	let doc;
	guard("scan", () => {
		doc = scanDocument(fragment);
	});
	if (doc !== void 0) {
		const scanned = doc;
		for (const [stage, check] of RULE_STAGES) guard(stage, () => check(scanned, sink));
	}
	if (reasons.length > 0) sink.add("VZ199", 0, 0, reasons.join("; "));
	return {
		sizeBytes,
		findings: sink.sorted(),
		...skipped.length > 0 ? { skipped } : {}
	};
}
/** The rule passes, in the order they run; each is guarded on its own. */
const RULE_STAGES = [
	["skeleton", (doc, sink) => checkSkeleton(doc, sink)],
	["escaped-markup", (doc, sink) => checkEscapedMarkup(doc, sink)],
	["resources", (doc, sink) => checkResources(doc, sink)],
	["forms", (doc, sink) => checkForms(doc, sink)],
	["scripts", (doc, sink) => checkScripts(doc, sink)],
	["styles", (doc, sink) => checkStyles(doc, sink)],
	["ids", (doc, sink) => checkIds(doc, sink)]
];
/**
* Validate one fragment against the inline contract.
* @param fragment - the markup the model sent.
* @param maxBytes - deployment size ceiling for one fragment.
* @returns the fragment's UTF-8 size in bytes.
* @throws Error listing every `error` finding; the tool surfaces it as `isError`.
*/
function validateFragment(fragment, maxBytes) {
	const { sizeBytes, findings } = lintFragment(fragment, maxBytes);
	const errors = findings.filter((f) => f.severity === "error");
	if (errors.length > 0) throw new Error(formatRejection(errors, findings.filter((f) => f.severity === "warn")));
	return sizeBytes;
}
/**
* The `<img data-viz-src>` attributes in the markup, in document order.
* Script and style bodies and comments are not markup, so an image a script
* builds at run time is not listed.
* @param fragment - the card's markup.
* @returns every non-empty attribute, duplicates included.
*/
function imageSources(fragment) {
	const out = [];
	for (const tag of scanDocument(fragment).tags) {
		if (tag.closing || tag.name !== "img") continue;
		const a = tag.attrs.find((entry) => entry.name === "data-viz-src");
		if (a?.value !== void 0 && a.value.trim().length > 0) out.push({
			raw: a.value,
			offset: a.valueStart
		});
	}
	return out;
}
/** At most this many findings of one code are spelled out in a message. */
const SHOWN_PER_CODE = 3;
/**
* Format the rejection text the model sees when a call has errors.
* @param errors - the blocking findings.
* @param warnings - non-blocking findings, listed so one retry fixes everything.
* @param patched - whether positions refer to a card a patch produced.
* @returns the message body (no loop-guard suffix).
*/
function formatRejection(errors, warnings = [], patched = false) {
	const parts = [`invalid visualization: nothing was rendered. Fix ${errors.length === 1 ? "the error" : `the ${errors.length} errors`} below and call visualize again (positions are line:column in ${patched ? "the card as your patch would leave it" : "the fragment you sent"}).`, formatFindings(errors)];
	if (warnings.length > 0) parts.push("Warnings (not blocking; fix them in the same call if cheap):", formatFindings(warnings));
	return parts.join("\n");
}
/**
* Format findings one per entry, at most {@link SHOWN_PER_CODE} per code with
* the remaining positions summarised, so 200 hex literals do not flood context.
* @param findings - findings to list, optionally tagged with their origin.
* @returns the formatted block.
*/
function formatFindings(findings) {
	const placed = findings.map((f) => "finding" in f ? f : {
		finding: f,
		origin: "new"
	});
	const byCode = /* @__PURE__ */ new Map();
	for (const entry of placed) {
		const list = byCode.get(entry.finding.code) ?? [];
		list.push(entry);
		byCode.set(entry.finding.code, list);
	}
	const lines = [];
	for (const [code, list] of byCode) {
		for (const { finding, origin } of list.slice(0, SHOWN_PER_CODE)) {
			const tag = origin === "edit" ? " [in your new_str]" : origin === "preexisting" ? " [already in the card before this patch]" : "";
			lines.push(`${code} ${finding.severity} at ${finding.line}:${finding.column}${tag}: ${finding.message}`, `    | ${finding.excerpt}`);
		}
		const rest = list.slice(SHOWN_PER_CODE);
		if (rest.length > 0) {
			const at = rest.slice(0, 10).map(({ finding }) => `${finding.line}:${finding.column}`).join(", ");
			lines.push(`    (+${rest.length} more ${code} at ${at}${rest.length > 10 ? ", …" : ""})`);
		}
		lines.push(`    fix: ${list[0].finding.fix}`);
	}
	return lines.join("\n");
}
/** Collects findings with positions resolved against the fragment. */
var FindingSink = class {
	src;
	lineStarts = [0];
	items = [];
	/** Index into {@link items} per code and offset. */
	seen = /* @__PURE__ */ new Map();
	constructor(src) {
		this.src = src;
		for (let i = src.indexOf("\n"); i !== -1; i = src.indexOf("\n", i + 1)) this.lineStarts.push(i + 1);
	}
	/**
	* Record one finding; a second one of the same code at the same offset is
	* dropped unless it is more severe.
	* @param cap - `warn` downgrades an error rule for a match read with doubt.
	*/
	add(code, offset, length, detail, cap) {
		const rule = LINT_RULES[code];
		const severity = cap ?? rule.severity;
		const key = `${code}:${offset}`;
		const at = this.seen.get(key);
		if (at !== void 0 && (this.items[at].severity === "error" || severity === "warn")) return;
		const { line, column, excerpt } = this.locate(offset);
		const finding = {
			code,
			severity,
			message: detail === void 0 ? rule.message : `${rule.message}: ${detail}`,
			fix: rule.fix,
			offset,
			length: Math.max(1, length),
			line,
			column,
			excerpt
		};
		if (at === void 0) {
			this.seen.set(key, this.items.length);
			this.items.push(finding);
		} else this.items[at] = finding;
	}
	sorted() {
		return [...this.items].sort((a, b) => a.offset - b.offset);
	}
	locate(offset) {
		let lo = 0;
		let hi = this.lineStarts.length - 1;
		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2);
			if (this.lineStarts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		const start = this.lineStarts[lo];
		const next = this.lineStarts[lo + 1];
		const end = next === void 0 ? this.src.length : next - 1;
		const column = offset - start;
		const from = Math.max(start, offset - 40);
		const to = Math.min(end, Math.max(offset + 60, from + 100));
		let excerpt = this.src.slice(from, to).replaceAll("	", " ").trim();
		if (from > start) excerpt = `…${excerpt}`;
		if (to < end) excerpt = `${excerpt}…`;
		return {
			line: lo + 1,
			column: column + 1,
			excerpt
		};
	}
};
const LITERAL_TAGS = /* @__PURE__ */ new Set([
	"pre",
	"code",
	"kbd",
	"samp",
	"textarea"
]);
const VOID_OR_SELF = /\/\s*$/u;
const JS_TYPES = /* @__PURE__ */ new Set([
	"",
	"text/javascript",
	"application/javascript",
	"module",
	"text/ecmascript",
	"application/ecmascript"
]);
/**
* Split the fragment into tags, text, comments, and raw-text blocks, then
* tokenise the script and style bodies.
* @param src - the fragment.
* @returns the scanned views every rule queries.
*/
function scanDocument(src) {
	const n = src.length;
	const tags = [];
	const blocks = [];
	const text = [];
	const markupBlanks = [];
	let literalDepth = 0;
	let i = 0;
	const pushText = (start, end) => {
		if (end > start) text.push({
			start,
			end,
			literal: literalDepth > 0
		});
	};
	while (i < n) {
		const lt = src.indexOf("<", i);
		if (lt === -1) {
			pushText(i, n);
			break;
		}
		pushText(i, lt);
		if (src.startsWith("<!--", lt)) {
			const close = src.indexOf("-->", lt + 4);
			const end = close === -1 ? n : close + 3;
			markupBlanks.push([lt, end]);
			i = end;
			continue;
		}
		const next = src[lt + 1] ?? "";
		if (next === "/") {
			const closing = /<\/([a-z][\w:-]*)[^>]*>?/iuy;
			closing.lastIndex = lt;
			const m = closing.exec(src);
			if (m) {
				const name = m[1].toLowerCase();
				tags.push({
					name,
					start: lt,
					end: lt + m[0].length,
					closing: true,
					attrs: []
				});
				if (LITERAL_TAGS.has(name) && literalDepth > 0) literalDepth -= 1;
				i = lt + m[0].length;
				continue;
			}
			i = lt + 1;
			continue;
		}
		if (next === "!" || next === "?") {
			const gt = src.indexOf(">", lt);
			const end = gt === -1 ? n : gt + 1;
			const name = /^<([!?][a-z]*)/iu.exec(src.slice(lt, Math.min(end, lt + 12)))?.[1]?.toLowerCase() ?? "!";
			tags.push({
				name,
				start: lt,
				end,
				closing: false,
				attrs: []
			});
			i = end;
			continue;
		}
		if (!/[a-z]/iu.test(next)) {
			i = lt + 1;
			continue;
		}
		const tag = parseOpenTag(src, lt);
		tags.push(tag);
		i = tag.end;
		if (tag.name === "script" || tag.name === "style") {
			const closer = tag.name === "script" ? /<\/script\b[^>]*>?/giu : /<\/style\b[^>]*>?/giu;
			closer.lastIndex = tag.end;
			const m = closer.exec(src);
			const bodyEnd = m ? m.index : n;
			blocks.push({
				kind: tag.name,
				tag,
				start: tag.end,
				end: bodyEnd
			});
			markupBlanks.push([tag.end, bodyEnd]);
			if (m) tags.push({
				name: tag.name,
				start: m.index,
				end: m.index + m[0].length,
				closing: true,
				attrs: []
			});
			i = m ? m.index + m[0].length : n;
			continue;
		}
		if (LITERAL_TAGS.has(tag.name) && !VOID_OR_SELF.test(src.slice(tag.start, tag.end - 1))) literalDepth += 1;
	}
	const jsSegments = [];
	const strings = /* @__PURE__ */ new Map();
	const literals = [];
	const decls = [];
	const imports = [];
	let importMap = false;
	const importMapUrls = [];
	for (const block of blocks) if (block.kind === "script") {
		if (attr(block.tag, "src") !== void 0) continue;
		const type = (attr(block.tag, "type") ?? "").trim().toLowerCase();
		if (type === "importmap") {
			importMap = true;
			for (const s of scanJs(src, block.start, block.end).strings) if (/^(?:https?:)?\/\//iu.test(s.value)) importMapUrls.push([s.start + 1, s.value]);
			continue;
		}
		if (!JS_TYPES.has(type)) continue;
		const scan = scanJs(src, block.start, block.end);
		jsSegments.push([block.start, scan.code]);
		for (const s of scan.strings) strings.set(s.start, s);
		for (const run of scan.literals) literals.push(run);
	} else {
		const scan = scanCss(src, block.start, block.end);
		for (const decl of scan.decls) decls.push(decl);
		for (const entry of scan.imports) imports.push(entry);
	}
	for (const tag of tags) {
		const style = tag.attrs.find((a) => a.name === "style");
		if (style?.value === void 0) continue;
		for (const decl of scanCss(src, style.valueStart, style.valueStart + style.value.length).decls) decls.push(decl);
	}
	return {
		src,
		tags,
		blocks,
		text,
		markup: blank(src, markupBlanks),
		js: overlay(n, jsSegments),
		jsRanges: jsSegments.map(([start, code]) => [start, start + code.length]),
		strings,
		literals,
		decls,
		imports,
		importMap,
		importMapUrls
	};
}
/**
* Parse one opening tag starting at `<`.
* @param src - the fragment.
* @param lt - offset of the `<`.
* @returns the tag with its attributes; an unterminated tag runs to the end.
*/
function parseOpenTag(src, lt) {
	const n = src.length;
	let i = lt + 1;
	while (i < n && /[\w:-]/u.test(src[i])) i++;
	const name = src.slice(lt + 1, i).toLowerCase();
	const attrs = [];
	while (i < n) {
		const c = src[i];
		if (c === ">") return {
			name,
			start: lt,
			end: i + 1,
			closing: false,
			attrs
		};
		if (/\s|\//u.test(c)) {
			i++;
			continue;
		}
		const nameStart = i;
		while (i < n && !/[\s"'>/=]/u.test(src[i])) i++;
		if (i === nameStart) {
			i++;
			continue;
		}
		const attrName = src.slice(nameStart, i).toLowerCase();
		let j = i;
		while (j < n && /\s/u.test(src[j])) j++;
		if (src[j] !== "=") {
			attrs.push({
				name: attrName,
				value: void 0,
				start: nameStart,
				valueStart: i,
				raw: ""
			});
			continue;
		}
		j++;
		while (j < n && /\s/u.test(src[j])) j++;
		const q = src[j];
		if (q === "\"" || q === "'") {
			const close = src.indexOf(q, j + 1);
			const end = close === -1 ? n : close;
			attrs.push({
				name: attrName,
				value: src.slice(j + 1, end),
				start: nameStart,
				valueStart: j + 1,
				raw: src.slice(j, end + 1)
			});
			i = Math.min(n, end + 1);
		} else {
			let end = j;
			while (end < n && !/[\s>]/u.test(src[end])) end++;
			attrs.push({
				name: attrName,
				value: src.slice(j, end),
				start: nameStart,
				valueStart: j,
				raw: src.slice(j, end)
			});
			i = end;
		}
	}
	return {
		name,
		start: lt,
		end: n,
		closing: false,
		attrs
	};
}
/** Value of one attribute, undefined when absent. */
function attr(tag, name) {
	return tag.attrs.find((a) => a.name === name)?.value;
}
/**
* Replace the given ranges with spaces, keeping every offset.
* @param src - the text.
* @param ranges - absolute ranges to blank.
* @param from - start of the window to return.
* @param to - end of the window to return.
* @returns `src.slice(from, to)` with the ranges blanked.
*/
function blank(src, ranges, from = 0, to = src.length) {
	if (ranges.length === 0) return src.slice(from, to);
	const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
	let out = "";
	let at = from;
	for (const [start, rawEnd] of sorted) {
		const end = Math.min(rawEnd, to);
		if (end <= at) continue;
		const cut = Math.max(start, at);
		out += src.slice(at, cut) + " ".repeat(end - cut);
		at = end;
	}
	return out + src.slice(at, to);
}
/**
* `src.indexOf(needle, from)` bounded to end before `to`. Plain indexOf runs on
* to the end of the fragment, so a miss per script or style block is quadratic.
* @returns the offset, or -1 when the needle does not end at or before `to`.
*/
function indexWithin(src, needle, from, to) {
	if (from >= to) return -1;
	const at = src.slice(from, to).indexOf(needle);
	return at === -1 ? -1 : from + at;
}
/** A blank string of length `n` with the given segments written in place. */
function overlay(n, segments) {
	let out = "";
	let at = 0;
	for (const [start, text] of segments) {
		out += " ".repeat(start - at) + text;
		at = start + text.length;
	}
	return out + " ".repeat(Math.max(0, n - at));
}
/** Keywords after which a `/` starts a regex literal rather than a division. */
const REGEX_AFTER_WORD = /* @__PURE__ */ new Set([
	"return",
	"typeof",
	"case",
	"do",
	"else",
	"in",
	"of",
	"new",
	"delete",
	"void",
	"throw",
	"yield",
	"await",
	"instanceof"
]);
const REGEX_AFTER_PUNCT = /* @__PURE__ */ new Set([..."(,=:[!&|?{};+-*%<>~^"]);
/**
* Tokenise a script body far enough to separate code from comments, strings,
* and regex literals.
* @param src - the fragment.
* @param from - body start.
* @param to - body end.
* Linear in the body length on any input: template nesting is an explicit
* stack rather than recursion, comment searches stop at the body end, and a
* failed regex-literal scan is memoised so the next `/` cannot rescan it.
* @returns the body with non-code blanked (quotes kept), its string literals,
* and its literal text runs (template text between interpolations), which
* never overlap one another.
*/
function scanJs(src, from, to) {
	const blanks = [];
	const strings = [];
	const literals = [];
	const literal = (start, end) => {
		blanks.push([start, end]);
		if (end > start) literals.push([start, src.slice(start, end)]);
	};
	/** Template literals suspended inside a `${`, innermost last, with the brace depth to restore. */
	const frames = [];
	let depth = 0;
	let prev = "";
	/**
	* Scan template text from `j` (just past the backtick or a closing `}`).
	* @returns where code resumes: past the closing backtick, or inside a `${`.
	*/
	const template = (open, start, interpolated) => {
		let j = start;
		while (j < to) {
			const c = src[j];
			if (c === "\\") {
				j += 2;
				continue;
			}
			if (c === "`") break;
			if (c === "$" && src[j + 1] === "{") {
				literal(start, j);
				frames.push({
					open,
					depth
				});
				depth = 0;
				prev = "{";
				return j + 2;
			}
			j++;
		}
		j = Math.min(j, to);
		literal(start, j);
		strings.push({
			start: open,
			end: Math.min(j + 1, to),
			value: src.slice(open + 1, j),
			interpolated
		});
		prev = "`";
		return Math.min(j + 1, to);
	};
	let failed;
	const path = [];
	const scanRegex = (start) => {
		let j = start + 1;
		let inClass = false;
		path.length = 0;
		const fail = () => {
			failed ??= new Uint8Array(2 * (to - from) + 2);
			for (const state of path) failed[state] = 1;
			return -1;
		};
		while (j < to) {
			const state = 2 * (j - from) + (inClass ? 1 : 0);
			if (failed?.[state] === 1) return fail();
			path.push(state);
			const c = src[j];
			if (c === "\n") return fail();
			if (c === "\\") {
				j += 2;
				continue;
			}
			if (c === "[") inClass = true;
			else if (c === "]") inClass = false;
			else if (c === "/" && !inClass) {
				j++;
				while (j < to && /[a-z]/u.test(src[j])) j++;
				return j;
			}
			j++;
		}
		return fail();
	};
	let i = from;
	while (i < to) {
		const c = src[i];
		if (c === "/" && src[i + 1] === "/") {
			const nl = indexWithin(src, "\n", i, to);
			const end = nl === -1 ? to : nl;
			blanks.push([i, end]);
			i = end;
			continue;
		}
		if (c === "/" && src[i + 1] === "*") {
			const close = indexWithin(src, "*/", i + 2, to);
			const end = close === -1 ? to : close + 2;
			blanks.push([i, end]);
			i = end;
			continue;
		}
		if (c === "\"" || c === "'") {
			let j = i + 1;
			while (j < to && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
			j = Math.min(j, to);
			strings.push({
				start: i,
				end: Math.min(j + 1, to),
				value: src.slice(i + 1, j),
				interpolated: false
			});
			literal(i + 1, j);
			i = Math.min(j + 1, to);
			prev = "\"";
			continue;
		}
		if (c === "`") {
			i = template(i, i + 1, false);
			continue;
		}
		if (c === "/" && (prev === "" || REGEX_AFTER_PUNCT.has(prev) || REGEX_AFTER_WORD.has(prev))) {
			const end = scanRegex(i);
			if (end !== -1) {
				blanks.push([i + 1, end]);
				i = end;
				prev = "/re";
				continue;
			}
		}
		if (/[A-Za-z_$]/u.test(c)) {
			let j = i + 1;
			while (j < to && /[\w$]/u.test(src[j])) j++;
			prev = src.slice(i, j);
			i = j;
			continue;
		}
		if (c === "{") depth += 1;
		if (c === "}") {
			const frame = frames.at(-1);
			if (frame !== void 0 && depth === 0) {
				frames.pop();
				depth = frame.depth;
				i = template(frame.open, i + 1, true);
				continue;
			}
			depth -= 1;
		}
		if (!/\s/u.test(c)) prev = c;
		i++;
	}
	for (let frame = frames.pop(); frame !== void 0; frame = frames.pop()) strings.push({
		start: frame.open,
		end: to,
		value: src.slice(frame.open + 1, to),
		interpolated: true
	});
	return {
		code: blank(src, blanks, from, to),
		strings,
		literals
	};
}
/**
* Tokenise CSS far enough to find declarations and `@import`s: comments are
* blanked, strings and parentheses are respected, and only segments that end
* in `;` or `}` (never `{`) count as declarations, so selectors are skipped.
* @param src - the fragment.
* @param from - CSS start.
* @param to - CSS end.
* @returns declarations and import targets, with absolute offsets.
*/
function scanCss(src, from, to) {
	const commentBlanks = [];
	for (let i = from; i < to; i++) {
		const c = src[i];
		if (c === "\"" || c === "'") {
			let j = i + 1;
			while (j < to && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
			i = j;
			continue;
		}
		if (c === "/" && src[i + 1] === "*") {
			const close = indexWithin(src, "*/", i + 2, to);
			const end = close === -1 ? to : close + 2;
			commentBlanks.push([i, end]);
			i = end - 1;
		}
	}
	const css = blank(src.slice(from, to), commentBlanks.map(([a, b]) => [a - from, b - from]));
	const decls = [];
	const imports = [];
	let segStart = 0;
	let parens = 0;
	const flush = (end, terminator) => {
		const segment = css.slice(segStart, end);
		if (terminator === "{") return;
		const lead = segment.length - segment.trimStart().length;
		const body = segment.trim();
		if (body.length === 0) return;
		const at = from + segStart + lead;
		if (body.startsWith("@")) {
			const m = /^@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/iu.exec(body);
			if (m) imports.push([at + body.indexOf(m[1]), m[1]]);
			return;
		}
		const colon = body.indexOf(":");
		if (colon <= 0) return;
		const prop = body.slice(0, colon).trim();
		if (!/^-{0,2}[a-z][\w-]*$/iu.test(prop)) return;
		const rawValue = body.slice(colon + 1);
		const valueLead = rawValue.length - rawValue.trimStart().length;
		decls.push({
			prop: prop.toLowerCase(),
			propStart: at,
			value: rawValue.trim(),
			valueStart: at + colon + 1 + valueLead
		});
	};
	for (let i = 0; i < css.length; i++) {
		const c = css[i];
		if (c === "\"" || c === "'") {
			let j = i + 1;
			while (j < css.length && css[j] !== c && css[j] !== "\n") j += css[j] === "\\" ? 2 : 1;
			i = j;
			continue;
		}
		if (c === "(") parens += 1;
		else if (c === ")") parens = Math.max(0, parens - 1);
		else if (parens === 0 && (c === "{" || c === "}" || c === ";")) {
			flush(i, c);
			segStart = i + 1;
		}
	}
	flush(css.length, "");
	return {
		decls,
		imports
	};
}
/** VZ003: `<!doctype>`, `<html>`, `<head>`, `<body>` in markup. */
function checkSkeleton(doc, sink) {
	for (const m of doc.markup.matchAll(/<!doctype\b|<\s*(?:\/\s*)?(?:html|head|body)\b/giu)) sink.add("VZ003", m.index, m[0].length, JSON.stringify(m[0]));
}
/** Escape sequences that only appear in markup when it was JSON-stringified. */
const ESCAPE_SEQ = /\\[nrt]/gu;
/**
* VZ004: string-escaped markup. Three precise signals: an attribute value
* quoted with `\"`; two or more `\n`-style escapes standing between tags in
* ordinary text (one alone could be prose about escapes); a script body that
* opens with a literal `\n`, which is a syntax error in any script.
*/
function checkEscapedMarkup(doc, sink) {
	const { src } = doc;
	for (const tag of doc.tags) for (const a of tag.attrs) if (a.raw.startsWith("\\\"") || a.raw.startsWith("\\'")) sink.add("VZ004", a.valueStart, 2, `attribute quoted as ${JSON.stringify(src.slice(a.start, a.valueStart + 2))}`);
	const hits = [];
	for (const run of doc.text) {
		if (run.literal) continue;
		const body = src.slice(run.start, run.end);
		const head = /^(?:\\[nrt]|\s)*/u.exec(body)[0];
		let tailStart = body.length;
		while (tailStart > head.length) {
			const c = body[tailStart - 1];
			if (/\s/u.test(c)) tailStart -= 1;
			else if ("nrt".includes(c) && body[tailStart - 2] === "\\") tailStart -= 2;
			else break;
		}
		const tail = body.slice(Math.max(tailStart, head.length));
		for (const m of head.matchAll(ESCAPE_SEQ)) hits.push(run.start + m.index);
		for (const m of tail.matchAll(ESCAPE_SEQ)) hits.push(run.start + body.length - tail.length + m.index);
	}
	if (hits.length >= 2) sink.add("VZ004", hits[0], 2, "literal \\n between tags");
	for (const block of doc.blocks) {
		if (block.kind !== "script") continue;
		const body = src.slice(block.start, block.end);
		const lead = body.length - body.replace(/^[ \t]+/u, "").length;
		if (/^\\[nr]/u.test(body.slice(lead))) sink.add("VZ004", block.start + lead, 2, "script body starts with a literal \\n");
	}
}
/** VZ008: `<form action>` / `method=post` / `formaction`. */
function checkForms(doc, sink) {
	for (const tag of doc.tags) {
		if (tag.closing) continue;
		if (tag.name === "form") {
			const action = tag.attrs.find((a) => a.name === "action");
			const method = tag.attrs.find((a) => a.name === "method" && /post/iu.test(a.value ?? ""));
			const hit = action ?? method;
			if (hit) sink.add("VZ008", hit.start, hit.name.length, `<form ${hit.name}=…>`);
		}
		const formAction = tag.attrs.find((a) => a.name === "formaction");
		if (formAction) sink.add("VZ008", formAction.start, formAction.name.length, `formaction on <${tag.name}>`);
	}
}
/**
* Tag attributes that load a resource when the element is parsed. A `Map`, not
* an object literal: tag names come from the input, and `<constructor>` must
* not find `Object.prototype.constructor`.
*/
const RESOURCE_ATTRS = /* @__PURE__ */ new Map([
	["script", ["src"]],
	["link", ["href"]],
	["img", ["src"]],
	["video", ["src", "poster"]],
	["audio", ["src"]],
	["source", ["src"]],
	["track", ["src"]],
	["input", ["src"]],
	["embed", ["src"]],
	["object", ["data"]],
	["image", ["href", "xlink:href"]],
	["feimage", ["href", "xlink:href"]]
]);
/** VZ005/VZ006/VZ105/VZ106 over tags, CSS `url()`/`@import`, and JS imports. */
function checkResources(doc, sink) {
	for (const tag of doc.tags) {
		if (tag.closing) continue;
		const names = RESOURCE_ATTRS.get(tag.name);
		if (names === void 0) continue;
		if (tag.name === "link" && /\b(?:preconnect|dns-prefetch)\b/iu.test(attr(tag, "rel") ?? "")) continue;
		const image = tag.name === "img";
		for (const a of tag.attrs) if (a.value !== void 0 && names.includes(a.name)) reportUrl(sink, a.value, a.valueStart, "markup", false, void 0, image);
	}
	for (const decl of doc.decls) for (const m of decl.value.matchAll(/(?<![\w-])url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))/giu)) {
		const url = m[1] ?? m[2] ?? m[3] ?? "";
		reportUrl(sink, url, decl.valueStart + m.index + m[0].indexOf(url, 4), "markup", false);
	}
	for (const [offset, url] of [...doc.imports, ...doc.importMapUrls]) reportUrl(sink, url, offset, "markup", false);
	const { js } = doc;
	const specifierAt = (pos) => stringAt(doc, pos);
	for (const m of js.matchAll(/(?<![\w$.])(?:import\s*\(|from(?=\s*["'`])|import(?=\s*["'`]))/gu)) {
		const s = specifierAt(m.index + m[0].length);
		if (s && !s.interpolated) reportUrl(sink, s.value, s.start + 1, "module", doc.importMap);
	}
	for (const m of js.matchAll(/\.src\s*=(?!=)/gu)) {
		const s = specifierAt(m.index + m[0].length);
		if (s && !s.interpolated && /^(?:https?:)?\/\//iu.test(s.value)) reportUrl(sink, s.value, s.start + 1, "markup", false, "warn");
	}
}
/**
* Classify one resource URL and report it when it cannot load or is unpinned.
* @param sink - finding sink.
* @param raw - the URL as written.
* @param offset - offset of its first character.
* @param context - `module` for JS import specifiers, where bare names are legal with an import map.
* @param importMap - whether the fragment ships an import map.
* @param cap - `warn` when it is not certain the URL is ever loaded.
* @param image - an `<img src>`, which `data-viz-src` can carry instead.
*/
function reportUrl(sink, raw, offset, context, importMap, cap, image = false) {
	const url = raw.trim();
	if (url.length === 0 || url.startsWith("#") || url.includes("${")) return;
	const at = offset + (raw.length - raw.trimStart().length);
	if (/^(?:data|blob|about|javascript|mailto|tel):/iu.test(url)) return;
	const scheme = /^([a-z][\w+.-]*):/iu.exec(url)?.[1]?.toLowerCase();
	if (scheme === void 0 && !url.startsWith("//")) {
		if (context === "module" && importMap) return;
		sink.add(image ? "VZ107" : "VZ106", at, url.length, JSON.stringify(url));
		return;
	}
	let parsed;
	try {
		parsed = new URL(url.startsWith("//") ? `https:${url}` : url);
	} catch {
		return;
	}
	const host = parsed.host.toLowerCase();
	if (!ALLOWED_HOSTS.includes(host)) {
		const embeddable = image && (scheme === void 0 || scheme === "http" || scheme === "https");
		sink.add(embeddable ? "VZ011" : "VZ005", at, url.length, `${host || url} is not on the allowlist`, cap);
		return;
	}
	if (scheme !== void 0 && scheme !== "https") {
		sink.add("VZ005", at, url.length, `${scheme}: URL; the card loads ${host} over https only`, cap);
		return;
	}
	const version = cdnVersion(host, parsed.pathname);
	if (version.kind === "none") sink.add("VZ006", at, url.length, `${version.what} has no version in ${JSON.stringify(url)}`, cap);
	else if (version.kind === "tag") sink.add("VZ006", at, url.length, `${version.what}@${version.version} is a moving tag`, cap);
	else if (version.kind === "loose") sink.add("VZ105", at, url.length, `${version.what}@${version.version}`);
}
/**
* Read the package version out of a CDN path, for the CDNs that version by path.
* @param host - allowlisted host.
* @param pathname - URL path.
* @returns how pinned it is, plus the package name and version for messages.
*/
function cdnVersion(host, pathname) {
	const segs = pathname.split("/").filter((s) => s.length > 0).map((s) => {
		try {
			return decodeURIComponent(s);
		} catch {
			return s;
		}
	});
	const na = {
		kind: "n/a",
		what: "",
		version: ""
	};
	const pkg = (at) => {
		const first = segs[at];
		if (first === void 0) return na;
		const scoped = first.startsWith("@");
		const nameSeg = scoped ? segs[at + 1] : first;
		if (nameSeg === void 0) return na;
		const idx = nameSeg.indexOf("@");
		const name = idx === -1 ? nameSeg : nameSeg.slice(0, idx);
		return classifyVersion(scoped ? `${first}/${name}` : name, idx === -1 ? void 0 : nameSeg.slice(idx + 1));
	};
	if (host === "cdn.jsdelivr.net") {
		if (segs[0] === "npm") return pkg(1);
		if (segs[0] === "gh" && segs[2] !== void 0) {
			const idx = segs[2].indexOf("@");
			return classifyVersion(`${segs[1]}/${idx === -1 ? segs[2] : segs[2].slice(0, idx)}`, idx === -1 ? void 0 : segs[2].slice(idx + 1));
		}
		return na;
	}
	if (host === "unpkg.com") return pkg(0);
	if (host === "esm.sh") {
		let at = 0;
		if (/^(?:v\d+|stable)$/u.test(segs[0] ?? "")) at = 1;
		const head = segs[at];
		if (head === void 0 || [
			"gh",
			"jsr",
			"pr",
			"run",
			"tsx",
			"x"
		].includes(head)) return na;
		if (head.startsWith("*")) segs[at] = head.slice(1);
		return pkg(at);
	}
	if (host === "cdnjs.cloudflare.com") {
		if (segs[0] !== "ajax" || segs[1] !== "libs" || segs[2] === void 0) return na;
		const version = segs[3];
		if (version === void 0 || segs.length < 5 || !/^\d/u.test(version)) return {
			kind: "none",
			what: segs[2],
			version: ""
		};
		return classifyVersion(segs[2], version);
	}
	return na;
}
/** Exact semver, optionally with a prerelease or build suffix. */
const EXACT_VERSION = /^v?\d+\.\d+\.\d+(?:[-+][\w.+-]*)?$/u;
function classifyVersion(what, version) {
	if (version === void 0 || version.length === 0) return {
		kind: "none",
		what,
		version: ""
	};
	if (EXACT_VERSION.test(version)) return {
		kind: "pinned",
		what,
		version
	};
	if (/^[\^~>=<]*v?\d/u.test(version)) return {
		kind: "loose",
		what,
		version
	};
	return {
		kind: "tag",
		what,
		version
	};
}
/** The string literal starting at the first non-space character from `pos`. */
function stringAt(doc, pos) {
	let i = pos;
	while (i < doc.src.length && /\s/u.test(doc.src[i])) i++;
	return doc.strings.get(i);
}
/** The first non-space character at or after `pos`. */
function nextChar(src, pos) {
	let i = pos;
	while (i < src.length && /\s/u.test(src[i])) i++;
	return src[i] ?? "";
}
/** VZ007, VZ009 (JS side), VZ010, VZ104, and colour-bearing JS style writes. */
function checkScripts(doc, sink) {
	const { js, src } = doc;
	checkGlobalApis(doc, sink);
	for (const m of js.matchAll(/\.\s*style\s*\.\s*colorScheme\s*=(?!=)/gu)) sink.add("VZ009", m.index, m[0].length, "style.colorScheme");
	for (const m of js.matchAll(/\bChart\s*\.\s*defaults\s*\.\s*font\s*\.\s*family\s*=(?!=)/gu)) {
		const s = stringAt(doc, m.index + m[0].length);
		if (s && !s.interpolated && s.value.length <= 32 && s.value.trim().toLowerCase() === "inherit") sink.add("VZ104", m.index, s.end - m.index);
	}
	for (const m of js.matchAll(/\.\s*style\s*\.\s*([a-zA-Z]+)\s*=(?!=)/gu)) {
		const s = stringAt(doc, m.index + m[0].length);
		if (s && !s.interpolated) checkColorValue(sink, kebab(m[1]), s.value, s.start + 1);
	}
	for (const m of js.matchAll(/\.\s*(setProperty|setAttribute|attr|style)\s*\(/gu)) {
		const name = stringAt(doc, m.index + m[0].length);
		if (!name || name.interpolated || nextChar(src, name.end) !== ",") continue;
		const value = stringAt(doc, src.indexOf(",", name.end) + 1);
		if (!value || value.interpolated) continue;
		const prop = name.value.trim().toLowerCase();
		const attribute = m[1] === "setAttribute" || m[1] === "attr";
		if (prop === "color-scheme") sink.add("VZ009", name.start, name.end - name.start, `${JSON.stringify(name.value)} set from script`, attribute ? "warn" : void 0);
		else if (prop === "style") checkInlineCss(sink, src, value.start + 1, value.value.length);
		else checkColorValue(sink, prop, value.value, value.start + 1);
	}
	for (const m of js.matchAll(/\b(\w*(?:Background|Border)Color|backgroundColor|borderColor|fillStyle|strokeStyle|shadowColor)\s*[:=](?!=)/gu)) {
		const s = stringAt(doc, m.index + m[0].length);
		if (s && !s.interpolated) checkColorValue(sink, "color", s.value, s.start + 1, m[1]);
	}
	for (const [at, text] of doc.literals) {
		for (const m of text.matchAll(/(?<![\w-])(fill|stroke|stop-color|flood-color|lighting-color|color|bgcolor)\s*=\s*\\?["']([^"'\\]+)/giu)) checkColorValue(sink, m[1].toLowerCase(), m[2], at + m.index + m[0].length - m[2].length);
		for (const m of text.matchAll(/(?<![\w-])style\s*=\s*\\?["']([^"'\\]+)/giu)) checkInlineCss(sink, src, at + m.index + m[0].length - m[1].length, m[1].length, "warn");
	}
}
/** Receivers through which a global API is still the global one. */
const GLOBAL_RECEIVERS = /* @__PURE__ */ new Set([
	"window",
	"self",
	"globalThis"
]);
/** Network constructors that open a connection when constructed. */
const NETWORK_CONSTRUCTORS = /(?<![\w$])(?:XMLHttpRequest|WebSocket|EventSource)(?![\w$])/gu;
/** Every name whose rebinding changes what a global API reference means. */
const WATCHED_NAMES = /(?<![\w$])(?:fetch|XMLHttpRequest|WebSocket|EventSource|navigator|sendBeacon|document|currentScript|window|self|globalThis)(?![\w$])/gu;
/** Keywords after which a name is read as a value, never declared. */
const VALUE_KEYWORDS = /* @__PURE__ */ new Set([
	"new",
	"typeof",
	"instanceof",
	"await",
	"void",
	"return",
	"delete",
	"throw",
	"in",
	"of",
	"case",
	"yield"
]);
/** Operators after which a name is read as a value, never declared. */
const VALUE_OPERATORS = /* @__PURE__ */ new Set([..."=!+-*/%&|^~<>?:"]);
/** Links of a property chain walked back to find its `new`, at most. */
const MAX_CHAIN_LINKS = 16;
/** `/\s/u` on one character, with the ASCII cases decided without a regex. */
function isSpace(c) {
	if (c === void 0) return false;
	const code = c.charCodeAt(0);
	if (code < 128) return code === 32 || code >= 9 && code <= 13;
	return /\s/u.test(c);
}
/** `/[\w$]/u` on one character. */
function isWordChar(c) {
	if (c === void 0) return false;
	const code = c.charCodeAt(0);
	return code >= 97 && code <= 122 || code >= 65 && code <= 90 || code >= 48 && code <= 57 || code === 95 || code === 36;
}
/** Index of the last non-space character at or before `i`, or -1. */
function skipBack(js, i) {
	let at = i;
	while (at >= 0 && isSpace(js[at])) at--;
	return at;
}
/** Index of the first non-space character at or after `i`. */
function skipForward(js, i) {
	let at = i;
	while (at < js.length && isSpace(js[at])) at++;
	return at;
}
/** The identifier ending just before `index`, through blanks: [name, offset], name '' when there is none. */
function wordBefore(js, index) {
	let i = skipBack(js, index - 1);
	const end = i + 1;
	while (i >= 0 && isWordChar(js[i])) i--;
	return [js.slice(i + 1, end), i + 1];
}
/**
* The receiver of the name at `index`: `x` in `x.name` or `x?.name`.
* @returns undefined when no `.` precedes the name (a spread `...` is not
* one); a receiver named '' when it is not an identifier, e.g. `f().name`.
*/
function receiverOf(js, index) {
	let i = skipBack(js, index - 1);
	if (js[i] !== "." || js[i - 1] === ".") return void 0;
	i -= js[i - 1] === "?" ? 2 : 1;
	const [name, at] = wordBefore(js, i + 1);
	return {
		name,
		index: at
	};
}
/**
* How a global name at `index` is reached.
* - `direct`: bare, nothing before it.
* - `global`: through `window.`/`self.`/`globalThis.` at expression start.
* - `chain`: through one of those receivers further down a property chain.
* - `member`: a property of anything else, the fragment's own object.
* @returns the kind, where the reference starts, and the global receiver used.
*/
function reach(js, index) {
	const r = receiverOf(js, index);
	if (r === void 0) return {
		kind: "direct",
		start: index,
		via: ""
	};
	if (!GLOBAL_RECEIVERS.has(r.name)) return {
		kind: "member",
		start: r.index,
		via: r.name
	};
	return {
		kind: receiverOf(js, r.index) === void 0 ? "global" : "chain",
		start: r.index,
		via: r.name
	};
}
/** Start of the property chain ending in the identifier at `index`, or undefined past {@link MAX_CHAIN_LINKS} or a non-identifier link. */
function chainStart(js, index) {
	let at = index;
	for (let links = 0; links < MAX_CHAIN_LINKS; links++) {
		const r = receiverOf(js, at);
		if (r === void 0) return at;
		if (r.name === "") return void 0;
		at = r.index;
	}
}
/**
* Names the fragment may bind or replace, so a reference to them may not be
* the global. One pass over every watched name: a bare name is read as a
* binding unless its neighbours make it a use — a call or member access, a
* construction, or a value after an operator or keyword. Destructuring,
* parameters, and arguments look alike without a parser, so all of them count.
* @param js - executable script code.
* @returns names bound in the fragment, and global properties it assigns.
*/
function boundNames(js) {
	const bound = /* @__PURE__ */ new Set();
	const assigned = /* @__PURE__ */ new Set();
	for (const m of js.matchAll(WATCHED_NAMES)) {
		const name = m[0];
		const next = skipForward(js, m.index + name.length);
		const c = js[next];
		const assignment = c === "=" && js[next + 1] !== "=" && js[next + 1] !== ">";
		const r = receiverOf(js, m.index);
		if (r !== void 0) {
			if (assignment && (GLOBAL_RECEIVERS.has(r.name) || r.name === "navigator" || r.name === "document")) assigned.add(name);
			continue;
		}
		if (assignment || c === "=" && js[next + 1] === ">") {
			bound.add(name);
			continue;
		}
		if (c === "(") {
			let i = skipBack(js, m.index - 1);
			if (js[i] === "*") i = skipBack(js, i - 1);
			if (wordBefore(js, i + 1)[0] === "function") bound.add(name);
			continue;
		}
		if (c === "." || c === "`" || c === "?" && js[next + 1] === ".") continue;
		const [word] = wordBefore(js, m.index);
		if (word !== "" && VALUE_KEYWORDS.has(word)) continue;
		if (word === "" && VALUE_OPERATORS.has(js[skipBack(js, m.index - 1)] ?? "")) continue;
		bound.add(name);
	}
	return {
		bound,
		assigned
	};
}
/**
* For every `(` in the executable script code, the offset of its matching `)`,
* or -1 when it is never closed. One stack pass per script body.
*/
function parenPairs(doc) {
	const close = new Int32Array(doc.js.length).fill(-1);
	const stack = [];
	for (const [from, to] of doc.jsRanges) {
		stack.length = 0;
		for (let i = from; i < to; i++) {
			const c = doc.js.charCodeAt(i);
			if (c === 40) stack.push(i);
			else if (c === 41) {
				const open = stack.pop();
				if (open !== void 0) close[open] = i;
			}
		}
	}
	return close;
}
/** VZ007 (network APIs) and VZ010 (`document.currentScript`). */
function checkGlobalApis(doc, sink) {
	const { js, src } = doc;
	if (!/fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|currentScript/u.test(js)) return;
	const { bound, assigned } = boundNames(js);
	const blobUrls = /\bcreateObjectURL\b/u.test(js);
	let pairs;
	/**
	* Why a reference reached as `how` may not be the global `name`, or
	* undefined when it certainly is; `parent` is the global object `name` is
	* read from (`navigator`, `document`), when it is not itself global.
	*/
	const doubt = (how, name, parent) => {
		if (how.kind === "member" || how.kind === "chain") return "reached through a property chain, which may be a local object";
		if (how.kind === "global" && bound.has(how.via)) return `the fragment binds its own ${how.via}`;
		const own = parent ?? name;
		if (how.kind === "direct" && bound.has(own)) return `the fragment binds its own ${own}, which this may reach instead`;
		if (assigned.has(name) || parent !== void 0 && assigned.has(parent)) return `the fragment replaces ${parent ?? name} on a global object`;
	};
	const report = (code, start, end, what, why) => {
		const detail = why === void 0 ? what : `${what === void 0 ? "" : `${what}; `}not certain: ${why}`;
		sink.add(code, start, end - start, detail, why === void 0 ? void 0 : "warn");
	};
	for (const m of js.matchAll(/(?<![\w$])fetch(?![\w$])/gu)) {
		const open = skipForward(js, m.index + 5);
		if (js[open] !== "(") continue;
		const how = reach(js, m.index);
		if (how.kind === "member") continue;
		if (how.kind === "direct" && wordBefore(js, m.index)[0] === "function") continue;
		pairs ??= parenPairs(doc);
		const close = pairs[open];
		let why = doubt(how, "fetch");
		if (close === -1) why ??= "the call is never closed, so it reads neither way";
		else {
			const after = skipForward(js, close + 1);
			if (js[after] === "{") {
				if (!/[\n\r\u2028\u2029]/u.test(src.slice(close + 1, after))) continue;
				why ??= "a block follows on the next line, so this may be a method definition";
			}
		}
		const arg = stringAt(doc, open + 1);
		if (arg && /^(?:data|blob):/iu.test(arg.value)) continue;
		if (!arg && blobUrls) continue;
		report("VZ007", how.start, open + 1, "fetch()", why);
	}
	for (const m of js.matchAll(NETWORK_CONSTRUCTORS)) {
		const how = reach(js, m.index);
		if (how.kind === "member") continue;
		const start = how.kind === "chain" ? chainStart(js, how.start) : how.start;
		if (start === void 0) continue;
		const [word, at] = wordBefore(js, start);
		if (word !== "new") continue;
		report("VZ007", at, m.index + m[0].length, m[0], doubt(how, m[0]));
	}
	for (const m of js.matchAll(/(?<![\w$])sendBeacon(?![\w$])/gu)) {
		const r = receiverOf(js, m.index);
		if (r?.name !== "navigator") continue;
		const open = skipForward(js, m.index + 10);
		if (js[open] !== "(") continue;
		const how = reach(js, r.index);
		report("VZ007", how.start, open + 1, "navigator.sendBeacon()", doubt(how, "sendBeacon", "navigator"));
	}
	for (const m of js.matchAll(/(?<![\w$])currentScript(?![\w$])/gu)) {
		const r = receiverOf(js, m.index);
		if (r?.name !== "document") continue;
		const how = reach(js, r.index);
		report("VZ010", how.start, m.index + m[0].length, void 0, doubt(how, "currentScript", "document"));
	}
}
/** camelCase style property to its CSS name. */
function kebab(name) {
	return name.replaceAll(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`);
}
/** Colour and color-scheme checks over a CSS declaration list embedded in a string. */
function checkInlineCss(sink, src, start, length, cap) {
	for (const decl of scanCss(src, start, start + length).decls) if (decl.prop === "color-scheme") sink.add("VZ009", decl.propStart, decl.prop.length, `color-scheme: ${decl.value}`, cap);
	else checkColorValue(sink, decl.prop, decl.value, decl.valueStart);
}
/** VZ009 (CSS side), `<meta name=color-scheme>`, and VZ101 over CSS and SVG attributes. */
function checkStyles(doc, sink) {
	for (const decl of doc.decls) if (decl.prop === "color-scheme") sink.add("VZ009", decl.propStart, decl.prop.length, `color-scheme: ${decl.value}`);
	else checkColorValue(sink, decl.prop, decl.value, decl.valueStart);
	for (const tag of doc.tags) {
		if (tag.closing) continue;
		if (tag.name === "meta" && (attr(tag, "name") ?? "").trim().toLowerCase() === "color-scheme") sink.add("VZ009", tag.start, tag.end - tag.start, "<meta name=\"color-scheme\">");
		if (tag.name === "stop" && Number(attr(tag, "stop-opacity") ?? "1") === 0) continue;
		for (const a of tag.attrs) if (a.value !== void 0 && PRESENTATION_COLOR_ATTRS.has(a.name)) checkColorValue(sink, a.name, a.value, a.valueStart);
	}
}
/** SVG presentation and legacy HTML attributes that take a colour. */
const PRESENTATION_COLOR_ATTRS = /* @__PURE__ */ new Set([
	"fill",
	"stroke",
	"stop-color",
	"flood-color",
	"lighting-color",
	"color",
	"bgcolor"
]);
/** Properties whose named-colour keywords are colours (elsewhere `white` may be `white-space`). */
const COLOR_PROPS = /^(?:-webkit-)?(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|stop-color|flood-color|lighting-color|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|scrollbar-color|text-fill-color|text-stroke(?:-color)?|text-emphasis(?:-color)?|bgcolor)$/u;
/** Properties left alone: shadows and filters are theme-neutral depth cues. */
const SKIP_PROPS = /^(?:box-shadow|text-shadow|filter|backdrop-filter|-webkit-box-shadow|content|font-family|font)$/u;
/** CSS colour functions whose arguments are literal channels. */
const COLOR_FNS = /* @__PURE__ */ new Set([
	"rgb",
	"rgba",
	"hsl",
	"hsla",
	"hwb",
	"lab",
	"lch",
	"oklab",
	"oklch",
	"color"
]);
/** Functions whose arguments are theme-aware or not colours at all. */
const SUPPRESSING_FNS = /* @__PURE__ */ new Set([
	"var",
	"light-dark",
	"url",
	"env",
	"attr"
]);
/** CSS named colours (transparent and currentColor deliberately absent). */
const NAMED_COLORS = new Set("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(" "));
/**
* VZ101 over one CSS value: hex literals, colour functions, and (for colour
* properties) named colours, skipping anything nested in `var()` (fallbacks),
* `light-dark()`, or `url()`, and fully transparent literals.
* @param sink - finding sink.
* @param prop - property or attribute name the value belongs to.
* @param value - the raw value.
* @param valueStart - offset of the value's first character.
* @param label - name shown in the finding, when it differs from the CSS property.
*/
function checkColorValue(sink, prop, value, valueStart, label = prop) {
	if (SKIP_PROPS.test(prop)) return;
	const named = COLOR_PROPS.test(prop) || PRESENTATION_COLOR_ATTRS.has(prop);
	const stack = [];
	let suppressing = 0;
	const suppressed = () => suppressing > 0;
	const open = (fn) => {
		stack.push(fn);
		if (SUPPRESSING_FNS.has(fn)) suppressing += 1;
	};
	for (let i = 0; i < value.length;) {
		const c = value[i];
		if (c === "\"" || c === "'") {
			const close = value.indexOf(c, i + 1);
			i = close === -1 ? value.length : close + 1;
			continue;
		}
		if (c === ")") {
			const fn = stack.pop();
			if (fn !== void 0 && SUPPRESSING_FNS.has(fn)) suppressing -= 1;
			i++;
			continue;
		}
		if (c === "(") {
			open("");
			i++;
			continue;
		}
		if (c === "#") {
			const hex = /^#([0-9a-f]+)(?![\w-])/iu.exec(value.slice(i, i + 10))?.[1];
			if (hex && [
				3,
				4,
				6,
				8
			].includes(hex.length)) {
				if (!suppressed() && !transparentHex(hex)) sink.add("VZ101", valueStart + i, hex.length + 1, `${label}: #${hex}`);
				i += hex.length + 1;
				continue;
			}
			i++;
			continue;
		}
		if (/[a-z_-]/iu.test(c) && (i === 0 || !/[\w-]/u.test(value[i - 1]))) {
			let j = i + 1;
			while (j < value.length && /[\w-]/u.test(value[j])) j++;
			const word = value.slice(i, j).toLowerCase();
			if (value[j] === "(") {
				if (COLOR_FNS.has(word)) {
					const close = matchParen(value, j);
					const args = value.slice(j + 1, close);
					if (!suppressed() && !/\b(?:var|light-dark)\(|\bfrom\b/iu.test(args) && !zeroAlpha(args)) sink.add("VZ101", valueStart + i, close + 1 - i, `${label}: ${value.slice(i, close + 1)}`);
					i = close + 1;
					continue;
				}
				open(word);
				i = j + 1;
				continue;
			}
			if (named && !suppressed() && NAMED_COLORS.has(word)) sink.add("VZ101", valueStart + i, word.length, `${label}: ${word}`);
			i = j;
			continue;
		}
		i++;
	}
}
/** Index of the `)` closing the `(` at `open`, or the end of the string. */
function matchParen(value, open) {
	let depth = 0;
	for (let i = open; i < value.length; i++) if (value[i] === "(") depth += 1;
	else if (value[i] === ")") {
		depth -= 1;
		if (depth === 0) return i;
	}
	return value.length - 1;
}
/** `#rgba` / `#rrggbbaa` with zero alpha. */
function transparentHex(hex) {
	return hex.length === 4 && hex[3] === "0" || hex.length === 8 && hex.slice(6) === "00";
}
/** Colour-function arguments whose alpha channel is zero. */
function zeroAlpha(args) {
	const slash = args.split("/");
	const alpha = slash.length > 1 ? slash[1] : args.split(",")[3];
	if (alpha === void 0) return false;
	return Number.parseFloat(alpha) === 0;
}
/** VZ102 (lookups of absent ids) and VZ103 (no id anywhere for the root). */
function checkIds(doc, sink) {
	const { src, js } = doc;
	const markupIds = /* @__PURE__ */ new Set();
	for (const tag of doc.tags) {
		if (tag.closing) continue;
		const id = attr(tag, "id");
		if (id !== void 0 && id.trim().length > 0) markupIds.add(id.trim());
	}
	const known = new Set(markupIds);
	for (const m of src.matchAll(/(?<![\w-])id\s*=\s*\\?["'`]([^"'`\\\s]+)/gu)) known.add(m[1]);
	for (const m of src.matchAll(/["']id["']\s*,\s*["']([^"']+)["']/gu)) known.add(m[1]);
	const inlineJs = doc.blocks.find((b) => b.kind === "script" && js.slice(b.start, b.end).trim().length > 0);
	if (inlineJs && known.size === 0) sink.add("VZ103", inlineJs.tag.start, inlineJs.tag.end - inlineJs.tag.start);
	if (doc.literals.some(([, text]) => /(?<![\w-])id\s*=\s*\\?["']?[\w:.-]*(?:$|\$\{)/u.test(text)) || [...js.matchAll(/\.\s*id\s*=(?!=)/gu)].some((m) => !doc.strings.has(skipSpace(src, m.index + m[0].length))) || /\.(?:setAttribute|attr)\(\s*["']id["']\s*,(?!\s*["'])/u.test(src)) return;
	const lookups = [];
	for (const m of js.matchAll(/\bgetElementById\s*\(/gu)) {
		const s = stringAt(doc, m.index + m[0].length);
		if (!s || s.interpolated || nextChar(src, s.end) !== ")" || /\\/u.test(s.value)) continue;
		lookups.push({
			id: s.value.trim(),
			s
		});
	}
	for (const m of js.matchAll(/\bquerySelector(?:All)?\s*\(/gu)) {
		const s = stringAt(doc, m.index + m[0].length);
		if (!s || s.interpolated || nextChar(src, s.end) !== ")" || /[\\,]/u.test(s.value)) continue;
		const id = /^\s*#([A-Za-z_][\w-]*)(?=$|[\s.:[>+~])/u.exec(s.value)?.[1];
		if (id !== void 0) lookups.push({
			id,
			s
		});
	}
	const lookupCount = /* @__PURE__ */ new Map();
	for (const { id } of lookups) lookupCount.set(id, (lookupCount.get(id) ?? 0) + 1);
	const occurrences = wordCounter(src);
	for (const { id, s } of lookups) {
		if (id.length === 0 || known.has(id)) continue;
		if (occurrences(id) > (lookupCount.get(id) ?? 0)) continue;
		sink.add("VZ102", s.start, s.end - s.start, `#${id}`);
	}
}
/** Distinct non-identifier ids (`a.b`, `x y`) counted by a full search before the rule gives up on the rest. */
const MAX_FREE_FORM_ID_SEARCHES = 16;
/**
* Count {@link countWord} occurrences without a full-text search per lookup:
* an id made only of `[\w-]` occurs exactly where a maximal `[\w-]+` run
* equals it, so one tokenising pass answers every such id. Other ids fall back
* to a search, memoised and capped; past the cap they count as present, which
* only silences the VZ102 warning.
* @param src - the fragment.
* @returns occurrences of an id as a whole word.
*/
function wordCounter(src) {
	let runs;
	const searched = /* @__PURE__ */ new Map();
	return (word) => {
		if (/^[\w-]+$/u.test(word)) {
			if (runs === void 0) {
				runs = /* @__PURE__ */ new Map();
				for (const m of src.matchAll(/[\w-]+/gu)) runs.set(m[0], (runs.get(m[0]) ?? 0) + 1);
			}
			return runs.get(word) ?? 0;
		}
		let count = searched.get(word);
		if (count === void 0) {
			count = searched.size < MAX_FREE_FORM_ID_SEARCHES ? countWord(src, word) : Number.POSITIVE_INFINITY;
			searched.set(word, count);
		}
		return count;
	};
}
function skipSpace(src, pos) {
	let i = pos;
	while (i < src.length && /\s/u.test(src[i])) i++;
	return i;
}
/** Occurrences of `word` not embedded in a longer identifier-like run. */
function countWord(src, word) {
	let count = 0;
	for (let at = src.indexOf(word); at !== -1; at = src.indexOf(word, at + word.length)) {
		const before = src[at - 1] ?? "";
		const after = src[at + word.length] ?? "";
		if (!/[\w-]/u.test(before) && !/[\w-]/u.test(after)) count += 1;
	}
	return count;
}
//#endregion
//#region src/images.ts
/**
* Images a card cannot load itself. The frame CSP admits images only from
* `data:`, `blob:` and the CDN allowlist, and the frame cannot fetch, so a
* workspace figure or an arbitrary web image never renders from a plain
* `src`. The model writes `<img data-viz-src="…">` instead, and at execute
* time this module resolves each one on the node side:
*
* - a workspace path is read through the host's `ctx.fs` seam, relative to
*   the session workspace root, and must stay inside it lexically and after
*   the backend resolves symlinks (`ctx.fs.contains`);
* - an http(s) URL is fetched by node with a bounded size, an overall
*   timeout and a few redirects, and every hop must connect to a public
*   address: the check runs inside the socket's DNS lookup, so a name that
*   rebinds between check and connect cannot reach loopback, a private
*   network or cloud metadata.
*
* Every image is identified by its magic bytes, not by its name or the
* server's content type: PNG, JPEG, GIF, WebP, or SVG. SVG is kept as is,
* unsanitised, because it only ever renders through `<img>` — script-inert,
* with no external loads — inside the sandboxed frame, and the image route
* serves its bytes as a download, never as a document.
*
* Bytes go to the card store (storage.ts), not into the fragment, the
* model-facing result, or the persisted meta, which carries only references.
* Failures are per image: each comes back with a reason the model can act
* on, and the card shows a placeholder for it.
*
* @module @nagi-ovo/dsh-visualize/images
*/
/** The shipped caps; see the README for why these numbers. */
const DEFAULT_IMAGE_LIMITS = {
	maxImageBytes: 5242880,
	maxCardBytes: 12582912,
	maxImages: 16,
	timeoutMs: 1e4,
	maxRedirects: 3
};
/** An image refusal whose message is the model-facing reason. */
var ImageError = class extends Error {};
/**
* Resolve every `<img data-viz-src>` in a fragment. Never throws for one
* image: each failure is recorded and the rest continue.
* @param fragment - the card's markup, as it will be stored.
* @param options - readers, store, previous images, caps.
* @returns the embedded images and the failures.
*/
async function resolveCardImages(fragment, options) {
	const limits = options.limits ?? DEFAULT_IMAGE_LIMITS;
	const all = imageSources(fragment).map((source) => source.raw);
	const sources = [...new Set(all)];
	const uses = /* @__PURE__ */ new Map();
	for (const src of all) uses.set(src, (uses.get(src) ?? 0) + 1);
	const failures = [];
	if (sources.length === 0) return {
		images: [],
		failures
	};
	const { store } = options;
	const unavailable = options.unavailable ?? (store === void 0 ? "this session has no card store to keep images in" : void 0);
	if (unavailable !== void 0 || store === void 0) return {
		images: [],
		failures: sources.map((src) => ({
			src,
			reason: unavailable
		}))
	};
	const carried = new Map((options.previous ?? []).filter((image) => image.origin === "url").map((image) => [image.src, image]));
	const wanted = sources.slice(0, limits.maxImages);
	for (const src of sources.slice(limits.maxImages)) failures.push({
		src,
		reason: `the card already embeds ${limits.maxImages} images, the most one card takes`
	});
	const fetched = await Promise.all(wanted.map(async (src) => {
		const kept = carried.get(src);
		if (kept !== void 0 && await store.exists(kept.id)) return {
			src,
			kept
		};
		try {
			return {
				src,
				image: await resolveOne(src, options, limits)
			};
		} catch (error) {
			if (options.signal.aborted) throw error;
			return {
				src,
				reason: reasonOf(error)
			};
		}
	}));
	let budget = limits.maxCardBytes;
	const images = [];
	for (const entry of fetched) {
		if (entry.reason !== void 0) {
			failures.push({
				src: entry.src,
				reason: entry.reason
			});
			continue;
		}
		const bytes = entry.kept?.bytes ?? entry.image.data.byteLength;
		const count = uses.get(entry.src) ?? 1;
		if (bytes * count > budget) {
			failures.push({
				src: entry.src,
				reason: count === 1 ? cardBudgetReason(limits) : `${cardBudgetReason(limits)} — it is referenced ${count} times and every reference embeds a full copy, so reference it once or use a smaller image`
			});
			continue;
		}
		budget -= bytes * count;
		if (entry.kept !== void 0) {
			images.push(entry.kept);
			continue;
		}
		const { data, type, origin } = entry.image;
		images.push({
			src: entry.src,
			id: await store.put(data, type),
			type,
			bytes,
			origin
		});
	}
	failures.sort((a, b) => sources.indexOf(a.src) - sources.indexOf(b.src));
	return {
		images,
		failures
	};
}
/** The meta form of an embedded image: the manifest entry without its origin. */
function cardImageOf({ src, id, type, bytes }) {
	return {
		src,
		id,
		type,
		bytes
	};
}
/**
* Fetch or read one source and identify it.
* @param src - the attribute value as written.
* @param options - readers.
* @param limits - the per-image cap and the timeout.
* @returns the bytes, their type, and their origin.
*/
async function resolveOne(src, options, limits) {
	const maxBytes = limits.maxImageBytes;
	const target = classify(decodeEntities(src).trim());
	let data;
	try {
		if (target.kind === "url") {
			const signal = withTimeout(options.signal, limits.timeoutMs);
			data = await options.fetchUrl(target.url, signal, maxBytes);
		} else data = await options.readFile(target.path, options.signal, maxBytes);
	} catch (error) {
		if (error instanceof TooLarge) throw new ImageError(`larger than the ${mib(limits.maxImageBytes)} limit for one image`);
		throw error;
	}
	const type = sniffImageType(data);
	if (type === void 0) throw new ImageError(`not a PNG, JPEG, GIF, WebP or SVG image (the content starts ${JSON.stringify(preview(data))})`);
	return {
		data,
		type,
		origin: target.kind === "url" ? "url" : "file"
	};
}
/**
* Tell a URL from a workspace path, refusing every other scheme with the fix.
* @param value - the decoded attribute value.
* @returns the target.
* @throws ImageError for an unusable value.
*/
function classify(value) {
	const scheme = /^([a-z][\w+.-]*):/iu.exec(value)?.[1]?.toLowerCase();
	if (value.startsWith("//")) return {
		kind: "url",
		url: parseUrl(`https:${value}`)
	};
	if (scheme === void 0 || scheme.length === 1) return {
		kind: "file",
		path: value
	};
	if (scheme === "http" || scheme === "https") return {
		kind: "url",
		url: parseUrl(value)
	};
	if (scheme === "data" || scheme === "blob") throw new ImageError(`a ${scheme}: URL already loads in the card; put it in src, not data-viz-src`);
	throw new ImageError(`${scheme}: URLs are not supported; use an http(s) URL or a path relative to the workspace root`);
}
/** Parse a URL, refusing what cannot be fetched. */
function parseUrl(value) {
	try {
		return new URL(value);
	} catch {
		throw new ImageError("not a valid URL");
	}
}
/** Bytes that exceed the cap a reader was given. */
var TooLarge = class extends Error {};
/** The card-budget refusal. */
function cardBudgetReason(limits) {
	return `the card's images would exceed the ${mib(limits.maxCardBytes)} limit for one card; use smaller images or fewer of them`;
}
/** A byte count in MiB, for messages. */
function mib(bytes) {
	return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}
/** The model-facing reason for one failure. */
function reasonOf(error) {
	if (error instanceof ImageError) return error.message;
	if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timed out";
	return (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 200);
}
/** The first few bytes as text, for a "not an image" message. */
function preview(data) {
	return Array.from(data.subarray(0, 16), (byte) => byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".").join("");
}
/** The caller's signal plus an overall deadline. */
function withTimeout(signal, ms) {
	return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}
/** The named and numeric character references an attribute value can carry. */
const ENTITIES = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: "\"",
	apos: "'"
};
/**
* Decode the character references the HTML parser would in an attribute
* value, so `a.png?x=1&amp;y=2` fetches what the browser would have.
* @param value - raw attribute text.
* @returns the decoded value.
*/
function decodeEntities(value) {
	return value.replaceAll(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/giu, (whole, dec, hex, name) => {
		if (name !== void 0) return ENTITIES[name.toLowerCase()] ?? whole;
		const code = Number.parseInt(dec ?? hex, dec === void 0 ? 16 : 10);
		return code > 0 && code <= 1114111 ? String.fromCodePoint(code) : whole;
	});
}
/** Whether `data` holds `expected` at `offset`. */
function bytesAt(data, offset, expected) {
	const codes = typeof expected === "string" ? Array.from(expected, (c) => c.charCodeAt(0)) : expected;
	return data.byteLength >= offset + codes.length && codes.every((byte, i) => data[offset + i] === byte);
}
/** An SVG document's start: optional BOM, XML declaration, comments and doctype, then the root element. */
const SVG_START = /^﻿?\s*(?:<\?xml[^>]*>\s*)?(?:(?:<!--[\s\S]*?-->|<!doctype[^>[]*(?:\[[\s\S]*?\])?\s*>)\s*)*<svg[\s>/]/iu;
/**
* Identify an image by its content.
* @param data - the whole file or response body.
* @returns the image type, or undefined for anything else.
*/
function sniffImageType(data) {
	if (bytesAt(data, 0, [
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10
	])) return "image/png";
	if (bytesAt(data, 0, [
		255,
		216,
		255
	])) return "image/jpeg";
	if (bytesAt(data, 0, "GIF87a") || bytesAt(data, 0, "GIF89a")) return "image/gif";
	if (bytesAt(data, 0, "RIFF") && bytesAt(data, 8, "WEBP")) return "image/webp";
	const head = new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(0, 4096));
	return SVG_START.test(head) ? "image/svg+xml" : void 0;
}
/**
* Read workspace images through the host's fs seam. Paths resolve against the
* session workspace root; one that leaves it — lexically, or through a
* symlink the backend follows — is refused before any byte is read.
* @param ctx - registrant context carrying `ctx.fs`.
* @param root - absolute session workspace root, undefined when the session has none.
* @returns the reader.
*/
function workspaceImageReader(ctx, root) {
	return async (path, signal, maxBytes) => {
		if (root === void 0) throw new ImageError("this conversation has no workspace to read files from");
		if (path === "~" || path.startsWith("~/")) throw new ImageError("~ is not expanded; give the path relative to the workspace root");
		const base = resolve(root);
		const lexical = resolve(base, path);
		if (!inside(base, lexical)) throw new ImageError("outside the workspace; only files inside the workspace can be embedded");
		const fs = ctx.fs;
		if (typeof fs?.resolve !== "function" || typeof fs.contains !== "function" || typeof fs.stat !== "function" || typeof fs.readBytes !== "function") throw new ImageError("this dsh host cannot read binary workspace files; save the image somewhere with an https URL instead");
		const opts = {
			cwd: base,
			signal
		};
		const [rootTarget, target] = await Promise.all([fs.resolve(base, opts), fs.resolve(lexical, opts)]);
		if (!fs.contains(rootTarget, target)) throw new ImageError("resolves outside the workspace through a symlink; only files inside the workspace can be embedded");
		const info = await fs.stat(target, signal);
		if (info === void 0) throw new ImageError("not found in the workspace; check the path relative to the workspace root");
		if (info.type !== "file") throw new ImageError("not a regular file");
		if (info.size !== void 0 && info.size > maxBytes) throw new TooLarge();
		try {
			return await fs.readBytes(target, signal, maxBytes);
		} catch (error) {
			if (error.code === "FS_TOO_LARGE") throw new TooLarge();
			throw error;
		}
	};
}
/** Addresses no card image may come from: everything not on the public internet. */
const NON_PUBLIC = (() => {
	const list = new BlockList();
	for (const [net, prefix] of [
		["0.0.0.0", 8],
		["10.0.0.0", 8],
		["100.64.0.0", 10],
		["127.0.0.0", 8],
		["169.254.0.0", 16],
		["172.16.0.0", 12],
		["192.0.0.0", 24],
		["192.0.2.0", 24],
		["192.88.99.0", 24],
		["192.168.0.0", 16],
		["198.18.0.0", 15],
		["198.51.100.0", 24],
		["203.0.113.0", 24],
		["224.0.0.0", 4],
		["240.0.0.0", 4]
	]) list.addSubnet(net, prefix, "ipv4");
	for (const [net, prefix] of [
		["::", 96],
		["64:ff9b:1::", 48],
		["100::", 64],
		["2001::", 23],
		["2001:db8::", 32],
		["2002::", 16],
		["fc00::", 7],
		["fe80::", 10],
		["fec0::", 10],
		["ff00::", 8]
	]) list.addSubnet(net, prefix, "ipv6");
	return list;
})();
/**
* Whether an address is on the public internet. An IPv6 address that embeds
* an IPv4 one — mapped (`::ffff:a.b.c.d`) or NAT64 (`64:ff9b::/96`) — is
* judged by the address it embeds.
* @param address - a resolved IP address.
* @param family - 4 or 6.
* @returns false for loopback, private, link-local, shared, reserved, documentation and multicast space.
*/
function isPublicAddress(address, family) {
	if (family === 4) return !NON_PUBLIC.check(address, "ipv4");
	const groups = ipv6Groups(address);
	if (groups === void 0) return false;
	if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 65535 || groups[0] === 100 && groups[1] === 65435 && groups.slice(2, 6).every((g) => g === 0)) return isPublicAddress(`${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`, 4);
	return !NON_PUBLIC.check(address, "ipv6");
}
/**
* Expand an IPv6 address into its eight 16-bit groups.
* @param address - IPv6 text, `::` and a dotted IPv4 tail allowed, zone id dropped.
* @returns the groups, or undefined when it does not parse.
*/
function ipv6Groups(address) {
	let text = address.toLowerCase().replace(/%.*$/u, "");
	const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/u.exec(text);
	if (dotted !== null) {
		const [a, b, c, d] = dotted.slice(1).map(Number);
		text = `${text.slice(0, dotted.index)}${(a << 8 | b).toString(16)}:${(c << 8 | d).toString(16)}`;
	}
	const halves = text.split("::");
	if (halves.length > 2) return void 0;
	const parse = (part) => part === "" ? [] : part.split(":").map((g) => Number.parseInt(g, 16));
	const head = parse(halves[0]);
	const tail = halves.length === 2 ? parse(halves[1]) : [];
	const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
	const groups = [
		...head,
		...Array.from({ length: fill }, () => 0),
		...tail
	];
	return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 65535) ? groups : void 0;
}
/** The default policy: public addresses only. */
const publicOnly = isPublicAddress;
/**
* Fetch image URLs with node's own http stack, guarded against SSRF: only
* http(s), no credentials in the URL, every hop's address checked by the
* policy — an IP literal before the request, a name inside the socket's DNS
* lookup — at most `maxRedirects` redirects, no content encoding, and the body
* cut off past the cap. A fresh agent per request means no pooled socket
* skips the lookup.
* @param options - redirect budget and address policy.
* @returns the fetcher.
*/
function urlFetcher(options) {
	const policy = options.policy ?? publicOnly;
	return async (url, signal, maxBytes) => {
		let current = url;
		for (let hop = 0;; hop += 1) {
			checkUrl(current, policy);
			const response = await get(current, policy, signal);
			const status = response.statusCode ?? 0;
			if ([
				301,
				302,
				303,
				307,
				308
			].includes(status)) {
				response.destroy();
				const location = response.headers.location;
				if (location === void 0) throw new ImageError(`HTTP ${status} without a Location header`);
				if (hop >= options.maxRedirects) throw new ImageError(`more than ${options.maxRedirects} redirects`);
				current = parseUrl(new URL(location, current).href);
				continue;
			}
			if (status !== 200) {
				response.destroy();
				throw new ImageError(`the server answered HTTP ${status}`);
			}
			const encoding = response.headers["content-encoding"];
			if (encoding !== void 0 && encoding !== "identity") {
				response.destroy();
				throw new ImageError(`the server sent a ${encoding}-encoded body, which is not decoded here`);
			}
			const length = Number(response.headers["content-length"]);
			if (Number.isFinite(length) && length > maxBytes) {
				response.destroy();
				throw new TooLarge();
			}
			return await readBody(response, maxBytes);
		}
	};
}
/**
* Refuse a URL before any connection: scheme, credentials, and an IP-literal host.
* @param url - the URL of this hop.
* @param policy - address policy.
*/
function checkUrl(url, policy) {
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImageError(`redirected to a ${url.protocol} URL, which is not fetched`);
	if (url.username !== "" || url.password !== "") throw new ImageError("URLs with credentials are not fetched");
	const host = url.hostname.replace(/^\[|\]$/gu, "");
	const family = isIP(host);
	if (family !== 0 && !policy(host, family)) throw new ImageError(blockedReason(url.hostname, host));
}
/** The SSRF refusal. */
function blockedReason(hostname, address) {
	return `${hostname} is ${hostname === address ? "" : `${address}, `}a loopback, private or link-local address; card images are fetched from the public internet only — save a local image into the workspace and give its path`;
}
/**
* The guarded DNS lookup: every address a name resolves to must pass the
* policy, or the connection fails before it is made.
* @param policy - address policy.
* @returns a `lookup` for `http.request`.
*/
function guardedLookup(policy) {
	return (hostname, options, callback) => {
		lookup(hostname, {
			...options,
			all: true
		}, (error, addresses) => {
			if (error !== null) return callback(error);
			const blocked = addresses.find((entry) => !policy(entry.address, entry.family));
			if (blocked !== void 0 || addresses.length === 0) return callback(new ImageError(blocked === void 0 ? `${hostname} has no address` : blockedReason(hostname, blocked.address)));
			if (options.all === true) return callback(null, addresses);
			callback(null, addresses[0].address, addresses[0].family);
		});
	};
}
/**
* One GET, resolved when the response head arrives.
* @param url - the URL.
* @param policy - address policy for the lookup.
* @param signal - aborts the request.
* @returns the response.
*/
async function get(url, policy, signal) {
	const request$2 = url.protocol === "https:" ? request$1 : request;
	return await new Promise((resolve, reject) => {
		const req = request$2(url, {
			method: "GET",
			agent: false,
			lookup: guardedLookup(policy),
			signal,
			headers: {
				"accept": "image/png,image/jpeg,image/gif,image/webp,image/svg+xml;q=0.9,*/*;q=0.1",
				"accept-encoding": "identity",
				"user-agent": "dsh-visualize"
			}
		}, resolve);
		req.on("error", (error) => reject(error instanceof ImageError ? error : error.cause instanceof ImageError ? error.cause : error));
		req.end();
	});
}
/**
* Read a response body, cutting it off past the cap.
* @param response - the response stream.
* @param maxBytes - inclusive cap.
* @returns the body.
* @throws TooLarge past the cap.
*/
async function readBody(response, maxBytes) {
	const chunks = [];
	let total = 0;
	for await (const chunk of response) {
		total += chunk.byteLength;
		if (total > maxBytes) {
			response.destroy();
			throw new TooLarge();
		}
		chunks.push(chunk);
	}
	const body = Buffer.concat(chunks);
	return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}
/**
* The model-facing report on a card's images, or undefined when it has none.
* @param images - embedded images.
* @param failures - images that were not.
* @returns one short paragraph.
*/
function imageReport(images, failures) {
	if (images.length === 0 && failures.length === 0) return void 0;
	const kb = Math.ceil(images.reduce((sum, image) => sum + image.bytes, 0) / 1024);
	const embedded = images.length === 0 ? "" : `Embedded ${images.length} image${images.length === 1 ? "" : "s"} (${kb} KB, stored beside the card).`;
	if (failures.length === 0) return embedded;
	const head = `${failures.length} image${failures.length === 1 ? "" : "s"} could not be embedded and show${failures.length === 1 ? "s" : ""} a placeholder; fix each data-viz-src and patch the card:`;
	const lines = failures.map((failure) => `- ${JSON.stringify(failure.src)}: ${failure.reason}`);
	return [embedded, head].filter((part) => part.length > 0).join(" ") + "\n" + lines.join("\n");
}
//#endregion
//#region src/style-guide.ts
/**
* The soft half of a card style: the prose the model reads before it writes
* a card. The skill provider appends one "Active card style" section to the
* skill body, built from
*
* 1. the built-in style's guide, `assets/styles/<id>.md`;
* 2. the user's global style file, `<DSH_HOME>/visualize/style.md`;
* 3. the workspace style file, `<workspace>/.dsh/visualize-style.md`, when the
*    lookup names a workspace.
*
* Later text wins where they disagree, and what the user says in the
* conversation wins over all of them; the skill body states that order. A
* missing or unreadable file is skipped, and each user file is capped at
* {@link CUSTOM_STYLE_MAX_BYTES} so a stray large file cannot crowd the
* skill out of context.
*
* @module @nagi-ovo/dsh-visualize/style-guide
*/
/** Byte cap for one user style file; the rest is dropped with a note. */
const CUSTOM_STYLE_MAX_BYTES = 4096;
/** Global style file name inside the plugin's home directory. */
const GLOBAL_STYLE_FILE = "style.md";
/** Workspace style file, relative to the workspace root. */
const WORKSPACE_STYLE_FILE = join(".dsh", "visualize-style.md");
const STYLE_DIR_URL = new URL("../assets/styles/", import.meta.url);
/**
* Absolute path of a built-in style's guide.
* @param style - the style id.
* @returns the guide's path inside this package.
*/
function styleGuidePath(style) {
	return fileURLToPath(new URL(`${style}.md`, STYLE_DIR_URL));
}
/**
* Locate the user's style files for a registrant context and workspace.
* @param ctx - registrant context carrying the host home path.
* @param workspace - the session workspace root, if any.
* @returns the lookup locations.
*/
function styleFileLocations(ctx, workspace) {
	return {
		home: storeRoot(ctx),
		workspace
	};
}
/**
* Read the user's style files, global first, then workspace.
* @param locations - where to look.
* @returns the files found, in precedence order (later wins).
*/
async function readCustomStyles(locations) {
	const candidates = [];
	if (locations.home !== void 0) candidates.push({
		scope: "global",
		path: join(locations.home, GLOBAL_STYLE_FILE)
	});
	if (locations.workspace !== void 0 && locations.workspace.length > 0) candidates.push({
		scope: "workspace",
		path: join(locations.workspace, WORKSPACE_STYLE_FILE)
	});
	const found = [];
	for (const candidate of candidates) {
		const bytes = await readFile(candidate.path).catch(() => void 0);
		if (bytes === void 0) continue;
		const truncated = bytes.byteLength > CUSTOM_STYLE_MAX_BYTES;
		const text = (truncated ? bytes.subarray(0, CUSTOM_STYLE_MAX_BYTES) : bytes).toString("utf8").replace(/�+$/u, "").trim();
		if (text.length === 0) continue;
		found.push({
			...candidate,
			text,
			truncated
		});
	}
	return found;
}
/**
* Build the "Active card style" section appended to the skill body.
* @param style - the configured style id.
* @param locations - where to look for the user's style files.
* @returns the Markdown section, starting with a blank line.
*/
async function activeStyleSection(style, locations) {
	const guide = (await readFile(styleGuidePath(style), "utf8")).trim();
	const custom = await readCustomStyles(locations);
	const parts = [
		"",
		"## Active card style",
		"",
		`The user's card style is \`${style}\` (${STYLES[style].label}). The frame already applies its colours, fonts, radius and chart defaults; the guide below says how a card in this style should read. It follows the precedence and limits in "Card style" above.`,
		"",
		`### Built-in style: ${style}`,
		"",
		guide
	];
	for (const file of custom) {
		parts.push("", file.scope === "global" ? `### User style (global, ${file.path})` : `### User style (this workspace, ${file.path})`, "", file.text);
		if (file.truncated) parts.push("", `(The file is longer than ${CUSTOM_STYLE_MAX_BYTES} bytes; only its start is shown.)`);
	}
	return `${parts.join("\n")}\n`;
}
/**
* The sentence the tool description gains, so an agent that reads the
* contract from disk (no skill tool) also finds the style guide.
* @param style - the configured style id.
* @returns a description suffix, starting with a space.
*/
function styleToolNote(style) {
	return ` Cards use the user's "${style}" card style: its guide is appended to the visualize skill, or read it from ${styleGuidePath(style)} together with any user style file (${join("<DSH_HOME>", "visualize", GLOBAL_STYLE_FILE)}, then ${join("<workspace>", WORKSPACE_STYLE_FILE)}).`;
}
//#endregion
//#region src/skill.ts
/**
* Bundled `visualize` skill provider: the fragment-authoring contract the
* model loads before its first `visualize` call. Mirrors the official
* `dsh-skill-badge` provider shape — one bundled candidate whose body ships
* in this package's `assets/`. The body ends with the active card style's
* guide and the user's style files (style-guide.ts), read on every load so an
* edited style file applies from the next skill load on.
*
* @module @nagi-ovo/dsh-visualize/skill
*/
const PROVIDER_NAME = "dsh-visualize";
const SKILL_BODY_URL = new URL("../assets/visualize-skill.md", import.meta.url);
/** Absolute path of the skill body, for agents that cannot load skills. */
const SKILL_BODY_PATH = fileURLToPath(SKILL_BODY_URL);
/** Absolute directory the skill body's relative references resolve against. */
const SKILL_RESOURCE_DIR = fileURLToPath(new URL("../assets/", import.meta.url));
const RESOURCE_BASE = {
	kind: "directory",
	path: SKILL_RESOURCE_DIR
};
const CANDIDATE = {
	name: "visualize",
	description: "Authoring contract for the visualize tool, which renders interactive cards in the conversation, or full pages in their own tab: simulations, algorithm walkthroughs, charts, comparisons, dashboards, and product-screen mockups. Load before the first visualize call in a session — it defines the fragment structure, theming variables, size ceiling, and allowed resources the tool validates against.",
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
/**
* Build the bundled provider registered on `ctx.skills`.
* @param style - the configured card style: an id, or a reader asked on
*   every load so a changed setting reaches the next load.
* @param locate - where the user's style files are for a lookup's workspace
*   (`cwd`; absent when the lookup has no session, which reads the global file alone).
* @returns the provider.
*/
function visualizeSkillProvider(style = DEFAULT_STYLE, locate = () => ({})) {
	return {
		name: PROVIDER_NAME,
		list: () => Promise.resolve([CANDIDATE]),
		async get(_candidate, options) {
			const body = await readFile(SKILL_BODY_URL, "utf8");
			return {
				name: CANDIDATE.name,
				description: CANDIDATE.description,
				invocation: CANDIDATE.invocation,
				provider: CANDIDATE.provider,
				source: CANDIDATE.source,
				resourceBase: RESOURCE_BASE,
				content: body + await activeStyleSection(typeof style === "function" ? style() : style, locate(options?.cwd))
			};
		}
	};
}
/** Sessions whose retry streaks are remembered; the oldest is dropped beyond this. */
const MAX_SESSIONS = 256;
/** Lints fragments and remembers per-session rejection streaks. */
var FragmentLintGate = class {
	streaks = /* @__PURE__ */ new Map();
	/**
	* Lint one fragment and decide.
	* @param input - fragment, size ceiling, session, and the pre-patch card for updates.
	* @returns the size and warning text when nothing blocks the card.
	* @throws Error with the coded findings when any error remains.
	*/
	check(input) {
		const { sizeBytes, findings } = lintFragment(input.fragment, input.maxBytes);
		const placed = input.base === void 0 ? findings.map((finding) => ({
			finding,
			origin: "new"
		})) : placeAgainstBase(findings, input.fragment, input.base, input.maxBytes);
		const blocking = (p) => p.finding.severity === "error" && p.origin !== "preexisting";
		const errors = placed.filter(blocking);
		const warnings = placed.filter((p) => !blocking(p));
		const patched = input.base !== void 0;
		if (errors.length === 0) {
			if (input.sessionId !== void 0) this.streaks.delete(input.sessionId);
			return {
				sizeBytes,
				warnings: warnings.length === 0 ? "" : `Lint warnings (the card rendered; patch these if they matter, positions are line:column in the ${patched ? "patched card" : "fragment"}):\n${formatFindings(warnings)}`
			};
		}
		let message = formatRejection(errors, warnings, patched);
		if (input.sessionId !== void 0) {
			const stuck = this.recordRejection(input.sessionId, new Set(errors.map((p) => p.finding.code)));
			if (stuck.length > 0) {
				const named = stuck.map((code) => `${code} (${LINT_RULES[code].message})`).join("; ");
				message += `\n\nSTOP: ${stuck.join(", ")} has now rejected 3 visualize calls in a row. Do not call visualize again for this card. Tell the user in your reply what is blocking it — ${named} — and ask how they want to proceed.`;
			}
		}
		throw new Error(message);
	}
	/**
	* Advance the session's streaks: codes in this rejection grow by one,
	* codes absent from it reset.
	* @returns codes whose streak has reached {@link STOP_AFTER}.
	*/
	recordRejection(sessionId, codes) {
		const previous = this.streaks.get(sessionId);
		const next = /* @__PURE__ */ new Map();
		for (const code of codes) next.set(code, (previous?.get(code) ?? 0) + 1);
		this.streaks.delete(sessionId);
		this.streaks.set(sessionId, next);
		if (this.streaks.size > MAX_SESSIONS) {
			const oldest = this.streaks.keys().next().value;
			if (oldest !== void 0) this.streaks.delete(oldest);
		}
		return [...next].filter(([, count]) => count >= 3).map(([code]) => code);
	}
};
/**
* Tag each finding of a patched card as inside the edit, pre-existing, or
* newly caused elsewhere by the edit.
* @param findings - findings on the patched card.
* @param patched - the patched card.
* @param base - the card before the patch.
* @param maxBytes - size ceiling, for linting the base the same way.
* @returns the findings with their origin.
*/
function placeAgainstBase(findings, patched, base, maxBytes) {
	let prefix = 0;
	const limit = Math.min(base.length, patched.length);
	while (prefix < limit && base[prefix] === patched[prefix]) prefix++;
	let suffix = 0;
	while (suffix < limit - prefix && base[base.length - 1 - suffix] === patched[patched.length - 1 - suffix]) suffix++;
	const editStart = prefix;
	const editEnd = Math.max(prefix, patched.length - suffix);
	const before = /* @__PURE__ */ new Set();
	for (const f of lintFragment(base, maxBytes).findings) before.add(findingKey(f, f.offset, base));
	const shift = patched.length - base.length;
	return findings.map((finding) => {
		const start = finding.offset;
		const end = finding.offset + finding.length;
		if (editEnd > editStart ? start < editEnd && end > editStart : start < editStart && end > editStart) return {
			finding,
			origin: "edit"
		};
		const baseOffset = end <= editStart ? start : start - shift;
		if (finding.code !== "VZ002" && before.has(findingKey(finding, baseOffset, patched, start))) return {
			finding,
			origin: "preexisting"
		};
		return {
			finding,
			origin: "new"
		};
	});
}
/**
* Identity of a finding across a patch: rule, severity, place, and the text
* it flagged. A severity in the key keeps a warning the patch turned into an
* error at the same place from passing as pre-existing.
* @param at - the finding's offset in the base card's coordinates.
* @param from - where its text is read in `src` (defaults to `at`).
*/
function findingKey(finding, at, src, from = at) {
	return `${finding.code}\u0000${finding.severity}\u0000${at}\u0000${src.slice(from, from + finding.length)}`;
}
//#endregion
//#region src/tool.ts
const DESCRIPTION = `Show the user an interactive HTML visualization, rendered as a live card in the conversation. \`create\` (the default) takes the whole markup in \`fragment\`: literal inline HTML only (no <!doctype>, <html>, <head>, or <body> — the card supplies the document, stylesheet, and theme). To correct a card you already rendered, call \`update\` with its \`path\` and one exact \`old_str\`/\`new_str\` replacement instead of re-sending the whole fragment. \`mode: "page"\` builds a full standalone page instead of a chat card: the conversation shows a launcher with a live thumbnail, and the user opens the page in its own browser tab. The card appears while you generate; a copy of the finished fragment is saved outside the project, per session. Load the \`visualize\` skill for the authoring contract before your first call. If this session has no skill tool, read the same contract from ${SKILL_BODY_PATH} (its relative paths resolve against ${SKILL_RESOURCE_DIR}) with a file or shell tool; do not search for it anywhere else.`;
/** Why images cannot reach the card on a host without the image route. */
const NO_IMAGE_ROUTE = "this dsh host cannot deliver images to cards (the image route needs dsh 0.1.7 or later)";
/**
* Build the `visualize` tool definition over the composed filesystem seam.
* @param ctx - registrant context carrying `ctx.fs` and the host home path for the card copy.
* @param maxFragmentBytes - deployment size ceiling for one fragment.
* @param style - configured card style, recorded in each new card's meta: an
*   id, or a reader the tool asks on every call so a changed setting applies
*   to the next card. The description names the style read when the
*   definition is built; the plugin rebuilds it when the setting changes.
* @param images - image embedding; by default no route, so every image is reported undeliverable.
* @returns the tool definition to register on `ctx.tools`.
*/
function visualizeTool(ctx, maxFragmentBytes, style = DEFAULT_STYLE, images = { delivery: () => false }) {
	const lint = new FragmentLintGate();
	const currentStyle = typeof style === "function" ? style : () => style;
	const imageLimits = images.limits ?? DEFAULT_IMAGE_LIMITS;
	const fetchUrl = images.fetchUrl ?? urlFetcher({ maxRedirects: imageLimits.maxRedirects });
	return defineTool({
		name: VISUALIZE_TOOL_NAME,
		description: DESCRIPTION + styleToolNote(currentStyle()),
		parameters: {
			action: {
				type: "string",
				enum: ["create", "update"],
				description: "`create` (default) renders a new card from `fragment`. `update` patches the card at `path`, replacing `old_str` with `new_str` — use it for a correction touching fewer than 20 lines in fewer than 5 places, and at most 4 times per reply; re-create the card for anything larger."
			},
			fragment: {
				type: "string",
				description: "create only, required: the inline HTML fragment to render (markup, style, and script — no document skeleton). For a workspace image or a web image off the CDN allowlist, write <img data-viz-src=\"figs/plot.png\"> or <img data-viz-src=\"https://…\"> and the tool embeds it."
			},
			title: {
				type: "string",
				description: "Concise card title. Defaults to \"Visualization\" on create; required on update."
			},
			mode: {
				type: "string",
				enum: [...VISUALIZE_MODES],
				description: "Surface: `inline` (default) fits the chat column; `wide` for compact panels that must sit side by side; `page` for a full standalone page (≥1280px wide, any height) the user opens in its own tab from a launcher card. On update, restate the mode the card was created with."
			},
			summary: {
				type: "string",
				description: "page mode: one short line under the launcher title saying what the page lets the user do. Restate it on update."
			},
			path: {
				type: "string",
				description: "update only, required: path of the card to patch, exactly as its own call reported it."
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
						enum: [...VISUALIZE_MODES]
					},
					summary: { type: "string" },
					sizeBytes: {
						type: "integer",
						required: true
					},
					fragment: {
						type: "string",
						required: true
					},
					warnings: { type: "string" },
					style: { type: "string" },
					images: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								src: {
									type: "string",
									required: true
								},
								id: {
									type: "string",
									required: true
								},
								type: {
									type: "string",
									required: true
								},
								bytes: {
									type: "integer",
									required: true
								}
							}
						}
					},
					imageReport: { type: "string" }
				}
			},
			render: (_args, value) => [
				{
					type: "text",
					text: resultText(value)
				},
				...value.warnings ? [{
					type: "text",
					text: value.warnings
				}] : [],
				...value.imageReport ? [{
					type: "text",
					text: value.imageReport
				}] : []
			],
			presentationMeta: (_args, value) => ({
				kind: "visualize",
				fragment: value.fragment,
				title: value.title,
				mode: value.mode,
				path: value.path,
				...value.summary === void 0 ? {} : { summary: value.summary },
				style: value.style ?? "whale",
				...value.images?.length ? { images: value.images } : {}
			})
		},
		isConcurrencySafe: (args) => (args.action ?? "create") === "create",
		async execute(args, exec) {
			const action = args.action ?? "create";
			const mode = modeOf(args.mode, args.path !== void 0 && action === "update" && args.path.endsWith(PAGE_SUFFIX));
			const store = cardStore(ctx, exec);
			let source;
			let fragment;
			let base;
			if (action === "update") {
				source = await store.open(required(args.path, "path", action));
				base = await source.read();
				fragment = applyFragmentPatch(base, required(args.old_str, "old_str", action), present(args.new_str, "new_str", action));
			} else fragment = required(args.fragment, "fragment", action);
			const { sizeBytes, warnings } = lint.check({
				fragment,
				maxBytes: maxFragmentBytes,
				sessionId: exec.agent?.session.header?.id,
				base
			});
			const title = action === "update" ? required(args.title, "title", action).trim() : args.title?.trim() || "Visualization";
			const summary = args.summary?.replaceAll(/\s+/gu, " ").trim().slice(0, MAX_SUMMARY_CHARS);
			const configured = currentStyle();
			const cardStyle = action === "update" ? styleOfCardPath(args.path) ?? configured : configured;
			const suffix = mode === "page" ? PAGE_SUFFIX : ".html";
			const target = source ?? await store.create(`${slugOf(title)}-${contentHash(fragment)}.${cardStyle}${suffix}`);
			const previous = action === "update" ? await target.images?.read() ?? [] : [];
			const resolved = await resolveCardImages(fragment, {
				readFile: workspaceImageReader(ctx, store.workspaceRoot),
				fetchUrl,
				store: store.images,
				...images.delivery() ? {} : { unavailable: NO_IMAGE_ROUTE },
				previous,
				limits: imageLimits,
				signal: exec.signal
			});
			exec.signal?.throwIfAborted();
			await target.write(fragment);
			await target.images?.write(resolved.images);
			const embedded = resolved.images.map(cardImageOf);
			const report = imageReport(embedded, resolved.failures);
			return {
				action,
				path: target.displayPath,
				title,
				mode,
				sizeBytes,
				fragment,
				...summary ? { summary } : {},
				style: cardStyle,
				...warnings ? { warnings } : {},
				...embedded.length > 0 ? { images: embedded } : {},
				...report === void 0 ? {} : { imageReport: report }
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
/** File-name suffix of a page card, from which an update recovers the mode. */
const PAGE_SUFFIX = ".page.html";
/**
* A card's file name records its style — `<slug>-<hash>.<style>[.page].html`
* — so an `update` re-renders the card in the style it was created with, not
* whatever the setting says now. The name, not the file's content, carries
* it: the model reads and patches the stored copy (and may `cat` it), so a
* marker inside the markup would leak into its `old_str`.
*/
const CARD_STYLE_PATTERN = new RegExp(`-[0-9a-f]{8}\\.(${STYLE_IDS.join("|")})(?:\\.page)?\\.html$`, "u");
/**
* The style recorded in a card's file name.
* @param path - the `update` path as the model passed it.
* @returns the recorded style, or undefined for a name from before styles.
*/
function styleOfCardPath(path) {
	return CARD_STYLE_PATTERN.exec(path)?.[1];
}
/** Longest launcher summary kept; the launcher shows one line. */
const MAX_SUMMARY_CHARS = 200;
/**
* Resolve the card's surface. The tested hosts check the schema enum before
* execute; this keeps an unknown value failing loud on any that do not, not
* rendering a card nobody asked for.
* @param value - the raw `mode` argument.
* @param pageFile - whether an update targets a page card's file.
* @returns the mode to render.
* @throws Error naming the accepted modes.
*/
function modeOf(value, pageFile) {
	if (value === void 0) return pageFile ? "page" : "inline";
	if (!isVisualizeMode(value)) throw new Error(`invalid visualization: \`mode\` must be one of ${VISUALIZE_MODES.map((m) => `"${m}"`).join(", ")}`);
	return value;
}
/**
* The model-facing confirmation. A page is not visible in the conversation
* until the user opens it, and a tab already open keeps the version it was
* opened with, so the text says both rather than claiming the user sees it.
* @param value - the tool's canonical value.
* @returns the one-line confirmation.
*/
function resultText(value) {
	if (value.mode === "page") return value.action === "update" ? `Patched page "${value.title}" in place (${value.sizeBytes} bytes; updated card at ${value.path}). The launcher in the conversation now opens the corrected page; a tab the user already opened keeps the old version until they open it again. Patch that path for any further correction.` : `Rendered "${value.title}" as a page (${value.sizeBytes} bytes; saved copy at ${value.path}). The conversation shows a launcher card with a live thumbnail; the user opens the full page in its own tab from its button.`;
	return value.action === "update" ? `Patched "${value.title}" in place (${value.sizeBytes} bytes; updated card at ${value.path}). The user sees the corrected visualization in the conversation; patch that path for any further correction.` : `Rendered "${value.title}" inline (${value.sizeBytes} bytes; saved copy at ${value.path}). The user sees the interactive visualization in the conversation.`;
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
* Stable 8-hex-digit content hash (FNV-1a) naming the saved copy.
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
//#region src/style-setting.ts
/**
* The `style` setting as the host delivers it. The field is declared
* volatile, which is what lets the host's settings forms (dsh-settings) edit
* it from the web UI: a form write lands in the profile's `cordis.patch.yml`,
* and the Loader commits the new value into the running plugin's reference
* instead of remounting it, then emits `loader/volatile-update`. Every reader
* therefore takes the style at use time — per tool call, per skill load, per
* page served — so a changed setting reaches the next card without a restart.
*
* Two shapes reach `apply`: a volatile reference (`{ get() }`) where the
* host's schemastery has `.volatile()`, and a plain id where it does not, or
* where a test passes one.
*
* @module @nagi-ovo/dsh-visualize/style-setting
*/
/**
* Build the `style` field schema, volatile where the schemastery in use
* supports it. Without `.volatile()` the field still validates; the settings
* page then reports it unavailable and the YAML route remains.
* @param schema - schemastery's default export, injectable for the fallback test.
* @returns the field schema.
*/
function styleFieldSchema(schema = z) {
	const field = schema.union(STYLE_IDS.map((id) => schema.const(id).description(STYLES[id].label))).default(DEFAULT_STYLE).description("Card style · 卡片风格");
	return typeof field.volatile === "function" ? field.volatile() : field;
}
/**
* Read the configured style now.
* @param setting - the `style` value `apply` received.
* @returns a known style id; anything else reads as the default.
*/
function readStyle(setting) {
	if (typeof setting === "object" && setting !== null && typeof setting.get === "function") return styleIdFrom(setting.get());
	return styleIdFrom(setting);
}
//#endregion
//#region src/style-files.ts
/**
* The user's style files as the settings page edits them: the global file
* (`<DSH_HOME>/visualize/style.md`) and one workspace file per registered
* workspace (`<workspace>/.dsh/visualize-style.md`), read and written through
* one exact route on the host's authenticated `/api` channel
* (`ctx.connection.fetch`, dsh 0.1.7+). The channel applies the host's
* Host/Origin checks and browser authentication before a request reaches
* this module, and only the owner reaches an exact route.
*
* Containment is by construction: a request names a scope and, for a
* workspace, a workspace id the host's registry knows — never a path — and
* the file is resolved here from that. A file or directory on the way that
* is a symlink out of its root is refused, as is a file that is a symlink at
* all: replacing it would silently cut the user's link. Writes go through a
* temporary file and a rename; saving empty text removes the file, which the
* skill then no longer reads.
*
* @module @nagi-ovo/dsh-visualize/style-files
*/
/** Bytes of an existing file the page is shown; the skill reads far less. */
const MAX_SHOWN_BYTES = 65536;
/**
* The host facts the route reads, looked up per request so a registry that
* arrives later is seen.
* @param ctx - registrant context.
* @returns the route host.
*/
function styleFilesHost(ctx) {
	return {
		home: storeRoot(ctx),
		workspaces() {
			let registry;
			try {
				registry = ctx.get("workspaceRegistry");
			} catch {
				return [];
			}
			const list = registry?.list;
			if (typeof list !== "function") return [];
			const rows = list.call(registry);
			if (!Array.isArray(rows)) return [];
			return rows.flatMap((row) => typeof row?.id === "string" && typeof row.path === "string" ? [{
				id: row.id,
				path: row.path,
				...typeof row.title === "string" ? { title: row.title } : {}
			}] : []);
		}
	};
}
/** Every file the page can address, global first. */
function targets(host) {
	if (host.home === void 0) return [];
	const list = [{
		scope: "global",
		path: join(host.home, GLOBAL_STYLE_FILE),
		root: host.home
	}];
	for (const workspace of host.workspaces()) {
		const root = resolve(workspace.path);
		list.push({
			scope: "workspace",
			path: join(root, WORKSPACE_STYLE_FILE),
			root,
			workspace
		});
	}
	return list;
}
/**
* Find the file a request names.
* @param host - route host.
* @param scope - requested scope.
* @param workspaceId - requested workspace id, for a workspace file.
* @returns the target, or undefined when the request names no known file.
*/
function targetOf(host, scope, workspaceId) {
	return targets(host).find((target) => target.scope === scope && (scope === "global" || target.workspace?.id === workspaceId));
}
/**
* Why a target cannot be used, or undefined when it can: its directory must
* resolve inside its root (the root itself counts), and the file itself must
* be a regular file when it exists.
*/
async function blockOf(target) {
	const realRoot = await realpathOfDeepest(target.root);
	const dir = await realpathOfDeepest(dirname(target.path));
	if (dir !== realRoot && !inside(realRoot, dir)) return { blocked: "outside" };
	const stat = await lstat(target.path).catch(() => void 0);
	if (stat === void 0) return {};
	if (stat.isSymbolicLink()) return {
		blocked: "symlink",
		size: 0
	};
	if (!stat.isFile()) return {
		blocked: "not-a-file",
		size: 0
	};
	return { size: stat.size };
}
/** Read one target into its page view. */
async function viewOf(target) {
	const base = {
		scope: target.scope,
		path: target.path,
		...target.workspace === void 0 ? {} : {
			workspaceId: target.workspace.id,
			...target.workspace.title === void 0 ? {} : { title: target.workspace.title }
		}
	};
	const { blocked, size } = await blockOf(target);
	if (blocked !== void 0) return {
		...base,
		exists: size !== void 0,
		text: "",
		bytes: 0,
		blocked
	};
	if (size === void 0) return {
		...base,
		exists: false,
		text: "",
		bytes: 0
	};
	const bytes = await readFile(target.path).catch(() => void 0);
	if (bytes === void 0) return {
		...base,
		exists: false,
		text: "",
		bytes: 0
	};
	const text = bytes.subarray(0, MAX_SHOWN_BYTES).toString("utf8").replace(/�+$/u, "");
	return {
		...base,
		exists: true,
		text,
		bytes: bytes.byteLength
	};
}
/**
* List every style file the page can edit.
* @param host - route host.
* @returns the GET answer.
*/
async function listStyleFiles(host) {
	return {
		maxBytes: CUSTOM_STYLE_MAX_BYTES,
		files: await Promise.all(targets(host).map(viewOf))
	};
}
/** A refused save. */
var StyleFileError = class extends Error {
	status;
	code;
	constructor(status, code, message) {
		super(message);
		this.status = status;
		this.code = code;
	}
};
/**
* Save one style file: write the text, or remove the file for empty text.
* @param host - route host.
* @param body - the parsed request body: `{ scope, workspaceId?, text }`.
* @returns the file's view after the save.
* @throws StyleFileError for a request this route refuses.
*/
async function saveStyleFile(host, body) {
	const request = typeof body === "object" && body !== null ? body : {};
	if (typeof request.text !== "string") throw new StyleFileError(400, "invalid-text", "`text` must be a string");
	const target = targetOf(host, request.scope, request.workspaceId);
	if (target === void 0) throw new StyleFileError(404, "unknown-file", "no such style file");
	const size = Buffer.byteLength(request.text, "utf8");
	if (size > 4096) throw new StyleFileError(413, "too-large", `style file is ${size} bytes; the limit is ${CUSTOM_STYLE_MAX_BYTES}`);
	const { blocked } = await blockOf(target);
	if (blocked !== void 0) throw new StyleFileError(409, blocked, `${target.path} cannot be edited here (${blocked})`);
	if (request.text.trim().length === 0) await rm(target.path, { force: true });
	else await writeFileAtomic(target.path, request.text);
	return await viewOf(target);
}
/** A JSON response. */
function json(status, body) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		}
	});
}
/**
* Answer one request on {@link STYLE_FILES_PATH}: GET lists, POST saves.
* @param host - route host.
* @param request - the request, already authenticated by the host channel.
* @returns the response.
*/
async function handleStyleFiles(host, request) {
	if (request.method === "GET") return json(200, await listStyleFiles(host));
	if (request.method !== "POST") return json(405, { error: "method-not-allowed" });
	if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json(415, { error: "unsupported-media-type" });
	let body;
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "invalid-json" });
	}
	try {
		return json(200, await saveStyleFile(host, body));
	} catch (error) {
		if (error instanceof StyleFileError) return json(error.status, {
			error: error.code,
			message: error.message
		});
		throw error;
	}
}
//#endregion
//#region src/self-repair.ts
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
/** Package name the steered messages are attributed to. */
const SELF_REPAIR_PLUGIN = "@nagi-ovo/dsh-visualize";
/**
* Source kind of a steered correction in session format v4 (dsh 0.1.7+). It
* is the kind the v3→v4 migration gives a `{ kind: 'plugin', plugin }`
* record of this package, so old and new corrections read the same.
*/
const SELF_REPAIR_SOURCE_KIND = `plugin:${SELF_REPAIR_PLUGIN}`;
/** Warning codes whose card is broken, not merely off-style. */
const BREAKING_WARNINGS = /* @__PURE__ */ new Set([
	"VZ102",
	"VZ106",
	"VZ107"
]);
/** Tools that put files in the project; a turn that used one built a deliverable. */
const FILE_TOOLS = /* @__PURE__ */ new Set([
	"write",
	"edit",
	"multi_edit",
	"apply_patch",
	"write_file",
	"edit_file",
	"create_file",
	"notebook_edit"
]);
/** Open turns tracked at once; a host never has this many, the bound only guards a leak. */
const MAX_TRACKED_TURNS = 256;
/** Empty facts for a turn that just started. */
function emptyTurnFacts() {
	return {
		userText: "",
		finalText: "",
		finalInterrupted: false,
		textAfterVisualize: "",
		visualizeCalled: false,
		fileToolCalled: false,
		lastVisualize: void 0,
		cards: /* @__PURE__ */ new Map()
	};
}
/**
* Every correction the turn qualifies for, most urgent first.
* @param facts - what the turn did.
* @returns the candidate corrections; empty when the turn is fine.
*/
function planRepairs(facts) {
	const plans = [];
	const last = facts.lastVisualize;
	if (last !== void 0 && !last.ok && isOwnRejection(last.text) && !admitsFailure(facts.textAfterVisualize)) plans.push({
		kind: "failed-call",
		fingerprint: fingerprint("failed-call", last.text),
		text: `${TAG} Your last visualize call failed, so nothing rendered and the user sees no card. Apply the fixes that error listed and call visualize again now. If the card cannot be made to pass, tell the user in one sentence what blocks it instead.`
	});
	for (const [path, card] of facts.cards) {
		const findings = breakingFindings(card.fragment);
		if (findings.length === 0) continue;
		plans.push({
			kind: "card-warnings",
			fingerprint: fingerprint("card-warnings", path, ...findings.map((f) => `${f.code}@${f.offset}:${f.excerpt}`)),
			text: `${TAG} The card "${card.title}" rendered, but these findings leave it broken:\n${formatFindings(findings)}\nPatch it now: visualize with action "update", path "${path}", its title restated. Then end your reply; do not mention this check.`
		});
	}
	if (facts.visualizeCalled || facts.fileToolCalled || facts.finalInterrupted || asksForCode(facts.userText)) return plans;
	const fence = wantsVisual(facts.userText) ? cardShapedFence(facts.finalText) : void 0;
	if (fence !== void 0) plans.push({
		kind: "pasted-markup",
		fingerprint: fingerprint("pasted-markup", fence),
		text: `${TAG} Your reply pastes HTML/SVG markup as a code block, so the user sees source code, not a rendered card. Call visualize now with that markup as \`fragment\` (a fragment only; load the visualize skill first if you have not), then add one or two sentences and do not paste the markup again. If the user wanted the code itself, end your turn with one short line instead.`
	});
	const promise = fence === void 0 ? promisedCard(facts.finalText) : void 0;
	if (promise !== void 0) plans.push({
		kind: "promised-card",
		fingerprint: fingerprint("promised-card", promise),
		text: `${TAG} You said you would show a card, but the turn is ending without a visualize call. Call visualize now. If you decided against a card, end your turn with one short line.`
	});
	return plans;
}
/** Prefix that tells the model (and a reader of the log) who is speaking. */
const TAG = "[dsh-visualize]";
/** Our tool's own rejection, as the host words a thrown execute error, and not the gate's STOP. */
function isOwnRejection(text) {
	return /^(?:Error:\s*)?invalid visualization/u.test(text.trimStart()) && !/\bSTOP:/u.test(text);
}
/** The model already told the user the card did not work. */
function admitsFailure(text) {
	return /\b(?:fail(?:s|ed|ing|ure)?|errors?|couldn't|could not|can't|cannot|unable|blocked|didn't render|did not render|not render)\b/iu.test(text) || /失败|错误|报错|无法|没能|未能|不能|渲染不了|没有渲染|没渲染/u.test(text);
}
/** Breaking findings of a card in its final state. */
function breakingFindings(fragment) {
	try {
		return lintFragment(fragment, Number.MAX_SAFE_INTEGER).findings.filter((f) => f.severity === "warn" && BREAKING_WARNINGS.has(f.code));
	} catch {
		return [];
	}
}
/** The prompt mentions code, files, or web tech, or carries code itself. */
function asksForCode(text) {
	return /\b(?:html?|css|svg|xml|js|javascript|typescript|jsx|tsx|react|vue|svelte|angular|tailwind|code|snippets?|source|markup|files?|template|components?|website|web ?page|landing page|front-?end|embed|copy|paste|download|save|export)\b/iu.test(text) || /代码|源码|源文件|文件|模板|组件|网页|网站|前端|落地页|片段|嵌入|复制|粘贴|下载|保存|导出|页面|标签/u.test(text) || /```|<\/?[a-z][\w-]*[\s/>]/iu.test(text);
}
/** The prompt asks to see something. */
function wantsVisual(text) {
	return /visuali[sz]|\bchart|\bplot|\bgraph|diagram|\bdraw|sketch|animat|simulat|interactive|illustrat|\bdemo|show me|dashboard|explorable/iu.test(text) || /可视化|画|图|演示|动画|模拟|交互|直观|展示|卡片/u.test(text);
}
/**
* The body of the last closed, card-shaped html/svg fence in a reply.
* @param text - the assistant reply.
* @returns the fence body, or undefined when no fence qualifies.
*/
function cardShapedFence(text) {
	let found;
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const open = /^ {0,3}(`{3,}|~{3,})[ \t]*([\w-]*)[^\n`]*$/u.exec(lines[i]);
		if (open === null) continue;
		const marker = open[1];
		const closeAt = lines.findIndex((line, j) => j > i && new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`, "u").test(line));
		if (closeAt === -1) break;
		const body = lines.slice(i + 1, closeAt).join("\n");
		if (/^(?:html?|svg)$/iu.test(open[2]) && isCardShaped(body)) found = body;
		i = closeAt;
	}
	return found;
}
/** A whole card fragment, not a document and not a snippet. */
function isCardShaped(body) {
	if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/iu.test(body)) return false;
	if (body.split("\n").filter((line) => line.trim().length > 0).length < 8) return false;
	return /<(?:script|svg|canvas)[\s>]/iu.test(body);
}
/** Unconditional "I'll draw a card" as the reply's final sentence. */
const PROMISE_EN = /\b(?:I(?:'ll| will| am going to|'m going to)|let me|let's)\s+(?:now\s+|also\s+|quickly\s+|first\s+)?(?:(?:draw|render|build|create|make|show|put together|sketch)\b[^.!?\n]{0,80}?\b(?:card|visuali[sz]ation|interactive (?:chart|demo|diagram|simulation|widget|explorer))\b|visuali[sz]e\b)[^.!?\n]{0,60}[.:!…]*$/iu;
const PROMISE_ZH = /(?:我|下面|接下来|现在|让我)(?:来|将|会|现在|先|再|就)*(?:为你|给你|帮你)?(?:画|绘制|做|生成|渲染|制作|画出|展示|可视化)[^。！？?!\n]{0,30}?(?:卡片|可视化|交互式?(?:图|演示|动画|模拟|图表))?[^。！？?!\n]{0,20}[。：:…]*$/u;
/** Words that make the final sentence an offer rather than a promise. */
const CONDITIONAL = /\b(?:if|would|could|can|should|want|like|whether|maybe|perhaps)\b|如果|的话|要不要|是否|可以|需要吗|想要|吗/iu;
/**
* The final sentence of a reply when it promises a card and nothing follows.
* @param text - the assistant reply.
* @returns the promising sentence, or undefined.
*/
function promisedCard(text) {
	const trimmed = text.trim();
	if (trimmed.length === 0) return void 0;
	const sentence = /[^.!?。！？\n]*[.!?。！？:：…]*\s*$/u.exec(trimmed)?.[0]?.trim() ?? "";
	if (sentence.length === 0 || /[?？]$/u.test(sentence) || CONDITIONAL.test(sentence)) return void 0;
	if (PROMISE_EN.test(sentence)) return sentence;
	if (PROMISE_ZH.test(sentence) && /卡片|可视化|交互/u.test(sentence)) return sentence;
}
/** Stable short hash of the trigger's identifying content. */
function fingerprint(...parts) {
	return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);
}
/** Text of a message's text blocks, joined. */
function textOf(content) {
	if (!Array.isArray(content)) return "";
	return content.map((block) => typeof block === "object" && block !== null && block.type === "text" ? String(block.text ?? "") : "").filter((part) => part.length > 0).join("\n");
}
/**
* Read a `tool/result` payload. dsh 0.1.7+ logs a tool-role message with
* `toolCallId`/`isError` and text content; earlier hosts wrap one
* `tool-result` block in a user-role message. Both carry `source.callId`.
*/
function observedResult(data) {
	const record = data ?? {};
	const message = record.message ?? {};
	const source = message["source"];
	const content = message["content"];
	const block = Array.isArray(content) && content.length === 1 && content[0]?.type === "tool-result" ? content[0] : void 0;
	return {
		callId: [
			message["toolCallId"],
			source?.callId,
			block?.toolCallId
		].find((v) => typeof v === "string"),
		isError: message["isError"] === true || block?.isError === true || record.error !== void 0,
		text: textOf(block?.content ?? content),
		meta: record.meta
	};
}
function sessionKey(session) {
	const id = session?.id ?? session?.header?.id;
	return id === void 0 ? void 0 : String(id);
}
/**
* Build the steered message. Format v4 sessions (dsh 0.1.7+) refuse the
* retired `plugin` wrapper and take a producer-owned kind; older ones use it.
* @param text - the correction.
* @param formatVersion - the session's on-disk format version.
* @returns a frozen, identified user-role message.
*/
function correctionMessage(text, formatVersion) {
	const summary = "visualize self-repair requested";
	const source = typeof formatVersion === "number" && formatVersion >= 4 ? {
		kind: SELF_REPAIR_SOURCE_KIND,
		form: "notice",
		summary
	} : {
		kind: "plugin",
		plugin: SELF_REPAIR_PLUGIN,
		form: "notice",
		summary
	};
	const content = Object.freeze([Object.freeze({
		type: "text",
		text
	})]);
	return Object.freeze({
		id: randomUUID(),
		role: "user",
		content,
		source: Object.freeze(source)
	});
}
/**
* Watch every session's open turn and steer a correction at its stop boundary
* when a gap is plainly there.
* @param ctx - registrant context.
*/
function installSelfRepair(ctx) {
	const turns = /* @__PURE__ */ new Map();
	const events = ctx;
	const logger = ctx.logger;
	events.on("session/event", (session, event) => {
		try {
			observe(turns, session, event);
		} catch (error) {
			logger?.warn?.(`dsh-visualize: self-repair observer failed (${error instanceof Error ? error.message : String(error)})`);
		}
	});
	events.on("agent/turn-stopping", ({ agent, turn, signal }) => {
		if (signal?.aborted === true || typeof agent?.steer !== "function") return;
		const key = sessionKey(agent.session);
		const state = key === void 0 ? void 0 : turns.get(key);
		if (state === void 0 || state.turn !== turn || state.subagent) return;
		if (state.steers >= 2) return;
		const plan = planRepairs(state.facts).find((p) => !state.fingerprints.has(p.fingerprint));
		if (plan === void 0) return;
		state.fingerprints.add(plan.fingerprint);
		state.steers += 1;
		try {
			agent.steer(correctionMessage(plan.text, agent.session?.header?.version));
		} catch (error) {
			logger?.warn?.(`dsh-visualize: self-repair steer failed (${error instanceof Error ? error.message : String(error)})`);
		}
	});
}
/** Fold one durable session event into its open turn's state. */
function observe(turns, session, event) {
	const key = sessionKey(session);
	if (key === void 0) return;
	const data = event.data;
	if (event.type === "turn/start") {
		turns.delete(key);
		turns.set(key, {
			turn: Number(data?.["turn"]),
			subagent: session.header?.origin === "subagent",
			facts: emptyTurnFacts(),
			calls: /* @__PURE__ */ new Map(),
			steers: 0,
			fingerprints: /* @__PURE__ */ new Set()
		});
		if (turns.size > MAX_TRACKED_TURNS) {
			const oldest = turns.keys().next().value;
			if (oldest !== void 0) turns.delete(oldest);
		}
		return;
	}
	if (event.type === "turn/end") {
		turns.delete(key);
		return;
	}
	const state = turns.get(key);
	if (state === void 0 || data === void 0) return;
	const facts = state.facts;
	switch (event.type) {
		case "user/message":
			if (data["source"]?.kind !== "user") return;
			facts.userText += `${textOf(data["content"])}\n`;
			return;
		case "assistant/message": {
			const text = textOf(data["message"]?.content);
			facts.finalText = text;
			facts.finalInterrupted = data["interrupted"] === true;
			if (text.length > 0) facts.textAfterVisualize += `${text}\n`;
			return;
		}
		case "tool/call": {
			const name = data["name"];
			const callId = data["callId"];
			if (typeof name !== "string") return;
			if (typeof callId === "string") state.calls.set(callId, name);
			if (name === "visualize") facts.visualizeCalled = true;
			if (FILE_TOOLS.has(name)) facts.fileToolCalled = true;
			return;
		}
		case "tool/result": {
			const result = observedResult(data);
			if (result.callId === void 0 || state.calls.get(result.callId) !== "visualize") return;
			facts.textAfterVisualize = "";
			if (result.isError) {
				facts.lastVisualize = {
					ok: false,
					text: result.text
				};
				return;
			}
			facts.lastVisualize = { ok: true };
			const meta = visualizeMetaFrom(result.meta);
			if (meta === void 0) return;
			facts.cards.delete(meta.path);
			facts.cards.set(meta.path, {
				title: meta.title,
				fragment: meta.fragment
			});
			return;
		}
		default: return;
	}
}
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
const Config = z.object({
	maxFragmentBytes: z.natural().default(1e6),
	style: styleFieldSchema(),
	selfRepair: z.boolean().default(true).description("Same-turn self-repair · 同回合自我修复")
});
/**
* Register the tool, the bundled skill provider, the page config, the
* style-file route of the settings page, the image route, and the same-turn
* self-repair.
* @param ctx - registrant context.
* @param config - validated deployment configuration.
*/
function apply(ctx, config) {
	const style = () => readStyle(config.style);
	const imageRoute = registerImageRoute(ctx);
	const images = { delivery: () => imageRoute.ready };
	let toolStyle = style();
	let disposeTool = ctx.tools.register(visualizeTool(ctx, config.maxFragmentBytes, style, images));
	ctx.on("loader/volatile-update", () => {
		if (style() === toolStyle) return;
		disposeTool();
		toolStyle = style();
		disposeTool = ctx.tools.register(visualizeTool(ctx, config.maxFragmentBytes, style, images));
	});
	ctx.skills.registerProvider(() => visualizeSkillProvider(style, (cwd) => styleFileLocations(ctx, cwd)));
	injectPageConfig(ctx, style);
	registerStyleFiles(ctx);
	declineGeneratedSettingsPage(ctx);
	if (config.selfRepair !== false) installSelfRepair(ctx);
}
/**
* Tell the browser half the configured style through the web server's index
* injection table (dsh 0.1.1+): a card still streaming has no persisted meta
* yet, and nothing else in the tool call carries server data before it
* settles. Each page render reads the setting then, so a reload picks up a
* change; the settings page also updates the value on its own page when it
* saves. Hosts without a web server never emit the event, and the listener is
* inert there.
* @param ctx - registrant context.
* @param style - reads the configured card style.
*/
function injectPageConfig(ctx, style) {
	ctx.on("webserver/index-inject", (table) => {
		table.push({
			kind: "global",
			name: PAGE_CONFIG_GLOBAL,
			value: { style: style() }
		});
	});
}
/**
* Serve the settings page's style-file editor on the host's `/api` channel,
* which authenticates the browser and checks Host/Origin before the route
* runs. Optional: a host without the channel, or with an older connection
* service, simply has no editor, and the page says where the files are.
* @param ctx - registrant context.
*/
function registerStyleFiles(ctx) {
	const host = styleFilesHost(ctx);
	ctx.inject(["connection"], (scope) => {
		const fetch = scope.get("connection")?.fetch;
		if (typeof fetch?.register !== "function") return;
		const register = fetch.register.bind(fetch);
		scope.effect(() => register({
			path: STYLE_FILES_PATH,
			methods: ["GET", "POST"],
			requestBody: "buffered",
			fetch: async (request) => await handleStyleFiles(host, request)
		}), "dsh-visualize: style files route");
	});
}
/**
* Serve stored card images on the host's `/api` channel (dsh 0.1.7+), the
* only way their bytes reach a card without riding in the session log. The
* returned flag tells the tool whether the route is up: on a host without
* the channel the tool reports images as undeliverable rather than storing
* bytes no card can fetch.
* @param ctx - registrant context.
* @returns a live flag, true while the route is registered.
*/
function registerImageRoute(ctx) {
	const state = { ready: false };
	ctx.inject(["connection"], (scope) => {
		const fetch = scope.get("connection")?.fetch;
		if (typeof fetch?.register !== "function") return;
		const register = fetch.register.bind(fetch);
		scope.effect(() => {
			const dispose = register({
				path: IMAGE_ROUTE_PATH,
				methods: ["GET", "HEAD"],
				requestBody: "buffered",
				fetch: async (request) => await handleImageRequest(storeRoot(ctx), request)
			});
			state.ready = true;
			return () => {
				state.ready = false;
				return dispose();
			};
		}, "dsh-visualize: card images route");
	});
	return state;
}
/**
* Tell the host's settings service that this plugin ships its own page for
* its volatile field, so a client that generates forms from schemas does not
* add a second one. Optional, like the service.
* @param ctx - registrant context.
*/
function declineGeneratedSettingsPage(ctx) {
	ctx.inject(["settings"], (scope) => {
		const settings = scope.get("settings");
		if (typeof settings?.configure !== "function") return;
		const configure = settings.configure.bind(settings);
		scope.effect(() => configure({ auto: false }, ctx.fiber), "dsh-visualize: settings page policy");
	});
}
//#endregion
export { Config, STYLE_FILES_PATH, STYLE_IDS, VISUALIZE_TOOL_NAME, apply, inject, name, readStyle, validateFragment, visualizeMetaFrom };
