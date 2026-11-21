import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar, PlayerStrip } from '../components/Avatar';
import { Stamp } from '../components/Effects';
import { color, font } from '../theme';
import { Button, CheckMark, ErrorText, Screen, TopBar, useAction } from '../ui';

export default function ChooseScreen({ state, game }) {
  const { you, maxChoices } = state;
  const { busy, error, run } = useAction();
  const [ranking, setRanking] = useState([]);
  const { width } = useWindowDimensions();
  const options = state.players.filter((p) => p.alive && !p.left && p.id !== you.id);
  const stillHere = (id) => options.some((p) => p.id === id);
  const chosen = you.locked ? you.ranking ?? [] : ranking.filter(stillHere);

  const toggle = (id) =>
    setRanking((prev) => {
      const current = prev.filter(stillHere);
      if (current.includes(id)) return current.filter((x) => x !== id);
      if (maxChoices === 1) return [id];
      return current.length < maxChoices ? [...current, id] : current;
    });

  const columns = options.length <= 4 ? 2 : options.length <= 9 ? 3 : 4;
  const usable = Math.min(width, 520) - 40;
  const tile = Math.floor((usable - 10 * (columns - 1)) / columns);
  const avatar = Math.min(76, tile - 26);

  const footer = you.locked ? null : (
    <>
      <ErrorText>{error}</ErrorText>
      <Button
        title={chosen.length ? 'Lock in' : maxChoices === 1 ? 'Tap one' : `Tap up to ${maxChoices}`}
        disabled={!chosen.length}
        busy={busy}
        onPress={() => run(() => game.choose(chosen))}
      />
    </>
  );

  return (
    <Screen footer={footer}>
      <TopBar state={state} game={game} title="Choose" />
      <PlayerStrip state={state} />
      <Text style={styles.question}>Who sees your card?</Text>
      <Text style={styles.sub}>{maxChoices === 1 ? 'Pick one.' : 'Pick up to 3, best first.'}</Text>
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {options.map((p) => {
          const place = chosen.indexOf(p.id);
          const on = place !== -1;
          return (
            <Pressable
              key={p.id}
              role="button"
              aria-selected={on}
              aria-label={on ? `${p.name}, choice ${place + 1}` : p.name}
              disabled={you.locked}
              onPress={() => toggle(p.id)}
              style={({ pressed }) => [styles.tile, { width: tile }, on && styles.tileOn, pressed && styles.pressed]}
            >
              <View>
                <Avatar player={p} size={avatar} faded={!p.connected} />
                {on ? (
                  <View style={styles.badge}>
                    {maxChoices === 1 ? <CheckMark size={16} /> : <Text style={styles.badgeText}>{place + 1}</Text>}
                  </View>
                ) : null}
              </View>
              <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {you.locked ? (
        <View style={styles.locked}>
          <Stamp text="Locked in" tint={color.paint} size={54} outlined tilt={-4} />
          <Text style={styles.wait}>Waiting for the others</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  question: { fontFamily: font.stencil, color: color.chalk, fontSize: 34, lineHeight: 38, textAlign: 'center', marginTop: 14 },
  sub: { color: color.faded, fontSize: 15, textAlign: 'center', marginTop: 2, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingBottom: 12 },
  tile: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tileOn: { backgroundColor: 'rgba(227, 178, 60, 0.12)', borderColor: color.paint },
  pressed: { opacity: 0.8, transform: [{ scale: 0.95 }] },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.paint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.wall,
  },
  badgeText: { fontFamily: font.stencil, color: color.ink, fontSize: 18, lineHeight: 21 },
  name: { color: color.chalk, fontSize: 15, fontWeight: '700', maxWidth: '92%' },
  nameOn: { color: color.paint },
  locked: { alignItems: 'center', gap: 6, paddingVertical: 10 },
  wait: { color: color.faded, fontSize: 15 },
});
