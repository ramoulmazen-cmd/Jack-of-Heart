import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Shake } from '../components/Effects';
import { color, font } from '../theme';
import { useChatContext } from '../useChat';
import { Button, Card, Screen, TopBar, clockText, useSecondsLeft } from '../ui';

const GAP = 10;
const NOTICE_MS = 2600;

/**
 * The first 45 seconds of every turn after the first: time to argue about the last result before
 * anyone chooses or sees a card. The cards are already dealt, face down; tapping one only says
 * how long until the turn starts. Everyone sees the same clock.
 */
export default function CooldownScreen({ state, game }) {
  const { width, height } = useWindowDimensions();
  const chat = useChatContext();
  const left = useSecondsLeft(state.phaseEndsAt, game.clockOffset) ?? 0;
  const [tapped, setTapped] = useState(null); // { id, at }

  useEffect(() => {
    if (!tapped) return undefined;
    const id = setTimeout(() => setTapped(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [tapped]);

  const cards = state.players.filter((p) => p.alive && !p.left && p.id !== state.you.id);
  const columns = cards.length <= 4 ? 2 : cards.length <= 9 ? 3 : cards.length <= 16 ? 4 : 5;
  const rows = Math.ceil(cards.length / columns);
  const inner = Math.min(width, 520) - 40 - 28;
  const byWidth = Math.floor((inner - GAP * (columns - 1)) / columns);
  const byHeight = Math.floor((height - 470 - rows * 30) / (rows * 1.4));
  const size = Math.max(34, Math.min(104, byWidth, byHeight));

  const footer = chat?.available ? (
    <Button title="Private chat" kind="secondary" label="Open the private chat" onPress={() => chat.open()} />
  ) : null;

  return (
    <Screen footer={footer}>
      <TopBar state={state} game={game} title="Cooldown" clock={false} />
      <View style={styles.clockBlock} aria-label={`Turn ${state.turn} starts in ${left} seconds`}>
        <Text style={styles.until}>Turn {state.turn} starts in</Text>
        <Text style={[styles.clock, left <= 10 && styles.clockSoon]}>{clockText(left)}</Text>
        <Text style={styles.why}>Talk it over. Nobody chooses or sees a card until then.</Text>
      </View>
      <View style={styles.table} aria-label="The cards, face down until the turn starts">
        {tapped ? (
          <View role="alert" style={styles.notice}>
            <Text style={styles.noticeText}>
              Turn {state.turn} hasn’t started yet. <Text style={styles.noticeTime}>{clockText(left)}</Text> left.
            </Text>
          </View>
        ) : null}
        <View style={[styles.cards, { gap: GAP }]}>
          {cards.map((p) => (
            <Pressable
              key={p.id}
              role="button"
              aria-label={`${p.name}'s card, face down`}
              onPress={() => setTapped({ id: p.id, at: Date.now() })}
              style={{ width: size, alignItems: 'center' }}
            >
              <Shake key={tapped?.id === p.id ? tapped.at : 'still'} strength={tapped?.id === p.id ? 8 : 0}>
                <Card size={size} back />
              </Shake>
              <View style={styles.owner}>
                <Avatar player={p} size={18} />
                <Text numberOfLines={1} style={styles.name}>
                  {p.name}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  clockBlock: { alignItems: 'center', marginTop: 6, marginBottom: 14 },
  until: { color: color.faded, fontSize: 17, fontWeight: '700' },
  clock: {
    fontFamily: font.stencil,
    color: color.paint,
    fontSize: 104,
    lineHeight: 110,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  clockSoon: { color: color.alarm },
  why: { color: color.faded, fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 300 },
  table: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    backgroundColor: color.wallRaised,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    overflow: 'hidden',
  },
  notice: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    zIndex: 2,
    backgroundColor: color.noir,
    borderColor: color.paint,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  noticeText: { color: color.chalk, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  noticeTime: { color: color.paint, fontVariant: ['tabular-nums'] },
  cards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 12 },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, maxWidth: '100%' },
  name: { color: color.chalk, fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
