import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
import type {
  FingerId,
  FingerInteraction,
  FingerInteractionState,
  HandFrame,
  PianoInteractionFrame,
  PianoKeyArea,
  PixelPoint,
} from '../types/handTracking'
import { isPointInsideBounds } from '../utils/coordinateMapper'

const CORE_FINGERS: FingerId[] = ['index', 'middle', 'ring', 'pinky']

interface FingerPair {
  fingerId: FingerId
  tip: PixelPoint
  pip: PixelPoint
}

interface InternalFingerState {
  previousY: number
  previousTimestampMs: number
  previousState: FingerInteractionState
  previousCollidedKeyId: string | null
}

export interface UsePianoInteractionOptions {
  keys: PianoKeyArea[]
  pressDepthThreshold?: number
  retriggerDelayMs?: number
  velocitySensitivity?: number
  onPress?: (event: { keyId: string; note: string; velocity: number }) => void
  onRelease?: (event: { keyId: string; note: string }) => void
}

export interface UsePianoInteractionResult {
  activeKeyIds: string[]
  hoverKeyIds: string[]
  latestFrameRef: RefObject<PianoInteractionFrame | null>
  processFrame: (frame: HandFrame | null) => void
}

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min
  }

  if (value > max) {
    return max
  }

  return value
}

const getFingerPairs = (frame: HandFrame): FingerPair[] => {
  return [
    {
      fingerId: 'index',
      tip: frame.indexTip,
      pip: frame.indexPip,
    },
    {
      fingerId: 'middle',
      tip: frame.middleTip,
      pip: frame.middlePip,
    },
    {
      fingerId: 'ring',
      tip: frame.ringTip,
      pip: frame.ringPip,
    },
    {
      fingerId: 'pinky',
      tip: frame.pinkyTip,
      pip: frame.pinkyPip,
    },
  ]
}

const findCollidedKey = (
  x: number,
  y: number,
  keys: PianoKeyArea[],
): PianoKeyArea | null => {
  for (const key of keys) {
    if (isPointInsideBounds(x, y, key.x, key.y, key.width, key.height)) {
      return key
    }
  }

  return null
}

const areSameStringSets = (current: string[], next: string[]): boolean => {
  if (current.length !== next.length) {
    return false
  }

  const currentSorted = [...current].sort()
  const nextSorted = [...next].sort()

  return currentSorted.every((value, index) => value === nextSorted[index])
}

