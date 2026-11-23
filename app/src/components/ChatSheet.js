import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SUIT_IMAGES, TINT_OF } from '../suitImages';
import { color, SUITS, suitInk } from '../theme';
import { useChatContext } from '../useChat';
import { VOICE_MAX_SECONDS, playVoice, startRecording, voiceAvailable, voiceUnavailableReason } from '../voice';
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

/** 0:07: a voice message's length. */
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** A clip shorter than this is a slip of the finger, not a message. */
const MIN_VOICE_SECONDS = 0.6;

/** What a message says in a one-line preview. */
const previewOf = (m) => (m.voice ? `Voice message ${clock(m.voice.seconds)}` : plainSuits(m.text));

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

/** A suit as a tiny playing card: white, with the suit in its real colour (red ♥♦, black ♠♣). */
function SuitCard({ suit, size = 16 }) {
  return (
    <View style={[styles.suitCard, { width: size + 8, height: size + 10 }]}>
      <SuitGlyph suit={suit} size={size} tint={suitInk(suit)} />
    </View>
  );
}

/**
 * A word cut into its suits and its text, with very long text cut into short runs that can wrap:
 * an unbroken 150-letter word would otherwise run off the side of the screen.
 */
const CHUNK = 18;
const piecesOf = (word) =>
  word
    .split(SUIT_CHARS)
    .filter(Boolean)
    .flatMap((piece) => {
      const chars = Array.from(piece);
      if (SUIT_OF[piece] || chars.length <= CHUNK) return [piece];
      const runs = [];
      for (let i = 0; i < chars.length; i += CHUNK) runs.push(chars.slice(i, i + CHUNK).join(''));
      return runs;
    });

/** A message's words, with every suit symbol drawn as a tiny card in its colour. */
function MessageText({ text, mine }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <View style={styles.words} aria-label={plainSuits(text)}>
      {words.map((word, i) => (
        <View key={i} style={styles.word}>
          {piecesOf(word).map((piece, j) =>
              SUIT_OF[piece] ? (
                <SuitCard key={j} suit={SUIT_OF[piece]} />
              ) : (
                <Text key={j} style={[styles.bubbleText, styles.longWord, mine && styles.mineText]}>
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
  // Voice messages: only if the host switched them on, and only during the talk.
  const voice = state.settings.voiceChat === true && state.phase === 'discussion';
  return (
    <Sheet
      visible={chat.view.visible}
      onClose={chat.close}
      onBack={other ? () => chat.show(null) : undefined}
      title={other ? other.name : 'Private chat'}
      tall
      stickToBottom={Boolean(other)}
      footer={other ? <Composer key={other.id} chat={chat} other={other} voice={voice} /> : null}
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
                {last ? `${last.from === chat.me ? 'You: ' : ''}${previewOf(last)}` : gone(p) ? 'Out' : 'No messages yet'}
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
  const [playing, setPlaying] = useState(null);
  const [playError, setPlayError] = useState(null);
  const current = useRef(null);
  // Leaving the conversation stops whatever is playing.
  useEffect(() => () => current.current?.stop(), []);

  // One clip at a time: tap to play, tap again to stop.
  const toggle = (m) => {
    const wasPlaying = playing === m.id;
    current.current?.stop();
    current.current = null;
    setPlaying(null);
    setPlayError(null);
    if (wasPlaying || !m.voice?.data) return;
    let handle = null;
    handle = playVoice(m.voice.data, (err) => {
      if (handle && current.current === handle) {
        current.current = null;
        setPlaying(null);
      }
      if (err) setPlayError(err.message);
    });
    current.current = handle;
    setPlaying(m.id);
  };

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
            {m.voice ? (
              <VoiceBubble message={m} mine={mine} playing={playing === m.id} onPress={() => toggle(m)} />
            ) : (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <MessageText text={m.text} mine={mine} />
              </View>
            )}
          </View>
        );
      })}
      {playError ? <Text style={styles.error}>{playError}</Text> : null}
    </View>
  );
}

// A still waveform, the same for every clip: it says "voice", it doesn't move.
const WAVE = [6, 11, 16, 9, 13, 18, 10, 14, 7, 12, 16, 8, 11, 6];

/** A voice message: play/stop, a still waveform, its length. Grey once the server no longer keeps it. */
function VoiceBubble({ message, mine, playing, onPress }) {
  const { seconds, data } = message.voice;
  const kept = Boolean(data);
  const ink = mine ? color.ink : color.chalk;
  return (
    <Pressable
      role="button"
      aria-label={
        kept
          ? `${playing ? 'Stop' : 'Play'} voice message, ${seconds} seconds`
          : `Voice message, ${seconds} seconds, no longer kept`
      }
      disabled={!kept}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bubble,
        styles.voice,
        mine ? styles.mine : styles.theirs,
        !kept && styles.voiceGone,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.playButton, { borderColor: ink }]}>
        {playing ? (
          <View style={[styles.stopShape, { backgroundColor: ink }]} />
        ) : (
          <View style={[styles.playShape, { borderLeftColor: ink }]} />
        )}
      </View>
      <View style={styles.wave}>
        {WAVE.map((h, i) => (
          <View key={i} style={[styles.waveBar, { height: h, backgroundColor: ink }, playing && styles.waveBarOn]} />
        ))}
      </View>
      <Text style={[styles.voiceTime, { color: ink }]}>{kept ? clock(seconds) : `${clock(seconds)} gone`}</Text>
    </Pressable>
  );
}

