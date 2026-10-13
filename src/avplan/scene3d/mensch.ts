// Menschen ohne Modelldatei.
//
// Ein Koerper aus Kapseln zwischen Gelenkpunkten, Rumpf und Kopf gedreht —
// je Pose eine Gelenktabelle. Jeder Eckpunkt traegt seinen Teil (Haut,
// Oberteil, Hose, Haar, Schuh, Unterarm), damit eine Geometrie fuer tausende
// Instanzen reicht und die Farben je Person im Shader entstehen.
//
// Warum gebaut statt geladen: ein Publikum aus Skelett-Modellen ist zu teuer
// (zehntausend Knochen-Saetze), und fuer frei verfuegbare, fotorealistische
// Personen-Scans fehlt eine klare Lizenz. Fuer einzelne Personen kann eine
// GLB-Datei dazukommen (`personModell.ts`).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type Pose = 'stehen' | 'sitzen' | 'jubeln'
export type Detail = 'niedrig' | 'hoch'

/** Teile in der Reihenfolge des Shaders. */
export const TEIL = { haut: 0, oben: 1, unten: 2, haar: 3, schuh: 4, unterarm: 5 } as const

type V = [number, number, number]

interface Gelenke {
  huefte: V
  hals: V
  kopf: V
  hueftL: V; knieL: V; knoechelL: V; zehL: V
  schulterL: V; ellbogenL: V; handL: V
  /** Abweichungen der rechten Seite; sonst gespiegelt. */
  rechts?: Partial<Pick<Gelenke, 'ellbogenL' | 'handL' | 'knieL' | 'knoechelL' | 'zehL'>>
}

/** Normgroesse 1,75 m, Blick nach +z, Fuesse bzw. Sitzflaeche auf y = 0 / 0,45. */
const POSEN: Record<Pose, Gelenke> = {
  stehen: {
    huefte: [0, 0.88, 0], hals: [0, 1.47, -0.01], kopf: [0, 1.625, 0.01],
    hueftL: [0.095, 0.9, 0], knieL: [0.1, 0.5, 0.02], knoechelL: [0.1, 0.09, -0.01], zehL: [0.105, 0.035, 0.13],
    schulterL: [0.2, 1.41, -0.015], ellbogenL: [0.24, 1.13, -0.05], handL: [0.24, 0.88, 0.06],
    rechts: { ellbogenL: [0.235, 1.12, -0.03], handL: [0.21, 0.9, 0.1] },
  },
  sitzen: {
    huefte: [0, 0.49, -0.04], hals: [0, 1.07, 0.0], kopf: [0, 1.225, 0.03],
    hueftL: [0.1, 0.5, -0.02], knieL: [0.11, 0.52, 0.42], knoechelL: [0.115, 0.09, 0.46], zehL: [0.115, 0.035, 0.6],
    schulterL: [0.19, 1.01, -0.01], ellbogenL: [0.22, 0.74, 0.08], handL: [0.15, 0.58, 0.3],
  },
  jubeln: {
    huefte: [0, 0.88, 0], hals: [0, 1.47, 0.0], kopf: [0, 1.63, 0.02],
    hueftL: [0.095, 0.9, 0], knieL: [0.1, 0.5, 0.02], knoechelL: [0.1, 0.09, -0.01], zehL: [0.105, 0.035, 0.13],
    schulterL: [0.19, 1.41, -0.01], ellbogenL: [0.29, 1.66, 0.04], handL: [0.33, 1.93, 0.09],
    rechts: { ellbogenL: [0.3, 1.62, 0.06], handL: [0.31, 1.88, 0.12] },
  },
}

const spiegel = (v: V): V => [-v[0], v[1], v[2]]

interface Aufloesung {
  rund: number
  kappe: number
  rumpf: number
  kopfB: number
  kopfH: number
  rumpfProfil: [number, number][]
}

const AUFLOESUNG: Record<Detail, Aufloesung> = {
  niedrig: {
    rund: 4, kappe: 1, rumpf: 6, kopfB: 7, kopfH: 5,
    rumpfProfil: [[0.001, 0], [0.155, 0.04], [0.14, 0.38], [0.172, 0.76], [0.12, 0.96], [0.03, 1]],
  },
  hoch: {
    rund: 12, kappe: 4, rumpf: 20, kopfB: 24, kopfH: 18,
    rumpfProfil: [[0.001, 0], [0.12, 0.005], [0.155, 0.04], [0.163, 0.18], [0.142, 0.37], [0.15, 0.5], [0.168, 0.66], [0.175, 0.78], [0.168, 0.88], [0.13, 0.95], [0.07, 0.99], [0.03, 1]],
  },
}

