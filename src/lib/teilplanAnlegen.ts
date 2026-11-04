// Teilplan anlegen: Planbild zuschneiden und als neues Projekt oeffnen (#248).
import { useStore } from '../store/useStore';
import { teilplanAus, teilplanZuschnitt, type Rahmen } from '../utils/teilplan';

function bildLaden(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fehler) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fehler(new Error('image'));
    img.src = src;
  });
}

/** false, wenn der Rahmen das Planbild nicht trifft. */
export async function teilplanAnlegen(r: Rahmen, name: string): Promise<boolean> {
  const s = useStore.getState();
  const plan = s.backgroundPlan;
  if (!plan) return false;
  const z = teilplanZuschnitt(plan, r);
  if (!z) return false;
  const img = await bildLaden(plan.dataUrl);
  const c = document.createElement('canvas');
  c.width = z.px.breite;
  c.height = z.px.hoehe;
  const ctx = c.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  // Das Bild kann kleiner gespeichert sein, als widthPx sagt (Kalibrierung
  // rechnet in Planpixeln) — auf dessen echte Groesse umrechnen.
  const fx = img.naturalWidth / plan.widthPx;
  const fy = img.naturalHeight / plan.heightPx;
  ctx.drawImage(img, z.px.x * fx, z.px.y * fy, z.px.breite * fx, z.px.hoehe * fy, 0, 0, c.width, c.height);
  s.teilplanOeffnen(teilplanAus({ venue: s.venue, walls: s.walls, persons: s.persons, backgroundPlan: plan }, r, z, c.toDataURL('image/png'), name));
  return true;
}
