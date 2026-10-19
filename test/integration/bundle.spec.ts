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

  // Gesture stickiness. A gesture is a user INSTRUCTION, not a per-step
  // inference: it must outlive the step it arrived in. It does not, on its own,
  // because the host claims the turn's user message only on 'next-turn'
  // (agent-loop/src/agent.ts:311 starts at 'next-turn', :364 switches to
  // 'next-step'; inbox.ts:111 pushes from next-turn only when the target is
  // 'next-turn'). Every later step of the turn therefore arrives with an empty
  // message list, gestureMode('') returns null, and resolution silently falls
  // through to the config default. Both directions hurt: an escalation is lost
  // mid-turn, and `stop ponytail` re-arms the injection two steps later.
  it('a mode gesture survives the step it arrived in', async () => {
    const ctx = await setup({ defaultMode: 'full' })
    try {
      const first = await waterfall(
        ctx, 'agent/pre-step',
        preStepPayload([userMessage('/ponytail ultra audit this repo')], 1, 1),
        async () => ({ kind: 'enter', messages: [userMessage('/ponytail ultra audit this repo')] }),
      )
      assert.match(JSON.stringify(first), /Active mode: ultra/, 'step 1 must run the gesture')
      const second = await waterfall(
        ctx, 'agent/pre-step', preStepPayload([], 1, 2),
        async () => ({ kind: 'enter', messages: [] }),
      )
      assert.match(JSON.stringify(second), /Active mode: ultra/, 'step 2 has no user message and must still run ultra')
      assert.equal(ctx.ponytailX.sessions.get('session-int')?.mode, 'ultra')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('stop ponytail stays off for the rest of the turn', async () => {
    const ctx = await setup()
    try {
      const injectionCount = (decision: unknown) => (decision as { messages: { source?: { kind?: string } }[] }).messages
        .filter(message => message.source?.kind === 'ponytail-x').length
      const first = await waterfall(
        ctx, 'agent/pre-step',
        preStepPayload([userMessage('stop ponytail')], 1, 1),
        async () => ({ kind: 'enter', messages: [userMessage('stop ponytail')] }),
      )
      assert.equal(injectionCount(first), 0, 'step 1 must not inject')
      const second = await waterfall(
        ctx, 'agent/pre-step', preStepPayload([], 1, 2),
        async () => ({ kind: 'enter', messages: [] }),
      )
      assert.equal(injectionCount(second), 0, 'step 2 must not re-arm injection after the user said stop')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('a later gesture outranks the one it replaces', async () => {
    const ctx = await setup()
    try {
      await waterfall(
        ctx, 'agent/pre-step',
        preStepPayload([userMessage('/ponytail ultra one')], 1, 1),
        async () => ({ kind: 'enter', messages: [] }),
      )
      const second = await waterfall(
        ctx, 'agent/pre-step',
        preStepPayload([userMessage('/ponytail lite two')], 2, 1),
        async () => ({ kind: 'enter', messages: [userMessage('/ponytail lite two')] }),
      )
      assert.match(JSON.stringify(second), /Active mode: lite/, 'the newest gesture must win, not the sticky one it replaces')
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

// Proof tests for the unvalidated-input defect: the local defineTool
  // forwarded `args` straight to the tool body, so each tool's `parameters`
  // schema only ever DESCRIBED the call to the model and was never ENFORCED.
  // The harness registry does not validate args either — it only checks
  // lossless JSON and the output schema. Upstream dsh-tools defineTool does
  // validate and throws ToolArgsError (INVALID_ARGS).
  describe('tool argument validation at the trust boundary', () => {
    const execWith = (ctx: Context, name: string, args: unknown, sessionId: string) =>
      ctx.tools.execute({
        signal: new AbortController().signal, callId: 'v', name,
        arguments: args, agent: { session: { id: sessionId, header: { id: sessionId } } },
      } as never) as Promise<{
        isError: boolean
        content?: { type: string; text: string }[]
        error?: { message: string; info?: { code?: string } }
      }>

    it('rejects an enum violation instead of silently mutating session state', async () => {
      const ctx = await setup()
      try {
        const result = await execWith(ctx, 'ponytail-mode', { mode: 'ULTRA' }, 'enum-case')
        assert.equal(result.isError, true, 'an out-of-enum mode must be an error, not a silent success')
        assert.match(result.content?.[0]?.text ?? '', /invalid arguments/)
        assert.equal(
          ctx.ponytailX.sessions.get('enum-case')?.override ?? null, null,
          'the rejected call must not have written an override (an entry may still exist: tools/result counts the failed call)',
        )
      } finally { await ctx.fiber.dispose() }
    })

    it('rejects a wrong-typed argument that used to be silently treated as a read', async () => {
      const ctx = await setup()
      try {
        const result = await execWith(ctx, 'ponytail-mode', { mode: 123 }, 'wrong-type')
        assert.equal(result.isError, true, '{"mode":123} is not a string; it must not report success')
        assert.match(result.content?.[0]?.text ?? '', /invalid arguments/)
      } finally { await ctx.fiber.dispose() }
    })

    it('classifies the rejection as INVALID_ARGS, not a generic tool error', async () => {
      const ctx = await setup()
      try {
        const result = await execWith(ctx, 'ponytail-mode', { mode: 42 }, 'code-check')
        assert.equal(result.isError, true)
        assert.equal(result.error?.info?.code, 'INVALID_ARGS')
      } finally { await ctx.fiber.dispose() }
    })

    it('enforces a required property', async () => {
      const ctx = await setup()
      try {
        const result = await execWith(ctx, 'ponytail-select', {}, 'required')
        assert.equal(result.isError, true)
        assert.match(result.content?.[0]?.text ?? '', /invalid arguments/)
      } finally { await ctx.fiber.dispose() }
    })

    it('rejects undeclared properties (additionalProperties: false)', async () => {
      const ctx = await setup()
      try {
        const result = await execWith(ctx, 'ponytail-status', { all: true, bogus: 1 }, 'extra-prop')
        assert.equal(result.isError, true)
        assert.match(result.content?.[0]?.text ?? '', /invalid arguments/)
      } finally { await ctx.fiber.dispose() }
    })

    it('still accepts the documented calls, including empty-argument tools', async () => {
      const ctx = await setup()
      try {
        for (const [name, args] of [
          ['ponytail-mode', {}],
          ['ponytail-mode', { mode: 'ultra' }],
          ['ponytail-mode', { text: 'rename the button label to Save' }],
          ['ponytail-select', { text: 'rename the button label to Save' }],
          ['ponytail-status', {}],
          ['ponytail-status', { all: true }],
          ['ponytail-model', {}],
        ] as const) {
          const result = await execWith(ctx, name, args, 'valid-calls')
          assert.equal(result.isError, false, `${name} ${JSON.stringify(args)} must stay valid: ${result.content?.[0]?.text}`)
        }
      } finally { await ctx.fiber.dispose() }
    })
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

  // Proof test for the dead-accounting defect: the flush sat AFTER the
  // `for await`, so it was unreachable on every early-exit path. The harness's
  // own consumer throws inside its loop body on abort, which closes this
  // generator at the `yield` — every user interrupt therefore counted 0
  // tokens while the partial assistant output was durably committed.
  // Each case below delivers exactly ONE chunk (8 chars = 2 tokens) and then
  // stops, so the correct count is 2 — before the fix it was 0.
  it('llm/stream accounts the partial output when the consumer aborts or breaks early', async () => {
    const ctx = await setup()
    try {
      async function* source() {
        yield { text: 'abcdefgh' }
        yield { text: 'ijklmnop' }
      }
      // consumer throws mid-stream — what Ctrl-C / the stop button does
      await assert.rejects(async () => {
        for await (const _chunk of await waterfall(
          ctx, 'llm/stream', { model: 'abort-model', sessionId: 'session-abort' }, source,
        )) {
          throw new Error('aborted')
        }
      }, /aborted/)
      assert.equal(ctx.ponytailX.modelTokens.get('abort-model'), 2, 'an aborted turn must still be counted')
      assert.equal(ctx.ponytailX.sessions.get('session-abort')?.approxTokens, 2)

      // consumer breaks out of the loop after the first chunk
      for await (const _chunk of await waterfall(
        ctx, 'llm/stream', { model: 'break-model', sessionId: 'session-break' }, source,
      )) {
        break
      }
      assert.equal(ctx.ponytailX.modelTokens.get('break-model'), 2, 'an early break must still be counted')
      assert.equal(ctx.ponytailX.sessions.get('session-break')?.approxTokens, 2)

      // a stream nobody reads at all still must not corrupt the ledger
      assert.equal(ctx.ponytailX.modelTokens.get('abort-model'), 2, 'no double counting from the later runs')
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
