import { SENSORS, getCameraById, getEffectiveSensor } from '../../data/cameras';
import { getLensById } from '../../data/lenses';
import { computeFov, computeDof, personHeightInFrame } from '../../utils/fov';
import { useEffect, useRef, useState } from 'react';
import type { SensorSize } from '../../types';
import { useStore } from '../../store/useStore';
import { useTranslation, format } from '../../i18n';

/**
 * FOV- und Schaerfentiefe-Rechner.
 *
 * ─── ER FOLGT DER GEWAEHLTEN KAMERA ─────────────────────────────────────
 *
 * NUTZER-AUFTRAG 2026-09-12: „FOV und schaerfetiefen rechner muss verknuepft
 * sein mit der ausgewaehlten kamera."
 *
 * Bis dahin stand der Rechner voellig fuer sich: 2/3", 20 mm, f/2.8, 10 m —
 * feste Anfangswerte, die mit dem Plan daneben nichts zu tun hatten. Wer
 * wissen wollte, was CAM 2 sieht, musste Sensor, Brennweite, Blende und
 * Abstand von Hand nachtragen und dabei auch noch wissen, welchen Sensor
 * das Gehaeuse mit diesem Adapter wirklich benutzt.
 *
 * Jetzt uebernimmt er die Werte der gewaehlten Kamera und folgt ihr, solange
 * niemand einen Regler anfasst.
 *
 * ─── UND ER LOEST SICH, SOBALD MAN RECHNET ──────────────────────────────
 *
 * Ein Rechner ist auch ein Was-waere-wenn. Wer die Brennweite schiebt, will
 * genau NICHT, dass der naechste Klick im Plan seine Eingabe zuruecksetzt.
 * Ab der ersten eigenen Eingabe steht „eigene Werte" oben, und ein Knopf
 * holt die Kamera zurueck. Das ist derselbe Gedanke wie beim Preset im
 * Licht-Planer: kopieren statt verlinken, und sichtbar machen, dass es
 * kopiert ist.
 *
 * WAS DER RECHNER NICHT TUT: er schreibt nichts zurueck. Eine hier gedrehte
 * Brennweite ist eine Rechnung und keine Aenderung am Plan — sonst haette
 * jedes Ausprobieren die Kamera verstellt.
 */
