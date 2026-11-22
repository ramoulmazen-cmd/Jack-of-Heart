import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PlayerGrid } from '../components/Avatar';
import { Backdrop } from '../components/Backdrop';
import { LeaveButtons } from '../components/LeaveButtons';
import { InviteSheet, RulesSheet, SettingsSheet, settingsSummary } from '../components/LobbySheets';
import { PhotoSheet } from '../components/PhotoSheet';
import { color, font } from '../theme';
import { Button, ErrorText, Screen, useAction } from '../ui';

export default function LobbyScreen({ state, game }) {
  const { you, players, minPlayers } = state;
  const isHost = state.hostId === you.id;
  const missing = Math.max(0, minPlayers - players.length);
  const { busy, error, run } = useAction();
  const [sheet, setSheet] = useState(null);
  const close = () => setSheet(null);

  const footer = (
    <>
      <ErrorText>{error}</ErrorText>
      {isHost ? (
        <Button
          title={missing ? `${missing} more to start` : 'Start'}
          disabled={missing > 0}
          busy={busy}
          onPress={() => run(game.start)}
        />
      ) : (
        <View style={styles.waiting}>
          <Text style={styles.waitingText}>Waiting for the host</Text>
        </View>
      )}
      <LeaveButtons state={state} game={game} />
    </>
  );

  return (
    <Screen scroll footer={footer} backdrop={<Backdrop />}>
      <View style={styles.top}>
        <View style={styles.fill}>
          <Text style={styles.roomLabel}>Room</Text>
          <Text style={styles.code} aria-label={`Room code ${state.code.split('').join(' ')}`}>
            {state.code}
          </Text>
        </View>
        <Pressable role="button" onPress={() => setSheet('invite')} style={({ pressed }) => [styles.invite, pressed && styles.pressed]}>
          <Text style={styles.inviteText}>Invite</Text>
        </Pressable>
      </View>

      <View style={styles.count}>
        <Text style={styles.countNumber}>{players.length}</Text>
        <Text style={styles.countLabel}>{players.length === 1 ? 'player' : 'players'}</Text>
      </View>

      <PlayerGrid
        players={players}
        youId={you.id}
        columns={players.length <= 6 ? 3 : 4}
        maxSize={78}
        onPressYou={() => setSheet('photo')}
        renderTag={(p) => (p.id === state.hostId ? <Text style={styles.host}>host</Text> : null)}
      />

      <View style={styles.tools}>
        <Pressable role="button" onPress={() => setSheet('rules')} style={({ pressed }) => [styles.tool, pressed && styles.pressed]}>
          <Text style={styles.toolText}>How to play</Text>
        </Pressable>
        <Pressable
          role="button"
          onPress={() => (isHost ? setSheet('settings') : null)}
          style={({ pressed }) => [styles.tool, styles.settings, pressed && isHost && styles.pressed]}
        >
          {settingsSummary(state.settings).map(({ label, value }) => (
            <Text key={label} style={styles.setting}>
              <Text style={styles.settingValue}>{value}</Text> {label.toLowerCase()}
            </Text>
          ))}
          {isHost ? <Text style={styles.edit}>Edit</Text> : null}
        </Pressable>
      </View>

      <InviteSheet visible={sheet === 'invite'} onClose={close} state={state} />
      <RulesSheet visible={sheet === 'rules'} onClose={close} />
      <SettingsSheet visible={sheet === 'settings'} onClose={close} state={state} game={game} />
      <PhotoSheet
        visible={sheet === 'photo'}
        onClose={close}
        name={you.name}
        current={game.photo}
        onSave={game.setPhoto}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  roomLabel: { color: color.faded, fontSize: 14 },
  code: { fontFamily: font.stencil, color: color.paint, fontSize: 76, lineHeight: 80, letterSpacing: 10 },
  invite: {
    backgroundColor: color.paint,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  inviteText: { color: color.ink, fontSize: 17, fontWeight: '800' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14, marginBottom: 14 },
  countNumber: { fontFamily: font.stencil, color: color.chalk, fontSize: 34, lineHeight: 38 },
  countLabel: { color: color.faded, fontSize: 16 },
  host: { color: color.paint, fontSize: 12, fontWeight: '800', marginTop: -4 },
  tools: { marginTop: 22, gap: 10 },
  tool: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolText: { color: color.chalk, fontSize: 16, fontWeight: '700' },
  settings: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', alignContent: 'center', paddingVertical: 10 },
  setting: { color: color.faded, fontSize: 14 },
  settingValue: { color: color.chalk, fontWeight: '800' },
  edit: { color: color.paint, fontSize: 14, fontWeight: '800' },
  waiting: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  waitingText: { color: color.faded, fontSize: 16 },
});