function Composer({ chat, other, voice }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const recorder = useVoiceRecorder({ voice, onClip: (clip) => chat.sendClip(other.id, clip), setError, setBusy });
  const out = !other.alive || other.left;
  const closed = chat.closedReason ? CLOSED[chat.closedReason] : out ? `${other.name} is out, and the dead stay silent.` : null;
  if (closed) return <Text style={styles.closed}>{closed}</Text>;

  if (recorder.recording) {
    const left = Math.max(0, VOICE_MAX_SECONDS - recorder.elapsed);
    return (
      <>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.recBar}>
          <View style={[styles.recFill, { width: `${Math.min(100, (recorder.elapsed / VOICE_MAX_SECONDS) * 100)}%` }]} />
        </View>
        <View style={styles.composer}>
          <View style={styles.recording} aria-label={`Recording, ${Math.ceil(left)} seconds left`}>
            <View style={styles.recDot} />
            <Text style={styles.recTime}>
              {clock(recorder.elapsed)} / {clock(VOICE_MAX_SECONDS)}
            </Text>
          </View>
          <Pressable
            role="button"
            aria-label="Cancel voice message"
            onPress={recorder.cancel}
            style={({ pressed }) => [styles.recCancel, pressed && styles.pressed]}
          >
            <Text style={styles.recCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            role="button"
            aria-label="Send voice message"
            onPress={recorder.finish}
            style={({ pressed }) => [styles.send, pressed && styles.pressed]}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </>
    );
  }

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
            <SuitGlyph suit={suit} size={20} tint={suitInk(suit)} />
          </Pressable>
        ))}
        <Text style={[styles.count, tooLong && styles.countOver]} aria-live="polite">
          {words}/{MAX_WORDS} words
        </Text>
      </View>
      {/* Some phones draw ♠♥♦♣ as nothing in a text box: show the message as it will look. */}
      {SUIT_CHARS.test(draft) ? (
        <View style={styles.preview}>
          <MessageText text={draft} />
        </View>
      ) : null}
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
        {/* In the talk, with voice on: an empty box offers Voice where Send would be. */}
        {voice && !draft.trim() ? (
          <Pressable
            role="button"
            aria-label="Record a voice message"
            onPress={recorder.start}
            disabled={busy}
            style={({ pressed }) => [styles.send, styles.voiceButton, busy && styles.sendOff, pressed && styles.pressed]}
          >
            <Text style={styles.sendText}>Voice</Text>
          </Pressable>
        ) : (
          <Pressable
            role="button"
            aria-label="Send"
            onPress={send}
            disabled={!draft.trim() || busy || tooLong}
            style={({ pressed }) => [styles.send, (!draft.trim() || busy || tooLong) && styles.sendOff, pressed && styles.pressed]}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        )}
      </View>
      {voice ? <Text style={styles.voiceHint}>Voice messages: in the talk only, up to {VOICE_MAX_SECONDS} s.</Text> : null}
    </>
  );
}

