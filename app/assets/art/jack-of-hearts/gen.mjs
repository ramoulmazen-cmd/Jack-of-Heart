// gen.mjs: the Jack of Hearts card (app/assets/jack-card.png), an original double-ended court
// card engraved in gold line, in the colours of the first card: a dark burgundy glow behind each
// head, red velvet caps, dark faces lit by a glowing gold outline, red eyes, crimson hearts.
// Plain Node, no packages: node gen.mjs writes card.svg next to this file (not committed).
// The PNG is that SVG rendered at 600 x 840 (1.2x), transparent outside the rounded card.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as G from './geom.mjs';
import { S, divY, DIV, HEART, BRIM, brimBottom, brimNotches, FEATHER, HAIR_LOCKS, HAIR_PARTS, hairLine, HN, RUFF, ruffCenter, CUFF, HELD, DIGITS, palmLine } from './shapes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { num, polyD, flatten, resample, rasterize, sdf, blur, sample, grad, ribbon, runsToRibbons, smooth, clamp, lerp, gauss, dist } = G;
const T0 = Date.now();

const C = {
  ground: '#0C090A', ink: '#141012',
  champ: '#FBE7A1', gold: '#E3B23C', burn: '#A2731A', deep: '#6B4A0E',
  crim: '#E0263F', crim2: '#8E1428', crim3: '#5A0915',
};

// ------------------------------------------------------------------ light
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const LIGHT = norm3([-0.58, -0.6, 0.55]); // from the front (left), above, toward the viewer
const LXY = (() => { const l = Math.hypot(LIGHT[0], LIGHT[1]); return [LIGHT[0] / l, LIGHT[1] / l]; })();
function lambert(h, x, y, gs = 1) {
  const [hx, hy] = grad(h, x, y);
  const n = norm3([-hx * gs, -hy * gs, 1]);
  return Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
}
const NG = G.G.W * G.G.H;
function inflate(mask, R, H, blurR = 1.2) {
  const d = G.edt(mask), h = new Float32Array(NG);
  for (let i = 0; i < NG; i++) { const s = Math.min(d[i], R) / R; h[i] = H * (1 - (1 - s) * (1 - s)); }
  return blur(h, blurR);
}
function addBumps(h, bumps) {
  for (let j = 0; j < G.G.H; j++) for (let i = 0; i < G.G.W; i++) {
    const x = G.G.x0 + (i + 0.5) * G.G.res, y = G.G.y0 + (j + 0.5) * G.G.res;
    let s = 0;
    for (const b of bumps) s += b[5] * gauss(x, y, b[0], b[1], b[2], b[3], b[4]);
    h[j * G.G.W + i] += s;
  }
  return h;
}
// shadow cast by a front shape: 1 in the open, falling toward (1 - k) just below-right of it
function castBy(sd, x, y, reach = 5, soft = 7, k = 0.6) {
  const d = -sample(sd, x + LXY[0] * reach, y + LXY[1] * reach);
  return 1 - k * (1 - smooth(-1.5, soft, d));
}
// lines along a digit: each keeps a fixed fraction of the half-thickness, so the family tapers with
// the finger and closes over its rounded tip; each swells where its round surface turns to the light
function digitLines(dg, insideSd, { n = 5, cmax = 0.78, wMax = 0.95, wMin = 0.1, margin = 0.12, lo = 0.15, span = 0.75, shade = null } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = -cmax + (2 * cmax * i) / (n - 1);
    const sc = Math.sqrt(Math.max(0, 1 - c * c));
    const pts = [], ws = [], ins = [];
    for (const o of dg.spine) {
      const r = c > 0 ? o.rP : o.rD;
      const x = o.x + o.nx * c * r, y = o.y + o.ny * c * r;
      const ct = Math.sqrt(Math.max(0, 1 - o.tilt * o.tilt));
      const n3 = [o.nx * c * ct + o.tx * o.tilt, o.ny * c * ct + o.ty * o.tilt, sc * ct];
      const lit = Math.max(0, n3[0] * LIGHT[0] + n3[1] * LIGHT[1] + n3[2] * LIGHT[2]);
      let w = wMin + wMax * Math.pow(clamp((lit - lo) / span) * (shade ? shade(x, y) : 1), 1.2);
      if (c > 0.3) for (let k = 1; k < dg.sJ.length - 1; k++) w *= 1 - 0.45 * c * Math.exp(-(((o.s - dg.sJ[k]) / 0.6) ** 2)); // soft joint creases
      // on the rounded ends the outer lines bow out first, so only the middle ones reach the tip
      const qStop = 0.25 + 0.55 * Math.abs(c) / cmax;
      w *= smooth(qStop, qStop + 0.3, o.q) * Math.pow(o.q, 0.35);
      pts.push([x, y]); ws.push(w); ins.push(sample(insideSd, x, y) - margin);
    }
    out.push(...runsToRibbons(pts, ws, ins, { cut: 0.08, taper: 0.7, minLen: 0.8 }));
  }
  return out;
}

// ------------------------------------------------------------------ helpers
function strokeRibbon(d, w0, w1 = w0, taper = 0.3, step = 0.6) {
  const pts = resample(flatten(d, 0.3)[0].pts, step);
  const n = pts.length;
  const ws = pts.map((p, i) => { const t = i / (n - 1); const tp = Math.min(1, Math.min(t, 1 - t) / taper); return lerp(w0, w1, t) * Math.sqrt(Math.max(0.05, tp)); });
  return { pts, ws, d: ribbon(pts, ws) };
}
function polyMask(polys) {
  let m = G.mEmpty();
  for (const p of polys) { const r = rasterize(p); for (let i = 0; i < NG; i++) m[i] |= r[i]; }
  return m;
}
const above = (s, m) => { const o = new Uint8Array(NG); for (let i = 0; i < NG; i++) o[i] = s[i] > m ? 1 : 0; return o; };

