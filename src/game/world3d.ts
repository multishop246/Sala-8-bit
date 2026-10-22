import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Avatar } from '../lib/types';
import { DEFAULT_AVATAR } from './sprites';
import { THEME, themeVariant } from './themes';
import { findPath, walkable, type Point } from './movement';
import { REFERENCE_H, REFERENCE_SIZE, REFERENCE_TABLES, referencePoint, officeLayout, REFERENCE_SPOTS, brainstormSeat, type OfficeLayout } from './office-layout';
import { printerWindow, studioRole, type StudioRole } from './office-visuals';

export interface ActorState {
  id: string; avatar: Partial<Avatar>; target: Point; facing: number; sitting: boolean;
  music: boolean; agents: number; crown: boolean; mode: string;
}
interface Rig {
  root: T.Group; body: T.Group; legs: T.Group[]; knees: T.Group[]; arms: T.Group[]; headphones: T.Group;
  robot: T.Group; note: T.Sprite; ring: T.Mesh; camera: T.Group; fingerprint: string;
  path: Point[]; goal: string; state: ActorState; seatProgress: number;
  studioVisit: number; role: StudioRole; phone: T.Group; boom: T.Group; slate: T.Group;
}
interface Chair { mesh: T.Group; home: Point; facing: number; pull: number }
export interface WorldLabel { key: string; title: string; point: T.Vector3; action?: string; number?: number }
const COLORS = { wall: '#393743', trim: '#282638', wood: '#c28f58', teal: '#3caab3', purple: '#7460c4', gold: '#efc361' };

