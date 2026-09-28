// ───────────────────────────────────────────────────────────────────────────
// Grundriss laden — per Auswahl-Dialog UND per Drag & Drop, ein Weg.
//
// Den Lader selbst stellt `@avplan/floorplan` (ADR-015, Kopie unter
// `src/avplan/floorplan/`). Bis 2026-09-28 stand hier in der Sidebar ein
// eigener: er las Bilder unverkleinert als data:-URL ein (ein
// 12-Megapixel-Foto landete so in voller Groesse im Projekt und in der
// Wiederherstellungskopie) und renderte PDFs fest mit Faktor 2, egal wie
// gross die Seite war. Das Paket begrenzt beides auf 3000 px Kantenlaenge.
//
// Hier steht nur, was MultiCam dazutut: pdf.js mit gesetztem Worker
// hereinreichen, das Ergebnis als `BackgroundPlan` formen (Meter je Pixel
// aus der Venue-Breite, wie bisher) und Fehler in der Sprache des Nutzers
// melden. Sidebar-Upload und die Ablage auf dem 2D-Plan rufen beide `lade`
// — damit ein Plan, der gezogen wird, genau so ankommt wie einer, der
// gewaehlt wird.
// ───────────────────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ladePlanDatei,
  pdfjsRenderer,
  PlanDateiFehler,
  PLAN_BILD_MAX_BYTES,
  istPdfDatei,
  type GeladenerPlan,
  type PdfjsModul,
  type PdfSeitenRenderer,
} from '../avplan/floorplan';
import { useStore } from '../store/useStore';
import { useTranslation, format } from '../i18n';
import type { BackgroundPlan } from '../types';

let renderer: PdfSeitenRenderer | null = null;

/** pdf.js als Seiten-Renderer, Worker einmal gesetzt. Der alte Lader gab noch
 *  `isEvalSupported: false` mit (per Cast) — pdf.js 6 kennt die Option nicht
 *  mehr, weil es fuer Schriften kein eval mehr nutzt; sie wirkte also nicht. */
function pdfRenderer(): PdfSeitenRenderer {
  if (renderer) return renderer;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const modul: PdfjsModul = {
    getDocument: (src) =>
      pdfjsLib.getDocument({ data: src.data }) as unknown as ReturnType<PdfjsModul['getDocument']>,
  };
  renderer = pdfjsRenderer(modul);
  return renderer;
}

/** Geladener Plan → MultiCams `BackgroundPlan`. Der Plan bekommt die Breite
 *  des Venues; Meter je Pixel gilt fuer beide Achsen gleich, bis jemand
 *  kalibriert. */
export function alsHintergrundPlan(plan: GeladenerPlan, venueBreiteM: number): BackgroundPlan {
  const s = venueBreiteM / plan.naturalWidth;
  return {
    dataUrl: plan.src,
    scaleX: s,
    scaleY: s,
    offsetX: 0,
    offsetY: 0,
    opacity: 0.3,
    widthPx: plan.naturalWidth,
    heightPx: plan.naturalHeight,
  };
}

export function usePlanLaden() {
  const { t } = useTranslation();
  const venueBreiteM = useStore((s) => s.venue.widthM);
  const setBackgroundPlan = useStore((s) => s.setBackgroundPlan);

  const meldeUngeeignet = useCallback(
    (dateien: File[]) => {
      const namen = dateien.map((f) => f.name).join(', ');
      alert(
        format(
          t('sidebar.planDrop.unsuitable', '"{name}" cannot be used as a floor plan. Drop an image (PNG, JPEG, WebP …) or a PDF.'),
          { name: namen || '?' },
        ),
      );
    },
    [t],
  );

  const lade = useCallback(
    async (datei: File) => {
      try {
        const plan = await ladePlanDatei(datei, { pdf: pdfRenderer() });
        setBackgroundPlan(alsHintergrundPlan(plan, venueBreiteM));
      } catch (err) {
        if (err instanceof PlanDateiFehler) {
          const mb = (datei.size / 1024 / 1024).toFixed(1);
          if (err.code === 'typ' || err.code === 'pdf-nicht-verfuegbar') {
            meldeUngeeignet([datei]);
          } else if (err.code === 'zu-gross') {
            alert(
              istPdfDatei(datei)
                ? format(t('sidebar.pdfTooLarge', 'PDF too large ({size} MB). Maximum is 50 MB.'), { size: mb })
                : format(t('sidebar.imageTooLarge', 'Image too large ({size} MB). Maximum is {max} MB.'), {
                    size: mb,
                    max: Math.round(PLAN_BILD_MAX_BYTES / 1024 / 1024),
                  }),
            );
          } else if (err.code === 'pdf') {
            alert(format(t('sidebar.pdfRenderFailed', 'Failed to render PDF: {msg}'), { msg: err.message }));
          } else {
            alert(format(t('sidebar.imageReadFailed', 'The image "{name}" could not be read.'), { name: datei.name }));
          }
          return;
        }
        const msg = err instanceof Error ? err.message : t('sidebar.unknownError', 'Unknown error');
        alert(format(t('sidebar.pdfRenderFailed', 'Failed to render PDF: {msg}'), { msg }));
      }
    },
    [meldeUngeeignet, setBackgroundPlan, t, venueBreiteM],
  );

  return { lade, meldeUngeeignet };
}

