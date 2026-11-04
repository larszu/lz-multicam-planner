// Kamerakarte als Grafik (#222): Grundriss, Kameras als Symbole mit Nummer
// oder Buchstabe, Optik und Stativ daneben, Fahrwege als Linien, Legende,
// Projektkopf. Erzeugt SVG — daraus werden PNG und PDF. Mit einer
// Schnittliste wird die Karte zum animierten SVG: die geschnittene Kamera
// leuchtet auf, unten laeuft das Zeitband mit Abspielkopf.
//
// Reines Modul (kein DOM); Text kommt fertig uebersetzt herein.
import type { BackgroundPlan, Venue, VenueCamera, Wall } from '../types';
import { sitzblockEcken, videowandEnden } from '../avplan/floorplan';
import { effectiveCameraPos } from './camera';
import { rigLimits } from './rigLimits';
import { pathLengthM, pathPolyline, rigToPlan } from './travelPath';
import { esc } from './storyboard';

/** Oeffnet den Kamerakarten-Dialog. */
export const CAMERA_MAP_EVENT = 'multicam-camera-map';

export type MapTheme = 'dark' | 'light';
export type MapNumbering = 'number' | 'letter';

export interface MapCamera {
  cam: VenueCamera;
  /** Erste Zeile neben dem Symbol: Kamera + Optik. */
  optics: string;
  /** Zweite Zeile: Stativ, Hoehe, Fahrweg. */
  rig: string;
  /** Horizontaler Bildwinkel (Grad); ohne Angabe kein Kegel. */
  fovDeg?: number;
}

export interface CutSegment {
  cameraId: string;
  startS: number;
  endS: number;
}

export interface CameraMapInput {
  title: string;
  subtitle: string;
  venue: Pick<Venue, 'widthM' | 'heightM' | 'stages' | 'seatingBlocks' | 'videoWalls'>;
  walls: Wall[];
  plan: BackgroundPlan | null;
  cameras: MapCamera[];
  theme: MapTheme;
  labels: boolean;
  numbering: MapNumbering;
  texts: { legend: string; scale: string; planSource: string; stamp?: string };
  cuts?: CutSegment[];
}

const PALETTE = {
  dark: { bg: '#1E1F23', sheet: '#2A2B30', grid: '#3A3B42', text: '#F2F1EC', dim: '#A9ACB4', wall: '#C9CAC5', stage: '#3B82F6', audience: '#A855F7', video: '#38BDF8', active: '#EF4444' },
  light: { bg: '#F4F4F1', sheet: '#FFFFFF', grid: '#E3E3DF', text: '#16181D', dim: '#5F636B', wall: '#4A4B52', stage: '#2563EB', audience: '#9333EA', video: '#0284C7', active: '#DC2626' },
} as const;

