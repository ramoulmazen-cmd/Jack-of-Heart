import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, suitInk } from '../theme';
import { Card, JackCard, SuitIcon } from '../ui';
import { Avatar } from './Avatar';
import { Sheet } from './Sheet';

/**
 * How to play, as slides: one idea per page, a still picture made of the game's own cards, faces
 * and buttons, and a few short lines. Nothing moves, so it costs a phone nothing to show.
 * The Jack's powers each say WHEN and HOW, since that's what a new Jack asks first.
 * Times and counts come from the room's settings, so the slides never contradict the lobby.
 */
export function HowToPlaySheet({ visible, onClose, settings = {}, secret = false }) {
  const [page, setPage] = useState(0);
  // The blackout stays a surprise: its slide shows only on phones already told it exists.
  const slides = secret ? SLIDES : SLIDES.filter((s) => !s.secret);
  const index = Math.min(page, slides.length - 1);
  const slide = slides[index];
  const title = typeof slide.title === 'function' ? slide.title(settings) : slide.title;
  const lines = typeof slide.lines === 'function' ? slide.lines(settings) : slide.lines;
  const first = index === 0;
  const last = index === slides.length - 1;
  const close = () => {
    setPage(0);
    onClose();
  };
  const footer = (
    <View style={styles.nav}>
      <Pressable
        role="button"
        aria-label="Previous slide"
        disabled={first}
        onPress={() => setPage(Math.max(0, index - 1))}
        style={({ pressed }) => [styles.navButton, first && styles.navOff, pressed && styles.pressed]}
      >
        <Text style={styles.navText}>Back</Text>
      </Pressable>
      <Text style={styles.count} aria-label={`Slide ${index + 1} of ${slides.length}`}>
        {index + 1} / {slides.length}
      </Text>
      <Pressable
        role="button"
        aria-label={last ? 'Done' : 'Next slide'}
        onPress={() => (last ? close() : setPage(index + 1))}
        style={({ pressed }) => [styles.navButton, styles.navNext, pressed && styles.pressed]}
      >
        <Text style={[styles.navText, styles.navNextText]}>{last ? 'Done' : 'Next'}</Text>
      </Pressable>
    </View>
  );
  return (
    <Sheet visible={visible} onClose={close} title="How to play" tall footer={footer}>
      <View style={styles.slide}>
        <Text style={styles.kicker}>{slide.kicker}</Text>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.visual}>{slide.visual()}</View>
        {lines.map((line) =>
          typeof line === 'string' ? (
            <Text key={line} style={styles.line}>
              {line}
            </Text>
          ) : (
            <View key={line.label} style={styles.labelled}>
              <Text style={styles.label}>{line.label}</Text>
              <Text style={[styles.line, styles.labelledText]}>{line.text}</Text>
            </View>
          ),
        )}
      </View>
    </Sheet>
  );
}

// ---- the room's numbers, in words ----

