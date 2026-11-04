import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCamera, FiChevronLeft, FiChevronRight, FiCopy, FiShare2 } from 'react-icons/fi';
import Regler from '../ui/Regler';
import { format, translate } from '../../i18n';
import { loadJSON, saveJSON } from '../../utils/storage';
import { RAHMENMASKEN, maskenRechteck, zeichneRahmenmaske, zeichneSicherheitsrahmen, type Rahmenmaske } from '../../utils/rahmenmaske';
import { kontrastText } from '../../utils/color';
import {
  blickAusLage, geeichtLangGrad, handyLangGrad, panAusKurs, paketLesen, rueckCodeBauen, videoWinkel, zielRahmen, zielWinkel,
  type PaketKamera, type SucherPaket,
} from '../../utils/handySucher';

const EICHUNG_KEY = 'multicam-handy-eichung';
type Eichung = { aequiv: number; lang?: number };
type Reiter = 'bild' | 'eichung' | 'position';
type Stand = { lens: number; f: number; dist: number; maske: Rahmenmaske };

const KNOPF = 'grid h-11 w-11 shrink-0 place-items-center rounded-bc-full bg-bc-scrim text-bc-on-media disabled:opacity-30';
const PILLE = 'rounded-bc-full px-3 py-1.5 text-xs font-semibold';

function startStand(k: PaketKamera): Stand {
  return { lens: k.lens, f: k.f, dist: k.dist, maske: k.maske ?? 'none' };
}

/**
 * Handy als Sucher (#237): Livebild der Rueckkamera, darueber der Ausschnitt
 * der gewaehlten Kamera mit Objektiv — und ein Austauschcode zurueck in den Plan.
 */
export default function HandySucher() {
  const [paket, setPaket] = useState<SucherPaket | null | undefined>(undefined);
  useEffect(() => { void paketLesen(window.location.hash).then(setPaket); }, []);
  if (paket === undefined) return null;
  if (!paket || paket.k.length === 0) {
    const t = (k: string, en: string) => translate(navigator.language.startsWith('de') ? 'de' : 'en', k, en);
    return <div className="grid h-dvh place-items-center bg-bc-media p-6 text-center text-bc-on-media">{t('handy.noPackage', 'This link carries no cameras. Open it again from the planner (viewfinder → phone).')}</div>;
  }
  return <Sucher paket={paket} />;
}

