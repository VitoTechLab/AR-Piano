import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Tone from 'tone'
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
  const [audioState, setAudioState] = useState<string>('unknown')
  const [audioError, setAudioError] = useState<string | null>(null)
  const synthRef = useRef<Tone.PolySynth | null>(null)

  useEffect(() => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.2,
        release: 0.4,
      },
    }).toDestination()

    synth.volume.value = 0
    synthRef.current = synth
    setAudioState(Tone.getContext().state)

    return () => {
      synth.dispose()
      synthRef.current = null
    }
  }, [])

  const ensureAudioReady = useCallback(async () => {
    try {
      if (Tone.getContext().state !== 'running') {
        await Tone.start()
      }
      setAudioState(Tone.getContext().state)
      setAudioError(null)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Audio init failed.'
      setAudioError(message)
      setAudioState(Tone.getContext().state)
      return false
    }
  }, [])

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
    pressDepthThreshold: 0.02,
    retriggerDelayMs: 100,
    velocitySensitivity: 1,
    onPress: (event) => {
      setLastPressed(`${event.note} (velocity: ${event.velocity.toFixed(2)})`)
      const synth = synthRef.current
      if (!synth) {
        return
      }

      const safeVelocity = Math.max(0.6, event.velocity)

      if (Tone.getContext().state !== 'running') {
        void ensureAudioReady().then((ready) => {
          if (ready) {
            synth.triggerAttackRelease(event.note, '8n', undefined, safeVelocity)
          }
        })
        return
      }

      synth.triggerAttackRelease(event.note, '8n', undefined, safeVelocity)
    },
  })

  const noteById = useMemo(() => {
    const map = new Map<string, string>()
    for (const key of pianoKeys) {
      map.set(key.id, key.note)
    }
    return map
  }, [pianoKeys])

  const hoveredNotes = useMemo(() => {
    const notes = hoverKeyIds
      .map((id) => noteById.get(id))
      .filter((value): value is string => Boolean(value))
    return notes.length > 0 ? notes.join(', ') : 'None'
  }, [hoverKeyIds, noteById])

  const activeNotes = useMemo(() => {
    const notes = activeKeyIds
      .map((id) => noteById.get(id))
      .filter((value): value is string => Boolean(value))
    return notes.length > 0 ? notes.join(', ') : 'None'
  }, [activeKeyIds, noteById])

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
            onClick={() => void (async () => {
              await ensureAudioReady()
              await start()
            })()}
            className="rounded-lg border border-cyan-300/70 bg-slate-900/90 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.5),0_10px_24px_rgba(0,0,0,0.28)]"
          >
            Start Tracking
          </button>
          <button
            type="button"
            onClick={() => void ensureAudioReady()}
            className="rounded-lg border border-emerald-300/70 bg-slate-900/90 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_10px_24px_rgba(0,0,0,0.28)]"
          >
            Enable Audio
          </button>
          <button
            type="button"
            onClick={() => void (async () => {
              const ready = await ensureAudioReady()
              if (ready) {
                synthRef.current?.triggerAttackRelease('C4', '8n', undefined, 0.6)
              }
            })()}
            className="rounded-lg border border-amber-300/70 bg-slate-900/90 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(251,191,36,0.5),0_10px_24px_rgba(0,0,0,0.28)]"
          >
            Test Sound
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
            <span className="text-xs text-slate-300">Audio</span>
            <strong className="text-sm font-semibold text-slate-100">
              {audioState}
            </strong>
          </div>
          <div className="grid gap-1 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <span className="text-xs text-slate-300">Last Pressed</span>
            <strong className="text-sm font-semibold text-slate-100">
              {lastPressed}
            </strong>
          </div>
          <div className="grid gap-1 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <span className="text-xs text-slate-300">Hovered Keys</span>
            <strong className="text-sm font-semibold text-slate-100">
              {hoveredNotes}
            </strong>
          </div>
          <div className="grid gap-1 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <span className="text-xs text-slate-300">Active Keys</span>
            <strong className="text-sm font-semibold text-slate-100">
              {activeNotes}
            </strong>
          </div>
        </div>
        {state.errorMessage && (
          <p className="mt-3 text-sm text-rose-200">Error: {state.errorMessage}</p>
        )}
        {audioError && (
          <p className="mt-2 text-sm text-rose-200">Audio Error: {audioError}</p>
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
