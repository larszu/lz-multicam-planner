# Ideenquellen #239 und #240 — was zum Kern passt

Kern des Planers: **Kameras einzeichnen und die Optik prüfen.** Jede Quelle
wurde nur daraufhin gelesen, ob ein Konzept diesen Kern einfacher oder
sicherer macht. Übernommen wird kein Code und kein Asset, nur die Idee.

## #239 — Kamerasimulation und Bildanalyse

| Quelle | Konzept | Passt? | Warum |
|---|---|---|---|
| MultiCam-Simulation (Python/OpenCV, MIT) | Mehrere virtuelle Kameras im Raum, innere und äußere Parameter frei verstellbar, Bild je Kamera live | **schon da** | Genau das macht der Kamerablick: Lage, Sensor und Brennweite ergeben das Bild (`src/utils/bildwinkel.ts`), die Multiview zeigt alle Kameras nebeneinander. Bestätigt den Weg, nichts nachzubauen. |
| | Objektivverzeichnung live simulieren | nein | Broadcast-Zooms und Cine-Optiken sind im Planungsmaßstab nahezu verzeichnungsfrei; die Frage „reicht das Objektiv" hängt am Bildwinkel. Mehr Parameter, kein besseres Ergebnis. |
| | Steuerung per Gamepad, Markerziele zum Kalibrieren | nein | Ziehen, Pinch und Kamerasteuerung reichen; Kalibriermarken gehören zur Bildverarbeitung, nicht zur Planung. |
| cinemetrics (Filmanalyse) | Schnittrhythmus, Farbpaletten, Bewegung als „Fingerabdruck" eines fertigen Films | nein | Analyse nach der Produktion. Der Planer arbeitet davor; Farbe und Abgleich gehören in die Messtechnik (eigenes Werkzeug), nicht hierher. |

## #240 — Raumerfassung und Shot-Planung

| Quelle | Konzept | Passt? | Warum |
|---|---|---|---|
| ESP32 + 2D-LiDAR → Punktwolke (.XYZ) | Raum vor Ort abtasten statt ausmessen | **Vorschlag, optional** | Ein Schnitt in Kopfhöhe ergibt den Grundriss in echten Metern — das wäre ein weiterer Grundriss-Import neben Bild, PDF und DXF. Siehe unten. |
| Shot-Planung großer Shows | Nummerierte Kameras mit Farbe, Objektiv und Position auf einem Blatt, Shots je Programmpunkt, Kamerakarte je Operator | **schon da** | Nummer und Farbe je Kamera überall gleich, Kamerakarte mit Werten am Ziel, Shotlisten mit Storyboard. Nichts fehlt für den Kern. |
| | Standortbesichtigung mit Blick durch das geplante Objektiv | **umgesetzt** | Mit #237: *Handy als Sucher* zeigt den Ausschnitt über dem Livebild der Handykamera und gibt Höhe, Neigung, Schwenk und Brennweite als Austauschcode zurück. |
| Mehrkamera-Abgleich mit Messgeräten | Kameras über Waveform/Vektorskop angleichen | nein | Betrieb, nicht Planung. |

## Vorschlag: Punktwolke als Grundriss-Import (nicht umgesetzt)

- Eingang: `.xyz`/`.txt` mit `x y z` je Zeile in Metern.
- Ein Höhenband (z. B. 1,0–1,8 m) wählen, Punkte von oben als Hintergrundbild
  zeichnen — Maßstab steht fest, die Zwei-Punkt-Eichung entfällt.
- Wände daraus erst später und nur, wenn sich das Bild bewährt: Linien
  aus dem Bild zu lösen ist die aufwendige Hälfte.
- Aufwand: der Import als Bild ist klein bis mittel; die Wand-Erkennung groß.
  Kein Bedarf, solange Grundrisse als PDF/DXF vorliegen.
