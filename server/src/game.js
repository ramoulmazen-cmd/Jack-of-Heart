import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { GameError } from './errors.js';
import { decodePhoto } from './photos.js';
import { VOICE_MAX_SECONDS, VOICE_PER_TALK, decodeVoice, voiceDataUrl } from './voice.js';
import { MAX_CHOSEN, assignViewers, cardsSeenBy, otherViewer, pairViewers, resolveChoices } from './viewers.js';

export { GameError };

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;
export const CHOOSE_SECONDS = 20;
/** The glimpse of every card. Shorter in small games, where 4 cards are easy to remember. */
export const LIGHTS_SECONDS = 5;
export const LIGHTS_SECONDS_SMALL = 3;
export const SMALL_GAME = 5;
/**
 * With this many players or more you rank up to MAX_CHOICES people, and every card is seen by
 * 2 people. Below it, you choose one person, and your card is seen by that one person only.
 */
export const RANKING_FROM = 5;
export const MAX_CHOICES = 3;
export const REVEAL_SECONDS = 8;
/**
 * Plotting (the `briefing` phase): right after the lights, before the talk. Everyone has glimpsed
 * every card but their own, and now learns who holds their card and whose cards they hold, but
 * can't look at any card. Time to argue, make deals, and vote. 45 seconds unless the host changes it.
 */
export const BRIEFING_SECONDS = 45;

/** Private messages: how long one can be, how many each pair keeps, and how fast you can send. */
export const CHAT_MAX_LENGTH = 200;
/** Short and sharp: a message is at most 10 words (a suit symbol on its own counts as one). */
export const CHAT_MAX_WORDS = 10;
export const CHAT_HISTORY = 100;
export const CHAT_BURST = 5;
export const CHAT_BURST_MS = 5000;

// The phases after viewers have been assigned: from the lights on, you know who holds whose card.
const VISION_PHASES = ['briefing', 'lights', 'discussion', 'confinement'];
// The phases the table can cut short together: Plotting (the briefing) and the talk.
export const SKIP_PHASES = ['briefing', 'discussion'];

export const SETTING_LIMITS = {
  briefingSeconds: { min: 10, max: 180, default: BRIEFING_SECONDS }, // plotting, before the talk
  discussionSeconds: { min: 30, max: 3600, default: 180 },
  answerSeconds: { min: 10, max: 300, default: 30 },
  maxTurns: { min: 2, max: 50, default: 8 },
  // The Jack's limits. Everyone sees how many; only the Jack learns which turns they hit.
  // On a blank turn one of the 2 cards he holds shows blank; on a colour turn he sees only red or
  // black. Either way he still has to tell those players something, and a wrong answer points at him.
  blankTurns: { min: 0, max: 3, default: 1 },
  colorTurns: { min: 0, max: 5, default: 2 },
  // How many times a game the Jack can make one holder see a false suit on someone's card.
  fakeSuits: { min: 0, max: 5, default: 2 },
};

/**
 * On/off rules everyone can see. `interrogation`: once a game, the table can vote one player alone.
 * `safeTurn`: one secret turn (never the last) where nobody dies. `talkChat`: the private chat
 * stays open during the talk; off, it's open only while choosing and in Plotting, so in the talk
 * everyone has to talk to each other. `voiceChat`: voice messages in the private chat, during the
 * talk only (so only with `talkChat`); off by default, since in one room everyone would hear them.
 */
export const PUBLIC_SWITCHES = { interrogation: true, safeTurn: true, talkChat: true, voiceChat: false };

const RED_SUITS = new Set(['hearts', 'diamonds']);

/**
 * On/off settings that only the host is told about. `blackout` is the Jack's secret power:
 * the other players aren't meant to know it exists until it hits them. `blackoutReveal` decides
 * whether the end of the game says which turn he used it on; off, nobody ever learns whether he
 * used it at all.
 */
export const SECRET_SWITCHES = { blackout: true, blackoutReveal: true };

/**
 * The whole game as plain data + rules. No sockets, no timers, no I/O:
 * the network layer calls these methods and decides when to call advance().
 *
 * A turn: choose (rank who you trust with your card)
 *       → lights (every card but yours, 3 or 5 s)
 *       → briefing (45 s: who holds whose card, no card on screen; the interrogation vote)
 *       → discussion (your 2 cards stay) → confinement (answer, lifeline) → reveal.
 * Living players can message each other privately the whole game, except in their cells.
 */
export class Game {
  #clock;
  #rng;
  #timeScale;

  constructor(code, { clock = Date.now, rng = randomInt, timeScale = 1 } = {}) {
    this.code = code;
    this.#clock = clock;
    this.#rng = rng;
    this.#timeScale = timeScale;
    this.players = new Map();
    this.hostId = null;
    // Counts games played in this room, so phones can tell a new game's notes from the last one's.
    this.gameNumber = 0;
    this.settings = {
      ...Object.fromEntries(Object.entries(SETTING_LIMITS).map(([key, limit]) => [key, limit.default])),
      ...PUBLIC_SWITCHES,
      ...SECRET_SWITCHES,
    };
    this.#resetRound();
  }

