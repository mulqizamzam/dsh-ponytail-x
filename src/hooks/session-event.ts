/**
 * session/event hook — turn accounting and mode reset at turn boundaries.
 *
 * Verified contract: `session/event` is EMIT-mode with payload
 * `(session, event)`; `event.type` is a durable type (turn/start, turn/end,
 * step/end, tool/result, ...). Lifecycle start/end rides on
 * `session/created` / `session/disposed`.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { PonytailXPolicy } from '../policy-service.ts'

function sessionIdOf(session: Session): string {
  return session?.id ?? session?.header?.id ?? 'ponytail-x:unknown-session'
}

export function wireSessionEvent(ctx: Context): void {
  ctx.on('session/created', (session: Session) => {
    const svc = ctx.ponytailX as PonytailXPolicy
    const id = sessionIdOf(session)
    const state = svc.sessions.ensure(id, Date.now())
    svc.sessions.update(id, { startedAt: Date.now(), lastStepAt: Date.now() })
    ctx.logger('ponytail-x').debug(`session ${id} observed (mode ${state.mode ?? 'unset'})`)
  })

  ctx.on('session/event', (session: Session, event: Readonly<SessionEvent>) => {
    const svc = ctx.ponytailX as PonytailXPolicy
    switch (event.type) {
      case 'turn/start': {
        const id = sessionIdOf(session)
        const state = svc.sessions.ensure(id, Date.now())
        svc.sessions.update(id, { turns: state.turns + 1 })
        break
      }
      case 'turn/end': {
        const id = sessionIdOf(session)
        svc.sessions.update(id, { lastStepAt: Date.now() })
        break
      }
      default:
        break
    }
  })

  ctx.on('session/disposed', (session: Session) => {
    const svc = ctx.ponytailX as PonytailXPolicy
    const id = sessionIdOf(session)
    const state = svc.sessions.get(id)
    ctx.logger('ponytail-x').debug(
      `session ${id} disposed (turns=${state?.turns ?? 0} steps=${state?.steps ?? 0} tools=${state?.toolCalls ?? 0})`,
    )
  })
}
