import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PlayerStrip } from '../components/Avatar';
import { BlackoutHit } from '../components/Blackout';
import { BigCountdown, Glow, Stamp } from '../components/Effects';
import { FlipCard } from '../components/FlipCard';
import { HoldButton } from '../components/HoldButton';
import { NotesSheet, NotesSummary } from '../NotesViews';
import { color, font, SUITS } from '../theme';
import { Button, Card, ErrorText, Screen, SuitIcon, TopBar, useAction } from '../ui';

const PEEK_MS = 1000;

export default function CellScreen({ state, game, notes }) {
  const [choice, setChoice] = useState(null);
  const [peek, setPeek] = useState(null);
  const [blackedOut, setBlackedOut] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const { busy, error, run } = useAction();
  const { width } = useWindowDimensions();
  const size = Math.min(96, Math.floor((Math.min(width, 520) - 40 - 3 * 12) / 4));
  const locked = state.you.answer;
  const picked = locked ?? choice;

  useEffect(() => {
    if (!peek) return undefined;
    const id = setTimeout(() => setPeek(null), PEEK_MS);
    return () => clearTimeout(id);
  }, [peek]);

  const footer = locked ? null : (
    <>
      <ErrorText>{error}</ErrorText>
      <View style={styles.bar}>
        {state.lastTurn ? (
          // Everyone gets the same note on the last turn, used lifeline or not, so a glance at a
          // screen never tells you who still had one.
          <View style={[styles.lifeline, styles.noLifeline]} aria-label="No lifelines on the last turn">
            <Text style={styles.noLifelineText}>Last turn:{'\n'}no lifeline</Text>
          </View>
        ) : state.you.lifelineUsed ? null : (
          <HoldButton
            label="Lifeline"
            disabled={busy}
            onComplete={() =>
              run(async () => {
                const result = await game.lifeline();
                if (result.blackout) setBlackedOut(true);
                else setPeek(result.suit);
              })
            }
            style={styles.lifeline}
          />
        )}
        <Button
          title={choice ? 'Lock in' : 'Pick a suit'}
          label={choice ? `Lock in ${choice}` : undefined}
          icon={choice ? <SuitIcon suit={choice} size={20} color={color.stock} /> : null}
          disabled={!choice}
          busy={busy}
          onPress={() => run(() => game.answer(choice))}
          style={styles.lock}
        />
      </View>
    </>
  );

  const overlay = blackedOut ? (
    <BlackoutHit onDone={() => setBlackedOut(false)} />
  ) : peek ? (
    <View pointerEvents="none" style={styles.overlay}>
      <Glow size={300} tint={color.paint} />
      <FlipCard size={150} suit={peek} faceUp />
      <Text style={styles.overlayText}>Your card</Text>
    </View>
  ) : null;

  return (
    <Screen background={color.cell} footer={footer} overlay={overlay}>
      <TopBar state={state} game={game} title="Cell" />
      <PlayerStrip state={state} />
      <View style={styles.stage}>
        <BigCountdown endsAt={state.phaseEndsAt} clockOffset={game.clockOffset} from={5} />
        <Text style={styles.question}>Your suit?</Text>
        <NotesSummary state={state} notes={notes} onOpen={() => setNotesOpen(true)} />
        <View style={styles.suits}>
          {SUITS.map((suit) => (
            <Pressable
              key={suit}
              disabled={Boolean(locked)}
              onPress={() => setChoice(suit)}
              role="button"
              aria-label={suit}
              aria-selected={picked === suit}
              style={({ pressed }) => [picked && picked !== suit && styles.dimmed, pressed && styles.pressed]}
            >
              <Card size={size} suit={suit} selected={picked === suit} />
            </Pressable>
          ))}
        </View>
        {locked ? (
          <View style={styles.locked}>
            <Stamp text="Locked in" tint={color.paint} size={48} outlined tilt={-4} />
            <Text style={styles.wait}>Waiting for the others</Text>
          </View>
        ) : null}
        {notes.earlier(state.turn).length ? (
          <Pressable onPress={() => setNotesOpen(true)} hitSlop={8} style={styles.earlier}>
            <Text style={styles.earlierText}>Earlier rounds</Text>
          </Pressable>
        ) : null}
      </View>
      <NotesSheet visible={notesOpen} onClose={() => setNotesOpen(false)} state={state} notes={notes} editable={false} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, justifyContent: 'center', gap: 18 },
  question: { fontFamily: font.stencil, color: color.chalk, fontSize: 52, lineHeight: 56, textAlign: 'center' },
  suits: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingTop: 10 },
  dimmed: { opacity: 0.35 },
  pressed: { transform: [{ scale: 0.95 }] },
  locked: { alignItems: 'center', gap: 6 },
  wait: { color: color.faded, fontSize: 15 },
  earlier: { alignSelf: 'center', paddingVertical: 6 },
  earlierText: { color: color.paint, fontSize: 15, fontWeight: '800' },
  bar: { flexDirection: 'row', gap: 10 },
  lifeline: { width: 120 },
  noLifeline: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.wallLine,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  noLifelineText: { color: color.faded, fontSize: 13, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  lock: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 10, 9, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  overlayText: { fontFamily: font.stencil, color: color.paint, fontSize: 32, lineHeight: 36 },
});