function Sucher({ paket }: { paket: SucherPaket }) {
  const t = useCallback((k: string, en: string) => translate(paket.l, k, en), [paket.l]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [kIdx, setKIdx] = useState(Math.min(paket.sel, paket.k.length - 1));
  const [staende, setStaende] = useState<Stand[]>(() => paket.k.map(startStand));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [eichung, setEichungRoh] = useState<Eichung>(() => loadJSON<Eichung>(EICHUNG_KEY, { aequiv: 26 }));
  const [reiter, setReiter] = useState<Reiter>('bild');
  const [sicher, setSicher] = useState(false);
  const [mess, setMess] = useState({ breite: 1, abstand: 3, anteil: 0.5 });
  const [lage, setLage] = useState<{ neigung: number; kurs: number } | null>(null);
  const [kursNull, setKursNull] = useState<number | null>(null);
  const [hoehe, setHoehe] = useState(paket.k[kIdx].z);
  const [neigungNehmen, setNeigungNehmen] = useState(true);
  const [notiz, setNotiz] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [videoGroesse, setVideoGroesse] = useState({ w: 0, h: 0 });

  const k = paket.k[kIdx];
  const st = staende[kIdx];
  const eintrag = k.set.find((e) => e[0] === st.lens) ?? k.set[0];
  const obj = paket.o[eintrag[0]];
  const ziel = zielWinkel(eintrag[1], eintrag[2], st.f, k.ext, obj.sq);
  const langDeg = eichung.lang ?? handyLangGrad(eichung.aequiv);
  const vw = videoGroesse.w || 16;
  const vh = videoGroesse.h || 9;
  const video = videoWinkel(vw, vh, langDeg);
  const bildBreite = 2 * st.dist * Math.tan((ziel.hDeg * Math.PI) / 360);

  const setEichung = (e: Eichung) => { setEichungRoh(e); saveJSON(EICHUNG_KEY, e); };
  const setStand = (patch: Partial<Stand>) => setStaende((s) => s.map((x, i) => (i === kIdx ? { ...x, ...patch } : x)));
  const wechselKamera = (i: number) => { setKIdx(i); setHoehe(paket.k[i].z); setKursNull(null); setCode(null); };
  const blaettern = (r: 1 | -1) => {
    const i = k.set.findIndex((e) => e[0] === st.lens);
    const n = k.set[(i + r + k.set.length) % k.set.length];
    const o = paket.o[n[0]];
    setStand({ lens: n[0], f: Math.min(o.max, Math.max(o.min, st.f)) });
    setCode(null);
  };

  const starten = async () => {
    setFehler(null);
    const Ori = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (Ori?.requestPermission) await Ori.requestPermission().catch(() => 'denied');
    if (!navigator.mediaDevices?.getUserMedia) {
      setFehler(t('handy.noCameraApi', 'This browser offers no camera access here. Open the link over https in Safari or Chrome.'));
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = s;
      await v.play();
      setLaeuft(true);
    } catch (e) {
      setFehler(`${t('handy.cameraDenied', 'The camera could not be started.')} (${(e as Error).name})`);
    }
  };

  useEffect(() => {
    const v = videoRef.current;
    return () => { (v?.srcObject as MediaStream | null)?.getTracks().forEach((tr) => tr.stop()); };
  }, []);

  useEffect(() => {
    const auf = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return;
      setLage(blickAusLage(e.alpha, e.beta, e.gamma));
    };
    window.addEventListener('deviceorientation', auf);
    return () => window.removeEventListener('deviceorientation', auf);
  }, []);

  const rahmen = zielRahmen(ziel, video, 1000, 1000);
  const zielH = ziel.hDeg;
  const zielV = ziel.vDeg;

  useEffect(() => {
    const zeichnen = () => {
      const c = canvasRef.current;
      const box = boxRef.current;
      const v = videoRef.current;
      if (!c || !box) return;
      if (v && v.videoWidth && (v.videoWidth !== videoGroesse.w || v.videoHeight !== videoGroesse.h)) setVideoGroesse({ w: v.videoWidth, h: v.videoHeight });
      const dpr = window.devicePixelRatio || 1;
      const B = box.clientWidth;
      const H = box.clientHeight;
      c.width = Math.round(B * dpr);
      c.height = Math.round(H * dpr);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, B, H);
      const flaeche = maskenRechteck(B, H, vw / vh);
      const r = zielRahmen({ hDeg: zielH, vDeg: zielV }, videoWinkel(vw, vh, langDeg), flaeche.w, flaeche.h);
      const fw = Math.min(r.w, flaeche.w);
      const fh = Math.min(r.h, flaeche.h);
      const fx = flaeche.x + (flaeche.w - fw) / 2;
      const fy = flaeche.y + (flaeche.h - fh) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(flaeche.x, flaeche.y, flaeche.w, fy - flaeche.y);
      ctx.fillRect(flaeche.x, fy + fh, flaeche.w, flaeche.y + flaeche.h - fy - fh);
      ctx.fillRect(flaeche.x, fy, fx - flaeche.x, fh);
      ctx.fillRect(fx + fw, fy, flaeche.x + flaeche.w - fx - fw, fh);
      ctx.save();
      ctx.beginPath();
      ctx.rect(flaeche.x, flaeche.y, flaeche.w, flaeche.h);
      ctx.clip();
      ctx.translate(flaeche.x + (flaeche.w - r.w) / 2, flaeche.y + (flaeche.h - r.h) / 2);
      zeichneRahmenmaske(ctx, r.w, r.h, st.maske);
      if (sicher) zeichneSicherheitsrahmen(ctx, r.w, r.h, 0.6);
      ctx.restore();
      ctx.strokeStyle = r.zuWeit ? 'rgba(255,190,60,0.95)' : k.farbe;
      ctx.lineWidth = 2;
      ctx.setLineDash(r.zuWeit ? [8, 6] : []);
      ctx.strokeRect(fx + 1, fy + 1, fw - 2, fh - 2);
      ctx.setLineDash([]);
      if (reiter === 'eichung') {
        const lang = vw >= vh ? flaeche.w : flaeche.h;
        const halb = (lang * mess.anteil) / 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        if (vw >= vh) {
          const m = flaeche.x + flaeche.w / 2;
          ctx.moveTo(m - halb, flaeche.y); ctx.lineTo(m - halb, flaeche.y + flaeche.h);
          ctx.moveTo(m + halb, flaeche.y); ctx.lineTo(m + halb, flaeche.y + flaeche.h);
        } else {
          const m = flaeche.y + flaeche.h / 2;
          ctx.moveTo(flaeche.x, m - halb); ctx.lineTo(flaeche.x + flaeche.w, m - halb);
          ctx.moveTo(flaeche.x, m + halb); ctx.lineTo(flaeche.x + flaeche.w, m + halb);
        }
        ctx.stroke();
      }
    };
    zeichnen();
    const ro = new ResizeObserver(zeichnen);
    if (boxRef.current) ro.observe(boxRef.current);
    const v = videoRef.current;
    v?.addEventListener('loadedmetadata', zeichnen);
    return () => { ro.disconnect(); v?.removeEventListener('loadedmetadata', zeichnen); };
  }, [zielH, zielV, langDeg, vw, vh, st.maske, sicher, k.farbe, reiter, mess.anteil, videoGroesse]);

  const pan = lage && kursNull !== null ? panAusKurs(k.pan, kursNull, lage.kurs) : undefined;
  const neigung = lage ? Math.round(lage.neigung * 10) / 10 : undefined;
  const codeBauen = () => setCode(rueckCodeBauen({
    cam: k.id, lens: obj.id, f: st.f, z: Math.round(hoehe * 100) / 100,
    ...(neigungNehmen && neigung !== undefined ? { tilt: neigung } : {}),
    ...(pan !== undefined ? { pan } : {}),
    ...(notiz.trim() ? { notiz: notiz.trim() } : {}),
  }));
  const teilen = async () => {
    if (!code) return;
    if (navigator.share) await navigator.share({ text: code }).catch(() => undefined);
    else await navigator.clipboard?.writeText(code).catch(() => undefined);
  };

  const geeicht = eichung.lang !== undefined;
  const messLang = geeichtLangGrad(mess.breite, mess.abstand, mess.anteil);
  const mm = (v: number) => `${Math.round(v * 10) / 10} mm`;

  return (
    <div className="flex h-dvh flex-col bg-bc-media text-bc-on-media" aria-label={t('handy.title', 'Phone viewfinder')}>
      <header className="flex items-center gap-2 px-3 pb-1 pt-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-bc-full text-sm font-bold" style={{ background: k.farbe, color: kontrastText(k.farbe) }}>{k.nr}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">{k.label} · {obj.name} · {k.ext > 1 ? `${mm(st.f)} × ${k.ext}` : mm(st.f)}</div>
          <div className="font-mono text-[11px] opacity-80">
            {k.modell} | {k.format} | {ziel.hDeg.toFixed(1)}° × {ziel.vDeg.toFixed(1)}° | {format(t('handy.widthAt', '{w} m wide at {d} m'), { w: bildBreite.toFixed(1), d: st.dist.toFixed(1) })}
          </div>
        </div>
        {paket.k.length > 1 && (
          <select
            value={kIdx}
            onChange={(e) => wechselKamera(Number(e.target.value))}
            aria-label={t('handy.camera', 'Camera')}
            className="max-w-[40%] rounded-bc-m border border-bc-border bg-bc-panel-raised px-2 py-1 text-xs text-bc-text-bright"
          >
            {paket.k.map((c, i) => <option key={c.id} value={i}>{c.nr} · {c.label}</option>)}
          </select>
        )}
      </header>

      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-contain" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" data-handy-sucher />
        {!laeuft && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="flex max-w-sm flex-col items-center gap-3">
              <button type="button" onClick={() => void starten()} className="bc-btn-primary flex items-center gap-2 px-5 py-3 text-base">
                <FiCamera size={18} /> {t('handy.start', 'Start camera')}
              </button>
              <p className="text-xs opacity-80">{t('handy.startHint', 'Stand where the camera will stand and hold the phone like the camera. The frame shows what the chosen lens would see.')}</p>
              {fehler && <p className="text-xs text-bc-red-text">{fehler}</p>}
            </div>
          </div>
        )}
        {k.set.length > 1 && (
          <>
            <button type="button" onClick={() => blaettern(-1)} className={`${KNOPF} absolute left-2 top-1/2 -translate-y-1/2`} aria-label={t('preview.lensPrev', 'Previous lens')}><FiChevronLeft size={22} /></button>
            <button type="button" onClick={() => blaettern(1)} className={`${KNOPF} absolute right-2 top-1/2 -translate-y-1/2`} aria-label={t('preview.lensNext', 'Next lens')}><FiChevronRight size={22} /></button>
          </>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-2 flex flex-wrap justify-center gap-2 px-14">
          {!geeicht && <span className={`${PILLE} bg-bc-scrim`}>{t('handy.approx', 'Approximate — phone not calibrated')}</span>}
          {laeuft && vh > vw && <span className={`${PILLE} bg-bc-scrim`}>{t('handy.turn', 'Hold the phone sideways for the 16:9 frame')}</span>}
          {rahmen.zuWeit && (
            <span className={`${PILLE} bg-bc-yellow text-bc-dark`} role="status">
              {format(t('handy.tooWide', 'Wider than this phone camera — only {p} % of the frame is visible'), { p: Math.round(rahmen.sichtbar * 100) })}
            </span>
          )}
        </div>
      </div>

      <nav className="flex gap-1 px-3 pt-2" aria-label={t('handy.sections', 'Sections')}>
        {([['bild', t('handy.tab.frame', 'Frame')], ['eichung', t('handy.tab.calibrate', 'Calibrate')], ['position', t('handy.tab.position', 'Back to plan')]] as [Reiter, string][]).map(([id, name]) => (
          <button key={id} type="button" onClick={() => setReiter(id)} aria-pressed={reiter === id} className={`${PILLE} ${reiter === id ? 'bg-bc-accent text-bc-on-media' : 'bg-bc-scrim'}`}>{name}</button>
        ))}
      </nav>

      <section className="max-h-[42dvh] overflow-y-auto px-3 pb-3 pt-2 text-bc-text">
        <div className="flex flex-col gap-2 rounded-bc-l bg-bc-panel p-3">
          {reiter === 'bild' && (
            <>
              <Regler
                label={t('handy.focal', 'Focal length')}
                value={st.f}
                min={obj.min}
                max={Math.max(obj.max, obj.min + 0.1)}
                skala="log"
                einheit="mm"
                dezimalen={1}
                disabled={obj.max <= obj.min}
                onChange={(f) => { setStand({ f }); setCode(null); }}
              />
              <Regler label={t('handy.distance', 'Distance to subject')} value={st.dist} min={1} max={150} skala="log" einheit="m" dezimalen={1} onChange={(dist) => setStand({ dist })} />
              <div className="flex flex-wrap gap-1">
                {(['none', ...RAHMENMASKEN] as Rahmenmaske[]).map((m) => (
                  <button key={m} type="button" onClick={() => setStand({ maske: m })} aria-pressed={st.maske === m} className={`${PILLE} ${st.maske === m ? 'bg-bc-accent text-bc-on-media' : 'bg-bc-sunken'}`}>
                    {m === 'none' ? '16:9' : m}
                  </button>
                ))}
                <button type="button" onClick={() => setSicher((v) => !v)} aria-pressed={sicher} className={`${PILLE} ${sicher ? 'bg-bc-accent text-bc-on-media' : 'bg-bc-sunken'}`}>{t('handy.safe', 'Title safe')}</button>
              </div>
            </>
          )}
          {reiter === 'eichung' && (
            <>
              <p className="text-xs text-bc-muted">{t('handy.calibrateHint', 'Most main phone cameras are about 24–28 mm (35 mm equivalent). For an exact frame: hold the phone at a known distance from something of known width, move the two lines onto its edges and save.')}</p>
              <Regler label={t('handy.equiv', 'Phone camera (35 mm equivalent)')} value={eichung.aequiv} min={13} max={77} skala="log" einheit="mm" dezimalen={0} standard={26} onChange={(aequiv) => setEichung({ aequiv })} />
              <Regler label={t('handy.objectWidth', 'Object width')} value={mess.breite} min={0.1} max={20} skala="log" einheit="m" dezimalen={2} onChange={(breite) => setMess((m) => ({ ...m, breite }))} />
              <Regler label={t('handy.objectDistance', 'Distance to object')} value={mess.abstand} min={0.3} max={50} skala="log" einheit="m" dezimalen={2} onChange={(abstand) => setMess((m) => ({ ...m, abstand }))} />
              <Regler label={t('handy.objectShare', 'Lines apart (share of picture)')} value={mess.anteil * 100} min={5} max={100} einheit="%" dezimalen={0} onChange={(p) => setMess((m) => ({ ...m, anteil: p / 100 }))} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={messLang === null} onClick={() => messLang !== null && setEichung({ aequiv: eichung.aequiv, lang: messLang })} className="bc-btn-primary px-3 py-1.5 text-xs">
                  {t('handy.saveCalibration', 'Save calibration')}
                </button>
                {geeicht && (
                  <button type="button" onClick={() => setEichung({ aequiv: eichung.aequiv })} className="bc-btn-soft px-3 py-1.5 text-xs">{t('handy.resetCalibration', 'Use estimate again')}</button>
                )}
                <span className="text-xs text-bc-muted">{format(t('handy.phoneAngle', 'Phone: {a}° along the long side'), { a: langDeg.toFixed(1) })}</span>
              </div>
            </>
          )}
          {reiter === 'position' && (
            <>
              <Regler label={t('handy.height', 'Lens height')} value={hoehe} min={0} max={15} einheit="m" dezimalen={2} onChange={(v) => { setHoehe(v); setCode(null); }} />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={neigungNehmen} onChange={(e) => setNeigungNehmen(e.target.checked)} />
                {neigung !== undefined
                  ? format(t('handy.tiltMeasured', 'Take the measured tilt ({v}°)'), { v: neigung.toFixed(1) })
                  : t('handy.tiltNone', 'Tilt: no motion sensor')}
              </label>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button type="button" disabled={!lage} onClick={() => lage && setKursNull(lage.kurs)} className="bc-btn-soft px-3 py-1.5 text-xs">{t('handy.zeroHeading', 'Aim at the planned target, then tap')}</button>
                <span className="text-bc-muted">
                  {pan !== undefined ? format(t('handy.panNow', 'Pan in the plan: {v}°'), { v: pan.toFixed(1) }) : t('handy.panHint', 'Without this the pan in the plan stays as it is.')}
                </span>
              </div>
              <input
                type="text"
                value={notiz}
                onChange={(e) => { setNotiz(e.target.value); setCode(null); }}
                placeholder={t('handy.notePlaceholder', 'Note, e.g. “pillar in the way”')}
                className="rounded-bc-m border border-bc-border bg-bc-panel-raised px-2 py-1.5 text-sm text-bc-text-bright"
              />
              <button type="button" onClick={codeBauen} className="bc-btn-primary px-3 py-2 text-sm">{t('handy.makeCode', 'Create exchange code')}</button>
              {code && (
                <div className="flex flex-col gap-2">
                  <code className="break-all rounded-bc-m bg-bc-sunken p-2 text-[11px] text-bc-text-bright" data-rueck-code>{code}</code>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(code)} className="bc-btn-soft flex items-center gap-1 px-3 py-1.5 text-xs"><FiCopy size={14} /> {t('handy.copy', 'Copy')}</button>
                    <button type="button" onClick={() => void teilen()} className="bc-btn-soft flex items-center gap-1 px-3 py-1.5 text-xs"><FiShare2 size={14} /> {t('handy.share', 'Send')}</button>
                  </div>
                  <p className="text-xs text-bc-muted">{t('handy.codeHint', 'In the planner: viewfinder → phone → paste the code. It sets lens, focal length, height, tilt and pan of this camera; move the camera in the 2D plan to where you stood.')}</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
