import type { Obstacle, Point } from './movement';

export interface DeskSpot extends Point { n: number; facing: number; table: Point }
export const REFERENCE_SIZE = { width: 1545, height: 1018 };
// Registration of the approved camera: back, right, front and left floor corners.
const ground = [[-12, -9.5, 698, 213], [12, -9.5, 1486, 650], [12, 9.5, 940, 943], [-12, 9.5, 84, 493]];
function solve(a: number[][]) {
  for (let i = 0; i < 8; i++) {
    let pivot = i; for (let j = i + 1; j < 8; j++) if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    [a[i], a[pivot]] = [a[pivot], a[i]];
    const v = a[i][i]; for (let k = i; k <= 8; k++) a[i][k] /= v;
    for (let j = 0; j < 8; j++) if (j !== i) { const m = a[j][i]; for (let k = i; k <= 8; k++) a[j][k] -= m * a[i][k]; }
  }
  return a.map(r => r[8]);
}
export const REFERENCE_H = solve(ground.flatMap(([x, z, u, v]) => [
  [x, z, 1, 0, 0, 0, -u * x, -u * z, u], [0, 0, 0, x, z, 1, -v * x, -v * z, v],
]));
export function referencePixel(p: Point) {
  const h = REFERENCE_H, w = h[6] * p.x + h[7] * p.z + 1;
  return { x: (h[0] * p.x + h[1] * p.z + h[2]) / w, y: (h[3] * p.x + h[4] * p.z + h[5]) / w };
}
export function referencePoint(u: number, v: number): Point {
  const h = REFERENCE_H, a = h[0] - u * h[6], b = h[1] - u * h[7], c = u - h[2];
  const d = h[3] - v * h[6], e = h[4] - v * h[7], f = v - h[5], det = a * e - b * d;
  return { x: (c * e - b * f) / det, z: (a * f - c * d) / det };
}
export const REFERENCE_SPOTS = {
  manager: referencePoint(1314, 560), cafe: referencePoint(300, 459), capture: referencePoint(426, 594),
  lounge: referencePoint(728, 303), loungeWalk: referencePoint(666, 338), brainstorm: referencePoint(977, 775),
  meeting: [[733, 818], [799, 854], [862, 889], [783, 735], [850, 769], [919, 806]].map(([x, y]) => referencePoint(x, y)),
};
function referenceLayout(count: number) {
  const spots = [[590, 499], [664, 540], [697, 421], [766, 460], [786, 611], [861, 653], [859, 512], [946, 557]];
  const tables = [referencePoint(670, 497), referencePoint(860, 602)];
  const desks = spots.slice(0, count).map(([u, v], i) => ({ ...referencePoint(u, v), n: i + 1, facing: i % 4 < 2 ? Math.PI : 0, table: tables[Math.floor(i / 4)] }));
  const blocks: Obstacle[] = [
    ...tables.map(p => ({ ...p, w: 4.35, d: 1.38 })),
    { ...referencePoint(223, 445), w: 1.2, d: 5.9 },
    { ...referencePoint(766, 289), w: 3.95, d: 1.05 },
    { ...referencePoint(706, 302), w: 1.8, d: .85 },
    { ...referencePoint(400, 556), w: .18, d: 4.8 },
    { ...referencePoint(813, 809), w: 4, d: 1.3 },
    { ...referencePoint(1035, 716), w: 2.45, d: 2.45 },
    { ...referencePoint(1310, 619), w: 3.65, d: 1.35 },
  ];
  return { width: 24, depth: 19, back: -9.5, front: 9.5, desks, blocks, reference: true };
}
export function officeLayout(count: number) {
  if (count <= 8) return referenceLayout(count);
  const rows = Math.max(1, Math.ceil(count / 8));
  const width = 24, depth = Math.max(19, 13 + rows * 4.4), back = -depth / 2, front = depth / 2;
  const desks: DeskSpot[] = [];
  const blocks: Obstacle[] = [];
  for (let i = 0; i < rows; i++) for (let col = 0; col < 2; col++) {
    if (i * 8 + col * 4 >= count) continue;
    const x = col ? 2 : -3.7, z = back + 7.9 + i * 4.4 + (col ? .6 : 0);
    blocks.push({ x, z, w: 4.4, d: 1.6 });
    for (let side = 0; side < 4; side++) {
      const n = i * 8 + col * 4 + side + 1, frontSide = side < 2;
      if (n <= count) desks.push({ n, x: x + (side % 2 ? 1.05 : -1.05), z: z + (frontSide ? 1.35 : -1.35), facing: frontSide ? Math.PI : 0, table: { x, z } });
    }
  }
  blocks.push(
    { x: -10.7, z: back + 7.4, w: 1.8, d: 6.4 }, // coffee counter
    { x: -6.1, z: back + 1.3, w: 5.2, d: 1.2 }, // lounge sofa
    { x: -6.1, z: back + 3.15, w: 2.5, d: .95 },
    { x: -8.1, z: front - 4, w: 4.9, d: .2 }, // green screen
    { x: 1.8, z: front - 2.8, w: 3.8, d: 1.25 }, // meeting table, with side aisles
    { x: 8.1, z: front - 5.5, w: 2.6, d: 2.6 }, // brainstorm
    { x: 8.8, z: back + 4.2, w: 3.8, d: 1.3 }, // manager desk
    { x: 6.3, z: back + 3.5, w: .14, d: 5.8 }, // manager side glass, door at south
    { x: 9.8, z: back + 7.15, w: 3.5, d: .14 },
    { x: -.9, z: front - 2.3, w: .06, d: 3.6 }, // meeting glass, door at north
    { x: 4.6, z: front - 2.3, w: .06, d: 3.6 },
    { x: 1.8, z: front - .51, w: 5.5, d: .06 }, // meeting front glass; entrance stays at the back
  );
  return { width, depth, back, front, desks, blocks, reference: false };
}
export type OfficeLayout = ReturnType<typeof officeLayout>;
export const loungeSeat = (index: number, back: number): Point => back === -9.5
  ? referencePoint(728 + (index % 8) * 16, 268 + (index % 8) * 8)
  : ({ x: -8.2 + (index % 8) * .6, z: back + 1.5 + Math.floor(index / 8) * .8 });
