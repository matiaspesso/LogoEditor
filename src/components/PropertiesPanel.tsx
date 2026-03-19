import React, { useState, useRef } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import type { Shape, DropShadow, BlurEffect, InnerShadow, GlowEffect, ShapeFilters, TextShape, PatternFill, BlendShape } from '../types/shapes'
import type { BrushDef } from '../utils/brushPath'
import { ColorPicker } from './ui/ColorPicker'
import { AlignBar } from './ui/AlignBar'
import { GradientEditor } from './ui/GradientEditor'
import { importSVGString } from '../utils/svgImporter'
import { textToPath } from '../utils/textToPath'
import { outlineStroke } from '../utils/outlineStroke'
import { offsetShape } from '../utils/offsetPath'
import { simplifyPath } from '../utils/simplifyPath'
import { parseBezierPath, serializeBezierPath, applyAutoSmooth, autoSmoothNode, isBezierPath, type NodeType } from '../utils/bezierPathUtils'

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

function SliderRow({ label, value, onChange, min = 0, max = 1, step = 0.01 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--accent)' }}
      />
      <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 28, textAlign: 'right' }}>
        {Math.round(value * 100) / 100}
      </span>
    </div>
  )
}

const DEFAULT_SHADOW: DropShadow = { enabled: true, dx: 2, dy: 2, blur: 3, color: '#000000', opacity: 0.5 }
const DEFAULT_BLUR: BlurEffect   = { enabled: true, amount: 2 }
const DEFAULT_INNER_SHADOW: InnerShadow = { enabled: true, dx: 2, dy: 2, blur: 3, color: '#000000', opacity: 0.6 }
const DEFAULT_GLOW: GlowEffect = { enabled: true, blur: 6, color: '#ffffff', opacity: 0.8 }

function ToggleRow({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <button
        onClick={onToggle}
        style={{
          width: 30, height: 16, borderRadius: 8, border: 'none', cursor: 'pointer', padding: 0,
          background: active ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
          position: 'relative', transition: 'background 0.15s', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: active ? 16 : 2,
          width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
        }} />
      </button>
      <span style={{ fontSize: 11, color: active ? 'var(--text)' : 'var(--text-dim)' }}>{label}</span>
    </div>
  )
}

