/**
 * Shared tool factory for the ponytail.* namespace.
 *
 * Mirrors the dsh-tools pattern used by the harness's own bundles: a plain
 * ToolDefinition (name, description, parameters, output {schema, render},
 * execute) registered through ctx.tools.register. The namespace prefix is
 * applied once here so every tool name starts with `ponytail.`.
 */
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

export interface PonytailToolSpec {
  /** Tool name without the `ponytail.` prefix. */
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly outputSchema: Record<string, unknown>
  execute(args: unknown, ctx: ToolRunContext): Promise<unknown> | unknown
}

export function toolName(name: string): string {
  return `ponytail.${name}`
}

function renderText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

export function defineTool(spec: PonytailToolSpec): ToolDefinition {
  return {
    name: toolName(spec.name),
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: spec.outputSchema,
      render(_args: unknown, value: unknown): ContentBlock[] {
        return [{ type: 'text', text: renderText(value) }]
      },
    },
    async execute(args: unknown, exec: ToolRunContext): Promise<unknown> {
      return spec.execute(args, exec)
    },
  }
}

/** Standard string-argument JSON Schema fragment. */
export function strParam(description: string): Record<string, unknown> {
  return { type: 'string', description }
}
