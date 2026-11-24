import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { Button, useAction } from '../ui';
import { HowToPlaySheet } from './HowToPlay';
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
  {
    key: 'briefingSeconds',
    label: 'Plotting',
    hint: 'After the lights, before the talk: everyone knows who holds whose card, but nobody can look at one.',
    values: [15, 30, 45, 60, 90],
    format: (s) => `${s} s`,
  },
  { key: 'discussionSeconds', label: 'Talk', values: [60, 120, 180, 300, 600], format: (s) => `${s / 60} min` },
  { key: 'answerSeconds', label: 'Cell', values: [15, 30, 60], format: (s) => `${s} s` },
  { key: 'maxTurns', label: 'Turns', values: [5, 8, 12, 20], format: (n) => `${n}` },
  // The Jack's limits: everyone sees how many, only the Jack learns which turns.
  {
    key: 'colorTurns',
    label: 'Jack’s colour turns',
    summary: (n) => (n === 1 ? 'colour turn' : 'colour turns'),
    hint: 'Turns where the Jack sees only red or black, not the suit.',
    values: [0, 1, 2, 3],
    format: (n) => `${n}`,
  },
  {
    key: 'blankTurns',
    label: 'Jack’s blank turns',
    summary: (n) => (n === 1 ? 'blank turn' : 'blank turns'),
    hint: 'Turns where one card the Jack holds is blank.',
    values: [0, 1, 2],
    format: (n) => `${n}`,
  },
  {
    key: 'fakeSuits',
    label: 'Jack’s fakes',
    summary: (n) => (n === 1 ? 'fake' : 'fakes'),
    hint: 'Times a game the Jack can make someone see a false suit on a card. 0 turns it off.',
    values: [0, 1, 2, 3],
    format: (n) => `${n}`,
  },
];

export function settingsSummary(settings) {
  const rows = SETTINGS.filter(({ key }) => settings[key] !== undefined).map(({ key, label, summary, format }) => ({
    label: typeof summary === 'function' ? summary(settings[key]) : label,
    value: format(settings[key]),
  }));
  if (typeof settings.interrogation === 'boolean') {
    rows.push({ label: 'interrogation', value: settings.interrogation ? 'With' : 'No' });
  }
  if (typeof settings.safeTurn === 'boolean') {
    rows.push({ label: 'safe turn', value: settings.safeTurn ? 'With' : 'No' });
  }
  if (typeof settings.talkChat === 'boolean') {
    rows.push({ label: 'chat in the talk', value: settings.talkChat ? 'With' : 'No' });
  }
  // Voice messages live in the talk's chat: without it there are none to mention.
  if (typeof settings.voiceChat === 'boolean' && settings.talkChat !== false) {
    rows.push({ label: 'voice messages', value: settings.voiceChat ? 'With' : 'No' });
  }
  return rows;
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
      {SETTINGS.map(({ key, label, hint, values, format }) => (
        <View key={key} style={styles.setting}>
          <Text style={styles.settingLabel}>{label}</Text>
          {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
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
      <OnOff
        label="Interrogation vote"
        hint="Once a game, the table can vote one player alone for a turn: nobody sees their card, no lifeline."
        value={state.settings.interrogation !== false}
        onChange={(v) => run(() => game.updateSettings({ interrogation: v }))}
      />
      <OnOff
        label="Safe turn"
        hint="One secret turn where nobody dies, never the last. Off: every turn counts."
        value={state.settings.safeTurn !== false}
        onChange={(v) => run(() => game.updateSettings({ safeTurn: v }))}
      />
      <OnOff
        label="Private chat in the talk"
        hint="The private chat is always open while choosing and in Plotting. Off: it closes in the talk, so everyone has to talk to each other."
        value={state.settings.talkChat !== false}
        onChange={(v) => run(() => game.updateSettings({ talkChat: v }))}
      />
      {/* Voice messages are for the talk only, so they need the chat in the talk. */}
      {state.settings.talkChat !== false ? (
        <OnOff
          label="Voice messages"
          hint="In the private chat, during the talk only, up to 20 s each. On when you play apart; off in one room, where everyone would hear."
          value={state.settings.voiceChat === true}
          onChange={(v) => run(() => game.updateSettings({ voiceChat: v }))}
        />
      ) : null}
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

/**
 * How to play: the slides (HowToPlay.js), with this room's times and counts. The lobby and the
 * in-game menu both open it. The blackout slide is only for phones the server tells about the
 * power: the host's (its switch, when on) and the Jack's (his blackout status).
 */
export function RulesSheet({ visible, onClose, state }) {
  const secret = state.settings?.blackout === true || (state.you != null && 'blackout' in state.you);
  return <HowToPlaySheet visible={visible} onClose={onClose} settings={state.settings} secret={secret} />;
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
});
