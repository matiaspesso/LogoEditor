import React from 'react'
import { useEditorStore } from '../store/useEditorStore'
import type { ToolType } from '../types/shapes'
import { CANVAS_PRESETS } from '../types/shapes'
import { ShapesLibraryButton } from './ShapesLibrary'

const TOOLS: { id: ToolType; label: string; icon: string; shortcut?: string }[] = [
  { id: 'select', label: 'Select', icon: '↖', shortcut: 'V' },
  { id: 'rect', label: 'Rectangle', icon: '▭', shortcut: 'R' },
  { id: 'circle', label: 'Circle', icon: '○', shortcut: 'C' },
  { id: 'ellipse', label: 'Ellipse', icon: '⬭', shortcut: 'E' },
  { id: 'line', label: 'Line', icon: '╱', shortcut: 'L' },
  { id: 'path', label: 'Pen (Bezier)', icon: '✏', shortcut: 'P' },
  { id: 'pencil', label: 'Pencil (Freehand)', icon: '〜', shortcut: 'N' },
  { id: 'eraser', label: 'Eraser', icon: '◻', shortcut: 'X' },
  { id: 'text', label: 'Text', icon: 'T', shortcut: 'T' },
  { id: 'areatext', label: 'Area Text', icon: '☰', shortcut: 'A' },
  { id: 'polygon', label: 'Polygon', icon: '⬡', shortcut: 'G' },
  { id: 'star', label: 'Star', icon: '★', shortcut: 'S' },
  { id: 'frame', label: 'Frame', icon: '⬜', shortcut: 'F' },
  { id: 'eyedropper' as ToolType, label: 'Eyedropper', icon: '✦', shortcut: 'I' },
  { id: 'width' as ToolType, label: 'Width Tool', icon: '⇿', shortcut: 'W' },
]

export function Toolbar() {
  const { activeTool, setActiveTool, undo, redo, past, future, setExportModalOpen, setCodePanelOpen, codePanelOpen, canvasSize, setCanvasSize, zoom, setZoom } = useEditorStore()

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const tool = TOOLS.find((t) => t.shortcut?.toLowerCase() === e.key.toLowerCase())
      if (tool) setActiveTool(tool.id)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setActiveTool])

  return (
    <div className="panel flex flex-col h-full" style={{ width: 52, flexShrink: 0 }}>
      {/* Logo */}
      <div className="flex items-center justify-center" style={{ height: 48, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 20 }}>⬡</span>
      </div>

      {/* Tools */}
      <div className="flex flex-col items-center gap-1 p-1 flex-1">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
            onClick={() => setActiveTool(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
          >
            <span style={{ fontSize: 16 }}>{tool.icon}</span>
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Shape library */}
        <ShapesLibraryButton />

        <div style={{ height: 1, background: 'var(--border)', width: '80%', margin: '2px 0' }} />

        {/* Undo/Redo */}
        <button
          className="tool-btn"
          onClick={undo}
          disabled={past.length < 2}
          title="Undo (Ctrl+Z)"
          style={{ opacity: past.length < 2 ? 0.3 : 1 }}
        >
          ↩
        </button>
        <button
          className="tool-btn"
          onClick={redo}
          disabled={future.length === 0}
          title="Redo (Ctrl+Shift+Z)"
          style={{ opacity: future.length === 0 ? 0.3 : 1 }}
        >
          ↪
        </button>

        {/* Zoom */}
        <button className="tool-btn" onClick={() => setZoom(zoom * 1.2)} title="Zoom In (+)">+</button>
        <button className="tool-btn" onClick={() => setZoom(zoom / 1.2)} title="Zoom Out (-)">-</button>
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col items-center gap-1 p-1" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          className={`tool-btn ${codePanelOpen ? 'active' : ''}`}
          onClick={() => setCodePanelOpen(!codePanelOpen)}
          title="SVG Code"
          style={{ fontSize: 11, fontFamily: 'monospace' }}
        >
          {'</>'}
        </button>
        <button
          className="tool-btn"
          onClick={() => setExportModalOpen(true)}
          title="Export"
          style={{ fontSize: 14 }}
        >
          ↓
        </button>
      </div>

      {/* Canvas size selector */}
      <div className="flex flex-col items-center p-1" style={{ borderTop: '1px solid var(--border)' }}>
        <select
          className="input-field"
          style={{ fontSize: 9, padding: '2px 2px', width: 40 }}
          value={`${canvasSize.width}x${canvasSize.height}`}
          onChange={(e) => {
            const preset = CANVAS_PRESETS.find((p) => `${p.width}x${p.height}` === e.target.value)
            if (preset) setCanvasSize({ width: preset.width, height: preset.height })
          }}
        >
          {CANVAS_PRESETS.map((p) => (
            <option key={p.label} value={`${p.width}x${p.height}`}>{p.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
