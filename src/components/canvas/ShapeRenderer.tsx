import React from 'react'
import type { Shape, GradientFill, ShapeFilters, PatternFill, BlendShape } from '../../types/shapes'
import { polygonPoints, buildShapeTransform } from '../../utils/geometry'
import { renderBrushPaths, getBrushPatternPositions, type BrushDef } from '../../utils/brushPath'
import { computeBlendSteps } from '../../utils/blendShapes'

interface Props {
  shape: Shape
  isSelected: boolean
  onPointerDown: (e: React.PointerEvent, id: string) => void
  activeTool: string
  isEditing?: boolean  // hide while inline text editor is active
  clipSource?: Shape   // shape used as clipping mask for this one
}

// Render just the geometry of a shape (no fill/stroke) inside a <clipPath>
function renderClipGeometry(shape: Shape): React.ReactElement | null {
  switch (shape.type) {
    case 'rect': return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />
    case 'circle': return <circle cx={shape.cx} cy={shape.cy} r={shape.r} />
    case 'ellipse': return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />
    case 'path': return <path d={shape.d} />
    case 'text': return <text x={shape.x} y={shape.y} fontSize={shape.fontSize} fontFamily={shape.fontFamily} fontWeight={shape.fontWeight}>{shape.text}</text>
    case 'polygon': {
      const pts = polygonPoints(shape.cx, shape.cy, shape.size, shape.sides, shape.innerRadius, shape.isStar)
      return <polygon points={pts} />
    }
    default: return null
  }
}

// SVG filter region uses objectBoundingBox fractions by default.
// "-60%" / "220%" gives enough room for large offsets + blur spreads.
const SHADOW_REGION = { x: '-60%', y: '-60%', width: '220%', height: '220%' }

function renderFilterDef(id: string, f: ShapeFilters): React.ReactElement | null {
  const shadow = f.shadow?.enabled ? f.shadow : null
  const blur = f.blur?.enabled ? f.blur : null
  const innerShadow = f.innerShadow?.enabled ? f.innerShadow : null
  const glow = f.glow?.enabled ? f.glow : null

  if (!shadow && !blur && !innerShadow && !glow) return null

  const fid = `fx-${id}`
  const prims: React.ReactElement[] = []
  const mergeInputs: string[] = []

  if (blur) {
    prims.push(<feGaussianBlur key="blur" in="SourceGraphic" stdDeviation={blur.amount} result="blurred" />)
  }
  const src = blur ? 'blurred' : 'SourceGraphic'

  // Glow renders behind the shape
  if (glow) {
    prims.push(
      <feGaussianBlur key="gblu" in="SourceAlpha" stdDeviation={glow.blur} result="gblu" />,
      <feFlood key="gcol" floodColor={glow.color} floodOpacity={glow.opacity} result="gcol" />,
      <feComposite key="gout" in="gcol" in2="gblu" operator="in" result="gout" />,
    )
    mergeInputs.push('gout')
  }

  // Drop shadow behind the shape
  if (shadow) {
    prims.push(
      <feGaussianBlur key="sblu" in="SourceAlpha" stdDeviation={shadow.blur} result="sblu" />,
      <feOffset key="soff" in="sblu" dx={shadow.dx} dy={shadow.dy} result="soff" />,
      <feFlood key="scol" floodColor={shadow.color} floodOpacity={shadow.opacity} result="scol" />,
      <feComposite key="sout" in="scol" in2="soff" operator="in" result="sout" />,
    )
    mergeInputs.push('sout')
  }

  // Source graphic (or blurred version)
  mergeInputs.push(src)

  // Inner shadow renders on top of the shape (inside)
  if (innerShadow) {
    prims.push(
      <feGaussianBlur key="iblu" in="SourceAlpha" stdDeviation={innerShadow.blur} result="iblu" />,
      <feOffset key="ioff" in="iblu" dx={innerShadow.dx} dy={innerShadow.dy} result="ioff" />,
      <feFlood key="icol" floodColor={innerShadow.color} floodOpacity={innerShadow.opacity} result="icol" />,
      <feComposite key="ic1" in="icol" in2="ioff" operator="in" result="ic1" />,
      <feComposite key="iout" in="ic1" in2="SourceAlpha" operator="in" result="iout" />,
    )
    mergeInputs.push('iout')
  }

  return (
    <filter id={fid} {...SHADOW_REGION}>
      {prims}
      <feMerge>
        {mergeInputs.map((inp, i) => <feMergeNode key={i} in={inp} />)}
      </feMerge>
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
    const gx1 = gf.x1 ?? (0.5 - 0.5 * Math.cos(rad))
    const gy1 = gf.y1 ?? (0.5 - 0.5 * Math.sin(rad))
    const gx2 = gf.x2 ?? (0.5 + 0.5 * Math.cos(rad))
    const gy2 = gf.y2 ?? (0.5 + 0.5 * Math.sin(rad))
    return (
      <linearGradient id={id} x1={gx1} y1={gy1} x2={gx2} y2={gy2} gradientUnits="objectBoundingBox">
        {stopEls}
      </linearGradient>
    )
  }
  return (
    <radialGradient id={id} cx={gf.cx ?? 0.5} cy={gf.cy ?? 0.5} r="50%" gradientUnits="objectBoundingBox">
      {stopEls}
    </radialGradient>
  )
}

