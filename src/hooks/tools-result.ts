/**
 * tools/result hook — tool-call counting per session.
 *
 * Verified contract: `tools/result` is EMIT-mode with payload
 * `(exec, result)`. This observer is accounting-only; it never inspects or
 * rewrites results. The session id is resolved from the exec payload when the
 * host provides it, otherwise counted under a global bucket.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { PonytailXPolicy } from '../policy-service.ts'

const GLOBAL_BUCKET = 'ponytail-x:global'

export function wireToolsResult(ctx: Context): void {
  ctx.on('tools/result', (exec: Readonly<ToolExecution>) => {
    const svc = ctx.ponytailX as PonytailXPolicy
    const id = exec.agent?.session?.id ?? exec.agent?.session?.header?.id ?? GLOBAL_BUCKET
    svc.accountToolCall(id)
  })
}
