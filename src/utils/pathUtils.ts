export interface PathPoint { x: number; y: number }

export function parseSimplePath(d: string): { points: PathPoint[]; closed: boolean } {
  const closed = /[Zz]/.test(d)
  const points: PathPoint[] = []
  const re = /([ML])\s*([-\d.]+)[,\s]+([-\d.]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(d)) !== null) {
    points.push({ x: parseFloat(m[2]), y: parseFloat(m[3]) })
  }
  return { points, closed }
}

export function serializeSimplePath(points: PathPoint[], closed: boolean): string {
  if (points.length === 0) return ''
  const parts = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
  if (closed) parts.push('Z')
  return parts.join(' ')
}

export function isSimplePath(d: string): boolean {
  return /^[MLZmlz\s\d.,\-]+$/.test(d.trim())
}
