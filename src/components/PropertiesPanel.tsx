import React, { useState, useRef } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import type { Shape } from '../types/shapes'
import { ColorPicker } from './ui/ColorPicker'
import { AlignBar } from './ui/AlignBar'
import { GradientEditor } from './ui/GradientEditor'
import { importSVGString } from '../utils/svgImporter'

const DASH_PRESETS = [
  { label: 'Solid',   value: '' },
  { label: 'Dashed',  value: '6 4' },
  { label: 'Dotted',  value: '2 4' },
  { label: 'Dot-dash',value: '8 4 2 4' },
]

function ColorInput({ label, value, onChange, onCommit }: {
  label: string; value: string
  onChange: (v: string) => void
  onCommit?: () => void
}) {
  const [open, setOpen] = useState(false)
  const swatchRef = useRef<HTMLButtonElement>(null)

  const isNone = value === 'none'
  const swatchBg = isNone
    ? 'repeating-conic-gradient(#888 0% 25%, transparent 0% 50%)'
    : value

  return (
    <div className="flex items-center gap-2 mb-2" style={{ position: 'relative' }}>
      <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>{label}</span>
      <div className="flex items-center gap-1 flex-1">
        <button
          ref={swatchRef}
          onClick={() => setOpen((o) => !o)}
          title="Pick color"
          style={{
            width: 28,
            height: 24,
            borderRadius: 4,
            border: '1px solid var(--border)',
            cursor: 'pointer',
            padding: 0,
            background: swatchBg,
            backgroundSize: '6px 6px',
            flexShrink: 0,
          }}
        />
        {open && (
          <ColorPicker
            value={value}
            onChange={onChange}
            onCommit={onCommit}
            onClose={() => setOpen(false)}
            anchorRef={swatchRef}
          />
        )}
        <input
          type="text"
          className="input-field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          style={{ flex: 1 }}
        />
        <button
          className="icon-btn"
          onClick={() => { onChange('none'); onCommit?.() }}
          title="No fill"
          style={{ fontSize: 12, color: isNone ? 'var(--accent)' : undefined }}
        >
          ∅
        </button>
      </div>
    </div>
  )
}

function NumInput({ label, value, onChange, min, max, step = 1, unit = '' }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string
}) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>{label}</span>
      <div className="flex items-center gap-1 flex-1">
        <input
          type="number"
          className="input-field"
          value={Math.round(value * 100) / 100}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          style={{ flex: 1 }}
        />
        {unit && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{unit}</span>}
      </div>
    </div>
  )
}

