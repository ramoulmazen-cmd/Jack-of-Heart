import { randomInt } from 'node:crypto';

/**
 * From 5 players: every card is seen by exactly 2 people, and everyone sees exactly 2 cards.
 * (With 4 or fewer it's 1 and 1: see pairViewers.)
 */
export const VIEWERS_PER_CARD = 2;
export const CARDS_PER_VIEWER = 2;
/** So nobody can be chosen by more than 2 people: the 2 fastest get them. */
export const MAX_CHOSEN = CARDS_PER_VIEWER;
const MAX_ATTEMPTS = 20000;

/**
 * First come, first served. `locks` is a Map<playerId, ranking> in the order the server
 * received the lock-ins (a Map keeps insertion order). Each player gets their highest-ranked
 * choice that fewer than MAX_CHOSEN people already got.
 *
 * Players who didn't lock in, or whose choices were all taken, are handled after every real
 * choice, so a lucky random fill can never take a seat someone actually asked for. They get
 * someone with room left, at random ("picked for you").
 *
 * Returns Map<playerId, { viewer, rank }>: rank 1-3 is which choice they got, 0 is picked for you.
 */
export function resolveChoices(alive, locks, rng = randomInt) {
  const chosenBy = new Map(alive.map((id) => [id, 0]));
  const result = new Map();
  const give = (id, viewer, rank) => {
    result.set(id, { viewer, rank });
    chosenBy.set(viewer, chosenBy.get(viewer) + 1);
  };

  for (const [id, ranking] of locks) {
    if (!chosenBy.has(id) || result.has(id)) continue;
    const index = ranking.findIndex((v) => v !== id && chosenBy.has(v) && chosenBy.get(v) < MAX_CHOSEN);
    if (index !== -1) give(id, ranking[index], index + 1);
  }

  for (const id of shuffle(alive.filter((p) => !result.has(p)), rng)) {
    // Never empty with 2+ players: for everyone else to be full, they'd need twice as many
    // choices as there are other players.
    const options = alive.filter((v) => v !== id && chosenBy.get(v) < MAX_CHOSEN);
    if (options.length) give(id, options[rng(options.length)], 0);
  }
  return result;
}

/**
 * Adds everyone's second, random viewer, so each card is seen by exactly 2 people and each
 * player sees exactly 2 cards.
 *
 * Someone chosen by 2 people already sees 2 cards: no room left. Someone chosen by nobody has
 * room for 2. The random viewers fill exactly that room: one free seat per player.
 *
 * The draw is uniform. Shuffle the free seats and hand them out; if a card lands on its own
 * owner, or on the person who already sees it, throw the whole draw away and redo it. Every
 * arrangement is equally likely and only broken ones are thrown out, so every arrangement
 * that follows the rules is equally likely. A valid arrangement always exists with 3 or more
 * players (Hall's marriage theorem), and a random draw is valid often enough that this takes a
 * few tries. The matching fallback only exists so the code can never get stuck.
 *
 * Returns Map<targetId, { picked, random, rank }>: who can see each player's card.
 */
export function assignViewers(alive, choices, rng = randomInt, attempts = MAX_ATTEMPTS) {
  const picked = (id) => choices.get(id)?.viewer ?? null;
  const build = (randomOf) =>
    new Map(alive.map((id, i) => [id, { picked: picked(id), random: randomOf(i), rank: choices.get(id)?.rank ?? 0 }]));

  // With fewer than 3 players left in the room there is nobody to add.
  if (alive.length < 3) return build(() => null);

  const seats = [];
  for (const v of alive) {
    const taken = alive.filter((t) => picked(t) === v).length;
    for (let k = taken; k < CARDS_PER_VIEWER; k += 1) seats.push(v);
  }
  const allowed = (target, viewer) => viewer !== target && viewer !== picked(target);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const draw = shuffle(seats, rng);
    if (alive.every((target, i) => allowed(target, draw[i]))) return build((i) => draw[i]);
  }
  const matched = matchSeats(alive, seats, allowed);
  return build((i) => matched[i]);
}