  get alivePlayers() {
    return [...this.players.values()].filter((p) => p.alive);
  }

  /** Alive and still in the room: they pick, get picked, see cards and answer. */
  get activePlayers() {
    return this.alivePlayers.filter((p) => !p.left);
  }

  /** Active, minus whoever is in interrogation this turn: they choose, hold and are held. */
  get seatedPlayers() {
    return this.activePlayers.filter((p) => p.id !== this.interrogated);
  }

  get everyoneChose() {
    return this.seatedPlayers.every((p) => this.locks.has(p.id));
  }

  get everyoneAnswered() {
    return this.activePlayers.every((p) => p.answer !== null);
  }

  // If the host's phone drops, the next connected player gets host controls until they return.
  get activeHostId() {
    const host = this.players.get(this.hostId);
    if (host?.connected && !host.left) return host.id;
    const next = [...this.players.values()].find((p) => p.connected && !p.left);
    return next?.id ?? this.hostId;
  }

  addPlayer(rawName) {
    this.#requirePhase('lobby', 'This game has already started.');
    if (this.players.size >= MAX_PLAYERS) {
      throw new GameError('ROOM_FULL', `A room holds at most ${MAX_PLAYERS} players.`);
    }
    const name = cleanName(rawName);
    for (const p of this.players.values()) {
      if (p.name.toLowerCase() === name.toLowerCase()) {
        throw new GameError('NAME_TAKEN', `Someone here is already called ${p.name}.`);
      }
    }
    const player = {
      id: randomBytes(8).toString('hex'),
      token: randomBytes(24).toString('hex'),
      name,
      connected: true,
      left: false,
      alive: true,
      suit: null,
      answer: null,
      diedOnTurn: null,
      lifelineUsed: false,
      photo: null,
      photoVersion: 0,
    };
    this.players.set(player.id, player);
    this.hostId ??= player.id;
    return player;
  }

  authenticate(playerId, token) {
    const player = this.players.get(playerId);
    if (!player || player.left || typeof token !== 'string') return null;
    const given = Buffer.from(token);
    const actual = Buffer.from(player.token);
    return given.length === actual.length && timingSafeEqual(given, actual) ? player : null;
  }

  /**
   * Your mugshot: a small image from your phone's camera or gallery, or null to remove it.
   * It stays in memory only and disappears with the room. The state carries just a version
   * number; phones fetch the image itself over HTTP, once per version.
   */
  setPhoto(playerId, dataUrl) {
    const player = this.players.get(playerId);
    if (!player || player.left) throw new GameError('NOT_IN_ROOM', 'You are not in this room.');
    player.photo = dataUrl === null ? null : decodePhoto(dataUrl);
    player.photoVersion += 1;
  }

  photoOf(playerId) {
    return this.players.get(playerId)?.photo ?? null;
  }

  leave(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    if (this.phase === 'lobby') {
      this.players.delete(playerId);
    } else {
      // Mid-game you can't take the collar off: you simply won't answer, and it goes off.
      player.left = true;
      player.connected = false;
      this.locks.delete(playerId);
    }
    if (this.hostId === playerId) this.hostId = this.activeHostId;
  }

  /** Only the host can close the room for everyone; the network layer then sends everyone home. */
  closeBy(byId) {
    this.#requireHost(byId);
  }

  kick(byId, targetId) {
    this.#requireHost(byId);
    this.#requirePhase('lobby', 'Players can only be removed in the lobby.');
    if (targetId === byId) throw new GameError('BAD_TARGET', 'Use Leave instead.');
    if (!this.players.has(targetId)) throw new GameError('BAD_TARGET', 'That player is not here.');
    this.players.delete(targetId);
  }

  updateSettings(byId, changes) {
    this.#requireHost(byId);
    this.#requirePhase('lobby', 'Settings are locked once the game starts.');
    for (const [key, limit] of Object.entries(SETTING_LIMITS)) {
      if (changes?.[key] === undefined) continue;
      const value = Number(changes[key]);
      if (!Number.isInteger(value)) {
        throw new GameError('BAD_SETTINGS', `${key} must be a whole number.`);
      }
      this.settings[key] = Math.min(limit.max, Math.max(limit.min, value));
    }
    for (const key of [...Object.keys(PUBLIC_SWITCHES), ...Object.keys(SECRET_SWITCHES)]) {
      if (changes?.[key] === undefined) continue;
      if (typeof changes[key] !== 'boolean') throw new GameError('BAD_SETTINGS', `${key} must be on or off.`);
      this.settings[key] = changes[key];
    }
  }

