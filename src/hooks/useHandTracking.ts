import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { HandFrame, PixelPoint, Point3D } from '../types/handTracking'
import { mapNormalizedToPixel } from '../utils/coordinateMapper'

const HAND_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const HAND_LANDMARKER_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'

const CRITICAL_LANDMARK_INDEX = {
  wrist: 0,
  thumbTip: 4,
  indexPip: 6,
  indexTip: 8,
  middlePip: 10,
  middleTip: 12,
  ringPip: 14,
  ringTip: 16,
  pinkyPip: 18,
  pinkyTip: 20,
} as const

type CriticalLandmarkName = keyof typeof CRITICAL_LANDMARK_INDEX

interface LandmarkSmoothingState {
  point: Point3D
  timestampMs: number
}

type SmoothedLandmarkMap = Partial<Record<CriticalLandmarkName, LandmarkSmoothingState>>

export interface UseHandTrackingOptions {
  mirrorX?: boolean
  maxHands?: number
  minTrackingConfidence?: number
  minHandDetectionConfidence?: number
  minHandPresenceConfidence?: number
  smoothMinAlpha?: number
  smoothMaxAlpha?: number
  smoothSpeedScale?: number
  lowLightLostFrameThreshold?: number
  onFrame?: (frame: HandFrame | null) => void
}

export interface HandTrackingState {
  hasCameraPermission: boolean
  isInitializing: boolean
  isTracking: boolean
  lowLightDetected: boolean
  errorMessage: string | null
}

export interface UseHandTrackingResult {
  videoRef: RefObject<HTMLVideoElement | null>
  latestFrameRef: RefObject<HandFrame | null>
  state: HandTrackingState
  start: () => Promise<void>
  stop: () => void
}

const toPoint3D = (landmark: NormalizedLandmark): Point3D => {
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
  }
}

const computeAdaptiveAlpha = (
  previous: Point3D,
  next: Point3D,
  deltaTimeMs: number,
  minAlpha: number,
  maxAlpha: number,
  speedScale: number,
): number => {
  const safeDelta = Math.max(deltaTimeMs, 1)
  const dx = next.x - previous.x
  const dy = next.y - previous.y
  const dz = next.z - previous.z
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const speed = distance / safeDelta
  const normalizedSpeed = Math.min(speed / speedScale, 1)

  return minAlpha + (maxAlpha - minAlpha) * normalizedSpeed
}

const smoothPoint = (
  name: CriticalLandmarkName,
  rawPoint: Point3D,
  timestampMs: number,
  store: SmoothedLandmarkMap,
  minAlpha: number,
  maxAlpha: number,
  speedScale: number,
): Point3D => {
  const previousState = store[name]

  if (!previousState) {
    store[name] = {
      point: rawPoint,
      timestampMs,
    }

    return rawPoint
  }

  const delta = timestampMs - previousState.timestampMs
  const alpha = computeAdaptiveAlpha(
    previousState.point,
    rawPoint,
    delta,
    minAlpha,
    maxAlpha,
    speedScale,
  )

  const smoothed: Point3D = {
    x: previousState.point.x + alpha * (rawPoint.x - previousState.point.x),
    y: previousState.point.y + alpha * (rawPoint.y - previousState.point.y),
    z: previousState.point.z + alpha * (rawPoint.z - previousState.point.z),
  }

  store[name] = {
    point: smoothed,
    timestampMs,
  }

  return smoothed
}

const mapPixelPoint = (
  point: Point3D,
  width: number,
  height: number,
  mirrorX: boolean,
): PixelPoint => {
  return mapNormalizedToPixel(point, {
    width,
    height,
    mirrorX,
  })
}

const buildFrame = (
  criticalLandmarks: Record<CriticalLandmarkName, Point3D>,
  timestampMs: number,
  width: number,
  height: number,
  mirrorX: boolean,
): HandFrame => {
  return {
    timestampMs,
    wrist: mapPixelPoint(criticalLandmarks.wrist, width, height, mirrorX),
    thumbTip: mapPixelPoint(criticalLandmarks.thumbTip, width, height, mirrorX),
    indexTip: mapPixelPoint(criticalLandmarks.indexTip, width, height, mirrorX),
    middleTip: mapPixelPoint(criticalLandmarks.middleTip, width, height, mirrorX),
    ringTip: mapPixelPoint(criticalLandmarks.ringTip, width, height, mirrorX),
    pinkyTip: mapPixelPoint(criticalLandmarks.pinkyTip, width, height, mirrorX),
    indexPip: mapPixelPoint(criticalLandmarks.indexPip, width, height, mirrorX),
    middlePip: mapPixelPoint(criticalLandmarks.middlePip, width, height, mirrorX),
    ringPip: mapPixelPoint(criticalLandmarks.ringPip, width, height, mirrorX),
    pinkyPip: mapPixelPoint(criticalLandmarks.pinkyPip, width, height, mirrorX),
  }
}

const extractCriticalLandmarks = (
  landmarks: NormalizedLandmark[],
): Record<CriticalLandmarkName, Point3D> | null => {
  const entries = Object.entries(CRITICAL_LANDMARK_INDEX)
  const result = {} as Record<CriticalLandmarkName, Point3D>

  for (const [name, index] of entries) {
    const typedName = name as CriticalLandmarkName
    const rawLandmark = landmarks[index]

    if (!rawLandmark) {
      return null
    }

    result[typedName] = toPoint3D(rawLandmark)
  }

  return result
}

