/**
 * Bundled `visualize` skill provider: the fragment-authoring contract the
 * model loads before its first `visualize` call. Mirrors the official
 * `dsh-skill-badge` provider shape — one bundled candidate whose body ships
 * in this package's `assets/`.
 *
 * @module @dsh-external/dsh-visualize/skill
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'

const PROVIDER_NAME = 'dsh-visualize'
const SKILL_BODY_URL = new URL('../assets/visualize-skill.md', import.meta.url)
const RESOURCE_BASE = {
  kind: 'directory',
  path: fileURLToPath(new URL('../assets/', import.meta.url)),
} as const
const INVOCATION = { modelInvocable: true, userInvocable: true } as const
const DESCRIPTION =
  'Authoring contract for the visualize tool, which renders interactive cards '
  + 'in the conversation: simulations, algorithm walkthroughs, charts, '
  + 'comparisons, and product-screen mockups. Load before the first visualize '
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

/** The bundled provider registered on `ctx.skills`. */
export const visualizeSkillProvider: SkillProvider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve([CANDIDATE]),
  async get(_candidate): Promise<SkillDefinition> {
    return {
      name: CANDIDATE.name,
      description: CANDIDATE.description,
      invocation: CANDIDATE.invocation,
      provider: CANDIDATE.provider,
      source: CANDIDATE.source,
      resourceBase: RESOURCE_BASE,
      content: await readFile(SKILL_BODY_URL, 'utf8'),
    }
  },
}
