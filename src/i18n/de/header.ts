/** DE-Overrides: Header, App-Tabs, StartupAssistant, TemplateSelector.
 *  Keys: header.* */
// ACHT EINTRAEGE SIND NACH `de/chrome.ts` GEWANDERT (2026-09-11):
// header.open/save/inventory/avplanImport/avplanExport/venueImport/
// venueExport/camerasExport. Sie beschriften jetzt Menuepunkte statt loser
// Knoepfe und heissen darum anders (Oeffnen… statt Oeffnen). Hier stehen zu
// bleiben haette geheissen: zwei deutsche Woerter fuer einen Schluessel, und
// welches gewinnt, entschiede die Reihenfolge der Spreads in `de.ts`.
export const header: Record<string, string> = {
  // ── Header: Tabs ──
  'header.tab.2dPlan': '2D-Plan',
  'header.tab.3dView': '3D-Ansicht',
  'header.tab.preview': 'Vorschau',
  'header.tab.calculator': 'Rechner',

  // ── Header: Edit-Modi ──
  'header.editMode.all': 'Alle',
  'header.editMode.all.title': 'Alles bearbeiten (respektiert Sperren pro Objekt)',
  'header.editMode.floorplan': 'Grundriss',
  'header.editMode.floorplan.title': 'Nur Grundriss & Wände bearbeiten',
  'header.editMode.stage': 'Bühne',
  'header.editMode.stage.title': 'Nur Bühnen bearbeiten',
  'header.editMode.objects': 'Objekte',
  'header.editMode.objects.title': 'Nur Objekte & Personen bearbeiten',
  'header.editMode.cameras': 'Kameras',
  'header.editMode.cameras.title': 'Nur Kameras bearbeiten',

  // ── Header: unsaved / Titel ──
  'header.unsaved': '● ungespeichert',
  'header.unsaved.title': 'Es gibt ungespeicherte Änderungen — mit Speichern eine .mcplan-Datei schreiben',
  'header.tab.dragTitle': '{label} ins Raster ziehen',
  'header.tab.focusTitle': '{label} in Fokusansicht',

  // ── Header: Layout-Modus ──
  'header.layout.focus': 'Fokus',
  'header.layout.focus.title': 'Ein einzelnes fokussiertes Panel anzeigen',
  'header.layout.grid': 'Raster',
  'header.layout.grid.title': 'Den Raster-Arbeitsbereich anzeigen',
  'header.editModeSlider.title': 'Bearbeitungsmodus — alles außer der gewählten Kategorie sperren',

  // ── Header: Presets-Menü ──
  'header.presets': 'Presets',
  'header.presets.title': 'Layout-Presets',
  'header.presets.builtIn': 'Integriert',
  'header.presets.focus': 'Fokus',
  'header.presets.defaultGrid': 'Standard-Raster',
  'header.presets.saved': 'Gespeichert',
  'header.presets.deleteTitle': 'Preset „{label}“ löschen',
  'header.presets.saveCurrent': 'Aktuelles Raster als Preset speichern…',
  'header.presets.namePlaceholder': 'Preset-Name…',
  'header.presets.save': 'Preset speichern',
  'header.presets.cancel': 'Abbrechen',

  // ── Header: Aktions-Buttons ──
  'header.save.title': 'Projekt speichern (.mcplan)',
  'header.open.title': 'Projektdatei öffnen',
  // Gebündelte Import-/Export-Menüs
  'header.export': 'Export',
  'header.export.title': 'Ansichten als PNG exportieren',
  'header.export.current': 'Aktuelle Kamera',
  'header.export.current.desc': 'Ausgewählte Kamera bei aktueller Brennweite',
  'header.export.all': 'Alle Kameras',
  'header.export.all.desc': 'Ein PNG pro Kamera bei aktueller Brennweite',
  'header.export.widetele': 'Aktuell — Weit + Tele',
  'header.export.widetele.desc': 'Ausgewählte Kamera bei minimaler und maximaler Brennweite',
  'header.export.allWidetele': 'Alle — Weit + Tele',
  'header.export.allWidetele.desc': 'Zwei PNGs pro Kamera (Brennweite min und max)',
  // Bedarf 50 — die Schicht-Uebergabe.
  'header.export.shift': 'Schicht-Übergabe drucken',
  'header.export.shift.desc': 'Bildzustand, Bedienfeld, Fehler und Befunde je Position',

  // ── App: Panels / Sidebar ──
  'header.panel.unknown': 'Unbekanntes Panel: {component}',
  'header.panel.loading3d': '3D-Ansicht wird geladen…',
  'header.panel.minimize': 'Dieses Panel in die Fokusansicht minimieren',
  'header.panel.restore': 'Panel wiederherstellen',
  'header.panel.fullscreen': 'Panel im Vollbild',
  'header.panel.close': 'Aktuelles Panel schließen',
  'header.sidebar.settings': 'Einstellungen',
  'header.sidebar.templates': 'Vorlagen',
  // Titel und aria-label tragen hier ABSICHTLICH verschiedenen Text: der
  // Titel steht neben dem Knopf und darf kurz sein, das aria-label wird ohne
  // Umgebung vorgelesen und nennt deshalb, um welche Spalte es geht. Die
  // Suite-Kopie hat beide auf denselben Schluessel gelegt — das ist eine
  // Zusammenlegung, keine Uebersetzung.
  // UI-Zoom im Kopf (Issue #61). „Strg" statt „Ctrl": die deutsche Tastatur
  // beschriftet die Taste so, und eine Hilfe, die eine andere Taste nennt als
  // die auf dem Gerät, ist keine.
  'header.zoom.title': 'UI-Zoom (Strg + / - / 0)',
  'header.zoom.out.title': 'Kleiner (Strg -)',
  'header.zoom.out': 'UI verkleinern',
  'header.zoom.reset': 'Auf 100 % zurücksetzen (Strg 0)',
  'header.zoom.in.title': 'Größer (Strg +)',
  'header.zoom.in': 'UI vergrößern',
  'header.sidebar.open': 'Spalte einblenden',
  'header.sidebar.collapse': 'Spalte ausblenden',
  'header.sidebar.open.aria': 'Seitenspalte einblenden',
  'header.sidebar.collapse.aria': 'Seitenspalte ausblenden',
  'header.sidebar.title': 'Kamera-Aufbau',
  'header.inventory.title': 'Lager / Bestand',

  // ── StartupAssistant: Wizard ──
  'header.wizard.step1.title': '1 · Grundriss',
  'header.wizard.step1.hint': 'Ein Planbild/PDF hochladen, den Maßstab festlegen und die Wände zeichnen.',
  'header.wizard.step2.title': '2 · Bühnen',
  'header.wizard.step2.hint': 'Bühnen hinzufügen und dimensionieren. Alles andere ist vorerst gesperrt.',
  'header.wizard.step3.title': '3 · Objekte & Personen',
  'header.wizard.step3.hint': 'Darsteller, Instrumente und Requisiten auf der Bühne platzieren.',
  'header.wizard.step4.title': '4 · Kameras',
  'header.wizard.step4.hint': 'Die Kameras positionieren und auf das Geschehen ausrichten.',
  'header.wizard.exit': 'Assistent beenden (alles entsperren)',
  'header.wizard.finish': 'Fertig',
  'header.wizard.next': 'Weiter',

  // ── StartupAssistant: Welcome-Dialog ──
  'header.welcome.close': 'Schließen',
  'header.welcome.title': 'Willkommen beim MultiCam Planner',
  'header.welcome.intro': 'Wie möchten Sie beginnen?',
  'header.welcome.continue.title': 'Letztes Projekt fortsetzen',
  'header.welcome.continue.desc': 'Das zuletzt bearbeitete Projekt, aus der automatischen Sicherung wiederhergestellt',
  'header.welcome.load.title': 'Plan laden',
  'header.welcome.load.desc': 'Eine bestehende .mcplan-Datei öffnen und direkt zur Kamerabearbeitung springen',
  'header.welcome.new.title': 'Neuer Plan',
  'header.welcome.new.desc': 'Schritt für Schritt: Grundriss → Bühnen → Objekte → Kameras',

  // ── TemplateSelector ──
  'header.templates.category.sport': 'Sport',
  'header.templates.category.concert': 'Konzert',
  'header.templates.category.church': 'Kirche',
  'header.templates.category.conference': 'Konferenz',
  'header.templates.category.custom': 'Benutzerdefiniert',
  'header.templates.saveCurrent': 'Aktuelles als Vorlage speichern',
  'header.templates.namePlaceholder': 'Vorlagenname…',
  'header.templates.save': 'Speichern',
  'header.templates.cancel': 'Abbrechen',
  'header.templates.heading': 'Venue-Vorlagen',
  'header.templates.restore': '{count} ausgeblendete wiederherstellen',
  'header.templates.restore.title': 'Zuvor gelöschte integrierte Vorlagen zurückholen',
  'header.templates.restoreConfirm': '{count} ausgeblendete integrierte Vorlage(n) wiederherstellen?',
  'header.templates.loadConfirm': 'Diese Vorlage laden? Das aktuelle Projekt wird ersetzt.',
  'header.templates.cameras': '{count} Kameras · {w}×{h}m',
  'header.templates.builtIn': '(integriert)',
  'header.templates.modified': '(geändert)',
  'header.templates.customTag': '(benutzerdefiniert)',
  'header.templates.overwrite': 'Mit aktuellem Projekt überschreiben',
  'header.templates.editNameCategory': 'Name / Kategorie bearbeiten',
  'header.templates.confirm': 'Bestätigen',
  'header.templates.hideBuiltIn': 'Integrierte Vorlage ausblenden (wiederherstellbar)',
  'header.templates.delete': 'Vorlage löschen',
  'header.import.avplanFailed': '.avplan-Import fehlgeschlagen: {msg}',
  'header.import.venueFailed': 'Venue-Import fehlgeschlagen: {msg}',

  // ── Austausch-Menue (upstream buendelte die frueheren Einzel-Buttons) ──
  'header.exchange.title': 'Import / Export mit anderen Apps (.avplan, Venue, Cable)',
  'header.exchange': 'Austausch',
  'header.exchange.avplanSection': 'Gesamtprojekt (.avplan)',
  'header.exchange.venueSection': 'Raum (.venue.json)',
  'header.exchange.cableSection': 'Kabel-Planner',
  'header.foreignLamps.hide': 'Fremd-Lampen ausblenden',
  'header.foreignLamps.show': 'Fremd-Lampen einblenden',

  // 2026-09-10 — vom geschaerften Sprachmix-Zaehler gefunden.
  'header.editMode': 'Bearbeiten-Modus',
};
