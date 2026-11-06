import { raiseAlert, type AuthConfig } from './config';
import { emailPseudonym } from './crypto';
import type { AnySupabaseClient } from './types';

// Auth event audit (standard section 11). Written server-side to auth_audit
// with the service role. A failed write never blocks the sign-in or reset it
// describes: it raises an alert instead and the caller carries on.

export type AuthAuditEventName =
  | 'sign_in'
  | 'sign_out'
  | 'password_reset_requested'
  | 'password_recovery_confirmed'
  | 'password_updated'
  | 'invite_sent'
  | 'invite_accepted'
  | 'invite_cancelled'
  | 'account_banned'
  | 'account_unbanned'
  | 'account_deactivated'
  | 'account_reactivated'
  | 'role_changed'
  | 'email_changed'
  | 'account_deleted'
  | 'sessions_revoked'
  | 'captcha_bypass_detected'
  | 'breach_check_unavailable'
  | 'limiter_unavailable';

export type AuthAuditOutcome = 'success' | 'failure' | 'denied' | 'error';

export interface AuthAuditEvent {
  event: AuthAuditEventName;
  outcome: AuthAuditOutcome;
  reason?: string;
  /** A signed-in actor. Their email is kept in plain text for attribution. */
  actor?: { id: string; email?: string | null };
  /**
   * The address a pre-authentication event is about (a sign-in attempt, a
   * reset request). Stored only as its HMAC pseudonym, never as text.
   */
  subjectEmail?: string;
  target?: { id?: string | null; email?: string | null };
  operationId?: string;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, string | number | boolean | null>;
}

export interface AuthAuditRow {
  app: string;
  environment: string;
  event: AuthAuditEventName;
  outcome: AuthAuditOutcome;
  reason: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  email_hmac: string | null;
  target_user_id: string | null;
  target_email: string | null;
  operation_id: string | null;
  ip: string | null;
  user_agent: string | null;
  details: Record<string, string | number | boolean | null>;
}

/** Where rows go. The default writes auth_audit; an app may send them to its main audit table instead. */
export type AuditSink = (row: AuthAuditRow) => Promise<void>;

export function supabaseAuditSink(getAdmin: () => AnySupabaseClient | Promise<AnySupabaseClient>, table = 'auth_audit'): AuditSink {
  return async (row) => {
    const admin = await getAdmin();
    const { error } = await admin.from(table).insert(row);
    if (error) throw new Error(`audit insert failed: ${error.code ?? 'unknown'}`);
  };
}

export interface AuthAuditor {
  /** True when written. Never throws. */
  log(event: AuthAuditEvent): Promise<boolean>;
  /** The HMAC pseudonym used for limits and pre-auth events. */
  pseudonymise(email: string): string;
}

export function createAuthAuditor(config: AuthConfig, sink: AuditSink): AuthAuditor {
  const pseudonymise = (email: string): string => emailPseudonym(email, config.hmacKey);
  return {
    pseudonymise,
    async log(event) {
      const row: AuthAuditRow = {
        app: config.app,
        environment: config.environment,
        event: event.event,
        outcome: event.outcome,
        reason: event.reason ? event.reason.slice(0, 200) : null,
        actor_user_id: event.actor?.id ?? null,
        actor_email: event.actor?.email ?? null,
        email_hmac: event.subjectEmail ? pseudonymise(event.subjectEmail) : null,
        target_user_id: event.target?.id ?? null,
        target_email: event.target?.email ?? null,
        operation_id: event.operationId ?? null,
        ip: event.ip ?? null,
        user_agent: event.userAgent ?? null,
        details: event.details ?? {},
      };
      try {
        await sink(row);
        return true;
      } catch {
        await raiseAlert(config, {
          kind: 'auth_audit_write_failed',
          severity: 'normal',
          message: `Could not record the ${event.event} (${event.outcome}) auth event.`,
          details: { event: event.event, outcome: event.outcome, operationId: event.operationId ?? null },
        });
        return false;
      }
    },
  };
}
