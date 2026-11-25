// shapes.mjs — the drawing: the Jack (top half, facing left), card units 500 x 700.
// Every shape is a closed path; hidden parts are allowed (front shapes cover them).

export const DIV = { cx: 250, cy: 350, slope: -0.34 }; // the diagonal where the two faces meet
export const divY = (x) => DIV.cy + DIV.slope * (x - DIV.cx);

const P = (pts) => 'M' + pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' L') + ' Z';
const f2 = (p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2);

// smooth path through points (Catmull-Rom as cubic Beziers); a point [x, y, 1] is a sharp corner
export function smoothPath(pts, closed = true, t = 1) {
  const n = pts.length;
  const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = 'M' + f2(pts[0]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const k1 = p1[2] ? 0 : t / 6, k2 = p2[2] ? 0 : t / 6;
    const c1 = [p1[0] + (p2[0] - p0[0]) * k1, p1[1] + (p2[1] - p0[1]) * k1];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k2, p2[1] - (p3[1] - p1[1]) * k2];
    d += ' C' + f2(c1) + ' ' + f2(c2) + ' ' + f2(p2);
  }
  return d + (closed ? ' Z' : '');
}

// ---- cap brim: a stiff turned-up band seen from the side, its top edge slashed into tabs
export const BRIM = { x0: 147, x1: 300, yb0: 106.5, yb1: 98, h: 13, tabs: 9, notch: 4.2, sag: 2.2 };
export const brimBottom = (x) => {
  const t = (x - BRIM.x0) / (BRIM.x1 - BRIM.x0);
  return BRIM.yb0 + t * (BRIM.yb1 - BRIM.yb0) + BRIM.sag * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
};
export function brimNotches() {
  // notch x positions, foreshortened like points on a ring seen edge-on
  const cx = (BRIM.x0 + BRIM.x1) / 2, rx = (BRIM.x1 - BRIM.x0) / 2 - 3, out = [];
  for (let k = 1; k < BRIM.tabs; k++) out.push(cx - rx * Math.cos((k * Math.PI) / BRIM.tabs));
  return out;
}
function brimPath() {
  const pts = [], nx = brimNotches(), r = 4.5;
  const top = (x) => brimBottom(x) - BRIM.h;
  for (let x = BRIM.x0 + r; x <= BRIM.x1 - r; x += 2) pts.push([x, brimBottom(x)]);
  for (let a = 0; a <= 180; a += 15) {
    const t = (a * Math.PI) / 180, cxB = BRIM.x1 - r, cyB = (brimBottom(cxB) + top(cxB)) / 2;
    pts.push([cxB + r * Math.sin(t), cyB + (BRIM.h / 2) * Math.cos(t)]);
  }
  const edges = [BRIM.x1 - r, ...nx.slice().reverse(), BRIM.x0 + r];
  for (let k = 0; k + 1 < edges.length; k++) {
    const xa = edges[k], xb = edges[k + 1];
    for (let s = 0; s <= 1.0001; s += 1 / 8) {
      const x = xa + (xb - xa) * s;
      const isEnd = k === 0 || k === edges.length - 2;
      const dip = BRIM.notch * (1 - Math.sin(Math.PI * s) ** 0.6);
      const d = isEnd ? (k === 0 ? (s < 0.5 ? 0 : dip) : s > 0.5 ? 0 : dip) : dip;
      pts.push([x, top(x) + d]);
    }
  }
  for (let a = 180; a <= 360; a += 15) {
    const t = (a * Math.PI) / 180, cxF = BRIM.x0 + r, cyF = (brimBottom(cxF) + top(cxF)) / 2;
    pts.push([cxF + r * Math.sin(t), cyF - (BRIM.h / 2) * Math.cos(t)]);
  }
  return P(pts);
}

