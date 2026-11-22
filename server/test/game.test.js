import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHAT_BURST,
  CHAT_BURST_MS,
  CHAT_MAX_LENGTH,
  CHOOSE_SECONDS,
  COOLDOWN_SECONDS,
  Game,
  GameError,
  LIGHTS_SECONDS,
  LIGHTS_SECONDS_SMALL,
  MAX_CHOICES,
  SUITS,
} from '../src/game.js';

function setup(count = 5) {
  let now = 1_000_000;
  const game = new Game('TEST', { clock: () => now });
  const players = Array.from({ length: count }, (_, i) => game.addPlayer(`P${i}`));
  return { game, players, host: players[0], tick: (ms) => (now += ms) };
}

/**
 * Start a game. Tests decide the safe turn and the Jack's colour and blank turns themselves;
 * by default there are none.
 */
function start(game, host, safeTurn = null, { color = [], blank = [] } = {}) {
  game.start(host.id);
  game.safeTurn = safeTurn;
  game.colorTurnSet = new Set(color);
  game.blankTurnSet = new Set(blank);
}

const wrongSuit = (suit) => SUITS.find((s) => s !== suit);

/** Everyone locks in the next player in seat order, so nobody is chosen twice. */
function chooseAll(game) {
  if (game.phase === 'cooldown') game.advance(); // turns after the first open with a countdown
  const ids = game.seatedPlayers.map((p) => p.id); // not whoever is in interrogation
  ids.forEach((id, i) => game.choose(id, [ids[(i + 1) % ids.length]]));
}

/** From the start of a turn to the discussion: choices, lights, talk. */
function toTalk(game) {
  chooseAll(game);
  game.advance(); // lights
  game.advance(); // discussion
}

/** From wherever the turn is to the cell. */
function toCell(game) {
  if (game.phase === 'cooldown' || game.phase === 'choose') toTalk(game);
  if (game.phase === 'lights') game.advance();
  if (game.phase === 'discussion') game.advance();
}

/** Play out the rest of the current turn; `pick` decides each player's answer. */
function playTurn(game, pick = (p) => p.suit) {
  if (game.phase === 'cooldown' || game.phase === 'choose') toTalk(game);
  if (game.phase === 'lights') game.advance();
  if (game.phase === 'discussion') game.advance();
  for (const p of game.alivePlayers) game.answer(p.id, pick(p));
  game.advance(); // reveal
}

const shownTo = (game, viewer) =>
  game
    .viewFor(viewer.id)
    .players.filter((p) => p.suit !== null)
    .map((p) => p.id)
    .sort();

test('needs at least three players, and only the host can start', () => {
  const { game, players, host } = setup(2);
  assert.throws(() => game.start(host.id), { code: 'NOT_ENOUGH_PLAYERS' });
  game.addPlayer('P2');
  assert.throws(() => game.start(players[1].id), { code: 'NOT_HOST' });
  game.start(host.id);
  assert.equal(game.phase, 'choose');
  assert.ok(game.players.has(game.jackId));
  assert.ok(game.safeTurn >= 1 && game.safeTurn < game.settings.maxTurns, 'never the last turn');
});

test('names are cleaned and must be unique', () => {
  const { game } = setup(1);
  assert.throws(() => game.addPlayer('  p0 '), { code: 'NAME_TAKEN' });
  assert.throws(() => game.addPlayer('   '), { code: 'BAD_NAME' });
  assert.throws(() => game.addPlayer({ evil: true }), { code: 'BAD_NAME' });
  assert.equal(game.addPlayer('  Sara   B ').name, 'Sara B');
});

test('a turn runs choose → lights → discussion → confinement → reveal, on the right clocks', () => {
  const { game, host } = setup(6);
  start(game, host);
  const left = () => game.phaseEndsAt - game.viewFor(host.id).serverNow;
  assert.equal(game.phase, 'choose');
  assert.equal(left(), CHOOSE_SECONDS * 1000);
  game.advance();
  assert.equal(game.phase, 'lights');
  assert.equal(left(), LIGHTS_SECONDS * 1000, '6 players: 5 seconds of lights');
  game.advance();
  assert.equal(game.phase, 'discussion');
  assert.equal(left(), 180_000);
  game.advance();
  assert.equal(game.phase, 'confinement');
  assert.equal(left(), 30_000);
  for (const p of game.alivePlayers) game.answer(p.id, p.suit);
  game.advance();
  assert.equal(game.phase, 'reveal');
  game.advance();
  assert.equal(game.phase, 'cooldown', 'turn 2 opens with the countdown');
  assert.equal(game.turn, 2);
  assert.equal(left(), COOLDOWN_SECONDS * 1000);
  game.advance();
  assert.equal(game.phase, 'choose');
  assert.equal(left(), CHOOSE_SECONDS * 1000);
});

test('every turn but the first opens with a 45-second countdown, and nobody sees or does anything in it', () => {
  const { game, players, host } = setup(5);
  start(game, host);
  assert.equal(game.phase, 'choose', 'turn 1 starts straight away');
  for (let turn = 2; turn <= 3; turn++) {
    playTurn(game);
    game.advance();
    assert.deepEqual([game.phase, game.turn], ['cooldown', turn]);
    assert.equal(COOLDOWN_SECONDS, 45);
    for (const p of players) {
      const view = game.viewFor(p.id);
      assert.deepEqual(shownTo(game, p), [], 'no card is shown during the countdown');
      assert.deepEqual(view.you.sees, []);
      assert.equal(view.you.locked, false);
      assert.equal(view.you.chatClosed, null, 'it is the time to talk');
    }
    const [a, b] = players;
    assert.throws(() => game.choose(a.id, [b.id]), { code: 'WRONG_PHASE' });
    assert.throws(() => game.answer(a.id, 'hearts'), { code: 'WRONG_PHASE' });
    assert.throws(() => game.useLifeline(a.id), { code: 'WRONG_PHASE' });
    assert.throws(() => game.skipDiscussion(host.id), { code: 'WRONG_PHASE' });
    assert.ok(game.alivePlayers.every((p) => SUITS.includes(p.suit)), 'the cards are dealt, face down');
    game.advance();
    assert.equal(game.phase, 'choose');
  }
});

