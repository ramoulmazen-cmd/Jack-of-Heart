import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { Avatar } from './Avatar';

/** Who the table sent into interrogation this turn, or null. */
export function interrogatedPlayer(state) {
  const id = state.interrogation?.playerId;
  return id ? state.players.find((p) => p.id === id) ?? null : null;
}

/** For the player in interrogation: alone this turn. */
export function Interrogated() {
  return (
    <View style={[styles.box, styles.alone]} role="alert">
      <Text style={styles.title}>Interrogation</Text>
      <Text style={styles.line}>
        The table voted you alone. Your card was swapped for one nobody has seen: nobody holds it and you hold none.
        No lifeline: in your cell, you guess.
      </Text>
    </View>
  );
}

/** For everyone else: who is alone this turn, so nobody waits for them or chooses them. */
export function InterrogationNote({ state }) {
  const player = interrogatedPlayer(state);
  if (!player || player.id === state.you.id) return null;
  return (
    <View style={[styles.box, styles.row]} aria-label={`${player.name} is in interrogation this turn`}>
      <Avatar player={player} size={30} />
      <Text style={styles.note}>
        <Text style={styles.name}>{player.name}</Text> is in interrogation: their card was swapped for one nobody has seen,
        and nobody holds it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.alarm,
    backgroundColor: color.noir,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  alone: { alignItems: 'center', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: font.stencil, color: color.alarm, fontSize: 26, lineHeight: 30 },
  line: { color: color.chalk, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  note: { flex: 1, color: color.chalk, fontSize: 14, lineHeight: 19 },
  name: { fontWeight: '800' },
});