function renderPatternDef(shape: Shape): React.ReactElement | null {
  const pf: PatternFill | undefined = shape.patternFill
  if (!pf) return null
  const pid = `pat-${shape.id}`
  const { type, color, size, angle } = pf
  const lw = Math.max(0.5, size * 0.1)
  let content: React.ReactElement
  switch (type) {
    case 'stripes':
      content = <line x1={size / 2} y1={0} x2={size / 2} y2={size} stroke={color} strokeWidth={size * 0.4} />
      break
    case 'dots':
      content = <circle cx={size / 2} cy={size / 2} r={size * 0.22} fill={color} />
      break
    case 'grid':
      content = <path d={`M ${size} 0 L 0 0 0 ${size}`} fill="none" stroke={color} strokeWidth={lw} />
      break
    case 'crosshatch':
      content = (
        <>
          <line x1={0} y1={0} x2={size} y2={size} stroke={color} strokeWidth={lw} />
          <line x1={size} y1={0} x2={0} y2={size} stroke={color} strokeWidth={lw} />
        </>
      ) as unknown as React.ReactElement
      break
    default:
      return null
  }
  return (
    <pattern id={pid} patternUnits="userSpaceOnUse" width={size} height={size}
      patternTransform={angle ? `rotate(${angle})` : undefined}>
      {content}
    </pattern>
  )
}

function renderMarkerDef(shape: Shape): React.ReactElement | null {
  if (shape.type !== 'line' && shape.type !== 'path') return null
  const ms = shape.markerStart
  const me = shape.markerEnd
  if ((!ms || ms === 'none') && (!me || me === 'none')) return null
  const fill = shape.stroke !== 'none' ? shape.stroke : '#000'

  function mk(id: string, type: string, isStart: boolean): React.ReactElement | null {
    if (!type || type === 'none') return null
    const orient = isStart ? 'auto-start-reverse' : 'auto'
    if (type === 'arrow')
      return <marker key={id} id={id} markerWidth="8" markerHeight="6" refX="4" refY="3" orient={orient} markerUnits="strokeWidth">
        <path d="M 0 0 L 8 3 L 0 6 Z" fill={fill} />
      </marker>
    if (type === 'dot')
      return <marker key={id} id={id} markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient={orient} markerUnits="strokeWidth">
        <circle cx="2.5" cy="2.5" r="2.5" fill={fill} />
      </marker>
    if (type === 'diamond')
      return <marker key={id} id={id} markerWidth="8" markerHeight="8" refX="4" refY="4" orient={orient} markerUnits="strokeWidth">
        <path d="M 0 4 L 4 0 L 8 4 L 4 8 Z" fill={fill} />
      </marker>
    return null
  }

  const startM = ms && ms !== 'none' ? mk(`mk-s-${shape.id}`, ms, true) : null
  const endM = me && me !== 'none' ? mk(`mk-e-${shape.id}`, me, false) : null
  if (!startM && !endM) return null
  return <>{startM}{endM}</> as unknown as React.ReactElement
}

