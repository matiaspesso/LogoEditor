import React from 'react'
import type { BBox } from '../../types/shapes'

interface Props {
  bbox: BBox
  onHandlePointerDown: (e: React.PointerEvent, handle: string) => void
  zoom: number
}

const HANDLE_SIZE = 6
const HANDLES = [
  { id: 'nw', cx: 0, cy: 0, cursor: 'nw-resize' },
  { id: 'n',  cx: 0.5, cy: 0, cursor: 'n-resize' },
  { id: 'ne', cx: 1, cy: 0, cursor: 'ne-resize' },
  { id: 'e',  cx: 1, cy: 0.5, cursor: 'e-resize' },
  { id: 'se', cx: 1, cy: 1, cursor: 'se-resize' },
  { id: 's',  cx: 0.5, cy: 1, cursor: 's-resize' },
  { id: 'sw', cx: 0, cy: 1, cursor: 'sw-resize' },
  { id: 'w',  cx: 0, cy: 0.5, cursor: 'w-resize' },
]

export function SelectionOverlay({ bbox, onHandlePointerDown, zoom }: Props) {
  const { x, y, width, height } = bbox
  const hs = HANDLE_SIZE / zoom
  const pad = 2 / zoom

  return (
    <g pointerEvents="none">
      {/* Selection rectangle */}
      <rect
        x={x - pad} y={y - pad}
        width={width + pad * 2} height={height + pad * 2}
        fill="none"
        stroke="#e94560"
        strokeWidth={1 / zoom}
        strokeDasharray={`${4 / zoom} ${2 / zoom}`}
      />

      {/* Handles */}
      {HANDLES.map((h) => {
        const hx = x + h.cx * width
        const hy = y + h.cy * height
        return (
          <rect
            key={h.id}
            x={hx - hs / 2}
            y={hy - hs / 2}
            width={hs}
            height={hs}
            fill="white"
            stroke="#e94560"
            strokeWidth={1 / zoom}
            rx={1 / zoom}
            style={{ cursor: h.cursor, pointerEvents: 'all' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              onHandlePointerDown(e, h.id)
            }}
          />
        )
      })}

      {/* Rotation handle */}
      <line
        x1={x + width / 2} y1={y - pad}
        x2={x + width / 2} y2={y - 16 / zoom}
        stroke="#e94560"
        strokeWidth={1 / zoom}
      />
      <circle
        cx={x + width / 2}
        cy={y - 16 / zoom}
        r={hs / 2}
        fill="white"
        stroke="#e94560"
        strokeWidth={1 / zoom}
        style={{ cursor: 'grab', pointerEvents: 'all' }}
        onPointerDown={(e) => {
          e.stopPropagation()
          onHandlePointerDown(e, 'rotate')
        }}
      />
    </g>
  )
}