test('private messages: between living players, from the start of the game, never in the cell', () => {
  const { game, players, host, tick } = setup(4);
  const [a, b, c, d] = players;
  assert.throws(() => game.sendMessage(a.id, b.id, 'hi'), { code: 'CHAT_CLOSED' });
  assert.equal(game.viewFor(a.id).you.chatClosed, 'lobby');
  start(game, host);

  const sent = game.sendMessage(a.id, b.id, '  Trust me:\r\n\n\n\nyou have hearts  ');
  assert.deepEqual(
    { from: sent.from, to: sent.to, text: sent.text, turn: sent.turn },
    { from: a.id, to: b.id, text: 'Trust me:\n\nyou have hearts', turn: 1 },
  );
  game.sendMessage(b.id, a.id, 'Sure.');
  game.sendMessage(c.id, d.id, 'Psst');
  assert.deepEqual(game.chatFor(a.id).map((m) => m.text), ['Trust me:\n\nyou have hearts', 'Sure.']);
  assert.deepEqual(game.chatFor(b.id).map((m) => m.text), ['Trust me:\n\nyou have hearts', 'Sure.']);
  assert.deepEqual(game.chatFor(d.id).map((m) => m.text), ['Psst'], 'you only ever get your own conversations');
  for (const p of players) {
    const json = JSON.stringify(game.viewFor(p.id));
    assert.ok(!json.includes('Trust me') && !json.includes('Psst'), 'messages are never in anyone’s state');
  }

  assert.throws(() => game.sendMessage(a.id, a.id, 'me'), { code: 'BAD_TARGET' });
  assert.throws(() => game.sendMessage(a.id, 'nobody', 'x'), { code: 'BAD_TARGET' });
  assert.throws(() => game.sendMessage(a.id, b.id, '   '), { code: 'EMPTY_MESSAGE' });
  assert.throws(() => game.sendMessage(a.id, b.id, { text: 'x' }), { code: 'EMPTY_MESSAGE' });
  const long = game.sendMessage(a.id, b.id, '🂡'.repeat(CHAT_MAX_LENGTH + 50));
  assert.equal(Array.from(long.text).length, CHAT_MAX_LENGTH, 'cut to length, emoji kept whole');

  // Five messages in five seconds, then wait.
  tick(CHAT_BURST_MS);
  for (let i = 0; i < CHAT_BURST; i++) game.sendMessage(c.id, d.id, `${i}`);
  assert.throws(() => game.sendMessage(c.id, d.id, 'more'), { code: 'TOO_FAST' });
  tick(CHAT_BURST_MS);
  game.sendMessage(c.id, d.id, 'more');

  // No talking in the cell.
  toCell(game);
  assert.throws(() => game.sendMessage(a.id, b.id, 'quick'), { code: 'CHAT_CLOSED' });
  assert.equal(game.viewFor(a.id).you.chatClosed, 'cell');

  // b dies: b can't send, and nobody can write to b.
  for (const p of game.alivePlayers) game.answer(p.id, p === b ? wrongSuit(p.suit) : p.suit);
  game.advance();
  assert.equal(b.alive, false);
  assert.throws(() => game.sendMessage(b.id, a.id, 'boo'), { code: 'NOT_ALIVE' });
  assert.throws(() => game.sendMessage(a.id, b.id, 'rip'), { code: 'BAD_TARGET' });
  assert.equal(game.viewFor(b.id).you.chatClosed, 'dead');
  game.sendMessage(a.id, c.id, 'b is gone');
  assert.equal(game.chatFor(b.id).length, 3, 'the dead keep what they had');
});

test('a new game starts with an empty chat', () => {
  const { game, players, host } = setup(3);
  const [a, b] = players;
  start(game, host);
  game.sendMessage(a.id, b.id, 'old news');
  game.jackId = a.id;
  playTurn(game, (p) => (p === a ? wrongSuit(p.suit) : p.suit));
  game.advance();
  assert.equal(game.phase, 'over');
  game.reset(host.id);
  start(game, host);
  assert.deepEqual(game.chatFor(a.id), []);
  assert.equal(game.sendMessage(b.id, a.id, 'fresh').id, 1);
});

test('with 5 or fewer players the lights last 3 seconds', () => {
  for (const count of [3, 5]) {
    const { game, host } = setup(count);
    start(game, host);
    game.advance();
    assert.equal(game.phaseEndsAt - game.viewFor(host.id).serverNow, LIGHTS_SECONDS_SMALL * 1000);
  }
});

test('choosing: rank up to 3 with 5+ players, only 1 with 4 or fewer, never yourself, locked for good', () => {
  const { game, players, host } = setup(5);
  const [p0, p1, p2, p3, p4] = players;
  start(game, host);
  assert.equal(game.viewFor(p0.id).maxChoices, MAX_CHOICES);
  assert.throws(() => game.choose(p0.id, []), { code: 'BAD_TARGET' });
  assert.throws(() => game.choose(p0.id, 'p1'), { code: 'BAD_TARGET' });
  assert.throws(() => game.choose(p0.id, [p0.id]), { code: 'BAD_TARGET' });
  assert.throws(() => game.choose(p0.id, ['nobody']), { code: 'BAD_TARGET' });
  assert.throws(() => game.choose(p0.id, [p1.id, p1.id]), { code: 'BAD_TARGET' });
  assert.throws(() => game.choose(p0.id, [p1.id, p2.id, p3.id, p4.id]), { code: 'BAD_TARGET' });
  game.choose(p0.id, [p1.id, p2.id, p3.id]);
  assert.throws(() => game.choose(p0.id, [p4.id]), { code: 'LOCKED' });
  const view = game.viewFor(p0.id).you;
  assert.equal(view.locked, true);
  assert.deepEqual(view.ranking, [p1.id, p2.id, p3.id]);
  assert.equal(game.viewFor(p1.id).you.ranking, null, "you can't see anyone else's choice");
  assert.equal(game.everyoneChose, false);
  for (const p of [p1, p2, p3, p4]) game.choose(p.id, [p0.id]);
  assert.equal(game.everyoneChose, true);
  game.advance();
  assert.throws(() => game.choose(p1.id, [p2.id]), { code: 'WRONG_PHASE' });

  const small = setup(4);
  start(small.game, small.host);
  assert.equal(small.game.viewFor(small.host.id).maxChoices, 1);
  assert.throws(() => small.game.choose(small.host.id, [small.players[1].id, small.players[2].id]), {
    code: 'BAD_TARGET',
  });
});

