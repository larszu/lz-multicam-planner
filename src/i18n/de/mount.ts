/**
 * DE-Overrides: die Rig-Taxonomie. Keys: mount.*, motion.*
 *
 * Diese Datei ist am 2026-09-10 entstanden, und der Anlass ist ein Befund und
 * keine Erweiterung: `MOUNT_TYPE_LABELS` (17 Namen) und `MOTION_PROFILES`
 * (17 Kurznamen plus 17 Erlaeuterungen) standen auf DEUTSCH in einem Repo,
 * dessen Quellsprache seit E-28 `en` ist. Sie erscheinen an sechs Stellen der
 * Oberflaeche — Kamera-Liste, Rig-Auswahl, Kopfzeile des Rig-Pults, Shotlist.
 *
 * Kein Sprach-Waechter konnte das finden: der Sprachmix-Zaehler liest
 * JSX-Text, sichtbare Attribute und Rueckfragen. Was als Feld eines
 * Modul-Objekts dasteht, sieht er nie. Genau deshalb liegt die deutsche
 * Fassung jetzt hier und die englische im Quelltext — dort, wo beide
 * gemessen werden koennen.
 */
export const mount: Record<string, string> = {
  'mount.tripod': 'Stativ',
  'mount.hihat': 'Hi-Hat / Bodenstativ',
  'mount.pedestal': 'Studio Pedestal',
  'mount.jib': 'Jib / Kran',
  'mount.technocrane': 'Technocrane (teleskopierend)',
  'mount.dolly': 'Dolly (Schiene)',
  'mount.slider': 'Slider',
  'mount.cablecam': 'Cable-Cam / Spidercam',
  'mount.drone': 'Drohne',
  'mount.scissorlift': 'Scherenbühne / Hebebühne',
  'mount.remotehead': 'Remote-Head',
  'mount.carmount': 'Fahrzeug-Montage',
  'mount.rickshaw': 'Rickshaw / Kamerawagen',
  'mount.gimbal': 'Gimbal',
  'mount.handheld': 'Handheld',
  'mount.steadicam': 'Steadicam',
  'mount.fixed': 'Feste Montage',

  'motion.tripod': 'Stativ',
  'motion.hihat': 'Hi-Hat',
  'motion.pedestal': 'Pedestal',
  'motion.jib': 'Jib / Kran',
  'motion.technocrane': 'Technocrane',
  'motion.dolly': 'Dolly',
  'motion.slider': 'Slider',
  'motion.cablecam': 'Cable-Cam',
  'motion.drone': 'Drohne',
  'motion.scissorlift': 'Hebebühne',
  'motion.remotehead': 'Remote-Head',
  'motion.carmount': 'Fahrzeug',
  'motion.rickshaw': 'Rickshaw',
  'motion.gimbal': 'Gimbal',
  'motion.handheld': 'Handheld',
  'motion.steadicam': 'Steadicam',
  'motion.fixed': 'Fest montiert',

  'motion.hint.tripod': 'Kurzer, präziser Schwenk mit klarem Ein- und Ausstieg.',
  'motion.hint.hihat': 'Bodennah und starr — nur Schwenk/Neigung.',
  'motion.hint.pedestal': 'Sauber geführt, Säule hebt/senkt gleichmäßig.',
  'motion.hint.jib': 'Weicher Bogen, setzt sanft ab.',
  'motion.hint.technocrane': 'Teleskopierender Arm — weichste und längste Fahrt.',
  'motion.hint.dolly': 'Träge Masse: langer Anlauf, langes Ausrollen.',
  'motion.hint.slider': 'Kurzer, sehr gleichmäßiger Weg — feine Kontrolle.',
  'motion.hint.cablecam': 'Fliegend an Seilen — weite, weiche Bögen, pendelt leicht nach.',
  'motion.hint.drone': 'Frei im Raum, weiche Beschleunigung, leichte Drift.',
  'motion.hint.scissorlift': 'Hebt langsam und ruhig; horizontal kaum beweglich.',
  'motion.hint.remotehead': 'Motorisch präzise, sehr schnelle Schwenks möglich.',
  'motion.hint.carmount': 'Folgt dem Fahrzeug — schnell, mit Fahrbahn-Unruhe.',
  'motion.hint.rickshaw': 'Geschoben — gleichmäßig, aber nicht ganz ruhig.',
  'motion.hint.gimbal': 'Weich geführt, flinker als Steadicam.',
  'motion.hint.handheld': 'Nie ganz ruhig — feines Zittern überlagert die Fahrt.',
  'motion.hint.steadicam': 'Schwebend, läuft leicht über und pendelt sich ein.',
  'motion.hint.fixed': 'Starr — nur Zoom/Fokus, keine Fahrt.',
  // #221 / #222 / #223 / #235
  'path.arc': 'Bogen',
  'path.line': 'Gerade',
  'path.swing': 'Schwenk',
};
