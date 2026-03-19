import type { Shape, GradientFill, PatternFill, BlendShape } from '../types/shapes'
import type { CanvasSize } from '../store/useEditorStore'
import { polygonPoints, buildShapeTransform } from './geometry'
import { computeBlendSteps } from './blendShapes'

function gradientDefString(shape: Shape): string {
  const gf = shape.gradientFill
  if (!gf) return ''
  const id = `grad-${shape.id}`
  const stops = gf.stops
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity}"/>`)
    .join('')

  if (gf.type === 'linear') {
    const rad = (gf.angle * Math.PI) / 180
    const x1 = gf.x1 ?? (0.5 - 0.5 * Math.cos(rad))
    const y1 = gf.y1 ?? (0.5 - 0.5 * Math.sin(rad))
    const x2 = gf.x2 ?? (0.5 + 0.5 * Math.cos(rad))
    const y2 = gf.y2 ?? (0.5 + 0.5 * Math.sin(rad))
    return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="objectBoundingBox">${stops}</linearGradient>`
  }
  return `<radialGradient id="${id}" cx="${gf.cx ?? 0.5}" cy="${gf.cy ?? 0.5}" r="50%" gradientUnits="objectBoundingBox">${stops}</radialGradient>`
}

function patternDefString(shape: Shape): string {
  const pf: PatternFill | undefined = shape.patternFill
  if (!pf) return ''
  const pid = `pat-${shape.id}`
  const { type, color, size, angle } = pf
  const lw = Math.max(0.5, size * 0.1)
  const transform = angle ? ` patternTransform="rotate(${angle})"` : ''
  let content = ''
  switch (type) {
    case 'stripes':
      content = `<line x1="${size / 2}" y1="0" x2="${size / 2}" y2="${size}" stroke="${color}" stroke-width="${size * 0.4}"/>`
      break
    case 'dots':
      content = `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.22}" fill="${color}"/>`
      break
    case 'grid':
      content = `<path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="${color}" stroke-width="${lw}"/>`
      break
    case 'crosshatch':
      content = `<line x1="0" y1="0" x2="${size}" y2="${size}" stroke="${color}" stroke-width="${lw}"/><line x1="${size}" y1="0" x2="0" y2="${size}" stroke="${color}" stroke-width="${lw}"/>`
      break
    default:
      return ''
  }
  return `<pattern id="${pid}" patternUnits="userSpaceOnUse" width="${size}" height="${size}"${transform}>${content}</pattern>`
}

function filterDefString(shape: Shape): string {
  const f = shape.filters
  if (!f) return ''
  const shadow = f.shadow?.enabled ? f.shadow : null
  const blur = f.blur?.enabled ? f.blur : null
  const innerShadow = f.innerShadow?.enabled ? f.innerShadow : null
  const glow = f.glow?.enabled ? f.glow : null
  const feather = f.feather?.enabled ? f.feather : null
  if (!shadow && !blur && !innerShadow && !glow && !feather) return ''

  const fid = `fx-${shape.id}`
  const parts: string[] = []
  const mergeInputs: string[] = []

  if (blur) {
    parts.push(`<feGaussianBlur in="SourceGraphic" stdDeviation="${blur.amount}" result="blurred"/>`)
  }
  const src = blur ? 'blurred' : 'SourceGraphic'

  if (glow) {
    parts.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${glow.blur}" result="gblu"/>`,
      `<feFlood flood-color="${glow.color}" flood-opacity="${glow.opacity}" result="gcol"/>`,
      `<feComposite in="gcol" in2="gblu" operator="in" result="gout"/>`,
    )
    mergeInputs.push('gout')
  }
  if (shadow) {
    parts.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${shadow.blur}" result="sblu"/>`,
      `<feOffset in="sblu" dx="${shadow.dx}" dy="${shadow.dy}" result="soff"/>`,
      `<feFlood flood-color="${shadow.color}" flood-opacity="${shadow.opacity}" result="scol"/>`,
      `<feComposite in="scol" in2="soff" operator="in" result="sout"/>`,
    )
    mergeInputs.push('sout')
  }
  mergeInputs.push(src)
  if (innerShadow) {
    parts.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${innerShadow.blur}" result="iblu"/>`,
      `<feOffset in="iblu" dx="${innerShadow.dx}" dy="${innerShadow.dy}" result="ioff"/>`,
      `<feFlood flood-color="${innerShadow.color}" flood-opacity="${innerShadow.opacity}" result="icol"/>`,
      `<feComposite in="icol" in2="ioff" operator="in" result="ic1"/>`,
      `<feComposite in="ic1" in2="SourceAlpha" operator="in" result="iout"/>`,
    )
    mergeInputs.push('iout')
  }

  const region = `x="-60%" y="-60%" width="220%" height="220%"`
  if (feather) {
    const merge = mergeInputs.length > 0 ? `<feMerge>${mergeInputs.map((i) => `<feMergeNode in="${i}"/>`).join('')}</feMerge>` : ''
    return `<filter id="${fid}" ${region}>${parts.join('')}${merge}<feGaussianBlur in="SourceAlpha" stdDeviation="${feather.amount}" result="feaBlu"/><feComposite in="${mergeInputs[mergeInputs.length - 1] ?? 'SourceGraphic'}" in2="feaBlu" operator="in"/></filter>`
  }
  const mergeNodes = mergeInputs.map((inp) => `<feMergeNode in="${inp}"/>`).join('')
  return `<filter id="${fid}" ${region}>${parts.join('')}<feMerge>${mergeNodes}</feMerge></filter>`
}

