// Art der Wand und ihre Türen und Fenster (#248).
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { useTranslation } from '../../i18n';
import type { Wall } from '../../types';
import { neueOeffnung } from '../../utils/wallOpenings';
import { Zahl } from './fields';

type Oeffnung = NonNullable<Wall['openings']>[number];

export function WandOeffnungen({ wall, onChange }: { wall: Wall; onChange: (u: Partial<Wall>) => void }) {
  const { t } = useTranslation();
  const liste = wall.openings ?? [];
  const laenge = Math.round(Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) * 100) / 100;
  const setze = (i: number, u: Partial<Oeffnung>) => onChange({ openings: liste.map((o, k) => (k === i ? { ...o, ...u } : o)) });
  const artName = (k: Oeffnung['kind']) =>
    k === 'door' ? t('sidebar.opening.door', 'Door') : k === 'window' ? t('sidebar.opening.window', 'Window') : t('sidebar.opening.opening', 'Opening');

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <div className="bc-seg bc-seg-kompakt" role="group" aria-label={t('sidebar.wallKind', 'Wall type')}>
          {([['wall', t('sidebar.wallKind.wall', 'Wall')], ['glass', t('sidebar.wallKind.glass', 'Glass')]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={(wall.kind ?? 'wall') === k}
              onClick={() => onChange({ kind: k === 'glass' ? 'glass' : undefined })}
              className="px-2 text-[10px] font-medium"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange({ openings: [...liste, neueOeffnung(wall, 'door')] })}
          className="ml-auto flex items-center gap-0.5 px-1.5 py-0.5 border border-bc-border text-bc-muted hover:text-bc-accent hover:border-bc-accent text-[10px]"
        >
          <FiPlus size={10} /> {t('sidebar.opening.door', 'Door')}
        </button>
        <button
          type="button"
          onClick={() => onChange({ openings: [...liste, neueOeffnung(wall, 'window')] })}
          className="flex items-center gap-0.5 px-1.5 py-0.5 border border-bc-border text-bc-muted hover:text-bc-accent hover:border-bc-accent text-[10px]"
        >
          <FiPlus size={10} /> {t('sidebar.opening.window', 'Window')}
        </button>
      </div>
      {liste.map((o, i) => (
        <div key={i} className="border border-bc-border p-1 space-y-1">
          <div className="flex items-center gap-1 text-[10px]">
            <select
              className="flex-1 bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[10px]"
              value={o.kind ?? 'opening'}
              aria-label={t('sidebar.opening.kind', 'Kind of opening')}
              onChange={(e) => setze(i, { kind: e.target.value as Oeffnung['kind'] })}
            >
              {(['door', 'window', 'opening'] as const).map((k) => <option key={k} value={k}>{artName(k)}</option>)}
            </select>
            <button
              type="button"
              onClick={() => onChange({ openings: liste.filter((_, k) => k !== i) })}
              className="p-0.5 hover:text-bc-red-text"
              title={t('sidebar.opening.remove', 'Remove opening')}
              aria-label={t('sidebar.opening.remove', 'Remove opening')}
            >
              <FiTrash2 size={10} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            <Zahl label={t('sidebar.opening.from', 'From m')} title={t('sidebar.opening.from.title', 'Distance from the wall start')} value={Math.round(o.offset * 100) / 100} step={0.1} min={0} max={laenge} onChange={(v) => setze(i, { offset: v })} />
            <Zahl label={t('sidebar.opening.width', 'Width m')} value={Math.round(o.width * 100) / 100} step={0.1} min={0.1} max={laenge} onChange={(v) => setze(i, { width: v })} />
            <Zahl label={t('sidebar.opening.bottom', 'Sill m')} title={t('sidebar.opening.bottom.title', 'Lower edge above the floor — 0 for a door')} value={o.bottom} step={0.1} min={0} max={20} onChange={(v) => setze(i, { bottom: v })} />
            <Zahl label={t('sidebar.opening.top', 'Top m')} title={t('sidebar.opening.top.title', 'Upper edge above the floor')} value={o.top} step={0.1} min={0.1} max={20} onChange={(v) => setze(i, { top: v })} />
          </div>
        </div>
      ))}
    </div>
  );
}
