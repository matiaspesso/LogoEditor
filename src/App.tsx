import React, { useEffect, useRef, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { SVGCanvas } from './components/canvas/SVGCanvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { LayersPanel } from './components/LayersPanel'
import { CodePanel } from './components/CodePanel'
import { ExportModal } from './components/ExportModal'
import { Rulers, RULER_SIZE_PX } from './components/canvas/Rulers'
import { useEditorStore } from './store/useEditorStore'

export default function App() {
  const { codePanelOpen, exportModalOpen, zoom, setZoom, panX, panY, setPan, layersPanelOpen, setLayersPanelOpen, canvasSize, clearCanvas } = useEditorStore()

  const fitView = () => {
    const toolbarW = 52
    const layersW = layersPanelOpen ? 180 : 0
    const propsW = 220
    const headerH = 40
    const statusH = 24
    const availW = window.innerWidth - toolbarW - layersW - propsW - 32
    const availH = window.innerHeight - headerH - statusH - 32
    const fitZoom = Math.min(availW / canvasSize.width, availH / canvasSize.height)
    useEditorStore.getState().setZoom(Math.max(0.5, fitZoom))
    useEditorStore.getState().setPan(0, 0)
  }

  // Load saved state or sample icon on first run
  useEffect(() => {
    const store = useEditorStore.getState()
    if (store.shapes.length === 0) {
      try {
        const saved = localStorage.getItem('iconforge-state')
        if (saved) {
          const { shapes, layerOrder, backgroundColor, canvasSize } = JSON.parse(saved)
          store.loadShapes(shapes, layerOrder)
          if (backgroundColor) store.setBackgroundColor(backgroundColor)
          if (canvasSize) store.setCanvasSize(canvasSize)
          return
        }
      } catch { /* corrupt data */ }
      // Default sample
      store.loadShapes([
        { id: 'bg', type: 'rect', x: 0, y: 0, width: 64, height: 64, rx: 12, fill: '#6c3ac4', fillOpacity: 1, stroke: 'none', strokeWidth: 0, strokeDasharray: '', strokeLinecap: 'round', opacity: 1, rotation: 0, locked: false, visible: true, name: 'Background' },
        { id: 's1', type: 'polygon', cx: 32, cy: 32, size: 22, sides: 5, innerRadius: 0.45, isStar: true, fill: '#f5c842', fillOpacity: 1, stroke: 'none', strokeWidth: 0, strokeDasharray: '', strokeLinecap: 'round', opacity: 1, rotation: 0, locked: false, visible: true, name: 'Star' },
      ], ['bg', 's1'])
    }
  }, [])

  // Zoom with mouse wheel
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.panel') || target.closest('.export-modal')) return
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        useEditorStore.getState().setZoom(zoom * delta)
      } else {
        useEditorStore.getState().setPan(panX - e.deltaX, panY - e.deltaY)
      }
    }
    window.addEventListener('wheel', handler, { passive: false })
    return () => window.removeEventListener('wheel', handler)
  }, [zoom, panX, panY])

  // Zoom keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setPan(0, 0)
        useEditorStore.getState().setZoom(6)
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        useEditorStore.getState().setZoom(zoom * 1.25)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        useEditorStore.getState().setZoom(zoom / 1.25)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        fitView()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [zoom, setPan, layersPanelOpen, canvasSize])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{
        height: 40,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        flexShrink: 0,
        zIndex: 10,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>
          <span style={{ color: 'var(--accent)' }}>Icon</span>Forge
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>SVG Icon Editor</span>

        <div style={{ flex: 1 }} />

        {/* Zoom display */}
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
          {Math.round(zoom * 100 / 6)}%
        </span>
        <button
          onClick={() => setLayersPanelOpen(!layersPanelOpen)}
          style={{ fontSize: 11, padding: '2px 8px', background: layersPanelOpen ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${layersPanelOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 4, color: layersPanelOpen ? 'var(--text)' : 'var(--text-dim)', cursor: 'pointer' }}
        >
          Layers
        </button>
        <button
          onClick={fitView}
          title="Fit canvas to view (Ctrl+1)"
          style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-dim)', cursor: 'pointer' }}
        >
          Fit
        </button>
        <button
          onClick={() => { useEditorStore.getState().setZoom(6); useEditorStore.getState().setPan(0, 0) }}
          title="Reset zoom to 100% (Ctrl+0)"
          style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-dim)', cursor: 'pointer' }}
        >
          1:1
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <button
          onClick={() => {
            if (window.confirm('¿Borrar todo el canvas y empezar de cero?')) clearCanvas()
          }}
          title="New canvas — delete all shapes"
          style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-dim)', cursor: 'pointer' }}
        >
          New
        </button>
      </header>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <Toolbar />

        {layersPanelOpen && <LayersPanel />}

        {/* Canvas area */}
        <CanvasArea />

        <PropertiesPanel />
      </div>

      {exportModalOpen && <ExportModal />}
    </div>
  )
}

function CanvasArea() {
  const { zoom, panX, panY, codePanelOpen } = useEditorStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <Rulers zoom={zoom} panX={panX} panY={panY} containerW={size.w} containerH={size.h} />
      <div style={{ position: 'absolute', inset: 0, top: RULER_SIZE_PX, left: RULER_SIZE_PX }}>
        <SVGCanvas />
      </div>
      {/* Status bar */}
      <div style={{
        position: 'absolute',
        bottom: codePanelOpen ? 240 : 0,
        left: 0, right: 0, height: 24,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 16,
        fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace',
      }}>
        <StatusBarContent />
      </div>
      {codePanelOpen && <CodePanel />}
    </div>
  )
}

function StatusBarContent() {
  const { shapes, selectedIds, canvasSize, zoom, activeTool } = useEditorStore()
  const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id))

  return (
    <>
      <span>Tool: <strong style={{ color: 'var(--text)' }}>{activeTool}</strong></span>
      <span>Canvas: {canvasSize.width}×{canvasSize.height}</span>
      <span>Shapes: {shapes.length}</span>
      {selectedShapes.length > 0 && (
        <span style={{ color: 'var(--accent)' }}>Selected: {selectedShapes.length}</span>
      )}
      <span>Zoom: {Math.round(zoom * 100 / 6)}%</span>
      <span style={{ marginLeft: 'auto' }}>Ctrl+C/V copy/paste · Ctrl+Z undo · Del delete · Ctrl+D dup · Ctrl+G group · Ctrl+1 fit · Ctrl+±/ zoom</span>
    </>
  )
}
