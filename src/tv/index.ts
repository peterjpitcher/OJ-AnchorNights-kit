// @anchor-nights/kit/tv: the TV plumbing (spec S3.3 to S3.6). Files that use
// hooks are marked 'use client' on their own; the pure logic here is safe on
// the server too.
export { Stage, type StageProps } from './stage';
export { computeScale, STAGE_HEIGHT, STAGE_WIDTH } from './scale';
export { buildFitSteps, layoutFits, measureLayout, type FitSizes, type FitStepsInput, type LayoutMetrics } from './fit';
export { useFitStep } from './use-fit-step';
export { tvText, TV_KICKER_CLASS, type TvTextSize } from './tv-text';
export { useWakeLock, WAKE_LOCK_KEEPALIVE_MS, type WakeLockState } from './wake-lock';
export {
  AUTO_REFRESH_THRESHOLD_MS,
  BANNER_THRESHOLD_MS,
  initialHealthState,
  reduceHealth,
  selectHealthy,
  selectShouldAutoRefresh,
  selectShouldShowBanner,
  type HealthEvent,
  type HealthState,
  type RealtimeStatus,
  type TransportState,
} from './connection-health';
export { useConnectionHealth, type UseConnectionHealthApi } from './use-connection-health';
export { ConnectionBanner, type ConnectionBannerProps } from './connection-banner';
export {
  decideBuildAction,
  DEV_BUILD_ID,
  isNewBuild,
  readBuildResponse,
  type BuildAction,
  type BuildCheckMode,
  type BuildDecisionInput,
  type BuildResponse,
} from './build-check';
export {
  BUILD_CHECK_INTERVAL_MS,
  BUILD_CHECK_TIMEOUT_MS,
  ONLINE_SETTLE_MS,
  useBuildCheck,
  type UseBuildCheckApi,
  type UseBuildCheckOptions,
} from './use-build-check';
export {
  CLOCK_OFFSET_RESAMPLE_MS,
  CLOCK_OFFSET_SAMPLES_PER_ROUND,
  computeClockOffset,
  createClockOffsetSampler,
  isUsableClockSample,
  type ClockOffsetSampler,
  type ClockOffsetSamplerOptions,
  type ClockSample,
} from './clock-offset';
export { readTimeResponse, TIME_REQUEST_TIMEOUT_MS, useClockOffset, type UseClockOffsetOptions } from './use-clock-offset';
