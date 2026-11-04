import type { AdapterInfo, Camera, Lens, SensorSize } from '../types';

/**
 * Optische Konverter zwischen Objektiv und Body (#241): eine Korrekturoptik,
 * die den kleinen Bildkreis eines B4-Objektivs auf einen groesseren Sensor
 * vergroessert. Brennweite und Blende wachsen um `magnification`, der
 * Lichtverlust steht als eigene Datenblattzahl dabei.
 *
 * Nur Werte aus dem Hersteller-Datenblatt; jede Zahl hat ihren Beleg in
 * `specSource`.
 */
export interface LensAdapter {
  id: string;
  manufacturer: string;
  model: string;
  manufacturerUrl: string;
  /** Bajonett auf der Objektivseite. */
  lensMount: string;
  /** Wechselbare Bajonette auf der Kameraseite. */
  bodyMounts: string[];
  magnification: number;
  imageCircleMm: number;
  lightLossStops: number;
  maxInputTStop?: number;
  /** Baulaenge Objektiv- bis Kameraflansch in mm. */
  lengthMm?: number;
  specSource: Record<string, { value: string; source: string }>;
}

const IBE = (sheet: string, stand: string) => `IB/E Optics, Datenblatt ${sheet} (${stand})`;

const ibe = (
  id: string,
  model: string,
  url: string,
  sheet: string,
  stand: string,
  v: { m: number; circle: number; loss: number; length: number; bodyMounts: string[] },
): LensAdapter => {
  const src = IBE(sheet, stand);
  return {
    id,
    manufacturer: 'IB/E Optics',
    model,
    manufacturerUrl: url,
    lensMount: 'B4',
    bodyMounts: v.bodyMounts,
    magnification: v.m,
    imageCircleMm: v.circle,
    lightLossStops: v.loss,
    maxInputTStop: 1.9,
    lengthMm: v.length,
    specSource: {
      magnification: { value: String(v.m), source: src },
      imageCircleMm: { value: String(v.circle), source: src },
      lightLossStops: { value: String(v.loss), source: src },
      maxInputTStop: { value: '1.9', source: src },
      lengthMm: { value: String(v.length), source: src },
      bodyMounts: { value: v.bodyMounts.join(','), source: src },
    },
  };
};

export const LENS_ADAPTERS: LensAdapter[] = [
  ibe('ibe-hdx1-4', 'HDx1.4', 'https://static.onepage.io/media/Datasheet_HDx14_012024-0383dbbd-3691-4324-aaab-4e27fb7be2e6.pdf', 'HDx1.4, Item 500000012826', '01/2024',
    { m: 1.35, circle: 16.0, loss: 1.0, length: 15.0, bodyMounts: ['PL', 'E', 'EF', 'MFT', 'NF'] }),
  ibe('ibe-hdx2-mk2', 'HDx2 Mark II', 'https://static.onepage.io/media/Datasheet_HDx2-Mark-II_EN_0124-4410e4d1-58f3-4dd6-bd3d-b7866a1caac6.pdf', 'HDx2 Mark II, Item 190902400500', '01/2024',
    { m: 2.2, circle: 25.5, loss: 2.2, length: 50.7, bodyMounts: ['PL', 'EF', 'NF', 'E', 'FZ', 'MFT'] }),
  ibe('ibe-hdx35-mk3', 'HDx35 Mark III', 'https://static.onepage.io/media/Datasheet_HDx35-Mark-III_EN_052024-8a435c6a-8ffa-43ca-a9a8-d84722ebdef3.pdf', 'HDx35 Mark III, Item 500000000005', '05/2024',
    { m: 2.6, circle: 30.2, loss: 2.5, length: 61.6, bodyMounts: ['PL', 'EF', 'NF', 'E', 'FZ', 'MFT'] }),
  ibe('ibe-hdx6k', 'HDx6K', 'https://static.onepage.io/media/Datasheet_HDx6K_EN_012024-57289d67-f7fa-47cf-864d-b068fbfd7ae9.pdf', 'HDx6K, Item 500000001550', '01/2024',
    { m: 3.2, circle: 37.2, loss: 3.36, length: 70.2, bodyMounts: ['PL', 'EF', 'E', 'FZ', 'MFT'] }),
];

/** Auflagemass je Bajonett in mm, nur mit Normbeleg. */
export const FLANGE_FOCAL_MM: Readonly<Record<string, { mm: number; source: string }>> = {
  B4: { mm: 48.0, source: 'ARIB TR-B37 v1.1, Kap. 4 (2/3-Zoll-Kameras, B4-Bajonett)' },
};

export function getLensAdapter(id: string | undefined): LensAdapter | undefined {
  return id ? LENS_ADAPTERS.find((a) => a.id === id) : undefined;
}

/** Konverter, die auf das native Bajonett dieses Bodys passen. */
export function adaptersForBody(camera: Pick<Camera, 'mount'>): LensAdapter[] {
  return LENS_ADAPTERS.filter((a) => a.bodyMounts.includes(camera.mount));
}

/** Der wirksame Konverter: passt an den Body und traegt dieses Objektiv. */
export function activeLensAdapter(camera: Pick<Camera, 'mount'>, lens: Pick<Lens, 'mount'> | undefined, id: string | undefined): LensAdapter | undefined {
  const a = getLensAdapter(id);
  if (!a || !a.bodyMounts.includes(camera.mount)) return undefined;
  if (lens && lens.mount !== a.lensMount) return undefined;
  return a;
}

/** Der Sensor, wie das Objektiv ihn hinter der Vergroesserung sieht. */
export function sensorBehindAdapter(sensor: SensorSize, a: LensAdapter): SensorSize {
  const m = a.magnification;
  return {
    name: `${sensor.name} ÷ ${m}× (${a.model})`,
    widthMm: sensor.widthMm / m,
    heightMm: sensor.heightMm / m,
    cropFactor: sensor.cropFactor * m,
  };
}

export function adapterInfoOf(a: LensAdapter, sensor: SensorSize): AdapterInfo {
  return {
    name: `${a.manufacturer} ${a.model}`,
    lightLossStops: a.lightLossStops,
    cropSensor: sensorBehindAdapter(sensor, a),
    magnification: a.magnification,
    imageCircleMm: a.imageCircleMm,
  };
}
