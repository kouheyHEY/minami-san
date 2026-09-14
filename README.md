# みなみ算

1枚引いて、1枚使う。場の3枚目と7枚目を狙う、2〜5人用のカードゲームです。ルールは Synotes のプロジェクト「みなみ算」が元になっています。React、TanStack Router、TanStack Store の構成は [minami-survivor](https://github.com/kouheyHEY/minami-survivor) と同じです。

公開版: https://kouheyhey.github.io/minami-san/ （スマートフォンのブラウザでそのまま遊べます）

## 起動

```sh
npm install
npm run dev
```

ローカルURLは `http://localhost:4175/minami-san/` です。画面はスマートフォンを基本に、幅621px以上と901px以上で段階的に広げます。

## 検証

```sh
npm test
npm run build
```

## ルールの実装

ルール本体は `src/game/engine.js` です（この端末で遊ぶときは画面から、オンラインではサーバーから同じものを使います）。

- 22枚（な7・み3・みな2・なみ2・みなみ1・Dリゾート1・うさぎ3・もも3）から1枚を除外し、1人1枚ずつ配る
- 手番が来たら自動で1枚引き、2枚から1枚を使う。「な」だけは捨ててもよい
- 場がちょうど3枚で+3点、ちょうど7枚で+7点（「みなみ」なら+10点）。7枚・7超え・山札切れでラウンド終了
- ラウンドごとに開始プレイヤーを1人ずらし、手番の向きは元に戻す
- 37点先取。届かなければ、通常3周・ショート2周の終わりに最高得点の人が勝ち（同点は同率勝利）

案に書かれていない細部は次のように決めています。

- 「山札がなくなったとき」は、手番を次の人へ渡す時点で山札が0枚ならラウンドを終える
- 「みな」は出した人から手番の順に引き直し、山札が足りなければ引けるだけ引く
- ショートルールでも37点に届いたら、その場で勝ち

## この端末で遊ぶ

1台の端末を順番に回します。手番が変わるたびに「次は◯◯の番」の画面を挟み、ほかの人の手札は見えないようにしています。

## オンライン対戦

共通サーバー game-server（Supabase）の Edge Function `game-rooms` を使います（game_key: `minami-san`）。このリポジトリにはサーバーの設定を置きません。

- 部屋をつくった人がコードか招待リンクを送り、2〜5人がそろったら「この◯人ではじめる」で始めます。
- カードを混ぜるのも判定もサーバーです。端末に届く状態からは、ほかの人の手札と山札の中身を取り除いています（`online-rules.js` の `viewState`）。
- ほかの人の操作は Realtime の通知で受け取ります。つながらない間は3秒ごとに取り直します。
- 席のトークンは端末に保存するので、読み込み直しても同じ席へ戻れます。
- 対戦中に抜けた人の番は進められないため、対戦中の「部屋を解散」は全員を部屋から出します。

サーバーが使うルールは `src/game/online-rules.js` です。`engine.js` か `online-rules.js` を変えたら、game-server 側で次を実行して反映します。

```sh
node scripts/sync-rules.mjs
supabase functions deploy game-rooms --use-api
```

## 公開

`main` へ push すると、GitHub Actions（`.github/workflows/deploy-pages.yml`）がテストとビルドをして GitHub Pages へ公開します。

## 効果音

`public/sounds/` の効果音は [イワシロ音楽素材](https://iwashiro-sounds.work/) のもので、minami-survivor と同じファイルです（クレジット表記が必要。遊び方ページに記載）。
