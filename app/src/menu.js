import { createContext, useContext } from 'react';

/**
 * The in-game menu (how to play, leave, close the room) lives once at the root, like the chat;
 * the top bar of every gameplay screen only needs a way to open it.
 */
export const MenuContext = createContext(null);

export function useMenu() {
  return useContext(MenuContext);
}
