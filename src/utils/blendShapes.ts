import type { Shape, RectShape, CircleShape, EllipseShape, PolygonShape, PathShape, LineShape } from '../types/shapes'
import { samplePath } from './brushPath'
import { autoSmoothNode, serializeBezierPath, type BezierNode, type NodeType } from './bezierPathUtils'
import { polygonPoints } from './geometry'

// ── Color utilities ──────────────────────────────────────

function parseHex(c: string): [number, number, number] | null {
  if (!c || c === 'none' || c === 'transparent') return null
  const h = c.replace('#', '')
  if (h.length === 3) {
    return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)]
  }
  if (h.length === 6) {
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
  }
  return null
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r,g,b].map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('')
}

function lerpColor(c1: string, c2: string, t: number): string {
  const p1 = parseHex(c1); const p2 = parseHex(c2)
  if (!p1 || !p2) return t < 0.5 ? c1 : c2
  return toHex(p1[0]+(p2[0]-p1[0])*t, p1[1]+(p2[1]-p1[1])*t, p1[2]+(p2[2]-p1[2])*t)
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

// ── Shape → approximate path ─────────────────────────────

function shapeToApproxPath(shape: Shape): string {
  switch (shape.type) {
    case 'rect':
    case 'frame': {
      const s = shape as RectShape
      const { x, y, width: w, height: h } = s
      return `M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`
    }
    case 'circle': {
      const { cx, cy, r } = shape as CircleShape
      return `M ${cx-r} ${cy} A ${r} ${r} 0 1 0 ${cx+r} ${cy} A ${r} ${r} 0 1 0 ${cx-r} ${cy} Z`
    }
    case 'ellipse': {
      const { cx, cy, rx, ry } = shape as EllipseShape
      return `M ${cx-rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx+rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx-rx} ${cy} Z`
    }
    case 'polygon': {
      const { cx, cy, size, sides, innerRadius, isStar } = shape as PolygonShape
      const pts = polygonPoints(cx, cy, size, sides, innerRadius, isStar)
      const pairs = pts.trim().split(/\s+/).map(p => p.split(',').map(Number))
      return 'M ' + pairs.map(([px, py]) => `${px} ${py}`).join(' L ') + ' Z'
    }
    case 'path':
      return (shape as PathShape).d
    case 'line': {
      const { x1, y1, x2, y2 } = shape as LineShape
      return `M ${x1} ${y1} L ${x2} ${y2}`
    }
    default:
      return ''
  }
}

// ── Path blending via sampling ────────────────────────────

function pointsToSmoothPath(pts: {x:number,y:number}[], closed: boolean): string {
  if (pts.length < 2) return ''
  const nodes: BezierNode[] = pts.map(p => ({
    x: p.x, y: p.y,
    cp1x: p.x, cp1y: p.y, cp2x: p.x, cp2y: p.y,
    smooth: true, nodeType: 'auto' as NodeType,
  }))
  const smoothed = nodes.map((_, i) => autoSmoothNode(nodes, i, closed))
  return serializeBezierPath(smoothed, closed)
}

function blendPaths(d1: string, d2: string, t: number): string {
  if (!d1 || !d2) return t < 0.5 ? d1 : d2
  const N = 48
  const s1 = samplePath(d1, N)
  const s2 = samplePath(d2, N)
  if (s1.length < 2 || s2.length < 2) return t < 0.5 ? d1 : d2
  const closed = /[Zz]/.test(t < 0.5 ? d1 : d2)
  const pts = s1.map((p, i) => ({
    x: lerp(p.x, s2[i]?.x ?? p.x, t),
    y: lerp(p.y, s2[i]?.y ?? p.y, t),
  }))
  return pointsToSmoothPath(pts, closed)
}

// ── Base property interpolation ───────────────────────────

function lerpBase(s1: Shape, s2: Shape, t: number): Partial<Shape> {
  return {
    fill: lerpColor(s1.fill, s2.fill, t),
    fillOpacity: lerp(s1.fillOpacity, s2.fillOpacity, t),
    stroke: lerpColor(s1.stroke, s2.stroke, t),
    strokeWidth: lerp(s1.strokeWidth, s2.strokeWidth, t),
    opacity: lerp(s1.opacity, s2.opacity, t),
    rotation: lerp(s1.rotation, s2.rotation, t),
  }
}

// ── Same-type geometric interpolation ────────────────────

function interpolateSameType(s1: Shape, s2: Shape, t: number): Partial<Shape> {
  if (s1.type === 'rect' || s1.type === 'frame') {
    const a = s1 as RectShape; const b = s2 as RectShape
    return { x: lerp(a.x,b.x,t), y: lerp(a.y,b.y,t), width: lerp(a.width,b.width,t), height: lerp(a.height,b.height,t), rx: lerp(a.rx,b.rx,t) }
  }
  if (s1.type === 'circle') {
    const a = s1 as CircleShape; const b = s2 as CircleShape
    return { cx: lerp(a.cx,b.cx,t), cy: lerp(a.cy,b.cy,t), r: lerp(a.r,b.r,t) }
  }
  if (s1.type === 'ellipse') {
    const a = s1 as EllipseShape; const b = s2 as EllipseShape
    return { cx: lerp(a.cx,b.cx,t), cy: lerp(a.cy,b.cy,t), rx: lerp(a.rx,b.rx,t), ry: lerp(a.ry,b.ry,t) }
  }
  if (s1.type === 'polygon') {
    const a = s1 as PolygonShape; const b = s2 as PolygonShape
    return { cx: lerp(a.cx,b.cx,t), cy: lerp(a.cy,b.cy,t), size: lerp(a.size,b.size,t), sides: Math.round(lerp(a.sides,b.sides,t)), innerRadius: lerp(a.innerRadius,b.innerRadius,t) }
  }
  if (s1.type === 'path') {
    return { d: blendPaths((s1 as PathShape).d, (s2 as PathShape).d, t) }
  }
  return {}
}

// ── Main interpolation ────────────────────────────────────

export function interpolateShape(s1: Shape, s2: Shape, t: number, idx: number): Shape {
  const base = { ...s1, ...lerpBase(s1, s2, t), id: `__blend_${idx}`, name: `blend-${idx}` } as Shape

  if (s1.type === s2.type) {
    return { ...base, ...interpolateSameType(s1, s2, t) } as Shape
  }

  // Cross-type: convert both to paths and blend
  const d1 = shapeToApproxPath(s1)
  const d2 = shapeToApproxPath(s2)
  const blended = blendPaths(d1, d2, t)
  return { ...base, type: 'path', d: blended, fill: lerpColor(s1.fill, s2.fill, t) } as unknown as Shape
}

export interface BlendDef {
  shape1: Shape
  shape2: Shape
  steps: number  // intermediate shapes (not counting endpoints)
}

export function computeBlendSteps(def: BlendDef): Shape[] {
  const { shape1, shape2, steps } = def
  const total = steps + 2  // +2 for the two endpoint shapes
  const result: Shape[] = []
  for (let i = 0; i < total; i++) {
    const t = total > 1 ? i / (total - 1) : 0
    result.push(interpolateShape(shape1, shape2, t, i))
  }
  return result
}
