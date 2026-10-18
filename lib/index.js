import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
//#region src/storage.ts
/**
* Where a card's settled fragment lives on disk, and how an `update` finds it
* again.
*
* New cards go to a per-session store under the harness home —
* `$DSH_HOME/visualize/sessions/<session>/<slug>-<hash>.html` — never into the
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
		async write(content) {
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
	};
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
//#region src/skill.ts
/**
* Bundled `visualize` skill provider: the fragment-authoring contract the
* model loads before its first `visualize` call. Mirrors the official
* `dsh-skill-badge` provider shape — one bundled candidate whose body ships
* in this package's `assets/`.
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
		fix: "set Chart.defaults.font.family = getComputedStyle(document.body).fontFamily"
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
		for (const a of tag.attrs) if (a.value !== void 0 && names.includes(a.name)) reportUrl(sink, a.value, a.valueStart, "markup", false);
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
*/
function reportUrl(sink, raw, offset, context, importMap, cap) {
	const url = raw.trim();
	if (url.length === 0 || url.startsWith("#") || url.includes("${")) return;
	const at = offset + (raw.length - raw.trimStart().length);
	if (/^(?:data|blob|about|javascript|mailto|tel):/iu.test(url)) return;
	const scheme = /^([a-z][\w+.-]*):/iu.exec(url)?.[1]?.toLowerCase();
	if (scheme === void 0 && !url.startsWith("//")) {
		if (context === "module" && importMap) return;
		sink.add("VZ106", at, url.length, JSON.stringify(url));
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
		sink.add("VZ005", at, url.length, `${host || url} is not on the allowlist`, cap);
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
//#endregion
//#region src/tool.ts
const DESCRIPTION = `Show the user an interactive HTML visualization, rendered as a live card in the conversation. \`create\` (the default) takes the whole markup in \`fragment\`: literal inline HTML only (no <!doctype>, <html>, <head>, or <body> — the card supplies the document, stylesheet, and theme). To correct a card you already rendered, call \`update\` with its \`path\` and one exact \`old_str\`/\`new_str\` replacement instead of re-sending the whole fragment. The card appears while you generate; a copy of the finished fragment is saved outside the project, per session. Load the \`visualize\` skill for the authoring contract before your first call. If this session has no skill tool, read the same contract from ${SKILL_BODY_PATH} (its relative paths resolve against ${SKILL_RESOURCE_DIR}) with a file or shell tool; do not search for it anywhere else.`;
/**
* Build the `visualize` tool definition over the composed filesystem seam.
* @param ctx - registrant context carrying `ctx.fs` and the host home path for the card copy.
* @param maxFragmentBytes - deployment size ceiling for one fragment.
* @returns the tool definition to register on `ctx.tools`.
*/
function visualizeTool(ctx, maxFragmentBytes) {
	const lint = new FragmentLintGate();
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
						enum: ["inline", "wide"]
					},
					sizeBytes: {
						type: "integer",
						required: true
					},
					fragment: {
						type: "string",
						required: true
					},
					warnings: { type: "string" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.action === "update" ? `Patched "${value.title}" in place (${value.sizeBytes} bytes; updated card at ${value.path}). The user sees the corrected visualization in the conversation; patch that path for any further correction.` : `Rendered "${value.title}" inline (${value.sizeBytes} bytes; saved copy at ${value.path}). The user sees the interactive visualization in the conversation.`
			}, ...value.warnings ? [{
				type: "text",
				text: value.warnings
			}] : []],
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
			const target = source ?? await store.create(`${slugOf(title)}-${contentHash(fragment)}.html`);
			await target.write(fragment);
			return {
				action,
				path: target.displayPath,
				title,
				mode: args.mode ?? "inline",
				sizeBytes,
				fragment,
				...warnings ? { warnings } : {}
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
