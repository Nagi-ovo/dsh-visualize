window.__ModuleLoader__.load({
	id: "@nagi-ovo/dsh-visualize",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		* Narrow a persisted or configured value to a style id. Wire data may come
		* from an older card (no style) or a newer build (an id this one lacks); both
		* render in the default rather than declining the card.
		* @param value - the raw value.
		* @returns a known style id.
		*/
		function styleIdFrom(value) {
			return typeof value === "string" && STYLE_IDS.includes(value) ? value : DEFAULT_STYLE;
		}
		/**
		* Narrow one wire value to a {@link VisualizeMode}.
		* @param value - the raw value.
		* @returns whether it names a known mode.
		*/
		function isVisualizeMode(value) {
			return value === "inline" || value === "wide" || value === "page";
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
				style: styleIdFrom(record["style"])
			};
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
				return descriptorFromFields(complete["fragment"], complete["title"], complete["mode"], complete["path"], complete["summary"]);
			}
			const closed = scanFragment(argsRaw, true);
			if (closed === void 0) return void 0;
			return descriptorFromFields(closed, void 0, streamedMode(argsRaw), void 0, void 0);
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
		function descriptorFromFields(fragment, title, mode, path, summary) {
			if (typeof fragment !== "string") return void 0;
			if (mode !== void 0 && !isVisualizeMode(mode)) return void 0;
			const markup = trimStreamingScripts(fragment);
			if (markup.trim().length === 0) return void 0;
			return {
				kind: "visualize",
				fragment: markup,
				title: typeof title === "string" && title.trim().length > 0 ? title.trim() : "Visualization",
				mode: mode ?? "inline",
				path: typeof path === "string" ? path : "",
				...summaryField(summary),
				style: DEFAULT_STYLE
			};
		}
		/**
		* The `mode` of a still-open argument stream, when its string value has
		* already closed. A settled-card fallback that mounts before the JSON ends
		* must not render a page fragment inline just because the object is open.
		* @param argsRaw - accumulated argument text.
		* @returns the streamed mode, or undefined when absent, open, or unknown.
		*/
		function streamedMode(argsRaw) {
			const match = /"mode"\s*:\s*"([a-z]+)"/u.exec(argsRaw);
			return match !== null && isVisualizeMode(match[1]) ? match[1] : void 0;
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
		* keep the frame legible in both appearances via `light-dark()`. A card
		* style (style.ts) injects its own `--dsh-viz-*` values over the host ones;
		* the defaults here are the `whale` style. `--viz-grid-axes` (`value`,
		* `both`, `none`), `--viz-grid-dash` and `--viz-line-width` carry no CSS
		* meaning of their own: `dshViz.chartDefaults` reads them for Chart.js.
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
  --card-foreground: var(--dsh-viz-card-foreground, var(--foreground));
  --muted-foreground: var(--dsh-viz-muted-foreground, light-dark(rgb(26 28 31 / 55%), rgb(240 242 245 / 55%)));
  --border: var(--dsh-viz-border, light-dark(rgb(0 0 0 / 10%), rgb(255 255 255 / 12%)));
  --primary: var(--dsh-viz-primary, light-dark(rgb(65 118 230), rgb(110 150 240)));
  --primary-foreground: var(--dsh-viz-primary-foreground, light-dark(rgb(255 255 255), rgb(13 13 13)));
  --viz-series-1: var(--dsh-viz-series-1, var(--primary));
  --viz-series-2: var(--dsh-viz-series-2, light-dark(rgb(225 105 16), rgb(236 142 59)));
  --viz-series-3: var(--dsh-viz-series-3, light-dark(rgb(2 155 100), rgb(72 196 130)));
  --viz-series-4: var(--dsh-viz-series-4, light-dark(rgb(147 89 185), rgb(183 145 226)));
  --viz-series-5: var(--dsh-viz-series-5, light-dark(rgb(214 63 76), rgb(233 108 122)));
  --viz-series-6: var(--dsh-viz-series-6, light-dark(rgb(154 139 45), rgb(206 182 70)));
  --viz-context: var(--dsh-viz-context, var(--muted-foreground));
  --viz-grid: var(--dsh-viz-grid, var(--border));
  --viz-grid-axes: var(--dsh-viz-grid-axes, value);
  --viz-grid-dash: var(--dsh-viz-grid-dash, 0);
  --viz-axis: var(--dsh-viz-axis, var(--border));
  --viz-line-width: var(--dsh-viz-line-width, 2);
  --font-sans: var(--dsh-viz-font-sans, system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif);
  --font-display: var(--dsh-viz-font-display, var(--font-sans));
  --font-mono: var(--dsh-viz-font-mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace);
  --radius: var(--dsh-viz-radius, 8px);
  --font-size-base: var(--dsh-viz-font-size-base, 14px);
  --font-size-small: var(--dsh-viz-font-size-small, max(11px, calc(var(--font-size-base) - 2px)));
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--background);
  color: var(--foreground);
  font: 400 var(--font-size-base)/1.5 var(--font-sans);
}
h1, h2, h3 { margin: 0 0 0.5em; font-family: var(--font-display); font-weight: 500; line-height: 1.3; }
h1 { font-size: 1.3em; }
h2 { font-size: 1.15em; }
h3 { font-size: 1em; }
p { margin: 0 0 0.75em; }
a { color: var(--primary); }
code, kbd, samp, pre { font-family: var(--font-mono); }
svg text { fill: var(--foreground); font-size: var(--font-size-small); }
.text-small { font-size: var(--font-size-small); color: var(--muted-foreground); }

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
.viz-stat > :first-child { font-size: var(--font-size-small); color: var(--muted-foreground); }
.viz-stat-value { font-size: 1.4em; font-weight: 500; line-height: 1.2; }
.viz-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--primary) 14%, transparent);
  color: var(--primary);
  font-size: var(--font-size-small);
}

