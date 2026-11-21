import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { native, useReducedMotion } from '../motion';
import { Card } from '../ui';

// Nearly zero but not zero: a scale of exactly 0 can't be inverted, and some phones skip it.
const EDGE = 0.02;

/**
 * A card that turns over. Face up only while `faceUp` is true; the suit is passed in only when
 * it may be seen, so a turned-away card has nothing on its other side.
 *
 * The turn is flat: the card narrows to its edge, swaps sides and widens again. No 3D rotation
 * and no hidden back faces: Android draws a 3D-turned card's background but can drop what's
 * printed on it, which showed as a blank white card in the Android app.
 */
export function FlipCard({ size, suit, faceUp, duration = 180 }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(faceUp ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: faceUp ? 1 : 0,
      duration: reduced ? 0 : duration,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: native,
    }).start();
  }, [faceUp, t, duration, reduced]);
  const height = Math.round(size * 1.4);
  const back = {
    opacity: t.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [1, 1, 0, 0] }),
    transform: [{ scaleX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, EDGE, EDGE] }) }],
  };
  const face = {
    opacity: t.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [0, 0, 1, 1] }),
    transform: [{ scaleX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [EDGE, EDGE, 1] }) }],
  };
  return (
    <View style={{ width: size, height }}>
      <Animated.View style={[StyleSheet.absoluteFill, back]}>
        <Card size={size} back />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, face]}>
        <Card size={size} suit={suit} back={!suit} />
      </Animated.View>
    </View>
  );
}
