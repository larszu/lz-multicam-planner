/** DE-Overrides: Venue2D-Kontextmenü, Venue3D-Overlay. Keys: venue.* */
//
// DIE FÜNF ÜBERSETZUNGEN DES 3D-OVERLAYS SIND KEINE ÜBERSETZUNGEN — sie sind
// der Text, der hier seit jeher im JSX stand.
//
// Venue3D war die eine Datei, die in diesem englisch-quelligen Repo deutsche
// Zeichenketten fest eingebaut hatte: „Standort", „Schwenk und Neigung",
// „hoch und runter", „vor und zurück", „→ Schloss öffnen zum Bearbeiten".
// Beim Wickeln in `t()` wandert dieser Text hierher, und genau dabei kann er
// still verlorengehen: die Suite-Kopie hat ihn aus ihrem eigenen englischen
// Fallback zurückübersetzt und schreibt deshalb „Boden bewegen", „Achsen
// drehen", „vertikal", „Dolly", „→ zum Bearbeiten entsperren".
//
// Das ist verständliches Deutsch — aber nicht dasselbe. Es ist eine
// Beschriftungs-Legende: „XY Standort | Z Höhe | Pan/Tilt Schwenk und
// Neigung" nennt, WAS die Achse einstellt; „XY Boden bewegen | Pan/Tilt
// Achsen drehen" nennt, WAS die Bewegung tut, und verliert damit den Bezug
// zur Bedienung. Wer nur die Schlüssel vergleicht, sieht keinen Unterschied,
// und der deutsche Nutzer bekommt beim Rückweg klammheimlich einen anderen
// Text als vorher.
//
// Deshalb stehen hier die Originale. Fällt die Suite-Kopie später darauf
// zurück, ist das eine Verbesserung dort — nicht andersherum.
export const venue: Record<string, string> = {
  // Venue2D-Kontextmenü
  'venue.duplicate': 'Duplizieren',
  'venue.planDrop.release': 'Loslassen, um das Bild oder PDF als Grundriss zu laden',
  'venue.lockPosition': 'Position sperren',
  'venue.unlockPosition': 'Position entsperren',
  'venue.delete': '{kind} löschen',
  // Venue3D-Overlay + Reset
  'venue.selectCamera': 'Kamera wählen',
  'venue.unlockToEdit': '→ Schloss öffnen zum Bearbeiten',
  'venue.floorMove': 'Standort',
  'venue.height': 'Höhe',
  'venue.rotateAxes': 'Schwenk und Neigung',
  'venue.move': 'Bewegen',
  'venue.vertical': 'hoch und runter',
  'venue.dolly': 'vor und zurück',
  'venue.resetView': 'Ansicht zurücksetzen',
  // 3D-Ansicht: Ansichten, Kameraliste, Einblendungen
  'venue.view.group': 'Ansicht',
  'venue.view.top': 'Draufsicht',
  'venue.view.perspective': 'Perspektive',
  'venue.view.camera': 'Kamerablick',
  'venue.list.title': 'Kameras',
  'venue.list.open': 'Kameraliste zeigen',
  'venue.list.close': 'Kameraliste ausblenden',
  'venue.list.hint': 'Klick auf eine Kamera zeigt ihr Bild',
  'venue.list.empty': 'Noch keine Kameras — links in der Seitenleiste anlegen.',
  'venue.list.hfov': 'H-Bildwinkel',
  'venue.toggle.group': 'In 3D zeigen',
  'venue.toggle.coverage': 'Abdeckung',
  'venue.toggle.labels': 'Beschriftung',
  'venue.toggle.audience': 'Publikum',
  'venue.toggle.showLight': 'Showlicht',
  'venue.toggle.videoBoard': 'LED-Wand',
  'venue.toggle.floorPlan': 'Grundriss',
  'venue.toggle.floorPlanNone': 'Kein Grundriss geladen',
  // Die vier Bearbeiten-Knöpfe an der Kamera im 3D-Raum (XY / Z / Pan / Tilt).
  'venue.edit.move': 'Standort auf dem Boden',
  'venue.edit.height': 'Höhe',
  'venue.edit.pan': 'Schwenk',
  'venue.edit.tilt': 'Neigung',
};
