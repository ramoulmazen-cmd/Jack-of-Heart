// geom.mjs — geometry, raster masks and line tools for the engraved court card.
// Plain Node, no packages.

// ---------- numbers and compact path output
export function num(v, d = 1) {
  const m = 10 ** d;
  let r = Math.round(v * m) / m;
  if (Object.is(r, -0)) r = 0;
  let s = String(r);
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = '-' + s.slice(2);
  return s;
}
const sep = (s) => (s.startsWith('-') ? s : ' ' + s);

// absolute first point, then relative steps in exact tenths (no drift)
export function polyD(pts, close = true) {
  if (pts.length < 2) return '';
  let px = Math.round(pts[0][0] * 10), py = Math.round(pts[0][1] * 10);
  let out = 'M' + num(px / 10) + sep(num(py / 10));
  let first = true;
  for (let i = 1; i < pts.length; i++) {
    const X = Math.round(pts[i][0] * 10), Y = Math.round(pts[i][1] * 10);
    const dx = X - px, dy = Y - py;
    if (dx === 0 && dy === 0) continue;
    const a = num(dx / 10), b = num(dy / 10);
    out += (first ? 'l' + a : sep(a)) + sep(b);
    first = false;
    px = X; py = Y;
  }
  return out + (close ? 'z' : '');
}

// ---------- path parsing (absolute M L C Q Z H V) and flattening
export function parsePath(d) {
  const toks = d.match(/[MLCQZHVmlcqzhv]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const subs = [];
  let cur = null, i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0;
  const nextNum = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    if (cmd === 'M') { x = nextNum(); y = nextNum(); sx = x; sy = y; cur = { start: [x, y], segs: [], closed: false }; subs.push(cur); cmd = 'L'; }
    else if (cmd === 'L') { const nx = nextNum(), ny = nextNum(); cur.segs.push({ t: 'L', p: [[x, y], [nx, ny]] }); x = nx; y = ny; }
    else if (cmd === 'H') { const nx = nextNum(); cur.segs.push({ t: 'L', p: [[x, y], [nx, y]] }); x = nx; }
    else if (cmd === 'V') { const ny = nextNum(); cur.segs.push({ t: 'L', p: [[x, y], [x, ny]] }); y = ny; }
    else if (cmd === 'C') { const a = [nextNum(), nextNum()], b = [nextNum(), nextNum()], c = [nextNum(), nextNum()]; cur.segs.push({ t: 'C', p: [[x, y], a, b, c] }); x = c[0]; y = c[1]; }
    else if (cmd === 'Q') { const a = [nextNum(), nextNum()], c = [nextNum(), nextNum()]; cur.segs.push({ t: 'Q', p: [[x, y], a, c] }); x = c[0]; y = c[1]; }
    else if (cmd === 'Z' || cmd === 'z') { if (x !== sx || y !== sy) cur.segs.push({ t: 'L', p: [[x, y], [sx, sy]] }); cur.closed = true; x = sx; y = sy; cmd = null; }
    // Relative commands: the compact paths this file writes itself (l-.1-.3 ...).
    else if (cmd === 'm') { x += nextNum(); y += nextNum(); sx = x; sy = y; cur = { start: [x, y], segs: [], closed: false }; subs.push(cur); cmd = 'l'; }
    else if (cmd === 'l') { const nx = x + nextNum(), ny = y + nextNum(); cur.segs.push({ t: 'L', p: [[x, y], [nx, ny]] }); x = nx; y = ny; }
    else if (cmd === 'h') { const nx = x + nextNum(); cur.segs.push({ t: 'L', p: [[x, y], [nx, y]] }); x = nx; }
    else if (cmd === 'v') { const ny = y + nextNum(); cur.segs.push({ t: 'L', p: [[x, y], [x, ny]] }); y = ny; }
    else if (cmd === 'c') { const a = [x + nextNum(), y + nextNum()], b = [x + nextNum(), y + nextNum()], c = [x + nextNum(), y + nextNum()]; cur.segs.push({ t: 'C', p: [[x, y], a, b, c] }); x = c[0]; y = c[1]; }
    else if (cmd === 'q') { const a = [x + nextNum(), y + nextNum()], c = [x + nextNum(), y + nextNum()]; cur.segs.push({ t: 'Q', p: [[x, y], a, c] }); x = c[0]; y = c[1]; }
    else throw new Error('bad path token ' + toks[i] + ' in ' + d.slice(0, 60));
  }
  return subs;
}
const bez3 = (p, t) => { const u = 1 - t; return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]]; };
const bez2 = (p, t) => { const u = 1 - t; return [u * u * p[0][0] + 2 * u * t * p[1][0] + t * t * p[2][0], u * u * p[0][1] + 2 * u * t * p[1][1] + t * t * p[2][1]]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function flatten(d, step = 0.5) {
  return parsePath(d).map((s) => {
    const pts = [s.start.slice()];
    for (const g of s.segs) {
      let len = 0;
      for (let k = 1; k < g.p.length; k++) len += dist(g.p[k - 1], g.p[k]);
      const n = Math.max(1, Math.ceil(len / step));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        pts.push(g.t === 'C' ? bez3(g.p, t) : g.t === 'Q' ? bez2(g.p, t) : [g.p[0][0] + (g.p[1][0] - g.p[0][0]) * t, g.p[0][1] + (g.p[1][1] - g.p[0][1]) * t]);
      }
    }
    return { pts, closed: s.closed };
  });
}
// resample a polyline at even arc-length spacing
export function resample(pts, step) {
  const out = [pts[0].slice()];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1], b = pts[i];
    let seg = dist(a, b);
    while (acc + seg >= step) {
      const t = (step - acc) / seg;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push(p);
      a = p; seg = dist(a, b); acc = 0;
    }
    acc += seg;
  }
  if (dist(out[out.length - 1], pts[pts.length - 1]) > step * 0.3) out.push(pts[pts.length - 1].slice());
  return out;
}