// a family of engraved lines: at(c,u) -> [x, y, nx, ny]; displaced by k*h along (nx,ny)
function family({ at, cs, us, h = null, k = 0, width, inside, margin = 0, cut = 0.1, taper = 1.0, minLen = 1.5 }) {
  const out = [];
  for (let c = cs[0]; c <= cs[1] + 1e-6; c += cs[2]) {
    const pts = [], ws = [], ins = [];
    for (let u = us[0]; u <= us[1] + 1e-6; u += us[2]) {
      let [x, y, nx, ny] = at(c, u);
      if (h) { const d = k * sample(h, x, y); x += nx * d; y += ny * d; }
      pts.push([x, y]);
      ins.push(sample(inside, x, y) - margin);
      ws.push(ins[ins.length - 1] > -2 ? width(x, y, c, u) : 0);
    }
    out.push(...runsToRibbons(pts, ws, ins, { cut, taper, minLen }));
  }
  return out;
}
const parallel = (angDeg) => {
  const a = (angDeg * Math.PI) / 180, d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]];
  return { at: (c, u) => [c * n[0] + u * d[0], c * n[1] + u * d[1], n[0], n[1]], d, n };
};
function ranges(par, bbox, spacing, step) {
  const cn = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]]];
  const cv = cn.map((p) => p[0] * par.n[0] + p[1] * par.n[1]), cu = cn.map((p) => p[0] * par.d[0] + p[1] * par.d[1]);
  const c0 = Math.floor(Math.min(...cv) / spacing) * spacing;
  return { cs: [c0 - spacing * 3, Math.max(...cv) + spacing * 3, spacing], us: [Math.min(...cu) - 6, Math.max(...cu) + 6, step] };
}
function bboxOf(mask) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let j = 0; j < G.G.H; j++) for (let i = 0; i < G.G.W; i++) if (mask[j * G.G.W + i]) {
    const x = G.G.x0 + (i + 0.5) * G.G.res, y = G.G.y0 + (j + 0.5) * G.G.res;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0 - 2, y0 - 2, x1 + 2, y1 + 2];
}
// outline of a region: swelling toward the light, hidden where front shapes cover it
function outline(d, occSdf, { w0 = 0.35, w1 = 1.3, gap = 0.9, step = 0.6, flip = 1, lightPow = 1, region = null, hide = null, minLen = 1 } = {}) {
  const out = [];
  for (const sub of flatten(d, 0.3)) {
    const pts = resample(sub.pts, step);
    if (sub.closed) pts.push(pts[0]);
    const n = pts.length, ws = [], ins = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let nx = ty, ny = -tx;
      if (region) {
        const probe = sample(region, pts[i][0] + nx * 1.5, pts[i][1] + ny * 1.5);
        if (probe > 0) { nx = -nx; ny = -ny; }
      } else { nx *= flip; ny *= flip; }
      const lit = Math.max(0, nx * LXY[0] + ny * LXY[1]);
      ws.push(w0 + (w1 - w0) * Math.pow(lit, lightPow));
      ins.push(hide ? hide(pts[i][0], pts[i][1]) : occSdf ? -sample(occSdf, pts[i][0], pts[i][1]) - gap : 1);
    }
    out.push(...runsToRibbons(pts, ws, ins, { cut: 0.05, taper: 0.8, minLen }));
  }
  return out;
}
const circleD = (cx, cy, r, step = 20) => { const pts = []; for (let a = 0; a < 360; a += step) pts.push([cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]); return polyD(pts); };

// ------------------------------------------------------------------ the feather (geometry first: it occludes)
function featherGeometry() {
  const rp = resample(flatten(FEATHER, 0.25)[0].pts, 0.5);
  const acc = [0];
  for (let i = 1; i < rp.length; i++) acc.push(acc[i - 1] + dist(rp[i - 1], rp[i]));
  const L = acc[acc.length - 1];
  const at = (s) => {
    let i = 0; while (i < acc.length - 2 && acc[i + 1] < s) i++;
    const t = (s - acc[i]) / (acc[i + 1] - acc[i] || 1);
    const p = [lerp(rp[i][0], rp[i + 1][0], t), lerp(rp[i][1], rp[i + 1][1], t)];
    const tx = rp[i + 1][0] - rp[i][0], ty = rp[i + 1][1] - rp[i][1], tl = Math.hypot(tx, ty) || 1;
    return { p, t: [tx / tl, ty / tl] };
  };
  const splits = { 1: [0.4, 0.64, 0.83], '-1': [0.5, 0.75] };
  const barbs = [];
  const shaftW = (s) => 1.55 * Math.pow(Math.max(0, 1 - s / L), 0.7) + 0.38;
  for (const side of [1, -1]) {
    const maxLen = side === 1 ? 18.5 : 15.2;
    const pitch = side === 1 ? 1.38 : 1.48;
    for (let s = 4; s < L - 0.3; s += pitch) {
      const tt = s / L;
      // the vane: a bare quill at the base, broad through the middle, a rounded end
      const grow = smooth(0.02, 0.34, tt);
      const endT = Math.max(0, (tt - 0.74) / 0.26), round = Math.sqrt(Math.max(0, 1 - endT * endT));
      const len = maxLen * (0.22 + 0.78 * grow) * (0.25 + 0.75 * round) * (0.93 + 0.07 * Math.sin(s * 1.9));
      let turn = 0, skip = false;
      for (const sp of splits[String(side)]) {
        const d = (tt - sp) * L;
        if (Math.abs(d) < 0.9) skip = true;
        else if (Math.abs(d) < 4.5) turn += Math.sign(d) * 0.2 * (1 - Math.abs(d) / 4.5);
      }
      if (skip || len < 1.2) continue;
      const { p, t } = at(s);
      const nx = t[1] * side, ny = -t[0] * side; // outward normal (side 1 = the convex, outer vane)
      const lit = 0.55 + 0.45 * Math.max(0, nx * LXY[0] + ny * LXY[1]);
      const lean = 0.56 + 0.14 * tt; // leaving the shaft leaning toward the tip...
      const off = shaftW(s) / 2 + 0.45; // a fine dark parting along the quill
      let x = p[0] + nx * off, y = p[1] + ny * off;
      const pts = [[x, y]];
      const nseg = Math.max(5, Math.round(len / 1.1));
      for (let k = 1; k <= nseg; k++) {
        const u = k / nseg, a = lean + 0.42 * u + turn; // ...and curving further toward it
        const dx = Math.cos(a) * nx + Math.sin(a) * t[0], dy = Math.cos(a) * ny + Math.sin(a) * t[1];
        x += dx * (len / nseg); y += dy * (len / nseg) + 0.1 * u * (len / nseg);
        pts.push([x, y]);
      }
      const ws = pts.map((_, k) => { const u = k / (pts.length - 1); return (0.4 + 0.58 * lit) * Math.pow(1 - u, 0.6) + 0.08; });
      barbs.push({ pts, ws, side, tt });
    }
  }
  const sw = rp.map((p, i) => shaftW(acc[i]));
  return { barbs, shaft: { pts: rp, ws: sw } };
}
const FEA = featherGeometry();

