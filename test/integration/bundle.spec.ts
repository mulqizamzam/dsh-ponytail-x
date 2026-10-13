/**
 * Integration: the bundle activates in a real Cordis host with the real dsh
 * services, registers the ponytail-* tools, and every hook fires with the
 * verified waterfall/emit contracts.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import PonytailXPolicy from '../../src/index.ts'

async function setup(config: Record<string, unknown> = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(PonytailXPolicy, config)
  return ctx
}

function waterfall(ctx: Context, event: string, payload: unknown, next: () => Promise<unknown>) {
  return (ctx as unknown as {
    waterfall(t: unknown, n: string, p: unknown, next: () => Promise<unknown>): Promise<unknown>
  }).waterfall(ctx, event, payload, next)
}

function execute(ctx: Context, name: string, args: unknown) {
  return ctx.tools.execute({ signal: new AbortController().signal, callId: 't1', name, arguments: args })
}

function preStepPayload(messages: unknown[], turn = 1, step = 1) {
  return {
    agent: { session: { id: 'session-int', header: { id: 'session-int', cwd: '/tmp' } } },
    messages,
    turn,
    step,
    signal: new AbortController().signal,
  }
}

function userMessage(text: string) {
  return { role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }
}

describe('activation', () => {
  it('service resolves on ctx.ponytailX with injections satisfied', async () => {
    const ctx = await setup()
    try {
      assert.ok(ctx.ponytailX, 'ctx.ponytailX must exist after plugin load')
      assert.equal(typeof ctx.ponytailX.overrideSetting, 'function')
      assert.equal(ctx.ponytailX.config.defaultMode, 'full')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('tools register under the ponytail- namespace only', async () => {
    const ctx = await setup()
    try {
      const names = ctx.tools.schemas().map(s => s.name)
      for (const expected of ['ponytail-mode', 'ponytail-select', 'ponytail-model', 'ponytail-status']) {
        assert.ok(names.includes(expected), `expected ${expected} in ${names.join(',')}`)
      }
      for (const name of names) {
        assert.match(name, /^ponytail-/, `tool ${name} must stay in the ponytail- namespace`)
      }
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects a bad patch config at construction with a field path', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await assert.rejects(
      async () => { await ctx.plugin(PonytailXPolicy, { defaultMode: 'review' } as Record<string, unknown>) },
      /defaultMode expected/,
    )
    await ctx.fiber.dispose()
  })

  // Proof test for the dead-patch-key defect: the shipped patch used to carry
  // models.A/models.B, which the schema does not name. The bundle must refuse
  // to load with a field path, not silently fall back to defaults.
  it('refuses to load with patch keys the schema does not name', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await assert.rejects(
      async () => { await ctx.plugin(PonytailXPolicy, { models: { A: { provider: 'nine-router', model: 'x' } } } as Record<string, unknown>) },
      /models\.A is not a recognized config key/,
    )
    await ctx.fiber.dispose()
  })
})

describe('tools', () => {
  it('ponytail-select classifies deterministically and has no side effects', async () => {
    const ctx = await setup()
    try {
      const first = await execute(ctx, 'ponytail-select', { text: 'why did the import keep failing since the deploy? it used to work' })
      assert.equal(first.isError, false, JSON.stringify(first.content))
      const value = first.value as { mode: string; scores: unknown }
      assert.equal(value.mode, 'autopsy')
      const second = await execute(ctx, 'ponytail-select', { text: 'why did the import keep failing since the deploy? it used to work' })
      assert.deepEqual(second.value, first.value)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('ponytail-mode sets and clears a session override', async () => {
    const ctx = await setup()
    try {
      const agent = { session: { id: 'session-mode', header: { id: 'session-mode' } } }
      const set = await ctx.tools.execute({
        signal: new AbortController().signal, callId: 'm1', name: 'ponytail-mode',
        arguments: { mode: 'ultra' }, agent,
      } as never)
      assert.equal((set.value as { mode: string }).mode, 'ultra')
      assert.equal(ctx.ponytailX.sessions.get('session-mode')?.override, 'ultra')
      const off = await ctx.tools.execute({
        signal: new AbortController().signal, callId: 'm2', name: 'ponytail-mode',
        arguments: { mode: 'off' }, agent,
      } as never)
      assert.equal((off.value as { mode: string }).mode, 'off')
      assert.equal(ctx.ponytailX.sessions.get('session-mode')?.override, 'off')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('ponytail-mode rejects an unknown mode', async () => {
    const ctx = await setup()
    try {
      const result = await execute(ctx, 'ponytail-mode', { mode: 'review' })
      assert.equal(result.isError, true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('ponytail-status reports the calling session', async () => {
    const ctx = await setup()
    try {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal, callId: 's1', name: 'ponytail-status',
        arguments: {}, agent: { session: { id: 'session-status', header: { id: 'session-status' } } },
      } as never)
      assert.equal(result.isError, false)
      assert.match(JSON.stringify(result.value), /session-status/)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('ponytail-status --all keeps the session field schema-valid', async () => {
    const ctx = await setup()
    try {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal, callId: 's2', name: 'ponytail-status',
        arguments: { all: true }, agent: { session: { id: 'session-status2', header: { id: 'session-status2' } } },
      } as never)
      assert.equal(result.isError, false, JSON.stringify(result.content))
      const value = result.value as { session: unknown; sessions: unknown[] }
      assert.equal(typeof value.session, 'object', 'session must stay an object, never null')
      assert.ok(Array.isArray(value.sessions))
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

describe('hooks', () => {
  it('agent/pre-step passes the decision through and appends the injection', async () => {
    const ctx = await setup()
    try {
      const decision = await waterfall(ctx, 'agent/pre-step', preStepPayload([userMessage('fix this crash\nat foo (/app/index.js:1:2)')]), async () => ({ kind: 'enter', messages: [userMessage('fix this crash')] }))
      const typed = decision as { kind: string; messages: { source?: { kind?: string } }[] }
      assert.equal(typed.kind, 'enter')
      const injections = typed.messages.filter(m => m.source?.kind === 'ponytail-x')
      assert.equal(injections.length, 1, 'exactly one ponytail-x instructions message')
      assert.match(JSON.stringify(injections[0]), /Active mode: surgical/)
      assert.equal(ctx.ponytailX.sessions.get('session-int')?.mode, 'surgical')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('agent/pre-step replaces an earlier injection instead of accumulating', async () => {
    const ctx = await setup()
    try {
      const first = await waterfall(ctx, 'agent/pre-step', preStepPayload([userMessage('fix this crash\nat foo (/app/index.js:1:2)')], 1, 1), async () => ({ kind: 'enter', messages: [userMessage('fix this crash')] }))
      const carried = (first as { messages: unknown[] }).messages
      const second = await waterfall(ctx, 'agent/pre-step', preStepPayload([userMessage('fix this crash\nat foo (/app/index.js:1:2)')], 1, 2), async () => ({ kind: 'enter', messages: carried }))
      const injections = (second as { messages: { source?: { kind?: string } }[] }).messages
        .filter(m => m.source?.kind === 'ponytail-x')
      assert.equal(injections.length, 1, 'a second step must not duplicate the injection')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('agent/pre-step respects the session override off', async () => {
    const ctx = await setup()
    try {
      ctx.ponytailX.overrideSetting('session-int', 'off')
      const decision = await waterfall(ctx, 'agent/pre-step', preStepPayload([userMessage('anything')]), async () => ({ kind: 'enter', messages: [userMessage('anything')] }))
      const typed = decision as { messages: { source?: { kind?: string } }[] }
      assert.equal(typed.messages.filter(m => m.source?.kind === 'ponytail-x').length, 0)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  // End-to-end proof for the dead-config-key defect: with `defaultMode` set
  // to a non-full mode, a signal-free step must run in that mode. Before the
  // fix resolveMode hardcoded 'full' and the configured value never reached
  // the injected block or the session record.
  it('agent/pre-step honours a configured non-full defaultMode', async () => {
    const signalFree = 'update the total row in src/orders/Table.tsx and src/api/orders.ts'
    const ctx = await setup({ defaultMode: 'autopsy' })
    try {
      assert.equal(ctx.ponytailX.config.defaultMode, 'autopsy', 'the config value must survive resolution')
      const decision = await waterfall(
        ctx, 'agent/pre-step',
        preStepPayload([userMessage(signalFree)]),
        async () => ({ kind: 'enter', messages: [userMessage(signalFree)] }),
      )
      const messages = (decision as { messages: { source?: { kind?: string } }[] }).messages
      const injection = messages.filter(m => m.source?.kind === 'ponytail-x')
      assert.equal(injection.length, 1, 'exactly one injection')
      assert.match(JSON.stringify(injection[0]), /Active mode: autopsy/)
      assert.equal(ctx.ponytailX.sessions.get('session-int')?.mode, 'autopsy')
      assert.equal(ctx.ponytailX.sessions.get('session-int')?.source, 'default')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('the shipped defaultMode: full still resolves to full', async () => {
    const signalFree = 'update the total row in src/orders/Table.tsx and src/api/orders.ts'
    const ctx = await setup()
    try {
      const decision = await waterfall(
        ctx, 'agent/pre-step',
        preStepPayload([userMessage(signalFree)]),
        async () => ({ kind: 'enter', messages: [userMessage(signalFree)] }),
      )
      const messages = (decision as { messages: { source?: { kind?: string } }[] }).messages
      assert.match(JSON.stringify(messages.filter(m => m.source?.kind === 'ponytail-x')[0]), /Active mode: full/)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('session/event counts turns; session/created opens the entry', async () => {
    const ctx = await setup()
    try {
      ctx.emit('session/created', { id: 'session-events', header: { id: 'session-events' } } as never)
      ctx.emit('session/event', { id: 'session-events', header: { id: 'session-events' } } as never, { type: 'turn/start' } as never)
      ctx.emit('session/event', { id: 'session-events', header: { id: 'session-events' } } as never, { type: 'turn/start' } as never)
      ctx.emit('session/event', { id: 'session-events', header: { id: 'session-events' } } as never, { type: 'turn/end' } as never)
      assert.equal(ctx.ponytailX.sessions.get('session-events')?.turns, 2)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('llm/stream passes chunks through and accounts approximate tokens', async () => {
    const ctx = await setup()
    try {
      async function* source() {
        yield { text: 'hello ' }
        yield { text: 'world' }
      }
      const stream = await waterfall(ctx, 'llm/stream', { model: 'test-model' }, source) as AsyncIterable<{ text: string }>
      const out: string[] = []
      for await (const chunk of stream) out.push(chunk.text)
      assert.deepEqual(out, ['hello ', 'world'], 'stream must pass through unmodified')
      assert.equal(ctx.ponytailX.modelTokens.get('test-model'), 4, 'per-chunk accumulation: ceil(6/4) + ceil(5/4) = 2 + 2')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  // Proof test for the dead session metric: SessionMetrics.approxTokens was
  // documented as llm/stream-derived but nothing ever wrote it (stayed 0).
  it('llm/stream attributes tokens to the session stamped on the request', async () => {
    const ctx = await setup()
    try {
      async function* source() {
        yield { text: 'abcdefgh' }
      }
      const stream = await waterfall(ctx, 'llm/stream', { model: 'test-model', sessionId: 'session-tokens' }, source) as AsyncIterable<{ text: string }>
      for await (const _chunk of stream) { /* drain */ }
      assert.equal(ctx.ponytailX.modelTokens.get('test-model'), 2)
      assert.equal(ctx.ponytailX.sessions.get('session-tokens')?.approxTokens, 2)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('renderInjection never leaves a lone surrogate when truncating', async () => {
    const reasons = ['🚀🚀🚀🚀🚀 reason text']
    const full = await setup({ injection: { maxChars: 100_000 } })
    let firstHigh: number
    try {
      const whole = full.ponytailX.renderInjection('ultra', reasons)
      firstHigh = whole.search(/[\uD800-\uDBFF]/)
      assert.ok(firstHigh >= 0, 'the rendered body must contain an astral char')
    } finally {
      await full.fiber.dispose()
    }
    // maxChars = firstHigh + 2 puts the old slice() cut between the high and
    // the low surrogate of the first 🚀.
    const ctx = await setup({ injection: { maxChars: firstHigh + 2 } })
    try {
      const body = ctx.ponytailX.renderInjection('ultra', reasons)
      assert.match(body, /…$/)
      assert.doesNotMatch(body, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('tools/result counts tool calls under the resolved session', async () => {
    const ctx = await setup()
    try {
      ctx.emit('tools/result', { agent: { session: { id: 'session-tools', header: { id: 'session-tools' } } } } as never, { content: [] } as never)
      ctx.emit('tools/result', { agent: { session: { id: 'session-tools', header: { id: 'session-tools' } } } } as never, { content: [] } as never)
      assert.equal(ctx.ponytailX.sessions.get('session-tools')?.toolCalls, 2)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
