// @anchor-nights/kit/ui: the Anchor primitives (spec S5.3).
//
// Files that use state, effects or portals are marked 'use client' on their
// own, so the pure helpers (buttonClass, cardClass, fieldClass, cn) stay
// callable from server components.
export { cn, TV_FONT_SIZES, BRAND_RADII, BRAND_SHADOWS, type ClassValue } from './cn';
export { Button, buttonClass, type ButtonProps, type ButtonSize, type ButtonStyleOptions, type ButtonVariant } from './button';
export { Card, CardContent, CardFooter, CardHeader, CardTitle, cardClass, type CardProps, type CardStyleOptions } from './card';
export { Badge, type BadgeProps, type BadgeVariant } from './badge';
export { Kicker, type KickerProps } from './kicker';
export { Input, fieldClass, fieldHintClass, fieldLabelClass, type InputProps } from './input';
export { Modal, DialogCloseButton, type DialogCloseButtonProps, type ModalProps } from './modal';
export { Sheet, type SheetProps } from './sheet';
export { useDialog } from './use-dialog';
export { AnchorLogo, ANCHOR_LOGO_WHITE_SRC, Grain, type AnchorLogoProps, type GrainProps } from './logo';
export { HoldButton, type HoldButtonProps } from './hold-button';
export { HOLD_DONE_MS, HOLD_DRAIN_MS, HOLD_MS, holdDoneLabel, holdProgress, holdSucceeded } from './hold';
export { Dock, DOCK_PAGE_PADDING, type DockProps } from './dock';
export { UndoSlot, UNDO_MS, type UndoSlotProps } from './undo-slot';
export { Banner, type BannerProps, type BannerTone } from './banner';
export { Spinner, type SpinnerProps } from './spinner';
export { EmptyState, type EmptyStateProps } from './empty-state';
