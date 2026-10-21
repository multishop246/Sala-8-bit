import type { Obstacle, Point } from './movement';

export interface DeskSpot extends Point { n: number; facing: number; table: Point }
export function officeLayout(count: number) {
  const rows = Math.max(1, Math.ceil(count / 8));
  const width = 24, depth = Math.max(19, 13 + rows * 4.4), back = -depth / 2, front = depth / 2;
  const desks: DeskSpot[] = [];
  const blocks: Obstacle[] = [];
  for (let i = 0; i < rows; i++) for (let col = 0; col < 2; col++) {
    if (i * 8 + col * 4 >= count) continue;
    const x = col ? 2 : -3.7, z = back + 7.9 + i * 4.4 + (col ? .6 : 0);
    blocks.push({ x, z, w: 3.6, d: 1.4 });
    for (let side = 0; side < 4; side++) {
      const n = i * 8 + col * 4 + side + 1, frontSide = side < 2;
      if (n <= count) desks.push({ n, x: x + (side % 2 ? .85 : -.85), z: z + (frontSide ? 1.15 : -1.15), facing: frontSide ? Math.PI : 0, table: { x, z } });
    }
  }
  blocks.push(
    { x: -10.7, z: back + 7.4, w: 1.8, d: 6.4 }, // coffee counter
    { x: -6.1, z: back + 1.3, w: 7.2, d: 1.2 }, // lounge sofa
    { x: -6.1, z: back + 3.15, w: 2.5, d: .95 },
    { x: -8.1, z: front - 4, w: 4.9, d: .2 }, // green screen
    { x: 1.8, z: front - 2.8, w: 3.8, d: 1.25 }, // meeting table, with side aisles
    { x: 8.1, z: front - 5.5, w: 2.6, d: 2.6 }, // brainstorm
    { x: 8.8, z: back + 4.2, w: 3.8, d: 1.3 }, // manager desk
    { x: 6.3, z: back + 3.5, w: .14, d: 5.8 }, // manager side glass, door at south
    { x: 9.8, z: back + 7.15, w: 3.5, d: .14 },
    { x: -.9, z: front - 2.3, w: .06, d: 3.6 }, // meeting glass, door at north
    { x: 4.6, z: front - 2.3, w: .06, d: 3.6 },
  );
  return { width, depth, back, front, desks, blocks };
}
export type OfficeLayout = ReturnType<typeof officeLayout>;
export const loungeSeat = (index: number, back: number): Point => ({ x: -9.05 + (index % 8) * .84, z: back + 1.5 + Math.floor(index / 8) * .8 });
