/**
 * The frame-side `dshViz` helper, installed in the frame `<head>` so it
 * exists before any fragment script runs. It hands canvas charts what canvas
 * cannot read from CSS: resolved colours, the computed font family at the
 * small-text size, and the active card style's grid, axis and line choices.
 *
 * - `dshViz.chartDefaults(Chart, root?)` writes Chart.js 4 defaults from the
 *   theme tokens (read on `root`, so a fragment's own token overrides there
 *   reach the chart) and returns the resolved theme: `series[0..5]`,
 *   `context`, `grid`, `axis`, `foreground`, `muted`, `primary`,
 *   `fontFamily`, `fontSize`, `lineWidth`, plus `alpha(color, a)`.
 * - `dshViz.fontsReady(text?, root?)` resolves once the card's text faces
 *   (the unicode-range slices `text` needs included) have loaded, or after
 *   2.5s; Chart.js measures labels once, so create charts after it.
 * - `dshViz.color(token, alpha?, root?)` resolves one colour token.
 * - `dshViz.prompt(text)` asks the card to put `text` into the chat
 *   composer as a draft the reader sends (never sent by itself); it returns
 *   false where the card cannot relay it. `dshViz.canPrompt` says up front
 *   whether it can, so a fragment hides prompt-only controls otherwise.
 * - `dshViz.state.get(key, fallback?)` / `.set(key, value)` / `.clear()`
 *   keep JSON values for this card across reloads. The saved values are
 *   baked into the document, so they are readable before any fragment script
 *   runs; each change posts the whole map (at most {@link CARD_STATE_MAX_CHARS}
 *   as JSON) to the card, which stores it (client/card-state.ts). Where the
 *   card saves nothing (thumbnails, a new tab, the streaming preview) the API
 *   still works for the life of the document.
 * - Controls marked `data-viz-keep` (or inside a marked container) are saved
 *   on `input`/`change` and restored once on load, with their `input` and
 *   `change` events fired so the fragment's own handlers redraw. Restoring
 *   runs on every parse step (a mutation observer, which browsers deliver
 *   before each parser-inserted script), on any `dshViz.state` read, and at
 *   DOMContentLoaded for whatever had not matched yet.
 *
 * @module @nagi-ovo/dsh-visualize/viz-helper
 */

import type { ChartPreset, StyleId } from './style.ts'

/** Wire type of the frame→card composer prompt (`dshViz.prompt`). */
export const PROMPT_MESSAGE_TYPE = 'dsh-visualize:prompt'

/** Wire type of the frame→card saved-state snapshot (`dshViz.state`). */
export const STATE_MESSAGE_TYPE = 'dsh-visualize:state'

/** Largest saved state one card keeps, as JSON characters. */
export const CARD_STATE_MAX_CHARS = 16 * 1024

/** A card's saved state: JSON values by key. */
export type CardState = Record<string, unknown>

/** What the frame starts its `dshViz.state` from, and whether changes are saved. */
export interface FrameState {
  /** Values saved by an earlier load of this card; already JSON-clean. */
  values?: CardState | undefined
  /** Correlation token for state messages, or undefined where nothing is saved. */
  token?: string | undefined
}

/**
 * JSON for an inline `<script>`: `<`, `>`, `&` and the two JS line
 * separators are escaped, so no value can close the script, open a comment,
 * or break the statement, whatever text the reader typed into a control.
 * @param value - a JSON-serialisable value.
 * @returns the escaped JSON text.
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/gu, ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/**
 * The helper's inline script body for one card style.
 * @param style - the card's style id, exposed as `dshViz.style`.
 * @param chart - the style's Chart.js knobs beyond its CSS tokens.
 * @param promptToken - correlation token for `dshViz.prompt` messages, or
 *   undefined where the embedding card relays no prompts.
 * @param state - saved values to start from, and the token to save under.
 * @returns the script body.
 */
