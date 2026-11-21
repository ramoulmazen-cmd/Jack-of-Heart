import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CARDS_PER_VIEWER,
  MAX_CHOSEN,
  VIEWERS_PER_CARD,
  assignViewers,
  cardsSeenBy,
  otherViewer,
  pairViewers,
  resolveChoices,
} from '../src/viewers.js';

const players = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
const fair = (n) => Math.floor(Math.random() * n);

/** Lock-ins like real players make them: random rankings of 1-3 people, some never lock in. */
function randomLocks(alive) {
  const locks = new Map();
  for (const id of [...alive].sort(() => Math.random() - 0.5)) {
    if (Math.random() < 0.2) continue;
    const others = alive.filter((t) => t !== id).sort(() => Math.random() - 0.5);
    locks.set(id, others.slice(0, alive.length >= 5 ? 1 + fair(3) : 1));
  }
  return locks;
}

function checkExactlyTwo(alive, viewers) {
  const seen = cardsSeenBy(viewers);
  for (const id of alive) {
    const { picked, random } = viewers.get(id);
    assert.ok(picked && random, `${id} has two viewers`);
    assert.notEqual(picked, random, `${id}'s two viewers are different people`);
    assert.ok(picked !== id && random !== id, `${id} never sees their own card`);
    assert.equal(seen.get(id)?.length ?? 0, CARDS_PER_VIEWER, `${id} sees exactly ${CARDS_PER_VIEWER} cards`);
  }
}

test('first come, first served: the 2 fastest get the person, the next gets their 2nd choice', () => {
  const alive = players(6);
  const locks = new Map([
    ['p1', ['p0', 'p2']],
    ['p2', ['p0']],
    ['p3', ['p0', 'p5', 'p4']],
    ['p4', ['p0', 'p5', 'p1']],
    ['p5', ['p0', 'p5', 'p1']],
  ]);
  const result = resolveChoices(alive, locks);
  assert.deepEqual(result.get('p1'), { viewer: 'p0', rank: 1 });
  assert.deepEqual(result.get('p2'), { viewer: 'p0', rank: 1 });
  assert.deepEqual(result.get('p3'), { viewer: 'p5', rank: 2 }, 'p0 was full');
  assert.deepEqual(result.get('p4'), { viewer: 'p5', rank: 2 });
  assert.deepEqual(result.get('p5'), { viewer: 'p1', rank: 3 }, 'p0 full, and you never get yourself');
  assert.equal(result.get('p0').rank, 0, 'p0 never locked in, so the app picked for them');
  assert.notEqual(result.get('p0').viewer, 'p0');
  for (const id of alive) assert.ok([...result.values()].filter((c) => c.viewer === id).length <= MAX_CHOSEN);
});

test('picked for you only uses room nobody asked for, and skips players who left', () => {
  const alive = ['a', 'b', 'c', 'd'];
  // "gone" left the game; "a" asked for them first, then "b".
  const locks = new Map([
    ['a', ['gone', 'b']],
    ['c', ['b']],
    ['d', ['b']], // b is full after a and c
  ]);
  for (let i = 0; i < 200; i += 1) {
    const result = resolveChoices(alive, locks);
    assert.deepEqual(result.get('a'), { viewer: 'b', rank: 2 });
    assert.deepEqual(result.get('c'), { viewer: 'b', rank: 1 });
    assert.equal(result.get('d').rank, 0);
    assert.ok(['a', 'c'].includes(result.get('d').viewer), 'd gets someone with room, never b or themselves');
    assert.equal(result.get('b').rank, 0);
    assert.notEqual(result.get('b').viewer, 'b');
  }
});

test('every card is seen by exactly 2 people and everyone sees exactly 2, for every size, every time', () => {
  for (let n = 3; n <= 20; n += 1) {
    for (let trial = 0; trial < 300; trial += 1) {
      const alive = players(n);
      const choices = resolveChoices(alive, randomLocks(alive));
      const viewers = assignViewers(alive, choices);
      checkExactlyTwo(alive, viewers);
      for (const id of alive) assert.equal(viewers.get(id).picked, choices.get(id).viewer, 'your choice is kept');
    }
  }
  assert.equal(VIEWERS_PER_CARD, 2);
});

test('even without a single lucky draw, the matching fallback keeps the rules', () => {
  for (let n = 3; n <= 20; n += 1) {
    for (let trial = 0; trial < 50; trial += 1) {
      const alive = players(n);
      checkExactlyTwo(alive, assignViewers(alive, resolveChoices(alive, randomLocks(alive)), undefined, 0));
    }
  }
});

/** Every valid arrangement of the random viewers, found by brute force. */
function validArrangements(alive, choices) {
  const picked = (id) => choices.get(id).viewer;
  const seats = alive.flatMap((v) => {
    const taken = alive.filter((t) => picked(t) === v).length;
    return Array(CARDS_PER_VIEWER - taken).fill(v);
  });
  const found = new Set();
  const walk = (left, chosen) => {
    if (chosen.length === alive.length) {
      found.add(chosen.join(','));
      return;
    }
    const target = alive[chosen.length];
    left.forEach((v, i) => {
      if (v === target || v === picked(target)) return;
      walk([...left.slice(0, i), ...left.slice(i + 1)], [...chosen, v]);
    });
  };
  walk(seats, []);
  return found;
}

