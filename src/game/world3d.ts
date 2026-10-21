import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Avatar } from '../lib/types';
import { DEFAULT_AVATAR } from './sprites';
import { THEME, themeVariant } from './themes';
import { findPath, type Point } from './movement';
import type { OfficeLayout } from './office-layout';

export interface ActorState {
  id: string; avatar: Partial<Avatar>; target: Point; facing: number; sitting: boolean;
  music: boolean; agents: number; crown: boolean; mode: string;
}
interface Rig {
  root: T.Group; body: T.Group; legs: T.Group[]; arms: T.Group[]; headphones: T.Group;
  robot: T.Group; note: T.Sprite; ring: T.Mesh; camera: T.Group; fingerprint: string;
  path: Point[]; goal: string; state: ActorState;
}
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
  private floor: T.Mesh;
  private targetMarker: T.Mesh;
  private resources = new Set<T.Texture>();
  private w = 1;
  private h = 1;
  constructor(readonly host: HTMLElement, readonly layout: OfficeLayout) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', 'Escritório 3D interativo. Clique no chão para mover seu personagem.');
    this.renderer.domElement.tabIndex = 0; host.append(this.renderer.domElement);
    this.scene.add(new T.HemisphereLight('#e6e1ff', '#9b87a2', 1.7));
    const sun = new T.DirectionalLight('#fff0cf', 3.1); sun.position.set(-8, 22, 10);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 28, bottom: -28, near: 1, far: 70 });
    sun.shadow.normalBias = .035; sun.shadow.bias = -.00015; this.scene.add(sun);
    const fill = new T.DirectionalLight('#a4caff', 1.3); fill.position.set(10, 12, -14); this.scene.add(fill);
    const { width, depth, back, front } = layout;
    this.box(this.scene, width + .7, .6, depth + .7, 0, -.35, 0, '#d3c9cf', .14);
    this.floor = this.box(this.scene, width, .12, depth, 0, -.04, 0, '#e4ded2', .03);
    // Thin grout and alternating warm tiles retain the approved scene's scale.
    const tileRows = Math.ceil(depth / 1.5), tileDepth = depth / tileRows;
    const tileGeometry = new T.BoxGeometry(1.48, .014, tileDepth - .02), tiles = new T.InstancedMesh(tileGeometry, this.material('#e7ded1'), Math.ceil(width / 1.5) * tileRows);
    let tile = 0; const matrix = new T.Matrix4();
    for (let x = -width / 2 + .75; x < width / 2; x += 1.5) for (let row = 0; row < tileRows; row++) {
      const z = back + (row + .5) * tileDepth;
      tiles.setMatrixAt(tile, matrix.makeTranslation(x, .03, z)); tiles.setColorAt(tile++, new T.Color(Math.round((x + z) / 1.5) % 2 ? '#dfd5c7' : '#f0e5d6'));
    }
    tiles.count = tile; tiles.receiveShadow = true; this.scene.add(tiles);
    this.box(this.scene, .24, 3.65, depth, -width / 2, 1.8, 0, COLORS.wall);
    this.box(this.scene, width, 3.65, .24, 0, 1.8, back, COLORS.wall);
    this.box(this.scene, .32, .12, depth, -width / 2, 3.65, 0, COLORS.trim);
    this.box(this.scene, width, .12, .32, 0, 3.65, back, COLORS.trim);
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
    this.label('team', 'Mesas da equipe', -.8, 2.5, back + 7.8, undefined, 5);
    this.label('manager', 'Sala do gestor', 8.8, 3, back + 4.5, 'boss', 6);
    this.label('brainstorm', 'Brainstorm', 8.2, 2.5, front - 5.6, 'brainstorm', 7);
    this.label('lounge', 'Lounge', -6.2, 2.4, back + 2.2, 'lounge', 8);
    this.label('studio', 'Estúdio de captação', -8, 2.8, front - 4.1, 'studio', 9);
    this.targetMarker = new T.Mesh(new T.RingGeometry(.25, .31, 32), new T.MeshBasicMaterial({ color: '#9e83ee', transparent: true, opacity: .85, side: T.DoubleSide }));
    this.targetMarker.rotation.x = -Math.PI / 2; this.targetMarker.position.y = .065; this.targetMarker.visible = false; this.scene.add(this.targetMarker);
    this.camera.position.set(29, 28, 34); this.camera.lookAt(0, .4, 0);
    this.resize();
  }
  private material(color: string, metalness = .06) {
    const key = color + metalness;
    if (!this.materials.has(key)) this.materials.set(key, new T.MeshStandardMaterial({ color, roughness: .65, metalness }));
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
    this.box(this.scene, w, 2.75, .1, x, 2, z + .14, '#a9d9ed');
    this.glass(this.scene, w, 2.75, .02, x, 2, z + .23);
    for (let i = 0; i < 4; i++) this.box(this.scene, .055, 2.8, .16, x - w / 2 + i * w / 3, 2, z + .2, '#393743');
  }
  private plant(x: number, z: number, scale = 1, parent: T.Object3D = this.scene, y = 0) {
    this.cylinder(parent, .29 * scale, .55 * scale, x, y + .28 * scale, z, '#ece5dc', .24 * scale);
    this.cylinder(parent, .065 * scale, .9 * scale, x, y + .8 * scale, z, '#766047');
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, leaf = this.sphere(parent, .32 * scale, x + Math.cos(a) * .24 * scale, y + (1 + i * .075) * scale, z + Math.sin(a) * .21 * scale, i % 2 ? '#6e9a59' : '#4f8d62'); leaf.scale.set(1, 1.3, .65);
    }
  }
  private chair(x: number, z: number, facing = 0, parent: T.Object3D = this.scene, color = '#393d51') {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = facing; parent.add(g);
    this.box(g, .7, .16, .72, 0, .54, 0, color, .09); this.box(g, .7, .7, .15, 0, 1, -.3, color, .1);
    this.cylinder(g, .06, .45, 0, .25, 0, '#7a7b88'); this.box(g, .75, .055, .07, 0, .09, 0, '#555763'); this.box(g, .07, .055, .75, 0, .09, 0, '#555763');
    return g;
  }
  private table(x: number, z: number, w: number, d: number, y = .98) {
    const top = this.box(this.scene, w, .16, d, x, y, z, COLORS.wood, .09);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) this.box(this.scene, .09, y - .08, .09, x + dx * (w / 2 - .18), y / 2 - .05, z + dz * (d / 2 - .15), '#353548');
    return top;
  }
  private monitor(x: number, z: number, rotation = 0, y = 1.28) {
    const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = rotation; this.scene.add(g);
    this.box(g, .86, .57, .075, 0, .18, 0, '#282d40');
    this.panel(g, .76, .46, 0, .18, .043, c => { c.fillStyle = '#1d274a'; c.fillRect(0, 0, 768, 384); c.fillStyle = '#9372dc'; c.fillRect(30, 30, 140, 324); c.fillStyle = '#b2ddf2'; c.fillRect(200, 40, 530, 130); c.fillStyle = '#5e96b2'; for (let i = 0; i < 4; i++) c.fillRect(210, 210 + i * 33, 330 - i * 40, 15); });
    this.box(g, .06, .25, .06, 0, -.2, 0, '#55576b'); this.box(g, .35, .035, .23, 0, -.3, .02, '#55576b');
  }
  private workTable(x: number, z: number) {
    this.table(x, z, 3.6, 1.4);
    for (const side of [-1, 1]) for (const dx of [-.85, .85]) { this.monitor(x + dx, z + side * .08, side < 0 ? Math.PI : 0); this.box(this.scene, .65, .035, .22, x + dx, 1.08, z + side * .48, '#d6d9e1'); this.cylinder(this.scene, .09, .15, x + dx + .46, 1.15, z + side * .48, '#f0e9dc'); }
    this.box(this.scene, .35, .68, .75, x - 1.3, .4, z, '#343644'); this.plant(x, z - .1, .3, this.scene, 1.07);
  }
  private coffee() {
    const z = this.layout.back + 7.4;
    this.box(this.scene, 2.3, .035, 6.6, -10.65, .075, z, '#bc946b');
    this.box(this.scene, 1.2, 1.05, 5.2, -11.1, .6, z, '#343545'); this.box(this.scene, 1.45, .12, 5.4, -10.98, 1.16, z, '#eee8de');
    this.box(this.scene, 1.1, 2.3, 1.15, -11, 1.2, z + 2.5, '#d2d9e1', .09);
    this.box(this.scene, .035, .7, .055, -10.42, 1.38, z + 2.1, '#777e8b');
    this.box(this.scene, .7, .55, .65, -10.9, 1.48, z, '#292c38'); this.box(this.scene, .04, .3, .44, -10.52, 1.45, z, '#80898f');
    this.box(this.scene, .7, .45, .75, -10.9, 1.42, z - 1.5, '#e0d9d1'); this.box(this.scene, .035, .26, .51, -10.52, 1.45, z - 1.5, '#343545');
    for (let i = 0; i < 7; i++) this.cylinder(this.scene, .1, .17, -11, 1.33, z - 2.3 + i * .27, ['#ae7ddb', '#48a7a2', '#efc361'][i % 3]);
    this.clickable(this.textPanel('CAFÉ', 1.4, .55, -11.82, 2.65, z + .9, Math.PI / 2), 'copa');
    this.plant(-11.1, z - 2.9, .65);
  }
  private lounge() {
    const z = this.layout.back;
    this.box(this.scene, 8, .035, 4.5, -6.1, .065, z + 2.5, '#6654a6', .12);
    this.box(this.scene, 7.2, .45, 1.25, -6.1, .42, z + 1.35, '#5a47a1', .17);
    this.box(this.scene, 7.2, .86, .27, -6.1, 1, z + .85, '#6e55b5', .12);
    for (const x of [-9.55, -2.65]) this.box(this.scene, .3, .72, 1.3, x, .72, z + 1.35, '#47a5af', .14);
    for (let i = 0; i < 8; i++) this.box(this.scene, .79, .18, .91, -9.05 + i * .84, .7, z + 1.5, '#7963c4', .12);
    for (let i = 0; i < 3; i++) this.box(this.scene, .58, .58, .15, -7.8 + i * 1.4, 1.02, z + 1.2, ['#edbc5c', '#42b1b2', '#b682d9'][i], .12);
    this.table(-6.1, z + 3.15, 2.5, .95, .52); this.cylinder(this.scene, .6, .5, -3.9, .32, z + 3.5, '#9b6bd0');
    this.plant(-10.4, z + 1.3, 1.1); this.plant(-1.85, z + 1, .9);
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
    }
  }
  private taskBoard() {
    const z = this.layout.back + .2;
    const board = this.box(this.scene, 7, 2.15, .13, .8, 2.1, z, '#ece9e1', .05); this.clickable(board, 'board');
    for (let i = 0; i < 3; i++) this.box(this.scene, 2.1, .19, .025, -1.45 + i * 2.25, 2.95, z + .08, ['#b49be5', '#f1c777', '#7bbbab'][i]);
    this.scene.add(this.notes);
    this.textPanel('SABADÃO', .95, .52, 5.1, 2.25, z + .02); this.clickable(this.scene.children[this.scene.children.length - 1], 'sabado');
    this.clickable(this.textPanel('Instagram', 1.4, .6, 7, 3.05, z + .02, 0, '#37284d', '#d1b9ef'), 'instagram');
  }
  setNotes(notes: { col: number; color: string }[]) {
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
      material.map = this.canvasTexture(384, 512, c => {
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
  private studio() {
    const f = this.layout.front;
    this.box(this.scene, 6.2, .04, 5.2, -8.1, .08, f - 3, '#292b39', .02);
    this.box(this.scene, 5, 2.4, .11, -8.1, 1.3, f - 4, '#3b9b5a'); this.box(this.scene, 5, .035, 2.4, -8.1, .12, f - 2.85, '#459e60', 0);
    this.textPanel('● REC', 1.1, .38, -8.1, 2.8, f - 3.97, 0, '#262b3a', '#ff8d97');
    const ring = new T.Mesh(new T.TorusGeometry(.4, .045, 8, 36), new T.MeshStandardMaterial({ color: '#fff1b4', emissive: '#fff1b4', emissiveIntensity: .5 })); ring.position.set(-5.7, 1.7, f - 1.8); this.scene.add(ring);
    this.cylinder(this.scene, .025, 1.4, -5.7, .7, f - 1.8, '#545764');
    this.box(this.scene, .52, .36, .4, -7.8, 1.25, f - 1.5, '#333a48'); this.cylinder(this.scene, .035, 1.15, -7.8, .6, f - 1.5, '#555b66');
    for (const dx of [-.4, .4]) { const leg = this.cylinder(this.scene, .025, 1.1, -7.8 + dx / 2, .5, f - 1.5, '#555b66'); leg.rotation.z = dx; }
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
  }
  private brainstorm() {
    const z = this.layout.front - 5.5;
    this.cylinder(this.scene, 2.25, .035, 8.1, .075, z, '#e1b76b');
    this.cylinder(this.scene, 1.3, .14, 8.1, 1, z, '#f4eee1'); this.cylinder(this.scene, .18, .9, 8.1, .5, z, '#77727d');
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; this.chair(8.1 + Math.sin(a) * 1.9, z + Math.cos(a) * 1.9, a + Math.PI); this.box(this.scene, .3, .012, .25, 8.1 + Math.sin(a) * .6, 1.08, z + Math.cos(a) * .6, ['#da9bc8', '#92d0be', '#eac47d', '#9fbbdf'][i], 0); }
  }
  private manager() {
    const b = this.layout.back;
    this.box(this.scene, 5.1, .035, 6.8, 9, .08, b + 3.8, '#b78c63');
    this.box(this.scene, 4.3, .035, 4.5, 8.8, .1, b + 4.1, '#62549b');
    this.glass(this.scene, .035, 2.8, 5.8, 6.3, 1.45, b + 3.5);
    this.glass(this.scene, 3.5, 2.8, .035, 9.8, 1.45, b + 7.15);
    this.table(8.8, b + 4.2, 3.8, 1.3); this.monitor(8.8, b + 4.35, Math.PI); this.chair(8.8, b + 2.95, 0, this.scene, '#6b5a9a');
    this.box(this.scene, 3.5, 2.6, .35, 8.8, 1.5, b + .45, '#8d6549');
    for (let row = 0; row < 3; row++) for (let col = 0; col < 13; col++) this.box(this.scene, .17, .45 + (col % 3) * .07, .3, 7.3 + col * .24, .7 + row * .75, b + .68, ['#b67ba0', '#e4bf6b', '#679d9f', '#7279b4'][col % 4], .01);
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
    const legs: T.Group[] = [], arms: T.Group[] = [];
    for (const sign of [-1, 1]) {
      const leg = new T.Group(); leg.position.set(sign * .135, .62, 0); body.add(leg); legs.push(leg);
      this.box(leg, .19, .47, .22, 0, -.23, 0, '#3b4054', .04); this.box(leg, .22, .14, .34, 0, -.48, .055, '#2d2f41', .05);
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
    root.position.set(state.target.x, 0, state.target.z);
    this.objects.push(root); this.pickActions.set(root, 'person:' + state.id);
    return { root, body, legs, arms, headphones, robot, note, ring, camera: cam, fingerprint: JSON.stringify([state.avatar, state.crown]), path: [], goal: '', state };
  }
  sync(states: ActorState[], mine: string) {
    const ids = new Set(states.map(s => s.id));
    for (const [id, actor] of this.actors) if (!ids.has(id)) { this.removeActor(actor); this.actors.delete(id); }
    for (const state of states) {
      let actor = this.actors.get(state.id);
      const fp = JSON.stringify([state.avatar, state.crown]);
      if (actor && actor.fingerprint !== fp) { const position = actor.root.position.clone(); this.removeActor(actor); actor = this.makeActor(state); actor.root.position.copy(position); this.actors.set(state.id, actor); }
      if (!actor) { actor = this.makeActor(state); this.actors.set(state.id, actor); }
      actor.state = state; actor.ring.visible = state.id === mine;
      const key = `${state.target.x.toFixed(2)},${state.target.z.toFixed(2)}`;
      if (actor.goal !== key) { actor.goal = key; actor.path = findPath(actor.root.position, state.target, this.layout.blocks, this.layout.width, this.layout.depth); }
    }
  }
  private removeActor(actor: Rig) {
    this.scene.remove(actor.root); this.pickActions.delete(actor.root); const i = this.objects.indexOf(actor.root); if (i >= 0) this.objects.splice(i, 1);
    actor.note.material.map?.dispose(); actor.note.material.dispose(); actor.ring.geometry.dispose(); (actor.ring.material as T.Material).dispose();
  }
  render(dt: number, elapsed: number) {
    for (const actor of this.actors.values()) {
      const { root, state } = actor; let walking = false;
      if (actor.path.length) {
        const p = actor.path[0], dx = p.x - root.position.x, dz = p.z - root.position.z, distance = Math.hypot(dx, dz), step = Math.min(dt * 2.2, distance);
        if (distance > .025) { root.position.x += dx / distance * step; root.position.z += dz / distance * step; root.rotation.y = Math.atan2(dx, dz); walking = true; }
        if (distance < .08) actor.path.shift();
      } else root.rotation.y = state.facing;
      const seated = !walking && !actor.path.length && state.sitting;
      if (seated && state.mode === 'lounge') { root.position.x += (state.target.x - root.position.x) * Math.min(1, dt * 5); root.position.z += (state.target.z - root.position.z) * Math.min(1, dt * 5); }
      actor.body.position.y = seated ? (state.mode === 'lounge' ? .15 : 0) : walking ? Math.sin(elapsed * 12) * .025 : 0;
      actor.legs.forEach((leg, i) => { leg.rotation.x = seated ? -Math.PI / 2 : walking ? Math.sin(elapsed * 11 + i * Math.PI) * .55 : 0; });
      actor.arms.forEach((arm, i) => { arm.rotation.x = seated ? -.7 : walking ? Math.sin(elapsed * 11 + i * Math.PI + Math.PI) * .45 : 0; });
      actor.headphones.visible = state.music; actor.note.visible = state.music; actor.note.position.set(-.5, 2.12 + Math.sin(elapsed * 3) * .07, 0);
      actor.robot.visible = state.agents > 0; actor.robot.position.set(.78, .12 + Math.sin(elapsed * 3.5) * .07, .12); actor.robot.rotation.y = -root.rotation.y + .5;
      actor.camera.visible = state.mode === 'capture';
    }
    this.renderer.render(this.scene, this.camera);
  }
  project(point: T.Vector3) {
    const p = point.clone().project(this.camera); return { x: (p.x + 1) / 2 * this.w, y: (1 - p.y) / 2 * this.h };
  }
  resize() {
    this.w = Math.max(1, this.host.clientWidth); this.h = Math.max(1, this.host.clientHeight);
    const aspect = this.w / this.h;
    // Fit projected corners, including the walls, rather than clipping large teams.
    this.camera.left = -20; this.camera.right = 20; this.camera.top = 20; this.camera.bottom = -20; this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    const points: T.Vector3[] = [];
    for (const x of [-this.layout.width / 2 - .8, this.layout.width / 2 + .8]) for (const z of [this.layout.back - .8, this.layout.front + .8]) for (const y of [-.6, 3.8]) points.push(new T.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse));
    const box = new T.Box3().setFromPoints(points), center = box.getCenter(new T.Vector3());
    const span = Math.max((box.max.y - box.min.y) * 1.08, (box.max.x - box.min.x) / aspect * 1.08);
    this.camera.left = center.x - span * aspect / 2; this.camera.right = center.x + span * aspect / 2; this.camera.top = center.y + span / 2; this.camera.bottom = center.y - span / 2;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(this.w, this.h, false);
  }
  hit(clientX: number, clientY: number): { action?: string; point?: Point } {
    const rect = this.renderer.domElement.getBoundingClientRect(), ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), this.camera);
    const hit = ray.intersectObjects(this.objects, true)[0];
    if (hit) { let obj: T.Object3D | null = hit.object; while (obj) { const action = this.pickActions.get(obj); if (action) return { action }; obj = obj.parent; } }
    const floor = ray.intersectObject(this.floor)[0];
    return floor ? { point: { x: floor.point.x, z: floor.point.z } } : {};
  }
  mark(point: Point | null) { this.targetMarker.visible = !!point; if (point) this.targetMarker.position.set(point.x, .065, point.z); }
  dispose() {
    this.scene.traverse(object => { if (object instanceof T.Mesh || object instanceof T.Sprite) { if (object instanceof T.Mesh) object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(m => m.dispose()); } });
    this.resources.forEach(t => t.dispose()); this.materials.forEach(m => m.dispose()); this.geometries.forEach(g => g.dispose());
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