test('first come, first served: the 2 fastest get the person, the rest get their next choice', () => {
  const { game, players, host } = setup(6);
  const [p0, p1, p2, p3, p4, p5] = players;
  start(game, host);
  game.choose(p1.id, [p0.id, p2.id]);
  game.choose(p2.id, [p0.id, p1.id]);
  game.choose(p3.id, [p0.id, p4.id, p5.id]); // p0 is full by now
  game.choose(p4.id, [p0.id]); // only choice taken: picked for you
  game.advance(); // p0 and p5 never locked in
  const viewersOf = (p) => game.viewFor(p.id).you.viewers;
  assert.equal(viewersOf(p1).picked, p0.id);
  assert.equal(viewersOf(p1).rank, 1);
  assert.equal(viewersOf(p3).picked, p4.id);
  assert.equal(viewersOf(p3).rank, 2);
  for (const p of [p4, p0, p5]) {
    assert.equal(viewersOf(p).autoPicked, true);
    assert.notEqual(viewersOf(p).picked, p0.id, 'p0 was already full');
  }
  for (const p of players) {
    const { viewers, sees } = game.viewFor(p.id).you;
    assert.ok(viewers.picked && viewers.random && viewers.picked !== viewers.random);
    assert.ok(![viewers.picked, viewers.random].includes(p.id), 'never your own viewer');
    assert.equal(sees.length, 2, 'everyone sees exactly 2 cards');
    assert.equal(players.filter((t) => game.sees.get(p.id).includes(t.id)).length, 2);
  }
});

test('with 4 or fewer players, you see 1 card and yours is seen by the 1 person you chose', () => {
  const { game, players, host } = setup(4);
  const [p0, p1, p2, p3] = players;
  start(game, host);
  assert.equal(game.viewFor(p0.id).maxChoices, 1);
  assert.equal(game.viewFor(p0.id).maxChosen, 1);
  game.choose(p1.id, [p0.id]);
  game.choose(p2.id, [p0.id]); // too slow: p1 already has p0
  game.choose(p3.id, [p2.id]);
  game.choose(p0.id, [p1.id]);
  game.advance(); // the lights: still every card but yours
  for (const p of players) assert.equal(shownTo(game, p).length, 3);
  const viewersOf = (p) => game.viewFor(p.id).you.viewers;
  assert.deepEqual([viewersOf(p1).picked, viewersOf(p1).rank, viewersOf(p1).random], [p0.id, 1, null]);
  assert.deepEqual([viewersOf(p3).picked, viewersOf(p3).rank], [p2.id, 1]);
  assert.deepEqual([viewersOf(p0).picked, viewersOf(p0).rank], [p1.id, 1]);
  assert.notEqual(viewersOf(p2).picked, p0.id);
  assert.equal(viewersOf(p2).autoPicked, true);
  game.advance(); // the talk: just your 1 card, and nobody else holds it
  for (const p of players) {
    const { sees, sharedWith } = game.viewFor(p.id).you;
    assert.equal(sees.length, 1, `${p.name} sees exactly 1 card`);
    assert.deepEqual(shownTo(game, p), [...sees]);
    assert.equal(sharedWith[sees[0]], null);
  }
});

test('the lights show every card but yours; the talk only your 2; the cell nothing', () => {
  const { game, players, host } = setup(7);
  start(game, host);
  for (let turn = 0; turn < 3; turn++) {
    chooseAll(game);
    for (const phase of ['choose', 'lights', 'discussion', 'confinement']) {
      if (phase !== 'choose') game.advance();
      assert.equal(game.phase, phase);
      for (const viewer of game.alivePlayers) {
        const view = game.viewFor(viewer.id);
        const shown = shownTo(game, viewer);
        const expected = {
          choose: [],
          lights: game.alivePlayers.map((p) => p.id).filter((id) => id !== viewer.id),
          discussion: game.sees.get(viewer.id),
          confinement: [],
        }[phase];
        assert.deepEqual(shown, [...expected].sort(), `${phase}: the right cards`);
        assert.ok(!shown.includes(viewer.id), 'never your own card');
        assert.ok(!('suit' in view.you));
        for (const id of shown) assert.equal(view.players.find((p) => p.id === id).suit, game.players.get(id).suit);
        const json = JSON.stringify(view);
        for (const p of players) assert.ok(!json.includes(p.token), 'token leaked');
      }
    }
    for (const p of game.alivePlayers) game.answer(p.id, p.suit);
    game.advance();
    game.advance();
  }
});

test('for each of your 2 cards, you see the other person who holds it', () => {
  const { game, players, host } = setup(8);
  start(game, host);
  toTalk(game);
  for (const p of players) {
    const { sees, sharedWith } = game.viewFor(p.id).you;
    assert.deepEqual(Object.keys(sharedWith).sort(), [...sees].sort());
    for (const target of sees) {
      const other = sharedWith[target];
      assert.ok(other && other !== p.id && other !== target);
      const { picked, random } = game.viewers.get(target);
      assert.deepEqual([picked, random].sort(), [p.id, other].sort(), 'exactly the two viewers of that card');
      assert.equal(game.viewFor(other).you.sharedWith[target], p.id, 'and they see you');
    }
  }
});

test('cards are dealt fairly: each suit 1 in 4, unrelated to anyone else’s card or to your last one', () => {
  const z = (hits, n, p) => (hits - n * p) / Math.sqrt(n * p * (1 - p));
  const counts = new Map(SUITS.map((s) => [s, 0]));
  const tally = { cards: 0, repeats: 0, transitions: 0, pairsSame: 0, pairs: 0 };
  const last = new Map();
  let table = null;
  for (let turn = 0; turn < 4000; turn += 1) {
    if (!table || !['cooldown', 'choose'].includes(table.game.phase)) {
      table = setup(6);
      table.game.updateSettings(table.host.id, { maxTurns: 50 });
      start(table.game, table.host);
    }
    const suits = table.players.map((p) => p.suit);
    table.players.forEach((p, i) => {
      counts.set(p.suit, counts.get(p.suit) + 1);
      tally.cards += 1;
      if (last.has(p.id)) {
        tally.transitions += 1;
        if (last.get(p.id) === p.suit) tally.repeats += 1;
      }
      last.set(p.id, p.suit);
      for (let j = i + 1; j < suits.length; j += 1) {
        tally.pairs += 1;
        if (suits[j] === p.suit) tally.pairsSame += 1;
      }
    });
    playTurn(table.game); // everyone answers right, so nobody dies
    table.game.advance(); // fresh cards for the next turn
  }
  const expected = tally.cards / 4;
  const chi = SUITS.reduce((sum, s) => sum + (counts.get(s) - expected) ** 2 / expected, 0);
  assert.ok(chi < 25, `the suits are uneven: chi-square ${chi.toFixed(1)}`);
  // A "no repeats" rule would show up here: survivors know last turn's card.
  assert.ok(Math.abs(z(tally.repeats, tally.transitions, 0.25)) < 5, 'your card depends on your last one');
  // Dealing from one deck, or evening the suits out, would show up here: the glimpse would leak your card.
  assert.ok(Math.abs(z(tally.pairsSame, tally.pairs, 0.25)) < 5, 'your card depends on the cards around you');
});

