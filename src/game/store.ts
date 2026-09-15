import { createStore } from "@tanstack/react-store";
import type { GameState, RuleKey } from "./engine.js";
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
// CPU の番は、直前の結果を見る間をおいてから進める。みなの引き直しは演出が長いので長めに待つ。
const CPU_DELAY_MS = 1400;
const CPU_DELAY_AFTER_REDRAW_MS = 2800;
// 進める役の端末が止まっていても進むよう、ほかの参加者はこれだけ遅れて代わりに頼む。
const CPU_BACKUP_DELAY_MS = 6000;

interface OnlineState {
    seat: SavedSeat;
    room: RoomView;
    connected: boolean;
}

interface AppState {
    screen: "setup" | "waiting" | "game";
    rule: RuleKey;
    joinCode: string;
    onlineName: string;
    // 自分の席から見える状態（ほかの人の手札は入っていない）。
    game: GameState | null;
    online: OnlineState | null;
    busy: boolean;
    soundOn: boolean;
    showIntro: boolean;
    error: string;
}

export const gameStore = createStore<AppState>({
    screen: "setup",
    rule: "normal",
    joinCode: roomCodeFromUrl(),
    onlineName: "",
    game: null,
    online: null,
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
    scheduleCpu();
}

// ---- CPU の番 ----

let cpuTimer: ReturnType<typeof setTimeout> | null = null;
let cpuVersion = -1;

function stopCpu() {
    if (cpuTimer !== null) clearTimeout(cpuTimer);
    cpuTimer = null;
    cpuVersion = -1;
}

// いまが CPU の番なら、少し待ってからサーバーに CPU の手を進めてもらう。
// 最初の人間の席（ふつうは部屋をつくった人）の端末が進め、ほかの端末は遅れて代わりに頼む。
function scheduleCpu(retry = false) {
    const online = gameStore.state.online;
    const game = gameStore.state.game;
    if (!online || !game) return;
    const { room } = online;
    if (!retry && room.version === cpuVersion) return;
    stopCpu();
    cpuVersion = room.version;
    if (game.status !== "playing" || !room.seats[game.currentPlayer]?.cpu) return;

    const driver = room.seats.findIndex((entry) => !entry.cpu);
    const delay =
        (game.lastPlay?.cardType === "mina" ? CPU_DELAY_AFTER_REDRAW_MS : CPU_DELAY_MS) +
        (room.seat === driver ? 0 : CPU_BACKUP_DELAY_MS);
    const version = room.version;
    cpuTimer = setTimeout(async () => {
        cpuTimer = null;
        const current = gameStore.state.online;
        if (!current || current.room.version !== version) return;
        try {
            const { room: next } = await roomApi.cpu(current.seat, version);
            applyRoom(next);
        } catch (error) {
            if (error instanceof RoomError && error.room) return applyRoom(error.room);
            // 通信できなかったときは、もう一度試す
            if (!(error instanceof RoomError) || error.status === 0) scheduleCpu(true);
        }
    }, delay);
}

// ---- 部屋 ----

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
    stopCpu();
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

// 自分の席で部屋に操作を送り、返ってきた状態を映す。
function withSeat(request: (seat: SavedSeat, room: RoomView) => Promise<{ room: RoomView }>) {
    return withBusy(async () => {
        const online = gameStore.state.online;
        if (!online) return;
        const { room } = await request(online.seat, online.room);
        applyRoom(room);
    });
}

function sendAction(action: OnlineAction) {
    return withSeat((seat, room) => roomApi.act(seat, room.version, action));
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

export const gameActions = {
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
    play(cardId: string, discard = false) {
        return void sendAction({ type: "play", cardId, discard });
    },
    playAgain() {
        return void sendAction({ type: "rematch" });
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
        return withSeat((seat) => roomApi.start(seat, { rule: gameStore.state.rule }));
    },
    addCpu() {
        return withSeat((seat) => roomApi.addCpu(seat));
    },
    removeCpu(seatIndex: number) {
        return withSeat((seat) => roomApi.removeCpu(seat, seatIndex));
    },
    // 始まる前の部屋から抜ける。部屋をつくった人の場合は解散になる。
    leaveWaitingRoom() {
        return withBusy(() => leaveOnServer(roomApi.leave));
    },
    dissolveRoom() {
        return withBusy(() => leaveOnServer(roomApi.close));
    },
};
