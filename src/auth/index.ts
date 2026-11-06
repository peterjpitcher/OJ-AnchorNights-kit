// @anchor-nights/kit/auth: the server half of the auth module (spec K5, S1).
//
// Server only: it handles the service-role client, recovery grants and the
// audit key. Screens are in @anchor-nights/kit/auth/screens, the proxy in
// @anchor-nights/kit/auth/proxy, security headers in
// @anchor-nights/kit/auth/headers, migration templates in
// @anchor-nights/kit/auth/sql, and browser-safe helpers in
// @anchor-nights/kit/auth/shared (all re-exported here too).
import 'server-only';

export * from './shared';
export { defineAuthConfig, raiseAlert, type AuthConfig, type AuthConfigInput } from './server/config';
export { authEnvSchema, readAuthEnv, type AuthEnv } from './server/env';
export type { AnySupabaseClient, AuthAlert, AuthAlertHandler, CookieJar, CookieOptions, HeaderBag } from './server/types';
export type { AuthDeps } from './server/deps';
export { createAuthActions, recoveryCookieName, RECOVERY_GRANT_TTL_SECONDS, BAN_FOREVER, type AuthActions } from './server/actions';
export {
  createAdminActions,
  createAuthMaintenance,
  type AdminActions,
  type AdminDeps,
  type PendingInvite,
  type StaffMember,
} from './server/admin';
export {
  createAuthHelpers,
  AuthServiceUnavailableError,
  type AuthHelpers,
  type AuthHelpersDeps,
  type Authorised,
} from './server/helpers';
export { readSession, type SessionState } from './server/session';
export {
  validatePassword,
  createHibpChecker,
  HIBP_RANGE_URL,
  HIBP_TIMEOUT_MS,
  type BreachChecker,
  type BreachResult,
  type PasswordCheck,
  type PasswordProblem,
  type ValidatePasswordOptions,
} from './server/password-policy';
export { captchaTokenFrom, verifyTurnstile, SITEVERIFY_URL, type TurnstileFailure, type VerifyTurnstileInput } from './server/turnstile';
export { memoryRateLimiter, supabaseRateLimiter, type AuthRateLimiter, type ThrottleInput, type ThrottleScope } from './server/rate-limit';
export {
  createAuthAuditor,
  supabaseAuditSink,
  type AuditSink,
  type AuthAuditEvent,
  type AuthAuditEventName,
  type AuthAuditOutcome,
  type AuthAuditor,
  type AuthAuditRow,
} from './server/audit';
export { requestContext, isSameOriginRequest, type RequestContext } from './server/request';
export { canonicalEmail, emailPseudonym, parseHmacKey, randomToken, sha256Hex } from './server/crypto';
export { isServiceError, isCaptchaError } from './server/errors';
