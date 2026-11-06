// Whether a long-lived screen should pick up a new release, and how (spec
// S3.6). From Cash Bingo (src/lib/build-check.ts), the generic part: when it
// is safe to reload is the app's own rule (between games, never mid-reveal),
// so the app supplies it. Cash Bingo's isPublicReloadSafe stays in Cash Bingo.
//
// The TV and the phones stay on one page for hours (the TV for days), so
// without this they keep running whatever release was live when the page was
// opened. The client's own build id is baked in at build time
// (NEXT_PUBLIC_BUILD_ID, from buildIdFromEnv() in next.config.ts), and the
// app's build route (GET /api/build) says what the server is running now.
//
// - 'auto' (TV and phones): reload by themselves, but only when safe.
// - 'prompt' (host): never reload by themselves. Offer a Reload button, and
//   hold even that back while the host is mid-task.
// - 'dev' is what a local build reports. It never triggers anything.

export const DEV_BUILD_ID = 'dev';

export type BuildCheckMode = 'auto' | 'prompt';
export type BuildAction = 'none' | 'reload' | 'prompt' | 'wait';

export interface BuildDecisionInput {
  clientBuild: string | null | undefined;
  serverBuild: string | null | undefined;
  mode: BuildCheckMode;
  /** The app's own answer to "may this screen reload now?". */
  safe: boolean;
}

/** True only when both ids are real release ids and they differ. */
export function isNewBuild(clientBuild: string | null | undefined, serverBuild: string | null | undefined): boolean {
  if (!clientBuild || !serverBuild) return false;
  if (clientBuild === DEV_BUILD_ID || serverBuild === DEV_BUILD_ID) return false;
  return clientBuild !== serverBuild;
}

export function decideBuildAction({ clientBuild, serverBuild, mode, safe }: BuildDecisionInput): BuildAction {
  if (!isNewBuild(clientBuild, serverBuild)) return 'none';
  if (!safe) return 'wait';
  return mode === 'auto' ? 'reload' : 'prompt';
}

/** The JSON a build route answers with: `{ build: "<commit sha or dev>" }`. */
export interface BuildResponse {
  build: string;
}

/** Reads the build id out of a build route's JSON, or null when it has none. */
export function readBuildResponse(body: unknown): string | null {
  const build = (body as { build?: unknown } | null)?.build;
  return typeof build === 'string' && build.length > 0 ? build : null;
}
