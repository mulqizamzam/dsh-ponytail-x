/**
 * Bundle entry: the policy service IS the plugin (dsh-tools pattern).
 *
 * The default export is the Cordis Service class; cordis.patch.yml inserts
 * it under the id `ponytail-x`, so `ctx.ponytailX` resolves the service.
 */
import './types/message-source.ts'
export { default } from './policy-service.ts'
export { PonytailXPolicy } from './policy-service.ts'
export type { PonytailXConfig } from './policy-service.ts'
export { validateConfig, ConfigError } from './config/schema.ts'
