import { useSelector } from "@tanstack/react-store";
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
    CARD_INFO,
    CARD_TYPES,
    FIELD_LIMIT,
    MAX_PLAYERS,
    MIN_PLAYERS,
    RULES,
    TARGET_SCORE,
    cardWeight,
    fieldCount,
    viewFor,
    type Card,
    type CardType,
    type GameState,
    type RuleKey,
} from "../game/engine.js";
import { gameActions, gameStore } from "../game/store.js";
import { CARD_ORDER, CardArt } from "./CardArt.js";
import { inviteUrl, normalizeRoomCode } from "../online/roomClient.js";
import { playSound, type SoundName } from "../audio/sound.js";

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

function LocalSetup() {
    const names = useSelector(gameStore, (state) => state.names);
    return (
        <>
            <div className="player-inputs">
                {names.map((name, index) => (
                    <div key={index} className="player-input">
                        <span>PLAYER {index + 1}</span>
                        <input
                            value={name}
                            maxLength={16}
                            onChange={(event) => gameActions.setName(index, event.target.value)}
                            aria-label={`プレイヤー${index + 1}の名前`}
                        />
                        {names.length > MIN_PLAYERS && (
                            <button
                                type="button"
                                className="remove-player"
                                aria-label={`プレイヤー${index + 1}を外す`}
                                onClick={() => gameActions.removePlayer(index)}
                            >
                                ×
                            </button>
                        )}
                    </div>
                ))}
                {names.length < MAX_PLAYERS && (
                    <button type="button" className="add-player" onClick={gameActions.addPlayer}>
                        ＋ 人を増やす
                    </button>
                )}
            </div>
            <RuleSwitch />
            <button className="primary-button start-button" onClick={gameActions.start}>
                ゲームをはじめる <span aria-hidden="true">→</span>
            </button>
            <p className="setup-note">1台の端末を順番に回して遊びます。</p>
        </>
    );
}

