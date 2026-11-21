import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Burst, Flash, Glow, Stamp } from '../components/Effects';
import { color, font } from '../theme';
import { Button, ErrorText, JackCard, Screen, useAction } from '../ui';

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
  // Short phones give the card a little less room so the blackout line still fits.
  const cardSize = height < 700 ? 110 : 150;

  let verdict;
  if (you.isJack) verdict = jackWon ? 'You fooled them all.' : 'They found you.';
  else if (!you.alive) verdict = `Out on turn ${you.diedOnTurn}.`;
  else verdict = cleared ? 'You made it out.' : 'You survived, but the Jack won.';

  const footer = (
    <>
      <ErrorText>{error}</ErrorText>
      {isHost ? <Button title="Play again" busy={busy} onPress={() => run(game.reset)} /> : null}
      <Button title="Leave" kind="quiet" onPress={game.leave} />
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

const styles = StyleSheet.create({
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
