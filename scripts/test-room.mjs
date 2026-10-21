import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const load = async file => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText).toString('base64'));
const { destinationMode: mode, findPath, walkable, validPoint } = await load('../src/game/movement.ts');
const { officeLayout } = await load('../src/game/office-layout.ts');
const base = { state: 'trabalhando', capturing: false, agents: 0, idleSeconds: null, lastInputAt: 1000, movedAt: 1000, target: { x: 1, z: 1 }, now: 15999 };
assert.equal(mode(base), 'roam');
assert.equal(mode({ ...base, now: 16000 }), 'desk');
assert.equal(mode({ ...base, now: 300999 }), 'desk');
assert.equal(mode({ ...base, now: 301000 }), 'lounge');
assert.equal(mode({ ...base, now: 301000, agents: 2 }), 'desk');
assert.equal(mode({ ...base, now: 301000, capturing: true }), 'capture');
assert.equal(mode({ ...base, capturing: true }), 'roam');
assert.equal(mode({ ...base, now: 999999, idleSeconds: 0, lastInputAt: 990000 }), 'roam');
assert.equal(mode({ ...base, now: 999999, idleSeconds: 299 }), 'desk');
assert.equal(mode({ ...base, now: 999999, idleSeconds: 300 }), 'lounge');
for (const state of ['cafe', 'almoco', 'reuniao', 'pausa_gestor', 'encerrado', 'fora']) assert.equal(mode({ ...base, now: 999999, state }), 'away');
assert.equal(validPoint({ x: NaN, z: 0 }), false); assert.equal(validPoint({ x: Infinity, z: 0 }), false);
for (const count of [1, 4, 8, 16, 32]) {
  const l = officeLayout(count);
  assert.equal(l.desks.length, count);
  for (const desk of l.desks) {
    for (const goal of [{ x: -8, z: l.back + 2.2 }, { x: -7, z: l.front - 2 }, { x: 8.8, z: l.back + 3 }, { x: 2, z: l.front - 1.5 }]) {
      const path = findPath(desk, goal, l.blocks, l.width, l.depth);
      assert.ok(path.length, `No route for desk ${desk.n}/${count}`);
      path.forEach(p => assert.ok(walkable(p, l.blocks, l.width, l.depth), 'Path crosses furniture'));
      for (let i = 1; i < path.length; i++) assert.ok(Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z) < .41);
    }
  }
}
console.log('Room movement: timers, capture, AI, pauses and collision routes passed for 1–32 desks.');