function mitTeil(g: THREE.BufferGeometry, teil: number | ((p: THREE.Vector3) => number)): THREE.BufferGeometry {
  g.deleteAttribute('uv')
  const pos = g.getAttribute('position')
  const werte = new Float32Array(pos.count)
  const p = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    werte[i] = typeof teil === 'number' ? teil : teil(p)
  }
  g.setAttribute('teil', new THREE.BufferAttribute(werte, 1))
  return g
}

/** Kapsel von a nach b. `teilFn` bekommt den Punkt in Kapsel-Koordinaten (y von -l/2 bis l/2). */
function glied(a: V, b: V, r: number, auf: Aufloesung, teil: number | ((p: THREE.Vector3, l: number) => number)): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const richtung = vb.clone().sub(va)
  const l = Math.max(0.01, richtung.length())
  const g = new THREE.CapsuleGeometry(r, l, auf.kappe, auf.rund)
  mitTeil(g, typeof teil === 'number' ? teil : (p) => teil(p, l))
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), richtung.normalize()))
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  return g
}

/**
 * Konisches Glied mit Kugelgelenken an beiden Enden — Oberschenkel sind
 * oben dicker als am Knie. Nur im feinen Detail; im Publikum reicht die
 * Kapsel, und die Gelenkkugeln kosten Dreiecke.
 */
function konisch(a: V, b: V, ra: number, rb: number, auf: Aufloesung, teil: number): THREE.BufferGeometry[] {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const richtung = vb.clone().sub(va)
  const l = Math.max(0.01, richtung.length())
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), richtung.normalize())
  const rohr = new THREE.CylinderGeometry(rb, ra, l, auf.rund, 1, true)
  mitTeil(rohr, teil)
  rohr.applyQuaternion(q)
  rohr.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  const kugel = (p: V, r: number) => {
    const k = new THREE.SphereGeometry(r, auf.rund, Math.max(4, auf.rund / 2))
    mitTeil(k, teil)
    k.translate(...p)
    return k
  }
  return [rohr, kugel(a, ra), kugel(b, rb)]
}

function rumpf(j: Gelenke, auf: Aufloesung): THREE.BufferGeometry {
  const unten = new THREE.Vector3(...j.huefte)
  const oben = new THREE.Vector3(...j.hals)
  const richtung = oben.clone().sub(unten)
  const l = richtung.length()
  const g = new THREE.LatheGeometry(auf.rumpfProfil.map(([r, t]) => new THREE.Vector2(r, t * l)), auf.rumpf)
  g.scale(1, 1, 0.64)
  mitTeil(g, (p) => (p.y < l * 0.3 ? TEIL.unten : TEIL.oben))
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), richtung.normalize()))
  g.translate(unten.x, unten.y, unten.z)
  return g
}

function kopf(j: Gelenke, auf: Aufloesung, detail: Detail): THREE.BufferGeometry[] {
  const g = new THREE.SphereGeometry(0.1, auf.kopfB, auf.kopfH)
  g.scale(0.84, 1.1, 1.0)
  // Haar: Kappe oben und hinten. Gesicht, Ohren und Nacken bleiben Haut.
  mitTeil(g, (p) => (p.y > 0.035 || (p.y > -0.06 && p.z < -0.035) ? TEIL.haar : TEIL.haut))
  g.translate(...j.kopf)
  const teile = [g, glied(j.hals, [j.kopf[0], j.kopf[1] - 0.07, j.kopf[2] - 0.01], 0.048, auf, TEIL.haut)]
  if (detail === 'hoch') {
    // Haar als eigene, etwas groessere Kappe: Volumen statt aufgemalter Farbe.
    const haar = new THREE.SphereGeometry(0.104, auf.kopfB, auf.kopfH, 0, Math.PI * 2, 0, Math.PI * 0.55)
    haar.scale(0.88, 1.08, 1.04)
    haar.rotateX(-0.25)
    mitTeil(haar, TEIL.haar)
    haar.translate(j.kopf[0], j.kopf[1] + 0.012, j.kopf[2] - 0.012)
    teile.push(haar)
    const nase = new THREE.SphereGeometry(0.017, 8, 6)
    nase.scale(0.8, 1.3, 1)
    mitTeil(nase, TEIL.haut)
    nase.translate(j.kopf[0], j.kopf[1] - 0.012, j.kopf[2] + 0.098)
    teile.push(nase)
    for (const s of [-1, 1]) {
      const ohr = new THREE.SphereGeometry(0.022, 8, 6)
      ohr.scale(0.45, 1, 0.8)
      mitTeil(ohr, TEIL.haut)
      ohr.translate(j.kopf[0] + s * 0.083, j.kopf[1] - 0.005, j.kopf[2] - 0.005)
      teile.push(ohr)
    }
  }
  return teile
}