// ------------------------------------------------------------------ masks, occlusion
const ORDER = ['farSleeve', 'doublet', 'face', 'ruff', 'hair', 'feather', 'crown', 'brim', 'forearm', 'upperArm', 'hand', 'cuff', 'f1', 'f2', 'f3', 'f4', 'heart'];
const M = {};
for (const k of ORDER) {
  if (k === 'feather') {
    const polys = FEA.barbs.map((b) => ribbon(b.pts, b.ws.map((w) => w + 1.0)));
    polys.push(ribbon(FEA.shaft.pts, FEA.shaft.ws.map((w) => w + 1.2)));
    M.feather = polyMask(polys);
  } else if (k === 'hair') M.hair = polyMask(HAIR_PARTS);
  else if (k === 'hand') M.hand = G.mOr(rasterize(S.hand), rasterize(S.thumb)); // palm and thumb: one silhouette
  else M[k] = rasterize(S[k]);
}
const GAP = 1.15;
// finer seams where the fingers lie on the palm and on each other
const SEAM = { hand: { f1: 0.45, f2: 0.45, f3: 0.45, f4: 0.45 }, f1: { f2: 0.8, f3: 0.8, f4: 0.8 }, f2: { f3: 0.8, f4: 0.8 }, f3: { f4: 0.8 } };
const VIS = {}, OCC = {}, SD = {};
{
  let front = G.mEmpty();
  for (let i = ORDER.length - 1; i >= 0; i--) {
    const k = ORDER[i];
    const fs = sdf(front);
    OCC[k] = fs;
    const sp = SEAM[k];
    if (sp) {
      let big = G.mEmpty();
      const byGap = {};
      for (let j = i + 1; j < ORDER.length; j++) {
        const f = ORDER[j];
        if (sp[f] != null) (byGap[sp[f]] ??= []).push(M[f]);
        else big = G.mOr(big, M[f]);
      }
      let v = G.mSub(M[k], above(sdf(big), -GAP));
      for (const [g, ms] of Object.entries(byGap)) v = G.mSub(v, above(sdf(G.mOr(...ms)), -Number(g)));
      VIS[k] = v;
    } else VIS[k] = G.mSub(M[k], above(fs, -GAP));
    front = G.mOr(front, M[k]);
  }
}
const FIG = (() => { let m = G.mEmpty(); for (const k of ORDER) m = G.mOr(m, M[k]); return m; })();
const FIGSD = sdf(FIG);
for (const k of ORDER) SD[k] = sdf(VIS[k]);
console.log('masks', Date.now() - T0, 'ms');

// ------------------------------------------------------------------ engraving
const OUT = {}; // layer name -> { fill, paths: [] }
const layer = (name, fill) => (OUT[name] ??= { fill, paths: [] });

// ---- face
const fcut = (() => {
  const polys = [];
  polys.push(strokeRibbon(S.lidCrease, 0.7, 0.4).d);
  polys.push(strokeRibbon(S.lowerLid, 0.45, 0.3).d);
  polys.push(strokeRibbon(S.ala, 0.8, 0.9).d);
  polys.push(strokeRibbon(S.nostril, 1.6, 0.8).d);
  polys.push(strokeRibbon(S.mouth, 1.3, 0.5).d);
  polys.push(strokeRibbon('M164.4 143.2 C167.6 140 172.6 139.6 177.8 143.4', 2.0, 0.9, 0.25).d); // lash line
  const m = polyMask(polys);
  const eye = rasterize(S.eye), brow = rasterize(S.brow);
  const eyeD = above(sdf(eye), -0.9);
  return G.mOr(m, eyeD, brow);
})();
const FACEVIS = G.mSub(VIS.face, fcut);
const FACESD = sdf(FACEVIS);
const faceH = addBumps(inflate(M.face, 26, 13, 1.4), [
  [166, 131, 11, 3.2, -0.1, 2.2], [171, 143.5, 7, 5, 0, -3.2], [170, 144, 3.6, 2.6, 0, 1.4],
  [186, 160, 12, 8, 0.4, 2.8], [187, 185, 10, 9, 0, -2.2], [161, 203, 6, 6, 0, 1.8],
  [156, 180, 4, 3, 0, 0.8], [157, 188, 4, 3, 0, 1.0], [164, 172, 6, 5, 0, -1.0],
]);
const hairCapSD = sdf(G.mOr(M.hair, M.crown, M.brim, M.ruff));
function faceB(x, y) {
  let b = clamp((lambert(faceH, x, y, 0.55) - 0.32) / 0.6);
  const dOcc = -sample(hairCapSD, x, y);
  b *= 0.3 + 0.7 * smooth(0, 11, dOcc);
  b *= 1 - 0.6 * gauss(x, y, 190, 222, 16, 7, 0.15); // under the jaw
  b *= 1 - 0.35 * gauss(x, y, 172, 137, 9, 4, 0); // under the brow
  return clamp(b);
}
{
  const par = parallel(92);
  const bb = bboxOf(FACEVIS);
  const r = ranges(par, bb, 2.2, 1.0);
  const L = layer('face', 'url(#gDarkFace)');
  L.paths.push(...family({ at: par.at, cs: r.cs, us: r.us, h: faceH, k: 0.42, inside: FACESD, margin: 0.2, width: (x, y) => 0.14 + 1.5 * Math.pow(faceB(x, y), 1.25) }));
  const eyeSD = sdf(G.mSub(above(sdf(rasterize(S.eye)), 0.35), above(sdf(rasterize(S.iris)), -0.5)));
  const E = layer('eye', '#FF3352');
  E.paths.push(...family({ at: parallel(4).at, cs: [138, 150, 1.25], us: [150, 190, 0.5], inside: eyeSD, width: (x) => 0.55 * (1 - smooth(166, 178, x)) + 0.18 }));
  E.paths.push(S.eye);
  const B = layer('brow', C.gold);
  for (let i = 0; i < 13; i++) {
    const t = i / 12, x0 = lerp(158.5, 181, t), y0 = lerp(135, 132.4, t) - 0.9 * Math.sin(Math.PI * t);
    const len = lerp(6.5, 4.2, t), ang = lerp(-0.42, -0.08, t);
    const p1 = [x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len];
    B.paths.push(ribbon([[x0, y0], [(x0 + p1[0]) / 2, (y0 + p1[1]) / 2 - 0.2], p1], [0.05, lerp(0.75, 0.45, t), 0.05]));
  }
  layer('faceRim', 'url(#gRim)').paths.push(...outline(S.face, OCC.face, { w0: 0.55, w1: 2.1, gap: 1.0, region: M.face, lightPow: 0.8 }));
}

// ---- hair: eleven wavy locks, seven strands each, following the flow guides
{
  const L = layer('hair', 'url(#gHair)');
  const n = HAIR_LOCKS.length, perLock = 7;
  for (let l = 0; l < n; l++) {
    const w = HAIR_LOCKS[l];
    for (let s = 0; s < perLock; s++) {
      const o = (s + 0.5) / perLock - 0.5; // -0.5..0.5 across the lock
      const a = clamp((l + 0.5 + o * 0.98) / n, 0, 1);
      const pts = hairLine(a, w).map((p) => [p[0], p[1]]), ws = [], ins = [];
      let acc = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (i) acc += dist(pts[i - 1], p);
        const across = 0.55 + 0.45 * Math.cos(Math.PI * (o + 0.18) * 1.6);
        const sheen = 0.55 + 0.45 * gauss(p[0], p[1], 242, 150, 70, 24, 0.25);
        const front = 1 - 0.45 * smooth(210, 300, p[0]);
        const bottom = 1 - 0.35 * smooth(222, 268, p[1]);
        const lit = clamp(across * sheen * front * bottom * (0.85 + 0.15 * Math.sin((acc / w.wl) * Math.PI * 2 + w.phase + 1.2)));
        ws.push(0.12 + 1.05 * Math.pow(lit, 1.1));
        ins.push(sample(SD.hair, p[0], p[1]) - 0.2);
      }
      L.paths.push(...runsToRibbons(pts, ws, ins, { cut: 0.12, taper: 6, minLen: 4 }));
    }
  }
}

