import { createContext, useContext } from 'react';

/** Where mugshots live: the game server's address and the room code. */
export const PhotoContext = createContext({ base: null, code: null });

/** The URL of a player's photo, or null. The version in the URL lets phones cache each one for good. */
export function usePhotoUrl(player) {
  const { base, code } = useContext(PhotoContext);
  if (!player?.photo || !base || !code) return null;
  return `${base}/photo/${code}/${player.id}?v=${player.photo}`;
}
