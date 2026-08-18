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
import { freqToColumn, SPECTROGRAM_DB_RANGE } from '@core/dsp/spectrogram.js';
import { formatHz } from '@utils/formatHz.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

/** Höhe des Gebirges relativ zur Grundfläche. */
const HEIGHT_SCALE = 0.55;

/** Länge der Teilstriche unterhalb der Grundfläche (Weltkoordinaten). */
const TICK_LENGTH = 0.07;

/** Farbe der Achsenlinien (gedämpftes Grau-Blau, tritt hinter das Gebirge zurück). */
const AXIS_RGB: [number, number, number] = [0.42, 0.48, 0.56];

/**
 * Frequenz-Teilstriche: die übliche Audio-Leiter, nach unten um 20 und 30 Hz
 * erweitert. Auf der feinen Achse bekommt der Bereich unter 300 Hz rund 40 % der
 * Breite — dort ist Platz für Marken, und dort liegen die Ordnungen einer
 * Maschine (Kurbelwelle, Zündfolge). Gefiltert wird auf das, was in den Bereich
 * der Aufnahme passt.
 */
const FREQ_TICKS_HZ = [20, 30, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

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

// ── Achsen: Geometrie + Beschriftung ─────────────────────────────────────

/** Zu welcher Achse ein Etikett gehört — Ausdünnung geschieht pro Achse. */
export type AxisKind = 'freq' | 'time' | 'level';

/** Ein Achsen-Etikett: Text plus Ankerpunkt in Weltkoordinaten. */
export interface AxisLabel {
  text: string;
  x: number;
  y: number;
  z: number;
  axis: AxisKind;
}

/**
 * Mindestabstand zweier Etiketten derselben Achse auf dem Bildschirm (CSS-px).
 *
 * Nötig, weil der Abstand vom Kamerawinkel abhängt, nicht von den Daten: auf der
 * Log-Achse liegen 20 und 30 Hz rund 6 % der Achsenlänge auseinander, was
 * perspektivisch verkürzt ~18 px sind — ein Etikett ist aber ~35 px breit. Ohne
 * Ausdünnung überdecken sich die Marken (am Bild gesehen), und beim Drehen
 * betrifft es je nach Winkel andere Paare. Marken zu streichen wäre die falsche
 * Antwort: sie sollen da sein, wo Platz ist.
 */
const LABEL_MIN_GAP_PX = 26;

export interface AxisGeometry {
  /** Linien-Vertices (xyz), für gl.LINES — je zwei Vertices eine Linie. */
  positions: Float32Array;
  colors: Float32Array;
  vertexCount: number;
  labels: AxisLabel[];
}

/** „Runder" Zeitschritt, der bei ~5 Teilstrichen landet (1/2/5·10^n). */
export function niceTimeStep(durationSec: number): number {
  if (!(durationSec > 0)) return 1;
  const raw = durationSec / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * Achsengeometrie zur Matrix: Grundrahmen, Teilstriche an Frequenz-, Zeit- und
 * Intensitätsachse, plus die Etiketten mit ihren Ankerpunkten.
 *
 * Die Frequenzpositionen kommen über `freqToColumn` aus DENSELBEN Bandgrenzen,
 * die die Matrix benutzt — eine zweite, eigene Formel wäre eine Achse, die nicht
 * zu den Daten passt.
 *
 * Exportiert für Unit-Tests (kein WebGL, kein DOM).
 */
export function buildAxisGeometry(matrix: SpectrogramMatrix): AxisGeometry {
  const pos: number[] = [];
  const labels: AxisLabel[] = [];

  const line = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): void => {
    pos.push(x1, y1, z1, x2, y2, z2);
  };

  // Grundrahmen (y = 0): zeigt, wo „null Intensität" liegt.
  line(-1, 0, -1, 1, 0, -1);
  line(1, 0, -1, 1, 0, 1);
  line(1, 0, 1, -1, 0, 1);
  line(-1, 0, 1, -1, 0, -1);

  // ── Frequenzachse: vordere Kante (z = +1) ──
  const cols = matrix.cols;
  const maxHz = matrix.bandEdgesHz[cols];
  const minHz = matrix.bandEdgesHz[0];
  for (const hz of FREQ_TICKS_HZ) {
    if (hz < minHz || hz > maxHz) continue;
    const x = cols > 0 ? (freqToColumn(hz, matrix.bandEdgesHz) / cols) * 2 - 1 : 0;
    line(x, 0, 1, x, -TICK_LENGTH, 1);
    labels.push({ text: formatHz(hz), x, y: -TICK_LENGTH * 1.9, z: 1, axis: 'freq' });
  }

  // ── Zeitachse: rechte Kante (x = +1); Zeile 0 = Aufnahmebeginn liegt bei z = −1 ──
  const dur = matrix.durationSec;
  if (dur > 0) {
    const step = niceTimeStep(dur);
    for (let sec = 0; sec <= dur + 1e-9; sec += step) {
      const z = (sec / dur) * 2 - 1;
      line(1, 0, z, 1, -TICK_LENGTH, z);
      labels.push({
        text: `${Number(sec.toFixed(2))} s`,
        x: 1 + TICK_LENGTH,
        y: -TICK_LENGTH,
        z,
        axis: 'time',
      });
    }
  }

  // ── Intensitätsachse: senkrechte Kante an der hinteren linken Ecke ──
  // Die Höhe ist bereits logarithmisch (dB), das Fenster ist SPECTROGRAM_DB_RANGE
  // unter dem Maximum der Aufnahme. Zwei Marken genügen, um die Höhe lesbar zu
  // machen: Boden = Fensteruntergrenze, Spitze = lautester Punkt.
  line(-1, 0, -1, -1, HEIGHT_SCALE, -1);
  labels.push({ text: `−${SPECTROGRAM_DB_RANGE} dB`, x: -1, y: 0, z: -1, axis: 'level' });
  labels.push({ text: '0 dB', x: -1, y: HEIGHT_SCALE, z: -1, axis: 'level' });

  const positions = new Float32Array(pos);
  const vertexCount = positions.length / 3;
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3] = AXIS_RGB[0];
    colors[i * 3 + 1] = AXIS_RGB[1];
    colors[i * 3 + 2] = AXIS_RGB[2];
  }

  return { positions, colors, vertexCount, labels };
}

