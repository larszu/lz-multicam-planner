import type { Venue, Wall } from '../types';

/** Standard wall height before a project sets its own (#198). */
export const DEFAULT_WALL_HEIGHT_M = 3;

export function defaultWallHeight(venue: Pick<Venue, 'defaultWallHeightM'> | null | undefined): number {
  const h = venue?.defaultWallHeightM;
  return typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : DEFAULT_WALL_HEIGHT_M;
}

/** Effective height of a wall: its own, otherwise the venue standard. */
export function wallHeight(wall: Pick<Wall, 'height'>, standardM: number): number {
  const h = wall.height;
  return typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : standardM;
}

/** Walls with their effective height filled in — for renderers and exports. */
export function resolveWallHeights<W extends Wall>(walls: readonly W[], standardM: number): (W & { height: number })[] {
  return walls.map((w) => ({ ...w, height: wallHeight(w, standardM) }));
}

/**
 * Files saved before #198 carry a height on every wall and no standard.
 * The most common height becomes the standard and walls at that height drop
 * their own value, so changing the standard later moves them along. Heights
 * that differ stay as own heights. Files that already have a standard pass
 * through unchanged.
 */
export function migrateWallHeights(
  walls: readonly Wall[],
  storedStandardM: number | undefined,
): { walls: Wall[]; defaultWallHeightM: number } {
  if (typeof storedStandardM === 'number' && Number.isFinite(storedStandardM) && storedStandardM > 0) {
    return { walls: [...walls], defaultWallHeightM: storedStandardM };
  }
  const zaehler = new Map<number, number>();
  for (const w of walls) {
    if (typeof w.height === 'number' && w.height > 0) zaehler.set(w.height, (zaehler.get(w.height) ?? 0) + 1);
  }
  let standard = DEFAULT_WALL_HEIGHT_M;
  let best = 0;
  for (const [h, n] of zaehler) {
    if (n > best || (n === best && h === DEFAULT_WALL_HEIGHT_M)) { standard = h; best = n; }
  }
  return {
    defaultWallHeightM: standard,
    walls: walls.map((w) => {
      if (w.height !== standard && typeof w.height === 'number' && w.height > 0) return w;
      const { height: _, ...rest } = w;
      return rest;
    }),
  };
}

export type ResolvedWall = Wall & { height: number };
