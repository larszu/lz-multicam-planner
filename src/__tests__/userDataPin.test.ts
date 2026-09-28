import { describe, expect, it } from 'vitest';
import mainSrc from '../../electron/main.cjs?raw';

describe('userData pin', () => {
  it('keeps the pre-rename folder and pins it before first use', () => {
    const pin = mainSrc.indexOf("if (app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'MultiCam Planner'))");
    expect(pin).toBeGreaterThan(0);
    const firstUse = mainSrc.indexOf("getPath('userData')");
    expect(firstUse).toBeGreaterThan(pin);
  });
});
