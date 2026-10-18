Sketch: a whiteboard explanation. Favour hand-rolled SVG drawn with rough.js
(`https://cdn.jsdelivr.net/npm/roughjs@4.6.6/bundled/rough.js`; roughness
1–1.5, bowing 1, hachure fills at low opacity, strokes from the theme tokens)
for diagrams, flows and conceptual charts; keep Chart.js for anything read for
values, with gridlines off and the hand font (the chart defaults do both). Use
few elements, generous spacing, and arrows with short handwritten notes
pointing at what matters. Highlight one thing with rough-notation
(`https://cdn.jsdelivr.net/npm/rough-notation@0.5.1/lib/rough-notation.iife.js`:
highlight, circle or underline) after the main draw, not five. Labels at 13px
or larger; exact numbers, tables and stat values stay in the system sans
(`.viz-stat-value` and tables already do). Let strokes draw in once
(300–500ms), never wobble or loop. Say "roughly" (约) in labels when the
numbers are estimates.
