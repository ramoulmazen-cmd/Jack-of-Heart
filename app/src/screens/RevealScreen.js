import { StyleSheet, Text, View } from 'react-native';
import { PlayerGrid } from '../components/Avatar';
import { Burst, Flash, Glow, Shake, Stamp } from '../components/Effects';
import { color } from '../theme';
import { Card, Countdown, Screen } from '../ui';

/**
 * Between turns. The result fills the middle of the screen (ALIVE, DEAD or SAFE), and below it
 * everyone's mugshot: whoever went out this turn shakes, greys and gets stamped.
 */
export default function RevealScreen({ state, game }) {
  const mine = state.deaths.find((d) => d.id === state.you.id);
  const justOut = state.deaths.map((d) => d.id);
  const players = state.players.filter((p) => !(p.left && !p.alive && !justOut.includes(p.id)));

  let result;
  if (state.safe) result = <SafeResult outcome={state.you.safeResult} />;
  else if (mine) result = <DeadResult death={mine} />;
  else result = <AliveResult />;

  const footer = (
    <View style={styles.next}>
      <Text style={styles.nextText}>Next turn</Text>
      <Countdown endsAt={state.phaseEndsAt} clockOffset={game.clockOffset} size={26} quiet />
    </View>
  );

  return (
    <Screen
      background={mine ? color.blood : color.wall}
      footer={footer}
      overlay={mine ? <Flash tint="#FF1E3C" peak={0.7} duration={700} /> : null}
    >
      <View style={styles.stage}>{result}</View>
      <PlayerGrid players={players} youId={state.you.id} justOut={justOut} maxSize={62} />
    </Screen>
  );
}

function AliveResult() {
  return (
    <>
      <Glow size={320} tint={color.paint} />
      <Burst />
      <Stamp text="Alive" tint={color.paint} size={108} />
    </>
  );
}

function DeadResult({ death }) {
  return (
    <Shake strength={18} style={styles.dead}>
      <Glow size={320} tint="#FF1E3C" strength={1.3} />
      <Stamp text="Dead" tint={color.alarm} size={112} tilt={-7} />
      <View style={styles.evidence}>
        <Card size={58} suit={death.suit} />
        <Text style={styles.vs}>≠</Text>
        {death.answer ? <Card size={58} suit={death.answer} /> : <Card size={58} back />}
      </View>
    </Shake>
  );
}

function SafeResult({ outcome }) {
  const tint = outcome === 'right' ? color.paint : color.alarm;
  const word = { right: 'Right', wrong: 'Wrong', none: 'No answer' }[outcome] ?? '';
  return (
    <>
      <Glow size={320} tint={color.chalk} strength={0.8} />
      <Stamp text="Safe turn" tint={color.chalk} size={72} tilt={-3} />
      <Text style={styles.safeLine}>Collars were off. Only you see this:</Text>
      {word ? <Stamp text={word} tint={tint} size={56} delay={450} tilt={5} outlined /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 220 },
  dead: { alignItems: 'center', gap: 16 },
  evidence: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  vs: { color: color.chalk, fontSize: 30, fontWeight: '800' },
  safeLine: { color: color.faded, fontSize: 15, textAlign: 'center' },
  next: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 40 },
  nextText: { color: color.faded, fontSize: 15 },
});
