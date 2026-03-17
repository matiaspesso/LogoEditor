import { union, difference, intersection, xor } from 'polygon-clipping'
import type { MultiPolygon, Polygon, Ring } from 'polygon-clipping'
import type { Shape, RectShape, CircleShape, EllipseShape, PolygonShape, PathShape } from '../types/shapes'
import { polygonPoints } from './geometry'

export type BooleanOpType = 'union' | 'difference' | 'intersection' | 'xor'

// ── Shape → polygon ring ──────────────────────────────────────────────────

function rectToRing(s: RectShape): Ring {
  return [
    [s.x, s.y],
    [s.x + s.width, s.y],
    [s.x + s.width, s.y + s.height],
    [s.x, s.y + s.height],
    [s.x, s.y],
  ]
}

function circleToRing(s: CircleShape, n = 64): Ring {
  const pts: Ring = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([s.cx + s.r * Math.cos(a), s.cy + s.r * Math.sin(a)])
  }
  return pts
}

function ellipseToRing(s: EllipseShape, n = 64): Ring {
  const pts: Ring = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([s.cx + s.rx * Math.cos(a), s.cy + s.ry * Math.sin(a)])
  }
  return pts
}

function polygonShapeToRing(s: PolygonShape): Ring {
  const pts = polygonPoints(s.cx, s.cy, s.size, s.sides, s.innerRadius, s.isStar)
  const ring: Ring = pts.split(' ').map((p) => {
    const [x, y] = p.split(',').map(Number)
    return [x, y] as [number, number]
  })
  ring.push(ring[0]) // close
  return ring
}

function pathToRing(s: PathShape): Ring {
  // Extract coordinate pairs from M/L path data
  const tokens = s.d.match(/[MmLlZz]|[-\d.]+/g) ?? []
  const ring: Ring = []
  let cmd = ''
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (/[MmLlZz]/.test(t)) { cmd = t; i++; continue }
    const x = parseFloat(t)
    const y = parseFloat(tokens[i + 1] ?? '0')
    if (!isNaN(x) && !isNaN(y) && (cmd === 'M' || cmd === 'L')) {
      ring.push([x, y])
    }
    i += 2
  }
  if (ring.length > 0) ring.push(ring[0])
  return ring
}

function shapeToPolygon(shape: Shape): Polygon | null {
  let ring: Ring
  try {
    switch (shape.type) {
      case 'rect':    ring = rectToRing(shape); break
      case 'circle':  ring = circleToRing(shape); break
      case 'ellipse': ring = ellipseToRing(shape); break
      case 'polygon': ring = polygonShapeToRing(shape); break
      case 'path':    ring = pathToRing(shape); break
      default: return null
    }
  } catch { return null }
  if (ring.length < 4) return null
  return [ring]
}

// ── MultiPolygon → SVG path string ───────────────────────────────────────

function round2(n: number) { return Math.round(n * 100) / 100 }

export function multiPolygonToPath(mp: MultiPolygon): string {
  return mp
    .flatMap((polygon) =>
      polygon.map((ring) => {
        // polygon-clipping closes rings (last pt = first pt), remove the duplicate
        const pts = ring[ring.length - 1][0] === ring[0][0] &&
                    ring[ring.length - 1][1] === ring[0][1]
          ? ring.slice(0, -1)
          : ring
        if (pts.length < 2) return ''
        return (
          `M ${round2(pts[0][0])} ${round2(pts[0][1])} ` +
          pts.slice(1).map((p) => `L ${round2(p[0])} ${round2(p[1])}`).join(' ') +
          ' Z'
        )
      })
    )
    .filter(Boolean)
    .join(' ')
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Apply a boolean operation to an ordered list of shapes.
 * For 'difference': shapes[0] is the base, the rest are subtracted from it.
 * Returns the resulting SVG path d string, or null on failure.
 */
export function applyBooleanOp(shapes: Shape[], op: BooleanOpType): string | null {
  if (shapes.length < 2) return null
  const polys = shapes.map(shapeToPolygon)
  if (polys.some((p) => p === null)) return null

  try {
    const [first, ...rest] = polys as Polygon[]
    let result: MultiPolygon
    switch (op) {
      case 'union':        result = union(first, ...rest); break
      case 'difference':   result = difference(first, ...rest); break
      case 'intersection': result = intersection(first, ...rest); break
      case 'xor':          result = xor(first, ...rest); break
    }
    const d = multiPolygonToPath(result)
    return d || null
  } catch {
    return null
  }
}
