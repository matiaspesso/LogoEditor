import React, { useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { serializeSVG, exportPNG, downloadBlob } from '../utils/svgSerializer'
import { EXPORT_SIZES } from '../types/shapes'

export function ExportModal() {
  const { shapes, layerOrder, canvasSize, backgroundColor, setExportModalOpen } = useEditorStore()
  const [selectedSizes, setSelectedSizes] = useState<number[]>([32, 64, 128, 256, 512])
  const [exporting, setExporting] = useState(false)
  const [filename, setFilename] = useState('icon')

  const svgCode = serializeSVG(shapes, layerOrder, canvasSize, backgroundColor)

  const toggleSize = (size: number) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    )
  }

  const handleExportSVG = () => {
    const blob = new Blob([svgCode], { type: 'image/svg+xml' })
    downloadBlob(blob, `${filename}.svg`)
  }

  const handleExportPNGs = async () => {
    setExporting(true)
    try {
      for (const size of selectedSizes.sort((a, b) => a - b)) {
        const blob = await exportPNG(svgCode, size)
        downloadBlob(blob, `${filename}-${size}x${size}.png`)
        // Small delay between downloads
        await new Promise((r) => setTimeout(r, 100))
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setExportModalOpen(false)
      }}
    >
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: 480,
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Export Icon</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              Canvas: {canvasSize.width}×{canvasSize.height}px
            </div>
          </div>
          <button className="icon-btn" onClick={() => setExportModalOpen(false)} style={{ fontSize: 18 }}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Preview */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 20,
              gap: 12,
            }}
          >
            {[16, 32, 64, 128].map((size) => (
              <div key={size} style={{ textAlign: 'center' }}>
                <div
                  className="checkerboard"
                  style={{
                    width: Math.min(size, 80),
                    height: Math.min(size, 80),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={`data:image/svg+xml;base64,${btoa(svgCode)}`}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    alt={`${size}px preview`}
                  />
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>{size}px</div>
              </div>
            ))}
          </div>

          {/* Filename */}
          <div style={{ marginBottom: 16 }}>
            <div className="panel-label">Filename</div>
            <input
              type="text"
              className="input-field"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="icon"
            />
          </div>

          {/* SVG Export */}
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>SVG</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Scalable vector, best quality</div>
              </div>
              <button
                onClick={handleExportSVG}
                style={{
                  padding: '8px 20px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Download SVG
              </button>
            </div>
          </div>

          {/* PNG Export */}
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>PNG</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
              Rasterized at specific sizes
            </div>

            {/* Size checkboxes */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {EXPORT_SIZES.map((size) => (
                <label
                  key={size}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    background: selectedSizes.includes(size) ? 'rgba(233,69,96,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${selectedSizes.includes(size) ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedSizes.includes(size)}
                    onChange={() => toggleSize(size)}
                    style={{ display: 'none' }}
                  />
                  {size}×{size}
                </label>
              ))}
            </div>

            <button
              onClick={handleExportPNGs}
              disabled={exporting || selectedSizes.length === 0}
              style={{
                width: '100%',
                padding: '10px',
                background: exporting ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.1)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                cursor: exporting || selectedSizes.length === 0 ? 'not-allowed' : 'pointer',
                opacity: selectedSizes.length === 0 ? 0.5 : 1,
              }}
            >
              {exporting ? 'Exporting...' : `Download ${selectedSizes.length} PNG${selectedSizes.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