/**
 * Weltpunkt → Bildschirm-Pixel über die MVP-Matrix (Spaltenvektor-Konvention).
 * `visible` ist false, wenn der Punkt hinter der Kamera liegt — solche Etiketten
 * dürfen nicht gezeichnet werden, sonst kleben sie gespiegelt im Bild.
 *
 * Exportiert für Unit-Tests.
 */
export function projectToScreen(
  mvp: Float32Array,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number
): { x: number; y: number; visible: boolean } {
  const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
  const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
  const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
  if (!(cw > 1e-6)) return { x: 0, y: 0, visible: false };
  return {
    x: ((cx / cw) * 0.5 + 0.5) * width,
    y: (1 - ((cy / cw) * 0.5 + 0.5)) * height,
    visible: true,
  };
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

export interface Spectrogram3DCameraState {
  yaw: number;
  pitch: number;
  distance: number;
}

export const DEFAULT_SPECTROGRAM_CAMERA: Readonly<Spectrogram3DCameraState> = {
  yaw: 0.6,
  pitch: 0.7,
  distance: 2.75,
};

/** Externe oder gemerkte Kamerawerte nie ungeprüft in die Matrixrechnung geben. */
export function normalizeSpectrogramCameraState(
  state?: Partial<Spectrogram3DCameraState> | null
): Spectrogram3DCameraState {
  const yaw = Number.isFinite(state?.yaw) ? state!.yaw! : DEFAULT_SPECTROGRAM_CAMERA.yaw;
  const pitchValue = Number.isFinite(state?.pitch)
    ? state!.pitch!
    : DEFAULT_SPECTROGRAM_CAMERA.pitch;
  const distanceValue = Number.isFinite(state?.distance)
    ? state!.distance!
    : DEFAULT_SPECTROGRAM_CAMERA.distance;
  return {
    yaw,
    pitch: Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitchValue)),
    distance: Math.min(DIST_MAX, Math.max(DIST_MIN, distanceValue)),
  };
}

export class Spectrogram3D {
  public readonly element: HTMLElement;

  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private mvpLoc: WebGLUniformLocation | null = null;
  private indexCount = 0;
  private useUint32 = false;

  // Gebirge und Achsen sind zwei Draw-Calls. Ohne VAOs (WebGL 1) müssen die
  // Attribut-Zeiger pro Draw neu gesetzt werden, deshalb die Buffer als Feld.
  private meshBuffers: { pos: WebGLBuffer; col: WebGLBuffer; ibo: WebGLBuffer } | null = null;
  private axisBuffers: { pos: WebGLBuffer; col: WebGLBuffer; count: number } | null = null;
  private labelLayer: HTMLElement;
  private labelNodes: Array<{ el: HTMLElement; label: AxisLabel; w: number; h: number }> = [];

  // Orbit-Zustand
  private yaw = DEFAULT_SPECTROGRAM_CAMERA.yaw;
  private pitch = DEFAULT_SPECTROGRAM_CAMERA.pitch;
  private dist = DEFAULT_SPECTROGRAM_CAMERA.distance;

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