export const usePianoInteraction = (
  options: UsePianoInteractionOptions,
): UsePianoInteractionResult => {
  const {
    keys,
    pressDepthThreshold = -0.05,
    retriggerDelayMs = 100,
    velocitySensitivity = 1,
    onPress,
    onRelease,
  } = options

  const [activeKeyIds, setActiveKeyIds] = useState<string[]>([])
  const [hoverKeyIds, setHoverKeyIds] = useState<string[]>([])

  const latestFrameRef = useRef<PianoInteractionFrame | null>(null)
  const fingerStateRef = useRef<Partial<Record<FingerId, InternalFingerState>>>({})
  const lastTriggerRef = useRef<Record<string, number>>({})

  const keyMap = useMemo(() => {
    const map = new Map<string, PianoKeyArea>()

    for (const key of keys) {
      map.set(key.id, key)
    }

    return map
  }, [keys])

  const processFrame = useCallback(
    (frame: HandFrame | null) => {
      if (!frame) {
        const activeSnapshot = [...activeKeyIds]

        for (const keyId of activeSnapshot) {
          const key = keyMap.get(keyId)
          if (key) {
            onRelease?.({
              keyId,
              note: key.note,
            })
          }
        }

        if (activeSnapshot.length > 0) {
          setActiveKeyIds([])
        }

        if (hoverKeyIds.length > 0) {
          setHoverKeyIds([])
        }

        latestFrameRef.current = null
        return
      }

      const hovered = new Set<string>()
      const pressed = new Set<string>()
      const fingerInteractions: FingerInteraction[] = []

      const fingerPairs = getFingerPairs(frame)

      for (const pair of fingerPairs) {
        const internalState =
          fingerStateRef.current[pair.fingerId] ??
          ({
            previousY: pair.tip.pixelY,
            previousTimestampMs: frame.timestampMs,
            previousState: 'idle',
            previousCollidedKeyId: null,
          } satisfies InternalFingerState)

        const collidedKey = findCollidedKey(pair.tip.pixelX, pair.tip.pixelY, keys)
        const depth = pair.tip.z - pair.pip.z
        const deltaY = internalState.previousY - pair.tip.pixelY
        const deltaTime = Math.max(frame.timestampMs - internalState.previousTimestampMs, 1)
        const velocityPerMs = (deltaY / deltaTime) * velocitySensitivity
        const velocity = clamp(velocityPerMs, 0, 1)
        const keyChanged = internalState.previousCollidedKeyId !== collidedKey?.id

        let nextState: FingerInteractionState = 'idle'

        if (collidedKey) {
          hovered.add(collidedKey.id)
          nextState = 'hover'
        }

        const isPressed = collidedKey !== null && depth < pressDepthThreshold

        if (isPressed && collidedKey) {
          const lastTriggerAt = lastTriggerRef.current[collidedKey.id] ?? 0
          const elapsed = frame.timestampMs - lastTriggerAt
          const shouldTryTrigger =
            internalState.previousState !== 'pressed' || keyChanged

          if (shouldTryTrigger && elapsed >= retriggerDelayMs) {
            lastTriggerRef.current[collidedKey.id] = frame.timestampMs
            pressed.add(collidedKey.id)
            nextState = 'pressed'

            onPress?.({
              keyId: collidedKey.id,
              note: collidedKey.note,
              velocity,
            })
          } else {
            pressed.add(collidedKey.id)
            nextState = 'pressed'
          }
        }

        const wasPressed = internalState.previousState === 'pressed'

        if (wasPressed && (!isPressed || keyChanged)) {
          const previousKeyId = internalState.previousCollidedKeyId
          if (previousKeyId) {
            const key = keyMap.get(previousKeyId)
            if (key) {
              onRelease?.({
                keyId: previousKeyId,
                note: key.note,
              })
            }
          }

          if (!isPressed) {
            nextState = 'released'
          }
        }

        fingerStateRef.current[pair.fingerId] = {
          previousY: pair.tip.pixelY,
          previousTimestampMs: frame.timestampMs,
          previousState: nextState,
          previousCollidedKeyId: collidedKey?.id ?? null,
        }

        fingerInteractions.push({
          fingerId: pair.fingerId,
          state: nextState,
          pixelX: pair.tip.pixelX,
          pixelY: pair.tip.pixelY,
          depth,
          velocity,
          collidedKeyId: collidedKey?.id ?? null,
        })
      }

      for (const fingerId of CORE_FINGERS) {
        if (!fingerStateRef.current[fingerId]) {
          fingerStateRef.current[fingerId] = {
            previousY: 0,
            previousTimestampMs: frame.timestampMs,
            previousState: 'idle',
            previousCollidedKeyId: null,
          }
        }
      }

      const nextHover = Array.from(hovered)
      const nextActive = Array.from(pressed)

      if (!areSameStringSets(hoverKeyIds, nextHover)) {
        setHoverKeyIds(nextHover)
      }

      if (!areSameStringSets(activeKeyIds, nextActive)) {
        setActiveKeyIds(nextActive)
      }

      latestFrameRef.current = {
        timestampMs: frame.timestampMs,
        hoverKeyIds: nextHover,
        activeKeyIds: nextActive,
        fingerInteractions,
      }
    },
    [activeKeyIds, hoverKeyIds, keyMap, keys, onPress, onRelease, pressDepthThreshold, retriggerDelayMs, velocitySensitivity],
  )

  return {
    activeKeyIds,
    hoverKeyIds,
    latestFrameRef,
    processFrame,
  }
}
