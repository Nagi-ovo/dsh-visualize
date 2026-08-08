window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-visualize",
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
				if (next === void 0) return out;
				if (next === "u") {
					const hex = argsRaw.slice(i + 2, i + 6);
					if (hex.length < 4) return out;
					const code = Number.parseInt(hex, 16);
					if (Number.isNaN(code)) return out;
					out += String.fromCharCode(code);
					i += 5;
					continue;
				}
				const short = JSON_ESCAPES[next];
				if (short === void 0) return out;
				out += short;
				i += 1;
			}
			return out;
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
		* @module @dsh-external/dsh-visualize/frame-css
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
  --viz-series-2: light-dark(rgb(226 116 26), rgb(245 152 66));
  --viz-series-3: light-dark(rgb(16 148 82), rgb(72 196 130));
  --viz-series-4: light-dark(rgb(146 94 220), rgb(176 132 240));
  --viz-series-5: light-dark(rgb(212 66 84), rgb(240 110 126));
  --viz-series-6: light-dark(rgb(160 138 22), rgb(206 182 70));
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
<title>${escapeHtml(options.title)}</title>
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
		function escapeHtml(text) {
			return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: headerStyle,
				title: meta.path,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: { fontWeight: 500 },
					children: meta.title
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						overflow: "hidden",
						textOverflow: "ellipsis"
					},
					children: meta.path
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
				sandbox: "allow-scripts",
				referrerPolicy: "no-referrer",
				title: meta.title,
				srcDoc: doc,
				style: {
					...frameStyle$1,
					height
				}
			})] });
		}
		/**
		* Keyed toolview for the `visualize` tool. Running calls and malformed or
		* failed results stay quiet single lines; only a well-formed persisted meta
		* mounts the frame.
		*/
		function VisualizeCard({ callId, block }) {
			if (!("kind" in block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: headerStyle,
				children: "Visualize · rendering…"
			});
			if (block.isError) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: headerStyle,
				children: ["Visualize · ", firstResultLine(block.content)]
			});
			const meta = visualizeMetaFrom(block.meta);
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
		* generating a `visualize` call, the accumulated argument stream
		* (`assistant/chunk` tool-call deltas folded into the conversation snapshot's
		* `partial`) is parsed for the fragment prefix and rendered into the same
		* sandboxed frame the settled card uses — markup and style only, scripts
		* neutered until the call settles (a half-streamed script body is almost
		* never valid JavaScript). Renders nothing when no `visualize` call is
		* streaming; once the call settles the preview unmounts and the transcript
		* card takes over.
		*/
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
		/**
		* Dock entry: mounts the preview exactly while the streaming partial carries
		* a `visualize` tool-call block.
		*/
		function StreamingPreview({ session }) {
			const blocks = session?.partial?.blocks;
			if (blocks === void 0) return null;
			let argsRaw;
			for (const block of blocks) if (block.kind === "tool-call" && block.name === "visualize") argsRaw = block.argsRaw;
			if (argsRaw === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Preview, { argsRaw });
		}
		//#endregion
		//#region src/client/index.tsx
		const name = "dsh-visualize";
		const inject = ["slots"];
		/**
		* Register the keyed toolview and the dock preview. Waiting on each hole's
		* declaration mirrors the official registrants: entry application order is
		* loader-driven, and a direct register racing the declaration fails boot.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "visualize"
			}, VisualizeCard));
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "visualize-stream",
				order: 30
			}, StreamingPreview));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
