import Constants from 'expo-constants';
import { Platform } from 'react-native';

const GAME_PORT = 3000;

/**
 * Best guess for where the game server runs:
 * 1. EXPO_PUBLIC_SERVER_URL, baked in at build time (use this for a deployed server);
 * 2. on the web build served by the game server itself, the page's own origin;
 * 3. in Expo Go, the laptop running `npx expo start` — usually the same one running the server.
 * Players can always override it on the home screen.
 */
export function defaultServerUrl() {
  if (process.env.EXPO_PUBLIC_SERVER_URL) return process.env.EXPO_PUBLIC_SERVER_URL;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname, port, origin } = window.location;
    return port === '8081' ? `${protocol}//${hostname}:${GAME_PORT}` : origin;
  }
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${devHost || 'localhost'}:${GAME_PORT}`;
}

export function normalizeServerUrl(raw) {
  const trimmed = raw.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}
