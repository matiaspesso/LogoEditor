import type { Shape, GradientFill } from '../types/shapes'
import type { CanvasSize } from '../store/useEditorStore'
import { polygonPoints, getShapeBBox } from './geometry'

function gradientDefString(shape: Shape): string {
  const gf = shape.gradientFill
  if (!gf) return ''
  const id = `grad-${shape.id}`
  const stops = gf.stops
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity}"/>`)
    .join('')

  if (gf.type === 'linear') {
    const rad = (gf.angle * Math.PI) / 180
    const x1 = 0.5 - 0.5 * Math.cos(rad)
    const y1 = 0.5 - 0.5 * Math.sin(rad)
    const x2 = 0.5 + 0.5 * Math.cos(rad)
    const y2 = 0.5 + 0.5 * Math.sin(rad)
    return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="objectBoundingBox">${stops}</linearGradient>`
  }
  return `<radialGradient id="${id}" cx="50%" cy="50%" r="50%" gradientUnits="objectBoundingBox">${stops}</radialGradient>`
}

function getShapeCenter(shape: Shape): { cx: number; cy: number } {
  const bbox = getShapeBBox(shape)
  return { cx: bbox.x + bbox.width / 2, cy: bbox.y + bbox.height / 2 }
}

function buildTransform(shape: Shape): string {
  const transforms: string[] = []
  if (shape.rotation) {
    const { cx, cy } = getShapeCenter(shape)
    transforms.push(`rotate(${shape.rotation} ${cx} ${cy})`)
  }
  if (shape.flipX) {
    const { cx } = getShapeCenter(shape)
    transforms.push(`translate(${cx} 0) scale(-1 1) translate(${-cx} 0)`)
  }
  if (shape.flipY) {
    const { cy } = getShapeCenter(shape)
    transforms.push(`translate(0 ${cy}) scale(1 -1) translate(0 ${-cy})`)
  }
  return transforms.length ? transforms.join(' ') : ''
}

function shapeToSVGElement(shape: Shape): string {
  const fillAttr = shape.gradientFill
    ? `url(#grad-${shape.id})`
    : shape.fill !== 'none' ? shape.fill : 'none'

  const transform = buildTransform(shape)

  const base = [
    `fill="${fillAttr}"`,
    shape.fillOpacity !== 1 ? `fill-opacity="${shape.fillOpacity}"` : '',
    shape.stroke !== 'none' ? `stroke="${shape.stroke}"` : 'stroke="none"',
    shape.strokeWidth > 0 ? `stroke-width="${shape.strokeWidth}"` : '',
    shape.strokeDasharray ? `stroke-dasharray="${shape.strokeDasharray}"` : '',
    shape.strokeLinecap && shape.strokeLinecap !== 'butt' ? `stroke-linecap="${shape.strokeLinecap}"` : '',
    shape.opacity !== 1 ? `opacity="${shape.opacity}"` : '',
    transform ? `transform="${transform}"` : '',
  ].filter(Boolean).join(' ')

  switch (shape.type) {
    case 'rect':
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}"${shape.rx ? ` rx="${shape.rx}"` : ''} ${base}/>`
    case 'circle':
      return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" ${base}/>`
    case 'ellipse':
      return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}" ${base}/>`
    case 'line':
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${base}/>`
    case 'path':
      return `<path d="${shape.d}" ${base}/>`
    case 'text':
      return `<text x="${shape.x}" y="${shape.y}" font-size="${shape.fontSize}" font-family="${shape.fontFamily}" font-weight="${shape.fontWeight}" text-anchor="${shape.textAnchor}" ${base}>${shape.text}</text>`
    case 'polygon': {
      const pts = polygonPoints(shape.cx, shape.cy, shape.size, shape.sides, shape.innerRadius, shape.isStar)
      return `<polygon points="${pts}" ${base}/>`
    }
    default:
      return ''
  }
}

export function serializeSVG(
  shapes: Shape[],
  layerOrder: string[],
  canvasSize: CanvasSize,
  backgroundColor: string
): string {
  const orderedShapes = layerOrder
    .map((id) => shapes.find((s) => s.id === id))
    .filter((s): s is Shape => s !== undefined)

  const bg =
    backgroundColor !== 'transparent'
      ? `  <rect width="${canvasSize.width}" height="${canvasSize.height}" fill="${backgroundColor}"/>\n`
      : ''

  // Collect gradient defs
  const gradDefs = orderedShapes
    .filter((s) => s.gradientFill)
    .map((s) => `    ${gradientDefString(s)}`)
    .join('\n')

  const defsBlock = gradDefs ? `  <defs>\n${gradDefs}\n  </defs>\n` : ''

  const elements = orderedShapes.map((s) => `  ${shapeToSVGElement(s)}`).join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasSize.width} ${canvasSize.height}" width="${canvasSize.width}" height="${canvasSize.height}">\n${defsBlock}${bg}${elements}\n</svg>`
}

export async function exportPNG(svgString: string, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, size, size)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => {
        if (b) resolve(b)
        else reject(new Error('Failed to create PNG blob'))
      }, 'image/png')
    }
    img.onerror = reject
    img.src = url
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
