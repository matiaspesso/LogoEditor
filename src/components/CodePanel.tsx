import React, { useState, useEffect } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { serializeSVG } from '../utils/svgSerializer'

export function CodePanel() {
  const { shapes, layerOrder, canvasSize, backgroundColor, setCodePanelOpen } = useEditorStore()
  const [copied, setCopied] = useState(false)

  const svgCode = serializeSVG(shapes, layerOrder, canvasSize, backgroundColor)

  const handleCopy = () => {
    navigator.clipboard.writeText(svgCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 52,
        right: 220,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        height: 240,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-dim)' }}>SVG CODE</span>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            style={{
              fontSize: 11,
              padding: '2px 10px',
              background: copied ? '#2a5' : 'rgba(255,255,255,0.1)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
          <button
            onClick={() => setCodePanelOpen(false)}
            className="icon-btn"
            style={{ fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      </div>
      <pre
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 12,
          fontSize: 11,
          fontFamily: 'monospace',
          lineHeight: 1.6,
          color: '#e8e8e8',
          margin: 0,
          background: 'transparent',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {svgCode}
      </pre>
    </div>
  )
}