export const useHandTracking = (
  options: UseHandTrackingOptions = {},
): UseHandTrackingResult => {
  const {
    mirrorX = true,
    maxHands = 1,
    minTrackingConfidence = 0.65,
    minHandDetectionConfidence = 0.65,
    minHandPresenceConfidence = 0.65,
    smoothMinAlpha = 0.2,
    smoothMaxAlpha = 0.85,
    smoothSpeedScale = 0.012,
    lowLightLostFrameThreshold = 5,
    onFrame,
  } = options

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const latestFrameRef = useRef<HandFrame | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const handLandmarkerRef = useRef<HandLandmarker | null>(null)
  const frameRequestRef = useRef<number | null>(null)
  const smoothingStoreRef = useRef<SmoothedLandmarkMap>({})
  const lastVideoTimeRef = useRef<number>(-1)
  const lostFrameCountRef = useRef<number>(0)
  const onFrameRef = useRef<typeof onFrame>(onFrame)

  const [state, setState] = useState<HandTrackingState>({
    hasCameraPermission: true,
    isInitializing: false,
    isTracking: false,
    lowLightDetected: false,
    errorMessage: null,
  })

  useEffect(() => {
    onFrameRef.current = onFrame
  }, [onFrame])

  const stop = useCallback(() => {
    if (frameRequestRef.current !== null) {
      cancelAnimationFrame(frameRequestRef.current)
      frameRequestRef.current = null
    }

    const stream = streamRef.current

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    if (handLandmarkerRef.current) {
      handLandmarkerRef.current.close()
      handLandmarkerRef.current = null
    }

    smoothingStoreRef.current = {}
    latestFrameRef.current = null
    lastVideoTimeRef.current = -1
    lostFrameCountRef.current = 0

    onFrameRef.current?.(null)

    setState((previous) => ({
      ...previous,
      isTracking: false,
      lowLightDetected: false,
    }))
  }, [])

  const trackFrame = useCallback(() => {
    const video = videoRef.current
    const handLandmarker = handLandmarkerRef.current

    if (!video || !handLandmarker) {
      return
    }

    if (video.readyState < 2) {
      frameRequestRef.current = requestAnimationFrame(trackFrame)
      return
    }

    if (video.currentTime === lastVideoTimeRef.current) {
      frameRequestRef.current = requestAnimationFrame(trackFrame)
      return
    }

    lastVideoTimeRef.current = video.currentTime
    const now = performance.now()

    const detection = handLandmarker.detectForVideo(video, now)
    const firstHand = detection.landmarks[0]

    if (!firstHand) {
      lostFrameCountRef.current += 1
      latestFrameRef.current = null
      onFrameRef.current?.(null)

      setState((previous) => {
        const lowLight = lostFrameCountRef.current > lowLightLostFrameThreshold
        if (previous.lowLightDetected === lowLight) {
          return previous
        }

        return {
          ...previous,
          lowLightDetected: lowLight,
        }
      })

      frameRequestRef.current = requestAnimationFrame(trackFrame)
      return
    }

    lostFrameCountRef.current = 0
    const extracted = extractCriticalLandmarks(firstHand)

    if (!extracted) {
      frameRequestRef.current = requestAnimationFrame(trackFrame)
      return
    }

    const smoothedLandmarks = {} as Record<CriticalLandmarkName, Point3D>

    for (const name of Object.keys(extracted) as CriticalLandmarkName[]) {
      smoothedLandmarks[name] = smoothPoint(
        name,
        extracted[name],
        now,
        smoothingStoreRef.current,
        smoothMinAlpha,
        smoothMaxAlpha,
        smoothSpeedScale,
      )
    }

    const frame = buildFrame(
      smoothedLandmarks,
      now,
      video.videoWidth,
      video.videoHeight,
      mirrorX,
    )

    latestFrameRef.current = frame
    onFrameRef.current?.(frame)

    setState((previous) => {
      if (!previous.lowLightDetected) {
        return previous
      }

      return {
        ...previous,
        lowLightDetected: false,
      }
    })

    frameRequestRef.current = requestAnimationFrame(trackFrame)
  }, [
    lowLightLostFrameThreshold,
    mirrorX,
    smoothMaxAlpha,
    smoothMinAlpha,
    smoothSpeedScale,
  ])

  const start = useCallback(async () => {
    if (state.isInitializing || state.isTracking) {
      return
    }

    setState((previous) => ({
      ...previous,
      isInitializing: true,
      errorMessage: null,
    }))

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      })

      const video = videoRef.current
      if (!video) {
        throw new Error('Video element is not mounted yet.')
      }

      streamRef.current = stream
      video.srcObject = stream
      video.playsInline = true
      video.muted = true
      await video.play()

      const vision = await FilesetResolver.forVisionTasks(HAND_LANDMARKER_WASM_URL)
      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_LANDMARKER_MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: maxHands,
        minTrackingConfidence,
        minHandDetectionConfidence,
        minHandPresenceConfidence,
      })

      handLandmarkerRef.current = handLandmarker

      setState((previous) => ({
        ...previous,
        hasCameraPermission: true,
        isInitializing: false,
        isTracking: true,
        lowLightDetected: false,
      }))

      frameRequestRef.current = requestAnimationFrame(trackFrame)
    } catch (error) {
      stop()
      const fallbackMessage = 'Failed to initialize camera or hand tracker.'
      const message = error instanceof Error ? error.message : fallbackMessage

      setState((previous) => ({
        ...previous,
        hasCameraPermission: false,
        isInitializing: false,
        isTracking: false,
        errorMessage: message,
      }))
    }
  }, [
    maxHands,
    minHandDetectionConfidence,
    minHandPresenceConfidence,
    minTrackingConfidence,
    state.isInitializing,
    state.isTracking,
    stop,
    trackFrame,
  ])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return {
    videoRef,
    latestFrameRef,
    state,
    start,
    stop,
  }
}
