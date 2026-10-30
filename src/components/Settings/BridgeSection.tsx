import { useState } from 'react';
import { useTranslation, format } from '../../i18n';
import { atemApi, BRIDGE_DEFAULT_URL, useBridgeLive } from '../../store/bridgeLive';
import { useStore } from '../../store/useStore';
import { isVirtualMixer, matchInputsByName, mixerInputFor, type MixerBus } from '../../utils/bridgeLive';
import BridgeStatusText from '../Bridge/BridgeStatusText';

const feld = 'block w-full border border-bc-border bg-bc-panel-raised text-xs text-bc-text-bright';
const kopf = 'text-sm font-semibold text-bc-text-bright';
// Gerätenamen der Mischertypen der Bridge (`switcher/SwitcherClient.ts`).
const KIND_LABEL: Record<string, string> = {
  atem: 'Blackmagic ATEM', 'vis-catc': 'VIS-CATC', 'vision-mixer': 'LZ Vision Mixer', vmix: 'vMix',
  obs: 'OBS', roland: 'Roland', 'panasonic-hs': 'Panasonic', ross: 'Ross', tricaster: 'TriCaster', kframe: 'K-Frame',
};

export default function BridgeSection() {
  const { t } = useTranslation();
  const { enabled, url, setEnabled, setUrl, mixerNumber, setMixerNumber, mixers, mixerDrives, setMixerDrives, mixerSource, setMixerSource, atemHost, setAtemHost, atemBus } = useBridgeLive();
  const direkt = mixerSource === 'atem';
  const gefolgt = direkt ? atemBus ?? undefined : mixers.find((m) => m.switcherNumber === mixerNumber);
  const folgt = direkt || mixerNumber !== null;
  const desktop = !!atemApi();
  const [atemEntwurf, setAtemEntwurf] = useState(atemHost);
  const atemUebernehmen = () => { if (atemEntwurf.trim() !== atemHost) setAtemHost(atemEntwurf.trim()); };
  // Die Mischer der Bridge mit Namen; ohne Liste (noch nicht verbunden) 1–8.
  const wahl: Pick<MixerBus, 'switcherNumber' | 'label' | 'kind' | 'connected'>[] = mixers.length
    ? [...mixers].sort((a, b) => a.switcherNumber - b.switcherNumber)
    : [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ switcherNumber: n }));
  if (mixerNumber !== null && !wahl.some((m) => m.switcherNumber === mixerNumber)) wahl.push({ switcherNumber: mixerNumber });
  const mischerName = (m: Pick<MixerBus, 'switcherNumber' | 'label' | 'kind' | 'connected'>) => {
    const n = format(t('settings.bridge.mixer.n', 'Mixer {n}'), { n: m.switcherNumber });
    const art = m.kind === 'virtual' ? t('settings.bridge.mixer.virtual', 'Virtual mixer') : m.kind ? (KIND_LABEL[m.kind] ?? m.kind) : '';
    return [n, m.label, art, m.connected === false ? t('settings.bridge.mixer.offline', 'offline') : ''].filter(Boolean).join(' · ');
  };
  const [entwurf, setEntwurf] = useState(url);
  const uebernehmen = () => setUrl(entwurf.trim() || BRIDGE_DEFAULT_URL);

  return (
    <div>
      <section>
        <h3 className={kopf}>{t('settings.bridge.title', 'Live from LZ Camera Bridge')}</h3>
        <p className="mt-1 text-xs text-bc-muted">
          {t(
            'settings.bridge.desc',
            'Pan, tilt and zoom reported by the bridge (for example from a control panel joystick) move the planned cameras in 2D and 3D. The plan only changes when you click "Apply" on a camera.',
          )}
        </p>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-bc-text">
          <input type="checkbox" className="accent-bc-accent" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t('settings.bridge.enable', 'Connect to the bridge')}
        </label>
        <p className="mt-2 text-xs"><BridgeStatusText /></p>
      </section>
      <section style={{ marginTop: '24px' }}>
        <h3 className={kopf}>{t('settings.bridge.url', 'Address')}</h3>
        <input
          type="text"
          className={`${feld} mt-2`}
          style={{ padding: '6px 8px' }}
          value={entwurf}
          placeholder={BRIDGE_DEFAULT_URL}
          onChange={(e) => setEntwurf(e.target.value)}
          onBlur={uebernehmen}
          onKeyDown={(e) => { if (e.key === 'Enter') uebernehmen(); }}
          spellCheck={false}
          aria-label={t('settings.bridge.url', 'Address')}
        />
        <p className="mt-1 text-xs text-bc-muted">
          {t('settings.bridge.mapping', 'Each planned camera follows the bridge camera with the number in its name (CAM 2 → 2). A different number can be set on the camera.')}
        </p>
      </section>
      <section style={{ marginTop: '24px' }}>
        <h3 className={kopf}>{t('settings.bridge.mixer', 'Multiview follows a mixer')}</h3>
        <select
          className={`${feld} mt-2`}
          style={{ padding: '6px 8px' }}
          value={direkt ? 'atem' : mixerNumber ?? 0}
          onChange={(e) => {
            if (e.target.value === 'atem') setMixerSource('atem');
            else setMixerNumber(Number(e.target.value) || null);
          }}
          aria-label={t('settings.bridge.mixer', 'Multiview follows a mixer')}
        >
          <option value={0}>{t('settings.bridge.mixer.off', 'No – the planner switches on its own')}</option>
          {wahl.map((m) => (
            <option key={m.switcherNumber} value={m.switcherNumber}>{mischerName(m)}</option>
          ))}
          <option value="atem" disabled={!desktop}>
            {desktop
              ? t('settings.bridge.atem', 'ATEM directly, without the bridge')
              : t('settings.bridge.atem.desktopOnly', 'ATEM directly – desktop app only')}
          </option>
        </select>
        <p className="mt-1 text-xs text-bc-muted">
          {t(
            'settings.bridge.mixer.desc',
            'Program and preview come from that mixer as it is switched – from a control panel, its own panel or anywhere else. An ATEM also works without the bridge, straight from the desktop app. Which camera sits on which input is set below.',
          )}
        </p>
        {direkt && (
          <div className="mt-3">
            <label className="block text-xs text-bc-text">
              {t('settings.bridge.atem.host', 'ATEM address')}
              <input
                type="text"
                className={`${feld} mt-1`}
                style={{ padding: '6px 8px' }}
                value={atemEntwurf}
                placeholder="192.168.10.240"
                onChange={(e) => setAtemEntwurf(e.target.value)}
                onBlur={atemUebernehmen}
                onKeyDown={(e) => { if (e.key === 'Enter') atemUebernehmen(); }}
                spellCheck={false}
              />
            </label>
            <p className="mt-1 text-xs" role="status">
              {!atemHost
                ? <span className="text-bc-muted">{t('settings.bridge.atem.noHost', 'Enter the address shown in ATEM Setup.')}</span>
                : atemBus?.connected
                  ? <span className="text-bc-green-text">{format(t('settings.bridge.atem.connected', 'Connected · {model}'), { model: atemBus.label ?? 'ATEM' })}</span>
                  : <span className="text-bc-muted">{format(t('settings.bridge.atem.connecting', 'Looking for the ATEM at {host} …'), { host: atemHost })}</span>}
            </p>
          </div>
        )}
        {gefolgt && !isVirtualMixer(gefolgt) && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-bc-text">
            <input type="checkbox" className="mt-0.5 accent-bc-accent" checked={mixerDrives} onChange={(e) => setMixerDrives(e.target.checked)} />
            <span>
              {t('settings.bridge.mixer.drives', 'Switch this mixer from the multiview')}
              <span className="block text-bc-muted">
                {t('settings.bridge.mixer.drivesDesc', 'Off: the planner only shows what the mixer does. On: CUT, AUTO and the tiles in the multiview switch the real mixer – on air.')}
              </span>
            </span>
          </label>
        )}
      </section>
      {folgt && <InputMapping bus={gefolgt} />}
    </div>
  );
}

