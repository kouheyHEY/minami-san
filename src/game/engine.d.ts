export type CardType = 'na' | 'mi' | 'mina' | 'nami' | 'minami' | 'resort' | 'usagi' | 'momo'
export type RuleKey = 'normal' | 'short'
export type LogTone = 'neutral' | 'accent' | 'danger' | 'win'

export interface Card {
  id: string
  type: CardType
}

export interface Player {
  id: string
  name: string
  score: number
  hand: Card[]
  handCount: number
  // 「みな」で引き直したときの、元の手札と引き直した手札。本人が次にカードを使うまで残る。
  redraw: { from: Card[]; to: Card[] } | null
}

export interface PlayRecord {
  id: number
  player: number
  cardType: CardType
  discarded: boolean
  count: number
  points: number
  bonus: number
  skipped: number | null
  reversed: boolean
  roundEnd: null | 'seven' | 'over' | 'deck-out'
}

export interface GameState {
  matchId: string
  status: 'playing' | 'finished'
  rule: RuleKey
  players: Player[]
  deck: Card[]
  deckCount: number
  field: Card[]
  discardCount: number
  round: number
  totalRounds: number
  startPlayer: number
  currentPlayer: number
  direction: 1 | -1
  drawnCardId: string | null
  winners: number[]
  lastPlay: PlayRecord | null
  nextLogId: number
  log: Array<{ id: number; message: string; tone: LogTone }>
}

export const CARD_TYPES: Readonly<{
  NA: 'na'
  MI: 'mi'
  MINA: 'mina'
  NAMI: 'nami'
  MINAMI: 'minami'
  RESORT: 'resort'
  USAGI: 'usagi'
  MOMO: 'momo'
}>
export const CARD_INFO: Readonly<Record<CardType, Readonly<{ label: string; count: number; text: string }>>>
export const TARGET_SCORE: number
export const FIELD_LIMIT: number
export const MIN_PLAYERS: number
export const MAX_PLAYERS: number
export const RULES: Readonly<Record<RuleKey, Readonly<{ label: string; laps: number }>>>

export function cardWeight(card: Card): number
export function fieldCount(field: Card[]): number
export function createGame(names: string[], options?: { rule?: RuleKey; random?: () => number }): GameState
export function play(state: GameState, move: { cardId: string; discard?: boolean }, random?: () => number): GameState
export function rematch(state: GameState, random?: () => number): GameState
export function viewFor(state: GameState, seat: number | null): GameState
