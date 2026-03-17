import type { Shape, BBox } from '../types/shapes'
import { getShapeBBox } from './geometry'

export interface SnapGuide {
  type: 'x' | 'y'
  value: number        // canvas coordinate of the guide line
  from: number         // start of the guide line (perpendicular axis)
  to: number           // end of the guide line
}

export interface SnapResult {
  dx: number           // corrected delta X
  dy: number           // corrected delta Y
  guides: SnapGuide[]
}

// Edges + center of a bbox
function xAnchors(b: BBox) {
  return [b.x, b.x + b.width / 2, b.x + b.width]
}
function yAnchors(b: BBox) {
  return [b.y, b.y + b.height / 2, b.y + b.height]
}

export function computeSmartSnap(
  movingBBox: BBox,          // bbox AFTER applying raw dx/dy
  staticShapes: Shape[],     // shapes NOT being moved
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
  disabled: boolean,
): SnapResult {
  if (disabled) return { dx: 0, dy: 0, guides: [] }

  const THRESHOLD = 5 / zoom  // 5 screen pixels in canvas space

  // Collect all target X and Y values from static shapes + canvas bounds
  const targetsX: { value: number; bbox: BBox }[] = []
  const targetsY: { value: number; bbox: BBox }[] = []

  const canvasBBox: BBox = { x: 0, y: 0, width: canvasWidth, height: canvasHeight }
  for (const v of xAnchors(canvasBBox)) targetsX.push({ value: v, bbox: canvasBBox })
  for (const v of yAnchors(canvasBBox)) targetsY.push({ value: v, bbox: canvasBBox })

  for (const shape of staticShapes) {
    const b = getShapeBBox(shape)
    for (const v of xAnchors(b)) targetsX.push({ value: v, bbox: b })
    for (const v of yAnchors(b)) targetsY.push({ value: v, bbox: b })
  }

  let snapDx = 0
  let snapDy = 0
  let bestDistX = THRESHOLD
  let bestDistY = THRESHOLD
  const guides: SnapGuide[] = []

  // Try snapping each moving anchor to each static X target
  for (const movingAnchorX of xAnchors(movingBBox)) {
    for (const target of targetsX) {
      const dist = Math.abs(movingAnchorX - target.value)
      if (dist < bestDistX) {
        bestDistX = dist
        snapDx = target.value - movingAnchorX
      }
    }
  }

  // Try snapping each moving anchor to each static Y target
  for (const movingAnchorY of yAnchors(movingBBox)) {
    for (const target of targetsY) {
      const dist = Math.abs(movingAnchorY - target.value)
      if (dist < bestDistY) {
        bestDistY = dist
        snapDy = target.value - movingAnchorY
      }
    }
  }

  // Compute final snapped bbox to generate guide lines
  const snappedBBox: BBox = {
    x: movingBBox.x + snapDx,
    y: movingBBox.y + snapDy,
    width: movingBBox.width,
    height: movingBBox.height,
  }

  // Find which X anchors actually align (within floating point tolerance)
  if (Math.abs(snapDx) < THRESHOLD) {
    for (const movingAnchorX of xAnchors(snappedBBox)) {
      for (const target of targetsX) {
        if (Math.abs(movingAnchorX - target.value) < 0.5 / zoom) {
          // Draw a vertical guide at this X, spanning from top of both boxes to bottom
          const minY = Math.min(snappedBBox.y, target.bbox.y) - 8 / zoom
          const maxY = Math.max(snappedBBox.y + snappedBBox.height, target.bbox.y + target.bbox.height) + 8 / zoom
          guides.push({ type: 'x', value: target.value, from: minY, to: maxY })
          break
        }
      }
    }
  }

  if (Math.abs(snapDy) < THRESHOLD) {
    for (const movingAnchorY of yAnchors(snappedBBox)) {
      for (const target of targetsY) {
        if (Math.abs(movingAnchorY - target.value) < 0.5 / zoom) {
          const minX = Math.min(snappedBBox.x, target.bbox.x) - 8 / zoom
          const maxX = Math.max(snappedBBox.x + snappedBBox.width, target.bbox.x + target.bbox.width) + 8 / zoom
          guides.push({ type: 'y', value: target.value, from: minX, to: maxX })
          break
        }
      }
    }
  }

  return { dx: snapDx, dy: snapDy, guides }
}
