import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatPill } from './components/ChatSheet';
import { native, useReducedMotion } from './motion';
import { SUIT_IMAGES, TINT_OF } from './suitImages';
import { useMenu } from './menu';
import { color, font, SUITS, suitInk } from './theme';
import { useChatContext } from './useChat';

const MAX_WIDTH = 520;
const GUTTER = 20;
const JACK = require('../assets/jack-card.png');
// The card back's heart with the Jack's face in it: same outline, same red (assets/art/jack-heart.svg).
const JACK_HEART = require('../assets/jack-heart.png');

/**
 * Every suit picture a card face uses, drawn once, invisibly, as the app opens. Without it the
 * first card you turned over showed an empty face for a moment while its picture loaded; now the
 * pictures are ready (and react-native-web remembers they are), so every flip shows the suit at once.
 */
export function SuitPreload() {
  return (
    <View pointerEvents="none" aria-hidden style={styles.preload}>
      {SUITS.flatMap((suit) =>
        ['red', 'ink', 'chalk', 'alarm'].map((tint) => (
          <Image key={`${suit}-${tint}`} source={SUIT_IMAGES[suit][tint]} style={styles.preloadImage} accessible={false} />
        )),
      )}
    </View>
  );
}

/**
 * A suit as an image, in one of the theme's colours. Never as a text character: many Android
 * phones only have ♠♥♦♣ in their emoji font, and when asked for plain text they draw nothing.
 */
export function SuitIcon({ suit, size, color: tint = color.chalk, style }) {
  const set = SUIT_IMAGES[suit];
  if (!set) return null;
  return (
    <Image
      source={set[TINT_OF[tint] ?? 'chalk']}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessible={false}
    />
  );
}

export function Screen({ children, footer, background = color.wall, scroll = false, overlay = null, padded = true, backdrop = null }) {
  const insets = useSafeAreaInsets();
  const content = scroll ? (
    <ScrollView style={styles.fill} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padded && styles.padded]}>{children}</View>
  );
  return (
    <View style={[styles.screen, { backgroundColor: background }]}>
      {backdrop}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.column, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}
      >
        {content}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
      {overlay}
    </View>
  );
}

/** Card width that fits `columns` cards across the screen. */
export function useCardSize(columns = 3, gap = 12) {
  const { width } = useWindowDimensions();
  const usable = Math.min(width, MAX_WIDTH) - GUTTER * 2;
  return Math.floor((usable - gap * (columns - 1)) / columns);
}

