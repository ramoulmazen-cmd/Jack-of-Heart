import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Burst, Flash, Glow, Stamp } from '../components/Effects';
import { LeaveButtons } from '../components/LeaveButtons';
import { color, font, suitInk } from '../theme';
import { Button, ErrorText, JackCard, Screen, SuitIcon, useAction } from '../ui';

export default function GameOverScreen({ state, game }) {
  const { you, players, result } = state;
  const jack = players.find((p) => p.id === result.jackId);
  const isHost = state.hostId === you.id;
  const survivors = players.filter((p) => p.alive && p.id !== result.jackId);
  const { busy, error, run } = useAction();
  const { height } = useWindowDimensions();
  const cleared = result.winner === 'players';
  const jackWon = result.winner === 'jack';
  const blackout = result.blackout;
  const secrets = result.jackTurns;
  const hasSecrets = Boolean(secrets && (secrets.color.length || secrets.blank.length || secrets.fakes.length));
  // Short phones give the card a little less room so the reveals underneath still fit.
  const cardSize = height < 700 || hasSecrets ? (height < 700 ? 90 : 120) : 150;

  let verdict;
  if (you.isJack) verdict = jackWon ? 'You fooled them all.' : 'They found you.';
  else if (!you.alive) verdict = `Out on turn ${you.diedOnTurn}.`;
  else verdict = cleared ? 'You made it out.' : 'You survived, but the Jack won.';

  const footer = (
    <>
      <ErrorText>{error}</ErrorText>
      {isHost ? <Button title="Play again" busy={busy} onPress={() => run(game.reset)} /> : null}
      <LeaveButtons state={state} game={game} />
    </>
  );

  return (
    <Screen
      footer={footer}
      overlay={jackWon ? <Flash tint="#FF1E3C" peak={0.55} duration={900} /> : null}
    >
      <View style={styles.stage}>
        <Glow size={360} tint={cleared ? color.paint : color.red} strength={1.4} />
        {cleared ? <Burst count={26} radius={210} /> : null}
        <JackCard size={cardSize} entrance tilt="-5deg" />
        <Stamp
          text={cleared ? 'Game clear' : jackWon ? 'Jack wins' : 'No survivors'}
          tint={cleared ? color.paint : color.alarm}
          size={68}
          delay={500}
          style={styles.headline}
        />
        {jack ? (
          <View style={styles.jackRow}>
            <Avatar player={jack} size={44} you={jack.id === you.id} out={!jack.alive} />
            <Text style={styles.jackText} numberOfLines={1}>
              {jack.id === you.id ? 'You were the Jack' : `${jack.name} was the Jack`}
            </Text>
          </View>
        ) : null}
        <Text style={styles.verdict}>{verdict}</Text>
        {blackout ? <BlackoutReveal blackout={blackout} /> : null}
        {hasSecrets ? <JackSecrets secrets={secrets} players={players} /> : null}
        {cleared && survivors.length ? (
          <View style={styles.survivors}>
            {survivors.map((p) => (
              <Avatar key={p.id} player={p} size={38} you={p.id === you.id} />
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * The secret comes out: which turn the Jack blacked out. Never who used a lifeline, or whether
 * anyone did: the server doesn't send it, so nobody's phone can show it.
 */
function BlackoutReveal({ blackout }) {
  return (
    <View style={styles.blackout} aria-label={`Blackout on turn ${blackout.turn}`}>
      <Text style={styles.blackoutWord}>Blackout</Text>
      <Text style={styles.blackoutText}>The Jack blacked out turn {blackout.turn}.</Text>
    </View>
  );
}

/** A suit as a tiny white card in its real colour, the same as in the chat. */
function MiniSuit({ suit }) {
  return (
    <View style={styles.miniSuit}>
      <SuitIcon suit={suit} size={14} color={suitInk(suit)} />
    </View>
  );
}

const turnList = (turns) => (turns.length === 1 ? `turn ${turns[0]}` : `turns ${turns.join(', ')}`);

/**
 * The Jack's other secrets, for the argument after the game: the turns he couldn't see clearly,
 * and every fake that fooled someone (who saw what, and what it really was).
 */
function JackSecrets({ secrets, players }) {
  const name = (id) => players.find((p) => p.id === id)?.name ?? 'Someone';
  return (
    <View style={styles.secrets} aria-label="The Jack's secrets">
      <Text style={styles.secretsTitle}>The Jack’s secrets</Text>
      {secrets.color.length ? (
        <Text style={styles.secretLine}>Only red or black on {turnList(secrets.color)}.</Text>
      ) : null}
      {secrets.blank.length ? <Text style={styles.secretLine}>A blank card on {turnList(secrets.blank)}.</Text> : null}
      {secrets.fakes.map((f) => (
        <View key={`${f.turn}-${f.targetId}`} style={styles.fakeLine}>
          <Text style={styles.secretLine}>
            Turn {f.turn}: {name(f.viewerId)} saw {name(f.targetId)}’s
          </Text>
          <MiniSuit suit={f.real} />
          <Text style={styles.secretLine}>as</Text>
          <MiniSuit suit={f.suit} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  secrets: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    backgroundColor: 'rgba(12, 9, 10, 0.6)',
    maxWidth: '100%',
  },
  secretsTitle: { color: color.paint, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  secretLine: { color: color.chalk, fontSize: 14, lineHeight: 19, textAlign: 'center' },
  fakeLine: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'center' },
  miniSuit: {
    width: 22,
    height: 24,
    borderRadius: 5,
    backgroundColor: color.stock,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  headline: { marginTop: 10 },
  jackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%' },
  jackText: { color: color.chalk, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  verdict: { color: color.faded, fontSize: 16, textAlign: 'center' },
  blackout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.blood,
    backgroundColor: 'rgba(12, 9, 10, 0.75)',
    maxWidth: '100%',
  },
  blackoutWord: { fontFamily: font.stencil, color: color.alarm, fontSize: 24, lineHeight: 28, transform: [{ rotate: '-4deg' }] },
  blackoutText: { color: color.chalk, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  survivors: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
});
