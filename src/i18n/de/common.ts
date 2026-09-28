/** DE-Overrides: geteilte Dialog-Labels (confirm/prompt/alert) und der
 *  Hinweis nach einer Id-Reparatur beim Laden. Keys: common.*, load.* */
export const common: Record<string, string> = {
  // Der Quelltext trug hier Deutsch als englische Quellsprache — ein
  // englischer Nutzer bekam den Hinweis auf Deutsch. Jetzt steht die
  // englische Fassung an der Aufrufstelle und die deutsche hier.
  // {count} wird vom Aufrufer ersetzt und muss stehen bleiben.
  'load.idRepair.title': '{count} doppelte Id(s) in der Projektdatei repariert.',
  'load.idRepair.hint':
    'Betroffene Objekte haben eine neue Id bekommen. Verweise darauf — Shots, Takes, Presets und Fokus-Sperren — zeigen jetzt auf das jeweils erste Objekt mit der alten Id und sind zu prüfen.',
  // cable-planner#917 — mitgebrachte eigene Kameras/Optiken, die nicht
  // uebernommen wurden. {count}/{names} ersetzt der Aufrufer.
  'load.libraryConflict.title': '{count} eigene Kamera(s)/Optik(en) aus dem Projekt nicht übernommen.',
  'load.libraryConflict.hint':
    'Diese Bibliothek hat schon einen Eintrag mit derselben Id und anderen Daten. Der eigene wurde behalten, und das Projekt rechnet jetzt mit ihm: {names}',
  'load.libraryInvalid': '{count} eigene Kamera(s)/Optik(en) in der Projektdatei waren nicht lesbar und wurden übersprungen.',

  // Die Auffangseite. Sie ist der einzige Ort, an dem der Nutzer nach einem
  // Absturz noch etwas liest — englischer Text an dieser Stelle waere die
  // schlechteste Stelle fuer eine Sprachluecke.
  'error.title': 'Etwas ist schiefgelaufen',
  'error.hint': 'Die Anwendung ist auf einen unerwarteten Fehler gelaufen. Die Seite neu laden hilft meistens.',
  'error.reload': 'Neu laden',

  'common.ok': 'OK',
  'common.cancel': 'Abbrechen',
  'common.delete': 'Löschen',
  'common.reset': 'Zurücksetzen',
  'common.load': 'Laden',
  'common.restore': 'Wiederherstellen',
  'common.clearAll': 'Alles löschen',
  'store.unsupportedFormat': 'Nicht unterstütztes Projektdateiformat.',
};
