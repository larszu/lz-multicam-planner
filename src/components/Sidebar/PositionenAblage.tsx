import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { CAMERAS, getCameraById } from '../../data/cameras';
import { LENSES, getLensById } from '../../data/lenses';
import { libraryCameras, libraryLenses } from '../../library/registry';
import { aufloesen, positionenAlsText, positionenLesen, type PositionsFormat } from '../../utils/kameraPositionen';
import { MOUNT_TYPE_LABELS, type CameraMountType } from '../../types';
import { mountTypeLabel } from '../../i18n/mount';
import { useTranslation, format } from '../../i18n';
import { Note } from './fields';

const RIG_TYPEN = Object.keys(MOUNT_TYPE_LABELS) as CameraMountType[];

/** Alle Kamerapositionen in die Zwischenablage und zurueck (#232). */
export default function PositionenAblage() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [meldung, setMeldung] = useState<string | null>(null);

  const kopf = [
    t('positions.col.name', 'Name'),
    t('positions.col.x', 'X (m)'),
    t('positions.col.y', 'Y (m)'),
    t('positions.col.height', 'Height (m)'),
    t('positions.col.camera', 'Camera'),
    t('positions.col.lens', 'Lens'),
    t('positions.col.focal', 'Focal length (mm)'),
    t('positions.col.rig', 'Rig'),
  ];

  const kopieren = async (fmt: PositionsFormat) => {
    const { cameras, customCameras, customLenses } = useStore.getState();
    const zeilen = cameras.map((c) => {
      const camDef = getCameraById(c.cameraId, customCameras);
      const lens = getLensById(c.lensId) ?? customLenses.find((l) => l.id === c.lensId);
      return {
        name: c.label,
        x: c.x,
        y: c.y,
        z: c.z,
        camera: camDef ? `${camDef.manufacturer} ${camDef.model}` : '',
        lens: lens ? `${lens.manufacturer} ${lens.model}` : '',
        focalLength: c.focalLength,
        rig: mountTypeLabel(t, c.mountType ?? 'tripod'),
      };
    });
    const out = positionenAlsText(zeilen, fmt, kopf);
    try {
      await navigator.clipboard.writeText(out);
      setMeldung(format(t('positions.copied', 'Copied: {n} positions'), { n: zeilen.length }));
    } catch {
      setText(out);
      setMeldung(t('positions.copyManual', 'The clipboard is not available — copy the text from the field.'));
    }
  };

  const einlesen = () => {
    const zeilen = positionenLesen(text);
    if (zeilen.length === 0) {
      setMeldung(t('positions.none', 'No positions found. Expected: name, X, Y, height — as text, Markdown or CSV.'));
      return;
    }
    const { customCameras, customLenses, positionenUebernehmen } = useStore.getState();
    const katalog = {
      cameras: [...customCameras, ...CAMERAS, ...libraryCameras()],
      lenses: [...customLenses, ...LENSES, ...libraryLenses()],
      rigTypen: RIG_TYPEN,
      rigNamen: (r: CameraMountType) => [MOUNT_TYPE_LABELS[r], mountTypeLabel(t, r)],
    };
    const { updated, added } = positionenUebernehmen(zeilen.map((z) => aufloesen(z, katalog)));
    setMeldung(format(t('positions.applied', 'Moved: {u} · added: {a}'), { u: updated, a: added }));
    setText('');
  };

  return (
    <div className="mb-2 space-y-1.5 rounded-bc-l border border-bc-border bg-bc-panel text-xs" style={{ padding: '8px' }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-bc-muted">{t('positions.copy', 'Copy positions')}</span>
        <div className="bc-seg bc-seg-kompakt" role="group" aria-label={t('positions.copy', 'Copy positions')}>
          {([
            ['text', t('positions.fmt.text', 'Text')],
            ['markdown', t('positions.fmt.markdown', 'Markdown')],
            ['csv', t('positions.fmt.csv', 'CSV')],
          ] as [PositionsFormat, string][]).map(([f, label]) => (
            <button key={f} type="button" className="px-3 text-[11px] font-medium" onClick={() => void kopieren(f)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        className="block min-h-[3.5rem] w-full resize-y border border-bc-border bg-bc-panel-raised font-mono text-[11px] text-bc-text-bright"
        style={{ padding: '4px 6px' }}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('positions.pastePh', 'Paste positions here (text, Markdown or CSV)')}
        aria-label={t('positions.paste.aria', 'Positions to read in')}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={einlesen}
          disabled={!text.trim()}
          style={{ padding: '4px 10px' }}
          className="rounded-bc-full bg-bc-accent text-[11px] font-semibold text-bc-accent-text hover:bg-bc-accent/80 disabled:opacity-40"
        >
          {t('positions.apply', 'Read in positions')}
        </button>
        <span className="text-[10px] text-bc-dim">{t('positions.applyHint', 'Same name moves the camera, a new name adds one.')}</span>
      </div>
      {meldung && <Note tone="info">{meldung}</Note>}
    </div>
  );
}
