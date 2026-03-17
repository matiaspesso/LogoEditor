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

/**
 * Parse an SVG path `d` into a Polygon (array of rings).
 * Each M…Z subpath becomes one ring — so a path with a hole becomes
 * Polygon = [outerRing, holeRing], which polygon-clipping handles correctly.
 * Curve commands (C, Q, A, etc.) use their endpoint only (linear approximation).
 */
function pathToPolygon(s: PathShape): Polygon | null {
  // Match all command letters and numeric tokens (including scientific notation)
  const tokens = s.d.match(/[MmLlZzHhVvCcSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []

  const rings: Ring[] = []
  let current: [number, number][] = []
  let cmd = ''
  let cx = 0, cy = 0

  const n = (offset: number) => parseFloat(tokens[i + offset] ?? '0')

  const closeAndPush = () => {
    if (current.length >= 3) {
      const r: Ring = [...current] as Ring
      // Ensure closed
      if (r[r.length - 1][0] !== r[0][0] || r[r.length - 1][1] !== r[0][1]) r.push(r[0])
      rings.push(r)
    }
    current = []
  }

  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (/[MmLlZzHhVvCcSsQqTtAa]/.test(t)) {
      cmd = t; i++
      if (cmd === 'Z' || cmd === 'z') closeAndPush()
      continue
    }
    switch (cmd) {
      case 'M': closeAndPush(); cx = n(0); cy = n(1); current.push([cx, cy]); i += 2; cmd = 'L'; break
      case 'm': closeAndPush(); cx += n(0); cy += n(1); current.push([cx, cy]); i += 2; cmd = 'l'; break
      case 'L': cx = n(0); cy = n(1); current.push([cx, cy]); i += 2; break
      case 'l': cx += n(0); cy += n(1); current.push([cx, cy]); i += 2; break
      case 'H': cx = n(0); current.push([cx, cy]); i += 1; break
      case 'h': cx += n(0); current.push([cx, cy]); i += 1; break
      case 'V': cy = n(0); current.push([cx, cy]); i += 1; break
      case 'v': cy += n(0); current.push([cx, cy]); i += 1; break
      // Cubic bezier — skip 2 control points, use endpoint
      case 'C': cx = n(4); cy = n(5); current.push([cx, cy]); i += 6; break
      case 'c': cx += n(4); cy += n(5); current.push([cx, cy]); i += 6; break
      // Smooth cubic — skip 1 control point, use endpoint
      case 'S': cx = n(2); cy = n(3); current.push([cx, cy]); i += 4; break
      case 's': cx += n(2); cy += n(3); current.push([cx, cy]); i += 4; break
      // Quadratic bezier — skip control point, use endpoint
      case 'Q': cx = n(2); cy = n(3); current.push([cx, cy]); i += 4; break
      case 'q': cx += n(2); cy += n(3); current.push([cx, cy]); i += 4; break
      // Smooth quadratic
      case 'T': cx = n(0); cy = n(1); current.push([cx, cy]); i += 2; break
      case 't': cx += n(0); cy += n(1); current.push([cx, cy]); i += 2; break
      // Arc — skip rx, ry, x-rotation, large-arc-flag, sweep-flag; use endpoint
      case 'A': cx = n(5); cy = n(6); current.push([cx, cy]); i += 7; break
      case 'a': cx += n(5); cy += n(6); current.push([cx, cy]); i += 7; break
      default: i++
    }
  }
  closeAndPush() // flush any unclosed final subpath

  if (rings.length === 0) return null
  // Return all rings as one Polygon: first ring = outer boundary, rest = holes.
  // polygon-clipping uses winding direction to determine outer/hole automatically.
  return rings as Polygon
}

function shapeToPolygon(shape: Shape): Polygon | null {
  try {
    switch (shape.type) {
      case 'rect':    return [rectToRing(shape)]
      case 'circle':  { const r = circleToRing(shape); return r.length >= 4 ? [r] : null }
      case 'ellipse': { const r = ellipseToRing(shape); return r.length >= 4 ? [r] : null }
      case 'polygon': { const r = polygonShapeToRing(shape); return r.length >= 4 ? [r] : null }
      case 'path':    return pathToPolygon(shape)
      default: return null
    }
  } catch { return null }
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