  start(byId) {
    this.#requireHost(byId);
    this.#requirePhase('lobby', 'The game is already running.');
    const ids = [...this.players.keys()];
    if (ids.length < MIN_PLAYERS) {
      throw new GameError('NOT_ENOUGH_PLAYERS', `You need at least ${MIN_PLAYERS} players.`);
    }
    this.jackId = ids[this.#rng(ids.length)];
    // One secret turn in which collars are off, unless the host switched it off. Nobody learns which
    // until it's over. Never the last turn: with nobody dying on it, the turns would just run out
    // and hand the Jack the game.
    this.safeTurn = this.settings.safeTurn ? 1 + this.#rng(this.settings.maxTurns - 1) : null;
    // The Jack's colour and blank turns: different turns, never the last. If there are more than
    // turns to hold them, colour turns come first and the rest are dropped.
    const turns = this.#shuffle(Array.from({ length: this.settings.maxTurns - 1 }, (_, i) => i + 1));
    const colors = Math.min(this.settings.colorTurns, turns.length);
    this.colorTurnSet = new Set(turns.slice(0, colors));
    this.blankTurnSet = new Set(turns.slice(colors, colors + this.settings.blankTurns));
    this.fakesLeft = this.settings.fakeSuits;
    this.gameNumber += 1;
    this.#beginTurn();
  }

  /**
   * Lock in who you trust with your card, best first: up to 3 people with 5+ players, 1 below.
   * Locking in is final. Who gets whom is settled when choosing ends, in lock-in order,
   * and stays secret until then (see resolveChoices).
   */
  choose(playerId, ranking) {
    this.#requirePhase('choose', 'Choosing is over for this turn.');
    const player = this.players.get(playerId);
    if (!player?.alive || player.left) throw new GameError('NOT_ALIVE', 'Only living players choose.');
    if (this.locks.has(playerId)) throw new GameError('LOCKED', 'You already locked in your choice.');
    if (!Array.isArray(ranking) || ranking.length === 0) {
      throw new GameError('BAD_TARGET', 'Choose at least one person.');
    }
    if (ranking.length > this.maxChoices) {
      throw new GameError(
        'BAD_TARGET',
        this.maxChoices === 1 ? 'Choose one person.' : `Choose at most ${this.maxChoices} people.`,
      );
    }
    if (new Set(ranking).size !== ranking.length) throw new GameError('BAD_TARGET', 'Choose each person once.');
    for (const id of ranking) {
      if (id === playerId) throw new GameError('BAD_TARGET', 'Choose someone other than yourself.');
      const target = this.players.get(id);
      if (!target?.alive || target.left) throw new GameError('BAD_TARGET', 'That player is not in the game.');
    }
    this.locks.set(playerId, [...ranking]);
  }

  /** This turn's limit on the Jack's sight: 'color', 'blank' or null. */
  get jackSight() {
    if (this.colorTurnSet.has(this.turn)) return 'color';
    if (this.blankTurnSet.has(this.turn)) return 'blank';
    return null;
  }

  /**
   * The Jack's fake, while everyone is choosing: one of the players holding `targetId`'s card (never
   * the Jack) will see a false suit on it, in the lights and in the talk. Who, and which suit, is
   * settled when the cards are dealt; the Jack is told. Not on his own colour or blank turns: he
   * could guess a suit and have the other holder see the same guess, and his mistake would vanish.
   */
  fakeCard(playerId, targetId) {
    const player = this.players.get(playerId);
    if (playerId !== this.jackId || this.settings.fakeSuits === 0 || !player?.alive || player.left) {
      throw new GameError('NOT_ALLOWED', 'You can’t do that.');
    }
    this.#requirePhase('choose', 'You can only fake a card while everyone is choosing.');
    if (this.jackSight) throw new GameError('FAKE_LOCKED', 'No fakes on a turn you can’t see clearly.');
    if (this.fakeTarget !== null) throw new GameError('FAKE_USED', 'One fake per turn.');
    if (this.fakesLeft <= 0) throw new GameError('NO_FAKES', 'You have no fakes left.');
    const target = this.players.get(targetId);
    if (!target?.alive || target.left || targetId === playerId) {
      throw new GameError('BAD_TARGET', 'You can’t fake that card.');
    }
    this.fakeTarget = targetId;
    this.fakesLeft -= 1;
  }

  /**
   * The interrogation vote is open during the briefing, once a game, with more than 4 players in:
   * right after the first half if nobody died in it, otherwise from 2 turns before the end.
   * A player that more than half the table votes for spends the rest of the turn alone (#isolate).
   */
  get interrogationOpen() {
    if (!this.settings.interrogation || this.interrogationUsed || this.phase !== 'briefing') return false;
    if (this.activePlayers.length <= 4) return false;
    const total = this.settings.maxTurns;
    const half = Math.floor(total / 2);
    const quietFirstHalf = ![...this.players.values()].some((p) => p.diedOnTurn !== null && p.diedOnTurn <= half);
    return (quietFirstHalf && this.turn > half) || this.turn >= total - 2;
  }

  get votesNeeded() {
    return Math.floor(this.activePlayers.length / 2) + 1;
  }

  /** Vote for who goes into interrogation, or null to take your vote back. Votes are counted, not named. */
  vote(playerId, targetId) {
    if (!this.interrogationOpen) throw new GameError('VOTE_CLOSED', 'There is no interrogation vote right now.');
    const voter = this.players.get(playerId);
    if (!voter?.alive || voter.left) throw new GameError('NOT_ALIVE', 'Only living players vote.');
    if (targetId === null) {
      this.votes.delete(playerId);
      return;
    }
    const target = this.players.get(targetId);
    if (!target?.alive || target.left) throw new GameError('BAD_TARGET', 'That player is not in the game.');
    if (targetId === playerId) throw new GameError('BAD_TARGET', 'Vote for someone else.');
    this.votes.set(playerId, targetId);
  }

  #tally() {
    const active = new Set(this.activePlayers.map((p) => p.id));
    const tally = new Map();
    for (const [voter, target] of this.votes) {
      if (active.has(voter) && active.has(target)) tally.set(target, (tally.get(target) ?? 0) + 1);
    }
    return tally;
  }

