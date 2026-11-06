// @anchor-nights/kit/promo: the idle loop and the end of the night (spec
// S7.4 and S7.5). The playlist builders are pure and safe on the server; the
// slides, the loop and the feed hook are client components. Nothing here
// reads the management key: the feed arrives from the app's screen route.
export {
  buildIdlePlaylist,
  buildThankYouPlaylist,
  getUsableEvents,
  playlistSignature,
  reviewSlide,
  slideCarriesQr,
  EVENT_MS,
  NEXT_NIGHT_MS,
  SLIDE_MS,
  type AppSlide,
  type EventBearingSlide,
  type IdlePlaylistOptions,
  type PromoSlide as PromoSlideData,
  type PromoSlideKind,
  type ReviewSlideData,
  type ThankYouPlaylistOptions,
  type ThankYouSlideData,
  type UsableEvents,
  type WhatsOnSlideData,
} from './playlist';
export { PromoSlide, SlidePreload, type PromoSlideProps } from './promo-slide';
export { EventSlide, PreloadEventImage, type EventSlideProps, type PreloadEventImageProps } from './event-slide';
export {
  NextNightSlide,
  ReviewSlide,
  WhatsOnSlide,
  type NextNightSlideProps,
  type ReviewSlideProps,
  type WhatsOnSlideProps,
} from './simple-slides';
export { ThankYouSlide, type ThankYouSlideProps } from './thank-you-slide';
export { SlideLoop, useDocumentVisible, type LoopSlide, type SlideLoopProps } from './slide-loop';
export {
  useScreenFeed,
  SCREEN_FEED_PATH,
  SCREEN_FEED_REFRESH_MS,
  SCREEN_FEED_TIMEOUT_MS,
  type UseScreenFeedOptions,
} from './use-screen-feed';
export {
  eventImageSizes,
  eventImageSrcSet,
  nextImageSrc,
  EVENT_IMAGE_WIDTHS,
  MAX_EVENT_IMAGE_WIDTH,
  type EventImageSrc,
} from './event-image';
