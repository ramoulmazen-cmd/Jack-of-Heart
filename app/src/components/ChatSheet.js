import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SUIT_IMAGES, TINT_OF } from '../suitImages';
import { color, SUITS, suitInk, suitOnWall } from '../theme';
import { useChatContext } from '../useChat';
import { Avatar } from './Avatar';
import { Sheet } from './Sheet';

/** The server refuses longer messages (CHAT_MAX_WORDS); a suit on its own counts as one word. */
export const MAX_WORDS = 10;

// Suits travel as these characters, but are always drawn as the game's own images: many phones
// have no font for ♠♥♦♣ and would show nothing.
const SYMBOL_OF = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const SUIT_OF = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs', '♤': 'spades', '♡': 'hearts', '♢': 'diamonds', '♧': 'clubs' };
const SUIT_CHARS = /([♠♥♦♣♤♡♢♧])/;

/** Ready-made lines for the things everyone says in this game. Tap one to add it. */
const PHRASES = [
  'Your card is',
  'What’s my card?',
  'I think it’s',
  'Are you sure?',
  'Tell me yours first',
  'I trust you',
  'Trust me',
  'You lied to me',
  'Someone lied',
  'I’m not the Jack',
  'You’re the Jack',
  'Who’s the Jack?',
  'Vote with me',
  'Choose me',
  'Yes',
  'No',
];

const countWords = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** For one-line previews, where an image can't go: the suit's name instead of its symbol. */
const plainSuits = (text) => text.replace(/[♠♥♦♣♤♡♢♧]/g, (c) => SUIT_OF[c]);

function SuitGlyph({ suit, size, tint }) {
  return (
    <Image
      source={SUIT_IMAGES[suit][TINT_OF[tint] ?? 'chalk']}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessible={false}
    />
  );
}

/** A message's words, with every suit symbol drawn as an image. */
function MessageText({ text, mine }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <View style={styles.words} aria-label={plainSuits(text)}>
      {words.map((word, i) => (
        <View key={i} style={styles.word}>
          {word
            .split(SUIT_CHARS)
            .filter(Boolean)
            .map((piece, j) =>
              SUIT_OF[piece] ? (
                <SuitGlyph
                  key={j}
                  suit={SUIT_OF[piece]}
                  size={18}
                  tint={mine ? suitInk(SUIT_OF[piece]) : suitOnWall(SUIT_OF[piece])}
                />
              ) : (
                <Text key={j} style={[styles.bubbleText, mine && styles.mineText]}>
                  {piece}
                </Text>
              ),
            )}
        </View>
      ))}
    </View>
  );
}

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
                {last ? `${last.from === chat.me ? 'You: ' : ''}${plainSuits(last.text)}` : gone(p) ? 'Out' : 'No messages yet'}
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
              <MessageText text={m.text} mine={mine} />
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

  const words = countWords(draft);
  const tooLong = words > MAX_WORDS;
  // Add a ready-made phrase or a suit to the end of the message.
  const add = (piece) => setDraft((d) => (d.trim() ? `${d.trimEnd()} ${piece}` : piece));

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || tooLong) return;
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.phrases}
      >
        {PHRASES.map((phrase) => (
          <Pressable
            key={phrase}
            role="button"
            aria-label={`Add: ${phrase}`}
            onPress={() => add(phrase)}
            style={({ pressed }) => [styles.phrase, pressed && styles.pressed]}
          >
            <Text style={styles.phraseText}>{phrase}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.tools}>
        {SUITS.map((suit) => (
          <Pressable
            key={suit}
            role="button"
            aria-label={`Add ${suit}`}
            onPress={() => add(SYMBOL_OF[suit])}
            style={({ pressed }) => [styles.suit, pressed && styles.pressed]}
          >
            <SuitGlyph suit={suit} size={22} tint={suitOnWall(suit)} />
          </Pressable>
        ))}
        <Text style={[styles.count, tooLong && styles.countOver]} aria-live="polite">
          {words}/{MAX_WORDS} words
        </Text>
      </View>
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
          disabled={!draft.trim() || busy || tooLong}
          style={({ pressed }) => [styles.send, (!draft.trim() || busy || tooLong) && styles.sendOff, pressed && styles.pressed]}
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
  words: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 5 },
  word: { flexDirection: 'row', alignItems: 'center' },

  phrases: { gap: 6, paddingBottom: 8 },
  phrase: {
    borderWidth: 1.5,
    borderColor: color.wallLine,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  phraseText: { color: color.chalk, fontSize: 14, fontWeight: '700' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  suit: {
    width: 40,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: color.wallLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { marginLeft: 'auto', color: color.faded, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  countOver: { color: color.alarm },

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