// ---- cap: soft crown gathered into the band, reeded brim with pearls
{
  const crownH = inflate(M.crown, 15, 8, 1.6);
  const F = [236, 152];
  const L = layer('crown', 'url(#gVelvet)');
  const c0 = Math.PI + 0.42, c1 = 2 * Math.PI - 0.42;
  L.paths.push(...family({
    at: (c, u) => [F[0] + u * Math.cos(c), F[1] + u * Math.sin(c), -Math.sin(c), Math.cos(c)],
    cs: [c0, c1, 0.0185], us: [42, 106, 0.8], h: crownH, k: 0.7, inside: SD.crown, margin: 0.25,
    width: (x, y, c) => {
      const b = clamp((lambert(crownH, x, y, 0.75) - 0.28) / 0.66);
      const fold = 0.62 + 0.38 * Math.cos((2 * Math.PI * (c - c0)) / 0.105);
      return 0.14 + 1.2 * Math.pow(b, 1.05) * fold * (1 - 0.25 * smooth(270, 325, x));
    },
  }));
  layer('crownEdge', 'url(#gCap)').paths.push(...outline(S.crown, OCC.crown, { w0: 0.3, w1: 1.15, gap: 1.0, region: M.crown }));
  // brim: reeding, foreshortened like a ring
  const B = layer('brim', 'url(#gBrim)');
  const cx = (BRIM.x0 + BRIM.x1) / 2, rx = (BRIM.x1 - BRIM.x0) / 2 - 1;
  const tilt = Math.atan2(BRIM.yb1 - BRIM.yb0, BRIM.x1 - BRIM.x0);
  for (let th = 0.06; th < Math.PI - 0.02; th += 0.0155) {
    const x = cx - rx * Math.cos(th);
    const yb = brimBottom(x) + 1, yt = yb - BRIM.h - 3;
    const pts = [], ws = [], ins = [];
    for (let y = yb; y >= yt; y -= 0.5) {
      const xx = x + (y - yb) * Math.tan(tilt);
      pts.push([xx, y]);
      const up = (yb - y) / BRIM.h;
      const lit = clamp((0.35 + 0.65 * Math.pow(Math.sin(th), 0.5) * (1 - 0.55 * smooth(0.3, 1, th / Math.PI))) * (0.6 + 0.4 * up));
      ws.push(0.1 + 0.68 * lit);
      ins.push(sample(SD.brim, xx, y) - 0.2);
    }
    B.paths.push(...runsToRibbons(pts, ws, ins, { cut: 0.1, taper: 1.2 }));
  }
  B.paths.push(...outline(S.brim, OCC.brim, { w0: 0.4, w1: 1.1, gap: 1.0, region: M.brim }));
  const P = layer('pearls', 'url(#gPearl)');
  for (const x of brimNotches()) {
    const y = brimBottom(x) - BRIM.h + BRIM.notch - 0.6;
    const r = 1.7 * (0.75 + 0.25 * Math.sin(Math.acos(clamp((x - cx) / rx, -1, 1))));
    P.paths.push(circleD(x, y, r));
  }
}

// ---- feather
{
  const L = layer('feather', 'url(#gFeather)');
  for (const b of FEA.barbs) {
    const ins = b.pts.map((p) => -sample(OCC.feather, p[0], p[1]) - 0.6);
    L.paths.push(...runsToRibbons(b.pts, b.ws, ins, { cut: 0.07, taper: 0.6, minLen: 1 }));
  }
  const ins = FEA.shaft.pts.map((p) => -sample(OCC.feather, p[0], p[1]) - 0.6);
  layer('featherShaft', 'url(#gQuill)').paths.push(...runsToRibbons(FEA.shaft.pts, FEA.shaft.ws, ins, { cut: 0.05, taper: 1.5, minLen: 1 }));
}

// ---- ruff: a band of rounded folds, each lit on its left
{
  const L = layer('ruff', 'url(#gRuff)');
  const len = (() => { let s = 0, p = ruffCenter(0); for (let i = 1; i <= 200; i++) { const q = ruffCenter(i / 200); s += dist(p, q); p = q; } return s; })();
  for (let s = 0.4; s < len; s += 0.95) {
    const t = s / len, [x0, y0] = ruffCenter(t);
    const [xa, ya] = ruffCenter(Math.max(0, t - 0.003)), [xb, yb] = ruffCenter(Math.min(1, t + 0.003));
    let tx = xb - xa, ty = yb - ya; const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
    const nx = ty, ny = -tx;
    const f = (s / RUFF.cell) % 1;
    const tube = Math.pow(Math.sin(Math.PI * f), 0.9) * (0.62 + 0.38 * Math.cos(2 * Math.PI * (f - 0.3)));
    const pts = [], ws = [], ins = [];
    for (let u = -15; u <= 15; u += 0.5) {
      const x = x0 + nx * u, y = y0 + ny * u;
      pts.push([x, y]);
      const across = 0.55 + 0.45 * Math.cos((Math.PI * u) / 30);
      const shade = 1 - 0.45 * smooth(205, 262, x);
      ws.push(0.08 + 0.95 * tube * across * shade);
      ins.push(sample(SD.ruff, x, y) - 0.2);
    }
    L.paths.push(...runsToRibbons(pts, ws, ins, { cut: 0.12, taper: 0.8, minLen: 1 }));
  }
  L.paths.push(...outline(S.ruff, OCC.ruff, { w0: 0.25, w1: 0.8, gap: 1.0, region: M.ruff }));
}

