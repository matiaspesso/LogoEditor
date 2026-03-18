import React, { useRef, useEffect } from 'react'

interface RulersProps {
  zoom: number
  panX: number
  panY: number
  containerW: number
  containerH: number
}

const RULER_SIZE = 20
const BG = '#1a1a2e'
const TICK_COLOR = '#555'
const TEXT_COLOR = '#888'

function drawRuler(
  canvas: HTMLCanvasElement,
  zoom: number,
  pan: number,          // panX for horizontal, panY for vertical
  containerLen: number, // containerW for H, containerH for V
  vertical: boolean,
) {
  const dpr = window.devicePixelRatio || 1
  const W = vertical ? RULER_SIZE : containerLen
  const H = vertical ? containerLen : RULER_SIZE
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'

  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  // Separator line
  ctx.fillStyle = '#2a2a4a'
  if (vertical) ctx.fillRect(W - 1, 0, 1, H)
  else ctx.fillRect(0, H - 1, W, 1)

  // Choose tick interval in SVG units so ticks are at least ~40px apart
  const minPx = 40
  const candidates = [1, 2, 4, 8, 16, 32, 64, 128, 256]
  const interval = candidates.find((c) => c * zoom >= minPx) ?? 256

  // SVG unit 0 is at screen position: containerLen/2 + pan
  const originPx = containerLen / 2 + pan

  // Range of SVG units visible
  const startUnit = Math.floor(-originPx / zoom / interval) * interval
  const endUnit = Math.ceil((containerLen - originPx) / zoom / interval) * interval

  ctx.strokeStyle = TICK_COLOR
  ctx.fillStyle = TEXT_COLOR
  ctx.font = `${9}px monospace`
  ctx.textAlign = vertical ? 'right' : 'center'
  ctx.textBaseline = vertical ? 'middle' : 'alphabetic'
  ctx.lineWidth = 1

  for (let u = startUnit; u <= endUnit; u += interval) {
    const px = originPx + u * zoom

    // Major tick every interval
    const tickLen = interval >= 32 ? 8 : interval >= 8 ? 5 : 3
    const showLabel = true

    ctx.beginPath()
    if (vertical) {
      ctx.moveTo(W - tickLen, px)
      ctx.lineTo(W, px)
    } else {
      ctx.moveTo(px, H - tickLen)
      ctx.lineTo(px, H)
    }
    ctx.stroke()

    if (showLabel && tickLen >= 5) {
      const label = String(u)
      if (vertical) {
        ctx.save()
        ctx.translate(W - tickLen - 2, px)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(label, 0, 0)
        ctx.restore()
      } else {
        ctx.fillText(label, px, H - tickLen - 2)
      }
    }
  }
}

export function Rulers({ zoom, panX, panY, containerW, containerH }: RulersProps) {
  const hRef = useRef<HTMLCanvasElement>(null)
  const vRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (hRef.current && containerW > 0) drawRuler(hRef.current, zoom, panX, containerW, false)
  }, [zoom, panX, containerW])

  useEffect(() => {
    if (vRef.current && containerH > 0) drawRuler(vRef.current, zoom, panY, containerH, true)
  }, [zoom, panY, containerH])

  return (
    <>
      {/* Corner square */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: RULER_SIZE, height: RULER_SIZE,
        background: BG, borderRight: '1px solid #2a2a4a', borderBottom: '1px solid #2a2a4a',
        zIndex: 10, flexShrink: 0,
      }} />
      {/* Horizontal ruler */}
      <canvas ref={hRef} style={{
        position: 'absolute', top: 0, left: RULER_SIZE,
        width: containerW - RULER_SIZE, height: RULER_SIZE,
        pointerEvents: 'none', zIndex: 9,
      }} />
      {/* Vertical ruler */}
      <canvas ref={vRef} style={{
        position: 'absolute', top: RULER_SIZE, left: 0,
        width: RULER_SIZE, height: containerH - RULER_SIZE,
        pointerEvents: 'none', zIndex: 9,
      }} />
    </>
  )
}

export const RULER_SIZE_PX = RULER_SIZE
