// 効果音。素材: イワシロ音楽素材（https://iwashiro-sounds.work/）
const SOUND_FILES = {
    step: 'step.mp3',
    item: 'item.mp3',
    chain: 'chain.mp3',
    danger: 'danger.mp3',
    turn: 'turn.mp3',
    myTurn: 'my-turn.mp3',
    win: 'win.mp3',
} as const

export type SoundName = keyof typeof SOUND_FILES

const STORAGE_KEY = 'minami-san:sound'

let context: AudioContext | null = null
const buffers = new Map<SoundName, Promise<AudioBuffer | null>>()

export function loadSoundPreference() {
    try {
        return localStorage.getItem(STORAGE_KEY) !== 'off'
    } catch {
        return true
    }
}

let enabled = loadSoundPreference()

function loadBuffer(audio: AudioContext, name: SoundName) {
    let buffer = buffers.get(name)
    if (!buffer) {
        buffer = fetch(`${import.meta.env.BASE_URL}sounds/${SOUND_FILES[name]}`)
            .then((response) => response.arrayBuffer())
            .then((data) => audio.decodeAudioData(data))
            .catch(() => null)
        buffers.set(name, buffer)
    }
    return buffer
}

// ブラウザは画面に触れるまで音を鳴らせないので、最初の操作で準備して読み込んでおく。
function unlock() {
    if (!enabled) return
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
    for (const name of Object.keys(SOUND_FILES) as SoundName[]) void loadBuffer(context, name)
}

window.addEventListener('pointerdown', unlock, { capture: true })
window.addEventListener('keydown', unlock, { capture: true })

export function playSound(name: SoundName, volume = 1) {
    const audio = context
    if (!enabled || !audio) return
    void loadBuffer(audio, name).then((buffer) => {
        if (!buffer || !enabled || audio.state !== 'running') return
        const source = audio.createBufferSource()
        const gain = audio.createGain()
        source.buffer = buffer
        gain.gain.value = volume
        source.connect(gain).connect(audio.destination)
        source.start()
    })
}

export function setSoundEnabled(value: boolean) {
    enabled = value
    try {
        localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off')
    } catch {
        // 保存できなくても、この画面を開いている間は反映する
    }
    if (value) unlock()
}