function markerDefString(shape: Shape): string {
  if (shape.type !== 'line' && shape.type !== 'path') return ''
  const ms = shape.markerStart
  const me = shape.markerEnd
  if ((!ms || ms === 'none') && (!me || me === 'none')) return ''
  const fill = shape.stroke !== 'none' ? shape.stroke : '#000'

  function mk(id: string, type: string, isStart: boolean): string {
    if (!type || type === 'none') return ''
    const orient = isStart ? 'auto-start-reverse' : 'auto'
    if (type === 'arrow')
      return `<marker id="${id}" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="${orient}" markerUnits="strokeWidth"><path d="M 0 0 L 8 3 L 0 6 Z" fill="${fill}"/></marker>`
    if (type === 'dot')
      return `<marker id="${id}" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="${orient}" markerUnits="strokeWidth"><circle cx="2.5" cy="2.5" r="2.5" fill="${fill}"/></marker>`
    if (type === 'diamond')
      return `<marker id="${id}" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="${orient}" markerUnits="strokeWidth"><path d="M 0 4 L 4 0 L 8 4 L 4 8 Z" fill="${fill}"/></marker>`
    return ''
  }

  const sm = ms && ms !== 'none' ? mk(`mk-s-${shape.id}`, ms, true) : ''
  const em = me && me !== 'none' ? mk(`mk-e-${shape.id}`, me, false) : ''
  return sm + em
}


function strokeAlignDefString(shape: Shape): string {
  if (!((shape as any).strokeAlignment === 'inside') || !(shape.strokeWidth > 0) || shape.stroke === 'none') return ''
  return `<clipPath id="sa-${shape.id}">${shapeGeometryStringInner(shape)}</clipPath>`
}

function shapeGeometryStringInner(shape: Shape): string {
  switch (shape.type) {
    case 'rect':
    case 'frame':
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}"${(shape as any).rx ? ` rx="${(shape as any).rx}"` : ''}/>`
    case 'circle': return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"/>`
    case 'ellipse': return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}"/>`
    case 'path': return `<path d="${shape.d}"/>`
    case 'polygon': {
      const pts = polygonPoints(shape.cx, shape.cy, shape.size, shape.sides, shape.innerRadius, shape.isStar)
      return `<polygon points="${pts}"/>`
    }
    default: return ''
  }
}

function shapeGeometryString(shape: Shape): string {
  switch (shape.type) {
    case 'rect':
    case 'frame':
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}"${(shape as any).rx ? ` rx="${(shape as any).rx}"` : ''}/>`
    case 'circle': return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"/>`
    case 'ellipse': return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}"/>`
    case 'path': return `<path d="${shape.d}"/>`
    case 'polygon': {
      const pts = polygonPoints(shape.cx, shape.cy, shape.size, shape.sides, shape.innerRadius, shape.isStar)
      return `<polygon points="${pts}"/>`
    }
    default: return ''
  }
}

