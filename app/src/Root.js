import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatSheet } from './components/ChatSheet';
import { PhaseIntro } from './components/Effects';
import { PhotoContext } from './PhotoContext';
import CellScreen from './screens/CellScreen';
import ChooseScreen from './screens/ChooseScreen';
import CooldownScreen from './screens/CooldownScreen';
import DeadScreen from './screens/DeadScreen';
import DiscussionScreen from './screens/DiscussionScreen';
import GameOverScreen from './screens/GameOverScreen';
import HomeScreen from './screens/HomeScreen';
import LightsScreen from './screens/LightsScreen';
import LobbyScreen from './screens/LobbyScreen';
import RevealScreen from './screens/RevealScreen';
import { color } from './theme';
import { Button, JackCard, Screen, text } from './ui';
import { ChatContext, useChat } from './useChat';
import { useGame } from './useGame';
import { useNotes } from './useNotes';

/**
 * No router: the server's phase decides the screen. Every phone shows
 * whatever the latest state says, so nobody can drift onto the wrong screen.
 */
export default function Root() {
  const game = useGame();
  const { state } = game;
  const notes = useNotes(state);
  const chat = useChat(game);
  const intro = usePhaseIntro(state);
  usePhaseFeedback(state);

  if (!game.ready) return <View style={styles.fill} />;
  if (!state?.you) return game.session ? <Rejoining game={game} /> : <HomeScreen game={game} />;

  return (
    <PhotoContext.Provider value={{ base: game.session?.url ?? game.serverUrl, code: state.code }}>
      <ChatContext.Provider value={chat}>
        <View style={styles.fill}>
          {Platform.OS !== 'web' ? <PhoneOnly /> : <WebOnly />}
          {screenFor(state, game, notes)}
          {intro ? <PhaseIntro key={`intro-${intro.key}`} word={intro.word} /> : null}
          {game.connected ? null : <OfflineBanner />}
          <ChatSheet state={state} />
        </View>
      </ChatContext.Provider>
    </PhotoContext.Provider>
  );
}

function screenFor(state, game, notes) {
  const { phase, you, turn } = state;
  const key = `${phase}-${turn}`;
  if (phase === 'lobby') return <LobbyScreen key={key} state={state} game={game} />;
  if (phase === 'over') return <GameOverScreen key={key} state={state} game={game} />;
  const justDied = phase === 'reveal' && you.diedOnTurn === turn;
  if (!you.alive && !justDied) return <DeadScreen key="dead" state={state} game={game} />;
  if (phase === 'cooldown') return <CooldownScreen key={key} state={state} game={game} />;
  if (phase === 'choose') return <ChooseScreen key={key} state={state} game={game} />;
  if (phase === 'lights') return <LightsScreen key={key} state={state} game={game} />;
  if (phase === 'discussion') return <DiscussionScreen key={key} state={state} game={game} notes={notes} />;
  if (phase === 'confinement') return <CellScreen key={key} state={state} game={game} notes={notes} />;
  return <RevealScreen key={key} state={state} game={game} />;
}

// From turn 2 a turn opens with its countdown, so that's where "Turn N" goes; choosing then
// starts with "Choose", the moment the countdown ends.
const INTRO_WORDS = {
  cooldown: (turn) => `Turn ${turn}`,
  choose: (turn) => (turn === 1 ? 'Turn 1' : 'Choose'),
  discussion: () => 'Talk',
  confinement: () => 'Your cell',
};
const INTRO_MS = 1100;

/** One big word as each phase starts. Not on the first screen after opening the app. */
function usePhaseIntro(state) {
  const [intro, setIntro] = useState(null);
  const last = useRef(null);
  const key = state?.you?.alive ? `${state.phase}-${state.turn}` : null;
  useEffect(() => {
    if (!key || key === last.current) return undefined;
    const first = last.current === null;
    last.current = key;
    const word = INTRO_WORDS[state.phase];
    if (first || !word) return undefined;
    setIntro({ key, word: word(state.turn) });
    const id = setTimeout(() => setIntro(null), INTRO_MS);
    return () => clearTimeout(id);
  }, [key, state]);
  return intro;
}

// Native-only protections while in a room: keep the screen on, and block screenshots
// and screen recording so nobody can save the lights for later.
function PhoneOnly() {
  useKeepAwake();
  usePreventScreenCapture();
  return null;
}

// Browsers can keep the screen on too, but only on a secure page (https or localhost):
// that's the phone running the server. Elsewhere this quietly does nothing.
function WebOnly() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.wakeLock) return undefined;
    let lock = null;
    let alive = true;
    const acquire = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          lock = l;
        })
        .catch(() => {});
    acquire();
    const onVisible = () => alive && document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release?.().catch(() => {});
    };
  }, []);
  return null;
}

function usePhaseFeedback(state) {
  const last = useRef(null);
  const key = state ? `${state.phase}-${state.turn}` : null;

  useEffect(() => {
    if (!state || key === last.current) return;
    const firstState = last.current === null;
    last.current = key;
    if (firstState) return;
    const died = state.phase === 'reveal' && state.you?.diedOnTurn === state.turn;
    if (Platform.OS === 'web') {
      if (died) Vibration.vibrate(600);
      return;
    }
    const quietly = (promise) => promise.catch(() => {});
    if (state.phase === 'lights') {
      quietly(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
    } else if (state.phase === 'confinement') {
      quietly(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
    } else if (died) {
      Vibration.vibrate(600);
    } else if (state.phase === 'choose') {
      quietly(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    }
  }, [key, state]);
}

function Rejoining({ game }) {
  return (
    <Screen footer={<Button title="Forget this game" kind="quiet" onPress={game.forget} />}>
      <View style={styles.rejoin}>
        <JackCard size={110} entrance tilt="-6deg" />
        <Text style={[text.display, styles.title]}>Room {game.session.code}</Text>
        <Text style={text.dim}>{game.connected ? 'Getting your seat back…' : 'Looking for the game server…'}</Text>
      </View>
    </Screen>
  );
}

function OfflineBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.offline, { paddingTop: insets.top + 6 }]}>
      <Text style={styles.offlineText}>Connection lost. Reconnecting…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.wall },
  rejoin: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { marginTop: 18 },
  offline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: 'none',
    backgroundColor: color.red,
    paddingBottom: 8,
  },
  offlineText: { color: color.stock, textAlign: 'center', fontWeight: '700', fontSize: 14 },
});
