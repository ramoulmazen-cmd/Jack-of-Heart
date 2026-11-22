import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { viewersOf } from './ui';

const NOTES_KEY = 'joh.notes';
// From the briefing on, you know who holds your card.
const VISION_PHASES = ['briefing', 'lights', 'discussion', 'confinement'];

/**
 * Your private notebook for one game. For each round: what your two viewers told you your card
 * is, anything you typed, and, once the round is over, what you answered and how it went.
 *
 * It never leaves this phone (the server doesn't know it exists), it survives a reconnect or an
 * app restart, and only the current game's notebook is kept.
 */
export function useNotes(state) {
  const you = state?.you;
  const key = you ? `${state.code}:${state.gameNumber}:${you.id}` : null;
  const [book, setBook] = useState({ key: null, rounds: {} });
  const loaded = key !== null && book.key === key;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    AsyncStorage.getItem(NOTES_KEY)
      .then((raw) => JSON.parse(raw ?? 'null'))
      .catch(() => null)
      .then((saved) => {
        if (!cancelled) setBook(saved?.key === key ? saved : { key, rounds: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (book.key) AsyncStorage.setItem(NOTES_KEY, JSON.stringify(book)).catch(() => {});
  }, [book]);

  /** `change(round)` returns the fields to update, or null to leave the round alone. */
  const update = useCallback(
    (turn, change) =>
      setBook((prev) => {
        if (prev.key !== key) return prev;
        const round = prev.rounds[turn] ?? {};
        const fields = change(round);
        if (!fields) return prev;
        return { ...prev, rounds: { ...prev.rounds, [turn]: { ...round, ...fields } } };
      }),
    [key],
  );

  // Keep a copy of who saw your card (people can leave), and record how each round ended.
  const phase = state?.phase;
  const turn = state?.turn;
  const viewers = state && VISION_PHASES.includes(phase) ? viewersOf(state).map(({ id, name, how }) => ({ id, name, how })) : [];
  const viewersKey = JSON.stringify(viewers);
  // Sent into interrogation after the briefing: nobody holds your card any more, so forget who did.
  const alone = Boolean(you?.interrogated) && VISION_PHASES.includes(phase);
  const ending =
    phase === 'reveal' && you
      ? {
          answer: you.answer,
          safe: state.safe,
          result: state.safe ? you.safeResult : you.diedOnTurn === turn ? (you.answer ? 'wrong' : 'none') : 'right',
        }
      : null;
  const endingKey = JSON.stringify(ending);

  useEffect(() => {
    if (!loaded) return;
    const snapshot = JSON.parse(viewersKey);
    if (snapshot.length || alone) {
      update(turn, (round) => (JSON.stringify(round.viewers ?? []) === viewersKey ? null : { viewers: snapshot }));
    }
    const end = JSON.parse(endingKey);
    if (end) update(turn, (round) => (round.result === end.result && round.answer === end.answer ? null : end));
  }, [loaded, turn, viewersKey, alone, endingKey, update]);

  const round = (n) => (loaded ? book.rounds[n] ?? {} : {});
  return {
    loaded,
    round,
    setTold: (n, viewerId, suit) => update(n, (r) => ({ told: { ...(r.told ?? {}), [viewerId]: suit } })),
    setText: (n, text) => update(n, () => ({ text })),
    /** Rounds before round `n`, newest first. */
    earlier: (n) =>
      Object.entries(loaded ? book.rounds : {})
        .map(([k, r]) => ({ ...r, turn: Number(k) }))
        .filter((r) => r.turn < n)
        .sort((a, b) => b.turn - a.turn),
  };
}
