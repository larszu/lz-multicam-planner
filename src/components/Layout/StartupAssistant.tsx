import { useCallback, useRef, useState } from 'react';
import { FiUpload, FiPlus, FiX, FiArrowRight, FiCheck } from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import type { EditMode } from '../../types';
import { useTranslation } from '../../i18n';

type TFn = (key: string, en: string) => string;

const SEEN_KEY = 'mcplan-assistant-seen';

// Ordered steps of the "New Plan" wizard (issue #43): draw the floor plan, then
// the stages, then objects/persons, and finally the cameras.
const getWizardSteps = (t: TFn): { mode: EditMode; title: string; hint: string }[] => [
  { mode: 'floorplan', title: t('header.wizard.step1.title', '1 · Floor Plan'), hint: t('header.wizard.step1.hint', 'Upload a plan image/PDF, set the scale, and draw the walls.') },
  { mode: 'stage', title: t('header.wizard.step2.title', '2 · Stages'), hint: t('header.wizard.step2.hint', 'Add and size the stages. Everything else is locked for now.') },
  { mode: 'objects', title: t('header.wizard.step3.title', '3 · Objects & Persons'), hint: t('header.wizard.step3.hint', 'Place performers, instruments and props on the stage.') },
  { mode: 'cameras', title: t('header.wizard.step4.title', '4 · Cameras'), hint: t('header.wizard.step4.hint', 'Position the cameras and aim them at the action.') },
];

