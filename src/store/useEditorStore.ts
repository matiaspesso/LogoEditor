import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { nanoid } from 'nanoid'
import type { Shape, ToolType, BBox } from '../types/shapes'
import type { ShapePreset } from '../data/shapePresets'
import { getShapeBBox, moveShape } from '../utils/geometry'
import { applyBooleanOp, type BooleanOpType } from '../utils/booleanOps'

export interface CanvasSize {
  width: number
  height: number
}

interface HistoryEntry {
  shapes: Shape[]
  layerOrder: string[]
}

interface DrawingState {
  isDrawing: boolean
  startX: number
  startY: number
  currentX: number
  currentY: number
  pathPoints?: { x: number; y: number }[]
}

interface DragState {
  type: 'move' | 'resize'
  handle?: string
  startX: number
  startY: number
  startShapes: Shape[]
  startBBox?: BBox
}

interface EditorState {
  shapes: Shape[]
  layerOrder: string[]
  selectedIds: string[]
  activeTool: ToolType
  canvasSize: CanvasSize
  gridSize: number
  gridEnabled: boolean
  snapEnabled: boolean
  zoom: number
  panX: number
  panY: number
  codePanelOpen: boolean
  exportModalOpen: boolean
  layersPanelOpen: boolean
  past: HistoryEntry[]
  future: HistoryEntry[]
  drawing: DrawingState | null
  drag: DragState | null
  editingTextId: string | null
  backgroundColor: string
  draggingPreset: ShapePreset | null

