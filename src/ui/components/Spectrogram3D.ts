/**
 * ZANOBOT — 3D-SPEKTROGRAMM „GEBIRGE" (Zeit × Frequenz × Intensität)
 *
 * Interaktive Höhenfeld-Ansicht einer gespeicherten Aufnahme im Verlaufs-
 * Modal: X = Frequenz, Z = Zeit, Y/Farbe = Intensität (Turbo-Farbverlauf).
 * Ein Finger dreht (Orbit), zwei Finger zoomen (Pinch), Mausrad zoomt.
 *
 * Bewusst OHNE 3D-Bibliothek: ein Höhenfeld mit Vertex-Farben ist der
 * einfachste WebGL-Fall — ein Mini-Renderer (~1 Shader-Paar, 1 Mesh) hält
 * das Bundle klein und die Abhängigkeiten bei null. Gerendert wird nur bei
 * Interaktion (kein rAF-Dauerlauf → kein Akku-Verbrauch im Leerlauf).
 *
 * Rein präsentierend und additiv — die Matrix kommt aus
 * core/dsp/spectrogram.ts (unit-getestet); ohne WebGL-Unterstützung wird
 * die Komponente einfach nicht angeboten (isSupported()).
 */

import type { SpectrogramMatrix } from '@core/dsp/spectrogram.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

/** Höhe des Gebirges relativ zur Grundfläche. */
const HEIGHT_SCALE = 0.55;

/** Kamera-Grenzen (Orbit-Distanz und Neigung). */
const DIST_MIN = 1.5;
const DIST_MAX = 6;
const PITCH_MIN = 0.12;
const PITCH_MAX = 1.35;

/**
 * Turbo-artiger Farbverlauf (dunkelblau → türkis → gelb → rot) als
 * stückweise lineare Interpolation. Exportiert für Unit-Tests.
 */
export function turboColor(v: number): [number, number, number] {
  const stops: Array<[number, number, number, number]> = [
    [0.0, 0.07, 0.11, 0.27], // tiefes Blau
    [0.3, 0.1, 0.5, 0.75], // Blau/Cyan
    [0.55, 0.1, 0.8, 0.45], // Grün-Türkis
    [0.75, 0.95, 0.85, 0.15], // Gelb
    [1.0, 0.85, 0.15, 0.1], // Rot
  ];
  const x = Math.min(1, Math.max(0, v));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, r0, g0, b0] = stops[i - 1];
      const [x1, r1, g1, b1] = stops[i];
      const f = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return [stops[stops.length - 1][1], stops[stops.length - 1][2], stops[stops.length - 1][3]];
}

export interface HeightFieldMesh {
  positions: Float32Array; // xyz je Vertex
  colors: Float32Array; // rgb je Vertex
  indices: Uint32Array; // Dreiecks-Indizes
  vertexCount: number;
  triangleCount: number;
}

/**
 * Höhenfeld-Mesh aus der Matrix: X = Frequenz ∈ [−1,1], Z = Zeit ∈ [−1,1]
 * (Zeile 0 = hinten), Y = Intensität × HEIGHT_SCALE. Exportiert für Tests.
 */
export function buildHeightFieldMesh(matrix: SpectrogramMatrix): HeightFieldMesh {
  const { rows, cols, values } = matrix;
  const vertexCount = rows * cols;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const v = values[i];
      positions[i * 3] = cols > 1 ? (c / (cols - 1)) * 2 - 1 : 0;
      positions[i * 3 + 1] = v * HEIGHT_SCALE;
      positions[i * 3 + 2] = rows > 1 ? (r / (rows - 1)) * 2 - 1 : 0;
      const [cr, cg, cb] = turboColor(v);
      // Leichte Höhen-Abdunklung der Täler → Tiefenwirkung ohne Licht-Shader
      const shade = 0.55 + 0.45 * v;
      colors[i * 3] = cr * shade;
      colors[i * 3 + 1] = cg * shade;
      colors[i * 3 + 2] = cb * shade;
    }
  }

  const triangleCount = (rows - 1) * (cols - 1) * 2;
  const indices = new Uint32Array(Math.max(0, triangleCount) * 3);
  let p = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      indices[p++] = a;
      indices[p++] = d;
      indices[p++] = b;
      indices[p++] = b;
      indices[p++] = d;
      indices[p++] = e;
    }
  }

  return { positions, colors, indices, vertexCount, triangleCount };
}

// ── Mini-Matrix-Mathematik (Spaltenvektor-Konvention, wie WebGL) ──────────

function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function mat4LookAtOrbit(yaw: number, pitch: number, dist: number): Float32Array {
  // Kamera auf Kugel um den Ursprung; Blick zum Ursprung, Up = +Y.
  const cx = dist * Math.cos(pitch) * Math.sin(yaw);
  const cy = dist * Math.sin(pitch);
  const cz = dist * Math.cos(pitch) * Math.cos(yaw);
  const eye = [cx, cy, cz];
  const zx = eye[0];
  const zy = eye[1];
  const zz = eye[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  const z = [zx / zl, zy / zl, zz / zl];
  const up = [0, 1, 0];
  const x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  const xl = Math.hypot(x[0], x[1], x[2]) || 1;
  x[0] /= xl;
  x[1] /= xl;
  x[2] /= xl;
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const out = new Float32Array(16);
  out[0] = x[0];
  out[4] = x[1];
  out[8] = x[2];
  out[1] = y[0];
  out[5] = y[1];
  out[9] = y[2];
  out[2] = z[0];
  out[6] = z[1];
  out[10] = z[2];
  out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  out[15] = 1;
  return out;
}

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = s;
    }
  }
  return out;
}

