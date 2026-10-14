import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCheck, FiChevronDown, FiChevronUp, FiX } from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import { loadJSON, saveJSON } from '../../utils/storage';
import { useTranslation } from '../../i18n';
import { FIRST_STEPS_OPEN_EVENT } from './firstStepsEvent';

// Der eine Einstieg (lzm-web 4, leise Stufe): vier Schritte, die sich durch
// die echte Handlung abhaken. Ein Klick fuehrt zur Funktion, nicht zum Haken.
// Ersetzt den frueheren Startdialog mit Raum-zuerst-Assistent — der Kern der
// App ist „Kamera einzeichnen, Optik pruefen", nicht „erst den Saal bauen".

const KEY = 'multicam-first-steps';
interface Stored { focal: boolean; viewed: boolean; dismissed: boolean }

export interface FirstStepsProps {
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
}

export default function FirstSteps({ activeTabId, onSelectTab }: FirstStepsProps) {
  const { t } = useTranslation();
  const hasCamera = useStore((s) => s.cameras.length > 0);
  const hasTarget = useStore((s) => s.persons.length > 0);
  const setEditMode = useStore((s) => s.setEditMode);
  const [stored, setStored] = useState<Stored>(() => loadJSON<Stored>(KEY, { focal: false, viewed: false, dismissed: false }));
  const [collapsed, setCollapsed] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const wasComplete = useRef<boolean | null>(null);

  const update = useCallback((patch: Partial<Stored>) => setStored((prev) => {
    const next = { ...prev, ...patch };
    saveJSON(KEY, next);
    return next;
  }), []);

  // Brennweite geaendert: dieselbe Kamera, andere Brennweite. Ein neues
  // Projekt oder eine neue Kamera zaehlt nicht — das ist kein Pruefen der Optik.
  useEffect(() => useStore.subscribe((s, prev) => {
    if (s.cameras.length !== prev.cameras.length) return;
    const changed = s.cameras.some((c, i) => prev.cameras[i]?.id === c.id && prev.cameras[i].focalLength !== c.focalLength);
    if (changed) update({ focal: true });
  }), [update]);

  useEffect(() => {
    if (activeTabId === 'tab-preview' || activeTabId === 'tab-multiview') update({ viewed: true });
  }, [activeTabId, update]);

  useEffect(() => {
    const open = () => { update({ dismissed: false }); setCollapsed(false); };
    window.addEventListener(FIRST_STEPS_OPEN_EVENT, open);
    return () => window.removeEventListener(FIRST_STEPS_OPEN_EVENT, open);
  }, [update]);

  const steps = [
    { id: 'camera', done: hasCamera, label: t('firstSteps.camera', 'Draw a camera into the plan'), go: () => { setEditMode('cameras'); onSelectTab('tab-2d'); } },
    { id: 'target', done: hasTarget, label: t('firstSteps.target', 'Place a person on the stage'), go: () => { setEditMode('objects'); onSelectTab('tab-2d'); } },
    { id: 'focal', done: stored.focal, label: t('firstSteps.focal', 'Adjust the focal length'), go: () => onSelectTab('tab-preview') },
    { id: 'view', done: stored.viewed, label: t('firstSteps.view', 'Check the picture in the preview'), go: () => onSelectTab('tab-preview') },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const complete = doneCount === steps.length;

  // Erfolgsmoment nur beim Uebergang, nicht wenn die Liste schon fertig startet.
  useEffect(() => {
    if (wasComplete.current === false && complete) {
      setCelebrate(true);
      const timer = window.setTimeout(() => { setCelebrate(false); update({ dismissed: true }); }, 3000);
      return () => window.clearTimeout(timer);
    }
    wasComplete.current = complete;
  }, [complete, update]);

  if (stored.dismissed || (complete && !celebrate)) return null;

  return (
    <section
      aria-labelledby="first-steps-title"
      className="fixed bottom-10 right-4 z-40 w-[300px] max-w-[calc(100vw-32px)] rounded-bc-l border border-bc-border bg-bc-panel p-4 shadow-bc-2"
    >
      <div className="flex items-center gap-2">
        <h2 id="first-steps-title" className="flex-1 text-sm font-semibold text-bc-text-bright">
          {celebrate ? t('firstSteps.done', 'All set — your cameras are planned.') : t('firstSteps.title', 'First steps')}
        </h2>
        <span className="text-xs tabular-nums text-bc-muted">{doneCount}/{steps.length}</span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? t('firstSteps.expand', 'Expand') : t('firstSteps.collapse', 'Collapse')}
          className="flex items-center justify-center text-bc-muted hover:bg-bc-hover hover:text-bc-text"
        >
          {collapsed ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
        </button>
        <button
          type="button"
          onClick={() => update({ dismissed: true })}
          aria-label={t('firstSteps.hide', 'Hide (Help menu brings it back)')}
          title={t('firstSteps.hide', 'Hide (Help menu brings it back)')}
          className="flex items-center justify-center text-bc-muted hover:bg-bc-hover hover:text-bc-text"
        >
          <FiX size={16} />
        </button>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-bc-full bg-bc-sunken" aria-hidden>
        <div
          className={`h-full rounded-bc-full transition-[width] duration-300 ${complete ? 'bg-bc-green' : 'bg-bc-accent'}`}
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      {!collapsed && (
        <ol className="mt-3 grid gap-0.5">
          {steps.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={s.go}
                className={`flex w-full items-center gap-3 px-2 py-1.5 text-left text-sm hover:bg-bc-hover ${s.done ? 'text-bc-muted line-through' : 'text-bc-text'}`}
              >
                <span
                  className={`first-steps-check flex h-5 w-5 flex-none items-center justify-center rounded-bc-full border-2 ${s.done ? 'is-done border-bc-green bg-bc-green text-bc-on-media' : 'border-bc-border'}`}
                >
                  {s.done && <FiCheck size={12} strokeWidth={3} />}
                </span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
