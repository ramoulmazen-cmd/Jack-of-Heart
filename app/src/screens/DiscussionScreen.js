import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar, PlayerStrip } from '../components/Avatar';
import { FlipCard } from '../components/FlipCard';
import { HoldButton } from '../components/HoldButton';
import { Interrogated } from '../components/Interrogation';
import { RoleOverlay } from '../components/Role';
import { NotesSheet, WhoToldYou } from '../NotesViews';
import { color } from '../theme';
import { ErrorText, Screen, TopBar, useAction } from '../ui';

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
      overlay={showRole ? <RoleOverlay state={state} onArm={game.blackout} canArm /> : null}
    >
      <TopBar
        state={state}
        game={game}
        title="Talk"
        action={isHost ? { text: 'Skip', label: 'Send everyone to their cells now', onPress: () => run(game.skip) } : null}
      />
      <PlayerStrip state={state} />

      {you.interrogated ? <Interrogated state={state} /> : null}
      {cards.length ? <Text style={styles.section}>{one ? 'The card you hold' : 'Your cards'}</Text> : null}
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
      {cards.length ? <Text style={styles.hint}>{held ? 'Let go to hide it' : 'Hold a card to look at it'}</Text> : null}

      {you.interrogated ? null : <Text style={styles.section}>They see yours</Text>}
      <WhoToldYou state={state} notes={notes} compact={height < 700} />

      <NotesSheet visible={notesOpen} onClose={() => setNotesOpen(false)} state={state} notes={notes} />
    </Screen>
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
});
