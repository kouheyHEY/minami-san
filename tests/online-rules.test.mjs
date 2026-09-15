import test from 'node:test';
import assert from 'node:assert/strict';

import { applyAction, canAct, cpuAction, createGame, minSeats, seatCount, viewState } from '../src/game/online-rules.js';

test('CPU の席は、自分の番のときだけ手札から出せるカードを返す', () => {
  const state = createGame({ names: ['A', 'CPU1'] });
  const turn = state.currentPlayer;
  const action = cpuAction(state, turn);
  assert.equal(action.type, 'play');
  assert.equal(canAct(state, turn, action), true);
  assert.ok(state.players[turn].hand.some((card) => card.id === action.cardId));
  assert.equal(cpuAction(state, 1 - turn), null);
  const next = applyAction(state, action, { seat: turn });
  assert.equal(next.lastPlay.player, turn);
});

test('部屋は2〜5人。部屋をつくった人が始めたときの人数で遊ぶ', () => {
  assert.equal(minSeats, 2);
  assert.equal(seatCount, 5);
  const state = createGame({ names: ['みなみ', 'ゲスト', 'もも'], options: { rule: 'short' } });
  assert.deepEqual(state.players.map((player) => player.name), ['みなみ', 'ゲスト', 'もも']);
  assert.equal(state.rule, 'short');
  assert.equal(createGame({ names: ['A', 'B'], options: { rule: 'unknown' } }).rule, 'normal');
});

test('手番の席だけがカードを使え、再戦は決着後にどの席からもできる', () => {
  const state = createGame({ names: ['A', 'B', 'C'] });
  const turn = state.currentPlayer;
  const other = (turn + 1) % 3;
  assert.equal(canAct(state, turn, { type: 'play' }), true);
  assert.equal(canAct(state, other, { type: 'play' }), false);
  assert.equal(canAct(state, 3, { type: 'play' }), false);
  assert.equal(canAct(state, turn, { type: 'rematch' }), false);

  const finished = { ...state, status: 'finished', winners: [0] };
  assert.equal(canAct(finished, other, { type: 'rematch' }), true);
  assert.equal(canAct(finished, turn, { type: 'play' }), false);
});

test('カードを使うと次の状態を返し、知らない操作や手札にないカードはエラーにする', () => {
  const state = createGame({ names: ['A', 'B'] });
  const [cardInHand] = state.players[state.currentPlayer].hand;
  const next = applyAction(state, { type: 'play', cardId: cardInHand.id }, { seat: state.currentPlayer });
  assert.equal(next.lastPlay.cardType, cardInHand.type);

  assert.throws(() => applyAction(state, { type: 'teleport' }, { seat: 0 }), /Unknown action/);
  assert.throws(() => applyAction(state, null, { seat: 0 }), /Unknown action/);
  assert.throws(() => applyAction(state, { type: 'play', cardId: 'nope' }, { seat: 0 }), /not in your hand/);
  assert.throws(() => applyAction(state, { type: 'rematch' }, { seat: 0 }), /in progress/);
});

test('再戦すると同じ名前とルールで、最初から始める', () => {
  const state = createGame({ names: ['A', 'B'], options: { rule: 'short' } });
  state.players[0].score = 40;
  const next = applyAction({ ...state, status: 'finished', winners: [0] }, { type: 'rematch' }, { seat: 1 });
  assert.equal(next.status, 'playing');
  assert.equal(next.rule, 'short');
  assert.deepEqual(next.players.map((player) => player.score), [0, 0]);
  assert.notEqual(next.matchId, undefined);
});

test('端末へ返す状態では、自分以外の手札と山札の中身を隠す。待機中の状態はそのまま', () => {
  const state = createGame({ names: ['A', 'B', 'C'] });
  const view = viewState(state, 0);
  assert.equal(view.deck.length, 0);
  view.players.forEach((player, index) => {
    assert.equal(player.hand.length, index === 0 ? state.players[0].hand.length : 0);
  });
  assert.equal(viewState(state, null).players.every((player) => player.hand.length === 0), true);
  assert.deepEqual(viewState({ status: 'waiting' }, 0), { status: 'waiting' });
});