function FXPanel({ shape }: { shape: Shape }) {
  const { updateShape, commit } = useEditorStore()
  const [shadowColorOpen, setShadowColorOpen] = useState(false)
  const [innerShadowColorOpen, setInnerShadowColorOpen] = useState(false)
  const [glowColorOpen, setGlowColorOpen] = useState(false)
  const shadowSwatchRef = useRef<HTMLButtonElement>(null)
  const innerShadowSwatchRef = useRef<HTMLButtonElement>(null)
  const glowSwatchRef = useRef<HTMLButtonElement>(null)

  const fx: ShapeFilters = shape.filters ?? {}
  const shadow = fx.shadow
  const blur = fx.blur
  const innerShadow = fx.innerShadow
  const glow = fx.glow

  const setFx = (next: ShapeFilters) => { updateShape(shape.id, { filters: next } as any); commit() }
  const setFxLive = (next: ShapeFilters) => updateShape(shape.id, { filters: next } as any)

  const toggleShadow = () => {
    if (!shadow) setFx({ ...fx, shadow: { ...DEFAULT_SHADOW } })
    else setFx({ ...fx, shadow: { ...shadow, enabled: !shadow.enabled } })
  }
  const toggleBlur = () => {
    if (!blur) setFx({ ...fx, blur: { ...DEFAULT_BLUR } })
    else setFx({ ...fx, blur: { ...blur, enabled: !blur.enabled } })
  }
  const toggleInnerShadow = () => {
    if (!innerShadow) setFx({ ...fx, innerShadow: { ...DEFAULT_INNER_SHADOW } })
    else setFx({ ...fx, innerShadow: { ...innerShadow, enabled: !innerShadow.enabled } })
  }
  const toggleGlow = () => {
    if (!glow) setFx({ ...fx, glow: { ...DEFAULT_GLOW } })
    else setFx({ ...fx, glow: { ...glow, enabled: !glow.enabled } })
  }

  const patchShadow = (patch: Partial<DropShadow>, live = false) => {
    const next = { ...fx, shadow: { ...(shadow ?? DEFAULT_SHADOW), ...patch } }
    live ? setFxLive(next) : setFx(next)
  }
  const patchBlur = (patch: Partial<BlurEffect>) => {
    setFxLive({ ...fx, blur: { ...(blur ?? DEFAULT_BLUR), ...patch } })
  }
  const patchInnerShadow = (patch: Partial<InnerShadow>, live = false) => {
    const next = { ...fx, innerShadow: { ...(innerShadow ?? DEFAULT_INNER_SHADOW), ...patch } }
    live ? setFxLive(next) : setFx(next)
  }
  const patchGlow = (patch: Partial<GlowEffect>, live = false) => {
    const next = { ...fx, glow: { ...(glow ?? DEFAULT_GLOW), ...patch } }
    live ? setFxLive(next) : setFx(next)
  }

  const shadowActive = shadow?.enabled ?? false
  const blurActive = blur?.enabled ?? false
  const innerShadowActive = innerShadow?.enabled ?? false
  const glowActive = glow?.enabled ?? false

  return (
    <div className="panel-section">
      <div className="panel-label">Effects</div>

      {/* ── Drop Shadow ── */}
      <div style={{ marginBottom: 8 }}>
        <ToggleRow label="Drop Shadow" active={shadowActive} onToggle={toggleShadow} />
        {shadowActive && shadow && (
          <div style={{ paddingLeft: 4 }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>Color</span>
              <button
                ref={shadowSwatchRef}
                onClick={() => setShadowColorOpen((o) => !o)}
                style={{ width: 28, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: shadow.color, cursor: 'pointer', flexShrink: 0 }}
              />
              {shadowColorOpen && (
                <ColorPicker value={shadow.color} onChange={(c) => patchShadow({ color: c }, true)}
                  onCommit={() => { patchShadow({ color: shadow.color }); setShadowColorOpen(false) }}
                  onClose={() => setShadowColorOpen(false)} anchorRef={shadowSwatchRef} />
              )}
            </div>
            <SliderRow label="Opacity" value={shadow.opacity} onChange={(v) => patchShadow({ opacity: v }, true)} />
            <SliderRow label="Blur" value={shadow.blur} onChange={(v) => patchShadow({ blur: v }, true)} min={0} max={20} step={0.5} />
            <SliderRow label="X" value={shadow.dx} onChange={(v) => patchShadow({ dx: v }, true)} min={-30} max={30} step={0.5} />
            <SliderRow label="Y" value={shadow.dy} onChange={(v) => patchShadow({ dy: v }, true)} min={-30} max={30} step={0.5} />
          </div>
        )}
      </div>

      {/* ── Inner Shadow ── */}
      <div style={{ marginBottom: 8 }}>
        <ToggleRow label="Inner Shadow" active={innerShadowActive} onToggle={toggleInnerShadow} />
        {innerShadowActive && innerShadow && (
          <div style={{ paddingLeft: 4 }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>Color</span>
              <button
                ref={innerShadowSwatchRef}
                onClick={() => setInnerShadowColorOpen((o) => !o)}
                style={{ width: 28, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: innerShadow.color, cursor: 'pointer', flexShrink: 0 }}
              />
              {innerShadowColorOpen && (
                <ColorPicker value={innerShadow.color} onChange={(c) => patchInnerShadow({ color: c }, true)}
                  onCommit={() => { patchInnerShadow({ color: innerShadow.color }); setInnerShadowColorOpen(false) }}
                  onClose={() => setInnerShadowColorOpen(false)} anchorRef={innerShadowSwatchRef} />
              )}
            </div>
            <SliderRow label="Opacity" value={innerShadow.opacity} onChange={(v) => patchInnerShadow({ opacity: v }, true)} />
            <SliderRow label="Blur" value={innerShadow.blur} onChange={(v) => patchInnerShadow({ blur: v }, true)} min={0} max={20} step={0.5} />
            <SliderRow label="X" value={innerShadow.dx} onChange={(v) => patchInnerShadow({ dx: v }, true)} min={-30} max={30} step={0.5} />
            <SliderRow label="Y" value={innerShadow.dy} onChange={(v) => patchInnerShadow({ dy: v }, true)} min={-30} max={30} step={0.5} />
          </div>
        )}
      </div>

      {/* ── Glow ── */}
      <div style={{ marginBottom: 8 }}>
        <ToggleRow label="Glow" active={glowActive} onToggle={toggleGlow} />
        {glowActive && glow && (
          <div style={{ paddingLeft: 4 }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>Color</span>
              <button
                ref={glowSwatchRef}
                onClick={() => setGlowColorOpen((o) => !o)}
                style={{ width: 28, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: glow.color, cursor: 'pointer', flexShrink: 0 }}
              />
              {glowColorOpen && (
                <ColorPicker value={glow.color} onChange={(c) => patchGlow({ color: c }, true)}
                  onCommit={() => { patchGlow({ color: glow.color }); setGlowColorOpen(false) }}
                  onClose={() => setGlowColorOpen(false)} anchorRef={glowSwatchRef} />
              )}
            </div>
            <SliderRow label="Opacity" value={glow.opacity} onChange={(v) => patchGlow({ opacity: v }, true)} />
            <SliderRow label="Blur" value={glow.blur} onChange={(v) => patchGlow({ blur: v }, true)} min={0} max={30} step={0.5} />
          </div>
        )}
      </div>

      {/* ── Blur ── */}
      <div>
        <ToggleRow label="Blur" active={blurActive} onToggle={toggleBlur} />
        {blurActive && blur && (
          <div style={{ paddingLeft: 4 }}>
            <SliderRow label="Amount" value={blur.amount} onChange={(v) => patchBlur({ amount: v })} min={0} max={20} step={0.5} />
          </div>
        )}
      </div>
    </div>
  )
}

function OffsetPathControl({ shape }: { shape: Shape }) {
  const [offsetVal, setOffsetVal] = React.useState(2)
  const { addShape, commit } = useEditorStore()
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 48, flexShrink: 0 }}>Offset</span>
        <input type="number" className="input-field" value={offsetVal} step={0.5}
          onChange={(e) => setOffsetVal(parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>px</span>
      </div>
      <button
        style={{ width: '100%', padding: '4px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer' }}
        onClick={() => {
          const delta = offsetShape(shape, offsetVal)
          if (!delta) return
          addShape({ ...shape, ...delta, name: shape.name + ' (offset)' } as any)
          commit()
        }}
      >
        Offset Path ({offsetVal > 0 ? '+' : ''}{offsetVal})
      </button>
    </div>
  )
}

function SimplifyPathControl({ shape }: { shape: { id: string; type: 'path'; d: string } & Shape }) {
  const [tolerance, setTolerance] = React.useState(0.5)
  const { updateShape, commit } = useEditorStore()
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 48, flexShrink: 0 }}>Tolerance</span>
        <input type="range" min={0.1} max={10} step={0.1} value={tolerance}
          onChange={(e) => setTolerance(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 24, textAlign: 'right' }}>{tolerance}</span>
      </div>
      <button
        style={{ width: '100%', padding: '4px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer' }}
        onClick={() => { updateShape(shape.id, { d: simplifyPath(shape.d, tolerance) } as any); commit() }}
      >
        Simplify Path
      </button>
    </div>
  )
}