export default function Calculator() {
  const { t } = useTranslation();
  const cameras = useStore((s) => s.cameras);
  const customCameras = useStore((s) => s.customCameras);
  const customLenses = useStore((s) => s.customLenses);
  const selectedCameraId = useStore((s) => s.selectedCameraId);
  const gewaehlt = cameras.find((c) => c.id === selectedCameraId);

  const [sensorKey, setSensorKey] = useState<string>('TWO_THIRD');
  const [focalLength, setFocalLength] = useState(20);
  const [aperture, setAperture] = useState(2.8);
  const [distance, setDistance] = useState(10);
  const [extender, setExtender] = useState(1);
  /** Eigene Eingabe gemacht? Dann folgt der Rechner der Auswahl nicht mehr. */
  const [gelöst, setGelöst] = useState(false);

  /**
   * Die Werte der Kamera in die Regler holen.
   *
   * Der Sensor kommt aus `getEffectiveSensor` und nicht aus `camera.sensor`:
   * ein B4-Adapter oder ein Crop-Modus aendert ihn, und genau diese Faelle
   * sind der Grund, warum jemand den Rechner ueberhaupt aufmacht. Ein
   * Rechner, der den nominalen Sensor nimmt, rechnet in diesen Faellen
   * falsch — und zwar plausibel falsch.
   */
  const ausKamera = () => {
    if (!gewaehlt) return;
    const kamera = getCameraById(gewaehlt.cameraId, customCameras);
    const objektiv = getLensById(gewaehlt.lensId, customLenses);
    if (kamera && objektiv) {
      const s = getEffectiveSensor(
        kamera,
        objektiv,
        gewaehlt.useSpeedbooster,
        gewaehlt.sensorModeIndex,
      );
      const treffer = Object.entries(SENSORS).find(([, v]) => v.name === s.name);
      if (treffer) setSensorKey(treffer[0]);
    }
    setFocalLength(gewaehlt.focalLength);
    setAperture(gewaehlt.aperture);
    setDistance(gewaehlt.focusDistance);
    setExtender(gewaehlt.extenderActive || 1);
    setGelöst(false);
  };

  // Der Auswahl folgen, solange niemand selbst gerechnet hat. `ausKamera`
  // steht bewusst NICHT in der Abhaengigkeitsliste: die Funktion entsteht bei
  // jedem Rendern neu, und mit ihr liefe der Effekt in einer Schleife.
  const letzteAuswahl = useRef<string | null>(null);
  useEffect(() => {
    if (gelöst) return;
    if (!gewaehlt) return;
    if (letzteAuswahl.current === gewaehlt.id) return;
    letzteAuswahl.current = gewaehlt.id;
    ausKamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gewaehlt?.id, gelöst]);

  const eigen = <T,>(setzen: (v: T) => void) => (v: T) => {
    setGelöst(true);
    setzen(v);
  };

  const sensor: SensorSize = SENSORS[sensorKey as keyof typeof SENSORS];
  const fov = computeFov(sensor, focalLength, distance, extender);
  const dof = computeDof(sensor, focalLength, aperture, distance, extender);
  const personPx = personHeightInFrame(sensor.heightMm, focalLength * extender, distance);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-bold text-bc-text-bright mb-1">{t('sidebar.calc.title', 'FOV & DoF Calculator')}</h2>

      {/* WOHER DIE ZAHLEN KOMMEN — die Zeile, die den Rechner mit dem Plan
          verbindet. Ohne sie steht er wieder fuer sich, und niemand sieht,
          ob er gerade CAM 2 rechnet oder etwas Ausgedachtes. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-bc-muted">
        {gewaehlt ? (
          <>
            <span>
              {format(t('sidebar.calc.fromCamera', 'From {label}'), { label: gewaehlt.label })}
              {gelöst ? ` · ${t('sidebar.calc.detached', 'own values')}` : ''}
            </span>
            {gelöst && (
              <button
                type="button"
                onClick={ausKamera}
                className="border border-bc-border px-2 py-0.5 text-bc-text hover:border-bc-accent hover:text-bc-text-bright"
              >
                {t('sidebar.calc.reload', 'Take values from the camera again')}
              </button>
            )}
          </>
        ) : (
          <span>{t('sidebar.calc.noCamera', 'No camera selected — the values below are your own.')}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Sensor */}
        <label className="block text-xs">
          <span className="text-bc-muted">{t('sidebar.calc.sensorSize', 'Sensor size')}</span>
          <select
            className="block w-full mt-1 border border-bc-border bg-bc-panel-raised px-2 py-1.5 text-bc-text-bright text-sm"
            value={sensorKey}
            onChange={(e) => eigen(setSensorKey)(e.target.value)}
          >
            {Object.entries(SENSORS).map(([key, s]) => (
              <option key={key} value={key}>{s.name} ({s.widthMm}×{s.heightMm}mm)</option>
            ))}
          </select>
        </label>

        {/* Focal length */}
        <label className="block text-xs">
          <span className="text-bc-muted">{format(t('sidebar.calc.focalLength', 'Focal length: {v}mm'), { v: focalLength })}</span>
          <input
            type="range"
            className="w-full mt-1 accent-bc-accent"
            min={2}
            max={1000}
            step={0.5}
            value={focalLength}
            onChange={(e) => eigen(setFocalLength)(parseFloat(e.target.value))}
          />
        </label>

        {/* Aperture */}
        <label className="block text-xs">
          <span className="text-bc-muted">{format(t('sidebar.calc.aperture', 'Aperture: f/{v}'), { v: aperture })}</span>
          <input
            type="range"
            className="w-full mt-1 accent-bc-accent"
            min={1}
            max={22}
            step={0.1}
            value={aperture}
            onChange={(e) => eigen(setAperture)(parseFloat(e.target.value))}
          />
        </label>

        {/* Distance */}
        <label className="block text-xs">
          <span className="text-bc-muted">{format(t('sidebar.calc.distance', 'Distance: {v}m'), { v: distance })}</span>
          <input
            type="range"
            className="w-full mt-1 accent-bc-accent"
            min={0.5}
            max={200}
            step={0.5}
            value={distance}
            onChange={(e) => eigen(setDistance)(parseFloat(e.target.value))}
          />
        </label>

        {/* Extender */}
        <label className="block text-xs">
          <span className="text-bc-muted">{t('sidebar.calc.extender', 'Extender')}</span>
          <select
            className="block w-full mt-1 border border-bc-border bg-bc-panel-raised px-2 py-1.5 text-bc-text-bright text-sm"
            value={extender}
            onChange={(e) => eigen(setExtender)(parseFloat(e.target.value))}
          >
            <option value={1}>{t('sidebar.calc.extenderOff', 'Off (1×)')}</option>
            <option value={1.4}>1.4×</option>
            <option value={2}>2×</option>
          </select>
        </label>
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-bc-m border border-bc-border bg-bc-panel-raised p-4">
          <h3 className="text-sm font-bold text-bc-accent mb-2">{t('sidebar.calc.fieldOfView', 'Field of View')}</h3>
          <div className="space-y-1 text-sm text-bc-text">
            <div>{t('sidebar.calc.horizontal', 'Horizontal:')} <strong>{fov.horizontalDeg.toFixed(2)}°</strong></div>
            <div>{t('sidebar.calc.vertical', 'Vertical:')} <strong>{fov.verticalDeg.toFixed(2)}°</strong></div>
            <div>{t('sidebar.calc.diagonal', 'Diagonal:')} <strong>{fov.diagonalDeg.toFixed(2)}°</strong></div>
            <div className="pt-2">{t('sidebar.calc.imageWidth', 'Image width:')} <strong>{fov.imageWidthAtDistance.toFixed(2)}m</strong></div>
            <div>{t('sidebar.calc.imageHeight', 'Image height:')} <strong>{fov.imageHeightAtDistance.toFixed(2)}m</strong></div>
            <div className="pt-2">{t('sidebar.calc.eqFl', '35mm eq. FL:')} <strong>{fov.equivalentFocalLength.toFixed(0)}mm</strong></div>
          </div>
        </div>

        <div className="rounded-bc-m border border-bc-border bg-bc-panel-raised p-4">
          <h3 className="text-sm font-bold text-bc-green mb-2">{t('sidebar.calc.depthOfField', 'Depth of Field')}</h3>
          <div className="space-y-1 text-sm text-bc-text">
            <div>{t('sidebar.calc.near', 'Near:')} <strong>{dof.nearLimit < 0.01 ? '0' : dof.nearLimit.toFixed(2)}m</strong></div>
            <div>{t('sidebar.calc.far', 'Far:')} <strong>{dof.farLimit === Infinity ? '∞' : dof.farLimit.toFixed(2) + 'm'}</strong></div>
            <div>{t('sidebar.calc.totalDof', 'Total DoF:')} <strong>{dof.totalDof === Infinity ? '∞' : dof.totalDof.toFixed(2) + 'm'}</strong></div>
            <div className="pt-2">{t('sidebar.calc.hyperfocal', 'Hyperfocal:')} <strong>{dof.hyperfocal.toFixed(2)}m</strong></div>
            <div>{t('sidebar.calc.coc', 'CoC:')} <strong>{(dof.circleOfConfusion * 1000).toFixed(1)}µm</strong></div>
          </div>
        </div>

        <div className="rounded-bc-m border border-bc-border bg-bc-panel-raised p-4 col-span-2">
          <h3 className="text-sm font-bold text-bc-yellow mb-2">{t('sidebar.calc.personInFrame', 'Person in Frame (1.80m)')}</h3>
          <div className="text-sm text-bc-text">
            {t('sidebar.calc.heightIn1080p', 'Height in 1080p:')} <strong>{personPx.toFixed(0)}px</strong> ({((personPx / 1080) * 100).toFixed(1)}% {t('sidebar.calc.ofFrame', 'of frame')})
          </div>
          <div className="mt-2 h-4 bg-bc-panel overflow-hidden">
            <div
              className="h-full bg-bc-yellow transition-all"
              style={{ width: `${Math.min(100, (personPx / 1080) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