  constructor(matrix: SpectrogramMatrix, cameraState?: Spectrogram3DCameraState) {
    const camera = normalizeSpectrogramCameraState(cameraState);
    this.yaw = camera.yaw;
    this.pitch = camera.pitch;
    this.dist = camera.distance;

    const container = document.createElement('div');
    container.className = 'spectro3d';
    this.element = container;

    // Leinwand und Etiketten-Ebene liegen übereinander: die Etiketten werden je
    // Bild aus der MVP-Matrix positioniert, damit sie beim Drehen mitwandern.
    const stage = document.createElement('div');
    stage.className = 'spectro3d-stage';
    container.appendChild(stage);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'spectro3d-canvas';
    stage.appendChild(this.canvas);

    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'spectro3d-labels';
    this.labelLayer.setAttribute('aria-hidden', 'true'); // rein visuelle Achsenhilfe
    stage.appendChild(this.labelLayer);

    const hint = document.createElement('div');
    hint.className = 'spectro3d-hint';
    hint.textContent = t('spectro3d.hint');
    container.appendChild(hint);

    const axis = document.createElement('div');
    axis.className = 'spectro3d-axis';
    // Die Zahlen stehen jetzt als Teilstriche an den Achsen selbst; diese Zeile
    // sagt nur noch, WELCHE Größe auf welcher Achse liegt.
    axis.textContent = t('spectro3d.axis');
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

    const makeVbo = (data: Float32Array): WebGLBuffer => {
      const buf = gl.createBuffer();
      if (!buf) throw new Error('createBuffer fehlgeschlagen');
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return buf;
    };
    gl.useProgram(program);

    // > 65k Vertices brauchen die uint-Index-Extension; sonst Uint16.
    this.useUint32 = mesh.vertexCount > 65535;
    if (this.useUint32 && !gl.getExtension('OES_element_index_uint')) {
      throw new Error('OES_element_index_uint nicht verfügbar');
    }
    const ibo = gl.createBuffer();
    if (!ibo) throw new Error('createBuffer fehlgeschlagen');
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      this.useUint32 ? mesh.indices : Uint16Array.from(mesh.indices),
      gl.STATIC_DRAW
    );
    this.meshBuffers = { pos: makeVbo(mesh.positions), col: makeVbo(mesh.colors), ibo };

