import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { defaultServerUrl, normalizeServerUrl } from './config';

const SESSION_KEY = 'joh.session';
const SERVER_KEY = 'joh.server';
const PHOTO_KEY = 'joh.photo';
const NAME_KEY = 'joh.name';
const TIMEOUT_MS = 8000;

/**
 * Owns the connection to the game server. The server is the source of truth:
 * the app only sends intents ("I answer hearts") and renders the state it gets back.
 */
export function useGame() {
  const socketRef = useRef(null);
  const socketUrlRef = useRef(null);
  const sessionRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [session, setSessionState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [notice, setNotice] = useState(null);
  // Your mugshot and name are remembered on this phone, so next game night is one tap.
  const [photo, setPhotoState] = useState(null);
  const [savedName, setSavedName] = useState('');
  const photoRef = useRef(null);
  // Private messages arrive as their own event, never in the state (see useChat).
  const chatListeners = useRef(new Set());
  const onChatMessage = useCallback((listener) => {
    chatListeners.current.add(listener);
    return () => chatListeners.current.delete(listener);
  }, []);

  const setSession = useCallback(async (next) => {
    sessionRef.current = next;
    setSessionState(next);
    if (next) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(SESSION_KEY);
  }, []);

  const endSession = useCallback(
    async (message) => {
      setState(null);
      if (message) setNotice(message);
      await setSession(null);
    },
    [setSession],
  );

  const connectTo = useCallback(
    (url) => {
      const current = socketRef.current;
      if (current && socketUrlRef.current === url) {
        if (!current.connected) current.connect();
        return current;
      }
      current?.disconnect();

      const socket = io(url, { transports: ['websocket'], reconnectionDelayMax: 4000 });
      // Fires on the first connection and on every automatic reconnection
      // (phone woke up, Wi-Fi came back): re-claim our seat with the saved token.
      socket.on('connect', async () => {
        setConnected(true);
        const saved = sessionRef.current;
        if (!saved || saved.url !== url) return;
        const res = await socket
          .timeout(TIMEOUT_MS)
          .emitWithAck('room:resume', { code: saved.code, playerId: saved.playerId, token: saved.token })
          .catch(() => null);
        if (res && !res.ok) endSession(res.message);
      });
      socket.on('disconnect', () => setConnected(false));
      socket.on('state', (next) => {
        // Phone clocks drift; count down against the server's clock instead.
        setClockOffset(next.serverNow - Date.now());
        setState(next);
      });
      socket.on('kicked', () => endSession('The host removed you from the room.'));
      socket.on('closed', () => endSession('The host closed the room.'));
      socket.on('chat:message', (message) => chatListeners.current.forEach((listener) => listener(message)));

      socketRef.current = socket;
      socketUrlRef.current = url;
      return socket;
    },
    [endSession],
  );

  const request = useCallback(async (event, payload = {}) => {
    const socket = socketRef.current;
    if (!socket?.connected) throw new Error('Not connected to the game server.');
    let res;
    try {
      res = await socket.timeout(TIMEOUT_MS).emitWithAck(event, payload);
    } catch {
      throw new Error('The server did not answer. Check your connection.');
    }
    if (!res.ok) throw new Error(res.message);
    return res;
  }, []);

  const enterRoom = useCallback(
    async (event, payload) => {
      const url = normalizeServerUrl(serverUrl);
      setServerUrl(url);
      // Only remember an address someone typed; the automatic guess is re-made every launch,
      // so a laptop that got a new IP since last game night is still found.
      if (url === normalizeServerUrl(defaultServerUrl())) await AsyncStorage.removeItem(SERVER_KEY);
      else await AsyncStorage.setItem(SERVER_KEY, url);
      if (payload.name) {
        setSavedName(payload.name);
        AsyncStorage.setItem(NAME_KEY, payload.name).catch(() => {});
      }
      const socket = connectTo(url);
      await waitForConnect(socket, url);
      const res = await request(event, payload);
      await setSession({ url, code: res.code, playerId: res.playerId, token: res.token });
      // Bring your mugshot along. A photo the server refuses shouldn't stop you from playing.
      if (photoRef.current) await request('player:photo', { photo: photoRef.current }).catch(() => {});
    },
    [serverUrl, connectTo, request, setSession],
  );

  /** Keep a new photo on this phone and, if you're in a room, show it to everyone. null removes it. */
  const setPhoto = useCallback(
    async (dataUrl) => {
      if (sessionRef.current && socketRef.current?.connected) await request('player:photo', { photo: dataUrl });
      photoRef.current = dataUrl;
      setPhotoState(dataUrl);
      if (dataUrl) await AsyncStorage.setItem(PHOTO_KEY, dataUrl).catch(() => {});
      else await AsyncStorage.removeItem(PHOTO_KEY).catch(() => {});
    },
    [request],
  );

  const chatHistory = useCallback(async () => (await request('chat:history')).messages, [request]);

  const leave = useCallback(async () => {
    await request('room:leave').catch(() => {});
    await endSession();
  }, [request, endSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedSession, savedServer, savedPhoto, name] = await Promise.all([
          AsyncStorage.getItem(SESSION_KEY),
          AsyncStorage.getItem(SERVER_KEY),
          AsyncStorage.getItem(PHOTO_KEY),
          AsyncStorage.getItem(NAME_KEY),
        ]);
        if (cancelled) return;
        if (savedServer) setServerUrl(savedServer);
        if (savedPhoto) {
          photoRef.current = savedPhoto;
          setPhotoState(savedPhoto);
        }
        if (name) setSavedName(name);
        const parsed = savedSession ? JSON.parse(savedSession) : null;
        if (parsed?.url && parsed.token) {
          sessionRef.current = parsed;
          setSessionState(parsed);
          connectTo(parsed.url);
        }
      } catch {
        // Unreadable storage: start from the home screen.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectTo]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      const socket = socketRef.current;
      if (status === 'active' && socket && !socket.connected) socket.connect();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => () => socketRef.current?.disconnect(), []);

  return {
    ready,
    serverUrl,
    setServerUrl,
    session,
    connected,
    state,
    clockOffset,
    notice,
    clearNotice: () => setNotice(null),
    photo,
    setPhoto,
    savedName,
    create: (name) => enterRoom('room:create', { name }),
    join: (code, name) => enterRoom('room:join', { code, name }),
    start: () => request('game:start'),
    choose: (ranking) => request('turn:choose', { ranking }),
    // { suit } or, if the Jack blacked out this cell, { blackout: true }.
    lifeline: async () => {
      const { suit, blackout } = await request('turn:lifeline');
      return blackout ? { blackout: true } : { suit };
    },
    blackout: () => request('turn:blackout'),
    // The Jack, while choosing: one holder of `target`'s card will see a false suit on it.
    fake: (target) => request('turn:fake', { target }),
    // The interrogation vote, during the countdown; null takes your vote back.
    vote: (target) => request('turn:vote', { target }),
    skip: () => request('game:skip'),
    answer: (suit) => request('turn:answer', { suit }),
    sendMessage: async (to, text) => (await request('chat:send', { to, text })).message,
    chatHistory,
    onChatMessage,
    updateSettings: (changes) => request('game:settings', changes),
    kick: (playerId) => request('game:kick', { playerId }),
    reset: () => request('game:reset'),
    leave,
    // The host only: ends the room for everyone (every other phone gets 'closed').
    closeRoom: async () => {
      await request('room:close');
      await endSession();
    },
    forget: () => endSession(),
  };
}

function waitForConnect(socket, url) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onConnect = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      socket.off('connect', onConnect);
      reject(new Error(`Can't reach the game server at ${url}. Is it running, and is this phone on the same Wi-Fi?`));
    }, TIMEOUT_MS);
    socket.once('connect', onConnect);
  });
}
