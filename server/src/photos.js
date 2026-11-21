import { GameError } from './errors.js';

/** Phones send a small square JPEG (about 20-40 KB). This leaves plenty of room. */
export const PHOTO_MAX_BYTES = 200 * 1024;

// The first bytes of each format we accept. Anything else (SVG, HTML, scripts) is refused,
// because the server hands photos back to every browser in the room.
const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};

/** A data URL from the phone → { type, bytes }, or a GameError. */
export function decodePhoto(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(PHOTO_MAX_BYTES * 1.4) + 64) {
    throw new GameError('BAD_PHOTO', 'That photo is too big.');
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new GameError('BAD_PHOTO', 'That photo could not be read.');
  const [, type, base64] = match;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 12) throw new GameError('BAD_PHOTO', 'That photo could not be read.');
  if (bytes.length > PHOTO_MAX_BYTES) throw new GameError('BAD_PHOTO', 'That photo is too big.');
  if (!SIGNATURES[type](bytes)) throw new GameError('BAD_PHOTO', 'That photo could not be read.');
  return { type, bytes };
}
