/** DE-Overrides: Menueleiste und Einstellungen-Dialog (die Kopfzeile im
 *  Schnitt der Suite, ADR-007 Abschnitt 6).
 *  Keys: app.menu.*, settings.*, plus die Datei-Eintraege unter header.* */
export const chrome: Record<string, string> = {
  // ── Die fuenf Menues. Dieselben Woerter wie im Cable Planner, damit
  //    jemand, der zwischen zwei Werkzeugen wechselt, dasselbe liest.
  'app.menu.file': 'Datei',
  'app.menu.edit': 'Bearbeiten',
  'app.menu.undo': 'Rückgängig',
  'app.menu.redo': 'Wiederherstellen',
  'app.menu.tools': 'Werkzeuge',
  'app.menu.view': 'Ansicht',
  'app.menu.help': 'Hilfe',

  // ── Datei ──
  'header.new': 'Neues Projekt',
  'header.new.note': 'Leerer Raum, keine Kameras',
  'header.open.confirm': 'Plan öffnen — das aktuelle Projekt wird ersetzt und hat ungesicherte Änderungen. Fortfahren?',
  'header.new.confirm': 'Neues Projekt — das aktuelle wird ersetzt. Fortfahren?',
  'header.open': 'Öffnen…',
  'header.save': 'Speichern',
  'header.saveAs': 'Speichern unter…',
  'header.saveAs.note': 'Fragt immer nach Name und Ort',
  'header.save.downloaded': 'Dieser Browser kann keine Dateien überschreiben, deshalb wurde {name} heruntergeladen. Chrome, Edge oder die Desktop-App speichern direkt in die Datei.',
  'header.save.failed': 'Die Datei konnte nicht gespeichert werden. Mit „Speichern unter…“ einen anderen Ort wählen.',
  'header.saveAs.prompt': 'Dateiname',
  'header.avplanImport': 'Gesamtprojekt einlesen…',
  'header.avplanExport': 'Gesamtprojekt ausgeben',
  'header.venueImport': 'Raum einlesen…',
  'header.venueExport': 'Raum ausgeben',
  'header.camerasExport': 'Kameras → Cable Planner',

  // ── Werkzeuge ──
  'header.inventory': 'Lager / Bestand…',
  'header.inventory.note': 'Projektübergreifender Bestand: QR/Barcode, Cases, appübergreifend',

  // ── Ansicht ──
  'header.layout': 'Anordnung',

  // ── Hilfe ──
  'header.about': 'Über LZ Multicam Planner…',

  // ── Einstellungen ──
  'settings.title': 'Einstellungen',
  'settings.close': 'Einstellungen schliessen',
  'settings.language': 'Sprache',
  'settings.language.desc':
    'Englisch ist die Quellsprache, Deutsch eine Übersetzung. Ein fehlender Eintrag fällt auf Englisch zurück.',
  'settings.theme': 'Darstellung',
  'settings.theme.desc':
    'Die Kamera-Vorschau bleibt, wie sie ist: sie zeigt einen simulierten Raum, und ein hellerer wäre eine andere Beleuchtung, kein anderes Aussehen. Die Planungsansicht in 3D folgt dem Thema, der Show-Look nicht.',
  'settings.theme.system': 'Auto',
  'settings.theme.system.hint': 'Folgt dem Betriebssystem.',
  'settings.theme.dark': 'Dunkel',
  'settings.theme.dark.hint': 'Immer dunkel.',
  'settings.theme.light': 'Hell',
  'settings.theme.light.hint': 'Immer hell.',
  'settings.about': 'Über',
  'header.theme.group': 'Darstellung',
  'settings.about.suite':
    'Teil der LZ Planner Suite — Kamerapositionen, Objektive, Deckung und Schichtübergabe.',
  'settings.gpu': 'Grafik',
  'settings.gpu.renderer': 'WebGL-Renderer',
  'settings.gpu.noWebgl': 'WebGL nicht verfügbar',
  'settings.gpu.devices': 'Grafikkarten',
  'settings.gpu.active': 'in Benutzung',
  'settings.gpu.exe': 'Programmdatei',
  'settings.gpu.integratedHint': 'Die App läuft auf der integrierten Grafik, obwohl eine eigene Grafikkarte eingebaut ist. In den Windows-Einstellungen unter System → Anzeige → Grafik die Programmdatei oben auf „Hohe Leistung“ stellen und die App neu starten. Die portable Fassung läuft aus einem temporären Ordner – damit die Einstellung bleibt, den Installer nehmen.',

  // ── Die Statusleiste (ADR-007 Abschnitt 6: Meldungen links, Zähler rechts) ──
  'status.cameras': '{count} Kameras',
  'status.people': '{count} Personen & Objekte',
  'status.walls': '{count} Wände',
  'status.mode.floorplan': 'Bearbeiten: Grundriss',
  'status.mode.some': 'Gesperrt: {n} von {total}',
  'status.mode.stage': 'Bearbeiten: Bühne',
  'status.mode.objects': 'Bearbeiten: Objekte',
  'status.mode.cameras': 'Bearbeiten: Kameras',
  'status.autosaveFull': 'Automatische Sicherung fehlgeschlagen — der Speicher ist voll. Das Projekt als Datei speichern.',
};
