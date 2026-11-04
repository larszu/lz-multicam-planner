import { describe, it, expect } from 'vitest';
import type { VenueCamera } from '../types';
import {
  buildCameraMapSvg,
  cameraSymbol,
  fcpTime,
  matchCamera,
  parseCutText,
  parseFcpxmlCuts,
  pdfWithJpeg,
  planMassstabText,
  scaleBarM,
  timecodeSeconds,
  type CameraMapInput,
} from '../utils/cameraMap';

const cam = (id: string, label: string, o: Partial<VenueCamera> = {}): VenueCamera => ({
  id, label, cameraId: 'x', lensId: 'y', x: 5, y: 5, z: 1.4, pan: 0, tilt: 0,
  focalLength: 50, aperture: 4, focusDistance: 8, color: '#ff0000', extenderActive: 1, ...o,
});
const cams = [cam('a', 'CAM 1'), cam('b', 'CAM 2'), cam('c', 'Crane', { mountType: 'jib', travelShape: 'swing' })];

const input = (o: Partial<CameraMapInput> = {}): CameraMapInput => ({
  title: 'Camera map — Hall',
  subtitle: 'Rev 3',
  venue: { widthM: 30, heightM: 20, stages: [{ id: 's', x: 10, y: 2, width: 10, height: 4, label: 'Stage & Band' }], seatingBlocks: [{ id: 'p', x: 15, y: 14, width: 12, rows: 6, label: 'Floor' }], videoWalls: [] },
  walls: [{ id: 'w', x1: 0, y1: 0, x2: 30, y2: 0, label: '' }],
  plan: null,
  cameras: cams.map((c) => ({ cam: c, optics: 'Body · 24–105 mm', rig: 'Tripod · 1.40 m', fovDeg: 40 })),
  theme: 'light',
  labels: true,
  numbering: 'number',
  texts: { legend: 'Cameras', scale: 'venue 30 × 20 m', planSource: 'No floor plan' },
  ...o,
});

describe('camera map', () => {
  it('numbers from the camera name, letters by order', () => {
    expect(cameraSymbol({ label: 'CAM 7' }, 0, 'number')).toBe('7');
    expect(cameraSymbol({ label: 'Crane' }, 2, 'number')).toBe('3');
    expect(cameraSymbol({ label: 'x' }, 0, 'letter')).toBe('A');
    expect(cameraSymbol({ label: 'x' }, 25, 'letter')).toBe('Z');
    expect(cameraSymbol({ label: 'x' }, 26, 'letter')).toBe('AA');
  });

  it('draws every camera with symbol, labels, legend and the crane path', () => {
    const { svg, width, height } = buildCameraMapSvg(input());
    expect(width).toBe(1600);
    expect(height).toBeGreaterThan(400);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Stage &amp; Band');
    expect(svg.match(/Body · 24–105 mm/g)?.length).toBe(6);
    expect(svg).toContain('<polyline');
    expect(svg).toContain('>1</text>');
    expect(svg).not.toContain('<animate');
  });

  it('labels can be switched off and the theme changes the background', () => {
    const plain = buildCameraMapSvg(input({ labels: false, theme: 'dark' })).svg;
    expect(plain).not.toContain('Body · 24–105 mm');
    expect(plain).toContain('#1E1F23');
  });

  it('a cut list makes it an animated SVG with a timeline', () => {
    const { svg } = buildCameraMapSvg(input({ cuts: [{ cameraId: 'a', startS: 0, endS: 4 }, { cameraId: 'b', startS: 4, endS: 10 }] }));
    expect(svg).toContain('<animate');
    expect(svg).toContain('animateTransform');
    expect(svg).toContain('dur="10.000s"');
  });

  it('writes plan source and scale', () => {
    expect(planMassstabText({ scaleX: 0.01, scaleY: 0.01, widthPx: 3000, heightPx: 2000 })).toBe('10.0 mm/px · 30.0 × 20.0 m');
    expect(scaleBarM(30)).toBe(10);
    expect(scaleBarM(3)).toBe(1);
  });
});

describe('cut lists', () => {
  it('reads FCPXML times and timecodes', () => {
    expect(fcpTime('1001/30000s')).toBeCloseTo(0.0334, 3);
    expect(fcpTime('12s')).toBe(12);
    expect(timecodeSeconds('00:01:02:13')).toBeCloseTo(62.52);
    expect(timecodeSeconds('1:30')).toBe(90);
    expect(timecodeSeconds('4,5')).toBe(4.5);
  });

  it('matches clip names to cameras', () => {
    expect(matchCamera('Cam1', cams, 'number')).toBe('a');
    expect(matchCamera('CAM 2 - wide', cams, 'number')).toBe('b');
    expect(matchCamera('C', cams, 'letter')).toBe('c');
    expect(matchCamera('nothing', cams, 'number')).toBeNull();
  });

  it('reads a text list with one cut per line', () => {
    const cuts = parseCutText('# start camera\n00:00:00:00 CAM 1\n00:00:04:00, CAM 2\n10 end', cams, 'number');
    expect(cuts).toEqual([{ cameraId: 'a', startS: 0, endS: 4 }, { cameraId: 'b', startS: 4, endS: 10 }]);
  });

  it('reads the primary storyline of an FCPXML, multicam clips by their active angle', () => {
    const xml = `<?xml version="1.0"?><fcpxml version="1.10"><resources><media id="m"><multicam><mc-angle name="CAM 2" angleID="x2"/><mc-angle name="CAM 1" angleID="x1"/></multicam></media></resources>
      <library><event><project><sequence><spine>
        <asset-clip name="CAM 1" offset="3600s" duration="5s"/>
        <mc-clip name="Multicam" offset="3605s" duration="3s"><mc-source angleID="x2" srcEnable="video"/><mc-source angleID="x1" srcEnable="audio"/></mc-clip>
        <gap offset="3608s" duration="1s"/>
      </spine></sequence></project></event></library></fcpxml>`;
    expect(parseFcpxmlCuts(xml, cams, 'number')).toEqual([
      { cameraId: 'a', startS: 0, endS: 5 },
      { cameraId: 'b', startS: 5, endS: 8 },
    ]);
  });
});

describe('PDF', () => {
  it('writes a one-page PDF around the JPEG', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = pdfWithJpeg(jpeg, 1600, 900, 'Hall (A)');
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/DCTDecode');
    expect(text).toContain('/Title (Hall \\(A\\))');
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    const off3 = Number(/0000000000 65535 f \n(?:\d{10} 00000 n \n){2}(\d{10})/.exec(text)?.[1]);
    expect(text.slice(off3, off3 + 7)).toBe('3 0 obj');
  });
});
