import type { Shape, BBox } from '../types/shapes'

export function getShapeBBox(shape: Shape): BBox {
  switch (shape.type) {
    case 'rect':
    case 'frame':
      return { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
    case 'circle':
      return { x: shape.cx - shape.r, y: shape.cy - shape.r, width: shape.r * 2, height: shape.r * 2 }
    case 'ellipse':
      return { x: shape.cx - shape.rx, y: shape.cy - shape.ry, width: shape.rx * 2, height: shape.ry * 2 }
    case 'line': {
      const x = Math.min(shape.x1, shape.x2)
      const y = Math.min(shape.y1, shape.y2)
      return { x, y, width: Math.abs(shape.x2 - shape.x1) || 1, height: Math.abs(shape.y2 - shape.y1) || 1 }
    }
    case 'path': {
      // Rough bbox from path string
      const nums = shape.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      if (nums.length < 2) return { x: 0, y: 0, width: 0, height: 0 }
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 0; i < nums.length - 1; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]) }
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      return { x: minX, y: minY, width: maxX - minX || 1, height: maxY - minY || 1 }
    }
    case 'text':
      return { x: shape.x, y: shape.y - shape.fontSize, width: shape.fontSize * shape.text.length * 0.6, height: shape.fontSize }
    case 'polygon':
      return { x: shape.cx - shape.size, y: shape.cy - shape.size, width: shape.size * 2, height: shape.size * 2 }
    default:
      return { x: 0, y: 0, width: 0, height: 0 }
  }
}

export function getSelectionBBox(shapes: Shape[]): BBox | null {
  if (shapes.length === 0) return null
  const bboxes = shapes.map(getShapeBBox)
  const x = Math.min(...bboxes.map((b) => b.x))
  const y = Math.min(...bboxes.map((b) => b.y))
  const x2 = Math.max(...bboxes.map((b) => b.x + b.width))
  const y2 = Math.max(...bboxes.map((b) => b.y + b.height))
  return { x, y, width: x2 - x, height: y2 - y }
}

export function snap(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled) return value
  return Math.round(value / gridSize) * gridSize
}

export function polygonPoints(cx: number, cy: number, size: number, sides: number, innerRadius = 0, isStar = false): string {
  const points: string[] = []
  const total = isStar ? sides * 2 : sides
  for (let i = 0; i < total; i++) {
    const angle = (i * Math.PI * 2) / total - Math.PI / 2
    const r = isStar && i % 2 === 1 ? size * innerRadius : size
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
  }
  return points.join(' ')
}

export function svgPointFromEvent(
  e: React.MouseEvent | MouseEvent,
  svgEl: SVGSVGElement
): { x: number; y: number } {
  const pt = svgEl.createSVGPoint()
  pt.x = e instanceof MouseEvent ? e.clientX : e.clientX
  pt.y = e instanceof MouseEvent ? e.clientY : e.clientY
  const svgP = pt.matrixTransform(svgEl.getScreenCTM()!.inverse())
  return { x: svgP.x, y: svgP.y }
}

/** Builds an SVG transform attribute string (same logic used in canvas & serializer). */
export function buildShapeTransform(shape: Shape): string {
  const transforms: string[] = []
  const bbox = getShapeBBox(shape)
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2
  if (shape.rotation) transforms.push(`rotate(${shape.rotation} ${cx} ${cy})`)
  if (shape.flipX) transforms.push(`translate(${cx} 0) scale(-1 1) translate(${-cx} 0)`)
  if (shape.flipY) transforms.push(`translate(0 ${cy}) scale(1 -1) translate(0 ${-cy})`)
  const skewX = (shape as any).skewX ?? 0
  const skewY = (shape as any).skewY ?? 0
  if (skewX || skewY) {
    const parts = [`translate(${cx} ${cy})`]
    if (skewX) parts.push(`skewX(${skewX})`)
    if (skewY) parts.push(`skewY(${skewY})`)
    parts.push(`translate(${-cx} ${-cy})`)
    transforms.push(parts.join(' '))
  }
  return transforms.join(' ')
}

export function moveShape(shape: Shape, dx: number, dy: number): Partial<Shape> {
  switch (shape.type) {
    case 'rect':
    case 'frame': return { x: shape.x + dx, y: shape.y + dy }
    case 'circle': return { cx: shape.cx + dx, cy: shape.cy + dy }
    case 'ellipse': return { cx: shape.cx + dx, cy: shape.cy + dy }
    case 'line': return { x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy }
    case 'path': {
      const d = shape.d.replace(/([-\d.]+)\s+([-\d.]+)/g, (_, x, y) =>
        `${parseFloat(x) + dx} ${parseFloat(y) + dy}`
      )
      return { d }
    }
    case 'text': return { x: shape.x + dx, y: shape.y + dy }
    case 'polygon': return { cx: shape.cx + dx, cy: shape.cy + dy }
    default: return {}
  }
}
