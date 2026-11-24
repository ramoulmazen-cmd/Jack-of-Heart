import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { native, useReducedMotion } from '../motion';
import { SUIT_IMAGES, TINT_OF } from '../suitImages';
import { color } from '../theme';

const MARKS = [
  { suit: 'hearts', top: '6%', left: '-12%', size: 230, rotate: '-14deg', period: 9000 },
  { suit: 'spades', top: '38%', left: '62%', size: 270, rotate: '12deg', period: 11000 },
  { suit: 'diamonds', top: '72%', left: '-8%', size: 200, rotate: '8deg', period: 13000 },
];

// In the browser the drift is a CSS animation (react-native-web turns animationKeyframes into
// @keyframes), so the page runs no JavaScript for it on every frame. Phones keep Animated, which
// already runs on the UI thread there.
const cssLoops = Platform.OS === 'web';
const webDrift = cssLoops
  ? StyleSheet.create(
      Object.fromEntries(
        MARKS.map((m) => [
          m.suit,
          {
            animationKeyframes: [
              {
                '0%': { transform: [{ rotate: m.rotate }, { translateY: -14 }] },
                '50%': { transform: [{ rotate: m.rotate }, { translateY: 14 }] },
                '100%': { transform: [{ rotate: m.rotate }, { translateY: -14 }] },
              },
            ],
            animationDuration: `${m.period * 2}ms`,
            animationIterationCount: 'infinite',
            animationTimingFunction: 'ease-in-out',
          },
        ]),
      ),
    )
  : null;

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
    if (reduced || cssLoops) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: mark.period, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(t, { toValue: 0, duration: mark.period, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, mark.period, reduced]);
  const place = {
    position: 'absolute',
    top: mark.top,
    left: mark.left,
    width: mark.size,
    height: mark.size,
    opacity: 0.035,
  };
  return (
    <Animated.Image
      source={SUIT_IMAGES[mark.suit][TINT_OF[tint] ?? 'chalk']}
      resizeMode="contain"
      style={
        cssLoops
          ? [place, { transform: [{ rotate: mark.rotate }] }, !reduced && webDrift[mark.suit]]
          : [
              place,
              {
                transform: [
                  { rotate: mark.rotate },
                  { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] }) },
                ],
              },
            ]
      }
    />
  );
}
