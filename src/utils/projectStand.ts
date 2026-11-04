/**
 * Projektstand fuer Anzeige und Export (#251).
 *
 * `projectVersion` zaehlt jede einzelne Aenderung (jeder Zug am Regler) und
 * taugt nur fuer „ungespeichert". Angezeigt wird stattdessen, was ein Mensch
 * nachvollziehen kann: wie oft gespeichert wurde und wann zuletzt.
 */

export type ProjectStand =
  | { kind: 'never' }
  | { kind: 'saved'; revision: number | null; savedAt: string | null; dirty: boolean };

export function projectStand(s: {
  savedRevision: number;
  savedAt: string | null;
  projectVersion: number;
  lastSavedVersion: number;
}): ProjectStand {
  if (s.savedRevision <= 0 && !s.savedAt) return { kind: 'never' };
  return {
    kind: 'saved',
    revision: s.savedRevision > 0 ? s.savedRevision : null,
    savedAt: s.savedAt,
    dirty: s.projectVersion !== s.lastSavedVersion,
  };
}

/** Kurz und lokal: 04.11.2026 14:32. Unlesbares bleibt, wie es ist. */
export function formatStandDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Translate = (key: string, en: string) => string;

/** Der Stand als Satz, z. B. „Revision 3 · saved 04.11.2026 14:32". */
export function describeStand(stand: ProjectStand, t: Translate, opts: { withChanges?: boolean } = {}): string {
  if (stand.kind === 'never') return t('project.stand.never', 'Not saved yet');
  const when = stand.savedAt ? formatStandDate(stand.savedAt) : '';
  const base = stand.revision !== null
    ? (when
      ? t('project.stand.revisionAt', 'Revision {rev} · saved {when}').replace('{rev}', String(stand.revision)).replace('{when}', when)
      : t('project.stand.revision', 'Revision {rev}').replace('{rev}', String(stand.revision)))
    : t('project.stand.savedAt', 'Saved {when}').replace('{when}', when);
  return opts.withChanges && stand.dirty
    ? t('project.stand.withChanges', '{stand} + unsaved changes').replace('{stand}', base)
    : base;
}
