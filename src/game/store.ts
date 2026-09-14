import { createStore } from "@tanstack/react-store";
import {
    MAX_PLAYERS,
    MIN_PLAYERS,
    createGame,
    play,
    rematch,
    type GameState,
    type RuleKey,
} from "./engine.js";
import {
    RoomError,
    isClosed,
    isWaiting,
    normalizeRoomCode,
    roomApi,
    roomCodeFromUrl,
    seatStorage,
    subscribeRoom,
    type OnlineAction,
    type RoomView,
    type SavedSeat,
} from "../online/roomClient.js";
import { loadSoundPreference, setSoundEnabled } from "../audio/sound.js";

const OFFLINE_POLL_MS = 3000;

interface OnlineState {
    seat: SavedSeat;
    room: RoomView;
    connected: boolean;
}

interface AppState {
    screen: "setup" | "waiting" | "game";
    mode: "local" | "online";
    names: string[];
    rule: RuleKey;
    joinCode: string;
    onlineName: string;
    // この端末で遊ぶときは全員分の状態、オンラインでは自分の席から見える状態。
    game: GameState | null;
    online: OnlineState | null;
    // この端末で遊ぶとき、次の人に端末を渡すまで手札を伏せておく。
    handoff: boolean;
    busy: boolean;
    soundOn: boolean;
    showIntro: boolean;
    error: string;
}

const invitedCode = roomCodeFromUrl();

export const gameStore = createStore<AppState>({
    screen: "setup",
    mode: invitedCode ? "online" : "local",
    names: ["みなみ", "ゲスト1", "ゲスト2"],
    rule: "normal",
    joinCode: invitedCode,
    onlineName: "",
    game: null,
    online: null,
    handoff: false,
    busy: false,
    soundOn: loadSoundPreference(),
    showIntro: false,
    error: "",
});

function patch(update: Partial<AppState> | ((state: AppState) => Partial<AppState>)) {
    gameStore.setState((state) => ({
        ...state,
        ...(typeof update === "function" ? update(state) : update),
    }));
}

const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "通信に失敗しました。";

// ---- オンライン対戦 ----

let unsubscribeRoom: (() => void) | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
// 自分で解散・退出したときは、「部屋が解散された」と知らせない。
let closingByMe = false;

function applyRoom(room: RoomView) {
    if (isClosed(room)) {
        if (gameStore.state.online?.room.id === room.id) {
            leaveRoom(closingByMe ? "" : "部屋が解散されました。");
        }
        return;
    }
    gameStore.setState((state) => {
        if (
            !state.online ||
            state.online.room.id !== room.id ||
            room.version < state.online.room.version
        )
            return state;
        return {
            ...state,
            screen: isWaiting(room) ? "waiting" : "game",
            game: isWaiting(room) ? null : (room.state as GameState),
            online: { ...state.online, room },
        };
    });
}

async function refreshRoom() {
    const online = gameStore.state.online;
    if (!online) return;
    try {
        const { room } = await roomApi.get(online.seat.code, online.seat.token);
        applyRoom(room);
    } catch (error) {
        if (error instanceof RoomError && error.status === 404) {
            leaveRoom("部屋の期限が切れました。");
        }
    }
}

function setConnected(connected: boolean) {
    patch((state) =>
        state.online ? { online: { ...state.online, connected } } : {},
    );
    if (pollTimer !== null) clearInterval(pollTimer);
    pollTimer = null;
    // Realtime がつながらない間は、定期的に取り直してほかの人の操作を拾う。
    if (!connected) pollTimer = setInterval(refreshRoom, OFFLINE_POLL_MS);
    else void refreshRoom();
}

function onVisible() {
    if (document.visibilityState === "visible") void refreshRoom();
}

function enterRoom(room: RoomView, seat: SavedSeat, showIntro: boolean) {
    seatStorage.save(seat);
    unsubscribeRoom?.();
    patch({
        mode: "online",
        joinCode: "",
        busy: false,
        error: "",
        online: { seat, room, connected: false },
        showIntro,
    });
    applyRoom(room);
    setConnected(false);
    unsubscribeRoom = subscribeRoom(room, {
        onUpdate: (version) => {
            if (version > (gameStore.state.online?.room.version ?? 0))
                void refreshRoom();
        },
        onConnection: setConnected,
    });
    document.addEventListener("visibilitychange", onVisible);
}

function leaveRoom(error = "") {
    unsubscribeRoom?.();
    unsubscribeRoom = null;
    if (pollTimer !== null) clearInterval(pollTimer);
    pollTimer = null;
    document.removeEventListener("visibilitychange", onVisible);
    seatStorage.clear();
    patch({ screen: "setup", game: null, online: null, busy: false, error });
}

