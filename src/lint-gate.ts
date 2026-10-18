/**
 * The lint gate the `visualize` tool runs every fragment through: it turns a
 * {@link lintFragment} report into either a thrown rejection (the call fails
 * as `isError`, nothing renders, nothing is written) or a success carrying
 * warning text for the result, and it guards the model's retry loop.
 *
 * Patches are linted on the card they would produce. A finding that was
 * already in the card before the patch — same rule and severity, same text at
 * the same place in the text the edit left untouched — is demoted to a warning: rejecting it would force the model
 * to fix every old problem in one exact-match patch, which deadlocks as soon
 * as two of them sit apart.
 *
 * The loop guard counts, per session, how many consecutive calls each error
 * code has rejected. On the third, the rejection tells the model to stop
 * retrying and tell the user what blocks the card. The state is in memory
 * and resets on host restart, which is the right lifetime for a retry loop.
 *
 * @module @nagi-ovo/dsh-visualize/lint-gate
 */

import {
  formatFindings,
  formatRejection,
  LINT_RULES,
  lintFragment,
  type LintCode,
  type LintFinding,
  type PlacedFinding,
} from './lint.ts'

/** Consecutive rejections by one code after which the model is told to stop. */
export const STOP_AFTER = 3

/** Sessions whose retry streaks are remembered; the oldest is dropped beyond this. */
const MAX_SESSIONS = 256

/** Inputs for one gate check. */
export interface LintGateInput {
  /** The fragment the card would render (for an update, the patched card). */
  readonly fragment: string
  /** Deployment size ceiling for one fragment. */
  readonly maxBytes: number
  /** Calling session, keying the loop guard; undefined disables the guard. */
  readonly sessionId: string | undefined
  /** For an update, the card before the patch; undefined for a create. */
  readonly base?: string | undefined
}

/** A passed check. */
export interface LintGatePass {
  /** UTF-8 size of the fragment. */
  readonly sizeBytes: number
  /** Formatted warnings for the result text, or empty when there are none. */
  readonly warnings: string
}

/** Lints fragments and remembers per-session rejection streaks. */
export class FragmentLintGate {
  private readonly streaks = new Map<string, Map<LintCode, number>>()

  /**
   * Lint one fragment and decide.
   * @param input - fragment, size ceiling, session, and the pre-patch card for updates.
   * @returns the size and warning text when nothing blocks the card.
   * @throws Error with the coded findings when any error remains.
   */
  check(input: LintGateInput): LintGatePass {
    const { sizeBytes, findings } = lintFragment(input.fragment, input.maxBytes)
    const placed = input.base === undefined
      ? findings.map(finding => ({ finding, origin: 'new' as const }))
      : placeAgainstBase(findings, input.fragment, input.base, input.maxBytes)
    const blocking = (p: PlacedFinding): boolean => p.finding.severity === 'error' && p.origin !== 'preexisting'
    const errors = placed.filter(blocking)
    const warnings = placed.filter(p => !blocking(p))
    const patched = input.base !== undefined

    if (errors.length === 0) {
      if (input.sessionId !== undefined) this.streaks.delete(input.sessionId)
      return {
        sizeBytes,
        warnings: warnings.length === 0
          ? ''
          : `Lint warnings (the card rendered; patch these if they matter, positions are line:column in the ${patched ? 'patched card' : 'fragment'}):\n${formatFindings(warnings)}`,
      }
    }

    let message = formatRejection(errors, warnings, patched)
    if (input.sessionId !== undefined) {
      const stuck = this.recordRejection(input.sessionId, new Set(errors.map(p => p.finding.code)))
      if (stuck.length > 0) {
        const named = stuck.map(code => `${code} (${LINT_RULES[code].message})`).join('; ')
        message += `\n\nSTOP: ${stuck.join(', ')} has now rejected ${STOP_AFTER} visualize calls in a row. Do not call visualize again for this card. `
          + `Tell the user in your reply what is blocking it — ${named} — and ask how they want to proceed.`
      }
    }
    throw new Error(message)
  }

  /**
   * Advance the session's streaks: codes in this rejection grow by one,
   * codes absent from it reset.
   * @returns codes whose streak has reached {@link STOP_AFTER}.
   */
  private recordRejection(sessionId: string, codes: ReadonlySet<LintCode>): LintCode[] {
    const previous = this.streaks.get(sessionId)
    const next = new Map<LintCode, number>()
    for (const code of codes) next.set(code, (previous?.get(code) ?? 0) + 1)
    this.streaks.delete(sessionId)
    this.streaks.set(sessionId, next)
    if (this.streaks.size > MAX_SESSIONS) {
      const oldest = this.streaks.keys().next().value
      if (oldest !== undefined) this.streaks.delete(oldest)
    }
    return [...next].filter(([, count]) => count >= STOP_AFTER).map(([code]) => code)
  }
}

/**
 * Tag each finding of a patched card as inside the edit, pre-existing, or
 * newly caused elsewhere by the edit.
 * @param findings - findings on the patched card.
 * @param patched - the patched card.
 * @param base - the card before the patch.
 * @param maxBytes - size ceiling, for linting the base the same way.
 * @returns the findings with their origin.
 */
function placeAgainstBase(findings: readonly LintFinding[], patched: string, base: string, maxBytes: number): PlacedFinding[] {
  // The edited span in the patched card: everything between the common prefix and suffix.
  let prefix = 0
  const limit = Math.min(base.length, patched.length)
  while (prefix < limit && base[prefix] === patched[prefix]) prefix++
  let suffix = 0
  while (suffix < limit - prefix && base[base.length - 1 - suffix] === patched[patched.length - 1 - suffix]) suffix++
  const editStart = prefix
  const editEnd = Math.max(prefix, patched.length - suffix)

  // Base findings by place, not by count: a count lets a new finding at the
  // cut borrow the identity of a deleted one with the same text.
  const before = new Set<string>()
  for (const f of lintFragment(base, maxBytes).findings) before.add(findingKey(f, f.offset, base))
  const shift = patched.length - base.length
  return findings.map(finding => {
    const start = finding.offset
    const end = finding.offset + finding.length
    // In the edit only if the finding covers inserted text, or (for a pure
    // deletion) straddles the cut, joining text from both sides. Text that
    // merely touches the boundary is untouched and is matched against the base
    // like any other: a finding the patch formed there still has no base twin.
    const inEdit = editEnd > editStart
      ? start < editEnd && end > editStart
      : start < editStart && end > editStart
    if (inEdit) return { finding, origin: 'edit' as const }
    // Untouched text sits at the same offset before the edit, shifted after it.
    // Only a base finding at exactly that place, same rule, same severity, same
    // text, is its twin; anything less certain counts as new and blocks.
    const baseOffset = end <= editStart ? start : start - shift
    if (finding.code !== 'VZ002' && before.has(findingKey(finding, baseOffset, patched, start))) {
      return { finding, origin: 'preexisting' as const }
    }
    return { finding, origin: 'new' as const }
  })
}

/**
 * Identity of a finding across a patch: rule, severity, place, and the text
 * it flagged. A severity in the key keeps a warning the patch turned into an
 * error at the same place from passing as pre-existing.
 * @param at - the finding's offset in the base card's coordinates.
 * @param from - where its text is read in `src` (defaults to `at`).
 */
function findingKey(finding: LintFinding, at: number, src: string, from = at): string {
  return `${finding.code}\u0000${finding.severity}\u0000${at}\u0000${src.slice(from, from + finding.length)}`
}
