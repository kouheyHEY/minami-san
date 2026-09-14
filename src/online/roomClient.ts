import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameState, RuleKey } from "../game/engine.js";

// 共通の game-server（Supabase プロジェクト game-server）。公開して問題ない値だけを置く。
const SUPABASE_URL = "https://abeaebzvzzxstxfzpdol.supabase.co";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/game-rooms`;
const GAME_KEY = "minami-san";
const SEAT_STORAGE_KEY = "minami-san:online-seat";

export type OnlineAction =
    | { type: "play"; cardId: string; discard?: boolean }
    | { type: "rematch" };

export interface RoomView {
    id: string;
    code: string;
    gameKey: string;
    version: number;
    seat: number | null;
    seatCount: number;
    minSeats: number;
    seats: Array<{ name: string }>;
    state: GameState | { status: "waiting" } | { status: "closed" };
    realtime: { topic: string; key: string };
}

export interface SavedSeat {
    code: string;
    token: string;
}

export class RoomError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly room?: RoomView,
    ) {
        super(message);
    }
}

export const isWaiting = (room: RoomView) => room.state.status === "waiting";

export const isClosed = (room: RoomView) => room.state.status === "closed";

async function call(
    body: Record<string, unknown>,
): Promise<{ room: RoomView; token?: string }> {
    let response: Response;
    try {
        response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } catch {
        throw new RoomError(
            "通信できませんでした。電波の良い場所でもう一度お試しください。",
            0,
        );
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new RoomError(
            data.error ?? "通信に失敗しました。",
            response.status,
            data.room,
        );
    return data;
}

export const roomApi = {
    create: (name: string) => call({ op: "create", gameKey: GAME_KEY, name }),
    join: (code: string, name: string) =>
        call({ op: "join", gameKey: GAME_KEY, code, name }),
    get: (code: string, token: string) => call({ op: "get", code, token }),
    start: (seat: SavedSeat, options: { rule: RuleKey }) =>
        call({ op: "start", code: seat.code, token: seat.token, options }),
    act: (seat: SavedSeat, version: number, action: OnlineAction) =>
        call({
            op: "act",
            code: seat.code,
            token: seat.token,
            version,
            action,
        }),
    leave: (seat: SavedSeat) =>
        call({ op: "leave", code: seat.code, token: seat.token }),
    close: (seat: SavedSeat) =>
        call({ op: "close", code: seat.code, token: seat.token }),
};

let realtimeClient: SupabaseClient | null = null;

// ほかの人の操作は「新しい版がある」という通知だけを受け取り、状態は API から取り直す。
// Realtime のライブラリは大きいので、オンライン対戦を始めたときだけ読み込む。
export function subscribeRoom(
    room: RoomView,
    handlers: {
        onUpdate: (version: number) => void;
        onConnection: (connected: boolean) => void;
    },
) {
    if (!room.realtime.key) {
        handlers.onConnection(false);
        return () => {};
    }
    let closed = false;
    let cleanup = () => {};
    import("@supabase/supabase-js")
        .then(({ createClient }) => {
            if (closed) return;
            realtimeClient ??= createClient(SUPABASE_URL, room.realtime.key, {
                auth: { persistSession: false, autoRefreshToken: false },
            });
            const client = realtimeClient;
            const channel = client
                .channel(room.realtime.topic)
                .on("broadcast", { event: "room-updated" }, ({ payload }) =>
                    handlers.onUpdate(Number(payload?.version)),
                )
                .subscribe((status) =>
                    handlers.onConnection(status === "SUBSCRIBED"),
                );
            cleanup = () => {
                void client.removeChannel(channel);
            };
        })
        .catch(() => handlers.onConnection(false));
    return () => {
        closed = true;
        cleanup();
    };
}

export const seatStorage = {
    load(): SavedSeat | null {
        try {
            const saved = JSON.parse(
                localStorage.getItem(SEAT_STORAGE_KEY) ?? "null",
            );
            return typeof saved?.code === "string" &&
                typeof saved?.token === "string"
                ? saved
                : null;
        } catch {
            return null;
        }
    },
    save(seat: SavedSeat) {
        try {
            localStorage.setItem(SEAT_STORAGE_KEY, JSON.stringify(seat));
        } catch {
            // 保存できなくても、この画面を開いている間は遊べる。
        }
    },
    clear() {
        try {
            localStorage.removeItem(SEAT_STORAGE_KEY);
        } catch {
            // 何もしない
        }
    },
};

// 全角の英数字・小文字・空白や記号が混ざっていても、部屋コードとして読めるようにする。
export function normalizeRoomCode(value: string) {
    return value
        .normalize("NFKC")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
}

export function inviteUrl(code: string) {
    return `${window.location.origin}${window.location.pathname}#/?room=${code}`;
}

export function roomCodeFromUrl() {
    const query = window.location.hash.split("?")[1] ?? "";
    return normalizeRoomCode(new URLSearchParams(query).get("room") ?? "");
}
