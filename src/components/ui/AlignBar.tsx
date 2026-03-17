import React from 'react'

interface Props {
  onAlign: (type: string) => void
  canDistribute: boolean
}

const BTN_STYLE: React.CSSProperties = {
  width: 28,
  height: 24,
  borderRadius: 4,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.04)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  fontSize: 13,
  color: 'var(--text)',
}

const ACTIONS = [
  // Row 1: horizontal
  { type: 'left',        label: '⬱',  title: 'Align left',        svg: alignLeftSVG() },
  { type: 'center-h',   label: '⬰',  title: 'Align center H',    svg: alignCenterHSVG() },
  { type: 'right',      label: '⬲',  title: 'Align right',       svg: alignRightSVG() },
  { type: 'distribute-h', label: '⇔', title: 'Distribute H',      svg: distHSVG() },
  // Row 2: vertical
  { type: 'top',        label: '⬱',  title: 'Align top',         svg: alignTopSVG() },
  { type: 'center-v',   label: '⬰',  title: 'Align center V',    svg: alignCenterVSVG() },
  { type: 'bottom',     label: '⬲',  title: 'Align bottom',      svg: alignBottomSVG() },
  { type: 'distribute-v', label: '⇕', title: 'Distribute V',     svg: distVSVG() },
]

function alignLeftSVG() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <line x1="2" y1="1" x2="2" y2="13" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="3" y="3" width="6" height="3" fill="currentColor" rx="0.5"/>
      <rect x="3" y="8" width="9" height="3" fill="currentColor" rx="0.5"/>
    </svg>
  )
}
function alignCenterHSVG() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="4" y="3" width="6" height="3" fill="currentColor" rx="0.5"/>
      <rect x="2.5" y="8" width="9" height="3" fill="currentColor" rx="0.5"/>
    </svg>
  )
}
function alignRightSVG() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <line x1="12" y1="1" x2="12" y2="13" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="5" y="3" width="6" height="3" fill="currentColor" rx="0.5"/>
      <rect x="2" y="8" width="9" height="3" fill="currentColor" rx="0.5"/>
    </svg>
  )
}
function distHSVG() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <line x1="2" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="12" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="4.5" y="4" width="5" height="6" fill="currentColor" rx="0.5"/>
    </svg>
  )
}
function alignTopSVG() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <line x1="1" y1="2" x2="13" y2="2" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="3" y="3" width="3" height="6" fill="currentColor" rx="0.5"/>
      <rect x="8" y="3" width="3" height="9" fill="currentColor" rx="0.5"/>
    </svg>
  )
}
function alignCenterVSVG() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="3" y="4" width="3" height="6" fill="currentColor" rx="0.5"/>
      <rect x="8" y="2.5" width="3" height="9" fill="currentColor" rx="0.5"/>
    </svg>
  )
}
function alignBottomSVG() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <line x1="1" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="3" y="5" width="3" height="6" fill="currentColor" rx="0.5"/>
      <rect x="8" y="2" width="3" height="9" fill="currentColor" rx="0.5"/>
    </svg>
  )
}
function distVSVG() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <line x1="2" y1="2" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="2" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="4" y="4.5" width="6" height="5" fill="currentColor" rx="0.5"/>
    </svg>
  )
}

export function AlignBar({ onAlign, canDistribute }: Props) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginBottom: 3 }}>
        {ACTIONS.slice(0, 4).map((a) => (
          <button
            key={a.type}
            style={{
              ...BTN_STYLE,
              width: '100%',
              opacity: a.type.startsWith('distribute') && !canDistribute ? 0.4 : 1,
              cursor: a.type.startsWith('distribute') && !canDistribute ? 'default' : 'pointer',
            }}
            title={a.title}
            onClick={() => onAlign(a.type)}
            disabled={a.type.startsWith('distribute') && !canDistribute}
          >
            {a.svg}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
        {ACTIONS.slice(4).map((a) => (
          <button
            key={a.type}
            style={{
              ...BTN_STYLE,
              width: '100%',
              opacity: a.type.startsWith('distribute') && !canDistribute ? 0.4 : 1,
              cursor: a.type.startsWith('distribute') && !canDistribute ? 'default' : 'pointer',
            }}
            title={a.title}
            onClick={() => onAlign(a.type)}
            disabled={a.type.startsWith('distribute') && !canDistribute}
          >
            {a.svg}
          </button>
        ))}
      </div>
    </div>
  )
}