const VERT_SRC = `
attribute vec3 aPos;
attribute vec3 aColor;
uniform mat4 uMvp;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = uMvp * vec4(aPos, 1.0);
}`;

const FRAG_SRC = `
precision mediump float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}`;

export class Spectrogram3D {
  public readonly element: HTMLElement;

  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private mvpLoc: WebGLUniformLocation | null = null;
  private indexCount = 0;
  private useUint32 = false;

  // Orbit-Zustand
  private yaw = 0.6;
  private pitch = 0.7;
  private dist = 2.4;

  // Pointer-Zustand (1 Finger = drehen, 2 Finger = Pinch-Zoom)
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private renderQueued = false;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;

  /** WebGL verfügbar? (Ohne wird die Ansicht gar nicht erst angeboten.) */
  static isSupported(): boolean {
    try {
      const c = document.createElement('canvas');
      return Boolean(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }

  constructor(matrix: SpectrogramMatrix) {
    const container = document.createElement('div');
    container.className = 'spectro3d';
    this.element = container;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'spectro3d-canvas';
    container.appendChild(this.canvas);

    const hint = document.createElement('div');
    hint.className = 'spectro3d-hint';
    hint.textContent = t('spectro3d.hint');
    container.appendChild(hint);

    const axis = document.createElement('div');
    axis.className = 'spectro3d-axis';
    axis.textContent = t('spectro3d.axis', {
      maxKhz: (matrix.maxFreqHz / 1000).toFixed(0),
      seconds: matrix.durationSec.toFixed(0),
    });
    container.appendChild(axis);

    try {
      this.initGl(matrix);
    } catch (error) {
      logger.warn('Spectrogram3D: WebGL-Initialisierung fehlgeschlagen:', error);
      this.gl = null;
    }

    this.attachInteraction();

    this.resizeObserver = new ResizeObserver(() => this.requestRender());
    this.resizeObserver.observe(this.canvas);
    this.requestRender();
  }

  // ── WebGL-Aufbau ────────────────────────────────────────────────────────

  private initGl(matrix: SpectrogramMatrix): void {
    const gl =
      (this.canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (this.canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) throw new Error('WebGL nicht verfügbar');
    this.gl = gl;

    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type);
      if (!sh) throw new Error('createShader fehlgeschlagen');
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`Shader: ${gl.getShaderInfoLog(sh) ?? 'unbekannt'}`);
      }
      return sh;
    };

    const program = gl.createProgram();
    if (!program) throw new Error('createProgram fehlgeschlagen');
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program: ${gl.getProgramInfoLog(program) ?? 'unbekannt'}`);
    }
    this.program = program;
    this.mvpLoc = gl.getUniformLocation(program, 'uMvp');

    const mesh = buildHeightFieldMesh(matrix);
    this.indexCount = mesh.indices.length;

    const bindAttr = (name: string, data: Float32Array): void => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    };
    gl.useProgram(program);
    bindAttr('aPos', mesh.positions);
    bindAttr('aColor', mesh.colors);

    // > 65k Vertices brauchen die uint-Index-Extension; sonst Uint16.
    this.useUint32 = mesh.vertexCount > 65535;
    if (this.useUint32 && !gl.getExtension('OES_element_index_uint')) {
      throw new Error('OES_element_index_uint nicht verfügbar');
    }
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      this.useUint32 ? mesh.indices : Uint16Array.from(mesh.indices),
      gl.STATIC_DRAW
    );

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.05, 0.08, 0.13, 1);
  }

  // ── Rendern (nur auf Anforderung) ───────────────────────────────────────

  private requestRender(): void {
    if (this.renderQueued || this.destroyed) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  private render(): void {
    const gl = this.gl;
    if (!gl || !this.program || this.destroyed) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round((this.canvas.clientWidth || 320) * dpr));
    const h = Math.max(1, Math.round((this.canvas.clientHeight || 240) * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const proj = mat4Perspective((45 * Math.PI) / 180, w / h, 0.05, 30);
    const view = mat4LookAtOrbit(this.yaw, this.pitch, this.dist);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.mvpLoc, false, mat4Multiply(proj, view));
    gl.drawElements(
      gl.TRIANGLES,
      this.indexCount,
      this.useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      0
    );
  }

  // ── Interaktion: 1 Finger drehen · 2 Finger zoomen · Mausrad ────────────

  private onPointerDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };

    if (this.pointers.size === 1) {
      this.yaw -= (cur.x - prev.x) * 0.01;
      this.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, this.pitch + (cur.y - prev.y) * 0.007));
      this.requestRender();
    }
    this.pointers.set(e.pointerId, cur);

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0 && d > 0) {
        this.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, this.dist * (this.pinchDist / d)));
        this.requestRender();
      }
      this.pinchDist = d;
    }
    e.preventDefault();
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.pinchDist = 0;
  };

  private onWheel = (e: WheelEvent): void => {
    this.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, this.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
    this.requestRender();
    e.preventDefault();
  };

  private attachInteraction(): void {
    this.canvas.style.touchAction = 'none'; // Browser-Gesten aus, wir übernehmen
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  public destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
    this.element.remove();
  }
}
