import { describe, expect, it } from 'vitest';
import { getCompatibleLenses, integratedLensesFor, pickInitialMountAndLens, GENERIC_INTEGRATED_LENS, LENSES } from '../data/lenses';
import { CAMERAS } from '../data/cameras';

describe('built-in lenses belong to their own camera (#158)', () => {
  it('never offers another PTZ model its built-in lens', () => {
    const lens = integratedLensesFor('sony-srg-a40')[0];
    expect(lens.id).toBe(GENERIC_INTEGRATED_LENS.id);
    expect(pickInitialMountAndLens('integrated', undefined, [], 'sony-srg-a40').lens?.id).toBe(GENERIC_INTEGRATED_LENS.id);
  });

  it('finds the linked lens, also where the ids do not follow ptz-<camera>', () => {
    expect(integratedLensesFor('sony-brc-x400')[0].id).toBe('ptz-sony-brc-x400');
    expect(integratedLensesFor('pana-aw-ue150')[0].id).toBe('ptz-pana-ue150');
    expect(integratedLensesFor('canon-cr-n300w')[0].id).toBe('ptz-canon-crn300');
  });

  it('prefers a custom lens entered for this camera', () => {
    const custom = { ...GENERIC_INTEGRATED_LENS, id: 'custom-lens-1', isCustom: true, forCameraIds: ['sony-srg-a40'] };
    expect(integratedLensesFor('sony-srg-a40', [custom])[0].id).toBe('custom-lens-1');
  });

  it('offers no built-in lens to a camera with a real mount', () => {
    expect(getCompatibleLenses('B4').some((l) => l.mount === 'integrated')).toBe(false);
  });

  it('links every integrated lens in the catalogue to an existing camera', () => {
    const camIds = new Set(CAMERAS.map((c) => c.id));
    for (const l of LENSES.filter((x) => x.mount === 'integrated')) {
      const ids = l.forCameraIds ?? [l.id.replace(/^ptz-/, '')];
      expect(ids.every((id) => camIds.has(id)), l.id).toBe(true);
    }
  });
});
