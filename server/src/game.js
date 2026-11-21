import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { GameError } from './errors.js';
import { decodePhoto } from './photos.js';
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
 * Every turn after the first opens with this countdown: after a death there's something to
 * doubt, so the table gets time to argue before anyone chooses or sees a card. Turn 1 has nothing
 * to argue about yet, so it starts straight away.
 */
export const COOLDOWN_SECONDS = 45;

/** Private messages: how long one can be, how many each pair keeps, and how fast you can send. */
export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY = 100;
export const CHAT_BURST = 5;
export const CHAT_BURST_MS = 5000;

// The phases after viewers have been assigned.
const VISION_PHASES = ['lights', 'discussion', 'confinement'];

export const SETTING_LIMITS = {
  discussionSeconds: { min: 30, max: 3600, default: 180 },
  answerSeconds: { min: 10, max: 300, default: 30 },
  maxTurns: { min: 2, max: 50, default: 8 },
};

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
 * A turn: (from turn 2) cooldown (45 s, no cards) → choose (rank who you trust with your card)
 *       → lights (every card but yours, 3 or 5 s) → discussion (your 2 cards stay)
 *       → confinement (answer, lifeline) → reveal.
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

  get everyoneChose() {
    return this.activePlayers.every((p) => this.locks.has(p.id));
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
    for (const key of Object.keys(SECRET_SWITCHES)) {
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
    // One secret turn in which collars are off. Nobody learns which until it's over. Never the
    // last turn: with nobody dying on it, the turns would just run out and hand the Jack the game.
    this.safeTurn = 1 + this.#rng(this.settings.maxTurns - 1);
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

  skipDiscussion(byId) {
    this.#requireHost(byId);
    this.#requirePhase('discussion', 'Discussion is not running.');
    this.advance();
  }

  /**
   * Why `player` can't send a private message right now, or null if they can. The chat opens when
   * the game starts, closes in the cell (no talking in the cell) and stays shut for the dead.
   */
  chatClosedFor(player) {
    if (!player || player.left) return 'gone';
    if (this.phase === 'lobby') return 'lobby';
    if (!player.alive) return 'dead';
    if (this.phase === 'confinement') return 'cell';
    return null;
  }

  /**
   * A private message from one living player to another. It returns the stored message; the
   * server hands it to those two players only and nobody else's state changes, so the other
   * phones can't even tell that two players are talking.
   */
  sendMessage(fromId, toId, rawText) {
    const from = this.players.get(fromId);
    const closed = this.chatClosedFor(from);
    if (closed === 'gone') throw new GameError('NOT_IN_ROOM', 'You are not in this room.');
    if (closed === 'lobby') throw new GameError('CHAT_CLOSED', 'The chat opens when the game starts.');
    if (closed === 'dead') throw new GameError('NOT_ALIVE', 'The dead stay silent.');
    if (closed === 'cell') throw new GameError('CHAT_CLOSED', 'No talking in the cell.');
    if (toId === fromId) throw new GameError('BAD_TARGET', 'Message someone else.');
    const to = typeof toId === 'string' ? this.players.get(toId) : undefined;
    if (!to || to.left) throw new GameError('BAD_TARGET', 'That player is not in the game.');
    if (!to.alive) throw new GameError('BAD_TARGET', `${to.name} is out, and the dead stay silent.`);
    const text = cleanMessage(rawText);
    const now = this.#clock();
    const recent = (this.chatTimes.get(fromId) ?? []).filter((at) => now - at < CHAT_BURST_MS);
    if (recent.length >= CHAT_BURST) throw new GameError('TOO_FAST', 'Slow down a little.');
    this.chatTimes.set(fromId, [...recent, now]);
    this.chatCount += 1;
    const message = { id: this.chatCount, from: fromId, to: toId, text, at: now, turn: this.turn };
    const key = [fromId, toId].sort().join(':');
    const thread = this.chats.get(key) ?? [];
    thread.push(message);
    if (thread.length > CHAT_HISTORY) thread.shift();
    this.chats.set(key, thread);
    return message;
  }

  /** Every message you sent or received this game, oldest first. Nobody else's. */
  chatFor(playerId) {
    const mine = [];
    for (const thread of this.chats.values()) {
      if (thread[0] && (thread[0].from === playerId || thread[0].to === playerId)) mine.push(...thread);
    }
    return mine.sort((a, b) => a.id - b.id);
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
    if (this.phase === 'cooldown') {
      this.#enter('choose', CHOOSE_SECONDS);
    } else if (this.phase === 'choose') {
      this.#dealVision();
    } else if (this.phase === 'lights') {
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
    let visible = [];
    if (alive && this.phase === 'lights') visible = this.activePlayers.map((p) => p.id).filter((id) => id !== viewerId);
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
            // Why you can't send a private message right now ('lobby', 'cell', 'dead'), or null.
            chatClosed: this.chatClosedFor(me),
            ...blackout,
          }
        : null,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected,
        left: p.left,
        photo: p.photo ? p.photoVersion : 0,
        suit: shown.has(p.id) ? p.suit : null,
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

  #beginTurn() {
    this.turn += 1;
    this.deaths = [];
    this.locks = new Map();
    this.viewers = new Map();
    this.sees = new Map();
    const big = this.activePlayers.length >= RANKING_FROM;
    this.maxChoices = big ? MAX_CHOICES : 1;
    this.maxChosen = big ? MAX_CHOSEN : 1;
    for (const p of this.alivePlayers) {
      p.suit = SUITS[this.#rng(SUITS.length)];
      p.answer = null;
    }
    if (this.turn === 1) this.#enter('choose', CHOOSE_SECONDS);
    else this.#enter('cooldown', COOLDOWN_SECONDS);
  }

  #dealVision() {
    const ids = this.activePlayers.map((p) => p.id);
    // 4 or fewer: 1 and 1, your one viewer is the one you chose. From 5: 2 and 2.
    this.viewers =
      ids.length < RANKING_FROM
        ? pairViewers(ids, this.locks, this.#rng)
        : assignViewers(ids, resolveChoices(ids, this.locks, this.#rng), this.#rng);
    this.sees = cardsSeenBy(this.viewers);
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
    this.phaseEndsAt = seconds === null ? null : this.#clock() + seconds * 1000 * this.#timeScale;
  }

  #resetRound() {
    this.phase = 'lobby';
    this.turn = 0;
    this.phaseEndsAt = null;
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
    // Private messages belong to one game: a new game starts with an empty chat.
    this.chats = new Map();
    this.chatCount = 0;
    this.chatTimes = new Map();
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
  // Cut by characters, not UTF-16 units, so an emoji is never split in half.
  return Array.from(text).slice(0, CHAT_MAX_LENGTH).join('');
}

function cleanName(raw) {
  if (typeof raw !== 'string') throw new GameError('BAD_NAME', 'Pick a name.');
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!name) throw new GameError('BAD_NAME', 'Pick a name.');
  return name;
}