/** Symbol einer Kamera: Nummer aus dem Namen („CAM 3" → 3) oder Buchstabe nach Reihenfolge. */
export function cameraSymbol(cam: Pick<VenueCamera, 'label'>, index: number, numbering: MapNumbering): string {
  if (numbering === 'letter') {
    let n = index;
    let s = '';
    do {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
  }
  const m = /(\d+)\s*$/.exec(cam.label);
  return m ? m[1] : String(index + 1);
}

/** Quelle und Massstab des Grundrisses als Zeile. */
export function planMassstabText(plan: Pick<BackgroundPlan, 'scaleX' | 'scaleY' | 'widthPx' | 'heightPx'>): string {
  const mm = (v: number) => (v * 1000).toFixed(v * 1000 < 10 ? 2 : 1);
  const s = Math.abs(plan.scaleX - plan.scaleY) < 1e-9 ? `${mm(plan.scaleX)} mm/px` : `${mm(plan.scaleX)} × ${mm(plan.scaleY)} mm/px`;
  return `${s} · ${(plan.widthPx * plan.scaleX).toFixed(1)} × ${(plan.heightPx * plan.scaleY).toFixed(1)} m`;
}

const f1 = (v: number) => Math.round(v * 10) / 10;

/** Laenge des Massstabsbalkens: eine runde Zahl um ein Fuenftel der Breite. */
export function scaleBarM(widthM: number): number {
  const ziel = widthM / 5;
  for (const m of [1, 2, 5, 10, 20, 25, 50, 100, 200, 500]) if (m >= ziel) return m;
  return 1000;
}

export function buildCameraMapSvg(input: CameraMapInput): { svg: string; width: number; height: number } {
  const P = PALETTE[input.theme];
  const W = 1600;
  const pad = 32;
  const headH = 84;
  const footH = 56;
  const legendW = 400;
  const planMaxW = W - pad * 3 - legendW;
  const vw = Math.max(1, input.venue.widthM);
  const vh = Math.max(1, input.venue.heightM);
  const ppm = Math.min(planMaxW / vw, 1000 / vh);
  const planW = vw * ppm;
  const planH = vh * ppm;
  const legendRowH = input.labels ? 58 : 34;
  const legendH = 40 + input.cameras.length * legendRowH;
  const timelineH = input.cuts?.length ? 70 : 0;
  const bodyH = Math.max(planH, legendH);
  const H = Math.round(headH + bodyH + timelineH + footH + pad);
  const ox = pad;
  const oy = headH;
  const X = (m: number) => f1(ox + m * ppm);
  const Y = (m: number) => f1(oy + m * ppm);
  const out: string[] = [];
  const push = (s: string) => out.push(s);

  push(`<rect width="${W}" height="${H}" fill="${P.bg}"/>`);
  push(`<text x="${pad}" y="40" font-size="28" font-weight="700" fill="${P.text}">${esc(input.title)}</text>`);
  push(`<text x="${pad}" y="66" font-size="15" fill="${P.dim}">${esc(input.subtitle)}</text>`);

  push(`<rect x="${ox}" y="${oy}" width="${f1(planW)}" height="${f1(planH)}" fill="${P.sheet}"/>`);
  const plan = input.plan;
  if (plan) {
    push(`<image href="${esc(plan.dataUrl)}" x="${X(plan.offsetX)}" y="${Y(plan.offsetY)}" width="${f1(plan.widthPx * plan.scaleX * ppm)}" height="${f1(plan.heightPx * plan.scaleY * ppm)}" opacity="${plan.opacity}" preserveAspectRatio="none"/>`);
  }
  const step = vw > 60 ? 10 : 5;
  for (let m = step; m < vw; m += step) push(`<line x1="${X(m)}" y1="${oy}" x2="${X(m)}" y2="${f1(oy + planH)}" stroke="${P.grid}" stroke-width="1"/>`);
  for (let m = step; m < vh; m += step) push(`<line x1="${ox}" y1="${Y(m)}" x2="${f1(ox + planW)}" y2="${Y(m)}" stroke="${P.grid}" stroke-width="1"/>`);

  for (const b of input.venue.seatingBlocks ?? []) {
    const pts = sitzblockEcken(b).map((p) => `${X(p.x)},${Y(p.y)}`).join(' ');
    push(`<polygon points="${pts}" fill="${P.audience}" fill-opacity="0.12" stroke="${P.audience}" stroke-opacity="0.6" stroke-dasharray="6 4"/>`);
    if (b.label) {
      const c = sitzblockEcken(b).reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
      push(`<text x="${X(c.x)}" y="${Y(c.y)}" font-size="12" text-anchor="middle" fill="${P.audience}">${esc(b.label)}</text>`);
    }
  }
  for (const s of input.venue.stages) {
    push(`<rect x="${X(s.x)}" y="${Y(s.y)}" width="${f1(s.width * ppm)}" height="${f1(s.height * ppm)}" fill="${s.color ?? P.stage}" fill-opacity="0.22" stroke="${s.color ?? P.stage}" stroke-width="1.5"/>`);
    push(`<text x="${X(s.x + s.width / 2)}" y="${Y(s.y + s.height / 2) + 5}" font-size="14" font-weight="600" text-anchor="middle" fill="${P.text}">${esc(s.label)}</text>`);
  }
  for (const v of input.venue.videoWalls ?? []) {
    const [a, b] = videowandEnden(v);
    push(`<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="${P.video}" stroke-width="5" stroke-linecap="round"/>`);
  }
  for (const w of input.walls) {
    const glass = w.kind === 'glass';
    push(`<line x1="${X(w.x1)}" y1="${Y(w.y1)}" x2="${X(w.x2)}" y2="${Y(w.y2)}" stroke="${glass ? P.video : P.wall}" stroke-width="${f1(Math.max(2, (w.thicknessM ?? 0.15) * ppm))}" stroke-linecap="square"/>`);
  }

  const maxR = Math.max(vw, vh);
  input.cameras.forEach(({ cam, fovDeg }) => {
    if (!fovDeg) return;
    const p = effectiveCameraPos(cam);
    const r = Math.min(cam.focusDistance, maxR) * ppm;
    const a0 = ((cam.pan - fovDeg / 2) * Math.PI) / 180;
    const a1 = ((cam.pan + fovDeg / 2) * Math.PI) / 180;
    const cx = X(p.x);
    const cy = Y(p.y);
    const large = fovDeg > 180 ? 1 : 0;
    push(`<path d="M${cx},${cy} L${f1(cx + Math.cos(a0) * r)},${f1(cy + Math.sin(a0) * r)} A${f1(r)},${f1(r)} 0 ${large} 1 ${f1(cx + Math.cos(a1) * r)},${f1(cy + Math.sin(a1) * r)} Z" fill="${cam.color}" fill-opacity="0.14" stroke="${cam.color}" stroke-opacity="0.55"/>`);
  });

  input.cameras.forEach(({ cam }) => {
    const limits = rigLimits(cam);
    const weg = pathPolyline(limits);
    if (weg.length < 2) return;
    const pts = weg.map((q) => rigToPlan(cam, q));
    push(`<polyline points="${pts.map((q) => `${X(q.x)},${Y(q.y)}`).join(' ')}" fill="none" stroke="${cam.color}" stroke-width="3" stroke-dasharray="8 5" stroke-linecap="round"/>`);
    [pts[0], pts[pts.length - 1]].forEach((q, i) => {
      push(`<circle cx="${X(q.x)}" cy="${Y(q.y)}" r="9" fill="${cam.color}"/>`);
      push(`<text x="${X(q.x)}" y="${Y(q.y) + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="#FFFFFF">${i + 1}</text>`);
    });
    const mid = pts[Math.floor(pts.length / 2)];
    push(`<text x="${X(mid.x)}" y="${Y(mid.y) - 12}" font-size="12" text-anchor="middle" fill="${cam.color}">${pathLengthM(limits).toFixed(1)} m</text>`);
  });

  const animate = (camId: string, on: string, off: string) => {
    const cuts = input.cuts;
    if (!cuts?.length) return '';
    const total = Math.max(...cuts.map((c) => c.endS));
    if (!(total > 0)) return '';
    const keyTimes: string[] = ['0'];
    const values: string[] = [cuts[0].startS > 0 ? off : cuts[0].cameraId === camId ? on : off];
    for (const c of cuts) {
      keyTimes.push((c.startS / total).toFixed(5));
      values.push(c.cameraId === camId ? on : off);
    }
    return `<animate attributeName="opacity" dur="${total.toFixed(3)}s" repeatCount="indefinite" calcMode="discrete" keyTimes="${keyTimes.join(';')}" values="${values.join(';')}"/>`;
  };

  input.cameras.forEach(({ cam, optics, rig }, i) => {
    const p = effectiveCameraPos(cam);
    const sym = cameraSymbol(cam, i, input.numbering);
    const cx = X(p.x);
    const cy = Y(p.y);
    const a = (cam.pan * Math.PI) / 180;
    if (input.cuts?.length) {
      push(`<circle cx="${cx}" cy="${cy}" r="24" fill="none" stroke="${P.active}" stroke-width="5" opacity="0">${animate(cam.id, '1', '0')}</circle>`);
    }
    push(`<line x1="${cx}" y1="${cy}" x2="${f1(cx + Math.cos(a) * 26)}" y2="${f1(cy + Math.sin(a) * 26)}" stroke="${cam.color}" stroke-width="3"/>`);
    push(`<circle cx="${cx}" cy="${cy}" r="15" fill="${cam.color}" stroke="${P.sheet}" stroke-width="2"/>`);
    push(`<text x="${cx}" y="${cy + 5}" font-size="${sym.length > 2 ? 11 : 14}" font-weight="700" text-anchor="middle" fill="#FFFFFF">${esc(sym)}</text>`);
    if (input.labels) {
      const lx = cx + 20;
      push(`<text x="${lx}" y="${cy - 18}" font-size="12" font-weight="700" fill="${P.text}" paint-order="stroke" stroke="${P.sheet}" stroke-width="3">${esc(cam.label)}</text>`);
      push(`<text x="${lx}" y="${cy - 4}" font-size="11" fill="${P.dim}" paint-order="stroke" stroke="${P.sheet}" stroke-width="3">${esc(optics)}</text>`);
      push(`<text x="${lx}" y="${cy + 10}" font-size="11" fill="${P.dim}" paint-order="stroke" stroke="${P.sheet}" stroke-width="3">${esc(rig)}</text>`);
    }
  });

  const lx = ox + planMaxW + pad;
  push(`<text x="${lx}" y="${oy + 18}" font-size="16" font-weight="700" fill="${P.text}">${esc(input.texts.legend)}</text>`);
  input.cameras.forEach(({ cam, optics, rig }, i) => {
    const y = oy + 40 + i * legendRowH;
    const sym = cameraSymbol(cam, i, input.numbering);
    if (input.cuts?.length) push(`<rect x="${lx - 8}" y="${y - 4}" width="${legendW}" height="${legendRowH - 6}" rx="6" fill="${P.active}" fill-opacity="0.18" opacity="0">${animate(cam.id, '1', '0')}</rect>`);
    push(`<circle cx="${lx + 13}" cy="${y + 13}" r="13" fill="${cam.color}"/>`);
    push(`<text x="${lx + 13}" y="${y + 18}" font-size="${sym.length > 2 ? 10 : 13}" font-weight="700" text-anchor="middle" fill="#FFFFFF">${esc(sym)}</text>`);
    push(`<text x="${lx + 36}" y="${y + 12}" font-size="13" font-weight="700" fill="${P.text}">${esc(cam.label)}</text>`);
    if (input.labels) {
      push(`<text x="${lx + 36}" y="${y + 28}" font-size="11" fill="${P.dim}">${esc(optics)}</text>`);
      push(`<text x="${lx + 36}" y="${y + 43}" font-size="11" fill="${P.dim}">${esc(rig)}</text>`);
    }
  });

  if (input.cuts?.length) {
    const total = Math.max(...input.cuts.map((c) => c.endS));
    const ty = headH + bodyH + 24;
    const tw = W - pad * 2;
    const index = new Map(input.cameras.map((c, i) => [c.cam.id, i]));
    for (const c of input.cuts) {
      const i = index.get(c.cameraId);
      if (i === undefined || !(total > 0)) continue;
      const mc = input.cameras[i];
      const x0 = pad + (c.startS / total) * tw;
      const w = Math.max(1, ((c.endS - c.startS) / total) * tw);
      push(`<rect x="${f1(x0)}" y="${ty}" width="${f1(w)}" height="28" fill="${mc.cam.color}" fill-opacity="0.8"/>`);
      if (w > 14) push(`<text x="${f1(x0 + w / 2)}" y="${ty + 19}" font-size="12" font-weight="700" text-anchor="middle" fill="#FFFFFF">${esc(cameraSymbol(mc.cam, i, input.numbering))}</text>`);
    }
    if (total > 0) {
      push(`<line x1="${pad}" y1="${ty - 6}" x2="${pad}" y2="${ty + 34}" stroke="${P.active}" stroke-width="3"><animateTransform attributeName="transform" type="translate" from="0 0" to="${tw} 0" dur="${total.toFixed(3)}s" repeatCount="indefinite"/></line>`);
    }
  }

  const fy = H - footH + 8;
  const bar = scaleBarM(vw);
  push(`<line x1="${pad}" y1="${fy + 10}" x2="${f1(pad + bar * ppm)}" y2="${fy + 10}" stroke="${P.text}" stroke-width="3"/>`);
  push(`<line x1="${pad}" y1="${fy + 3}" x2="${pad}" y2="${fy + 17}" stroke="${P.text}" stroke-width="2"/>`);
  push(`<line x1="${f1(pad + bar * ppm)}" y1="${fy + 3}" x2="${f1(pad + bar * ppm)}" y2="${fy + 17}" stroke="${P.text}" stroke-width="2"/>`);
  push(`<text x="${f1(pad + bar * ppm + 10)}" y="${fy + 15}" font-size="12" fill="${P.text}">${bar} m · ${esc(input.texts.scale)}</text>`);
  push(`<text x="${pad}" y="${fy + 38}" font-size="11" fill="${P.dim}">${esc(input.texts.planSource)}</text>`);
  if (input.texts.stamp) push(`<text x="${W - pad}" y="${fy + 38}" font-size="11" text-anchor="end" fill="${P.dim}">${esc(input.texts.stamp)}</text>`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, Helvetica, Arial, sans-serif">${out.join('')}</svg>`;
  return { svg, width: W, height: H };
}

// ── Schnittliste ──

/** FCPXML-Zeit („1001/30000s", „12s") in Sekunden. */
export function fcpTime(v: string | null | undefined): number {
  if (!v) return 0;
  const m = /^\s*(-?\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?s?\s*$/.exec(v);
  if (!m) return 0;
  return Number(m[1]) / (m[2] ? Number(m[2]) : 1);
}

/** Timecode „hh:mm:ss:ff" oder „mm:ss" oder Sekunden. */
export function timecodeSeconds(v: string, fps = 25): number | null {
  const s = v.trim();
  if (/^\d+(?:[.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  const p = s.split(/[:;]/).map(Number);
  if (p.some((n) => !Number.isFinite(n))) return null;
  if (p.length === 4) return p[0] * 3600 + p[1] * 60 + p[2] + p[3] / fps;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Ordnet einen Clip-/Winkelnamen einer Kamera zu: Name, Nummer oder Buchstabe. */
export function matchCamera(name: string, cameras: Pick<VenueCamera, 'id' | 'label'>[], numbering: MapNumbering): string | null {
  const n = norm(name);
  if (!n) return null;
  const byLabel = cameras.find((c) => norm(c.label) === n) ?? cameras.find((c) => n.includes(norm(c.label)) && norm(c.label).length > 1);
  if (byLabel) return byLabel.id;
  const bySymbol = cameras.find((c, i) => norm(cameraSymbol(c, i, numbering)) === n.replace(/^(cam|camera|kamera)/, ''));
  return bySymbol?.id ?? null;
}

/** Einfache Liste: je Zeile „Startzeit Kamera" (Tab, Komma, Semikolon oder Leerzeichen). */
export function parseCutText(text: string, cameras: Pick<VenueCamera, 'id' | 'label'>[], numbering: MapNumbering, fps = 25): CutSegment[] {
  const marks: { at: number; id: string }[] = [];
  let ende: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([^\s,;]+)[\s,;]+(.+)$/.exec(line);
    if (!m) continue;
    const at = timecodeSeconds(m[1], fps);
    if (at === null) continue;
    if (/^(end|ende)$/i.test(m[2].trim())) { ende = at; continue; }
    const id = matchCamera(m[2], cameras, numbering);
    if (id) marks.push({ at, id });
  }
  marks.sort((a, b) => a.at - b.at);
  return marks.map((mk, i) => ({
    cameraId: mk.id,
    startS: mk.at,
    endS: marks[i + 1]?.at ?? ende ?? mk.at + 5,
  })).filter((c) => c.endS > c.startS);
}

const attrs = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
    out[m[1]] = m[2].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  return out;
};

/** Die Clips der Hauptspur einer FCPXML; Multicam-Clips nach ihrem aktiven Bildwinkel. */
export function parseFcpxmlCuts(xml: string, cameras: Pick<VenueCamera, 'id' | 'label'>[], numbering: MapNumbering): CutSegment[] {
  const angleNames = new Map<string, string>();
  for (const m of xml.matchAll(/<mc-angle\b([^>]*)>/g)) {
    const a = attrs(m[1]);
    if (a.angleID) angleNames.set(a.angleID, a.name ?? '');
  }
  const start = xml.search(/<spine\b[^>]*>/);
  if (start < 0) return [];
  const body = xml.slice(xml.indexOf('>', start) + 1);
  const clips: { tag: string; a: Record<string, string>; sources: Record<string, string>[] }[] = [];
  let depth = 0;
  for (const m of body.matchAll(/<(\/?)([\w-]+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, raw, self] = m;
    if (close) {
      depth--;
      if (depth < 0) break;
      continue;
    }
    if (depth === 0) clips.push({ tag, a: attrs(raw), sources: [] });
    else if (depth === 1 && tag === 'mc-source') clips[clips.length - 1]?.sources.push(attrs(raw));
    if (!self) depth++;
  }
  const out: CutSegment[] = [];
  for (const c of clips) {
    const from = fcpTime(c.a.offset);
    const to = from + fcpTime(c.a.duration);
    let name = c.a.name ?? '';
    if (c.tag === 'mc-clip') {
      const src = c.sources.find((q) => /video|all/.test(q.srcEnable ?? 'all'));
      if (src?.angleID && angleNames.has(src.angleID)) name = angleNames.get(src.angleID) as string;
    }
    const id = matchCamera(name, cameras, numbering);
    if (id && to > from) out.push({ cameraId: id, startS: from, endS: to });
  }
  const first = out[0]?.startS ?? 0;
  return out.map((c) => ({ ...c, startS: c.startS - first, endS: c.endS - first }));
}

// ── PDF ──

/** Ein PDF mit einer Seite, die ein JPEG ganz fuellt. */
export function pdfWithJpeg(jpeg: Uint8Array, widthPx: number, heightPx: number, title: string): Uint8Array {
  const pageW = 842;
  const pageH = Math.round((pageW * heightPx) / widthPx);
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const add = (b: Uint8Array) => { parts.push(b); len += b.length; };
  const str = (s: string) => add(enc.encode(s));
  const pdfText = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?');
  str('%PDF-1.4\n');
  const obj = (n: number, body: () => void) => { offsets[n] = len; str(`${n} 0 obj\n`); body(); str('\nendobj\n'); };
  obj(1, () => str('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => str('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => str(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => {
    str(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    add(jpeg);
    str('\nendstream');
  });
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  obj(5, () => str(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  obj(6, () => str(`<< /Title (${pdfText(title)}) /Producer (LZ Multicam Planner) >>`));
  const xref = len;
  str(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  str(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const outBytes = new Uint8Array(len);
  let at = 0;
  for (const p of parts) { outBytes.set(p, at); at += p.length; }
  return outBytes;
}