function SetupScreen() {
    const mode = useSelector(gameStore, (state) => state.mode);

    return (
        <main className="setup-page">
            <section className="hero-card">
                <div className="mode-switch" role="group" aria-label="遊び方">
                    <button aria-pressed={mode === "local"} onClick={() => gameActions.setMode("local")}>
                        この端末で
                    </button>
                    <button aria-pressed={mode === "online"} onClick={() => gameActions.setMode("online")}>
                        オンライン対戦
                    </button>
                </div>
                {mode === "online" ? <OnlineSetup /> : <LocalSetup />}
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
                        ? "部屋コードか招待リンクを送ってください。そろったら始めましょう。"
                        : "部屋をつくった人が始めると、ゲームが始まります。"}
                </p>
                <strong className="room-code">{room.code}</strong>
                <ol className="member-list" aria-label={`参加者 ${count}人`}>
                    {room.seats.map((seat, index) => (
                        <li key={index}>
                            <span>{seat.name}</span>
                            {index === 0 && <small>ホスト</small>}
                            {index === room.seat && <small className="is-self">あなた</small>}
                        </li>
                    ))}
                </ol>
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

function Scoreboard({ game, selfIndex }: { game: GameState; selfIndex: number | null }) {
    return (
        <ol className="scoreboard" aria-label="得点">
            {game.players.map((player, index) => {
                const turn = game.status === "playing" && game.currentPlayer === index;
                const winner = game.status === "finished" && game.winners.includes(index);
                return (
                    <li
                        key={player.id}
                        className={`score-card ${turn ? "is-turn" : ""} ${winner ? "is-winner" : ""}`}
                        aria-current={turn ? "true" : undefined}
                    >
                        <span className="score-name">
                            {player.name}
                            {index === selfIndex && <small>あなた</small>}
                        </span>
                        <strong className="score-value">{player.score}</strong>
                        <span className="score-hand" aria-label={`手札${player.handCount}枚`}>
                            {Array.from({ length: player.handCount }, (_, card) => (
                                <i key={card} />
                            ))}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

// 場。7つの枠に左から詰めて置き、3枠目と7枠目が得点になることを見せる。
function FieldPanel({ game }: { game: GameState }) {
    const count = fieldCount(game.field);
    const emptySlots = Array.from(
        { length: Math.max(0, FIELD_LIMIT - count) },
        (_, index) => count + index + 1,
    );
    return (
        <section className="field-panel" aria-label={`場 ${count}枚`}>
            <div className="field-head">
                <div className="field-count">
                    <strong>{count}</strong>
                    <span>/ {FIELD_LIMIT}枚</span>
                </div>
                <dl className="field-meta">
                    <div>
                        <dt>山札</dt>
                        <dd>{game.deckCount}</dd>
                    </div>
                    <div>
                        <dt>ラウンド</dt>
                        <dd>
                            {game.round}/{game.totalRounds}
                        </dd>
                    </div>
                </dl>
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
                    <li key={`slot-${slot}`} className={`field-slot slot-${slot}`}>
                        {slot === 3 ? "+3" : slot === FIELD_LIMIT ? "+7" : ""}
                    </li>
                ))}
            </ol>
            {game.direction === -1 && <p className="direction-note">もも：手番の順が逆回り</p>}
        </section>
    );
}

// カードの説明の吹き出し。開けるのは画面全体で1つだけで、ほかの場所に触れたら閉じる。
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

function CardFace({
    card,
    align,
    isNew = false,
    selected = false,
    onSelect,
}: {
    card: Card;
    align: TipAlign;
    isNew?: boolean;
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
                role={onSelect ? "radio" : undefined}
                aria-checked={onSelect ? selected : undefined}
                aria-expanded={tipOpen}
                aria-label={`${info.label}：${info.text}`}
                className={`card card-${card.type} ${selected ? "is-selected" : ""}`}
                onPointerDown={keepTip}
                onClick={press}
            >
                <CardArt type={card.type} />
                <strong>{info.label}</strong>
                {isNew && <em>NEW</em>}
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

function outcomeText(card: Card, after: number) {
    if (after === 3) return "3枚目で+3点";
    if (after === FIELD_LIMIT) return `7枚目で+${card.type === CARD_TYPES.MINAMI ? 10 : 7}点`;
    if (after > FIELD_LIMIT) return "7を超えて得点なし";
    return "";
}

function HandPanel({ game, selfIndex, busy }: { game: GameState; selfIndex: number; busy: boolean }) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const player = game.players[selfIndex];
    const selected = player.hand.find((card) => card.id === selectedId) ?? null;

    if (game.currentPlayer !== selfIndex) {
        return (
            <section className="hand-panel is-waiting">
                <div className="panel-kicker">WAITING</div>
                <h2>{game.players[game.currentPlayer].name}の番です</h2>
                <p>あなたの手札</p>
                <div className="hand-cards">
                    {player.hand.map((card) => (
                        <CardFace key={card.id} card={card} align="start" />
                    ))}
                </div>
            </section>
        );
    }

    const count = fieldCount(game.field);
    const after = selected
        ? selected.type === CARD_TYPES.NAMI
            ? 1
            : count + cardWeight(selected)
        : null;
    const outcome = selected && after !== null ? outcomeText(selected, after) : "";

    return (
        <section className={`hand-panel ${busy ? "is-busy" : ""}`} aria-busy={busy}>
            <div className="panel-kicker">YOUR TURN</div>
            <h2>1枚えらんで使う</h2>
            <div className="hand-cards" role="radiogroup" aria-label="手札">
                {player.hand.map((card, index) => (
                    <CardFace
                        key={card.id}
                        card={card}
                        align={index === 0 ? "start" : "end"}
                        isNew={card.id === game.drawnCardId}
                        selected={card.id === selectedId}
                        onSelect={() => setSelectedId(card.id)}
                    />
                ))}
            </div>
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
        </section>
    );
}

// この端末で遊ぶとき、次の人に端末を渡すまで手札を伏せる。
function HandoffPanel({ game }: { game: GameState }) {
    const next = game.players[game.currentPlayer];
    return (
        <section className="hand-panel handoff-panel">
            <div className="panel-kicker">NEXT</div>
            <h2>{next.name}の番</h2>
            <p>{next.name}に端末を渡してください。</p>
            <div className="action-buttons">
                <button className="primary-button" onClick={gameActions.reveal}>
                    手札を見る
                </button>
            </div>
        </section>
    );
}

function WinnerPanel({ game, online, busy }: { game: GameState; online: boolean; busy: boolean }) {
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
        <section className="hand-panel winner-panel" role="status">
            <div className="panel-kicker">WINNER</div>
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
                <button
                    className="ghost-button"
                    onClick={online ? dissolve : gameActions.reset}
                    disabled={busy}
                >
                    {online ? "部屋を解散する" : "終わる"}
                </button>
            </div>
        </section>
    );
}

// 直近の出来事。操作パネルのすぐ上に、高さを固定して並べる。
function EventFeed({ events }: { events: GameState["log"] }) {
    return (
        <div className="event-feed" aria-live="polite">
            {events.slice(0, 2).map((event, index) => (
                <p key={event.id} className={`event-line ${event.tone} ${index === 0 ? "is-latest" : ""}`}>
                    {event.message}
                </p>
            ))}
        </div>
    );
}

const BURST_MS = 1300;

type Burst = { key: string; kind: "three" | "seven" | "over"; title: string; detail: string };

const playKey = (game: GameState) =>
    game.lastPlay ? `${game.matchId}:${game.lastPlay.id}` : null;

// 3点・7点・7超えのときに大きく見せる。開いた直後（読み込み直し）は見せない。
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
        setBurst(next);
        window.setTimeout(() => setBurst((shown) => (shown?.key === key ? null : shown)), BURST_MS);
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
    if (!game) return null;
    return <MatchScreen stored={game} />;
}

function MatchScreen({ stored }: { stored: GameState }) {
    const online = useSelector(gameStore, (state) => state.online);
    const handoff = useSelector(gameStore, (state) => state.handoff);
    const busy = useSelector(gameStore, (state) => state.busy);
    const error = useSelector(gameStore, (state) => state.error);
    const showIntro = useSelector(gameStore, (state) => state.showIntro);
    const selfIndex = online ? online.room.seat : null;
    // この端末で遊ぶときは、いま手札を見てよい人の目線で表示する。
    const handSeat = online ? selfIndex : handoff ? null : stored.currentPlayer;
    const game = useMemo(
        () => (online ? stored : viewFor(stored, handSeat)),
        [stored, online, handSeat],
    );
    useGameSounds(game, selfIndex);
    const burst = useBurst(game);

    const leave = () => {
        if (!online) return gameActions.reset();
        if (window.confirm("部屋を解散すると、全員がこの部屋から出ます。解散しますか？")) {
            void gameActions.dissolveRoom();
        }
    };

    return (
        <TipProvider>
        <main className="game-page">
            {showIntro && <IntroModal rule={game.rule} />}
            <BurstOverlay burst={burst} />
            <div className="game-toolbar">
                <div>
                    <span>{online ? `ONLINE · ROOM ${online.room.code}` : "LOCAL MATCH"}</span>
                    <strong>
                        {RULES[game.rule].label} · {TARGET_SCORE}点先取
                    </strong>
                </div>
                <button onClick={leave}>{online ? "部屋を解散" : "名前入力へ戻る"}</button>
            </div>
            {error && (
                <p className="error-message game-error" role="alert">
                    {error}
                </p>
            )}
            <div className="match-layout">
                <Scoreboard game={game} selfIndex={selfIndex} />
                <FieldPanel game={game} />
                <div className="action-area">
                    <EventFeed events={game.log} />
                    {game.status === "finished" ? (
                        <WinnerPanel game={game} online={online !== null} busy={busy} />
                    ) : handSeat === null ? (
                        <HandoffPanel game={game} />
                    ) : (
                        <HandPanel
                            key={`${game.matchId}-${game.lastPlay?.id ?? 0}-${game.round}`}
                            game={game}
                            selfIndex={handSeat}
                            busy={busy}
                        />
                    )}
                </div>
                <details className="log-panel">
                    <summary>
                        <strong>LOG</strong>
                        <small>{game.log[0]?.message}</small>
                    </summary>
                    <ol>
                        {game.log.map((entry) => (
                            <li key={entry.id} className={entry.tone}>
                                {entry.message}
                            </li>
                        ))}
                    </ol>
                </details>
            </div>
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
