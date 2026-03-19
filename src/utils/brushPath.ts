// ─────────────────────────────────────────────────────────
// brushPath.ts  — core brush rendering utilities
// ─────────────────────────────────────────────────────────

export interface BrushDef {
  type: 'calligraphic' | 'variable' | 'pattern' | 'art'
  // calligraphic
  angle?: number       // 0-180 degrees, default 45
  roundness?: number   // 0=flat line, 1=round circle, default 0.2
  size?: number        // base width in SVG units, default 8
  // variable width
  widthProfile?: { t: number; w: number }[]  // t=0..1 along path, w=width
  // pattern
  patternShape?: 'circle' | 'square' | 'diamond' | 'leaf'
  patternSpacing?: number  // distance between elements, default = size
  patternFillColor?: string
  // art
  artDesign?: 'bristle' | 'rope' | 'charcoal'
}

// ── Internal types ────────────────────────────────────────

interface Seg {
  x0: number; y0: number
  x3: number; y3: number
  type: 'L' | 'C'
  x1?: number; y1?: number
  x2?: number; y2?: number
}

export interface PathSample {
  x: number; y: number
  tx: number; ty: number  // unit tangent
  t: number               // normalized arc position 0..1
}

export interface PatternElement {
  x: number; y: number
  angleDeg: number   // tangent direction in degrees
  t: number
}

// ── Path parsing ─────────────────────────────────────────

function parseSegs(d: string): Seg[] {
  const segs: Seg[] = []
  const cmds = d.trim().match(/[MmLlCcZz][^MmLlCcZz]*/g) || []
  let cx = 0, cy = 0, startX = 0, startY = 0

  for (const cmd of cmds) {
    const t = cmd[0]
    const nums = cmd.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number)
    if (t === 'M') { cx = nums[0]; cy = nums[1]; startX = cx; startY = cy }
    else if (t === 'L') {
      segs.push({ type: 'L', x0: cx, y0: cy, x3: nums[0], y3: nums[1] })
      cx = nums[0]; cy = nums[1]
    } else if (t === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        segs.push({ type: 'C', x0: cx, y0: cy, x1: nums[i], y1: nums[i+1], x2: nums[i+2], y2: nums[i+3], x3: nums[i+4], y3: nums[i+5] })
        cx = nums[i+4]; cy = nums[i+5]
      }
    } else if (t === 'Z' || t === 'z') {
      if (cx !== startX || cy !== startY) {
        segs.push({ type: 'L', x0: cx, y0: cy, x3: startX, y3: startY })
        cx = startX; cy = startY
      }
    }
  }
  return segs
}

function evalSeg(seg: Seg, t: number): { x: number; y: number; dx: number; dy: number } {
  if (seg.type === 'L') {
    return { x: seg.x0 + (seg.x3 - seg.x0) * t, y: seg.y0 + (seg.y3 - seg.y0) * t, dx: seg.x3 - seg.x0, dy: seg.y3 - seg.y0 }
  }
  const { x0, y0, x1 = x0, y1 = y0, x2 = seg.x3, y2 = seg.y3, x3, y3 } = seg
  const mt = 1 - t
  const x = mt*mt*mt*x0 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x3
  const y = mt*mt*mt*y0 + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y3
  const dx = 3*mt*mt*(x1-x0) + 6*mt*t*(x2-x1) + 3*t*t*(x3-x2)
  const dy = 3*mt*mt*(y1-y0) + 6*mt*t*(y2-y1) + 3*t*t*(y3-y2)
  return { x, y, dx, dy }
}

function segArcLength(seg: Seg, steps = 20): number {
  let len = 0, prev = evalSeg(seg, 0)
  for (let i = 1; i <= steps; i++) {
    const cur = evalSeg(seg, i / steps)
    len += Math.sqrt((cur.x-prev.x)**2 + (cur.y-prev.y)**2)
    prev = cur
  }
  return len
}

// ── Arc-length-parameterized sampling ────────────────────