// ---------- raster grid over the top half of the panel
export const G = { x0: 86, y0: 34, res: 0.5 };
G.W = Math.round((414 - G.x0) / G.res);
G.H = Math.round((430 - G.y0) / G.res);
const N = G.W * G.H;

export function rasterize(d) {
  const polys = flatten(d, 0.35).map((s) => s.pts);
  const m = new Uint8Array(N);
  for (let j = 0; j < G.H; j++) {
    const y = G.y0 + (j + 0.5) * G.res;
    const xs = [];
    for (const P of polys) {
      for (let k = 0, n = P.length; k < n; k++) {
        const a = P[k], b = P[(k + 1) % n];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - G.x0) / G.res - 0.5));
      const i1 = Math.min(G.W - 1, Math.floor((xs[k + 1] - G.x0) / G.res - 0.5));
      for (let i = i0; i <= i1; i++) m[j * G.W + i] ^= 1;
    }
  }
  return m;
}
export const mOr = (...ms) => { const o = new Uint8Array(N); for (const m of ms) for (let i = 0; i < N; i++) o[i] |= m[i]; return o; };
export const mSub = (a, b) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = a[i] && !b[i] ? 1 : 0; return o; };
export const mAnd = (a, b) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = a[i] && b[i] ? 1 : 0; return o; };
export const mEmpty = () => new Uint8Array(N);

