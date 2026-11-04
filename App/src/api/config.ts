import { Platform } from 'react-native';

// Which API the app talks to:
//  1. EXPO_PUBLIC_API_BASE_URL when it is set to something non-empty:
//       App/.env                    – used by every build (the production-style server)
//       App/.env.development.local  – git-ignored; applies ONLY to `expo start` and overrides .env
//  2. otherwise this machine's own API: Android emulator → 10.0.2.2, iOS simulator / Expo web → localhost.
// Testing on a physical phone? Put your computer's LAN address in .env.development.local
// (e.g. http://192.168.1.100:4000) — the API must listen on 0.0.0.0, which `pnpm dev` does.
const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

export const API_BASE_URL =
  fromEnv || (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

// A development build should never silently talk to a remote/production server.
if (__DEV__ && !/^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(API_BASE_URL)) {
  console.warn(`[CheckNBook] Development build is pointed at a non-local API: ${API_BASE_URL}`);
}
