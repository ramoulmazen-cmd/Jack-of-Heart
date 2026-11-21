import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from './components/Avatar';
import { Sheet } from './components/Sheet';
import { color, suitOnWall } from './theme';
import { SuitChips, SuitIcon, viewersOf } from './ui';

function Suit({ suit, size = 18 }) {
  return <SuitIcon suit={suit} size={size} color={suitOnWall(suit)} />;
}

/** Talk: the two people who see your card, and the suit each one tells you. */
export function WhoToldYou({ state, notes, compact = false }) {
  const viewers = viewersOf(state);
  if (!viewers.length) return null;
  const told = notes.round(state.turn).told ?? {};
  const chip = compact ? 34 : 38;
  return (
    <View style={styles.rows}>
      {viewers.map((v) => (
        <View key={v.id} style={styles.row}>
          <Avatar player={v} size={compact ? 34 : 40} out={v.alive === false} />
          <View style={styles.who}>
            <Text style={styles.name} numberOfLines={1}>
              {v.name}
            </Text>
            <Text style={styles.how} numberOfLines={1}>
              {v.how}
            </Text>
          </View>
          <SuitChips
            size={chip}
            value={told[v.id] ?? null}
            label={`What ${v.name} told you`}
            onChange={(suit) => notes.setTold(state.turn, v.id, suit)}
          />
        </View>
      ))}
    </View>
  );
}

/** Cell: this round's notes, right above the suits. One line per viewer, then your own note. */
export function NotesSummary({ state, notes, onOpen }) {
  const viewers = viewersOf(state);
  const round = notes.round(state.turn);
  const told = round.told ?? {};
  if (!viewers.length && !round.text) return null;
  return (
    <View style={styles.summary} aria-label="Your notes">
      <View style={styles.chips}>
        {viewers.map((v) => (
          <View key={v.id} style={styles.toldChip}>
            <Avatar player={v} size={28} />
            <Text style={styles.toldName} numberOfLines={1}>
              {v.name}
            </Text>
            {told[v.id] ? <Suit suit={told[v.id]} size={22} /> : <Text style={styles.unknown}>?</Text>}
          </View>
        ))}
      </View>
      {round.text ? (
        <Text style={styles.quote} numberOfLines={2} onPress={onOpen}>
          “{round.text}”
        </Text>
      ) : null}
    </View>
  );
}

const RESULT = { right: 'right', wrong: 'wrong' };

function Round({ round }) {
  const told = round.told ?? {};
  return (
    <View style={styles.entry}>
      <Text style={styles.entryTitle}>
        Round {round.turn}
        {round.safe ? '  (collars off)' : ''}
      </Text>
      {(round.viewers ?? []).map((v) => (
        <View key={v.id} style={styles.entryRow}>
          <Avatar player={v} size={24} />
          <Text style={styles.entryText} numberOfLines={1}>
            {v.name}
          </Text>
          {told[v.id] ? <Suit suit={told[v.id]} /> : <Text style={styles.unknown}>?</Text>}
        </View>
      ))}
      {round.result === 'none' ? <Text style={styles.entryText}>You didn’t answer.</Text> : null}
      {RESULT[round.result] ? (
        <View style={styles.entryRow}>
          <Text style={styles.entryText}>You said</Text>
          <Suit suit={round.answer} />
          <Text style={styles.entryText}>{RESULT[round.result]}</Text>
        </View>
      ) : null}
      {round.text ? <Text style={styles.quote}>“{round.text}”</Text> : null}
    </View>
  );
}

/** Your notebook: this round's note, and every earlier round. */
export function NotesSheet({ visible, onClose, state, notes, editable = true }) {
  const rounds = notes.earlier(state.turn);
  return (
    <Sheet visible={visible} onClose={onClose} title="Notes">
      {editable ? (
        <TextInput
          multiline
          maxLength={300}
          editable={notes.loaded}
          value={notes.round(state.turn).text ?? ''}
          onChangeText={(value) => notes.setText(state.turn, value)}
          placeholder="Who hesitated? Who changed their story?"
          placeholderTextColor={color.faded}
          selectionColor={color.paint}
          aria-label="Your notes for this round"
          style={styles.input}
        />
      ) : null}
      {rounds.length ? rounds.map((r) => <Round key={r.turn} round={r} />) : <Text style={styles.empty}>Earlier rounds show up here.</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(34, 48, 41, 0.75)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  who: { flex: 1, minWidth: 60 },
  name: { color: color.chalk, fontSize: 16, fontWeight: '700' },
  how: { color: color.faded, fontSize: 12 },
  summary: { gap: 8, alignItems: 'center' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  toldChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: color.wallRaised,
    borderRadius: 22,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: color.wallLine,
    maxWidth: 200,
  },
  toldName: { color: color.chalk, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  unknown: { color: color.faded, fontSize: 18, fontWeight: '700' },
  quote: { color: color.chalk, fontSize: 15, lineHeight: 21, fontStyle: 'italic', textAlign: 'center' },
  input: {
    minHeight: 96,
    backgroundColor: color.wall,
    borderColor: color.wallLine,
    borderWidth: 1,
    borderRadius: 14,
    color: color.chalk,
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  entry: { gap: 6, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.wallLine },
  entryTitle: { color: color.paint, fontSize: 15, fontWeight: '800' },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryText: { color: color.chalk, fontSize: 15, flexShrink: 1 },
  empty: { color: color.faded, fontSize: 15, textAlign: 'center', paddingVertical: 16 },
});
