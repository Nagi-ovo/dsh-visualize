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
const TOKEN_BRIDGE: readonly (readonly [string, string])[] = [
  ['foreground', '--dsw-alias-label-primary'],
  ['card', '--dsw-alias-bg-layer-1'],
  ['muted-foreground', '--dsw-alias-label-caption'],
  ['border', '--dsw-alias-border-l2'],
  ['primary', '--dsw-alias-brand-primary-new-colorprimary-new-color'],
  ['primary-foreground', '--dsw-alias-label-primary-inverted'],
]

/** The bridged palette and scheme for one frame document build. */
export interface ResolvedTheme {
  themeVars: Record<string, string>
  colorScheme: 'light' | 'dark'
}

/**
 * Resolve the bridged palette and the host color scheme from computed style.
 * @returns the palette map and scheme for {@link buildFrameDoc}.
 */
export function resolveTheme(): ResolvedTheme {
  const computed = getComputedStyle(document.body)
  const themeVars: Record<string, string> = {}
  for (const [frameName, hostToken] of TOKEN_BRIDGE) {
    themeVars[frameName] = computed.getPropertyValue(hostToken)
  }
  const scheme = computed.colorScheme
  const colorScheme = scheme.includes('dark') && !scheme.includes('light')
    ? 'dark'
    : scheme.includes('light') && !scheme.includes('dark')
      ? 'light'
      : document.body.hasAttribute('data-ds-dark-theme')
        ? 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return { themeVars, colorScheme }
}
