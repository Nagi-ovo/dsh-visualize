import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { FragmentLintGate, STOP_AFTER } from '../src/lint-gate.ts'
import { visualizeTool } from '../src/tool.ts'

const MAX = 1_000_000
const BLOCKED = '<div id="lab"></div>\n<script>\nfetch("/api/rows").then(r => r.json())\n</script>'
const FIXED = '<div id="lab"></div>\n<script>\nvar rows = [1, 2, 3];\n</script>'

/** Message of the error a gate check throws. */
function rejection(gate: FragmentLintGate, fragment: string, sessionId: string | undefined, base?: string): string {
  try {
    gate.check({ fragment, maxBytes: MAX, sessionId, base })
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected a rejection')
}

describe('FragmentLintGate', () => {
  it('rejects with the code, position, excerpt, and fix the model needs', () => {
    const message = rejection(new FragmentLintGate(), BLOCKED, 's1')
    expect(message).toMatch(/^invalid visualization: nothing was rendered\./)
    expect(message).toContain('VZ007 error at 3:1')
    expect(message).toContain('| fetch("/api/rows").then(r => r.json())')
    expect(message).toContain('fix: inline the data')
  })

  it('lists warnings with the rejection so one retry fixes everything', () => {
    const message = rejection(new FragmentLintGate(), `${BLOCKED}\n<p style="color: #333">x</p>`, 's1')
    expect(message).toMatch(/Warnings \(not blocking[^]*VZ101 warn/)
  })

  it('passes warnings through on success', () => {
    const pass = new FragmentLintGate().check({ fragment: '<p id="a" style="color: #333">x</p>', maxBytes: MAX, sessionId: 's1' })
    expect(pass.warnings).toMatch(/^Lint warnings \(the card rendered/)
    expect(pass.warnings).toContain('VZ101 warn at 1:25')
    expect(new FragmentLintGate().check({ fragment: FIXED, maxBytes: MAX, sessionId: 's1' }).warnings).toBe('')
  })

  it(`tells the model to stop after ${STOP_AFTER} consecutive rejections by the same code`, () => {
    const gate = new FragmentLintGate()
    for (let i = 1; i < STOP_AFTER; i++) expect(rejection(gate, BLOCKED, 's1')).not.toContain('STOP')
    const third = rejection(gate, BLOCKED, 's1')
    expect(third).toContain('STOP: VZ007 has now rejected 3 visualize calls in a row')
    expect(third).toContain('Tell the user')
  })

  it('keeps streaks per session and resets them on success or a different code', () => {
    const gate = new FragmentLintGate()
    rejection(gate, BLOCKED, 's1')
    rejection(gate, BLOCKED, 's1')
    // Another session's rejections do not advance s1.
    expect(rejection(gate, BLOCKED, 's2')).not.toContain('STOP')
    // A success clears the streak.
    gate.check({ fragment: FIXED, maxBytes: MAX, sessionId: 's1' })
    expect(rejection(gate, BLOCKED, 's1')).not.toContain('STOP')
    // A different code in between breaks the run.
    rejection(gate, BLOCKED, 's3')
    rejection(gate, '<div id="a" style="color-scheme: dark"></div>', 's3')
    expect(rejection(gate, BLOCKED, 's3')).not.toContain('STOP')
    // Without a session id there is nothing to key on, so no guard.
    for (let i = 0; i < STOP_AFTER; i++) expect(rejection(gate, BLOCKED, undefined)).not.toContain('STOP')
  })

  it('labels an error the patch introduced and points at the patched card', () => {
    const base = '<div id="lab"></div>\n<script>\nvar rows = [1, 2, 3];\n</script>'
    const patched = base.replace('var rows = [1, 2, 3];', 'var rows = await fetch("/rows");')
    const message = rejection(new FragmentLintGate(), patched, 's1', base)
    expect(message).toContain('positions are line:column in the card as your patch would leave it')
    expect(message).toContain('VZ007 error at 3:18 [in your new_str]')
  })

  it('demotes errors already in the card so a patch elsewhere can land', () => {
    // A card from before linting, with two blocked calls far apart.
    const base = '<div id="lab"><p>v1</p></div>\n<script>\nfetch("/a");\n</script>\n<script>\nfetch("/b");\n</script>'
    const patched = base.replace('<p>v1</p>', '<p>v2</p>')
    const pass = new FragmentLintGate().check({ fragment: patched, maxBytes: MAX, sessionId: 's1', base })
    expect(pass.warnings).toContain('VZ007 error at 3:1 [already in the card before this patch]')
    // Fixing one of them leaves the other demoted, not blocking.
    const next = new FragmentLintGate().check({ fragment: patched.replace('fetch("/a");', 'var a = 1;'), maxBytes: MAX, sessionId: 's1', base: patched })
    expect(next.warnings).toContain('[already in the card before this patch]')
  })

  it('treats untouched text right at the edit boundary as pre-existing (Codex repro)', () => {
    const base = '<div id="lab"></div>\n<script>fetch("/a");new WebSocket("wss://b");</script>'
    // Deleting only the fetch leaves the WebSocket starting exactly at the cut.
    const deleted = new FragmentLintGate().check({ fragment: base.replace('fetch("/a");', ''), maxBytes: MAX, sessionId: 's1', base })
    expect(deleted.warnings).toContain('VZ007 error at 2:9 [already in the card before this patch]')
    // Replacing it with clean code leaves the WebSocket right after the inserted text.
    const replaced = new FragmentLintGate().check({ fragment: base.replace('fetch("/a");', 'var a = 1;'), maxBytes: MAX, sessionId: 's1', base })
    expect(replaced.warnings).toContain('[already in the card before this patch]')
    // And an edit ending right before an old finding.
    const before = '<div id="lab"></div>\n<script>var a = 1;fetch("/a");</script>'
    const ending = new FragmentLintGate().check({ fragment: before.replace('var a = 1;', 'var a = 2;'), maxBytes: MAX, sessionId: 's1', base: before })
    expect(ending.warnings).toContain('[already in the card before this patch]')
  })

  it('still rejects a finding a deletion or an adjacent insertion forms', () => {
    // Deleting the comment joins `fet` and `ch(` into a new call that straddles the cut.
    const joined = '<div id="lab"></div>\n<script>fet/**/ch("/a");</script>'
    expect(rejection(new FragmentLintGate(), joined.replace('/**/', ''), 's1', joined)).toContain('VZ007 error at 2:9 [in your new_str]')
    // Replacing `x` before `fetch(` makes it a call; touching the edit, but with no twin in the base.
    const prefixed = '<div id="lab"></div>\n<script>var xfetch = 1; xfetch("/a");</script>'
    const message = rejection(new FragmentLintGate(), prefixed.replace('xfetch("/a")', ';fetch("/a")'), 's1', prefixed)
    expect(message).toMatch(/VZ007 error at 2:\d+/u)
    expect(message).not.toContain('[already in the card before this patch]')
  })

  it('never lets a new error at the cut borrow a deleted error\'s identity (Codex repro)', () => {
    const base = '<div id="lab"></div>\n<script>var a=1;fetch("/a"); xfetch("/b");</script>'
    const patched = base.replace('var a=1;fetch("/a"); x', ';')
    expect(patched).toContain('<script>;fetch("/b");</script>')
    const message = rejection(new FragmentLintGate(), patched, 's1', base)
    expect(message).toContain('VZ007 error at 2:10')
    expect(message).not.toContain('[already in the card before this patch]')
    // The same deletion with the old call kept intact elsewhere stays pre-existing.
    const kept = '<div id="lab"></div>\n<script>var a=1;fetch("/a"); x;fetch("/b");</script>'
    const pass = new FragmentLintGate().check({ fragment: kept.replace('var a=1;fetch("/a"); x', ''), maxBytes: MAX, sessionId: 's1', base: kept })
    expect(pass.warnings).toContain('VZ007 error at 2:10 [already in the card before this patch]')
  })

  it('rejects a finding the patch turned from a warning into an error at the same place', () => {
    // The local fetch made the call a warning; deleting it makes the very same call an error.
    const base = '<div id="lab"></div>\n<script>function fetch(k) { return k }\nfetch("/a");</script>'
    const patched = base.replace('function fetch(k) { return k }', 'var rows = 1;')
    const message = rejection(new FragmentLintGate(), patched, 's1', base)
    expect(message).toContain('VZ007 error at 3:1')
    expect(message).not.toContain('[already in the card before this patch]')
  })
})

/** A tool over an in-memory workspace that records writes. */
function harness(files: Record<string, string> = {}) {
  const writes: string[] = []
  const ctx = {
    get: () => undefined,
    fs: {
      resolve: async (path: string, options: { cwd?: string }) => ({ displayPath: `${options.cwd}/${path}`, path }),
      readText: async (target: { path: string }) => files[target.path]!,
      writeText: async (target: { path: string }, content: string) => {
        writes.push(target.path)
        files[target.path] = content
        return { version: 1 }
      },
    },
  } as unknown as Context
  const tool = visualizeTool(ctx, MAX)
  const exec = { agent: { session: { header: { cwd: '/w', id: 'session-1' } } } } as never
  return { tool, exec, writes, files }
}

describe('visualize tool lint integration', () => {
  it('writes nothing when a create is rejected', async () => {
    const { tool, exec, writes } = harness()
    await expect(tool.execute({ fragment: BLOCKED, title: 'Rows' }, exec)).rejects.toThrow(/VZ007/)
    expect(writes).toEqual([])
  })

  it('appends warnings to the model-facing result of a rendered card', async () => {
    const { tool, exec, writes } = harness()
    const args = { fragment: '<p id="a" style="color: #333">x</p>', title: 'Note' }
    const value = await tool.execute(args, exec)
    expect(writes).toHaveLength(1)
    const text = tool.output.render(args, value as never).map(block => (block as { text: string }).text).join('\n')
    expect(text).toMatch(/^Rendered "Note" inline/)
    expect(text).toContain('VZ101 warn at 1:25')
  })

  it('omits the warnings block for a clean card', async () => {
    const { tool, exec } = harness()
    const args = { fragment: FIXED, title: 'Rows' }
    const value = await tool.execute(args, exec)
    expect(value).not.toHaveProperty('warnings')
    expect(tool.output.render(args, value as never)).toHaveLength(1)
  })

  it('lints the patched card of an update and leaves the file untouched on rejection', async () => {
    const { tool, exec, writes, files } = harness({ 'viz/rows.html': FIXED })
    await expect(tool.execute({
      action: 'update',
      path: 'viz/rows.html',
      title: 'Rows',
      old_str: 'var rows = [1, 2, 3];',
      new_str: 'var rows = new WebSocket("wss://x");',
    }, exec)).rejects.toThrow(/VZ007 error at 3:12 \[in your new_str\]/)
    expect(writes).toEqual([])
    expect(files['viz/rows.html']).toBe(FIXED)
  })
})
