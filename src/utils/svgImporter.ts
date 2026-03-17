import type { Shape } from '../types/shapes'

function getAttr(el: Element, ...names: string[]): string {
  for (const name of names) {
    const v = el.getAttribute(name)
    if (v !== null) return v
  }
  return ''
}

function numAttr(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name)
  return v !== null ? parseFloat(v) || fallback : fallback
}

function extractStyle(el: Element): { fill: string; stroke: string; strokeWidth: number; opacity: number; fillOpacity: number } {
  const styleAttr = el.getAttribute('style') || ''
  const styleMap: Record<string, string> = {}
  styleAttr.split(';').forEach((part) => {
    const [k, v] = part.split(':').map((s) => s.trim())
    if (k && v) styleMap[k] = v
  })

  const fill = styleMap['fill'] || el.getAttribute('fill') || '#000000'
  const stroke = styleMap['stroke'] || el.getAttribute('stroke') || 'none'
  const strokeWidth = parseFloat(styleMap['stroke-width'] || el.getAttribute('stroke-width') || '1') || 1
  const opacity = parseFloat(styleMap['opacity'] || el.getAttribute('opacity') || '1') || 1
  const fillOpacity = parseFloat(styleMap['fill-opacity'] || el.getAttribute('fill-opacity') || '1') || 1

  return { fill, stroke, strokeWidth, opacity, fillOpacity }
}

function scalePathD(d: string, scaleX: number, scaleY: number): string {
  return d.replace(/([ML])\s*([-\d.]+)[,\s]+([-\d.]+)/gi, (_m, cmd, x, y) => {
    return `${cmd.toUpperCase()} ${parseFloat(x) * scaleX} ${parseFloat(y) * scaleY}`
  })
}

const BASE = {
  strokeDasharray: '',
  strokeLinecap: 'round' as const,
  rotation: 0,
  locked: false,
  visible: true,
}

function parseElements(
  els: HTMLCollectionOf<Element> | Element[],
  scaleX: number,
  scaleY: number,
): Array<Omit<Shape, 'id'>> {
  const results: Array<Omit<Shape, 'id'>> = []
  const arr = Array.from(els)
  for (const el of arr) {
    const tag = el.tagName.toLowerCase()
    if (['defs', 'mask', 'clippath', 'style'].includes(tag)) continue

    if (tag === 'g') {
      const children = parseElements(Array.from(el.children), scaleX, scaleY)
      results.push(...children)
      continue
    }

    const s = extractStyle(el)

    if (tag === 'rect') {
      results.push({
        ...BASE, ...s,
        type: 'rect',
        x: numAttr(el, 'x') * scaleX,
        y: numAttr(el, 'y') * scaleY,
        width: Math.max(1, numAttr(el, 'width', 10) * scaleX),
        height: Math.max(1, numAttr(el, 'height', 10) * scaleY),
        rx: numAttr(el, 'rx') * Math.min(scaleX, scaleY),
        name: 'Rect',
      } as Omit<Shape, 'id'>)
    } else if (tag === 'circle') {
      results.push({
        ...BASE, ...s,
        type: 'circle',
        cx: numAttr(el, 'cx') * scaleX,
        cy: numAttr(el, 'cy') * scaleY,
        r: Math.max(1, numAttr(el, 'r', 5) * Math.min(scaleX, scaleY)),
        name: 'Circle',
      } as Omit<Shape, 'id'>)
    } else if (tag === 'ellipse') {
      results.push({
        ...BASE, ...s,
        type: 'ellipse',
        cx: numAttr(el, 'cx') * scaleX,
        cy: numAttr(el, 'cy') * scaleY,
        rx: Math.max(1, numAttr(el, 'rx', 5) * scaleX),
        ry: Math.max(1, numAttr(el, 'ry', 5) * scaleY),
        name: 'Ellipse',
      } as Omit<Shape, 'id'>)
    } else if (tag === 'line') {
      results.push({
        ...BASE, ...s,
        type: 'line',
        x1: numAttr(el, 'x1') * scaleX,
        y1: numAttr(el, 'y1') * scaleY,
        x2: numAttr(el, 'x2') * scaleX,
        y2: numAttr(el, 'y2') * scaleY,
        fill: 'none',
        name: 'Line',
      } as Omit<Shape, 'id'>)
    } else if (tag === 'path') {
      const d = getAttr(el, 'd')
      if (!d) continue
      results.push({
        ...BASE, ...s,
        type: 'path',
        d: scalePathD(d, scaleX, scaleY),
        name: 'Path',
      } as Omit<Shape, 'id'>)
    }
  }
  return results
}

export function importSVGString(
  svgText: string,
  canvasSize: { width: number; height: number },
): Array<Omit<Shape, 'id'>> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg) return []

  const vbAttr = svg.getAttribute('viewBox') || '0 0 24 24'
  const vbParts = vbAttr.trim().split(/[\s,]+/).map(Number)
  const vbW = vbParts[2] || 24
  const vbH = vbParts[3] || 24

  const scaleX = canvasSize.width / vbW
  const scaleY = canvasSize.height / vbH

  return parseElements(Array.from(svg.children), scaleX, scaleY)
}
