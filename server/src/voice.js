import { GameError } from './errors.js';

/** A voice message is at most this long. The app stops recording here by itself. */
export const VOICE_MAX_SECONDS = 20;

/**
 * The app records at about 32 kbit/s, so 20 seconds is about 80 KB. This leaves room for a phone
 * that ignores the bitrate it was asked for, and still fits Socket.IO's 1 MB message limit.
 */
export const VOICE_MAX_BYTES = 480 * 1024;

/** How many voice messages one player can send in one talk. */
export const VOICE_PER_TALK = 10;

// The first bytes of each format phones record. Anything else is refused, because the server
// hands the clip to another player's browser.
const SIGNATURES = {
  'audio/mp4': (b) => b.toString('latin1', 4, 8) === 'ftyp', // iPhone, the app, Chrome
  'audio/webm': (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3, // older Chrome
  'audio/ogg': (b) => b.toString('latin1', 0, 4) === 'OggS', // Firefox
};

/** A data URL from the phone → { type, bytes }, or a GameError. */
export function decodeVoice(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(VOICE_MAX_BYTES * 1.4) + 64) {
    throw new GameError('BAD_VOICE', 'That voice message is too big.');
  }
  const match = /^data:(audio\/(?:mp4|webm|ogg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new GameError('BAD_VOICE', 'That voice message could not be read.');
  const [, type, base64] = match;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 16) throw new GameError('BAD_VOICE', 'That voice message is empty.');
  if (bytes.length > VOICE_MAX_BYTES) throw new GameError('BAD_VOICE', 'That voice message is too big.');
  if (!SIGNATURES[type](bytes)) throw new GameError('BAD_VOICE', 'That voice message could not be read.');
  return { type, bytes };
}

/** { type, bytes } → the data URL a phone plays. */
export function voiceDataUrl({ type, bytes }) {
  return `data:${type};base64,${bytes.toString('base64')}`;
}
