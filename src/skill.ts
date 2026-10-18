/**
 * Bundled `visualize` skill provider: the fragment-authoring contract the
 * model loads before its first `visualize` call. Mirrors the official
 * `dsh-skill-badge` provider shape — one bundled candidate whose body ships
 * in this package's `assets/`. The body ends with the active card style's
 * guide and the user's style files (style-guide.ts), read on every load so an
 * edited style file applies from the next skill load on.
 *
 * @module @nagi-ovo/dsh-visualize/skill
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'
import { activeStyleSection, type StyleFileLocations } from './style-guide.ts'
import { DEFAULT_STYLE, type StyleId } from './style.ts'

const PROVIDER_NAME = 'dsh-visualize'
const SKILL_BODY_URL = new URL('../assets/visualize-skill.md', import.meta.url)

/** Absolute path of the skill body, for agents that cannot load skills. */
export const SKILL_BODY_PATH = fileURLToPath(SKILL_BODY_URL)

/** Absolute directory the skill body's relative references resolve against. */
export const SKILL_RESOURCE_DIR = fileURLToPath(new URL('../assets/', import.meta.url))

const RESOURCE_BASE = {
  kind: 'directory',
  path: SKILL_RESOURCE_DIR,
} as const
const INVOCATION = { modelInvocable: true, userInvocable: true } as const
const DESCRIPTION =
  'Authoring contract for the visualize tool, which renders interactive cards '
  + 'in the conversation, or full pages in their own tab: simulations, algorithm '
  + 'walkthroughs, charts, comparisons, dashboards, and product-screen mockups. Load before the first visualize '
  + 'call in a session — it defines the fragment structure, theming variables, '
  + 'size ceiling, and allowed resources the tool validates against.'

const CANDIDATE: SkillCandidate = {
  name: 'visualize',
  description: DESCRIPTION,
  invocation: INVOCATION,
  provider: PROVIDER_NAME,
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
  rank: BUNDLED_SKILL_RANK,
  locator: SKILL_BODY_URL,
}

/**
 * Build the bundled provider registered on `ctx.skills`.
 * @param style - the configured card style: an id, or a reader asked on
 *   every load so a changed setting reaches the next load.
 * @param locate - where the user's style files are for a lookup's workspace
 *   (`cwd`; absent when the lookup has no session, which reads the global file alone).
 * @returns the provider.
 */
export function visualizeSkillProvider(
  style: StyleId | (() => StyleId) = DEFAULT_STYLE,
  locate: (cwd: string | undefined) => StyleFileLocations = () => ({}),
): SkillProvider {
  return {
    name: PROVIDER_NAME,
    list: () => Promise.resolve([CANDIDATE]),
    async get(_candidate, options): Promise<SkillDefinition> {
      const body = await readFile(SKILL_BODY_URL, 'utf8')
      return {
        name: CANDIDATE.name,
        description: CANDIDATE.description,
        invocation: CANDIDATE.invocation,
        provider: CANDIDATE.provider,
        source: CANDIDATE.source,
        resourceBase: RESOURCE_BASE,
        content: body + await activeStyleSection(typeof style === 'function' ? style() : style, locate(options?.cwd)),
      }
    },
  }
}
