// Verbindet den Katalog (eigene Kameras/Objektive in `useStore`) mit der
// Geraetebibliothek: liefert die eigenen Eintraege zum Hochladen und laedt
// nach jeder Aenderung entprellt hoch und gleicht ab — solange angemeldet
// und „automatisch hochladen" an ist.
import { useStore } from '../store/useStore';
import type { LibraryItem } from './facet';
import { registerOwnItems, useDeviceLibrary } from './store';

/** Lange genug, dass Tippen im Formular nicht je Taste eine Anfrage wird. */
export const AUTO_UPLOAD_DELAY_MS = 3000;

export const ownItems = (): LibraryItem[] => {
  const s = useStore.getState();
  return [
    ...s.customCameras.map((camera): LibraryItem => ({ kind: 'camera', camera })),
    ...s.customLenses.map((lens): LibraryItem => ({ kind: 'lens', lens })),
  ];
};

export function startAutoSync(delay = AUTO_UPLOAD_DELAY_MS): () => void {
  registerOwnItems(ownItems);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useStore.subscribe((s, prev) => {
    if (s.customCameras === prev.customCameras && s.customLenses === prev.customLenses) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const lib = useDeviceLibrary.getState();
      if (lib.signedIn && lib.autoUpload) void lib.syncAll();
    }, delay);
  });
  return () => {
    clearTimeout(timer);
    unsub();
  };
}
