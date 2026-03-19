import React, { useRef, useCallback, useEffect, useState } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { ShapeRenderer } from './ShapeRenderer'
import { SelectionOverlay } from './SelectionOverlay'
import { getSelectionBBox, getShapeBBox, svgPointFromEvent, snap, moveShape, polygonPoints } from '../../utils/geometry'
import { computeSmartSnap } from '../../utils/smartSnap'
import { parseSimplePath, serializeSimplePath, isSimplePath } from '../../utils/pathUtils'
import { parseBezierPath, serializeBezierPath, isBezierPath, mirrorHandle, applyHandleConstraint, autoSmoothNode, applyAutoSmooth, type BezierNode, type NodeType } from '../../utils/bezierPathUtils'
import type { Shape } from '../../types/shapes'
import type { SnapGuide } from '../../utils/smartSnap'
import { samplePath, type PathSample } from '../../utils/brushPath'
import type { BrushDef } from '../../utils/brushPath'

// Catmull-Rom → cubic bezier path (for freehand pencil smoothing)
function catmullRomToPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  const r = (n: number) => Math.round(n * 100) / 100
  let d = `M ${r(pts[0].x)} ${r(pts[0].y)}`
  const p = (i: number) => pts[Math.max(0, Math.min(i, pts.length - 1))]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2)
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${r(cp1x)} ${r(cp1y)} ${r(cp2x)} ${r(cp2y)} ${r(p2.x)} ${r(p2.y)}`
  }
  return d
}

// Douglas-Peucker on raw points
function rdpPoints(pts: { x: number; y: number }[], tol: number): { x: number; y: number }[] {
  if (pts.length <= 2) return pts
  let maxD = 0, maxI = 0
  const a = pts[0], b = pts[pts.length - 1]
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len2 === 0
      ? Math.hypot(pts[i].x - a.x, pts[i].y - a.y)
      : Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / Math.sqrt(len2)
    if (d > maxD) { maxD = d; maxI = i }
  }
  if (maxD > tol) return [...rdpPoints(pts.slice(0, maxI + 1), tol).slice(0, -1), ...rdpPoints(pts.slice(maxI), tol)]
  return [a, b]
}

// Module-level clipboard (survives re-renders)
let svgClipboard: Shape[] = []
let svgPasteOffset = 8

function applyPasteOffset(shape: Shape, offset: number): Shape {
  const s = { ...shape, name: shape.name.replace(/ copy$/, '') + ' copy' }
  switch (s.type) {
    case 'rect':
    case 'frame': return { ...s, x: s.x + offset, y: s.y + offset }
    case 'circle': return { ...s, cx: s.cx + offset, cy: s.cy + offset }
    case 'ellipse': return { ...s, cx: s.cx + offset, cy: s.cy + offset }
    case 'line': return { ...s, x1: s.x1 + offset, y1: s.y1 + offset, x2: s.x2 + offset, y2: s.y2 + offset }
    case 'text': return { ...s, x: s.x + offset, y: s.y + offset }
    case 'polygon': return { ...s, cx: s.cx + offset, cy: s.cy + offset }
    case 'path': {
      const d = s.d.replace(/([-\d.]+)\s+([-\d.]+)/g, (_, x, y) => `${parseFloat(x) + offset} ${parseFloat(y) + offset}`)
      return { ...s, d }
    }
    default: return s
  }
}

const DEFAULT_SHAPE_PROPS = {
  fill: '#e94560',
  fillOpacity: 1,
  stroke: 'none',
  strokeWidth: 1,
  strokeDasharray: '',
  strokeLinecap: 'round' as const,
  opacity: 1,
  rotation: 0,
  locked: false,
  visible: true,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeShape(type: string, x1: number, y1: number, x2: number, y2: number, canvasW: number, canvasH: number): any | null {
  const x = Math.min(x1, x2)
  const y = Math.min(y1, y2)
  const w = Math.abs(x2 - x1) || 4
  const h = Math.abs(y2 - y1) || 4
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  const size = Math.max(w, h) / 2

  switch (type) {
    case 'rect':
      return { ...DEFAULT_SHAPE_PROPS, type: 'rect', x, y, width: w, height: h, rx: 0, name: 'Rectangle' }
    case 'circle':
      return { ...DEFAULT_SHAPE_PROPS, type: 'circle', cx, cy, r: Math.min(w, h) / 2, name: 'Circle' }
    case 'ellipse':
      return { ...DEFAULT_SHAPE_PROPS, type: 'ellipse', cx, cy, rx: w / 2, ry: h / 2, name: 'Ellipse' }
    case 'line':
      return { ...DEFAULT_SHAPE_PROPS, type: 'line', x1, y1, x2, y2, fill: 'none', stroke: '#e94560', strokeWidth: 2, name: 'Line' }
    case 'text':
      return { ...DEFAULT_SHAPE_PROPS, type: 'text', x: x1, y: y1, text: 'Text', fontSize: Math.max(8, canvasW / 8), fontFamily: 'sans-serif', fontWeight: 'normal', textAnchor: 'start', name: 'Text', fill: '#ffffff' }
    case 'areatext':
      return { ...DEFAULT_SHAPE_PROPS, type: 'text', x: x1, y: y1, text: 'Area Text', fontSize: Math.max(6, canvasW / 12), fontFamily: 'sans-serif', fontWeight: 'normal', textAnchor: 'start', name: 'Area Text', fill: '#ffffff', textWidth: Math.max(10, w), textHeight: Math.max(10, h) } as any
    case 'polygon':
      return { ...DEFAULT_SHAPE_PROPS, type: 'polygon', cx, cy, size, sides: 6, innerRadius: 0, isStar: false, name: 'Polygon' }
    case 'star':
      return { ...DEFAULT_SHAPE_PROPS, type: 'polygon', cx, cy, size, sides: 5, innerRadius: 0.4, isStar: true, name: 'Star' }
    case 'frame':
      return { ...DEFAULT_SHAPE_PROPS, type: 'frame', x, y, width: w, height: h, fill: 'none', stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1, name: 'Frame' }
    default:
      return null
  }
}

export function SVGCanvas() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pointerDownRef = useRef<{ svgX: number; svgY: number; pointerId: number } | null>(null)
  const dragShapesRef = useRef<Shape[]>([])
  const dragBBoxRef = useRef<ReturnType<typeof getSelectionBBox>>(null)
  const resizeHandleRef = useRef<string | null>(null)
  const didMoveRef = useRef(false)
  const shiftHeldRef = useRef(false)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const [presetGhost, setPresetGhost] = useState<{ x: number; y: number } | null>(null)
  const [charEditId, setCharEditId] = useState<string | null>(null)
  const [selectedCharIndex, setSelectedCharIndex] = useState<number>(0)
  const [editingArtboardNameId, setEditingArtboardNameId] = useState<string | null>(null)
  const artboardDragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number; handle: string } | null>(null)
  const nodeHandleDragRef = useRef<{
    pathId: string
    pointIndex: number
    origPoints: { x: number; y: number }[]
    closed: boolean
  } | null>(null)
  // Pen tool state — completely self-contained
  const penNodesRef = useRef<BezierNode[]>([])
  const penIsDraggingRef = useRef(false)   // mouse held down (dragging handle)
  const penAltBreakRef = useRef(false)     // alt held when drag started
  const penCursorRef = useRef({ x: 0, y: 0 })  // last known cursor position

  interface PenPreview {
    nodes: BezierNode[]
    cx: number; cy: number
    closing: boolean
    dragging: boolean
  }
  const [penPreview, setPenPreview] = useState<PenPreview | null>(null)

  // Bezier node editing
  const bezierHandleDragRef = useRef<{
    pathId: string
    nodeIndex: number
    field: 'anchor' | 'cp1' | 'cp2'
    origNodes: BezierNode[]
    closed: boolean
    breakTangent: boolean
  } | null>(null)
  // Width tool handle dragging
  const widthHandleDragRef = useRef<{
    pathId: string
    handleIndex: number
    side: 'left' | 'right'
    origProfile: { t: number; w: number }[]
    samples: PathSample[]
  } | null>(null)

  // Pencil (freehand) tool
  const pencilPointsRef = useRef<{ x: number; y: number }[]>([])
  const [pencilPreview, setPencilPreview] = useState<string | null>(null)

  // Eraser tool
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null)
  const eraserActiveRef = useRef(false)

  const store = useEditorStore()
  const {
    shapes, layerOrder, selectedIds, activeTool,
    canvasSize, gridSize, snapEnabled, zoom, panX, panY,
    gridEnabled, drawing, setDrawing, addShape, updateShape, setSelectedIds,
    selectShape, clearSelection, setDrag, drag, commit, setEditingTextId, editingTextId,
    draggingPreset, setDraggingPreset, setActiveTool,
    guides, removeGuide, updateGuide,
    artboards, activeArtboardId,
    addArtboard, removeArtboard, updateArtboard, setActiveArtboard,
    editingNodePathId, setEditingNodePathId, selectedNodeIndex, setSelectedNodeIndex,
  } = store

  const orderedShapes = layerOrder
    .map((id) => shapes.find((s) => s.id === id))
    .filter((s): s is Shape => s !== undefined)

  const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id))
  const selBBox = getSelectionBBox(selectedShapes)

  const toCanvas = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 }
    return svgPointFromEvent(e as unknown as React.MouseEvent, svgRef.current)
  }, [])

  const snapXY = useCallback((x: number, y: number) => ({
    x: snap(x, gridSize, snapEnabled),
    y: snap(y, gridSize, snapEnabled),
  }), [gridSize, snapEnabled])

  const finalizePenPath = useCallback((closed: boolean) => {
    const nodes = penNodesRef.current
    if (nodes.length >= 2) {
      const d = serializeBezierPath(nodes, closed)
      const id = addShape({ ...DEFAULT_SHAPE_PROPS, type: 'path', d, fill: '#e94560', fillOpacity: 1, stroke: 'none', strokeWidth: 1, name: 'Path' } as any)
      useEditorStore.getState().setSelectedIds([id])
      commit()
    }
    penNodesRef.current = []
    penIsDraggingRef.current = false
    penAltBreakRef.current = false
    setPenPreview(null)
    setDrawing(null)
    setActiveTool('select')
  }, [addShape, commit, setDrawing, setActiveTool])

  const updatePenPreview = useCallback((cx: number, cy: number) => {
    penCursorRef.current = { x: cx, y: cy }
    const nodes = penNodesRef.current
    const closing = nodes.length >= 2
      ? Math.hypot(cx - nodes[0].x, cy - nodes[0].y) < 8 / zoom
      : false
    setPenPreview({
      nodes: nodes.map(n => ({ ...n })),
      cx, cy,
      closing,
      dragging: penIsDraggingRef.current,
    })
  }, [zoom])

  // Handle pointer down on canvas background
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return

    if (activeTool === 'eyedropper') {
      const bg = store.backgroundColor
      if (bg !== 'transparent' && selectedIds.length > 0) {
        selectedIds.forEach((sid) => updateShape(sid, { fill: bg }))
        commit()
      }
      setActiveTool('select')
      return
    }

    const pt = toCanvas(e)
    const snapped = snapXY(pt.x, pt.y)
    pointerDownRef.current = { svgX: snapped.x, svgY: snapped.y, pointerId: e.pointerId }
    didMoveRef.current = false

    if (activeTool === 'select') {
      if (!e.shiftKey) clearSelection()
      // Start rubber-band selection
      setDrawing({
        isDrawing: true,
        startX: snapped.x,
        startY: snapped.y,
        currentX: snapped.x,
        currentY: snapped.y,
        pathPoints: undefined,
      })
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    if (activeTool === 'pan') return

    if (activeTool === 'path') {
      const { x, y } = snapped

      // Close path: clicking near first anchor when 2+ nodes exist
      if (penNodesRef.current.length >= 2) {
        const first = penNodesRef.current[0]
        if (Math.hypot(x - first.x, y - first.y) < 8 / zoom) {
          finalizePenPath(true)
          return
        }
      }

      // Place a new anchor
      const node: BezierNode = {
        x, y,
        cp1x: x, cp1y: y,
        cp2x: x, cp2y: y,
        smooth: false,
        nodeType: 'corner',
      }
      penNodesRef.current = [...penNodesRef.current, node]
      penIsDraggingRef.current = true
      penAltBreakRef.current = e.altKey
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      updatePenPreview(x, y)
      return
    }

    // Pencil freehand
    if (activeTool === 'pencil') {
      clearSelection()
      pencilPointsRef.current = [{ x: pt.x, y: pt.y }]
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    // Eraser
    if (activeTool === 'eraser') {
      eraserActiveRef.current = true
      setEraserPos({ x: pt.x, y: pt.y })
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    setDrawing({
      isDrawing: true,
      startX: snapped.x,
      startY: snapped.y,
      currentX: snapped.x,
      currentY: snapped.y,
    })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [activeTool, clearSelection, setDrawing, toCanvas, snapXY, zoom, finalizePenPath, updatePenPreview])

  // Handle pointer down on shape (for selection + move)
  const handleShapePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    if (activeTool === 'eyedropper') {
      e.stopPropagation()
      const sourceShape = shapes.find((s) => s.id === id)
      if (sourceShape && selectedIds.length > 0) {
        selectedIds.forEach((sid) => updateShape(sid, { fill: sourceShape.fill }))
        commit()
      } else if (sourceShape) {
        setSelectedIds([id])
      }
      setActiveTool('select')
      return
    }
    if (activeTool === 'width') {
      if (!selectedIds.includes(id)) selectShape(id, false)
      return
    }
    if (activeTool !== 'select') return
    e.stopPropagation()
    // Don't drag locked shapes
    const clickedShape = shapes.find((s) => s.id === id)
    if (clickedShape?.locked) {
      selectShape(id, e.shiftKey)
      return
    }

    // If shape is part of a group, auto-select all group members (unless shift-clicking)
    const groupId = (clickedShape as any)?.groupId
    if (!e.shiftKey && groupId) {
      const groupMemberIds = shapes.filter((s) => (s as any).groupId === groupId).map((s) => s.id)
      setSelectedIds(groupMemberIds)
      const pt = toCanvas(e)
      pointerDownRef.current = { svgX: pt.x, svgY: pt.y, pointerId: e.pointerId }
      didMoveRef.current = false
      dragShapesRef.current = shapes.filter((s) => groupMemberIds.includes(s.id))
      ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
      setDrag({ type: 'move', startX: pt.x, startY: pt.y, startShapes: JSON.parse(JSON.stringify(dragShapesRef.current)) })
      return
    }

    // Determine the final selection after this click
    const alreadySelected = selectedIds.includes(id)
    if (e.shiftKey) {
      selectShape(id, true) // toggle
    } else if (!alreadySelected) {
      selectShape(id, false) // replace selection with just this shape
    }
    // If clicking an already-selected shape without shift, keep existing selection so all can be dragged

    const pt = toCanvas(e)
    pointerDownRef.current = { svgX: pt.x, svgY: pt.y, pointerId: e.pointerId }
    didMoveRef.current = false

    // Drag all currently selected shapes (+ the clicked one if not already selected)
    const idsForDrag = e.shiftKey
      ? alreadySelected
        ? selectedIds.filter((sid) => sid !== id)   // toggled off
        : [...selectedIds, id]                        // toggled on
      : alreadySelected
        ? selectedIds                                 // keep full selection
        : [id]                                        // new single selection

    dragShapesRef.current = shapes.filter((s) => idsForDrag.includes(s.id))

    ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
    setDrag({ type: 'move', startX: pt.x, startY: pt.y, startShapes: JSON.parse(JSON.stringify(dragShapesRef.current)) })
  }, [activeTool, selectShape, shapes, selectedIds, toCanvas, setDrag])

  // Handle resize handle pointer down
  const handleHandlePointerDown = useCallback((e: React.PointerEvent, handle: string) => {
    e.stopPropagation()
    const pt = toCanvas(e)
    resizeHandleRef.current = handle
    dragShapesRef.current = JSON.parse(JSON.stringify(selectedShapes))
    dragBBoxRef.current = selBBox

    setDrag({
      type: 'resize',
      handle,
      startX: pt.x,
      startY: pt.y,
      startShapes: JSON.parse(JSON.stringify(selectedShapes)),
      startBBox: selBBox ?? undefined,
    })
    ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
  }, [toCanvas, selectedShapes, selBBox, setDrag])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const pt = toCanvas(e)
    const snapped = snapXY(pt.x, pt.y)

    // Width tool handle drag
    if (widthHandleDragRef.current) {
      const { pathId, handleIndex, origProfile, samples } = widthHandleDragRef.current
      const handle = origProfile[handleIndex]
      const si = Math.round(handle.t * (samples.length - 1))
      const s = samples[Math.max(0, Math.min(si, samples.length - 1))]
      const perpX = -s.ty; const perpY = s.tx
      const dx = snapped.x - s.x; const dy = snapped.y - s.y
      const projection = dx * perpX + dy * perpY
      const newW = Math.max(0.5, Math.abs(projection) * 2)
      const newProfile = origProfile.map((p, i) => i === handleIndex ? { ...p, w: newW } : p)
      const pathShape = shapes.find(sh => sh.id === pathId)
      if (pathShape?.type === 'path') {
        const existingBrush: BrushDef = { type: 'variable', size: newW, ...((pathShape as any).brush ?? {}), widthProfile: newProfile }
        updateShape(pathId, { brush: existingBrush } as any)
      }
      return
    }

    // Simple path node handle drag
    if (nodeHandleDragRef.current) {
      const { pathId, pointIndex, origPoints, closed } = nodeHandleDragRef.current
      const newPoints = origPoints.map((p, i) =>
        i === pointIndex ? { x: snapped.x, y: snapped.y } : p
      )
      updateShape(pathId, { d: serializeSimplePath(newPoints, closed) } as any)
      return
    }

    // Bezier node handle drag
    if (bezierHandleDragRef.current) {
      const { pathId, nodeIndex, field, origNodes, closed, breakTangent } = bezierHandleDragRef.current
      let nodes = origNodes.map((n, i) => {
        if (i !== nodeIndex) return n
        const nn = { ...n }
        if (field === 'anchor') {
          const dx = snapped.x - n.x; const dy = snapped.y - n.y
          nn.x = snapped.x; nn.y = snapped.y
          nn.cp1x += dx; nn.cp1y += dy
          nn.cp2x += dx; nn.cp2y += dy
        } else if (field === 'cp2') {
          nn.cp2x = snapped.x; nn.cp2y = snapped.y
          if (breakTangent) nn.nodeType = 'corner'
        } else {
          nn.cp1x = snapped.x; nn.cp1y = snapped.y
          if (breakTangent) nn.nodeType = 'corner'
        }
        return nn
      })
      // Apply constraint if not breaking tangent
      if (!breakTangent && (field === 'cp1' || field === 'cp2')) {
        nodes = applyHandleConstraint(nodes, nodeIndex, field)
      }
      // Re-apply auto-smooth to any auto nodes (except the one being dragged)
      nodes = nodes.map((n, i) => {
        if (i === nodeIndex || n.nodeType !== 'auto') return n
        return autoSmoothNode(nodes, i, closed)
      })
      updateShape(pathId, { d: serializeBezierPath(nodes, closed) } as any)
      return
    }

    // Pen tool: dragging handle of just-placed anchor
    if (activeTool === 'path' && penIsDraggingRef.current && penNodesRef.current.length > 0) {
      const nodes = penNodesRef.current
      const last = { ...nodes[nodes.length - 1] }
      last.cp2x = pt.x; last.cp2y = pt.y
      if (!penAltBreakRef.current) {
        // Symmetric: mirror cp2 to cp1
        last.cp1x = 2 * last.x - pt.x
        last.cp1y = 2 * last.y - pt.y
        last.nodeType = 'symmetric'
        last.smooth = true
      }
      // If dragged far enough, promote to smooth node
      const dragDist = Math.hypot(pt.x - last.x, pt.y - last.y)
      if (dragDist > 2 / zoom) {
        last.nodeType = penAltBreakRef.current ? 'corner' : 'symmetric'
      }
      penNodesRef.current = [...nodes.slice(0, -1), last]
      updatePenPreview(pt.x, pt.y)
      return
    }

    // Pen tool: between clicks — update rubber-band preview
    if (activeTool === 'path' && !penIsDraggingRef.current) {
      updatePenPreview(pt.x, pt.y)
      return
    }

    // Artboard drag/resize
    if (artboardDragRef.current) {
      const { id, startX, startY, origX, origY, origW, origH, handle } = artboardDragRef.current
      const dx = pt.x - startX
      const dy = pt.y - startY
      const MIN = 10
      if (handle === 'move') {
        updateArtboard(id, { x: origX + dx, y: origY + dy })
      } else if (handle === 'se') { updateArtboard(id, { width: Math.max(MIN, origW + dx), height: Math.max(MIN, origH + dy) })
      } else if (handle === 'sw') { updateArtboard(id, { x: origX + dx, width: Math.max(MIN, origW - dx), height: Math.max(MIN, origH + dy) })
      } else if (handle === 'ne') { updateArtboard(id, { y: origY + dy, width: Math.max(MIN, origW + dx), height: Math.max(MIN, origH - dy) })
      } else if (handle === 'nw') { updateArtboard(id, { x: origX + dx, y: origY + dy, width: Math.max(MIN, origW - dx), height: Math.max(MIN, origH - dy) })
      } else if (handle === 'n') { updateArtboard(id, { y: origY + dy, height: Math.max(MIN, origH - dy) })
      } else if (handle === 's') { updateArtboard(id, { height: Math.max(MIN, origH + dy) })
      } else if (handle === 'e') { updateArtboard(id, { width: Math.max(MIN, origW + dx) })
      } else if (handle === 'w') { updateArtboard(id, { x: origX + dx, width: Math.max(MIN, origW - dx) })
      }
      didMoveRef.current = true
      return
    }

    // Pencil freehand
    if (activeTool === 'pencil' && pencilPointsRef.current.length > 0) {
      const last = pencilPointsRef.current[pencilPointsRef.current.length - 1]
      const dist = Math.hypot(pt.x - last.x, pt.y - last.y)
      if (dist > 1 / zoom) {
        pencilPointsRef.current = [...pencilPointsRef.current, { x: pt.x, y: pt.y }]
        if (pencilPointsRef.current.length >= 2) {
          setPencilPreview(catmullRomToPath(pencilPointsRef.current))
        }
      }
      return
    }

    // Eraser cursor tracking
    if (activeTool === 'eraser') {
      setEraserPos({ x: pt.x, y: pt.y })
    }

    // Eraser active (mouse held)
    if (activeTool === 'eraser' && eraserActiveRef.current) {
      setEraserPos({ x: pt.x, y: pt.y })
      const r = 8 / zoom
      const toDelete = shapes.filter((s) => {
        if (s.locked || !s.visible) return false
        const b = getShapeBBox(s)
        const cx2 = b.x + b.width / 2, cy2 = b.y + b.height / 2
        return Math.hypot(pt.x - cx2, pt.y - cy2) < r + Math.max(b.width, b.height) / 2
      })
      if (toDelete.length > 0) {
        useEditorStore.getState().deleteShapes(toDelete.map((s) => s.id))
      }
      return
    }

    if (!pointerDownRef.current && !drag) return

    didMoveRef.current = true

    // Rubber-band or drawing mode
    if (drawing?.isDrawing) {
      setDrawing({ ...drawing, currentX: snapped.x, currentY: snapped.y })
      return
    }

    // Move shapes
    if (drag?.type === 'move') {
      shiftHeldRef.current = e.shiftKey
      const rawDx = pt.x - drag.startX
      const rawDy = pt.y - drag.startY

      // Compute moved bbox from start positions
      const startBBoxes = drag.startShapes.map((s) => getShapeBBoxLocal(s))
      const minX = Math.min(...startBBoxes.map((b) => b.x)) + rawDx
      const minY = Math.min(...startBBoxes.map((b) => b.y)) + rawDy
      const maxX = Math.max(...startBBoxes.map((b) => b.x + b.width)) + rawDx
      const maxY = Math.max(...startBBoxes.map((b) => b.y + b.height)) + rawDy
      const movingBBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }

      const movingIds = drag.startShapes.map((s) => s.id)
      const staticShapes = shapes.filter((s) => !movingIds.includes(s.id))

      const { dx: snapDx, dy: snapDy, guides } = computeSmartSnap(
        movingBBox,
        staticShapes,
        canvasSize.width,
        canvasSize.height,
        zoom,
        e.shiftKey,
      )

      setSnapGuides(guides)

      const finalDx = rawDx + snapDx
      const finalDy = rawDy + snapDy

      drag.startShapes.forEach((startShape) => {
        const delta = moveShape(startShape, finalDx, finalDy)
        updateShape(startShape.id, delta as Partial<Shape>)
      })
      return
    }

    // Resize shapes — Photoshop style: pointer directly drives the dragged edge,
    // the opposite edge is the fixed anchor. No delta-from-start-pointer, so the
    // edge always follows the cursor exactly regardless of where on the handle you clicked.
    if (drag?.type === 'resize' && drag.startBBox) {
      const { handle = '', startX, startY, startBBox } = drag

      if (handle === 'rotate') {
        const cx = startBBox.x + startBBox.width / 2
        const cy = startBBox.y + startBBox.height / 2
        const startAngle = Math.atan2(startY - cy, startX - cx)
        const currentAngle = Math.atan2(pt.y - cy, pt.x - cx)
        let deltaAngle = ((currentAngle - startAngle) * 180) / Math.PI
        drag.startShapes.forEach((startShape) => {
          let newRot = (startShape.rotation + deltaAngle) % 360
          // Snap to 15° increments when Shift is held
          if (e.shiftKey) newRot = Math.round(newRot / 15) * 15
          updateShape(startShape.id, { rotation: newRot })
        })
        return
      }

      // Anchor = opposite side (fixed during the drag)
      const anchorRight  = startBBox.x + startBBox.width
      const anchorBottom = startBBox.y + startBBox.height

      let newX = startBBox.x
      let newY = startBBox.y
      let newW = startBBox.width
      let newH = startBBox.height

      // Each axis: pointer position directly sets the moving edge
      if (handle.includes('e')) {
        newW = Math.max(4, snapped.x - startBBox.x)
      }
      if (handle.includes('w')) {
        const x = Math.min(snapped.x, anchorRight - 4)
        newX = x
        newW = anchorRight - x
      }
      if (handle.includes('s')) {
        newH = Math.max(4, snapped.y - startBBox.y)
      }
      if (handle.includes('n')) {
        const y = Math.min(snapped.y, anchorBottom - 4)
        newY = y
        newH = anchorBottom - y
      }

      const scaleX = newW / startBBox.width
      const scaleY = newH / startBBox.height

      drag.startShapes.forEach((startShape) => {
        const sb = getShapeBBoxLocal(startShape)
        const relX = (sb.x - startBBox.x) / startBBox.width
        const relY = (sb.y - startBBox.y) / startBBox.height
        const relW = sb.width / startBBox.width
        const relH = sb.height / startBBox.height

        const targetX = newX + relX * newW
        const targetY = newY + relY * newH
        const targetW = relW * newW
        const targetH = relH * newH

        applyResize(startShape, targetX, targetY, targetW, targetH, scaleX, scaleY)
      })
    }
  }, [drawing, drag, activeTool, setDrawing, updateShape, toCanvas, snapXY, selBBox, zoom, updatePenPreview])

  // Use the shared getShapeBBox from geometry.ts — single source of truth for all shape types including path
  const getShapeBBoxLocal = getShapeBBox

  function applyResize(shape: Shape, tx: number, ty: number, tw: number, th: number, sx: number, sy: number) {
    const tcx = tx + tw / 2
    const tcy = ty + th / 2
    switch (shape.type) {
      case 'rect':
      case 'frame': updateShape(shape.id, { x: tx, y: ty, width: Math.max(1, tw), height: Math.max(1, th) }); break
      case 'circle': updateShape(shape.id, { cx: tcx, cy: tcy, r: Math.max(1, Math.min(tw, th) / 2) }); break
      case 'ellipse': updateShape(shape.id, { cx: tcx, cy: tcy, rx: Math.max(1, tw / 2), ry: Math.max(1, th / 2) }); break
      case 'line': updateShape(shape.id, { x1: tx, y1: ty, x2: tx + tw, y2: ty + th }); break
      case 'text': {
        // Scale fontSize by the dominant axis so all handles actually work.
        // shape here is the frozen startShape, so shape.fontSize is the original size.
        const scale = Math.max(sx, sy)
        const newFontSize = Math.max(2, (shape as any).fontSize * scale)
        // tx is the left anchor; baseline y = top-of-bbox + new font height
        updateShape(shape.id, { x: tx, y: ty + newFontSize, fontSize: newFontSize })
        break
      }
      case 'polygon': updateShape(shape.id, { cx: tcx, cy: tcy, size: Math.max(2, Math.min(tw, th) / 2) }); break
      case 'path': {
        const ob = getShapeBBoxLocal(shape)
        if (ob.width === 0 || ob.height === 0) break
        const scx = tw / ob.width
        const scy = th / ob.height
        // Scale every coordinate pair in the path string proportionally
        const d = (shape as any).d.replace(/([-\d.]+)\s+([-\d.]+)/g, (_: string, x: string, y: string) => {
          const nx = (parseFloat(x) - ob.x) * scx + tx
          const ny = (parseFloat(y) - ob.y) * scy + ty
          return `${Math.round(nx * 100) / 100} ${Math.round(ny * 100) / 100}`
        })
        updateShape(shape.id, { d } as any)
        break
      }
    }
  }

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (nodeHandleDragRef.current) {
      nodeHandleDragRef.current = null
      commit()
      return
    }
    if (bezierHandleDragRef.current) {
      bezierHandleDragRef.current = null
      commit()
      return
    }
    if (widthHandleDragRef.current) {
      widthHandleDragRef.current = null
      commit()
      return
    }
    if (drag?.type === 'move' || drag?.type === 'resize') {
      setDrag(null)
      setSnapGuides([])
      if (didMoveRef.current) commit()
      pointerDownRef.current = null
      didMoveRef.current = false
      return
    }

    // Artboard drag/resize end
    if (artboardDragRef.current) {
      if (didMoveRef.current) commit()
      artboardDragRef.current = null
      didMoveRef.current = false
      pointerDownRef.current = null
      return
    }

    if (!drawing?.isDrawing || !pointerDownRef.current) {
      pointerDownRef.current = null
      return
    }

    const { startX, startY, currentX, currentY } = drawing

    // Rubber-band selection (select tool)
    if (activeTool === 'select') {
      if (didMoveRef.current) {
        const rx = Math.min(startX, currentX)
        const ry = Math.min(startY, currentY)
        const rw = Math.abs(currentX - startX)
        const rh = Math.abs(currentY - startY)
        if (rw > 2 || rh > 2) {
          const hit = shapes.filter((s) => {
            const b = getShapeBBoxLocal(s)
            return b.x < rx + rw && b.x + b.width > rx && b.y < ry + rh && b.y + b.height > ry
          })
          setSelectedIds(hit.map((s) => s.id))
        }
      }
      setDrawing(null)
      pointerDownRef.current = null
      didMoveRef.current = false
      return
    }

    if (activeTool === 'path') {
      penIsDraggingRef.current = false
      pointerDownRef.current = null
      didMoveRef.current = false
      updatePenPreview(penCursorRef.current.x, penCursorRef.current.y)
      return
    }

    // Pencil freehand finalize
    if (activeTool === 'pencil') {
      const rawPts = pencilPointsRef.current
      if (rawPts.length >= 2) {
        const simplified = rdpPoints(rawPts, 1.5 / zoom)
        const d = catmullRomToPath(simplified)
        const id = addShape({ ...DEFAULT_SHAPE_PROPS, type: 'path', d, fill: 'none', stroke: DEFAULT_SHAPE_PROPS.stroke, strokeWidth: 2, name: 'Pencil' } as any)
        useEditorStore.getState().setSelectedIds([id])
        commit()
      }
      pencilPointsRef.current = []
      setPencilPreview(null)
      pointerDownRef.current = null
      useEditorStore.getState().setActiveTool('select')
      return
    }

    // Eraser finalize
    if (activeTool === 'eraser') {
      eraserActiveRef.current = false
      setEraserPos(null)
      pointerDownRef.current = null
      return
    }

    // Frame tool creates artboards, not shapes
    if (activeTool === 'frame') {
      const x = Math.min(startX, currentX)
      const y = Math.min(startY, currentY)
      const w = Math.abs(currentX - startX)
      const h = Math.abs(currentY - startY)
      if (w > 4 && h > 4) {
        const n = artboards.length + 1
        const id = addArtboard({ x, y, width: w, height: h, name: `Artboard ${n}` })
        setActiveArtboard(id)
        useEditorStore.getState().setActiveTool('select')
      }
      setDrawing(null)
      pointerDownRef.current = null
      return
    }

    const newShape = makeShape(activeTool, startX, startY, currentX, currentY, canvasSize.width, canvasSize.height)
    if (newShape) {
      const id = addShape(newShape)
      if (activeTool === 'text' || activeTool === 'areatext') {
        useEditorStore.getState().setActiveTool('select')
        useEditorStore.getState().setEditingTextId(id)
      }
    }
    setDrawing(null)
    pointerDownRef.current = null
  }, [drawing, activeTool, drag, setDrawing, setDrag, addShape, canvasSize, commit, snapXY, shapes, setSelectedIds, finalizePenPath, updatePenPreview, artboards, addArtboard, setActiveArtboard])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'path') {
      // Double-click: the second click of the double-click already added a phantom node
      // Remove it and finalize
      const nodes = penNodesRef.current
      if (nodes.length > 1) {
        penNodesRef.current = nodes.slice(0, -1)
      }
      finalizePenPath(false)
      return
    }
    // Double-click a selected shape to edit it
    if (activeTool === 'select' && selectedIds.length === 1) {
      const shape = shapes.find((s) => s.id === selectedIds[0])
      if (shape?.type === 'text') {
        if (charEditId === shape.id) {
          // Already in char edit mode — exit and enter text edit
          setCharEditId(null)
          setEditingTextId(shape.id)
        } else if (editingTextId === shape.id) {
          // Already in text edit mode — do nothing (handled by text editor)
        } else {
          // First double-click: enter char edit mode
          setCharEditId(shape.id)
          setSelectedCharIndex(0)
        }
      } else if (shape?.type === 'path' && (isSimplePath(shape.d) || isBezierPath(shape.d))) {
        setEditingNodePathId(shape.id)
      }
    }
  }, [activeTool, drawing, addShape, setDrawing, selectedIds, shapes, setEditingTextId, charEditId, editingTextId, finalizePenPath])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Backspace while drawing: remove last pen anchor
        if (useEditorStore.getState().activeTool === 'path' && penNodesRef.current.length > 0) {
          e.preventDefault()
          penNodesRef.current = penNodesRef.current.slice(0, -1)
          updatePenPreview(penCursorRef.current.x, penCursorRef.current.y)
          return
        }
        // Delete selected node in node-edit mode
        if (editingNodePathId && selectedNodeIndex !== null) {
          const pathShape = useEditorStore.getState().shapes.find((s) => s.id === editingNodePathId)
          if (pathShape?.type === 'path') {
            if (isSimplePath(pathShape.d)) {
              const { points, closed } = parseSimplePath(pathShape.d)
              if (points.length > 2) {
                const newPts = points.filter((_, i) => i !== selectedNodeIndex)
                useEditorStore.getState().updateShape(editingNodePathId, { d: serializeSimplePath(newPts, closed) } as any)
                useEditorStore.getState().commit()
              }
            } else if (isBezierPath(pathShape.d)) {
              const { nodes, closed } = parseBezierPath(pathShape.d)
              if (nodes.length > 2) {
                const newNodes = nodes.filter((_, i) => i !== selectedNodeIndex)
                useEditorStore.getState().updateShape(editingNodePathId, { d: serializeBezierPath(newNodes, closed) } as any)
                useEditorStore.getState().commit()
              }
            }
          }
          setSelectedNodeIndex(null)
          return
        }
        if (selectedIds.length > 0) {
          useEditorStore.getState().deleteShapes(selectedIds)
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) useEditorStore.getState().redo()
        else useEditorStore.getState().undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        if (selectedIds.length > 0) useEditorStore.getState().duplicateShapes(selectedIds)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        setSelectedIds(shapes.map((s) => s.id))
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'c') {
        e.preventDefault()
        const { shapes: allShapes, selectedIds: ids } = useEditorStore.getState()
        svgClipboard = allShapes.filter((s) => ids.includes(s.id)).map((s) => JSON.parse(JSON.stringify(s)))
        svgPasteOffset = 8
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault()
        if (svgClipboard.length === 0) return
        const store = useEditorStore.getState()
        const newIds: string[] = []
        svgClipboard.forEach((shape) => {
          const copy = applyPasteOffset(JSON.parse(JSON.stringify(shape)), svgPasteOffset)
          const id = store.addShape(copy as any)
          newIds.push(id)
        })
        svgPasteOffset += 8
        setSelectedIds(newIds)
      }
      // Character offset editing — Alt+Left/Right/Up/Down nudges selected char
      if (charEditId && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        const store = useEditorStore.getState()
        const shape = store.shapes.find((s) => s.id === charEditId)
        if (shape?.type === 'text') {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const delta = e.key === 'ArrowRight' ? 1 : -1
            const offsets: number[] = [...((shape as any).charOffsets ?? Array(shape.text.length).fill(0))]
            while (offsets.length < shape.text.length) offsets.push(0)
            offsets[selectedCharIndex] = (offsets[selectedCharIndex] ?? 0) + delta
            store.updateShape(charEditId, { charOffsets: offsets } as any)
          } else {
            const delta = e.key === 'ArrowDown' ? 1 : -1
            const offsets: number[] = [...((shape as any).charOffsetsY ?? Array(shape.text.length).fill(0))]
            while (offsets.length < shape.text.length) offsets.push(0)
            offsets[selectedCharIndex] = (offsets[selectedCharIndex] ?? 0) + delta
            store.updateShape(charEditId, { charOffsetsY: offsets } as any)
          }
          store.commit()
        }
        return
      }
      // Tab / Shift+Tab moves to next/prev character in char edit mode
      if (charEditId && e.key === 'Tab') {
        e.preventDefault()
        const shape = useEditorStore.getState().shapes.find((s) => s.id === charEditId)
        if (shape?.type === 'text') {
          const len = shape.text.length
          setSelectedCharIndex(e.shiftKey
            ? (selectedCharIndex - 1 + len) % len
            : (selectedCharIndex + 1) % len)
        }
        return
      }
      // Delete selected artboard
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeArtboardId && selectedIds.length === 0) {
        removeArtboard(activeArtboardId)
        setActiveArtboard(null)
        return
      }

      if (e.key === 'Escape') {
        if (editingArtboardNameId) { setEditingArtboardNameId(null); return }
        if (charEditId) { setCharEditId(null); return }
        if (editingNodePathId) { setEditingNodePathId(null); setSelectedNodeIndex(null); return }
        if (useEditorStore.getState().activeTool === 'path') {
          const nodes = penNodesRef.current
          if (nodes.length >= 2) {
            finalizePenPath(false)
          } else {
            penNodesRef.current = []
            penIsDraggingRef.current = false
            setPenPreview(null)
            setDrawing(null)
            useEditorStore.getState().setActiveTool('select')
          }
          return
        }
        clearSelection()
        if (drawing) setDrawing(null)
        if (draggingPreset) { setDraggingPreset(null); setPresetGhost(null) }
      }
      if (e.key === 'Enter' || e.key === 'Return') {
        if (useEditorStore.getState().activeTool === 'path') {
          e.preventDefault()
          const nodes = penNodesRef.current
          if (nodes.length >= 2) {
            finalizePenPath(false)
          }
          return
        }
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        const { shapes: s, selectedIds: ids } = useEditorStore.getState()
        ids.forEach((id) => {
          const shape = s.find((sh) => sh.id === id)
          if (shape) useEditorStore.getState().updateShape(id, moveShape(shape, dx, dy) as Partial<Shape>)
        })
        useEditorStore.getState().commit()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === ']' || e.key === '[')) {
        e.preventDefault()
        const dir = e.key === ']'
          ? (e.shiftKey ? 'top' : 'up')
          : (e.shiftKey ? 'bottom' : 'down')
        useEditorStore.getState().selectedIds.forEach((id) => {
          useEditorStore.getState().reorderLayer(id, dir as any)
        })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault()
        const { selectedIds: ids } = useEditorStore.getState()
        if (e.shiftKey) {
          if (ids.length > 0) useEditorStore.getState().ungroupShapes(ids)
        } else {
          if (ids.length > 1) useEditorStore.getState().groupShapes(ids)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedIds, shapes, clearSelection, drawing, setDrawing, setSelectedIds, draggingPreset, setDraggingPreset, editingNodePathId, selectedNodeIndex, charEditId, selectedCharIndex, finalizePenPath, updatePenPreview, activeArtboardId, removeArtboard, setActiveArtboard, editingArtboardNameId])

  // Finalize in-progress bezier path when switching away from the path tool
  const prevToolRef = useRef<string>(activeTool)
  useEffect(() => {
    const prev = prevToolRef.current
    prevToolRef.current = activeTool
    if (prev === 'path' && activeTool !== 'path') {
      const nodes = penNodesRef.current
      if (nodes.length >= 2) {
        const d = serializeBezierPath(nodes, false)
        const { addShape: add, setSelectedIds: setSel, commit: cmt } = useEditorStore.getState()
        const id = add({ ...DEFAULT_SHAPE_PROPS, type: 'path', d, fill: '#e94560', fillOpacity: 1, stroke: 'none', strokeWidth: 1, name: 'Path' } as any)
        cmt()
        setSel([id])
      }
      penNodesRef.current = []
      penIsDraggingRef.current = false
      penAltBreakRef.current = false
      setPenPreview(null)
      setDrawing(null)
    }
  }, [activeTool, setDrawing])

  // Cancel preset drag if pointer released outside canvas
  useEffect(() => {
    if (!draggingPreset) return
    const cancel = () => { setDraggingPreset(null); setPresetGhost(null) }
    window.addEventListener('pointerup', cancel)
    return () => window.removeEventListener('pointerup', cancel)
  }, [draggingPreset, setDraggingPreset])

  // Grid pattern
  const gridEl = gridEnabled ? (
    <>
      <defs>
        <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
          <path
            d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.5 / zoom}
          />
        </pattern>
      </defs>
      <rect width={canvasSize.width} height={canvasSize.height} fill="url(#grid)" pointerEvents="none" />
    </>
  ) : null

  // Drawing preview
  let drawingPreview = null
  if (drawing?.isDrawing) {
    const { startX, startY, currentX, currentY, pathPoints } = drawing
    const x = Math.min(startX, currentX)
    const y = Math.min(startY, currentY)
    const w = Math.abs(currentX - startX) || 1
    const h = Math.abs(currentY - startY) || 1
    const cx = (startX + currentX) / 2
    const cy = (startY + currentY) / 2

    if (activeTool === 'select') {
      // Rubber-band selection rectangle
      drawingPreview = (
        <rect
          x={x} y={y} width={w} height={h}
          fill="rgba(100,160,255,0.1)"
          stroke="rgba(100,160,255,0.8)"
          strokeWidth={1 / zoom}
          strokeDasharray={`${4 / zoom} ${2 / zoom}`}
          pointerEvents="none"
        />
      )
    } else {
      const previewProps = {
        fill: 'rgba(233,69,96,0.2)',
        stroke: '#e94560',
        strokeWidth: 1 / zoom,
        strokeDasharray: `${4 / zoom} ${2 / zoom}`,
        pointerEvents: 'none' as const,
      }

      switch (activeTool) {
        case 'rect':
        case 'frame':
          drawingPreview = <rect x={x} y={y} width={w} height={h} {...previewProps} />
          break
        case 'circle':
          drawingPreview = <circle cx={cx} cy={cy} r={Math.min(w, h) / 2} {...previewProps} />
          break
        case 'ellipse':
          drawingPreview = <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...previewProps} />
          break
        case 'line':
          drawingPreview = (
            <line x1={startX} y1={startY} x2={currentX} y2={currentY} stroke="#e94560" strokeWidth={1.5 / zoom} pointerEvents="none" />
          )
          break
        case 'polygon':
        case 'star': {
          const size = Math.max(w, h) / 2
          const isStar = activeTool === 'star'
          const pts = polygonPoints(cx, cy, size, isStar ? 5 : 6, isStar ? 0.4 : 0, isStar)
          drawingPreview = <polygon points={pts} {...previewProps} />
          break
        }
      }
    }
  }

  const cursorClass = draggingPreset
    ? 'pan-cursor'
    : activeTool === 'select' ? 'select-cursor'
    : activeTool === 'pan' ? 'pan-cursor'
    : ''

  function handlePresetPointerMove(e: React.PointerEvent) {
    if (!draggingPreset) { handlePointerMove(e); return }
    const pt = toCanvas(e)
    const snapped = snapXY(pt.x, pt.y)
    setPresetGhost({ x: snapped.x, y: snapped.y })
  }

  function handlePresetPointerUp(e: React.PointerEvent) {
    if (!draggingPreset) { handlePointerUp(e); return }
    const pt = toCanvas(e)
    const snapped = snapXY(pt.x, pt.y)
    const size = Math.min(canvasSize.width, canvasSize.height) * 0.3
    addShape(draggingPreset.create(snapped.x, snapped.y, size) as any)
    setDraggingPreset(null)
    setPresetGhost(null)
  }

  // Ghost shape preview while dragging from library
  let presetGhostEl = null
  if (draggingPreset && presetGhost) {
    const size = Math.min(canvasSize.width, canvasSize.height) * 0.3
    const ghostShape = draggingPreset.create(presetGhost.x, presetGhost.y, size)
    const ghostProps = {
      fill: 'rgba(233,69,96,0.4)',
      stroke: '#e94560',
      strokeWidth: 1 / zoom,
      pointerEvents: 'none' as const,
      opacity: 0.7,
    }
    if (ghostShape.type === 'polygon') {
      const gs = ghostShape as any
      const pts = polygonPoints(gs.cx, gs.cy, gs.size, gs.sides, gs.innerRadius, gs.isStar)
      presetGhostEl = <polygon points={pts} {...ghostProps} />
    } else if (ghostShape.type === 'path') {
      presetGhostEl = <path d={(ghostShape as any).d} {...ghostProps} />
    } else if (ghostShape.type === 'rect') {
      presetGhostEl = <rect x={(ghostShape as any).x} y={(ghostShape as any).y} width={(ghostShape as any).width} height={(ghostShape as any).height} {...ghostProps} />
    }
  }

  return (
    <div
      ref={containerRef}
      className={`canvas-container no-select ${cursorClass}`}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#111' }}
      onPointerMove={handlePresetPointerMove}
      onPointerUp={handlePresetPointerUp}
      onPointerDown={handleCanvasPointerDown}
      onDoubleClick={handleDoubleClick}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Canvas drop shadow */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px))`,
          width: canvasSize.width * zoom,
          height: canvasSize.height * zoom,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 8px 40px rgba(0,0,0,0.6)',
          background: store.backgroundColor === 'transparent'
            ? undefined
            : store.backgroundColor,
        }}
        className={store.backgroundColor === 'transparent' ? 'checkerboard' : ''}
      />

      <svg
        ref={svgRef}
        viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
        width={canvasSize.width * zoom}
        height={canvasSize.height * zoom}
        onDragStart={(e) => e.preventDefault()}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px))`,
          overflow: 'visible',
        }}
      >
        {gridEl}

        {/* Arc text path defs — referenced by textPath href in ShapeRenderer */}
        <defs>
          {orderedShapes.filter((s) => s.type === 'text' && (s as any).textOnArc).map((s) => {
            const shape = s as any
            const r = shape.arcRadius ?? shape.fontSize * 3
            const sweep = shape.arcDirection === 'down' ? 1 : 0
            const arcD = `M ${shape.x - r},${shape.y} A ${r},${r} 0 1,${sweep} ${shape.x + r},${shape.y}`
            return <path key={s.id} id={`arcpath-${s.id}`} d={arcD} />
          })}
        </defs>

        {/* Artboards */}
        {artboards.map((ab) => {
          const isActive = activeArtboardId === ab.id
          const color = isActive ? 'rgba(100,160,255,1)' : 'rgba(120,120,200,0.5)'
          const hw = 4 / zoom  // handle half-size
          const handles = [
            { id: 'nw', cx: ab.x,               cy: ab.y,                cursor: 'nw-resize' },
            { id: 'n',  cx: ab.x + ab.width / 2, cy: ab.y,               cursor: 'n-resize' },
            { id: 'ne', cx: ab.x + ab.width,     cy: ab.y,               cursor: 'ne-resize' },
            { id: 'e',  cx: ab.x + ab.width,     cy: ab.y + ab.height / 2, cursor: 'e-resize' },
            { id: 'se', cx: ab.x + ab.width,     cy: ab.y + ab.height,   cursor: 'se-resize' },
            { id: 's',  cx: ab.x + ab.width / 2, cy: ab.y + ab.height,   cursor: 's-resize' },
            { id: 'sw', cx: ab.x,               cy: ab.y + ab.height,    cursor: 'sw-resize' },
            { id: 'w',  cx: ab.x,               cy: ab.y + ab.height / 2, cursor: 'w-resize' },
          ]
          return (
            <g key={ab.id}>
              {/* Background hit area for selecting/moving */}
              <rect x={ab.x} y={ab.y} width={ab.width} height={ab.height}
                fill="transparent" stroke="none" pointerEvents="all"
                style={{ cursor: activeTool === 'select' ? 'move' : 'default' }}
                onPointerDown={(e) => {
                  if (activeTool !== 'select') return
                  e.stopPropagation()
                  setActiveArtboard(ab.id)
                  clearSelection()
                  const pt2 = toCanvas(e)
                  artboardDragRef.current = { id: ab.id, startX: pt2.x, startY: pt2.y, origX: ab.x, origY: ab.y, origW: ab.width, origH: ab.height, handle: 'move' }
                  ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                }}
              />
              {/* Border */}
              <rect x={ab.x} y={ab.y} width={ab.width} height={ab.height}
                fill="none" stroke={color} strokeWidth={1 / zoom} pointerEvents="none" />
              {/* Name label */}
              {editingArtboardNameId === ab.id ? null : (
                <text x={ab.x} y={ab.y - 3 / zoom}
                  fontSize={9 / zoom} fill={color} fontFamily="sans-serif"
                  pointerEvents={isActive ? 'all' : 'none'}
                  style={{ cursor: 'text', userSelect: 'none' }}
                  onPointerDown={(e) => { if (isActive) e.stopPropagation() }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setEditingArtboardNameId(ab.id)
                  }}>
                  {ab.name}
                </text>
              )}
              {/* Resize handles — only when active */}
              {isActive && handles.map((h) => (
                <rect key={h.id}
                  x={h.cx - hw} y={h.cy - hw} width={hw * 2} height={hw * 2}
                  fill="#fff" stroke="rgba(100,160,255,0.9)" strokeWidth={0.8 / zoom}
                  style={{ cursor: h.cursor }} pointerEvents="all"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    const pt2 = toCanvas(e)
                    artboardDragRef.current = { id: ab.id, startX: pt2.x, startY: pt2.y, origX: ab.x, origY: ab.y, origW: ab.width, origH: ab.height, handle: h.id }
                    ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                  }}
                />
              ))}
            </g>
          )
        })}

        {orderedShapes.map((shape) => {
          const clipSource = shape.clippedBy ? shapes.find((s) => s.id === shape.clippedBy) : undefined
          return (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              isSelected={selectedIds.includes(shape.id)}
              onPointerDown={handleShapePointerDown}
              activeTool={activeTool}
              isEditing={editingTextId === shape.id}
              clipSource={clipSource}
            />
          )
        })}

        {drawingPreview}

        {/* Pencil freehand preview */}
        {pencilPreview && (
          <path d={pencilPreview} fill="none" stroke="#e94560" strokeWidth={2 / zoom} pointerEvents="none" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Eraser cursor */}
        {eraserPos && activeTool === 'eraser' && (
          <circle cx={eraserPos.x} cy={eraserPos.y} r={8 / zoom}
            fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.8)" strokeWidth={1 / zoom}
            pointerEvents="none" />
        )}

        {/* Pen tool live preview */}
        {activeTool === 'path' && penPreview && (() => {
          const { nodes, cx, cy, closing } = penPreview
          const r = (n: number) => Math.round(n * 100) / 100
          const strokeW = 1.5 / zoom
          const anchorR = 3.5 / zoom
          const handleR = 2.5 / zoom

          const elements: React.ReactElement[] = []

          // 1. All placed segments so far
          if (nodes.length >= 2) {
            const d = serializeBezierPath(nodes, false)
            elements.push(
              <path key="placed" d={d} fill="none" stroke="#e94560" strokeWidth={strokeW} pointerEvents="none" />
            )
          }

          // 2. Rubber-band segment from last node to cursor (or closing back to first)
          if (nodes.length >= 1) {
            const last = nodes[nodes.length - 1]
            const targetX = closing ? nodes[0].x : cx
            const targetY = closing ? nodes[0].y : cy
            const hasOutHandle = last.cp2x !== last.x || last.cp2y !== last.y
            const rbD = hasOutHandle
              ? `M ${r(last.x)} ${r(last.y)} C ${r(last.cp2x)} ${r(last.cp2y)} ${r(targetX)} ${r(targetY)} ${r(targetX)} ${r(targetY)}`
              : `M ${r(last.x)} ${r(last.y)} L ${r(targetX)} ${r(targetY)}`
            elements.push(
              <path key="rubber" d={rbD} fill="none" stroke="rgba(233,69,96,0.7)" strokeWidth={1 / zoom} strokeDasharray={`${4/zoom} ${3/zoom}`} pointerEvents="none" />
            )
          }

          // 3. Anchor points and handles
          nodes.forEach((n, i) => {
            const isFirst = i === 0
            const isLast = i === nodes.length - 1
            const ntype: NodeType = n.nodeType ?? (n.smooth ? 'symmetric' : 'corner')
            const hasCP1 = n.cp1x !== n.x || n.cp1y !== n.y
            const hasCP2 = n.cp2x !== n.x || n.cp2y !== n.y

            // Only show handles for last anchor
            const showHandles = isLast

            elements.push(
              <g key={`a${i}`} pointerEvents="none">
                {showHandles && hasCP1 && (
                  <>
                    <line x1={n.x} y1={n.y} x2={n.cp1x} y2={n.cp1y} stroke="rgba(255,255,255,0.45)" strokeWidth={1/zoom} />
                    <circle cx={n.cp1x} cy={n.cp1y} r={handleR} fill="#e94560" stroke="#fff" strokeWidth={0.8/zoom} />
                  </>
                )}
                {showHandles && hasCP2 && (
                  <>
                    <line x1={n.x} y1={n.y} x2={n.cp2x} y2={n.cp2y} stroke="rgba(255,255,255,0.45)" strokeWidth={1/zoom} />
                    <circle cx={n.cp2x} cy={n.cp2y} r={handleR} fill="#e94560" stroke="#fff" strokeWidth={0.8/zoom} />
                  </>
                )}
                {/* Anchor shape: square=corner, circle=smooth */}
                {ntype === 'corner' ? (
                  <rect
                    x={n.x - anchorR} y={n.y - anchorR}
                    width={anchorR * 2} height={anchorR * 2}
                    fill={isFirst && closing ? '#00e676' : isLast ? '#e94560' : '#fff'}
                    stroke="#e94560" strokeWidth={1/zoom}
                  />
                ) : (
                  <circle cx={n.x} cy={n.y} r={anchorR}
                    fill={isFirst && closing ? '#00e676' : isLast ? '#e94560' : '#fff'}
                    stroke="#e94560" strokeWidth={1/zoom}
                  />
                )}
              </g>
            )
          })

          // 4. Close-path highlight ring on first anchor
          if (closing && nodes.length >= 2) {
            elements.push(
              <circle key="close-ring"
                cx={nodes[0].x} cy={nodes[0].y}
                r={anchorR * 2.2}
                fill="none" stroke="#00e676" strokeWidth={1.5/zoom}
                pointerEvents="none"
              />
            )
          }

          return <g pointerEvents="none">{elements}</g>
        })()}

        {presetGhostEl}

        {selBBox && selectedIds.length > 0 && activeTool === 'select' && !drawing && (
          <SelectionOverlay
            bbox={selBBox}
            onHandlePointerDown={handleHandlePointerDown}
            zoom={zoom}
          />
        )}

        {/* Resize dimension overlay */}
        {drag?.type === 'resize' && selBBox && (
          <g pointerEvents="none">
            <rect
              x={selBBox.x + selBBox.width / 2 - 24 / zoom}
              y={selBBox.y + selBBox.height + 4 / zoom}
              width={48 / zoom} height={14 / zoom}
              fill="rgba(0,0,0,0.7)" rx={2 / zoom}
            />
            <text
              x={selBBox.x + selBBox.width / 2}
              y={selBBox.y + selBBox.height + 13 / zoom}
              fontSize={9 / zoom}
              fill="white"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {Math.round(selBBox.width)}×{Math.round(selBBox.height)}
            </text>
          </g>
        )}

        {/* Path node editing handles */}
        {editingNodePathId && (() => {
          const pathShape = shapes.find((s) => s.id === editingNodePathId)
          if (!pathShape || pathShape.type !== 'path') return null

          if (isSimplePath(pathShape.d)) {
            const { points, closed } = parseSimplePath(pathShape.d)
            const r = 3 / zoom
            return (
              <g pointerEvents="all">
                {/* Midpoint hit-areas for inserting nodes */}
                {points.map((pt, i) => {
                  const next = points[(i + 1) % points.length]
                  if (i === points.length - 1 && !closed) return null
                  const mx = (pt.x + next.x) / 2
                  const my = (pt.y + next.y) / 2
                  return (
                    <circle key={`seg-${i}`} cx={mx} cy={my} r={2 / zoom}
                      fill="rgba(100,160,255,0.7)" stroke="#fff" strokeWidth={0.8 / zoom}
                      style={{ cursor: 'copy' }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        const newPts = [...points.slice(0, i + 1), { x: mx, y: my }, ...points.slice(i + 1)]
                        updateShape(editingNodePathId, { d: serializeSimplePath(newPts, closed) } as any)
                        commit()
                        setSelectedNodeIndex(i + 1)
                      }}
                    />
                  )
                })}
                {points.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={r}
                    fill={selectedNodeIndex === i ? '#e94560' : '#fff'}
                    stroke="#e94560" strokeWidth={1 / zoom} style={{ cursor: 'move' }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      setSelectedNodeIndex(i)
                      ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                      nodeHandleDragRef.current = { pathId: editingNodePathId, pointIndex: i, origPoints: points, closed }
                    }}
                  />
                ))}
              </g>
            )
          }

          if (isBezierPath(pathShape.d)) {
            const { nodes, closed } = parseBezierPath(pathShape.d)
            const ar = 4 / zoom  // anchor radius
            const hr = 2.5 / zoom  // handle radius

            const nodeColor = (type: NodeType | undefined) => {
              switch (type) {
                case 'corner': return '#fff'
                case 'smooth': return '#88ccff'
                case 'symmetric': return '#e94560'
                case 'auto': return '#aaffaa'
                default: return '#fff'
              }
            }

            return (
              <g pointerEvents="all">
                {nodes.map((n, i) => {
                  const hasCP1 = n.cp1x !== n.x || n.cp1y !== n.y
                  const hasCP2 = n.cp2x !== n.x || n.cp2y !== n.y
                  const isSelected = selectedNodeIndex === i
                  const ntype: NodeType = n.nodeType ?? (n.smooth ? 'symmetric' : 'corner')
                  return (
                    <g key={i}>
                      {/* Handle lines */}
                      {hasCP1 && <line x1={n.x} y1={n.y} x2={n.cp1x} y2={n.cp1y} stroke="rgba(255,255,255,0.4)" strokeWidth={1 / zoom} pointerEvents="none" />}
                      {hasCP2 && <line x1={n.x} y1={n.y} x2={n.cp2x} y2={n.cp2y} stroke="rgba(255,255,255,0.4)" strokeWidth={1 / zoom} pointerEvents="none" />}
                      {/* CP1 handle */}
                      {hasCP1 && (
                        <circle cx={n.cp1x} cy={n.cp1y} r={hr} fill={nodeColor(ntype)} stroke="#fff" strokeWidth={0.8 / zoom} style={{ cursor: 'crosshair' }}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                            bezierHandleDragRef.current = { pathId: editingNodePathId!, nodeIndex: i, field: 'cp1', origNodes: nodes, closed, breakTangent: e.altKey }
                          }}
                        />
                      )}
                      {/* CP2 handle */}
                      {hasCP2 && (
                        <circle cx={n.cp2x} cy={n.cp2y} r={hr} fill={nodeColor(ntype)} stroke="#fff" strokeWidth={0.8 / zoom} style={{ cursor: 'crosshair' }}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                            bezierHandleDragRef.current = { pathId: editingNodePathId!, nodeIndex: i, field: 'cp2', origNodes: nodes, closed, breakTangent: e.altKey }
                          }}
                        />
                      )}
                      {/* Anchor — square for corner, circle for others */}
                      {ntype === 'corner' ? (
                        <rect
                          x={n.x - ar} y={n.y - ar} width={ar * 2} height={ar * 2}
                          fill={isSelected ? '#e94560' : nodeColor(ntype)}
                          stroke="#e94560" strokeWidth={1 / zoom} style={{ cursor: 'move' }}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            if (e.altKey) {
                              const order: NodeType[] = ['corner', 'smooth', 'symmetric', 'auto']
                              const next = order[(order.indexOf(ntype) + 1) % order.length]
                              const newNodes = nodes.map((nn, ii) => ii === i ? { ...nn, nodeType: next, smooth: next !== 'corner' } : nn)
                              const finalNodes = next === 'auto' ? applyAutoSmooth(newNodes, closed) : newNodes
                              updateShape(editingNodePathId!, { d: serializeBezierPath(finalNodes, closed) } as any)
                              commit()
                              return
                            }
                            setSelectedNodeIndex(i)
                            ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                            bezierHandleDragRef.current = { pathId: editingNodePathId!, nodeIndex: i, field: 'anchor', origNodes: nodes, closed, breakTangent: false }
                          }}
                        />
                      ) : (
                        <circle cx={n.x} cy={n.y} r={ar}
                          fill={isSelected ? '#e94560' : nodeColor(ntype)}
                          stroke="#e94560" strokeWidth={1 / zoom} style={{ cursor: 'move' }}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            if (e.altKey) {
                              const order: NodeType[] = ['corner', 'smooth', 'symmetric', 'auto']
                              const next = order[(order.indexOf(ntype) + 1) % order.length]
                              const newNodes = nodes.map((nn, ii) => ii === i ? { ...nn, nodeType: next, smooth: next !== 'corner' } : nn)
                              const finalNodes = next === 'auto' ? applyAutoSmooth(newNodes, closed) : newNodes
                              updateShape(editingNodePathId!, { d: serializeBezierPath(finalNodes, closed) } as any)
                              commit()
                              return
                            }
                            setSelectedNodeIndex(i)
                            ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                            bezierHandleDragRef.current = { pathId: editingNodePathId!, nodeIndex: i, field: 'anchor', origNodes: nodes, closed, breakTangent: false }
                          }}
                        />
                      )}
                    </g>
                  )
                })}
              </g>
            )
          }

          return null
        })()}

        {/* Width tool handles */}
        {activeTool === 'width' && selectedIds.length === 1 && (() => {
          const pathShape = shapes.find(s => s.id === selectedIds[0])
          if (!pathShape || pathShape.type !== 'path') return null
          const brushDef = (pathShape as any).brush as BrushDef | undefined
          if (!brushDef || brushDef.type !== 'variable') return null
          const profile = brushDef.widthProfile ?? [{ t: 0, w: 3 }, { t: 0.5, w: brushDef.size ?? 8 }, { t: 1, w: 3 }]
          const samples = samplePath(pathShape.d, 120)
          if (samples.length < 2) return null

          return (
            <g pointerEvents="all">
              {profile.map((pt, i) => {
                const si = Math.round(pt.t * (samples.length - 1))
                const s = samples[Math.max(0, Math.min(si, samples.length - 1))]
                const hw = pt.w / 2
                const lx = s.x - s.ty * hw; const ly = s.y + s.tx * hw
                const rx = s.x + s.ty * hw; const ry = s.y - s.tx * hw
                return (
                  <g key={i}>
                    <line x1={lx} y1={ly} x2={rx} y2={ry} stroke="rgba(100,160,255,0.6)" strokeWidth={1 / zoom} pointerEvents="none" />
                    <circle cx={lx} cy={ly} r={4 / zoom} fill="#64a0ff" stroke="#fff" strokeWidth={1 / zoom} style={{ cursor: 'ns-resize' }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                        widthHandleDragRef.current = { pathId: pathShape.id, handleIndex: i, side: 'left', origProfile: profile, samples }
                      }}
                    />
                    <circle cx={rx} cy={ry} r={4 / zoom} fill="#64a0ff" stroke="#fff" strokeWidth={1 / zoom} style={{ cursor: 'ns-resize' }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                        widthHandleDragRef.current = { pathId: pathShape.id, handleIndex: i, side: 'right', origProfile: profile, samples }
                      }}
                    />
                  </g>
                )
              })}
            </g>
          )
        })()}

        {/* Character offset editing handles */}
        {charEditId && (() => {
          const shape = shapes.find((s) => s.id === charEditId)
          if (!shape || shape.type !== 'text') return null
          const charOffsets: number[] = (shape as any).charOffsets ?? Array(shape.text.length).fill(0)
          const charOffsetsY: number[] = (shape as any).charOffsetsY ?? Array(shape.text.length).fill(0)
          // Estimate natural char positions using canvas measureText
          const cvs = document.createElement('canvas')
          const ctx = cvs.getContext('2d')!
          ctx.font = `${shape.fontWeight} ${shape.fontSize}px ${shape.fontFamily}`
          const naturalX: number[] = []
          const charWidths: number[] = []
          let totalW = 0
          for (const ch of shape.text) {
            naturalX.push(totalW)
            const w = ctx.measureText(ch).width + ((shape as any).letterSpacing ?? 0)
            charWidths.push(w)
            totalW += w
          }
          const hr = 3.5 / zoom

          // Arc text handles
          if (shape.textOnArc) {
            const r = (shape as any).arcRadius ?? shape.fontSize * 3
            const arcOffset = (shape as any).arcOffset ?? 50
            const isDown = (shape as any).arcDirection === 'down'
            const arcLen = Math.PI * r
            const arcCenter = (arcOffset / 100) * arcLen
            return (
              <g pointerEvents="all">
                <text x={shape.x - r} y={isDown ? shape.y + r + 14 / zoom : shape.y - r - 7 / zoom}
                  fontSize={7 / zoom} fill="rgba(100,160,255,0.9)" fontFamily="monospace"
                  pointerEvents="none">
                  char edit · Tab=next · Alt+←→↑↓=nudge · Esc=exit
                </text>
                {shape.text.split('').map((ch, i) => {
                  const arcDist = arcCenter + naturalX[i] + (charOffsets[i] ?? 0) - totalW / 2 + charWidths[i] / 2
                  const t = Math.max(0, Math.min(1, arcDist / arcLen))
                  const angle = Math.PI * t
                  const cY = charOffsetsY[i] ?? 0
                  // effective radius after Y offset (positive cY = inward = smaller effective r)
                  const effR = r - cY
                  const hx = shape.x - effR * Math.cos(angle)
                  const hy = isDown
                    ? shape.y + effR * Math.sin(angle)
                    : shape.y - effR * Math.sin(angle)
                  const isSelected = selectedCharIndex === i
                  // tangent and toward-center unit vectors for drag decomposition
                  const tx = Math.sin(angle)
                  const ty = isDown ? Math.cos(angle) : -Math.cos(angle)
                  const cx2 = Math.cos(angle)      // toward-center x
                  const cy2 = isDown ? -Math.sin(angle) : Math.sin(angle)  // toward-center y
                  return (
                    <circle key={i} cx={hx} cy={hy} r={hr}
                      fill={isSelected ? '#e94560' : 'rgba(100,160,255,0.7)'}
                      stroke="#fff" strokeWidth={0.8 / zoom}
                      style={{ cursor: 'move' }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        setSelectedCharIndex(i)
                        const startPt = toCanvas(e)
                        const startOffX = charOffsets[i] ?? 0
                        const startOffY = charOffsetsY[i] ?? 0
                        ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                        const onMove = (ev: PointerEvent) => {
                          const pt = toCanvas(ev as unknown as React.PointerEvent)
                          const dx = pt.x - startPt.x
                          const dy = pt.y - startPt.y
                          const dTangent = dx * tx + dy * ty
                          const dCenter = dx * cx2 + dy * cy2
                          const newOffsetsX = [...charOffsets]
                          while (newOffsetsX.length < shape.text.length) newOffsetsX.push(0)
                          newOffsetsX[i] = startOffX + dTangent
                          const newOffsetsY = [...charOffsetsY]
                          while (newOffsetsY.length < shape.text.length) newOffsetsY.push(0)
                          newOffsetsY[i] = startOffY + dCenter
                          updateShape(charEditId!, { charOffsets: newOffsetsX, charOffsetsY: newOffsetsY } as any)
                        }
                        const onUp = () => {
                          commit()
                          window.removeEventListener('pointermove', onMove)
                          window.removeEventListener('pointerup', onUp)
                        }
                        window.addEventListener('pointermove', onMove)
                        window.addEventListener('pointerup', onUp)
                      }}
                    />
                  )
                })}
              </g>
            )
          }

          // Normal text handles
          const baseX = shape.textAnchor === 'middle' ? shape.x - totalW / 2
            : shape.textAnchor === 'end' ? shape.x - totalW
            : shape.x
          const baseY = shape.y
          return (
            <g pointerEvents="all">
              {/* Indicator label */}
              <text x={baseX} y={baseY - shape.fontSize - 4 / zoom}
                fontSize={7 / zoom} fill="rgba(100,160,255,0.9)" fontFamily="monospace"
                pointerEvents="none">
                char edit · Tab=next · Alt+←→↑↓=nudge · Esc=exit
              </text>
              {shape.text.split('').map((ch, i) => {
                const xPos = baseX + naturalX[i] + (charOffsets[i] ?? 0)
                const yOff = charOffsetsY[i] ?? 0
                const isSelected = selectedCharIndex === i
                return (
                  <g key={i}>
                    {/* Highlight box */}
                    <rect
                      x={xPos - 1 / zoom} y={baseY - shape.fontSize - 1 / zoom + yOff}
                      width={charWidths[i] + 2 / zoom} height={shape.fontSize + 2 / zoom}
                      fill={isSelected ? 'rgba(233,69,96,0.2)' : 'rgba(100,160,255,0.1)'}
                      stroke={isSelected ? '#e94560' : 'rgba(100,160,255,0.5)'}
                      strokeWidth={0.8 / zoom}
                      style={{ cursor: 'pointer' }}
                      onPointerDown={(e) => { e.stopPropagation(); setSelectedCharIndex(i) }}
                    />
                    {/* Handle for dragging (2D) */}
                    <circle
                      cx={xPos + charWidths[i] / 2}
                      cy={baseY - shape.fontSize - 5 / zoom + yOff}
                      r={hr}
                      fill={isSelected ? '#e94560' : 'rgba(100,160,255,0.7)'}
                      stroke="#fff" strokeWidth={0.8 / zoom}
                      style={{ cursor: 'move' }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        setSelectedCharIndex(i)
                        const startPt = toCanvas(e)
                        const startOffX = charOffsets[i] ?? 0
                        const startOffY = charOffsetsY[i] ?? 0
                        ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                        const onMove = (ev: PointerEvent) => {
                          const pt = toCanvas(ev as unknown as React.PointerEvent)
                          const newOffsetsX = [...charOffsets]
                          while (newOffsetsX.length < shape.text.length) newOffsetsX.push(0)
                          newOffsetsX[i] = startOffX + (pt.x - startPt.x)
                          const newOffsetsY = [...charOffsetsY]
                          while (newOffsetsY.length < shape.text.length) newOffsetsY.push(0)
                          newOffsetsY[i] = startOffY + (pt.y - startPt.y)
                          updateShape(charEditId!, { charOffsets: newOffsetsX, charOffsetsY: newOffsetsY } as any)
                        }
                        const onUp = () => {
                          commit()
                          window.removeEventListener('pointermove', onMove)
                          window.removeEventListener('pointerup', onUp)
                        }
                        window.addEventListener('pointermove', onMove)
                        window.addEventListener('pointerup', onUp)
                      }}
                    />
                  </g>
                )
              })}
            </g>
          )
        })()}

        {/* Artboard name editor */}
        {editingArtboardNameId && (() => {
          const ab = artboards.find((a) => a.id === editingArtboardNameId)
          if (!ab) return null
          const fontSize = 9 / zoom
          return (
            <foreignObject x={ab.x} y={ab.y - fontSize * 2 - 2 / zoom} width={Math.max(60, ab.name.length * fontSize * 0.7 + 20)} height={fontSize * 2.5}>
              <div style={{ width: '100%', height: '100%' }}>
                <input
                  autoFocus
                  defaultValue={ab.name}
                  style={{
                    width: '100%', background: 'rgba(20,30,50,0.95)', color: '#a0c8ff',
                    border: '1px solid rgba(100,160,255,0.6)', borderRadius: 2,
                    fontSize: `${fontSize}px`, padding: '1px 3px', outline: 'none',
                  }}
                  onBlur={(e) => { updateArtboard(ab.id, { name: e.target.value || ab.name }); setEditingArtboardNameId(null); commit() }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { updateArtboard(ab.id, { name: e.currentTarget.value || ab.name }); setEditingArtboardNameId(null); commit() }
                    if (e.key === 'Escape') setEditingArtboardNameId(null)
                    e.stopPropagation()
                  }}
                />
              </div>
            </foreignObject>
          )
        })()}

        {/* Inline text editor */}
        {editingTextId && (() => {
          const shape = shapes.find((s) => s.id === editingTextId)
          if (!shape || shape.type !== 'text') return null
          return (
            <TextEditorOverlay
              key={editingTextId}
              shape={shape}
              zoom={zoom}
              onCommit={(text) => {
                if (text.trim()) {
                  updateShape(editingTextId, { text } as any)
                  commit()
                } else {
                  useEditorStore.getState().deleteShapes([editingTextId])
                }
                setEditingTextId(null)
              }}
              onCancel={() => {
                // If text is still default "Text", delete it
                if (shape.text === 'Text') {
                  useEditorStore.getState().deleteShapes([editingTextId])
                }
                setEditingTextId(null)
              }}
            />
          )
        })()}

        {/* Guides */}
        {guides.map((g) => {
          const isH = g.type === 'h'
          return (
            <line key={g.id}
              x1={isH ? -99999 : g.position} y1={isH ? g.position : -99999}
              x2={isH ? 99999 : g.position} y2={isH ? g.position : 99999}
              stroke="rgba(0,160,255,0.7)" strokeWidth={0.8 / zoom}
              strokeDasharray={`${4/zoom} ${3/zoom}`}
              pointerEvents="stroke"
              style={{ cursor: isH ? 'ns-resize' : 'ew-resize' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
                const onMove = (ev: PointerEvent) => {
                  const pt = toCanvas(ev as unknown as React.PointerEvent)
                  updateGuide(g.id, isH ? pt.y : pt.x)
                }
                const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
                window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
              }}
              onDoubleClick={(e) => { e.stopPropagation(); removeGuide(g.id) }}
            />
          )
        })}

        {/* Gradient handles */}
        {activeTool === 'select' && selectedIds.length === 1 && !drag && (() => {
          const gradShape = shapes.find((s) => s.id === selectedIds[0])
          if (!gradShape?.gradientFill) return null
          const gf = gradShape.gradientFill
          const bbox = getShapeBBox(gradShape)
          const hr = 4 / zoom

          if (gf.type === 'linear') {
            const rad = (gf.angle * Math.PI) / 180
            const fx1 = gf.x1 ?? (0.5 - 0.5 * Math.cos(rad))
            const fy1 = gf.y1 ?? (0.5 - 0.5 * Math.sin(rad))
            const fx2 = gf.x2 ?? (0.5 + 0.5 * Math.cos(rad))
            const fy2 = gf.y2 ?? (0.5 + 0.5 * Math.sin(rad))
            const p1 = { x: bbox.x + fx1 * bbox.width, y: bbox.y + fy1 * bbox.height }
            const p2 = { x: bbox.x + fx2 * bbox.width, y: bbox.y + fy2 * bbox.height }

            const makeHandle = (which: 'start' | 'end') => {
              const isStart = which === 'start'
              const pt = isStart ? p1 : p2
              const color = isStart ? (gf.stops[0]?.color ?? '#fff') : (gf.stops[gf.stops.length-1]?.color ?? '#000')
              return (
                <circle key={which} cx={pt.x} cy={pt.y} r={hr}
                  fill={color} stroke="white" strokeWidth={1.5/zoom}
                  style={{ cursor: 'move' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
                    const onMove = (ev: PointerEvent) => {
                      const p = toCanvas(ev as unknown as React.PointerEvent)
                      const nx = (p.x - bbox.x) / (bbox.width || 1)
                      const ny = (p.y - bbox.y) / (bbox.height || 1)
                      if (isStart) updateShape(gradShape.id, { gradientFill: { ...gf, x1: nx, y1: ny } } as any)
                      else updateShape(gradShape.id, { gradientFill: { ...gf, x2: nx, y2: ny } } as any)
                    }
                    const onUp = () => { commit(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
                    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
                  }}
                />
              )
            }

            return (
              <g pointerEvents="all">
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(255,255,255,0.5)" strokeWidth={1/zoom} strokeDasharray={`${3/zoom} ${2/zoom}`} pointerEvents="none" />
                {makeHandle('start')}
                {makeHandle('end')}
              </g>
            )
          }

          if (gf.type === 'radial') {
            const cx = (gf.cx ?? 0.5) * bbox.width + bbox.x
            const cy = (gf.cy ?? 0.5) * bbox.height + bbox.y
            const er = Math.min(bbox.width, bbox.height) * 0.5
            return (
              <g pointerEvents="all">
                <circle cx={cx} cy={cy} r={er} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1/zoom} strokeDasharray={`${3/zoom} ${2/zoom}`} pointerEvents="none" />
                <circle cx={cx} cy={cy} r={hr}
                  fill={gf.stops[0]?.color ?? '#fff'} stroke="white" strokeWidth={1.5/zoom}
                  style={{ cursor: 'move' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
                    const onMove = (ev: PointerEvent) => {
                      const p = toCanvas(ev as unknown as React.PointerEvent)
                      updateShape(gradShape.id, { gradientFill: { ...gf, cx: (p.x - bbox.x) / (bbox.width || 1), cy: (p.y - bbox.y) / (bbox.height || 1) } } as any)
                    }
                    const onUp = () => { commit(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
                    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
                  }}
                />
              </g>
            )
          }
          return null
        })()}

        {/* Smart snap guides */}
        {snapGuides.map((guide, i) =>
          guide.type === 'x' ? (
            <line
              key={i}
              x1={guide.value} y1={guide.from}
              x2={guide.value} y2={guide.to}
              stroke="#ff3b82"
              strokeWidth={1 / zoom}
              strokeDasharray={`${3 / zoom} ${2 / zoom}`}
              pointerEvents="none"
            />
          ) : (
            <line
              key={i}
              x1={guide.from} y1={guide.value}
              x2={guide.to} y2={guide.value}
              stroke="#ff3b82"
              strokeWidth={1 / zoom}
              strokeDasharray={`${3 / zoom} ${2 / zoom}`}
              pointerEvents="none"
            />
          )
        )}
      </svg>
    </div>
  )
}

// ── Inline text editor overlay ──────────────────────────────────────────────

interface TextEditorProps {
  shape: import('../../types/shapes').TextShape
  zoom: number
  onCommit: (text: string) => void
  onCancel: () => void
}

function TextEditorOverlay({ shape, zoom, onCommit, onCancel }: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // foreignObject inherits the SVG viewBox transform, so sizes here are in SVG user units.
  // CSS values inside the foreignObject are already scaled by the SVG zoom — use raw SVG units.
  const fs = shape.fontSize          // SVG units = CSS px inside foreignObject (zoom already applied by SVG)
  const minW = Math.max(fs * 5, 40)  // SVG units

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.select()
    autoResize(el)
  }, [])

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
    el.style.width = minW + 'px'
    el.style.width = Math.max(el.scrollWidth, minW) + 'px'
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(e.currentTarget.value); return }
    requestAnimationFrame(() => { if (textareaRef.current) autoResize(textareaRef.current) })
  }

  // Align foreignObject so the textarea's text baseline matches the SVG <text> y position.
  // SVG text with dominant-baseline="auto" sits with its baseline at shape.y.
  // A textarea with line-height:1 has its baseline at approximately (fontSize * 0.8) from the top.
  const foX = shape.x
  const foY = shape.y - fs * 0.85  // offset so text baseline aligns with shape.y

  const textColor = shape.fill === 'none' || !shape.fill ? 'white' : shape.fill

  return (
    <foreignObject x={foX} y={foY} width={9999} height={9999} style={{ overflow: 'visible' }}>
      <textarea
        ref={textareaRef}
        defaultValue={shape.text === 'Text' ? '' : shape.text}
        placeholder=""
        onKeyDown={handleKeyDown}
        onInput={(e) => autoResize(e.currentTarget)}
        onBlur={(e) => onCommit(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          display: 'block',
          background: 'transparent',
          border: 'none',
          borderBottom: `${0.3}px solid ${textColor}`,
          outline: 'none',
          color: textColor,
          caretColor: textColor,
          fontSize: fs,
          fontFamily: shape.fontFamily,
          fontWeight: shape.fontWeight,
          textAlign: shape.textAnchor === 'middle' ? 'center' : shape.textAnchor === 'end' ? 'right' : 'left',
          padding: 0,
          margin: 0,
          resize: 'none',
          overflow: 'hidden',
          lineHeight: 1,
          minWidth: minW,
          boxSizing: 'content-box',
          whiteSpace: 'pre',
        }}
      />
    </foreignObject>
  )
}
