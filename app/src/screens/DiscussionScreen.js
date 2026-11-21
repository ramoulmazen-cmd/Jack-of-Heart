import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar, PlayerStrip } from '../components/Avatar';
import { BlackoutFrame, useArmBlackout } from '../components/Blackout';
import { Glow, Stamp } from '../components/Effects';
import { FlipCard } from '../components/FlipCard';
import { HoldButton } from '../components/HoldButton';
import { NotesSheet, WhoToldYou } from '../NotesViews';
import { color } from '../theme';
import { ErrorText, JackCard, Screen, TopBar, useAction } from '../ui';

export default function DiscussionScreen({ state, game, notes }) {
  const { you } = state;
  const isHost = state.hostId === you.id;
  const [held, setHeld] = useState(null);
  const [showRole, setShowRole] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const { error, run } = useAction();
  const { width, height } = useWindowDimensions();

  // 2 cards from 5 players; with 4 or fewer you hold just 1, so it can be a little bigger.
  const cards = you.sees.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
  const one = cards.length === 1;
  const byWidth = Math.floor((Math.min(width, 520) - 40 - 24) / (one ? 1.8 : 2.6));
  const byHeight = Math.floor((height - (one ? 430 : 470)) / 1.4);
  const size = Math.max(64, Math.min(one ? 150 : 112, byWidth, byHeight));
  const nameOf = (id) => state.players.find((p) => p.id === id);
  const hasNote = Boolean(notes.round(state.turn).text);

  // The lifeline lives in the cell now; the talk is just talking, your notes and your role.
  const footer = (
    <>
      <ErrorText>{error}</ErrorText>
      <View style={styles.bar}>
        <Pressable
          role="button"
          onPress={() => setNotesOpen(true)}
          style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
        >
          <Text style={styles.barText}>Notes</Text>
          {hasNote ? <View style={styles.dot} /> : null}
        </Pressable>
        <HoldButton
          label="Role"
          tint={color.chalk}
          onHoldStart={() => setShowRole(true)}
          onHoldEnd={() => setShowRole(false)}
          style={styles.barButtonFlex}
        />
      </View>
    </>
  );

  return (
    <Screen
      footer={footer}
      overlay={showRole ? <RoleOverlay isJack={you.isJack} blackout={you.blackout} onArm={game.blackout} /> : null}
    >
      <TopBar
        state={state}
        game={game}
        title="Talk"
        action={isHost ? { text: 'Skip', label: 'Send everyone to their cells now', onPress: () => run(game.skip) } : null}
      />
      <PlayerStrip state={state} />

      <Text style={styles.section}>{one ? 'The card you hold' : 'Your cards'}</Text>
      <View style={styles.cards}>
        {cards.map((p) => {
          const other = nameOf(you.sharedWith?.[p.id]);
          const shown = held === p.id;
          return (
            <Pressable
              key={p.id}
              role="button"
              aria-label={`Hold to see ${p.name}'s card`}
              onPressIn={() => setHeld(p.id)}
              // With two fingers down, letting go of one card must not hide the other.
              onPressOut={() => setHeld((current) => (current === p.id ? null : current))}
              style={styles.cardTile}
            >
              <FlipCard size={size} suit={shown ? p.suit : null} faceUp={shown} />
              <View style={styles.owner}>
                <Avatar player={p} size={22} out={!p.alive} />
                <Text style={styles.ownerName} numberOfLines={1}>
                  {p.name}
                </Text>
              </View>
              {other ? (
                <View style={styles.with}>
                  <Text style={styles.withText}>also seen by</Text>
                  <Avatar player={other} size={16} />
                  <Text style={styles.withName} numberOfLines={1}>
                    {other.name}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{held ? 'Let go to hide it' : 'Hold a card to look at it'}</Text>

      <Text style={styles.section}>They see yours</Text>
      <WhoToldYou state={state} notes={notes} compact={height < 700} />

      <NotesSheet visible={notesOpen} onClose={() => setNotesOpen(false)} state={state} notes={notes} />
    </Screen>
  );
}

/**
 * Your secret role, only while you hold the button. From across the table both versions
 * look the same: the same card back dealt in the same way, the same gold glow, and a gold
 * line of the same length. The Jack's back is marked, with his face in the heart, but only
 * someone reading your screen can tell them apart.
 *
 * The Jack's version also holds his secret power: keep holding and a thin frame traces
 * round his card; when it closes, this turn's cell is blacked out. Nobody else's screen
 * has the frame or the caption.
 */
function RoleOverlay({ isJack, blackout, onArm }) {
  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Glow size={340} tint={color.paint} strength={1.1} />
      {isJack && blackout ? (
        <JackWithBlackout status={blackout} onArm={onArm} />
      ) : (
        <>
          <JackCard size={150} entrance tilt="-4deg" faceDown marked={isJack} />
          <Stamp text={isJack ? 'You are the Jack' : 'You are innocent'} tint={color.paint} size={40} tilt={-3} style={styles.roleStamp} />
          <Caption lines={isJack ? CAPTIONS.jack : CAPTIONS.innocent} />
        </>
      )}
    </View>
  );
}

// Everyone gets two lines of the same size and colour under their role, so the Jack's
// lines about his power don't make his screen look different from across the table.
const CAPTIONS = {
  innocent: ['Find the Jack', 'Everyone left wins the moment the Jack is out.'],
  jack: ['Stay hidden', 'Survive until one other player is left.'],
  ready: ['Keep holding for Blackout', 'Their lifelines fail in this cell. Yours works.'],
  on: ['Blackout is on', 'Every other lifeline fails in this cell.'],
  used: ['Blackout used', 'Stay hidden. Survive to the end.'],
};

function Caption({ lines: [title, line] }) {
  return (
    <View style={styles.caption}>
      <Text style={styles.captionTitle}>{title}</Text>
      <Text style={styles.captionLine}>{line}</Text>
    </View>
  );
}

function JackWithBlackout({ status, onArm }) {
  const { progress, on, armedNow } = useArmBlackout(status, onArm);
  return (
    <>
      <JackCard size={150} entrance tilt="-4deg" faceDown marked>
        {/* The frame only shows while it's being traced, never when he just checks his role. */}
        {status === 'ready' || armedNow ? <BlackoutFrame progress={progress} /> : null}
      </JackCard>
      <Stamp text="You are the Jack" tint={color.paint} size={40} tilt={-3} style={styles.roleStamp} />
      <Caption lines={CAPTIONS[on ? 'on' : status]} />
    </>
  );
}

const styles = StyleSheet.create({
  section: { color: color.faded, fontSize: 14, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  cards: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  cardTile: { alignItems: 'center', maxWidth: 150 },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, maxWidth: 150 },
  ownerName: { color: color.chalk, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  with: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, maxWidth: 150 },
  withText: { color: color.faded, fontSize: 12 },
  withName: { color: color.faded, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  hint: { color: color.paint, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  bar: { flexDirection: 'row', gap: 8 },
  barButton: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  barButtonFlex: { flex: 1 },
  barText: { color: color.chalk, fontSize: 16, fontWeight: '800' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.paint },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 10, 9, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  roleStamp: { marginTop: 6, paddingHorizontal: 12 },
  caption: { height: 66, alignItems: 'center', gap: 4, paddingHorizontal: 28 },
  captionTitle: { color: color.goldLight, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  captionLine: { color: color.faded, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