test('the lifeline works only in your cell, once per game, before you answer, and only for you', () => {
  const { game, players, host } = setup(4);
  const [p0, p1, p2] = players;
  assert.throws(() => game.useLifeline(p0.id), { code: 'WRONG_PHASE' });
  start(game, host);
  assert.throws(() => game.useLifeline(p0.id), { code: 'WRONG_PHASE' }, 'not while choosing');
  chooseAll(game);
  game.advance();
  assert.throws(() => game.useLifeline(p0.id), { code: 'WRONG_PHASE' }, 'not in the lights');
  game.advance();
  assert.throws(() => game.useLifeline(p0.id), { code: 'WRONG_PHASE' }, 'not during the talk');
  game.advance();
  assert.deepEqual(game.useLifeline(p0.id), { suit: p0.suit });
  assert.throws(() => game.useLifeline(p0.id), { code: 'LIFELINE_USED' });
  assert.equal(game.viewFor(p0.id).you.lifelineUsed, true);
  assert.equal(game.viewFor(p1.id).you.lifelineUsed, false);
  assert.ok(game.viewFor(p0.id).players.every((p) => p.suit === null), 'the card is in the reply, not the state');
  game.answer(p1.id, 'hearts');
  assert.throws(() => game.useLifeline(p1.id), { code: 'LOCKED' });
  assert.deepEqual(game.useLifeline(p2.id), { suit: p2.suit });
});

test('the blackout: only the Jack, only during the talk, once per game', () => {
  const { game, host } = setup(6);
  start(game, host);
  const jack = game.players.get(game.jackId);
  const others = game.alivePlayers.filter((p) => p !== jack);
  for (const p of others) assert.throws(() => game.armBlackout(p.id), { code: 'NOT_ALLOWED' });
  assert.throws(() => game.armBlackout(jack.id), { code: 'WRONG_PHASE' }, 'not while choosing');
  toTalk(game);
  for (const p of others) assert.throws(() => game.armBlackout(p.id), { code: 'NOT_ALLOWED' });
  assert.equal(game.viewFor(jack.id).you.blackout, 'ready');
  game.armBlackout(jack.id);
  assert.equal(game.viewFor(jack.id).you.blackout, 'on');
  assert.throws(() => game.armBlackout(jack.id), { code: 'BLACKOUT_USED' });
  game.advance();
  assert.equal(game.viewFor(jack.id).you.blackout, 'on', 'it covers this turn’s cell');
  assert.throws(() => game.armBlackout(jack.id), { code: 'WRONG_PHASE' });
  playTurn(game);
  game.advance(); // turn 2
  toTalk(game);
  assert.equal(game.viewFor(jack.id).you.blackout, 'used');
  assert.throws(() => game.armBlackout(jack.id), { code: 'BLACKOUT_USED' });
});

test('in a blacked-out cell every other lifeline fails and is lost; the Jack’s still works', () => {
  const { game, host } = setup(6);
  start(game, host);
  const jack = game.players.get(game.jackId);
  const [a, b, c] = game.alivePlayers.filter((p) => p !== jack);

  // Turn 1, no blackout: a lifeline works as usual.
  toCell(game);
  assert.deepEqual(game.useLifeline(a.id), { suit: a.suit });
  playTurn(game);
  game.advance();

  // Turn 2: the Jack blacks out the cell during the talk.
  toTalk(game);
  game.armBlackout(jack.id);
  game.advance();
  assert.deepEqual(game.useLifeline(b.id), { blackout: true }, 'no card, just the blackout');
  assert.equal(game.viewFor(b.id).you.lifelineUsed, true, 'and the lifeline is gone for good');
  assert.throws(() => game.useLifeline(b.id), { code: 'LIFELINE_USED' });
  assert.throws(() => game.useLifeline(a.id), { code: 'LIFELINE_USED' });
  assert.deepEqual(game.useLifeline(jack.id), { suit: jack.suit }, 'the Jack’s own lifeline works');
  playTurn(game);
  game.advance();

  // Turn 3: lifelines work again for whoever still has one.
  toCell(game);
  assert.deepEqual(game.useLifeline(c.id), { suit: c.suit });
  assert.deepEqual(game.blackoutVictims, [b.id]);
});

test('nobody but the Jack hears about the blackout until the game is over', () => {
  const { game, host } = setup(6);
  start(game, host);
  const jack = game.players.get(game.jackId);
  const [victim, bystander] = game.alivePlayers.filter((p) => p !== jack && p !== host);
  const seen = [];
  const look = () => {
    for (const p of game.players.values()) seen.push([p, JSON.stringify(game.viewFor(p.id))]);
  };
  look();
  toTalk(game);
  look();
  game.armBlackout(jack.id);
  look();
  game.advance();
  game.useLifeline(victim.id);
  look();
  playTurn(game, (p) => (p === jack ? wrongSuit(p.suit) : p.suit));
  look();
  for (const [p, json] of seen) {
    if (p === jack) continue;
    if (p === host) assert.ok(!json.includes('"blackout":"'), 'the host only sees the on/off switch');
    else assert.ok(!json.includes('blackout'), `${p.name}'s phone could tell a blackout exists`);
  }
  game.advance(); // over: the secret comes out, but not who used a lifeline, or whether anyone did
  for (const p of [bystander, victim, jack]) {
    const { blackout } = game.viewFor(p.id).result;
    assert.deepEqual(blackout, { turn: 1 });
    assert.ok(!/lifeline|lost|victim/i.test(JSON.stringify(game.viewFor(p.id).result)), 'the end says nothing about lifelines');
  }
});

