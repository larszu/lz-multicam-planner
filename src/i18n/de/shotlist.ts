/** DE-Overrides: Shotlist-Panel. Keys: shotlist.* */
//
// Mit B-61 entstanden. Der deutsche Text ist Zeichen für Zeichen der, der
// vorher fest im JSX stand — mit einer bewussten Ausnahme, die unten steht.
export const shotlist: Record<string, string> = {
  'shotlist.none': '— keine Shotlist —',
  'shotlist.pick': 'Shotlist',
  'shotlist.new': 'Neue Shotlist',
  'shotlist.rename': 'Shotlist umbenennen',
  'shotlist.renamePrompt': 'Name der Shotlist:',
  'shotlist.delete': 'Shotlist löschen',
  'shotlist.capture': 'Aktuelle Preview-Ansicht als Shot speichern',
  'shotlist.prev': 'Vorheriger Shot (Q)',
  'shotlist.next': 'Nächster Shot (E)',
  'shotlist.stop': 'Sequenz stoppen',
  'shotlist.empty': 'Noch keine Shots.',
  // Der leere Zustand war ein Satz mit einem farbig hervorgehobenen
  // Knopfnamen mittendrin: „Kamera im Preview einrichten und ‚Shot aufnehmen'
  // klicken." Beim Wickeln zerfällt er in Satz + Knopfname — den Namen in
  // denselben Schlüssel zu ziehen hiesse, die Hervorhebung ins Wörterbuch zu
  // schreiben.
  //
  // Das abschliessende „klicken" entfällt dabei, und das ist eine
  // Entscheidung und kein Versehen: im Deutschen steht das Verb am Ende, im
  // Englischen vor dem Knopfnamen. Ein Schlüssel, der beide Stellungen
  // bedienen soll, bräuchte einen zweiten Textteil hinter dem Knopf, der im
  // Englischen leer bleibt — eine leere Zeichenkette im Wörterbuch, die
  // niemand als absichtlich erkennt. „Kamera im Preview einrichten und Shot
  // aufnehmen." sagt dasselbe und ist ein ganzer Satz.
  'shotlist.empty.hint1': 'Kamera im Preview einrichten und',
  'shotlist.empty.action': 'Shot aufnehmen',
  'shotlist.noThumb': 'kein Bild',
  'shotlist.cameraGone': 'Die Kamera dieses Shots wurde gelöscht',
  'shotlist.deleteShot': 'Shot löschen',
  'shotlist.deleteConfirm': 'Shotlist "{name}" mit {count} Shots löschen?',
  'shotlist.renameShort': 'Umbenennen',
  'shotlist.exportPng': 'Storyboard als PNG',
  'shotlist.print': 'Storyboard drucken / als PDF sichern',

  // 2026-09-10 — vom geschaerften Sprachmix-Zaehler gefunden.
  'shotlist.cameraMissing': 'Kamera fehlt',
  'shotlist.captureShot': 'Shot aufnehmen',
  'shotlist.motionStyle': 'Bewegungsstil — {hint}',
  'shotlist.notePlaceholder': 'Notiz…',
  'shotlist.playSequence': 'Sequenz abspielen',
  'shotlist.renameShot': 'Shot benennen',
  'shotlist.rigIs': 'Rig: {rig}',
  'shotlist.tooFast':
    'Auf einem {rig} braucht diese Fahrt mindestens {need} s — die eingestellten {set} s sind physikalisch nicht zu schaffen.',
  'shotlist.transitionSeconds': 'Fahrtzeit in Sekunden',
  'shotlist.transitionToggle': 'Fahrtzeit umschalten (OFF / Schnell / Langsam / Manuell)',
};