function shapeToSVGElement(shape: Shape, allShapes?: Shape[]): string {
  if (shape.isClipSource) return ''  // rendered inside <clipPath> only

  const fillAttr = shape.patternFill
    ? `url(#pat-${shape.id})`
    : shape.gradientFill
      ? `url(#grad-${shape.id})`
      : shape.fill !== 'none' ? shape.fill : 'none'

  const clipAttr = shape.clippedBy ? ` clip-path="url(#clip-${shape.id})"` : ''
  const transform = buildShapeTransform(shape)

  const sa = (shape as any).strokeAlignment as string | undefined
  const hasStroke = shape.strokeWidth > 0 && shape.stroke !== 'none'
  const doubledSW = (sa === 'inside' || sa === 'outside') && hasStroke ? shape.strokeWidth * 2 : shape.strokeWidth
  const saClipAttr = sa === 'inside' && hasStroke ? ` clip-path="url(#sa-${shape.id})"` : ''

  const markerStartAttr = (shape.type === 'line' || shape.type === 'path') && shape.markerStart && shape.markerStart !== 'none'
    ? ` marker-start="url(#mk-s-${shape.id})"` : ''
  const markerEndAttr = (shape.type === 'line' || shape.type === 'path') && shape.markerEnd && shape.markerEnd !== 'none'
    ? ` marker-end="url(#mk-e-${shape.id})"` : ''

  const base = [
    `fill="${fillAttr}"`,
    shape.fillOpacity !== 1 ? `fill-opacity="${shape.fillOpacity}"` : '',
    shape.stroke !== 'none' ? `stroke="${shape.stroke}"` : 'stroke="none"',
    doubledSW > 0 ? `stroke-width="${doubledSW}"` : '',
    shape.strokeDasharray ? `stroke-dasharray="${shape.strokeDasharray}"` : '',
    shape.strokeLinecap && shape.strokeLinecap !== 'butt' ? `stroke-linecap="${shape.strokeLinecap}"` : '',
    shape.strokeLinejoin && shape.strokeLinejoin !== 'miter' ? `stroke-linejoin="${shape.strokeLinejoin}"` : '',
    shape.opacity !== 1 ? `opacity="${shape.opacity}"` : '',
    shape.filters && (shape.filters.shadow?.enabled || shape.filters.blur?.enabled || shape.filters.innerShadow?.enabled || shape.filters.glow?.enabled || shape.filters.feather?.enabled)
      ? `filter="url(#fx-${shape.id})"` : '',
    transform ? `transform="${transform}"` : '',
  ].filter(Boolean).join(' ')

  function wrapOutside(inner: string): string {
    if (sa !== 'outside' || !hasStroke) return inner
    // Two elements: stroke only + fill only
    const strokeOnly = inner.replace(`fill="${fillAttr}"`, 'fill="none"')
    const fillOnly = inner.replace(`stroke="${shape.stroke}"`, 'stroke="none"').replace(`stroke-width="${doubledSW}"`, 'stroke-width="0"')
    return `<g>${strokeOnly}${fillOnly}</g>`
  }

  switch (shape.type) {
    case 'rect':
    case 'frame': {
      const inner = `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}"${(shape as any).rx ? ` rx="${(shape as any).rx}"` : ''} ${base}${clipAttr}${saClipAttr}/>`
      return wrapOutside(inner)
    }
    case 'circle': {
      const inner = `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" ${base}${clipAttr}${saClipAttr}/>`
      return wrapOutside(inner)
    }
    case 'ellipse': {
      const inner = `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}" ${base}${clipAttr}${saClipAttr}/>`
      return wrapOutside(inner)
    }
    case 'line':
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${base}${markerStartAttr}${markerEndAttr}/>`
    case 'path': {
      const inner = `<path d="${shape.d}" ${base}${clipAttr}${markerStartAttr}${markerEndAttr}/>`
      return wrapOutside(inner)
    }
    case 'text': {
      const ls = (shape as any).letterSpacing
      const lsAttr = ls ? ` letter-spacing="${ls}"` : ''
      if (shape.textOnArc) {
        const arcId = `arcpath-${shape.id}`
        const offset = shape.arcOffset ?? 50
        return `<text font-size="${shape.fontSize}" font-family="${shape.fontFamily}" font-weight="${shape.fontWeight}"${lsAttr} ${base}${clipAttr}><textPath href="#${arcId}" startOffset="${offset}%" textAnchor="middle">${shape.text}</textPath></text>`
      }
      // Area text word-wrap
      const textWidth: number | undefined = (shape as any).textWidth
      if (textWidth && typeof document !== 'undefined') {
        const cvs = document.createElement('canvas')
        const ctx2 = cvs.getContext('2d')!
        ctx2.font = `${shape.fontWeight} ${shape.fontSize}px ${shape.fontFamily}`
        const words = shape.text.split(' ')
        const lineH = shape.fontSize * 1.3
        const lines: string[] = []
        let cur = ''
        for (const word of words) {
          const test = cur ? `${cur} ${word}` : word
          if (ctx2.measureText(test).width > textWidth && cur) { lines.push(cur); cur = word } else cur = test
        }
        if (cur) lines.push(cur)
        const tspans = lines.map((line, i) => `<tspan x="${shape.x}" dy="${i === 0 ? 0 : lineH}">${line}</tspan>`).join('')
        return `<text x="${shape.x}" y="${shape.y}" font-size="${shape.fontSize}" font-family="${shape.fontFamily}" font-weight="${shape.fontWeight}" text-anchor="${shape.textAnchor}"${lsAttr} ${base}${clipAttr}>${tspans}</text>`
      }

      const charOffsets: number[] | undefined = (shape as any).charOffsets
      const charOffsetsY: number[] | undefined = (shape as any).charOffsetsY
      const hasOffsets = (charOffsets?.some((v: number) => v !== 0)) || (charOffsetsY?.some((v: number) => v !== 0))
      if (hasOffsets) {
        const tspans = shape.text.split('').map((ch: string, i: number) => {
          const dx = i === 0 ? (charOffsets?.[0] ?? 0) : (charOffsets?.[i] ?? 0) - (charOffsets?.[i-1] ?? 0)
          const dy = i === 0 ? (charOffsetsY?.[0] ?? 0) : (charOffsetsY?.[i] ?? 0) - (charOffsetsY?.[i-1] ?? 0)
          const attrs = [dx !== 0 ? `dx="${dx}"` : '', dy !== 0 ? `dy="${dy}"` : ''].filter(Boolean).join(' ')
          return attrs ? `<tspan ${attrs}>${ch}</tspan>` : `<tspan>${ch}</tspan>`
        }).join('')
        return `<text x="${shape.x}" y="${shape.y}" font-size="${shape.fontSize}" font-family="${shape.fontFamily}" font-weight="${shape.fontWeight}" text-anchor="${shape.textAnchor}"${lsAttr} ${base}${clipAttr}>${tspans}</text>`
      }
      return `<text x="${shape.x}" y="${shape.y}" font-size="${shape.fontSize}" font-family="${shape.fontFamily}" font-weight="${shape.fontWeight}" text-anchor="${shape.textAnchor}"${lsAttr} ${base}${clipAttr}>${shape.text}</text>`
    }
    case 'polygon': {
      const pts = polygonPoints(shape.cx, shape.cy, shape.size, shape.sides, shape.innerRadius, shape.isStar)
      const inner = `<polygon points="${pts}" ${base}${clipAttr}${saClipAttr}/>`
      return wrapOutside(inner)
    }
    case 'blend': {
      const blendShape = shape as BlendShape
      const steps = computeBlendSteps({ shape1: blendShape.shape1, shape2: blendShape.shape2, steps: blendShape.steps })
      return `<g>${steps.map((s, i) => shapeToSVGElement({ ...s, id: `${shape.id}-s${i}` })).join('')}</g>`
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

  // Collect all defs
  const gradDefs = orderedShapes
    .filter((s) => s.gradientFill)
    .map((s) => `    ${gradientDefString(s)}`)
    .join('\n')

  const patternDefs = orderedShapes
    .filter((s) => s.patternFill)
    .map((s) => `    ${patternDefString(s)}`)
    .join('\n')

  const filterDefs = orderedShapes
    .filter((s) => s.filters && (s.filters.shadow?.enabled || s.filters.blur?.enabled || s.filters.innerShadow?.enabled || s.filters.glow?.enabled || s.filters.feather?.enabled))
    .map((s) => `    ${filterDefString(s)}`)
    .join('\n')

  const markerDefs = orderedShapes
    .filter((s) => (s.type === 'line' || s.type === 'path') && (s.markerStart || s.markerEnd))
    .map((s) => `    ${markerDefString(s)}`)
    .join('\n')

  const clipDefs = orderedShapes
    .filter((s) => s.clippedBy)
    .map((s) => {
      const clipSrc = shapes.find((sh) => sh.id === s.clippedBy)
      if (!clipSrc) return ''
      return `    <clipPath id="clip-${s.id}">${shapeGeometryString(clipSrc)}</clipPath>`
    })
    .filter(Boolean)
    .join('\n')

  // Arc text path defs — must be in main defs so textPath hrefs resolve correctly
  const arcPathDefs = orderedShapes
    .filter((s) => s.type === 'text' && (s as any).textOnArc)
    .map((s) => {
      const shape = s as any
      const r = shape.arcRadius ?? shape.fontSize * 3
      const cx = shape.x, cy = shape.y
      const sweep = shape.arcDirection === 'down' ? 1 : 0
      const arcD = `M ${cx - r},${cy} A ${r},${r} 0 1,${sweep} ${cx + r},${cy}`
      return `    <path id="arcpath-${shape.id}" d="${arcD}"/>`
    })
    .join('\n')

  const strokeAlignDefs = orderedShapes
    .filter((s) => (s as any).strokeAlignment === 'inside' && s.strokeWidth > 0 && s.stroke !== 'none')
    .map((s) => `    ${strokeAlignDefString(s)}`)
    .join('\n')

  const allDefs = [gradDefs, patternDefs, filterDefs, markerDefs, clipDefs, arcPathDefs, strokeAlignDefs].filter(Boolean).join('\n')
  const defsBlock = allDefs ? `  <defs>\n${allDefs}\n  </defs>\n` : ''

  const elements = orderedShapes.map((s) => `  ${shapeToSVGElement(s, shapes)}`).filter((s) => s.trim()).join('\n')

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