/**
 * Recording one voice message: start() asks for the microphone and starts, finish() stops and
 * sends, cancel() throws it away. It sends by itself at VOICE_MAX_SECONDS, and throws the clip away
 * if voice closes (the talk ends) or the conversation closes while recording.
 */
function useVoiceRecorder({ voice, onClip, setError, setBusy }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const active = useRef(null); // { stop, cancel, started }
  const alive = useRef(true);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const onClipRef = useRef(onClip);
  onClipRef.current = onClip;

  const drop = () => {
    const rec = active.current;
    active.current = null;
    setRecording(false);
    rec?.cancel();
  };

  const finish = async () => {
    const rec = active.current;
    if (!rec) return;
    active.current = null;
    setRecording(false);
    setBusy(true);
    try {
      const clip = await rec.stop();
      if (clip.seconds < MIN_VOICE_SECONDS) {
        setError('Too short: tap Voice, talk, then Send.');
        return;
      }
      await onClipRef.current(clip);
    } catch (err) {
      setError(err.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const start = async () => {
    setError(null);
    if (!voiceAvailable()) {
      setError(voiceUnavailableReason());
      return;
    }
    try {
      const rec = await startRecording();
      // The talk ended or the chat closed while the microphone was being asked for.
      if (!alive.current || !voiceRef.current) {
        rec.cancel();
        return;
      }
      active.current = { ...rec, started: Date.now() };
      setElapsed(0);
      setRecording(true);
    } catch (err) {
      setError(err.message);
    }
  };

  // The clock, 5 times a second; at the limit it sends what it has.
  useEffect(() => {
    if (!recording) return undefined;
    const timer = setInterval(() => {
      const rec = active.current;
      if (!rec) return;
      const seconds = (Date.now() - rec.started) / 1000;
      setElapsed(Math.min(seconds, VOICE_MAX_SECONDS));
      if (seconds >= VOICE_MAX_SECONDS) finish();
    }, 200);
    return () => clearInterval(timer);
    // finish reads only refs, so the interval doesn't need to restart.
  }, [recording]);

  // The talk is over: no more recording.
  useEffect(() => {
    if (!voice && active.current) drop();
  }, [voice]);

  // The conversation closed: let go of the microphone.
  useEffect(
    () => () => {
      alive.current = false;
      active.current?.cancel();
      active.current = null;
    },
    [],
  );

  return { recording, elapsed, start, finish, cancel: drop };
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
  words: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 5, rowGap: 2 },
  // A word longer than the bubble breaks onto the next line instead of running off the screen.
  word: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', flexShrink: 1, maxWidth: '100%' },
  longWord: { flexShrink: 1 },
  suitCard: {
    backgroundColor: color.stock,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
  },

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
    backgroundColor: color.stock,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { marginLeft: 'auto', color: color.faded, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  countOver: { color: color.alarm },
  preview: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.wallLine,
    marginBottom: 8,
  },

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
  voiceButton: { backgroundColor: color.chalk },
  voiceHint: { color: color.faded, fontSize: 12, textAlign: 'center', marginTop: 6 },

  // A voice message in the thread.
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 190 },
  voiceGone: { opacity: 0.5 },
  playButton: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  playShape: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderLeftWidth: 10,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  stopShape: { width: 10, height: 10, borderRadius: 2 },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  waveBar: { width: 3, borderRadius: 2, opacity: 0.55 },
  waveBarOn: { opacity: 1 },
  voiceTime: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },

  // Recording.
  recBar: { height: 4, borderRadius: 2, backgroundColor: color.wallLine, overflow: 'hidden', marginBottom: 10 },
  recFill: { height: 4, backgroundColor: color.alarm },
  recording: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.alarm,
  },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.alarm },
  recTime: { color: color.chalk, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  recCancel: { height: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: color.wallLine, alignItems: 'center', justifyContent: 'center' },
  recCancelText: { color: color.chalk, fontSize: 15, fontWeight: '800' },

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
