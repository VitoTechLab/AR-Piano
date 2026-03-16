export interface Point3D {
  x: number
  y: number
  z: number
}

export interface PixelPoint extends Point3D {
  pixelX: number
  pixelY: number
}

export interface HandFrame {
  timestampMs: number
  wrist: PixelPoint
  thumbTip: PixelPoint
  indexTip: PixelPoint
  middleTip: PixelPoint
  ringTip: PixelPoint
  pinkyTip: PixelPoint
  indexPip: PixelPoint
  middlePip: PixelPoint
  ringPip: PixelPoint
  pinkyPip: PixelPoint
}

export type FingerId = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'

export type FingerInteractionState = 'idle' | 'hover' | 'pressed' | 'released'

export interface PianoKeyArea {
  id: string
  note: string
  x: number
  y: number
  width: number
  height: number
}

export interface FingerInteraction {
  fingerId: FingerId
  state: FingerInteractionState
  pixelX: number
  pixelY: number
  depth: number
  velocity: number
  collidedKeyId: string | null
}

export interface PianoInteractionFrame {
  timestampMs: number
  hoverKeyIds: string[]
  activeKeyIds: string[]
  fingerInteractions: FingerInteraction[]
}