// ---- the soft crown: gathered into the band, puffed above it, drooping over the back
export const CROWN_PTS = [
  [151, 95], [146, 87.5], [147.5, 79], [155, 71], [169, 64], [190, 59.8], [215, 58.2], [240, 58.5],
  [264, 60.8], [285, 65.5], [303, 72], [317, 80], [325, 88.5], [323.5, 95.5], [313.5, 99], [301, 96.5, 1],
  [262, 93, 1], [200, 97, 1],
];

// ---- hair: locks between a wavy front edge and the back, front to back, top to bottom
export const hairGuides = [
  [[197, 97], [201.5, 118], [206.5, 138], [211.5, 158], [216, 178], [220, 197], [223, 216], [226.5, 234], [231.5, 250], [239, 262]],
  [[217, 97], [221, 121], [224.5, 146], [227.5, 171], [231, 195], [235, 217], [239, 235], [243.5, 250], [250, 261], [257, 267]],
  [[239, 97], [243, 123], [246.5, 149], [249.5, 174], [252.5, 198], [255.5, 220], [258.5, 238], [262, 252], [267, 262], [272, 268]],
  [[262, 97], [266, 124], [269.5, 150], [272.5, 175], [275, 199], [277, 221], [279, 239], [281.5, 253], [284.5, 262], [287, 268]],
  [[292, 97], [297, 124], [300.5, 150], [302, 176], [302, 200], [300.5, 222], [299.5, 240], [298, 252], [295, 261], [290, 267]],
];

const smooth01 = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function catmull(pts, n = 120) {
  const out = [], P2 = [pts[0], ...pts, pts[pts.length - 1]], segs = pts.length - 1;
  for (let k = 0; k <= n; k++) {
    const tt = (k / n) * segs, i = Math.min(segs - 1, Math.floor(tt)), t = tt - i;
    const p0 = P2[i], p1 = P2[i + 1], p2 = P2[i + 2], p3 = P2[i + 3], t2 = t * t, t3 = t2 * t;
    out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
  }
  return out;
}
export const HN = 140; // samples along each guide
const HG = hairGuides.map((g) => catmull(g, HN));
export function hairPoint(a, i) {
  const f = Math.min(1, Math.max(0, a)) * (HG.length - 1), j = Math.min(HG.length - 2, Math.floor(f)), t = f - j;
  return [HG[j][i][0] + (HG[j + 1][i][0] - HG[j][i][0]) * t, HG[j][i][1] + (HG[j + 1][i][1] - HG[j][i][1]) * t];
}
// a line through the hair at fraction a (0 front .. 1 back), displaced across the flow by a lock's wave
export function hairLine(a, w = null) {
  const pts = [];
  let acc = 0, prev = null;
  for (let i = 0; i <= HN; i++) {
    const p = hairPoint(a, i), q = hairPoint(a, Math.min(HN, i + 1)), r = hairPoint(a, Math.max(0, i - 1));
    let tx = q[0] - r[0], ty = q[1] - r[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    if (prev) acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
    const wave = w ? w.amp * Math.sin((acc / w.wl) * Math.PI * 2 + w.phase) * smooth01(0, 30, acc) : 0;
    pts.push([p[0] - ty * wave, p[1] + tx * wave, acc]);
  }
  return pts;
}
export const HAIR_LOCKS = (() => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let l = 0; l < 11; l++) out.push({ phase: rnd() * Math.PI * 2, amp: 1.3 + rnd() * 1.1, wl: 48 + rnd() * 20 });
  return out;
})();
function lockBand(l) {
  const n = HAIR_LOCKS.length, w = HAIR_LOCKS[l];
  const a0 = (l - 0.22) / n, a1 = (l + 1.22) / n, am = (l + 0.5) / n;
  const A = hairLine(a0, w), B = hairLine(a1, w), M = hairLine(am, w);
  const total = M[HN][2], endLen = 7 + 2 * (l % 3);
  const L = [], R = [];
  for (let i = 0; i <= HN; i++) {
    const rem = total - M[i][2];
    const k = rem < endLen ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - rem / endLen, 2))) : 1; // rounded lock end
    L.push([M[i][0] + (A[i][0] - M[i][0]) * k, M[i][1] + (A[i][1] - M[i][1]) * k]);
    R.push([M[i][0] + (B[i][0] - M[i][0]) * k, M[i][1] + (B[i][1] - M[i][1]) * k]);
  }
  return P(L.concat(R.reverse()));
}
export const HAIR_PARTS = (() => {
  const parts = HAIR_LOCKS.map((_, l) => lockBand(l));
  // core: fills between the locks so the face never shows through a gap
  const A = hairLine(0.05), B = hairLine(0.95), cut = Math.round(HN * 0.86);
  parts.push(P(A.slice(0, cut).concat(B.slice(0, cut).reverse())));
  return parts;
})();

