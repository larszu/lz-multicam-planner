export type SettingsSection = 'general' | 'library';

/** Oeffnet die Einstellungen von ueberall — die Kopfzeile haelt den Dialog. */
export const OPEN_SETTINGS_EVENT = 'multicam:open-settings';
export const openSettings = (section: SettingsSection = 'general') =>
  window.dispatchEvent(new CustomEvent<SettingsSection>(OPEN_SETTINGS_EVENT, { detail: section }));
