// みなみ算のルール本体。この端末で遊ぶときは画面から、オンライン対戦では game-server から使う。
// 状態は JSON のまま保存できる形だけで持ち、操作ごとに新しい状態を返す。

export const CARD_TYPES = Object.freeze({
  NA: 'na',
  MI: 'mi',
  MINA: 'mina',
  NAMI: 'nami',
  MINAMI: 'minami',
  RESORT: 'resort',
  USAGI: 'usagi',
  MOMO: 'momo',
});

export const CARD_INFO = Object.freeze({
  na: Object.freeze({ label: 'な', count: 7, text: '場に出すか、捨てるかを選べる。' }),
  mi: Object.freeze({ label: 'み', count: 3, text: '効果なし。場に出す。' }),
  mina: Object.freeze({ label: 'みな', count: 2, text: '全員が手札を捨て、同じ枚数を引き直す。' }),
  nami: Object.freeze({ label: 'なみ', count: 2, text: '場のカードをすべて捨ててから置く。' }),
  minami: Object.freeze({ label: 'みなみ', count: 1, text: '7枚目に出すと、さらに3点。' }),
  resort: Object.freeze({ label: 'Dリゾート', count: 1, text: '場では2枚分として数える。' }),
  usagi: Object.freeze({ label: 'うさぎ', count: 3, text: '次の人の番を飛ばす。' }),
  momo: Object.freeze({ label: 'もも', count: 3, text: '手番の順を逆にする。' }),
});

export const TARGET_SCORE = 37;
export const FIELD_LIMIT = 7;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const RULES = Object.freeze({
  normal: Object.freeze({ label: '通常', laps: 3 }),
  short: Object.freeze({ label: 'ショート', laps: 2 }),
});

const NAME_MAX_LENGTH = 16;
const LOG_LIMIT = 80;

export const cardWeight = (card) => (card.type === CARD_TYPES.RESORT ? 2 : 1);
export const fieldCount = (field) => field.reduce((sum, card) => sum + cardWeight(card), 0);

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function addLog(state, message, tone = 'neutral') {
  state.log.unshift({ id: state.nextLogId, message, tone });
  state.nextLogId += 1;
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
}

// 相手の手札や山札を隠しても枚数は見せられるよう、枚数は別に持っておく。
function syncCounts(state) {
  state.deckCount = state.deck.length;
  for (const player of state.players) player.handCount = player.hand.length;
  return state;
}

function seatAfter(state, from, steps) {
  const size = state.players.length;
  return (((from + state.direction * steps) % size) + size) % size;
}

function drawFor(state, playerIndex) {
  const card = state.deck.shift();
  if (card) state.players[playerIndex].hand.push(card);
  return card ?? null;
}

// 手番の最初の「1枚引く」は必ず行うので、手番が回ってきた時点で引いておく。
function beginTurn(state) {
  state.drawnCardId = drawFor(state, state.currentPlayer)?.id ?? null;
}

function startRound(state, random) {
  const types = Object.entries(CARD_INFO).flatMap(([type, info]) => Array(info.count).fill(type));
  // 並べ替えてから番号を振るので、番号からカードの種類はわからない。
  const cards = shuffle(types, random).map((type, index) => ({ id: `r${state.round}-${index}`, type }));
  cards.shift(); // 1枚は中身を見ずにゲームから除外する
  for (const player of state.players) {
    player.hand = [cards.shift()];
    player.redraw = null;
  }
  state.deck = cards;
  state.field = [];
  state.discardCount = 0;
  state.direction = 1;
  state.currentPlayer = state.startPlayer;
  addLog(state, `ラウンド${state.round}開始。${state.players[state.startPlayer].name}から`);
  beginTurn(state);
}

function finish(state, winners, message) {
  state.status = 'finished';
  state.winners = winners;
  state.drawnCardId = null;
  addLog(state, message, 'win');
}

function endRound(state, random) {
  if (state.round >= state.totalRounds) {
    const best = Math.max(...state.players.map((player) => player.score));
    const winners = state.players.flatMap((player, index) => (player.score === best ? [index] : []));
    const names = winners.map((index) => state.players[index].name);
    finish(state, winners, winners.length === 1 ? `${names[0]}が最高得点で勝利` : `${names.join('と')}が同点で勝利`);
    return;
  }
  state.round += 1;
  state.startPlayer = (state.startPlayer + 1) % state.players.length;
  startRound(state, random);
}

// みな：出した人から順に、全員が手札を捨てて同じ枚数を引き直す。山札が足りなければ引けるだけ引く。
function redrawAll(state, from) {
  const order = state.players.map((_, step) => seatAfter(state, from, step));
  const before = order.map((index) => state.players[index].hand);
  for (const index of order) {
    state.discardCount += state.players[index].hand.length;
    state.players[index].hand = [];
  }
  order.forEach((index, position) => {
    const player = state.players[index];
    for (let drawn = 0; drawn < before[position].length; drawn += 1) drawFor(state, index);
    // 何を持っていて何に変わったかを残す。本人にだけ見せ、本人が次にカードを使うまで残る。
    // 使う前にもう一度引き直したときは、最初に持っていたカードから見せる。
    if (before[position].length > 0) {
      player.redraw = { from: player.redraw?.from ?? before[position], to: [...player.hand] };
    }
  });
}