// ---- doublet: cross-contour lines round the body, a placket with pearl buttons
const PLACKET = { x: (y) => 213.5 - (y - 245) * 0.075, half: 4 };
{
  const dH = inflate(M.doublet, 40, 16, 2);
  const castSD = sdf(G.mOr(M.forearm, M.cuff, M.hand, M.f1, M.f2, M.f3, M.f4, M.heart));
  const armSD = sdf(M.upperArm);
  const topSD = sdf(G.mOr(M.ruff, M.hair));
  const dB = (x, y) => {
    let b = clamp((lambert(dH, x, y, 0.55) - 0.3) / 0.6);
    b *= 0.98 - 0.34 * smooth(285, 380, y);
    b *= castBy(castSD, x, y, 5.5, 8, 0.75) * castBy(topSD, x, y, 6, 9, 0.6);
    b *= 1 - 0.8 * (1 - smooth(0.8, 12, -sample(armSD, x, y))); // the body darkens into the crease beside the near arm
    b *= 1 - 0.32 * smooth(226, 292, x); // and the chest turns from the light toward that side
    return b;
  };
  const L = layer('doublet', 'url(#gDoublet)');
  // cross-contours: over the shoulders they slope down from the neck, lower they round the chest
  const cxD = 250, rxD = 104;
  const ins = G.field((x, y) => Math.min(sample(SD.doublet, x, y), Math.abs(x - PLACKET.x(y)) - PLACKET.half));
  L.paths.push(...family({
    at: (c, u) => {
      const q = (u - cxD) / rxD, bow = lerp(3, 9.5, smooth(246, 330, c)), sh = 0.32 * (1 - smooth(236, 300, c));
      return [u, c + bow * Math.sqrt(Math.max(0, 1 - q * q)) + sh * (Math.hypot(u - 230, 12) - 12), 0, 1];
    },
    cs: [214, 440, 2.3], us: [146, 358, 0.7], h: dH, k: 0.2, inside: ins, margin: 0.3, minLen: 2.4,
    width: (x, y) => 0.06 + 0.8 * Math.pow(dB(x, y), 1.35),
  }));
  L.paths.push(...outline(S.doublet, OCC.doublet, { w0: 0.3, w1: 1.15, gap: 1.0, region: M.doublet, lightPow: 1.4, minLen: 5 }));
  // placket: a raised band, finely ruled, its edges and pearl buttons
  const plIns = G.field((x, y) => Math.min(sample(SD.doublet, x, y) - 0.3, PLACKET.half - 1.6 - Math.abs(x - PLACKET.x(y))));
  L.paths.push(...family({ at: (c, u) => [u, c, 0, 1], cs: [236, 400, 1.25], us: [196, 222, 0.4], inside: plIns,
    width: (x, y) => 0.08 + 0.5 * Math.pow(dB(x, y), 1.1) * (1.15 - 0.3 * (x - PLACKET.x(y) + PLACKET.half) / (2 * PLACKET.half)), cut: 0.1, minLen: 0.8 }));
  const PL = layer('placket', 'url(#gQuilt)');
  for (const side of [-1, 1]) {
    const pts = [], ws = [], inn = [];
    for (let y = 236; y <= 400; y += 0.6) {
      const x = PLACKET.x(y) + side * (PLACKET.half - 0.9);
      pts.push([x, y]); ws.push((side < 0 ? 0.75 : 0.4) * (0.4 + 0.6 * dB(x, y)) + 0.12); inn.push(sample(SD.doublet, x, y) - 0.3);
    }
    PL.paths.push(...runsToRibbons(pts, ws, inn, { cut: 0.05, taper: 1, minLen: 1 }));
  }
  const BT = layer('buttons', 'url(#gPearl)');
  for (let y = 251; y < 400; y += 11.5) {
    const x = PLACKET.x(y);
    if (sample(SD.doublet, x, y) > 3.4) BT.paths.push(circleD(x, y, 1.95));
  }
}

// ---- sleeves: the upper arm gathered at the shoulder, the forearm ringed
{
  // the near arm: a full round sleeve, its leading edge in the light, its far side falling into shade
  const hh = inflate(M.upperArm, 30, 24, 2);
  const L = layer('upperArm', 'url(#gSleeve)');
  const F = [316, 430];
  const a0 = Math.atan2(246 - F[1], 276 - F[0]), a1 = Math.atan2(246 - F[1], 352 - F[0]);
  const castSD = sdf(G.mOr(M.cuff, M.hand, M.heart));
  L.paths.push(...family({
    at: (c, u) => [F[0] + u * Math.cos(c), F[1] + u * Math.sin(c), -Math.sin(c), Math.cos(c)],
    cs: [a0, a1, 0.0128], us: [60, 190, 0.8], h: hh, k: 0.6, inside: SD.upperArm, margin: 0.25,
    width: (x, y) => 0.1 + 1.08 * Math.pow(clamp((lambert(hh, x, y, 1.0) - 0.3) / 0.56) * (1 - 0.38 * smooth(296, 345, y)), 1.15),
  }));
  L.paths.push(...outline(S.upperArm, OCC.upperArm, { w0: 0.3, w1: 1.55, gap: 1.0, region: M.upperArm, lightPow: 1.3 }));
  // the far sleeve, in the half-light past the body, darkest where it passes behind it
  const sh = inflate(M.farSleeve, 14, 8, 1.4);
  const dSD = sdf(M.doublet);
  const FS = layer('farSleeve', 'url(#gDoublet)');
  const F2 = [170, 560]; // lines run the length of the arm, gathering slightly toward the elbow
  FS.paths.push(...family({
    at: (c, u) => [F2[0] + u * Math.cos(c), F2[1] + u * Math.sin(c), -Math.sin(c), Math.cos(c)],
    cs: [Math.atan2(246 - F2[1], 138 - F2[0]), Math.atan2(246 - F2[1], 194 - F2[0]), 0.0056], us: [185, 330, 0.8], h: sh, k: 0.5, inside: SD.farSleeve, margin: 0.25,
    width: (x, y) => 0.14 + 0.78 * Math.pow(clamp((lambert(sh, x, y, 0.9) - 0.16) / 0.64) * (1 - 0.28 * smooth(300, 350, y)) * (1 - 0.5 * (1 - smooth(0.6, 3.2, -sample(dSD, x, y)))), 1.1),
  }));
  FS.paths.push(...outline(S.farSleeve, OCC.farSleeve, { w0: 0.3, w1: 1.0, gap: 1.0, region: M.farSleeve, lightPow: 1.3 }));
  const fh = inflate(M.forearm, 13, 10, 1.4);
  const FA = layer('forearm', 'url(#gSleeve)');
  // rings round the forearm: ellipse arcs bowing toward the wrist, like the cuff it reaches into
  const W0 = [236, 306], E0 = [337, 322.5], LF = dist(W0, E0), T = [(E0[0] - W0[0]) / LF, (E0[1] - W0[1]) / LF], N = [-T[1], T[0]];
  const ringAt = (c, u) => {
    const ax = W0[0] + T[0] * c, ay = W0[1] + T[1] * c, h = 12.6 + (c / LF) * 1.2, bow = 3.6 * (1 - u * u);
    return [ax + N[0] * h * u - T[0] * bow, ay + N[1] * h * u - T[1] * bow, T[0], T[1]];
  };
  FA.paths.push(...family({ at: ringAt, cs: [-6, LF + 6, 1.9], us: [-1.3, 1.3, 0.025], h: fh, k: 0.35, inside: SD.forearm, margin: 0.25,
    width: (x, y) => 0.13 + 1.0 * Math.pow(clamp((lambert(fh, x, y, 0.8) - 0.22) / 0.62) * castBy(castSD, x, y, 4, 6, 0.5), 1.15) }));
  FA.paths.push(...outline(S.forearm, OCC.forearm, { w0: 0.35, w1: 1.25, gap: 1.0, region: M.forearm, lightPow: 1.2 }));
}

