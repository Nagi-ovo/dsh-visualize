window.__ModuleLoader__.load({
	id: "@nagi-ovo/dsh-visualize",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		* Rebuild a descriptor from the call's own arguments when persisted meta is
		* missing. Nested dispatches (`run_code` / PTC) never project presentation
		* meta, but they do log `arguments`; a create's fragment is in that JSON.
		*
		* An `update` without a fragment cannot be rebuilt from the wire (the patched
		* markup lives in execute's value, which nested logs do not keep) and
		* declines. Incomplete streaming JSON is not parsed via throw/catch: only a
		* trailing `}` is treated as complete, otherwise a *closed* `"fragment"`
		* string is taken through {@link extractStreamingFragment}'s scanner.
		* @param argsRaw - running `block.argsRaw` or settled `block.call.argsRaw`.
		* @returns a card descriptor, or `undefined` to keep the quiet fallback.
		*/
		function visualizeMetaFromArgs(argsRaw) {
			if (typeof argsRaw !== "string" || argsRaw.length === 0) return void 0;
			const complete = parseCompleteArgs(argsRaw);
			if (complete !== void 0) {
				if (complete["action"] === "update" && typeof complete["fragment"] !== "string") return void 0;
				return descriptorFromFields(complete["fragment"], complete["title"], complete["mode"], complete["path"]);
			}
			const closed = scanFragment(argsRaw, true);
			if (closed === void 0) return void 0;
			return descriptorFromFields(closed, void 0, void 0, void 0);
		}
		/**
		* Accept only a complete JSON object, gated on a trailing `}` so a streaming
		* prefix never enters `JSON.parse`.
		* @param raw - accumulated argument text.
		* @returns the object, or `undefined` when the prefix is incomplete or illegal.
		*/
		function parseCompleteArgs(raw) {
			let end = raw.length;
			while (end > 0) {
				const ch = raw[end - 1];
				if (ch === " " || ch === "\n" || ch === "\r" || ch === "	") {
					end -= 1;
					continue;
				}
				break;
			}
			if (end === 0 || raw[end - 1] !== "}") return void 0;
			try {
				const parsed = JSON.parse(raw.slice(0, end));
				if (typeof parsed !== "object" || parsed === null) return void 0;
				return parsed;
			} catch {
				return;
			}
		}
		/**
		* Narrow wire fields into a descriptor. Empty markup after dropping a
		* trailing half-script is declined rather than mounting a blank frame.
		*/
		function descriptorFromFields(fragment, title, mode, path) {
			if (typeof fragment !== "string") return void 0;
			if (mode !== void 0 && mode !== "inline" && mode !== "wide") return void 0;
			const markup = trimStreamingScripts(fragment);
			if (markup.trim().length === 0) return void 0;
			return {
				kind: "visualize",
				fragment: markup,
				title: typeof title === "string" && title.trim().length > 0 ? title.trim() : "Visualization",
				mode: mode === "wide" ? "wide" : "inline",
				path: typeof path === "string" ? path : ""
			};
		}
		/** JSON short escapes, keyed by the character after the backslash. */
		const JSON_ESCAPES = {
			"\"": "\"",
			"\\": "\\",
			"/": "/",
			b: "\b",
			f: "\f",
			n: "\n",
			r: "\r",
			t: "	"
		};
		/**
		* Extract the `fragment` string value from a *possibly incomplete* streaming
		* tool-call JSON argument prefix. The streaming preview calls this on every
		* accumulated delta: it scans for the `"fragment":"` opener, then unescapes
		* characters until the (possibly absent) closing quote, dropping a trailing
		* half-finished escape sequence rather than misreading it.
		* @param argsRaw - the accumulated raw argument text, valid JSON or a prefix.
		* @returns the fragment decoded so far, or `undefined` before the opener streams in.
		*/
		function extractStreamingFragment(argsRaw) {
			return scanFragment(argsRaw, false);
		}
		/**
		* Walk a possibly incomplete `"fragment":"...` value.
		* @param argsRaw - accumulated argument text.
		* @param requireClosed - when true, decline until the closing quote arrives
		*   (the settled-card fallback must not mount on a half-streamed string).
		* @returns the decoded fragment, or `undefined` when the opener is absent
		*   or, if required, the string is still open.
		*/
		function scanFragment(argsRaw, requireClosed) {
			const opener = /"fragment"\s*:\s*"/u.exec(argsRaw);
			if (!opener) return void 0;
			let out = "";
			for (let i = opener.index + opener[0].length; i < argsRaw.length; i++) {
				const ch = argsRaw[i];
				if (ch === "\"") return out;
				if (ch !== "\\") {
					out += ch;
					continue;
				}
				const next = argsRaw[i + 1];
				if (next === void 0) return requireClosed ? void 0 : out;
				if (next === "u") {
					const hex = argsRaw.slice(i + 2, i + 6);
					if (hex.length < 4) return requireClosed ? void 0 : out;
					const code = Number.parseInt(hex, 16);
					if (Number.isNaN(code)) return requireClosed ? void 0 : out;
					out += String.fromCharCode(code);
					i += 5;
					continue;
				}
				const short = JSON_ESCAPES[next];
				if (short === void 0) return requireClosed ? void 0 : out;
				out += short;
				i += 1;
			}
			return requireClosed ? void 0 : out;
		}
		/** Matches the last script opener (complete or still missing its `>`). */
		const LAST_SCRIPT_OPEN = /<script\b[^>]*>?(?![\s\S]*<script\b)/iu;
		/**
		* Prepare a streamed fragment prefix for the live preview: complete
		* `<script>…<\/script>` blocks are kept — they are finished JavaScript the
		* preview shell executes on arrival, which is how a script-drawn chart paints
		* during generation — while a trailing block whose `<\/script>` has not
		* streamed in yet is dropped whole (a half-streamed body is almost never
		* valid JavaScript).
		* @param fragment - the fragment prefix streamed so far.
		* @returns the preview-safe markup.
		*/
		function trimStreamingScripts(fragment) {
			const opener = LAST_SCRIPT_OPEN.exec(fragment);
			if (!opener) return fragment;
			const rest = fragment.slice(opener.index + opener[0].length);
			return /<\/script\s*>/iu.test(rest) ? fragment : fragment.slice(0, opener.index);
		}
		//#endregion
		//#region src/frame-css.ts
		/**
		* The stylesheet injected into every visualization frame: theme tokens with
		* host-bridged overrides, a minimal reset, and the base-class vocabulary the
		* bundled skill teaches (`.card`, `.btn`, `.viz-*`, form utilities). Kept as a
		* TS string so the browser bundle needs no CSS loader and the node-side specs
		* can assert against it.
		*
		* Token contract: every `--<name>` here is declared as
		* `var(--dsh-viz-<name>, <fallback>)`. The card resolves the host palette
		* (DSH `--dsw-alias-*` design tokens, whale-blue accent included) and injects
		* the `--dsh-viz-*` values on the frame's `:root`; outside DSH the fallbacks
		* keep the frame legible in both appearances via `light-dark()`.
		*
		* @module @nagi-ovo/dsh-visualize/frame-css
		*/
		/** The frame stylesheet, inlined into the sandboxed srcdoc document. */
		const FRAME_CSS = `
:root {
  color-scheme: light dark;
  --background: var(--dsh-viz-background, transparent);
  --foreground: var(--dsh-viz-foreground, light-dark(rgb(26 28 31), rgb(240 242 245)));
  --card: var(--dsh-viz-card, light-dark(rgb(0 0 0 / 4%), rgb(255 255 255 / 6%)));
  --card-foreground: var(--dsh-viz-foreground, light-dark(rgb(26 28 31), rgb(240 242 245)));
  --muted-foreground: var(--dsh-viz-muted-foreground, light-dark(rgb(26 28 31 / 55%), rgb(240 242 245 / 55%)));
  --border: var(--dsh-viz-border, light-dark(rgb(0 0 0 / 10%), rgb(255 255 255 / 12%)));
  --primary: var(--dsh-viz-primary, light-dark(rgb(65 118 230), rgb(110 150 240)));
  --primary-foreground: var(--dsh-viz-primary-foreground, light-dark(rgb(255 255 255), rgb(13 13 13)));
  --viz-series-1: var(--dsh-viz-primary, light-dark(rgb(65 118 230), rgb(110 150 240)));
  --viz-series-2: light-dark(rgb(225 105 16), rgb(236 142 59));
  --viz-series-3: light-dark(rgb(2 155 100), rgb(72 196 130));
  --viz-series-4: light-dark(rgb(147 89 185), rgb(183 145 226));
  --viz-series-5: light-dark(rgb(214 63 76), rgb(233 108 122));
  --viz-series-6: light-dark(rgb(154 139 45), rgb(206 182 70));
  --radius: 8px;
  --font-size-base: 14px;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--background);
  color: var(--foreground);
  font: 400 var(--font-size-base)/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
h1, h2, h3 { margin: 0 0 0.5em; font-weight: 500; line-height: 1.3; }
h1 { font-size: 1.3em; }
h2 { font-size: 1.15em; }
h3 { font-size: 1em; }
p { margin: 0 0 0.75em; }
a { color: var(--primary); }
svg text { fill: var(--foreground); font-size: 12px; }
.text-small { font-size: 12px; color: var(--muted-foreground); }

.card {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
}

.btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--foreground);
  font: inherit;
  cursor: pointer;
}
.btn:hover { background: color-mix(in oklab, var(--foreground) 6%, transparent); }
.btn-primary,
.btn[aria-pressed='true'],
.btn[aria-selected='true'],
.btn.is-selected {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}
.btn-ghost { border-color: transparent; }
.btn:disabled { opacity: 0.5; cursor: default; }

.viz-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}
.viz-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.viz-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 10px;
  margin-bottom: 12px;
}
.viz-stat .viz-stat-label,
.viz-stat > :first-child { font-size: 12px; color: var(--muted-foreground); }
.viz-stat-value { font-size: 1.4em; font-weight: 500; line-height: 1.2; }
.viz-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--primary) 14%, transparent);
  color: var(--primary);
  font-size: 12px;
}

.form-label { display: block; font-size: 12px; color: var(--muted-foreground); margin-bottom: 4px; }
.form-control, .form-select {
  width: 100%;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--foreground);
  font: inherit;
}
.form-check { display: flex; align-items: center; gap: 6px; }
.form-check input { accent-color: var(--primary); }
input[type='range'] { accent-color: var(--primary); }

table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 5px 10px; border-bottom: 1px solid var(--border); }
th { font-weight: 500; color: var(--muted-foreground); font-size: 12px; }
.table-responsive { overflow-x: auto; }
`;
		const RESOURCE_SOURCES = [
			"blob:",
			"data:",
			...[
				"https://cdnjs.cloudflare.com",
				"https://cdn.jsdelivr.net",
				"https://esm.sh",
				"https://fonts.bunny.net",
				"https://fonts.googleapis.com",
				"https://fonts.gstatic.com",
				"https://unpkg.com"
			]
		].join(" ");
		/** The frame document's Content-Security-Policy. */
		const FRAME_CSP = [
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
		/** Wire type of the frame→card height report message. */
		const HEIGHT_MESSAGE_TYPE = "dsh-visualize:height";
		/** Wire type of the card→frame streaming fragment update message. */
		const STREAM_MESSAGE_TYPE = "dsh-visualize:stream";
		/**
		* Assemble the complete srcdoc document for one visualization frame.
		* @param options - fragment, title, bridged palette, and report token.
		* @returns the HTML document string for the iframe's `srcDoc`.
		*/
		function buildFrameDoc(options) {
			const rootVars = Object.entries(options.themeVars).map(([name, value]) => [name, sanitizeCssValue(value)]).filter(([, value]) => value.length > 0).map(([name, value]) => `--dsh-viz-${name}: ${value};`).join(" ");
			return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
<title>${escapeHtml$1(options.title)}</title>
<style>${FRAME_CSS}
:root { ${rootVars} color-scheme: ${options.colorScheme}; }
body { padding: 4px 2px; }</style>
</head>
<body>
${options.fragment}
<script>${heightReporter(options.reportToken)}<\/script>
</body>
</html>
`;
		}
		/**
		* The frame-side height reporter: posts the document's scroll height to the
		* parent on load and on every resize, so the card can size the iframe to its
		* content (a sandboxed frame's document is unreachable from the parent).
		* @param reportToken - correlation token echoed in each message.
		* @returns the inline script body.
		*/
		function heightReporter(reportToken) {
			const token = JSON.stringify(reportToken);
			return `
(function () {
  var post = function () {
    parent.postMessage({
      type: ${JSON.stringify(HEIGHT_MESSAGE_TYPE)},
      token: ${token},
      height: document.documentElement.scrollHeight,
    }, '*');
  };
  new ResizeObserver(post).observe(document.documentElement);
  addEventListener('load', post);
  post();
})();
`;
		}
		/**
		* Assemble the persistent streaming shell: an initially empty document that
		* receives fragment prefixes over `postMessage` and syncs them into its DOM
		* incrementally — unchanged elements persist (no reload churn) and newly
		* arrived elements float in via an enter animation, the Claude-style
		* component-by-component reveal. Scripts inside synced markup stay inert by
		* the `innerHTML` parsing rule, which is exactly right for a half-generated
		* fragment; the settled card runs the finished scripts.
		* @param options - bridged palette, scheme, and correlation token (fragment is ignored).
		* @returns the HTML document string for the preview iframe's `srcDoc`.
		*/
		function buildStreamShellDoc(options) {
			return buildFrameDoc({
				...options,
				title: "Streaming preview",
				fragment: `<div id="dsh-viz-stream-root"></div>
<style>
.dsh-viz-enter { animation: dsh-viz-enter 0.4s cubic-bezier(0.2, 0.7, 0.3, 1) both; }
@keyframes dsh-viz-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
</style>
<script>${streamSync(options.reportToken)}<\/script>`
			});
		}
		/**
		* The frame-side incremental DOM sync: parses each posted fragment prefix
		* into a detached tree and reconciles it against the live root by child
		* index — same tag syncs attributes and recurses, a mismatch replaces, a new
		* node appends with the enter class, extras drop. Index-based reconciliation
		* is exact for streamed markup, which only ever grows or refines its tail.
		* @param reportToken - correlation token accepted on incoming messages.
		* @returns the inline script body.
		*/
		function streamSync(reportToken) {
			return `
(function () {
  var root = document.getElementById('dsh-viz-stream-root');
  var token = ${JSON.stringify(reportToken)};
  function syncAttrs(cur, next) {
    var i, attrs = cur.attributes;
    for (i = attrs.length - 1; i >= 0; i--) {
      if (!next.hasAttribute(attrs[i].name)) cur.removeAttribute(attrs[i].name);
    }
    attrs = next.attributes;
    for (i = 0; i < attrs.length; i++) {
      if (cur.getAttribute(attrs[i].name) !== attrs[i].value) cur.setAttribute(attrs[i].name, attrs[i].value);
    }
  }
  function executable(node) {
    // Scripts parsed via innerHTML are permanently inert; an executable clone
    // runs on insertion. Streamed markup only ever appends, so each complete
    // script block arrives at its index exactly once and runs exactly once.
    var script = document.createElement('script');
    for (var i = 0; i < node.attributes.length; i++) {
      script.setAttribute(node.attributes[i].name, node.attributes[i].value);
    }
    script.textContent = node.textContent;
    return script;
  }
  function sync(cur, next) {
    var want = next.childNodes, have = cur.childNodes, i;
    for (i = 0; i < want.length; i++) {
      var target = want[i], live = have[i];
      if (live === undefined) {
        var added = target.nodeName === 'SCRIPT' ? executable(target) : target.cloneNode(true);
        if (added.nodeType === 1 && added.nodeName !== 'SCRIPT') added.classList.add('dsh-viz-enter');
        cur.appendChild(added);
        continue;
      }
      if (live.nodeType !== target.nodeType || live.nodeName !== target.nodeName) {
        cur.replaceChild(target.cloneNode(true), live);
        continue;
      }
      if (live.nodeType === 3 || live.nodeType === 8) {
        if (live.nodeValue !== target.nodeValue) live.nodeValue = target.nodeValue;
        continue;
      }
      if (live.nodeType === 1) {
        syncAttrs(live, target);
        sync(live, target);
      }
    }
    while (cur.childNodes.length > want.length) cur.removeChild(cur.lastChild);
  }
  addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== ${JSON.stringify(STREAM_MESSAGE_TYPE)} || data.token !== token) return;
    if (typeof data.fragment !== 'string') return;
    var next = document.createElement('div');
    next.innerHTML = data.fragment;
    sync(root, next);
  });
})();
`;
		}
		/**
		* Keep one bridged palette value inert inside a style block: resolved
		* computed-style colors never contain declaration or block delimiters, so any
		* occurrence marks a malformed value, dropped rather than repaired.
		* @param value - the raw computed-style value.
		* @returns the trimmed value, or empty when it must be dropped.
		*/
		function sanitizeCssValue(value) {
			const trimmed = value.trim();
			return /[;{}<>]/u.test(trimmed) ? "" : trimmed;
		}
		/**
		* Minimal HTML text escape for the frame `<title>`.
		* @param text - raw text.
		* @returns the escaped text.
		*/
		function escapeHtml$1(text) {
			return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
		}
		//#endregion
		//#region src/window-doc.ts
		/**
		* The page a card opens as when the reader takes it into its own browser tab.
		* DOM-free so the node-side specs exercise it directly.
		*
		* Security model: the card hands this page to the browser as a Blob URL, and a
		* Blob URL created by the dsh web page has the dsh web origin — anything that
		* ran as this page's own script could read the host's token and storage and
		* call its APIs. So the page carries no script and no model text of its own:
		* it is one full-viewport `<iframe sandbox="allow-scripts">` (the same
		* sandbox, referrer policy, and frame document as the in-chat card), with the
		* frame document passed only inside the escaped `srcdoc` attribute. Inside
		* the frame the fragment has an opaque origin, exactly as in the chat.
		*
		* @module @nagi-ovo/dsh-visualize/window-doc
		*/
		/** Sandbox flags shared by the in-chat card and the windowed page. */
		const FRAME_SANDBOX = "allow-scripts";
		/**
		* Assemble the windowed page around one frame document.
		* @param options - the frame document, title, and host theme at open time.
		* @returns the HTML for the Blob the new tab opens.
		*/
		function buildWindowDoc(options) {
			const surface = sanitizeCssValue(options.background);
			const background = surface.length > 0 ? surface : options.colorScheme === "dark" ? "#1b1b1f" : "#ffffff";
			return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(options.title)}</title>
<style>
:root { color-scheme: ${options.colorScheme}; background: ${background}; }
html, body { margin: 0; height: 100%; }
iframe { display: block; box-sizing: border-box; width: 100%; height: 100%; border: 0; padding: 16px 24px; background: transparent; }
</style>
</head>
<body><iframe sandbox="${FRAME_SANDBOX}" referrerpolicy="no-referrer" title="${escapeHtml(options.title)}" srcdoc="${escapeHtml(options.frameDoc)}"></iframe></body>
</html>
`;
		}
		/**
		* HTML escape safe for text and double-quoted attribute values. `&` goes
		* first so the later entities are not double-escaped; `"` is what keeps the
		* frame document inside its `srcdoc` attribute.
		* @param text - raw text.
		* @returns the escaped text.
		*/
		function escapeHtml(text) {
			return text.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
		}
		//#endregion
		//#region src/client/theme.ts
		/**
		* Host-theme resolution shared by the settled card and the streaming preview:
		* reads the DSH `--dsw-alias-*` design tokens (whale-blue brand accent
		* included) off `document.body` and derives the host color scheme. The body is
		* the read point because DSH mounts the token definitions there (dark override
		* under `body[data-ds-dark-theme]`), and custom properties only cascade
		* DOWNWARD — a `:root`-mounted theme still reaches the body by inheritance,
		* the reverse read never works. Missing tokens resolve to empty strings the
		* shell drops, so the frame stylesheet's `light-dark()` fallbacks apply
		* outside DSH.
		*/
		/** Host design token → frame variable bridge (values resolved per render). */
		const TOKEN_BRIDGE = [
			["foreground", "--dsw-alias-label-primary"],
			["card", "--dsw-alias-bg-layer-1"],
			["muted-foreground", "--dsw-alias-label-caption"],
			["border", "--dsw-alias-border-l2"],
			["primary", "--dsw-alias-brand-primary-new-colorprimary-new-color"],
			["primary-foreground", "--dsw-alias-label-primary-inverted"]
		];
		/**
		* Resolve the bridged palette and the host color scheme from computed style.
		* @returns the palette map and scheme for {@link buildFrameDoc}.
		*/
		function resolveTheme() {
			const computed = getComputedStyle(document.body);
			const themeVars = {};
			for (const [frameName, hostToken] of TOKEN_BRIDGE) themeVars[frameName] = computed.getPropertyValue(hostToken);
			const scheme = computed.colorScheme;
			return {
				themeVars,
				colorScheme: scheme.includes("dark") && !scheme.includes("light") ? "dark" : scheme.includes("light") && !scheme.includes("dark") ? "light" : document.body.hasAttribute("data-ds-dark-theme") ? "dark" : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
			};
		}
		//#endregion
		//#region src/client/VisualizeCard.tsx
		/**
		* The `visualize` toolview: renders the persisted fragment from the call's
		* durable meta inside `<iframe sandbox="allow-scripts">` with the frame's own
		* CSP. Replay-stable by construction — everything drawn derives from the
		* logged call slice, never from the fragment file.
		*
		* Theme bridge: the card resolves the host's `--dsw-alias-*` design tokens
		* (whale-blue brand accent included) at render time and injects them into the
		* frame document as `--dsh-viz-*` variables; a mutation of the root element's
		* attributes or an OS appearance flip re-resolves them, so the frame follows
		* live theme switches. The frame body stays transparent to blend with the
		* conversation surface.
		*
		* Height: a sandboxed frame's document is unreachable from the parent, so the
		* frame posts its scroll height (tagged with this call's id) and the card
		* sizes the iframe, capped per mode with internal scrolling past the cap.
		*
		* Open in new window: the header's icon button reopens the same frame
		* document full-size in its own tab, wrapped in a script-free page whose only
		* content is the identically sandboxed iframe (see window-doc.ts).
		*/
		/** Iframe height bounds; content beyond the cap scrolls inside the frame. */
		const MIN_HEIGHT = 48;
		const HEIGHT_CAP = {
			inline: 800,
			wide: 1200
		};
		const headerStyle = {
			display: "flex",
			alignItems: "baseline",
			gap: 8,
			fontSize: 12,
			opacity: .65,
			margin: "2px 0 6px",
			overflow: "hidden",
			whiteSpace: "nowrap"
		};
		/**
		* The card never widens its column: `minWidth: 0` lets the card shrink as a
		* flex or grid item (whose automatic minimum is its min-content width, here
		* the whole no-wrap header), so a long path truncates instead of stretching
		* the frame past the transcript.
		*/
		const cardStyle = {
			minWidth: 0,
			maxWidth: "100%"
		};
		/** Title keeps its width until it alone fills the row; the path yields first. */
		const titleStyle = {
			fontWeight: 500,
			flexShrink: 0,
			maxWidth: "100%",
			overflow: "hidden",
			textOverflow: "ellipsis"
		};
		const pathStyle = {
			minWidth: 0,
			overflow: "hidden",
			textOverflow: "ellipsis"
		};
		/** Icon button at the header's end; it never yields width to the path. */
		const openStyle = {
			alignSelf: "center",
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			flexShrink: 0,
			marginLeft: "auto",
			width: 22,
			height: 22,
			padding: 0,
			border: 0,
			borderRadius: 4,
			background: "transparent",
			color: "inherit",
			cursor: "pointer",
			outlineOffset: -2
		};
		/**
		* Open the card full-size in its own tab. The tab is a script-free Blob page
		* holding the same sandboxed frame (see window-doc.ts), themed as the host is
		* right now. Synchronous end to end so the browser treats it as a user-opened
		* tab rather than a blocked popup. The URL is not revoked: the tab can then be
		* reloaded, and the browser frees it when the chat page unloads.
		* @param meta - the card to open.
		* @param callId - correlation token base for the frame's height reports.
		*/
		function openInWindow(meta, callId) {
			const { themeVars, colorScheme } = resolveTheme();
			const page = buildWindowDoc({
				frameDoc: buildFrameDoc({
					fragment: meta.fragment,
					title: meta.title,
					themeVars,
					colorScheme,
					reportToken: `window:${callId}`
				}),
				title: meta.title,
				colorScheme,
				background: themeVars.card ?? ""
			});
			const url = URL.createObjectURL(new Blob([page], { type: "text/html" }));
			window.open(url, "_blank", "noopener");
		}
		/** Accessible name of the open control, in the host's language. */
		function openLabel() {
			return document.documentElement.lang.toLowerCase().startsWith("zh") ? "在新窗口打开" : "Open in new window";
		}
		/** Arrow-out-of-box glyph, sized to the 12px header text. */
		function OpenIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9.5 2.5h4v4" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13.5 2.5 7.5 8.5" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" })
				]
			});
		}
		const frameStyle$1 = {
			display: "block",
			width: "100%",
			border: 0,
			background: "transparent",
			colorScheme: "normal"
		};
		/** First text line of the durable result content, for the error row. */
		function firstResultLine(content) {
			for (const block of content) if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
				const newline = block.text.indexOf("\n");
				return newline === -1 ? block.text : block.text.slice(0, newline);
			}
			return "visualization failed";
		}
		/** The settled, well-formed card: header line plus the sandboxed frame. */
		function Frame({ meta, callId }) {
			const [themeTick, setThemeTick] = (0, react.useState)(0);
			const [height, setHeight] = (0, react.useState)(MIN_HEIGHT);
			(0, react.useEffect)(() => {
				const bump = () => setThemeTick((tick) => tick + 1);
				const observer = new MutationObserver(bump);
				observer.observe(document.documentElement, { attributes: true });
				observer.observe(document.body, { attributes: true });
				const media = matchMedia("(prefers-color-scheme: dark)");
				media.addEventListener("change", bump);
				return () => {
					observer.disconnect();
					media.removeEventListener("change", bump);
				};
			}, []);
			(0, react.useEffect)(() => {
				const onMessage = (event) => {
					const data = event.data;
					if (typeof data !== "object" || data === null) return;
					const report = data;
					if (report.type !== "dsh-visualize:height" || report.token !== callId) return;
					if (typeof report.height !== "number" || !Number.isFinite(report.height)) return;
					setHeight(Math.max(MIN_HEIGHT, Math.min(Math.ceil(report.height), HEIGHT_CAP[meta.mode])));
				};
				addEventListener("message", onMessage);
				return () => removeEventListener("message", onMessage);
			}, [callId, meta.mode]);
			const doc = (0, react.useMemo)(() => {
				const { themeVars, colorScheme } = resolveTheme();
				return buildFrameDoc({
					fragment: meta.fragment,
					title: meta.title,
					themeVars,
					colorScheme,
					reportToken: callId
				});
			}, [
				meta,
				callId,
				themeTick
			]);
			const label = openLabel();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: cardStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: headerStyle,
					title: meta.path === "" ? meta.title : meta.path,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: titleStyle,
							children: meta.title
						}),
						meta.path !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: pathStyle,
							children: meta.path
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: openStyle,
							"aria-label": label,
							title: label,
							onClick: () => openInWindow(meta, callId),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenIcon, {})
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					sandbox: FRAME_SANDBOX,
					referrerPolicy: "no-referrer",
					title: meta.title,
					srcDoc: doc,
					style: {
						...frameStyle$1,
						height
					}
				})]
			});
		}
		/**
		* Keyed toolview for the `visualize` tool. Running calls and malformed or
		* failed results stay quiet single lines; a well-formed persisted meta — or
		* the fragment in the call's own arguments for nested dispatches — mounts
		* the frame.
		*/
		function VisualizeCard({ callId, block }) {
			const argsRaw = "kind" in block ? block.call?.argsRaw : "argsRaw" in block ? block.argsRaw : void 0;
			if (!("kind" in block)) {
				const live = visualizeMetaFromArgs(argsRaw);
				if (live !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Frame, {
					meta: live,
					callId
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: headerStyle,
					children: "Visualize · rendering…"
				});
			}
			if (block.isError) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: headerStyle,
				children: ["Visualize · ", firstResultLine(block.content)]
			});
			const meta = visualizeMetaFrom(block.meta) ?? visualizeMetaFromArgs(argsRaw);
			if (meta === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: headerStyle,
				children: firstResultLine(block.content)
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Frame, {
				meta,
				callId
			});
		}
		//#endregion
		//#region src/client/StreamingPreview.tsx
		/**
		* Live streaming preview docked under the composer: while the model is still
		* generating a `visualize` call, the accumulated argument stream is parsed for
		* the fragment prefix and rendered into the same sandboxed frame the settled
		* card uses — complete scripts run, a still-open trailing script is held back
		* until its closing tag streams in (a half-streamed script body is almost
		* never valid JavaScript). Renders nothing when no `visualize` call is
		* streaming; once the call settles the preview unmounts and the transcript
		* card takes over.
		*
		* Source: from dsh 0.1.2 the session snapshot no longer carries the streaming
		* partial, and the host's own projections of the argument stream differ per
		* release (0.1.7 folds it into Assistant blocks that publish nothing for a
		* text-less step; 0.2.1 keeps it in the Tool node's lazy argument view). The
		* one shape stable across releases is the transient `assistant/live-chunk`
		* event itself, so a state-only Conversation Definition folds its
		* `tool-call-delta` chunks into Turn data, and the dock entry reads the open
		* Turn's value through the session-standard Chat selector. dsh 0.1.1 still
		* has the snapshot partial and no registry, and keeps reading it.
		*/
		/** Definition kind and Turn data key; namespaced by package to stay unique. */
		const STREAM_KEY = "dsh-visualize-stream";
		const isIndex = (value) => Number.isSafeInteger(value) && value >= 0;
		const isRecord = (value) => typeof value === "object" && value !== null;
		const idOf = (value) => typeof value === "string" || typeof value === "number" ? String(value) : "";
		/**
		* Read an argument chunk (dsh-llm `StreamChunk`): a `tool-call-delta`, or the
		* `block-end` of a tool-call block.
		* @param chunk - the live chunk, unchecked.
		* @param step - the chunk's step.
		* @returns the checked chunk, or undefined for anything else or malformed.
		*/
		function callChunk(chunk, step) {
			if (!isRecord(chunk) || !isIndex(chunk.index)) return void 0;
			if (chunk.type === "tool-call-delta") return {
				step,
				index: chunk.index,
				id: idOf(chunk.id),
				name: typeof chunk.name === "string" ? chunk.name : void 0,
				text: typeof chunk.argumentsDelta === "string" ? chunk.argumentsDelta : "",
				final: false
			};
			const block = chunk.block;
			if (chunk.type !== "block-end" || !isRecord(block) || block.type !== "tool-call") return void 0;
			if (typeof block.arguments !== "string") return void 0;
			return {
				step,
				index: chunk.index,
				id: idOf(block.id),
				name: typeof block.name === "string" ? block.name : void 0,
				text: block.arguments,
				final: true
			};
		}
		/**
		* Classify an event without trusting its payload: a history window can begin
		* anywhere and a host may change shapes, and a throw here would abort the
		* host's whole conversation assembly, not just this preview.
		* @param event - any Session event the engine offers.
		* @returns the fold input, or undefined when unrelated or malformed.
		*/
		function streamInput(event) {
			const data = event.data;
			if (!isRecord(data) || !isIndex(data.turn)) return void 0;
			const turn = data.turn;
			if (event.type === "turn/start") return {
				kind: "turn",
				turn
			};
			if (event.type === "tool/call") return {
				kind: "call",
				turn,
				callId: idOf(data.callId)
			};
			if (event.type !== "assistant/live-chunk" || !isIndex(data.step)) return void 0;
			const chunk = callChunk(data.chunk, data.step);
			return chunk === void 0 ? void 0 : {
				kind: "chunk",
				turn,
				chunk
			};
		}
		/**
		* Fold one argument chunk. Later deltas of a call may omit its name and id,
		* so a call is addressed by step and content index, the way the provider
		* stream addresses it; a settled block replaces the accumulated text with
		* the authoritative arguments.
		* @param calls - calls so far.
		* @param chunk - the checked chunk.
		* @returns the next call list.
		*/
		function foldChunk(calls, chunk) {
			const slot = `${chunk.step}:${chunk.index}`;
			const at = calls.findIndex((call) => call.slot === slot);
			const previous = at === -1 ? void 0 : calls[at];
			const next = {
				slot,
				callId: previous?.callId || chunk.id,
				name: chunk.name ?? previous?.name ?? "",
				argsRaw: chunk.final ? chunk.text : (previous?.argsRaw ?? "") + chunk.text
			};
			return at === -1 ? [...calls, next] : calls.map((call, index) => index === at ? next : call);
		}
		/**
		* Apply one event. Total: unrelated or malformed input returns the state.
		* @param state - state so far.
		* @param event - the matched event.
		* @returns the next state.
		*/
		function reduceStream(state, event) {
			const input = streamInput(event);
			if (input?.kind === "chunk") return {
				...state,
				calls: foldChunk(state.calls, input.chunk)
			};
			if (input?.kind !== "call") return state;
			const calls = state.calls.filter((call) => call.callId !== input.callId);
			return calls.length === state.calls.length ? state : {
				...state,
				calls
			};
		}
		/**
		* Turn-local fold of the argument stream; it publishes Turn data and no view
		* Node. Live chunks are transient: when the Assistant message settles the
		* engine retires them and replays the Context without them, which empties the
		* value on its own; a durable `tool/call` also settles its call.
		*
		* Every accepted event is a start candidate. The engine rejects a start that
		* arrives on a Context already holding matches, and a history window can
		* begin at any event of a turn (a long turn loses its `turn/start`, keeps a
		* `tool/call`, and then streams again), so no event may be an update-only
		* match; the earliest loaded one opens the Context and the rest fold.
		*/
		const streamDefinition = {
			kind: STREAM_KEY,
			match: (event) => {
				const input = streamInput(event);
				return input === void 0 ? null : {
					id: String(input.turn),
					role: "start"
				};
			},
			start: (_context, match) => {
				return reduceStream({
					turn: streamInput(match.event)?.turn ?? 0,
					calls: []
				}, match.event);
			},
			update: (context, match) => reduceStream(context.state, match.event),
			publication: (match) => match.event.type === "assistant/live-chunk" ? "animation-frame" : "immediate",
			buildLocationData: (context, scope, previous) => {
				if (scope !== "turn" || context.state === void 0) return null;
				const { turn, calls } = context.state;
				let call;
				for (const candidate of calls) if (candidate.name === "visualize") call = candidate;
				if (call === void 0) return null;
				if (previous?.kind === "turn" && previous.turn === turn && previous.key === "dsh-visualize-stream" && previous.value.callId === call.callId && previous.value.argsRaw === call.argsRaw) return previous;
				return {
					kind: "turn",
					turn,
					key: STREAM_KEY,
					value: {
						callId: call.callId,
						argsRaw: call.argsRaw
					}
				};
			}
		};
		/**
		* Flush interval for posting fragment updates into the persistent shell.
		* Updates are incremental DOM syncs, not reloads, so this can run near
		* per-delta speed; 150ms keeps the reveal continuous at negligible cost.
		*/
		const FLUSH_MS = 150;
		/**
		* Preview height ceiling. The frame tracks the shell's *measured* content
		* height (its height reports), so invisible early markup — style blocks,
		* empty containers — keeps the frame collapsed and painted components grow
		* it; the cap stops a tall fragment from crowding out the composer. Reserving
		* space no paint has claimed reads as a layout bug, not as anticipation.
		*/
		const PREVIEW_MAX_HEIGHT = 300;
		/**
		* The input dock spans the conversation view, not the composer column, so the
		* preview constrains itself to the composer's width family and centers.
		*/
		const wrapStyle = {
			margin: "6px auto 2px",
			maxWidth: 760,
			width: "100%"
		};
		const labelStyle = {
			fontSize: 12,
			opacity: .65,
			margin: "0 0 4px"
		};
		const frameStyle = {
			display: "block",
			width: "100%",
			border: 0,
			background: "transparent",
			transition: "height 240ms ease"
		};
		/**
		* Throttle a fast-changing string: re-emits at most every {@link FLUSH_MS},
		* with a trailing flush so the final value always lands. A plain trailing
		* debounce would starve under a continuous token stream — every delta would
		* reset the timer — so this flushes on the leading edge when the interval has
		* already elapsed.
		* @param value - the raw per-render value.
		* @returns the throttled value.
		*/
		function useThrottled(value) {
			const [shown, setShown] = (0, react.useState)(value);
			const lastFlush = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				const elapsed = Date.now() - lastFlush.current;
				if (elapsed >= FLUSH_MS) {
					lastFlush.current = Date.now();
					setShown(value);
					return;
				}
				const timer = setTimeout(() => {
					lastFlush.current = Date.now();
					setShown(value);
				}, FLUSH_MS - elapsed);
				return () => clearTimeout(timer);
			}, [value]);
			return shown;
		}
		/** The mounted preview, split out so hooks only run while a call streams. */
		function Preview({ argsRaw }) {
			const fragment = extractStreamingFragment(useThrottled(argsRaw));
			const preview = fragment === void 0 ? "" : trimStreamingScripts(fragment);
			const hasContent = preview.trim().length > 0;
			const frameRef = (0, react.useRef)(null);
			const [loaded, setLoaded] = (0, react.useState)(false);
			const [contentHeight, setContentHeight] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const onMessage = (event) => {
					const report = event.data;
					if (report?.type !== "dsh-visualize:height" || report.token !== "streaming-preview") return;
					if (typeof report.height !== "number" || !Number.isFinite(report.height)) return;
					setContentHeight(Math.max(0, Math.ceil(report.height)));
				};
				addEventListener("message", onMessage);
				return () => removeEventListener("message", onMessage);
			}, []);
			const doc = (0, react.useMemo)(() => buildStreamShellDoc({
				...resolveTheme(),
				reportToken: "streaming-preview"
			}), []);
			(0, react.useEffect)(() => {
				if (!loaded || !hasContent) return;
				frameRef.current?.contentWindow?.postMessage({
					type: STREAM_MESSAGE_TYPE,
					token: "streaming-preview",
					fragment: preview
				}, "*");
			}, [
				loaded,
				hasContent,
				preview
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: wrapStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: labelStyle,
					children: hasContent ? "Visualize · streaming preview" : "Visualize · composing…"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					ref: frameRef,
					sandbox: "allow-scripts",
					referrerPolicy: "no-referrer",
					title: "Visualization streaming preview",
					srcDoc: doc,
					style: {
						...frameStyle,
						height: hasContent ? Math.min(contentHeight, PREVIEW_MAX_HEIGHT) : 0
					},
					onLoad: () => setLoaded(true)
				})]
			});
		}
		const NO_SOURCE = {
			getSnapshot: () => void 0,
			subscribe: () => () => void 0
		};
		/**
		* The latest Turn's stream source. A Location's data store is observable on
		* its own, so the Chat selector only tracks which Turn is latest and every
		* argument delta reaches the preview without re-reading the Chat snapshot.
		* @param timeline - the Chat target's Turn/Step facts; older hosts may omit it.
		* @returns the source, or undefined before any Turn or without a data store.
		*/
		function latestStreamSource(timeline) {
			const turn = timeline?.turnOrder.at(-1);
			const location = turn === void 0 ? void 0 : timeline?.turns.get(turn);
			return typeof location?.data?.source === "function" ? location.data.source(STREAM_KEY) : void 0;
		}
		/** Dock body on hosts with the Conversation registry (dsh 0.1.2+). */
		function TurnStream({ useChat }) {
			const source = useChat((snapshot) => latestStreamSource(snapshot?.timeline)) ?? NO_SOURCE;
			const stream = (0, react.useSyncExternalStore)(source.subscribe, source.getSnapshot);
			if (stream === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Preview, { argsRaw: stream.argsRaw }, stream.callId);
		}
		/**
		* Dock entry: mounts the preview exactly while a `visualize` call streams.
		*/
		function StreamingPreview({ session, useChat }) {
			if (typeof useChat === "function") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TurnStream, { useChat });
			const blocks = session?.partial?.blocks;
			if (blocks === void 0) return null;
			let argsRaw;
			for (const block of blocks) if (block.kind === "tool-call" && block.name === "visualize") argsRaw = block.argsRaw;
			if (argsRaw === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Preview, { argsRaw });
		}
		//#endregion
		//#region src/client/folding.ts
		/** Settings namespace owned by the host Chat target. */
		const CHAT_NAMESPACE = "ui-chat";
		/**
		* Whether a saved mode folds on a 0.1.7+ host. An unset value is the host's
		* `standard` default.
		* @param view - saved `transcriptView`.
		* @returns true unless the reader chose `verbose`.
		*/
		function configFormsFolds(view) {
			return view !== "verbose";
		}
		/**
		* Whether a saved mode folds on a 0.1.2–0.1.6 host. An unset value is the
		* host's `compact` default.
		* @param view - saved `transcriptView`.
		* @returns true for `compact` or unset.
		*/
		function settingsScopeFolds(view) {
			return view === void 0 || view === "compact";
		}
		/**
		* Adapt a settings face into a boolean observable.
		* @param face - the host namespace binding.
		* @param folds - the generation's mode rule.
		* @returns an observable whose snapshot is a primitive, so it is stable.
		*/
		function observe(face, folds) {
			return {
				getSnapshot: () => folds(face.getSnapshot().value?.transcriptView),
				subscribe: (listener) => {
					const dispose = face.subscribe(listener);
					return typeof dispose === "function" ? dispose : () => void 0;
				}
			};
		}
		/**
		* Narrow an unknown value to an object exposing a method.
		* @param value - candidate service.
		* @param method - required method name.
		* @returns the value when it carries the method.
		*/
		function hasMethod(value, method) {
			return typeof value === "object" && value !== null && typeof value[method] === "function";
		}
		/**
		* Resolve the folding observable for this host. Call it once the Chat target
		* is up (its turn-tail declaration is the signal), when both settings
		* services, where present, are already provided.
		* @param host - the client context, read through optional `get`.
		* @returns whether finished turns currently fold, observed live.
		*/
		function foldingSource(host) {
			const forms = host.get("configForms");
			if (hasMethod(forms, "get")) return observe(forms.get(CHAT_NAMESPACE), configFormsFolds);
			const scope = host.get("settingsScope");
			if (hasMethod(scope, "bind")) return observe(scope.bind({ namespace: CHAT_NAMESPACE }), settingsScopeFolds);
			return {
				getSnapshot: () => false,
				subscribe: () => () => void 0
			};
		}
		//#endregion
		//#region src/client/TurnCards.tsx
		/** Definition kind and Turn data key; namespaced by package to stay unique. */
		const TURN_CARDS_KEY = "dsh-visualize";
		/**
		* Accept a successful root `visualize` result. The persisted meta names its
		* own kind, so no call-to-name bookkeeping is needed.
		* @param data - `tool/result` payload.
		* @returns the card descriptor, or undefined when unrelated or failed.
		*/
		function resultMeta(data) {
			return data.message.isError === true ? void 0 : visualizeMetaFrom(data.meta);
		}
		/**
		* Fold one result into the turn's cards. A repeated call id (a later surface
		* replacement of the same result) keeps the first; a later card at an existing
		* path (an `update` patch) replaces that card in place, so a corrected card is
		* shown once, in its original position.
		* @param cards - cards so far.
		* @param card - the incoming card.
		* @returns the next card list, or the same list when unchanged.
		*/
		function foldCard(cards, card) {
			if (cards.some((existing) => existing.callId === card.callId)) return cards;
			const index = cards.findIndex((existing) => existing.meta.path === card.meta.path);
			if (index === -1) return [...cards, card];
			return cards.map((existing, at) => at === index ? card : existing);
		}
		/** Turn-local visualize accumulator; it publishes Turn data and no view Node. */
		const turnCardsDefinition = {
			kind: TURN_CARDS_KEY,
			match: (event) => {
				if (event.type === "turn/start") return {
					id: String(event.data.turn),
					role: "start"
				};
				if (event.type !== "tool/result") return null;
				const data = event.data;
				return resultMeta(data) === void 0 ? null : {
					id: String(data.turn),
					role: "update"
				};
			},
			start: (_context, match) => {
				if (match.event.type !== "turn/start") throw new Error("dsh-visualize: turn cards start requires turn/start");
				return {
					turn: match.event.data.turn,
					cards: []
				};
			},
			update: (context, match) => {
				if (match.event.type !== "tool/result") return context.state;
				const data = match.event.data;
				const meta = resultMeta(data);
				if (meta === void 0) return context.state;
				const cards = foldCard(context.state.cards, {
					callId: String(data.message.source.callId),
					seq: match.event.seq,
					meta
				});
				return cards === context.state.cards ? context.state : {
					...context.state,
					cards
				};
			},
			buildLocationData: (context, scope, previous) => {
				if (scope !== "turn" || context.state === void 0) return null;
				const { turn, cards } = context.state;
				if (previous?.kind === "turn" && previous.turn === turn && previous.key === "dsh-visualize" && previous.value.cards === cards) return previous;
				return {
					kind: "turn",
					turn,
					key: TURN_CARDS_KEY,
					value: { cards }
				};
			}
		};
		/**
		* The cards settled before the turn's closing reply.
		* @param turn - the closing turn; older hosts may omit its data store.
		* @param seq - the closing assistant message's sequence number.
		* @returns the cards to show, possibly empty.
		*/
		function cardsBefore(turn, seq) {
			return (turn?.data?.get("dsh-visualize")?.cards ?? []).filter((card) => card.seq < seq);
		}
		/**
		* Chain selector for dsh 0.1.5 and earlier, whose turn tail elects one entry.
		* @param owner - the turn-tail owner currency.
		* @returns the cards as the match, or null to decline this turn.
		*/
		function selectTurnCards(owner) {
			const cards = cardsBefore(owner.turn, owner.seq);
			return cards.length === 0 ? null : cards;
		}
		/** A grid track sized `minmax(0, 1fr)`: an `auto` track would grow to a card's min-content. */
		const listStyle = {
			display: "grid",
			gridTemplateColumns: "minmax(0, 1fr)",
			gap: 12,
			margin: "8px 0 4px",
			minWidth: 0
		};
		/**
		* Turn-tail entry. A list turn tail mounts it on every turn, so it declines
		* turns without cards itself, and it stays empty whenever the host is not
		* folding — the toolview card is then already in view.
		* @param props - turn owner props plus the injected folding selector.
		* @returns the turn's cards, or null.
		*/
		function TurnCards({ turn, seq, useVisualizeFolds }) {
			const folds = useVisualizeFolds((value) => value);
			const cards = cardsBefore(turn, seq);
			if (!folds || cards.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: listStyle,
				children: cards.map((card) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Frame, {
					meta: card.meta,
					callId: `turn-tail:${card.callId}`
				}, card.callId))
			});
		}
		//#endregion
		//#region src/client/index.tsx
		const name = "dsh-visualize";
		const inject = ["slots"];
		/**
		* Look up the Conversation event registry without declaring the service, so
		* hosts that predate it still load the plugin.
		* @param host - client context.
		* @returns the registry, or undefined on dsh 0.1.1.
		*/
		function conversationEvents(host) {
			const service = host.get("uiConversation");
			return typeof service?.events?.register === "function" ? service.events : void 0;
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
		function turnTailOptions(host) {
			const folds = foldingSource(host);
			return {
				name: "conversation.chat.turnTail",
				id: "dsh-visualize-cards",
				order: 100,
				priority: 100,
				select: selectTurnCards,
				inject: () => ({ hooks: { visualizeFolds: folds } })
			};
		}
		/**
		* Register the keyed toolview, the dock preview with its stream Definition,
		* and the turn-tail cards. Waiting on each hole's declaration mirrors the
		* official registrants: entry application order is loader-driven, and a
		* direct register racing the declaration fails boot.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "visualize"
			}, VisualizeCard));
			ctx.inject(["uiConversation"], (scope) => {
				conversationEvents(scope)?.register(streamDefinition);
			});
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "visualize-stream",
				order: 30
			}, StreamingPreview));
			ctx.slots.inject("conversation.chat.turnTail", () => {
				const events = conversationEvents(ctx);
				if (events === void 0) return () => void 0;
				const disposeDefinition = events.register(turnCardsDefinition);
				const disposeTail = ctx.slots.register(turnTailOptions(ctx), TurnCards);
				return () => {
					disposeTail();
					disposeDefinition();
				};
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