test('the random viewers are a fair draw: every arrangement that follows the rules is equally likely', () => {
  const setups = [
    // Everyone trusts the next player round the table.
    new Map(players(5).map((id, i, all) => [id, { viewer: all[(i + 1) % 5], rank: 1 }])),
    // Lopsided: p0 and p4 are both full, p2 and p5 were chosen by nobody.
    new Map([
      ['p0', { viewer: 'p1', rank: 1 }],
      ['p1', { viewer: 'p0', rank: 1 }],
      ['p2', { viewer: 'p0', rank: 1 }],
      ['p3', { viewer: 'p4', rank: 1 }],
      ['p4', { viewer: 'p3', rank: 1 }],
      ['p5', { viewer: 'p4', rank: 1 }],
    ]),
  ];
  for (const choices of setups) {
    const alive = [...choices.keys()];
    const valid = validArrangements(alive, choices);
    const counts = new Map();
    const draws = valid.size * 1000;
    for (let i = 0; i < draws; i += 1) {
      const viewers = assignViewers(alive, choices);
      const key = alive.map((id) => viewers.get(id).random).join(',');
      assert.ok(valid.has(key), `drew an arrangement that breaks the rules: ${key}`);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    assert.equal(counts.size, valid.size, 'every valid arrangement shows up');
    for (const [key, count] of counts) {
      assert.ok(Math.abs(count - 1000) < 150, `${key} came up ${count} times out of an expected 1000`);
    }
  }
});

test('you can see who else holds each of your cards', () => {
  const alive = players(6);
  const viewers = assignViewers(alive, resolveChoices(alive, randomLocks(alive)));
  for (const [viewer, targets] of cardsSeenBy(viewers)) {
    for (const target of targets) {
      const other = otherViewer(viewers, target, viewer);
      assert.ok(other && other !== viewer && other !== target);
      assert.equal(otherViewer(viewers, target, other), viewer, 'it works both ways');
    }
  }
  assert.equal(otherViewer(viewers, 'p0', 'p0'), null, 'not a viewer of your own card');
});

test('with only 2 players left in the room, each simply sees the other', () => {
  const alive = ['a', 'b'];
  const viewers = assignViewers(alive, resolveChoices(alive, new Map()));
  assert.deepEqual(viewers.get('a'), { picked: 'b', random: null, rank: 0 });
  assert.deepEqual(viewers.get('b'), { picked: 'a', random: null, rank: 0 });
});

// ---- 4 or fewer players: 1 and 1 (pairViewers).

function checkExactlyOne(alive, viewers) {
  const seen = cardsSeenBy(viewers);
  for (const id of alive) {
    const { picked, random } = viewers.get(id);
    assert.ok(picked && picked !== id, `${id}'s card has one viewer, never ${id}`);
    assert.equal(random, null, 'no second viewer');
    assert.equal(seen.get(id)?.length ?? 0, 1, `${id} sees exactly 1 card`);
    assert.equal(otherViewer(viewers, id, picked), null, 'nobody else holds that card');
  }
}

test('with 4 or fewer, the fastest gets the person, and nobody is left seeing their own card', () => {
  const four = ['a', 'b', 'c', 'd'];
  const mutual = pairViewers(four, new Map([['a', ['b']], ['b', ['a']], ['c', ['d']], ['d', ['c']]]));
  checkExactlyOne(four, mutual);
  for (const [id, want] of [['a', 'b'], ['b', 'a'], ['c', 'd'], ['d', 'c']]) {
    assert.deepEqual(mutual.get(id), { picked: want, random: null, rank: 1 });
  }

  const race = pairViewers(four, new Map([['a', ['b']], ['c', ['b']]]));
  checkExactlyOne(four, race);
  assert.equal(race.get('a').picked, 'b', 'a locked in first and gets b');
  assert.notEqual(race.get('c').picked, 'b', 'c was too slow');
  assert.equal(race.get('c').rank, 0, 'so c is picked for');

  // The corner a greedy pass walks into: b getting a would leave c's card to c alone.
  const three = ['a', 'b', 'c'];
  const corner = pairViewers(three, new Map([['a', ['b']], ['b', ['a']], ['c', ['a']]]));
  checkExactlyOne(three, corner);
  assert.deepEqual(corner.get('a'), { picked: 'b', random: null, rank: 1 });
  assert.deepEqual(corner.get('b'), { picked: 'c', random: null, rank: 0 });
  assert.deepEqual(corner.get('c'), { picked: 'a', random: null, rank: 1 });
});

test('with 4 or fewer, every pairing is 1 and 1 and the first to lock in always gets their choice', () => {
  for (const n of [2, 3, 4]) {
    const alive = players(n);
    for (let round = 0; round < 3000; round++) {
      const locks = randomLocks(alive);
      const viewers = pairViewers(alive, locks);
      checkExactlyOne(alive, viewers);
      const [first] = locks.keys();
      if (first) assert.equal(viewers.get(first).picked, locks.get(first)[0]);
    }
  }
  assert.deepEqual(pairViewers(['solo'], new Map()).get('solo'), { picked: null, random: null, rank: 0 });
});

test('with 4 or fewer and nobody choosing, every pairing is equally likely', () => {
  const alive = players(4);
  const counts = new Map();
  const draws = 9000;
  for (let i = 0; i < draws; i++) {
    const viewers = pairViewers(alive, new Map());
    const key = alive.map((id) => viewers.get(id).picked).join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 9, 'all 9 ways for 4 people to see someone else');
  const expected = draws / 9;
  const chi = [...counts.values()].reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
  assert.ok(chi < 30, `uneven pairings: chi-square ${chi.toFixed(1)}`);
});

test('a fake random function makes the result fully predictable', () => {
  const alive = players(6);
  const locks = new Map(alive.map((id, i) => [id, [alive[(i + 1) % 6]]]));
  const alwaysFirst = () => 0;
  const a = assignViewers(alive, resolveChoices(alive, locks, alwaysFirst), alwaysFirst);
  const b = assignViewers(alive, resolveChoices(alive, locks, alwaysFirst), alwaysFirst);
  assert.deepEqual([...a], [...b]);
});
