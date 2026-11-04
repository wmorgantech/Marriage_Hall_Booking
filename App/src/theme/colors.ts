// Mirrors the Tailwind color tokens in tailwind.config.js — kept as plain
// constants for places that can't take a className (StatusBar, calendar
// theming, icon `color` props, etc).
export const colors = {
  primary: '#0B4D38',
  onPrimary: '#ffffff',
  primaryContainer: '#064E3B',
  onPrimaryContainer: '#A7E3C8',
  secondary: '#8A6A22',
  onSecondary: '#ffffff',
  secondaryContainer: '#F1DDA8',
  onSecondaryContainer: '#5C4510',
  secondaryFixedDim: '#C69A45',
  gold: '#C69A45',
  tertiary: '#2d2d28',
  onTertiary: '#ffffff',
  surface: '#FFFDF7',
  surfaceDim: '#DDD7C5',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#F8F4E8',
  surfaceContainer: '#F2EDDD',
  surfaceContainerHigh: '#ECE6D4',
  surfaceContainerHighest: '#E6DFCB',
  onSurface: '#17382D',
  onSurfaceVariant: '#4A6258',
  outline: '#7A8F85',
  outlineVariant: '#D9D3BC',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  background: '#FFFDF7',
  onBackground: '#17382D',
} as const;

// Brand-adjacent color used for WhatsApp call-to-actions — not part of the
// Material token set above, but shared across HallDetailScreen and
// BookingConfirmationScreen rather than repeated as a raw literal.
export const whatsappGreen = '#25D366';

// Shared translucent border for the "surface card" family (HallCard,
// SkeletonCard, booking/profile cards) — one alpha value instead of the
// ad-hoc '40'/'30'/'50'/'99'/'26' suffixes previously scattered per file.
export const cardBorderColor = colors.outlineVariant + '40';

// Shared "soft card" shadow — mirrors the website's shadow-soft token
// (0 10px 30px rgba(0,0,0,0.05)) translated to React Native's shadow props.
export const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 3,
} as const;
