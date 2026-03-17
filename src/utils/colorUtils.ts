export interface HSVA { h: number; s: number; v: number; a: number }

export function hexToHsva(hex: string): HSVA {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length === 6) h += 'ff'
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const a = parseInt(h.slice(6, 8), 16) / 255
  return { ...rgbToHsv(r, g, b), a }
}

export function hsvaToHex({ h, s, v, a }: HSVA): string {
  const [r, g, b] = hsvToRgb(h, s, v)
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0')
  const alpha = Math.round(a * 255)
  return '#' + toHex(r) + toHex(g) + toHex(b) + (alpha < 255 ? toHex(alpha / 255) : '')
}

export function hsvaToRgbaStr({ h, s, v, a }: HSVA): string {
  const [r, g, b] = hsvToRgb(h, s, v)
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return { h: h * 360, s: max === 0 ? 0 : d / max * 100, v: max * 100 }
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = h / 360; s = s / 100; v = v / 100
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0: return [v, t, p]
    case 1: return [q, v, p]
    case 2: return [p, v, t]
    case 3: return [p, q, v]
    case 4: return [t, p, v]
    default: return [v, p, q]
  }
}

export function isValidHex(hex: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)
}

export const COLOR_PRESETS = [
  // Grays
  '#000000', '#3d3d3d', '#7a7a7a', '#b8b8b8', '#ffffff',
  // Reds / Pinks
  '#e94560', '#ff3b30', '#ff6b6b', '#c0392b', '#ff2d55',
  // Oranges / Yellows
  '#ff9500', '#ff6b35', '#f5c842', '#ffcc00', '#ffd60a',
  // Greens
  '#34c759', '#2ecc71', '#00c853', '#06d6a0', '#2a9d8f',
  // Blues
  '#007aff', '#0080ff', '#457b9d', '#1d3557', '#264653',
  // Purples
  '#6c3ac4', '#5856d6', '#af52de', '#8000ff', '#7209b7',
  // Teals / Cyans
  '#00b4d8', '#0077b6', '#00cfcf', '#4cc9f0', '#48cae4',
  // Misc
  '#e76f51', '#a8dadc', '#f1faee', '#e63946', '#533483',
]