/** Welche Planer-Kamera auf welchem Mischer-Eingang liegt. */
function InputMapping({ bus }: { bus: MixerBus | undefined }) {
  const { t } = useTranslation();
  const cameras = useStore((s) => s.cameras);
  const updateCamera = useStore((s) => s.updateCamera);
  // Der Mischer ohne Hardware hat seine Namen vom Planer — also nur die belegten;
  // dort und ohne gemeldete Namen stehen alle Nummern zur Wahl.
  const virtuell = isVirtualMixer(bus);
  const gemeldet = virtuell ? undefined : bus?.inputs?.length ? bus.inputs : undefined;
  const inputs = gemeldet
    ?? Array.from({ length: Math.max(16, cameras.length) }, (_, i) => ({ id: i + 1, name: bus?.inputs?.find((x) => x.id === i + 1)?.name ?? '' }));
  const treffer = gemeldet ? matchInputsByName(cameras, gemeldet) : {};
  const nachName = Object.entries(treffer).filter(([id, n]) => {
    const i = cameras.findIndex((c) => c.id === id);
    return mixerInputFor(cameras[i], i) !== n;
  });
  if (cameras.length === 0) return null;

  return (
    <section style={{ marginTop: '24px' }}>
      <h3 className={kopf}>{t('settings.bridge.inputs', 'Cameras on mixer inputs')}</h3>
      <p className="mt-1 text-xs text-bc-muted">
        {gemeldet
          ? t('settings.bridge.inputs.desc', 'Input names come from the mixer. Without a setting a camera sits on the input with its bridge number.')
          : virtuell
            ? t('settings.bridge.inputs.virtual', 'The virtual mixer takes its input names from these cameras. Without a setting a camera sits on the input with its bridge number.')
            : t('settings.bridge.inputs.noNames', 'The mixer reports no input names yet; numbers only. Without a setting a camera sits on the input with its bridge number.')}
      </p>
      {nachName.length > 0 && (
        <button
          type="button"
          className="bc-btn-soft mt-2 text-xs"
          style={{ padding: '4px 10px' }}
          onClick={() => nachName.forEach(([id, n]) => updateCamera(id, { mixerInput: n }))}
        >
          {format(t('settings.bridge.inputs.match', 'Assign by name ({n})'), { n: nachName.length })}
        </button>
      )}
      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)' }}>
        {cameras.map((cam, i) => {
          const wert = mixerInputFor(cam, i);
          return (
            <label key={cam.id} className="contents text-xs text-bc-text">
              <span className="truncate self-center">{cam.label}</span>
              <select
                className={feld}
                style={{ padding: '4px 6px' }}
                value={wert}
                aria-label={format(t('settings.bridge.inputs.aria', 'Mixer input for {name}'), { name: cam.label })}
                onChange={(e) => updateCamera(cam.id, { mixerInput: Number(e.target.value) })}
              >
                <option value={0}>{t('settings.bridge.inputs.none', 'Not on the mixer')}</option>
                {inputs.map((inp) => (
                  <option key={inp.id} value={inp.id}>{inp.name ? `${inp.id} · ${inp.name}` : String(inp.id)}</option>
                ))}
                {wert > 0 && !inputs.some((inp) => inp.id === wert) && <option value={wert}>{wert}</option>}
              </select>
            </label>
          );
        })}
      </div>
    </section>
  );
}
