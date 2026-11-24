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

const number = (n) => `${n}`;
const plural = (one, many) => (n) => (n === 1 ? one : many);

/**
 * Every setting, in the groups the host sees in Settings and everyone sees in the lobby. A setting
 * is either a row of values to pick from (`values`, shown with `format`) or an On / Off switch
 * (`onByDefault` says which way it starts). `show` hides one that means nothing right now: the
 * reveal without the secret power. `summary` names it in the lobby ("3 min talk", "With safe
 * turn"); the secret group never appears there.
 */
const SECTIONS = [
  {
    title: 'Time',
    hint: 'How long each part of a turn lasts.',
    items: [
      {
        key: 'briefingSeconds',
        label: 'Plotting',
        hint: 'After the lights, before the talk: everyone knows who holds whose card, but nobody can look at one.',
        values: [15, 30, 45, 60, 90],
        format: (s) => `${s} s`,
        summary: () => 'plotting',
      },
      {
        key: 'discussionSeconds',
        label: 'Talk',
        hint: 'Hold your cards and tell their owners their suits, true or not.',
        values: [60, 120, 180, 300, 600],
        format: (s) => `${s / 60} min`,
        summary: () => 'talk',
      },
      {
        key: 'answerSeconds',
        label: 'Cell',
        hint: 'Alone, to name your own suit.',
        values: [15, 30, 60],
        format: (s) => `${s} s`,
        summary: () => 'cell',
      },
    ],
  },
  {
    title: 'Game',
    hint: 'How long a game lasts, and the rules for everyone.',
    items: [
      {
        key: 'maxTurns',
        label: 'Turns',
        hint: 'If the Jack is still in after the last one, he wins.',
        values: [5, 8, 12, 20],
        format: number,
        summary: plural('turn', 'turns'),
      },
      {
        key: 'safeTurn',
        label: 'Safe turn',
        hint: 'One secret turn where nobody dies, never the last. Off: every turn counts.',
        onByDefault: true,
        summary: () => 'safe turn',
      },
      {
        key: 'interrogation',
        label: 'Interrogation vote',
        hint: 'Once a game, the table can vote one player alone for a turn: nobody sees their card, no lifeline.',
        onByDefault: true,
        summary: () => 'interrogation',
      },
    ],
  },
  {
    title: 'The Jack',
    hint: 'What the Jack can’t see, and his trick. Everyone sees how many; only the Jack learns which turns.',
    items: [
      {
        key: 'colorTurns',
        label: 'Colour turns',
        hint: 'Turns where the Jack sees only red or black, not the suit.',
        values: [0, 1, 2, 3],
        format: number,
        summary: plural('colour turn', 'colour turns'),
      },
      {
        key: 'blankTurns',
        label: 'Blank turns',
        hint: 'Turns where one card the Jack holds is blank.',
        values: [0, 1, 2],
        format: number,
        summary: plural('blank turn', 'blank turns'),
      },
      {
        key: 'fakeSuits',
        label: 'Fakes',
        hint: 'Times a game the Jack can make someone see a false suit on a card. 0 turns it off.',
        values: [0, 1, 2, 3],
        format: number,
        summary: plural('fake', 'fakes'),
      },
    ],
  },
  {
    title: 'Chat',
    hint: 'The private chat between two players is always open while choosing and in Plotting.',
    items: [
      {
        key: 'talkChat',
        label: 'Private chat in the talk',
        hint: 'Off (the default): it closes in the talk, so everyone has to talk to each other. On: text messages in the talk too.',
        onByDefault: false,
        summary: () => 'chat in the talk',
      },
      {
        key: 'voiceChat',
        label: 'Voice messages',
        // The server keeps the two together: voice on opens the talk's chat, closing that ends voice.
        hint: 'In the talk’s private chat, up to 20 s each; turning them on opens the chat in the talk too. On when you play apart; off in one room, where everyone would hear.',
        onByDefault: false,
        summary: () => 'voice messages',
      },
    ],
  },
  {
    // Only the host's phone is told these switches exist (the server leaves them out for everyone else).
    title: 'Secret',
    hint: 'Only your phone shows these: the others don’t know they exist. Don’t read them out.',
    secret: true,
    items: [
      {
        key: 'blackout',
        label: 'Jack’s secret power',
        hint: 'A surprise for everyone else. Switch it off if the Jack wins too often.',
        onByDefault: true,
      },
      {
        key: 'blackoutReveal',
        label: 'Reveal it at the end',
        hint: 'On: Game Over says which turn the Jack blacked out. Off: nobody ever learns if he used it.',
        onByDefault: true,
        show: (s) => s.blackout === true,
      },
    ],
  },
];

