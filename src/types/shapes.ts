export type ShapeType = 'rect' | 'circle' | 'ellipse' | 'line' | 'path' | 'text' | 'polygon'

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
  | 'pan'

export interface BaseShape {
  id: string
  type: ShapeType
  fill: string
  fillOpacity: number
  stroke: string
  strokeWidth: number
  strokeDasharray: string  // e.g. '' | '4 4' | '2 4' | '8 4 2 4'
  strokeLinecap: 'butt' | 'round' | 'square'
  opacity: number
  rotation: number
  locked: boolean
  visible: boolean
  name: string
  flipX?: boolean
  flipY?: boolean
  gradientFill?: GradientFill
  groupId?: string
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
}

export interface PolygonShape extends BaseShape {
  type: 'polygon'
  cx: number
  cy: number
  size: number
  sides: number
  innerRadius: number // 0 = regular polygon, 0-1 = star ratio
  isStar: boolean
}

export type Shape =
  | RectShape
  | CircleShape
  | EllipseShape
  | LineShape
  | PathShape
  | TextShape
  | PolygonShape

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
