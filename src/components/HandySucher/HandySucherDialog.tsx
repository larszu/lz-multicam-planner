import { useEffect, useMemo, useState } from 'react';
import { FiCopy, FiX } from 'react-icons/fi';
import { encode } from 'uqr';
import { useStore } from '../../store/useStore';
import { libraryLenses } from '../../library/registry';
import { getLensById } from '../../data/lenses';
import { format, useTranslation } from '../../i18n';
import { QR_GRENZE, paketBauen, paketKodieren, rueckAnwenden, rueckCodeLesen, sucherLink } from '../../utils/handySucher';

function QrBild({ text, label }: { text: string; label: string }) {
  const svg = useMemo(() => {
    const qr = encode(text, { ecc: 'L', border: 2 });
    let pfad = '';
    qr.data.forEach((zeile, y) => zeile.forEach((an, x) => { if (an) pfad += `M${x} ${y}h1v1h-1z`; }));
    return { pfad, groesse: qr.size };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${svg.groesse} ${svg.groesse}`} role="img" aria-label={label} className="mx-auto block aspect-square w-full max-w-[320px] rounded-bc-m" shapeRendering="crispEdges" data-qr>
      <rect width={svg.groesse} height={svg.groesse} fill="#fff" />
      <path d={svg.pfad} fill="#000" />
    </svg>
  );
}

/**
 * Plan → Handy und zurueck (#237): QR-Code und Link zur Handy-Ansicht, Feld
 * fuer den Austauschcode, den das Handy zurueckgibt.
 */
export default function HandySucherDialog({ camId, onClose }: { camId: string; onClose: () => void }) {
  const { t, language } = useTranslation();
  const cameras = useStore((s) => s.cameras);
  const customCameras = useStore((s) => s.customCameras);
  const customLenses = useStore((s) => s.customLenses);
  const favoriten = useStore((s) => s.favoriteLensIds);
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<{ text: string; nurEine: boolean; gekuerzt: boolean } | null>(null);
  const [eingabe, setEingabe] = useState('');
  const [erledigt, setErledigt] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  useEffect(() => {
    let weg = false;
    const kat = { customCameras, customLenses, bibliothek: libraryLenses(), favoriten };
    const ort = typeof window === 'undefined' ? null : window.location;
    void (async () => {
      const voll = sucherLink(await paketKodieren(paketBauen(cameras, kat, language, camId)), ort);
      let qr = { text: voll, nurEine: false, gekuerzt: false };
      const stufen: { nur?: string; maxSet?: number }[] = [{ maxSet: 12 }, { nur: camId }, { nur: camId, maxSet: 12 }, { nur: camId, maxSet: 4 }];
      for (const opt of stufen) {
        if (qr.text.length <= QR_GRENZE) break;
        qr = { text: sucherLink(await paketKodieren(paketBauen(cameras, kat, language, camId, opt)), ort), nurEine: !!opt.nur, gekuerzt: !!opt.maxSet };
      }
      if (!weg) { setLink(voll); setQr(qr); }
    })();
    return () => { weg = true; };
  }, [cameras, customCameras, customLenses, favoriten, language, camId]);

  const rueck = rueckCodeLesen(eingabe);
  const ziel = rueck ? cameras.find((c) => c.id === rueck.cam) : undefined;
  const zielLens = rueck ? getLensById(rueck.lens, customLenses) ?? libraryLenses().find((l) => l.id === rueck.lens) : undefined;
  const uebernehmen = () => {
    if (!rueck || !ziel) return;
    useStore.getState().updateCamera(ziel.id, rueckAnwenden(ziel, rueck, zielLens));
    setErledigt(ziel.label);
    setEingabe('');
  };
  const nummer = ziel ? cameras.findIndex((c) => c.id === ziel.id) + 1 : 0;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-bc-scrim p-4">
      <div role="dialog" aria-modal="true" aria-label={t('handy.dialog', 'Phone as viewfinder')} className="bc-dialog flex max-h-full w-full max-w-[520px] flex-col overflow-y-auto">
        <div className="bc-panel-head justify-between">
          <span className="text-lg font-bold text-bc-text-bright">{t('handy.dialog', 'Phone as viewfinder')}</span>
          <button type="button" onClick={onClose} className="grid place-items-center rounded-bc-full text-bc-muted hover:bg-bc-hover hover:text-bc-text-bright" aria-label={t('library.close', 'Close')}>
            <FiX size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-3 px-5 pb-5 pt-2 text-xs text-bc-text">
          <p>{t('handy.dialogHint', 'Scan the code with the phone at the location. It shows the frame of each camera over the live picture — no app, no account; everything travels in the link.')}</p>
          {qr ? <QrBild text={qr.text} label={t('handy.qr', 'QR code for the phone')} /> : <div className="mx-auto aspect-square w-full max-w-[320px] rounded-bc-m bg-bc-sunken" />}
          {qr?.nurEine && <p className="text-bc-yellow-text">{t('handy.qrOnlyOne', 'The QR code carries only this camera (the whole project is too large for it). The link carries all cameras.')}</p>}
          {qr?.gekuerzt && !qr.nurEine && <p className="text-bc-yellow-text">{t('handy.qrShortened', 'The QR code carries shortened lens sets (the lenses around the current one). The link carries all.')}</p>}
          {link && (
            <div className="flex items-center gap-2">
              <input readOnly value={link} aria-label={t('handy.link', 'Link for the phone')} className="min-w-0 flex-1 rounded-bc-m border border-bc-border bg-bc-panel-raised px-2 py-1.5 text-bc-text-bright" onFocus={(e) => e.target.select()} />
              <button type="button" onClick={() => void navigator.clipboard?.writeText(link)} className="bc-btn-soft flex items-center gap-1 px-3 py-1.5"><FiCopy size={14} /> {t('handy.copy', 'Copy')}</button>
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-bc-text-bright">{t('handy.pasteCode', 'Exchange code from the phone')}</span>
            <textarea
              value={eingabe}
              onChange={(e) => { setEingabe(e.target.value); setErledigt(null); }}
              rows={3}
              placeholder="MCV1.…"
              className="rounded-bc-m border border-bc-border bg-bc-panel-raised px-2 py-1.5 font-mono text-bc-text-bright"
            />
          </label>
          {eingabe.trim() !== '' && !rueck && <p className="text-bc-red-text">{t('handy.codeInvalid', 'That is not an exchange code from the phone viewfinder.')}</p>}
          {rueck && !ziel && <p className="text-bc-red-text">{t('handy.codeNoCamera', 'The camera of this code is not in the project any more.')}</p>}
          {rueck && ziel && (
            <p className="text-bc-text">
              {format(t('handy.codePreview', '{n} · {cam}: {lens}, {f} mm, height {z} m, tilt {tilt}, pan {pan}'), {
                n: nummer,
                cam: ziel.label,
                lens: zielLens ? `${zielLens.manufacturer} ${zielLens.model}` : t('handy.lensUnknown', 'lens unknown — stays as it is'),
                f: rueck.f.toFixed(1),
                z: rueck.z?.toFixed(2) ?? '–',
                tilt: rueck.tilt !== undefined ? `${rueck.tilt.toFixed(1)}°` : '–',
                pan: rueck.pan !== undefined ? `${rueck.pan.toFixed(1)}°` : '–',
              })}
              {rueck.notiz ? ` · „${rueck.notiz}“` : ''}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button type="button" disabled={!rueck || !ziel} onClick={uebernehmen} className="bc-btn-primary px-3 py-1.5">{t('handy.apply', 'Apply to the camera')}</button>
            {erledigt && <span className="text-bc-green-text" role="status">{format(t('handy.applied', '{cam} updated. Move it in the 2D plan to where you stood.'), { cam: erledigt })}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
