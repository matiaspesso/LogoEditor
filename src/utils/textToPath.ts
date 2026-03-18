import type { TextShape } from '../types/shapes'

// Convert a TextShape to an SVG path string by rendering to canvas and tracing contours
export function textToPath(shape: TextShape): string {
  const scale = 4 // render at 4x for better accuracy
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const fontStr = `${shape.fontWeight} ${shape.fontSize * scale}px "${shape.fontFamily}"`
  ctx.font = fontStr
  const metrics = ctx.measureText(shape.text)

  const ascent = metrics.actualBoundingBoxAscent || shape.fontSize * scale * 0.8
  const descent = metrics.actualBoundingBoxDescent || shape.fontSize * scale * 0.2
  const pad = 4 * scale

  canvas.width = Math.ceil(metrics.width) + pad * 2
  canvas.height = Math.ceil(ascent + descent) + pad * 2

  ctx.font = fontStr
  ctx.fillStyle = '#000'
  ctx.fillText(shape.text, pad, ascent + pad)

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const W = canvas.width
  const H = canvas.height

  // Build binary alpha grid
  const filled = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false
    return data[(y * W + x) * 4 + 3] > 64
  }

  // Marching squares: generate path segments
  // Each cell is a 2x2 quad of pixels; we look at its corners
  const pathParts: string[] = []
  const visited = new Uint8Array((W - 1) * (H - 1))

  function idx(x: number, y: number) { return y * (W - 1) + x }

  // Collect all contour polylines using boundary following
  function traceContour(startX: number, startY: number): [number, number][] | null {
    // startX, startY are pixel coords where there's a filled→empty transition
    // We trace the boundary between filled and unfilled pixels
    const pts: [number, number][] = []
    let x = startX, y = startY
    // directions: 0=right, 1=down, 2=left, 3=up
    let dir = 0
    const maxSteps = W * H * 2
    let steps = 0

    do {
      pts.push([x + 0.5, y + 0.5])
      visited[idx(Math.min(x, W - 2), Math.min(y, H - 2))] = 1

      // Try turning left, going straight, or turning right
      const tryDir = (d: number): boolean => {
        const nx = x + [1, 0, -1, 0][d]
        const ny = y + [0, 1, 0, -1][d]
        return filled(nx, ny)
      }

      const leftDir = (dir + 3) % 4
      const rightDir = (dir + 1) % 4

      if (tryDir(leftDir)) {
        dir = leftDir
      } else if (tryDir(dir)) {
        // continue straight
      } else if (tryDir(rightDir)) {
        dir = rightDir
      } else {
        dir = (dir + 2) % 4  // reverse
      }

      x += [1, 0, -1, 0][dir]
      y += [0, 1, 0, -1][dir]
      steps++
    } while ((x !== startX || y !== startY) && steps < maxSteps)

    return pts.length > 3 ? pts : null
  }

  // Find all filled cells that have a neighbor that is empty (boundary cells)
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      if (!filled(x, y)) continue
      // Check if this is a boundary cell (has empty neighbor to the right)
      if (filled(x + 1, y)) continue
      if (visited[idx(x, y)]) continue

      const contour = traceContour(x, y)
      if (!contour || contour.length < 3) continue

      // Douglas-Peucker simplification
      const simplified = douglasPeucker(contour, 0.8)
      if (simplified.length < 3) continue

      // Scale down and offset to SVG coordinates
      const svgPts = simplified.map(([px, py]) => [
        shape.x + (px - pad) / scale,
        shape.y - ascent / scale + (py - pad) / scale,
      ] as [number, number])

      const r = (n: number) => Math.round(n * 100) / 100
      const movePt = svgPts[0]
      const rest = svgPts.slice(1).map(([px, py]) => `L ${r(px)} ${r(py)}`).join(' ')
      pathParts.push(`M ${r(movePt[0])} ${r(movePt[1])} ${rest} Z`)
    }
  }

  return pathParts.join(' ') || `M ${shape.x} ${shape.y}`
}

function douglasPeucker(pts: [number, number][], epsilon: number): [number, number][] {
  if (pts.length <= 2) return pts

  let maxDist = 0
  let maxIdx = 0
  const first = pts[0]
  const last = pts[pts.length - 1]

  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDistance(pts[i], first, last)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(pts.slice(0, maxIdx + 1), epsilon)
    const right = douglasPeucker(pts.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [first, last]
}

function perpendicularDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2)
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
}
