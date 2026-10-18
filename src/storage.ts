/**
 * Where a card's settled fragment lives on disk, and how an `update` finds it
 * again.
 *
 * New cards go to a per-session store under the harness home —
 * `$DSH_HOME/visualize/sessions/<session>/<slug>-<hash>.<style>.html` — never into the
 * user's project, so `git status` stays clean and conversations do not mix.
 * The plugin owns these files and writes them with its own node fs: the store
 * sits outside every sandbox write root, and the model never addresses it
 * except by handing back a path this module reported.
 *
 * The home comes from the host's `dshHomePath` value, which app-boot provides
 * on the root context from dsh 0.1.1 onward; a host without it (or a call
 * without a session) keeps the original behaviour, a copy under `viz/` in the
 * session workspace written through `ctx.fs` and the session sandbox policy.
 *
 * An `update` path is model-supplied, so it is only trusted as far as it
 * proves itself: a path inside the store is read and rewritten with node fs;
 * a legacy `viz/...` copy from an earlier session must be an `.html` file
 * inside the session workspace, after `~` expansion, `..` normalization, and
 * symlink resolution, and goes through `ctx.fs` under the sandbox policy. Any
 * other path is refused before it is read: the sandbox confines writes, not
 * reads, and a failed patch quotes card text back to the model.
 *
 * @module @nagi-ovo/dsh-visualize/storage
 */

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-sandbox-policy'

/** Directory under the harness home that holds every plugin-owned card. */
export const STORE_DIR = 'visualize'

/** The host's home-path joiner: `dshHomePath(...segments)` → absolute path. */
type HomePath = (...segments: string[]) => string

/** The slice of a tool execution the store reads. */
export interface CardExec {
  readonly agent?: { readonly session: { readonly id?: unknown; readonly header: { readonly cwd?: string } } }
  readonly signal: AbortSignal
}

/** One resolved card file: where it is, and how to read and rewrite it. */
export interface CardFile {
  /** The path reported to the model and shown in the card header. */
  readonly displayPath: string
  read(): Promise<string>
  write(content: string): Promise<void>
}

/** Card files for one tool execution. */
export interface CardStore {
  /** Where a new card named `name` (one safe segment) is written. */
  create(name: string): Promise<CardFile>
  /** The existing card a model-supplied `update` path addresses. */
  open(path: string): Promise<CardFile>
}

/**
 * Build the card store for one execution.
 * @param ctx - registrant context carrying `ctx.fs`, `sandboxPolicy`, and the host home path.
 * @param exec - the calling execution, for its session and signal.
 * @returns the store; its `create` falls back to the workspace when the host lacks a home path.
 */
export function cardStore(ctx: Context, exec: CardExec): CardStore {
  const root = storeRoot(ctx)
  const sessionId = exec.agent?.session.id
  const workspace = workspaceFiles(ctx, exec)
  return {
    async create(name) {
      if (root === undefined || typeof sessionId !== 'string' || sessionId.length === 0) {
        return await workspace.open(`viz/${name}`)
      }
      return ownedFile(root, join(root, 'sessions', sessionSegment(sessionId), name))
    },
    async open(path) {
      const owned = root === undefined ? undefined : await ownedPath(root, path)
      if (owned !== undefined) return ownedFile(root!, owned)
      const legacy = await workspacePath(workspace.root, path)
      if (legacy === undefined) {
        throw new Error(
          `invalid visualization patch: ${JSON.stringify(path)} is not a card visualize can patch — pass the path `
          + 'a visualize call reported (a card in the session store, or a legacy viz/ .html copy inside the workspace)',
        )
      }
      return await workspace.open(legacy)
    },
  }
}

/**
 * Accept a model-supplied path as a legacy workspace card only if it names an
 * `.html` file inside the session workspace, lexically and after symlink
 * resolution. The fs seam's sandbox confines writes but not reads, and a
 * failed patch quotes the card text back, so an unconfined read would leak
 * any file the host can open.
 * @param root - the session workspace root, undefined when the session has none.
 * @param path - the `update` path as the model passed it (`~/` allowed).
 * @returns the path to resolve through the seam, or undefined when it is not contained.
 */
export async function workspacePath(root: string | undefined, path: string): Promise<string | undefined> {
  if (root === undefined || !isAbsolute(root)) return undefined
  const tilde = path === '~' || path.startsWith('~/')
  const expanded = tilde ? join(homedir(), path.slice(1)) : path
  const base = resolve(root)
  const target = resolve(base, expanded)
  if (!inside(base, target) || !target.endsWith('.html')) return undefined
  const realRoot = await realpath(base).catch(() => base)
  if (!inside(realRoot, await realpathOfDeepest(target))) return undefined
  // A plain relative path resolves against this same root in the seam, which
  // keeps its display form; anything else goes in as the checked absolute path.
  return tilde || isAbsolute(path) ? target : path
}

/**
 * Resolve symlinks in the longest existing prefix of `target`; the missing
 * remainder cannot be a link yet.
 * @param target - absolute path.
 * @returns the real path of the deepest existing ancestor joined with the rest.
 */
export async function realpathOfDeepest(target: string): Promise<string> {
  let existing = target
  for (;;) {
    try {
      return join(await realpath(existing), relative(existing, target))
    } catch {
      const parent = dirname(existing)
      if (parent === existing) return target
      existing = parent
    }
  }
}

