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

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { storeRoot } from './storage.ts'
import { STYLES, type StyleId } from './style.ts'

/** Byte cap for one user style file; the rest is dropped with a note. */
export const CUSTOM_STYLE_MAX_BYTES = 4096

/** Global style file name inside the plugin's home directory. */
export const GLOBAL_STYLE_FILE = 'style.md'

/** Workspace style file, relative to the workspace root. */
export const WORKSPACE_STYLE_FILE = join('.dsh', 'visualize-style.md')

const STYLE_DIR_URL = new URL('../assets/styles/', import.meta.url)

/**
 * Absolute path of a built-in style's guide.
 * @param style - the style id.
 * @returns the guide's path inside this package.
 */
export function styleGuidePath(style: StyleId): string {
  return fileURLToPath(new URL(`${style}.md`, STYLE_DIR_URL))
}

/** Where the user's style files are looked up for one skill load. */
export interface StyleFileLocations {
  /** The plugin's home directory (`<DSH_HOME>/visualize`), when the host has one. */
  home?: string | undefined
  /** The session workspace root, when the lookup names one. */
  workspace?: string | undefined
}

/** One user style file that was found. */
export interface CustomStyle {
  /** Which file it is. */
  scope: 'global' | 'workspace'
  /** Absolute path read. */
  path: string
  /** Its text, cut at the byte cap. */
  text: string
  /** Whether the cap cut it. */
  truncated: boolean
}

/**
 * Locate the user's style files for a registrant context and workspace.
 * @param ctx - registrant context carrying the host home path.
 * @param workspace - the session workspace root, if any.
 * @returns the lookup locations.
 */
export function styleFileLocations(ctx: Context, workspace: string | undefined): StyleFileLocations {
  return { home: storeRoot(ctx), workspace }
}

/**
 * Read the user's style files, global first, then workspace.
 * @param locations - where to look.
 * @returns the files found, in precedence order (later wins).
 */
export async function readCustomStyles(locations: StyleFileLocations): Promise<CustomStyle[]> {
  const candidates: { scope: CustomStyle['scope']; path: string }[] = []
  if (locations.home !== undefined) candidates.push({ scope: 'global', path: join(locations.home, GLOBAL_STYLE_FILE) })
  if (locations.workspace !== undefined && locations.workspace.length > 0) {
    candidates.push({ scope: 'workspace', path: join(locations.workspace, WORKSPACE_STYLE_FILE) })
  }
  const found: CustomStyle[] = []
  for (const candidate of candidates) {
    const bytes = await readFile(candidate.path).catch(() => undefined)
    if (bytes === undefined) continue
    const truncated = bytes.byteLength > CUSTOM_STYLE_MAX_BYTES
    // A cut inside a multi-byte character decodes to U+FFFD; drop it.
    const text = (truncated ? bytes.subarray(0, CUSTOM_STYLE_MAX_BYTES) : bytes)
      .toString('utf8')
      .replace(/�+$/u, '')
      .trim()
    if (text.length === 0) continue
    found.push({ ...candidate, text, truncated })
  }
  return found
}

/**
 * Build the "Active card style" section appended to the skill body.
 * @param style - the configured style id.
 * @param locations - where to look for the user's style files.
 * @returns the Markdown section, starting with a blank line.
 */
export async function activeStyleSection(style: StyleId, locations: StyleFileLocations): Promise<string> {
  const guide = (await readFile(styleGuidePath(style), 'utf8')).trim()
  const custom = await readCustomStyles(locations)
  const parts = [
    '',
    '## Active card style',
    '',
    `The user's card style is \`${style}\` (${STYLES[style].label}). The frame already applies its colours, `
    + 'fonts, radius and chart defaults; the guide below says how a card in this style should read. It follows '
    + 'the precedence and limits in "Card style" above.',
    '',
    `### Built-in style: ${style}`,
    '',
    guide,
  ]
  for (const file of custom) {
    parts.push(
      '',
      file.scope === 'global' ? `### User style (global, ${file.path})` : `### User style (this workspace, ${file.path})`,
      '',
      file.text,
    )
    if (file.truncated) {
      parts.push('', `(The file is longer than ${CUSTOM_STYLE_MAX_BYTES} bytes; only its start is shown.)`)
    }
  }
  return `${parts.join('\n')}\n`
}

/**
 * The sentence the tool description gains, so an agent that reads the
 * contract from disk (no skill tool) also finds the style guide.
 * @param style - the configured style id.
 * @returns a description suffix, starting with a space.
 */
export function styleToolNote(style: StyleId): string {
  return ` Cards use the user's "${style}" card style: its guide is appended to the visualize skill, `
    + `or read it from ${styleGuidePath(style)} together with any user style file `
    + `(${join('<DSH_HOME>', 'visualize', GLOBAL_STYLE_FILE)}, then ${join('<workspace>', WORKSPACE_STYLE_FILE)}).`
}
