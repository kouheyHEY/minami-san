// game-server の共通 Edge Function から使うルール定義。
// game-server/supabase/functions/game-rooms/rules/minami-san/ へ engine.js と一緒にコピーして使う。
import { MAX_PLAYERS, MIN_PLAYERS, createGame as createMatch, play, rematch, viewFor } from './engine.js';

// 2〜5人。席が埋まるのを待たず、部屋をつくった人が始める。
export const seatCount = MAX_PLAYERS;
export const minSeats = MIN_PLAYERS;

export function createGame({ names, random = Math.random, options } = {}) {
  return createMatch(names, { rule: options?.rule === 'short' ? 'short' : 'normal', random });
}

export function canAct(state, seat, action) {
  if (!Number.isInteger(seat) || seat < 0 || seat >= (state.players?.length ?? 0)) return false;
  if (action?.type === 'rematch') return state.status === 'finished';
  return action?.type === 'play' && state.status === 'playing' && state.currentPlayer === seat;
}

export function applyAction(state, action, { random = Math.random } = {}) {
  if (action?.type === 'rematch') return rematch(state, random);
  if (action?.type === 'play') {
    return play(state, { cardId: String(action.cardId ?? ''), discard: action.discard === true }, random);
  }
  throw new Error('Unknown action.');
}

// 手札は持ち主にだけ、山札の中身は誰にも見せない。
export function viewState(state, seat) {
  if (state?.status !== 'playing' && state?.status !== 'finished') return state;
  return viewFor(state, seat);
}
