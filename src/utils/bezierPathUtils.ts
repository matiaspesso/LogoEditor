export interface BezierNode {
  x: number
  y: number
  cp1x: number  // incoming control point
  cp1y: number
  cp2x: number  // outgoing control point
  cp2y: number
  smooth: boolean
}

export function isBezierPath(d: string): boolean {
  return /[CcSs]/.test(d)
}

export function parseBezierPath(d: string): { nodes: BezierNode[]; closed: boolean } {
  const closed = /[Zz]/.test(d)
  const nodes: BezierNode[] = []
  const cmds = d.trim().match(/[MmLlCcZz][^MmLlCcZz]*/g) || []

  for (const cmd of cmds) {
    const type = cmd[0]
    const nums = cmd.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number)

    if (type === 'M' || type === 'm') {
      const x = nums[0] ?? 0, y = nums[1] ?? 0
      nodes.push({ x, y, cp1x: x, cp1y: y, cp2x: x, cp2y: y, smooth: true })
    } else if (type === 'L' || type === 'l') {
      const x = nums[0] ?? 0, y = nums[1] ?? 0
      nodes.push({ x, y, cp1x: x, cp1y: y, cp2x: x, cp2y: y, smooth: false })
    } else if (type === 'C' || type === 'c') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        const cp1x = nums[i], cp1y = nums[i + 1]
        const cp2x = nums[i + 2], cp2y = nums[i + 3]
        const x = nums[i + 4], y = nums[i + 5]
        // cp1 is the outgoing handle of the previous node
        if (nodes.length > 0) {
          nodes[nodes.length - 1].cp2x = cp1x
          nodes[nodes.length - 1].cp2y = cp1y
        }
        nodes.push({ x, y, cp1x: cp2x, cp1y: cp2y, cp2x: x, cp2y: y, smooth: true })
      }
    }
  }

  return { nodes, closed }
}

export function serializeBezierPath(nodes: BezierNode[], closed: boolean): string {
  if (nodes.length === 0) return ''
  const r = (n: number) => Math.round(n * 1000) / 1000
  const parts: string[] = [`M ${r(nodes[0].x)} ${r(nodes[0].y)}`]

  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1]
    const curr = nodes[i]
    // If both handles are at their anchor points, use L for clean output
    const prevHandleFlat = prev.cp2x === prev.x && prev.cp2y === prev.y
    const currHandleFlat = curr.cp1x === curr.x && curr.cp1y === curr.y
    if (prevHandleFlat && currHandleFlat) {
      parts.push(`L ${r(curr.x)} ${r(curr.y)}`)
    } else {
      parts.push(`C ${r(prev.cp2x)} ${r(prev.cp2y)} ${r(curr.cp1x)} ${r(curr.cp1y)} ${r(curr.x)} ${r(curr.y)}`)
    }
  }

  if (closed && nodes.length > 1) {
    const prev = nodes[nodes.length - 1]
    const curr = nodes[0]
    const prevFlat = prev.cp2x === prev.x && prev.cp2y === prev.y
    const currFlat = curr.cp1x === curr.x && curr.cp1y === curr.y
    if (prevFlat && currFlat) {
      parts.push('Z')
    } else {
      parts.push(`C ${r(prev.cp2x)} ${r(prev.cp2y)} ${r(curr.cp1x)} ${r(curr.cp1y)} ${r(curr.x)} ${r(curr.y)} Z`)
    }
  }

  return parts.join(' ')
}

export function mirrorHandle(ax: number, ay: number, hx: number, hy: number): { x: number; y: number } {
  return { x: 2 * ax - hx, y: 2 * ay - hy }
}
