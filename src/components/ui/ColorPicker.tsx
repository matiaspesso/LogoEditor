import React, { useRef, useCallback, useEffect, useState } from 'react'
import { hexToHsva, hsvaToHex, hsvaToRgbaStr, isValidHex, COLOR_PRESETS, type HSVA } from '../../utils/colorUtils'

interface Props {
  value: string        // hex or 'none'
  onChange: (hex: string) => void
  onCommit?: () => void   // called once when drag ends or preset clicked
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
}

export function ColorPicker({ value, onChange, onCommit, onClose, anchorRef }: Props) {
  const [hsva, setHsva] = useState<HSVA>(() =>
    value && value !== 'none' && isValidHex(value) ? hexToHsva(value) : { h: 0, s: 100, v: 100, a: 1 }
  )
  const [hexInput, setHexInput] = useState(value === 'none' ? '#000000' : value)

  const pickerRef = useRef<HTMLDivElement>(null)
  const squareRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const alphaRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<null | 'sq' | 'hue' | 'alpha'>(null)

  // Position the picker below the anchor, clamped to viewport
  const [pos, setPos] = useState({ top: 0, left: 0 })
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      const pickerW = 240
      const margin = 8
      const left = Math.min(rect.left, window.innerWidth - pickerW - margin)
      const top = rect.bottom + 4 + pickerW > window.innerHeight
        ? rect.top - pickerW - 4
        : rect.bottom + 4
      setPos({ top, left: Math.max(margin, left) })
    }
  }, [anchorRef])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  const emit = useCallback((h: HSVA) => {
    const hex = hsvaToHex(h)
    onChange(hex)
    setHexInput(hex)
  }, [onChange])

  const updateFromSquare = useCallback((e: PointerEvent | React.PointerEvent) => {
    if (!squareRef.current) return
    const rect = squareRef.current.getBoundingClientRect()
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height)) * 100
    const next = { ...hsva, s, v }
    setHsva(next)
    emit(next)
  }, [hsva, emit])

  const updateFromHue = useCallback((e: PointerEvent | React.PointerEvent) => {
    if (!hueRef.current) return
    const rect = hueRef.current.getBoundingClientRect()
    const h = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 360
    const next = { ...hsva, h }
    setHsva(next)
    emit(next)
  }, [hsva, emit])

  const updateFromAlpha = useCallback((e: PointerEvent | React.PointerEvent) => {
    if (!alphaRef.current) return
    const rect = alphaRef.current.getBoundingClientRect()
    const a = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const next = { ...hsva, a }
    setHsva(next)
    emit(next)
  }, [hsva, emit])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (dragging.current === 'sq') updateFromSquare(e)
      else if (dragging.current === 'hue') updateFromHue(e)
      else if (dragging.current === 'alpha') updateFromAlpha(e)
    }
    const up = () => {
      if (dragging.current !== null) {
        dragging.current = null
        onCommit?.()
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [updateFromSquare, updateFromHue, updateFromAlpha, onCommit])

  const hueColor = `hsl(${hsva.h}, 100%, 50%)`
  const thumbX = (hsva.s / 100) * 100  // percent
  const thumbY = (1 - hsva.v / 100) * 100

  return (
    <div
      ref={pickerRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: 240,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        zIndex: 9999,
        padding: 12,
        userSelect: 'none',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* SV Square */}
      <div
        ref={squareRef}
        style={{
          width: '100%',
          height: 160,
          borderRadius: 4,
          position: 'relative',
          background: hueColor,
          cursor: 'crosshair',
          marginBottom: 10,
          flexShrink: 0,
        }}
        onPointerDown={(e) => { dragging.current = 'sq'; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); updateFromSquare(e) }}
      >
        {/* white gradient left-to-right */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 4,
          background: 'linear-gradient(to right, #fff, transparent)',
        }} />
        {/* black gradient bottom-to-top */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 4,
          background: 'linear-gradient(to top, #000, transparent)',
        }} />
        {/* Thumb */}
        <div style={{
          position: 'absolute',
          left: `${thumbX}%`,
          top: `${thumbY}%`,
          width: 12,
          height: 12,
          borderRadius: '50%',
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          background: hsvaToRgbaStr(hsva),
        }} />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        style={{
          width: '100%',
          height: 12,
          borderRadius: 6,
          background: 'linear-gradient(to right, #f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
          position: 'relative',
          cursor: 'ew-resize',
          marginBottom: 8,
        }}
        onPointerDown={(e) => { dragging.current = 'hue'; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); updateFromHue(e) }}
      >
        <div style={{
          position: 'absolute',
          left: `${(hsva.h / 360) * 100}%`,
          top: '50%',
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
          transform: 'translate(-50%, -50%)',
          background: hueColor,
          pointerEvents: 'none',
        }} />
      </div>

      {/* Alpha slider */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        {/* Checkerboard bg */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 6,
          backgroundImage: 'repeating-conic-gradient(#888 0% 25%, transparent 0% 50%)',
          backgroundSize: '8px 8px',
        }} />
        <div
          ref={alphaRef}
          style={{
            width: '100%',
            height: 12,
            borderRadius: 6,
            background: `linear-gradient(to right, transparent, ${hueColor})`,
            position: 'relative',
            cursor: 'ew-resize',
          }}
          onPointerDown={(e) => { dragging.current = 'alpha'; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); updateFromAlpha(e) }}
        >
          <div style={{
            position: 'absolute',
            left: `${hsva.a * 100}%`,
            top: '50%',
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
            transform: 'translate(-50%, -50%)',
            background: hsvaToRgbaStr(hsva),
            pointerEvents: 'none',
          }} />
        </div>
      </div>

      {/* Hex input + current color swatch */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 4,
          background: hsvaToRgbaStr(hsva),
          border: '1px solid var(--border)',
          flexShrink: 0,
          backgroundImage: 'repeating-conic-gradient(#888 0% 25%, transparent 0% 50%)',
          backgroundSize: '6px 6px',
        }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 4, background: hsvaToRgbaStr(hsva) }} />
        </div>
        <input
          type="text"
          className="input-field"
          value={hexInput}
          onChange={(e) => {
            setHexInput(e.target.value)
            if (isValidHex(e.target.value)) {
              const next = { ...hexToHsva(e.target.value), a: hsva.a }
              setHsva(next)
              onChange(hsvaToHex(next))
            }
          }}
          onBlur={() => onCommit?.()}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }}
          spellCheck={false}
        />
        {'EyeDropper' in window && (
          <button
            title="Cuentagotas (pick color from screen)"
            onClick={async () => {
              try {
                const dropper = new (window as any).EyeDropper()
                const result = await dropper.open()
                const hex = result.sRGBHex
                const next = { ...hexToHsva(hex), a: hsva.a }
                setHsva(next)
                emit(next)
                onCommit?.()
              } catch {
                // user cancelled
              }
            }}
            style={{
              width: 28, height: 28, borderRadius: 4, border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 14,
              color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 1 3 3c0 1.5-1 2.5-1 4l-4-4c1.5 0 2.5-1 2.5-3z"/>
              <path d="M9 9L3 15l3 3 6-6"/>
              <path d="M14 8l2 2"/>
              <circle cx="4.5" cy="19.5" r="1.5"/>
            </svg>
          </button>
        )}
        <button
          title="No color"
          onClick={() => { onChange('none'); onClose() }}
          style={{
            width: 28, height: 28, borderRadius: 4, border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 14,
            color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >∅</button>
      </div>

      {/* Preset grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => {
              const next = { ...hexToHsva(c), a: hsva.a }
              setHsva(next)
              emit(next)
              onCommit?.()
            }}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 3,
              background: c,
              border: c === hsvaToHex(hsva) ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}
