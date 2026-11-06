// @anchor-nights/kit/pairing/screens: the TV pairing screens (spec S3.1).
//
// Every file here is a client component. The forms take the app's Server
// Actions as props (made with createTvPairing from
// @anchor-nights/kit/pairing), so nothing here imports server code; a test
// checks.
export { TvPairingScreen, TV_PAIRING_MESSAGES, type TvPairingScreenProps } from './tv-pairing-screen';
export { TvNotice, tvNavigation, type TvNoticeProps } from './tv-notice';
export { TvCanvas } from './tv-shell';
export { PairTvForm, type PairTvFormProps } from './pair-tv-form';
export { TvDevicesPanel, type TvDevicesPanelProps } from './tv-devices-panel';