function ShapeProperties({ shape }: { shape: Shape }) {
  const store = useEditorStore()
  const { updateShape, commit, reorderLayer, flipShapes, alignShapes, swatches, addSwatch, removeSwatch, snapEnabled, setSnap, gridEnabled, gridSize, setGrid } = store

  const update = (partial: Partial<Shape>) => {
    updateShape(shape.id, partial)
    commit()
  }

  // For color inputs: live update without committing, commit only on drag end
  const updateColor = (partial: Partial<Shape>) => updateShape(shape.id, partial)

  // Blend shape early return
  if (shape.type === 'blend') {
    const blendShape = shape as BlendShape
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
        {/* Blend controls */}
        <div className="panel-section">
          <div className="panel-label">Blend</div>
          <NumInput label="Steps" value={blendShape.steps} min={0} max={100}
            onChange={v => update({ steps: v } as any)} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              style={{ width: '100%', padding: '5px 0', fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', cursor: 'pointer' }}
              onClick={() => store.expandBlend(shape.id)}
            >Expand Blend</button>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.4 }}>
            {blendShape.steps + 2} shapes total · {blendShape.steps} intermediate
          </div>
        </div>
        {/* Opacity only */}
        <div className="panel-section">
          <SliderRow label="Opacity" value={shape.opacity} onChange={v => update({ opacity: v })} />
        </div>
      </div>
    )
  }

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
        {(shape.type === 'rect' || shape.type === 'frame') && (
          <>
            <NumInput label="X" value={shape.x} onChange={(v) => update({ x: v } as any)} />
            <NumInput label="Y" value={shape.y} onChange={(v) => update({ y: v } as any)} />
            <NumInput label="W" value={shape.width} onChange={(v) => update({ width: Math.max(1, v) } as any)} min={1} />
            <NumInput label="H" value={shape.height} onChange={(v) => update({ height: Math.max(1, v) } as any)} min={1} />
            {shape.type === 'rect' && <NumInput label="Rx" value={shape.rx} onChange={(v) => update({ rx: v } as any)} min={0} />}
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

        {/* Align to canvas */}
        <div style={{ marginTop: 8 }}>
          <div className="panel-label" style={{ marginBottom: 4 }}>Align to Canvas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
            {[['left','⇤'],['center-h','↔'],['right','⇥'],['top','⇡'],['center-v','↕'],['bottom','⇣']].map(([t,l]) => (
              <button key={t} title={`${t} to canvas`}
                onClick={() => alignShapes(t as any, 'canvas')}
                style={{ padding: '4px 0', borderRadius: 4, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Skew / Deform */}
        <div style={{ marginTop: 10 }}>
          <div className="panel-label" style={{ marginBottom: 4 }}>Deform</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 42, flexShrink: 0 }}>Skew X</span>
            <input
              type="range" min={-60} max={60} step={1}
              value={(shape as any).skewX ?? 0}
              onChange={(e) => updateShape(shape.id, { skewX: parseFloat(e.target.value) } as any)}
              onMouseUp={() => commit()}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 24, textAlign: 'right' }}>{Math.round((shape as any).skewX ?? 0)}°</span>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 42, flexShrink: 0 }}>Skew Y</span>
            <input
              type="range" min={-60} max={60} step={1}
              value={(shape as any).skewY ?? 0}
              onChange={(e) => updateShape(shape.id, { skewY: parseFloat(e.target.value) } as any)}
              onMouseUp={() => commit()}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 24, textAlign: 'right' }}>{Math.round((shape as any).skewY ?? 0)}°</span>
          </div>
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
        {/* Pattern Fill */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flex: 1 }}>Pattern</span>
            <button
              style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)', background: shape.patternFill ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)', color: shape.patternFill ? 'var(--accent)' : 'var(--text-dim)', cursor: 'pointer' }}
              onClick={() => {
                if (shape.patternFill) update({ patternFill: undefined } as any)
                else update({ patternFill: { type: 'stripes', color: '#ffffff', size: 8, angle: 0 } } as any)
              }}
            >{shape.patternFill ? 'Remove' : 'Add'}</button>
          </div>
          {shape.patternFill && (() => {
            const pf: PatternFill = shape.patternFill!
            return (
              <div style={{ paddingLeft: 4 }}>
                <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                  {(['stripes', 'dots', 'grid', 'crosshatch'] as const).map((t) => (
                    <button key={t} title={t}
                      onClick={() => update({ patternFill: { ...pf, type: t } } as any)}
                      style={{ flex: 1, padding: '2px 0', borderRadius: 4, border: `1px solid ${pf.type === t ? 'var(--accent)' : 'var(--border)'}`, background: pf.type === t ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 9, color: 'var(--text-dim)' }}>
                      {t === 'stripes' ? '≡' : t === 'dots' ? '⁙' : t === 'grid' ? '⊞' : '✕'}
                    </button>
                  ))}
                </div>
                <ColorInput label="Color" value={pf.color} onChange={(v) => updateShape(shape.id, { patternFill: { ...pf, color: v } } as any)} onCommit={commit} />
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 48, flexShrink: 0 }}>Size</span>
                  <input type="range" min={2} max={40} step={1} value={pf.size}
                    onChange={(e) => updateShape(shape.id, { patternFill: { ...pf, size: parseFloat(e.target.value) } } as any)}
                    onMouseUp={commit} style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 24, textAlign: 'right' }}>{pf.size}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 48, flexShrink: 0 }}>Angle</span>
                  <input type="range" min={0} max={180} step={1} value={pf.angle}
                    onChange={(e) => updateShape(shape.id, { patternFill: { ...pf, angle: parseFloat(e.target.value) } } as any)}
                    onMouseUp={commit} style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 24, textAlign: 'right' }}>{pf.angle}°</span>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Swatches */}
      <div className="panel-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span className="panel-label" style={{ margin: 0, flex: 1 }}>Swatches</span>
          <button title="Save fill color as swatch"
            onClick={() => addSwatch(shape.fill)}
            style={{ fontSize: 14, width: 20, height: 20, borderRadius: 3, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', color: 'var(--text-dim)', lineHeight: '18px', padding: 0 }}>
            +
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {swatches.map((color, i) => (
            <button key={i}
              title={`${color} · click=fill · shift+click=stroke · right-click=remove`}
              onClick={(e) => { if (e.shiftKey) update({ stroke: color }); else update({ fill: color }) }}
              onContextMenu={(e) => { e.preventDefault(); removeSwatch(color) }}
              style={{ width: 18, height: 18, borderRadius: 3, border: '1px solid rgba(255,255,255,0.1)', background: color, cursor: 'pointer', padding: 0, flexShrink: 0 }}
            />
          ))}
        </div>
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

        {/* Stroke alignment */}
        <div className="flex items-center gap-2 mb-1" style={{ marginTop: 4 }}>
          <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>Align</span>
          <div style={{ display: 'flex', gap: 3, flex: 1 }}>
            {(['center', 'inside', 'outside'] as const).map((a) => (
              <button key={a}
                onClick={() => update({ strokeAlignment: a } as any)}
                title={`Stroke ${a}`}
                style={{ flex: 1, padding: '3px 0', fontSize: 9, borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${((shape as any).strokeAlignment ?? 'center') === a ? 'var(--accent)' : 'var(--border)'}`,
                  background: ((shape as any).strokeAlignment ?? 'center') === a ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)',
                  color: 'var(--text-dim)' }}>
                {a === 'center' ? '⊃⊂' : a === 'inside' ? '⊂' : '⊃'}
              </button>
            ))}
          </div>
        </div>

        {/* Outline Stroke */}
        {shape.strokeWidth > 0 && shape.stroke !== 'none' && (
          <button
            style={{ marginTop: 4, width: '100%', padding: '4px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer' }}
            title="Convert stroke to a filled path shape"
            onClick={() => {
              const result = outlineStroke(shape)
              if (!result) return
              const s = useEditorStore.getState()
              s.addShape({ ...shape, type: 'path', d: result.d, fill: result.fill, stroke: 'none', strokeWidth: 0, name: shape.name + ' (outline)' } as any)
              s.updateShape(shape.id, { stroke: 'none', strokeWidth: 0 } as any)
              s.commit()
            }}
          >
            Outline Stroke →
          </button>
        )}

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
              <button key={cap} title={cap} onClick={() => update({ strokeLinecap: cap } as any)}
                style={{ flex: 1, padding: '3px 0', borderRadius: 5, border: `1px solid ${(shape.strokeLinecap || 'round') === cap ? 'var(--accent)' : 'var(--border)'}`, background: (shape.strokeLinecap || 'round') === cap ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 9, color: 'var(--text-dim)' }}>
                {cap}
              </button>
            ))}
          </div>
        </div>

        {/* Linejoin */}
        <div className="flex items-center gap-2 mb-1">
          <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>Join</span>
          <div style={{ display: 'flex', gap: 4, flex: 1 }}>
            {(['miter', 'round', 'bevel'] as const).map((join) => (
              <button key={join} title={join} onClick={() => update({ strokeLinejoin: join } as any)}
                style={{ flex: 1, padding: '3px 0', borderRadius: 5, border: `1px solid ${(shape.strokeLinejoin || 'miter') === join ? 'var(--accent)' : 'var(--border)'}`, background: (shape.strokeLinejoin || 'miter') === join ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 9, color: 'var(--text-dim)' }}>
                {join}
              </button>
            ))}
          </div>
        </div>

        {/* Arrowheads / Markers — only for line and path shapes */}
        {(shape.type === 'line' || shape.type === 'path') && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>Start</span>
              <select className="input-field" style={{ flex: 1 }}
                value={shape.markerStart || 'none'}
                onChange={(e) => update({ markerStart: e.target.value as any })}>
                <option value="none">None</option>
                <option value="arrow">Arrow</option>
                <option value="dot">Dot</option>
                <option value="diamond">Diamond</option>
              </select>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="panel-label" style={{ margin: 0, width: 48, flexShrink: 0 }}>End</span>
              <select className="input-field" style={{ flex: 1 }}
                value={shape.markerEnd || 'none'}
                onChange={(e) => update({ markerEnd: e.target.value as any })}>
                <option value="none">None</option>
                <option value="arrow">Arrow</option>
                <option value="dot">Dot</option>
                <option value="diamond">Diamond</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Opacity */}
      <div className="panel-section">
        <div className="panel-label">Layer</div>
        <NumInput label="Opacity" value={shape.opacity} onChange={(v) => update({ opacity: Math.max(0, Math.min(1, v)) })} min={0} max={1} step={0.05} />
      </div>

      {/* FX */}
      <FXPanel shape={shape} />

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
            <select
              className="input-field"
              value={shape.fontFamily}
              onChange={(e) => update({ fontFamily: e.target.value } as any)}
              style={{ fontFamily: shape.fontFamily }}
            >
              <optgroup label="Sistema">
                <option value="sans-serif" style={{ fontFamily: 'sans-serif' }}>sans-serif</option>
                <option value="serif" style={{ fontFamily: 'serif' }}>serif</option>
                <option value="monospace" style={{ fontFamily: 'monospace' }}>monospace</option>
                <option value="Arial" style={{ fontFamily: 'Arial' }}>Arial</option>
                <option value="Georgia" style={{ fontFamily: 'Georgia' }}>Georgia</option>
                <option value="Verdana" style={{ fontFamily: 'Verdana' }}>Verdana</option>
                <option value="Trebuchet MS" style={{ fontFamily: 'Trebuchet MS' }}>Trebuchet MS</option>
                <option value="Times New Roman" style={{ fontFamily: 'Times New Roman' }}>Times New Roman</option>
                <option value="Courier New" style={{ fontFamily: 'Courier New' }}>Courier New</option>
              </optgroup>
              <optgroup label="Sans-serif">
                <option value="Inter" style={{ fontFamily: 'Inter' }}>Inter</option>
                <option value="Roboto" style={{ fontFamily: 'Roboto' }}>Roboto</option>
                <option value="Open Sans" style={{ fontFamily: 'Open Sans' }}>Open Sans</option>
                <option value="Lato" style={{ fontFamily: 'Lato' }}>Lato</option>
                <option value="Montserrat" style={{ fontFamily: 'Montserrat' }}>Montserrat</option>
                <option value="Poppins" style={{ fontFamily: 'Poppins' }}>Poppins</option>
                <option value="Nunito" style={{ fontFamily: 'Nunito' }}>Nunito</option>
                <option value="Raleway" style={{ fontFamily: 'Raleway' }}>Raleway</option>
                <option value="Oswald" style={{ fontFamily: 'Oswald' }}>Oswald</option>
                <option value="Ubuntu" style={{ fontFamily: 'Ubuntu' }}>Ubuntu</option>
                <option value="PT Sans" style={{ fontFamily: 'PT Sans' }}>PT Sans</option>
                <option value="Noto Sans" style={{ fontFamily: 'Noto Sans' }}>Noto Sans</option>
              </optgroup>
              <optgroup label="Serif">
                <option value="Playfair Display" style={{ fontFamily: 'Playfair Display' }}>Playfair Display</option>
                <option value="Merriweather" style={{ fontFamily: 'Merriweather' }}>Merriweather</option>
              </optgroup>
              <optgroup label="Display / Decorativas">
                <option value="Bebas Neue" style={{ fontFamily: 'Bebas Neue' }}>Bebas Neue</option>
                <option value="Righteous" style={{ fontFamily: 'Righteous' }}>Righteous</option>
                <option value="Pacifico" style={{ fontFamily: 'Pacifico' }}>Pacifico</option>
                <option value="Lobster" style={{ fontFamily: 'Lobster' }}>Lobster</option>
                <option value="Dancing Script" style={{ fontFamily: 'Dancing Script' }}>Dancing Script</option>
              </optgroup>
              <optgroup label="Monoespaciadas">
                <option value="Source Code Pro" style={{ fontFamily: 'Source Code Pro' }}>Source Code Pro</option>
              </optgroup>
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

          {/* Letter spacing */}
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 72, flexShrink: 0 }}>Letter spacing</span>
              <input
                type="range" min={-10} max={40} step={0.5}
                value={(shape as any).letterSpacing ?? 0}
                onChange={(e) => updateShape(shape.id, { letterSpacing: parseFloat(e.target.value) } as any)}
                onMouseUp={() => commit()}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 28, textAlign: 'right' }}>{(shape as any).letterSpacing ?? 0}</span>
            </div>
          </div>

          {/* Per-character offsets */}
          {(!!(shape as any).charOffsets?.some((v: number) => v !== 0) || !!(shape as any).charOffsetsY?.some((v: number) => v !== 0)) && (
            <div style={{ marginTop: 4 }}>
              <button
                style={{ width: '100%', padding: '3px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer' }}
                onClick={() => update({ charOffsets: undefined, charOffsetsY: undefined } as any)}
              >
                Reset character offsets
              </button>
            </div>
          )}

          {/* Arc / Curved text */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="panel-label" style={{ margin: 0 }}>Texto en arco</span>
              <input
                type="checkbox"
                checked={!!(shape as any).textOnArc}
                onChange={(e) => update({ textOnArc: e.target.checked } as any)}
                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>
            {(shape as any).textOnArc && (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <button
                    onClick={() => update({ arcDirection: 'up' } as any)}
                    style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${(shape as any).arcDirection !== 'down' ? 'var(--accent)' : 'var(--border)'}`, background: (shape as any).arcDirection !== 'down' ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}
                  >⌢ Arriba</button>
                  <button
                    onClick={() => update({ arcDirection: 'down' } as any)}
                    style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: `1px solid ${(shape as any).arcDirection === 'down' ? 'var(--accent)' : 'var(--border)'}`, background: (shape as any).arcDirection === 'down' ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}
                  >⌣ Abajo</button>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 42, flexShrink: 0 }}>Radio</span>
                  <input
                    type="range" min={10} max={300} step={1}
                    value={(shape as any).arcRadius ?? shape.fontSize * 3}
                    onChange={(e) => updateShape(shape.id, { arcRadius: parseFloat(e.target.value) } as any)}
                    onMouseUp={() => commit()}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 28, textAlign: 'right' }}>{Math.round((shape as any).arcRadius ?? shape.fontSize * 3)}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 42, flexShrink: 0 }}>Offset</span>
                  <input
                    type="range" min={0} max={100} step={1}
                    value={(shape as any).arcOffset ?? 50}
                    onChange={(e) => updateShape(shape.id, { arcOffset: parseFloat(e.target.value) } as any)}
                    onMouseUp={() => commit()}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 28, textAlign: 'right' }}>{Math.round((shape as any).arcOffset ?? 50)}%</span>
                </div>
              </>
            )}
          </div>

          <button
            style={{ marginTop: 8, width: '100%', padding: '5px 0', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer' }}
            onClick={() => {
              const d = textToPath(shape as TextShape)
              if (!d) return
              const store = useEditorStore.getState()
              store.deleteShapes([shape.id])
              store.addShape({ ...shape, type: 'path', d, name: shape.name + ' (path)' } as any)
            }}
          >
            Convert to Path
          </button>
        </div>
      )}

      {/* Path Operations */}
      {(shape.type === 'rect' || shape.type === 'frame' || shape.type === 'circle' || shape.type === 'ellipse' || shape.type === 'polygon' || shape.type === 'path') && (
        <div className="panel-section">
          <div className="panel-label">Path Operations</div>
          {shape.type !== 'path' && <OffsetPathControl shape={shape} />}
          {shape.type === 'path' && <SimplifyPathControl shape={shape as any} />}
        </div>
      )}

      {/* Snap to grid */}
      <div className="panel-section">
        <div className="panel-label">Grid</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <input type="checkbox" id="snap-props" checked={snapEnabled} onChange={(e) => setSnap(e.target.checked)} />
          <label htmlFor="snap-props" style={{ fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer' }}>Snap to grid</label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="grid-props" checked={gridEnabled} onChange={(e) => setGrid(gridSize, e.target.checked)} />
          <label htmlFor="grid-props" style={{ fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer' }}>Show grid</label>
          <input
            type="number"
            min={1}
            max={128}
            value={gridSize}
            onChange={(e) => setGrid(Math.max(1, parseInt(e.target.value) || 1), gridEnabled)}
            style={{ width: 44, marginLeft: 'auto', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '2px 4px', fontSize: 11 }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>px</span>
        </div>
      </div>

      {/* Path node type (only when editing a specific node) */}
      {store.editingNodePathId === shape.id && store.selectedNodeIndex !== null && shape.type === 'path' && isBezierPath((shape as any).d) && (() => {
        const { nodes, closed } = parseBezierPath((shape as any).d)
        const i = store.selectedNodeIndex!
        const node = nodes[i]
        if (!node) return null
        const ntype: NodeType = node.nodeType ?? (node.smooth ? 'symmetric' : 'corner')
        const setType = (t: NodeType) => {
          const newNodes = nodes.map((n, idx) => idx === i ? { ...n, nodeType: t, smooth: t !== 'corner' } : n)
          const finalNodes = t === 'auto' ? applyAutoSmooth(newNodes, closed) : newNodes
          update({ d: serializeBezierPath(finalNodes, closed) } as any)
        }
        const types: { t: NodeType; label: string; icon: string }[] = [
          { t: 'corner', label: 'Corner', icon: '◻' },
          { t: 'smooth', label: 'Smooth', icon: '⌒' },
          { t: 'symmetric', label: 'Symmetric', icon: '◉' },
          { t: 'auto', label: 'Auto', icon: '✦' },
        ]
        return (
          <div className="panel-section">
            <div className="panel-label">Node Type</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              {types.map(({ t, label, icon }) => (
                <button key={t} title={label}
                  style={{ flex: 1, padding: '4px 0', fontSize: 14, background: ntype === t ? 'rgba(233,69,96,0.3)' : 'rgba(255,255,255,0.06)', border: `1px solid ${ntype === t ? '#e94560' : 'var(--border)'}`, borderRadius: 4, color: 'var(--text)', cursor: 'pointer' }}
                  onClick={() => setType(t)}
                >{icon}</button>
              ))}
            </div>
            <button
              style={{ width: '100%', padding: '4px 0', fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-dim)', cursor: 'pointer' }}
              onClick={() => {
                const allAuto = nodes.map(n => ({ ...n, nodeType: 'auto' as NodeType, smooth: true }))
                const smoothed = applyAutoSmooth(allAuto, closed)
                const fullySmoothed = smoothed.map((_, idx) => autoSmoothNode(smoothed, idx, closed))
                update({ d: serializeBezierPath(fullySmoothed, closed) } as any)
              }}
            >Auto-smooth all nodes</button>
          </div>
        )
      })()}

      {/* Clip mask status */}
      {shape.clippedBy && (
        <div className="panel-section">
          <div className="panel-label">Clip Mask</div>
          <button
            style={{ width: '100%', padding: '5px 0', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer' }}
            onClick={() => useEditorStore.getState().releaseClipMask(shape.clippedBy!)}
          >
            Release Clip Mask
          </button>
        </div>
      )}

      {/* Brush panel — path only */}
      {shape.type === 'path' && (() => {
        const brush: BrushDef | undefined = (shape as any).brush
        const hasBrush = !!brush
        const btype = brush?.type ?? 'calligraphic'
        const setB = (partial: Partial<BrushDef> | null) => {
          if (partial === null) { update({ brush: undefined } as any); return }
          const next: BrushDef = { type: btype, ...brush, ...partial }
          update({ brush: next } as any)
        }
        const setBrushType = (t: BrushDef['type']) => {
          update({ brush: { type: t, size: brush?.size ?? 8 } } as any)
        }
        return (
          <div className="panel-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="panel-label" style={{ margin: 0 }}>Brush</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
                <input type="checkbox" checked={hasBrush} onChange={e => { if (!e.target.checked) setB(null); else update({ brush: { type: 'calligraphic', size: 8, angle: 45, roundness: 0.2 } } as any) }} />
                Enable
              </label>
            </div>
            {hasBrush && (
              <>
                {/* Type selector */}
                <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                  {(['calligraphic', 'variable', 'pattern', 'art'] as const).map(t => (
                    <button key={t}
                      style={{ flex: 1, padding: '3px 0', fontSize: 9, background: btype === t ? 'rgba(233,69,96,0.3)' : 'rgba(255,255,255,0.06)', border: `1px solid ${btype === t ? '#e94560' : 'var(--border)'}`, borderRadius: 4, color: 'var(--text)', cursor: 'pointer', textTransform: 'capitalize' }}
                      onClick={() => setBrushType(t)}
                    >{t === 'calligraphic' ? 'Calli' : t === 'variable' ? 'Variable' : t === 'pattern' ? 'Pattern' : 'Art'}</button>
                  ))}
                </div>
                {/* Size (all types) */}
                <NumInput label="Size" value={brush?.size ?? 8} min={1} max={100} step={0.5} onChange={v => setB({ size: v })} />
                {/* Calligraphic params */}
                {btype === 'calligraphic' && (
                  <>
                    <NumInput label="Angle" value={brush?.angle ?? 45} min={0} max={180} onChange={v => setB({ angle: v })} unit="°" />
                    <SliderRow label="Round" value={brush?.roundness ?? 0.2} min={0} max={1} step={0.01} onChange={v => setB({ roundness: v })} />
                  </>
                )}
                {/* Variable width params */}
                {btype === 'variable' && (() => {
                  const profile = brush?.widthProfile ?? [{ t: 0, w: 3 }, { t: 0.5, w: (brush?.size ?? 8) }, { t: 1, w: 3 }]
                  return (
                    <div style={{ marginTop: 4 }}>
                      <div className="panel-label" style={{ marginBottom: 4 }}>Width Profile</div>
                      {profile.map((pt, i) => (
                        <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 28 }}>{Math.round(pt.t * 100)}%</span>
                          <input type="range" min={0} max={brush?.size ?? 8} step={0.1} value={pt.w}
                            style={{ flex: 1 }}
                            onChange={e => {
                              const np = profile.map((p, ii) => ii === i ? { ...p, w: parseFloat(e.target.value) } : p)
                              setB({ widthProfile: np })
                            }} />
                          <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 24 }}>{pt.w.toFixed(1)}</span>
                        </div>
                      ))}
                      <button
                        style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-dim)', cursor: 'pointer', marginTop: 2 }}
                        onClick={() => {
                          const lastT = profile[profile.length - 1]?.t ?? 1
                          const newT = Math.min(0.99, lastT * 0.6 + 0.4)
                          setB({ widthProfile: [...profile, { t: newT, w: (brush?.size ?? 8) * 0.5 }] })
                        }}
                      >+ Add point</button>
                    </div>
                  )
                })()}
                {/* Pattern params */}
                {btype === 'pattern' && (
                  <>
                    <div style={{ display: 'flex', gap: 3, marginBottom: 5, flexWrap: 'wrap' }}>
                      {(['circle', 'square', 'diamond', 'leaf'] as const).map(s => (
                        <button key={s}
                          style={{ padding: '3px 6px', fontSize: 10, background: (brush?.patternShape ?? 'circle') === s ? 'rgba(233,69,96,0.3)' : 'rgba(255,255,255,0.06)', border: `1px solid ${(brush?.patternShape ?? 'circle') === s ? '#e94560' : 'var(--border)'}`, borderRadius: 3, color: 'var(--text)', cursor: 'pointer', textTransform: 'capitalize' }}
                          onClick={() => setB({ patternShape: s })}
                        >{s}</button>
                      ))}
                    </div>
                    <NumInput label="Spacing" value={brush?.patternSpacing ?? (brush?.size ?? 8) * 1.5} min={1} max={100} step={0.5} onChange={v => setB({ patternSpacing: v })} />
                  </>
                )}
                {/* Art params */}
                {btype === 'art' && (
                  <div style={{ display: 'flex', gap: 3 }}>
                    {(['bristle', 'rope', 'charcoal'] as const).map(d => (
                      <button key={d}
                        style={{ flex: 1, padding: '3px 0', fontSize: 10, background: (brush?.artDesign ?? 'bristle') === d ? 'rgba(233,69,96,0.3)' : 'rgba(255,255,255,0.06)', border: `1px solid ${(brush?.artDesign ?? 'bristle') === d ? '#e94560' : 'var(--border)'}`, borderRadius: 3, color: 'var(--text)', cursor: 'pointer', textTransform: 'capitalize' }}
                        onClick={() => setB({ artDesign: d })}
                      >{d}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })()}
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
  const { updateShape, commit, alignShapes, layerOrder } = store
  const [alignRef, setAlignRef] = useState<'selection' | 'canvas'>('selection')
  const [blendSteps, setBlendSteps] = useState(5)

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
      <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
        {(['selection', 'canvas'] as const).map((ref) => (
          <button key={ref} onClick={() => setAlignRef(ref)}
            style={{ flex: 1, padding: '3px 0', fontSize: 9, borderRadius: 4, cursor: 'pointer',
              border: `1px solid ${alignRef === ref ? 'var(--accent)' : 'var(--border)'}`,
              background: alignRef === ref ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)',
              color: 'var(--text-dim)' }}>
            {ref === 'selection' ? 'Selection' : 'Canvas'}
          </button>
        ))}
      </div>
      <AlignBar
        onAlign={(type) => alignShapes(type as any, alignRef === 'canvas' ? 'canvas' : undefined)}
        canDistribute={selectedShapes.length >= 3}
      />

      {/* Shared fill/stroke */}
      <div className="panel-label" style={{ marginBottom: 4 }}>Fill & Stroke</div>
      <ColorInput label="Fill" value={firstFill} onChange={(v) => updateAllLive({ fill: v })} onCommit={commit} />
      <ColorInput label="Stroke" value={firstStroke} onChange={(v) => updateAllLive({ stroke: v })} onCommit={commit} />
      <NumInput label="S.Width" value={firstStrokeWidth} onChange={(v) => updateAll({ strokeWidth: Math.max(0, v) })} min={0} step={0.5} />

      {/* Clip Mask — only available for exactly 2 shapes */}
      {selectedShapes.length === 2 && (
        <>
          <div className="panel-label" style={{ marginBottom: 4, marginTop: 8 }}>Clip Mask</div>
          <button
            title="Top shape clips the bottom shape"
            onClick={() => {
              // Determine top (higher layerOrder index) and bottom
              const idxA = layerOrder.indexOf(selectedIds[0])
              const idxB = layerOrder.indexOf(selectedIds[1])
              const topId = idxA > idxB ? selectedIds[0] : selectedIds[1]
              const bottomId = idxA > idxB ? selectedIds[1] : selectedIds[0]
              store.makeClipMask(topId, bottomId)
            }}
            style={{ width: '100%', padding: '5px 0', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text)', fontSize: 11, cursor: 'pointer', marginBottom: 8 }}
          >
            Make Clip Mask
          </button>
        </>
      )}

      {/* Blend — only available for exactly 2 non-blend shapes */}
      {selectedShapes.length === 2 && !selectedShapes.some(s => s.type === 'blend') && (
        <>
          <div className="panel-label" style={{ marginBottom: 4, marginTop: 8 }}>Blend</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 48, flexShrink: 0 }}>Steps</span>
            <input
              type="number" min={1} max={50} value={blendSteps}
              onChange={e => setBlendSteps(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              className="input-field" style={{ flex: 1, textAlign: 'center' }}
            />
          </div>
          <button
            style={{ width: '100%', padding: '6px 0', fontSize: 12, background: 'rgba(233,69,96,0.15)', border: '1px solid var(--accent)', borderRadius: 5, color: 'var(--text)', cursor: 'pointer', marginBottom: 8 }}
            onClick={() => {
              useEditorStore.getState().createBlend(selectedIds[0], selectedIds[1], blendSteps)
            }}
          >Create Blend</button>
        </>
      )}

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
