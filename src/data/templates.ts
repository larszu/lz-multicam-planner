import type { VenueTemplate } from '../types';

// Raum je Vorlage: Publikumsflaechen und Videowaende, damit die 3D-Ansicht
// gleich nach dem Laden wie der Ort aussieht. Kameras bleiben das Wichtigste;
// stehen sie in einer Publikumsflaeche, macht die 3D-Ansicht dort Platz.

/** Vier Tribuenen um ein 105 × 68-m-Feld; beim Konzert ohne die hinter der Buehne. */
function STADION_TRIBUENEN(mitNord: boolean): NonNullable<VenueTemplate['venue']['seatingBlocks']> {
  const rang = { rows: 22, rowSpacingM: 0.8, riseM: 0.45, baseHeightM: 1.5, occupancy: 0.82 };
  return [
    ...(mitNord ? [{ id: 'tsb-n', label: 'North', x: 75, y: 13.2, width: 105, rotationDeg: 180, ...rang }] : []),
    { id: 'tsb-s', label: 'South', x: 75, y: 106.8, width: 105, rotationDeg: 0, ...rang },
    { id: 'tsb-w', label: 'West', x: 9.7, y: 60, width: 68, rotationDeg: 90, ...rang },
    { id: 'tsb-e', label: 'East', x: 140.3, y: 60, width: 68, rotationDeg: 270, ...rang },
  ];
}