// ---- the feather: shaft from the quill (tucked under the crown) back over the cap, tip curling in
export const FEATHER = smoothPath([[298, 94], [311, 83], [327, 75.5], [344, 73], [359, 77.5], [369, 88], [373, 102], [372, 116], [367.5, 129]], false);

// ---- the ruff: a band of rounded folds round the neck
export const RUFF = { a: [184, 236.5], b: [266, 224], bow: 3.2, half: 11.2, cell: 6.2 };
export function ruffCenter(t) {
  const x = RUFF.a[0] + (RUFF.b[0] - RUFF.a[0]) * t, y = RUFF.a[1] + (RUFF.b[1] - RUFF.a[1]) * t + RUFF.bow * Math.sin(Math.PI * t);
  return [x, y];
}
function ruffPath() {
  const L = Math.hypot(RUFF.b[0] - RUFF.a[0], RUFF.b[1] - RUFF.a[1]);
  const n = 220, top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, [x, y] = ruffCenter(t);
    const [x2, y2] = ruffCenter(Math.min(1, t + 0.002)), [x1, y1] = ruffCenter(Math.max(0, t - 0.002));
    let tx = x2 - x1, ty = y2 - y1; const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
    const nx = ty, ny = -tx; // points up
    const s = t * L;
    const sc = 1.8 * Math.pow(Math.abs(Math.sin((Math.PI * s) / RUFF.cell)), 0.6); // scallops, one per fold
    const end = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, 1 - s / 9), 2))); // rounded front end
    const h = RUFF.half * end;
    top.push([x + nx * (h + sc * end), y + ny * (h + sc * end)]);
    bot.push([x - nx * (h + sc * end), y - ny * (h + sc * end)]);
  }
  return P(top.concat(bot.reverse()));
}

// ---- the held heart and the hand under it
export const HEART = 'M50 92 C36 79 4 59 4 33 C4 16 16 6 30 6 C40 6 47 12 50 20 C53 12 60 6 70 6 C84 6 96 16 96 33 C96 59 64 79 50 92 Z';
export function heartPath(cx, tipY, s, rot = 0) {
  // place the heart so its point is at (cx, tipY), scale s, rotation rot (deg) about the point
  const a = (rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  return HEART.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (m, X, Y) => {
    const x = (parseFloat(X) - 50) * s, y = (parseFloat(Y) - 92) * s;
    return `${(cx + x * c - y * sn).toFixed(2)} ${(tipY + x * sn + y * c).toFixed(2)}`;
  });
}
export const HELD = { cx: 200, tip: 305, s: 0.45, rot: -3 };

