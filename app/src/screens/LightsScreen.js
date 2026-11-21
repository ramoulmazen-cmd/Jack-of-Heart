import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Flash } from '../components/Effects';
import { native, useReducedMotion } from '../motion';
import { color } from '../theme';
import { Card, Screen, TopBar } from '../ui';

const GAP = 10;

/**
 * The glimpse: every card but yours, on screen for 5 seconds (3 with 5 or fewer players), with
 * nothing to hold. Nothing marks the cards you'll keep (2, or 1 with 4 or fewer players): you
 * find out in the talk, so a glance at someone's screen here doesn't show whose cards they hold.
 */
export default function LightsScreen({ state, game }) {
  const { width, height } = useWindowDimensions();
  const cards = state.players.filter((p) => p.suit);
  const columns = cards.length <= 4 ? 2 : cards.length <= 9 ? 3 : cards.length <= 16 ? 4 : 5;
  const rows = Math.ceil(cards.length / columns);
  const inner = Math.min(width, 520) - 40 - 28;
  const byWidth = Math.floor((inner - GAP * (columns - 1)) / columns);
  const byHeight = Math.floor((height - 260 - rows * 34) / (rows * 1.4));
  const size = Math.max(40, Math.min(150, byWidth, byHeight));

  return (
    <Screen overlay={<Flash tint="#FFF7E2" peak={0.9} duration={650} />}>
      <TopBar state={state} game={game} title="Lights" />
      <View aria-label="Every card but yours" style={styles.table}>
        <View style={[styles.cards, { gap: GAP }]}>
          {cards.map((p, i) => (
            <Dealt key={p.id} index={i}>
              <View aria-label={`Card of ${p.name}`} style={{ width: size, alignItems: 'center' }}>
                <Card size={size} suit={p.suit} />
                <View style={styles.owner}>
                  <Avatar player={p} size={18} />
                  <Text numberOfLines={1} style={styles.name}>
                    {p.name}
                  </Text>
                </View>
              </View>
            </Dealt>
          ))}
        </View>
      </View>
    </Screen>
  );
}

/** Cards fly in one after another as the lights come on. */
function Dealt({ index, children }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(t, {
      toValue: 1,
      duration: 180,
      delay: Math.min(index * 22, 260),
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: native,
    }).start();
  }, [t, index, reduced]);
  return (
    <Animated.View
      style={{
        opacity: t,
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  table: {
    flex: 1,
    marginTop: 4,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: color.paint,
    backgroundColor: color.wallRaised,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    overflow: 'hidden',
  },
  cards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 12 },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, maxWidth: '100%' },
  name: { color: color.chalk, fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
