/**
 * The `style` setting as the host delivers it. The field is declared
 * volatile, which is what lets the host's settings forms (dsh-settings) edit
 * it from the web UI: a form write lands in the profile's `cordis.patch.yml`,
 * and the Loader commits the new value into the running plugin's reference
 * instead of remounting it, then emits `loader/volatile-update`. Every reader
 * therefore takes the style at use time — per tool call, per skill load, per
 * page served — so a changed setting reaches the next card without a restart.
 *
 * Two shapes reach `apply`: a volatile reference (`{ get() }`) where the
 * host's schemastery has `.volatile()`, and a plain id where it does not, or
 * where a test passes one.
 *
 * @module @nagi-ovo/dsh-visualize/style-setting
 */

import z from '@deepseek-ai/schemastery'
import { DEFAULT_STYLE, STYLE_IDS, STYLES, styleIdFrom, type StyleId } from './style.ts'

/** A live setting: the value read through its owner's reference. */
export interface LiveValue<T> {
  get(): T
}

/** The configured style as `apply` receives it. */
export type StyleSetting = StyleId | LiveValue<StyleId | undefined>

/** The field's schema; its parsed output is a {@link StyleSetting}. */
type FieldSchema = z<StyleId, StyleSetting>

/**
 * Build the `style` field schema, volatile where the schemastery in use
 * supports it. Without `.volatile()` the field still validates; the settings
 * page then reports it unavailable and the YAML route remains.
 * @param schema - schemastery's default export, injectable for the fallback test.
 * @returns the field schema.
 */
export function styleFieldSchema(schema: typeof z = z): FieldSchema {
  const field = schema.union(STYLE_IDS.map(id => schema.const(id).description(STYLES[id].label)))
    .default(DEFAULT_STYLE)
    .description('Card style · 卡片风格') as unknown as { volatile?: () => unknown }
  return (typeof field.volatile === 'function' ? field.volatile() : field) as FieldSchema
}

/**
 * Read the configured style now.
 * @param setting - the `style` value `apply` received.
 * @returns a known style id; anything else reads as the default.
 */
export function readStyle(setting: StyleSetting | undefined): StyleId {
  if (typeof setting === 'object' && setting !== null && typeof (setting as LiveValue<unknown>).get === 'function') {
    return styleIdFrom((setting as LiveValue<unknown>).get())
  }
  return styleIdFrom(setting)
}
