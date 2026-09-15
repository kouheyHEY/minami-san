import { useSelector } from "@tanstack/react-store";
import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
    type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
    CARD_INFO,
    CARD_TYPES,
    FIELD_LIMIT,
    RULES,
    TARGET_SCORE,
    cardWeight,
    fieldCount,
    type Card,
    type CardType,
    type GameState,
    type Player,
    type RuleKey,
} from "../game/engine.js";
import { gameActions, gameStore } from "../game/store.js";
import { inviteUrl, normalizeRoomCode, type RoomView } from "../online/roomClient.js";
import { playSound, type SoundName } from "../audio/sound.js";
import { CARD_ORDER, CardArt, cardArtUrl } from "./CardArt.js";

type Seats = RoomView["seats"];

function RuleSwitch() {
    const rule = useSelector(gameStore, (state) => state.rule);
    return (
        <div className="rule-switch" role="group" aria-label="ルール">
            {(Object.keys(RULES) as RuleKey[]).map((key) => (
                <button
                    key={key}
                    type="button"
                    aria-pressed={rule === key}
                    onClick={() => gameActions.setRule(key)}
                >
                    <strong>{RULES[key].label}</strong>
                    <small>最大{RULES[key].laps}周</small>
                </button>
            ))}
        </div>
    );
}

