/**
 * Whether the host chat currently folds a finished turn's process rows — and
 * with them every visualize card — out of sight.
 *
 * The answer is the Chat target's own "work details" preference, stored under
 * the `ui-chat` settings namespace as `transcriptView`. Two host generations
 * expose it through different services with the same snapshot face:
 *
 * - dsh 0.1.2–0.1.6: `settingsScope.bind({ namespace })`; modes `normal` and
 *   `compact`, default `compact`, and only `compact` folds.
 * - dsh 0.1.7+: `configForms.get(namespace)`; modes `compact`, `standard`,
 *   `detailed`, `verbose`, default `standard`, and every mode but `verbose`
 *   folds (the legacy `normal`/`expanded` values map onto folding modes).
 *
 * dsh 0.1.1 has neither service and never folds.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** Settings namespace owned by the host Chat target. */
const CHAT_NAMESPACE = 'ui-chat'

/** The snapshot face both host settings services return for one namespace. */
interface ChatSettingsFace {
  getSnapshot(): { readonly value?: { readonly transcriptView?: unknown } | undefined }
  subscribe(listener: () => void): (() => void) | void
}

/** The context surface this module reads; optional lookup only. */
export interface FoldingHost {
  get(name: string): unknown
}

/**
 * Whether a saved mode folds on a 0.1.7+ host. An unset value is the host's
 * `standard` default.
 * @param view - saved `transcriptView`.
 * @returns true unless the reader chose `verbose`.
 */
export function configFormsFolds(view: unknown): boolean {
  return view !== 'verbose'
}

/**
 * Whether a saved mode folds on a 0.1.2–0.1.6 host. An unset value is the
 * host's `compact` default.
 * @param view - saved `transcriptView`.
 * @returns true for `compact` or unset.
 */
export function settingsScopeFolds(view: unknown): boolean {
  return view === undefined || view === 'compact'
}

/**
 * Adapt a settings face into a boolean observable.
 * @param face - the host namespace binding.
 * @param folds - the generation's mode rule.
 * @returns an observable whose snapshot is a primitive, so it is stable.
 */
function observe(face: ChatSettingsFace, folds: (view: unknown) => boolean): HostObservable<boolean> {
  return {
    getSnapshot: () => folds(face.getSnapshot().value?.transcriptView),
    subscribe: (listener) => {
      const dispose = face.subscribe(listener)
      return typeof dispose === 'function' ? dispose : () => undefined
    },
  }
}

/**
 * Narrow an unknown value to an object exposing a method.
 * @param value - candidate service.
 * @param method - required method name.
 * @returns the value when it carries the method.
 */
function hasMethod<M extends string>(value: unknown, method: M): value is Record<M, (...args: never[]) => unknown> {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>)[method] === 'function'
}

/**
 * Resolve the folding observable for this host. Call it once the Chat target
 * is up (its turn-tail declaration is the signal), when both settings
 * services, where present, are already provided.
 * @param host - the client context, read through optional `get`.
 * @returns whether finished turns currently fold, observed live.
 */
export function foldingSource(host: FoldingHost): HostObservable<boolean> {
  const forms = host.get('configForms')
  if (hasMethod(forms, 'get')) {
    return observe((forms.get as (namespace: string) => ChatSettingsFace)(CHAT_NAMESPACE), configFormsFolds)
  }
  const scope = host.get('settingsScope')
  if (hasMethod(scope, 'bind')) {
    return observe((scope.bind as (options: { namespace: string }) => ChatSettingsFace)({ namespace: CHAT_NAMESPACE }), settingsScopeFolds)
  }
  return { getSnapshot: () => false, subscribe: () => () => undefined }
}
