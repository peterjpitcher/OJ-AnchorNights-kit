// Types for image-host.js. Keep in step with it.

export declare const EVENT_IMAGE_HOST: string;
export declare const EVENT_IMAGE_PATH_PREFIX: string;

export interface EventImageRemotePattern {
  readonly protocol: 'https';
  readonly hostname: string;
  readonly port: '';
  readonly pathname: string;
  readonly search: '';
}

export declare const EVENT_IMAGE_REMOTE_PATTERN: EventImageRemotePattern;

export declare function isAllowedEventImageUrl(value: unknown): value is string;