.form-label { display: block; font-size: var(--font-size-small); color: var(--muted-foreground); margin-bottom: 4px; }
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
th { font-weight: 500; color: var(--muted-foreground); font-size: var(--font-size-small); }
.table-responsive { overflow-x: auto; }
`;
		/**
		* Additions for a `page` frame: a full browser tab rather than a card in the
		* chat column. The surface turns opaque (a sticky header must cover what
		* scrolls under it), the body drops the card inset so a header can run
		* edge to edge, and a few layout classes cover the page skeleton the skill
		* teaches: a sticky header, a centred content container, sections, tabs.
		*/
		const PAGE_CSS = `
:root { --background: var(--dsh-viz-page, light-dark(rgb(255 255 255), rgb(24 24 27))); }
html { background: var(--background); }
body { min-height: 100vh; }
.viz-page { max-width: 1440px; margin: 0 auto; padding: 24px clamp(16px, 3vw, 40px) 48px; }
.viz-page-narrow { max-width: 960px; }
.viz-page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 12px clamp(16px, 3vw, 40px);
  background: var(--background);
  border-bottom: 1px solid var(--border);
}
.viz-page-header h1 { margin: 0; font-size: 1.25em; }
.viz-page-header .viz-controls { margin: 0 0 0 auto; }
.viz-section { margin-top: 32px; }
.viz-section:first-child { margin-top: 0; }
.viz-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
.viz-tab {
  appearance: none;
  padding: 8px 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  cursor: pointer;
}
.viz-tab:hover { color: var(--foreground); }
.viz-tab[aria-selected='true'] { color: var(--foreground); border-bottom-color: var(--primary); font-weight: 500; }
@media (max-width: 768px) {
  .viz-page-header .viz-controls { margin-left: 0; width: 100%; }
}
`;
		//#endregion
		//#region src/viz-helper.ts
		/**
		* The helper's inline script body for one card style.
		* @param style - the card's style id, exposed as `dshViz.style`.
		* @param chart - the style's Chart.js knobs beyond its CSS tokens.
		* @returns the script body.
		*/
		function vizHelperScript(style, chart) {
			return `
