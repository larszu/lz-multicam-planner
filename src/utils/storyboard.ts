// Storyboard-Export (#62 Punkt 5).
//
// Zwei Ausgabewege, beide ohne zusaetzliche Abhaengigkeit:
//   • PNG-Kontaktbogen  — auf einem Canvas gezeichnet, direkt herunterladbar.
//   • Druck/PDF         — HTML in einem iframe, der native Druckdialog macht
//                         daraus "Als PDF sichern". Spart eine PDF-Library.
import type { Shot, Shotlist } from '../types';
import { TRANSITION_LABEL, transitionSeconds } from './cameraTransition';
import { stampLine, type DocumentStamp } from './documentStamp';

/** Kachel-Geometrie des Kontaktbogens in Pixeln. */
const TILE_W = 480;
const THUMB_H = 270; // 16:9
const TEXT_H = 96;
const TILE_H = THUMB_H + TEXT_H;
const GAP = 16;
const PAD = 28;
const HEADER_H = 64;
const MAX_COLS = 3;

/** Tatsaechliche Spaltenzahl: bei 1–2 Shots schmaler, damit rechts keine tote
 *  Flaeche steht. Ab 3 Shots immer 3 Spalten. */
export function sheetColumns(shotCount: number): number {
  return Math.max(1, Math.min(MAX_COLS, shotCount || 1));
}

/** Kurzbeschreibung der Optik einer Kachel, z. B. "35mm · f/2.8 · 4.2m". */
export function shotOpticsLabel(shot: Shot): string {
  const { focalLength, aperture, focusDistance } = shot.state;
  return `${Math.round(focalLength)}mm · f/${aperture.toFixed(1)} · ${focusDistance.toFixed(1)}m`;
}

/** Montage und Objektivhoehe einer Kachel, z. B. "H 1.60m · Tripod" (#228). */
export function shotStandLabel(shot: Shot, rig?: string): string {
  return `H ${shot.state.z.toFixed(2)}m${rig ? ` · ${rig}` : ''}`;
}

/** Montage je Shot, vom Aufrufer aus der Kamera aufgeloest. */
export type RigOf = (shot: Shot) => string | undefined;

/** Badge-Text der Fahrtdauer, z. B. "Schnell (3s)" bzw. "OFF". */
export function shotTransitionLabel(shot: Shot): string {
  const secs = transitionSeconds(shot.transition, shot.transitionSeconds);
  const name = TRANSITION_LABEL[shot.transition];
  return secs > 0 ? `${name} (${secs}s)` : name;
}

