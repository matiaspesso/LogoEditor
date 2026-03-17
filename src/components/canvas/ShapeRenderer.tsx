import React from 'react'
import type { Shape, GradientFill, ShapeFilters } from '../../types/shapes'
import { polygonPoints } from '../../utils/geometry'

interface Props {
  shape: Shape
  isSelected: boolean
  onPointerDown: (e: React.PointerEvent, id: string) => void
  activeTool: string
  isEditing?: boolean  // hide while inline text editor is active
}

// SVG filter region uses objectBoundingBox fractions by default.
// "-60%" / "220%" gives enough room for large offsets + blur spreads.
const SHADOW_REGION = { x: '-60%', y: '-60%', width: '220%', height: '220%' }

function renderFilterDef(id: string, f: ShapeFilters): React.ReactElement | null {
  const shadow = f.shadow?.enabled ? f.shadow : null
  const blur   = f.blur?.enabled   ? f.blur   : null
  if (!shadow && !blur) return null

  const fid = `fx-${id}`

  if (shadow && blur) {
    return (
      <filter id={fid} {...SHADOW_REGION}>
        <feGaussianBlur in="SourceGraphic" stdDeviation={blur.amount} result="bodyBlur" />
        <feGaussianBlur in="SourceAlpha"   stdDeviation={shadow.blur}  result="shadowBlur" />
        <feOffset       in="shadowBlur"    dx={shadow.dx} dy={shadow.dy} result="shadowOff" />
        <feFlood        floodColor={shadow.color} floodOpacity={shadow.opacity} result="flood" />
        <feComposite    in="flood" in2="shadowOff" operator="in" result="shadow" />
        <feMerge><feMergeNode in="shadow" /><feMergeNode in="bodyBlur" /></feMerge>
      </filter>
    )
  }
  if (shadow) {
    return (
      <filter id={fid} {...SHADOW_REGION}>
        <feDropShadow dx={shadow.dx} dy={shadow.dy} stdDeviation={shadow.blur}
          floodColor={shadow.color} floodOpacity={shadow.opacity} />
      </filter>
    )
  }
  return (
    <filter id={fid}>
      <feGaussianBlur stdDeviation={blur!.amount} />
    </filter>
  )
}

function renderGradientDef(shape: Shape): React.ReactElement | null {
  if (!shape.gradientFill) return null
  const gf: GradientFill = shape.gradientFill
  const { type, stops, angle } = gf
  const id = `grad-${shape.id}`
  const stopEls = stops.map((s, i) => (
    <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
  ))
  if (type === 'linear') {
    const rad = (angle * Math.PI) / 180
    const x1 = 0.5 - 0.5 * Math.cos(rad)
    const y1 = 0.5 - 0.5 * Math.sin(rad)
    const x2 = 0.5 + 0.5 * Math.cos(rad)
    const y2 = 0.5 + 0.5 * Math.sin(rad)
    return (
      <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="objectBoundingBox">
        {stopEls}
      </linearGradient>
    )
  }
  return (
    <radialGradient id={id} cx="50%" cy="50%" r="50%" gradientUnits="objectBoundingBox">
      {stopEls}
    </radialGradient>
  )
}

export function ShapeRenderer({ shape, isSelected, onPointerDown, activeTool, isEditing }: Props) {
  if (isEditing) return null
  const isSelectTool = activeTool === 'select'
  const pe = isSelectTool ? 'all' : 'none'

  const fillValue = shape.gradientFill ? `url(#grad-${shape.id})` : shape.fill
  const gradDef   = renderGradientDef(shape)
  const filterDef = shape.filters ? renderFilterDef(shape.id, shape.filters) : null
  const filterAttr = filterDef ? `url(#fx-${shape.id})` : undefined

  const common = {
    fill: fillValue,
    fillOpacity: shape.fillOpacity,
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    strokeDasharray: shape.strokeDasharray || undefined,
    strokeLinecap: (shape.strokeLinecap || 'round') as 'butt' | 'round' | 'square',
    opacity: shape.opacity,
    filter: filterAttr,
    pointerEvents: pe as 'all' | 'none',
    onPointerDown: (e: React.PointerEvent) => {
      if (!isSelectTool) return
      e.stopPropagation()
      onPointerDown(e, shape.id)
    },
    style: { cursor: isSelectTool ? 'move' : 'crosshair' },
  }

  const transforms: string[] = []
  if (shape.rotation) transforms.push(`rotate(${shape.rotation}deg)`)
  if (shape.flipX) transforms.push('scaleX(-1)')
  if (shape.flipY) transforms.push('scaleY(-1)')
  const rotStyle: React.CSSProperties = transforms.length
    ? { transform: transforms.join(' '), transformBox: 'fill-box' as any, transformOrigin: 'center' }
    : {}

  function wrapWithDefs(el: React.ReactElement): React.ReactElement {
    if (!gradDef && !filterDef) return el
    return (
      <>
        <defs>{gradDef}{filterDef}</defs>
        {el}
      </>
    ) as unknown as React.ReactElement
  }

  switch (shape.type) {
    case 'rect':
      return wrapWithDefs(
        <rect
          x={shape.x} y={shape.y}
          width={shape.width} height={shape.height}
          rx={shape.rx}
          {...common}
          style={{ ...common.style, ...rotStyle }}
        />
      )
    case 'circle':
      return wrapWithDefs(
        <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...common} style={{ ...common.style, ...rotStyle }} />
      )
    case 'ellipse':
      return wrapWithDefs(
        <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...common} style={{ ...common.style, ...rotStyle }} />
      )
    case 'line':
      return (
        <line
          x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2}
          {...common}
          fill="none"
          style={{ ...common.style, ...rotStyle }}
        />
      )
    case 'path':
      return wrapWithDefs(
        <path d={shape.d} {...common} style={{ ...common.style, ...rotStyle }} />
      )
    case 'text':
      return wrapWithDefs(
        <text
          x={shape.x} y={shape.y}
          fontSize={shape.fontSize}
          fontFamily={shape.fontFamily}
          fontWeight={shape.fontWeight}
          textAnchor={shape.textAnchor}
          dominantBaseline="auto"
          {...common}
          style={{ ...common.style, ...rotStyle }}
        >
          {shape.text}
        </text>
      )
    case 'polygon': {
      const pts = polygonPoints(shape.cx, shape.cy, shape.size, shape.sides, shape.innerRadius, shape.isStar)
      return wrapWithDefs(
        <polygon points={pts} {...common} style={{ ...common.style, ...rotStyle }} />
      )
    }
    default:
      return null
  }
}
