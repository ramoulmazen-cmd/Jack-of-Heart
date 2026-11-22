import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AlsoSeenBy } from '../components/AlsoSeenBy';
import { Avatar } from '../components/Avatar';
import { HoldButton } from '../components/HoldButton';
import { RoleOverlay } from '../components/Role';
import { color, font } from '../theme';
import { useChatContext } from '../useChat';
import { Button, Card, ErrorText, Screen, TopBar, clockText, useAction, useSecondsLeft, viewersOf } from '../ui';

/**
 * The 45 seconds right after the lights, before the talk. Everyone glimpsed every card; now you
 * learn whose cards you'll hold and who holds yours, but nobody can look at a card yet: time to make
 * deals, set traps, and maybe vote someone into interrogation.
 */
export default function BriefingScreen({ state, game }) {
  const { you } = state;
  const { width } = useWindowDimensions();
  const chat = useChatContext();
  const left = useSecondsLeft(state.phaseEndsAt, game.clockOffset) ?? 0;
  const [showRole, setShowRole] = useState(false);
  const { error, run } = useAction();

  const find = (id) => state.players.find((p) => p.id === id);
  const held = you.sees.map(find).filter(Boolean);
  const holders = viewersOf(state);
  const poll = state.interrogation?.open ? state.interrogation : null;
  const vote = (id) => run(() => game.vote(poll.yourVote === id ? null : id));
  const size = Math.min(92, Math.floor((Math.min(width, 520) - 40 - 24) / 3.2));

  const footer = (
    <>
      <ErrorText>{error}</ErrorText>
      <View style={styles.bar}>
        <HoldButton
          label="Role"
          tint={color.chalk}
          onHoldStart={() => setShowRole(true)}
          onHoldEnd={() => setShowRole(false)}
          style={styles.role}
        />
        {chat?.available ? (
          <Button title="Private chat" kind="secondary" label="Open the private chat" onPress={() => chat.open()} style={styles.chat} />
        ) : null}
      </View>
    </>
  );

  return (
    <Screen footer={footer} overlay={showRole ? <RoleOverlay state={state} /> : null}>
      <TopBar state={state} game={game} title="Plotting" clock={false} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.clockBlock} aria-label={`Your cards come in ${left} seconds`}>
          <Text style={styles.until}>Your cards in</Text>
          <Text style={[styles.clock, left <= 10 && styles.clockSoon]}>{clockText(left)}</Text>
          <Text style={styles.why}>
            You saw every card. Now you know who holds whose card, but nobody can look at one until the clock runs out.
          </Text>
        </View>

        <Text style={styles.section}>You’ll hold</Text>
        <View style={styles.cards}>
          {held.map((p) => {
            const other = find(you.sharedWith?.[p.id]);
            return (
              <View key={p.id} style={styles.cardTile} aria-label={`You'll hold ${p.name}'s card`}>
                <Card size={size} back />
                <View style={styles.owner}>
                  <Avatar player={p} size={20} />
                  <Text style={styles.ownerName} numberOfLines={1}>
                    {p.name}
                  </Text>
                </View>
                {other ? <AlsoSeenBy player={other} width={140} /> : null}
              </View>
            );
          })}
        </View>

        <Text style={styles.section}>They hold yours</Text>
        <View style={styles.holders}>
          {holders.map((h) => (
            <View key={h.id} style={styles.holder}>
              <Avatar player={h} size={36} />
              <View style={styles.holderText}>
                <Text style={styles.holderName} numberOfLines={1}>
                  {h.name}
                </Text>
                <Text style={styles.holderHow}>{h.how}</Text>
              </View>
            </View>
          ))}
        </View>

        {poll ? <VotePanel state={state} poll={poll} onVote={vote} /> : null}
      </ScrollView>
    </Screen>
  );
}

/** The interrogation vote: tap a name to vote, tap again to take it back. Counts, never names. */
function VotePanel({ state, poll, onVote }) {
  const others = state.players.filter((p) => p.alive && !p.left && p.id !== state.you.id);
  return (
    <View style={styles.vote}>
      <Text style={styles.voteTitle}>Interrogation vote</Text>
      <Text style={styles.voteLine}>
        Once a game. {poll.needed} votes send a player alone for the rest of this turn: their card is swapped for one nobody
        has seen, nobody holds it, they hold none, no lifeline.
      </Text>
      <View style={styles.voteGrid}>
        {others.map((p) => {
          const votes = poll.votes[p.id] ?? 0;
          const mine = poll.yourVote === p.id;
          return (
            <Pressable
              key={p.id}
              role="button"
              aria-label={`Vote for ${p.name}, ${votes} vote${votes === 1 ? '' : 's'}`}
              aria-selected={mine}
              onPress={() => onVote(p.id)}
              style={({ pressed }) => [styles.voteChip, mine && styles.voteChipMine, pressed && styles.pressed]}
            >
              <Avatar player={p} size={30} />
              <Text style={[styles.voteName, mine && styles.voteNameMine]} numberOfLines={1}>
                {p.name}
              </Text>
              {votes ? (
                <View style={[styles.voteCount, mine && styles.voteCountMine]}>
                  <Text style={styles.voteCountText}>{votes}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 12 },
  clockBlock: { alignItems: 'center', marginBottom: 6 },
  until: { color: color.faded, fontSize: 16, fontWeight: '700' },
  clock: {
    fontFamily: font.stencil,
    color: color.paint,
    fontSize: 84,
    lineHeight: 90,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  clockSoon: { color: color.alarm },
  why: { color: color.faded, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  section: { color: color.faded, fontSize: 14, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  cards: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  cardTile: { alignItems: 'center', maxWidth: 140 },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, maxWidth: 140 },
  ownerName: { color: color.chalk, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  holders: { gap: 8 },
  holder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: 14,
    backgroundColor: color.wallRaised,
  },
  holderText: { flex: 1 },
  holderName: { color: color.chalk, fontSize: 16, fontWeight: '800' },
  holderHow: { color: color.faded, fontSize: 13 },
  vote: {
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: color.alarm,
    gap: 6,
  },
  voteTitle: { fontFamily: font.stencil, color: color.alarm, fontSize: 24, lineHeight: 28 },
  voteLine: { color: color.chalk, fontSize: 13, lineHeight: 18 },
  voteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  voteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    maxWidth: '100%',
  },
  voteChipMine: { borderColor: color.alarm, backgroundColor: 'rgba(242, 84, 107, 0.15)' },
  voteName: { color: color.chalk, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  voteNameMine: { color: color.alarm },
  voteCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: color.chalk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteCountMine: { backgroundColor: color.alarm },
  voteCountText: { fontFamily: font.stencil, color: color.ink, fontSize: 14, lineHeight: 17 },
  bar: { flexDirection: 'row', gap: 8 },
  role: { flex: 1 },
  chat: { flex: 2 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});