export function vizHelperScript(style: StyleId, chart: ChartPreset, promptToken?: string, state: FrameState = {}): string {
  // JSON of plugin-owned constants; `<` cannot occur, so the script cannot close early.
  return compact(`
(function () {
  var STYLE = ${JSON.stringify(style)};
  var CHART = ${JSON.stringify(chart)};
  var PROMPT_TOKEN = ${JSON.stringify(promptToken ?? null)};
  var STATE_TOKEN = ${JSON.stringify(state.token ?? null)};
  var saved = ${scriptJson(state.values ?? {})};
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
  function prompt(text) {
    if (PROMPT_TOKEN === null || typeof text !== 'string' || text.trim() === '') return false;
    // Only from the reader's own gesture in this frame; the card re-checks.
    var activation = navigator.userActivation;
    if (activation && activation.isActive === false) return false;
    parent.postMessage({ type: ${JSON.stringify(PROMPT_MESSAGE_TYPE)}, token: PROMPT_TOKEN, text: text }, '*');
    return true;
  }
  // Saved state. Every write goes through JSON, so what the card stores is
  // what a reload gets back; the card enforces the same cap on its side.
  var posted = JSON.stringify(saved);
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function commit(next) {
    var json;
    try { json = JSON.stringify(next); } catch (e) { return false; }
    if (json.length > ${CARD_STATE_MAX_CHARS}) return false;
    saved = JSON.parse(json);
    if (STATE_TOKEN !== null && json !== posted) {
      posted = json;
      parent.postMessage({ type: ${JSON.stringify(STATE_MESSAGE_TYPE)}, token: STATE_TOKEN, state: saved }, '*');
    }
    return true;
  }
  function setState(key, value) {
    var next = Object.create(null);
    for (var k in saved) if (own(saved, k)) next[k] = saved[k];
    if (value === undefined) delete next[key]; else next[key] = value;
    return commit(next);
  }
  function getState(key, fallback) {
    if (!loaded) restore();
    return own(saved, key) ? JSON.parse(JSON.stringify(saved[key])) : fallback;
  }
  var KEEP = '[data-viz-keep]', FIELDS = 'input,select,textarea';
  var SKIP = /^(button|submit|reset|image|file|password|hidden)$/;
  var settled = Object.create(null), loaded = false;
  function keyOf(el) {
    if (SKIP.test(el.type)) return null;
    var name = el.getAttribute('data-viz-keep') || (el.type === 'radio' ? el.name : el.id || el.name);
    return name ? 'keep:' + name : null;
  }
  function valueOf(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'radio') return el.checked ? el.value : undefined;
    if (el.multiple) return [].filter.call(el.options, function (o) { return o.selected; }).map(function (o) { return o.value; });
    return el.value;
  }
  // Put a saved value into a control: the element whose value changed, false
  // when it already holds it, null when it cannot take it (yet).
  function put(el, v) {
    if (el.type === 'checkbox') {
      if (typeof v !== 'boolean') return null;
      if (el.checked === v) return false;
      el.checked = v;
      return el;
    }
    if (el.type === 'radio') {
      var hit = [].filter.call(document.getElementsByName(el.name), function (r) { return r.type === 'radio' && r.value === v; })[0];
      if (!hit) return null;
      if (hit.checked) return false;
      hit.checked = true;
      return hit;
    }
    if (el.multiple) {
      if (!Array.isArray(v)) return null;
      var changed = false;
      [].forEach.call(el.options, function (o) {
        var on = v.indexOf(o.value) !== -1;
        if (o.selected !== on) { o.selected = on; changed = el; }
      });
      return changed;
    }
    if (typeof v !== 'string') return null;
    if (el.tagName === 'SELECT' && ![].some.call(el.options, function (o) { return o.value === v; })) return null;
    if (el.value === v) return false;
    el.value = v;
    return el;
  }
  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Each key is restored once, by the first control that can take its value;
  // until the document has loaded, a select or radio group still parsing may
  // match later.
  function restore() {
    document.querySelectorAll(KEEP).forEach(function (box) {
      (box.matches(FIELDS) ? [box] : [].slice.call(box.querySelectorAll(FIELDS))).forEach(function (el) {
        var key = keyOf(el);
        if (key === null || settled[key]) return;
        var done = own(saved, key) ? put(el, saved[key]) : false;
        if (done === null && !loaded) return;
        settled[key] = true;
        if (done) fire(done);
      });
    });
  }
  function save(event) {
    var el = event.target;
    if (!el || !el.matches || !el.matches(FIELDS) || !el.closest(KEEP)) return;
    var key = keyOf(el), value = valueOf(el);
    if (key !== null && value !== undefined) setState(key, value);
  }
  addEventListener('input', save, true);
  addEventListener('change', save, true);
  new MutationObserver(function (records) {
    if (!loaded) return restore();
    for (var i = 0; i < records.length; i++) {
      for (var j = 0; j < records[i].addedNodes.length; j++) {
        var n = records[i].addedNodes[j];
        if (n.nodeType === 1 && (n.closest(KEEP) || n.querySelector(KEEP))) return restore();
      }
    }
  }).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', function () { loaded = true; restore(); });
  window.dshViz = {
    style: STYLE, color: color, chartDefaults: chartDefaults, fontsReady: fontsReady,
    canPrompt: PROMPT_TOKEN !== null, prompt: prompt,
    state: {
      get: getState,
      set: function (key, value) { return setState(String(key), value); },
      clear: function () { return commit({}); },
    },
  };
})();
`)
}

/**
 * Drop indentation and whole-line comments from the helper: it ships in
 * every card's document, and its source holds no multi-line literal either
 * could change.
 * @param script - the helper source.
 * @returns the script as shipped.
 */
function compact(script: string): string {
  return script.replace(/^[ \t]+/gmu, '').replace(/^\/\/.*\n/gmu, '')
}