// ---- cuff: a frill round the wrist
{
  const L = layer('cuff', 'url(#gRuff)');
  const a = (CUFF.rot * Math.PI) / 180, ax = [-Math.sin(a), Math.cos(a)], mn = [Math.cos(a), Math.sin(a)]; // major (down), minor (right)
  const cell = 3.6;
  for (let s = -CUFF.ry - 2; s <= CUFF.ry + 2; s += 0.8) {
    const f = (((s + 40) / cell) % 1 + 1) % 1;
    const tube = Math.pow(Math.sin(Math.PI * f), 0.9) * (0.62 + 0.38 * Math.cos(2 * Math.PI * (f - 0.3)));
    const pts = [], ws = [], ins = [];
    for (let u = -CUFF.rx - 2; u <= CUFF.rx + 2; u += 0.4) {
      const x = CUFF.cx + ax[0] * s + mn[0] * u, y = CUFF.cy + ax[1] * s + mn[1] * u;
      pts.push([x, y]);
      ws.push(0.08 + 0.85 * tube * (0.6 + 0.4 * Math.cos((Math.PI * u) / (2 * CUFF.rx + 4))) * (1 - 0.35 * smooth(-4, 15, s)));
      ins.push(sample(SD.cuff, x, y) - 0.2);
    }
    L.paths.push(...runsToRibbons(pts, ws, ins, { cut: 0.1, taper: 0.6, minLen: 0.8 }));
  }
  L.paths.push(...outline(S.cuff, OCC.cuff, { w0: 0.3, w1: 0.85, gap: 0.9, region: M.cuff }));
}

// ---- the hand: the palm engraved in flow lines from wrist to knuckles, the digits along their length
{
  const palmM = rasterize(S.hand), thumbM = rasterize(S.thumb);
  const palmSD = sdf(palmM), thumbSD = sdf(thumbM);
  const heartSD = sdf(M.heart);
  const shade = (x, y) => castBy(heartSD, x, y, 3.5, 5, 0.55); // the heart's shadow on the hand below it
  const L = layer('hand', 'url(#gHand)');
  const palmIns = G.field((x, y) => Math.min(sample(SD.hand, x, y), -sample(thumbSD, x, y) - 0.45));
  // the palm: a rounded slab, its upper face to the light, its underside turning away
  for (let a = 0.05; a < 0.99; a += 0.1) {
    const pts = palmLine(a, 160), ws = [], ins = [];
    const c = 2 * a - 1, n3 = [0, c, Math.sqrt(1 - c * c)];
    const lit = Math.max(0, n3[1] * LIGHT[1] + n3[2] * LIGHT[2]);
    for (const p of pts) {
      const b = clamp((lit - 0.12) / 0.75) * shade(p[0], p[1]) * (1 - 0.25 * smooth(214, 234, p[0]));
      ws.push(0.1 + 0.95 * Math.pow(b, 1.25));
      ins.push(sample(palmIns, p[0], p[1]) - 0.12);
    }
    L.paths.push(...runsToRibbons(pts, ws, ins, { cut: 0.1, taper: 1.2, minLen: 0.8 }));
  }
  const thIns = G.field((x, y) => Math.min(sample(SD.hand, x, y), sample(thumbSD, x, y)));
  L.paths.push(...digitLines(DIGITS.thumb, thIns, { n: 7, shade }));
  const FL = layer('fingers', 'url(#gHand)');
  for (const k of ['f1', 'f2', 'f3', 'f4']) FL.paths.push(...digitLines(DIGITS[k], SD[k], { n: 5, shade }));
  // one rim round the whole hand: each part's contour, kept only where no other part lies over it
  const parts = { palm: palmM, thumb: thumbM, f1: M.f1, f2: M.f2, f3: M.f3, f4: M.f4 };
  const extSD = sdf(G.mOr(M.cuff, M.heart));
  const R = layer('handRim', 'url(#gRim)');
  for (const k of Object.keys(parts)) {
    const others = sdf(G.mOr(...Object.keys(parts).filter((o) => o !== k).map((o) => parts[o])));
    const fing = k[0] === 'f';
    R.paths.push(...outline(k === 'palm' ? S.hand : S[k], null, { w0: fing ? 0.2 : 0.28, w1: fing ? 0.7 : 0.95, region: parts[k],
      hide: (x, y) => Math.min(-sample(extSD, x, y) - 0.8, 0.35 - sample(others, x, y)) }));
  }
}

// ---- held heart: crimson, engraved shading, champagne hairline
{
  const hh = inflate(M.heart, 11, 7, 1.2);
  const L = layer('heartShade', C.crim3);
  const p = parallel(38), r = ranges(p, bboxOf(M.heart), 1.15, 0.45);
  const hsd = sdf(M.heart);
  // finer cuts, and none where the heart turns to the light: it glows from the upper lobe
  L.paths.push(...family({ at: p.at, cs: r.cs, us: r.us, h: hh, k: 0.35, inside: hsd, margin: 0.9,
    width: (x, y) => { const b = clamp((lambert(hh, x, y, 0.9) - 0.25) / 0.6); return 0.04 + 0.78 * Math.pow(1 - b, 1.9); }, cut: 0.1 }));
}

// ------------------------------------------------------------------ background field (inside the panel)
const PANEL = { x0: 92, y0: 40, x1: 408, y1: 660, band: 10 };
const IN = { x0: PANEL.x0 + PANEL.band, y0: PANEL.y0 + PANEL.band, x1: PANEL.x1 - PANEL.band, y1: PANEL.y1 - PANEL.band };
const DIVHALF = 6; // half width of the diagonal band (perpendicular)
const dvy = DIVHALF * Math.sqrt(1 + DIV.slope * DIV.slope);
{
  const L = layer('bg', 'url(#gBg)');
  const ang = (Math.atan(DIV.slope) * 180) / Math.PI;
  const p = parallel(ang);
  const r = ranges(p, [IN.x0, IN.y0, IN.x1, divY(IN.x0)], 2.6, 1.5);
  const halo = (x, y) => -sample(FIGSD, x, y);
  L.paths.push(...family({ at: p.at, cs: r.cs, us: r.us,
    inside: G.field((x, y) => Math.min(x - IN.x0, IN.x1 - x, y - IN.y0, (divY(x) - dvy) - y, -sample(FIGSD, x, y) - 3.2)),
    width: (x, y) => 0.17 + 0.25 * smooth(4, 40, halo(x, y)), cut: 0.05, taper: 2 }));
}
console.log('engraving', Date.now() - T0, 'ms');

