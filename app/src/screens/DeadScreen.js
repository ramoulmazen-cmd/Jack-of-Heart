import { StyleSheet, Text, View } from 'react-native';
import { Avatar, PlayerGrid } from '../components/Avatar';
import { color, font } from '../theme';
import { Button, Screen, clockText, useSecondsLeft } from '../ui';

/** You're out: your mugshot, stamped, and everyone else's state while the game goes on. */
export default function DeadScreen({ state, game }) {
  const others = state.players.filter((p) => p.id !== state.you.id && !(p.left && !p.alive));
  const alive = others.filter((p) => p.alive).length;
  return (
    <Screen scroll footer={<Button title="Leave the game" kind="quiet" onPress={game.leave} />}>
      <View style={styles.me}>
        <Avatar player={state.players.find((p) => p.id === state.you.id)} size={140} out />
        <Text style={styles.title}>You’re out</Text>
        <Text style={styles.line}>Stay silent until the end.</Text>
        {state.phase === 'cooldown' ? <NextTurn state={state} game={game} /> : null}
      </View>
      <Text style={styles.count}>
        <Text style={styles.countNumber}>{alive}</Text> still in
      </Text>
      <PlayerGrid players={others} youId={state.you.id} maxSize={64} />
    </Screen>
  );
}

/** The countdown before a turn is on every screen, the watchers' too. */
function NextTurn({ state, game }) {
  const left = useSecondsLeft(state.phaseEndsAt, game.clockOffset) ?? 0;
  return (
    <View style={styles.next} aria-label={`Turn ${state.turn} starts in ${left} seconds`}>
      <Text style={styles.nextText}>Turn {state.turn} starts in</Text>
      <Text style={styles.nextClock}>{clockText(left)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  next: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10 },
  nextText: { color: color.faded, fontSize: 15, fontWeight: '700' },
  nextClock: { fontFamily: font.stencil, color: color.paint, fontSize: 34, lineHeight: 38, fontVariant: ['tabular-nums'] },
  me: { alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 22 },
  title: { fontFamily: font.stencil, color: color.alarm, fontSize: 52, lineHeight: 56, marginTop: 8 },
  line: { color: color.faded, fontSize: 15 },
  count: { color: color.faded, fontSize: 16, textAlign: 'center', marginBottom: 14 },
  countNumber: { fontFamily: font.stencil, color: color.chalk, fontSize: 26 },
});
