/**
 * llm/stream hook — approximate output-token accounting.
 *
 * Verified contract: `llm/stream` is a WATERFALL over the token stream; a
 * listener MUST call next() and pass chunks through. Chunks carry no exact
 * usage, so the count is an approximation (chars/4) and is labelled as such
 * wherever it is reported. The stream itself is never altered.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { PonytailXPolicy } from '../policy-service.ts'

function chunkText(chunk: StreamChunk): string {
  const c = chunk as unknown as { text?: unknown; content?: unknown; delta?: unknown }
  if (typeof c.text === 'string') return c.text
  if (typeof c.content === 'string') return c.content
  if (typeof c.delta === 'string') return c.delta
  return ''
}

export function wireLlmStream(ctx: Context): void {
  ctx.on('llm/stream', async function* (
    options: GenerateOptions,
    next: () => AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
    const svc = ctx.ponytailX as PonytailXPolicy
    const model = options.model ?? 'unknown'
    let tokens = 0
    for await (const raw of next()) {
      const text = chunkText(raw)
      if (text) tokens += Math.ceil(text.length / 4)
      yield raw
    }
    svc.accountModelTokens(model, tokens)
  })
}