/** Gesamthoehe des Bogens fuer n Shots — auch fuer Tests nutzbar. */
export function contactSheetSize(shotCount: number): { width: number; height: number } {
  const cols = sheetColumns(shotCount);
  const rows = Math.max(1, Math.ceil(shotCount / cols));
  return {
    width: PAD * 2 + cols * TILE_W + (cols - 1) * GAP,
    height: PAD * 2 + HEADER_H + rows * TILE_H + (rows - 1) * GAP,
  };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Text auf `maxWidth` kuerzen und mit Ellipse versehen. */
function clip(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * Zeichnet den Kontaktbogen und liefert den Canvas. Jede Kachel zeigt
 * Shot-Nummer, Framegrab, Name, Optik-Daten, Fahrtdauer und Notiz.
 */
export async function renderStoryboardSheet(
  shotlist: Shotlist,
  venueName?: string,
  stamp?: DocumentStamp,
  rigOf?: RigOf,
): Promise<HTMLCanvasElement> {
  const { shots } = shotlist;
  const { width, height } = contactSheetSize(shots.length);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Hintergrund
  ctx.fillStyle = '#0f1115';
  ctx.fillRect(0, 0, width, height);

  // Kopfzeile
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(shotlist.name || 'Shotlist', PAD, PAD);
  ctx.fillStyle = '#8b93a3';
  ctx.font = '15px system-ui, sans-serif';
  const sub = [venueName, `${shots.length} Shot${shots.length === 1 ? '' : 's'}`]
    .filter(Boolean)
    .join(' · ');
  ctx.fillText(sub, PAD, PAD + 32);
  // Stand-Angabe rechts in der Kopfzeile (ADR-004). Rechtsbuendig, damit sie
  // dem Titel nicht in die Quere kommt, wenn der Shotlist-Name lang ist.
  if (stamp) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6f7787';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(stampLine(stamp), width - PAD, PAD + 34);
    ctx.textAlign = 'left';
  }

  // Bilder parallel laden, damit der Bogen nicht seriell auf jedes wartet.
  const images = await Promise.all(shots.map((s) => (s.thumbnail ? loadImage(s.thumbnail) : null)));

  const cols = sheetColumns(shots.length);
  shots.forEach((shot, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (TILE_W + GAP);
    const y = PAD + HEADER_H + row * (TILE_H + GAP);

    // Kachel-Grund
    ctx.fillStyle = '#171a21';
    ctx.fillRect(x, y, TILE_W, TILE_H);

    // Framegrab (oder Platzhalter)
    const img = images[i];
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, TILE_W, THUMB_H);
    if (img) {
      // Einpassen ohne Verzerrung (contain).
      const scale = Math.min(TILE_W / img.width, THUMB_H / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, x + (TILE_W - w) / 2, y + (THUMB_H - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#3a414f';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('kein Framegrab', x + TILE_W / 2, y + THUMB_H / 2 - 7);
      ctx.textAlign = 'left';
    }

    // Shot-Nummer als Badge oben links
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(x + 10, y + 10, 42, 26);
    ctx.fillStyle = '#ffd479';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(String(i + 1).padStart(2, '0'), x + 19, y + 15);

    // Textblock
    let ty = y + THUMB_H + 12;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(clip(ctx, shot.name || `Shot ${i + 1}`, TILE_W - 24), x + 12, ty);

    ty += 24;
    ctx.fillStyle = '#8b93a3';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(clip(ctx, shotOpticsLabel(shot), TILE_W - 24), x + 12, ty);

    ty += 21;
    ctx.fillStyle = '#6f7787';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(clip(ctx, `Fahrt: ${shotTransitionLabel(shot)} · ${shotStandLabel(shot, rigOf?.(shot))}`, TILE_W - 24), x + 12, ty);

    if (shot.note) {
      ty += 20;
      ctx.fillStyle = '#9aa3b2';
      ctx.font = 'italic 13px system-ui, sans-serif';
      ctx.fillText(clip(ctx, shot.note, TILE_W - 24), x + 12, ty);
    }
  });

  return canvas;
}

/** Loest den Download des Kontaktbogens als PNG aus. */
export async function exportStoryboardPng(
  shotlist: Shotlist,
  venueName?: string,
  stamp?: DocumentStamp,
  rigOf?: RigOf,
): Promise<void> {
  const canvas = await renderStoryboardSheet(shotlist, venueName, stamp, rigOf);
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  const safe = (shotlist.name || 'shotlist').replace(/[^\w-]+/g, '_');
  a.href = url;
  a.download = `storyboard_${safe}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * HTML-Maskierung fuer die Druckansichten.
 *
 * Exportiert, weil `shiftReport.ts` dasselbe braucht (Bedarf 50). Eine zweite
 * Maskierung waere die zweite Wahrheit, an der genau ein Zeichen fehlt — und
 * das faellt erst auf, wenn ein Kameraname ein `&` traegt.
 */
export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

/** Druckbares Storyboard-HTML (A4 quer, 2 Spalten). */
export function buildStoryboardHtml(
  shotlist: Shotlist,
  venueName?: string,
  stamp?: DocumentStamp,
  rigOf?: RigOf,
): string {
  const tiles = shotlist.shots
    .map((shot, i) => {
      const img = shot.thumbnail
        ? `<img src="${shot.thumbnail}" alt="" />`
        : '<div class="ph">kein Framegrab</div>';
      const note = shot.note ? `<div class="note">${esc(shot.note)}</div>` : '';
      return `<figure class="tile">
  <div class="thumb">${img}<span class="num">${String(i + 1).padStart(2, '0')}</span></div>
  <figcaption>
    <div class="name">${esc(shot.name || `Shot ${i + 1}`)}</div>
    <div class="meta">${esc(shotOpticsLabel(shot))}</div>
    <div class="meta dim">Fahrt: ${esc(shotTransitionLabel(shot))} · ${esc(shotStandLabel(shot, rigOf?.(shot)))}</div>
    ${note}
  </figcaption>
</figure>`;
    })
    .join('\n');

  const sub = [venueName, `${shotlist.shots.length} Shots`]
    .filter((v): v is string => !!v)
    .map(esc)
    .join(' · ');

  return `<!doctype html><html lang="de"><head><meta charset="utf-8" />
<title>Storyboard – ${esc(shotlist.name || 'Shotlist')}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; margin: 0; color: #111; }
  h1 { font-size: 18pt; margin: 0 0 2mm; }
  .sub { color: #666; font-size: 10pt; margin-bottom: 6mm; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .tile { margin: 0; break-inside: avoid; border: 0.3mm solid #ccc; border-radius: 2mm; overflow: hidden; }
  .thumb { position: relative; background: #000; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; }
  .thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .ph { color: #666; font-size: 9pt; }
  .num { position: absolute; top: 2mm; left: 2mm; background: rgba(0,0,0,.7); color: #ffd479; font-weight: 700; font-size: 9pt; padding: 0.5mm 2mm; border-radius: 1mm; }
  figcaption { padding: 2.5mm 3mm 3mm; }
  .name { font-weight: 700; font-size: 11pt; }
  .meta { color: #555; font-size: 9pt; margin-top: 0.8mm; }
  .meta.dim { color: #888; }
  .note { font-style: italic; color: #444; font-size: 9pt; margin-top: 1.2mm; }
  /* Der Stempel steht auf JEDER Seite: ein Storyboard wird auseinandergerissen
     und einzeln verteilt, und ein Blatt ohne Stand ist genau das Blatt, dessen
     Alter niemand kennt. Ein fixiertes Element wird in einem @page-Kontext
     pro Seite wiederholt. (Keine Backticks in diesem Kommentar: er steht in
     einem Template-Literal und würde es beenden.) */
  .stamp { position: fixed; bottom: 0; left: 0; right: 0; color: #888; font-size: 8pt; }
</style></head><body>
${stamp ? `<div class="stamp">${esc(stampLine(stamp))}</div>` : ''}
<h1>${esc(shotlist.name || 'Shotlist')}</h1>
<div class="sub">${sub}</div>
<div class="grid">
${tiles}
</div>
</body></html>`;
}

/**
 * Oeffnet den nativen Druckdialog mit dem Storyboard ("Als PDF sichern").
 * Laeuft ueber ein verstecktes iframe, damit kein Popup-Blocker zuschlaegt.
 */
/**
 * Ein HTML-Dokument drucken.
 *
 * EINE Stelle, die weiss, wie hier gedruckt wird — der unsichtbare Rahmen,
 * das Warten auf die eingebetteten Bilder, das Aufraeumen danach. Vorher
 * stand das nur im Storyboard; `shiftReport.ts` braucht es genauso
 * (Bedarf 50), und eine zweite Kopie liefe bei der naechsten Chrome-Eigenart
 * auseinander. Der Kommentar zum Warten stammt aus der Storyboard-Fassung
 * und gilt unveraendert: ohne ihn druckt Chrome die data-URL-Bilder leer.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const fire = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      /* Druck abgebrochen */
    }
    // Erst nach dem Dialog aufraeumen; 1 s deckt den Sync-Print-Fall ab.
    window.setTimeout(() => frame.remove(), 1000);
  };

  // Auf die eingebetteten data-URL-Bilder warten, sonst druckt Chrome leer.
  if (frame.contentWindow?.document.readyState === 'complete') fire();
  else frame.onload = fire;
}

export function printStoryboard(shotlist: Shotlist, venueName?: string, stamp?: DocumentStamp, rigOf?: RigOf): void {
  printHtml(buildStoryboardHtml(shotlist, venueName, stamp, rigOf));
}
