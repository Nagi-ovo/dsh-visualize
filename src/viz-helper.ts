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
 *
 * @module @nagi-ovo/dsh-visualize/viz-helper
 */

import type { ChartPreset, StyleId } from './style.ts'

/**
 * The helper's inline script body for one card style.
 * @param style - the card's style id, exposed as `dshViz.style`.
 * @param chart - the style's Chart.js knobs beyond its CSS tokens.
 * @returns the script body.
 */
export function vizHelperScript(style: StyleId, chart: ChartPreset): string {
  // JSON of plugin-owned constants; `<` cannot occur, so the script cannot close early.
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
`
}
