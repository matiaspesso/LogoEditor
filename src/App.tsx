import React, { useEffect } from 'react'
import { Toolbar } from './components/Toolbar'
import { SVGCanvas } from './components/canvas/SVGCanvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { LayersPanel } from './components/LayersPanel'
import { CodePanel } from './components/CodePanel'
import { ExportModal } from './components/ExportModal'
import { useEditorStore } from './store/useEditorStore'

export default function App() {
  const { codePanelOpen, exportModalOpen, zoom, setZoom, panX, panY, setPan, layersPanelOpen, setLayersPanelOpen } = useEditorStore()

  // Load a sample icon on first run
  useEffect(() => {
    const store = useEditorStore.getState()
    if (store.shapes.length === 0) {
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

  // Reset pan on double-click middle of canvas (spacebar + click)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setPan(0, 0)
        useEditorStore.getState().setZoom(6)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setPan])

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
          onClick={() => { useEditorStore.getState().setZoom(6); useEditorStore.getState().setPan(0, 0) }}
          style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-dim)', cursor: 'pointer' }}
        >
          Reset view
        </button>
      </header>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <Toolbar />

        {layersPanelOpen && <LayersPanel />}

        {/* Canvas area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <SVGCanvas />

          {/* Status bar */}
          <div style={{
            position: 'absolute',
            bottom: codePanelOpen ? 240 : 0,
            left: 0,
            right: 0,
            height: 24,
            background: 'var(--bg-panel)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: 16,
            fontSize: 10,
            color: 'var(--text-dim)',
            fontFamily: 'monospace',
          }}>
            <StatusBarContent />
          </div>

          {codePanelOpen && <CodePanel />}
        </div>

        <PropertiesPanel />
      </div>

      {exportModalOpen && <ExportModal />}
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
      <span style={{ marginLeft: 'auto' }}>Ctrl+C copy · Ctrl+V paste · Ctrl+Z undo · Del delete · Ctrl+D duplicate · P pen · double-click to close path</span>
    </>
  )
}