// exact Euclidean distance transform (Felzenszwalb-Huttenlocher), returns distance in units
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) { s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
export function edt(mask) {
  // distance from each inside cell to the nearest outside cell
  const INF = 1e10, f = new Float64Array(N);
  for (let i = 0; i < N; i++) f[i] = mask[i] ? INF : 0;
  const n = Math.max(G.W, G.H), col = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < G.W; i++) {
    for (let j = 0; j < G.H; j++) col[j] = f[j * G.W + i];
    edt1(col, G.H, d, v, z);
    for (let j = 0; j < G.H; j++) f[j * G.W + i] = d[j];
  }
  for (let j = 0; j < G.H; j++) {
    for (let i = 0; i < G.W; i++) col[i] = f[j * G.W + i];
    edt1(col, G.W, d, v, z);
    for (let i = 0; i < G.W; i++) f[j * G.W + i] = d[i];
  }
  const o = new Float32Array(N);
  for (let i = 0; i < N; i++) o[i] = Math.sqrt(f[i]) * G.res;
  return o;
}
export function sdf(mask) {
  const din = edt(mask), inv = new Uint8Array(N);
  for (let i = 0; i < N; i++) inv[i] = mask[i] ? 0 : 1;
  const dout = edt(inv), o = new Float32Array(N);
  for (let i = 0; i < N; i++) o[i] = mask[i] ? din[i] - G.res / 2 : -(dout[i] - G.res / 2);
  return o;
}
export function blur(f, r) {
  // three box passes ~ gaussian; r in units
  const rr = Math.max(1, Math.round(r / G.res));
  let a = Float32Array.from(f), b = new Float32Array(N);
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < G.H; j++) {
      let s = 0; const row = j * G.W;
      for (let i = -rr; i <= rr; i++) s += a[row + Math.min(G.W - 1, Math.max(0, i))];
      for (let i = 0; i < G.W; i++) { b[row + i] = s / (2 * rr + 1); s += a[row + Math.min(G.W - 1, i + rr + 1)] - a[row + Math.max(0, i - rr)]; }
    }
    for (let i = 0; i < G.W; i++) {
      let s = 0;
      for (let j = -rr; j <= rr; j++) s += b[Math.min(G.H - 1, Math.max(0, j)) * G.W + i];
      for (let j = 0; j < G.H; j++) { a[j * G.W + i] = s / (2 * rr + 1); s += b[Math.min(G.H - 1, j + rr + 1) * G.W + i] - b[Math.max(0, j - rr) * G.W + i]; }
    }
  }
  return a;
}
export function sample(f, x, y) {
  let gx = (x - G.x0) / G.res - 0.5, gy = (y - G.y0) / G.res - 0.5;
  if (gx < 0) gx = 0; if (gy < 0) gy = 0; if (gx > G.W - 1.001) gx = G.W - 1.001; if (gy > G.H - 1.001) gy = G.H - 1.001;
  const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, k = j * G.W + i;
  return (f[k] * (1 - fx) + f[k + 1] * fx) * (1 - fy) + (f[k + G.W] * (1 - fx) + f[k + G.W + 1] * fx) * fy;
}
export function field(fn) { const o = new Float32Array(N); for (let j = 0; j < G.H; j++) for (let i = 0; i < G.W; i++) o[j * G.W + i] = fn(G.x0 + (i + 0.5) * G.res, G.y0 + (j + 0.5) * G.res); return o; }
export function grad(f, x, y, h = 0.75) { return [(sample(f, x + h, y) - sample(f, x - h, y)) / (2 * h), (sample(f, x, y + h) - sample(f, x, y - h)) / (2 * h)]; }

// ---------- ribbons: variable-width strokes as filled polygons (engraved, swelling lines)
export function ribbon(pts, ws) {
  const n = pts.length;
  if (n < 2) return '';
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const h = Math.max(0, ws[i]) / 2;
    L.push([pts[i][0] - ty * h, pts[i][1] + tx * h]);
    R.push([pts[i][0] + ty * h, pts[i][1] - tx * h]);
  }
  return polyD(L.concat(R.reverse()));
}
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const gauss = (x, y, cx, cy, rx, ry, ang = 0) => {
  const c = Math.cos(ang), s = Math.sin(ang), dx = x - cx, dy = y - cy;
  const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
  return Math.exp(-(u * u + v * v));
};

// split a sampled line into runs inside a region (sdf > margin) where width > cut; returns ribbons
export function runsToRibbons(pts, ws, inside, opt = {}) {
  const cut = opt.cut ?? 0.1, taper = opt.taper ?? 1.2;
  const out = [];
  let run = [], rw = [];
  const flush = () => {
    if (run.length >= 2) {
      // taper ends
      let acc = [0];
      for (let i = 1; i < run.length; i++) acc.push(acc[i - 1] + dist(run[i - 1], run[i]));
      const total = acc[acc.length - 1];
      if (total > (opt.minLen ?? 1.2)) {
        const w2 = rw.map((w, i) => w * Math.min(1, (0.35 + 0.65 * smooth(0, taper, acc[i])) * (0.35 + 0.65 * smooth(0, taper, total - acc[i]))));
        out.push(ribbon(run, w2));
      }
    }
    run = []; rw = [];
  };
  for (let i = 0; i < pts.length; i++) {
    const ok = inside[i] > 0 && ws[i] > cut;
    if (ok) {
      if (!run.length && i > 0 && inside[i - 1] <= 0 && inside[i] > 0) {
        // exact boundary entry
        const t = inside[i - 1] / (inside[i - 1] - inside[i]);
        run.push([lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)]); rw.push(ws[i]);
      }
      run.push(pts[i]); rw.push(ws[i]);
    } else {
      if (run.length && i > 0 && inside[i] <= 0 && inside[i - 1] > 0) {
        const t = inside[i - 1] / (inside[i - 1] - inside[i]);
        run.push([lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)]); rw.push(ws[i - 1]);
      }
      flush();
    }
  }
  flush();
  return out;
}
export { dist };
