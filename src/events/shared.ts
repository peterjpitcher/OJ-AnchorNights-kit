// @anchor-nights/kit/events/shared: the parts of the events feed that are
// safe in the browser (types, links, selection, reading the screen route's
// JSON). Nothing here reads the key or calls the management app.
export type { ScreenChannel, ScreenEvent, ScreenEventImage, ScreenFeed, ScreenFeedStatus } from './types';
export {
  EVENT_PAGE_BASE_URL,
  SCREEN_CHANNELS,
  WHATS_ON_URL,
  eventLink,
  eventLinks,
  eventPageLink,
  isAllowedReviewUrl,
  isTrustedShortLink,
  printedAddress,
  type EventLinkSource,
  type ScreenShortLinks,
} from './links';
export {
  MAX_FORMAT_NIGHTS,
  MAX_SCREEN_EVENTS,
  NIGHT_CATEGORY_SLUGS,
  dropStarted,
  hasStarted,
  selectNextOfFormat,
  selectScreenEvents,
  type SelectNextOfFormatOptions,
  type SelectScreenEventsOptions,
  type SelectableEvent,
  type ScreenSelection,
} from './select';
export { chooseScreenFeed, readScreenFeed } from './read';
export { EVENT_IMAGE_HOST, EVENT_IMAGE_PATH_PREFIX, EVENT_IMAGE_REMOTE_PATTERN, isAllowedEventImageUrl } from './image-host.js';
