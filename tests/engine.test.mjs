import test from 'node:test';
import assert from 'node:assert/strict';

import { CARD_INFO, CARD_TYPES, createGame, play, viewFor } from '../src/game/engine.js';

let serial = 0;
const card = (type) => ({ id: `t${(serial += 1)}`, type });
const cards = (...types) => types.map(card);
const first = () => 0;

// 手札・山札・場を指定した状態を作る。席0の手番、開始プレイヤーも席0。
function arranged({ names = ['A', 'B', 'C'], hands, deck = cards('mi', 'mi', 'mi', 'mi', 'mi'), field = [], ...rest }) {
  const state = createGame(names, { random: first });
  state.players.forEach((player, index) => {
    player.hand = hands[index] ?? cards('mi');
  });
  Object.assign(state, { deck, field, startPlayer: 0, currentPlayer: 0, direction: 1, ...rest });
  return state;
}

const handOf = (state, seat) => state.players[seat].hand;

test('22枚から1枚を除外し、1枚ずつ配って、手番の人は1枚引いた状態で始まる', () => {
  const total = Object.values(CARD_INFO).reduce((sum, info) => sum + info.count, 0);
  assert.equal(total, 22);

  const state = createGame(['A', 'B', 'C'], { random: Math.random });
  const inHands = state.players.reduce((sum, player) => sum + player.hand.length, 0);
  assert.equal(inHands, 4);
  assert.equal(state.players[state.currentPlayer].hand.length, 2);
  assert.equal(state.deckCount, 22 - 1 - 3 - 1);
  assert.equal(state.totalRounds, 9);
  assert.ok(state.drawnCardId);
});

test('人数は2〜5人', () => {
  assert.throws(() => createGame(['A']), /between/);
  assert.throws(() => createGame(['A', 'B', 'C', 'D', 'E', 'F']), /between/);
  assert.equal(createGame(['A', 'B'], { rule: 'short' }).totalRounds, 4);
});

test('場がちょうど3枚になったら出した人に3点。ラウンドは続き、次の人が1枚引く', () => {
  const [na] = cards('na');
  let state = arranged({ hands: [[na, card('mi')]], field: cards('mi', 'mi') });
  state = play(state, { cardId: na.id });
  assert.equal(state.players[0].score, 3);
  assert.equal(state.field.length, 3);
  assert.equal(state.currentPlayer, 1);
  assert.equal(handOf(state, 1).length, 2);
  assert.equal(state.lastPlay.points, 3);
});

test('場がちょうど7枚で7点、「みなみ」なら10点。ラウンドが終わり、開始プレイヤーが1人ずれる', () => {
  const [minami] = cards('minami');
  let state = arranged({ hands: [[minami, card('mi')]], field: cards('mi', 'mi', 'mi', 'mi', 'mi', 'mi') });
  state = play(state, { cardId: minami.id });
  assert.equal(state.players[0].score, 10);
  assert.equal(state.lastPlay.roundEnd, 'seven');
  assert.equal(state.round, 2);
  assert.equal(state.startPlayer, 1);
  assert.equal(state.currentPlayer, 1);
  assert.equal(state.field.length, 0);
});

test('「Dリゾート」は2枚分。7を超えたら誰も得点せずにラウンドを終える', () => {
  const [resort] = cards('resort');
  let state = arranged({ hands: [[resort, card('mi')]], field: cards('mi', 'mi', 'mi', 'mi', 'mi', 'mi') });
  state = play(state, { cardId: resort.id });
  assert.equal(state.lastPlay.count, 8);
  assert.equal(state.lastPlay.roundEnd, 'over');
  assert.deepEqual(state.players.map((player) => player.score), [0, 0, 0]);
  assert.equal(state.round, 2);

  const [resort2] = cards('resort');
  let three = arranged({ hands: [[resort2, card('mi')]], field: cards('mi') });
  three = play(three, { cardId: resort2.id });
  assert.equal(three.players[0].score, 3);
});

test('「な」だけは場に出さずに捨てられる。捨てても得点しない', () => {
  const [na, mi] = cards('na', 'mi');
  let state = arranged({ hands: [[na, mi]], field: cards('mi', 'mi', 'mi') });
  assert.throws(() => play(state, { cardId: mi.id, discard: true }), /Only/);
  state = play(state, { cardId: na.id, discard: true });
  assert.equal(state.field.length, 3);
  assert.equal(state.players[0].score, 0);
  assert.equal(state.discardCount, 1);
});

test('「なみ」は場のカードをすべて捨ててから置くので、場は1枚になる', () => {
  const [nami] = cards('nami');
  let state = arranged({ hands: [[nami, card('mi')]], field: cards('mi', 'mi', 'mi', 'mi') });
  state = play(state, { cardId: nami.id });
  assert.deepEqual(state.field.map((entry) => entry.type), [CARD_TYPES.NAMI]);
  assert.equal(state.discardCount, 4);
});