// ------------------------------------------------------------------ ornament: frame band, divider, center
function roundedRectPath(x0, y0, x1, y1, r, step = 0.5) {
  const pts = [];
  const arc = (cx, cy, a0, a1) => { for (let a = a0; a <= a1 + 1e-9; a += step / r) pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); };
  const line = (ax, ay, bx, by) => { const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / step)); for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n]); };
  line(x0 + r, y0, x1 - r, y0); arc(x1 - r, y0 + r, -Math.PI / 2, 0);
  line(x1, y0 + r, x1, y1 - r); arc(x1 - r, y1 - r, 0, Math.PI / 2);
  line(x1 - r, y1, x0 + r, y1); arc(x0 + r, y1 - r, Math.PI / 2, Math.PI);
  line(x0, y1 - r, x0, y0 + r); arc(x0 + r, y0 + r, Math.PI, Math.PI * 1.5);
  return pts;
}
function trochoidBand(center, halfW, loopsApprox, phase = 0) {
  const pts = resample(center, 0.25);
  const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + dist(pts[i - 1], pts[i]));
  const L = acc[acc.length - 1];
  const loops = Math.round(loopsApprox);
  const out = [];
  const tanAt = (i) => { const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)]; const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1; return [tx / tl, ty / tl]; };
  for (let i = 0; i < pts.length; i++) {
    const th = (acc[i] / L) * loops * 2 * Math.PI + phase;
    const [tx, ty] = tanAt(i);
    const nx = -ty, ny = tx;
    const rT = halfW * 0.55, rN = halfW;
    out.push([pts[i][0] + tx * rT * Math.cos(th) + nx * rN * Math.sin(th), pts[i][1] + ty * rT * Math.cos(th) + ny * rN * Math.sin(th)]);
  }
  return out;
}
const ORN = [];
const strokeD = (pts, w, col) => `<path d="${polyD(pts, false)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`;
{
  const R0 = 9;
  const outer = roundedRectPath(PANEL.x0, PANEL.y0, PANEL.x1, PANEL.y1, R0);
  const mid = roundedRectPath(PANEL.x0 + 5, PANEL.y0 + 5, PANEL.x1 - 5, PANEL.y1 - 5, R0 - 5 + 0.0001 + 3);
  const inner = roundedRectPath(IN.x0, IN.y0, IN.x1, IN.y1, 3);
  ORN.push(strokeD([...outer, outer[0]], 1.5, 'url(#gEdge)'));
  ORN.push(strokeD([...inner, inner[0]], 0.7, C.gold));
  const midC = [...mid, mid[0]];
  const per = 1860 / 7.2;
  for (let k = 0; k < 3; k++) ORN.push(strokeD(trochoidBand(midC, 3.1, per, (k * 2 * Math.PI) / 3), 0.42, k === 1 ? C.champ : C.gold));
}
{
  const xA = PANEL.x0 + 1, xB = PANEL.x1 - 1;
  const line = (off) => [[xA, divY(xA) + off], [xB, divY(xB) + off]];
  ORN.push(`<path d="M${num(xA)} ${num(divY(xA) - dvy)}L${num(xB)} ${num(divY(xB) - dvy)}L${num(xB)} ${num(divY(xB) + dvy)}L${num(xA)} ${num(divY(xA) + dvy)}Z" fill="${C.ground}"/>`);
  ORN.push(strokeD(line(-dvy), 0.9, C.gold));
  ORN.push(strokeD(line(dvy), 0.9, C.gold));
  const c = [[xA + 2, divY(xA + 2)], [xB - 2, divY(xB - 2)]];
  const cen = resample(c, 0.25);
  const Ldiag = dist(c[0], c[1]);
  for (let k = 0; k < 2; k++) ORN.push(strokeD(trochoidBand(cen, 2.7, Ldiag / 6.4, k * Math.PI), 0.42, k ? C.champ : C.gold));
}
{
  const cx = 250, cy = 350, R = 13;
  ORN.push(`<circle cx="${cx}" cy="${cy}" r="${R + 2.2}" fill="${C.ground}" stroke="url(#gEdge)" stroke-width="1.2"/>`);
  for (let k = 0; k < 9; k++) {
    const pts = [];
    for (let a = 0; a <= 360; a += 1.5) {
      const t = (a * Math.PI) / 180;
      const r = R * (0.55 + 0.4 * (0.5 + 0.5 * Math.sin(12 * t + (k * 2 * Math.PI) / 9)));
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    ORN.push(strokeD(pts, 0.3, k % 3 === 0 ? C.champ : C.gold));
  }
  ORN.push(`<circle cx="${cx}" cy="${cy}" r="${R + 0.3}" fill="none" stroke="${C.gold}" stroke-width="0.5"/>`);
  // the heart seal in the eye of the rosette, as at the centre of the first card
  const s = 0.112, tr = `translate(${num(cx - 50 * s, 2)} ${num(cy - 47.5 * s, 2)}) scale(${s})`;
  ORN.push(`<g filter="url(#sealGlow)"><path d="${HEART}" transform="${tr}" fill="#FF2E4D" opacity=".75"/></g>`);
  ORN.push(`<path d="${HEART}" transform="${tr}" fill="url(#gPip)" stroke="${C.champ}" stroke-width="${num(0.45 / s, 2)}" stroke-linejoin="round"/>`);
}

// ------------------------------------------------------------------ indices
// Gloock "J", fontSize 78, centre x 52, baseline 104 (from glyph.mjs)
const J_PATH = 'M39.05 118.59L39.05 118.59L38.97 117.88Q42.25 117.57 44.20 112.50Q46.15 107.43 46.15 99.16L46.15 99.16L46.15 52.52Q46.15 49.71 44.43 48.00Q42.72 46.28 39.91 46.28L39.91 46.28L39.75 46.28L39.75 45.50L64.25 45.50L64.25 46.28L64.17 46.28Q61.36 46.28 59.64 48.00Q57.93 49.71 57.93 52.52L57.93 52.52L57.93 99.16Q57.93 104.47 55.55 108.68Q53.17 112.89 48.92 115.47Q44.67 118.04 39.05 118.59Z';
const INDEX = `<g id="index"><path d="${J_PATH}" fill="url(#gJ)" stroke="${C.champ}" stroke-width="0.6" stroke-linejoin="round"/>` +
  `<path d="${HEART}" transform="translate(34 125.4) scale(.36)" fill="url(#gPip)" stroke="${C.champ}" stroke-width="1.6"/></g>`;

// ------------------------------------------------------------------ assemble
const CARD = { x: 3, y: 3, w: 494, h: 694, r: 34 };
const layersOrder = ['bg', 'farSleeve', 'doublet', 'placket', 'buttons', 'face', 'eye', 'brow', 'faceRim', 'ruff', 'hair', 'feather', 'featherShaft', 'crown', 'crownEdge', 'brim', 'pearls',
  'forearm', 'upperArm', '#heartGlow', 'cuff', 'hand', 'fingers', 'handRim', '#heart', 'heartShade', '#heartLine'];
let half = '';
for (const name of layersOrder) {
  // the held heart's light: a soft crimson bloom on the body behind it (the hand in front stays gold)
  if (name === '#heartGlow') { half += `<path d="${S.heart}" fill="#FF2E4D" opacity=".55" filter="url(#heartGlow)"/>`; continue; }
  if (name === '#heart') { half += `<path d="${S.heart}" fill="url(#gHeart)"/>`; continue; }
  if (name === '#heartLine') { half += `<path d="${S.heart}" fill="none" stroke="${C.champ}" stroke-width="0.55"/>`; continue; }
  const L = OUT[name];
  if (!L || !L.paths.length) continue;
  half += `<path fill="${L.fill}"${name === 'eye' || name === 'faceRim' ? ' filter="url(#eyeGlow)"' : ''} d="${L.paths.join('')}"/>`;
}

const halfClip = `M${num(IN.x0)} ${num(IN.y0)}H${num(IN.x1)}V${num(divY(IN.x1) - dvy)}L${num(IN.x0)} ${num(divY(IN.x0) - dvy)}Z`;
const hc = [HELD.cx - 8, HELD.tip - 27];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 500 700" width="500" height="700">
<defs>
<clipPath id="card"><rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}"/></clipPath>
<clipPath id="halfClip"><path d="${halfClip}"/></clipPath>
<linearGradient id="gEdge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.champ}"/><stop offset=".3" stop-color="${C.gold}"/><stop offset=".62" stop-color="${C.burn}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>
<radialGradient id="gFace" gradientUnits="userSpaceOnUse" cx="168" cy="150" r="80"><stop offset="0" stop-color="${C.champ}"/><stop offset=".55" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.burn}"/></radialGradient>
<radialGradient id="gHand" gradientUnits="userSpaceOnUse" cx="196" cy="298" r="44"><stop offset="0" stop-color="${C.champ}"/><stop offset=".6" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.burn}"/></radialGradient>
<linearGradient id="gRim" gradientUnits="userSpaceOnUse" x1="140" y1="100" x2="230" y2="330"><stop offset="0" stop-color="${C.champ}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>
<linearGradient id="gHair" gradientUnits="userSpaceOnUse" x1="200" y1="110" x2="300" y2="270"><stop offset="0" stop-color="${C.gold}"/><stop offset=".6" stop-color="${C.burn}"/><stop offset="1" stop-color="${C.deep}"/></linearGradient>
<linearGradient id="gCap" gradientUnits="userSpaceOnUse" x1="150" y1="58" x2="325" y2="98"><stop offset="0" stop-color="${C.champ}"/><stop offset=".45" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.burn}"/></linearGradient>
<linearGradient id="gBrim" gradientUnits="userSpaceOnUse" x1="145" y1="0" x2="305" y2="0"><stop offset="0" stop-color="${C.gold}"/><stop offset=".28" stop-color="${C.gold}"/><stop offset=".72" stop-color="${C.burn}"/><stop offset="1" stop-color="#83601A"/></linearGradient>
<radialGradient id="gPearl" gradientUnits="userSpaceOnUse" cx="200" cy="90" r="160"><stop offset="0" stop-color="${C.champ}"/><stop offset="1" stop-color="${C.gold}"/></radialGradient>
<linearGradient id="gQuill" gradientUnits="userSpaceOnUse" x1="300" y1="88" x2="370" y2="128"><stop offset="0" stop-color="${C.champ}"/><stop offset=".5" stop-color="${C.champ}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>
<linearGradient id="gFeather" gradientUnits="userSpaceOnUse" x1="315" y1="62" x2="372" y2="135"><stop offset="0" stop-color="${C.champ}"/><stop offset=".6" stop-color="${C.champ}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>
<linearGradient id="gRuff" gradientUnits="userSpaceOnUse" x1="184" y1="0" x2="262" y2="0"><stop offset="0" stop-color="${C.champ}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>
<linearGradient id="gDoublet" gradientUnits="userSpaceOnUse" x1="170" y1="250" x2="330" y2="380"><stop offset="0" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.burn}"/></linearGradient>
<linearGradient id="gQuilt" gradientUnits="userSpaceOnUse" x1="170" y1="250" x2="320" y2="380"><stop offset="0" stop-color="${C.champ}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>
<linearGradient id="gSleeve" gradientUnits="userSpaceOnUse" x1="236" y1="250" x2="346" y2="340"><stop offset="0" stop-color="${C.champ}"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.burn}"/></linearGradient>
<linearGradient id="gBg" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="400"><stop offset="0" stop-color="${C.burn}"/><stop offset="1" stop-color="${C.deep}"/></linearGradient>
<radialGradient id="gHeart" gradientUnits="userSpaceOnUse" cx="${hc[0]}" cy="${hc[1]}" r="34"><stop offset="0" stop-color="#FF5A70"/><stop offset=".32" stop-color="${C.crim}"/><stop offset=".78" stop-color="${C.crim}"/><stop offset="1" stop-color="${C.crim2}"/></radialGradient>
<filter id="heartGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4.5"/></filter>
<filter id="sealGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.5"/></filter>
<pattern id="lattice" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M4 0V8M0 4H8" stroke="${C.gold}" stroke-width=".55" stroke-opacity=".12"/></pattern>
<filter id="feather" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
<mask id="mMargin" maskUnits="userSpaceOnUse" x="0" y="0" width="500" height="700"><rect width="500" height="700" fill="#fff"/><g filter="url(#feather)"><rect x="25" y="35" width="54" height="134" rx="18"/><rect x="25" y="35" width="54" height="134" rx="18" transform="rotate(180 250 350)"/></g></mask>
<linearGradient id="gJ" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.crim}"/><stop offset="1" stop-color="${C.crim2}"/></linearGradient>
<linearGradient id="gPip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.crim}"/><stop offset="1" stop-color="${C.crim2}"/></linearGradient>
<g id="half" clip-path="url(#halfClip)">${half}</g>
${INDEX}
<radialGradient id="gField" cx="0.5" cy="0.5" r="0.62"><stop offset="0" stop-color="#3A0B16"/><stop offset="0.5" stop-color="#14070B"/><stop offset="1" stop-color="#070405"/></radialGradient>
<radialGradient id="gAura" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FF2E4D" stop-opacity="0.42"/><stop offset="0.5" stop-color="#C41E3A" stop-opacity="0.14"/><stop offset="1" stop-color="#C41E3A" stop-opacity="0"/></radialGradient>
<radialGradient id="gVelvet" gradientUnits="userSpaceOnUse" cx="190" cy="62" r="150"><stop offset="0" stop-color="#FF5A70"/><stop offset="0.45" stop-color="#E0263F"/><stop offset="1" stop-color="#8E1428"/></radialGradient>
<radialGradient id="gDarkFace" gradientUnits="userSpaceOnUse" cx="168" cy="150" r="80"><stop offset="0" stop-color="#6E2232"/><stop offset="0.55" stop-color="#43121E"/><stop offset="1" stop-color="#22080E"/></radialGradient>
<filter id="eyeGlow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<g clip-path="url(#card)">
<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="${C.ground}"/>
<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" fill="url(#lattice)" mask="url(#mMargin)"/>
<rect x="14" y="14" width="472" height="672" rx="24" fill="none" stroke="${C.burn}" stroke-width="0.7"/>
<rect x="92" y="40" width="316" height="620" fill="url(#gField)"/>
<circle cx="212" cy="170" r="150" fill="url(#gAura)"/>
<circle cx="288" cy="530" r="150" fill="url(#gAura)"/>
<use href="#half"/>
<use href="#half" transform="rotate(180 250 350)"/>
${ORN.join('\n')}
<use href="#index"/>
<use href="#index" transform="rotate(180 250 350)"/>
<rect x="${CARD.x + 2.25}" y="${CARD.y + 2.25}" width="${CARD.w - 4.5}" height="${CARD.h - 4.5}" rx="${CARD.r - 2.25}" fill="none" stroke="url(#gEdge)" stroke-width="4.5"/>
</g>
</svg>
`;
writeFileSync(join(HERE, 'card.svg'), svg);
console.log('card.svg', (svg.length / 1024).toFixed(1), 'KB', Date.now() - T0, 'ms');
