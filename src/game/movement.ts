import type { MemberState } from '../lib/types';

export interface Point { x: number; z: number }
export interface RoomPresence { target: Point | null; movedAt: number; lastInputAt: number; idle: boolean }
export interface Obstacle { x: number; z: number; w: number; d: number }
export const RETURN_AFTER_MS = 15_000;
export const LOUNGE_AFTER_MS = 300_000;

/** Visual movement never changes task ownership, timers, breaks or reports. */
export function destinationMode(input: {
  state: MemberState; capturing: boolean; agents: number; idleSeconds: number | null;
  lastInputAt: number; movedAt: number; target: Point | null; now: number;
}): 'away' | 'capture' | 'lounge' | 'roam' | 'desk' {
  if (input.state !== 'trabalhando') return 'away';
  const inactive = input.idleSeconds === null ? input.now - input.lastInputAt : input.idleSeconds * 1000;
  if (!input.capturing && !input.agents && inactive >= LOUNGE_AFTER_MS) return 'lounge';
  if (input.target && input.now - Math.max(input.lastInputAt, input.movedAt) < RETURN_AFTER_MS) return 'roam';
  return input.capturing ? 'capture' : 'desk';
}

export function validPoint(value: unknown, width = 80, depth = 100): value is Point {
  const p = value as Point | null;
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) <= width / 2 && Math.abs(p.z) <= depth / 2;
}

export function walkable(p: Point, blocks: Obstacle[], width: number, depth: number, margin = .24) {
  return Math.abs(p.x) <= width / 2 - .4 && Math.abs(p.z) <= depth / 2 - .4 &&
    !blocks.some(b => Math.abs(p.x - b.x) < b.w / 2 + margin && Math.abs(p.z - b.z) < b.d / 2 + margin);
}

/** A bounded grid search routes around furniture and through glass-room doorways. */
export function findPath(from: Point, to: Point, blocks: Obstacle[], width: number, depth: number): Point[] {
  const cell = .4, cols = Math.ceil(width / cell), rows = Math.ceil(depth / cell);
  const point = (id: number): Point => ({ x: (id % cols + .5) * cell - width / 2, z: (Math.floor(id / cols) + .5) * cell - depth / 2 });
  const idOf = (p: Point) => Math.max(0, Math.min(rows - 1, Math.floor((p.z + depth / 2) / cell))) * cols + Math.max(0, Math.min(cols - 1, Math.floor((p.x + width / 2) / cell)));
  const nearest = (p: Point) => {
    let best = -1, distance = Infinity;
    for (let id = 0; id < cols * rows; id++) {
      const q = point(id), d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < distance && walkable(q, blocks, width, depth)) { best = id; distance = d; }
    }
    return best;
  };
  const start = walkable(point(idOf(from)), blocks, width, depth) ? idOf(from) : nearest(from);
  const end = nearest(to);
  if (start < 0 || end < 0) return [];
  const parent = new Int32Array(cols * rows).fill(-1), queue = [start]; parent[start] = start;
  for (let i = 0; i < queue.length && parent[end] < 0; i++) {
    const id = queue[i], x = id % cols, z = Math.floor(id / cols);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, next = nz * cols + nx;
      if (nx < 0 || nx >= cols || nz < 0 || nz >= rows || parent[next] >= 0 || !walkable(point(next), blocks, width, depth)) continue;
      parent[next] = id; queue.push(next);
    }
  }
  if (parent[end] < 0) return [];
  const ids = [end]; while (ids[ids.length - 1] !== start) ids.push(parent[ids[ids.length - 1]]);
  const path = ids.reverse().slice(1).map(point);
  if (walkable(to, blocks, width, depth)) path.push(to);
  return path;
}