// A digit: straight phalanges meeting at rounded joints, tapering to a rounded tip; soft pads on
// the palm side, knuckles on the back. j: joints base..tip; r: half-thickness at each joint;
// side +1 when the palm side is the normal (-ty, tx) of the direction of travel.
// Returns the outline and a spine (centre, tangent, palm normal, radii) for the engraving.
export function digit(j, r, side = 1, opt = {}) {
  const pad = opt.pad ?? 0.08, knuckle = opt.knuckle ?? 0.1, crease = opt.crease ?? 0.13, fil = opt.fillet ?? 1.5;
  const tipA = opt.tipA ?? 1.15, baseA = opt.baseA ?? 0.6;
  const poly = [j[0].slice()], jIdx = [0];
  for (let k = 1; k < j.length - 1; k++) {
    const a = j[k - 1], b = j[k], c = j[k + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const t = Math.min(fil * r[k], 0.45 * l1, 0.45 * l2);
    const p1 = [b[0] - ((b[0] - a[0]) / l1) * t, b[1] - ((b[1] - a[1]) / l1) * t];
    const p2 = [b[0] + ((c[0] - b[0]) / l2) * t, b[1] + ((c[1] - b[1]) / l2) * t];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16, w = 1 - u;
      poly.push([w * w * p1[0] + 2 * w * u * b[0] + u * u * p2[0], w * w * p1[1] + 2 * w * u * b[1] + u * u * p2[1]]);
      if (i === 8) jIdx.push(poly.length - 1);
    }
  }
  poly.push(j[j.length - 1].slice()); jIdx.push(poly.length - 1);
  const acc = [0];
  for (let i = 1; i < poly.length; i++) acc.push(acc[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const sJ = jIdx.map((i) => acc[i]), L = acc[acc.length - 1];
  const at = (s) => {
    s = Math.max(0, Math.min(L, s));
    let i = 0; while (i < acc.length - 2 && acc[i + 1] < s) i++;
    const t = (s - acc[i]) / (acc[i + 1] - acc[i] || 1);
    return [poly[i][0] + (poly[i + 1][0] - poly[i][0]) * t, poly[i][1] + (poly[i + 1][1] - poly[i][1]) * t];
  };
  const tanAt = (s) => { const q = at(s + 0.4), o = at(s - 0.4); const tx = q[0] - o[0], ty = q[1] - o[1], tl = Math.hypot(tx, ty) || 1; return [tx / tl, ty / tl]; };
  const rAt = (s) => {
    let k = 0; while (k < sJ.length - 2 && sJ[k + 1] <= s) k++;
    const f = Math.min(1, Math.max(0, (s - sJ[k]) / (sJ[k + 1] - sJ[k])));
    return { r: r[k] + (r[k + 1] - r[k]) * f, f };
  };
  const a1 = tipA * r[r.length - 1], a0 = baseA * r[0];
  const SS = []; // base cap, shaft, tip cap (tilt: how far the surface turns along the length)
  for (let th = -90; th < 0; th += 10) { const t = (th * Math.PI) / 180; SS.push({ s: a0 * Math.sin(t), q: Math.cos(t), tilt: Math.sin(t) }); }
  for (let s = 0; s < L - a1; s += 0.25) SS.push({ s, q: 1, tilt: 0 });
  for (let th = 0; th <= 90; th += 6) { const t = (th * Math.PI) / 180; SS.push({ s: L - a1 + a1 * Math.sin(t), q: Math.cos(t), tilt: Math.sin(t) }); }
  const spine = SS.map(({ s, q, tilt }) => {
    const sc = Math.max(0, Math.min(L, s));
    let p = at(sc); const [tx, ty] = tanAt(sc);
    if (s < 0) p = [p[0] + tx * s, p[1] + ty * s];
    const nx = -side * ty, ny = side * tx;
    const { r: r0, f } = rAt(sc);
    let jt = 0, jk = (opt.mcp ?? 0.6) * Math.exp(-(((s - 0.6) / 1.6) ** 2)); // the knuckle at the base, then the joints
    for (let k = 1; k < sJ.length - 1; k++) { jt += Math.exp(-(((sc - sJ[k]) / 0.7) ** 2)); jk += Math.exp(-(((sc - sJ[k]) / 1.1) ** 2)); }
    const qq = Math.pow(q, 0.85);
    const rP = r0 * qq * (1 + pad * Math.sin(Math.PI * f)) * (1 - crease * jt);
    const rD = r0 * qq * (1 + knuckle * jk) * (1 - 0.03 * Math.sin(Math.PI * f));
    return { x: p[0], y: p[1], tx, ty, nx, ny, rP, rD, s, q, tilt };
  });
  const back = spine.map((o) => [o.x - o.nx * o.rD, o.y - o.ny * o.rD]);
  const front = spine.map((o) => [o.x + o.nx * o.rP, o.y + o.ny * o.rP]);
  return { d: P(back.concat(front.reverse().slice(1, -1))), spine, sJ, L, side, r };
}

// The hand, palm up, seen from the side: the palm between a top and a bottom guide (wrist ->
// knuckles); four fingers cradle the heart's lower edge, their tips cascading up it; the thumb
// rises from its mound on the right. The palm and thumb make one silhouette.
export const PALM = {
  top: [[243, 302.6], [237, 302.9], [231, 303.6], [224.5, 304.8], [218, 305.9], [212, 306.7], [206.5, 307.1]],
  bot: [[243, 312.8], [237, 313.3], [230, 315.0], [222, 317.2], [214, 318.4], [206.5, 318.4]],
};
// joints from a base point and [length, angle] per phalanx (deg: 180 points left, 270 up)
const chain = (base, segs) => { const out = [base]; let [x, y] = base; for (const [len, ang] of segs) { const a = (ang * Math.PI) / 180; x += len * Math.cos(a); y += len * Math.sin(a); out.push([x, y]); } return out; };
export function palmLine(a, n = 80) {
  const T = catmull(PALM.top, n), B = catmull(PALM.bot, n);
  return T.map((p, i) => [p[0] + (B[i][0] - p[0]) * a, p[1] + (B[i][1] - p[1]) * a]);
}
export const DIGITS = {
  // the thumb grows from the wrist: its long metacarpal is the mound of the palm, then two phalanges
  thumb: digit(chain([238.5, 309.5], [[13.2, -150], [9.4, -115], [7.0, -131]]), [5.0, 3.75, 3.15, 2.6], -1, { fillet: 1.4, pad: 0.1, baseA: 0.5, mcp: 0 }),
  // the knuckles lie on a gentle arc, not a ruled line
  f1: digit(chain([209.0, 307.7], [[13.5, 178], [7.6, 210], [6.8, 245]]), [2.66, 2.46, 2.2, 1.9], 1),
  f2: digit(chain([208.0, 310.5], [[13.7, 179], [8.0, 208], [7.2, 240]]), [2.76, 2.55, 2.27, 1.95], 1),
  f3: digit(chain([208.3, 313.3], [[13.2, 181], [7.6, 206], [6.8, 236]]), [2.66, 2.46, 2.18, 1.88], 1),
  f4: digit(chain([209.4, 316.0], [[11.9, 184], [6.2, 205], [5.6, 232]]), [2.4, 2.2, 1.96, 1.7], 1),
};

export const S = {
  // whole head + neck silhouette (back of head hidden under hair and cap)
  face: `M171 90 C164 97 159.6 106 158.2 115 C157 122 155.8 127.4 156.4 131.4
    C157 134.6 159.8 136.4 160.2 139.4 C158.8 147 151.6 156.6 143.6 163.4
    C141 165.6 140.4 167.8 142.4 168.8 C145.4 170.2 150.4 170.6 155.2 172.4
    C155.8 174.8 153.4 177.4 152.6 179.6 C151.6 181.4 153.4 183 155.6 183.4
    C153.4 184.6 152.4 187.2 153.4 189.4 C154.6 191.6 158.6 192.4 159.2 195
    C157 198.8 154.8 203 156.4 207.2 C158 211 162.4 213 168 213.6
    C176 214.4 185 214.2 190.6 216.8 C195.4 219.4 196.8 226 197.4 234
    L198.6 246 L262 240 L266 204 C282 176 288 126 276 96 C258 70 202 66 171 90 Z`,

  eye: `M164.6 144.2 C167.2 140.6 172.4 139.9 177.6 143.4 C173.2 146.6 168 147.3 164.6 144.2 Z`,
  iris: `M165.2 143.6 C165.6 141.4 167.4 140.6 169 140.9 C169.8 142.6 169.8 145 169 146.4 C167.4 146.8 165.8 146 165.2 143.6 Z`,
  lidCrease: `M165.6 139.4 C169.8 136.6 175.2 137.2 179.4 141.2`,
  lowerLid: `M166.4 147.4 C170.2 149 174.2 148.6 177.4 146.2`,
  brow: `M157.6 133 C163 129.4 173.6 129 184.6 133.4 C175 132.4 165.4 132.8 158.8 135.8 Z`,
  ala: `M153.4 158.6 C149.2 160 147.6 165.6 150.6 168.8`,
  nostril: `M146.8 169.4 C148.6 168.8 151.6 169.2 153.2 170.6`,
  mouth: `M155.6 183.4 C158.2 183.6 160.6 183.8 163.4 184.8`,
  jaw: `M169 212.8 C185 211.4 202 204.4 217.5 194.5`,

  crown: smoothPath(CROWN_PTS),
  brim: brimPath(),
  hair: HAIR_PARTS.join(' '),
  ruff: ruffPath(),

  // the doublet: shoulders sloping from the neck, the chest full, drawn in at the waist
  doublet: smoothPath([
    [197, 243], [184, 248.4], [172.6, 255.2], [165.2, 264.6], [161.6, 278], [160.6, 294], [161.6, 311], [164.6, 327], [168.4, 343], [171.2, 359], [172.6, 376], [172.4, 400], [171.6, 432, 1],
    [336, 432, 1], [335, 400], [334, 370], [336, 340], [340, 310], [342, 290], [337, 274], [325, 260], [306, 250], [285, 243], [266, 238, 1], [230, 241],
  ]),
  // the near upper arm, its puffed sleeve rounding over the shoulder
  upperArm: smoothPath([
    [290, 252], [307, 250.8], [323, 255.6], [334.6, 265.4], [340.6, 280], [341.6, 298], [339.6, 316], [334.4, 332], [325, 345], [308, 346.5],
    [296, 336], [290, 318], [287, 296], [285.6, 276], [286.8, 262],
  ]),
  forearm: smoothPath([
    [336, 309], [312, 302], [284, 297.5], [258, 294.5], [236, 293.5, 1], [236, 318.5, 1], [258, 320.5], [286, 324.5], [314, 331], [338, 336],
  ]),
  cuff: null, // built below (frill round the wrist)
  // the palm (its thumb is DIGITS.thumb; the two are one silhouette)
  hand: P(catmull(PALM.top, 80).concat(catmull(PALM.bot, 80).reverse())),
  thumb: DIGITS.thumb.d,
  // the far arm: its sleeve showing past the doublet at the left shoulder
  farSleeve: smoothPath([[184, 249], [170, 254], [158.5, 264], [151.5, 280], [149.5, 300], [151, 320], [155.5, 338], [163, 350], [172, 340], [176, 300], [182, 268]]),
};
S.heart = heartPath(HELD.cx, HELD.tip, HELD.s, HELD.rot);
for (const k of ['f1', 'f2', 'f3', 'f4']) S[k] = DIGITS[k].d;

// the cuff: a frill round the wrist, its scalloped rim facing the hand
export const CUFF = { cx: 238.5, cy: 305.8, rx: 6.4, ry: 15.2, rot: -4 };
{
  const pts = [], a = (CUFF.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  for (let k = 0; k < 240; k++) {
    const t = (k / 240) * 2 * Math.PI;
    // lace scallops along the rim that faces the hand
    const left = Math.max(0, -Math.cos(t));
    const bump = 1.15 * Math.pow(Math.abs(Math.cos(6 * t)), 0.7) * Math.pow(left, 0.5);
    const x = CUFF.rx * Math.cos(t) - bump, y = CUFF.ry * Math.sin(t);
    pts.push([CUFF.cx + x * c - y * s, CUFF.cy + x * s + y * c]);
  }
  S.cuff = P(pts);
}
