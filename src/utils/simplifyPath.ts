interface Pt { x: number; y: number }

function perpDist(pt: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  if (dx === 0 && dy === 0) return Math.hypot(pt.x - a.x, pt.y - a.y)
  const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy)
  return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy))
}

function rdp(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts
  let maxD = 0, maxI = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > maxD) { maxD = d; maxI = i }
  }
  if (maxD > tol) {
    return [...rdp(pts.slice(0, maxI + 1), tol).slice(0, -1), ...rdp(pts.slice(maxI), tol)]
  }
  return [pts[0], pts[pts.length - 1]]
}

function pathToPts(d: string): Pt[] {
  const pts: Pt[] = []
  const tok = d.match(/[MmLlZzHhVvCcSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []
  let x = 0, y = 0, i = 0
  const n = (o: number) => parseFloat(tok[i + o] ?? '0')
  while (i < tok.length) {
    const c = tok[i]
    if (c === 'M') { x=n(1); y=n(2); pts.push({x,y}); i+=3 }
    else if (c === 'm') { x+=n(1); y+=n(2); pts.push({x,y}); i+=3 }
    else if (c === 'L') { x=n(1); y=n(2); pts.push({x,y}); i+=3 }
    else if (c === 'l') { x+=n(1); y+=n(2); pts.push({x,y}); i+=3 }
    else if (c === 'H') { x=n(1); pts.push({x,y}); i+=2 }
    else if (c === 'h') { x+=n(1); pts.push({x,y}); i+=2 }
    else if (c === 'V') { y=n(1); pts.push({x,y}); i+=2 }
    else if (c === 'v') { y+=n(1); pts.push({x,y}); i+=2 }
    else if (c === 'C') {
      const [x1,y1,x2,y2,ex,ey]=[n(1),n(2),n(3),n(4),n(5),n(6)]
      for (let t=.125;t<=1;t+=.125){const m=1-t;pts.push({x:m*m*m*x+3*m*m*t*x1+3*m*t*t*x2+t*t*t*ex,y:m*m*m*y+3*m*m*t*y1+3*m*t*t*y2+t*t*t*ey})}
      x=ex;y=ey;i+=7
    }
    else if (c === 'c') {
      const [x1,y1,x2,y2,ex,ey]=[n(1),n(2),n(3),n(4),n(5),n(6)]
      for (let t=.125;t<=1;t+=.125){const m=1-t,ax=x+x1,ay=y+y1,bx=x+x2,by=y+y2,dx=x+ex,dy=y+ey;pts.push({x:m*m*m*x+3*m*m*t*ax+3*m*t*t*bx+t*t*t*dx,y:m*m*m*y+3*m*m*t*ay+3*m*t*t*by+t*t*t*dy})}
      x+=ex;y+=ey;i+=7
    }
    else if (c === 'Q') {
      const [cx,cy,ex,ey]=[n(1),n(2),n(3),n(4)]
      for (let t=.125;t<=1;t+=.125){const m=1-t;pts.push({x:m*m*x+2*m*t*cx+t*t*ex,y:m*m*y+2*m*t*cy+t*t*ey})}
      x=ex;y=ey;i+=5
    }
    else if (c==='Z'||c==='z') i++
    else i++
  }
  return pts
}

export function simplifyPath(d: string, tolerance: number): string {
  const pts = pathToPts(d)
  if (pts.length < 3) return d
  const simplified = rdp(pts, tolerance)
  if (simplified.length < 2) return d
  return 'M ' + simplified.map((p, i) => `${i > 0 ? 'L ' : ''}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ' Z'
}