export function createGame(names = [], { rule = 'normal', random = Math.random } = {}) {
  if (!Array.isArray(names) || names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
    throw new Error(`Players must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}.`);
  }
  if (!Object.hasOwn(RULES, rule)) throw new Error('Unknown rule.');
  const players = names.map((name, index) => ({
    id: `p${index + 1}`,
    name: String(name ?? '').trim().slice(0, NAME_MAX_LENGTH) || `プレイヤー${index + 1}`,
    score: 0,
    hand: [],
    handCount: 0,
    redraw: null,
  }));
  const startPlayer = Math.floor(random() * players.length);
  const state = {
    matchId: `m${Math.floor(random() * 2 ** 31).toString(36)}`,
    status: 'playing',
    rule,
    players,
    deck: [],
    deckCount: 0,
    field: [],
    discardCount: 0,
    round: 1,
    totalRounds: players.length * RULES[rule].laps,
    startPlayer,
    currentPlayer: startPlayer,
    direction: 1,
    drawnCardId: null,
    winners: [],
    lastPlay: null,
    nextLogId: 1,
    log: [],
  };
  startRound(state, random);
  return syncCounts(state);
}

// 手番のプレイヤーが手札から1枚使う。「な」だけは場に出さずに捨てられる。
export function play(state, { cardId, discard = false } = {}, random = Math.random) {
  if (state.status !== 'playing') throw new Error('The match is over.');
  const next = structuredClone(state);
  const playerIndex = next.currentPlayer;
  const player = next.players[playerIndex];
  const handIndex = player.hand.findIndex((card) => card.id === cardId);
  if (handIndex === -1) throw new Error('That card is not in your hand.');
  const card = player.hand[handIndex];
  if (discard && card.type !== CARD_TYPES.NA) throw new Error('Only な can be discarded.');
  player.hand.splice(handIndex, 1);
  player.redraw = null; // 引き直しの結果は、自分の番に見終わっている
  next.drawnCardId = null;

  const record = {
    id: (state.lastPlay?.id ?? 0) + 1,
    player: playerIndex,
    cardType: card.type,
    discarded: discard,
    count: 0,
    points: 0,
    bonus: 0,
    skipped: null,
    reversed: false,
    roundEnd: null,
  };
  next.lastPlay = record;

  if (discard) {
    next.discardCount += 1;
    addLog(next, `${player.name}が「な」を捨てた`);
  } else {
    let effect = '';
    if (card.type === CARD_TYPES.NAMI) {
      next.discardCount += next.field.length;
      next.field = [card];
      effect = '場を流した';
    } else {
      next.field.push(card);
    }
    if (card.type === CARD_TYPES.MINA) {
      redrawAll(next, playerIndex);
      effect = '全員が手札を引き直した';
    }
    if (card.type === CARD_TYPES.USAGI) {
      record.skipped = seatAfter(next, playerIndex, 1);
      effect = `${next.players[record.skipped].name}の番を飛ばす`;
    }
    if (card.type === CARD_TYPES.MOMO) {
      next.direction *= -1;
      record.reversed = true;
      effect = '手番の順が逆になった';
    }
    addLog(next, `${player.name}が「${CARD_INFO[card.type].label}」を出した${effect ? ` — ${effect}` : ''}`);
  }

  record.count = fieldCount(next.field);
  if (!discard && record.count === 3) record.points = 3;
  if (!discard && record.count === FIELD_LIMIT) {
    record.points = 7;
    if (card.type === CARD_TYPES.MINAMI) record.bonus = 3;
    record.roundEnd = 'seven';
  }
  if (record.count > FIELD_LIMIT) {
    record.roundEnd = 'over';
    addLog(next, `場が${record.count}枚で7を超えた。得点なし`, 'danger');
  }
  if (record.points > 0) {
    player.score += record.points + record.bonus;
    addLog(
      next,
      `場が${record.count}枚！ ${player.name}に+${record.points}点${record.bonus ? `、みなみで+${record.bonus}点` : ''}`,
      'accent',
    );
  }

  if (player.score >= TARGET_SCORE) {
    finish(next, [playerIndex], `${player.name}が${TARGET_SCORE}点に到達して勝利`);
    return syncCounts(next);
  }
  if (record.roundEnd) {
    endRound(next, random);
    return syncCounts(next);
  }

  next.currentPlayer = seatAfter(next, playerIndex, record.skipped === null ? 1 : 2);
  if (next.deck.length === 0) {
    record.roundEnd = 'deck-out';
    addLog(next, '山札がなくなったので、ラウンドを終える');
    endRound(next, random);
    return syncCounts(next);
  }
  beginTurn(next);
  return syncCounts(next);
}

export function rematch(state, random = Math.random) {
  if (state.status !== 'finished') throw new Error('The match is still in progress.');
  return createGame(
    state.players.map((player) => player.name),
    { rule: state.rule, random },
  );
}

// その席から見える状態。ほかの人の手札と山札の中身、引き直しの結果は隠し、枚数だけを残す。
export function viewFor(state, seat) {
  return {
    ...state,
    deck: [],
    players: state.players.map((player, index) => ({
      ...player,
      hand: index === seat ? player.hand : [],
      redraw: index === seat ? (player.redraw ?? null) : null,
    })),
    drawnCardId: seat === state.currentPlayer ? state.drawnCardId : null,
  };
}
