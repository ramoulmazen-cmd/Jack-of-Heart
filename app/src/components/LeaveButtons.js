import { StyleSheet, View } from 'react-native';
import { color } from '../theme';
import { Button, ErrorText, useAction } from '../ui';
import { HoldButton } from './HoldButton';

/** Hold this long to close the room: long enough that a stray tap never ends everyone's game. */
export const CLOSE_HOLD_MS = 1200;

/**
 * Leave, and for the host, close the room for everyone. Closing is a hold, not a tap: it sends
 * every phone back to the start screen.
 */
export function LeaveButtons({ state, game, leaveTitle = 'Leave' }) {
  const { error, run } = useAction();
  const isHost = state.hostId === state.you.id;
  return (
    <>
      <ErrorText>{error}</ErrorText>
      <View style={styles.row}>
        <Button title={leaveTitle} kind="quiet" onPress={game.leave} style={styles.leave} />
        {isHost ? (
          <HoldButton
            label="Hold to close room"
            tint={color.alarm}
            holdMs={CLOSE_HOLD_MS}
            onComplete={() => run(game.closeRoom)}
            style={styles.close}
            size={16}
          />
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  leave: { flex: 1 },
  close: { flex: 2 },
});