/**
 * The store root under the harness home, when the host provides one.
 * @param ctx - registrant context.
 * @returns the absolute root, or undefined on a host without `dshHomePath`.
 */
export function storeRoot(ctx: Context): string | undefined {
  let homePath: unknown
  try {
    homePath = ctx.get('dshHomePath')
  } catch {
    return undefined
  }
  if (typeof homePath !== 'function') return undefined
  const root = (homePath as HomePath)(STORE_DIR)
  return typeof root === 'string' && isAbsolute(root) ? resolve(root) : undefined
}

/**
 * Encode a session id as exactly one path segment, injectively: every
 * character outside `[A-Za-z0-9_-]` — separators, dots, `~` itself — becomes
 * `~` plus its code point in hex, so no id can name `.`, `..`, or a nested path.
 * @param id - the raw session id.
 * @returns the directory name for that session.
 */
export function sessionSegment(id: string): string {
  return Array.from(id, char => /^[A-Za-z0-9_-]$/u.test(char)
    ? char
    : `~${char.codePointAt(0)!.toString(16).padStart(4, '0')}`).join('')
}

/**
 * Accept a model-supplied path as a store file only if it names an `.html`
 * file below the root after normalization and symlink resolution.
 * @param root - absolute store root.
 * @param path - the `update` path as the model passed it (`~/` allowed).
 * @returns the absolute store path, or undefined when it is not a store file.
 */
export async function ownedPath(root: string, path: string): Promise<string | undefined> {
  const expanded = path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path
  if (!isAbsolute(expanded)) return undefined
  const target = resolve(expanded)
  if (!inside(root, target) || !target.endsWith('.html')) return undefined
  // A symlink inside the store — the file or a directory above it — must not
  // carry a read or a write anywhere else.
  const real = await realpath(target).catch(async () => await realpath(dirname(target)).then(
    parent => join(parent, 'card.html'),
    () => undefined,
  ))
  // Nothing on disk yet: the card does not exist, and the read fails loudly.
  if (real === undefined) return target
  const realRoot = await realpath(root).catch(() => root)
  return inside(realRoot, real) ? target : undefined
}

/**
 * Whether `target` lies strictly below `root`.
 * @param root - absolute directory.
 * @param target - absolute path.
 * @returns true for a descendant, false for the root itself or anything outside.
 */
export function inside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel.length > 0 && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)
}

/**
 * A plugin-owned card file, read and written with node fs. Writes go through
 * a sibling temporary file and a rename, so a reader never sees half a card.
 * @param root - absolute store root, for the display form.
 * @param path - absolute file path below the root.
 * @returns the card file.
 */
function ownedFile(root: string, path: string): CardFile {
  return {
    displayPath: displayOf(path),
    read: async () => await readFile(path, 'utf8'),
    write: async content => await writeFileAtomic(path, content),
  }
}

/**
 * Write a plugin-owned file through a sibling temporary file and a rename, so
 * a reader never sees half of it. The rename replaces a symlink at `path`
 * rather than writing through it.
 * @param path - absolute file path; missing parent directories are created private.
 * @param content - the new text.
 */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  // Unique per write, not per millisecond: concurrent creates of the same
  // content-addressed card would otherwise share one temp file, and the
  // second rename would find it already moved. With distinct temps both
  // renames land, and identical bytes make the last one a no-op.
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temp, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temp, path)
  } catch (error) {
    // EEXIST means the name was taken and the file is not ours to remove.
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') await rm(temp, { force: true }).catch(() => {})
    throw error
  }
}

/**
 * Shorten an absolute store path for display: the OS home becomes `~`, which
 * {@link ownedPath} expands again when the model hands the path back.
 * @param path - absolute path.
 * @returns the display path.
 */
function displayOf(path: string): string {
  const home = homedir()
  return path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path
}

/**
 * Workspace files through the composed fs seam and the session-level sandbox
 * policy, as the official fs tools resolve them: the calling session's cwd is
 * the workspace root. Without the session policy a confining backend falls
 * back to its process-level default root and denies the write whenever the
 * session cwd lies elsewhere.
 * @param ctx - registrant context.
 * @param exec - the calling execution.
 * @returns the workspace root (undefined when the session has none) and a
 * resolver from a workspace-relative or absolute path to a card file.
 */
function workspaceFiles(ctx: Context, exec: CardExec): { root: string | undefined; open: (path: string) => Promise<CardFile> } {
  const sandboxPolicy = ctx.get('sandboxPolicy')?.resolve({
    ...exec.agent ? { session: exec.agent.session as never } : {},
  })
  const cwd = sandboxPolicy?.workspaceRoot ?? exec.agent?.session.header.cwd
  const resolveOpts = { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal }
  return {
    root: cwd,
    async open(path) {
      const target: FsTarget = await ctx.fs.resolve(path, resolveOpts)
      return {
        displayPath: target.displayPath,
        read: async () => await ctx.fs.readText(target, exec.signal),
        async write(content) {
          await ctx.fs.writeText(target, content, undefined, exec.signal, sandboxPolicy)
        },
      }
    },
  }
}