test('the host can switch the blackout off, and only the host sees that switch', () => {
  const { game, players, host } = setup(4);
  assert.equal(game.viewFor(host.id).settings.blackout, true, 'on by default');
  assert.equal('blackout' in game.viewFor(players[1].id).settings, false);
  assert.throws(() => game.updateSettings(host.id, { blackout: 'yes' }), { code: 'BAD_SETTINGS' });
  assert.throws(() => game.updateSettings(players[1].id, { blackout: false }), { code: 'NOT_HOST' });
  game.updateSettings(host.id, { blackout: false });
  assert.equal(game.viewFor(host.id).settings.blackout, false);
  start(game, host);
  const jack = game.players.get(game.jackId);
  toTalk(game);
  assert.equal('blackout' in game.viewFor(jack.id).you, false, 'switched off, even the Jack never hears of it');
  assert.throws(() => game.armBlackout(jack.id), { code: 'NOT_ALLOWED' });
  playTurn(game, (p) => (p === jack ? wrongSuit(p.suit) : p.suit));
  game.advance();
  assert.equal(game.phase, 'over');
  assert.equal(game.viewFor(host.id).result.blackout, null);
});

test('the safe turn: nobody dies, and each player privately learns whether they were right', () => {
  const { game, host } = setup(6);
  start(game, host, 1);
  toTalk(game);
  game.advance();
  const [right, wrong, silent] = game.alivePlayers.filter((p) => p.id !== game.jackId);
  assert.equal(game.viewFor(right.id).safe, false, 'secret until it is over');
  for (const p of game.alivePlayers) {
    if (p === silent) continue;
    game.answer(p.id, p === wrong ? wrongSuit(p.suit) : p.suit);
  }
  game.advance();
  assert.equal(game.phase, 'reveal');
  assert.equal(game.alivePlayers.length, 6, 'collars were off');
  assert.deepEqual(game.deaths, []);
  assert.equal(game.viewFor(right.id).safe, true);
  assert.equal(game.viewFor(right.id).you.safeResult, 'right');
  assert.equal(game.viewFor(wrong.id).you.safeResult, 'wrong');
  assert.equal(game.viewFor(silent.id).you.safeResult, 'none');
  assert.ok(!JSON.stringify(game.viewFor(right.id)).includes('wrong'), "you don't learn other people's results");
  game.advance();
  playTurn(game, (p) => (p === wrong ? wrongSuit(p.suit) : p.suit));
  assert.equal(wrong.alive, false, 'the next turn is deadly again');
  assert.equal(game.viewFor(right.id).safe, false);
});

test('a wrong or missing answer kills; a correct one survives', () => {
  const { game, host } = setup(6);
  start(game, host);
  toTalk(game);
  game.advance();
  const [right, wrong, silent] = game.alivePlayers.filter((p) => p.id !== game.jackId);
  game.answer(right.id, right.suit);
  game.answer(wrong.id, wrongSuit(wrong.suit));
  for (const p of game.alivePlayers) {
    if (![right.id, wrong.id, silent.id].includes(p.id)) game.answer(p.id, p.suit);
  }
  assert.equal(game.everyoneAnswered, false);
  game.advance();
  assert.equal(right.alive, true);
  assert.equal(wrong.alive, false);
  assert.equal(silent.alive, false);
  assert.equal(game.viewFor(wrong.id).deaths.find((d) => d.id === wrong.id).suit, wrong.suit);
  assert.deepEqual(game.viewFor(right.id).deaths.find((d) => d.id === wrong.id), { id: wrong.id });
});

test('dead players see nothing, choose nothing, and nobody is assigned to them', () => {
  const { game, players, host } = setup(6);
  start(game, host);
  const victim = game.alivePlayers.find((p) => p.id !== game.jackId);
  playTurn(game, (p) => (p.id === victim.id ? wrongSuit(p.suit) : p.suit));
  game.advance(); // turn 2: the countdown
  game.advance(); // choosing
  const someone = players.find((p) => p !== victim);
  assert.throws(() => game.choose(victim.id, [someone.id]), { code: 'NOT_ALIVE' });
  assert.throws(() => game.choose(someone.id, [victim.id]), { code: 'BAD_TARGET' });
  chooseAll(game);
  game.advance();
  const view = game.viewFor(victim.id);
  assert.equal(view.you.viewers, null);
  assert.deepEqual(view.you.sees, []);
  assert.ok(view.players.every((p) => p.suit === null));
  for (const { picked, random } of game.viewers.values()) {
    assert.ok(picked !== victim.id && random !== victim.id);
  }
  for (const viewer of game.alivePlayers) {
    assert.ok(!shownTo(game, viewer).includes(victim.id), "a dead player's card isn't in the lights");
  }
  toCell(game);
  assert.throws(() => game.useLifeline(victim.id), { code: 'NOT_ALIVE' });
});

test('killing the Jack clears the game for every survivor', () => {
  const { game, host } = setup(5);
  start(game, host);
  playTurn(game, (p) => (p.id === game.jackId ? wrongSuit(p.suit) : p.suit));
  assert.deepEqual(game.result, { winner: 'players' });
  game.advance();
  assert.equal(game.phase, 'over');
  assert.equal(game.viewFor(host.id).result.jackId, game.jackId);
});

test('the Jack wins when only one other player is left', () => {
  const { game, host } = setup(5);
  start(game, host);
  const keep = game.alivePlayers.find((p) => p.id !== game.jackId);
  playTurn(game, (p) => ([game.jackId, keep.id].includes(p.id) ? p.suit : wrongSuit(p.suit)));
  assert.deepEqual(game.result, { winner: 'jack', reason: 'last-two' });
});

test('the Jack wins if the turn limit runs out, even when the last turn is the safe one', () => {
  const { game, host } = setup(4);
  game.updateSettings(host.id, { maxTurns: 2 });
  start(game, host, 2);
  playTurn(game);
  assert.equal(game.result, null);
  game.advance();
  playTurn(game, (p) => wrongSuit(p.suit));
  assert.deepEqual(game.result, { winner: 'jack', reason: 'time' });
  assert.equal(game.alivePlayers.length, 4);
});

test('everyone dying with the Jack means nobody clears', () => {
  const { game, host } = setup(3);
  start(game, host);
  playTurn(game, (p) => wrongSuit(p.suit));
  assert.deepEqual(game.result, { winner: 'nobody' });
});

test('settings are clamped, host-only and lobby-only', () => {
  const { game, players, host } = setup(3);
  game.updateSettings(host.id, { discussionSeconds: 5, answerSeconds: 9999 });
  assert.equal(game.settings.discussionSeconds, 30);
  assert.equal(game.settings.answerSeconds, 300);
  assert.throws(() => game.updateSettings(host.id, { maxTurns: 'lots' }), { code: 'BAD_SETTINGS' });
  assert.throws(() => game.updateSettings(players[1].id, { maxTurns: 3 }), { code: 'NOT_HOST' });
  game.start(host.id);
  assert.throws(() => game.updateSettings(host.id, { maxTurns: 3 }), { code: 'WRONG_PHASE' });
});

