// Live-Verbindung zu LZ Camera Bridge (settings.bridge.*, bridge.*)
export const bridge: Record<string, string> = {
  'settings.tab.bridge': 'Kamera-Bridge',
  'settings.bridge.title': 'Live aus LZ Camera Bridge',
  'settings.bridge.desc': 'Schwenk, Neigung und Zoom, die die Bridge meldet (etwa vom Joystick eines Pults), bewegen die geplanten Kameras in 2D und 3D. Der Plan ändert sich erst mit „Übernehmen“ an einer Kamera.',
  'settings.bridge.enable': 'Mit der Bridge verbinden',
  'settings.bridge.url': 'Adresse',
  'settings.bridge.mapping': 'Jede geplante Kamera folgt der Bridge-Kamera mit der Zahl in ihrem Namen (CAM 2 → 2). Eine andere Nummer lässt sich an der Kamera eintragen.',
  'bridge.status.connected': 'Bridge verbunden',
  'bridge.status.connecting': 'Verbinde mit Bridge …',
  'bridge.status.error': 'Bridge nicht erreichbar – neuer Versuch läuft',
  'bridge.status.off': 'Bridge aus',
  'bridge.live': 'Live',
  'bridge.onPanel': 'Am Pult',
  'bridge.apply': 'Übernehmen',
  'bridge.apply.title': 'Live-Schwenk, -Neigung und -Brennweite in den Plan schreiben',
  'bridge.number': 'Bridge-Kamera',
  'bridge.number.aria': 'Bridge-Kameranummer für {name}',
};
