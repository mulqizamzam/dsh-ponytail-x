/**
 * Tool registry for the ponytail.* namespace.
 *
 * Every tool receives the service at registration time; the registry is the
 * only wiring point, mirroring the harness bundle pattern.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { PonytailXPolicy } from '../policy-service.ts'
import { modeTool } from './mode.ts'
import { selectTool } from './select.ts'
import { modelTool } from './model.ts'
import { statusTool } from './status.ts'

export function registerTools(ctx: Context): number {
  const service = ctx.ponytailX as PonytailXPolicy
  const tools = [
    modeTool(service),
    selectTool(service),
    modelTool(service),
    statusTool(service),
  ]
  for (const tool of tools) ctx.tools.register(tool)
  return tools.length
}
