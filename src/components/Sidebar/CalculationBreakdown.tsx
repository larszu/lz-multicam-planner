import type { Camera, Lens, SensorSize, FovResult, DofResult } from '../../types';
import { useTranslation } from '../../i18n';
import {
  personHeightInFrame, sensorDiagonalMm,
  PERSON_HEIGHT_M, OUTPUT_HEIGHT_PX, COC_DIVISOR,
} from '../../utils/fov';

/**
 * Step-by-step rendering of the optical formulas used by the calculator, with
 * the camera's current values substituted in. Useful for sanity-checking the
 * outputs in the sidebar without having to re-derive the math by hand.
 *
 * The formulas mirror `src/utils/fov.ts` exactly. Numeric formatting is kept
 * compact (≤ 3 decimals) so the table fits in the narrow camera card column.
 */
interface CalculationBreakdownProps {
  camDef: Camera;
  lensDef: Lens;
  sensor: SensorSize;
  fov: FovResult;
  dof: DofResult;
  focalLength: number;
  extender: number;
  aperture: number;
  focusDistance: number;
}

const fmt = (n: number, digits = 2): string => {
  if (!isFinite(n)) return '∞';
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(0);
  if (abs >= 10) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(digits);
  if (abs >= 0.01) return n.toFixed(3);
  return n.toExponential(2);
};

export function CalculationBreakdown({
  sensor,
  fov,
  dof,
  focalLength,
  extender,
  aperture,
  focusDistance,
}: CalculationBreakdownProps) {
  const { t } = useTranslation();
  const W = sensor.widthMm;
  const H = sensor.heightMm;
  const f = focalLength;
  const ext = extender;
  const fe = f * ext; // effective focal length
  const N = aperture;
  const c = dof.circleOfConfusion; // mm
  const s = focusDistance; // m
  // Nichts hier wird nachgerechnet. Vorher stand an dieser Stelle eine
  // Handkopie von `sensorDiagonalMm` und eine von `personHeightInFrame`, samt
  // Kommentar „(matches utils/fov.ts…)" — eine Uebereinstimmung, die jemand
  // von Hand pflegen muss, ist keine. Und diese Tafel ist genau die Stelle,
  // an der eine abweichende Zahl am meisten kostet: wer sie aufklappt, tut
  // das, weil er der Zahl darueber nicht traut.
  const D = sensorDiagonalMm(W, H); // sensor diagonal in mm
  const imgH = fov.imageHeightAtDistance;
  const personPx = personHeightInFrame(H, fe, s);

  const Row = ({ label, expr, color = 'text-bc-text' }: { label: string; expr: React.ReactNode; color?: string }) => (
    <div className="grid grid-cols-12 gap-1 leading-snug">
      <div className={`col-span-3 ${color} font-semibold`}>{label}</div>
      <div className="col-span-9 text-bc-muted break-words">{expr}</div>
    </div>
  );

  return (
    <div className="bg-bc-dark p-2 border border-bc-border text-[10px] font-mono space-y-1">
      <div className="text-bc-accent font-bold text-[11px] mb-1">{t('sidebar.calc.trace', 'CALCULATION TRACE')}</div>

      <div className="text-bc-dim text-[11px] -mt-0.5 mb-1">
        Sensor {sensor.name} · W={fmt(W)} mm · H={fmt(H)} mm · diag D={fmt(D)} mm
        {ext !== 1 && <> · f_eff = {fmt(f)} × {ext} = {fmt(fe)} mm</>}
      </div>

      <Row
        label="FOV_h"
        expr={<>2·atan(W / (2·f_eff)) = 2·atan({fmt(W)} / (2·{fmt(fe)})) = <span className="text-bc-green-text">{fmt(fov.horizontalDeg)}°</span></>}
      />
      <Row
        label="FOV_v"
        expr={<>2·atan(H / (2·f_eff)) = 2·atan({fmt(H)} / (2·{fmt(fe)})) = <span className="text-bc-green-text">{fmt(fov.verticalDeg)}°</span></>}
      />
      <Row
        label="FOV_d"
        expr={<>2·atan(D / (2·f_eff)) = 2·atan({fmt(D)} / (2·{fmt(fe)})) = <span className="text-bc-green-text">{fmt(fov.diagonalDeg)}°</span></>}
      />
      <Row
        label="Img W"
        expr={<>2·d·tan(FOV_h/2) = 2·{fmt(s)}·tan({fmt(fov.horizontalDeg / 2)}°) = <span className="text-bc-green-text">{fmt(fov.imageWidthAtDistance)} m</span></>}
      />
      <Row
        label="Img H"
        expr={<>2·d·tan(FOV_v/2) = 2·{fmt(s)}·tan({fmt(fov.verticalDeg / 2)}°) = <span className="text-bc-green-text">{fmt(fov.imageHeightAtDistance)} m</span></>}
      />
      <Row
        label="35mm eq"
        expr={<>f_eff · crop = {fmt(fe)} · {fmt(sensor.cropFactor, 3)} = <span className="text-bc-green-text">{fmt(fov.equivalentFocalLength)} mm</span></>}
      />

      <div className="border-t border-bc-border my-1" />

      <Row
        label="CoC"
        expr={<>D / {COC_DIVISOR} = {fmt(D)} / {COC_DIVISOR} = <span className="text-bc-yellow-text">{(c * 1000).toFixed(1)} µm</span></>}
        color="text-bc-text"
      />
      <Row
        label="Hyperf."
        expr={<>f_eff² / (N·c)/1000 + f_eff/1000 = {fmt(fe)}² / ({fmt(N)}·{fmt(c, 4)})/1000 + {fmt(fe)}/1000 = <span className="text-bc-yellow-text">{fmt(dof.hyperfocal)} m</span></>}
        color="text-bc-text"
      />
      <Row
        label="DoF near"
        expr={<>(H·s) / (H + s − f_eff/1000) = ({fmt(dof.hyperfocal)}·{fmt(s)}) / ({fmt(dof.hyperfocal)} + {fmt(s)} − {fmt(fe / 1000, 3)}) = <span className="text-bc-yellow-text">{fmt(dof.nearLimit)} m</span></>}
        color="text-bc-text"
      />
      <Row
        label="DoF far"
        expr={<>(H·s) / (H − s + f_eff/1000) = ({fmt(dof.hyperfocal)}·{fmt(s)}) / ({fmt(dof.hyperfocal)} − {fmt(s)} + {fmt(fe / 1000, 3)}) = <span className="text-bc-yellow-text">{fmt(dof.farLimit)} m</span></>}
        color="text-bc-text"
      />
      <Row
        label="DoF total"
        expr={<>far − near = {fmt(dof.farLimit)} − {fmt(dof.nearLimit)} = <span className="text-bc-yellow-text">{fmt(dof.totalDof)} m</span></>}
        color="text-bc-text"
      />

      <div className="border-t border-bc-border my-1" />

      <Row
        label={t('sidebar.calc.person', 'Person')}
        expr={<>{PERSON_HEIGHT_M.toFixed(2)} / img_h · {OUTPUT_HEIGHT_PX} = {PERSON_HEIGHT_M.toFixed(2)} / {fmt(imgH)} · {OUTPUT_HEIGHT_PX} = <span className="text-bc-red-text">{fmt(personPx, 0)} px</span> ({fmt((personPx / OUTPUT_HEIGHT_PX) * 100, 1)}%)</>}
        color="text-bc-text"
      />
    </div>
  );
}
