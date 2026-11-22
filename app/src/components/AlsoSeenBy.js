import { StyleSheet, Text, View } from 'react-native';
import { color } from '../theme';
import { Avatar } from './Avatar';

/**
 * Under a card you hold: the other person who holds it. Two lines, "also seen by" and then the
 * name, so a long name never pushes "by" onto a line of its own: the name is cut short instead.
 */
export function AlsoSeenBy({ player, width = 150 }) {
  return (
    <View style={[styles.box, { maxWidth: width }]} aria-label={`Also seen by ${player.name}`}>
      <Text style={styles.label} numberOfLines={1}>
        also seen by
      </Text>
      <View style={styles.who}>
        <Avatar player={player} size={16} />
        <Text style={styles.name} numberOfLines={1}>
          {player.name}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', marginTop: 3 },
  label: { color: color.faded, fontSize: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', marginTop: 1 },
  name: { color: color.faded, fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
