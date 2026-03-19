import type { Shape } from '../types/shapes'

export function offsetShape(shape: Shape, offset: number): Partial<Shape> | null {
  if (offset === 0) return null
  switch (shape.type) {
    case 'rect':
    case 'frame':
      return {
        x: shape.x - offset,
        y: shape.y - offset,
        width: Math.max(0.5, shape.width + offset * 2),
        height: Math.max(0.5, shape.height + offset * 2),
        rx: Math.max(0, ((shape as any).rx ?? 0) + offset),
      } as any
    case 'circle':
      return { r: Math.max(0.5, shape.r + offset) } as any
    case 'ellipse':
      return { rx: Math.max(0.5, shape.rx + offset), ry: Math.max(0.5, shape.ry + offset) } as any
    case 'polygon':
      return { size: Math.max(0.5, shape.size + offset) } as any
    default:
      return null
  }
}