function ShapeProperties({ shape }: { shape: Shape }) {
  const store = useEditorStore()
  const { updateShape, commit, reorderLayer, flipShapes } = store

  const update = (partial: Partial<Shape>) => {
    updateShape(shape.id, partial)
    commit()
  }

  // For color inputs: live update without committing, commit only on drag end
  const updateColor = (partial: Partial<Shape>) => updateShape(shape.id, partial)

  return (
    <div>
      {/* Name */}
      <div className="panel-section">
        <div className="panel-label">Name</div>
        <input
          className="input-field"
          value={shape.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>

      {/* Geometry */}
      <div className="panel-section">
        <div className="panel-label">Transform</div>
        {shape.type === 'rect' && (
          <>
            <NumInput label="X" value={shape.x} onChange={(v) => update({ x: v } as any)} />
            <NumInput label="Y" value={shape.y} onChange={(v) => update({ y: v } as any)} />
            <NumInput label="W" value={shape.width} onChange={(v) => update({ width: Math.max(1, v) } as any)} min={1} />
            <NumInput label="H" value={shape.height} onChange={(v) => update({ height: Math.max(1, v) } as any)} min={1} />
            <NumInput label="Rx" value={shape.rx} onChange={(v) => update({ rx: v } as any)} min={0} />
          </>
        )}
        {shape.type === 'circle' && (
          <>
            <NumInput label="CX" value={shape.cx} onChange={(v) => update({ cx: v } as any)} />
            <NumInput label="CY" value={shape.cy} onChange={(v) => update({ cy: v } as any)} />
            <NumInput label="R" value={shape.r} onChange={(v) => update({ r: Math.max(1, v) } as any)} min={1} />
          </>
        )}
        {shape.type === 'ellipse' && (
          <>
            <NumInput label="CX" value={shape.cx} onChange={(v) => update({ cx: v } as any)} />
            <NumInput label="CY" value={shape.cy} onChange={(v) => update({ cy: v } as any)} />
            <NumInput label="RX" value={shape.rx} onChange={(v) => update({ rx: Math.max(1, v) } as any)} min={1} />
            <NumInput label="RY" value={shape.ry} onChange={(v) => update({ ry: Math.max(1, v) } as any)} min={1} />
          </>
        )}
        {shape.type === 'line' && (
          <>
            <NumInput label="X1" value={shape.x1} onChange={(v) => update({ x1: v } as any)} />
            <NumInput label="Y1" value={shape.y1} onChange={(v) => update({ y1: v } as any)} />
            <NumInput label="X2" value={shape.x2} onChange={(v) => update({ x2: v } as any)} />
            <NumInput label="Y2" value={shape.y2} onChange={(v) => update({ y2: v } as any)} />
          </>
        )}
        {shape.type === 'text' && (
          <>
            <NumInput label="X" value={shape.x} onChange={(v) => update({ x: v } as any)} />
            <NumInput label="Y" value={shape.y} onChange={(v) => update({ y: v } as any)} />
            <NumInput label="Size" value={shape.fontSize} onChange={(v) => update({ fontSize: Math.max(1, v) } as any)} min={1} />
          </>
        )}
        {shape.type === 'polygon' && (
          <>
            <NumInput label="CX" value={shape.cx} onChange={(v) => update({ cx: v } as any)} />
            <NumInput label="CY" value={shape.cy} onChange={(v) => update({ cy: v } as any)} />
            <NumInput label="Size" value={shape.size} onChange={(v) => update({ size: Math.max(1, v) } as any)} min={1} />
            <NumInput label="Sides" value={shape.sides} onChange={(v) => update({ sides: Math.max(3, Math.round(v)) } as any)} min={3} max={12} step={1} />
            {shape.isStar && (
              <NumInput label="Inner" value={shape.innerRadius} onChange={(v) => update({ innerRadius: Math.max(0.1, Math.min(0.9, v)) } as any)} min={0.1} max={0.9} step={0.05} />
            )}
          </>
        )}
        <NumInput label="Rotate" value={shape.rotation} onChange={(v) => update({ rotation: v })} unit="°" />

        {/* Flip & layer order buttons */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            className="icon-btn"
            onClick={() => flipShapes([shape.id], 'x')}
            title="Flip horizontal"
            style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, flex: 1 }}
          >
            ⇆ Flip H
          </button>
          <button
            className="icon-btn"
            onClick={() => flipShapes([shape.id], 'y')}
            title="Flip vertical"
            style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, flex: 1 }}
          >
            ⇅ Flip V
          </button>
          <button
            className="icon-btn"
            onClick={() => reorderLayer(shape.id, 'top')}
            title="Bring to front"
            style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, flex: 1 }}
          >
            ↑ Front
          </button>
          <button
            className="icon-btn"
            onClick={() => reorderLayer(shape.id, 'bottom')}
            title="Send to back"
            style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, flex: 1 }}
          >
            ↓ Back
          </button>
        </div>
      </div>

      {/* Fill */}
      <div className="panel-section">
        <div className="panel-label">Fill</div>
        <ColorInput label="Color" value={shape.fill} onChange={(v) => updateColor({ fill: v })} onCommit={commit} />
        <NumInput label="Opacity" value={shape.fillOpacity} onChange={(v) => update({ fillOpacity: Math.max(0, Math.min(1, v)) })} min={0} max={1} step={0.05} />
        <GradientEditor
          value={shape.gradientFill}
          onChange={(gf) => update({ gradientFill: gf } as any)}
        />
      </div>

      {/* Stroke */}
      <div className="panel-section">
        <div className="panel-label">Stroke</div>
        <ColorInput
          label="Color"
          value={shape.stroke}
          onChange={(v) => {
            const patch: any = { stroke: v }
            if (v !== 'none' && (!shape.strokeWidth || shape.strokeWidth === 0)) patch.strokeWidth = 1
            updateColor(patch)
          }}
          onCommit={commit}
        />
        <NumInput label="Width" value={shape.strokeWidth} onChange={(v) => update({ strokeWidth: Math.max(0, v) })} min={0} step={0.5} />

        {/* Dash style */}
        <div className="flex items-center gap-2 mb-1" style={{ marginTop: 6 }}>
          <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>Style</span>
          <div style={{ display: 'flex', gap: 4, flex: 1 }}>
            {DASH_PRESETS.map((preset) => (
              <button
                key={preset.label}
                title={preset.label}
                onClick={() => update({ strokeDasharray: preset.value } as any)}
                style={{
                  flex: 1,
                  height: 28,
                  borderRadius: 5,
                  border: `1px solid ${(shape.strokeDasharray ?? '') === preset.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: (shape.strokeDasharray ?? '') === preset.value ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}
              >
                <svg width="100%" height="6" viewBox="0 0 32 6">
                  <line
                    x1="1" y1="3" x2="31" y2="3"
                    stroke="var(--text)"
                    strokeWidth="2"
                    strokeDasharray={preset.value || undefined}
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>

        {/* Linecap */}
        <div className="flex items-center gap-2 mb-1">
          <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>Caps</span>
          <div style={{ display: 'flex', gap: 4, flex: 1 }}>
            {(['butt', 'round', 'square'] as const).map((cap) => (
              <button
                key={cap}
                title={cap}
                onClick={() => update({ strokeLinecap: cap } as any)}
                style={{
                  flex: 1,
                  padding: '3px 0',
                  borderRadius: 5,
                  border: `1px solid ${(shape.strokeLinecap || 'round') === cap ? 'var(--accent)' : 'var(--border)'}`,
                  background: (shape.strokeLinecap || 'round') === cap ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  fontSize: 9,
                  color: 'var(--text-dim)',
                }}
              >
                {cap}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Opacity */}
      <div className="panel-section">
        <div className="panel-label">Layer</div>
        <NumInput label="Opacity" value={shape.opacity} onChange={(v) => update({ opacity: Math.max(0, Math.min(1, v)) })} min={0} max={1} step={0.05} />
      </div>

      {/* Text content */}
      {shape.type === 'text' && (
        <div className="panel-section">
          <div className="panel-label">Text</div>
          <textarea
            className="input-field"
            value={shape.text}
            onChange={(e) => update({ text: e.target.value } as any)}
            rows={2}
            style={{ resize: 'vertical' }}
          />
          <div style={{ marginTop: 6 }}>
            <select className="input-field" value={shape.fontFamily} onChange={(e) => update({ fontFamily: e.target.value } as any)}>
              <option>sans-serif</option>
              <option>serif</option>
              <option>monospace</option>
              <option>Arial</option>
              <option>Georgia</option>
              <option>Verdana</option>
            </select>
          </div>
          <div style={{ marginTop: 4 }}>
            <select className="input-field" value={shape.fontWeight} onChange={(e) => update({ fontWeight: e.target.value } as any)}>
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
              <option value="300">Light</option>
              <option value="900">Black</option>
            </select>
          </div>
          <div style={{ marginTop: 4 }}>
            <select className="input-field" value={shape.textAnchor} onChange={(e) => update({ textAnchor: e.target.value as any })}>
              <option value="start">Left</option>
              <option value="middle">Center</option>
              <option value="end">Right</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

function BackgroundColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const swatchRef = useRef<HTMLButtonElement>(null)
  const isTransparent = value === 'transparent'
  return (
    <div className="flex items-center gap-2" style={{ position: 'relative' }}>
      <button
        ref={swatchRef}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 28, height: 24, borderRadius: 4, border: '1px solid var(--border)',
          cursor: 'pointer', padding: 0,
          background: isTransparent ? 'repeating-conic-gradient(#888 0% 25%, transparent 0% 50%)' : value,
          backgroundSize: '6px 6px', flexShrink: 0,
        }}
      />
      {open && (
        <ColorPicker
          value={value === 'transparent' ? '#ffffff' : value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          anchorRef={swatchRef}
        />
      )}
      <input
        type="text"
        className="input-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1 }}
      />
      <button className="icon-btn" onClick={() => onChange('transparent')} title="Transparent"
        style={{ fontSize: 12, color: isTransparent ? 'var(--accent)' : undefined }}>∅</button>
    </div>
  )
}

const BOOL_OPS = [
  { op: 'union',        label: 'Union',     title: 'Merge all shapes into one', icon: '⊕' },
  { op: 'difference',   label: 'Subtract',  title: 'Subtract upper layers from bottom shape', icon: '⊖' },
  { op: 'intersection', label: 'Intersect', title: 'Keep only overlapping area', icon: '⊗' },
  { op: 'xor',          label: 'Exclude',   title: 'Keep non-overlapping areas only', icon: '⊘' },
] as const

function MultiSelectPanel({ selectedShapes, selectedIds }: { selectedShapes: Shape[]; selectedIds: string[] }) {
  const store = useEditorStore()
  const { updateShape, commit, alignShapes } = store

  function updateAll(partial: Partial<Shape>) {
    selectedIds.forEach((id) => updateShape(id, partial))
    commit()
  }

  function updateAllLive(partial: Partial<Shape>) {
    selectedIds.forEach((id) => updateShape(id, partial))
  }

  const firstFill = selectedShapes[0]?.fill ?? '#e94560'
  const firstStroke = selectedShapes[0]?.stroke ?? 'none'
  const firstStrokeWidth = selectedShapes[0]?.strokeWidth ?? 1

  return (
    <div className="panel-section">
      <div className="panel-label">Multiple Selection</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>{selectedShapes.length} shapes selected</div>

      {/* Align bar */}
      <div className="panel-label" style={{ marginBottom: 4 }}>Align</div>
      <AlignBar
        onAlign={(type) => alignShapes(type as any)}
        canDistribute={selectedShapes.length >= 3}
      />

      {/* Shared fill/stroke */}
      <div className="panel-label" style={{ marginBottom: 4 }}>Fill & Stroke</div>
      <ColorInput label="Fill" value={firstFill} onChange={(v) => updateAllLive({ fill: v })} onCommit={commit} />
      <ColorInput label="Stroke" value={firstStroke} onChange={(v) => updateAllLive({ stroke: v })} onCommit={commit} />
      <NumInput label="S.Width" value={firstStrokeWidth} onChange={(v) => updateAll({ strokeWidth: Math.max(0, v) })} min={0} step={0.5} />

      {/* Boolean operations */}
      <div className="panel-label" style={{ marginBottom: 4, marginTop: 8 }}>Boolean Ops</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
        {BOOL_OPS.map(({ op, label, title, icon }) => (
          <button
            key={op}
            title={title}
            onClick={() => store.booleanOp(selectedIds, op)}
            style={{
              padding: '5px 4px',
              borderRadius: 5,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.04)',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8, lineHeight: 1.4 }}>
        Subtract: bottom shape minus upper layers
      </div>

      <div>
        <button
          className="input-field"
          style={{ cursor: 'pointer', textAlign: 'center', padding: '6px', color: 'var(--accent)' }}
          onClick={() => store.deleteShapes(selectedIds)}
        >
          Delete all
        </button>
      </div>
    </div>
  )
}

export function PropertiesPanel() {
  const { shapes, selectedIds, canvasSize, setCanvasSize, backgroundColor, setBackgroundColor, gridEnabled, gridSize, setGrid, snapEnabled, setSnap, addShape } = useEditorStore()
  const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id))
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleImportSVG(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (!text) return
      const imported = importSVGString(text, canvasSize)
      imported.forEach((shape) => addShape(shape as any))
    }
    reader.readAsText(file)
    // Reset so same file can be imported again
    e.target.value = ''
  }

  return (
    <div className="panel h-full overflow-y-auto" style={{ width: 220, flexShrink: 0, borderLeft: '1px solid var(--border)', borderRight: 'none' }}>
      {selectedShapes.length === 0 ? (
        // Canvas properties
        <div>
          <div className="panel-section">
            <div className="panel-label">Canvas</div>
            <div className="flex gap-1 mb-2">
              <div className="flex-1">
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>W</div>
                <input
                  type="number"
                  className="input-field"
                  value={canvasSize.width}
                  onChange={(e) => setCanvasSize({ ...canvasSize, width: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              </div>
              <div className="flex-1">
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>H</div>
                <input
                  type="number"
                  className="input-field"
                  value={canvasSize.height}
                  onChange={(e) => setCanvasSize({ ...canvasSize, height: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              </div>
            </div>
            <div className="panel-label">Background</div>
            <BackgroundColorInput value={backgroundColor} onChange={setBackgroundColor} />
          </div>
          <div className="panel-section">
            <div className="panel-label">Grid</div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={gridEnabled}
                onChange={(e) => setGrid(gridSize, e.target.checked)}
                id="grid-toggle"
              />
              <label htmlFor="grid-toggle" style={{ fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer' }}>Show grid</label>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={snapEnabled}
                onChange={(e) => setSnap(e.target.checked)}
                id="snap-toggle"
              />
              <label htmlFor="snap-toggle" style={{ fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer' }}>Snap to grid</label>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 48 }}>Size</span>
              <input
                type="number"
                className="input-field"
                value={gridSize}
                min={1}
                max={64}
                onChange={(e) => setGrid(Math.max(1, parseInt(e.target.value) || 1), gridEnabled)}
              />
            </div>
          </div>

          {/* Import SVG */}
          <div className="panel-section">
            <div className="panel-label">Import SVG</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg,image/svg+xml"
              style={{ display: 'none' }}
              onChange={handleImportSVG}
            />
            <button
              className="input-field"
              style={{ cursor: 'pointer', textAlign: 'center', padding: '6px' }}
              onClick={() => fileInputRef.current?.click()}
            >
              Open SVG file…
            </button>
          </div>

          <div className="panel-section">
            <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
              Select a shape to edit its properties.
              <br /><br />
              <strong style={{ color: 'var(--text)' }}>Shortcuts:</strong><br />
              V — Select<br />
              R — Rectangle<br />
              C — Circle<br />
              E — Ellipse<br />
              L — Line<br />
              P — Pen<br />
              T — Text<br />
              G — Polygon<br />
              S — Star<br />
              Del — Delete<br />
              Ctrl+Z — Undo<br />
              Ctrl+D — Duplicate<br />
              Ctrl+A — Select all<br />
              ↑↓←→ — Move 1px<br />
              Shift+Arrow — Move 10px<br />
              Ctrl+] / [ — Layer order<br />
              Esc — Clear selection
            </div>
          </div>
        </div>
      ) : selectedShapes.length === 1 ? (
        <ShapeProperties shape={selectedShapes[0]} />
      ) : (
        <MultiSelectPanel selectedShapes={selectedShapes} selectedIds={selectedIds} />
      )}
    </div>
  )
}
