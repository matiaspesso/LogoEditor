export type ShapeType = 'rect' | 'circle' | 'ellipse' | 'line' | 'path' | 'text' | 'polygon' | 'frame'

export interface GradientStop {
  offset: number  // 0–1
  color: string
  opacity: number
}

export interface GradientFill {
  type: 'linear' | 'radial'
  stops: GradientStop[]
  angle: number  // degrees, used for linear
}

export interface DropShadow {
  enabled: boolean
  dx: number
  dy: number
  blur: number
  color: string
  opacity: number
}

export interface InnerShadow {
  enabled: boolean
  dx: number
  dy: number
  blur: number
  color: string
  opacity: number
}

export interface GlowEffect {
  enabled: boolean
  blur: number
  color: string
  opacity: number
}

export interface BlurEffect {
  enabled: boolean
  amount: number
}

export interface PatternFill {
  type: 'stripes' | 'dots' | 'grid' | 'crosshatch'
  color: string
  size: number    // pattern cell size in SVG units
  angle: number   // rotation in degrees
}

export interface ShapeFilters {
  shadow?: DropShadow
  blur?: BlurEffect
  innerShadow?: InnerShadow
  glow?: GlowEffect
}

export type ToolType =
  | 'select'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'path'
  | 'text'
  | 'polygon'
  | 'star'
  | 'frame'
  | 'pan'

// Group registry for nested groups
export interface GroupDef {
  id: string
  name: string
  parentGroupId?: string
  collapsed?: boolean
}

// Reusable symbol definition
export interface SymbolDef {
  id: string
  name: string
  shapes: Shape[]
  layerOrder: string[]
}

// Artboard
export interface Artboard {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
}

export interface BaseShape {
  id: string
  type: ShapeType
  fill: string
  fillOpacity: number
  stroke: string
  strokeWidth: number
  strokeDasharray: string
  strokeLinecap: 'butt' | 'round' | 'square'
  strokeLinejoin?: 'miter' | 'round' | 'bevel'
  markerStart?: 'none' | 'arrow' | 'dot' | 'diamond'
  markerEnd?: 'none' | 'arrow' | 'dot' | 'diamond'
  patternFill?: PatternFill
  opacity: number
  rotation: number
  locked: boolean
  visible: boolean
  name: string
  flipX?: boolean
  flipY?: boolean
  gradientFill?: GradientFill
  groupId?: string
  filters?: ShapeFilters
  clippedBy?: string
  isClipSource?: boolean
  skewX?: number
  skewY?: number
}

export interface RectShape extends BaseShape {
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
  rx: number
}

export interface CircleShape extends BaseShape {
  type: 'circle'
  cx: number
  cy: number
  r: number
}

export interface EllipseShape extends BaseShape {
  type: 'ellipse'
  cx: number
  cy: number
  rx: number
  ry: number
}

export interface LineShape extends BaseShape {
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PathShape extends BaseShape {
  type: 'path'
  d: string
}

export interface TextShape extends BaseShape {
  type: 'text'
  x: number
  y: number
  text: string
  fontSize: number
  fontFamily: string
  fontWeight: string
  textAnchor: 'start' | 'middle' | 'end'
  letterSpacing?: number
  charOffsets?: number[]   // per-character cumulative x offset (index i = how far char i is from its natural position)
  textOnArc?: boolean
  arcRadius?: number
  arcDirection?: 'up' | 'down'
  arcOffset?: number
}

export interface PolygonShape extends BaseShape {
  type: 'polygon'
  cx: number
  cy: number
  size: number
  sides: number
  innerRadius: number
  isStar: boolean
}

export interface FrameShape extends BaseShape {
  type: 'frame'
  x: number
  y: number
  width: number
  height: number
}

export type Shape =
  | RectShape
  | CircleShape
  | EllipseShape
  | LineShape
  | PathShape
  | TextShape
  | PolygonShape
  | FrameShape

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export const CANVAS_PRESETS = [
  { label: '16×16', width: 16, height: 16 },
  { label: '24×24', width: 24, height: 24 },
  { label: '32×32', width: 32, height: 32 },
  { label: '48×48', width: 48, height: 48 },
  { label: '64×64', width: 64, height: 64 },
  { label: '128×128', width: 128, height: 128 },
  { label: '256×256', width: 256, height: 256 },
  { label: '512×512', width: 512, height: 512 },
]

export const EXPORT_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
