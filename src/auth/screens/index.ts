// @anchor-nights/kit/auth/screens: the auth screens (spec K5, S1.2 to S1.5).
//
// Every file here is a client component. Each screen takes the app's Server
// Action as a prop (made with createAuthActions or createAdminActions from
// @anchor-nights/kit/auth), so nothing here imports server code; a test checks.
export { AuthShell, Field, FormMessage, ScreenHeading, fieldError, navigation, useAuthForm, type FieldProps } from './shell';
export {
  TurnstileWidget,
  TURNSTILE_SCRIPT_SRC,
  type TurnstileHandle,
  type TurnstileStatus,
  type TurnstileWidgetProps,
} from './turnstile';
export { SignInScreen, type SignInScreenProps } from './sign-in';
export { PendingScreen, type PendingScreenProps } from './pending';
export { ForgotPasswordScreen, type ForgotPasswordScreenProps } from './forgot-password';
export { ConfirmRecoveryScreen, type ConfirmRecoveryScreenProps } from './confirm-recovery';
export { ResetPasswordScreen, type ResetPasswordScreenProps } from './reset-password';
export { AcceptInviteScreen, type AcceptInviteScreenProps } from './accept-invite';
export { ChangePasswordForm, type ChangePasswordFormProps } from './change-password';
export { NewPasswordFields } from './passwords';
export { SignOutButton, type SignOutButtonProps } from './sign-out';
export { InvitePanel, StaffPanel, type InvitePanelProps, type InviteRow, type StaffPanelProps, type StaffRow } from './admin';
