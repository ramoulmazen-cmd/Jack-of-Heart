import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { native, useReducedMotion } from '../motion';
import { SUIT_IMAGES, TINT_OF } from '../suitImages';
import { color } from '../theme';

const MARKS = [
  { suit: 'hearts', top: '6%', left: '-12%', size: 230, rotate: '-14deg', period: 9000 },
  { suit: 'spades', top: '38%', left: '62%', size: 270, rotate: '12deg', period: 11000 },
  { suit: 'diamonds', top: '72%', left: '-8%', size: 200, rotate: '8deg', period: 13000 },
];

/** Huge, faint suits drifting on the wall behind everything. Still when the phone asks for less motion. */
export function Backdrop({ tint = color.chalk }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {MARKS.map((m) => (
        <Drifting key={m.suit} mark={m} tint={tint} />
      ))}
    </View>
  );
}

function Drifting({ mark, tint }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: mark.period, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(t, { toValue: 0, duration: mark.period, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, mark.period, reduced]);
  return (
    <Animated.Image
      source={SUIT_IMAGES[mark.suit][TINT_OF[tint] ?? 'chalk']}
      resizeMode="contain"
      style={{
        position: 'absolute',
        top: mark.top,
        left: mark.left,
        width: mark.size,
        height: mark.size,
        opacity: 0.035,
        transform: [
          { rotate: mark.rotate },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] }) },
        ],
      }}
    />
  );
}