export function samplePath(d: string, numSamples: number): PathSample[] {
  const segs = parseSegs(d)
  if (segs.length === 0) return []

  const segLens = segs.map(s => segArcLength(s))
  const totalLen = segLens.reduce((a, b) => a + b, 0)
  if (totalLen < 0.001) return []

  const samples: PathSample[] = []
  for (let si = 0; si < numSamples; si++) {
    const arcTarget = (si / Math.max(1, numSamples - 1)) * totalLen
    let cumLen = 0, segIdx = 0
    while (segIdx < segs.length - 1 && cumLen + segLens[segIdx] < arcTarget) {
      cumLen += segLens[segIdx]; segIdx++
    }
    const seg = segs[segIdx]
    const segT = segLens[segIdx] > 0.001
      ? Math.min(1, (arcTarget - cumLen) / segLens[segIdx])
      : 0
    const { x, y, dx, dy } = evalSeg(seg, segT)
    const len = Math.sqrt(dx*dx + dy*dy)
    samples.push({
      x, y,
      tx: len > 0.001 ? dx/len : 1,
      ty: len > 0.001 ? dy/len : 0,
      t: si / Math.max(1, numSamples - 1),
    })
  }
  return samples
}

// Uniformly-spaced positions along the path, for patterns
export function getPatternPositions(d: string, spacing: number): PatternElement[] {
  const segs = parseSegs(d)
  if (segs.length === 0 || spacing <= 0) return []
  const segLens = segs.map(s => segArcLength(s))
  const totalLen = segLens.reduce((a, b) => a + b, 0)
  if (totalLen < spacing) return []

  const result: PatternElement[] = []
  let traveled = spacing / 2  // start half-spacing in
  while (traveled < totalLen) {
    let cumLen = 0, segIdx = 0
    while (segIdx < segs.length - 1 && cumLen + segLens[segIdx] < traveled) {
      cumLen += segLens[segIdx]; segIdx++
    }
    const seg = segs[segIdx]
    const segT = segLens[segIdx] > 0.001
      ? Math.min(1, (traveled - cumLen) / segLens[segIdx])
      : 0
    const { x, y, dx, dy } = evalSeg(seg, segT)
    const len = Math.sqrt(dx*dx + dy*dy)
    const tx = len > 0.001 ? dx/len : 1
    const ty = len > 0.001 ? dy/len : 0
    result.push({ x, y, angleDeg: Math.atan2(ty, tx) * 180 / Math.PI, t: traveled / totalLen })
    traveled += spacing
  }
  return result
}

// ── Width functions ───────────────────────────────────────

export function calliHalfWidth(brushAngleDeg: number, roundness: number, size: number, tx: number, ty: number): number {
  const a = size / 2
  const b = Math.max(size * 0.02, size / 2 * Math.max(0.01, roundness))
  const brushAngle = brushAngleDeg * Math.PI / 180
  const theta = Math.atan2(ty, tx)
  const phi = theta + Math.PI / 2 - brushAngle
  const denom = Math.sqrt((b * Math.cos(phi)) ** 2 + (a * Math.sin(phi)) ** 2)
  return denom > 0.001 ? (a * b) / denom : b
}

export function interpWidth(profile: { t: number; w: number }[], t: number): number {
  if (!profile || profile.length === 0) return 4
  if (profile.length === 1) return profile[0].w
  const sorted = [...profile].sort((a, b) => a.t - b.t)
  if (t <= sorted[0].t) return sorted[0].w
  if (t >= sorted[sorted.length-1].t) return sorted[sorted.length-1].w
  for (let i = 0; i < sorted.length - 1; i++) {
    if (t >= sorted[i].t && t <= sorted[i+1].t) {
      const alpha = (t - sorted[i].t) / (sorted[i+1].t - sorted[i].t)
      return sorted[i].w * (1 - alpha) + sorted[i+1].w * alpha
    }
  }
  return sorted[sorted.length-1].w
}

// ── Envelope building ─────────────────────────────────────

function buildPathFromSides(left: {x:number,y:number}[], right: {x:number,y:number}[]): string {
  if (left.length === 0) return ''
  const r = (n: number) => Math.round(n * 100) / 100
  const pts: string[] = [`M ${r(left[0].x)} ${r(left[0].y)}`]
  for (let i = 1; i < left.length; i++) pts.push(`L ${r(left[i].x)} ${r(left[i].y)}`)
  for (let i = right.length - 1; i >= 0; i--) pts.push(`L ${r(right[i].x)} ${r(right[i].y)}`)
  pts.push('Z')
  return pts.join(' ')
}

function buildEnvelopePath(samples: PathSample[], hwFn: (i: number, s: PathSample) => number): string {
  const left: {x:number,y:number}[] = []
  const right: {x:number,y:number}[] = []
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]; const hw = Math.max(0.1, hwFn(i, s))
    left.push({ x: s.x - s.ty * hw, y: s.y + s.tx * hw })
    right.push({ x: s.x + s.ty * hw, y: s.y - s.tx * hw })
  }
  return buildPathFromSides(left, right)
}

