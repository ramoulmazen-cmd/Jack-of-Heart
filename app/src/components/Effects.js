import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { native, useReducedMotion } from '../motion';
import { SUIT_IMAGES, TINT_OF } from '../suitImages';
import { color, font } from '../theme';
import { useSecondsLeft } from '../ui';

/** A soft round glow made of stacked translucent discs, so it looks the same on every platform. */
export function Glow({ size = 260, tint = color.paint, pulse = true, strength = 1 }) {
  const reduced = useReducedMotion();
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse || reduced) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(breath, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, pulse, reduced]);
  const rings = [1, 0.82, 0.66, 0.5, 0.36];
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 },
        { transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] }) }] },
      ]}
    >
      {rings.map((r) => (
        <View
          key={r}
          style={{
            position: 'absolute',
            width: size * r,
            height: size * r,
            borderRadius: (size * r) / 2,
            backgroundColor: tint,
            opacity: 0.07 * strength,
          }}
        />
      ))}
    </Animated.View>
  );
}

const BURST_SUITS = ['hearts', 'diamonds', 'spades', 'clubs'];
const BURST_COLORS = [color.paint, color.red, color.chalk];

/** Suits flying out from the middle: for surviving a turn and for clearing the game. */
export function Burst({ count = 18, radius = 170, colors = BURST_COLORS, delay = 120 }) {
  const reduced = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const reach = radius * (0.55 + Math.random() * 0.6);
        return {
          dx: Math.cos(angle) * reach,
          dy: Math.sin(angle) * reach,
          spin: `${Math.round((Math.random() - 0.5) * 540)}deg`,
          suit: BURST_SUITS[i % BURST_SUITS.length],
          tint: colors[i % colors.length],
          size: 16 + Math.random() * 14,
          t: new Animated.Value(0),
        };
      }),
    [count, radius, colors],
  );
  useEffect(() => {
    if (reduced) return;
    Animated.stagger(
      18,
      pieces.map((p) =>
        Animated.timing(p.t, {
          toValue: 1,
          duration: 1100 + Math.random() * 500,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: native,
        }),
      ),
    ).start();
  }, [pieces, reduced, delay]);
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={styles.center}>
      {pieces.map((p, i) => (
        <Animated.Image
          key={i}
          source={SUIT_IMAGES[p.suit][TINT_OF[p.tint] ?? 'chalk']}
          resizeMode="contain"
          style={[
            styles.piece,
            {
              width: p.size,
              height: p.size,
              opacity: p.t.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: p.t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                { translateY: p.t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, p.dy * 0.8, p.dy + 50] }) },
                { rotate: p.t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', p.spin] }) },
                { scale: p.t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.3, 1.15, 0.8] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

/** The whole screen flashes once: white for the lights, red for a collar going off. */
export function Flash({ tint = '#FFFFFF', peak = 0.85, duration = 520 }) {
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(reduced ? 0 : peak)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 0, duration, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
  }, [a, duration]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: a }]} />;
}

/** Shakes its children once when it appears. */
export function Shake({ children, style, strength = 14, delay = 0 }) {
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const s = strength;
    Animated.sequence([
      Animated.delay(delay),
      ...[s, -s * 0.9, s * 0.7, -s * 0.5, s * 0.3, -s * 0.15, 0].map((v) =>
        Animated.timing(x, { toValue: v, duration: 55, useNativeDriver: native }),
      ),
    ]).start();
  }, [x, reduced, strength, delay]);
  return <Animated.View style={[style, { transform: [{ translateX: x }] }]}>{children}</Animated.View>;
}

/** A word stamped onto the screen: it drops in big and lands with a bounce. */
export function Stamp({ text, tint = color.paint, size: wanted = 92, delay = 0, tilt = -5, outlined = false, style }) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  // Big Shoulders is condensed: about 0.56 of the font size per letter. Shrink to fit the screen.
  const room = Math.min(width, 520) - 48 - (outlined ? wanted * 0.5 : 0);
  const size = Math.max(28, Math.min(wanted, Math.floor(room / (Math.max(text.length, 3) * 0.56))));
  const t = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.sequence([
      Animated.delay(delay),
      Animated.spring(t, { toValue: 1, friction: 6, tension: 110, useNativeDriver: native }),
    ]).start();
  }, [t, delay, reduced]);
  return (
    <Animated.View
      style={[
        styles.stampBox,
        outlined && { borderColor: tint, borderWidth: Math.max(3, size * 0.05), paddingHorizontal: size * 0.18 },
        {
          opacity: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
          transform: [
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) },
            { rotate: `${tilt}deg` },
          ],
        },
        style,
      ]}
    >
      <Text
        style={[styles.stampText, { color: tint, fontSize: size, lineHeight: size * 1.02 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {text}
      </Text>
    </Animated.View>
  );
}

/** The last seconds of a phase, huge and pulsing, behind the controls. */
export function BigCountdown({ endsAt, clockOffset, from = 5, tint = color.alarm, size = 220 }) {
  const left = useSecondsLeft(endsAt, clockOffset);
  if (left === null || left > from || left <= 0) return null;
  return <CountdownDigit key={left} value={left} tint={tint} size={size} />;
}

function CountdownDigit({ value, tint, size }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [t]);
  return (
    <View pointerEvents="none" style={styles.center}>
      <Animated.Text
        style={[
          styles.countdown,
          { color: tint, fontSize: size, lineHeight: size * 1.02 },
          {
            opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.32, 0.1] }),
            transform: [{ scale: reduced ? 1 : t.interpolate({ inputRange: [0, 1], outputRange: [1.35, 0.95] }) }],
          },
        ]}
      >
        {value}
      </Animated.Text>
    </View>
  );
}

/** Between phases: one big word across the screen for a moment ("Turn 3", "Talk", "Cell"). */
export function PhaseIntro({ word, tint = color.chalk }) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  // Browsers ignore adjustsFontSizeToFit and cut a long word short ("Your c…"), so size it to the
  // screen here: no character of the stencil face is wider than 0.47 em, letter spacing included.
  const fontSize = Math.min(96, Math.floor((Math.min(width, 560) - 48) / (word.length * 0.47)));
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: reduced ? 120 : 260, easing: Easing.out(Easing.back(1.6)), useNativeDriver: native }),
      Animated.delay(520),
      Animated.timing(t, { toValue: 2, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: native }),
    ]).start();
  }, [t, reduced]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.intro, { opacity: t.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }) }]}
    >
      <Animated.Text
        style={[
          styles.introText,
          { color: tint, fontSize, lineHeight: Math.round(fontSize * 1.04) },
          {
            transform: [
              { scale: reduced ? 1 : t.interpolate({ inputRange: [0, 1, 2], outputRange: [1.4, 1, 0.92] }) },
              { translateY: reduced ? 0 : t.interpolate({ inputRange: [0, 1, 2], outputRange: [12, 0, -18] }) },
            ],
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {word}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', left: '50%', top: '50%', alignItems: 'center', justifyContent: 'center' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute' },
  stampBox: { alignSelf: 'center', alignItems: 'center', borderRadius: 10, maxWidth: '100%' },
  stampText: { fontFamily: font.stencil, textAlign: 'center', letterSpacing: 2 },
  countdown: { fontFamily: font.stencil, textAlign: 'center' },
  intro: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 14, 12, 0.72)',
    paddingHorizontal: 24,
  },
  introText: { fontFamily: font.stencil, fontSize: 96, lineHeight: 100, textAlign: 'center', letterSpacing: 3 },
});
