import React, { useRef, useCallback, useEffect, useState } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { ShapeRenderer } from './ShapeRenderer'
import { SelectionOverlay } from './SelectionOverlay'
import { getSelectionBBox, getShapeBBox, svgPointFromEvent, snap, moveShape, polygonPoints } from '../../utils/geometry'
import { computeSmartSnap } from '../../utils/smartSnap'
import { parseSimplePath, serializeSimplePath, isSimplePath } from '../../utils/pathUtils'
import type { Shape } from '../../types/shapes'
import type { SnapGuide } from '../../utils/smartSnap'

// Module-level clipboard (survives re-renders)
let svgClipboard: Shape[] = []
let svgPasteOffset = 8

function applyPasteOffset(shape: Shape, offset: number): Shape {
  const s = { ...shape, name: shape.name.replace(/ copy$/, '') + ' copy' }
  switch (s.type) {
    case 'rect': return { ...s, x: s.x + offset, y: s.y + offset }
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
    case 'polygon':
      return { ...DEFAULT_SHAPE_PROPS, type: 'polygon', cx, cy, size, sides: 6, innerRadius: 0, isStar: false, name: 'Polygon' }
    case 'star':
      return { ...DEFAULT_SHAPE_PROPS, type: 'polygon', cx, cy, size, sides: 5, innerRadius: 0.4, isStar: true, name: 'Star' }
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
  const [editingNodePathId, setEditingNodePathId] = useState<string | null>(null)
  const nodeHandleDragRef = useRef<{
    pathId: string
    pointIndex: number
    startX: number
    startY: number
    origPoints: { x: number; y: number }[]
    closed: boolean
  } | null>(null)

  const store = useEditorStore()
  const {
    shapes, layerOrder, selectedIds, activeTool,
    canvasSize, gridSize, snapEnabled, zoom, panX, panY,
    gridEnabled, drawing, setDrawing, addShape, updateShape, setSelectedIds,
    selectShape, clearSelection, setDrag, drag, commit, setEditingTextId, editingTextId,
    draggingPreset, setDraggingPreset,
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

  // Handle pointer down on canvas background
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
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
      setDrawing({
        isDrawing: true,
        startX: snapped.x,
        startY: snapped.y,
        currentX: snapped.x,
        currentY: snapped.y,
        pathPoints: [{ x: snapped.x, y: snapped.y }],
      })
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
  }, [activeTool, clearSelection, setDrawing, toCanvas, snapXY])

  // Handle pointer down on shape (for selection + move)
  const handleShapePointerDown = useCallback((e: React.PointerEvent, id: string) => {
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

    // Node handle drag
    if (nodeHandleDragRef.current) {
      const { pathId, pointIndex, origPoints, closed } = nodeHandleDragRef.current
      const newPoints = origPoints.map((p, i) =>
        i === pointIndex ? { x: snapped.x, y: snapped.y } : p
      )
      updateShape(pathId, { d: serializeSimplePath(newPoints, closed) } as any)
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
        const deltaAngle = ((currentAngle - startAngle) * 180) / Math.PI
        drag.startShapes.forEach((startShape) => {
          updateShape(startShape.id, { rotation: (startShape.rotation + deltaAngle) % 360 })
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
  }, [drawing, drag, activeTool, setDrawing, updateShape, toCanvas, snapXY, selBBox])

  // Use the shared getShapeBBox from geometry.ts — single source of truth for all shape types including path
  const getShapeBBoxLocal = getShapeBBox

  function applyResize(shape: Shape, tx: number, ty: number, tw: number, th: number, sx: number, sy: number) {
    const tcx = tx + tw / 2
    const tcy = ty + th / 2
    switch (shape.type) {
      case 'rect': updateShape(shape.id, { x: tx, y: ty, width: Math.max(1, tw), height: Math.max(1, th) }); break
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
    if (drag?.type === 'move' || drag?.type === 'resize') {
      setDrag(null)
      setSnapGuides([])
      if (didMoveRef.current) commit()
      pointerDownRef.current = null
      didMoveRef.current = false
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

    if (activeTool === 'path' && drawing.pathPoints) {
      // Add click to path
      const snapped = snapXY(currentX, currentY)
      const newPoints = [...drawing.pathPoints, { x: snapped.x, y: snapped.y }]
      setDrawing({ ...drawing, pathPoints: newPoints, currentX: snapped.x, currentY: snapped.y })
      return
    }

    const newShape = makeShape(activeTool, startX, startY, currentX, currentY, canvasSize.width, canvasSize.height)
    if (newShape) {
      const id = addShape(newShape)
      if (activeTool === 'text') {
        // Immediately enter text editing mode and switch to select tool
        useEditorStore.getState().setActiveTool('select')
        useEditorStore.getState().setEditingTextId(id)
      }
    }
    setDrawing(null)
    pointerDownRef.current = null
  }, [drawing, activeTool, drag, setDrawing, setDrag, addShape, canvasSize, commit, snapXY, shapes, setSelectedIds])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'path' && drawing?.pathPoints && drawing.pathPoints.length > 1) {
      const pts = drawing.pathPoints
      const d = `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ') + ' Z'
      addShape({ ...DEFAULT_SHAPE_PROPS, type: 'path', d, fill: '#e94560', fillOpacity: 1, stroke: 'none', strokeWidth: 1, name: 'Path' } as any)
      setDrawing(null)
      return
    }
    // Double-click a selected shape to edit it
    if (activeTool === 'select' && selectedIds.length === 1) {
      const shape = shapes.find((s) => s.id === selectedIds[0])
      if (shape?.type === 'text') {
        setEditingTextId(shape.id)
      } else if (shape?.type === 'path' && isSimplePath(shape.d)) {
        setEditingNodePathId(shape.id)
      }
    }
  }, [activeTool, drawing, addShape, setDrawing, selectedIds, shapes, setEditingTextId])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
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
      if (e.key === 'Escape') {
        if (editingNodePathId) { setEditingNodePathId(null); return }
        clearSelection()
        if (drawing) setDrawing(null)
        if (draggingPreset) { setDraggingPreset(null); setPresetGhost(null) }
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
  }, [selectedIds, shapes, clearSelection, drawing, setDrawing, setSelectedIds, draggingPreset, setDraggingPreset, editingNodePathId])

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
        case 'path':
          if (pathPoints && pathPoints.length > 0) {
            const d = `M ${pathPoints[0].x} ${pathPoints[0].y} ` + pathPoints.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ') + ` L ${currentX} ${currentY}`
            drawingPreview = <path d={d} fill="none" stroke="#e94560" strokeWidth={1.5 / zoom} pointerEvents="none" />
          }
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

        {orderedShapes.map((shape) => (
          <ShapeRenderer
            key={shape.id}
            shape={shape}
            isSelected={selectedIds.includes(shape.id)}
            onPointerDown={handleShapePointerDown}
            activeTool={activeTool}
            isEditing={editingTextId === shape.id}
          />
        ))}

        {drawingPreview}
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
          if (!pathShape || pathShape.type !== 'path' || !isSimplePath(pathShape.d)) return null
          const { points, closed } = parseSimplePath(pathShape.d)
          const r = 3 / zoom
          return (
            <g pointerEvents="all">
              {points.map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x} cy={pt.y} r={r}
                  fill="#fff"
                  stroke="#e94560"
                  strokeWidth={1 / zoom}
                  style={{ cursor: 'move' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    ;(e.currentTarget as SVGElement).closest('svg')?.parentElement?.setPointerCapture(e.pointerId)
                    nodeHandleDragRef.current = {
                      pathId: editingNodePathId,
                      pointIndex: i,
                      startX: pt.x,
                      startY: pt.y,
                      origPoints: points,
                      closed,
                    }
                  }}
                />
              ))}
            </g>
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
