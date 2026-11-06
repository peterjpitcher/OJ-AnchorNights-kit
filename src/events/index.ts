// @anchor-nights/kit/events: the events feed from the management app (spec
// S7.1 to S7.3). SERVER ONLY: it sends the app's management API key, so Next
// fails the build if a client component imports it. Browser code imports
// `@anchor-nights/kit/events/shared` (and `@anchor-nights/kit/promo`) instead.
import 'server-only';

export * from './shared';
export {
  createEventsFeed,
  buildScreenFeed,
  createFeedMemo,
  pickEventImage,
  toScreenEvent,
  DETAIL_TIMEOUT_MS,
  LIST_TIMEOUT_MS,
  REFRESH_BUDGET_MS,
  type BuildFeedDeps,
  type BuiltFeed,
  type CreateEventsFeedOptions,
  type EventsFeed,
  type FeedMemo,
  type ReportFn,
} from './feed';
export {
  createManagementClient,
  fetchManagementJson,
  getEventsFeedConfig,
  DEFAULT_ANCHOR_API_BASE_URL,
  NEXT_REVALIDATE_SECONDS,
  type EventsFeedConfig,
  type EventsFeedConfigInput,
  type FetchManagementJsonOptions,
  type ManagementClient,
  type ManagementClientOptions,
} from './client';
export {
  createStaleIfErrorCache,
  TtlMemo,
  FEED_FAIL_FAST_MS,
  FEED_FRESH_MS,
  FEED_STALE_IF_ERROR_MS,
  type CachedValue,
  type StaleIfErrorCache,
  type StaleIfErrorCacheOptions,
} from './cache';
export { EventsFeedError, type EventsFeedErrorCode } from './errors';
export {
  findCategoryId,
  parseEventList,
  parseManagementEvent,
  parseScreenShortLinks,
  type ManagementEvent,
  type ParsedEventList,
} from './schema';
export { addDaysToIsoDate, eventsDateWindows, FORMAT_WINDOW_DAYS, GENERAL_WINDOW_DAYS, type EventsDateWindows } from './date-window';
