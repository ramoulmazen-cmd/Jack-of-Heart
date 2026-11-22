import { StyleSheet, Text, View } from 'react-native';
import { color } from '../theme';
import { JackCard } from '../ui';
import { BlackoutFrame, useArmBlackout } from './Blackout';
import { Glow, Stamp } from './Effects';

/**
 * Your secret role, only while you hold the button. From across the table both versions
 * look the same: the same card back dealt in the same way, the same gold glow, and the same
 * three lines of text. The Jack's back is marked, with his face in the heart, but only
 * someone reading your screen can tell them apart.
 *
 * The Jack's version also holds his powers. In the talk (`canArm`), keep holding and a thin
 * frame traces round his card; when it closes, this turn's cell is blacked out. The third line
 * tells him this turn's sight (colour only, a blank card) and what his fake did.
 */
export function RoleOverlay({ state, onArm, canArm = false }) {
  const { isJack, blackout, powers } = state.you;
  const extra = isJack ? powersLine(state, powers) : INNOCENT_EXTRA;
  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Glow size={340} tint={color.paint} strength={1.1} />
      {isJack && blackout && canArm ? (
        <JackWithBlackout status={blackout} onArm={onArm} extra={extra} />
      ) : (
        <>
          <JackCard size={150} entrance tilt="-4deg" faceDown marked={isJack} />
          <Stamp text={isJack ? 'You are the Jack' : 'You are innocent'} tint={color.paint} size={40} tilt={-3} style={styles.roleStamp} />
          <Caption lines={isJack ? CAPTIONS.jack : CAPTIONS.innocent} extra={extra} />
        </>
      )}
    </View>
  );
}

// Everyone gets lines of the same size and colour under their role, so the Jack's lines about
// his powers don't make his screen look different from across the table.
const CAPTIONS = {
  innocent: ['Find the Jack', 'Everyone left wins the moment the Jack is out.'],
  jack: ['Stay hidden', 'Survive until one other player is left.'],
  ready: ['Keep holding for Blackout', 'Their lifelines fail in this cell. Yours works.'],
  on: ['Blackout is on', 'Every other lifeline fails in this cell.'],
  used: ['Blackout used', 'Stay hidden. Survive to the end.'],
};
const INNOCENT_EXTRA = 'A wrong suit can be a lie, a fake, or the Jack seeing badly.';

/** The Jack's third line: this turn's sight, his fake, and how many fakes are left. */
function powersLine(state, powers) {
  if (!powers) return '';
  const name = (id) => state.players.find((p) => p.id === id)?.name ?? 'someone';
  const parts = [];
  if (powers.sight === 'color') parts.push('This turn you see only red or black.');
  if (powers.sight === 'blank') parts.push('This turn one card you hold is blank.');
  if (powers.fake?.viewerId) {
    // Whose card, and who gets the false suit; never which suit (the server doesn't send it).
    parts.push(`You faked ${name(powers.fake.targetId)}’s card: ${name(powers.fake.viewerId)} gets a false suit.`);
  } else if (powers.fake) {
    parts.push('Your fake found nobody to fool, so you got it back.');
  } else if (powers.fakeTarget) {
    parts.push(`You faked ${name(powers.fakeTarget)}’s card.`);
  }
  if (powers.fakesLeft > 0 && !powers.fakeTarget && state.phase === 'choose') {
    parts.push(
      powers.sight
        ? 'No fakes on this turn.'
        : `Fakes left: ${powers.fakesLeft}. Hold someone’s picture for 1 second to fake their card.`,
    );
  } else if (!parts.length) {
    parts.push(powers.fakesLeft > 0 ? `Fakes left: ${powers.fakesLeft}. Use them while choosing.` : 'No fakes left.');
  }
  return parts.join(' ');
}

function Caption({ lines: [title, line], extra }) {
  return (
    <View style={styles.caption}>
      <Text style={styles.captionTitle}>{title}</Text>
      <Text style={styles.captionLine}>{line}</Text>
      {extra ? <Text style={styles.captionLine}>{extra}</Text> : null}
    </View>
  );
}

function JackWithBlackout({ status, onArm, extra }) {
  const { progress, on, armedNow } = useArmBlackout(status, onArm);
  return (
    <>
      <JackCard size={150} entrance tilt="-4deg" faceDown marked>
        {/* The frame only shows while it's being traced, never when he just checks his role. */}
        {status === 'ready' || armedNow ? <BlackoutFrame progress={progress} /> : null}
      </JackCard>
      <Stamp text="You are the Jack" tint={color.paint} size={40} tilt={-3} style={styles.roleStamp} />
      <Caption lines={CAPTIONS[on ? 'on' : status]} extra={extra} />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 10, 9, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  roleStamp: { marginTop: 6, paddingHorizontal: 12 },
  caption: { minHeight: 100, alignItems: 'center', gap: 4, paddingHorizontal: 28 },
  captionTitle: { color: color.goldLight, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  captionLine: { color: color.faded, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