/**
 * Small games (4 or fewer players): every card is seen by exactly 1 person and everyone sees
 * exactly 1 card. That person is the one you chose, if you win the race for them.
 *
 * It's the same first come, first served, with room for only 1 per person. But here the greedy
 * pass of resolveChoices can paint itself into a corner: with A→B, B→A and C→A, giving B their
 * A leaves C's card with nobody but C to see it. So instead we try every way to pair up the
 * table where nobody sees their own card (a "derangement": 9 of them at most, with 4 players)
 * and keep the ones that are best for the race: the first to lock in gets their choice if any
 * pairing allows it, then the second, and so on. Ties are broken at random, so "picked for
 * you" is a fair draw. In the example, A gets B, B is picked for, and C gets A.
 *
 * Returns Map<targetId, { picked, random: null, rank }>, the same shape as assignViewers.
 */
export function pairViewers(alive, locks, rng = randomInt) {
  const order = [...locks.keys()].filter((id) => alive.includes(id));
  const rankOf = (id, viewer) => (locks.get(id) ?? []).indexOf(viewer) + 1; // 0: not one of their choices
  let best = [];
  let bestScore = null;
  for (const pairing of derangements(alive)) {
    // Lower is better: for each player in lock-in order, which choice they got (5 = none).
    const score = order.map((id) => rankOf(id, pairing.get(id)) || 5);
    const versus = bestScore === null ? -1 : compareScores(score, bestScore);
    if (versus < 0) {
      best = [pairing];
      bestScore = score;
    } else if (versus === 0) {
      best.push(pairing);
    }
  }
  const pairing = best.length ? best[rng(best.length)] : new Map();
  return new Map(
    alive.map((id) => {
      const viewer = pairing.get(id) ?? null;
      return [id, { picked: viewer, random: null, rank: viewer === null ? 0 : rankOf(id, viewer) }];
    }),
  );
}

/** Every way to give each card to someone else, each person seeing exactly one card. */
function* derangements(ids, i = 0, used = new Set(), pairing = new Map()) {
  if (i === ids.length) {
    yield new Map(pairing);
    return;
  }
  for (const viewer of ids) {
    if (viewer === ids[i] || used.has(viewer)) continue;
    used.add(viewer);
    pairing.set(ids[i], viewer);
    yield* derangements(ids, i + 1, used, pairing);
    used.delete(viewer);
    pairing.delete(ids[i]);
  }
}

function compareScores(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Map<viewerId, targetId[]>: whose cards each player gets to see. */
export function cardsSeenBy(viewers) {
  const seen = new Map();
  for (const [target, { picked, random }] of viewers) {
    for (const viewer of [picked, random]) {
      if (viewer === null) continue;
      if (!seen.has(viewer)) seen.set(viewer, []);
      seen.get(viewer).push(target);
    }
  }
  return seen;
}

/** The other person who sees `targetId`'s card, besides `viewerId`. */
export function otherViewer(viewers, targetId, viewerId) {
  const entry = viewers.get(targetId);
  if (!entry) return null;
  if (entry.picked === viewerId) return entry.random;
  if (entry.random === viewerId) return entry.picked;
  return null;
}

/** Fisher-Yates on a copy: every order equally likely, given a fair rng. */
function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Augmenting-path matching of cards to free seats (Kuhn's algorithm). */
function matchSeats(alive, seats, allowed) {
  const holder = new Array(seats.length).fill(-1);
  const place = (t, visited) => {
    for (let s = 0; s < seats.length; s += 1) {
      if (visited.has(s) || !allowed(alive[t], seats[s])) continue;
      visited.add(s);
      if (holder[s] === -1 || place(holder[s], visited)) {
        holder[s] = t;
        return true;
      }
    }
    return false;
  };
  alive.forEach((_, t) => place(t, new Set()));
  const seatOf = new Array(alive.length).fill(null);
  holder.forEach((t, s) => {
    if (t !== -1) seatOf[t] = seats[s];
  });
  return seatOf;
}
