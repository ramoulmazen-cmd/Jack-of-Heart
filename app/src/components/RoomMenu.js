import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color } from '../theme';
import { ErrorText, useAction } from '../ui';
import { HoldButton } from './HoldButton';
import { CLOSE_HOLD_MS } from './LeaveButtons';
import { RulesSheet } from './LobbySheets';
import { Sheet } from './Sheet';

/**
 * The menu behind the ⋯ in the top bar, during a game: the rules, leaving, and for the host,
 * closing the room for everyone. Leaving and closing are holds, so a stray tap does nothing.
 */
export function RoomMenu({ state, game, visible, onClose }) {
  const [rules, setRules] = useState(false);
  const { error, run } = useAction();
  const isHost = state.hostId === state.you.id;
  const playing = state.you.alive && state.phase !== 'lobby' && state.phase !== 'over';
  const leave = () => {
    onClose();
    run(game.leave);
  };
  const closeRoom = () => {
    onClose();
    run(game.closeRoom);
  };
  return (
    <>
      <Sheet visible={visible && !rules} onClose={onClose} title={`Room ${state.code}`}>
        <Pressable
          role="button"
          onPress={() => setRules(true)}
          style={({ pressed }) => [styles.rules, pressed && styles.pressed]}
        >
          <Text style={styles.rulesText}>How to play</Text>
        </Pressable>

        <View style={styles.block}>
          <Text style={styles.label}>Leave the game</Text>
          <Text style={styles.hint}>
            {playing ? 'You’ll be out of this game, and you can’t come back to it.' : 'You can watch until the end, or go now.'}
          </Text>
          <HoldButton label="Hold to leave" tint={color.chalk} holdMs={CLOSE_HOLD_MS} onComplete={leave} />
        </View>

        {isHost ? (
          <View style={styles.block}>
            <Text style={styles.label}>Close the room</Text>
            <Text style={styles.hint}>Ends the game for everyone and sends every phone back to the start.</Text>
            <HoldButton label="Hold to close room" tint={color.alarm} holdMs={CLOSE_HOLD_MS} onComplete={closeRoom} />
          </View>
        ) : null}
        <ErrorText>{error}</ErrorText>
      </Sheet>
      <RulesSheet visible={visible && rules} onClose={() => setRules(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  rules: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  rulesText: { color: color.chalk, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  block: { gap: 6, marginBottom: 18 },
  label: { color: color.chalk, fontSize: 16, fontWeight: '800' },
  hint: { color: color.faded, fontSize: 14, lineHeight: 19, marginBottom: 4 },
});
