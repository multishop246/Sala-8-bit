import { OfficeWorld, type ActorState } from '../src/game/world3d';
import { officeLayout, REFERENCE_SPOTS, brainstormSeat, referencePoint } from '../src/game/office-layout';
import { printerWindow } from '../src/game/office-visuals';

// Development-only fixture. No authentication, database, tasks or production presence.
const layout = officeLayout(8);
const world = new OfficeWorld(document.querySelector<HTMLElement>('#world')!, layout, 'visual-qa');
let state: ActorState = { id: 'test', avatar: { oc: '#9f61d4' }, target: layout.desks[0], facing: Math.PI,
  sitting: true, music: false, agents: 0, crown: false, mode: 'desk' };
let clock = Date.now();
function set(change: Partial<ActorState>) { state = { ...state, ...change }; world.sync([state], 'test'); }
function button(id: string, action: () => void) { document.querySelector<HTMLButtonElement>('#' + id)!.onclick = action; }
button('desk', () => set({ target: layout.desks[0], facing: Math.PI, sitting: true, mode: 'desk' }));
button('meeting', () => set({ target: REFERENCE_SPOTS.meeting[0], facing: Math.PI, sitting: true, mode: 'guest' }));
button('brain', () => { const p = brainstormSeat(0); set({ target: p, facing: p.facing, sitting: true, mode: 'brainstorm' }); });
button('capture', () => set({ target: referencePoint(386, 579), facing: .5, sitting: false, mode: 'capture' }));
button('robot', () => { clock = printerWindow(Date.now(), 'visual-qa').start + 5000; });
button('reset', () => { clock = printerWindow(Date.now(), 'visual-qa').end + 1000; });
button('walk', () => set({ target: referencePoint(949, 456), facing: 0, sitting: false, mode: 'roam' }));
function extraButton(text: string, action: () => void) {
  const b = document.createElement('button'); b.textContent = text; b.onclick = action; document.querySelector('nav')!.append(b);
}
extraButton('Concluir movimento', () => { for (let i = 0; i < 400; i++) world.render(.06, performance.now() / 1000 + i * .06, clock); });
extraButton('Outra função', () => { set({ mode: 'desk' }); set({ mode: 'capture' }); });
extraButton('Gestor', () => set({ target: REFERENCE_SPOTS.manager, facing: 0, sitting: true, mode: 'desk' }));
extraButton('Reunião oposta', () => set({ target: REFERENCE_SPOTS.meeting[3], facing: 0, sitting: true, mode: 'guest' }));
world.sync([state], 'test');
let last = performance.now();
function render(time: number) {
  const dt = Math.min((time - last) / 1000, .06); last = time; clock += dt * 1000;
  world.render(dt, time / 1000, clock);
  const actor = world.actors.get('test')!;
  document.querySelector('#state')!.textContent = JSON.stringify({ mode: state.mode, role: actor.role, path: actor.path.length,
    seat: actor.seatProgress, position: { x: actor.root.position.x, z: actor.root.position.z },
    legs: actor.legs.map(l => l.rotation.x), knees: actor.knees.map(l => l.rotation.x) }, null, 2);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
window.addEventListener('pagehide', () => world.dispose(), { once: true });
