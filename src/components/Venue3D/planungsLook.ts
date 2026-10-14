import type { Hintergrund } from '../../avplan/scene3d';

/**
 * Planungs-Hintergrund je Thema (Design-Vertrag 2026-10). Nur der Planungs-
 * Look folgt dem Thema; Show-Looks sind simuliertes Licht und bleiben. Der
 * Suite-Eintrag `planung` (Navy) gilt hier nicht mehr — die Oberflaeche um
 * die Ansicht ist neutral, ein Navy-Raum darin waere ein Fremdkoerper.
 */
export const PLANUNG_JE_THEMA: Record<'hell' | 'dunkel', Hintergrund> = {
  dunkel: { oben: '#2c2d32', horizont: '#36373d', unten: '#1E1F23', nebel: '#36373d', nebelDichte: 0, umgebung: 0.75 },
  hell: { oben: '#dde1e6', horizont: '#F1F1EE', unten: '#e2e2de', nebel: '#F1F1EE', nebelDichte: 0, umgebung: 0.9 },
};
/** Boden der Halle im Planungs-Look: hebt sich vom Hintergrund ab, in beiden Themen. */
export const PLANUNGS_BODEN = { dunkel: '#3a3b41', hell: '#c9cac5' } as const;