export function ShapeRenderer({ shape, isSelected, onPointerDown, activeTool, isEditing, clipSource }: Props) {
  if (isEditing) return null
  if (shape.isClipSource) return null  // clip sources are rendered inside <clipPath>, not directly
  const isSelectTool = activeTool === 'select'
  const pe = isSelectTool ? 'all' : 'none'

  // Fill priority: patternFill > gradientFill > solid color
  const fillValue = shape.patternFill
    ? `url(#pat-${shape.id})`
    : shape.gradientFill
      ? `url(#grad-${shape.id})`
      : shape.fill

  const strokeAlign: string = (shape as any).strokeAlignment ?? 'center'
  const hasStroke = shape.strokeWidth > 0 && shape.stroke !== 'none'
  const isInsideStroke = strokeAlign === 'inside' && hasStroke
  const isOutsideStroke = strokeAlign === 'outside' && hasStroke

  const gradDef = renderGradientDef(shape)
  const patternDef = renderPatternDef(shape)
  const filterDef = shape.filters ? renderFilterDef(shape.id, shape.filters) : null
  const markerDef = renderMarkerDef(shape)
  const filterAttr = filterDef ? `url(#fx-${shape.id})` : undefined

  const markerStartAttr = shape.type === 'line' || shape.type === 'path'
    ? (shape.markerStart && shape.markerStart !== 'none' ? `url(#mk-s-${shape.id})` : undefined)
    : undefined
  const markerEndAttr = shape.type === 'line' || shape.type === 'path'
    ? (shape.markerEnd && shape.markerEnd !== 'none' ? `url(#mk-e-${shape.id})` : undefined)
    : undefined

  // Compute SVG transform attribute (same math as svgSerializer — ensures export matches canvas)
  const svgTransform = buildShapeTransform(shape) || undefined

  const common = {
    fill: fillValue,
    fillOpacity: shape.fillOpacity,
    stroke: shape.stroke,
    strokeWidth: (isInsideStroke || isOutsideStroke) ? shape.strokeWidth * 2 : shape.strokeWidth,
    strokeDasharray: shape.strokeDasharray || undefined,
    strokeLinecap: (shape.strokeLinecap || 'round') as 'butt' | 'round' | 'square',
    strokeLinejoin: (shape.strokeLinejoin || 'miter') as 'miter' | 'round' | 'bevel',
    opacity: shape.opacity,
    filter: filterAttr,
    transform: svgTransform,
    pointerEvents: pe as 'all' | 'none',
    onPointerDown: (e: React.PointerEvent) => {
      if (!isSelectTool) return
      e.stopPropagation()
      onPointerDown(e, shape.id)
    },
    style: { cursor: isSelectTool ? 'move' : 'crosshair' },
  }

  const clipId = clipSource ? `clip-${shape.id}` : undefined
  const clipGeom = clipSource ? renderClipGeometry(clipSource) : null

  function wrapWithDefs(el: React.ReactElement): React.ReactElement {
    const hasDefs = gradDef || patternDef || filterDef || clipGeom || markerDef || isInsideStroke

    if (isOutsideStroke) {
      const strokeEl = React.cloneElement(el, { fill: 'none' } as any)
      const fillEl = React.cloneElement(el, { stroke: 'none', strokeWidth: 0 } as any)
      const clipFillEl = clipId ? React.cloneElement(fillEl, { clipPath: `url(#${clipId})` } as any) : fillEl
      if (!hasDefs) return <>{strokeEl}{clipFillEl}</> as unknown as React.ReactElement
      return (
        <>
          <defs>
            {gradDef}{patternDef}{filterDef}{markerDef}
            {clipGeom && <clipPath id={clipId}>{clipGeom}</clipPath>}
          </defs>
          {strokeEl}
          {clipFillEl}
        </>
      ) as unknown as React.ReactElement
    }

    let finalEl = el
    if (clipId) finalEl = React.cloneElement(finalEl, { clipPath: `url(#${clipId})` } as any)
    if (isInsideStroke) finalEl = React.cloneElement(finalEl, { clipPath: `url(#sa-${shape.id})` } as any)

    if (!hasDefs) return finalEl
    return (
      <>
        <defs>
          {gradDef}{patternDef}{filterDef}{markerDef}
          {clipGeom && <clipPath id={clipId}>{clipGeom}</clipPath>}
          {isInsideStroke && <clipPath id={`sa-${shape.id}`}>{renderClipGeometry(shape)}</clipPath>}
        </defs>
        {finalEl}
      </>
    ) as unknown as React.ReactElement
  }

  switch (shape.type) {
    case 'rect':
    case 'frame':
      return wrapWithDefs(
        <rect
          x={shape.x} y={shape.y}
          width={shape.width} height={shape.height}
          rx={(shape as any).rx ?? 0}
          {...common}
        />
      )
    case 'circle':
      return wrapWithDefs(<circle cx={shape.cx} cy={shape.cy} r={shape.r} {...common} />)
    case 'ellipse':
      return wrapWithDefs(<ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...common} />)
    case 'line':
      return wrapWithDefs(
        <line
          x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2}
          {...common}
          fill="none"
          markerStart={markerStartAttr}
          markerEnd={markerEndAttr}
        />
      )
    case 'path': {
      const brushDef: BrushDef | undefined = (shape as any).brush
      if (brushDef) {
        const fillColor = shape.fill !== 'none' ? shape.fill : '#000'
        const opacity = shape.opacity ?? 1
        const baseTransform = svgTransform
        const pe2 = pe
        const pDown = (e: React.PointerEvent) => { if (!isSelectTool) return; e.stopPropagation(); onPointerDown(e, shape.id) }

        if (brushDef.type === 'pattern') {
          const positions = getBrushPatternPositions(shape.d, brushDef)
          const sz = (brushDef.size ?? 8) * 0.5
          const pColor = brushDef.patternFillColor ?? fillColor
          return (
            <g transform={baseTransform} opacity={opacity} filter={filterAttr} pointerEvents={pe2} onPointerDown={pDown} style={{ cursor: isSelectTool ? 'move' : 'crosshair' }}>
              {(gradDef || filterDef) ? <defs>{gradDef}{filterDef}</defs> : null}
              {positions.map((pos, i) => {
                const pshape = brushDef.patternShape ?? 'circle'
                const tr = `translate(${pos.x},${pos.y}) rotate(${pos.angleDeg})`
                if (pshape === 'circle') return <circle key={i} cx={0} cy={0} r={sz} fill={pColor} transform={tr} />
                if (pshape === 'square') return <rect key={i} x={-sz} y={-sz} width={sz*2} height={sz*2} fill={pColor} transform={tr} />
                if (pshape === 'diamond') return <polygon key={i} points={`0,${-sz} ${sz},0 0,${sz} ${-sz},0`} fill={pColor} transform={tr} />
                if (pshape === 'leaf') return <ellipse key={i} cx={0} cy={0} rx={sz * 1.5} ry={sz * 0.5} fill={pColor} transform={tr} />
                return null
              })}
            </g>
          )
        }

        const brushPaths = renderBrushPaths(shape.d, brushDef)
        if (brushPaths) {
          return (
            <g transform={baseTransform} opacity={opacity} filter={filterAttr} pointerEvents={pe2} onPointerDown={pDown} style={{ cursor: isSelectTool ? 'move' : 'crosshair' }}>
              {(gradDef || filterDef) && <defs>{gradDef}{filterDef}</defs>}
              {brushPaths.map((pd, i) => (
                <path key={i} d={pd} fill={fillColor} fillOpacity={shape.fillOpacity} stroke="none" />
              ))}
            </g>
          )
        }
      }
      // Normal path (no brush, or brush rendering returned null)
      return wrapWithDefs(
        <path d={shape.d} {...common}
          markerStart={markerStartAttr}
          markerEnd={markerEndAttr} />
      )
    }
    case 'text': {
      const ls = (shape as any).letterSpacing
      const charOffsets: number[] | undefined = (shape as any).charOffsets
      const charOffsetsY: number[] | undefined = (shape as any).charOffsetsY
      const hasCharOffsets = (charOffsets && charOffsets.some((v: number) => v !== 0))
        || (charOffsetsY && charOffsetsY.some((v: number) => v !== 0))
      const textContent = hasCharOffsets
        ? shape.text.split('').map((ch, i) => {
            const dx = i === 0 ? (charOffsets?.[0] ?? 0) : (charOffsets?.[i] ?? 0) - (charOffsets?.[i - 1] ?? 0)
            const dy = i === 0 ? (charOffsetsY?.[0] ?? 0) : (charOffsetsY?.[i] ?? 0) - (charOffsetsY?.[i - 1] ?? 0)
            return <tspan key={i} dx={dx !== 0 ? dx : undefined} dy={dy !== 0 ? dy : undefined}>{ch}</tspan>
          })
        : shape.text

      if (shape.textOnArc) {
        const arcPathId = `arcpath-${shape.id}`
        const offset = shape.arcOffset ?? 50
        const arcTextContent = hasCharOffsets
          ? shape.text.split('').map((ch, i) => {
              const dx = i === 0 ? (charOffsets?.[0] ?? 0) : (charOffsets?.[i] ?? 0) - (charOffsets?.[i - 1] ?? 0)
              const dy = i === 0 ? (charOffsetsY?.[0] ?? 0) : (charOffsetsY?.[i] ?? 0) - (charOffsetsY?.[i - 1] ?? 0)
              return <tspan key={i} dx={dx !== 0 ? dx : undefined} dy={dy !== 0 ? dy : undefined}>{ch}</tspan>
            })
          : shape.text
        // Arc path is defined in the parent SVG's <defs> (added by SVGCanvas)
        return (
          <>
            <defs>
              {gradDef}{patternDef}{filterDef}
              {clipGeom && <clipPath id={clipId}>{clipGeom}</clipPath>}
            </defs>
            <text
              fontSize={shape.fontSize}
              fontFamily={shape.fontFamily}
              fontWeight={shape.fontWeight}
              letterSpacing={ls || undefined}
              {...common}
            >
              <textPath href={`#${arcPathId}`} startOffset={`${offset}%`} textAnchor="middle">
                {arcTextContent}
              </textPath>
            </text>
          </>
        ) as unknown as React.ReactElement
      }
      return wrapWithDefs(
        <text
          x={shape.x} y={shape.y}
          fontSize={shape.fontSize}
          fontFamily={shape.fontFamily}
          fontWeight={shape.fontWeight}
          textAnchor={shape.textAnchor}
          letterSpacing={ls || undefined}
          dominantBaseline="auto"
          {...common}
        >
          {textContent}
        </text>
      )
    }
    case 'polygon': {
      const pts = polygonPoints(shape.cx, shape.cy, shape.size, shape.sides, shape.innerRadius, shape.isStar)
      return wrapWithDefs(<polygon points={pts} {...common} />)
    }
    case 'blend': {
      const blendShape = shape as BlendShape
      const steps = computeBlendSteps({ shape1: blendShape.shape1, shape2: blendShape.shape2, steps: blendShape.steps })
      return (
        <g
          opacity={shape.opacity}
          pointerEvents={pe}
          onPointerDown={(e: React.PointerEvent) => {
            if (!isSelectTool) return
            e.stopPropagation()
            onPointerDown(e, shape.id)
          }}
          style={{ cursor: isSelectTool ? 'move' : 'crosshair' }}
        >
          {steps.map((s, i) => (
            <ShapeRenderer
              key={i}
              shape={{ ...s, id: `${shape.id}-s${i}` }}
              isSelected={false}
              onPointerDown={() => {}}
              activeTool={activeTool}
            />
          ))}
        </g>
      )
    }
    default:
      return null
  }
}
