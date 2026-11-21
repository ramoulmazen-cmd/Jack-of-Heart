import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';
import { native } from '../motion';
import { color, font } from '../theme';

/**
 * A button you hold instead of tap.
 * - With `onComplete`: a bar fills while you hold; let go early and nothing happens (the lifeline).
 * - With `onHoldStart` / `onHoldEnd`: something shows only while your finger is down (your role).
 */
export function HoldButton({ label, onComplete, onHoldStart, onHoldEnd, holdMs = 650, tint = color.paint, disabled, style }) {
  const fill = useRef(new Animated.Value(0)).current;
  const [down, setDown] = useState(false);
  const running = useRef(null);

  const pressIn = () => {
    setDown(true);
    onHoldStart?.();
    if (!onComplete) return;
    fill.setValue(0);
    running.current = Animated.timing(fill, { toValue: 1, duration: holdMs, easing: Easing.linear, useNativeDriver: native });
    running.current.start(({ finished }) => {
      if (finished) {
        fill.setValue(0);
        onComplete();
      }
    });
  };
  const pressOut = () => {
    setDown(false);
    onHoldEnd?.();
    running.current?.stop();
    Animated.timing(fill, { toValue: 0, duration: 120, useNativeDriver: native }).start();
  };

  return (
    <Pressable
      role="button"
      aria-label={label}
      accessibilityHint="Hold"
      disabled={disabled}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={[styles.button, { borderColor: tint }, down && styles.down, disabled && styles.disabled, style]}
    >
      {onComplete ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.fill, { backgroundColor: tint, transform: [{ scaleX: fill }] }]}
        />
      ) : null}
      <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  down: { backgroundColor: 'rgba(227, 178, 60, 0.12)', transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.35 },
  fill: { ...StyleSheet.absoluteFillObject, opacity: 0.28, transformOrigin: 'left' },
  label: { fontFamily: font.stencil, fontSize: 20, lineHeight: 24, letterSpacing: 1 },
});
