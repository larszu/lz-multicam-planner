import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../data/templates';
import { getCameraById } from '../data/cameras';
import { getLensById } from '../data/lenses';

// Der Export ueberspringt eine Kamera still, wenn Kamera oder Objektiv nicht im
// Katalog stehen. Die Vorlage „Conference Room" verwies auf eine falsche
// Kamera-Id, ihr Export lieferte deshalb gar kein Bild (#268).
describe('Vorlagen verweisen nur auf vorhandene Katalogeinträge (#268)', () => {
  for (const tpl of TEMPLATES) {
    it(tpl.name, () => {
      for (const cam of tpl.cameras) {
        expect(getCameraById(cam.cameraId), `${cam.label}: Kamera ${cam.cameraId}`).toBeDefined();
        expect(getLensById(cam.lensId), `${cam.label}: Objektiv ${cam.lensId}`).toBeDefined();
      }
    });
  }
});
