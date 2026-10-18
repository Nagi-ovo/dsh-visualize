/**
 * Copy for the settings page: one flat dictionary per language with `{name}`
 * placeholders. The page follows the host's locale service where there is
 * one (`ctx.locale`, read as dsh-ads does), else the page language; any
 * locale other than English reads Chinese.
 */

import type { StyleId } from '../style.ts'

/** Every key the page reads. */
export type SettingsKey = keyof typeof EN

/** English copy and key source. */
export const EN = {
  styleHeading: 'Card style',
  styleIntro: 'New cards use this style. Cards already in a conversation keep the style they were made in.',
  'style.whale': 'Whale',
  'style.whale.desc': 'Matches the dsh interface',
  'style.editorial': 'Editorial',
  'style.editorial.desc': 'Headline states the finding, one story line',
  'style.paper': 'Paper',
  'style.paper.desc': 'Like a figure in a paper',
  'style.sketch': 'Sketch',
  'style.sketch.desc': 'Hand drawn, like a whiteboard',
  'style.terminal': 'Terminal',
  'style.terminal.desc': 'Monospaced, like a terminal',
  defaultTag: 'Default',
  saving: 'Saving…',
  saved: 'Saved. The next card uses {style}.',
  saveFailed: 'Could not save the style. Try again.',
  readOnly: 'This profile cannot be edited from here.',
  overridden: 'Set in your profile',
  reset: 'Use the default',
  unavailableTitle: 'This dsh cannot change the card style here',
  unavailableBody: 'Set it in {path} instead:',
  previewTitle: 'Signups up 18% this week',
  previewNote: 'Weekly signups, last 8 weeks',
  filesHeading: 'Custom style files',
  filesIntro: 'Notes the model reads after the built-in style, such as colours or wording to prefer. The workspace file is read last. Each file counts up to {max} bytes.',
  globalFile: 'All workspaces',
  workspaceFile: 'Workspace',
  workspacePick: 'Workspace',
  fileExists: 'Exists',
  fileMissing: 'Not created',
  fileBlocked: 'This path is a link or not a regular file, so it cannot be edited here.',
  bytes: '{bytes} / {max} bytes',
  tooLarge: 'Over the {max}-byte limit by {over} bytes.',
  saveFile: 'Save',
  fileSaved: 'Saved. It applies from the next skill load.',
  fileRemoved: 'Saved empty, so the file was removed.',
  fileSaveFailed: 'Could not save the file: {reason}',
  filesUnavailable: 'This dsh cannot edit the files here. Edit them directly:',
  filesLoading: 'Loading style files…',
  placeholder: 'For example: use teal for the accent, label axes in English.',
} as const

/** Chinese copy. */
export const ZH: Record<SettingsKey, string> = {
  styleHeading: '卡片风格',
  styleIntro: '新生成的卡片用这个风格。对话里已有的卡片保持它生成时的风格。',
  'style.whale': '鲸蓝',
  'style.whale.desc': '和 dsh 界面一致',
  'style.editorial': '报刊',
  'style.editorial.desc': '标题写结论，一条主线',
  'style.paper': '论文',
  'style.paper.desc': '论文插图式',
  'style.sketch': '手绘',
  'style.sketch.desc': '白板手绘',
  'style.terminal': '终端',
  'style.terminal.desc': '等宽终端风',
  defaultTag: '默认',
  saving: '保存中…',
  saved: '已保存，下一张卡片用「{style}」。',
  saveFailed: '风格没有保存成功，请重试。',
  readOnly: '这个配置不能在这里修改。',
  overridden: '已在配置中设置',
  reset: '恢复默认',
  unavailableTitle: '这个版本的 dsh 不能在这里切换卡片风格',
  unavailableBody: '请在 {path} 里设置：',
  previewTitle: '本周注册量上涨 18%',
  previewNote: '近 8 周每周注册量',
  filesHeading: '自定义风格文件',
  filesIntro: '模型在内置风格之后读的补充说明，比如偏好的颜色或措辞；工作区文件最后读。每个文件最多计入 {max} 字节。',
  globalFile: '所有工作区',
  workspaceFile: '工作区',
  workspacePick: '工作区',
  fileExists: '已存在',
  fileMissing: '未创建',
  fileBlocked: '这个路径是链接或不是普通文件，不能在这里编辑。',
  bytes: '{bytes} / {max} 字节',
  tooLarge: '超出 {max} 字节上限 {over} 字节。',
  saveFile: '保存',
  fileSaved: '已保存，下次加载 skill 时生效。',
  fileRemoved: '内容为空，已删除该文件。',
  fileSaveFailed: '文件没有保存成功：{reason}',
  filesUnavailable: '这个版本的 dsh 不能在这里编辑这些文件，请直接编辑：',
  filesLoading: '正在读取风格文件…',
  placeholder: '例如：强调色用青绿色，坐标轴标签用英文。',
}

/** The two languages the page ships. */
export type SettingsLang = 'zh' | 'en'

/** A translate function over the page's keys. */
export type Translate = (key: SettingsKey, params?: Record<string, string | number>) => string

/**
 * Map a host locale id to the page's language.
 * @param active - the host's active locale id, if known.
 * @returns English only for an `en` locale; everything else reads Chinese.
 */
export function settingsLang(active: string | undefined): SettingsLang {
  return active !== undefined && active.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

/**
 * The page language without a locale service, from the document.
 * @returns the language.
 */
export function documentLang(): SettingsLang {
  const lang = typeof document === 'undefined' ? '' : document.documentElement.lang
  return lang === '' ? 'zh' : settingsLang(lang)
}

/** Fill `{name}` placeholders. */
function fill(text: string, params: Record<string, string | number> | undefined): string {
  return params === undefined ? text : text.replace(/\{(\w+)\}/gu, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match)
}

/**
 * Build the translate function for one language.
 * @param lang - the language.
 * @returns the translate function.
 */
export function translator(lang: SettingsLang): Translate {
  const dict: Record<SettingsKey, string> = lang === 'en' ? EN : ZH
  return (key, params) => fill(dict[key], params)
}

/** The display name of a style. */
export function styleName(t: Translate, id: StyleId): string {
  return t(`style.${id}`)
}
