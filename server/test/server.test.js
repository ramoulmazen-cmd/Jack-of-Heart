import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { io as connect } from 'socket.io-client';
import { createGameServer } from '../src/app.js';
import { SUITS } from '../src/game.js';

let server;
let url;
const clients = [];

before(async () => {
  // 0.05: choosing lasts 1 s, the lights 0.15 s (5 players), the reveal 0.4 s.
  server = createGameServer({ timeScale: 0.05, lanAddresses: () => ['192.168.77.7'] });
  await new Promise((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${server.httpServer.address().port}`;
});

after(async () => {
  for (const c of clients) c.socket.disconnect();
  await server.close();
});

function player() {
  const socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const client = { socket, state: null, received: [], waiters: [], events: [], messages: [] };
  socket.onAny((event) => client.events.push(event));
  socket.on('chat:message', (message) => client.messages.push(message));
  socket.on('state', (state) => {
    client.state = state;
    client.received.push(state);
    client.waiters = client.waiters.filter(({ matches, resolve }) => {
      if (!matches(state)) return true;
      resolve(state);
      return false;
    });
  });
  clients.push(client);
  return client;
}

const call = (client, event, payload = {}) => client.socket.timeout(2000).emitWithAck(event, payload);

function waitFor(client, matches, ms = 4000) {
  if (client.state && matches(client.state)) return Promise.resolve(client.state);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for state')), ms);
    client.waiters.push({
      matches,
      resolve: (state) => {
        clearTimeout(timer);
        resolve(state);
      },
    });
  });
}

const stateOf = (client, phase, turn) => client.received.find((s) => s.phase === phase && s.turn === turn);
const withCards = (state) =>
  state.players
    .filter((p) => p.suit)
    .map((p) => p.id)
    .sort();

/** What an honest player would tell each other player: their card as it lit up during the lights. */
function truthFromLights(group, turn) {
  const truth = new Map();
  for (const viewer of group) {
    for (const p of stateOf(viewer, 'lights', turn).players) {
      // Only real suits: on the Jack's colour or blank turns his phone shows 'red', 'black' or 'blank'.
      if (SUITS.includes(p.suit)) truth.set(p.id, p.suit);
    }
  }
  return truth;
}

test('a full game over real sockets: ranked choices, the glimpse, your 2 cards, lifeline, reconnect, blackout, the Jack dies', async () => {
  const host = player();
  const others = [player(), player(), player(), player()];
  const everyone = [host, ...others];
  const [c1, c2, c3, c4] = others;

  const created = await call(host, 'room:create', { name: 'Host' });
  assert.equal(created.ok, true);
  Object.assign(host, { id: created.playerId, token: created.token });
  for (const [i, c] of others.entries()) {
    const res = await call(c, 'room:join', { code: created.code.toLowerCase(), name: `Friend ${i}` });
    assert.equal(res.ok, true, res.message);
    Object.assign(c, { id: res.playerId, token: res.token });
  }

  await call(host, 'game:settings', { discussionSeconds: 3600, answerSeconds: 300 });
  assert.equal((await call(host, 'game:start')).ok, true);
  // Keep this game deadly and the Jack's sight normal: the rules tests cover the safe turn and his
  // colour and blank turns.
  const started = server.rooms.get(created.code).game;
  started.safeTurn = null;
  started.colorTurnSet = new Set();
  started.blankTurnSet = new Set();
  await Promise.all(everyone.map((c) => waitFor(c, (s) => s.phase === 'choose' && s.turn === 1)));
  const jack = everyone.find((c) => c.state.you.isJack);
  assert.equal(host.state.maxChoices, 3, '5 players: rank up to 3');

  // Turn 1: the 2 fastest to choose the host get the host; the third gets their 2nd choice.
  const choose = (c, ranking) => call(c, 'turn:choose', { ranking: ranking.map((x) => x.id) });
  assert.equal((await choose(c1, [host])).ok, true);
  assert.equal((await choose(c2, [host, c1])).ok, true);
  assert.equal((await choose(c3, [host, c4, c1])).ok, true);
  assert.equal((await choose(c3, [c1])).error, 'LOCKED');
  assert.equal((await choose(c4, [c4])).error, 'BAD_TARGET');
  assert.equal((await choose(c4, [c1])).ok, true);
  assert.equal((await choose(host, [c2])).ok, true); // last lock-in: the lights come on
  await Promise.all(everyone.map((c) => waitFor(c, (s) => s.phase === 'discussion' && s.turn === 1, 10000)));

  for (const c of everyone) {
    const briefing = stateOf(c, 'briefing', 1);
    const lights = stateOf(c, 'lights', 1);
    const talk = stateOf(c, 'discussion', 1);
    assert.deepEqual(withCards(briefing), [], 'the briefing shows no suit');
    assert.deepEqual([...briefing.you.sees].sort(), [...talk.you.sees].sort(), 'but whose cards you will hold');
    assert.deepEqual(briefing.you.viewers, talk.you.viewers, 'and who holds yours');
    const othersIds = everyone.filter((o) => o !== c).map((o) => o.id).sort();
    assert.deepEqual(withCards(lights), othersIds, 'the lights show every card but yours');
    assert.deepEqual(withCards(talk), [...talk.you.sees].sort(), 'the talk keeps only your 2 cards');
    assert.equal(talk.you.sees.length, 2);
    for (const id of talk.you.sees) {
      assert.equal(talk.players.find((p) => p.id === id).suit, lights.players.find((p) => p.id === id).suit);
      const other = everyone.find((o) => o.id === talk.you.sharedWith[id]);
      assert.equal(stateOf(other, 'discussion', 1).you.sharedWith[id], c.id, 'you and the other holder see each other');
    }
    assert.ok(talk.you.viewers.picked && talk.you.viewers.random);
  }
  assert.deepEqual(
    [stateOf(c1, 'discussion', 1).you.viewers.picked, stateOf(c1, 'discussion', 1).you.viewers.rank],
    [host.id, 1],
  );
  assert.deepEqual(
    [stateOf(c3, 'discussion', 1).you.viewers.picked, stateOf(c3, 'discussion', 1).you.viewers.rank],
    [c4.id, 2],
    'the host was full, so c3 got their 2nd choice',
  );

  const truth = truthFromLights(everyone, 1);
  assert.equal(truth.size, everyone.length);
  const peeker = others.find((c) => c !== jack);
  assert.equal((await call(peeker, 'turn:lifeline')).error, 'WRONG_PHASE', 'no lifeline during the talk');

  // Everyone honest: nobody dies. In the cell, the lifeline answers only the caller, once.
  assert.equal((await call(host, 'game:skip')).ok, true);
  await Promise.all(everyone.map((c) => waitFor(c, (s) => s.phase === 'confinement')));
  const peek = await call(peeker, 'turn:lifeline');
  assert.deepEqual(peek, { ok: true, suit: truth.get(peeker.id) });
  assert.equal((await call(peeker, 'turn:lifeline')).error, 'LIFELINE_USED');
  for (const c of everyone) assert.equal((await call(c, 'turn:answer', { suit: truth.get(c.id) })).ok, true);
  const reveal1 = await waitFor(host, (s) => s.phase === 'reveal' && s.turn === 1);
  assert.deepEqual(reveal1.deaths, []);

  // Turn 2 starts with choosing; nobody chooses in time, so the server picks for everyone. Then
  // the lights, and the 45-second briefing (here 2.25 s), every turn.
  await waitFor(host, (s) => s.phase === 'choose' && s.turn === 2);
  const briefing2 = await waitFor(host, (s) => s.phase === 'briefing' && s.turn === 2, 4000);
  assert.ok(Math.abs(briefing2.phaseEndsAt - briefing2.serverNow - 45 * 1000 * 0.05) < 100, 'a 45-second briefing');
  await Promise.all(everyone.map((c) => waitFor(c, (s) => s.phase === 'discussion' && s.turn === 2, 10000)));
  const truth2 = truthFromLights(everyone, 2);
  assert.equal(truth2.size, everyone.length);
  for (const c of everyone) assert.equal(c.state.you.viewers.autoPicked, true);

  // A phone drops and comes back: an impostor is refused, the real player gets their seat back.
  const flaky = others.find((c) => c !== jack);
  const impostor = await call(player(), 'room:resume', { code: created.code, playerId: flaky.id, token: 'nope' });
  assert.equal(impostor.error, 'SESSION_EXPIRED');
  flaky.socket.disconnect();
  await waitFor(host, (s) => s.players.find((p) => p.id === flaky.id)?.connected === false);
  const revived = player();
  const resumed = await call(revived, 'room:resume', { code: created.code, playerId: flaky.id, token: flaky.token });
  assert.equal(resumed.ok, true, resumed.message);
  await waitFor(revived, (s) => s.phase === 'discussion' && s.turn === 2 && s.you.id === flaky.id);
  await waitFor(host, (s) => s.players.find((p) => p.id === flaky.id)?.connected === true);
  revived.id = flaky.id;
  const active = everyone.map((c) => (c === flaky ? revived : c));

  // The Jack blacks out this turn's cell. Only the Jack's phone hears anything about it:
  // even an empty update to everyone else would tell them something just happened.
  const bystander = active.find((c) => c !== jack);
  assert.equal((await call(bystander, 'turn:blackout')).error, 'NOT_ALLOWED');
  assert.equal(jack.state.you.blackout, 'ready');
  const heardBefore = active.map((c) => c.received.length);
  assert.equal((await call(jack, 'turn:blackout')).ok, true);
  await waitFor(jack, (s) => s.you.blackout === 'on');
  await new Promise((resolve) => setTimeout(resolve, 150));
  active.forEach((c, i) => {
    if (c !== jack) assert.equal(c.received.length, heardBefore[i], 'nobody else is sent anything');
  });

  // In the cell: an untouched lifeline fails and is lost; the Jack's works.
  await call(host, 'game:skip');
  await Promise.all(active.map((c) => waitFor(c, (s) => s.phase === 'confinement' && s.turn === 2)));
  const victim = active.find((c) => c !== jack && c.id !== peeker.id);
  assert.deepEqual(await call(victim, 'turn:lifeline'), { ok: true, blackout: true });
  assert.equal((await call(victim, 'turn:lifeline')).error, 'LIFELINE_USED');
  assert.deepEqual(await call(jack, 'turn:lifeline'), { ok: true, suit: truth2.get(jack.id) });

  // The Jack's viewers lie to him; everyone else is honest. The Jack dies.
  for (const c of active) {
    const told = truth2.get(c.id);
    const res = await call(c, 'turn:answer', { suit: c === jack ? SUITS.find((s) => s !== told) : told });
    assert.equal(res.ok, true, res.message);
  }
  const reveal2 = await waitFor(host, (s) => s.phase === 'reveal' && s.turn === 2);
  assert.deepEqual(reveal2.deaths.map((d) => d.id), [jack.id]);
  const over = await waitFor(host, (s) => s.phase === 'over');
  assert.equal(over.result.winner, 'players');
  assert.equal(over.result.jackId, jack.id);
  assert.deepEqual(over.result.blackout, { turn: 2 }, 'the end reveals the blackout, and nothing about lifelines');

  // Before the end, no phone but the Jack's (and the host's on/off switch) ever mentioned it.
  for (const c of active) {
    if (c === jack) continue;
    for (const s of c.received) {
      if (s.phase === 'over') continue;
      const json = JSON.stringify(s);
      if (c === host) assert.ok(!json.includes('"blackout":"'), 'the host sees the switch, nothing more');
      else assert.ok(!json.includes('blackout'), `${s.you.name}'s phone heard about the blackout`);
    }
  }

  // The core guarantee, against every state every client received: never your own card,
  // only your 2 cards during the talk, and nobody's card outside the lights and the talk.
  let checked = 0;
  for (const c of [...active, flaky]) {
    for (const s of c.received) {
      assert.equal(s.players.find((p) => p.id === s.you.id).suit, null, `${s.you.name} received their own card`);
      if (s.phase === 'discussion') assert.deepEqual(withCards(s), [...s.you.sees].sort());
      else if (s.phase !== 'lights') assert.deepEqual(withCards(s), [], `a card leaked during ${s.phase}`);
      checked++;
    }
  }
  assert.ok(checked > 40, `only ${checked} states were checked`);

  assert.equal((await call(host, 'game:reset')).ok, true);
  await waitFor(host, (s) => s.phase === 'lobby');
});