  // Actions
  addShape: (shape: Omit<Shape, 'id'>) => string
  updateShape: (id: string, partial: Partial<Shape>) => void
  deleteShapes: (ids: string[]) => void
  duplicateShapes: (ids: string[]) => void
  reorderLayer: (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => void
  setSelectedIds: (ids: string[]) => void
  selectShape: (id: string, additive?: boolean) => void
  clearSelection: () => void
  setActiveTool: (tool: ToolType) => void
  setCanvasSize: (size: CanvasSize) => void
  setGrid: (size: number, enabled: boolean) => void
  setSnap: (enabled: boolean) => void
  setZoom: (zoom: number) => void
  setPan: (x: number, y: number) => void
  setCodePanelOpen: (open: boolean) => void
  setExportModalOpen: (open: boolean) => void
  setLayersPanelOpen: (open: boolean) => void
  setDrawing: (state: DrawingState | null) => void
  setDrag: (state: DragState | null) => void
  setEditingTextId: (id: string | null) => void
  setBackgroundColor: (color: string) => void
  setDraggingPreset: (preset: ShapePreset | null) => void
  alignShapes: (type: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom' | 'distribute-h' | 'distribute-v') => void
  flipShapes: (ids: string[], axis: 'x' | 'y') => void
  booleanOp: (ids: string[], op: BooleanOpType) => void
  groupShapes: (ids: string[]) => void
  ungroupShapes: (ids: string[]) => void
  commit: () => void
  undo: () => void
  redo: () => void
  loadShapes: (shapes: Shape[], layerOrder: string[]) => void
}

export const useEditorStore = create<EditorState>()(
  immer((set, get) => ({
    shapes: [],
    layerOrder: [],
    selectedIds: [],
    activeTool: 'select',
    canvasSize: { width: 64, height: 64 },
    gridSize: 8,
    gridEnabled: true,
    snapEnabled: true,
    zoom: 6,
    panX: 0,
    panY: 0,
    codePanelOpen: false,
    exportModalOpen: false,
    layersPanelOpen: true,
    past: [],
    future: [],
    drawing: null,
    drag: null,
    editingTextId: null,
    backgroundColor: 'transparent',
    draggingPreset: null,

    addShape: (shapeData) => {
      const id = nanoid(8)
      set((s) => {
        const shape = { ...shapeData, id } as Shape
        s.shapes.push(shape)
        s.layerOrder.push(id)
        s.selectedIds = [id]
      })
      get().commit()
      return id
    },

    updateShape: (id, partial) => {
      set((s) => {
        const idx = s.shapes.findIndex((sh) => sh.id === id)
        if (idx !== -1) Object.assign(s.shapes[idx], partial)
      })
    },

    deleteShapes: (ids) => {
      set((s) => {
        s.shapes = s.shapes.filter((sh) => !ids.includes(sh.id))
        s.layerOrder = s.layerOrder.filter((id) => !ids.includes(id))
        s.selectedIds = s.selectedIds.filter((id) => !ids.includes(id))
      })
      get().commit()
    },

    duplicateShapes: (ids) => {
      set((s) => {
        const newIds: string[] = []
        ids.forEach((id) => {
          const shape = s.shapes.find((sh) => sh.id === id)
          if (!shape) return
          const newId = nanoid(8)
          const newShape = { ...shape, id: newId, name: shape.name + ' copy' } as Shape
          if ('x' in newShape && 'y' in newShape) {
            ;(newShape as any).x += 8
            ;(newShape as any).y += 8
          } else if ('cx' in newShape && 'cy' in newShape) {
            ;(newShape as any).cx += 8
            ;(newShape as any).cy += 8
          }
          s.shapes.push(newShape)
          const origIdx = s.layerOrder.indexOf(id)
          s.layerOrder.splice(origIdx + 1, 0, newId)
          newIds.push(newId)
        })
        s.selectedIds = newIds
      })
      get().commit()
    },

    reorderLayer: (id, direction) => {
      set((s) => {
        const idx = s.layerOrder.indexOf(id)
        if (idx === -1) return
        const len = s.layerOrder.length
        if (direction === 'up' && idx < len - 1) {
          ;[s.layerOrder[idx], s.layerOrder[idx + 1]] = [s.layerOrder[idx + 1], s.layerOrder[idx]]
        } else if (direction === 'down' && idx > 0) {
          ;[s.layerOrder[idx], s.layerOrder[idx - 1]] = [s.layerOrder[idx - 1], s.layerOrder[idx]]
        } else if (direction === 'top') {
          s.layerOrder.splice(idx, 1)
          s.layerOrder.push(id)
        } else if (direction === 'bottom') {
          s.layerOrder.splice(idx, 1)
          s.layerOrder.unshift(id)
        }
      })
      get().commit()
    },

    setSelectedIds: (ids) => set((s) => { s.selectedIds = ids }),
    selectShape: (id, additive = false) => {
      set((s) => {
        if (additive) {
          const i = s.selectedIds.indexOf(id)
          if (i === -1) s.selectedIds.push(id)
          else s.selectedIds.splice(i, 1)
        } else {
          s.selectedIds = [id]
        }
      })
    },
    clearSelection: () => set((s) => { s.selectedIds = [] }),
    setActiveTool: (tool) => set((s) => { s.activeTool = tool }),
    setCanvasSize: (size) => set((s) => { s.canvasSize = size }),
    setGrid: (size, enabled) => set((s) => { s.gridSize = size; s.gridEnabled = enabled }),
    setSnap: (enabled) => set((s) => { s.snapEnabled = enabled }),
    setZoom: (zoom) => set((s) => { s.zoom = Math.max(0.5, Math.min(50, zoom)) }),
    setPan: (x, y) => set((s) => { s.panX = x; s.panY = y }),
    setCodePanelOpen: (open) => set((s) => { s.codePanelOpen = open }),
    setExportModalOpen: (open) => set((s) => { s.exportModalOpen = open }),
    setLayersPanelOpen: (open) => set((s) => { s.layersPanelOpen = open }),
    setDrawing: (state) => set((s) => { s.drawing = state as any }),
    setDrag: (state) => set((s) => { s.drag = state as any }),
    setEditingTextId: (id) => set((s) => { s.editingTextId = id }),
    setBackgroundColor: (color) => set((s) => { s.backgroundColor = color }),
    setDraggingPreset: (preset) => set((s) => { s.draggingPreset = preset as any }),

    flipShapes: (ids, axis) => {
      set((s) => {
        ids.forEach((id) => {
          const shape = s.shapes.find((sh) => sh.id === id)
          if (!shape) return
          if (axis === 'x') shape.flipX = !shape.flipX
          else shape.flipY = !shape.flipY
        })
      })
      get().commit()
    },

    alignShapes: (type) => {
      const { shapes, selectedIds } = get()
      const selected = shapes.filter((s) => selectedIds.includes(s.id))
      if (selected.length < 2) return
      const bboxes = selected.map((s) => ({ shape: s, bbox: getShapeBBox(s) }))
      const minX = Math.min(...bboxes.map((b) => b.bbox.x))
      const maxX = Math.max(...bboxes.map((b) => b.bbox.x + b.bbox.width))
      const minY = Math.min(...bboxes.map((b) => b.bbox.y))
      const maxY = Math.max(...bboxes.map((b) => b.bbox.y + b.bbox.height))
      const selW = maxX - minX
      const selH = maxY - minY
      set((s) => {
        if (type === 'distribute-h') {
          const sorted = [...bboxes].sort((a, b) => a.bbox.x - b.bbox.x)
          const totalW = sorted.reduce((acc, b) => acc + b.bbox.width, 0)
          const spacing = (selW - totalW) / (sorted.length - 1)
          let curX = minX
          sorted.forEach((item) => {
            const dx = curX - item.bbox.x
            const delta = moveShape(item.shape, dx, 0)
            const idx = s.shapes.findIndex((sh) => sh.id === item.shape.id)
            if (idx !== -1) Object.assign(s.shapes[idx], delta)
            curX += item.bbox.width + spacing
          })
        } else if (type === 'distribute-v') {
          const sorted = [...bboxes].sort((a, b) => a.bbox.y - b.bbox.y)
          const totalH = sorted.reduce((acc, b) => acc + b.bbox.height, 0)
          const spacing = (selH - totalH) / (sorted.length - 1)
          let curY = minY
          sorted.forEach((item) => {
            const dy = curY - item.bbox.y
            const delta = moveShape(item.shape, 0, dy)
            const idx = s.shapes.findIndex((sh) => sh.id === item.shape.id)
            if (idx !== -1) Object.assign(s.shapes[idx], delta)
            curY += item.bbox.height + spacing
          })
        } else {
          bboxes.forEach((item) => {
            let dx = 0, dy = 0
            if (type === 'left') dx = minX - item.bbox.x
            else if (type === 'right') dx = (maxX - item.bbox.width) - item.bbox.x
            else if (type === 'center-h') dx = (minX + selW / 2 - item.bbox.width / 2) - item.bbox.x
            else if (type === 'top') dy = minY - item.bbox.y
            else if (type === 'bottom') dy = (maxY - item.bbox.height) - item.bbox.y
            else if (type === 'center-v') dy = (minY + selH / 2 - item.bbox.height / 2) - item.bbox.y
            const delta = moveShape(item.shape, dx, dy)
            const idx = s.shapes.findIndex((sh) => sh.id === item.shape.id)
            if (idx !== -1) Object.assign(s.shapes[idx], delta)
          })
        }
      })
      get().commit()
    },

    booleanOp: (ids, op) => {
      const { shapes, layerOrder } = get()
      // Use layer order (bottom → top) so "difference" subtracts higher layers from the lowest
      const ordered = layerOrder
        .filter((id) => ids.includes(id))
        .map((id) => shapes.find((s) => s.id === id))
        .filter((s): s is Shape => s !== undefined)
      if (ordered.length < 2) return
      const d = applyBooleanOp(ordered, op)
      if (!d) return
      // Base shape (bottom-most) provides fill/stroke/etc.
      const base = ordered[0]
      const newId = nanoid(8)
      const newShape: Shape = {
        ...base,
        id: newId,
        type: 'path',
        name: `${op.charAt(0).toUpperCase() + op.slice(1)} Path`,
        ...(base.type === 'path' ? {} : {}),
        d,
      } as any
      set((s) => {
        // Remove all input shapes
        s.shapes = s.shapes.filter((sh) => !ids.includes(sh.id))
        s.layerOrder = s.layerOrder.filter((id) => !ids.includes(id))
        // Insert result at position of the bottom-most shape
        s.shapes.push(newShape)
        s.layerOrder.push(newId)
        s.selectedIds = [newId]
      })
      get().commit()
    },

    groupShapes: (ids) => {
      if (ids.length < 2) return
      const groupId = nanoid(8)
      set((s) => {
        ids.forEach((id) => {
          const idx = s.shapes.findIndex((sh) => sh.id === id)
          if (idx !== -1) (s.shapes[idx] as any).groupId = groupId
        })
      })
      get().commit()
    },

    ungroupShapes: (ids) => {
      set((s) => {
        ids.forEach((id) => {
          const idx = s.shapes.findIndex((sh) => sh.id === id)
          if (idx !== -1) delete (s.shapes[idx] as any).groupId
        })
      })
      get().commit()
    },

    commit: () => {
      const { shapes, layerOrder, past, backgroundColor, canvasSize } = get()
      set((s) => {
        s.past = [...past.slice(-99), { shapes: JSON.parse(JSON.stringify(shapes)), layerOrder: [...layerOrder] }]
        s.future = []
      })
      // Auto-save to localStorage
      try {
        localStorage.setItem('iconforge-state', JSON.stringify({
          shapes: JSON.parse(JSON.stringify(shapes)),
          layerOrder: [...layerOrder],
          backgroundColor,
          canvasSize,
        }))
      } catch { /* storage quota exceeded or unavailable */ }
    },

    undo: () => {
      const { past, shapes, layerOrder } = get()
      if (past.length < 2) return
      set((s) => {
        const current = { shapes: JSON.parse(JSON.stringify(shapes)), layerOrder: [...layerOrder] }
        const prev = past[past.length - 2]
        s.future = [current, ...s.future.slice(0, 49)]
        s.past = past.slice(0, -1)
        s.shapes = prev.shapes
        s.layerOrder = prev.layerOrder
        s.selectedIds = []
      })
    },

    redo: () => {
      const { future, shapes, layerOrder } = get()
      if (future.length === 0) return
      set((s) => {
        const current = { shapes: JSON.parse(JSON.stringify(shapes)), layerOrder: [...layerOrder] }
        const next = future[0]
        s.past = [...s.past.slice(-99), current]
        s.future = future.slice(1)
        s.shapes = next.shapes
        s.layerOrder = next.layerOrder
        s.selectedIds = []
      })
    },

    loadShapes: (shapes, layerOrder) => {
      set((s) => {
        s.shapes = shapes
        s.layerOrder = layerOrder
        s.selectedIds = []
      })
      get().commit()
    },
  }))
)