export function Button({ title, onPress, kind = 'primary', disabled = false, busy = false, icon = null, label, style }) {
  const inactive = disabled || busy;
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={inactive}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${kind}`],
        icon && !busy && styles.buttonWithIcon,
        inactive && styles.buttonInactive,
        pressed && styles.buttonPressed,
        style,
      ]}
    >
      <Text style={[styles.buttonText, styles[`buttonText_${kind}`]]} numberOfLines={1}>
        {busy ? 'One moment…' : title}
      </Text>
      {busy ? null : icon}
    </Pressable>
  );
}

export function Field({ label, style, ...inputProps }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={color.faded}
        selectionColor={color.paint}
        style={[styles.input, style]}
        {...inputProps}
      />
    </View>
  );
}

export function ErrorText({ children }) {
  return children ? <Text style={styles.error}>{children}</Text> : null;
}

/** Runs an async action, tracks busy state and turns thrown errors into a message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run };
}

export function useSecondsLeft(endsAt, clockOffset) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (!endsAt) return null;
  // 100 ms of slack so a fresh 20-second phase reads 0:20, not 0:21.
  return Math.max(0, Math.ceil((endsAt - (now + clockOffset) - 100) / 1000));
}

/** `quiet` is for waits that aren't a threat (the pause between turns): no paint, no red. */
export function Countdown({ endsAt, clockOffset, size = 46, quiet = false }) {
  const left = useSecondsLeft(endsAt, clockOffset);
  if (left === null) return null;
  const text = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : String(left);
  const tone = quiet ? styles.clockQuiet : left <= 10 && styles.clockUrgent;
  return (
    <Text aria-label={`${left} seconds left`} style={[styles.clock, { fontSize: size, lineHeight: size * 1.05 }, tone]}>
      {text}
    </Text>
  );
}

/**
 * Turn, phase and clock: the only header a gameplay screen needs. The private chat sits here on
 * every one of them except the lights, which last only seconds.
 */
export function TopBar({ state, game, title, action = null, clock = true }) {
  const chat = useChatContext();
  const menu = useMenu();
  return (
    <View style={styles.topBar}>
      <View style={styles.fill}>
        <Text style={styles.topTurn}>
          Turn {state.turn}
          <Text style={styles.topOf}>/{state.settings.maxTurns}</Text>
        </Text>
        <Text style={styles.topTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {chat?.available && state.phase !== 'lights' ? <ChatPill chat={chat} /> : null}
      {action ? (
        <Pressable
          role="button"
          aria-label={action.label}
          onPress={action.onPress}
          hitSlop={8}
          style={({ pressed }) => [styles.topAction, pressed && styles.buttonPressed]}
        >
          <Text style={styles.topActionText}>{action.text}</Text>
        </Pressable>
      ) : null}
      {clock ? <Countdown endsAt={state.phaseEndsAt} clockOffset={game.clockOffset} /> : null}
      {menu && state.phase !== 'lights' ? (
        <Pressable
          role="button"
          aria-label="Menu"
          onPress={menu.open}
          hitSlop={10}
          style={({ pressed }) => [styles.menu, pressed && styles.buttonPressed]}
        >
          {/* Three dots drawn, not typed: no font needed. */}
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.menuDot} />
          ))}
        </Pressable>
      ) : null}
    </View>
  );
}

/** 0:45, 2:07: minutes and seconds, for clocks that should read as time. */
export function clockText(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const ORDINAL = ['1st', '2nd', '3rd'];

/** How someone came to see your card: which of your choices they were, picked for you, or random. */
export function viewerLabel(rank, maxChoices) {
  if (rank === 0) return 'picked for you';
  return maxChoices === 1 ? 'your choice' : `your ${ORDINAL[rank - 1]} choice`;
}

/** The two people who see your card this turn, best first. */
export function viewersOf(state) {
  const viewers = state.you?.viewers;
  if (!viewers) return [];
  const find = (id) => state.players.find((p) => p.id === id) ?? { id, name: 'Someone' };
  return [
    viewers.picked && { ...find(viewers.picked), how: viewerLabel(viewers.rank, state.maxChoices) },
    viewers.random && { ...find(viewers.random), how: 'random' },
  ].filter(Boolean);
}

/** Four small suit buttons: tap one to note it, tap it again to clear it. */
export function SuitChips({ value, onChange, label, size = 40 }) {
  return (
    <View style={styles.suitChips} role="radiogroup" aria-label={label}>
      {SUITS.map((suit) => {
        const on = value === suit;
        return (
          <Pressable
            key={suit}
            role="radio"
            aria-checked={on}
            aria-label={`${label}: ${suit}`}
            hitSlop={4}
            onPress={() => onChange(on ? null : suit)}
            style={({ pressed }) => [
              styles.suitChip,
              { width: size, height: size },
              on && styles.suitChipOn,
              pressed && styles.buttonPressed,
            ]}
          >
            <SuitIcon suit={suit} size={Math.round(size * 0.5)} color={on ? suitInk(suit) : color.faded} />
          </Pressable>
        );
      })}
    </View>
  );
}

const LATTICE = Array.from({ length: 196 }, (_, i) => i);

/** A tick drawn with borders, for the same reason suits are images: no font needed. */
export function CheckMark({ size = 16, color: tint = color.ink }) {
  const stroke = Math.max(2, Math.round(size * 0.15));
  return (
    <View
      style={{
        width: size * 0.36,
        height: size * 0.66,
        marginTop: -size * 0.14,
        borderRightWidth: stroke,
        borderBottomWidth: stroke,
        borderColor: tint,
        transform: [{ rotate: '45deg' }],
      }}
    />
  );
}

/** A small pencil, tip down and to the left: "change". */
export function PencilMark({ size = 16, color: tint = color.ink }) {
  const w = Math.max(3, Math.round(size * 0.3));
  return (
    <View style={{ alignItems: 'center', transform: [{ rotate: '45deg' }] }}>
      <View style={{ width: w, height: size * 0.6, backgroundColor: tint, borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5 }} />
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: w / 2,
          borderRightWidth: w / 2,
          borderTopWidth: size * 0.24,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: tint,
        }}
      />
    </View>
  );
}

/**
 * A playing card. Face up when you're allowed to see the suit, face down (black and gold,
 * like the Jack) when you're not, greyed and stamped when the player is out.
 * `marked` is the Jack's own back: his face in the heart, which nobody can make out from
 * across the table.
 */
export function Card({ size, suit, back = false, out = false, selected = false, marked = false }) {
  const frame = { width: size, height: Math.round(size * 1.4), borderRadius: Math.round(size * 0.09) };

  if (out) {
    return (
      <View style={[styles.card, styles.cardOut, frame]}>
        <View style={styles.stamp}>
          <Text style={[styles.stampText, { fontSize: Math.max(14, size * 0.2) }]}>OUT</Text>
        </View>
      </View>
    );
  }

  if (back || !suit) {
    const plate = Math.round(size * 0.38);
    const heart = Math.round(plate * 0.5);
    return (
      <View style={[styles.card, styles.cardBack, frame, { padding: Math.max(3, Math.round(size * 0.05)) }]}>
        <View style={[styles.backInner, { borderRadius: Math.round(size * 0.06) }]}>
          <View style={styles.lattice}>
            {LATTICE.map((k) => (
              <View key={k} style={styles.diamond} />
            ))}
          </View>
          <View style={[styles.backPlate, { width: plate, height: plate, borderRadius: plate / 2 }]}>
            {marked ? (
              <Image source={JACK_HEART} style={{ width: heart, height: heart }} resizeMode="contain" accessible={false} />
            ) : (
              <SuitIcon suit="hearts" size={heart} color={BACK_HEART} />
            )}
          </View>
        </View>
      </View>
    );
  }

  // The Jack's limited sight: a blank card, or only the colour. Face up, but no suit on it.
  if (suit === 'blank' || suit === 'red' || suit === 'black') {
    const blot = Math.round(size * 0.42);
    return (
      <View aria-label={`${suit} card`} style={[styles.card, styles.cardFace, frame, selected && styles.cardSelected]}>
        {suit === 'blank' ? (
          <Text style={[styles.blankMark, { fontSize: Math.round(size * 0.42) }]}>?</Text>
        ) : (
          <>
            <View
              style={{
                width: blot,
                height: blot,
                borderRadius: blot / 2,
                backgroundColor: suit === 'red' ? color.red : color.ink,
              }}
            />
            <Text style={[styles.colourWord, { fontSize: Math.max(9, Math.round(size * 0.13)) }]}>
              {suit === 'red' ? 'RED' : 'BLACK'}
            </Text>
          </>
        )}
      </View>
    );
  }

  const ink = suitInk(suit);
  const corner = Math.max(4, Math.round(size * 0.14));
  const inset = { top: Math.round(size * 0.07), left: Math.round(size * 0.08) };
  return (
    <View aria-label={`${suit} card`} style={[styles.card, styles.cardFace, frame, selected && styles.cardSelected]}>
      <SuitIcon suit={suit} size={corner} color={ink} style={[styles.corner, inset]} />
      <SuitIcon suit={suit} size={Math.round(size * 0.4)} color={ink} />
      <SuitIcon
        suit={suit}
        size={corner}
        color={ink}
        style={[styles.corner, styles.cornerFlipped, { bottom: inset.top, right: inset.left }]}
      />
    </View>
  );
}

const BACK_HEART = '#E0263F';

/**
 * The Jack of Hearts, the game's own face card. `entrance` deals it in with a turn and a glint.
 * `faceDown` shows the deck's back in the same frame, motion and shadow; `marked` puts the
 * Jack's face in that back's heart.
 */
export function JackCard({ size = 112, tilt = '-7deg', entrance = false, faceDown = false, marked = false, style, children }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(entrance && !reduced ? 0 : 1)).current;
  useEffect(() => {
    if (!entrance || reduced) return;
    Animated.spring(t, { toValue: 1, friction: 7, tension: 60, useNativeDriver: native }).start();
  }, [entrance, reduced, t]);
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size * 1.4,
          // The card's own corners, so the browser's glow follows them instead of a square.
          borderRadius: Math.round(size * 0.09),
          // A flat turn (it widens from its edge), not a 3D one: Android can drop what's
          // drawn on a 3D-turned card. See FlipCard.
          transform: [
            { rotate: tilt },
            { scaleX: t.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] }) },
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
          ],
          opacity: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
        },
        styles.jackShadow,
        style,
      ]}
    >
      {faceDown ? (
        <Card size={size} back marked={marked} />
      ) : (
        <Image source={JACK} style={{ width: size, height: size * 1.4 }} resizeMode="contain" accessibilityLabel="Jack of Hearts" />
      )}
      {children}
    </Animated.View>
  );
}

export const text = StyleSheet.create({
  display: { fontFamily: font.stencil, color: color.chalk, fontSize: 46, lineHeight: 48 },
  heading: { color: color.chalk, fontSize: 18, fontWeight: '700' },
  body: { color: color.chalk, fontSize: 16, lineHeight: 23 },
  dim: { color: color.faded, fontSize: 15, lineHeight: 21 },
  small: { color: color.faded, fontSize: 13, lineHeight: 18 },
});

const styles = StyleSheet.create({
  // Painted (so the browser decodes the pictures) but invisible: 1 pixel at 1% opacity.
  preload: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0.01, overflow: 'hidden' },
  preloadImage: { position: 'absolute', top: 0, left: 0, width: 1, height: 1 },
  screen: { flex: 1, overflow: 'hidden' },
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  fill: { flex: 1 },
  padded: { paddingHorizontal: GUTTER },
  scrollContent: { paddingHorizontal: GUTTER, paddingBottom: 24 },
  footer: { paddingHorizontal: GUTTER, paddingTop: 10, gap: 10 },

  button: {
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  button_primary: { backgroundColor: color.red },
  button_secondary: { borderWidth: 1.5, borderColor: color.chalk },
  button_gold: { backgroundColor: color.paint },
  button_quiet: { minHeight: 44 },
  buttonInactive: { opacity: 0.4 },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  buttonWithIcon: { flexDirection: 'row', gap: 8 },
  buttonText: { fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
  buttonText_primary: { color: color.stock },
  buttonText_secondary: { color: color.chalk },
  buttonText_gold: { color: color.ink },
  buttonText_quiet: { color: color.faded, fontWeight: '600', fontSize: 15 },

  field: { gap: 6 },
  label: { color: color.faded, fontSize: 14 },
  input: {
    backgroundColor: color.wallRaised,
    borderColor: color.wallLine,
    borderWidth: 1,
    borderRadius: 14,
    color: color.chalk,
    fontSize: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  error: { color: color.alarm, fontSize: 15, lineHeight: 21, marginTop: 8, textAlign: 'center' },

  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  topTurn: { fontFamily: font.stencil, color: color.faded, fontSize: 18, lineHeight: 20 },
  topOf: { fontSize: 14 },
  topTitle: { fontFamily: font.stencil, color: color.chalk, fontSize: 32, lineHeight: 36, letterSpacing: 1 },
  topAction: {
    borderWidth: 1.5,
    borderColor: color.paint,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 12,
  },
  topActionText: { color: color.paint, fontSize: 15, fontWeight: '800' },
  menu: { flexDirection: 'column', gap: 3, paddingHorizontal: 8, paddingVertical: 6, marginLeft: 8 },
  menuDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: color.faded },
  clock: { fontFamily: font.stencil, color: color.paint, fontVariant: ['tabular-nums'] },
  clockUrgent: { color: color.alarm },
  clockQuiet: { color: color.chalk },

  suitChips: { flexDirection: 'row', gap: 6 },
  suitChip: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suitChipOn: { backgroundColor: color.stock, borderColor: color.stock },

  card: { alignItems: 'center', justifyContent: 'center' },
  cardFace: { backgroundColor: color.stock },
  blankMark: { color: color.faded, fontWeight: '900' },
  colourWord: { color: color.ink, fontWeight: '900', letterSpacing: 1, marginTop: 6 },
  cardSelected: { borderWidth: 3, borderColor: color.paint, transform: [{ translateY: -10 }] },
  cardOut: { backgroundColor: color.wallRaised, borderWidth: 1, borderColor: color.wallLine, overflow: 'hidden' },
  cardBack: { backgroundColor: color.noir, borderWidth: 1.5, borderColor: color.paint, overflow: 'hidden' },
  backInner: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: '#140D10',
    borderWidth: 1,
    borderColor: 'rgba(227, 178, 60, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lattice: { position: 'absolute', top: -7, left: -7, width: 196, flexDirection: 'row', flexWrap: 'wrap' },
  diamond: {
    width: 8,
    height: 8,
    margin: 3,
    transform: [{ rotate: '45deg' }],
    borderWidth: 1,
    borderColor: 'rgba(227, 178, 60, 0.22)',
  },
  backPlate: {
    backgroundColor: color.noir,
    borderWidth: 1.5,
    borderColor: color.paint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: { position: 'absolute' },
  cornerFlipped: { transform: [{ rotate: '180deg' }] },
  stamp: {
    borderWidth: 2,
    borderColor: color.alarm,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    transform: [{ rotate: '-14deg' }],
  },
  stampText: { fontFamily: font.stencil, color: color.alarm, letterSpacing: 1 },
  jackShadow: {
    shadowColor: '#E0263F',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
});

