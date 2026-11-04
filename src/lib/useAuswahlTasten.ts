// Tasten der Mehrfachauswahl (#250): Kopieren, Einfuegen, Loeschen, Aufheben.
// In Eingabefeldern und bei markiertem Text bleiben die Tasten beim Browser.
import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { isEditable } from '../store/history';
import { auswahlGroesse, bereinigt, leereAuswahl } from '../utils/auswahl';

const textMarkiert = () => (typeof window !== 'undefined' ? (window.getSelection?.()?.toString() ?? '') !== '' : false);

export function auswahlTaste(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'target'>): boolean {
  if (e.altKey || isEditable(e.target)) return false;
  const s = useStore.getState();
  const a = bereinigt(s.auswahl, s.cameras, s.persons);
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && !e.shiftKey && key === 'c') {
    if (auswahlGroesse(a) === 0 || textMarkiert()) return false;
    return s.auswahlKopieren() > 0;
  }
  if (mod && !e.shiftKey && key === 'v') return s.einfuegen() > 0;
  if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
    if (auswahlGroesse(a) === 0) return false;
    s.auswahlLoeschen();
    return true;
  }
  if (!mod && e.key === 'Escape' && auswahlGroesse(a) > 0) {
    s.setAuswahl(leereAuswahl());
    return false;
  }
  return false;
}

export function useAuswahlTasten() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (auswahlTaste(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