export class OfficeWorld {
  readonly scene = new T.Scene();
  readonly camera = new T.OrthographicCamera(-18, 18, 13, -13, .1, 180);
  readonly renderer: T.WebGLRenderer;
  readonly actors = new Map<string, Rig>();
  readonly labels: WorldLabel[] = [];
  readonly objects: T.Object3D[] = [];
  readonly pickActions = new Map<T.Object3D, string>();
  private materials = new Map<string, T.MeshStandardMaterial>();
  private notes = new T.Group();
  private noteKey = '';
  private gloryKey = '';
  private portraits: T.Mesh[] = [];
  private geometries = new Map<string, T.BufferGeometry>();
  private floor!: T.Mesh;
  private targetMarker: T.Mesh;
  private resources = new Set<T.Texture>();
  private w = 1;
  private h = 1;
  private chairs: Chair[] = [];
  private printer?: { root: T.Group; body: T.Group; arms: T.Group[]; legs: T.Group[]; path: Point[]; waypoint: number; active: boolean };
  private printerMinute = -1;
  private printerTime?: ReturnType<typeof printerWindow>;
  private disposed = false;
  private composer: EffectComposer;
  private ambientOcclusion: GTAOPass;
  constructor(readonly host: HTMLElement, readonly layout: OfficeLayout, readonly visualSeed = 'sala-8-bit') {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', 'Escritório 3D interativo. Clique no chão para mover seu personagem.');
    this.renderer.domElement.tabIndex = 0; host.append(this.renderer.domElement);
    this.scene.add(new T.HemisphereLight('#e6eaff', '#806a62', 1.5));
    const sun = new T.DirectionalLight('#ffe2ac', 4.2); sun.position.set(-3, 15, -9);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 28, bottom: -28, near: 1, far: 70 });
    sun.shadow.normalBias = .035; sun.shadow.bias = -.00015; this.scene.add(sun);
    const fill = new T.DirectionalLight('#c9d9ff', 1.5); fill.position.set(10, 12, 14); this.scene.add(fill);
    if (!layout.reference) {
    const { width, depth, back, front } = layout;
    this.box(this.scene, width + .7, .6, depth + .7, 0, -.35, 0, '#d3c9cf', .14);
    this.floor = this.box(this.scene, width, .12, depth, 0, -.04, 0, '#e4ded2', .03);
    // Flat grout avoids noisy contact shadows between hundreds of tiny raised tiles.
    const tileMap = this.canvasTexture(512, 512, c => {
      c.fillStyle = '#c3b8a8'; c.fillRect(0, 0, 512, 512);
      for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) {
        c.fillStyle = ['#f0e6d6', '#e7ddce', '#e9dfd0', '#ede2d3'][(x * 3 + z) % 4];
        c.fillRect(x * 128 + .7, z * 128 + .7, 126.6, 126.6);
      }
    }); tileMap.wrapS = tileMap.wrapT = T.RepeatWrapping; tileMap.repeat.set(width / 6, depth / 6); tileMap.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.floor.material = new T.MeshStandardMaterial({ map: tileMap, roughness: .32, metalness: .035 });
    this.box(this.scene, .24, 3.65, depth, -width / 2, 1.8, 0, COLORS.wall);
    this.box(this.scene, width, 3.65, .24, 0, 1.8, back, COLORS.wall);
    this.box(this.scene, .32, .12, depth, -width / 2, 3.65, 0, COLORS.trim);
    this.box(this.scene, width, .12, .32, 0, 3.65, back, COLORS.trim);
    this.box(this.scene, width, .12, .06, 0, .15, back + .15, '#6c6567');
    this.box(this.scene, .06, .12, depth, -width / 2 + .15, .15, 0, '#6c6567');
    this.windows(-6.1, back, 6.2);
    this.windows(9.25, back, 4.5);
    this.coffee(); this.lounge(); this.mural(); this.taskBoard(); this.studio(); this.meeting(); this.brainstorm(); this.manager();
    const built = new Set<string>();
    for (const desk of layout.desks) {
      const key = JSON.stringify(desk.table);
      if (!built.has(key)) { this.workTable(desk.table.x, desk.table.z); built.add(key); }
      this.chair(desk.x, desk.z, desk.facing);
    }
    // Low front balustrade leaves the entire floor legible.
    this.glass(this.scene, width, .9, .035, 0, .48, front, false);
    this.glass(this.scene, .035, .9, depth - 1, width / 2, .48, .25, false);
    for (let x = -11.8; x < 12; x += 3) this.box(this.scene, .07, 1, .07, x, .5, front, '#77798d');
    this.plant(-10.8, front - 1.1); this.plant(11.1, front - 1.2);
    this.plant(5.4, back + 1.1); this.plant(11.1, back + 6.4);
    this.label('tasks', 'Quadro de tarefas', 1.2, 3.5, back + .2, 'board', 1);
    this.label('coffee', 'Copa', -10.8, 3.05, back + 7.1, 'copa', 2);
    this.label('meeting', 'Sala de reunião', 1.7, 2.7, front - 3.6, 'meeting', 3);
    this.label('glory', 'Mural da Glória', -11.6, 3.4, back + 3.15, 'mural', 4);
    this.label('team', 'Mesas da equipe', -.8, 2.5, back + 7.8, 'own-desk', 5);
    this.label('manager', 'Sala do gestor', 8.8, 3, back + 4.5, 'boss', 6);
    this.label('brainstorm', 'Brainstorm', 8.2, 2.5, front - 5.6, 'brainstorm', 7);
    this.label('lounge', 'Lounge', -6.2, 2.4, back + 2.2, 'lounge', 8);
    this.label('studio', 'Estúdio de captação', -8, 2.8, front - 4.1, 'studio', 9);
    }
    this.targetMarker = new T.Mesh(new T.RingGeometry(.25, .31, 32), new T.MeshBasicMaterial({ color: '#9e83ee', transparent: true, opacity: .85, side: T.DoubleSide }));
    this.targetMarker.rotation.x = -Math.PI / 2; this.targetMarker.position.y = .065; this.targetMarker.visible = false; this.scene.add(this.targetMarker);
    this.camera.position.set(29, 31, 34); this.camera.lookAt(0, .4, 0);
    if (layout.reference) this.prepareReference();
    const target = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setPixelRatio(1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ambientOcclusion = new GTAOPass(this.scene, this.camera);
    this.ambientOcclusion.updateGtaoMaterial({ radius: .4, thickness: .25, samples: 16, distanceFallOff: .8 });
    this.ambientOcclusion.blendIntensity = .65;
    this.composer.addPass(this.ambientOcclusion);
    this.composer.addPass(new OutputPass());
    this.resize();
  }
  private prepareReference() {
    // The approved render supplies the fixed scenery; only live elements are drawn above it.
    for (const child of this.scene.children) if (!(child instanceof T.Light)) child.visible = false;
    this.objects.length = 0; this.pickActions.clear(); this.labels.length = 0;
    const floor = new T.Mesh(new T.PlaneGeometry(24, 19), new T.ShadowMaterial({ opacity: .2, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor); this.floor = floor;
    this.layout.blocks.forEach(b => {
      const h = b.h ?? 1;
      if (!h) return;
      const mesh = this.box(this.scene, b.w, h, b.d, b.x, h / 2, b.z, '#ffffff', 0);
      mesh.material = new T.MeshStandardMaterial({ colorWrite: false, side: T.DoubleSide }); mesh.castShadow = false; mesh.renderOrder = -2;
    });
    const labels: [string, string, number, number, string | undefined, number][] = [
      ['tasks', 'Quadro de tarefas', 1057, 216, 'board', 1], ['coffee', 'Copa', 269, 290, 'copa', 2],
      ['meeting', 'Sala de reunião', 820, 661, 'meeting', 3], ['glory', 'Mural da Glória', 433, 155, 'mural', 4],
      ['team', 'Mesas da equipe', 779, 355, 'own-desk', 5], ['manager', 'Sala do gestor', 1290, 470, 'boss', 6],
      ['brainstorm', 'Brainstorm', 1019, 625, 'brainstorm', 7], ['lounge', 'Lounge', 735, 177, 'lounge', 8],
      ['studio', 'Estúdio de captação', 465, 446, 'studio', 9],
    ];
    for (const [key, title, u, v, action, number] of labels) { const p = referencePoint(u, v); this.label(key, title, p.x, 0, p.z, action, number); }
    const frames = [
      [[358, 265], [402, 244], [402, 308], [358, 329]],
      [[415, 234], [458, 213], [458, 278], [415, 298]],
      [[473, 204], [516, 183], [516, 248], [473, 269]],
      [[532, 174], [571, 155], [571, 219], [532, 239]],
    ];
    frames.forEach(corners => {
      const portrait = new T.Mesh(this.referenceQuad(corners), new T.MeshBasicMaterial({ side: T.DoubleSide, depthTest: false, depthWrite: false }));
      portrait.renderOrder = -10; this.portraits.push(portrait); this.scene.add(portrait);
    });
    // Chairs and printer are absent from the background: all moving parts are real objects.
    for (const d of officeLayout(8).desks) this.chair(d.x, d.z, d.facing);
    REFERENCE_SPOTS.meeting.forEach((p, i) => this.chair(p.x, p.z, i < 3 ? Math.PI : 0));
    for (let i = 0; i < 4; i++) { const p = brainstormSeat(i); this.chair(p.x, p.z, p.facing); }
    this.chair(REFERENCE_SPOTS.manager.x, REFERENCE_SPOTS.manager.z, 0, this.scene, '#65558d');
    this.brandLED(); this.makePrinter();
    const meetingScreen = this.canvasTexture(400, 330, c => {
      c.fillStyle = '#272a3b'; c.fillRect(0, 0, 400, 330);
      c.fillStyle = '#6250a9'; c.fillRect(16, 16, 368, 298);
      ['#bca1f5', '#74d9e3', '#f7d16c', '#c7b5f6'].forEach((color, i) => { c.fillStyle = color; c.fillRect(66 + i * 70, 235 - i * 40, 40, 55 + i * 40); });
    });
    const screen = new T.Mesh(this.referenceQuad([[680, 681], [745, 648], [745, 709], [680, 742]]), new T.MeshBasicMaterial({ map: meetingScreen, side: T.DoubleSide, depthTest: false, depthWrite: false }));
    screen.renderOrder = -5; this.scene.add(screen);
  }
  private brandLED() {
    const img = new Image(); img.src = '/scenery/aromasil-original.png';
    img.onload = () => {
      if (this.disposed) return;
      // Exact uploaded pixels, with white paper removed at display time. No redraw or font substitution.
      const source = document.createElement('canvas'); source.width = img.width; source.height = img.height;
      const c = source.getContext('2d')!; c.drawImage(img, 0, 0);
      const data = c.getImageData(0, 0, img.width, img.height);
      let left = img.width, top = img.height, right = 0, bottom = 0;
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4, a = 255 - Math.min(data.data[i], data.data[i + 1], data.data[i + 2]);
        data.data[i + 3] = a;
        if (a > 8) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
        if (a) for (let k = 0; k < 3; k++) data.data[i + k] = Math.max(0, (data.data[i + k] - (255 - a)) * 255 / a);
      }
      c.putImageData(data, 0, 0);
      const canvas = document.createElement('canvas'), pad = 32;
      canvas.width = right - left + 1 + pad * 2; canvas.height = bottom - top + 1 + pad * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16;
      ctx.drawImage(source, left, top, right - left + 1, bottom - top + 1, pad, pad, right - left + 1, bottom - top + 1);
      ctx.shadowBlur = 6; ctx.drawImage(source, left, top, right - left + 1, bottom - top + 1, pad, pad, right - left + 1, bottom - top + 1);
      ctx.shadowBlur = 0; ctx.drawImage(source, left, top, right - left + 1, bottom - top + 1, pad, pad, right - left + 1, bottom - top + 1);
      const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; this.resources.add(texture);
      const sign = new T.Mesh(this.referenceQuad([[1173, 347], [1261, 396], [1261, 428], [1173, 379]]), new T.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
      sign.renderOrder = 5; this.scene.add(sign);
    };
  }
  private referenceQuad(corners: number[][]) {
    const positions = corners.flatMap(([u, v]) => { const p = referencePoint(u, v); return [p.x, 0, p.z]; });
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)); g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals(); return g;
  }
  private referenceFrame() {
    const scale = Math.min(this.w / REFERENCE_SIZE.width, this.h / REFERENCE_SIZE.height);
    return { scale, x: (this.w - REFERENCE_SIZE.width * scale) / 2, y: (this.h - REFERENCE_SIZE.height * scale) / 2 };
  }
  private referenceCamera() {
    const { scale: s, x: ox, y: oy } = this.referenceFrame(), h = REFERENCE_H;
    const ax = 2 * s / this.w, bx = 2 * ox / this.w - 1, ay = -2 * s / this.h, by = 1 - 2 * oy / this.h;
    const projection = new T.Matrix4().set(
      ax * h[0] + bx * h[6], 0, ax * h[1] + bx * h[7], ax * h[2] + bx,
      ay * h[3] + by * h[6], -ay * 53, ay * h[4] + by * h[7], ay * h[5] + by,
      -.02, -.025, -.02, 0,
      h[6], 0, h[7], 1,
    );
    this.camera.updateMatrixWorld();
    this.camera.projectionMatrix.copy(projection.multiply(this.camera.matrixWorld));
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }
  private material(color: string, metalness = .06) {
    const key = color + metalness;
    if (!this.materials.has(key)) {
      const m = new T.MeshStandardMaterial({ color, roughness: .55, metalness });
      if ([COLORS.wood, '#b78c63', '#bc946b', '#8d6549'].includes(color)) {
        m.map = this.canvasTexture(512, 128, c => {
          c.fillStyle = '#ffffff'; c.fillRect(0, 0, 512, 128);
          for (let i = 0; i < 150; i++) {
            const y = (i * 37.73) % 128;
            c.strokeStyle = `rgba(101,65,33,${.025 + (i % 5) * .014})`; c.lineWidth = .5 + i % 3;
            c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(140, y + 5, 280, y - 4, 512, y + 1); c.stroke();
          }
        }); m.roughness = .4;
      }
      this.materials.set(key, m);
    }
    return this.materials.get(key)!;
  }
  private box(parent: T.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: string, radius = .055) {
    const r = Math.min(radius, w / 3, h / 3, d / 3), key = `${w},${h},${d},${r}`;
    if (!this.geometries.has(key)) this.geometries.set(key, r ? new RoundedBoxGeometry(w, h, d, 2, r) : new T.BoxGeometry(w, h, d));
    const mesh = new T.Mesh(this.geometries.get(key), this.material(color)); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private cylinder(parent: T.Object3D, r: number, h: number, x: number, y: number, z: number, color: string, top = r) {
    const key = `c${r},${top},${h}`;
    if (!this.geometries.has(key)) this.geometries.set(key, new T.CylinderGeometry(top, r, h, 16));
    const mesh = new T.Mesh(this.geometries.get(key), this.material(color)); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private sphere(parent: T.Object3D, r: number, x: number, y: number, z: number, color: string) {
    const key = `s${r}`; if (!this.geometries.has(key)) this.geometries.set(key, new T.SphereGeometry(r, 10, 8));
    const mesh = new T.Mesh(this.geometries.get(key), this.material(color)); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  private glass(parent: T.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, frame = true) {
    const mesh = this.box(parent, w, h, d, x, y, z, '#b5dee6', 0);
    mesh.material = new T.MeshPhysicalMaterial({ color: '#a8d4dc', transparent: true, opacity: .13, roughness: .18, metalness: .05, depthWrite: false });
    mesh.castShadow = false;
    if (frame) {
      if (w > d) { this.box(parent, .055, h, .065, x - w / 2, y, z, COLORS.trim); this.box(parent, .055, h, .065, x + w / 2, y, z, COLORS.trim); this.box(parent, w, .055, .065, x, y + h / 2, z, COLORS.trim); }
      else { this.box(parent, .065, h, .055, x, y, z - d / 2, COLORS.trim); this.box(parent, .065, h, .055, x, y, z + d / 2, COLORS.trim); this.box(parent, .065, .055, d, x, y + h / 2, z, COLORS.trim); }
    }
    return mesh;
  }
  private canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    draw(canvas.getContext('2d')!); const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; this.resources.add(texture); return texture;
  }
  private panel(parent: T.Object3D, w: number, h: number, x: number, y: number, z: number, draw: (c: CanvasRenderingContext2D) => void, rotation = 0) {
    const texture = this.canvasTexture(768, 384, draw);
    const mesh = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide })); mesh.position.set(x, y, z); mesh.rotation.y = rotation; parent.add(mesh); return mesh;
  }
  private textPanel(text: string, w: number, h: number, x: number, y: number, z: number, rotation = 0, bg = '#252337', color = '#f7dc8b') {
    return this.panel(this.scene, w, h, x, y, z, c => { c.fillStyle = bg; c.fillRect(0, 0, 768, 384); c.fillStyle = color; c.font = 'bold 70px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 384, 192, 700); }, rotation);
  }
  private clickable(object: T.Object3D, action: string) { this.objects.push(object); this.pickActions.set(object, action); }
  private label(key: string, title: string, x: number, y: number, z: number, action?: string, number?: number) { this.labels.push({ key, title, point: new T.Vector3(x, y, z), action, number }); }
  private windows(x: number, z: number, w: number) {
    this.panel(this.scene, w, 2.75, x, 2, z + .15, c => {
      const sky = c.createLinearGradient(0, 0, 0, 384); sky.addColorStop(0, '#cbd6ee'); sky.addColorStop(.6, '#e9deee'); sky.addColorStop(1, '#bed0c7'); c.fillStyle = sky; c.fillRect(0, 0, 768, 384);
      c.filter = 'blur(5px)';
      for (let i = 0; i < 14; i++) { const h = 100 + (i * 63) % 190; c.fillStyle = ['#aabbd3', '#b7b1cc', '#c9c1d3'][i % 3]; c.fillRect(i * 62 - 20, 330 - h, 50, h); c.fillStyle = '#f4e4c4'; for (let j = 0; j < 6; j++) c.fillRect(i * 62 - 8, 350 - h + j * 25, 10, 12); }
      for (let i = 0; i < 17; i++) { c.fillStyle = i % 2 ? '#8ab679' : '#a4c68b'; c.beginPath(); c.arc(i * 52, 360 - (i % 3) * 15, 48, 0, Math.PI * 2); c.fill(); } c.filter = 'none';
    });
    this.glass(this.scene, w, 2.75, .02, x, 2, z + .23);
    for (let i = 0; i < 4; i++) this.box(this.scene, .055, 2.8, .16, x - w / 2 + i * w / 3, 2, z + .2, '#393743');
  }
  private plant(x: number, z: number, scale = 1, parent: T.Object3D = this.scene, y = 0) {
    this.cylinder(parent, .29 * scale, .55 * scale, x, y + .28 * scale, z, '#ece5dc', .24 * scale);
    this.cylinder(parent, .065 * scale, .9 * scale, x, y + .8 * scale, z, '#766047');
    this.cylinder(parent, .22 * scale, .025 * scale, x, y + .55 * scale, z, '#64503f');
    for (let i = 0; i < 22; i++) {
      const a = i * 2.4, level = i / 22, reach = .38 * (1 - level * .4) * scale;
      const leaf = this.sphere(parent, .2 * scale, x + Math.cos(a) * reach, y + (.7 + level * 1.05) * scale, z + Math.sin(a) * reach, ['#589447', '#83ab52', '#416e43', '#a1bc61'][i % 4]); leaf.scale.set(.6, 1.7, .3); leaf.rotation.set(Math.sin(a) * .65, -a, Math.cos(a) * .65);
    }
  }
  private chair(x: number, z: number, facing = 0, parent: T.Object3D = this.scene, color = '#393d51') {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = facing; parent.add(g);
    this.box(g, .7, .16, .72, 0, .54, 0, color, .09); this.box(g, .7, .7, .15, 0, 1, -.3, color, .1);
    this.cylinder(g, .06, .45, 0, .25, 0, '#7a7b88'); this.box(g, .75, .055, .07, 0, .09, 0, '#555763'); this.box(g, .07, .055, .75, 0, .09, 0, '#555763');
    for (const side of [-1, 1]) { this.box(g, .065, .3, .06, side * .4, .66, 0, '#57586a'); this.box(g, .11, .07, .43, side * .4, .83, .06, color); }
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * .4, arm = this.box(g, .055, .055, .4, Math.sin(a) * .2, .13, Math.cos(a) * .2, '#545764'); arm.rotation.y = a; const wheel = this.cylinder(g, .075, .07, Math.sin(a) * .4, .08, Math.cos(a) * .4, '#282a36'); wheel.rotation.z = Math.PI / 2; }
    this.chairs.push({ mesh: g, home: { x, z }, facing, pull: 0 });
    return g;
  }
  private makePrinter() {
    const root = new T.Group(), body = new T.Group(), arms: T.Group[] = [], legs: T.Group[] = [];
    this.scene.add(root); root.add(body);
    this.box(body, .65, .85, .62, 0, .5, 0, '#e5e3df', .07);
    this.box(body, .7, .11, .68, 0, .97, 0, '#f3efe6');
    this.box(body, .46, .16, .025, 0, .76, .32, '#344d5e');
    for (const x of [-.12, .12]) this.sphere(body, .045, x, .77, .345, '#75e6ed');
    this.box(body, .45, .035, .07, 0, .48, .32, '#53606b');
    this.box(body, .4, .02, .25, 0, 1.04, 0, '#ffffff');
    for (const sign of [-1, 1]) {
      const arm = new T.Group(); arm.position.set(sign * .36, .69, 0); body.add(arm); arms.push(arm);
      this.box(arm, .14, .35, .16, 0, -.14, 0, '#b7bdc6'); this.sphere(arm, .1, 0, -.35, 0, '#d6b77c');
      const leg = new T.Group(); leg.position.set(sign * .21, .29, 0); root.add(leg); legs.push(leg);
      this.box(leg, .17, .4, .19, 0, -.16, 0, '#646d7c'); this.box(leg, .24, .12, .35, 0, -.37, .07, '#454d62');
    }
    const home = referencePoint(640, 574); root.position.set(home.x, 0, home.z);
    this.printer = { root, body, arms, legs, path: [], waypoint: 0, active: false };
  }
  private animatePrinter(dt: number, elapsed: number, now = Date.now()) {
    const p = this.printer; if (!p) return;
    if (this.printerMinute !== Math.floor(now / 60_000)) { this.printerMinute = Math.floor(now / 60_000); this.printerTime = printerWindow(now, this.visualSeed); }
    const time = this.printerTime!, active = now >= time.start && now < time.end, home = referencePoint(640, 574);
    const blocks = this.layout.blocks.filter(b => Math.hypot(b.x - home.x, b.z - home.z) > .1);
    if (active !== p.active) { p.active = active; p.path = []; }
    if (active && !p.path.length) {
      const points = [[614, 565], [872, 465], [1018, 540], [610, 370], [469, 430], [640, 574]];
      const target = time.end - now < 30_000 ? home : referencePoint(...points[p.waypoint++ % points.length] as [number, number]);
      p.path = findPath(p.root.position, target, blocks, this.layout.width, this.layout.depth);
    }
    let walking = false;
    if (active && p.path.length) {
      const target = p.path[0], dx = target.x - p.root.position.x, dz = target.z - p.root.position.z, d = Math.hypot(dx, dz), step = Math.min(dt * 1.1, d);
      if (d > .01) { p.root.position.x += dx / d * step; p.root.position.z += dz / d * step; p.root.rotation.y = Math.atan2(dx, dz); walking = true; }
      if (d < .04) p.path.shift();
    }
    if (!active) { p.root.position.set(home.x, 0, home.z); p.root.rotation.y = 0; }
    const morph = active ? Math.max(0, Math.min(1, (now - time.start) / 2500, (time.end - now) / 2500)) : 0;
    p.body.position.y = morph * .47 + (walking ? Math.sin(elapsed * 8) * .025 : 0);
    p.arms.forEach((arm, i) => { arm.visible = morph > .01; arm.scale.y = .05 + .95 * morph; arm.rotation.z = (i ? -1 : 1) * morph * .35; arm.rotation.x = walking ? Math.sin(elapsed * 7 + i * Math.PI) * .45 : 0; });
    p.legs.forEach((leg, i) => { leg.visible = morph > .01; leg.scale.y = morph; leg.position.y = .45 * morph; leg.rotation.x = walking ? Math.sin(elapsed * 7 + i * Math.PI) * .6 : 0; });
  }
  private table(x: number, z: number, w: number, d: number, y = .98) {
    const top = this.box(this.scene, w, .16, d, x, y, z, COLORS.wood, .09);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) this.box(this.scene, .09, y - .08, .09, x + dx * (w / 2 - .18), y / 2 - .05, z + dz * (d / 2 - .15), '#353548');
    return top;
  }
  private cup(x: number, y: number, z: number, color = '#f5eddf') {
    this.cylinder(this.scene, .085, .17, x, y, z, color); this.cylinder(this.scene, .066, .008, x, y + .088, z, '#71503b');
    const handle = new T.Mesh(new T.TorusGeometry(.065, .018, 6, 12), this.material(color)); handle.position.set(x + .09, y, z); this.scene.add(handle);
  }
  private wallLamp(x: number, z: number, rotation = 0) {
    const g = new T.Group(); g.position.set(x, 3.36, z); g.rotation.y = rotation; this.scene.add(g);
    this.box(g, .07, .08, .45, 0, 0, .14, '#353441'); const shade = this.cylinder(g, .085, .18, 0, -.08, .34, '#2f303b'); shade.rotation.x = .6;
    const light = new T.SpotLight('#ffdc91', 13, 5, .72, .7, 1.3); light.position.set(0, -.12, .4); light.target.position.set(0, -1.4, .04); g.add(light, light.target);
    const bulb = this.sphere(g, .063, 0, -.17, .39, '#fff2cb'); (bulb.material as T.MeshStandardMaterial).emissive.set('#ffd998');
  }
  private woodFloor(x: number, z: number, w: number, d: number) {
    this.box(this.scene, w, .035, d, x, .085, z, '#b78c63', .015);
    for (let i = 1; i < Math.ceil(d / .27); i++) this.box(this.scene, w - .03, .006, .008, x, .106, z - d / 2 + i * .27, '#9c7858', 0);
  }
  private monitor(x: number, z: number, rotation = 0, y = 1.28) {
    const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = rotation; this.scene.add(g);
    this.box(g, .86, .57, .075, 0, .18, 0, '#282d40');
    this.panel(g, .76, .46, 0, .18, .043, c => { c.fillStyle = '#1d274a'; c.fillRect(0, 0, 768, 384); c.fillStyle = '#9372dc'; c.fillRect(30, 30, 140, 324); c.fillStyle = '#b2ddf2'; c.fillRect(200, 40, 530, 130); c.fillStyle = '#5e96b2'; for (let i = 0; i < 4; i++) c.fillRect(210, 210 + i * 33, 330 - i * 40, 15); });
    this.box(g, .06, .25, .06, 0, -.2, 0, '#55576b'); this.box(g, .35, .035, .23, 0, -.3, .02, '#55576b');
  }
  private workTable(x: number, z: number) {
    const top = this.table(x, z, 4.4, 1.6), tables = [...new Set(this.layout.desks.map(d => JSON.stringify(d.table)))];
    this.clickable(top, 'desk-table:' + tables.indexOf(JSON.stringify({ x, z })));
    for (const dx of [-1.82, 1.82]) {
      this.box(this.scene, .45, .84, 1.17, x + dx, .51, z, '#494750', .035);
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        this.box(this.scene, .39, .23, .025, x + dx, .29 + i * .25, z + side * .6, '#59565c', .02);
        this.box(this.scene, .15, .025, .025, x + dx, .34 + i * .25, z + side * .62, '#a29a92');
      }
    }
    for (const side of [-1, 1]) for (const dx of [-1.05, 1.05]) { this.monitor(x + dx, z + side * .08, side < 0 ? Math.PI : 0); this.box(this.scene, .65, .035, .22, x + dx, 1.08, z + side * .58, '#d6d9e1'); this.cup(x + dx + .46, 1.15, z + side * .58); }
    this.box(this.scene, .35, .68, .75, x - 1.3, .4, z, '#343644'); this.plant(x, z - .1, .3, this.scene, 1.07);
    for (const side of [-1, 1]) for (const dx of [-1.05, 1.05]) {
      this.box(this.scene, .22, .018, .28, x + dx + .49, 1.075, z + side * .45, '#4c4b62');
      this.box(this.scene, .08, .04, .12, x + dx + .49, 1.105, z + side * .45, '#9492a4');
      for (let row = 0; row < 3; row++) for (let key = 0; key < 10; key++) this.box(this.scene, .041, .006, .034, x + dx - .27 + key * .059, 1.101, z + side * .48 - .065 + row * .06, '#888c9b', .003);
      this.box(this.scene, .21, .018, .28, x + dx - .56, 1.081, z + side * .43, '#9c7ab2');
      this.box(this.scene, .17, .008, .23, x + dx - .56, 1.094, z + side * .43, '#f0e6d8');
    }
  }
  private coffee() {
    const z = this.layout.back + 7.4;
    this.woodFloor(-10.65, z, 2.3, 6.6);
    this.box(this.scene, 1.2, 1.05, 5.2, -11.1, .6, z, '#343545'); this.box(this.scene, 1.45, .12, 5.4, -10.98, 1.16, z, '#eee8de');
    this.box(this.scene, 1.1, 2.3, 1.15, -11, 1.2, z + 2.5, '#d2d9e1', .09);
    this.box(this.scene, .035, .7, .055, -10.42, 1.38, z + 2.1, '#777e8b');
    this.box(this.scene, .7, .55, .65, -10.9, 1.48, z, '#292c38'); this.box(this.scene, .04, .3, .44, -10.52, 1.45, z, '#80898f');
    this.box(this.scene, .7, .45, .75, -10.9, 1.42, z - 1.5, '#e0d9d1'); this.box(this.scene, .035, .26, .51, -10.52, 1.45, z - 1.5, '#343545');
    for (let i = 0; i < 7; i++) this.cylinder(this.scene, .1, .17, -11, 1.33, z - 2.3 + i * .27, ['#ae7ddb', '#48a7a2', '#efc361'][i % 3]);
    this.clickable(this.textPanel('CAFÉ', 1.4, .55, -11.82, 2.65, z + .9, Math.PI / 2), 'copa');
    this.plant(-11.1, z - 2.9, .65);
    for (let i = 0; i < 6; i++) {
      const cz = z - 2.2 + i * .82;
      this.box(this.scene, .04, .83, .76, -10.47, .64, cz, '#4e4c56'); this.box(this.scene, .055, .035, .21, -10.43, .92, cz, '#b9b5b0');
      this.box(this.scene, .05, .6, .74, -11.82, 1.65, cz, '#e6ddd2');
    }
    this.box(this.scene, .33, .02, 2.8, -11.65, 1.94, z - 1, '#cda16e');
    for (let i = 0; i < 8; i++) this.cup(-11.55, 2.04, z - 2.2 + i * .32, ['#b08ddd', '#f3ce70', '#68bbb7', '#f4e4d1'][i % 4]);
    this.box(this.scene, .6, .92, .65, -10.7, .55, z + 3.22, '#d5e0e3');
    const water = this.cylinder(this.scene, .23, .49, -10.7, 1.25, z + 3.22, '#8cc8df', .19); (water.material as T.MeshStandardMaterial).roughness = .18;
    for (let i = 0; i < 3; i++) this.wallLamp(-11.76, z - 2 + i * 1.8, Math.PI / 2);
  }
  private lounge() {
    const z = this.layout.back;
    this.box(this.scene, 6.5, .035, 4.5, -6.1, .065, z + 2.5, '#6654a6', .12);
    this.box(this.scene, 5.2, .45, 1.25, -6.1, .42, z + 1.35, '#5a47a1', .17);
    this.box(this.scene, 5.2, .86, .27, -6.1, 1, z + .85, '#6e55b5', .12);
    for (const x of [-8.6, -3.6]) this.box(this.scene, .3, .72, 1.3, x, .72, z + 1.35, '#47a5af', .14);
    for (let i = 0; i < 4; i++) this.box(this.scene, 1.12, .18, .91, -7.9 + i * 1.2, .7, z + 1.5, '#7963c4', .12);
    for (let i = 0; i < 3; i++) this.box(this.scene, .58, .58, .15, -7.8 + i * 1.4, 1.02, z + 1.2, ['#edbc5c', '#42b1b2', '#b682d9'][i], .12);
    this.table(-6.1, z + 3.15, 2.5, .95, .52); this.cylinder(this.scene, .6, .5, -3.9, .32, z + 3.5, '#9b6bd0');
    this.plant(-9.3, z + 1.3, 1.1); this.plant(-2.8, z + 1, .9);
    this.plant(-6.1, z + 3.15, .28, this.scene, .61); this.cup(-5.35, .7, z + 3.15);
    this.box(this.scene, .47, .055, .35, -6.85, .65, z + 3.1, '#689eb3');
    this.box(this.scene, .42, .025, .32, -6.82, .69, z + 3.13, '#f3e5d0');
  }
  private mural() {
    const z = this.layout.back + 3.05;
    this.textPanel('MURAL DA GLÓRIA', 4.8, .65, -11.8, 3.1, z, Math.PI / 2, '#4e3b2c');
    for (let i = 0; i < 4; i++) {
      const pz = z - 1.75 + i * 1.15;
      this.box(this.scene, .15, 1.5, 1, -11.76, 1.95, pz, COLORS.gold);
      const portrait = this.panel(this.scene, .88, 1.36, -11.65, 1.95, pz, c => {
        c.fillStyle = ['#d8a4b4', '#96bedc', '#95c8b3', '#bc9dd8'][i]; c.fillRect(0, 0, 768, 384);
        c.fillStyle = '#625a6d'; c.beginPath(); c.arc(384, 135, 85, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(384, 295, 165, 120, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#f9e3ad'; c.fillRect(0, 335, 768, 49);
      }, Math.PI / 2); this.portraits.push(portrait); this.clickable(portrait, 'mural');
      this.box(this.scene, .05, 1.4, .91, -11.67, 1.95, pz, '#8e652c', .01);
      portrait.position.x = -11.62;
      this.wallLamp(-11.75, pz, Math.PI / 2);
    }
  }
  private taskBoard() {
    const z = this.layout.back + .2;
    const board = this.box(this.scene, 7, 2.15, .13, .8, 2.1, z, '#ece9e1', .05); this.clickable(board, 'board');
    for (let i = 0; i < 3; i++) this.box(this.scene, 2.1, .19, .025, -1.45 + i * 2.25, 2.95, z + .08, ['#b49be5', '#f1c777', '#7bbbab'][i]);
    this.scene.add(this.notes);
    for (const x of [-2.05, .8, 3.65]) this.wallLamp(x, z + .13);
    this.box(this.scene, 7.12, .09, .24, .8, .98, z + .03, '#b5aba0');
    for (let i = 0; i < 4; i++) this.box(this.scene, .27, .05, .065, 2 + i * .32, 1.06, z + .15, ['#c56884', '#70bca9', '#7f81c2', '#e7b452'][i]);
    this.textPanel('SABADÃO', .95, .52, 5.1, 2.25, z + .02); this.clickable(this.scene.children[this.scene.children.length - 1], 'sabado');
    this.clickable(this.textPanel('Instagram', 1.4, .6, 7, 3.05, z + .02, 0, '#37284d', '#d1b9ef'), 'instagram');
  }
  setNotes(notes: { col: number; color: string }[]) {
    if (this.layout.reference) return;
    const key = JSON.stringify(notes); if (this.noteKey === key) return; this.noteKey = key;
    this.notes.clear(); const count = [0, 0, 0];
    for (const note of notes.slice(0, 45)) {
      const n = count[note.col]++; if (n >= 15) continue;
      this.box(this.notes, .56, .23, .04, -2.15 + note.col * 2.25 + (n % 3) * .65, 2.62 - Math.floor(n / 3) * .3, this.layout.back + .3, note.color);
    }
  }
  setGlory(winners: { name: string; avatar: Partial<Avatar>; title: string }[]) {
    const key = JSON.stringify(winners); if (key === this.gloryKey) return; this.gloryKey = key;
    winners.forEach((winner, i) => {
      const panel = this.portraits[i]; if (!panel) return;
      const material = panel.material as T.MeshBasicMaterial, a = { ...DEFAULT_AVATAR, ...winner.avatar };
      if (material.map) { this.resources.delete(material.map); material.map.dispose(); }
      material.map = this.layout.reference ? this.referencePortrait(winner, i) : this.canvasTexture(384, 512, c => {
        c.fillStyle = ['#cfa6bb', '#9ebbd3', '#99bfa8', '#b9a1d1'][i]; c.fillRect(0, 0, 384, 512);
        c.fillStyle = '#504353'; c.font = 'bold 23px sans-serif'; c.textAlign = 'center'; c.fillText(winner.title, 192, 42, 350);
        c.fillStyle = a.oc; c.beginPath(); c.roundRect(75, 290, 234, 170, 40); c.fill();
        c.fillStyle = a.skin; c.beginPath(); c.roundRect(105, 110, 174, 188, 35); c.fill();
        c.fillStyle = a.hair; if (a.hs !== 'careca') { c.beginPath(); c.roundRect(100, 90, 185, 62, 22); c.fill(); }
        c.fillStyle = '#302b40'; c.beginPath(); c.arc(151, 196, 8, 0, Math.PI * 2); c.arc(233, 196, 8, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#a86e64'; c.lineWidth = 5; c.beginPath(); c.arc(192, 232, 17, .2, Math.PI - .2); c.stroke();
        c.fillStyle = '#f5e5b4'; c.fillRect(0, 438, 384, 74); c.fillStyle = '#514033'; c.font = 'bold 29px sans-serif'; c.fillText(winner.name, 192, 486, 350);
      }); material.needsUpdate = true;
    });
  }
  private referencePortrait(winner: { name: string; avatar: Partial<Avatar>; title: string }, i: number) {
    const a = { ...DEFAULT_AVATAR, ...winner.avatar }, scene = new T.Scene();
    scene.background = new T.Color(['#cfa6bb', '#9ebbd3', '#99bfa8', '#b9a1d1'][i]);
    scene.add(new T.HemisphereLight('#fff1d5', '#9384ab', 2));
    const light = new T.DirectionalLight('#ffdfad', 3); light.position.set(-3, 5, 5); scene.add(light);
    this.box(scene, 1.4, .75, .8, 0, .34, 0, a.oc, .16);
    this.box(scene, .95, 1.04, .85, 0, 1.13, .02, a.skin, .18);
    for (const side of [-1, 1]) { this.box(scene, .15, .29, .2, side * .49, 1.05, .03, a.skin, .06); this.sphere(scene, .045, side * .23, 1.17, .45, '#302a35'); }
    this.box(scene, .1, .065, .07, 0, 1.03, .45, a.skin, .03);
    this.box(scene, .2, .025, .045, 0, .86, .45, '#a36c61', .01);
    if (a.hs !== 'careca') {
      this.box(scene, 1.03, .3, .92, 0, 1.62, -.025, a.hair, .14);
      this.box(scene, .16, .5, .7, -.43, 1.32, -.06, a.hair, .06);
      if (['longo', 'rabo', 'cacheado'].includes(a.hs)) this.box(scene, 1.02, .8, .27, 0, 1.08, -.4, a.hair, .12);
    }
    if (a.beard !== 'nenhuma') this.box(scene, .7, .21, .12, 0, .76, .43, a.hair, .05);
    const camera = new T.OrthographicCamera(-1.15, 1.15, 1.533, -1.533, .1, 30); camera.position.set(3.3, 2.7, 6); camera.lookAt(0, 1, 0);
    const target = new T.WebGLRenderTarget(384, 512); target.texture.colorSpace = T.SRGBColorSpace;
    const previous = this.renderer.getRenderTarget(), clear = this.renderer.getClearColor(new T.Color()), alpha = this.renderer.getClearAlpha();
    const pixels = new Uint8Array(384 * 512 * 4);
    try { this.renderer.setRenderTarget(target); this.renderer.render(scene, camera); this.renderer.readRenderTargetPixels(target, 0, 0, 384, 512, pixels); }
    finally { this.renderer.setRenderTarget(previous); this.renderer.setClearColor(clear, alpha); target.dispose(); }
    return this.canvasTexture(384, 512, c => {
      const image = c.createImageData(384, 512);
      for (let row = 0; row < 512; row++) image.data.set(pixels.subarray((511 - row) * 1536, (512 - row) * 1536), row * 1536);
      c.putImageData(image, 0, 0);
      c.fillStyle = '#f5e3ac'; c.fillRect(0, 433, 384, 79); c.fillStyle = '#49362a'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.fillText(winner.name, 192, 482, 350);
      c.fillStyle = '#ffeec7'; c.fillRect(0, 0, 384, 40); c.fillStyle = '#5d4730'; c.font = 'bold 22px sans-serif'; c.fillText(winner.title, 192, 29, 350);
    });
  }
  private studio() {
    const f = this.layout.front;
    this.box(this.scene, 6.2, .04, 5.2, -8.1, .08, f - 3, '#292b39', .02);
    this.box(this.scene, 5, 2.4, .11, -8.1, 1.3, f - 4, '#3b9b5a'); this.box(this.scene, 5, .035, 2.4, -8.1, .12, f - 2.85, '#459e60', 0);
    this.textPanel('● REC', 1.1, .38, -8.1, 2.8, f - 3.97, 0, '#262b3a', '#ff8d97');
    const ring = new T.Mesh(new T.TorusGeometry(.4, .045, 8, 36), new T.MeshStandardMaterial({ color: '#fff1b4', emissive: '#fff1b4', emissiveIntensity: .5 })); ring.position.set(-5.7, 1.7, f - 1.8); this.scene.add(ring);
    this.cylinder(this.scene, .025, 1.4, -5.7, .7, f - 1.8, '#545764');
    this.box(this.scene, .52, .36, .4, -7.8, 1.25, f - 1.5, '#333a48'); this.cylinder(this.scene, .035, 1.15, -7.8, .6, f - 1.5, '#555b66');
    for (const dx of [-.4, .4]) { const leg = this.cylinder(this.scene, .025, 1.1, -7.8 + dx / 2, .5, f - 1.5, '#555b66'); leg.rotation.z = dx; }
    for (const x of [-10.67, -5.53]) {
      this.cylinder(this.scene, .035, 2.7, x, 1.39, f - 4, '#303542');
      this.box(this.scene, .65, .06, .45, x, .16, f - 4, '#313644');
    }
    const lens = this.cylinder(this.scene, .12, .28, -7.8, 1.27, f - 1.77, '#212c3a'); lens.rotation.x = Math.PI / 2;
    this.box(this.scene, .3, .19, .035, -7.8, 1.29, f - 1.28, '#6ca9b7');
    for (let i = 0; i < 3; i++) { const a = i * 2.094; const leg = this.cylinder(this.scene, .022, 1.05, -5.7 + Math.sin(a) * .2, .48, f - 1.8 + Math.cos(a) * .2, '#444854'); leg.rotation.set(Math.cos(a) * .38, 0, -Math.sin(a) * .38); }
    for (const [x, z] of [[-10.1, f - 1.25], [-6.2, f - .95]]) {
      this.box(this.scene, .9, .42, .55, x, .33, z, '#3e4454');
      this.box(this.scene, .85, .045, .51, x, .56, z, '#555e6b');
      for (const dx of [-.35, .35]) this.box(this.scene, .055, .38, .56, x + dx, .35, z, '#939b9e');
      this.box(this.scene, .27, .04, .08, x, .6, z, '#242c38');
    }
  }
  private meeting() {
    const f = this.layout.front;
    this.box(this.scene, 5.5, .035, 4.5, 1.8, .065, f - 2.5, '#398c9a', .02);
    this.glass(this.scene, .035, 2.7, 3.6, -.9, 1.4, f - 2.3);
    this.glass(this.scene, .035, 2.7, 3.6, 4.6, 1.4, f - 2.3);
    this.table(1.8, f - 2.8, 3.8, 1.25);
    for (const x of [.1, 1.7, 3.3]) for (const side of [-1, 1]) this.chair(x, f - 2.8 + side * 1.1, side === 1 ? Math.PI : 0);
    this.plant(-.4, f - .8, .85); this.plant(4.2, f - .8, .85);
    this.monitor(-.72, f - 3.9, Math.PI / 2, 1.8);
    for (const x of [.3, 1.8, 3.3]) {
      this.box(this.scene, .55, .035, .38, x, 1.08, f - 2.8, '#7b8699');
      const screen = this.box(this.scene, .55, .34, .025, x, 1.25, f - 2.92, '#384d67'); screen.rotation.x = -.18;
      this.cup(x + .37, 1.17, f - 2.6);
    }
    // Front glazing and a visible door keep the cutaway readable.
    this.glass(this.scene, 3.6, 2.7, .035, .9, 1.4, f - .51);
    this.glass(this.scene, 1.65, 2.7, .035, 3.65, 1.4, f - .51);
    this.box(this.scene, .045, .34, .045, 2.92, 1.28, f - .43, '#d1b577');
  }
  private brainstorm() {
    const z = this.layout.front - 5.5;
    this.cylinder(this.scene, 2.25, .035, 8.1, .075, z, '#e1b76b');
    this.cylinder(this.scene, 1.3, .14, 8.1, 1, z, '#f4eee1'); this.cylinder(this.scene, .18, .9, 8.1, .5, z, '#77727d');
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; this.chair(8.1 + Math.sin(a) * 1.9, z + Math.cos(a) * 1.9, a + Math.PI); this.box(this.scene, .3, .012, .25, 8.1 + Math.sin(a) * .6, 1.08, z + Math.cos(a) * .6, ['#da9bc8', '#92d0be', '#eac47d', '#9fbbdf'][i], 0); }
    this.box(this.scene, 1.3, 1.3, .07, 10.55, 1.4, z + .9, '#dedee2');
    for (const x of [10.05, 11.05]) { this.box(this.scene, .04, 1.8, .04, x, .9, z + .9, '#777b87'); this.box(this.scene, .12, .055, .65, x, .08, z + .9, '#777b87'); }
    for (let i = 0; i < 6; i++) this.box(this.scene, .25, .22, .02, 10.2 + (i % 3) * .34, 1.13 + Math.floor(i / 3) * .35, z + .945, ['#e9bf63', '#a28bd2', '#6cb8a0'][i % 3]);
  }
  private manager() {
    const b = this.layout.back;
    this.woodFloor(9, b + 3.8, 5.1, 6.8);
    this.box(this.scene, 4.3, .035, 4.5, 8.8, .1, b + 4.1, '#62549b');
    this.glass(this.scene, .035, 2.8, 5.8, 6.3, 1.45, b + 3.5);
    this.glass(this.scene, 3.5, 2.8, .035, 9.8, 1.45, b + 7.15);
    this.table(8.8, b + 4.2, 3.8, 1.3); this.monitor(8.8, b + 4.35, Math.PI); this.chair(8.8, b + 2.95, 0, this.scene, '#6b5a9a');
    this.box(this.scene, 3.5, 2.6, .35, 8.8, 1.5, b + .45, '#8d6549');
    for (let row = 0; row < 3; row++) for (let col = 0; col < 13; col++) this.box(this.scene, .17, .45 + (col % 3) * .07, .3, 7.3 + col * .24, .7 + row * .75, b + .68, ['#b67ba0', '#e4bf6b', '#679d9f', '#7279b4'][col % 4], .01);
    for (let row = 0; row < 4; row++) this.box(this.scene, 3.55, .07, .5, 8.8, .42 + row * .75, b + .53, '#ab8158');
    this.cup(7.5, 1.16, b + 4.2); this.box(this.scene, .55, .025, .35, 9.7, 1.08, b + 4.2, '#e5d9ba');
    this.cylinder(this.scene, .04, 2.2, 11.1, 1.2, b + 3.1, '#777271'); this.cylinder(this.scene, .38, .055, 11.1, .13, b + 3.1, '#8a827d');
    this.cylinder(this.scene, .42, .32, 11.1, 2.35, b + 3.1, '#f0cd7f', .18);
    const lamp = new T.PointLight('#ffcf82', 5, 4, 2); lamp.position.set(11.1, 2.13, b + 3.1); this.scene.add(lamp);
    for (const x of [7.7, 9.25]) { this.box(this.scene, .95, .45, .85, x, .4, b + 6.1, '#b77d87', .14); this.box(this.scene, .95, .7, .18, x, .8, b + 6.45, '#ca929a', .1); }
  }
  private makeActor(state: ActorState): Rig {
    const root = new T.Group(), body = new T.Group(); root.add(body); this.scene.add(root);
    const a = { ...DEFAULT_AVATAR, ...state.avatar }, theme = a.theme && THEME[a.theme] ? themeVariant(THEME[a.theme], a.vi || 0) : undefined;
    const skin = theme?.skin || a.skin, clothes = theme?.b || a.oc;
    this.box(body, .48, .51, .31, 0, .89, 0, clothes, .09);
    if (['blazer', 'terno', 'social', 'cardiga'].includes(a.out)) this.box(body, .12, .4, .02, 0, .9, .164, '#f6eddf', .01);
    this.box(body, .56, .57, .48, 0, 1.44, 0, skin, .12);
    this.sphere(body, .055, -.15, 1.46, .236, '#292635'); this.sphere(body, .055, .15, 1.46, .236, '#292635');
    this.box(body, .1, .035, .035, 0, 1.29, .247, '#9f6660', .012);
    if (a.hs !== 'careca') {
      this.box(body, .6, .21, .51, 0, 1.7, -.025, a.hair, .09);
      this.box(body, .08, .26, .4, -.26, 1.5, -.06, a.hair, .03); this.box(body, .08, .26, .4, .26, 1.5, -.06, a.hair, .03);
      if (['longo', 'rabo', 'cacheado'].includes(a.hs)) this.box(body, .59, .5, .17, 0, 1.37, -.24, a.hair, .08);
      if (a.hs === 'coque') this.sphere(body, .16, 0, 1.9, -.08, a.hair);
      if (a.hs === 'franja') this.box(body, .5, .16, .09, -.04, 1.61, .23, a.hair, .035);
    }
    if (a.beard !== 'nenhuma') this.box(body, .41, .15, .07, 0, 1.23, .235, a.hair, .04);
    const legs: T.Group[] = [], knees: T.Group[] = [], arms: T.Group[] = [];
    for (const sign of [-1, 1]) {
      const leg = new T.Group(); leg.position.set(sign * .135, .62, 0); body.add(leg); legs.push(leg);
      this.box(leg, .19, .25, .22, 0, -.12, 0, '#3b4054', .04);
      const knee = new T.Group(); knee.position.y = -.25; leg.add(knee); knees.push(knee);
      this.box(knee, .18, .48, .2, 0, -.24, 0, '#3b4054', .04); this.box(knee, .22, .14, .34, 0, -.48, .055, '#2d2f41', .05);
      const arm = new T.Group(); arm.position.set(sign * .32, 1.07, 0); body.add(arm); arms.push(arm);
      this.box(arm, .16, .28, .2, 0, -.13, 0, clothes, .04); this.box(arm, .15, .26, .17, 0, -.36, 0, skin, .05);
    }
    if (state.crown || a.theme?.startsWith('ttl_')) {
      this.box(body, .6, .11, .5, 0, 1.85, 0, COLORS.gold, .02);
      for (const x of [-.22, 0, .22]) this.box(body, .1, .18, .1, x, 1.98, .2, COLORS.gold, .01);
    } else if (theme?.hat) this.box(body, .65, .22, .57, 0, 1.88, 0, theme.hat === 'noel' ? '#c74b5e' : clothes, .08);
    const headphones = new T.Group(); body.add(headphones);
    this.box(headphones, .69, .06, .14, 0, 1.82, 0, '#42415c', .025);
    for (const x of [-.34, .34]) { this.box(headphones, .12, .36, .25, x, 1.57, 0, '#7c61b7', .06); this.box(headphones, .15, .2, .17, x, 1.5, 0, '#b498ec', .05); }
    const robot = new T.Group(); root.add(robot); this.box(robot, .4, .45, .34, 0, .48, 0, '#e3e3e9', .09); this.box(robot, .3, .15, .035, 0, .53, .18, '#354e67'); this.sphere(robot, .035, -.08, .54, .205, '#78e1ee'); this.sphere(robot, .035, .08, .54, .205, '#78e1ee');
    const noteTexture = this.canvasTexture(96, 96, c => { c.fillStyle = '#a783e7'; c.beginPath(); c.arc(48, 48, 44, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 65px sans-serif'; c.textAlign = 'center'; c.fillText('♪', 48, 72); });
    const note = new T.Sprite(new T.SpriteMaterial({ map: noteTexture, depthTest: false })); note.scale.set(.48, .48, 1); root.add(note);
    const ring = new T.Mesh(new T.RingGeometry(.42, .47, 32), new T.MeshBasicMaterial({ color: '#a68cf0', side: T.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .065; root.add(ring);
    const cam = new T.Group(); this.box(cam, .4, .28, .25, 0, 0, 0, '#303b4b'); this.cylinder(cam, .09, .2, 0, 0, .2, '#576477').rotation.x = Math.PI / 2; cam.position.set(.3, .9, .3); body.add(cam);
    const phone = new T.Group(); phone.position.set(.3, 1.35, .5); body.add(phone);
    this.box(phone, .19, .36, .045, 0, 0, 0, '#26324b', .025); this.box(phone, .15, .29, .01, 0, 0, -.025, '#78c2d6');
    const boom = new T.Group(); boom.position.set(0, 1.85, .1); body.add(boom);
    this.cylinder(boom, .025, 1.8, .5, 0, .2, '#414657').rotation.z = Math.PI / 2;
    this.box(boom, .35, .16, .18, 1.35, -.05, .2, '#555b66', .07);
    const slate = new T.Group(); slate.position.set(.05, 1, .4); body.add(slate);
    this.box(slate, .48, .35, .045, 0, 0, 0, '#344254'); this.box(slate, .5, .08, .06, 0, .2, 0, '#f0e9d8');
    for (let i = 0; i < 4; i++) this.box(slate, .055, .08, .065, -.18 + i * .12, .2, 0, '#33384b');
    root.position.set(state.target.x, 0, state.target.z);
    this.objects.push(root); this.pickActions.set(root, 'person:' + state.id);
    return { root, body, legs, knees, arms, headphones, robot, note, ring, camera: cam, phone, boom, slate,
      studioVisit: 0, role: studioRole(state.id, 0), seatProgress: state.sitting ? 1 : 0,
      fingerprint: JSON.stringify([state.avatar, state.crown]), path: [], goal: '', state };
  }
  sync(states: ActorState[], mine: string) {
    const ids = new Set(states.map(s => s.id));
    for (const [id, actor] of this.actors) if (!ids.has(id)) { this.removeActor(actor); this.actors.delete(id); }
    for (const state of states) {
      let actor = this.actors.get(state.id);
      const fp = JSON.stringify([state.avatar, state.crown]);
      if (actor && actor.fingerprint !== fp) { const position = actor.root.position.clone(); this.removeActor(actor); actor = this.makeActor(state); actor.root.position.copy(position); this.actors.set(state.id, actor); }
      if (!actor) { actor = this.makeActor(state); this.actors.set(state.id, actor); }
      if (state.mode === 'capture' && actor.state.mode !== 'capture') actor.role = studioRole(state.id, ++actor.studioVisit);
      actor.state = state; actor.ring.visible = state.id === mine;
      const key = `${state.target.x.toFixed(2)},${state.target.z.toFixed(2)}`;
      if (actor.goal !== key) {
        const chair = state.sitting && this.chairs.find(c => Math.hypot(c.home.x - state.target.x, c.home.z - state.target.z) < .12);
        const destination = chair ? { x: state.target.x - Math.sin(state.facing) * .32, z: state.target.z - Math.cos(state.facing) * .32 } : state.target;
        const alreadyThere = Math.hypot(actor.root.position.x - state.target.x, actor.root.position.z - state.target.z) < .06;
        actor.goal = key; actor.path = alreadyThere ? [] : findPath(actor.root.position, destination, this.layout.blocks, this.layout.width, this.layout.depth);
        actor.seatProgress = alreadyThere && state.sitting ? 1 : 0;
      }
    }
  }
  private removeActor(actor: Rig) {
    this.scene.remove(actor.root); this.pickActions.delete(actor.root); const i = this.objects.indexOf(actor.root); if (i >= 0) this.objects.splice(i, 1);
    actor.note.material.map?.dispose(); actor.note.material.dispose(); actor.ring.geometry.dispose(); (actor.ring.material as T.Material).dispose();
  }
  render(dt: number, elapsed: number, now = Date.now()) {
    for (const chair of this.chairs) chair.pull = 0;
    for (const actor of this.actors.values()) {
      const { root, state } = actor; let walking = false;
      if (actor.path.length) {
        const p = actor.path[0], dx = p.x - root.position.x, dz = p.z - root.position.z, distance = Math.hypot(dx, dz), step = Math.min(dt * 2.2, distance);
        if (distance > .025) { root.position.x += dx / distance * step; root.position.z += dz / distance * step; root.rotation.y = Math.atan2(dx, dz); walking = true; }
        if (distance < .08) actor.path.shift();
      } else root.rotation.y = state.facing;
      const chair = state.sitting && this.chairs.find(c => Math.hypot(c.home.x - state.target.x, c.home.z - state.target.z) < .12);
      const seated = !walking && !actor.path.length && state.sitting && Math.hypot(root.position.x - state.target.x, root.position.z - state.target.z) < (state.mode === 'lounge' ? 1.4 : .85);
      if (seated) actor.seatProgress = Math.min(1, actor.seatProgress + dt / 1.8); else actor.seatProgress = 0;
      const phase = actor.seatProgress, bend = seated ? T.MathUtils.smoothstep(phase, .25, .65) : 0;
      if (chair && seated) {
        chair.pull = phase < .25 ? phase / .25 * .32 : phase < .65 ? .32 : (1 - phase) / .35 * .32;
        // Explicit short docking motion, only through the clear aisle behind this chair.
        const offset = phase < .25 ? .32 : chair.pull;
        const dock = { x: state.target.x - Math.sin(state.facing) * offset, z: state.target.z - Math.cos(state.facing) * offset };
        if (walkable(dock, this.layout.blocks, this.layout.width, this.layout.depth, .12)) { root.position.x = dock.x; root.position.z = dock.z; }
      }
      if (seated && state.mode === 'lounge') { root.position.x += (state.target.x - root.position.x) * Math.min(1, dt * 3); root.position.z += (state.target.z - root.position.z) * Math.min(1, dt * 3); }
      actor.body.position.y = seated ? (state.mode === 'lounge' ? .15 : -.06) * bend : walking ? Math.sin(elapsed * 12) * .025 : 0;
      actor.legs.forEach((leg, i) => { leg.rotation.x = -Math.PI / 2 * bend + (walking ? Math.sin(elapsed * 11 + i * Math.PI) * .55 : 0); actor.knees[i].rotation.x = Math.PI / 2 * bend; actor.knees[i].scale.y = .5 + .5 * bend; });
      actor.arms.forEach((arm, i) => { arm.rotation.x = seated ? -.9 * (phase < .25 ? 1 : .65) : walking ? Math.sin(elapsed * 11 + i * Math.PI + Math.PI) * .45 : 0; arm.rotation.z = 0; });
      actor.headphones.visible = state.music; actor.note.visible = state.music; actor.note.position.set(-.5, 2.12 + Math.sin(elapsed * 3) * .07, 0);
      actor.robot.visible = state.agents > 0; actor.robot.position.set(.78, .12 + Math.sin(elapsed * 3.5) * .07, .12); actor.robot.rotation.y = -root.rotation.y + .5;
      const working = state.mode === 'capture' && !walking;
      actor.camera.visible = working && actor.role === 'camera'; actor.phone.visible = working && actor.role === 'stories';
      actor.boom.visible = working && actor.role === 'microphone'; actor.slate.visible = working && actor.role === 'director';
      if (working) {
        const pulse = Math.sin(elapsed * 2 + actor.studioVisit) * .06;
        if (actor.role === 'camera') { actor.camera.position.y = 1.15 + pulse * .1; actor.arms.forEach(a => { a.rotation.x = -1.25 + pulse; }); }
        if (actor.role === 'stories') { actor.arms[1].rotation.x = -1.8 + pulse; actor.phone.rotation.y = pulse; }
        if (actor.role === 'microphone') actor.arms.forEach((a, i) => { a.rotation.x = -2.4; a.rotation.z = (i ? -1 : 1) * .3; });
        if (actor.role === 'director') { actor.arms[0].rotation.x = -1; actor.arms[1].rotation.x = -1.5 + Math.sin(elapsed * 2) * .4; actor.slate.rotation.z = pulse; }
        actor.body.rotation.y = pulse * .3;
      } else actor.body.rotation.y = 0;
    }
    for (const chair of this.chairs) { chair.mesh.position.x = chair.home.x - Math.sin(chair.facing) * chair.pull; chair.mesh.position.z = chair.home.z - Math.cos(chair.facing) * chair.pull; }
    this.animatePrinter(dt, elapsed, now);
    if (this.ambientOcclusion.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
  project(point: T.Vector3) {
    const p = point.clone().project(this.camera); return { x: (p.x + 1) / 2 * this.w, y: (1 - p.y) / 2 * this.h };
  }
  resize() {
    this.w = Math.max(1, this.host.clientWidth); this.h = Math.max(1, this.host.clientHeight);
    if (this.layout.reference) {
      this.referenceCamera(); this.renderer.setSize(this.w, this.h, false); this.composer.setSize(this.w, this.h); this.ambientOcclusion.enabled = false; return;
    }
    const aspect = this.w / this.h;
    // Fit projected corners, including the walls, rather than clipping large teams.
    this.camera.left = -20; this.camera.right = 20; this.camera.top = 20; this.camera.bottom = -20; this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    const points: T.Vector3[] = [];
    for (const x of [-this.layout.width / 2 - .8, this.layout.width / 2 + .8]) for (const z of [this.layout.back - .8, this.layout.front + .8]) for (const y of [-.6, 3.8]) points.push(new T.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse));
    const box = new T.Box3().setFromPoints(points), center = box.getCenter(new T.Vector3());
    const span = Math.max((box.max.y - box.min.y) * 1.08, (box.max.x - box.min.x) / aspect * 1.08);
    this.camera.left = center.x - span * aspect / 2; this.camera.right = center.x + span * aspect / 2; this.camera.top = center.y + span / 2; this.camera.bottom = center.y - span / 2;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(this.w, this.h, false);
    this.composer.setSize(this.w, this.h);
    // Keep the mobile view light; desktop receives contact shading between objects.
    this.ambientOcclusion.enabled = this.w >= 700;
  }
  hit(clientX: number, clientY: number): { action?: string; point?: Point } {
    if (this.layout.reference) {
      const rect = this.renderer.domElement.getBoundingClientRect(), frame = this.referenceFrame();
      const u = (clientX - rect.left - frame.x) / frame.scale, v = (clientY - rect.top - frame.y) / frame.scale;
      for (const [id, actor] of this.actors) {
        const p = this.project(actor.root.position.clone().add(new T.Vector3(0, 1.1, 0)));
        if (Math.hypot(clientX - rect.left - p.x, clientY - rect.top - p.y) < 20 * frame.scale) return { action: 'person:' + id };
      }
      if (u > 935 && u < 1165 && v > .48 * (u - 935) + 205 && v < .48 * (u - 935) + 308) return { action: 'board' };
      if (u > 340 && u < 584 && v > 250 - (u - 340) * .48 && v < 370 - (u - 340) * .48) return { action: 'mural' };
      const top = referencePoint(u, v + 53), tables = REFERENCE_TABLES;
      for (let i = 0; i < tables.length; i++) if (Math.abs(top.x - tables[i].x) < 2.2 && Math.abs(top.z - tables[i].z) < .8) return { action: 'desk-table:' + i };
      const meetingTable = referencePoint(813, 809), managerTable = referencePoint(1310, 619);
      if (Math.abs(top.x - meetingTable.x) < 2 && Math.abs(top.z - meetingTable.z) < .65) return { action: 'meeting' };
      if (Math.abs(top.x - managerTable.x) < 1.83 && Math.abs(top.z - managerTable.z) < .68) return { action: 'boss' };
      if (((u - 1034) / 83) ** 2 + ((v - 675) / 53) ** 2 < 1) return { action: 'brainstorm' };
      const studio = [[298,535],[451,461],[614,645],[516,704]]; let inside = false;
      for (let i = 0, j = studio.length - 1; i < studio.length; j = i++) {
        const [xi, yi] = studio[i], [xj, yj] = studio[j];
        if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return { action: 'studio' };
      const p = referencePoint(u, v);
      const seat = this.layout.desks.find(d => Math.hypot(d.x - p.x, d.z - p.z) < .55);
      if (seat) return { action: 'desk-table:' + tables.findIndex(t => t.x === seat.table.x && t.z === seat.table.z) };
      return Math.abs(p.x) <= 11.7 && Math.abs(p.z) <= 9.2 ? { point: p } : {};
    }
    const rect = this.renderer.domElement.getBoundingClientRect(), ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), this.camera);
    const hit = ray.intersectObjects(this.objects, true)[0];
    if (hit) { let obj: T.Object3D | null = hit.object; while (obj) { const action = this.pickActions.get(obj); if (action) return { action }; obj = obj.parent; } }
    const floor = ray.intersectObject(this.floor)[0];
    return floor ? { point: { x: floor.point.x, z: floor.point.z } } : {};
  }
  mark(point: Point | null) { this.targetMarker.visible = !!point; if (point) this.targetMarker.position.set(point.x, .065, point.z); }
  dispose() {
    this.disposed = true;
    this.scene.traverse(object => { if (object instanceof T.Mesh || object instanceof T.Sprite) { if (object instanceof T.Mesh) object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(m => m.dispose()); } });
    this.resources.forEach(t => t.dispose()); this.materials.forEach(m => m.dispose()); this.geometries.forEach(g => g.dispose());
    this.composer.passes.forEach(pass => pass.dispose()); this.composer.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
