import React, { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { SHAPE_PRESETS, PRESET_CATEGORIES, type ShapePreset } from '../data/shapePresets'

const DRAG_THRESHOLD = 6 // px before treating pointer move as a drag

export function ShapesLibraryButton() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`tool-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Shape Library"
        style={{ fontSize: 18 }}
      >
        ⬠
      </button>
      {open && <ShapesLibraryPanel onClose={() => setOpen(false)} />}
    </div>
  )
}

function ShapesLibraryPanel({ onClose }: { onClose: () => void }) {
  const [activeCategory, setActiveCategory] = useState(PRESET_CATEGORIES[0])
  const { setDraggingPreset } = useEditorStore()

  const filtered = SHAPE_PRESETS.filter((p) => p.category === activeCategory)

  function handlePresetDragStart(e: React.PointerEvent, preset: ShapePreset) {
    setDraggingPreset(preset)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: 60,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 280,
        maxHeight: '70vh',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Shape Library</span>
        <button className="icon-btn" onClick={onClose} style={{ fontSize: 14 }}>✕</button>
      </div>

      {/* Category tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {PRESET_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '3px 10px',
              borderRadius: 20,
              border: 'none',
              fontSize: 11,
              cursor: 'pointer',
              background: activeCategory === cat ? 'var(--accent)' : 'rgba(255,255,255,0.07)',
              color: activeCategory === cat ? 'white' : 'var(--text-dim)',
              fontWeight: activeCategory === cat ? 600 : 400,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid of presets */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8,
        padding: 10,
        overflowY: 'auto',
      }}>
        {filtered.map((preset) => (
          <PresetItem
            key={preset.id}
            preset={preset}
            onDragStart={handlePresetDragStart}
            onClose={onClose}
          />
        ))}
      </div>

      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)' }}>
        Drag to canvas or click to add to center
      </div>
    </div>
  )
}

function PresetItem({
  preset,
  onDragStart,
  onClose,
}: {
  preset: ShapePreset
  onDragStart: (e: React.PointerEvent, preset: ShapePreset) => void
  onClose: () => void
}) {
  const { addShape, canvasSize } = useEditorStore()
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const draggedRef = useRef(false)

  function handlePointerDown(e: React.PointerEvent) {
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    draggedRef.current = false
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointerStartRef.current || draggedRef.current) return
    const dx = e.clientX - pointerStartRef.current.x
    const dy = e.clientY - pointerStartRef.current.y
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      draggedRef.current = true
      onDragStart(e, preset) // sets draggingPreset + closes panel
    }
  }

  function handlePointerUp() {
    if (!draggedRef.current) {
      // Click: add to canvas center
      const cx = canvasSize.width / 2
      const cy = canvasSize.height / 2
      const size = Math.min(canvasSize.width, canvasSize.height) * 0.3
      addShape(preset.create(cx, cy, size) as any)
      onClose()
    }
    pointerStartRef.current = null
    draggedRef.current = false
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        cursor: 'grab',
        userSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title={`${preset.name} — drag to canvas or click to add`}
    >
      <div
        style={{
          width: 52,
          height: 52,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLElement).style.background = 'rgba(233,69,96,0.15)'
          ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
          ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
        }}
      >
        <svg
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          style={{ color: '#e94560' }}
          dangerouslySetInnerHTML={{ __html: preset.preview }}
        />
      </div>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.2 }}>
        {preset.name}
      </span>
    </div>
  )
}
