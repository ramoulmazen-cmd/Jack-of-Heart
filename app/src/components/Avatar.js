import { useEffect, useRef } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { native, useReducedMotion } from '../motion';
import { usePhotoUrl } from '../PhotoContext';
import { color, font } from '../theme';

// Muted prison-issue colors for players without a photo.
const PALETTE = ['#4E6B5C', '#6B5B45', '#4A5675', '#7A4A4A', '#5E6B3A', '#6A4E70', '#3F6470', '#7A6234'];
const tint = (name = '') => PALETTE[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
const initials = (name = '?') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

// Greyscale works on the web and Android; iOS only supports brightness, so the dark veil does the rest.
const OUT_FILTER = Platform.OS === 'ios' ? 'brightness(0.55)' : 'grayscale(1) brightness(0.7)';

/**
 * A player's mugshot. ACTIVE: full color with a thin ring. YOU: a gold ring that glows.
 * OUT: grey, veiled and stamped; when a player goes out while you watch, the photo shakes
 * and the stamp slams down.
 */
export function Avatar({ player, size = 48, you = false, out = false, justOut = false, faded = false, uri: override, style }) {
  const served = usePhotoUrl(player);
  const uri = override === undefined ? served : override;
  const reduced = useReducedMotion();
  const stamp = useRef(new Animated.Value(out && !justOut ? 1 : 0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  // justOut: the player went out this turn, so play the elimination as soon as this mugshot appears.
  const wasOut = useRef(justOut ? false : out);

  useEffect(() => {
    if (out && !wasOut.current) {
      if (reduced) stamp.setValue(1);
      else {
        Animated.parallel([
          Animated.sequence(
            [9, -8, 6, -4, 2, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: native })),
          ),
          Animated.sequence([
            Animated.delay(140),
            Animated.spring(stamp, { toValue: 1, friction: 5, tension: 140, useNativeDriver: native }),
          ]),
        ]).start();
      }
    } else if (!out) {
      stamp.setValue(0);
    }
    wasOut.current = out;
  }, [out, reduced, shake, stamp]);

  const ring = you ? Math.max(2, Math.round(size * 0.06)) : out ? 0 : Math.max(1.5, size * 0.03);
  const ringColor = you ? color.paint : 'rgba(228, 233, 227, 0.55)';
  const big = size >= 44;

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ translateX: shake }],
          opacity: faded && !out ? 0.45 : 1,
        },
        you && styles.youGlow,
        style,
      ]}
    >
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, borderWidth: ring, borderColor: ringColor },
          !uri && { backgroundColor: tint(player?.name) },
        ]}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }, out && { filter: OUT_FILTER }]}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={[styles.initials, { fontSize: size * 0.4, lineHeight: size * 0.48 }, out && styles.initialsOut]}>
            {initials(player?.name)}
          </Text>
        )}
        {out ? <View style={[StyleSheet.absoluteFill, styles.veil, { borderRadius: size / 2 }]} /> : null}
      </View>
      {out ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.stampWrap,
            {
              opacity: stamp,
              transform: [{ scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [2.6, 1] }) }, { rotate: '-16deg' }],
            },
          ]}
        >
          {big ? (
            <View style={[styles.stamp, { paddingHorizontal: size * 0.07, borderWidth: Math.max(1.5, size * 0.035) }]}>
              <Text style={[styles.stampText, { fontSize: size * 0.27, lineHeight: size * 0.31 }]}>OUT</Text>
            </View>
          ) : (
            <View style={[styles.slash, { width: size * 1.05, height: Math.max(2, size * 0.09) }]} />
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** Everyone, small, in seat order: the state of the game at a glance. Wraps to two rows past 10 players. */
export function PlayerStrip({ state, style }) {
  const { width } = useWindowDimensions();
  const players = state.players.filter((p) => !(p.left && !p.alive));
  const usable = Math.min(width, 520) - 40;
  const gap = 6;
  const perRow = players.length <= 10 ? players.length : Math.ceil(players.length / 2);
  const size = Math.max(22, Math.min(38, Math.floor((usable - gap * (perRow - 1)) / Math.max(perRow, 1))));
  return (
    <View style={[styles.strip, { gap }, style]} accessibilityLabel={`${players.filter((p) => p.alive).length} still in`}>
      {players.map((p) => (
        <Avatar key={p.id} player={p} size={size} you={p.id === state.you?.id} out={!p.alive} faded={p.left || !p.connected} />
      ))}
    </View>
  );
}

/** Mugshots with names, in a grid that fills the width. */
export function PlayerGrid({ players, youId, columns, maxSize = 84, renderTag, onPressYou, justOut = [] }) {
  const { width } = useWindowDimensions();
  const usable = Math.min(width, 520) - 40;
  const cols = columns ?? (players.length <= 4 ? Math.max(players.length, 2) : players.length <= 9 ? 3 : players.length <= 16 ? 4 : 5);
  const gap = 14;
  const cell = Math.floor((usable - gap * (cols - 1)) / cols);
  const size = Math.min(maxSize, cell - 8);
  return (
    <View style={[styles.grid, { gap, rowGap: 14 }]}>
      {players.map((p) => {
        const content = (
          <>
            <Avatar
              player={p}
              size={size}
              you={p.id === youId}
              out={!p.alive}
              justOut={justOut.includes(p.id)}
              faded={p.left || !p.connected}
            />
            <Text numberOfLines={1} style={[styles.name, !p.alive && styles.nameOut, p.id === youId && styles.nameYou]}>
              {p.name}
            </Text>
            {renderTag ? renderTag(p) : null}
          </>
        );
        return p.id === youId && onPressYou ? (
          <Pressable
            key={p.id}
            role="button"
            aria-label="Change your photo"
            onPress={onPressYou}
            style={({ pressed }) => [styles.cell, { width: cell }, pressed && styles.pressed]}
          >
            {content}
          </Pressable>
        ) : (
          <View key={p.id} style={[styles.cell, { width: cell }]}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  youGlow: {
    shadowColor: color.paint,
    shadowOpacity: 0.65,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  initials: { fontFamily: font.stencil, color: color.chalk, textAlign: 'center' },
  initialsOut: { color: color.faded },
  veil: { backgroundColor: 'rgba(12, 14, 13, 0.5)' },
  stampWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  stamp: { borderColor: color.alarm, borderRadius: 4, backgroundColor: 'rgba(15, 21, 18, 0.55)' },
  stampText: { fontFamily: font.stencil, color: color.alarm, letterSpacing: 1 },
  slash: { backgroundColor: color.alarm, borderRadius: 2 },
  strip: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  cell: { alignItems: 'center', gap: 6 },
  name: { color: color.chalk, fontSize: 14, fontWeight: '700', maxWidth: '100%' },
  nameOut: { color: color.faded, textDecorationLine: 'line-through' },
  nameYou: { color: color.paint },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
});
