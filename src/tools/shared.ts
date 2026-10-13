/**
 * Shared tool factory for the ponytail-* tool names.
 *
 * Mirrors the dsh-tools pattern used by the harness's own bundles: a plain
 * ToolDefinition (name, description, parameters, output {schema, render},
 * execute) registered through ctx.tools.register. The namespace prefix is
 * applied once here so every tool name starts with `ponytail-`. Kebab-case
 * (never dotted) — the OpenAI-completions provider grammar
 * `^[a-zA-Z0-9_-]+$` rejects dots in `tools[N].function.name`.
 */
import { ToolArgsError, assertObjectJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

export interface PonytailToolSpec {
  /** Tool name without the `ponytail-` prefix. */
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly outputSchema: Record<string, unknown>
  execute(args: unknown, ctx: ToolRunContext): Promise<unknown> | unknown
}

export function toolName(name: string): string {
  return `ponytail-${name}`
}

function renderText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

export function defineTool(spec: PonytailToolSpec): ToolDefinition {
  // `parameters` is behaviorally load-bearing now that execute() enforces it,
  // and register() only asserts `output.schema` — nothing would ever check
  // that it is a schema this harness can actually enforce. Assert once, here,
  // at definition time. Without it, out-of-subset keywords are silently
  // IGNORED (`minLength: 3` would validate `{text:'a'}` clean), a mistyped
  // `type` collapses every call into one misleading root violation that
  // blames the model, and a null schema throws a raw TypeError. Failing at
  // definition time turns all three into one loud, correctly-attributed load
  // failure instead of a permanent silent hole.
  assertObjectJsonSchema(spec.parameters)
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
      // Model arguments are untrusted input at a trust boundary, and the
      // registry does NOT check them against `parameters` — it only snapshots
      // lossless JSON and validates the OUTPUT value. Without this the schema
      // merely described the call: `{"mode":"ULTRA"}` slipped past the enum
      // and mutated session state, while `{"mode":123}` was reported to the
      // model as a successful read. Same validation the harness's own
      // defineTool performs, and the same error class, so a bad call is
      // classified INVALID_ARGS instead of a generic failure.
      const violations = validateJsonSchemaValue(spec.parameters, args, '')
      if (violations.length > 0) throw new ToolArgsError(violations)
      return spec.execute(args, exec)
    },
  }
}

/** Standard string-argument JSON Schema fragment. */
export function strParam(description: string): Record<string, unknown> {
  return { type: 'string', description }
}
