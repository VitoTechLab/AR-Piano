import { useCallback, useMemo, useState } from 'react'
import { useHandTracking } from './hooks/useHandTracking'
import { usePianoInteraction } from './hooks/usePianoInteraction'
import type { PianoKeyArea } from './types/handTracking'

const TRACKING_WIDTH = 1280
const TRACKING_HEIGHT = 720

const createPianoKeys = (
  width: number,
  height: number,
  notes: string[],
): PianoKeyArea[] => {
  const keyboardHeight = height * 0.32
  const keyWidth = width / notes.length
  const top = height - keyboardHeight

  return notes.map((note, index) => {
    return {
      id: `key-${index + 1}`,
      note,
      x: index * keyWidth,
      y: top,
      width: keyWidth,
      height: keyboardHeight,
    }
  })
}

function App() {
  const [lastPressed, setLastPressed] = useState<string>('None')

  const pianoKeys = useMemo(
    () =>
      createPianoKeys(TRACKING_WIDTH, TRACKING_HEIGHT, [
        'C4',
        'D4',
        'E4',
        'F4',
        'G4',
        'A4',
        'B4',
        'C5',
      ]),
    [],
  )

  const { activeKeyIds, hoverKeyIds, processFrame } = usePianoInteraction({
    keys: pianoKeys,
    pressDepthThreshold: -0.05,
    retriggerDelayMs: 100,
    velocitySensitivity: 1,
    onPress: (event) => {
      setLastPressed(`${event.note} (velocity: ${event.velocity.toFixed(2)})`)
    },
  })

  const { videoRef, state, start, stop } = useHandTracking({
    mirrorX: true,
    maxHands: 1,
    minTrackingConfidence: 0.65,
    minHandDetectionConfidence: 0.65,
    minHandPresenceConfidence: 0.65,
    smoothMinAlpha: 0.2,
    smoothMaxAlpha: 0.9,
    smoothSpeedScale: 0.012,
    lowLightLostFrameThreshold: 5,
    onFrame: processFrame,
  })

  const isHovered = useCallback(
    (keyId: string) => {
      return hoverKeyIds.includes(keyId)
    },
    [hoverKeyIds],
  )

  const isPressed = useCallback(
    (keyId: string) => {
      return activeKeyIds.includes(keyId)
    },
    [activeKeyIds],
  )

  return (
    <main className="mx-auto my-5 grid w-[min(1200px,calc(100vw-32px))] gap-4 md:my-8">
      <header className="glass-panel rounded-2xl border border-white/10 p-4 md:p-5">
        <h1 className="neon-text m-0 text-2xl font-bold text-slate-100 md:text-3xl">
          AR Piano Hand Tracking Engine
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-200 md:text-base">
          Logic test stage: smooth landmark tracking, depth press detection, and
          piano key collision.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => void start()}
            className="rounded-lg border border-cyan-300/70 bg-slate-900/90 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.5),0_10px_24px_rgba(0,0,0,0.28)]"
          >
            Start Tracking
          </button>
          <button
            type="button"
            onClick={stop}
            className="rounded-lg border border-fuchsia-300/70 bg-slate-900/90 px-4 py-2 text-sm font-semibold text-fuchsia-100 transition hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(232,121,249,0.5),0_10px_24px_rgba(0,0,0,0.28)]"
          >
            Stop Tracking
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <span className="text-xs text-slate-300">Tracking</span>
            <strong className="text-sm font-semibold text-slate-100">
              {state.isTracking ? 'Active' : 'Idle'}
            </strong>
          </div>
          <div className="grid gap-1 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <span className="text-xs text-slate-300">Camera Permission</span>
            <strong className="text-sm font-semibold text-slate-100">
              {state.hasCameraPermission ? 'Granted' : 'Denied'}
            </strong>
          </div>
          <div className="grid gap-1 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <span className="text-xs text-slate-300">Low Light</span>
            <strong className="text-sm font-semibold text-slate-100">
              {state.lowLightDetected ? 'Detected' : 'Normal'}
            </strong>
          </div>
          <div className="grid gap-1 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <span className="text-xs text-slate-300">Last Pressed</span>
            <strong className="text-sm font-semibold text-slate-100">
              {lastPressed}
            </strong>
          </div>
        </div>
        {state.errorMessage && (
          <p className="mt-3 text-sm text-rose-200">Error: {state.errorMessage}</p>
        )}
      </header>

      <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#02040d]">
          <video
            ref={videoRef}
            className="h-full w-full scale-x-[-1] object-cover"
            autoPlay
            muted
            playsInline
          />
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {pianoKeys.map((key) => {
              const left = (key.x / TRACKING_WIDTH) * 100
              const width = (key.width / TRACKING_WIDTH) * 100
              const top = (key.y / TRACKING_HEIGHT) * 100
              const height = (key.height / TRACKING_HEIGHT) * 100

              const baseKeyClass =
                'absolute flex items-end justify-center border border-white/20 bg-white/10 pb-2 text-[11px] font-semibold text-cyan-100 transition-all duration-75'

              const hoverClass = isHovered(key.id)
                ? 'bg-cyan-300/20 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.45)]'
                : ''

              const pressedClass = isPressed(key.id)
                ? 'bg-fuchsia-500/40 shadow-[0_0_14px_rgba(176,38,255,0.75),inset_0_0_12px_rgba(255,255,255,0.2)]'
                : ''

              const keyClass = [baseKeyClass, hoverClass, pressedClass]
                .filter((value) => value.length > 0)
                .join(' ')

              return (
                <div
                  key={key.id}
                  className={keyClass}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    top: `${top}%`,
                    height: `${height}%`,
                  }}
                >
                  <span>{key.note}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
