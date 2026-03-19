export type NodeType = 'corner' | 'smooth' | 'symmetric' | 'auto'

export interface BezierNode {
  x: number
  y: number
  cp1x: number  // incoming control point
  cp1y: number
  cp2x: number  // outgoing control point
  cp2y: number
  smooth: boolean  // legacy compat
  nodeType: NodeType
}

export function isBezierPath(d: string): boolean {
  return /[CcSs]/.test(d)
}

function hlen(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy)
}

export function mirrorHandle(ax: number, ay: number, hx: number, hy: number): { x: number; y: number } {
  return { x: 2 * ax - hx, y: 2 * ay - hy }
}

/** Apply node type constraint after one handle has been moved. Returns updated nodes array. */
export function applyHandleConstraint(nodes: BezierNode[], i: number, changed: 'cp1' | 'cp2'): BezierNode[] {
  const result = nodes.map((n) => ({ ...n }))
  const n = result[i]
  const type = n.nodeType ?? (n.smooth ? 'symmetric' : 'corner')

  if (type === 'symmetric') {
    if (changed === 'cp2') {
      const m = mirrorHandle(n.x, n.y, n.cp2x, n.cp2y)
      n.cp1x = m.x; n.cp1y = m.y
    } else {
      const m = mirrorHandle(n.x, n.y, n.cp1x, n.cp1y)
      n.cp2x = m.x; n.cp2y = m.y
    }
  } else if (type === 'smooth') {
    if (changed === 'cp2') {
      const otherLen = hlen(n.cp1x - n.x, n.cp1y - n.y)
      const dx = n.cp2x - n.x; const dy = n.cp2y - n.y
      const d = hlen(dx, dy)
      if (d > 0 && otherLen > 0) {
        n.cp1x = n.x - (dx / d) * otherLen
        n.cp1y = n.y - (dy / d) * otherLen
      }
    } else {
      const otherLen = hlen(n.cp2x - n.x, n.cp2y - n.y)
      const dx = n.cp1x - n.x; const dy = n.cp1y - n.y
      const d = hlen(dx, dy)
      if (d > 0 && otherLen > 0) {
        n.cp2x = n.x - (dx / d) * otherLen
        n.cp2y = n.y - (dy / d) * otherLen
      }
    }
  }
  // corner & auto: no constraint (auto is recomputed separately)

  return result
}

/** Compute Catmull-Rom style auto-smooth handles for node i */
export function autoSmoothNode(nodes: BezierNode[], i: number, closed: boolean): BezierNode {
  const n = { ...nodes[i] }
  const count = nodes.length
  const prevIdx = i === 0 ? (closed ? count - 1 : -1) : i - 1
  const nextIdx = i === count - 1 ? (closed ? 0 : -1) : i + 1
  const prev = prevIdx >= 0 ? nodes[prevIdx] : null
  const next = nextIdx >= 0 ? nodes[nextIdx] : null
  const tension = 1 / 3

  if (!prev && !next) return n

  if (!prev) {
    // First non-closed node
    const dx = next!.x - n.x; const dy = next!.y - n.y
    n.cp2x = n.x + dx * tension; n.cp2y = n.y + dy * tension
    n.cp1x = n.x; n.cp1y = n.y
  } else if (!next) {
    // Last non-closed node
    const dx = n.x - prev.x; const dy = n.y - prev.y
    n.cp1x = n.x - dx * tension; n.cp1y = n.y - dy * tension
    n.cp2x = n.x; n.cp2y = n.y
  } else {
    const dx = next.x - prev.x; const dy = next.y - prev.y
    const d = hlen(dx, dy)
    if (d === 0) return n
    const ux = dx / d; const uy = dy / d
    const dp = hlen(n.x - prev.x, n.y - prev.y)
    const dn = hlen(next.x - n.x, next.y - n.y)
    n.cp1x = n.x - ux * dp * tension; n.cp1y = n.y - uy * dp * tension
    n.cp2x = n.x + ux * dn * tension; n.cp2y = n.y + uy * dn * tension
  }

  return n
}

/** Re-compute handles for all 'auto' nodes in the array */
export function applyAutoSmooth(nodes: BezierNode[], closed: boolean): BezierNode[] {
  return nodes.map((n, i) => n.nodeType === 'auto' ? autoSmoothNode(nodes, i, closed) : n)
}

/** Make all nodes 'auto' and compute their handles — useful for the "Auto-smooth" button */
export function smoothAllNodes(nodes: BezierNode[], closed: boolean): BezierNode[] {
  const all = nodes.map((n) => ({ ...n, nodeType: 'auto' as NodeType, smooth: true }))
  return all.map((_, i) => autoSmoothNode(all, i, closed))
}

export function parseBezierPath(d: string): { nodes: BezierNode[]; closed: boolean } {
  const closed = /[Zz]/.test(d)
  const nodes: BezierNode[] = []
  const cmds = d.trim().match(/[MmLlCcZz][^MmLlCcZz]*/g) || []

  for (const cmd of cmds) {
    const type = cmd[0]
    const nums = cmd.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number)

    if (type === 'M' || type === 'm') {
      const x = nums[0] ?? 0; const y = nums[1] ?? 0
      nodes.push({ x, y, cp1x: x, cp1y: y, cp2x: x, cp2y: y, smooth: true, nodeType: 'corner' })
    } else if (type === 'L' || type === 'l') {
      const x = nums[0] ?? 0; const y = nums[1] ?? 0
      nodes.push({ x, y, cp1x: x, cp1y: y, cp2x: x, cp2y: y, smooth: false, nodeType: 'corner' })
    } else if (type === 'C' || type === 'c') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        const cp1x = nums[i]; const cp1y = nums[i + 1]
        const cp2x = nums[i + 2]; const cp2y = nums[i + 3]
        const x = nums[i + 4]; const y = nums[i + 5]
        if (nodes.length > 0) {
          nodes[nodes.length - 1].cp2x = cp1x
          nodes[nodes.length - 1].cp2y = cp1y
        }
        nodes.push({ x, y, cp1x: cp2x, cp1y: cp2y, cp2x: x, cp2y: y, smooth: true, nodeType: 'symmetric' })
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
    const prevFlat = prev.cp2x === prev.x && prev.cp2y === prev.y
    const currFlat = curr.cp1x === curr.x && curr.cp1y === curr.y
    if (prevFlat && currFlat) {
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
