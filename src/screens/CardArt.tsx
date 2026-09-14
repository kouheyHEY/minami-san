import { CARD_INFO, type CardType } from '../game/engine.js'
import na from '../assets/cards/na.png'
import mi from '../assets/cards/mi.png'
import mina from '../assets/cards/mina.png'
import nami from '../assets/cards/nami.png'
import minami from '../assets/cards/minami.png'

// カードの絵（ドット絵）。絵がまだ無いカードは、名前の文字で代わりに見せる。
const CARD_ART: Partial<Record<CardType, string>> = { na, mi, mina, nami, minami }

export const CARD_ORDER = Object.keys(CARD_INFO) as CardType[]

export function CardArt({ type }: { type: CardType }) {
  const art = CARD_ART[type]
  if (!art) {
    return (
      <span className="card-art is-text" aria-hidden="true">
        {CARD_INFO[type].label}
      </span>
    )
  }
  return <img className="card-art" src={art} alt="" draggable={false} />
}
