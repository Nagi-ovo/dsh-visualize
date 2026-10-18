Terminal: everything monospace, square corners, numbers aligned. Use
`tabular-nums` and right-align numeric columns; prefer fixed decimals and SI
suffixes (12.4k, 3.1 ms). Labels are terse key–value pairs ("p99 41.2ms");
section heads may be uppercase with slight tracking. Dashed gridlines on both
axes, straight segments and square points come from `dshViz.chartDefaults`;
add no gradient fills or shadows. Buttons read as bracketed commands
("[ run ]", "[ step → ]"). For algorithm walkthroughs, show state as cells in
a character grid and highlight the active cell with `--primary`. Motion is
stepped (`steps()` or discrete updates), never eased bounces; no blinking
cursor or other looping animation. Colour stays scarce: one green measure,
amber (`--viz-series-2`) for warnings.
