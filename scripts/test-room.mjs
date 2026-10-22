import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const load = async file => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText).toString('base64'));
const { destinationMode: mode, findPath, walkable, validPoint } = await load('../src/game/movement.ts');
const { officeLayout, referencePixel, referencePoint, REFERENCE_SPOTS, brainstormSeat } = await load('../src/game/office-layout.ts');
const { printerWindow, ROBOT_DURATION, studioRole, STUDIO_ROLES } = await load('../src/game/office-visuals.ts');
const now = Date.parse('2026-10-21T15:00:00-03:00'), window = printerWindow(now, 'test-office');
assert.equal(window.end - window.start, ROBOT_DURATION);
assert.equal(ROBOT_DURATION, 900000);
assert.deepEqual(printerWindow(now - 3600000, 'test-office'), { ...window, active: printerWindow(now - 3600000, 'test-office').active });
for (const [offset, active] of [[-1, false], [0, true], [899999, true], [900000, false]]) assert.equal(printerWindow(window.start + offset, 'test-office').active, active);
assert.notEqual(printerWindow(now + 86400000, 'test-office').start % 86400000, window.start % 86400000);
assert.equal(new Set(Array.from({length: 4}, (_, i) => studioRole('person', i))).size, STUDIO_ROLES.length);
const registered = officeLayout(8);
const seats = [...registered.desks, ...REFERENCE_SPOTS.meeting.map((p, i) => ({ ...p, facing: i < 3 ? Math.PI : 0 })),
  ...Array.from({ length: 4 }, (_, i) => brainstormSeat(i)), { ...REFERENCE_SPOTS.manager, facing: 0 }];
for (const seat of seats) {
  assert.ok(walkable(seat, registered.blocks, 24, 19), 'Seat overlaps a table or partition');
  const approach = { x: seat.x - Math.sin(seat.facing) * .32, z: seat.z - Math.cos(seat.facing) * .32 };
  assert.ok(walkable(approach, registered.blocks, 24, 19), 'No clearance for pulling chair');
  for (const from of registered.desks) {
    const path = findPath(from, approach, registered.blocks, 24, 19);
    assert.deepEqual(path.at(-1), approach, 'Seat docking aisle is unreachable');
    let previous = from;
    for (const next of path) {
      for (let t = 0; t <= 1; t += .1) assert.ok(walkable({ x: previous.x + (next.x - previous.x) * t, z: previous.z + (next.z - previous.z) * t }, registered.blocks, 24, 19), 'Route cuts across furniture');
      previous = next;
    }
  }
}
for (const [u, v] of [[698, 213], [1486, 650], [940, 943], [84, 493], [670, 497], [1314, 560]]) {
  const p = referencePixel(referencePoint(u, v)); assert.ok(Math.hypot(p.x - u, p.y - v) < 1e-7, 'Reference floor registration drift');
}
const base = { state: 'trabalhando', capturing: false, agents: 0, idleSeconds: null, lastInputAt: 1000, movedAt: 1000, target: { x: 1, z: 1 }, now: 15999 };
assert.equal(mode(base), 'roam');
assert.equal(mode({ ...base, now: 16000 }), 'desk');
assert.equal(mode({ ...base, now: 300999 }), 'desk');
assert.equal(mode({ ...base, now: 301000 }), 'lounge');
assert.equal(mode({ ...base, now: 301000, agents: 2 }), 'desk');
assert.equal(mode({ ...base, now: 301000, capturing: true }), 'capture');
assert.equal(mode({ ...base, now: 999999, idleSeconds: 1800, activity: 'recording' }), 'capture');
assert.equal(mode({ ...base, now: 999999, idleSeconds: 1800, activity: 'brainstorm' }), 'brainstorm');
assert.equal(mode({ ...base, now: 16000, activity: 'desk', target: null }), 'desk');
assert.equal(mode({ ...base, capturing: true }), 'roam');
assert.equal(mode({ ...base, now: 999999, idleSeconds: 0, lastInputAt: 990000 }), 'roam');
assert.equal(mode({ ...base, now: 999999, idleSeconds: 299 }), 'desk');
assert.equal(mode({ ...base, now: 999999, idleSeconds: 300 }), 'lounge');
for (const state of ['cafe', 'almoco', 'reuniao', 'pausa_gestor', 'encerrado', 'fora']) assert.equal(mode({ ...base, now: 999999, state }), 'away');
assert.equal(validPoint({ x: NaN, z: 0 }), false); assert.equal(validPoint({ x: Infinity, z: 0 }), false);
for (const count of [1, 4, 8, 16, 32]) {
  const l = officeLayout(count);
  assert.equal(l.desks.length, count);
  if (l.reference) for (const desk of l.desks) {
    for (const destination of [REFERENCE_SPOTS.loungeWalk, REFERENCE_SPOTS.capture, REFERENCE_SPOTS.cafe, ...REFERENCE_SPOTS.meeting]) {
      const path = findPath(desk, destination, l.blocks, l.width, l.depth); assert.ok(path.length, 'No route to registered scenery');
      path.forEach(p => assert.ok(walkable(p, l.blocks, l.width, l.depth), 'Registered route crosses furniture'));
    }
  }
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
