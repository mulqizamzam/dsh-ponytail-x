/**
 * Durable-source declaration for Ponytail X instruction injections.
 *
 * The harness message-source union is merge-extensible: each producer
 * declares its own `kind` in its own module (cf. dsh-skill's
 * 'skill-invocation'). Injection rides a plain user message exactly like the
 * skill-invocation path so transcript consumers see 'instructions' form.
 */
import type { ModeId } from '../modes.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'ponytail-x': {
      readonly kind: 'ponytail-x'
      readonly form: 'instructions'
      readonly mode: ModeId
    }
  }
}
