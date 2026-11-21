import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const READ_KEY = 'joh.chatRead';

export const ChatContext = createContext(null);

/** The chat from anywhere under Root: unread counts for the top bar, open() for any button. */
export function useChatContext() {
  return useContext(ChatContext);
}

/**
 * Your private conversations. The server keeps them for the game and only ever sends you your
 * own: the whole history when you (re)connect, then each new one as it arrives. This phone
 * remembers which ones you've read, so a message that came in while your screen was off still
 * shows as new.
 */
export function useChat(game) {
  const { state, connected, chatHistory, onChatMessage, sendMessage } = game;
  const me = state?.you?.id ?? null;
  const scope = me ? `${state.code}:${state.gameNumber}:${me}` : null;
  const inGame = Boolean(me) && state.phase !== 'lobby';
  const [messages, setMessages] = useState([]);
  const [read, setRead] = useState({});
  const [view, setView] = useState({ visible: false, withId: null });
  const scopeRef = useRef(scope);

  // A new room, a new game or a different seat: nothing carries over.
  useEffect(() => {
    scopeRef.current = scope;
    setMessages([]);
    setRead({});
    if (!scope) return;
    AsyncStorage.getItem(`${READ_KEY}:${scope}`)
      .then((raw) => {
        if (raw && scopeRef.current === scope) setRead(JSON.parse(raw));
      })
      .catch(() => {});
  }, [scope]);

  // The history, on entering the game and after every reconnect (messages may have come in).
  useEffect(() => {
    if (!scope || !inGame || !connected) return undefined;
    let cancelled = false;
    chatHistory()
      .then((history) => {
        if (!cancelled && scopeRef.current === scope) setMessages((prev) => merge(prev, history));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scope, inGame, connected, chatHistory]);

  useEffect(() => onChatMessage((message) => setMessages((prev) => merge(prev, [message]))), [onChatMessage]);

  const markRead = useCallback(
    (otherId) => {
      const last = messages.filter((m) => m.from === otherId && m.to === me).at(-1);
      if (!last || (read[otherId] ?? 0) >= last.id) return;
      const next = { ...read, [otherId]: last.id };
      setRead(next);
      if (scope) AsyncStorage.setItem(`${READ_KEY}:${scope}`, JSON.stringify(next)).catch(() => {});
    },
    [messages, read, me, scope],
  );

  // Whatever arrives in the conversation you have open is read as it lands.
  useEffect(() => {
    if (view.visible && view.withId) markRead(view.withId);
  }, [view, markRead]);

  // The glimpse is over in seconds: never let the chat cover it.
  useEffect(() => {
    if (state?.phase === 'lights') setView((v) => (v.visible ? { ...v, visible: false } : v));
  }, [state?.phase]);

  const unreadFrom = useCallback(
    (otherId) => messages.filter((m) => m.from === otherId && m.to === me && m.id > (read[otherId] ?? 0)).length,
    [messages, read, me],
  );

  const send = useCallback(
    async (to, text) => {
      const message = await sendMessage(to, text);
      setMessages((prev) => merge(prev, [message]));
    },
    [sendMessage],
  );

  return useMemo(
    () => ({
      me,
      messages,
      available: inGame,
      closedReason: state?.you?.chatClosed ?? null,
      unread: messages.filter((m) => m.to === me && m.id > (read[m.from] ?? 0)).length,
      unreadFrom,
      with: (otherId) => messages.filter((m) => m.from === otherId || m.to === otherId),
      view,
      open: (withId = null) => setView({ visible: true, withId }),
      show: (withId) => setView((v) => ({ ...v, withId })),
      close: () => setView((v) => ({ ...v, visible: false })),
      send,
    }),
    [me, messages, inGame, state?.you?.chatClosed, read, unreadFrom, view, send],
  );
}

function merge(current, incoming) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
