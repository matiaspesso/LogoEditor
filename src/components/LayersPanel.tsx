import React from 'react'
import { useEditorStore } from '../store/useEditorStore'
import type { Shape } from '../types/shapes'

function shapeIcon(type: Shape['type']) {
  switch (type) {
    case 'rect': return '▭'
    case 'circle': return '○'
    case 'ellipse': return '⬭'
    case 'line': return '╱'
    case 'path': return '✏'
    case 'text': return 'T'
    case 'polygon': return '⬡'
    default: return '◻'
  }
}

export function LayersPanel() {
  const { shapes, layerOrder, selectedIds, selectShape, reorderLayer, deleteShapes, duplicateShapes, updateShape, commit } = useEditorStore()

  // Reverse for display (top = front)
  const displayOrder = [...layerOrder].reverse()

  return (
    <div className="panel h-full overflow-y-auto" style={{ width: 180, flexShrink: 0 }}>
      <div style={{ padding: '8px 8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <span className="panel-label" style={{ margin: 0 }}>Layers</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{shapes.length}</span>
      </div>

      <div style={{ padding: 4 }}>
        {displayOrder.map((id) => {
          const shape = shapes.find((s) => s.id === id)
          if (!shape) return null
          const isSelected = selectedIds.includes(id)

          return (
            <div
              key={id}
              className={`layer-item ${isSelected ? 'selected' : ''}`}
              onClick={(e) => selectShape(id, e.shiftKey)}
              style={{ opacity: shape.locked ? 0.6 : 1 }}
            >
              {/* Visibility toggle */}
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  updateShape(id, { visible: !shape.visible })
                  commit()
                }}
                title={shape.visible ? 'Hide' : 'Show'}
                style={{ opacity: shape.visible ? 1 : 0.3, fontSize: 12 }}
              >
                {shape.visible ? '👁' : '○'}
              </button>

              {/* Lock toggle */}
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  updateShape(id, { locked: !shape.locked })
                  commit()
                }}
                title={shape.locked ? 'Unlock' : 'Lock'}
                style={{ fontSize: 11, color: shape.locked ? 'var(--accent)' : undefined }}
              >
                {shape.locked ? '🔒' : '🔓'}
              </button>

              {/* Icon */}
              <span style={{ fontSize: 12, flexShrink: 0 }}>{shapeIcon(shape.type)}</span>

              {/* Name */}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                {shape.name}
              </span>

              {/* Actions */}
              {isSelected && (
                <div className="flex gap-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn"
                    onClick={() => reorderLayer(id, 'up')}
                    title="Move up"
                    style={{ fontSize: 10 }}
                  >
                    ↑
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => reorderLayer(id, 'down')}
                    title="Move down"
                    style={{ fontSize: 10 }}
                  >
                    ↓
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => duplicateShapes([id])}
                    title="Duplicate"
                    style={{ fontSize: 10 }}
                  >
                    ⧉
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => deleteShapes([id])}
                    title="Delete"
                    style={{ fontSize: 10, color: 'var(--accent)' }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {shapes.length === 0 && (
          <div style={{ padding: '12px 8px', fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.5 }}>
            No shapes yet.<br />
            Select a tool and draw.
          </div>
        )}
      </div>
    </div>
  )
}
