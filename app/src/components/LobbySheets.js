import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { Button, Card, JackCard, useAction } from '../ui';
import { Avatar } from './Avatar';
import { JoinQR } from './JoinQR';
import { Sheet } from './Sheet';

/** The address friends open: what the server reported, else this page's own address. */
export function inviteUrl(state) {
  if (state.joinUrl) return state.joinUrl;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { origin, hostname } = window.location;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') return origin;
  }
  return null;
}

export function InviteSheet({ visible, onClose, state }) {
  const url = inviteUrl(state);
  const share = () => {
    const message = url ? `Jack of Hearts: open ${url} and join room ${state.code}` : `Jack of Hearts room ${state.code}`;
    if (Platform.OS === 'web') {
      if (navigator.share) navigator.share({ text: message }).catch(() => {});
      else navigator.clipboard?.writeText(message).catch(() => {});
    } else {
      Share.share({ message }).catch(() => {});
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Invite" footer={<Button title="Share" kind="secondary" onPress={share} />}>
      <View style={styles.invite}>
        {url ? (
          <>
            <JoinQR url={url} size={230} />
            <Text style={styles.url} selectable>
              {url.replace(/^https?:\/\//, '')}
            </Text>
          </>
        ) : (
          <Text style={styles.help}>
            Friends on your Wi-Fi or hotspot open this device’s address with :3000. On a hotspot it’s the “Gateway” in
            their Wi-Fi details.
          </Text>
        )}
        <Text style={styles.codeLabel}>Room</Text>
        <Text style={styles.code}>{state.code}</Text>
      </View>
    </Sheet>
  );
}

const SETTINGS = [
  { key: 'discussionSeconds', label: 'Talk', values: [60, 120, 180, 300, 600], format: (s) => `${s / 60} min` },
  { key: 'answerSeconds', label: 'Cell', values: [15, 30, 60], format: (s) => `${s} s` },
  { key: 'maxTurns', label: 'Turns', values: [5, 8, 12, 20], format: (n) => `${n}` },
];

export function settingsSummary(settings) {
  return SETTINGS.map(({ key, label, format }) => ({ label, value: format(settings[key]) }));
}

/** A host-only switch: a label, a line saying what it does, and On / Off. */
function OnOff({ label, hint, value, onChange }) {
  return (
    <View style={styles.setting}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingHint}>{hint}</Text>
      <View style={styles.chips}>
        {[true, false].map((v) => {
          const on = value === v;
          return (
            <Pressable
              key={String(v)}
              role="button"
              aria-label={`${label} ${v ? 'on' : 'off'}`}
              aria-selected={on}
              onPress={() => onChange(v)}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{v ? 'On' : 'Off'}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SettingsSheet({ visible, onClose, state, game }) {
  const { error, run } = useAction();
  return (
    <Sheet visible={visible} onClose={onClose} title="Settings">
      {SETTINGS.map(({ key, label, values, format }) => (
        <View key={key} style={styles.setting}>
          <Text style={styles.settingLabel}>{label}</Text>
          <View style={styles.chips}>
            {values.map((v) => {
              const on = state.settings[key] === v;
              return (
                <Pressable
                  key={v}
                  role="button"
                  aria-selected={on}
                  onPress={() => run(() => game.updateSettings({ [key]: v }))}
                  style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{format(v)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {/* Only the host's phone is told these switches exist (the server leaves them out for everyone else). */}
      {typeof state.settings.blackout === 'boolean' ? (
        <>
          <OnOff
            label="Jack’s secret power"
            hint="A surprise for everyone else. Switch it off if the Jack wins too often."
            value={state.settings.blackout}
            onChange={(v) => run(() => game.updateSettings({ blackout: v }))}
          />
          {state.settings.blackout ? (
            <OnOff
              label="Reveal it at the end"
              hint="On: Game Over says which turn the Jack blacked out. Off: nobody ever learns if he used it."
              value={state.settings.blackoutReveal !== false}
              onChange={(v) => run(() => game.updateSettings({ blackoutReveal: v }))}
            />
          ) : null}
        </>
      ) : null}
      {error ? <Text style={styles.help}>{error}</Text> : null}
    </Sheet>
  );
}

const STEPS = [
  { icon: 'cooldown', title: 'Countdown', line: 'From turn 2, 45 seconds to argue before anyone chooses or sees a card.' },
  { icon: 'choose', title: 'Choose', line: 'Rank who sees your card. The 2 fastest get each person, or just the fastest with 4 or fewer.' },
  { icon: 'lights', title: 'Lights', line: 'See every card but yours for a few seconds.' },
  { icon: 'talk', title: 'Talk', line: 'Keep 2 cards, or 1 with 4 or fewer. Tell the truth, or lie.' },
  { icon: 'chat', title: 'Private chat', line: 'Message any living player, only they see it. Any time but in your cell.' },
  { icon: 'cell', title: 'Cell', line: 'Name your own suit. Wrong means out.' },
  { icon: 'jack', title: 'The Jack', line: 'One of you. When the Jack is out, everyone left wins.' },
  { icon: 'lifeline', title: 'Lifeline', line: 'In your cell, peek at your own card. Once a game, not on the last turn.' },
  { icon: 'safe', title: 'Safe turn', line: 'One secret turn with the collars off. Never the last.' },
];

function StepIcon({ kind }) {
  switch (kind) {
    case 'choose':
      return (
        <View style={styles.iconRow}>
          {['A', 'B', 'C'].map((n, i) => (
            <Avatar key={n} player={{ name: n }} size={22} style={{ marginLeft: i ? -7 : 0 }} />
          ))}
        </View>
      );
    case 'lights':
      return (
        <View style={styles.iconRow}>
          {['spades', 'hearts', 'clubs'].map((s, i) => (
            <View key={s} style={{ marginLeft: i ? -8 : 0, transform: [{ rotate: `${(i - 1) * 10}deg` }] }}>
              <Card size={20} suit={s} />
            </View>
          ))}
        </View>
      );
    case 'talk':
      return (
        <View style={styles.iconRow}>
          <Card size={22} back />
          <View style={{ marginLeft: -6 }}>
            <Card size={22} back />
          </View>
        </View>
      );
    case 'cell':
      return <Text style={styles.iconGlyph}>?</Text>;
    case 'cooldown':
      return <Text style={[styles.iconGlyph, { color: color.paint, fontSize: 26 }]}>0:45</Text>;
    case 'chat':
      return (
        <View style={styles.bubbleIcon}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.bubbleDot} />
          ))}
        </View>
      );
    case 'jack':
      return <JackCard size={24} tilt="0deg" />;
    case 'lifeline':
      return <Card size={22} suit="hearts" />;
    default:
      return <Text style={[styles.iconGlyph, { color: color.paint, fontSize: 22 }]}>0</Text>;
  }
}

export function RulesSheet({ visible, onClose }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="How to play">
      {STEPS.map((step) => (
        <View key={step.title} style={styles.step}>
          <View style={styles.icon}>
            <StepIcon kind={step.icon} />
          </View>
          <View style={styles.stepText}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepLine}>{step.line}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.house}>Never show your screen. No talking in the cell. The dead stay silent.</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  invite: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  url: { color: color.chalk, fontSize: 18, fontWeight: '700' },
  help: { color: color.faded, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  codeLabel: { color: color.faded, fontSize: 14, marginTop: 6 },
  code: { fontFamily: font.stencil, color: color.paint, fontSize: 56, lineHeight: 60, letterSpacing: 8 },
  setting: { gap: 8, marginBottom: 16 },
  settingLabel: { color: color.chalk, fontSize: 16, fontWeight: '700' },
  settingHint: { color: color.faded, fontSize: 13, lineHeight: 18, marginTop: -4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    alignItems: 'center',
  },
  chipOn: { backgroundColor: color.paint, borderColor: color.paint },
  chipText: { color: color.chalk, fontSize: 16, fontWeight: '700' },
  chipTextOn: { color: color.ink },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9 },
  icon: { width: 54, height: 40, alignItems: 'center', justifyContent: 'center' },
  iconRow: { flexDirection: 'row', alignItems: 'center' },
  iconGlyph: { fontFamily: font.stencil, color: color.chalk, fontSize: 30, lineHeight: 34 },
  bubbleIcon: {
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 12,
    borderBottomLeftRadius: 3,
    backgroundColor: color.paint,
  },
  bubbleDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: color.ink },
  stepText: { flex: 1 },
  stepTitle: { color: color.chalk, fontSize: 17, fontWeight: '800' },
  stepLine: { color: color.faded, fontSize: 15, lineHeight: 20 },
  house: { color: color.alarm, fontSize: 14, lineHeight: 20, marginTop: 10, textAlign: 'center' },
});