test('resume needs the right token; a player who leaves gets no viewers and their collar goes off', () => {
  const { game, players, host } = setup(6);
  const [, p1, p2, p3] = players;
  assert.equal(game.authenticate(p1.id, p1.token), p1);
  assert.equal(game.authenticate(p1.id, p2.token), null);
  assert.equal(game.authenticate(p1.id, 'short'), null);
  start(game, host);
  game.choose(p3.id, [p2.id, p1.id]); // p3 trusts p2 first...
  game.choose(p2.id, [p1.id]);
  game.leave(p2.id); // ...but p2 walks out
  assert.equal(game.authenticate(p2.id, p2.token), null);
  for (const p of game.activePlayers) if (!game.locks.has(p.id)) game.choose(p.id, [p3.id === p.id ? p1.id : p3.id]);
  assert.equal(game.everyoneChose, true, 'nobody waits for a player who left');
  game.advance();
  assert.equal(game.viewers.has(p2.id), false);
  for (const { picked, random } of game.viewers.values()) assert.ok(picked !== p2.id && random !== p2.id);
  assert.equal(game.viewers.get(p3.id).picked, p1.id, 'p3 gets their 2nd choice');
  assert.equal(game.viewers.get(p3.id).rank, 2);
  for (const viewer of game.activePlayers) assert.ok(!shownTo(game, viewer).includes(p2.id));
  game.advance();
  game.advance();
  for (const p of game.activePlayers) game.answer(p.id, p.suit);
  assert.equal(game.everyoneAnswered, true);
  game.advance();
  assert.equal(p2.alive, false);
});

test('host powers pass on when the host drops, and come back', () => {
  const { game, players, host } = setup(3);
  host.connected = false;
  assert.equal(game.activeHostId, players[1].id);
  assert.throws(() => game.start(host.id), { code: 'NOT_HOST' });
  host.connected = true;
  assert.equal(game.activeHostId, host.id);
});

test('play again resets everyone, including lifelines and the blackout, keeps the room, and starts a new game number', () => {
  const { game, host } = setup(3);
  assert.equal(game.viewFor(host.id).gameNumber, 0);
  start(game, host);
  assert.equal(game.viewFor(host.id).gameNumber, 1);
  toTalk(game);
  game.armBlackout(game.jackId);
  game.advance();
  game.useLifeline(host.id);
  playTurn(game, (p) => (p.id === game.jackId ? wrongSuit(p.suit) : p.suit));
  game.advance();
  game.reset(host.id);
  assert.equal(game.phase, 'lobby');
  assert.equal(game.jackId, null);
  assert.equal(game.safeTurn, null);
  assert.equal(game.blackoutTurn, null);
  assert.deepEqual(game.blackoutVictims, []);
  assert.ok([...game.players.values()].every((p) => p.alive && !p.lifelineUsed));
  start(game, host);
  assert.equal(game.viewFor(host.id).gameNumber, 2, "phones won't mix this game's notes with the last one's");
  toTalk(game);
  assert.equal(game.viewFor(game.jackId).you.blackout, 'ready');
});

test('GameError carries a machine-readable code', () => {
  const err = new GameError('X', 'msg');
  assert.equal(err.code, 'X');
  assert.ok(err instanceof Error);
});

test('the safe turn is never the last turn, and can be any other', () => {
  for (const maxTurns of [2, 3, 8]) {
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      const { game, host } = setup(3);
      game.updateSettings(host.id, { maxTurns });
      game.start(host.id);
      assert.ok(game.safeTurn >= 1 && game.safeTurn < maxTurns, `turn ${game.safeTurn} of ${maxTurns}`);
      seen.add(game.safeTurn);
    }
    assert.equal(seen.size, maxTurns - 1, `every turn but the last can be the safe one (${maxTurns} turns)`);
  }
});

test('the last turn: no lifelines, and the Jack’s blackout isn’t offered', () => {
  const { game, host } = setup(4);
  game.updateSettings(host.id, { maxTurns: 2 });
  start(game, host);
  const jack = game.players.get(game.jackId);
  const [a, b] = game.alivePlayers.filter((p) => p !== jack);
  toTalk(game);
  assert.equal(game.viewFor(a.id).lastTurn, false);
  assert.equal(game.viewFor(jack.id).you.blackout, 'ready', 'turn 1 of 2: still on offer');
  game.advance();
  assert.deepEqual(game.useLifeline(a.id), { suit: a.suit }, 'turn 1 of 2: lifelines work');
  playTurn(game);
  game.advance(); // turn 2 of 2: the last
  toTalk(game);
  for (const p of game.alivePlayers) assert.equal(game.viewFor(p.id).lastTurn, true);
  assert.equal(game.viewFor(jack.id).you.blackout, null, 'nothing left to black out');
  assert.throws(() => game.armBlackout(jack.id), { code: 'LAST_TURN' });
  game.advance(); // the cell
  assert.throws(() => game.useLifeline(b.id), { code: 'LAST_TURN' });
  assert.throws(() => game.useLifeline(jack.id), { code: 'LAST_TURN' }, 'not even the Jack’s');
  assert.equal(game.viewFor(b.id).you.lifelineUsed, false, 'it was never spent');
});

test('the host decides whether the end reveals the blackout; off, nobody ever learns he used it', () => {
  const { game, players, host } = setup(5);
  assert.equal(game.viewFor(host.id).settings.blackoutReveal, true, 'revealed by default');
  assert.equal('blackoutReveal' in game.viewFor(players[1].id).settings, false, 'only the host sees the switch');
  assert.throws(() => game.updateSettings(host.id, { blackoutReveal: 'no' }), { code: 'BAD_SETTINGS' });
  assert.throws(() => game.updateSettings(players[1].id, { blackoutReveal: false }), { code: 'NOT_HOST' });
  game.updateSettings(host.id, { blackoutReveal: false });
  start(game, host);
  const jack = game.players.get(game.jackId);
  toTalk(game);
  game.armBlackout(jack.id);
  game.advance(); // the cell
  const victim = game.alivePlayers.find((p) => p !== jack);
  assert.deepEqual(game.useLifeline(victim.id), { blackout: true }, 'the power itself still works');
  playTurn(game, (p) => (p === jack ? wrongSuit(p.suit) : p.suit));
  game.advance(); // over
  for (const p of game.players.values()) {
    const view = game.viewFor(p.id);
    assert.equal(view.phase, 'over');
    assert.equal(view.result.blackout, null, `${p.name}'s phone never learns the Jack used it`);
    if (p.id !== host.id) assert.ok(!JSON.stringify(view).includes('blackout":{'), p.name);
  }
});