test('private chat: only the two players hear a message, and nobody else is sent anything', async () => {
  const table = [player(), player(), player(), player()];
  const [a, b, c, d] = table;
  const created = await call(a, 'room:create', { name: 'A' });
  a.id = created.playerId;
  for (const [i, p] of [b, c, d].entries()) {
    const res = await call(p, 'room:join', { code: created.code, name: `Chat ${i}` });
    p.id = res.playerId;
  }
  assert.equal((await call(a, 'chat:send', { to: b.id, text: 'too early' })).error, 'CHAT_CLOSED');
  await call(a, 'game:start');
  await Promise.all(table.map((p) => waitFor(p, (s) => s.phase === 'choose')));
  await new Promise((resolve) => setTimeout(resolve, 100));

  const heardBefore = table.map((p) => p.events.length);
  const sent = await call(a, 'chat:send', { to: b.id, text: 'I see your card. Trust me.' });
  assert.equal(sent.ok, true, sent.message);
  assert.equal(sent.message.text, 'I see your card. Trust me.');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(b.messages.map((m) => [m.from, m.to, m.text]), [[a.id, b.id, 'I see your card. Trust me.']]);
  assert.deepEqual(b.events.slice(heardBefore[1]), ['chat:message'], 'the receiver gets the message, no state');
  assert.equal(a.events.length, heardBefore[0], 'the sender only gets the reply');
  assert.equal(c.events.length, heardBefore[2], 'nobody else is sent anything');
  assert.equal(d.events.length, heardBefore[3], 'nobody else is sent anything');

  await call(b, 'chat:send', { to: a.id, text: 'Sure.' });
  const history = await call(b, 'chat:history');
  assert.deepEqual(history.messages.map((m) => m.text), ['I see your card. Trust me.', 'Sure.']);
  assert.deepEqual((await call(c, 'chat:history')).messages, []);
  assert.equal((await call(a, 'chat:send', { to: a.id, text: 'me' })).error, 'BAD_TARGET');
  assert.equal((await call(a, 'chat:send', { to: 'nobody', text: 'x' })).error, 'BAD_TARGET');
  assert.equal((await call(a, 'chat:send', { to: b.id, text: '' })).error, 'EMPTY_MESSAGE');
  assert.equal((await call(a, 'chat:send', { to: b.id })).error, 'EMPTY_MESSAGE');
});

