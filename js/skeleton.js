'use strict';
// ===== 骨格・ポーズシステム =====
// ポーズは「標準体型（ブレイズ）」の座標で記述し、キャラごとの体型に合わせて変換する。
// 座標系: 右向き, 原点=足元中央, y下向き。
// x,y: 胴体中心（直立時）  r: 胴体の傾き(前傾が正)  hr: 頭の傾き
// rot: 全身回転（胴体中心まわり） sx,sy: スクワッシュ
// fh/bh: 前手/後手（肩からの相対）  ff/bf: 前足/後足（腰からの相対）  w: 武器角度

const BASE_POSE = {
  x: 0, y: -46, r: 0.08, hr: 0, rot: 0, sx: 1, sy: 1, w: -0.9,
  fh: [12, 8], bh: [4, 12], ff: [10, 33], bf: [-9, 33],
};
const POSE_NUM_KEYS = ['x', 'y', 'r', 'hr', 'rot', 'sx', 'sy', 'w'];
const POSE_VEC_KEYS = ['fh', 'bh', 'ff', 'bf'];

function newPose() {
  return { x: 0, y: -46, r: 0, hr: 0, rot: 0, sx: 1, sy: 1, w: 0, fh: [0, 0], bh: [0, 0], ff: [0, 0], bf: [0, 0] };
}
function copyPose(src, dst) {
  dst = dst || newPose();
  for (const k of POSE_NUM_KEYS) dst[k] = src[k] !== undefined ? src[k] : BASE_POSE[k];
  for (const k of POSE_VEC_KEYS) {
    const v = src[k] || BASE_POSE[k];
    dst[k][0] = v[0]; dst[k][1] = v[1];
  }
  return dst;
}
// 部分指定ポーズを base にマージした完全ポーズを作る
function mkPose(o, base) {
  const p = copyPose(base || BASE_POSE);
  for (const k in o) {
    if (POSE_VEC_KEYS.includes(k)) p[k] = [o[k][0], o[k][1]];
    else p[k] = o[k];
  }
  return p;
}
function lerpPose(a, b, t, out) {
  for (const k of POSE_NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of POSE_VEC_KEYS) {
    out[k][0] = a[k][0] + (b[k][0] - a[k][0]) * t;
    out[k][1] = a[k][1] + (b[k][1] - a[k][1]) * t;
  }
  return out;
}

// 2ボーンIK
function ik(ax, ay, bx, by, l1, l2, bend, out) {
  let dx = bx - ax, dy = by - ay;
  let d = Math.sqrt(dx * dx + dy * dy);
  const max = l1 + l2 - 0.01;
  if (d > max) {
    bx = ax + (dx / d) * max; by = ay + (dy / d) * max;
    dx = bx - ax; dy = by - ay; d = max;
  }
  if (d < 0.001) d = 0.001;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  out.jx = ax + ux * a + -uy * h * bend;
  out.jy = ay + uy * a + ux * h * bend;
  out.ex = bx; out.ey = by;
}

const SKEL_POINTS = ['hip', 'center', 'sh', 'neck', 'head', 'fe', 'fh', 'be', 'bh', 'fk', 'ff', 'bk', 'bf', 'wb', 'wt'];
function newPts() {
  const p = {};
  for (const k of SKEL_POINTS) p[k] = { x: 0, y: 0 };
  p.wAng = 0; p.bodyAng = 0;
  return p;
}

const _ik = { jx: 0, jy: 0, ex: 0, ey: 0 };
// pose → ワールド座標の関節位置
function solveSkeleton(pose, prop, ox, oy, facing, scale, out) {
  const kL = prop.kLeg, kA = prop.kArm, T = prop.torso;
  const hipX = pose.x * kL, hipY = (pose.y + 12.6) * kL;
  const ux = Math.sin(pose.r), uy = -Math.cos(pose.r);
  const L = out;
  const set = (pt, x, y) => { pt.x = x; pt.y = y; };
  set(L.hip, hipX, hipY);
  set(L.center, hipX + ux * T * 0.45, hipY + uy * T * 0.45);
  set(L.sh, hipX + ux * T * 0.86, hipY + uy * T * 0.86);
  set(L.neck, hipX + ux * T, hipY + uy * T);
  const hr = pose.r + pose.hr;
  set(L.head, L.neck.x + Math.sin(hr) * prop.head * 0.85, L.neck.y - Math.cos(hr) * prop.head * 0.85);
  // 腕
  ik(L.sh.x, L.sh.y, L.sh.x + pose.fh[0] * kA, L.sh.y + pose.fh[1] * kA, prop.arm[0], prop.arm[1], 1, _ik);
  set(L.fe, _ik.jx, _ik.jy); set(L.fh, _ik.ex, _ik.ey);
  ik(L.sh.x, L.sh.y, L.sh.x + pose.bh[0] * kA, L.sh.y + pose.bh[1] * kA, prop.arm[0], prop.arm[1], 1, _ik);
  set(L.be, _ik.jx, _ik.jy); set(L.bh, _ik.ex, _ik.ey);
  // 脚
  ik(L.hip.x, L.hip.y, L.hip.x + pose.ff[0] * kL, L.hip.y + pose.ff[1] * kL, prop.leg[0], prop.leg[1], -1, _ik);
  set(L.fk, _ik.jx, _ik.jy); set(L.ff, _ik.ex, _ik.ey);
  ik(L.hip.x, L.hip.y, L.hip.x + pose.bf[0] * kL, L.hip.y + pose.bf[1] * kL, prop.leg[0], prop.leg[1], -1, _ik);
  set(L.bk, _ik.jx, _ik.jy); set(L.bf, _ik.ex, _ik.ey);
  // 武器
  const wl = prop.wlen || 0;
  set(L.wb, L.fh.x, L.fh.y);
  set(L.wt, L.fh.x + Math.cos(pose.w) * wl, L.fh.y + Math.sin(pose.w) * wl);

  // 全身回転 + スクワッシュ + ワールド変換
  const rot = pose.rot, cr = Math.cos(rot), sr = Math.sin(rot);
  const cx = L.center.x, cy = L.center.y;
  const sx = pose.sx * scale * facing, sy = pose.sy * scale;
  for (let i = 0; i < SKEL_POINTS.length; i++) {
    const pt = L[SKEL_POINTS[i]];
    let x = pt.x, y = pt.y;
    if (rot !== 0) {
      const dx = x - cx, dy = y - cy;
      x = cx + dx * cr - dy * sr;
      y = cy + dx * sr + dy * cr;
    }
    pt.x = ox + x * sx;
    pt.y = oy + y * sy;
  }
  const wa = pose.w + rot;
  out.wAng = facing > 0 ? wa : Math.PI - wa;
  out.bodyAng = facing > 0 ? pose.r + rot : -(pose.r + rot);
  out.headAng = facing > 0 ? hr + rot : -(hr + rot);
  return out;
}

// 体型データを補完
function prepProp(prop) {
  prop.kArm = (prop.arm[0] + prop.arm[1]) / 28;
  prop.kLeg = (prop.leg[0] + prop.leg[1]) / 34;
  return prop;
}
