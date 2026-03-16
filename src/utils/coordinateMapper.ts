import type { Point3D } from '../types/handTracking'

export interface MappingConfig {
  width: number
  height: number
  mirrorX: boolean
}

export interface MappedPoint extends Point3D {
  pixelX: number
  pixelY: number
}

export const clamp01 = (value: number): number => {
  if (value < 0) {
    return 0
  }

  if (value > 1) {
    return 1
  }

  return value
}

export const mapNormalizedToPixel = (
  point: Point3D,
  config: MappingConfig,
): MappedPoint => {
  const normalizedX = clamp01(point.x)
  const normalizedY = clamp01(point.y)
  const mappedX = config.mirrorX ? 1 - normalizedX : normalizedX

  return {
    ...point,
    pixelX: mappedX * config.width,
    pixelY: normalizedY * config.height,
  }
}

export const isPointInsideBounds = (
  x: number,
  y: number,
  left: number,
  top: number,
  width: number,
  height: number,
): boolean => {
  return x >= left && x <= left + width && y >= top && y <= top + height
}