// ---- The Jack's limits, his fake, the interrogation vote, 10-word messages ----

const notJack = (game) => game.activePlayers.filter((p) => p.id !== game.jackId);
const colourOf = (suit) => (suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black');

test('the Jack’s limits and the interrogation are settings everyone sees, clamped, host-only', () => {
  const { game, players, host } = setup(5);
  const seen = game.viewFor(players[1].id).settings;
  assert.deepEqual(
    [seen.blankTurns, seen.colorTurns, seen.fakeSuits, seen.interrogation],
    [1, 2, 2, true],
    'on by default, and everyone knows how many',
  );
  assert.throws(() => game.updateSettings(players[1].id, { colorTurns: 1 }), { code: 'NOT_HOST' });
  assert.throws(() => game.updateSettings(host.id, { interrogation: 'yes' }), { code: 'BAD_SETTINGS' });
  game.updateSettings(host.id, { colorTurns: 99, blankTurns: -3, fakeSuits: 0, interrogation: false });
  assert.deepEqual(
    [game.settings.colorTurns, game.settings.blankTurns, game.settings.fakeSuits, game.settings.interrogation],
    [5, 0, 0, false],
  );
});

test('colour and blank turns are different turns, never the last; colour turns come first when short', () => {
  const { game, host } = setup(5);
  game.updateSettings(host.id, { maxTurns: 5, colorTurns: 3, blankTurns: 3 });
  game.start(host.id);
  const all = [...game.colorTurnSet, ...game.blankTurnSet];
  assert.equal(game.colorTurnSet.size, 3);
  assert.equal(game.blankTurnSet.size, 1, 'only 4 turns can hold them');
  assert.equal(new Set(all).size, 4, 'no turn is both');
  assert.ok(all.every((t) => t >= 1 && t < 5), 'never the last turn');
});

test('on a colour turn the Jack sees only red or black, and no real suit reaches his phone', () => {
  const { game, host } = setup(6);
  start(game, host, null, { color: [1] });
  const jack = game.players.get(game.jackId);
  chooseAll(game);
  game.advance(); // lights
  const lights = game.viewFor(jack.id).players.filter((p) => p.suit);
  assert.equal(lights.length, 5);
  for (const p of lights) assert.equal(p.suit, colourOf(game.players.get(p.id).suit));
  assert.equal(game.viewFor(jack.id).you.powers.sight, 'color');
  for (const p of notJack(game)) {
    const view = game.viewFor(p.id);
    assert.ok(view.players.filter((q) => q.suit).every((q) => SUITS.includes(q.suit)), 'the others see real suits');
    assert.equal('powers' in view.you, false, 'and never hear about his powers');
  }
  game.advance(); // talk
  const view = game.viewFor(jack.id);
  const held = view.players.filter((p) => p.suit);
  assert.equal(held.length, 2);
  assert.ok(held.every((p) => p.suit === 'red' || p.suit === 'black'));
  assert.ok(!SUITS.some((s) => JSON.stringify(view).includes(`"${s}"`)), 'no real suit in his state');
});

test('on a blank turn one of the 2 cards the Jack holds is blank, in the lights and the talk', () => {
  const { game, host } = setup(6);
  start(game, host, null, { blank: [1] });
  const jack = game.players.get(game.jackId);
  chooseAll(game);
  game.advance(); // lights
  const blank = game.viewFor(jack.id).players.filter((p) => p.suit === 'blank');
  assert.equal(blank.length, 1);
  assert.ok(game.sees.get(jack.id).includes(blank[0].id), 'it is one of the cards he holds');
  assert.equal(game.viewFor(jack.id).you.powers.sight, 'blank');
  game.advance(); // talk
  const held = game.viewFor(jack.id).players.filter((p) => p.suit);
  assert.deepEqual(held.map((p) => p.suit === 'blank').sort(), [false, true], 'one blank, one real');
});

test('the fake: while choosing, the Jack makes one holder of a card see a false suit on it', () => {
  const { game, host } = setup(6);
  start(game, host);
  const jack = game.players.get(game.jackId);
  const [other, target] = notJack(game);
  assert.throws(() => game.fakeCard(other.id, target.id), { code: 'NOT_ALLOWED' });
  assert.throws(() => game.fakeCard(jack.id, jack.id), { code: 'BAD_TARGET' });
  game.fakeCard(jack.id, target.id);
  assert.throws(() => game.fakeCard(jack.id, other.id), { code: 'FAKE_USED' });
  assert.equal(game.viewFor(jack.id).you.powers.fakesLeft, 1);
  assert.equal(game.viewFor(jack.id).you.powers.fakeTarget, target.id);
  chooseAll(game);
  game.advance(); // lights

  const { fake } = game.viewFor(jack.id).you.powers;
  const entry = game.viewers.get(target.id);
  assert.equal(fake.targetId, target.id);
  assert.ok([entry.picked, entry.random].includes(fake.viewerId), 'the faked player really holds that card');
  assert.notEqual(fake.viewerId, jack.id);
  assert.notEqual(fake.suit, target.suit, 'a false suit');
  const seenBy = (id) => game.viewFor(id).players.find((p) => p.id === target.id).suit;
  assert.equal(seenBy(fake.viewerId), fake.suit, 'they see the false suit in the lights');
  for (const p of notJack(game)) {
    if (p.id !== fake.viewerId && p.id !== target.id) assert.equal(seenBy(p.id), target.suit, `${p.name} sees the real one`);
  }
  game.advance(); // talk
  assert.equal(seenBy(fake.viewerId), fake.suit, 'and in the talk');
  assert.equal('powers' in game.viewFor(fake.viewerId).you, false);
});

test('no fakes on the Jack’s colour or blank turns, outside choosing, or once they run out', () => {
  const { game, host } = setup(6);
  game.updateSettings(host.id, { fakeSuits: 1 });
  start(game, host, null, { color: [2] });
  const jack = game.players.get(game.jackId);
  const [target] = notJack(game);
  game.fakeCard(jack.id, target.id); // turn 1
  playTurn(game);
  game.advance(); // turn 2, countdown
  assert.throws(() => game.fakeCard(jack.id, target.id), { code: 'WRONG_PHASE' });
  game.advance(); // choose, on his colour turn
  assert.throws(() => game.fakeCard(jack.id, target.id), { code: 'FAKE_LOCKED' });
  playTurn(game);
  game.advance();
  game.advance(); // turn 3, choose
  assert.throws(() => game.fakeCard(jack.id, target.id), { code: 'NO_FAKES' });

  const off = setup(5);
  off.game.updateSettings(off.host.id, { fakeSuits: 0 });
  start(off.game, off.host);
  assert.throws(() => off.game.fakeCard(off.game.jackId, notJack(off.game)[0].id), { code: 'NOT_ALLOWED' });
});

test('a fake that lands on no other holder does nothing and is given back', () => {
  const { game, host } = setup(6);
  start(game, host);
  const jack = game.players.get(game.jackId);
  const [target] = notJack(game);
  game.fakeCard(jack.id, target.id);
  game.leave(target.id); // nobody holds the card of someone who left
  chooseAll(game);
  game.advance(); // lights
  const { fake, fakesLeft } = game.viewFor(jack.id).you.powers;
  assert.deepEqual(fake, { targetId: target.id, viewerId: null, suit: null });
  assert.equal(fakesLeft, 2);
});

test('the interrogation vote opens after a quiet first half, or 2 turns before the end', () => {
  const openTurns = (killOnTurn2) => {
    const { game, host } = setup(6); // 8 turns
    start(game, host);
    const victim = notJack(game)[0];
    const open = [];
    playTurn(game);
    for (let turn = 2; turn <= 6; turn++) {
      game.advance(); // countdown
      if (game.interrogationOpen) open.push(turn);
      playTurn(game, (p) => (killOnTurn2 && turn === 2 && p.id === victim.id ? wrongSuit(p.suit) : p.suit));
    }
    return open;
  };
  assert.deepEqual(openTurns(false), [5, 6], 'nobody died in turns 1–4: open from turn 5');
  assert.deepEqual(openTurns(true), [6], 'a death in the first half: only from turn 6 (8 − 2)');
});

test('the interrogation vote needs more than 4 players, and can be switched off', () => {
  const small = setup(5);
  small.game.updateSettings(small.host.id, { maxTurns: 4 });
  start(small.game, small.host);
  const victim = notJack(small.game)[0];
  playTurn(small.game, (p) => (p.id === victim.id ? wrongSuit(p.suit) : p.suit));
  small.game.advance(); // turn 2 of 4: the vote's turn, but only 4 are left
  assert.equal(small.game.interrogationOpen, false);

  const off = setup(6);
  off.game.updateSettings(off.host.id, { maxTurns: 4, interrogation: false });
  start(off.game, off.host);
  playTurn(off.game);
  off.game.advance();
  assert.equal(off.game.interrogationOpen, false);
  assert.equal(off.game.viewFor(off.host.id).interrogation, null);
  assert.throws(() => off.game.vote(off.host.id, notJack(off.game)[0].id), { code: 'VOTE_CLOSED' });
});

test('a majority sends one player into interrogation: unseen, seeing nothing, no lifeline, once a game', () => {
  const { game, host } = setup(6);
  game.updateSettings(host.id, { maxTurns: 4 });
  start(game, host);
  playTurn(game);
  game.advance(); // turn 2 of 4, countdown: the vote is open
  assert.ok(game.interrogationOpen);
  const suspect = notJack(game)[0];
  const voters = game.activePlayers.filter((p) => p.id !== suspect.id);
  assert.throws(() => game.vote(suspect.id, suspect.id), { code: 'BAD_TARGET' });
  for (const v of voters.slice(0, 3)) game.vote(v.id, suspect.id);
  game.vote(voters[3].id, voters[0].id);
  const poll = game.viewFor(voters[4].id).interrogation;
  assert.equal(poll.needed, 4, 'more than half of 6');
  assert.equal(poll.votes[suspect.id], 3, 'counts, never names');
  assert.equal(poll.yourVote, null);
  game.vote(voters[3].id, suspect.id); // changes their vote
  game.vote(voters[4].id, suspect.id);
  game.vote(voters[4].id, null); // and takes it back: still 4
  assert.equal(game.viewFor(host.id).interrogation.votes[suspect.id], 4);

  game.advance(); // choose
  assert.equal(game.interrogated, suspect.id);
  assert.equal(game.viewFor(suspect.id).you.interrogated, true);
  assert.equal(game.viewFor(host.id).interrogation.playerId, suspect.id, 'everyone knows who');
  assert.throws(() => game.choose(suspect.id, [voters[0].id]), { code: 'INTERROGATED' });
  assert.throws(() => game.choose(voters[0].id, [suspect.id]), { code: 'BAD_TARGET' });
  chooseAll(game);
  assert.ok(game.everyoneChose, 'nobody waits for the one in interrogation');
  game.advance(); // lights
  assert.deepEqual(shownTo(game, suspect), [], 'they see no card');
  for (const p of voters) assert.ok(!shownTo(game, p).includes(suspect.id), `${p.name} doesn't see theirs`);
  assert.equal(game.viewers.has(suspect.id), false, 'and nobody holds it');
  game.advance(); // talk
  assert.deepEqual(game.viewFor(suspect.id).you.sees, []);
  game.advance(); // cell
  assert.throws(() => game.useLifeline(suspect.id), { code: 'INTERROGATED' });
  for (const p of game.alivePlayers) game.answer(p.id, p.id === suspect.id ? wrongSuit(p.suit) : p.suit);
  game.advance(); // reveal
  assert.equal(suspect.alive, false);

  game.advance(); // turn 3: once a game
  assert.equal(game.interrogated, null);
  assert.equal(game.interrogationOpen, false);
  assert.equal(game.viewFor(host.id).interrogation.used, true);
});

test('a private message is at most 10 words; a suit symbol counts as one', () => {
  const { game, host } = setup(5);
  start(game, host);
  const [a, b] = game.activePlayers;
  assert.throws(
    () => game.sendMessage(a.id, b.id, 'one two three four five six seven eight nine ten eleven'),
    { code: 'TOO_MANY_WORDS' },
  );
  assert.equal(game.sendMessage(a.id, b.id, 'You have ♥ trust me').text, 'You have ♥ trust me');
});
