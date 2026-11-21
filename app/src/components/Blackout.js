import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { native, useReducedMotion } from '../motion';
import { color } from '../theme';
import { JackCard } from '../ui';
import { Glow, Stamp } from './Effects';

/** Before the frame starts: a quick look at your role never shows it. */
export const ARM_DELAY_MS = 600;
/** Then the Jack keeps holding while the frame traces round his card: 2 seconds from the press. */
export const ARM_FILL_MS = 1400;

/**
 * A thin gold line that traces round the Jack's card, clockwise from the top-left corner, as
 * `progress` goes from 0 to 1. Four bars that grow one after another: no SVG needed.
 * It stays gold when the blackout is set: a red frame would stand out across the table.
 */
export function BlackoutFrame({ progress, inset = 9, thickness = 3 }) {
  const part = (i) =>
    progress.interpolate({ inputRange: [i / 4, (i + 1) / 4], outputRange: [0, 1], extrapolate: 'clamp' });
  const tint = { backgroundColor: color.goldLight, shadowColor: color.paint };
  return (
    <View pointerEvents="none" style={[styles.frame, { top: -inset, left: -inset, right: -inset, bottom: -inset }]}>
      <Animated.View
        style={[styles.bar, tint, { top: 0, left: 0, right: 0, height: thickness, transformOrigin: 'left', transform: [{ scaleX: part(0) }] }]}
      />
      <Animated.View
        style={[styles.bar, tint, { top: 0, bottom: 0, right: 0, width: thickness, transformOrigin: 'top', transform: [{ scaleY: part(1) }] }]}
      />
      <Animated.View
        style={[styles.bar, tint, { bottom: 0, left: 0, right: 0, height: thickness, transformOrigin: 'right', transform: [{ scaleX: part(2) }] }]}
      />
      <Animated.View
        style={[styles.bar, tint, { top: 0, bottom: 0, left: 0, width: thickness, transformOrigin: 'bottom', transform: [{ scaleY: part(3) }] }]}
      />
    </View>
  );
}

/**
 * The Jack's side, inside the Role overlay: hold a moment past the card and the frame starts;
 * keep holding until it closes, 2 seconds in all, and the blackout is set. Let go any earlier
 * and nothing happens.
 * Returns the frame's progress, whether it's on, and whether it was set during this hold.
 */
export function useArmBlackout(status, onArm) {
  const progress = useRef(new Animated.Value(status === 'on' ? 1 : 0)).current;
  const [sent, setSent] = useState(false);
  const arm = useRef(onArm);
  arm.current = onArm;

  useEffect(() => {
    if (status !== 'ready') return undefined;
    const run = Animated.sequence([
      Animated.delay(ARM_DELAY_MS),
      Animated.timing(progress, { toValue: 1, duration: ARM_FILL_MS, useNativeDriver: native }),
    ]);
    run.start(({ finished }) => {
      if (!finished) return;
      setSent(true);
      if (Platform.OS === 'web') Vibration.vibrate(40);
      else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // If the server says no (the talk just ended), the frame empties again.
      Promise.resolve()
        .then(() => arm.current())
        .catch(() => {
          setSent(false);
          progress.setValue(0);
        });
    });
    return () => run.stop();
  }, [status, progress]);

  return { progress, on: status === 'on' || sent, armedNow: sent };
}

/**
 * What a player sees when their lifeline hits the blackout: the lights fail, the Jack turns
 * up, and the lifeline is gone. It takes the screen for a moment so a stray tap can't pick
 * a suit underneath, then hands the cell back.
 */
export function BlackoutHit({ onDone, duration = 2800 }) {
  const reduced = useReducedMotion();
  const dark = useRef(new Animated.Value(0)).current;
  const [lit, setLit] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (Platform.OS === 'web') Vibration.vibrate(260);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    // A failing tube light: on, off, on, off, out.
    const steps = reduced ? [[1, 160]] : [[0.95, 60], [0.3, 70], [0.9, 60], [0.5, 80], [1, 150]];
    Animated.sequence(
      steps.map(([toValue, duration]) => Animated.timing(dark, { toValue, duration, useNativeDriver: native })),
    ).start();
    const show = setTimeout(() => setLit(true), reduced ? 150 : 430);
    const end = setTimeout(() => done.current(), duration);
    return () => {
      clearTimeout(show);
      clearTimeout(end);
    };
  }, [dark, duration, reduced]);

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={() => lit && done.current()} aria-label="Blackout">
      <Animated.View style={[StyleSheet.absoluteFill, styles.dark, { opacity: dark }]} />
      {lit ? (
        <View style={styles.center}>
          <Glow size={360} tint={color.red} strength={1.5} />
          <JackCard size={130} entrance tilt="6deg" />
          <Stamp text="Blackout" tint={color.alarm} size={60} tilt={-4} outlined style={styles.stamp} />
          <Text style={styles.line}>The Jack blacked out your cell.</Text>
          <Text style={styles.sub}>Your lifeline is gone.</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute' },
  bar: {
    position: 'absolute',
    borderRadius: 2,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  dark: { backgroundColor: '#050304' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  stamp: { marginTop: 8 },
  line: { color: color.chalk, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  sub: { color: color.faded, fontSize: 15, textAlign: 'center', marginTop: -6 },
});
