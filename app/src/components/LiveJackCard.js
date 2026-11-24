import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { native, useReducedMotion } from '../motion';
import { Card } from '../ui';

const JACK = require('../../assets/jack-card.png');
// Two light images, moved over the card: a soft champagne band (the glint) and a round glare.
const GLINT = require('../../assets/glint.png');
const GLARE = require('../../assets/glare.png');

const web = Platform.OS === 'web';
const clamp = (v) => Math.max(-1, Math.min(1, v));
// Nearly zero but not zero: a scale of exactly 0 can't be inverted, and some phones skip it.
const EDGE_ON = 0.02;

/**
 * The Jack of Hearts as a card you can hold. Now and then a glint of light runs across its
 * engraved gold; it leans toward your finger (or the mouse) with the light following it; a tap
 * turns it over to the deck's back, and after a moment it turns itself face up again.
 *
 * Kept light on purpose: only transforms and opacity move, so phones run them on the UI thread;
 * between glints nothing runs at all, and nothing runs while the game is in the background. With
 * "reduce motion" on it stays still and a tap simply shows the other side. The browser gets a real
 * 3D lean; phones lean flat, since Android can drop what's drawn on a 3D-turned card (FlipCard).
 */
export function LiveJackCard({ size = 132, tilt = '-6deg', entrance = false, every = 5600 }) {
  const reduced = useReducedMotion();
  const w = size;
  const h = Math.round(size * 1.4);
  const radius = Math.round(size * 0.09);

  const enter = useRef(new Animated.Value(entrance ? 0 : 1)).current;
  const pointer = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current; // -1..1 across the card
  const lit = useRef(new Animated.Value(0)).current; // 1 while a finger or the mouse is on it
  const glint = useRef(new Animated.Value(0)).current; // 0..1: the glint's way across
  const flip = useRef(new Animated.Value(1)).current; // the card's width while it turns over
  const [back, setBack] = useState(false);
  const state = useRef({ turning: false, touching: false, away: false, tapAt: 0 });
  const hit = useRef(null);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    if (!entrance) return;
    if (reduced) {
      enter.setValue(1);
      return;
    }
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 60, useNativeDriver: native }).start();
  }, [entrance, reduced, enter]);

  // The glint: one sweep every few seconds, never while you're holding or turning the card,
  // and not while the game is in the background.
  useEffect(() => {
    if (reduced) return undefined;
    const sweep = () => {
      const s = state.current;
      if (s.away || s.touching || s.turning) return;
      glint.setValue(0);
      Animated.timing(glint, {
        toValue: 1,
        duration: 1150,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: native,
      }).start(() => glint.setValue(0));
    };
    const first = setTimeout(sweep, entrance ? 950 : 450);
    const timer = setInterval(sweep, every);
    const sub = AppState.addEventListener('change', (s) => {
      state.current.away = s !== 'active';
    });
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      sub.remove();
    };
  }, [reduced, every, entrance, glint]);

  // Light on while touched, then the card settles back.
  const light = (on) => {
    state.current.touching = on;
    Animated.timing(lit, { toValue: on ? 1 : 0, duration: on ? 160 : 420, useNativeDriver: native }).start();
    if (!on) Animated.spring(pointer, { toValue: { x: 0, y: 0 }, friction: 6, tension: 50, useNativeDriver: native }).start();
  };
  const lean = (x, y) => {
    if (reducedRef.current) return;
    pointer.setValue({ x: clamp(x), y: clamp(y) });
    if (!state.current.touching) light(true);
  };

  // Turn it over: the width closes to an edge, the other side comes round.
  const turn = () => {
    const s = state.current;
    if (s.turning) return;
    if (reducedRef.current) {
      setBack((b) => !b);
      return;
    }
    s.turning = true;
    Animated.timing(flip, { toValue: EDGE_ON, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: native }).start(() => {
      setBack((b) => !b);
      Animated.timing(flip, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: native }).start(() => {
        s.turning = false;
      });
    });
  };
  const turnRef = useRef(turn);
  turnRef.current = turn;

  // Face down only for a moment: it turns itself face up again.
  useEffect(() => {
    if (!back) return undefined;
    const t = setTimeout(() => turnRef.current(), 2600);
    return () => clearTimeout(t);
  }, [back]);

  // The browser: pointer events on the card's resting outline (it doesn't move, so the maths is
  // stable while the card leans). A mouse leans it on hover; a quick tap turns it over.
  useEffect(() => {
    if (!web) return undefined;
    const el = hit.current;
    if (!el || typeof el.addEventListener !== 'function') return undefined;
    const at = (e) => {
      const r = el.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1];
    };
    let down = null;
    const move = (e) => lean(...at(e));
    const leave = () => state.current.touching && light(false);
    const press = (e) => {
      down = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      move(e);
    };
    const release = (e) => {
      if (down && e.timeStamp - down.t < 400 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) turnRef.current();
      down = null;
      if (e.pointerType !== 'mouse') leave();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointercancel', leave);
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointercancel', leave);
      el.removeEventListener('pointerdown', press);
      el.removeEventListener('pointerup', release);
    };
    // lean, light and turn only touch refs and stable values.
  }, []);

  // Phones: the card answers the finger directly.
  const pan = useMemo(() => {
    if (web) return null;
    const touchAt = (e) => lean((e.nativeEvent.locationX / w) * 2 - 1, (e.nativeEvent.locationY / h) * 2 - 1);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        state.current.tapAt = Date.now();
        touchAt(e);
      },
      onPanResponderMove: touchAt,
      onPanResponderRelease: (_e, g) => {
        if (Math.hypot(g.dx, g.dy) < 10 && Date.now() - state.current.tapAt < 400) turnRef.current();
        light(false);
      },
      onPanResponderTerminate: () => light(false),
    });
    // The handlers read refs; the size is all that matters.
  }, [w, h]);

  const leanTransform = web
    ? [
        { perspective: 700 },
        { rotateY: pointer.x.interpolate({ inputRange: [-1, 1], outputRange: ['-14deg', '14deg'] }) },
        { rotateX: pointer.y.interpolate({ inputRange: [-1, 1], outputRange: ['11deg', '-11deg'] }) },
      ]
    : [
        { rotate: pointer.x.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '4deg'] }) },
        { translateY: pointer.y.interpolate({ inputRange: [-1, 1], outputRange: [-4, 4] }) },
      ];

  return (
    <View
      ref={hit}
      {...(pan ? pan.panHandlers : null)}
      role="img"
      aria-label="Jack of Hearts. Tap to turn it over."
      style={[{ width: w, height: h }, web && styles.webHit]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            width: w,
            height: h,
            borderRadius: radius,
            opacity: enter.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
            transform: [
              { rotate: tilt },
              { scaleX: enter.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] }) },
              { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
            ],
          },
        ]}
      >
        <Animated.View style={{ transform: [...leanTransform, { scale: lit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }] }}>
          <Animated.View style={{ transform: [{ scaleX: flip }] }}>
            {back ? (
              <Card size={size} back />
            ) : (
              <View style={{ width: w, height: h, borderRadius: radius, overflow: 'hidden' }}>
                <Image source={JACK} style={{ width: w, height: h }} resizeMode="contain" accessible={false} />
                <Animated.Image
                  source={GLINT}
                  accessible={false}
                  resizeMode="stretch"
                  style={[
                    styles.light,
                    {
                      width: w * 0.5,
                      height: h * 1.6,
                      left: w * 0.25,
                      top: -h * 0.3,
                      opacity: glint.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
                      transform: [
                        { translateX: glint.interpolate({ inputRange: [0, 1], outputRange: [-w * 1.05, w * 1.05] }) },
                        { rotate: '18deg' },
                      ],
                    },
                  ]}
                />
                <Animated.Image
                  source={GLARE}
                  accessible={false}
                  resizeMode="stretch"
                  style={[
                    styles.light,
                    {
                      width: w * 1.3,
                      height: w * 1.3,
                      left: -w * 0.15,
                      top: (h - w * 1.3) / 2,
                      opacity: lit.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
                      transform: [
                        { translateX: pointer.x.interpolate({ inputRange: [-1, 1], outputRange: [-w * 0.5, w * 0.5] }) },
                        { translateY: pointer.y.interpolate({ inputRange: [-1, 1], outputRange: [-h * 0.5, h * 0.5] }) },
                      ],
                    },
                  ]}
                />
              </View>
            )}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The card's red glow, as on every Jack card.
  glow: {
    shadowColor: '#E0263F',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  // Light that only brightens: the gold lines catch it, the black stays black.
  light: { position: 'absolute', mixBlendMode: 'screen' },
  // The finger leans the card instead of scrolling the page.
  webHit: { touchAction: 'none', cursor: 'pointer' },
});