(function () {
  var STYLE = ${JSON.stringify(style)};
  var CHART = ${JSON.stringify(chart)};
  var GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|emoji|math)$/;
  var paint = null;
  function host(root) { return root || document.body || document.documentElement; }
  function probe(root, prop, value) {
    var span = document.createElement('span');
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.setProperty(prop, value);
    host(root).appendChild(span);
    var out = getComputedStyle(span).getPropertyValue(prop);
    span.remove();
    return out;
  }
  // A light-dark() nested inside another function (color-mix) survives into
  // the computed value, and canvas has no colour scheme to resolve it with:
  // pick the branch for the frame's scheme here.
  function pickScheme(css) {
    var dark = /dark/.test(getComputedStyle(document.documentElement).colorScheme);
    for (var at = css.indexOf('light-dark('); at !== -1; at = css.indexOf('light-dark(')) {
      var depth = 0, comma = -1, i = at + 11;
      for (; i < css.length; i++) {
        var ch = css.charAt(i);
        if (ch === '(') depth++;
        else if (ch === ')') { if (depth === 0) break; depth--; }
        else if (ch === ',' && depth === 0 && comma === -1) comma = i;
      }
      if (comma === -1 || i >= css.length) break;
      css = css.slice(0, at) + (dark ? css.slice(comma + 1, i) : css.slice(at + 11, comma)).trim() + css.slice(i + 1);
    }
    return css;
  }
  // Any CSS colour (light-dark, color-mix, hex) normalised through canvas.
  function rgba(css) {
    paint = paint || document.createElement('canvas').getContext('2d');
    paint.fillStyle = '#000';
    paint.fillStyle = pickScheme(css);
    var s = String(paint.fillStyle);
    if (s.charAt(0) === '#') {
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
    }
    var m = s.match(/[\\d.]+/g) || ['0', '0', '0'];
    // color-mix() and friends serialise as color(srgb r g b / a) with 0–1 channels.
    var k = /^color\\(srgb /.test(s) ? 255 : /^rgba?\\(/.test(s) ? 1 : 0;
    if (k === 0) return null;
    return [Math.round(Number(m[0]) * k), Math.round(Number(m[1]) * k), Math.round(Number(m[2]) * k), m.length > 3 ? Number(m[3]) : 1];
  }
  function alpha(css, a) {
    var c = rgba(css);
    if (c === null) return pickScheme(css);
    return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + Number((c[3] * (a === undefined ? 1 : a)).toFixed(3)) + ')';
  }
  function color(token, a, root) { return alpha(probe(root, 'color', 'var(' + token + ')'), a); }
  function raw(token, root) { return getComputedStyle(host(root)).getPropertyValue(token).trim(); }
  function smallSize(root) { return Math.max(11, parseFloat(probe(root, 'font-size', 'var(--font-size-small)')) || 12); }
  function family(root) { return getComputedStyle(host(root)).fontFamily; }
  function isValueAxis(scale) {
    var options = scale && scale.chart && scale.chart.options;
    return scale.axis !== ((options && options.indexAxis) || 'x');
  }
  function chartDefaults(Chart, root) {
    var d = Chart.defaults;
    var axes = raw('--viz-grid-axes', root) || 'value';
    var dash = (raw('--viz-grid-dash', root) || '0').split(/[\\s,]+/).map(Number).filter(function (n) { return n > 0; });
    var theme = {
      style: STYLE,
      fontFamily: family(root),
      fontSize: smallSize(root),
      foreground: color('--foreground', 1, root),
      muted: color('--muted-foreground', 1, root),
      primary: color('--primary', 1, root),
      context: color('--viz-context', 1, root),
      grid: color('--viz-grid', 1, root),
      axis: color('--viz-axis', 1, root),
      lineWidth: Number(raw('--viz-line-width', root)) || 2,
      series: [1, 2, 3, 4, 5, 6].map(function (i) { return color('--viz-series-' + i, 1, root); }),
      alpha: alpha,
    };
    d.font.family = theme.fontFamily;
    d.font.size = theme.fontSize;
    d.color = theme.muted;
    d.borderColor = theme.grid;
    var scale = d.scale;
    scale.grid.color = theme.grid;
    scale.border.color = theme.axis;
    // Chart.js 4 dashes gridlines through border.dash (the axis line too).
    scale.border.dash = dash;
    if (CHART.axisWidth) scale.border.width = CHART.axisWidth;
    if (axes === 'none') {
      // L-shaped axes with short outward ticks, no gridlines.
      scale.grid.drawOnChartArea = false;
      scale.grid.tickLength = 4;
      scale.grid.color = theme.axis;
    } else if (axes !== 'both') {
      scale.grid.display = function (ctx) { return isValueAxis(ctx.scale); };
    }
    if (CHART.valueAxisLine === false) {
      scale.border.display = function (ctx) { return !isValueAxis(ctx.scale); };
    }
    var line = d.elements.line, point = d.elements.point;
    line.borderWidth = theme.lineWidth;
    if (CHART.tension !== undefined) line.tension = CHART.tension;
    if (CHART.pointRadius !== undefined) point.radius = CHART.pointRadius;
    if (CHART.pointStyles) {
      point.pointStyle = function (ctx) { return CHART.pointStyles[ctx.datasetIndex % CHART.pointStyles.length]; };
      d.plugins.legend.labels.usePointStyle = true;
    }
    if (CHART.dashes) {
      line.borderDash = function (ctx) { return CHART.dashes[ctx.datasetIndex % CHART.dashes.length]; };
    }
    return theme;
  }
  function fontsReady(text, root) {
    var fonts = document.fonts;
    if (!fonts || typeof fonts.load !== 'function') return Promise.resolve();
    var size = smallSize(root);
    var sample = (text || '') + ' ' + ((document.body && document.body.textContent) || '').slice(0, 600) + ' 0123456789';
    var names = family(root).split(',').map(function (n) { return n.trim(); })
      .filter(function (n) { return n.length > 0 && !GENERIC.test(n); }).slice(0, 3);
    var loads = names.map(function (n) {
      return fonts.load('400 ' + size + 'px ' + n, sample).catch(function () {});
    });
    var settled = Promise.all(loads).then(function () { return fonts.ready; });
    return Promise.race([settled, new Promise(function (done) { setTimeout(done, 2500); })]);
  }
  window.dshViz = { style: STYLE, color: color, chartDefaults: chartDefaults, fontsReady: fontsReady };
})();
`;
		}
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
		* @param options - fragment, title, bridged palette, report token, surface variant, and card style.
		* @returns the HTML document string for the iframe's `srcDoc`.
		*/
		function buildFrameDoc(options) {
			const style = STYLES[options.style ?? "whale"] ?? STYLES["whale"];
			const rootVars = Object.entries({
				...options.themeVars,
				...style.vars
			}).map(([name, value]) => [name, sanitizeCssValue(value)]).filter(([, value]) => value.length > 0).map(([name, value]) => `--dsh-viz-${name}: ${value};`).join(" ");
			return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
<title>${escapeHtml$1(options.title)}</title>
${style.fontHref === void 0 ? "" : `<link rel="stylesheet" href="${escapeHtml$1(style.fontHref)}">\n`}<style>${FRAME_CSS}${options.variant === "page" ? PAGE_CSS : ""}
:root { ${rootVars} color-scheme: ${options.colorScheme}; }
${options.variant === "page" ? "" : "body { padding: 4px 2px; }"}${style.extraCss === void 0 ? "" : `\n${style.extraCss}`}</style>
<script>${vizHelperScript(style.id, style.chart)}<\/script>
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
			const inset = options.variant === "page" ? "0" : "16px 24px";
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
iframe { display: block; box-sizing: border-box; width: 100%; height: 100%; border: 0; padding: ${inset}; background: transparent; }
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
			["page", "--dsw-alias-bg-base"],
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
		//#region src/client/style.ts
		/**
		* The style a card that has no persisted meta yet renders in: the dock
		* preview and a running call's live frame. The node half writes the
		* configured style into every page it serves (index.ts), which is the answer
		* from dsh 0.1.1 on. Where that value is missing — a host page that does not
		* run the plugin's node half, or a static build — the card borrows the style
		* of the most recently settled card created on this page, which the next card
		* will almost always share. The settled card re-renders in its own style
		* either way.
		*/
		let lastCreated = DEFAULT_STYLE;
		/**
		* Note the style of a settled card. Only a create speaks for the setting: an
		* update keeps the style its card was created with, however old.
		* @param style - that card's style.
		* @param argsRaw - the call's raw arguments, for its action.
		*/
		function noteSettledStyle(style, argsRaw) {
			if (argsRaw !== void 0 && /"action"\s*:\s*"update"/u.test(argsRaw)) return;
			lastCreated = style;
		}
		/**
		* The style a card whose meta has not arrived yet renders in.
		* @returns the configured style from the page, else the last created card's.
		*/
		function liveStyle() {
			return configuredStyle() ?? lastCreated;
		}
		/** The configured style the node half put on this page, when it is a known id. */
		function configuredStyle() {
			const style = globalThis[PAGE_CONFIG_GLOBAL]?.style;
			return typeof style === "string" && STYLE_IDS.includes(style) ? style : void 0;
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
		*
		* Page mode: a `page` card is built for a whole browser tab, so the chat shows
		* a launcher instead — title, summary, a live but inert thumbnail of the page
		* laid out at desktop width and scaled into the card, and a button that opens
		* the page through the same script-free wrapper. A secondary toggle shows the
		* page in the conversation, for browsers or hosts that will not open a tab.
		*/
		/** Iframe height bounds; content beyond the cap scrolls inside the frame. */
		const MIN_HEIGHT = 48;
		const HEIGHT_CAP = {
			inline: 800,
			wide: 1200,
			page: 800
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
			const variant = variantOf(meta);
			const frameDoc = buildFrameDoc({
				fragment: meta.fragment,
				title: meta.title,
				themeVars,
				colorScheme,
				style: meta.style,
				reportToken: `window:${callId}`,
				variant
			});
			const background = (variant === "page" ? themeVars.page : themeVars.card) ?? "";
			const page = buildWindowDoc({
				frameDoc,
				title: meta.title,
				colorScheme,
				background,
				variant
			});
			const url = URL.createObjectURL(new Blob([page], { type: "text/html" }));
			window.open(url, "_blank", "noopener");
		}
		/**
		* Whether this browser can open a card in its own tab: an embedding host may
		* strip `window.open` or Blob URLs, and a page card then renders in place.
		* @returns true when both are available.
		*/
		function canOpenWindow() {
			return typeof window.open === "function" && typeof URL.createObjectURL === "function";
		}
		/** The frame variant a card's mode lays its document out for. */
		function variantOf(meta) {
			return meta.mode === "page" ? "page" : "card";
		}
		/** Whether the host UI is in Chinese; the plugin ships no locale catalogue. */
		function hostIsZh() {
			return document.documentElement.lang.toLowerCase().startsWith("zh");
		}
		/** Accessible name of the open control, in the host's language. */
		function openLabel() {
			return hostIsZh() ? "在新窗口打开" : "Open in new window";
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
		/**
		* Re-render trigger for host theme switches: bumped whenever the host flips
		* appearance, so each frame document re-resolves the bridged palette.
		* @returns a counter that changes on every theme change.
		*/
		function useThemeTick() {
			const [themeTick, setThemeTick] = (0, react.useState)(0);
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
			return themeTick;
		}
		/**
		* The frame document for one card, rebuilt on theme changes.
		* @param meta - the card.
		* @param reportToken - height-report correlation token.
		* @param variant - surface the document lays out for.
		* @returns the srcdoc string.
		*/
		function useFrameDoc(meta, reportToken, variant) {
			const themeTick = useThemeTick();
			return (0, react.useMemo)(() => {
				const { themeVars, colorScheme } = resolveTheme();
				return buildFrameDoc({
					fragment: meta.fragment,
					title: meta.title,
					themeVars,
					colorScheme,
					reportToken,
					variant,
					style: meta.style
				});
			}, [
				meta,
				reportToken,
				variant,
				themeTick
			]);
		}
		/** The sandboxed frame, sized to its content's reported height up to the mode's cap. */
		function SizedFrame({ meta, callId }) {
			const [height, setHeight] = (0, react.useState)(MIN_HEIGHT);
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
			const doc = useFrameDoc(meta, callId, variantOf(meta));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
				sandbox: FRAME_SANDBOX,
				referrerPolicy: "no-referrer",
				title: meta.title,
				srcDoc: doc,
				style: {
					...frameStyle$1,
					height
				}
			});
		}
		/**
		* The settled, well-formed card: header line plus the sandboxed frame, or a
		* page card's launcher. Every surface that shows a card — the toolview, the
		* turn tail, replay — goes through here, so a page card is a launcher in all
		* of them.
		*/
		function Frame({ meta, callId }) {
			if (meta.mode === "page") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageLauncher, {
				meta,
				callId
			});
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
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SizedFrame, {
					meta,
					callId
				})]
			});
		}
		/**
		* Thumbnail geometry: the page lays out in a desktop viewport and the frame
		* is scaled down to the launcher's width, then clipped to a fixed height, so
		* the reader sees the top of the real page rather than a reflowed narrow one.
		*/
		const THUMB_VIEWPORT_WIDTH = 1280;
		const THUMB_VIEWPORT_HEIGHT = 800;
		const THUMB_HEIGHT = 220;
		const hostBorder = "1px solid var(--dsw-alias-border-l2, rgb(127 127 127 / 25%))";
		const launcherStyle = {
			minWidth: 0,
			maxWidth: "100%",
			border: hostBorder,
			borderRadius: 10,
			overflow: "hidden"
		};
		const thumbStyle = {
			position: "relative",
			height: THUMB_HEIGHT,
			overflow: "hidden",
			cursor: "pointer",
			background: "var(--dsw-alias-bg-base, transparent)",
			borderBottom: hostBorder
		};
		const launcherBarStyle = {
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			gap: "8px 12px",
			padding: "10px 12px"
		};
		const launcherTextStyle = {
			flex: "1 1 220px",
			minWidth: 0
		};
		const oneLine = {
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		const launcherTitleStyle = {
			...oneLine,
			fontSize: 14,
			fontWeight: 500,
			lineHeight: 1.4
		};
		const launcherSummaryStyle = {
			...oneLine,
			fontSize: 12,
			lineHeight: 1.5,
			opacity: .65
		};
		const actionsStyle = {
			display: "flex",
			gap: 8,
			flexShrink: 0,
			marginLeft: "auto"
		};
		const buttonBase = {
			display: "inline-flex",
			alignItems: "center",
			gap: 6,
			height: 30,
			padding: "0 12px",
			borderRadius: 8,
			font: "inherit",
			fontSize: 13,
			cursor: "pointer",
			whiteSpace: "nowrap"
		};
		const primaryButtonStyle = {
			...buttonBase,
			border: "1px solid transparent",
			background: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, rgb(65 118 230))",
			color: "var(--dsw-alias-label-primary-inverted, rgb(255 255 255))",
			fontWeight: 500
		};
		const ghostButtonStyle = {
			...buttonBase,
			border: hostBorder,
			background: "transparent",
			color: "inherit"
		};
		/** Launcher strings, in the host's language. */
		function launcherLabels() {
			return hostIsZh() ? {
				open: "打开页面",
				show: "在对话中展开",
				hide: "收起",
				kind: "独立页面"
			} : {
				open: "Open page",
				show: "Show here",
				hide: "Collapse",
				kind: "Standalone page"
			};
		}
		/**
		* The live, inert thumbnail of a page: the same sandboxed page document, laid
		* out at desktop width and scaled into the launcher. Pointer events and focus
		* stay out of the frame, so it never takes a click, a scroll, or a tab stop;
		* a click on the thumbnail opens the page like the button does.
		*/
		function PageThumbnail({ meta, callId, onOpen }) {
			const wrapRef = (0, react.useRef)(null);
			const [width, setWidth] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const wrap = wrapRef.current;
				if (wrap === null) return;
				const measure = () => setWidth(wrap.clientWidth);
				measure();
				if (typeof ResizeObserver !== "function") return;
				const observer = new ResizeObserver(measure);
				observer.observe(wrap);
				return () => observer.disconnect();
			}, []);
			const doc = useFrameDoc(meta, `thumb:${callId}`, "page");
			const scale = width > 0 ? width / THUMB_VIEWPORT_WIDTH : .5;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: wrapRef,
				style: thumbStyle,
				"aria-hidden": "true",
				onClick: onOpen,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					sandbox: FRAME_SANDBOX,
					referrerPolicy: "no-referrer",
					title: meta.title,
					srcDoc: doc,
					tabIndex: -1,
					style: {
						display: "block",
						position: "absolute",
						top: 0,
						left: 0,
						width: THUMB_VIEWPORT_WIDTH,
						height: THUMB_VIEWPORT_HEIGHT,
						border: 0,
						transform: `scale(${scale})`,
						transformOrigin: "0 0",
						pointerEvents: "none",
						colorScheme: "normal"
					}
				})
			});
		}
		/**
		* A page card in the conversation: not the page itself, which is built for a
		* whole tab, but a launcher for it. Opening is always the reader's click — a
		* tab opened without a user gesture is a blocked popup. Where no tab can be
		* opened at all, the page renders in place as a regular card.
		*/
		function PageLauncher({ meta, callId }) {
			const opens = canOpenWindow();
			const [expanded, setExpanded] = (0, react.useState)(!opens);
			const labels = launcherLabels();
			const open = opens ? () => openInWindow(meta, callId) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: launcherStyle,
				"data-visualize-launcher": "",
				children: [expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SizedFrame, {
					meta,
					callId
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageThumbnail, {
					meta,
					callId,
					onOpen: open
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: launcherBarStyle,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: launcherTextStyle,
						title: meta.path === "" ? meta.title : meta.path,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: launcherTitleStyle,
							children: meta.title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: launcherSummaryStyle,
							children: meta.summary ?? labels.kind
						})]
					}), open !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: actionsStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: ghostButtonStyle,
							"aria-expanded": expanded,
							onClick: () => setExpanded((on) => !on),
							children: expanded ? labels.hide : labels.show
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							style: primaryButtonStyle,
							onClick: open,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenIcon, {}), labels.open]
						})]
					})]
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
					meta: {
						...live,
						style: liveStyle()
					},
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
			const persisted = visualizeMetaFrom(block.meta);
			if (persisted !== void 0) noteSettledStyle(persisted.style, argsRaw);
			const fromArgs = persisted === void 0 ? visualizeMetaFromArgs(argsRaw) : void 0;
			const meta = persisted ?? (fromArgs === void 0 ? void 0 : {
				...fromArgs,
				style: liveStyle()
			});
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
				reportToken: "streaming-preview",
				style: liveStyle()
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