test('「うさぎ」は次の人を飛ばす。2人ならもう一度自分の番', () => {
  const [usagi] = cards('usagi');
  let state = arranged({ hands: [[usagi, card('mi')]] });
  state = play(state, { cardId: usagi.id });
  assert.equal(state.lastPlay.skipped, 1);
  assert.equal(state.currentPlayer, 2);

  const [usagi2] = cards('usagi');
  let duo = arranged({ names: ['A', 'B'], hands: [[usagi2, card('mi')]] });
  duo = play(duo, { cardId: usagi2.id });
  assert.equal(duo.currentPlayer, 0);
  assert.equal(handOf(duo, 0).length, 2);
});

test('「もも」で手番の順が逆になる', () => {
  const [momo] = cards('momo');
  let state = arranged({ hands: [[momo, card('mi')]] });
  state = play(state, { cardId: momo.id });
  assert.equal(state.direction, -1);
  assert.equal(state.currentPlayer, 2);
});

test('「みな」は全員が手札を捨て、同じ枚数を引き直す', () => {
  const [mina, keep] = cards('mina', 'na');
  const deck = cards('momo', 'usagi', 'nami', 'mi', 'mi');
  let state = arranged({ hands: [[mina, keep], cards('na'), cards('na')], deck });
  state = play(state, { cardId: mina.id });
  assert.deepEqual(state.players.map((player) => player.hand.length), [1, 2, 1]);
  assert.equal(handOf(state, 0)[0].type, CARD_TYPES.MOMO);
  assert.equal(handOf(state, 1)[0].type, CARD_TYPES.USAGI);
  assert.equal(handOf(state, 2)[0].type, CARD_TYPES.NAMI);
  assert.equal(state.discardCount, 3);
});

test('「みな」で引き直すと、元の手札と引き直した手札を本人にだけ残し、本人がカードを使うと消える', () => {
  const [mina, keep, oldOne, oldTwo] = cards('mina', 'na', 'mi', 'na');
  const deck = cards('momo', 'usagi', 'nami', 'mi', 'mi', 'mi');
  let state = arranged({ hands: [[mina, keep], [oldOne], [oldTwo]], deck });
  state = play(state, { cardId: mina.id });

  assert.deepEqual(state.players[0].redraw.from.map((card) => card.id), [keep.id]);
  assert.deepEqual(state.players[0].redraw.to.map((card) => card.type), [CARD_TYPES.MOMO]);
  assert.deepEqual(state.players[1].redraw.from.map((card) => card.id), [oldOne.id]);
  assert.deepEqual(state.players[1].redraw.to.map((card) => card.type), [CARD_TYPES.USAGI]);

  const view = viewFor(state, 1);
  assert.equal(view.players[1].redraw.from[0].id, oldOne.id);
  assert.equal(view.players[0].redraw, null);
  assert.equal(view.players[2].redraw, null);

  const usagi = handOf(state, 1).find((card) => card.type === CARD_TYPES.USAGI);
  state = play(state, { cardId: usagi.id });
  assert.equal(state.players[1].redraw, null);
  assert.notEqual(state.players[2].redraw, null);
});

test('山札がなくなったらラウンドを終える', () => {
  const [mi] = cards('mi');
  let state = arranged({ hands: [[mi, card('mi')]], deck: [] });
  state = play(state, { cardId: mi.id });
  assert.equal(state.lastPlay.roundEnd, 'deck-out');
  assert.equal(state.round, 2);
});

test('37点に届いたら、その場で勝利', () => {
  const [na] = cards('na');
  let state = arranged({ hands: [[na, card('mi')]], field: cards('mi', 'mi') });
  state.players[0].score = 34;
  state = play(state, { cardId: na.id });
  assert.equal(state.status, 'finished');
  assert.deepEqual(state.winners, [0]);
  assert.throws(() => play(state, { cardId: 'x' }), /over/);
});

test('最後のラウンドが終わったら最高得点の人が勝ち。同点なら全員が勝ち', () => {
  const [resort] = cards('resort');
  let state = arranged({ hands: [[resort, card('mi')]], field: cards('mi', 'mi', 'mi', 'mi', 'mi', 'mi') });
  state.round = state.totalRounds;
  state.players[1].score = 12;
  state.players[2].score = 12;
  state = play(state, { cardId: resort.id });
  assert.equal(state.status, 'finished');
  assert.deepEqual(state.winners, [1, 2]);
});

test('席ごとの見え方では、ほかの人の手札と山札の中身を隠し、枚数は残す', () => {
  const state = createGame(['A', 'B', 'C']);
  const seat = (state.currentPlayer + 1) % 3;
  const view = viewFor(state, seat);
  assert.equal(view.deck.length, 0);
  assert.equal(view.deckCount, state.deck.length);
  assert.equal(view.players[state.currentPlayer].hand.length, 0);
  assert.equal(view.players[state.currentPlayer].handCount, 2);
  assert.equal(view.players[seat].hand.length, 1);
  assert.equal(view.drawnCardId, null);
  assert.equal(viewFor(state, state.currentPlayer).drawnCardId, state.drawnCardId);
});