/** "Talk (3 min)": the room's own time, or just the name when it isn't known. */
function timed(name, seconds, inMinutes = false) {
  if (typeof seconds !== 'number') return name;
  return `${name} (${inMinutes && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`})`;
}

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function fakeWhen(n) {
  const rest = 'never on his colour or blank turns.';
  if (n === 0) return 'Off in this room: the host set 0 fakes.';
  if (n === 1) return `While choosing, once a game, ${rest}`;
  if (typeof n === 'number') return `While choosing, up to ${n} times a game, ${rest}`;
  return `While choosing, as many times as the lobby shows, ${rest}`;
}

function sightTurns({ colorTurns, blankTurns }) {
  if (typeof colorTurns !== 'number' || typeof blankTurns !== 'number') {
    return 'The lobby shows how many of these turns there are.';
  }
  return `In this room: ${count(colorTurns, 'colour turn')} and ${count(blankTurns, 'blank turn')}. Only the Jack learns which.`;
}

// ---- the pictures: still, made of the game's own pieces ----

const person = (name) => ({ id: name, name, alive: true });

function Named({ name, children, under }) {
  return (
    <View style={styles.named}>
      {children}
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {under ? <Text style={styles.small}>{under}</Text> : null}
    </View>
  );
}

function Badge({ n, alarm = false }) {
  return (
    <View style={[styles.badge, alarm && styles.badgeAlarm]}>
      <Text style={styles.badgeText}>{n}</Text>
    </View>
  );
}

/** A hold button, frozen part way: the bar shows how far the hold has come. */
function MockHold({ label, fill }) {
  return (
    <View style={styles.mockButton}>
      <View style={[styles.mockFill, { width: `${Math.round(fill * 100)}%` }]} />
      <Text style={styles.mockLabel}>{label}</Text>
      <Text style={styles.mockHint}>hold</Text>
    </View>
  );
}

function MiniSuit({ suit }) {
  return (
    <View style={styles.miniSuit}>
      <SuitIcon suit={suit} size={14} color={suitInk(suit)} />
    </View>
  );
}

function Bubble({ text, suit, mine = false }) {
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{text}</Text>
      <MiniSuit suit={suit} />
    </View>
  );
}

const SLIDES = [
  {
    kicker: 'The game',
    title: 'One of you is the Jack',
    visual: () => (
      <View style={styles.row}>
        <JackCard size={86} tilt="-6deg" />
        <View style={styles.faces}>
          {['A', 'B', 'C', 'D'].map((n) => (
            <Avatar key={n} player={person(n)} size={34} />
          ))}
        </View>
      </View>
    ),
    lines: [
      'Every turn everyone gets a new card, but nobody sees their own.',
      'Find the Jack: the moment he’s out, everyone left wins.',
      'The Jack wins if he survives until only 1 other player is left, or the turns run out.',
    ],
  },
  {
    kicker: 'Each turn · 1',
    title: 'Choose (20 s)',
    visual: () => (
      <View style={styles.row}>
        {['Sara', 'Omar', 'Lina'].map((n, i) => (
          <Named key={n} name={n}>
            <View>
              <Avatar player={person(n)} size={50} />
              <Badge n={i + 1} />
            </View>
          </Named>
        ))}
      </View>
    ),
    lines: [
      'Rank up to 3 people you trust to see your card.',
      'Be quick: each person holds only 2 cards, from the 2 fastest players who chose them. Your card also gets a second viewer at random.',
      'With 4 or fewer players: choose just 1, and nobody is added at random.',
    ],
  },
  {
    kicker: 'Each turn · 2',
    title: 'Lights (3–5 s)',
    visual: () => (
      <View style={styles.row}>
        {[['Sara', 'hearts'], ['Omar', 'spades'], ['Lina', 'diamonds'], ['Dan', 'clubs']].map(([n, s]) => (
          <Named key={n} name={n}>
            <Card size={46} suit={s} />
          </Named>
        ))}
      </View>
    ),
    lines: ['Every card but yours shows for a few seconds.', 'Remember what you can: it’s your proof later.'],
  },
  {
    kicker: 'Each turn · 3',
    title: (s) => timed('Plotting', s.briefingSeconds),
    visual: () => (
      <View style={styles.row}>
        {[['Omar', 'Dan'], ['Lina', 'Sara']].map(([n, other]) => (
          <Named key={n} name={n} under={`also seen by ${other}`}>
            <Card size={56} back />
          </Named>
        ))}
      </View>
    ),
    lines: [
      'You learn whose cards you hold and who holds yours, but you can’t look at any card.',
      'Make deals, set traps, and vote if the interrogation is open. The host sets how long it lasts.',
    ],
  },
  {
    kicker: 'Each turn · 4',
    title: (s) => timed('Talk', s.discussionSeconds, true),
    visual: () => (
      <View style={styles.row}>
        <Named name="Omar" under="finger down">
          <Card size={60} suit="hearts" />
        </Named>
        <Named name="Lina" under="finger up">
          <Card size={60} back />
        </Named>
      </View>
    ),
    lines: [
      'Hold one of your cards to look at it. Tell its owner their suit: the truth, or a lie.',
      'Write down what your two holders tell you in Notes.',
    ],
  },
  {
    kicker: 'Each turn · 5',
    title: (s) => timed('Cell', s.answerSeconds),
    visual: () => (
      <View style={styles.row}>
        {['spades', 'hearts', 'diamonds', 'clubs'].map((s) => (
          <View key={s} style={s === 'hearts' ? styles.picked : styles.notPicked}>
            <Card size={44} suit={s} />
          </View>
        ))}
      </View>
    ),
    lines: ['Name your own suit. Wrong, or no answer, and you’re out.', 'No talking in the cell. Then: ALIVE, DEAD or SAFE.'],
  },
  {
    kicker: 'Everyone',
    title: 'Lifeline',
    visual: () => (
      <View style={styles.row}>
        <MockHold label="Lifeline" fill={0.6} />
        <Card size={52} suit="diamonds" />
      </View>
    ),
    lines: [
      { label: 'When', text: 'In your cell, once a game, never on the last turn.' },
      { label: 'How', text: 'Hold Lifeline until the bar fills: your own card shows for a second.' },
    ],
  },
  {
    kicker: 'Everyone',
    title: 'Private chat',
    visual: () => (
      <View style={styles.chat}>
        <Bubble mine text="Your card is" suit="hearts" />
        <Bubble text="I trust you, it’s" suit="clubs" />
      </View>
    ),
    lines: [
      'Tap Chat to message any living player. Only the two of you ever see it.',
      '10 words at most: tap ready phrases and suit buttons. Closed in your cell; the dead stay silent.',
    ],
  },
  {
    kicker: 'The Jack',
    title: 'He can’t always see',
    visual: () => (
      <View style={styles.row}>
        <Named name="colour turn">
          <Card size={58} suit="red" />
        </Named>
        <Named name="blank turn">
          <Card size={58} suit="blank" />
        </Named>
      </View>
    ),
    lines: (s) => [
      'On some secret turns the Jack sees only red or black, or one of his cards is blank.',
      'He still has to tell those players something. A wrong suit in the right colour is his signature.',
      sightTurns(s),
    ],
  },
  {
    kicker: 'Jack power',
    title: 'Fake',
    visual: () => (
      <View style={styles.row}>
        <Named name="hold 1 s">
          <View style={styles.holdRing}>
            <Avatar player={person('Lina')} size={50} />
          </View>
        </Named>
        <Text style={styles.arrow}>→</Text>
        <Named name="real">
          <Card size={44} suit="hearts" />
        </Named>
        <Text style={styles.arrow}>→</Text>
        <Named name="they see">
          <Card size={44} suit="clubs" />
        </Named>
      </View>
    ),
    lines: (s) => [
      { label: 'When', text: fakeWhen(s.fakeSuits) },
      { label: 'How', text: 'Hold a player’s picture for 1 second.' },
      {
        label: 'Then',
        text: 'One person holding that card sees a false suit and passes it on in good faith. Holding Role tells the Jack who got the false suit, never which suit.',
      },
    ],
  },
  {
    // The Jack's secret power: only the host's phone and the Jack's are shown this slide.
    secret: true,
    kicker: 'Jack power · secret',
    title: 'Blackout',
    visual: () => (
      <View style={styles.row}>
        <View style={styles.goldFrame}>
          <JackCard size={60} tilt="0deg" faceDown marked />
        </View>
        <MockHold label="Role" fill={1} />
      </View>
    ),
    lines: [
      { label: 'When', text: 'During the talk, once a game, never on the last turn.' },
      { label: 'How', text: 'Hold Role and keep holding about 2 seconds, until the gold frame closes round his card.' },
      { label: 'Then', text: 'In that cell every other lifeline fails. His own still works.' },
      'Only the host and the Jack see this page. Don’t read it out.',
    ],
  },
  {
    kicker: 'Everyone',
    title: 'Interrogation vote',
    visual: () => (
      <View style={styles.row}>
        {[['Omar', 3], ['Lina', 1], ['Dan', 0]].map(([n, v]) => (
          <Named key={n} name={n}>
            <View>
              <Avatar player={person(n)} size={46} />
              {v ? <Badge n={v} alarm={n === 'Omar'} /> : null}
            </View>
          </Named>
        ))}
      </View>
    ),
    lines: (s) => [
      {
        label: 'When',
        text:
          s.interrogation === false
            ? 'Off in this room.'
            : 'During Plotting, once a game, with 5 or more players left: after a first half with no deaths, or in the last 3 turns.',
      },
      { label: 'How', text: 'Tap a name to vote. If more than half of the players pick the same name, that player goes alone.' },
      { label: 'Then', text: 'Their card is swapped for one nobody has seen, nobody holds it, and no lifeline.' },
    ],
  },
  {
    kicker: 'Everyone',
    title: 'Safe turn',
    visual: () => <Text style={styles.safe}>SAFE</Text>,
    lines: (s) => [
      'One secret turn where nobody dies, never the last.',
      s.safeTurn === false ? 'Off in this room: every turn counts.' : 'You find out after the cell. The host can switch it off.',
    ],
  },
  {
    kicker: 'House rules',
    title: 'Play fair',
    visual: () => (
      <View style={styles.rules}>
        {['Never show your screen.', 'No talking in the cell.', 'The dead stay silent.'].map((r) => (
          <Text key={r} style={styles.rule}>
            {r}
          </Text>
        ))}
      </View>
    ),
    lines: [],
  },
];

const styles = StyleSheet.create({
  slide: { gap: 8, paddingBottom: 8 },
  kicker: { color: color.paint, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontFamily: font.stencil, color: color.chalk, fontSize: 32, lineHeight: 36, marginTop: -4 },
  visual: {
    minHeight: 150,
    borderRadius: 18,
    backgroundColor: color.wallRaised,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    marginVertical: 4,
  },
  line: { color: color.chalk, fontSize: 15, lineHeight: 21 },
  labelled: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  label: {
    width: 46,
    color: color.ink,
    backgroundColor: color.paint,
    borderRadius: 6,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '900',
    paddingVertical: 3,
    marginTop: 1,
  },
  labelledText: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' },
  faces: { flexDirection: 'row', flexWrap: 'wrap', width: 80, gap: 6, justifyContent: 'center' },
  named: { alignItems: 'center', gap: 4, maxWidth: 96 },
  name: { color: color.chalk, fontSize: 12, fontWeight: '700' },
  small: { color: color.faded, fontSize: 11, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 5,
    backgroundColor: color.paint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.wallRaised,
  },
  badgeAlarm: { backgroundColor: color.alarm },
  badgeText: { fontFamily: font.stencil, color: color.ink, fontSize: 14, lineHeight: 17 },
  picked: { borderRadius: 8, borderWidth: 3, borderColor: color.paint, transform: [{ translateY: -8 }] },
  notPicked: { opacity: 0.55 },
  mockButton: {
    width: 130,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.paint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mockFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.paint, opacity: 0.28 },
  mockLabel: { fontFamily: font.stencil, color: color.paint, fontSize: 20, lineHeight: 24 },
  mockHint: { color: color.faded, fontSize: 10, fontWeight: '700', marginTop: -2 },
  holdRing: { borderRadius: 40, borderWidth: 3, borderColor: color.paint, padding: 3 },
  goldFrame: { borderWidth: 3, borderColor: color.goldLight, borderRadius: 12, padding: 6 },
  arrow: { color: color.paint, fontSize: 24, fontWeight: '900' },
  chat: { alignSelf: 'stretch', gap: 8 },
  bubble: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, maxWidth: '85%' },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: color.paint, borderBottomRightRadius: 5 },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: color.wall, borderBottomLeftRadius: 5 },
  bubbleText: { color: color.chalk, fontSize: 15 },
  bubbleTextMine: { color: color.ink },
  miniSuit: {
    width: 22,
    height: 24,
    borderRadius: 5,
    backgroundColor: color.stock,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safe: {
    fontFamily: font.stencil,
    color: color.paint,
    fontSize: 72,
    lineHeight: 78,
    borderWidth: 4,
    borderColor: color.paint,
    paddingHorizontal: 18,
    transform: [{ rotate: '-5deg' }],
  },
  rules: { gap: 10, alignItems: 'center' },
  rule: { color: color.alarm, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navNext: { backgroundColor: color.paint, borderColor: color.paint },
  navOff: { opacity: 0.35 },
  navText: { color: color.chalk, fontSize: 16, fontWeight: '800' },
  navNextText: { color: color.ink },
  count: { color: color.faded, fontSize: 14, fontWeight: '700', minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
});