    const axis = buildAxisGeometry(matrix);
    this.axisBuffers = {
      pos: makeVbo(axis.positions),
      col: makeVbo(axis.colors),
      count: axis.vertexCount,
    };
    this.createLabelNodes(axis.labels);

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.05, 0.08, 0.13, 1);
  }

  /**
   * Ein DOM-Element je Etikett; positioniert wird erst beim Rendern.
   *
   * Die Größe wird EINMAL hier gemessen: Der Text ändert sich nicht, und beim
   * Rendern brauchen wir sie, um Randmarken ins Bild zu klemmen statt sie
   * abzuschneiden. Auf einem Telefon war „20 Hz" links zu „Hz" verstümmelt —
   * ausgerechnet die Marke, die für tiefe Maschinenordnungen dazugekommen war.
   */
  private createLabelNodes(labels: AxisLabel[]): void {
    this.labelLayer.innerHTML = '';
    this.labelNodes = labels.map((label) => {
      const el = document.createElement('span');
      el.className = 'spectro3d-label';
      el.textContent = label.text;
      this.labelLayer.appendChild(el);
      return { el, label, w: 0, h: 0 };
    });
    // NICHT hier messen: Der Konstruktor läuft, bevor der Aufrufer
    // `view.element` einhängt — in einem losgelösten Teilbaum ist offsetWidth 0,
    // und mit Breite 0 klemmt der Renderer gegen nichts. Gemessen wird beim
    // ersten Rendern, dann steht das Element im Dokument.
  }

  /**
   * Etikettengrößen nachmessen, sobald sie im Dokument stehen. Der Text ändert
   * sich nicht, also genügt ein Durchlauf; solange eine Größe 0 ist (Element noch
   * nicht sichtbar), wird beim nächsten Bild erneut versucht.
   */
  private measureLabels(): void {
    for (const node of this.labelNodes) {
      if (node.w === 0) node.w = node.el.offsetWidth;
      if (node.h === 0) node.h = node.el.offsetHeight;
    }
  }

  /**
   * Etiketten auf ihre projizierten Bildschirmpositionen setzen (CSS-Pixel) und
   * pro Achse ausdünnen, wo sie sich sonst überdecken würden.
   *
   * Ausgedünnt wird NACH der Projektion, weil der Abstand am Kamerawinkel hängt:
   * dieselbe Marke ist bei einer Drehung gut lesbar und bei einer anderen unter
   * der Nachbarin. Pro Achse getrennt, damit ein Zeit-Etikett nicht eine
   * Frequenzmarke verdrängt.
   */
  private positionLabels(mvp: Float32Array, cssWidth: number, cssHeight: number): void {
    const lastShown = new Map<AxisKind, { x: number; y: number }>();

    // Die Etiketten-Ebene deckt die ganze Bühne, die Projektion rechnet aber in
    // Leinwand-Koordinaten — deshalb der Versatz. So lässt sich anschließend
    // gegen die Bühnenkante klemmen, und Randmarken bleiben vollständig lesbar.
    this.measureLabels();
    const offsetX = this.canvas.offsetLeft;
    const offsetY = this.canvas.offsetTop;
    const stageW = this.labelLayer.clientWidth || cssWidth;
    const stageH = this.labelLayer.clientHeight || cssHeight;

    for (const { el, label, w, h } of this.labelNodes) {
      const p = projectToScreen(mvp, label.x, label.y, label.z, cssWidth, cssHeight);
      if (!p.visible) {
        el.style.display = 'none';
        continue;
      }

      const prev = lastShown.get(label.axis);
      if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < LABEL_MIN_GAP_PX) {
        el.style.display = 'none';
        continue;
      }

      // In die Bühne klemmen: ein Etikett darf von seinem Teilstrich abrücken,
      // aber nicht halb verschwinden. Halbe Breite Reserve, weil translate(-50 %)
      // es auf seinen Punkt zentriert.
      const half = { x: w / 2, y: h / 2 };
      const x = Math.min(Math.max(p.x + offsetX, half.x), Math.max(half.x, stageW - half.x));
      const y = Math.min(Math.max(p.y + offsetY, half.y), Math.max(half.y, stageH - half.y));

      lastShown.set(label.axis, { x: p.x, y: p.y });
      el.style.display = '';
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  // ── Rendern (nur auf Anforderung) ───────────────────────────────────────

  private requestRender(): void {
    if (this.renderQueued || this.destroyed) return;
    // Nicht visuell, aber end-to-end prüfbar: Der Wächter kann damit beweisen,
    // dass ein Quellenwechsel dieselbe Kamera übernimmt, statt nur ähnlich
    // auszusehen. Die Werte enthalten keinerlei Aufnahme- oder Nutzerdaten.
    this.canvas.dataset.cameraYaw = this.yaw.toFixed(6);
    this.canvas.dataset.cameraPitch = this.pitch.toFixed(6);
    this.canvas.dataset.cameraDistance = this.dist.toFixed(6);
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
    const mvp = mat4Multiply(proj, view);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.mvpLoc, false, mvp);

    const posLoc = gl.getAttribLocation(this.program, 'aPos');
    const colLoc = gl.getAttribLocation(this.program, 'aColor');
    const bind = (pos: WebGLBuffer, col: WebGLBuffer): void => {
      gl.bindBuffer(gl.ARRAY_BUFFER, pos);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, col);
      gl.enableVertexAttribArray(colLoc);
      gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, 0, 0);
    };

    if (this.meshBuffers) {
      bind(this.meshBuffers.pos, this.meshBuffers.col);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshBuffers.ibo);
      gl.drawElements(
        gl.TRIANGLES,
        this.indexCount,
        this.useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
        0
      );
    }

    // Achsen zuletzt: Linien liegen teils unter der Grundfläche und sollen dort
    // nicht vom Gebirge verdeckt werden, wo sie davor liegen.
    if (this.axisBuffers) {
      bind(this.axisBuffers.pos, this.axisBuffers.col);
      gl.drawArrays(gl.LINES, 0, this.axisBuffers.count);
    }

    // Etiketten in CSS-Pixeln, nicht in Gerätepixeln — die Ebene liegt im DOM.
    this.positionLabels(
      mvp,
      this.canvas.clientWidth || w / dpr,
      this.canvas.clientHeight || h / dpr
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

  /** Momentane Perspektive für den Quellenwechsel sichern. */
  public cameraState(): Spectrogram3DCameraState {
    return { yaw: this.yaw, pitch: this.pitch, distance: this.dist };
  }

  /** Nur eine bewusste Nutzerhandlung setzt Winkel und Zoom zurück. */
  public resetCamera(): void {
    const camera = normalizeSpectrogramCameraState(DEFAULT_SPECTROGRAM_CAMERA);
    this.yaw = camera.yaw;
    this.pitch = camera.pitch;
    this.dist = camera.distance;
    this.requestRender();
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
    this.labelNodes = [];
    this.meshBuffers = null;
    this.axisBuffers = null;
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
    this.element.remove();
  }
}
