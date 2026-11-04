/* global document */
// Klickt den Handy-Sucher (#237) einmal im gebauten Stand durch, mit Fake-Kamera.
// Lauf: npm run build && npx vite preview --port 4299, dann
//   node scripts/handy-sucher/klick.mjs [Ausgabeordner]
// Braucht `playwright` (nicht im Repo); CHROMIUM=<Pfad> waehlt den Browser, BASIS die Adresse.
import { chromium } from 'playwright';
import fs from 'node:fs';
const D = process.argv[2] ?? '.';
const E = process.env.CHROMIUM;
const BASIS = process.env.BASIS ?? 'http://localhost:4299/';
await (async () => {
  const b = await chromium.launch({ ...(E ? { executablePath: E } : {}), args: ['--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['camera', 'clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const fehler = [];
  p.on('pageerror', (e) => fehler.push(String(e)));
  await p.goto(BASIS);
  await p.waitForTimeout(2000);
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: '3D view' }).click();
  await p.waitForTimeout(3000);

  const klick = (name) => p.evaluate((n) => { const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent && (x.getAttribute('aria-label') || x.textContent.trim()) === n); b?.click(); return !!b; }, name);
  console.log('simple', await klick('Simple'));
  await p.waitForTimeout(1500);
  console.log('camview', await klick('Camera view'));
  await p.waitForTimeout(4000);
  const knopf = p.getByRole('button', { name: 'Phone as viewfinder' });
  console.log('phone buttons', await knopf.count());
  if (await knopf.count()) {
    await knopf.first().click();
    await p.waitForSelector('[data-qr]');
    await p.waitForTimeout(500);
    await p.screenshot({ path: D + '/03-dialog.png', timeout: 60000 }).catch((e) => console.log('shot fail', e.message.split('\n')[0]));
    const link = await p.getByLabel('Link for the phone').inputValue();
    console.log('link length', link.length, link.slice(0, 80));
    fs.writeFileSync(D + '/link.txt', link);
    const h = await ctx.newPage();
    h.on('pageerror', (e) => fehler.push('handy: ' + String(e)));
    await h.setViewportSize({ width: 390, height: 844 });
    await h.goto(BASIS + '?sucher#' + link.split('#')[1]);
    await h.waitForTimeout(1500);
    await h.getByRole('button', { name: 'Start camera' }).click();
    await h.waitForTimeout(2000);
    await h.screenshot({ path: D + '/10-handy.png' });
    const kopf = await h.locator('header').innerText();
    console.log('kopf', kopf.replace(/\n/g, ' / '));
    await h.getByRole('button', { name: 'Next lens' }).click();
    await h.waitForTimeout(500);
    console.log('nach blaettern', (await h.locator('header').innerText()).split('\n')[1]);
    await h.getByRole('button', { name: '9:16' }).click();
    await h.getByRole('button', { name: 'Title safe' }).click();
    await h.waitForTimeout(300);
    await h.screenshot({ path: D + '/11-handy-maske.png' });
    await h.getByRole('button', { name: 'Calibrate' }).click();
    await h.waitForTimeout(300);
    const feld = h.getByRole('slider', { name: /Phone camera/ });
    console.log('slider count', await feld.count());
    await feld.focus();
    for (let i = 0; i < 30; i++) await h.keyboard.press('Shift+ArrowRight');
    await h.waitForTimeout(300);
    console.log('warnung', await h.getByRole('status').allInnerTexts());
    await h.screenshot({ path: D + '/12-handy-eichen.png' });
    await h.getByRole('button', { name: 'Back to plan' }).click();
    await h.getByPlaceholder(/Note/).fill('Säule im Weg');
    await h.getByRole('button', { name: 'Create exchange code' }).click();
    const code = await h.locator('[data-rueck-code]').innerText();
    console.log('code', code);
    await h.screenshot({ path: D + '/13-handy-code.png' });
    await p.bringToFront();
    await p.getByPlaceholder('MCV1.…').fill('Code: ' + code);
    await p.waitForTimeout(300);
    console.log('vorschau', await p.locator('[role=dialog] p').allInnerTexts());
    await p.getByRole('button', { name: 'Apply to the camera' }).click();
    await p.waitForTimeout(300);
    console.log('status', await p.locator('[role=dialog] [role=status]').allInnerTexts());
    await p.screenshot({ path: D + '/04-dialog-uebernommen.png', timeout: 60000 }).catch(() => {});
  }
  console.log('errors', fehler);
  await b.close();
})();
