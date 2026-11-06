// @anchor-nights/kit/qr: one QR address guard (spec S3.7).
export {
  buildQrUrl,
  getRequestOrigin,
  getSiteOrigin,
  isLoopbackHost,
  qrValue,
  type GetSiteOriginInput,
  type SiteOriginEnv,
} from './origin';
export { Qr, QR_BACKGROUND, QR_FOREGROUND, type QrProps } from './qr';