async function withBusy(task: () => Promise<void>) {
    if (gameStore.state.busy) return;
    patch({ busy: true, error: "" });
    try {
        await task();
    } catch (error) {
        if (error instanceof RoomError && error.room) applyRoom(error.room);
        // ほかの人の操作と重なっただけなら、最新の画面を見せれば十分なので知らせない。
        const silent =
            error instanceof RoomError && error.status === 409 && error.room;
        patch({ error: silent ? "" : errorMessage(error) });
    } finally {
        patch({ busy: false });
    }
}

function sendAction(action: OnlineAction) {
    return withBusy(async () => {
        const online = gameStore.state.online;
        if (!online) return;
        const { room } = await roomApi.act(
            online.seat,
            online.room.version,
            action,
        );
        applyRoom(room);
    });
}

async function leaveOnServer(request: (seat: SavedSeat) => Promise<unknown>) {
    const online = gameStore.state.online;
    if (!online) return;
    closingByMe = true;
    try {
        await request(online.seat);
        leaveRoom();
    } finally {
        closingByMe = false;
    }
}

// 画面の操作。オンラインではサーバーへ送り、この端末ではその場で反映する。
const isOnline = () =>
    gameStore.state.mode === "online" && gameStore.state.online !== null;

export const gameActions = {
    setMode(mode: AppState["mode"]) {
        patch({ mode, error: "" });
    },
    setName(index: number, name: string) {
        patch((state) => ({
            names: state.names.map((current, nameIndex) =>
                nameIndex === index ? name : current,
            ),
        }));
    },
    addPlayer() {
        patch((state) =>
            state.names.length < MAX_PLAYERS
                ? { names: [...state.names, `ゲスト${state.names.length}`] }
                : {},
        );
    },
    removePlayer(index: number) {
        patch((state) =>
            state.names.length > MIN_PLAYERS
                ? { names: state.names.filter((_, nameIndex) => nameIndex !== index) }
                : {},
        );
    },
    setRule(rule: RuleKey) {
        patch({ rule });
    },
    setOnlineName(name: string) {
        patch({ onlineName: name });
    },
    setJoinCode(code: string) {
        patch({ joinCode: normalizeRoomCode(code) });
    },
    toggleSound() {
        const soundOn = !gameStore.state.soundOn;
        setSoundEnabled(soundOn);
        patch({ soundOn });
    },
    start() {
        patch((state) => ({
            screen: "game",
            mode: "local",
            showIntro: true,
            handoff: true,
            game: createGame(state.names, { rule: state.rule }),
            error: "",
        }));
    },
    reveal() {
        patch({ handoff: false });
    },
    play(cardId: string, discard = false) {
        if (isOnline()) return void sendAction({ type: "play", cardId, discard });
        patch((state) => {
            if (!state.game) return {};
            try {
                const next = play(state.game, { cardId, discard });
                return {
                    game: next,
                    handoff:
                        next.status === "playing" &&
                        next.currentPlayer !== state.game.currentPlayer,
                    error: "",
                };
            } catch (error) {
                return { error: errorMessage(error) };
            }
        });
    },
    playAgain() {
        if (isOnline()) return void sendAction({ type: "rematch" });
        patch((state) =>
            state.game
                ? { game: rematch(state.game), handoff: true, error: "" }
                : {},
        );
    },
    reset() {
        if (isOnline()) return leaveRoom();
        patch({ screen: "setup", game: null, error: "" });
    },
    closeIntro() {
        patch({ showIntro: false });
    },
    createRoom() {
        return withBusy(async () => {
            const { room, token } = await roomApi.create(
                gameStore.state.onlineName,
            );
            enterRoom(room, { code: room.code, token: token! }, true);
        });
    },
    joinRoom() {
        return withBusy(async () => {
            const { room, token } = await roomApi.join(
                gameStore.state.joinCode,
                gameStore.state.onlineName,
            );
            enterRoom(room, { code: room.code, token: token! }, true);
        });
    },
    resumeRoom() {
        const seat = seatStorage.load();
        if (!seat || gameStore.state.online) return;
        return withBusy(async () => {
            try {
                const { room } = await roomApi.get(seat.code, seat.token);
                if (room.seat === null || isClosed(room)) return seatStorage.clear();
                enterRoom(room, seat, false);
            } catch (error) {
                if (error instanceof RoomError && error.status === 404)
                    return seatStorage.clear();
                throw error;
            }
        });
    },
    startRoom() {
        return withBusy(async () => {
            const online = gameStore.state.online;
            if (!online) return;
            const { room } = await roomApi.start(online.seat, {
                rule: gameStore.state.rule,
            });
            applyRoom(room);
        });
    },
    // 始まる前の部屋から抜ける。部屋をつくった人の場合は解散になる。
    leaveWaitingRoom() {
        return withBusy(() => leaveOnServer(roomApi.leave));
    },
    dissolveRoom() {
        return withBusy(() => leaveOnServer(roomApi.close));
    },
};
