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
  'venue.groups': 'Im Plan bearbeitbar',
  'venue.groups.floorplan': 'Grundriss',
  'venue.groups.floorplan.title': 'Grundriss und Wände',
  'venue.groups.stage': 'Bühne',
  'venue.groups.stage.title': 'Bühnen',
  'venue.groups.room': 'Raum',
  'venue.groups.room.title': 'Publikumsflächen und Videowände',
  'venue.groups.objects': 'Objekte',
  'venue.groups.objects.title': 'Personen und Bühnenobjekte',
  'venue.groups.cameras': 'Kameras',
  'venue.groups.cameras.title': 'Kameras',
  'venue.groups.on': 'bearbeitbar, klicken zum Sperren',
  'venue.groups.off': 'gesperrt, klicken zum Bearbeiten',
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
  'venue.toggle.operators': 'Kameraleute',
  'venue.toggle.showLight': 'Showlicht',
  'venue.toggle.showLightSimple': 'Nicht in der einfachen Ansicht',
  'venue.loading': '3D-Szene wird geladen…',
  'venue.toggle.videoBoard': 'LED-Wand',
  'venue.toggle.floorPlan': 'Grundriss',
  'venue.toggle.floorPlanNone': 'Kein Grundriss geladen',
  'venue.light.label': 'Licht',
  'venue.light.hall': 'Halle',
  'venue.light.daylight': 'Tageslicht',
  'venue.light.daylight.title': 'Unter freiem Himmel mit Sonne: Datum, Uhrzeit, Ort und Wetter',
  'venue.showLight.adjust': 'Showlicht anpassen',
  'venue.showLight.hint': 'Die Scheinwerfer entstehen aus deinen Bühnen — hier stellst du sie ein.',
  'venue.showLight.mood': 'Farbe',
  'venue.showLight.mood.white': 'Weiß',
  'venue.showLight.mood.warm': 'Warm',
  'venue.showLight.mood.blueMagenta': 'Blau-Magenta',
  'venue.showLight.mood.concert': 'Konzert bunt',
  'venue.showLight.mood.custom': 'Eigene Farbe',
  'venue.showLight.color': 'Farbe der Beams',
  'venue.showLight.brightness': 'Helligkeit',
  'venue.showLight.haze': 'Dunst',
  'venue.showLight.fixtures': 'Scheinwerfer',
  'venue.showLight.fixtures.both': 'Wash + Beams',
  'venue.showLight.fixtures.wash': 'Wash',
  'venue.showLight.fixtures.beams': 'Beams',
  'venue.showLight.amount': 'Anzahl',
  'venue.showLight.amount.few': 'Wenige',
  'venue.showLight.amount.normal': 'Normal',
  'venue.showLight.amount.many': 'Viele',
  'venue.showLight.aim': 'Beams auf die Bühne richten',
  'venue.showLight.reset': 'Auf Standard zurücksetzen',
  'venue.sky.time': 'Uhrzeit',
  'venue.sky.sunrise': 'Aufgang',
  'venue.sky.sunset': 'Untergang',
  'venue.sky.golden': 'Goldene Stunde',
  'venue.sky.blue': 'Blaue Stunde',
  'venue.sky.date': 'Datum',
  'venue.sky.weather': 'Wetter',
  'venue.sky.weather.clear': 'Klar',
  'venue.sky.weather.partly': 'Leicht bewölkt',
  'venue.sky.weather.overcast': 'Bedeckt',
  'venue.sky.weather.haze': 'Dunst',
  'venue.sky.place': 'Ort',
  'venue.sky.place.custom': 'Koordinaten',
  'venue.sky.north': 'Norden (°)',
  'venue.sky.north.title': 'Wohin Norden im Grundriss zeigt, im Uhrzeigersinn von der Oberkante (90° = rechts)',
  'venue.sky.lat': 'Breite',
  'venue.sky.lon': 'Länge',
  // Die vier Bearbeiten-Knöpfe an der Kamera im 3D-Raum (XY / Z / Pan / Tilt).
  'venue.edit.move': 'Standort auf dem Boden',
  'venue.edit.height': 'Höhe',
  'venue.edit.pan': 'Schwenk',
  'venue.edit.tilt': 'Neigung',
};
