// Den Kamerablick der 3D-Ansicht von aussen oeffnen (Erste Schritte).
// Der Wunsch bleibt liegen, bis die 3D-Ansicht ihn abholt — beim ersten
// Mal wird sie erst nachgeladen.
export const KAMERABLICK_WUNSCH_EVENT = 'mcplan:camera-view-request';
export const KAMERABLICK_OFFEN_EVENT = 'mcplan:camera-view-open';

let offen = false;

export function kamerablickWuenschen(): void {
  offen = true;
  window.dispatchEvent(new Event(KAMERABLICK_WUNSCH_EVENT));
}

export function kamerablickWunschAbholen(): boolean {
  const war = offen;
  offen = false;
  return war;
}

export function kamerablickGeoeffnet(): void {
  window.dispatchEvent(new Event(KAMERABLICK_OFFEN_EVENT));
}
