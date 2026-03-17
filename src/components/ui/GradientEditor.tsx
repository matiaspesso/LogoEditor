import React, { useState, useRef } from 'react'
import type { GradientFill, GradientStop } from '../../types/shapes'
import { ColorPicker } from './ColorPicker'

interface Props {
  value: GradientFill | undefined
  onChange: (gradient: GradientFill | undefined) => void
}

const DEFAULT_GRADIENT: GradientFill = {
  type: 'linear',
  angle: 0,
  stops: [
    { offset: 0, color: '#e94560', opacity: 1 },
    { offset: 1, color: '#6c3ac4', opacity: 1 },
  ],
}

function gradientPreviewStyle(gf: GradientFill): React.CSSProperties {
  const stops = gf.stops
    .slice()
    .sort((a, b) => a.offset - b.offset)
    .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
    .join(', ')
  if (gf.type === 'linear') {
    return { background: `linear-gradient(${gf.angle}deg, ${stops})` }
  }
  return { background: `radial-gradient(circle, ${stops})` }
}

function StopRow({
  stop,
  index,
  onUpdate,
  onDelete,
  canDelete,
}: {
  stop: GradientStop
  index: number
  onUpdate: (i: number, s: GradientStop) => void
  onDelete: (i: number) => void
  canDelete: boolean
}) {
  const [colorOpen, setColorOpen] = useState(false)
  const swatchRef = useRef<HTMLButtonElement>(null)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
      {/* Color swatch */}
      <button
        ref={swatchRef}
        onClick={() => setColorOpen((o) => !o)}
        style={{
          width: 22,
          height: 20,
          borderRadius: 3,
          border: '1px solid var(--border)',
          background: stop.color,
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
        }}
      />
      {colorOpen && (
        <ColorPicker
          value={stop.color}
          onChange={(v) => onUpdate(index, { ...stop, color: v })}
          onClose={() => setColorOpen(false)}
          anchorRef={swatchRef}
        />
      )}
      {/* Offset slider */}
      <input
        type="range"
        min={0} max={100} step={1}
        value={Math.round(stop.offset * 100)}
        onChange={(e) => onUpdate(index, { ...stop, offset: parseInt(e.target.value) / 100 })}
        style={{ flex: 1 }}
      />
      <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 28, textAlign: 'right' }}>
        {Math.round(stop.offset * 100)}%
      </span>
      {canDelete && (
        <button
          className="icon-btn"
          onClick={() => onDelete(index)}
          style={{ fontSize: 10, color: 'var(--accent)' }}
          title="Remove stop"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export function GradientEditor({ value, onChange }: Props) {
  const isGradient = value !== undefined
  const gf = value ?? DEFAULT_GRADIENT

  function updateGf(patch: Partial<GradientFill>) {
    onChange({ ...gf, ...patch })
  }

  function updateStop(i: number, stop: GradientStop) {
    const stops = gf.stops.map((s, idx) => (idx === i ? stop : s))
    updateGf({ stops })
  }

  function deleteStop(i: number) {
    const stops = gf.stops.filter((_, idx) => idx !== i)
    updateGf({ stops })
  }

  function addStop() {
    const newStop: GradientStop = { offset: 0.5, color: '#ffffff', opacity: 1 }
    updateGf({ stops: [...gf.stops, newStop] })
  }

  return (
    <div style={{ marginTop: 6 }}>
      {/* Toggle solid/gradient */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button
          onClick={() => onChange(undefined)}
          style={{
            flex: 1,
            padding: '3px 0',
            borderRadius: 4,
            border: `1px solid ${!isGradient ? 'var(--accent)' : 'var(--border)'}`,
            background: !isGradient ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)',
            cursor: 'pointer',
            fontSize: 10,
            color: 'var(--text)',
          }}
        >
          Solid
        </button>
        <button
          onClick={() => onChange(DEFAULT_GRADIENT)}
          style={{
            flex: 1,
            padding: '3px 0',
            borderRadius: 4,
            border: `1px solid ${isGradient ? 'var(--accent)' : 'var(--border)'}`,
            background: isGradient ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)',
            cursor: 'pointer',
            fontSize: 10,
            color: 'var(--text)',
          }}
        >
          Gradient
        </button>
      </div>

      {isGradient && (
        <>
          {/* Gradient preview */}
          <div
            style={{
              height: 16,
              borderRadius: 4,
              border: '1px solid var(--border)',
              marginBottom: 8,
              ...gradientPreviewStyle(gf),
            }}
          />

          {/* Type selector */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {(['linear', 'radial'] as const).map((t) => (
              <button
                key={t}
                onClick={() => updateGf({ type: t })}
                style={{
                  flex: 1,
                  padding: '3px 0',
                  borderRadius: 4,
                  border: `1px solid ${gf.type === t ? 'var(--accent)' : 'var(--border)'}`,
                  background: gf.type === t ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  fontSize: 10,
                  color: 'var(--text)',
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Angle (linear only) */}
          {gf.type === 'linear' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 40, flexShrink: 0 }}>Angle</span>
              <input
                type="range"
                min={0} max={360} step={1}
                value={gf.angle}
                onChange={(e) => updateGf({ angle: parseInt(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 28, textAlign: 'right' }}>
                {gf.angle}°
              </span>
            </div>
          )}

          {/* Stops */}
          <div style={{ marginBottom: 4 }}>
            {gf.stops.map((stop, i) => (
              <StopRow
                key={i}
                stop={stop}
                index={i}
                onUpdate={updateStop}
                onDelete={deleteStop}
                canDelete={gf.stops.length > 2}
              />
            ))}
          </div>

          <button
            className="icon-btn"
            onClick={addStop}
            style={{ fontSize: 10, width: '100%', padding: '4px 0', border: '1px dashed var(--border)', borderRadius: 4 }}
          >
            + Add stop
          </button>
        </>
      )}
    </div>
  )
}