const isSwitch = (item) => !item.values;
const switchedOn = (item, settings) => (item.onByDefault ? settings[item.key] !== false : settings[item.key] === true);

/** The groups and settings this phone has, and that mean something right now. */
function visibleSections(settings) {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => settings[item.key] !== undefined && item.show?.(settings) !== false),
  })).filter((section) => section.items.length > 0);
}

/** For the lobby: [{ title, rows: [{ label, value }] }], e.g. Time: "45 s" plotting, "3 min" talk. */
export function settingsSummary(settings) {
  return visibleSections(settings)
    .filter((section) => !section.secret)
    .map((section) => ({
      title: section.title,
      rows: section.items.map((item) => ({
        label: item.summary(settings[item.key]),
        value: isSwitch(item) ? (switchedOn(item, settings) ? 'With' : 'No') : item.format(settings[item.key]),
      })),
    }));
}

/** One setting's values to pick from, as chips. */
function Chips({ item, value, onChange }) {
  return (
    <View style={styles.setting}>
      <Text style={styles.settingLabel}>{item.label}</Text>
      {item.hint ? <Text style={styles.settingHint}>{item.hint}</Text> : null}
      <View style={styles.chips}>
        {item.values.map((v) => {
          const on = value === v;
          return (
            <Pressable
              key={v}
              role="button"
              aria-label={`${item.label} ${item.format(v)}`}
              aria-selected={on}
              onPress={() => onChange(v)}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{item.format(v)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
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

/**
 * The host's settings, in groups: a title, a line saying what the group is about, and a card with
 * its settings. The secret group is drawn apart, in red, so it's never read out by mistake.
 */
export function SettingsSheet({ visible, onClose, state, game }) {
  const { error, run } = useAction();
  const set = (key) => (value) => run(() => game.updateSettings({ [key]: value }));
  return (
    <Sheet visible={visible} onClose={onClose} title="Settings">
      {visibleSections(state.settings).map((section) => (
        <View key={section.title} role="group" aria-label={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, section.secret && styles.sectionTitleSecret]}>{section.title}</Text>
          <Text style={styles.sectionHint}>{section.hint}</Text>
          <View style={[styles.card, section.secret && styles.cardSecret]}>
            {section.items.map((item, i) => (
              <View key={item.key} style={i > 0 ? styles.divided : null}>
                {isSwitch(item) ? (
                  <OnOff
                    label={item.label}
                    hint={item.hint}
                    value={switchedOn(item, state.settings)}
                    onChange={set(item.key)}
                  />
                ) : (
                  <Chips item={item} value={state.settings[item.key]} onChange={set(item.key)} />
                )}
              </View>
            ))}
          </View>
        </View>
      ))}
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
  section: { marginBottom: 24 },
  sectionTitle: { fontFamily: font.stencil, color: color.paint, fontSize: 26, lineHeight: 30, letterSpacing: 1 },
  sectionTitleSecret: { color: color.alarm },
  sectionHint: { color: color.faded, fontSize: 13, lineHeight: 18, marginTop: 2, marginBottom: 10 },
  // The sheet is wallRaised: the cards sit a shade darker, so each group reads as one block.
  card: {
    backgroundColor: color.wall,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.wallLine,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  cardSecret: { borderColor: color.alarm, borderStyle: 'dashed', borderWidth: 1.5 },
  divided: { borderTopWidth: 1, borderTopColor: color.wallLine, paddingTop: 14 },
  setting: { gap: 8, marginBottom: 14 },
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
