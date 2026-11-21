import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { color } from '../theme';
import { useChatContext } from '../useChat';
import { Avatar } from './Avatar';
import { Sheet } from './Sheet';

const CLOSED = {
  cell: 'No talking in the cell. You can read, not write.',
  dead: 'You’re out, and the dead stay silent.',
  lobby: 'The chat opens when the game starts.',
  gone: 'You left the game.',
};

/**
 * Private messages: first the list of players, then one conversation. Only the two people in a
 * conversation ever receive it; the server doesn't even tell anyone else that it happened.
 */
export function ChatSheet({ state }) {
  const chat = useChatContext();
  if (!chat?.available) return null;
  const other = chat.view.withId ? state.players.find((p) => p.id === chat.view.withId) : null;
  return (
    <Sheet
      visible={chat.view.visible}
      onClose={chat.close}
      onBack={other ? () => chat.show(null) : undefined}
      title={other ? other.name : 'Private chat'}
      tall
      stickToBottom={Boolean(other)}
      footer={other ? <Composer key={other.id} chat={chat} other={other} /> : null}
    >
      {other ? <Conversation chat={chat} other={other} /> : <People state={state} chat={chat} />}
    </Sheet>
  );
}

function People({ state, chat }) {
  // Players who left are listed only if you'd talked to them; the living come first.
  const others = state.players.filter((p) => p.id !== state.you.id && (!p.left || chat.with(p.id).length > 0));
  const gone = (p) => !p.alive || p.left;
  const ordered = [...others.filter((p) => !gone(p)), ...others.filter(gone)];
  return (
    <View style={styles.people}>
      <Text style={styles.lead}>Only the two of you ever see a conversation.</Text>
      {ordered.map((p) => {
        const last = chat.with(p.id).at(-1);
        const unread = chat.unreadFrom(p.id);
        return (
          <Pressable
            key={p.id}
            role="button"
            aria-label={`Chat with ${p.name}${unread ? `, ${unread} new` : ''}`}
            onPress={() => chat.show(p.id)}
            style={({ pressed }) => [styles.person, pressed && styles.pressed]}
          >
            <Avatar player={p} size={44} out={!p.alive} faded={p.left} />
            <View style={styles.personText}>
              <Text style={[styles.personName, gone(p) && styles.dim]} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={[styles.preview, unread > 0 && styles.previewNew]} numberOfLines={1}>
                {last ? `${last.from === chat.me ? 'You: ' : ''}${last.text}` : gone(p) ? 'Out' : 'No messages yet'}
              </Text>
            </View>
            {unread ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function Conversation({ chat, other }) {
  const thread = chat.with(other.id);
  let turn = null;
  return (
    <View style={styles.thread}>
      {thread.length === 0 ? <Text style={styles.empty}>Say something only {other.name} will see.</Text> : null}
      {thread.map((m) => {
        const mine = m.from === chat.me;
        const newTurn = m.turn !== turn;
        turn = m.turn;
        return (
          <View key={m.id}>
            {newTurn ? <Text style={styles.turn}>Turn {m.turn}</Text> : null}
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[styles.bubbleText, mine && styles.mineText]}>{m.text}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Composer({ chat, other }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const out = !other.alive || other.left;
  const closed = chat.closedReason ? CLOSED[chat.closedReason] : out ? `${other.name} is out, and the dead stay silent.` : null;
  if (closed) return <Text style={styles.closed}>{closed}</Text>;

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await chat.send(other.id, text);
      setDraft('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.composer}>
        <TextInput
          aria-label="Message"
          value={draft}
          onChangeText={setDraft}
          placeholder={`Message ${other.name}`}
          placeholderTextColor={color.faded}
          selectionColor={color.paint}
          maxLength={200}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={send}
          style={styles.input}
        />
        <Pressable
          role="button"
          aria-label="Send"
          onPress={send}
          disabled={!draft.trim() || busy}
          style={({ pressed }) => [styles.send, (!draft.trim() || busy) && styles.sendOff, pressed && styles.pressed]}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </>
  );
}

/** The top bar's way in: "Chat", with a count of messages you haven't read. */
export function ChatPill({ chat }) {
  const { unread } = chat;
  return (
    <Pressable
      role="button"
      aria-label={unread ? `Chat, ${unread} new` : 'Chat'}
      onPress={() => chat.open()}
      hitSlop={8}
      style={({ pressed }) => [styles.pill, unread > 0 && styles.pillNew, pressed && styles.pressed]}
    >
      <Text style={[styles.pillText, unread > 0 && styles.pillTextNew]}>Chat</Text>
      {unread ? (
        <View style={styles.pillBadge}>
          <Text style={styles.pillBadgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  people: { gap: 4, paddingBottom: 6 },
  lead: { color: color.faded, fontSize: 14, lineHeight: 19, marginBottom: 6 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderRadius: 14 },
  personText: { flex: 1, gap: 2 },
  personName: { color: color.chalk, fontSize: 17, fontWeight: '800' },
  dim: { color: color.faded },
  preview: { color: color.faded, fontSize: 14 },
  previewNew: { color: color.chalk },
  badge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    backgroundColor: color.paint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: color.ink, fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },

  thread: { gap: 6, paddingTop: 4, paddingBottom: 6 },
  empty: { color: color.faded, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 24 },
  turn: { color: color.faded, fontSize: 12, fontWeight: '800', textAlign: 'center', marginVertical: 8, letterSpacing: 0.5 },
  bubble: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 16 },
  mine: { alignSelf: 'flex-end', backgroundColor: color.paint, borderBottomRightRadius: 5 },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.wall, borderWidth: 1, borderColor: color.wallLine, borderBottomLeftRadius: 5 },
  bubbleText: { color: color.chalk, fontSize: 16, lineHeight: 22 },
  mineText: { color: color.ink },

  closed: { color: color.alarm, fontSize: 15, lineHeight: 21, textAlign: 'center', paddingVertical: 10 },
  error: { color: color.alarm, fontSize: 14, textAlign: 'center' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    // A browser's text box has a natural width; without this it pushes Send off the edge.
    minWidth: 0,
    minHeight: 48,
    backgroundColor: color.wall,
    borderColor: color.wallLine,
    borderWidth: 1,
    borderRadius: 14,
    color: color.chalk,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  send: { height: 48, paddingHorizontal: 18, borderRadius: 14, backgroundColor: color.paint, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  sendText: { color: color.ink, fontSize: 16, fontWeight: '900' },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginRight: 10,
  },
  pillNew: { borderColor: color.paint },
  pillText: { color: color.chalk, fontSize: 15, fontWeight: '800' },
  pillTextNew: { color: color.paint },
  pillBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: color.paint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBadgeText: { color: color.ink, fontSize: 12, fontWeight: '900' },
});