  /** When the briefing ends: a majority sends its player into interrogation for the rest of the turn. */
  #resolveVote() {
    if (this.interrogationOpen) {
      for (const [target, count] of this.#tally()) {
        if (count >= this.votesNeeded) {
          this.interrogated = target;
          this.interrogationUsed = true;
          this.interrogationTurn = this.turn;
          this.#isolate(target);
          break;
        }
      }
    }
    this.votes = new Map();
  }

  /**
   * Interrogation, after the lights: nobody holds that player's card any more, and they hold
   * nobody's. The cards they would have held keep their other holder only. Everyone glimpsed their
   * card in the lights, so it's swapped for a new one nobody has seen: they really are alone. A fake
   * that needed them (its card, or its fooled holder) is given back to the Jack.
   */
  #isolate(id) {
    this.viewers.delete(id);
    for (const entry of this.viewers.values()) {
      if (entry.picked === id) entry.picked = null;
      if (entry.random === id) entry.random = null;
    }
    this.sees = cardsSeenBy(this.viewers);
    const player = this.players.get(id);
    if (player) player.suit = SUITS[this.#rng(SUITS.length)];
    if (this.fake?.viewerId && (this.fake.targetId === id || this.fake.viewerId === id)) {
      this.fakeLog = this.fakeLog.filter((f) => !(f.turn === this.turn && f.targetId === this.fake.targetId));
      this.fake = { targetId: this.fake.targetId, viewerId: null, suit: null };
      this.fakesLeft += 1;
    }
    // The Jack saw his blank card blank in the lights; if he no longer holds it, nothing moves.
    if (this.blankCardOf === id) this.blankCardOf = null;
  }

  /** The turn limit's turn: no lifelines, no blackout, and never the safe turn. */
  get lastTurn() {
    return this.turn >= this.settings.maxTurns;
  }

  /**
   * The lifeline: once per game, in your cell, see your own card, on any turn but the last. The
   * reply goes only to the caller: { suit }, or { blackout: true } if the Jack blacked out this
   * cell. Either way it's spent. The Jack's own lifeline always works.
   */
  useLifeline(playerId) {
    this.#requirePhase('confinement', 'Your lifeline only works in your cell.');
    const player = this.players.get(playerId);
    if (!player?.alive || player.left) throw new GameError('NOT_ALIVE', 'Dead players have no card.');
    if (this.lastTurn) throw new GameError('LAST_TURN', 'There are no lifelines on the last turn.');
    if (player.lifelineUsed) throw new GameError('LIFELINE_USED', 'You already used your lifeline this game.');
    if (playerId === this.interrogated) throw new GameError('INTERROGATED', 'No lifeline in interrogation.');
    if (player.answer !== null) throw new GameError('LOCKED', 'Your answer is already locked in.');
    player.lifelineUsed = true;
    if (this.blackoutTurn === this.turn && player.id !== this.jackId) {
      this.blackoutVictims.push(player.id);
      return { blackout: true };
    }
    return { suit: player.suit };
  }

  /**
   * The Jack's secret power, once per game: during the talk, black out this turn's cell.
   * Every other lifeline used in that cell fails and is lost. Nobody else is told it's coming.
   */
  armBlackout(playerId) {
    const player = this.players.get(playerId);
    if (playerId !== this.jackId || !this.settings.blackout || !player?.alive || player.left) {
      throw new GameError('NOT_ALLOWED', 'You can’t do that.');
    }
    this.#requirePhase('discussion', 'You can only do that during the talk.');
    if (this.blackoutTurn !== null) throw new GameError('BLACKOUT_USED', 'You already used your blackout this game.');
    if (this.lastTurn) throw new GameError('LAST_TURN', 'There are no lifelines to black out on the last turn.');
    this.blackoutTurn = this.turn;
  }

  /**
   * Skip, in Plotting or the talk: `on` adds your vote to end it now, false takes it back. Nothing
   * happens until every living player has pressed it (`everyoneSkipped`); then the phase ends.
   */
  skip(playerId, on = true) {
    const player = this.players.get(playerId);
    if (!player?.alive || player.left) throw new GameError('NOT_ALIVE', 'Only living players can skip.');
    if (!SKIP_PHASES.includes(this.phase)) {
      throw new GameError('WRONG_PHASE', 'You can only skip Plotting or the talk.');
    }
    if (on) this.skips.add(playerId);
    else this.skips.delete(playerId);
  }

  get everyoneSkipped() {
    const active = this.activePlayers;
    return SKIP_PHASES.includes(this.phase) && active.length > 0 && active.every((p) => this.skips.has(p.id));
  }

  /**
   * Why `player` can't send a private message right now, or null if they can. The chat opens when
   * the game starts, closes in the cell (no talking in the cell) and stays shut for the dead. It's
   * always open in Plotting; in the talk only if the host left `talkChat` on.
   */
  chatClosedFor(player) {
    if (!player || player.left) return 'gone';
    if (this.phase === 'lobby') return 'lobby';
    if (!player.alive) return 'dead';
    if (this.phase === 'confinement') return 'cell';
    if (this.phase === 'discussion' && this.settings.talkChat === false) return 'talk';
    return null;
  }

  /**
   * A private message from one living player to another. It returns the stored message; the
   * server hands it to those two players only and nobody else's state changes, so the other
   * phones can't even tell that two players are talking.
   */
  sendMessage(fromId, toId, rawText) {
    this.#checkChat(fromId, toId);
    const text = cleanMessage(rawText);
    this.#throttle(fromId);
    return this.#store({ from: fromId, to: toId, text });
  }

  /**
   * A voice message: during the talk only, if the host switched them on, at most
   * VOICE_MAX_SECONDS long, VOICE_PER_TALK of them per player per talk. The message keeps
   * `voice: { seconds, type }`; the clip itself stays in memory only until the talk ends.
   */
  sendVoice(fromId, toId, dataUrl, rawSeconds) {
    if (!this.settings.voiceChat) throw new GameError('VOICE_OFF', 'Voice messages are off in this room.');
    this.#checkChat(fromId, toId);
    if (this.phase !== 'discussion') throw new GameError('VOICE_CLOSED', 'Voice messages are only for the talk.');
    const seconds = Number(rawSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > VOICE_MAX_SECONDS + 1) {
      throw new GameError('BAD_VOICE', `Voice messages are ${VOICE_MAX_SECONDS} seconds at most.`);
    }
    const sent = this.voiceSent.get(fromId) ?? 0;
    if (sent >= VOICE_PER_TALK) {
      throw new GameError('TOO_MANY_VOICE', `That’s ${VOICE_PER_TALK} voice messages this talk. Write instead.`);
    }
    const clip = decodeVoice(dataUrl);
    this.#throttle(fromId);
    this.voiceSent.set(fromId, sent + 1);
    const voice = { seconds: Math.max(1, Math.min(VOICE_MAX_SECONDS, Math.round(seconds))), type: clip.type };
    const message = this.#store({ from: fromId, to: toId, text: '', voice });
    this.voiceClips.set(message.id, clip);
    return message;
  }

  /** A voice message's clip, as a data URL, while the talk it was sent in lasts; else null. */
  voiceDataOf(messageId) {
    const clip = this.voiceClips.get(messageId);
    return clip ? voiceDataUrl(clip) : null;
  }

  /** Every message you sent or received this game, oldest first. Nobody else's. */
  chatFor(playerId) {
    const mine = [];
    for (const thread of this.chats.values()) {
      if (thread[0] && (thread[0].from === playerId || thread[0].to === playerId)) mine.push(...thread);
    }
    return mine
      .sort((a, b) => a.id - b.id)
      .map((m) => (m.voice && this.voiceClips.has(m.id) ? { ...m, voice: { ...m.voice, data: this.voiceDataOf(m.id) } } : m));
  }

  /** Who can write to whom: both alive and in the game, never yourself, never from the cell. */
  #checkChat(fromId, toId) {
    const from = this.players.get(fromId);
    const closed = this.chatClosedFor(from);
    if (closed === 'gone') throw new GameError('NOT_IN_ROOM', 'You are not in this room.');
    if (closed === 'lobby') throw new GameError('CHAT_CLOSED', 'The chat opens when the game starts.');
    if (closed === 'dead') throw new GameError('NOT_ALIVE', 'The dead stay silent.');
    if (closed === 'cell') throw new GameError('CHAT_CLOSED', 'No talking in the cell.');
    if (closed === 'talk') {
      throw new GameError('CHAT_CLOSED', 'No private chat in the talk in this room: talk to each other.');
    }
    if (toId === fromId) throw new GameError('BAD_TARGET', 'Message someone else.');
    const to = typeof toId === 'string' ? this.players.get(toId) : undefined;
    if (!to || to.left) throw new GameError('BAD_TARGET', 'That player is not in the game.');
    if (!to.alive) throw new GameError('BAD_TARGET', `${to.name} is out, and the dead stay silent.`);
  }

  /** At most CHAT_BURST messages, text or voice, in CHAT_BURST_MS. */
  #throttle(fromId) {
    const now = this.#clock();
    const recent = (this.chatTimes.get(fromId) ?? []).filter((at) => now - at < CHAT_BURST_MS);
    if (recent.length >= CHAT_BURST) throw new GameError('TOO_FAST', 'Slow down a little.');
    this.chatTimes.set(fromId, [...recent, now]);
  }

  #store(fields) {
    this.chatCount += 1;
    const message = { id: this.chatCount, ...fields, at: this.#clock(), turn: this.turn };
    const key = [fields.from, fields.to].sort().join(':');
    const thread = this.chats.get(key) ?? [];
    thread.push(message);
    if (thread.length > CHAT_HISTORY) {
      const dropped = thread.shift();
      this.voiceClips.delete(dropped.id);
    }
    this.chats.set(key, thread);
    return message;
  }

  answer(playerId, suit) {
    this.#requirePhase('confinement', 'You can only answer from your cell.');
    const player = this.players.get(playerId);
    if (!player?.alive) throw new GameError('NOT_ALIVE', 'Dead players do not answer.');
    if (!SUITS.includes(suit)) throw new GameError('BAD_SUIT', 'That is not a suit.');
    if (player.answer !== null) throw new GameError('LOCKED', 'Your answer is already locked in.');
    player.answer = suit;
  }

  /** Move to the next phase. Called by the server when the phase timer runs out. */
  advance() {
    if (this.phase === 'choose') {
      this.#dealVision();
    } else if (this.phase === 'lights') {
      this.#enter('briefing', this.settings.briefingSeconds);
    } else if (this.phase === 'briefing') {
      this.#resolveVote();
      this.#enter('discussion', this.settings.discussionSeconds);
    } else if (this.phase === 'discussion') {
      this.#enter('confinement', this.settings.answerSeconds);
    } else if (this.phase === 'confinement') {
      this.#resolveTurn();
    } else if (this.phase === 'reveal') {
      if (this.result) this.#enter('over', null);
      else this.#beginTurn();
    }
  }

  reset(byId) {
    this.#requireHost(byId);
    this.#requirePhase('over', 'Finish the game first.');
    for (const [id, p] of this.players) if (p.left) this.players.delete(id);
    if (!this.players.has(this.hostId)) this.hostId = this.activeHostId;
    this.#resetRound();
  }

  /**
   * What one player is allowed to know. This is the anti-cheat: the server never sends you
   * your own card. It sends every other card only during the lights, then only your 2 cards
   * during the talk, and nothing at all once you're in your cell.
   */
  viewFor(viewerId) {
    const me = this.players.get(viewerId);
    const alive = me?.alive === true && !me.left;
    const visionDealt = VISION_PHASES.includes(this.phase) && alive;
    const mine = visionDealt ? this.sees.get(viewerId) ?? [] : [];
    // Interrogation: that player sees no card, and nobody sees theirs.
    const isolated = viewerId === this.interrogated;
    let visible = [];
    if (alive && !isolated && this.phase === 'lights') {
      visible = this.seatedPlayers.map((p) => p.id).filter((id) => id !== viewerId);
    }
    if (alive && this.phase === 'discussion') visible = mine;
    const shown = new Set(visible);
    const showDeaths = this.phase === 'reveal' || this.phase === 'over';
    const safe = showDeaths && this.turn === this.safeTurn;
    const choosing = this.phase === 'choose';
    const hostId = this.activeHostId;
    // The secret switches go to the host only; everyone else gets the settings they can see.
    const settings = { ...this.settings };
    if (viewerId !== hostId) for (const key of Object.keys(SECRET_SWITCHES)) delete settings[key];
    // Only the Jack hears about the blackout, and only while it's switched on.
    const blackout = me && me.id === this.jackId && this.settings.blackout ? { blackout: this.#blackoutStatus() } : {};
    // Only the Jack hears about his own sight and fakes.
    const powers = me && me.id === this.jackId && this.phase !== 'lobby' ? { powers: this.#jackPowers() } : {};
    const voteOpen = this.interrogationOpen;
    return {
      code: this.code,
      gameNumber: this.gameNumber,
      phase: this.phase,
      turn: this.turn,
      lastTurn: this.turn > 0 && this.lastTurn,
      phaseEndsAt: this.phaseEndsAt,
      serverNow: this.#clock(),
      settings,
      hostId,
      minPlayers: MIN_PLAYERS,
      maxChosen: this.maxChosen,
      maxChoices: this.maxChoices,
      safe,
      you: me
        ? {
            id: me.id,
            name: me.name,
            alive: me.alive,
            isJack: me.id === this.jackId,
            answer: me.answer,
            diedOnTurn: me.diedOnTurn,
            lifelineUsed: me.lifelineUsed,
            locked: choosing && this.locks.has(me.id),
            ranking: choosing ? this.locks.get(me.id) ?? null : null,
            viewers: visionDealt && this.viewers.has(me.id)
              ? { ...this.viewers.get(me.id), autoPicked: this.viewers.get(me.id).rank === 0 }
              : null,
            sees: mine,
            // For each card you see, the one other person who sees it too.
            sharedWith: Object.fromEntries(mine.map((id) => [id, otherViewer(this.viewers, id, viewerId)])),
            safeResult: safe ? this.safeResults.get(me.id) ?? null : null,
            // Why you can't send a private message right now ('lobby', 'cell', 'talk', 'dead'), or null.
            chatClosed: this.chatClosedFor(me),
            interrogated: isolated,
            ...blackout,
            ...powers,
          }
        : null,
      // Skip: how many living players want to end Plotting or the talk now, out of how many.
      skip: SKIP_PHASES.includes(this.phase)
        ? {
            count: this.activePlayers.filter((p) => this.skips.has(p.id)).length,
            needed: this.activePlayers.length,
            yours: this.skips.has(viewerId),
          }
        : null,
      // The vote: how many votes each player has (never who cast them), and your own.
      interrogation: this.settings.interrogation
        ? {
            open: voteOpen,
            needed: this.votesNeeded,
            votes: voteOpen ? Object.fromEntries(this.#tally()) : {},
            yourVote: voteOpen ? this.votes.get(viewerId) ?? null : null,
            used: this.interrogationUsed,
            playerId: this.interrogated,
          }
        : null,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected,
        left: p.left,
        photo: p.photo ? p.photoVersion : 0,
        suit: shown.has(p.id) ? this.#suitSeenBy(viewerId, p) : null,
      })),
      deaths: showDeaths
        ? this.deaths.map((d) => (d.id === viewerId ? { ...d } : { id: d.id }))
        : [],
      // At the end the secret can come out: which turn the Jack blacked out.
      result:
        this.phase === 'over'
          ? {
              ...this.result,
              jackId: this.jackId,
              // Only which turn the Jack blacked out, if the host chose to reveal it. Never who used
              // a lifeline, or whether anyone did.
              blackout:
                this.blackoutTurn === null || !this.settings.blackoutReveal ? null : { turn: this.blackoutTurn },
              // The Jack's secrets come out too: the turns he couldn't see clearly (only the ones
              // that were played), and every fake that fooled someone.
              jackTurns: {
                color: [...this.colorTurnSet].filter((t) => t <= this.turn).sort((a, b) => a - b),
                blank: [...this.blankTurnSet].filter((t) => t <= this.turn).sort((a, b) => a - b),
                fakes: this.fakeLog.map((f) => ({ ...f })),
              },
            }
          : null,
    };
  }

  /**
   * For the Jack: 'ready', 'on' (this turn's cell is blacked out) or 'used'. On the last turn an
   * unused blackout isn't offered (null): there are no lifelines left to black out.
   */
  #blackoutStatus() {
    if (this.blackoutTurn === null) return this.lastTurn ? null : 'ready';
    const thisTurn = this.blackoutTurn === this.turn && (this.phase === 'discussion' || this.phase === 'confinement');
    return thisTurn ? 'on' : 'used';
  }

  /**
   * What `viewerId` sees on `p`'s card. The Jack's fake changes it for one holder; on the Jack's
   * colour turns he gets only 'red' or 'black', and on his blank turn one card he holds is 'blank'.
   * The real suit never reaches a phone that isn't meant to see it.
   */
  #suitSeenBy(viewerId, p) {
    if (this.fake?.viewerId === viewerId && this.fake.targetId === p.id) return this.fake.suit;
    if (viewerId === this.jackId) {
      const sight = this.jackSight;
      if (sight === 'color') return RED_SUITS.has(p.suit) ? 'red' : 'black';
      if (sight === 'blank' && p.id === this.blankCardOf) return 'blank';
    }
    return p.suit;
  }

  /**
   * For the Jack only. `sight`: this turn's limit ('color', 'blank' or null). `fake`: once the cards
   * are dealt, whose card he faked and who gets the false suit, but never which suit: he can't
   * line his own story up with it. `viewerId` null means nobody else holds that card, so nothing
   * happened and the fake was given back. (Game Over tells everyone what the fake showed.)
   */
  #jackPowers() {
    const playing = this.phase !== 'over';
    const fake = VISION_PHASES.includes(this.phase) && this.fake ? this.fake : null;
    return {
      sight: playing ? this.jackSight : null,
      fakesLeft: this.settings.fakeSuits ? this.fakesLeft : 0,
      fakeTarget: playing ? this.fakeTarget : null,
      fake: fake ? { targetId: fake.targetId, viewerId: fake.viewerId } : null,
    };
  }

  /** 3 to rank and 2 viewers a card from 5 seated players, 1 and 1 below. */
  #sizeTurn() {
    const big = this.seatedPlayers.length >= RANKING_FROM;
    this.maxChoices = big ? MAX_CHOICES : 1;
    this.maxChosen = big ? MAX_CHOSEN : 1;
  }

  #shuffle(items) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.#rng(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  #beginTurn() {
    this.turn += 1;
    this.deaths = [];
    this.locks = new Map();
    this.viewers = new Map();
    this.sees = new Map();
    this.interrogated = null;
    this.votes = new Map();
    this.fakeTarget = null;
    this.fake = null;
    this.blankCardOf = null;
    this.#sizeTurn();
    for (const p of this.alivePlayers) {
      p.suit = SUITS[this.#rng(SUITS.length)];
      p.answer = null;
    }
    this.#enter('choose', CHOOSE_SECONDS);
  }

  #dealVision() {
    const ids = this.seatedPlayers.map((p) => p.id);
    // 4 or fewer: 1 and 1, your one viewer is the one you chose. From 5: 2 and 2.
    this.viewers =
      ids.length < RANKING_FROM
        ? pairViewers(ids, this.locks, this.#rng)
        : assignViewers(ids, resolveChoices(ids, this.locks, this.#rng), this.#rng);
    this.sees = cardsSeenBy(this.viewers);
    if (this.jackSight === 'blank') {
      const held = this.sees.get(this.jackId) ?? [];
      this.blankCardOf = held.length ? held[this.#rng(held.length)] : null;
    }
    if (this.fakeTarget !== null) {
      const entry = this.viewers.get(this.fakeTarget);
      const holders = entry ? [entry.picked, entry.random].filter((v) => v && v !== this.jackId) : [];
      const target = this.players.get(this.fakeTarget);
      if (holders.length && target?.alive) {
        const others = SUITS.filter((s) => s !== target.suit);
        this.fake = {
          targetId: this.fakeTarget,
          viewerId: holders[this.#rng(holders.length)],
          suit: others[this.#rng(others.length)],
        };
        this.fakeLog.push({ turn: this.turn, ...this.fake, real: target.suit });
      } else {
        // Nobody but the Jack holds that card (or it left the table): nothing to fake, so it's given back.
        this.fake = { targetId: this.fakeTarget, viewerId: null, suit: null };
        this.fakesLeft += 1;
      }
    }
    this.#enter('lights', ids.length <= SMALL_GAME ? LIGHTS_SECONDS_SMALL : LIGHTS_SECONDS);
  }

  #resolveTurn() {
    const safe = this.turn === this.safeTurn;
    this.safeResults = new Map();
    for (const p of this.alivePlayers) {
      const right = p.answer === p.suit;
      if (safe) {
        this.safeResults.set(p.id, p.answer === null ? 'none' : right ? 'right' : 'wrong');
        continue;
      }
      if (right) continue;
      p.alive = false;
      p.diedOnTurn = this.turn;
      this.deaths.push({ id: p.id, suit: p.suit, answer: p.answer });
    }
    const survivors = this.alivePlayers;
    const jackAlive = this.players.get(this.jackId)?.alive === true;
    if (!jackAlive) {
      this.result = { winner: survivors.length > 0 ? 'players' : 'nobody' };
    } else if (survivors.length <= 2) {
      this.result = { winner: 'jack', reason: 'last-two' };
    } else if (this.turn >= this.settings.maxTurns) {
      this.result = { winner: 'jack', reason: 'time' };
    }
    this.#enter('reveal', REVEAL_SECONDS);
  }

  #enter(phase, seconds) {
    this.phase = phase;
    this.skips = new Set();
    // Voice clips live only through the talk they were sent in: the server forgets them after.
    this.voiceClips = new Map();
    this.voiceSent = new Map();
    this.phaseEndsAt = seconds === null ? null : this.#clock() + seconds * 1000 * this.#timeScale;
  }

  #resetRound() {
    this.phase = 'lobby';
    this.turn = 0;
    this.phaseEndsAt = null;
    this.skips = new Set(); // who pressed Skip in this Plotting or talk
    this.jackId = null;
    this.safeTurn = null;
    this.safeResults = new Map();
    this.locks = new Map();
    this.maxChoices = 1;
    this.maxChosen = 1;
    this.viewers = new Map();
    this.sees = new Map();
    this.deaths = [];
    this.result = null;
    this.blackoutTurn = null;
    this.blackoutVictims = [];
    this.colorTurnSet = new Set();
    this.blankTurnSet = new Set();
    this.blankCardOf = null;
    this.fakesLeft = 0;
    this.fakeTarget = null;
    this.fake = null;
    this.fakeLog = []; // every fake that fooled someone, revealed at the end
    this.interrogated = null;
    this.interrogationUsed = false;
    this.interrogationTurn = null;
    this.votes = new Map();
    // Private messages belong to one game: a new game starts with an empty chat.
    this.chats = new Map();
    this.chatCount = 0;
    this.chatTimes = new Map();
    this.voiceClips = new Map(); // message id → { type, bytes }, for the current talk only
    this.voiceSent = new Map(); // player id → voice messages sent this talk
    for (const p of this.players.values()) {
      Object.assign(p, { alive: true, suit: null, answer: null, diedOnTurn: null, lifelineUsed: false });
    }
  }

  #requireHost(byId) {
    if (byId !== this.activeHostId) throw new GameError('NOT_HOST', 'Only the host can do that.');
  }

  #requirePhase(phase, message) {
    if (this.phase !== phase) throw new GameError('WRONG_PHASE', message);
  }
}

/** A message's text: no control characters, at most 3 lines in a row blank, CHAT_MAX_LENGTH long. */
function cleanMessage(raw) {
  if (typeof raw !== 'string') throw new GameError('EMPTY_MESSAGE', 'Type a message.');
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) throw new GameError('EMPTY_MESSAGE', 'Type a message.');
  if (text.split(/\s+/).length > CHAT_MAX_WORDS) {
    throw new GameError('TOO_MANY_WORDS', `Keep it to ${CHAT_MAX_WORDS} words.`);
  }
  // Cut by characters, not UTF-16 units, so an emoji is never split in half.
  return Array.from(text).slice(0, CHAT_MAX_LENGTH).join('');
}

function cleanName(raw) {
  if (typeof raw !== 'string') throw new GameError('BAD_NAME', 'Pick a name.');
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!name) throw new GameError('BAD_NAME', 'Pick a name.');
  return name;
}
