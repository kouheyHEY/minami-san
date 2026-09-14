import { CARD_INFO, RULES, TARGET_SCORE, type CardType } from '../game/engine.js'

const RULE_STEPS = [
  {
    title: '準備',
    text: '22枚を混ぜ、1枚を中身を見ずに除外します。1人1枚ずつ配り、残りを山札にします。',
  },
  {
    title: '手番',
    text: '山札から1枚引き、手札2枚から1枚を使います。「な」だけは、場に出さずに捨ててもかまいません。',
  },
  {
    title: 'ちょうど3枚',
    text: '場がちょうど3枚になったら、出した人に3点。ラウンドはそのまま続きます。',
  },
  {
    title: 'ちょうど7枚',
    text: '場がちょうど7枚になったら、出した人に7点。「みなみ」で7枚にしたら、さらに3点。そこでラウンド終了です。',
  },
  {
    title: '7を超えたら',
    text: '誰も得点せずにラウンド終了。山札がなくなったときも、ラウンドを終えます。',
  },
  {
    title: '勝ち負け',
    text: `${TARGET_SCORE}点に先に届いた人の勝ち。届かなければ、通常${RULES.normal.laps}周・ショート${RULES.short.laps}周の終わりに最高得点の人が勝ちます（1周＝全員が1回ずつ最初の人になるまで）。`,
  },
]

export function RulesPage() {
  return (
    <main className="rules-page">
      <header className="rules-hero">
        <p className="eyebrow">HOW TO PLAY</p>
        <h1>遊び方</h1>
        <p>1枚引いて、1枚使う。場の3枚目と7枚目を狙うカードゲームです。2〜5人（おすすめは3〜5人）。</p>
      </header>

      <section className="rule-grid">
        {RULE_STEPS.map((step, index) => (
          <article key={step.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </article>
        ))}
      </section>

      <section className="card-rules">
        <div className="section-heading">
          <span className="section-index">07</span>
          <h2>CARDS</h2>
        </div>
        <div className="card-rule-grid">
          {(Object.entries(CARD_INFO) as Array<[CardType, (typeof CARD_INFO)[CardType]]>).map(([type, info]) => (
            <article key={type} className={`card card-${type}`}>
              <strong>{info.label}</strong>
              <small>{info.text}</small>
              <em className="card-count">×{info.count}</em>
            </article>
          ))}
        </div>
        <p className="card-note">「うさぎ」は2人で遊ぶと、もう一度自分の番になります。「なみ」を出すと場は1枚に戻り、また3枚目を狙えます。</p>
      </section>

      <p className="credits">
        効果音：イワシロ音楽素材（<a href="https://iwashiro-sounds.work/" target="_blank" rel="noreferrer">iwashiro-sounds.work</a>）
      </p>
    </main>
  )
}