export default function StartupAssistant() {
  const { t } = useTranslation();
  const WIZARD_STEPS = getWizardSteps(t);
  const { loadProject, setEditMode } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seen = typeof window !== 'undefined' && window.sessionStorage.getItem(SEEN_KEY) === '1';
  const [phase, setPhase] = useState<'choose' | 'wizard' | 'done'>(seen ? 'done' : 'choose');
  const [stepIndex, setStepIndex] = useState(0);

  const markSeen = useCallback(() => {
    try { window.sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
  }, []);

  const dismiss = useCallback(() => { markSeen(); setPhase('done'); }, [markSeen]);

  const startWizard = useCallback(() => {
    // Seit der automatischen Sicherung (cable-planner#908) steht hier beim
    // Start das zuletzt bearbeitete Projekt, nicht mehr ein leeres. „Neuer
    // Plan" muss es deshalb wirklich ersetzen — und fragen, wenn dabei
    // Arbeit verlorenginge, die in keiner Datei liegt.
    // `hasUnsavedChanges` vergleicht Projektstaende und sieht damit JEDE
    // Aenderung seit dem letzten Speichern — auch eine, die nur Buehnen oder
    // Raummasse betrifft. Eine Inhaltsliste daneben uebersah genau die.
    const s = useStore.getState();
    if (s.hasUnsavedChanges()
      && !window.confirm(t('header.new.confirm', 'New project — the current one is replaced. Continue?'))) return;
    s.newProject();
    markSeen();
    setStepIndex(0);
    setEditMode(WIZARD_STEPS[0].mode);
    setPhase('wizard');
  }, [markSeen, setEditMode, WIZARD_STEPS, t]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Derselbe Schutz wie bei „Neuer Plan": seit der automatischen Sicherung
    // steht hier das zuletzt bearbeitete Projekt, und ein Laden ohne Frage
    // ueberschriebe eine Sekunde spaeter auch die Sicherung.
    if (file && useStore.getState().hasUnsavedChanges()
      && !window.confirm(t('header.open.confirm', 'Open a plan — the current one is replaced and it has unsaved changes. Continue?'))) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file) await loadProject(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setEditMode('cameras'); // an existing plan jumps straight to camera editing
    dismiss();
  }, [loadProject, setEditMode, dismiss, t]);

  const nextStep = useCallback(() => {
    setStepIndex((i) => {
      const next = i + 1;
      if (next >= WIZARD_STEPS.length) {
        setEditMode('all');
        setPhase('done');
        return i;
      }
      setEditMode(WIZARD_STEPS[next].mode);
      return next;
    });
  }, [setEditMode, WIZARD_STEPS]);

  const finishWizard = useCallback(() => { setEditMode('all'); setPhase('done'); }, [setEditMode]);

  if (phase === 'done') return null;

  if (phase === 'wizard') {
    const step = WIZARD_STEPS[stepIndex];
    const isLast = stepIndex === WIZARD_STEPS.length - 1;
    return (
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] w-[420px] max-w-[92vw] border border-bc-border bg-bc-panel px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-bc-yellow text-xs font-semibold">{step.title}</div>
            <div className="text-bc-text text-xs mt-1 leading-relaxed">{step.hint}</div>
          </div>
          <button onClick={finishWizard} className="p-1 text-bc-dim hover:text-bc-text-bright" title={t('header.wizard.exit', 'Exit assistant (unlock everything)')}>
            <FiX size={14} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-1">
            {WIZARD_STEPS.map((s, i) => (
              <span key={s.mode} className={`h-1.5 w-6 ${i <= stepIndex ? 'bg-bc-yellow' : 'bg-bc-border'}`} />
            ))}
          </div>
          <button
            onClick={isLast ? finishWizard : nextStep}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bc-accent text-bc-accent-text text-xs font-medium hover:bg-bc-accent/80"
          >
            {isLast ? <><FiCheck size={13} /> {t('header.wizard.finish', 'Finish')}</> : <>{t('header.wizard.next', 'Next')} <FiArrowRight size={13} /></>}
          </button>
        </div>
      </div>
    );
  }

  // phase === 'choose'
  // Wiederhergestellt aus der automatischen Sicherung und nicht leer: dann
  // ist Weiterarbeiten die naheliegende Wahl und steht oben.
  const st = useStore.getState();
  const fortsetzen =
    st.cameras.length > 0 || st.persons.length > 0 || st.walls.length > 0 || st.backgroundPlan !== null || st.hasUnsavedChanges();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-bc-scrim backdrop-blur-sm">
      <div className="w-[440px] max-w-[92vw] border border-bc-border bg-bc-panel p-6 relative">
        <button onClick={dismiss} className="absolute top-3 right-3 p-1 text-bc-dim hover:text-bc-text-bright" title={t('header.welcome.close', 'Close')}>
          <FiX size={16} />
        </button>
        <h2 className="text-bc-text-bright font-bold text-lg">{t('header.welcome.title', 'Welcome to MultiCam Planner')}</h2>
        <p className="text-bc-muted text-sm mt-1">{t('header.welcome.intro', 'How would you like to start?')}</p>
        <div className="grid grid-cols-1 gap-3 mt-5">
          {fortsetzen && (
            <button
              onClick={dismiss}
              className="flex items-center gap-3 border border-bc-accent bg-bc-dark px-4 py-3 text-left hover:border-bc-accent transition-colors"
            >
              <FiArrowRight size={20} className="text-bc-accent shrink-0" />
              <span>
                <span className="block text-bc-text-bright text-sm font-medium">{t('header.welcome.continue.title', 'Continue last project')}</span>
                <span className="block text-bc-dim text-xs">
                  {t('header.welcome.continue.desc', 'The project you last worked on, restored from the automatic backup')}
                </span>
              </span>
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-3 border border-bc-border bg-bc-dark px-4 py-3 text-left hover:border-bc-accent transition-colors"
          >
            <FiUpload size={20} className="text-bc-accent shrink-0" />
            <span>
              <span className="block text-bc-text-bright text-sm font-medium">{t('header.welcome.load.title', 'Load Plan')}</span>
              <span className="block text-bc-dim text-xs">{t('header.welcome.load.desc', 'Open an existing .mcplan file and jump to camera editing')}</span>
            </span>
          </button>
          <button
            onClick={startWizard}
            className="flex items-center gap-3 border border-bc-border bg-bc-dark px-4 py-3 text-left hover:border-bc-accent transition-colors"
          >
            <FiPlus size={20} className="text-bc-yellow shrink-0" />
            <span>
              <span className="block text-bc-text-bright text-sm font-medium">{t('header.welcome.new.title', 'New Plan')}</span>
              <span className="block text-bc-dim text-xs">{t('header.welcome.new.desc', 'Step through floor plan → stages → objects → cameras')}</span>
            </span>
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".mcplan,.json" className="hidden" onChange={handleFileChange} />
      </div>
    </div>
  );
}