function seite(j: Gelenke, links: boolean): Pick<Gelenke, 'hueftL' | 'knieL' | 'knoechelL' | 'zehL' | 'schulterL' | 'ellbogenL' | 'handL'> {
  const r = links ? {} : (j.rechts ?? {})
  const s = (v: V) => (links ? v : spiegel(v))
  return {
    hueftL: s(j.hueftL),
    knieL: s(r.knieL ?? j.knieL),
    knoechelL: s(r.knoechelL ?? j.knoechelL),
    zehL: s(r.zehL ?? j.zehL),
    schulterL: s(j.schulterL),
    ellbogenL: s(r.ellbogenL ?? j.ellbogenL),
    handL: s(r.handL ?? j.handL),
  }
}

const CACHE = new Map<string, THREE.BufferGeometry>()

/**
 * Geometrie eines Menschen in Normgroesse (1,75 m) mit Attribut `teil`.
 * Gecacht je Pose und Detail — nicht veraendern, sondern skalieren.
 */
export function menschGeometrie(pose: Pose, detail: Detail = 'niedrig'): THREE.BufferGeometry {
  const schluessel = `${pose}|${detail}`
  const fertig = CACHE.get(schluessel)
  if (fertig) return fertig
  const j = POSEN[pose]
  const auf = AUFLOESUNG[detail]
  const teile: THREE.BufferGeometry[] = [rumpf(j, auf), ...kopf(j, auf, detail)]
  for (const links of [true, false]) {
    const s = seite(j, links)
    if (detail === 'hoch') {
      teile.push(...konisch(s.hueftL, s.knieL, 0.085, 0.056, auf, TEIL.unten))
      teile.push(...konisch(s.knieL, s.knoechelL, 0.054, 0.036, auf, TEIL.unten))
      teile.push(glied(s.knoechelL, s.zehL, 0.042, auf, TEIL.schuh))
      teile.push(...konisch(s.schulterL, s.ellbogenL, 0.054, 0.04, auf, TEIL.oben))
      teile.push(...konisch(s.ellbogenL, s.handL, 0.039, 0.028, auf, TEIL.unterarm))
    } else {
      teile.push(glied(s.hueftL, s.knieL, 0.072, auf, TEIL.unten))
      teile.push(glied(s.knieL, s.knoechelL, 0.055, auf, TEIL.unten))
      teile.push(glied(s.knoechelL, s.zehL, 0.042, auf, TEIL.schuh))
      teile.push(glied(s.schulterL, s.ellbogenL, 0.05, auf, TEIL.oben))
      teile.push(glied(s.ellbogenL, s.handL, 0.04, auf, TEIL.unterarm))
    }
    if (detail === 'hoch') {
      const hand = new THREE.SphereGeometry(0.045, 10, 8)
      hand.scale(0.55, 1, 0.9)
      mitTeil(hand, TEIL.haut)
      const richtung = new THREE.Vector3(...s.handL).sub(new THREE.Vector3(...s.ellbogenL)).normalize()
      hand.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), richtung))
      hand.translate(s.handL[0] + richtung.x * 0.06, s.handL[1] + richtung.y * 0.06, s.handL[2] + richtung.z * 0.06)
      teile.push(hand)
    }
  }
  const g = mergeGeometries(teile, false)
  teile.forEach((t) => t.dispose())
  if (!g) throw new Error('Menschen-Geometrie liess sich nicht zusammenfuegen.')
  g.computeBoundingBox()
  g.computeBoundingSphere()
  CACHE.set(schluessel, g)
  return g
}

export interface MenschFarben {
  oben: THREE.ColorRepresentation
  unten: THREE.ColorRepresentation
  haut: THREE.ColorRepresentation
  haar: THREE.ColorRepresentation
  schuh?: THREE.ColorRepresentation
  /** Lange Aermel: Unterarm in der Farbe des Oberteils. */
  langarm?: boolean
}

/** Einzelner Mensch (Buehne, Referenzperson) mit festen Farben. */
export function erzeugeMensch(pose: Pose, farben: MenschFarben, groesseM = 1.75): THREE.Mesh {
  const g = menschGeometrie(pose, 'hoch').clone()
  const teil = g.getAttribute('teil')
  const c = {
    haut: new THREE.Color(farben.haut),
    oben: new THREE.Color(farben.oben),
    unten: new THREE.Color(farben.unten),
    haar: new THREE.Color(farben.haar),
    schuh: new THREE.Color(farben.schuh ?? '#16171a'),
  }
  const farbe = new Float32Array(teil.count * 3)
  for (let i = 0; i < teil.count; i++) {
    const t = teil.getX(i)
    const f = t === TEIL.haut ? c.haut : t === TEIL.oben ? c.oben : t === TEIL.unten ? c.unten : t === TEIL.haar ? c.haar : t === TEIL.schuh ? c.schuh : farben.langarm ? c.oben : c.haut
    farbe.set([f.r, f.g, f.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(farbe, 3))
  const s = groesseM / 1.75
  g.scale(s, s, s)
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }))
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
