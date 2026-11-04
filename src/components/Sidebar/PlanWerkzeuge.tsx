// Grundriss: Quelle und Massstab, Feststellen, Drehen, DXF-Ebenen (#223).
import { useState } from 'react';
import { FiLock, FiRotateCcw, FiRotateCw, FiUnlock } from 'react-icons/fi';
import type { BackgroundPlan } from '../../types';
import { useTranslation, format } from '../../i18n';
import { useStore } from '../../store/useStore';
import { dxfEbenen, drehePlan, planMitEbenen } from '../../lib/planBearbeiten';
import { planMassstabText } from '../../utils/cameraMap';

type Props = { plan: BackgroundPlan; onChange: (p: BackgroundPlan) => void };

const knopf = 'flex items-center justify-center gap-1 px-2 py-1 text-[10px] border border-bc-border bg-bc-panel-raised text-bc-muted hover:text-bc-text-bright disabled:opacity-40';

export function PlanQuelleZeile({ plan, onChange }: Props) {
  const { t } = useTranslation();
  const setPlanAusrichten = useStore((s) => s.setPlanAusrichten);
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 min-w-0 truncate text-[10px] text-bc-dim" title={plan.sourceName}>
        {[plan.sourceName, planMassstabText(plan)].filter(Boolean).join(' · ')}
      </span>
      <button
        type="button"
        aria-pressed={!!plan.locked}
        onClick={() => {
          if (!plan.locked) setPlanAusrichten(false);
          onChange({ ...plan, locked: plan.locked ? undefined : true });
        }}
        title={plan.locked
          ? t('sidebar.plan.unlock.title', 'Unlock the floor plan to move, scale or turn it')
          : t('sidebar.plan.lock.title', 'Fix the floor plan so it cannot be moved, scaled or turned by accident')}
        className={`${knopf} ${plan.locked ? 'border-bc-accent text-bc-accent' : ''}`}
      >
        {plan.locked ? <FiLock size={11} /> : <FiUnlock size={11} />}
        {plan.locked ? t('sidebar.plan.locked', 'Fixed') : t('sidebar.plan.lock', 'Fix')}
      </button>
    </div>
  );
}

export function PlanDrehen({ plan, onChange }: Props) {
  const { t } = useTranslation();
  const [winkel, setWinkel] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const drehe = async (deg: number) => {
    if (!deg || laeuft) return;
    setLaeuft(true);
    try {
      onChange(await drehePlan(plan, deg));
    } catch {
      alert(t('sidebar.plan.rotateFailed', 'The floor plan could not be turned.'));
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-bc-muted">
        <span>{t('sidebar.plan.rotate', 'Turn plan')}</span>
        <span className="text-[10px] text-bc-dim tabular-nums">{format(t('sidebar.plan.rotation', '{deg}° turned'), { deg: Math.round((plan.rotationDeg ?? 0) * 10) / 10 })}</span>
      </div>
      <div className="flex gap-1">
        <button type="button" className={knopf} disabled={laeuft} onClick={() => drehe(-90)} title={t('sidebar.plan.rotateLeft', 'Turn 90° anticlockwise')}><FiRotateCcw size={11} /> 90°</button>
        <button type="button" className={knopf} disabled={laeuft} onClick={() => drehe(90)} title={t('sidebar.plan.rotateRight', 'Turn 90° clockwise')}><FiRotateCw size={11} /> 90°</button>
        <input
          type="number"
          step={0.5}
          value={winkel}
          placeholder="°"
          aria-label={t('sidebar.plan.rotateBy.aria', 'Turn by degrees, clockwise')}
          onChange={(e) => setWinkel(e.target.value)}
          className="w-14 border border-bc-border bg-bc-panel-raised px-1 py-0.5 text-bc-text-bright"
        />
        <button
          type="button"
          className={`${knopf} flex-1`}
          disabled={laeuft || !parseFloat(winkel)}
          onClick={() => { drehe(parseFloat(winkel) || 0); setWinkel(''); }}
        >
          {t('sidebar.plan.rotateApply', 'Turn')}
        </button>
      </div>
    </div>
  );
}

export function DxfEbenenListe({ plan, onChange }: Props) {
  const { t } = useTranslation();
  const ebenen = dxfEbenen(plan.dataUrl);
  const aus = plan.hiddenLayers ?? [];
  if (!ebenen) {
    if (plan.sourceKind !== 'dxf') return null;
    return (
      <p className="text-[10px] text-bc-dim">
        {aus.length
          ? format(t('sidebar.plan.layersHiddenOffline', '{n} DXF layers hidden. Drop the DXF again to change the layers.'), { n: aus.length })
          : t('sidebar.plan.layersOffline', 'Drop the DXF again to show or hide its layers.')}
      </p>
    );
  }
  if (ebenen.length < 2) return null;
  const umschalten = (name: string) => {
    const neu = aus.includes(name) ? aus.filter((n) => n !== name) : [...aus, name];
    const p = planMitEbenen(plan, neu);
    if (p) onChange(p);
  };
  return (
    <details className="rounded-bc-m border border-bc-border bg-bc-panel-raised">
      <summary className="cursor-pointer px-2 py-1 text-bc-text">
        {format(t('sidebar.plan.layers', 'DXF layers ({shown} of {total} shown)'), { shown: ebenen.length - ebenen.filter((e) => aus.includes(e.name)).length, total: ebenen.length })}
      </summary>
      <ul className="max-h-48 overflow-auto px-2 pb-1.5 space-y-0.5">
        {ebenen.map((e) => (
          <li key={e.name}>
            <label className="flex items-center gap-1.5 text-[10px] text-bc-muted cursor-pointer">
              <input type="checkbox" className="accent-bc-accent" checked={!aus.includes(e.name)} onChange={() => umschalten(e.name)} />
              <span className="flex-1 truncate" title={e.name}>{e.name}</span>
              <span className="tabular-nums text-bc-dim">{e.linien}</span>
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}