// ── Art designs ───────────────────────────────────────────

function buildBristlePaths(samples: PathSample[], size: number): string[] {
  const offsets = [-2, -1, 0, 1, 2].map(o => o * size * 0.35)
  const hw = size * 0.05
  return offsets.map((baseOffset, idx) => {
    const wigAmp = size * 0.12; const wigFreq = 7 + idx * 0.9; const wigPhase = idx * 1.3
    const left: {x:number,y:number}[] = [], right: {x:number,y:number}[] = []
    for (const s of samples) {
      const wig = wigAmp * Math.sin(s.t * wigFreq * Math.PI * 2 + wigPhase)
      const off = baseOffset + wig
      left.push({ x: s.x - s.ty * (off + hw), y: s.y + s.tx * (off + hw) })
      right.push({ x: s.x - s.ty * (off - hw), y: s.y + s.tx * (off - hw) })
    }
    return buildPathFromSides(left, right)
  })
}

function buildRopePaths(samples: PathSample[], size: number): string[] {
  const R = size * 0.35; const twists = 4
  return [0, 1].map((strandIdx) => {
    const phase = strandIdx * Math.PI
    const left: {x:number,y:number}[] = [], right: {x:number,y:number}[] = []
    for (const s of samples) {
      const offset = R * Math.sin(s.t * twists * Math.PI * 2 + phase)
      const crossFade = Math.abs(Math.cos(s.t * twists * Math.PI * 2 + phase))
      const hw = size * 0.13 * (0.3 + 0.7 * crossFade)
      left.push({ x: s.x - s.ty * (offset + hw), y: s.y + s.tx * (offset + hw) })
      right.push({ x: s.x - s.ty * (offset - hw), y: s.y + s.tx * (offset - hw) })
    }
    return buildPathFromSides(left, right)
  })
}

function buildCharcoalPath(samples: PathSample[], size: number): string {
  const left: {x:number,y:number}[] = [], right: {x:number,y:number}[] = []
  for (const s of samples) {
    const taper = Math.sin(s.t * Math.PI) * 0.4 + 0.6
    const baseHW = size / 2 * taper
    const rough = baseHW * 0.25 * (
      Math.sin(s.t * 23 * Math.PI * 2) * 0.4 +
      Math.sin(s.t * 7.3 * Math.PI * 2 + 1.1) * 0.35 +
      Math.sin(s.t * 41 * Math.PI * 2 + 0.7) * 0.25
    )
    left.push({ x: s.x - s.ty * (baseHW + rough), y: s.y + s.tx * (baseHW + rough) })
    right.push({ x: s.x + s.ty * (baseHW - rough * 0.5), y: s.y - s.tx * (baseHW - rough * 0.5) })
  }
  return buildPathFromSides(left, right)
}

// ── Main entry points ─────────────────────────────────────

const NUM_SAMPLES = 120

/** Returns filled SVG path d strings for calligraphic, variable, or art brushes.
 *  Returns null for pattern brush (use getPatternPositions instead). */
export function renderBrushPaths(d: string, brush: BrushDef): string[] | null {
  if (brush.type === 'pattern') return null

  const samples = samplePath(d, NUM_SAMPLES)
  if (samples.length < 2) return null

  const size = brush.size ?? 8

  if (brush.type === 'calligraphic') {
    const angle = brush.angle ?? 45
    const roundness = brush.roundness ?? 0.2
    const envelope = buildEnvelopePath(samples, (_, s) => calliHalfWidth(angle, roundness, size, s.tx, s.ty))
    return [envelope]
  }

  if (brush.type === 'variable') {
    const profile = brush.widthProfile ?? [{ t: 0, w: size * 0.4 }, { t: 0.5, w: size }, { t: 1, w: size * 0.4 }]
    const envelope = buildEnvelopePath(samples, (_, s) => interpWidth(profile, s.t) / 2)
    return [envelope]
  }

  if (brush.type === 'art') {
    const design = brush.artDesign ?? 'bristle'
    if (design === 'bristle') return buildBristlePaths(samples, size)
    if (design === 'rope') return buildRopePaths(samples, size)
    if (design === 'charcoal') return [buildCharcoalPath(samples, size)]
    return null
  }

  return null
}

/** Returns position data for pattern brush elements (caller renders SVG shapes). */
export function getBrushPatternPositions(d: string, brush: BrushDef): PatternElement[] {
  const size = brush.size ?? 8
  const spacing = brush.patternSpacing ?? size * 1.5
  return getPatternPositions(d, spacing)
}