function OnlineSetup() {
    const name = useSelector(gameStore, (state) => state.onlineName);
    const joinCode = useSelector(gameStore, (state) => state.joinCode);
    const busy = useSelector(gameStore, (state) => state.busy);
    const error = useSelector(gameStore, (state) => state.error);
    const invited = joinCode.length === 6;
    // 入力欄に見せる文字。日本語入力の変換中は整えずにそのまま持つ（整えると文字が二重になる）。
    const [codeText, setCodeText] = useState(joinCode);
    const commitCode = (value: string) => {
        gameActions.setJoinCode(value);
        setCodeText(normalizeRoomCode(value));
    };

    return (
        <div className={`online-setup ${invited ? "is-invited" : ""}`}>
            <label className="player-input">
                <span>あなたの名前</span>
                <input
                    value={name}
                    maxLength={16}
                    placeholder="ほかの人に表示されます"
                    onChange={(event) => gameActions.setOnlineName(event.target.value)}
                />
            </label>
            <button
                className={`${invited ? "ghost-button" : "primary-button"} start-button`}
                onClick={() => void gameActions.createRoom()}
                disabled={busy}
            >
                部屋をつくる <span aria-hidden="true">→</span>
            </button>
            <div className="join-block">
                <p className="online-divider">部屋コードをもらったら</p>
                <form
                    className="join-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void gameActions.joinRoom();
                    }}
                >
                    <input
                        value={codeText}
                        onChange={(event) => {
                            if ((event.nativeEvent as InputEvent).isComposing) {
                                setCodeText(event.target.value);
                            } else {
                                commitCode(event.target.value);
                            }
                        }}
                        onCompositionEnd={(event) => commitCode(event.currentTarget.value)}
                        placeholder="6文字のコード"
                        aria-label="部屋コード"
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button
                        className={invited ? "primary-button" : "ghost-button"}
                        disabled={busy || !invited}
                    >
                        参加する
                    </button>
                </form>
            </div>
            {error && (
                <p className="error-message" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

function SetupScreen() {
    return (
        <main className="setup-page">
            <section className="hero-card">
                <div className="setup-heading">
                    <span className="section-index">ONLINE</span>
                    <h1>部屋をつくって遊ぶ</h1>
                    <p>2〜5人のオンライン対戦です。部屋にCPUを入れれば、1人でも遊べます。</p>
                </div>
                <OnlineSetup />
            </section>

            <aside className="setup-aside" aria-label="ゲームのポイント">
                <div className="big-numbers" aria-hidden="true">
                    <span>3</span>
                    <span>7</span>
                </div>
                <div className="feature-list">
                    <div>
                        <b>01</b>
                        <span>
                            <strong>DRAW</strong>1枚引いて、2枚から1枚を使う
                        </span>
                    </div>
                    <div>
                        <b>02</b>
                        <span>
                            <strong>COUNT</strong>場の3枚目で+3、7枚目で+7
                        </span>
                    </div>
                    <div>
                        <b>03</b>
                        <span>
                            <strong>FIRST TO 37</strong>先に37点で勝ち
                        </span>
                    </div>
                </div>
            </aside>
        </main>
    );
}

function WaitingScreen() {
    const online = useSelector(gameStore, (state) => state.online);
    const busy = useSelector(gameStore, (state) => state.busy);
    const error = useSelector(gameStore, (state) => state.error);
    const [copied, setCopied] = useState(false);
    if (!online) return null;

    const { room } = online;
    const isHost = room.seat === 0;
    const count = room.seats.length;
    const missing = Math.max(0, room.minSeats - count);

    const share = async () => {
        const url = inviteUrl(room.code);
        try {
            if (typeof navigator.share === "function") {
                await navigator.share({
                    title: "みなみ算",
                    text: `部屋コード ${room.code} で一緒に遊ぼう`,
                    url,
                });
            } else {
                await navigator.clipboard.writeText(url);
                setCopied(true);
            }
        } catch {
            // 共有をキャンセルしたときは何もしない
        }
    };

    return (
        <main className="waiting-page">
            <section className="waiting-card" aria-live="polite">
                <span className="section-index">ONLINE ROOM</span>
                <h1>{isHost ? "参加者を待っています" : "はじまるのを待っています"}</h1>
                <p>
                    {isHost
                        ? "部屋コードか招待リンクを送ってください。CPUを入れて始めることもできます。"
                        : "部屋をつくった人が始めると、ゲームが始まります。"}
                </p>
                <strong className="room-code">{room.code}</strong>
                <ol className="member-list" aria-label={`参加者 ${count}人`}>
                    {room.seats.map((seat, index) => (
                        <li key={index}>
                            <span>{seat.name}</span>
                            {seat.cpu && <small>CPU</small>}
                            {index === 0 && <small>ホスト</small>}
                            {index === room.seat && <small className="is-self">あなた</small>}
                            {isHost && seat.cpu && (
                                <button
                                    type="button"
                                    className="member-remove"
                                    aria-label={`${seat.name}を外す`}
                                    disabled={busy}
                                    onClick={() => void gameActions.removeCpu(index)}
                                >
                                    ×
                                </button>
                            )}
                        </li>
                    ))}
                </ol>
                {isHost && count < room.seatCount && (
                    <button
                        type="button"
                        className="add-player"
                        disabled={busy}
                        onClick={() => void gameActions.addCpu()}
                    >
                        ＋ CPUを入れる
                    </button>
                )}
                <p className="member-count">
                    {count} / {room.seatCount}人
                </p>
                {isHost && <RuleSwitch />}
                <div className="waiting-actions">
                    {isHost && (
                        <button
                            className="primary-button"
                            disabled={busy || missing > 0}
                            onClick={() => void gameActions.startRoom()}
                        >
                            {missing > 0 ? `あと${missing}人で始められます` : `この${count}人ではじめる`}
                        </button>
                    )}
                    <button className="ghost-button" onClick={() => void share()}>
                        {copied ? "リンクをコピーしました" : "招待リンクを送る"}
                    </button>
                    <button
                        className="ghost-button"
                        disabled={busy}
                        onClick={() => void gameActions.leaveWaitingRoom()}
                    >
                        {isHost ? "部屋を閉じる" : "抜ける"}
                    </button>
                </div>
                {error && (
                    <p className="error-message" role="alert">
                        {error}
                    </p>
                )}
            </section>
        </main>
    );
}

// ---- カードの説明（タップで開く吹き出し） ----

// 開けるのは画面全体で1つだけで、ほかの場所に触れたら閉じる。
const TipContext = createContext<{
    openId: string | null;
    toggle: (id: string, open?: boolean) => void;
}>({ openId: null, toggle: () => {} });

function TipProvider({ children }: { children: ReactNode }) {
    const [openId, setOpenId] = useState<string | null>(null);
    useEffect(() => {
        if (openId === null) return;
        const close = () => setOpenId(null);
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
    }, [openId]);
    const value = useMemo(
        () => ({
            openId,
            toggle: (id: string, open?: boolean) =>
                setOpenId((current) => ((open ?? current !== id) ? id : null)),
        }),
        [openId],
    );
    return <TipContext.Provider value={value}>{children}</TipContext.Provider>;
}

type TipAlign = "start" | "center" | "end";

function CardTip({ type }: { type: CardType }) {
    const info = CARD_INFO[type];
    return (
        <div className="card-tip" role="tooltip">
            <strong>{info.label}</strong>
            <p>{info.text}</p>
        </div>
    );
}

// 触れたときに下の画面の「閉じる」処理へ届かないようにする（開いた直後に閉じてしまうため）。
const keepTip = (event: { stopPropagation: () => void }) => event.stopPropagation();

// 手札のカードの印。手番で引いたカードは「NEW」、みなで引き直したカードは「引き直し」。
function cardBadges(game: GameState, player: Player) {
    const badges = new Map<string, "draw" | "redraw">();
    player.redraw?.to.forEach((card) => badges.set(card.id, "redraw"));
    if (game.drawnCardId && !badges.has(game.drawnCardId)) badges.set(game.drawnCardId, "draw");
    return badges;
}

function CardFace({
    card,
    align,
    badge,
    pending = false,
    selected = false,
    onSelect,
}: {
    card: Card;
    align: TipAlign;
    badge?: "draw" | "redraw";
    pending?: boolean;
    selected?: boolean;
    onSelect?: () => void;
}) {
    const { openId, toggle } = useContext(TipContext);
    const info = CARD_INFO[card.type];
    const tipOpen = openId === card.id;
    // 選べるカードは、1回目のタップで選んで説明を開く。選んだカードをもう一度タップすると説明を閉じる。
    const press = () => {
        if (!onSelect) return toggle(card.id);
        toggle(card.id, selected ? !tipOpen : true);
        onSelect();
    };
    return (
        <div className={`card-slot tip-${align} ${tipOpen ? "is-tip-open" : ""}`}>
            <button
                type="button"
                data-card={card.id}
                role={onSelect ? "radio" : undefined}
                aria-checked={onSelect ? selected : undefined}
                aria-expanded={tipOpen}
                aria-label={`${info.label}：${info.text}`}
                className={`card card-${card.type} ${selected ? "is-selected" : ""} ${pending ? "is-pending" : ""}`}
                onPointerDown={keepTip}
                onClick={press}
            >
                <CardArt type={card.type} />
                <strong>{info.label}</strong>
                {badge && (
                    <em className={badge === "redraw" ? "is-redraw" : ""}>
                        {badge === "draw" ? "NEW" : "引き直し"}
                    </em>
                )}
            </button>
            <CardTip type={card.type} />
        </div>
    );
}

function FieldCard({ card, align }: { card: Card; align: TipAlign }) {
    const { openId, toggle } = useContext(TipContext);
    const info = CARD_INFO[card.type];
    const tipOpen = openId === card.id;
    return (
        <li
            className={`field-cell tip-${align} ${tipOpen ? "is-tip-open" : ""}`}
            style={{ gridColumn: `span ${cardWeight(card)}` }}
        >
            <button
                type="button"
                data-card={card.id}
                className={`field-card card-${card.type}`}
                aria-expanded={tipOpen}
                aria-label={`${info.label}：${info.text}`}
                onPointerDown={keepTip}
                onClick={() => toggle(card.id)}
            >
                <CardArt type={card.type} />
            </button>
            <CardTip type={card.type} />
        </li>
    );
}

// ---- 卓 ----

// ほかの人の席。名前・手札の枚数（裏向きのカード）・得点を小さく並べる。自分の次の人から順に並べる。
function Opponents({
    game,
    seats,
    selfIndex,
    redrawing,
}: {
    game: GameState;
    seats: Seats;
    selfIndex: number;
    redrawing: boolean;
}) {
    const size = game.players.length;
    const order = Array.from({ length: size - 1 }, (_, step) => (selfIndex + 1 + step) % size);
    return (
        <ol className="seats" aria-label="ほかの人">
            {order.map((index) => {
                const player = game.players[index];
                const turn = game.status === "playing" && game.currentPlayer === index;
                const winner = game.status === "finished" && game.winners.includes(index);
                const count = redrawing ? 0 : player.handCount;
                return (
                    <li
                        key={player.id}
                        data-anchor={`seat-${index}`}
                        className={`seat ${turn ? "is-turn" : ""} ${winner ? "is-winner" : ""}`}
                        aria-current={turn ? "true" : undefined}
                    >
                        <span className="seat-name">
                            {player.name}
                            {seats[index]?.cpu && <small>CPU</small>}
                        </span>
                        <span className="seat-score">{player.score}点</span>
                        <span className="seat-hand" data-anchor={`hand-${index}`} aria-label={`手札${count}枚`}>
                            {Array.from({ length: count }, (_, card) => (
                                <i key={card} className="mini-back" />
                            ))}
                            {count === 0 && <em>0枚</em>}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

// 真ん中の卓。山札と捨て札を並べ、その下にカードを並べる場。
function Table({ game }: { game: GameState }) {
    const count = fieldCount(game.field);
    const emptySlots = Array.from(
        { length: Math.max(0, FIELD_LIMIT - count) },
        (_, index) => count + index + 1,
    );
    return (
        <section className="table" data-anchor="table" aria-label={`場 ${count}枚`}>
            <div className="table-top">
                <div
                    className={`pile deck ${game.deckCount === 0 ? "is-empty" : ""}`}
                    data-anchor="deck"
                    aria-label={`山札 残り${game.deckCount}枚`}
                >
                    <b>{game.deckCount}</b>
                    <small>山札</small>
                </div>
                <div className="table-info">
                    <strong>
                        {count}
                        <span>/ {FIELD_LIMIT}</span>
                    </strong>
                    <span
                        className={`direction ${game.direction === -1 ? "is-reversed" : ""}`}
                        data-anchor="direction"
                    >
                        {game.direction === -1 ? "↺ 逆回り" : "↻ 順番"}
                    </span>
                </div>
                <div className="pile discard" data-anchor="discard" aria-label={`捨て札 ${game.discardCount}枚`}>
                    <b>{game.discardCount}</b>
                    <small>捨て札</small>
                </div>
            </div>
            <ol className="field-track">
                {game.field.map((card, index) => (
                    <FieldCard
                        key={card.id}
                        card={card}
                        align={index < 2 ? "start" : index > 3 ? "end" : "center"}
                    />
                ))}
                {emptySlots.map((slot) => (
                    <li key={`slot-${slot}`} data-slot={slot} className={`field-slot slot-${slot}`}>
                        {slot === 3 ? "+3" : slot === FIELD_LIMIT ? "+7" : ""}
                    </li>
                ))}
            </ol>
        </section>
    );
}

// ---- カードの動き ----
// 状態が変わったら、前の画面でカードがあった位置と、新しい画面で置かれる位置を測り、
// そのあいだを飛ぶカードを重ねて描く。飛んでいる間は、行き先のカードを隠しておく。

const FLY_MS = 380;
const HOLD_MS = 220;
// みな：持っていたカードが捨て札へ飛び（clear）、手札0枚を見せ（empty）、山札から引き直す。
const REDRAW_CLEAR_MS = 850;
const REDRAW_EMPTY_MS = 650;

type Rects = Map<string, DOMRect>;
type Snapshot = { game: GameState; rects: Rects };

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function measure(root: HTMLElement): Rects {
    const rects: Rects = new Map();
    root.querySelectorAll<HTMLElement>("[data-card], [data-anchor], [data-slot]").forEach((element) => {
        const { card, anchor, slot } = element.dataset;
        const key = card ? `card:${card}` : anchor ? `anchor:${anchor}` : `slot:${slot}`;
        rects.set(key, element.getBoundingClientRect());
    });
    return rects;
}

// ほかの人の手札の位置に、小さなカードの大きさの枠をとる。
function cardBox(rect: DOMRect | undefined, width = 26, height = 36) {
    if (!rect) return undefined;
    return new DOMRect(rect.left + rect.width / 2 - width / 2, rect.top + rect.height / 2 - height / 2, width, height);
}

function flyCard(
    layer: HTMLElement,
    {
        from,
        to,
        type,
        delay = 0,
        target,
        onLand,
    }: {
        from?: DOMRect;
        to?: DOMRect;
        type?: CardType;
        delay?: number;
        target?: HTMLElement | null;
        onLand?: () => void;
    },
) {
    if (!from || !to) return;
    const card = document.createElement("div");
    // 種類がわかるカードは表向き、山札から引くカードやほかの人の手札は裏向きで飛ばす。
    card.className = type ? `flying-card card-${type}` : "flying-card is-back";
    if (type) {
        const url = cardArtUrl(type);
        const face = document.createElement(url ? "img" : "span");
        if (face instanceof HTMLImageElement) face.src = url!;
        else face.textContent = CARD_INFO[type].label;
        card.append(face);
    }
    Object.assign(card.style, {
        left: `${to.left}px`,
        top: `${to.top}px`,
        width: `${to.width}px`,
        height: `${to.height}px`,
    });
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = Math.max(0.15, from.width / Math.max(1, to.width));
    if (target) target.style.visibility = "hidden";
    layer.append(card);
    const animation = card.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: "none" }],
        { duration: FLY_MS, delay, easing: "cubic-bezier(.2, .8, .2, 1)", fill: "backwards" },
    );
    let finished = false;
    const done = () => {
        if (finished) return;
        finished = true;
        card.remove();
        if (target) target.style.visibility = "";
        onLand?.();
    };
    animation.onfinish = done;
    animation.oncancel = done;
}

// うさぎの「スキップ」や、ももの「逆回り」を、その場所にポンと出す。
function stamp(layer: HTMLElement, rect: DOMRect | undefined, text: string, variant: string, delay: number) {
    if (!rect) return;
    const element = document.createElement("div");
    element.className = `stamp is-${variant}`;
    element.textContent = text;
    element.style.left = `${rect.left + rect.width / 2}px`;
    element.style.top = `${rect.top + rect.height / 2}px`;
    layer.append(element);
    const animation = element.animate(
        [
            { transform: "translate(-50%, -50%) scale(.3) rotate(-8deg)", opacity: 0 },
            { transform: "translate(-50%, -50%) scale(1.15) rotate(3deg)", opacity: 1, offset: 0.18 },
            { transform: "translate(-50%, -50%) scale(1) rotate(0)", opacity: 1, offset: 0.78 },
            { transform: "translate(-50%, -70%) scale(1)", opacity: 0 },
        ],
        { duration: 1150, delay, easing: "ease-out", fill: "both" },
    );
    animation.onfinish = () => element.remove();
    animation.oncancel = () => element.remove();
}

function planMotion(
    root: HTMLElement,
    layer: HTMLElement,
    before: Snapshot,
    game: GameState,
    selfIndex: number,
) {
    const record = game.lastPlay;
    if (!record) return;
    const prev = before.game;
    const find = (selector: string) => root.querySelector<HTMLElement>(selector);
    const anchor = (name: string) =>
        find(`[data-anchor="${name}"]`)?.getBoundingClientRect() ?? before.rects.get(`anchor:${name}`);
    const cardRect = (id: string) => find(`[data-card="${id}"]`)?.getBoundingClientRect();
    const handOf = (seat: number) => cardBox(anchor(`hand-${seat}`));
    const deck = anchor("deck");
    const discard = anchor("discard");
    const played = !record.discarded;
    const roundReset = record.roundEnd !== null && game.round !== prev.round;
    const prevFieldIds = new Set(prev.field.map((card) => card.id));
    const placed = played ? game.field.find((card) => !prevFieldIds.has(card.id)) : undefined;

    // 1. 出したカード：自分なら手札の位置から、ほかの人ならその人の席から、場か捨て札へ
    let from: DOMRect | undefined;
    if (record.player === selfIndex) {
        const nextIds = new Set(game.players[selfIndex].hand.map((card) => card.id));
        const used = prev.players[selfIndex].hand.find((card) =>
            placed ? card.id === placed.id : card.type === record.cardType && !nextIds.has(card.id),
        );
        from = used && before.rects.get(`card:${used.id}`);
    }
    from ??= handOf(record.player);
    const placedElement = placed ? find(`[data-card="${placed.id}"]`) : null;
    const landing = !played
        ? discard
        : placedElement
          ? placedElement.getBoundingClientRect()
          : before.rects.get(`slot:${fieldCount(prev.field) + 1}`);

    // なみ：前の場のカードを捨て札へ流してから置く
    if (played && record.cardType === CARD_TYPES.NAMI) {
        prev.field.forEach((card, index) =>
            flyCard(layer, { from: before.rects.get(`card:${card.id}`), to: discard, type: card.type, delay: index * 30 }),
        );
    }
    flyCard(layer, {
        from,
        to: landing,
        type: record.cardType,
        target: placedElement,
        delay: played && record.cardType === CARD_TYPES.NAMI ? 140 : 0,
        // ラウンドが終わったときは、置いたカードも少し見せてから捨て札へ
        onLand: roundReset && played
            ? () => flyCard(layer, { from: landing, to: discard, type: record.cardType, delay: HOLD_MS })
            : undefined,
    });
    let time = FLY_MS + 60;

    if (!roundReset && record.skipped !== null) {
        stamp(layer, anchor(`seat-${record.skipped}`), "スキップ", "skip", time - 120);
    }
    if (!roundReset && record.reversed) {
        stamp(layer, anchor("direction"), game.direction === -1 ? "↺ 逆回り" : "↻ 元の向き", "reverse", time - 120);
    }

    // 2. ラウンドが終わったら、場のカードを捨て札へ
    if (roundReset) {
        time += HOLD_MS;
        prev.field.forEach((card, index) =>
            flyCard(layer, { from: before.rects.get(`card:${card.id}`), to: discard, type: card.type, delay: time + index * 30 }),
        );
        time += FLY_MS + 120;
    }

    // 3. みな：全員の手札を捨て札へ飛ばし、0枚にしてから、山札から引き直す
    if (played && !roundReset && record.cardType === CARD_TYPES.MINA) {
        stamp(layer, anchor("table"), "全員引き直し", "mina", time - 120);
        game.players.forEach((player, seat) => {
            if (seat === selfIndex) {
                prev.players[seat].hand
                    .filter((card) => card.id !== placed?.id)
                    .forEach((card, index) =>
                        flyCard(layer, {
                            from: before.rects.get(`card:${card.id}`),
                            to: discard,
                            type: card.type,
                            delay: time + index * 40,
                        }),
                    );
            } else {
                const count = Math.max(0, prev.players[seat].handCount - (seat === record.player ? 1 : 0));
                for (let index = 0; index < count; index += 1) {
                    flyCard(layer, { from: handOf(seat), to: discard, delay: time + index * 40 });
                }
            }
        });
        const drawAt = REDRAW_CLEAR_MS + REDRAW_EMPTY_MS - FLY_MS;
        game.players.forEach((player, seat) => {
            if (seat === selfIndex) {
                (player.redraw?.to ?? []).forEach((card, index) => {
                    const element = find(`[data-card="${card.id}"]`);
                    flyCard(layer, { from: deck, to: cardRect(card.id), target: element, delay: drawAt + index * 60 });
                });
            } else {
                // 引き直す枚数は、捨てた枚数と同じ
                const count = Math.max(0, prev.players[seat].handCount - (seat === record.player ? 1 : 0));
                for (let index = 0; index < count; index += 1) {
                    flyCard(layer, { from: deck, to: handOf(seat), delay: drawAt + index * 60 });
                }
            }
        });
        time = REDRAW_CLEAR_MS + REDRAW_EMPTY_MS + 80;
    }

    // 4. 新しいラウンドは、山札から1人1枚ずつ配る
    if (roundReset && game.status === "playing") {
        game.players.forEach((player, seat) => {
            const delay = time + seat * 70;
            if (seat === selfIndex) {
                const dealt = player.hand.find((card) => card.id !== game.drawnCardId);
                const element = dealt ? find(`[data-card="${dealt.id}"]`) : null;
                flyCard(layer, { from: deck, to: element?.getBoundingClientRect(), target: element, delay });
            } else {
                flyCard(layer, { from: deck, to: handOf(seat), delay });
            }
        });
        time += game.players.length * 70 + FLY_MS;
    }

    // 5. 番が来た人が、山札から1枚引く
    if (game.status === "playing") {
        const drawer = game.currentPlayer;
        if (drawer === selfIndex && game.drawnCardId) {
            const element = find(`[data-card="${game.drawnCardId}"]`);
            flyCard(layer, { from: deck, to: element?.getBoundingClientRect(), target: element, delay: time });
        } else if (drawer !== selfIndex) {
            flyCard(layer, { from: deck, to: handOf(drawer), delay: time });
        }
    }
}

function useTableMotion(
    rootRef: RefObject<HTMLElement | null>,
    layerRef: RefObject<HTMLDivElement | null>,
    game: GameState,
    selfIndex: number | null,
) {
    const snapshot = useRef<Snapshot | null>(null);
    // 描いた直後（画面に出る前）に、前の位置から動きを組み立て、今の位置を覚えておく。
    useLayoutEffect(() => {
        const root = rootRef.current;
        const layer = layerRef.current;
        if (!root || !layer) return;
        const before = snapshot.current;
        if (
            before &&
            selfIndex !== null &&
            before.game.matchId === game.matchId &&
            playKey(before.game) !== playKey(game) &&
            !prefersReducedMotion()
        ) {
            planMotion(root, layer, before, game, selfIndex);
        }
        snapshot.current = { game, rects: measure(root) };
    });
}

// みな：全員の手札が0枚に見える時間。得点表の枚数と自分の手札を0枚にする。
type RedrawPhase = "clear" | "empty" | null;
const redrawStarts = new Map<string, number>();

function useRedrawPhase(game: GameState): RedrawPhase {
    const [, rerender] = useState(0);
    const key =
        game.lastPlay?.cardType === CARD_TYPES.MINA && !game.lastPlay.discarded && game.lastPlay.roundEnd === null
            ? `${game.matchId}:${game.lastPlay.id}`
            : null;
    // 描いた時点で始まりを決める（先に新しい手札を一瞬でも見せないように）。何度描いても同じ値になる。
    if (key !== null && !redrawStarts.has(key)) redrawStarts.set(key, Date.now());
    const elapsed = key === null ? Infinity : Date.now() - redrawStarts.get(key)!;
    const phase: RedrawPhase =
        elapsed < REDRAW_CLEAR_MS ? "clear" : elapsed < REDRAW_CLEAR_MS + REDRAW_EMPTY_MS ? "empty" : null;

    useEffect(() => {
        if (phase === null) return;
        const until = phase === "clear" ? REDRAW_CLEAR_MS : REDRAW_CLEAR_MS + REDRAW_EMPTY_MS;
        const timer = window.setTimeout(() => rerender((count) => count + 1), until - elapsed + 10);
        return () => clearTimeout(timer);
    });
    return phase;
}

// ---- 自分の手札 ----

const cardNames = (cards: Card[]) =>
    cards.length > 0 ? cards.map((card) => CARD_INFO[card.type].label).join("・") : "なし";

// みなで手札が入れ替わったことと、何から何に変わったかを見せる。
function RedrawNote({ redraw }: { redraw: NonNullable<Player["redraw"]> }) {
    return (
        <p className="redraw-note" role="status">
            <b>「みな」で引き直し</b>
            <span className="redraw-from">{cardNames(redraw.from)}</span>
            <i aria-hidden="true">→</i>
            <span className="redraw-to">{cardNames(redraw.to)}</span>
        </p>
    );
}

function outcomeText(card: Card, after: number) {
    if (after === 3) return "3枚目で+3点";
    if (after === FIELD_LIMIT) return `7枚目で+${card.type === CARD_TYPES.MINAMI ? 10 : 7}点`;
    if (after > FIELD_LIMIT) return "7を超えて得点なし";
    return "";
}

function MyArea({
    game,
    seats,
    selfIndex,
    busy,
    redrawPhase,
}: {
    game: GameState;
    seats: Seats;
    selfIndex: number;
    busy: boolean;
    redrawPhase: RedrawPhase;
}) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const me = game.players[selfIndex];
    const current = game.players[game.currentPlayer];
    const isTurn = game.status === "playing" && game.currentPlayer === selfIndex;
    const redrawing = redrawPhase !== null;
    const badges = cardBadges(game, me);
    const selected = isTurn && !redrawing ? (me.hand.find((card) => card.id === selectedId) ?? null) : null;
    const count = fieldCount(game.field);
    const after = selected ? (selected.type === CARD_TYPES.NAMI ? 1 : count + cardWeight(selected)) : null;
    const outcome = selected && after !== null ? outcomeText(selected, after) : "";

    return (
        <section
            className={`my-area ${isTurn ? "is-turn" : ""} ${busy ? "is-busy" : ""}`}
            data-anchor={`seat-${selfIndex}`}
            aria-busy={busy}
        >
            <div className="my-head">
                <span className="my-name">{me.name}</span>
                <span className="my-score">{me.score}点</span>
                <span className="my-status">
                    {isTurn
                        ? "あなたの番"
                        : `${current.name}${seats[game.currentPlayer]?.cpu ? "が考えています…" : "の番"}`}
                </span>
            </div>
            {!redrawing && me.redraw && <RedrawNote redraw={me.redraw} />}
            <div
                className="hand-cards"
                data-anchor={`hand-${selfIndex}`}
                role={isTurn ? "radiogroup" : undefined}
                aria-label="あなたの手札"
            >
                {me.hand.map((card, index) => (
                    <CardFace
                        key={card.id}
                        card={card}
                        align={index === 0 ? "start" : "end"}
                        badge={badges.get(card.id)}
                        pending={redrawing}
                        selected={card.id === selectedId}
                        onSelect={isTurn ? () => setSelectedId(card.id) : undefined}
                    />
                ))}
                {redrawing && (
                    <div className="hand-zero" role="status">
                        <strong>手札 0枚</strong>
                        <span>全員が引き直しています…</span>
                    </div>
                )}
            </div>
            {isTurn && (
                <>
                    <p className="play-preview" aria-live="polite">
                        {selected && after !== null ? (
                            <>
                                出すと場は<b>{after}枚</b>
                                {outcome && <em className={after > FIELD_LIMIT ? "is-over" : ""}>{outcome}</em>}
                            </>
                        ) : (
                            "カードをタップして選んでください。"
                        )}
                    </p>
                    <div className="action-buttons">
                        <button
                            className="primary-button"
                            disabled={!selected || busy}
                            onClick={() => selected && gameActions.play(selected.id)}
                        >
                            {selected ? `「${CARD_INFO[selected.type].label}」を場に出す` : "場に出す"}
                        </button>
                        {selected?.type === CARD_TYPES.NA && (
                            <button
                                className="ghost-button"
                                disabled={busy}
                                onClick={() => gameActions.play(selected.id, true)}
                            >
                                捨てる
                            </button>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}

function WinnerPanel({ game, busy }: { game: GameState; busy: boolean }) {
    const ranking = game.players
        .map((player, index) => ({ player, index }))
        .sort((a, b) => b.player.score - a.player.score);
    const winners = game.winners.map((index) => game.players[index]);
    const dissolve = () => {
        if (window.confirm("部屋を解散すると、全員がこの部屋から出ます。解散しますか？")) {
            void gameActions.dissolveRoom();
        }
    };

    return (
        <section className="my-area winner-panel" role="status">
            <span className="section-index">WINNER</span>
            <h2>{winners.map((player) => player.name).join("・")}</h2>
            <p>{winners.length > 1 ? "同点で勝利" : `${winners[0]?.score ?? 0}点で勝利`}</p>
            <ol className="ranking">
                {ranking.map(({ player, index }) => (
                    <li key={player.id} className={game.winners.includes(index) ? "is-winner" : ""}>
                        <span>{player.name}</span>
                        <b>{player.score}点</b>
                    </li>
                ))}
            </ol>
            <div className="action-buttons">
                <button className="primary-button" onClick={gameActions.playAgain} disabled={busy}>
                    もう一回
                </button>
                <button className="ghost-button" onClick={dissolve} disabled={busy}>
                    部屋を解散する
                </button>
            </div>
        </section>
    );
}

// 直近の出来事を1行だけ。
function EventLine({ events }: { events: GameState["log"] }) {
    const latest = events[0];
    return (
        <p className="event-line" aria-live="polite">
            {latest && (
                <span key={latest.id} className={latest.tone}>
                    {latest.message}
                </span>
            )}
        </p>
    );
}

const BURST_MS = 1300;

type Burst = { key: string; kind: "three" | "seven" | "over"; title: string; detail: string };

const playKey = (game: GameState) =>
    game.lastPlay ? `${game.matchId}:${game.lastPlay.id}` : null;

// 3点・7点・7超えのときに大きく見せる。カードが場に着いてから出す。開いた直後（読み込み直し）は見せない。
function useBurst(game: GameState) {
    const [burst, setBurst] = useState<Burst | null>(null);
    const seen = useRef<string | null | undefined>(undefined);
    const key = playKey(game);

    useEffect(() => {
        const first = seen.current === undefined;
        const changed = seen.current !== key;
        seen.current = key;
        const record = game.lastPlay;
        if (first || !changed || !record || key === null) return;

        const name = game.players[record.player]?.name ?? "";
        const next: Burst | null =
            record.points === 7
                ? { key, kind: "seven", title: "7!", detail: `${name} +${record.points + record.bonus}点` }
                : record.points === 3
                  ? { key, kind: "three", title: "3!", detail: `${name} +3点` }
                  : record.roundEnd === "over"
                    ? { key, kind: "over", title: String(record.count), detail: "7を超えた… 得点なし" }
                    : null;
        if (!next) return;
        window.setTimeout(() => setBurst(next), FLY_MS);
        window.setTimeout(() => setBurst((shown) => (shown?.key === key ? null : shown)), FLY_MS + BURST_MS);
    }, [key]);

    return burst;
}

// 触れても下の画面に届くので、操作の邪魔をしない。
function BurstOverlay({ burst }: { burst: Burst | null }) {
    if (!burst) return null;
    return createPortal(
        <div key={burst.key} className={`burst is-${burst.kind}`} aria-hidden="true">
            <strong>{burst.title}</strong>
            <span>{burst.detail}</span>
        </div>,
        document.body,
    );
}

// 状態の変化から効果音を選ぶ。操作した端末でも、ほかの人の操作を受け取った端末でも同じように鳴る。
function useGameSounds(game: GameState, selfIndex: number | null) {
    const previous = useRef<{
        matchId: string;
        key: string | null;
        status: GameState["status"];
        currentPlayer: number;
    } | null>(null);

    useEffect(() => {
        const current = {
            matchId: game.matchId,
            key: playKey(game),
            status: game.status,
            currentPlayer: game.currentPlayer,
        };
        const before = previous.current;
        previous.current = current;
        // 最初の表示や、再戦で最初に戻ったときは鳴らさない
        if (!before || before.matchId !== current.matchId) return;

        const sounds = new Set<SoundName>();
        const record = game.lastPlay;
        if (record && current.key !== before.key) {
            sounds.add(
                record.points === 7
                    ? "chain"
                    : record.points === 3
                      ? "item"
                      : record.roundEnd === "over"
                        ? "danger"
                        : "step",
            );
        }
        if (current.status === "finished" && before.status !== "finished") {
            sounds.add("win");
        } else if (current.status === "playing" && current.currentPlayer !== before.currentPlayer) {
            sounds.add(selfIndex !== null && current.currentPlayer === selfIndex ? "myTurn" : "turn");
        }
        for (const sound of sounds) playSound(sound, sound === "step" ? 0.5 : 0.8);
    });
}

// ゲーム開始時の説明。OKを押すまで盤面は操作できない。
function IntroModal({ rule }: { rule: RuleKey }) {
    const okRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        okRef.current?.focus();
    }, []);

    return (
        <div className="intro-backdrop">
            <section className="intro-card" role="dialog" aria-modal="true" aria-labelledby="intro-title">
                <span className="section-index">HOW TO PLAY</span>
                <h2 id="intro-title">場の3枚目と7枚目を狙おう</h2>
                <ol className="intro-steps">
                    <li>
                        <b>1. 1枚引いて、1枚使う</b>
                        番が来ると自動で1枚引きます。手札2枚から1枚を選んで場に出します。
                    </li>
                    <li>
                        <b>2. ちょうど3枚で+3点、ちょうど7枚で+7点</b>
                        「みなみ」で7枚なら10点。7枚か、7を超えたらラウンド終了（超えたら得点なし）。
                    </li>
                    <li>
                        <b>3. {TARGET_SCORE}点先取</b>
                        届かなければ、最大{RULES[rule].laps}周で最高得点の人の勝ちです。
                    </li>
                </ol>
                <div className="intro-cards">
                    {CARD_ORDER.map((type) => (
                        <div key={type}>
                            <CardArt type={type} />
                            <div>
                                <strong>
                                    {CARD_INFO[type].label}
                                    <small>×{CARD_INFO[type].count}</small>
                                </strong>
                                <p>{CARD_INFO[type].text}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="intro-note">カードはタップすると説明が出ます。細かいルールは「遊び方」でいつでも見られます。</p>
                <div className="intro-actions">
                    <button ref={okRef} className="primary-button" onClick={gameActions.closeIntro}>
                        OK、はじめる
                    </button>
                </div>
            </section>
        </div>
    );
}

function GameScreen() {
    const game = useSelector(gameStore, (state) => state.game);
    const room = useSelector(gameStore, (state) => state.online?.room);
    if (!game || !room) return null;
    return <MatchScreen game={game} room={room} />;
}

function MatchScreen({ game, room }: { game: GameState; room: RoomView }) {
    const busy = useSelector(gameStore, (state) => state.busy);
    const error = useSelector(gameStore, (state) => state.error);
    const showIntro = useSelector(gameStore, (state) => state.showIntro);
    const selfIndex = room.seat;
    const rootRef = useRef<HTMLElement>(null);
    const layerRef = useRef<HTMLDivElement>(null);
    useGameSounds(game, selfIndex);
    useTableMotion(rootRef, layerRef, game, selfIndex);
    const burst = useBurst(game);
    const redrawPhase = useRedrawPhase(game);

    const leave = () => {
        if (window.confirm("部屋を解散すると、全員がこの部屋から出ます。解散しますか？")) {
            void gameActions.dissolveRoom();
        }
    };

    return (
        <TipProvider>
            <main className="game-page" ref={rootRef}>
                {showIntro && <IntroModal rule={game.rule} />}
                <BurstOverlay burst={burst} />
                <div className="game-toolbar">
                    <span>
                        ROOM {room.code} · ラウンド {game.round}/{game.totalRounds} · {TARGET_SCORE}点先取
                    </span>
                    <button onClick={leave}>部屋を解散</button>
                </div>
                {error && (
                    <p className="error-message" role="alert">
                        {error}
                    </p>
                )}
                {selfIndex === null ? (
                    <p className="error-message">この部屋の参加者ではありません。</p>
                ) : (
                    <>
                        <Opponents
                            game={game}
                            seats={room.seats}
                            selfIndex={selfIndex}
                            redrawing={redrawPhase !== null}
                        />
                        <Table game={game} />
                        <EventLine events={game.log} />
                        {game.status === "finished" ? (
                            <WinnerPanel game={game} busy={busy} />
                        ) : (
                            <MyArea
                                key={`${game.matchId}-${game.lastPlay?.id ?? 0}-${game.round}`}
                                game={game}
                                seats={room.seats}
                                selfIndex={selfIndex}
                                busy={busy}
                                redrawPhase={redrawPhase}
                            />
                        )}
                    </>
                )}
                <details className="log-panel">
                    <summary>
                        <strong>LOG</strong>
                    </summary>
                    <ol>
                        {game.log.map((entry) => (
                            <li key={entry.id} className={entry.tone}>
                                {entry.message}
                            </li>
                        ))}
                    </ol>
                </details>
                <div className="flight-layer" ref={layerRef} aria-hidden="true" />
            </main>
        </TipProvider>
    );
}

export function GamePage() {
    const screen = useSelector(gameStore, (state) => state.screen);

    // 前に入っていた部屋があれば、読み込み直しても同じ席へ戻る。
    useEffect(() => {
        void gameActions.resumeRoom();
    }, []);

    if (screen === "waiting") return <WaitingScreen />;
    return screen === "setup" ? <SetupScreen /> : <GameScreen />;
}