test('the host can close the room: every other phone is sent home, and the room is gone', async () => {
  const table = [player(), player(), player()];
  const [host, b, c] = table;
  const created = await call(host, 'room:create', { name: 'Closer' });
  for (const [i, p] of [b, c].entries()) await call(p, 'room:join', { code: created.code, name: `Guest ${i}` });
  assert.equal((await call(b, 'room:close')).error, 'NOT_HOST', 'only the host can close it');
  await call(host, 'game:start');
  await Promise.all(table.map((p) => waitFor(p, (s) => s.phase === 'choose')));

  assert.equal((await call(host, 'room:close')).ok, true, 'even in the middle of a game');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(b.events.includes('closed') && c.events.includes('closed'), 'everyone else is told');
  assert.equal(host.events.includes('closed'), false, 'the host just gets the reply');
  assert.equal(server.rooms.has(created.code), false, 'the room is gone');
  assert.equal((await call(b, 'turn:choose', { ranking: [] })).error, 'NOT_IN_ROOM');
  const resumed = await call(c, 'room:resume', { code: created.code, playerId: 'x', token: 'y' });
  assert.equal(resumed.error, 'SESSION_EXPIRED', 'a phone waking up later finds no game');
});

test('when the last player everyone is waiting for leaves, the turn goes on without the clock', async () => {
  const table = [player(), player(), player(), player()];
  const [a, b, c, d] = table;
  const created = await call(a, 'room:create', { name: 'Wait A' });
  a.id = created.playerId;
  for (const [i, p] of [b, c, d].entries()) p.id = (await call(p, 'room:join', { code: created.code, name: `Wait ${i}` })).playerId;
  await call(a, 'game:start');
  await Promise.all(table.map((p) => waitFor(p, (s) => s.phase === 'choose' && s.turn === 1)));
  await call(a, 'turn:choose', { ranking: [b.id] });
  await call(b, 'turn:choose', { ranking: [c.id] });
  await call(c, 'turn:choose', { ranking: [a.id] });
  const left = Date.now();
  await call(d, 'room:leave');
  await waitFor(a, (s) => s.phase === 'lights', 2000);
  assert.ok(Date.now() - left < 500, 'the lights came on right away, not when the choosing clock ran out');
});

