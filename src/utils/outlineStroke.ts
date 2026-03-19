import type { Shape } from '../types/shapes'
import { polygonPoints } from './geometry'

function rectPath(x: number, y: number, w: number, h: number, rx: number): string {
  const r = Math.min(rx, w / 2, h / 2)
  if (r > 0) {
    return `M ${x+r} ${y} H ${x+w-r} Q ${x+w} ${y} ${x+w} ${y+r} V ${y+h-r} Q ${x+w} ${y+h} ${x+w-r} ${y+h} H ${x+r} Q ${x} ${y+h} ${x} ${y+h-r} V ${y+r} Q ${x} ${y} ${x+r} ${y} Z`
  }
  return `M ${x} ${y} H ${x+w} V ${y+h} H ${x} Z`
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M ${cx-r} ${cy} A ${r} ${r} 0 1 0 ${cx+r} ${cy} A ${r} ${r} 0 1 0 ${cx-r} ${cy} Z`
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx-rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx+rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx-rx} ${cy} Z`
}

export function outlineStroke(shape: Shape): { d: string; fill: string } | null {
  const sw = shape.strokeWidth
  if (!sw || sw <= 0 || shape.stroke === 'none') return null
  const fill = shape.stroke
  const hw = sw / 2

  switch (shape.type) {
    case 'rect':
    case 'frame': {
      const rx = (shape as any).rx ?? 0
      const outer = rectPath(shape.x - hw, shape.y - hw, shape.width + sw, shape.height + sw, rx + hw)
      if (shape.width <= sw || shape.height <= sw) return { d: outer, fill }
      const inner = rectPath(shape.x + hw, shape.y + hw, shape.width - sw, shape.height - sw, Math.max(0, rx - hw))
      return { d: outer + ' ' + inner, fill }
    }
    case 'circle': {
      const ro = shape.r + hw, ri = shape.r - hw
      if (ri <= 0) return { d: circlePath(shape.cx, shape.cy, ro), fill }
      return { d: circlePath(shape.cx, shape.cy, ro) + ' ' + circlePath(shape.cx, shape.cy, ri), fill }
    }
    case 'ellipse': {
      const outer = ellipsePath(shape.cx, shape.cy, shape.rx + hw, shape.ry + hw)
      if (shape.rx <= hw || shape.ry <= hw) return { d: outer, fill }
      return { d: outer + ' ' + ellipsePath(shape.cx, shape.cy, shape.rx - hw, shape.ry - hw), fill }
    }
    case 'line': {
      const { x1, y1, x2, y2 } = shape
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const px = -Math.sin(angle) * hw, py = Math.cos(angle) * hw
      return { d: `M ${x1+px} ${y1+py} L ${x2+px} ${y2+py} L ${x2-px} ${y2-py} L ${x1-px} ${y1-py} Z`, fill }
    }
    case 'polygon': {
      const op = polygonPoints(shape.cx, shape.cy, shape.size + hw, shape.sides, shape.innerRadius, shape.isStar)
      const op2path = (pts: string) => 'M ' + pts.trim().split(/\s+/).map(p => p.replace(',', ' ')).join(' L ') + ' Z'
      if (shape.size <= hw) return { d: op2path(op), fill }
      const ip = polygonPoints(shape.cx, shape.cy, shape.size - hw, shape.sides, shape.innerRadius, shape.isStar)
      return { d: op2path(op) + ' ' + op2path(ip), fill }
    }
    default:
      return null
  }
}