export const TEMPLATES: VenueTemplate[] = [
  {
    id: 'concert-small',
    name: 'Small Concert / Club (20×15m)',
    category: 'concert',
    venue: {
      name: 'Small Concert', widthM: 20, heightM: 15, ceilingHeightM: 7, floorMaterial: 'concrete',
      stages: [{ id: 'ts-1', x: 7, y: 0.5, width: 6, height: 3, label: 'Stage', elevationM: 0.8 }],
      seatingBlocks: [{ id: 'tsb-1', label: 'Floor', x: 10, y: 9.6, width: 17, rows: 9, rowSpacingM: 0.8, standing: true, occupancy: 0.9 }],
      videoWalls: [{ id: 'tvw-1', label: 'LED', x: 10, y: 0.7, widthM: 5, heightM: 2.8, bottomM: 1.6 }],
    },
    cameras: [
      { label: 'CAM 1', cameraId: 'sony-hdc-3500', lensId: 'fuj-ha18x7.6', x: 10, y: 12, z: 2.6, pan: -90, tilt: 0, focalLength: 20, aperture: 2.8, focusDistance: 10, color: '#ef4444', extenderActive: 1 },
      { label: 'CAM 2', cameraId: 'sony-hdc-3500', lensId: 'fuj-ha23x7.6', x: 4, y: 10, z: 2.6, pan: -60, tilt: 0, focalLength: 50, aperture: 2.8, focusDistance: 10, color: '#3b82f6', extenderActive: 1 },
      { label: 'CAM 3', cameraId: 'sony-hdc-3500', lensId: 'fuj-ha23x7.6', x: 16, y: 10, z: 2.6, pan: -120, tilt: 0, focalLength: 50, aperture: 2.8, focusDistance: 10, color: '#22c55e', extenderActive: 1 },
    ],
  },
  {
    id: 'concert-large',
    name: 'Large Concert / Arena (60×40m)',
    category: 'concert',
    venue: {
      name: 'Large Concert', widthM: 60, heightM: 40, ceilingHeightM: 22, floorMaterial: 'concrete',
      stages: [{ id: 'ts-2', x: 15, y: 0, width: 30, height: 8, label: 'Main Stage', elevationM: 1.6 }],
      seatingBlocks: [
        { id: 'tsb-2', label: 'Floor', x: 30, y: 21.5, width: 44, rows: 20, rowSpacingM: 0.8, standing: true, occupancy: 0.92 },
        { id: 'tsb-3', label: 'Left', x: 3.6, y: 23, width: 22, rows: 7, riseM: 0.45, baseHeightM: 1.4, rotationDeg: 90 },
        { id: 'tsb-4', label: 'Right', x: 56.4, y: 23, width: 22, rows: 7, riseM: 0.45, baseHeightM: 1.4, rotationDeg: 270 },
        { id: 'tsb-5', label: 'Back', x: 30, y: 36.4, width: 40, rows: 8, riseM: 0.45, baseHeightM: 2.2 },
      ],
      videoWalls: [
        { id: 'tvw-2', label: 'Centre', x: 30, y: 0.4, widthM: 16, heightM: 9, bottomM: 3 },
        { id: 'tvw-3', label: 'Left', x: 11, y: 2, widthM: 6, heightM: 10.5, bottomM: 2, rotationDeg: -20 },
        { id: 'tvw-4', label: 'Right', x: 49, y: 2, widthM: 6, heightM: 10.5, bottomM: 2, rotationDeg: 20 },
      ],
    },
    cameras: [
      { label: 'CAM 1', cameraId: 'sony-hdc-3500', lensId: 'fuj-ua24x7.8', x: 30, y: 30, z: 3.5, pan: -90, tilt: 0, focalLength: 15, aperture: 2.8, focusDistance: 25, color: '#ef4444', extenderActive: 1 },
      { label: 'CAM 2', cameraId: 'sony-hdc-3500', lensId: 'fuj-ua80x9', x: 30, y: 35, z: 4.5, pan: -90, tilt: 0, focalLength: 100, aperture: 2.8, focusDistance: 30, color: '#3b82f6', extenderActive: 1 },
      { label: 'CAM 3', cameraId: 'sony-hdc-3500', lensId: 'fuj-ha23x7.6', x: 10, y: 20, z: 3, pan: -50, tilt: 0, focalLength: 30, aperture: 2.8, focusDistance: 15, color: '#22c55e', extenderActive: 1 },
      { label: 'CAM 4', cameraId: 'sony-hdc-3500', lensId: 'fuj-ha23x7.6', x: 50, y: 20, z: 3, pan: -130, tilt: 0, focalLength: 30, aperture: 2.8, focusDistance: 15, color: '#eab308', extenderActive: 1 },
      { label: 'CAM 5', cameraId: 'sony-hdc-3500', lensId: 'fuj-ha14x4.5', x: 25, y: 5, z: 1.2, pan: -90, tilt: 0, focalLength: 5, aperture: 2.8, focusDistance: 3, color: '#a855f7', extenderActive: 1 },
    ],
  },
  {
    id: 'church-standard',
    name: 'Church / Worship (15×25m)',
    category: 'church',
    venue: {
      name: 'Church', widthM: 15, heightM: 25, ceilingHeightM: 11, floorMaterial: 'wood',
      stages: [{ id: 'ts-3', x: 3, y: 0.5, width: 9, height: 4, label: 'Altar / Stage', elevationM: 0.6 }],
      seatingBlocks: [
        { id: 'tsb-6', label: 'Left', x: 4.3, y: 15.2, width: 5.6, rows: 13, rowSpacingM: 1, occupancy: 0.75 },
        { id: 'tsb-7', label: 'Right', x: 10.7, y: 15.2, width: 5.6, rows: 13, rowSpacingM: 1, occupancy: 0.75 },
      ],
      videoWalls: [{ id: 'tvw-5', label: 'Screen', x: 7.5, y: 0.6, widthM: 4.4, heightM: 2.5, bottomM: 2.6 }],
    },
    cameras: [
      { label: 'CAM 1', cameraId: 'pana-aw-ue150', lensId: 'ptz-pana-ue150', x: 7.5, y: 20, z: 3, pan: -90, tilt: 0, focalLength: 10, aperture: 2.8, focusDistance: 18, color: '#ef4444', extenderActive: 1 },
      { label: 'CAM 2', cameraId: 'pana-aw-ue150', lensId: 'ptz-pana-ue150', x: 3, y: 15, z: 3, pan: -70, tilt: -4, focalLength: 30, aperture: 2.8, focusDistance: 14, color: '#3b82f6', extenderActive: 1 },
      { label: 'CAM 3', cameraId: 'pana-aw-ue150', lensId: 'ptz-pana-ue150', x: 12, y: 15, z: 3, pan: -110, tilt: -4, focalLength: 30, aperture: 2.8, focusDistance: 14, color: '#22c55e', extenderActive: 1 },
    ],
  },
  {
    id: 'football-stadium',
    name: 'Football / Soccer Stadium (150×120m)',
    category: 'sport',
    venue: {
      name: 'Football Stadium', widthM: 150, heightM: 120, floorMaterial: 'turf',
      stages: [{ id: 'ts-4', x: 22.5, y: 26, width: 105, height: 68, label: 'Pitch' }],
      seatingBlocks: STADION_TRIBUENEN(true),
      videoWalls: [
        { id: 'tvw-6', label: 'Screen West', x: 30, y: 0.6, widthM: 14, heightM: 7.9, bottomM: 14 },
        { id: 'tvw-7', label: 'Screen East', x: 120, y: 0.6, widthM: 14, heightM: 7.9, bottomM: 14 },
      ],
    },
    cameras: [
      { label: 'CAM 1', cameraId: 'sony-hdc-3500', lensId: 'fuj-ua80x9', x: 75, y: 101, z: 9, pan: -90, tilt: -5, focalLength: 20, aperture: 2.8, focusDistance: 40, color: '#ef4444', extenderActive: 1 },
      { label: 'CAM 2', cameraId: 'sony-hdc-3500', lensId: 'fuj-ua107x8.4', x: 76.5, y: 101, z: 9, pan: -90, tilt: -5, focalLength: 200, aperture: 2.8, focusDistance: 50, color: '#3b82f6', extenderActive: 1 },
      { label: 'CAM 3', cameraId: 'sony-hdc-3500', lensId: 'fuj-ha23x7.6', x: 25, y: 97, z: 1.5, pan: -80, tilt: -3, focalLength: 40, aperture: 2.8, focusDistance: 30, color: '#22c55e', extenderActive: 1 },
      { label: 'CAM 4', cameraId: 'sony-hdc-3500', lensId: 'fuj-ha23x7.6', x: 125, y: 97, z: 1.5, pan: -100, tilt: -3, focalLength: 40, aperture: 2.8, focusDistance: 30, color: '#eab308', extenderActive: 1 },
      { label: 'CAM 5', cameraId: 'sony-hdc-3500', lensId: 'fuj-ua107x8.4', x: 20, y: 60, z: 3, pan: 0, tilt: 0, focalLength: 300, aperture: 2.8, focusDistance: 50, color: '#a855f7', extenderActive: 1 },
      { label: 'CAM 6', cameraId: 'sony-hdc-3500', lensId: 'fuj-ua107x8.4', x: 130, y: 60, z: 3, pan: 180, tilt: 0, focalLength: 300, aperture: 2.8, focusDistance: 50, color: '#ec4899', extenderActive: 1 },
    ],
  },
  {
    id: 'stadium-event',
    name: 'Stadium Event / Worship (150×120m)',
    category: 'concert',
    venue: {
      name: 'Stadium Event', widthM: 150, heightM: 120, floorMaterial: 'turf',
      stages: [{ id: 'ts-6', x: 50, y: 22, width: 50, height: 16, label: 'Stage', elevationM: 2 }],
      seatingBlocks: [
        { id: 'tsb-8', label: 'Pitch', x: 75, y: 62, width: 76, rows: 34, rowSpacingM: 0.75, standing: true, occupancy: 0.94 },
        ...STADION_TRIBUENEN(false),
      ],
      videoWalls: [
        { id: 'tvw-8', label: 'Centre', x: 75, y: 22.6, widthM: 26, heightM: 12, bottomM: 5 },
        { id: 'tvw-9', label: 'Left', x: 42, y: 26, widthM: 10, heightM: 14, bottomM: 3, rotationDeg: -18 },
        { id: 'tvw-10', label: 'Right', x: 108, y: 26, widthM: 10, heightM: 14, bottomM: 3, rotationDeg: 18 },
      ],
    },
    cameras: [
      { label: 'CAM 1', cameraId: 'sony-hdc-3500', lensId: 'fuj-ua80x9', x: 74, y: 84, z: 4, pan: -90, tilt: -2, focalLength: 120, aperture: 2.8, focusDistance: 52, color: '#ef4444', extenderActive: 1 },
      { label: 'CAM 2', cameraId: 'sony-hdc-3500', lensId: 'fuj-ua24x7.8', x: 76, y: 84, z: 4, pan: -90, tilt: -3, focalLength: 18, aperture: 2.8, focusDistance: 52, color: '#3b82f6', extenderActive: 1 },
      { label: 'CAM 3', cameraId: 'sony-hdc-3500', lensId: 'fuj-ha23x7.6', x: 40, y: 46, z: 3.2, pan: -25, tilt: -1, focalLength: 35, aperture: 2.8, focusDistance: 30, color: '#22c55e', extenderActive: 1 },
      { label: 'CAM 4', cameraId: 'sony-hdc-3500', lensId: 'fuj-ha23x7.6', x: 110, y: 46, z: 3.2, pan: -155, tilt: -1, focalLength: 35, aperture: 2.8, focusDistance: 30, color: '#eab308', extenderActive: 1 },
      { label: 'CAM 5', cameraId: 'sony-hdc-3500', lensId: 'fuj-ha14x4.5', x: 75, y: 44, z: 6, pan: -90, tilt: -10, focalLength: 8, aperture: 2.8, focusDistance: 14, color: '#a855f7', extenderActive: 1 },
      { label: 'CAM 6', cameraId: 'sony-hdc-3500', lensId: 'fuj-ua24x7.8', x: 75, y: 106, z: 14, pan: -90, tilt: -9, focalLength: 9, aperture: 2.8, focusDistance: 78, color: '#ec4899', extenderActive: 1 },
    ],
  },
  {
    id: 'conference-room',
    name: 'Conference Room (12×10m)',
    category: 'conference',
    venue: {
      name: 'Conference Room', widthM: 12, heightM: 10, ceilingHeightM: 3.2, floorMaterial: 'carpet',
      stages: [{ id: 'ts-5', x: 2, y: 0.5, width: 8, height: 2, label: 'Podium', elevationM: 0.3 }],
      seatingBlocks: [{ id: 'tsb-9', label: 'Seats', x: 6, y: 6, width: 9, rows: 5, rowSpacingM: 1, occupancy: 0.8 }],
      videoWalls: [{ id: 'tvw-11', label: 'Screen', x: 6, y: 0.3, widthM: 3.2, heightM: 1.8, bottomM: 1.1 }],
    },
    cameras: [
      { label: 'CAM 1', cameraId: 'pana-aw-ue40', lensId: 'ptz-pana-ue40', x: 6, y: 9, z: 2.5, pan: -90, tilt: 0, focalLength: 8, aperture: 2.8, focusDistance: 8, color: '#ef4444', extenderActive: 1 },
      { label: 'CAM 2', cameraId: 'pana-aw-ue40', lensId: 'ptz-pana-ue40', x: 2, y: 7, z: 2.5, pan: -60, tilt: 0, focalLength: 20, aperture: 2.8, focusDistance: 7, color: '#3b82f6', extenderActive: 1 },
    ],
  },
];