test('mugshots: upload over the socket, everyone sees the new version, the image comes over HTTP', async () => {
  const a = player();
  const b = player();
  const created = await call(a, 'room:create', { name: 'Pic' });
  const joined = await call(b, 'room:join', { code: created.code, name: 'Viewer' });
  assert.equal(joined.ok, true);
  const jpeg = Buffer.alloc(4000, 9);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(jpeg);
  const res = await call(a, 'player:photo', { photo: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
  assert.equal(res.ok, true, res.message);
  const seen = await waitFor(b, (s) => s.players.find((p) => p.id === created.playerId)?.photo > 0);
  const version = seen.players.find((p) => p.id === created.playerId).photo;
  assert.equal(seen.joinUrl, `${url.replace('localhost', '192.168.77.7')}`, 'the lobby can show where friends join');

  const http = await fetch(`${url}/photo/${created.code}/${created.playerId}?v=${version}`);
  assert.equal(http.status, 200);
  assert.equal(http.headers.get('content-type'), 'image/jpeg');
  assert.equal(http.headers.get('x-content-type-options'), 'nosniff');
  assert.match(http.headers.get('cache-control'), /immutable/, 'each version is cached for good');
  assert.deepEqual(Buffer.from(await http.arrayBuffer()), jpeg);
  assert.equal((await fetch(`${url}/photo/${created.code}/${joined.playerId}`)).status, 404);
  assert.equal((await fetch(`${url}/photo/NOPE/${created.playerId}`)).status, 404);

  const bad = await call(a, 'player:photo', { photo: 'data:image/svg+xml;base64,PHN2Zz4=' });
  assert.equal(bad.error, 'BAD_PHOTO');
  assert.equal((await call(a, 'player:photo', { photo: null })).ok, true);
  await waitFor(b, (s) => s.players.find((p) => p.id === created.playerId)?.photo === 0);
});

test('bad input gets a clean error instead of crashing the server', async () => {
  const c = player();
  assert.equal((await call(c, 'room:join', { code: 'ZZZZ', name: 'X' })).error, 'NO_ROOM');
  assert.equal((await call(c, 'room:create', { name: 42 })).error, 'BAD_NAME');
  assert.equal((await call(c, 'turn:answer', { suit: 'hearts' })).error, 'NOT_IN_ROOM');
  assert.equal((await call(c, 'turn:choose', { ranking: 'x' })).error, 'NOT_IN_ROOM');
  assert.equal((await call(c, 'turn:lifeline')).error, 'NOT_IN_ROOM');
  assert.equal((await call(c, 'turn:blackout')).error, 'NOT_IN_ROOM');
  assert.equal((await call(c, 'player:photo', { photo: null })).error, 'NOT_IN_ROOM');
  assert.equal((await call(c, 'chat:send', { to: 'x', text: 'hi' })).error, 'NOT_IN_ROOM');
  assert.equal((await call(c, 'chat:history')).error, 'NOT_IN_ROOM');
  assert.equal((await call(c, 'room:resume', null)).error, 'SESSION_EXPIRED');
  c.socket.emit('game:start'); // no ack callback at all
  const health = await fetch(`${url}/health`).then((r) => r.json());
  assert.equal(health.ok, true);
});
