import type { Shape } from '../types/shapes'

export interface ShapePreset {
  id: string
  name: string
  category: string
  // Returns shape data centered at (cx, cy) with the given size
  create: (cx: number, cy: number, size: number) => Omit<Shape, 'id'>
  // SVG path/element string for the thumbnail preview (viewBox 0 0 100 100)
  preview: string
}

const BASE = {
  fill: '#e94560',
  fillOpacity: 1,
  stroke: 'none',
  strokeWidth: 1,
  strokeDasharray: '',
  strokeLinecap: 'round' as const,
  opacity: 1,
  rotation: 0,
  locked: false,
  visible: true,
}

function poly(sides: number, cx: number, cy: number, size: number, innerRadius = 0, isStar = false) {
  return { ...BASE, type: 'polygon' as const, cx, cy, size, sides, innerRadius, isStar, name: '' }
}

function pathAt(d100: string, cx: number, cy: number, size: number, name: string): Omit<Shape, 'id'> {
  // d100 is defined in a 0-100 box centered at 50,50
  // Scale and translate to (cx, cy) with given size
  const scale = size / 50
  const d = d100.replace(/([-\d.]+)\s+([-\d.]+)/g, (_, x, y) => {
    const nx = (parseFloat(x) - 50) * scale + cx
    const ny = (parseFloat(y) - 50) * scale + cy
    return `${+nx.toFixed(2)} ${+ny.toFixed(2)}`
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...BASE, type: 'path', d, name } as any
}

// ── Path data (100×100 box, centered at 50,50) ─────────────────────────────

const ARROW_RIGHT =
  'M 15 38 L 58 38 L 58 22 L 85 50 L 58 78 L 58 62 L 15 62 Z'
const ARROW_LEFT =
  'M 85 38 L 42 38 L 42 22 L 15 50 L 42 78 L 42 62 L 85 62 Z'
const ARROW_UP =
  'M 38 85 L 38 42 L 22 42 L 50 15 L 78 42 L 62 42 L 62 85 Z'
const ARROW_DOWN =
  'M 38 15 L 38 58 L 22 58 L 50 85 L 78 58 L 62 58 L 62 15 Z'
const ARROW_DOUBLE_H =
  'M 5 50 L 30 25 L 30 38 L 70 38 L 70 25 L 95 50 L 70 75 L 70 62 L 30 62 L 30 75 Z'

const CHEVRON_RIGHT =
  'M 28 8 L 72 50 L 28 92 L 16 80 L 52 50 L 16 20 Z'
const CHEVRON_LEFT =
  'M 72 8 L 28 50 L 72 92 L 84 80 L 48 50 L 84 20 Z'

const PLUS =
  'M 35 5 L 65 5 L 65 35 L 95 35 L 95 65 L 65 65 L 65 95 L 35 95 L 35 65 L 5 65 L 5 35 L 35 35 Z'

const HEART =
  'M 50 82 C 50 82 8 58 8 30 C 8 15 20 8 32 10 C 40 12 50 20 50 20 C 50 20 60 12 68 10 C 80 8 92 15 92 30 C 92 58 50 82 50 82 Z'

const CHECKMARK =
  'M 8 52 L 35 78 L 92 18 L 80 8 L 35 62 L 20 44 Z'

const CLOSE_X =
  'M 15 5 L 50 40 L 85 5 L 95 15 L 60 50 L 95 85 L 85 95 L 50 60 L 15 95 L 5 85 L 40 50 L 5 15 Z'

const SHIELD =
  'M 50 5 L 88 18 L 88 52 C 88 72 70 88 50 96 C 30 88 12 72 12 52 L 12 18 Z'

const SPEECH_BUBBLE =
  'M 10 10 L 90 10 L 90 68 L 45 68 L 30 90 L 30 68 L 10 68 Z'

const CLOUD =
  'M 28 72 C 10 72 5 55 16 47 C 13 28 32 18 47 28 C 52 17 68 14 78 25 C 93 20 100 36 91 49 C 101 53 99 72 86 72 Z'

const LIGHTNING =
  'M 62 5 L 24 55 L 48 55 L 38 95 L 76 45 L 52 45 Z'

const DIAMOND =
  'M 50 5 L 95 50 L 50 95 L 5 50 Z'

const PARALLELOGRAM =
  'M 20 15 L 95 15 L 80 85 L 5 85 Z'

const RIBBON_BADGE =
  'M 50 5 L 62 30 L 90 33 L 70 53 L 75 80 L 50 68 L 25 80 L 30 53 L 10 33 L 38 30 Z'

const HOME =
  'M 50 10 L 90 48 L 78 48 L 78 90 L 58 90 L 58 65 L 42 65 L 42 90 L 22 90 L 22 48 L 10 48 Z'

const FLAG =
  'M 20 5 L 20 95 L 30 95 L 30 55 L 85 30 L 30 5 Z'

const LOCATION_PIN =
  'M 50 5 C 28 5 12 22 12 42 C 12 62 50 95 50 95 C 50 95 88 62 88 42 C 88 22 72 5 50 5 Z M 50 54 C 43 54 37 48 37 41 C 37 34 43 28 50 28 C 57 28 63 34 63 41 C 63 48 57 54 50 54 Z'

// ── Preset list ────────────────────────────────────────────────────────────

export const SHAPE_PRESETS: ShapePreset[] = [
  // ── Polygons ──
  {
    id: 'triangle',
    name: 'Triangle',
    category: 'Shapes',
    create: (cx, cy, size) => ({ ...poly(3, cx, cy, size), name: 'Triangle' }),
    preview: '<polygon points="50,8 92,88 8,88" fill="currentColor"/>',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    category: 'Shapes',
    create: (cx, cy, size) => ({ ...pathAt(DIAMOND, cx, cy, size, 'Diamond') }),
    preview: '<polygon points="50,5 95,50 50,95 5,50" fill="currentColor"/>',
  },
  {
    id: 'pentagon',
    name: 'Pentagon',
    category: 'Shapes',
    create: (cx, cy, size) => ({ ...poly(5, cx, cy, size), name: 'Pentagon' }),
    preview: '<polygon points="50,5 95,35 78,90 22,90 5,35" fill="currentColor"/>',
  },
  {
    id: 'hexagon',
    name: 'Hexagon',
    category: 'Shapes',
    create: (cx, cy, size) => ({ ...poly(6, cx, cy, size), name: 'Hexagon' }),
    preview: '<polygon points="50,5 93,27 93,73 50,95 7,73 7,27" fill="currentColor"/>',
  },
  {
    id: 'octagon',
    name: 'Octagon',
    category: 'Shapes',
    create: (cx, cy, size) => ({ ...poly(8, cx, cy, size), name: 'Octagon' }),
    preview: '<polygon points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30" fill="currentColor"/>',
  },
  {
    id: 'star5',
    name: 'Star 5pt',
    category: 'Shapes',
    create: (cx, cy, size) => ({ ...poly(5, cx, cy, size, 0.42, true), name: 'Star' }),
    preview: '<polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill="currentColor"/>',
  },
  {
    id: 'star6',
    name: 'Star 6pt',
    category: 'Shapes',
    create: (cx, cy, size) => ({ ...poly(6, cx, cy, size, 0.5, true), name: 'Star 6' }),
    preview: '<polygon points="50,5 61,27 86,15 74,38 95,50 74,62 86,85 61,73 50,95 39,73 14,85 26,62 5,50 26,38 14,15 39,27" fill="currentColor"/>',
  },
  {
    id: 'star8',
    name: 'Star 8pt',
    category: 'Shapes',
    create: (cx, cy, size) => ({ ...poly(8, cx, cy, size, 0.5, true), name: 'Star 8' }),
    preview: '<polygon points="50,5 58,32 80,18 68,42 95,50 68,58 80,82 58,68 50,95 42,68 20,82 32,58 5,50 32,42 20,18 42,32" fill="currentColor"/>',
  },
  {
    id: 'ribbon',
    name: 'Badge Star',
    category: 'Shapes',
    create: (cx, cy, size) => pathAt(RIBBON_BADGE, cx, cy, size, 'Badge'),
    preview: `<path d="${RIBBON_BADGE}" fill="currentColor"/>`,
  },
  // ── Arrows ──
  {
    id: 'arrow-right',
    name: 'Arrow Right',
    category: 'Arrows',
    create: (cx, cy, size) => pathAt(ARROW_RIGHT, cx, cy, size, 'Arrow Right'),
    preview: `<path d="${ARROW_RIGHT}" fill="currentColor"/>`,
  },
  {
    id: 'arrow-left',
    name: 'Arrow Left',
    category: 'Arrows',
    create: (cx, cy, size) => pathAt(ARROW_LEFT, cx, cy, size, 'Arrow Left'),
    preview: `<path d="${ARROW_LEFT}" fill="currentColor"/>`,
  },
  {
    id: 'arrow-up',
    name: 'Arrow Up',
    category: 'Arrows',
    create: (cx, cy, size) => pathAt(ARROW_UP, cx, cy, size, 'Arrow Up'),
    preview: `<path d="${ARROW_UP}" fill="currentColor"/>`,
  },
  {
    id: 'arrow-down',
    name: 'Arrow Down',
    category: 'Arrows',
    create: (cx, cy, size) => pathAt(ARROW_DOWN, cx, cy, size, 'Arrow Down'),
    preview: `<path d="${ARROW_DOWN}" fill="currentColor"/>`,
  },
  {
    id: 'arrow-double',
    name: 'Arrow Double',
    category: 'Arrows',
    create: (cx, cy, size) => pathAt(ARROW_DOUBLE_H, cx, cy, size, 'Arrow Double'),
    preview: `<path d="${ARROW_DOUBLE_H}" fill="currentColor"/>`,
  },
  {
    id: 'chevron-right',
    name: 'Chevron Right',
    category: 'Arrows',
    create: (cx, cy, size) => pathAt(CHEVRON_RIGHT, cx, cy, size, 'Chevron'),
    preview: `<path d="${CHEVRON_RIGHT}" fill="currentColor"/>`,
  },
  {
    id: 'chevron-left',
    name: 'Chevron Left',
    category: 'Arrows',
    create: (cx, cy, size) => pathAt(CHEVRON_LEFT, cx, cy, size, 'Chevron Left'),
    preview: `<path d="${CHEVRON_LEFT}" fill="currentColor"/>`,
  },
  // ── Icons ──
  {
    id: 'plus',
    name: 'Plus',
    category: 'Icons',
    create: (cx, cy, size) => pathAt(PLUS, cx, cy, size, 'Plus'),
    preview: `<path d="${PLUS}" fill="currentColor"/>`,
  },
  {
    id: 'checkmark',
    name: 'Checkmark',
    category: 'Icons',
    create: (cx, cy, size) => pathAt(CHECKMARK, cx, cy, size, 'Checkmark'),
    preview: `<path d="${CHECKMARK}" fill="currentColor"/>`,
  },
  {
    id: 'close-x',
    name: 'Close X',
    category: 'Icons',
    create: (cx, cy, size) => pathAt(CLOSE_X, cx, cy, size, 'Close'),
    preview: `<path d="${CLOSE_X}" fill="currentColor"/>`,
  },
  {
    id: 'heart',
    name: 'Heart',
    category: 'Icons',
    create: (cx, cy, size) => pathAt(HEART, cx, cy, size, 'Heart'),
    preview: `<path d="${HEART}" fill="currentColor"/>`,
  },
  {
    id: 'shield',
    name: 'Shield',
    category: 'Icons',
    create: (cx, cy, size) => pathAt(SHIELD, cx, cy, size, 'Shield'),
    preview: `<path d="${SHIELD}" fill="currentColor"/>`,
  },
  {
    id: 'speech',
    name: 'Speech Bubble',
    category: 'Icons',
    create: (cx, cy, size) => pathAt(SPEECH_BUBBLE, cx, cy, size, 'Speech Bubble'),
    preview: `<path d="${SPEECH_BUBBLE}" fill="currentColor"/>`,
  },
  {
    id: 'cloud',
    name: 'Cloud',
    category: 'Icons',
    create: (cx, cy, size) => pathAt(CLOUD, cx, cy, size, 'Cloud'),
    preview: `<path d="${CLOUD}" fill="currentColor"/>`,
  },
  {
    id: 'lightning',
    name: 'Lightning',
    category: 'Icons',
    create: (cx, cy, size) => pathAt(LIGHTNING, cx, cy, size, 'Lightning'),
    preview: `<path d="${LIGHTNING}" fill="currentColor"/>`,
  },
  {
    id: 'home',
    name: 'Home',
    category: 'Icons',
    create: (cx, cy, size) => pathAt(HOME, cx, cy, size, 'Home'),
    preview: `<path d="${HOME}" fill="currentColor"/>`,
  },
  {
    id: 'flag',
    name: 'Flag',
    category: 'Icons',
    create: (cx, cy, size) => pathAt(FLAG, cx, cy, size, 'Flag'),
    preview: `<path d="${FLAG}" fill="currentColor"/>`,
  },
  {
    id: 'location',
    name: 'Location Pin',
    category: 'Icons',
    create: (cx, cy, size) => pathAt(LOCATION_PIN, cx, cy, size, 'Location'),
    preview: `<path d="${LOCATION_PIN}" fill="currentColor" fill-rule="evenodd"/>`,
  },
  {
    id: 'parallelogram',
    name: 'Parallelogram',
    category: 'Shapes',
    create: (cx, cy, size) => pathAt(PARALLELOGRAM, cx, cy, size, 'Parallelogram'),
    preview: `<path d="${PARALLELOGRAM}" fill="currentColor"/>`,
  },
]

export const PRESET_CATEGORIES = [...new Set(SHAPE_PRESETS.map((p) => p.category))]
