import { describe, expect, it } from 'vitest'
import type { Context } from 'cordis'
import { visualizeTool } from '../src/tool.ts'

/**
 * The workspace write must run under the *session-level* sandbox policy
 * (regression for issue #1): resolve `ctx.get('sandboxPolicy')` with the
 * calling session, resolve the path against the policy's workspace root, and
 * forward the policy to `writeText` — otherwise a confining backend falls back
 * to its process-level default root and denies the write.
 */
describe('visualizeTool sandbox policy', () => {
  it('resolves the session policy and forwards it to the workspace write', async () => {
    const session = { header: { cwd: '/work/session' } }
    const policy = { mode: 'workspace-write', workspaceRoot: '/work/session' }
    const calls: { resolveRequest?: unknown; resolveCwd?: string | undefined; writePolicy?: unknown } = {}
    const ctx = {
      get: (name: string) => name === 'sandboxPolicy'
        ? { resolve: (request: unknown) => { calls.resolveRequest = request; return policy } }
        : undefined,
      fs: {
        resolve: async (path: string, options: { cwd?: string }) => {
          calls.resolveCwd = options.cwd
          return { displayPath: `${options.cwd}/${path}` }
        },
        writeText: async (_t: unknown, _c: unknown, _e: unknown, _s: unknown, sandboxPolicy: unknown) => {
          calls.writePolicy = sandboxPolicy
          return { version: 1 }
        },
      },
    } as unknown as Context

    const tool = visualizeTool(ctx, 1000)
    const value = await tool.execute(
      { fragment: '<div id="lab">x</div>', title: 'Lab' },
      { agent: { session } } as never,
    )

    expect(calls.resolveRequest).toEqual({ session })
    expect(calls.resolveCwd).toBe('/work/session')
    expect(calls.writePolicy).toBe(policy)
    expect((value as { path: string }).path).toMatch(/^\/work\/session\/viz\/lab-[0-9a-f]{8}\.html$/)
  })

  it('still writes without a sandboxPolicy service in the composition', async () => {
    const calls: { writePolicy?: unknown } = {}
    const ctx = {
      get: () => undefined,
      fs: {
        resolve: async (path: string, options: { cwd?: string }) => ({ displayPath: `${options.cwd}/${path}` }),
        writeText: async (_t: unknown, _c: unknown, _e: unknown, _s: unknown, sandboxPolicy: unknown) => {
          calls.writePolicy = sandboxPolicy
          return { version: 1 }
        },
      },
    } as unknown as Context

    const tool = visualizeTool(ctx, 1000)
    await tool.execute(
      { fragment: '<div id="lab">x</div>' },
      { agent: { session: { header: { cwd: '/work/session' } } } } as never,
    )
    expect(calls.writePolicy).toBeUndefined()
  })
})
