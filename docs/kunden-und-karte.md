# Kunden und Karte

*Ausgearbeitet am 14.08.2026, nachdem der Auftraggeber einen Kompromiss zur
Karten-Frage vorgeschlagen hat.*

## 1. Warum das den Streit auflöst

Gegen eine Karte in SoundFuchs standen bisher vier Einwände
(`startseite-entwurf.md` §3). Der stärkste war der Maßstab: Auf einer
Landkarte sind Pumpe 17 und Pumpe 18, fünf Meter auseinander, dasselbe Pixel.
Eine Karte konnte genau das nicht leisten, wofür man sie holt.

Der Vorschlag dreht die Ebene um. **Nicht die Maschine kommt auf die Karte,
sondern der Kunde.** Und ein Kunde ist genau das, was auf eine Landkarte
gehört: ein Ort, an dem man ankommt. Die Maschinen hängen darunter — zwei
oder drei je Kunde, nicht zweihundert —, und dort entscheidet nicht die
Geografie, sondern der Name, das Bild und im Zweifel das NFC-Etikett.

Damit ist der Maßstabs-Einwand weg. Die anderen drei sind es auch:

- **GPS trägt drinnen nicht.** Wird nicht gebraucht — der Kunde wird über die
  Postleitzahl verortet, nicht gemessen.
- **Es gibt kein Wegeproblem.** Zwischen Kunden gibt es eins. Genau dafür ist
  TourFuchs da, und genau da entsteht die Verbindung.
- **Kosten.** Siehe §5. Sie sind bezifferbar und kleiner als befürchtet.

Und es entsteht etwas, das vorher nicht da war: **eine Brücke zu TourFuchs.**
Wer dort einen Kunden vor sich hat, könnte künftig sehen, welche Maschinen bei
ihm stehen. Dafür müssen beide Apps denselben Kundenbegriff kennen. Diesen
Begriff legt dieses Dokument an.

## 2. Was ein Kunde ist

Bewusst schmal. TourFuchs führt Umsatz, Kanal, Bezirk, Zuständigkeit — das ist
Vertriebswissen und gehört nicht hierher. Ein Kunde in SoundFuchs ist:

| Feld | Pflicht | Herkunft |
|---|---|---|
| `id` | ja | vergeben |
| `name` | ja | eingegeben |
| `plz` | ja | eingegeben |
| `ort` | nein | **füllt sich aus der PLZ selbst** |
| `lat`, `lng` | nein | aus der PLZ berechnet |
| `geo` | ja | `plz` \| `none` |

Mehr nicht. Straße, Ansprechpartner, Telefon: erst, wenn jemand danach fragt.

Die Maschine bekommt ein Feld `customerId`. Ohne Kunde bleibt sie, wie sie
ist — der Bestand funktioniert weiter ohne einen einzigen Kunden.

## 3. Das Verfahren, abgeschaut

TourFuchs löst die Verortung ohne Schlüssel, ohne Konto und ohne Netz
(`src/services/geocode.js`). Genau das wird übernommen:

1. **PLZ eingeben.** Der Ort füllt sich selbst aus `plz-places.json`
   (PLZ → Ortsname). Wer will, überschreibt ihn.
2. **Koordinaten** kommen aus `plz-centroids.json` (PLZ → Mittelpunkt).
3. **Deterministischer Versatz.** Mehrere Kunden derselben PLZ lägen sonst
   exakt übereinander. Aus der Kunden-Kennung wird ein Streuwert von etwa
   ±500 m gerechnet — gleicher Kunde, gleiche Stelle, immer.
4. **Genauigkeit wird mitgeführt.** `geo: 'plz'` heißt Ortsmitte, nicht
   Hausnummer. Der Marker zeigt das an, statt eine Genauigkeit vorzutäuschen,
   die er nicht hat.

Was NICHT übernommen wird: die zweite Stufe über Nominatim (exakte
Adress-Geocodierung über das Netz). Für „wo steht der Kunde" reicht die
Ortsmitte; eine Netzabfrage je Kunde wäre Aufwand und Datenabfluss für eine
Genauigkeit, die hier niemand braucht.

## 4. Was man sieht

**Die Karte** ersetzt die Maschinenliste nicht, sie tritt neben sie. Leaflet,
Kacheln von OpenStreetMap/CARTO, Zoom wie bei TourFuchs — dort eins zu eins
abgeschaut, damit die Familienähnlichkeit trägt.

**Der Kunde als Marker.** Ein Tipp öffnet sein Blatt. Oben der Name, darunter
— statt Umsatz und Kanal — **seine Maschinen**, mit ihrem Zustand:

```
    Müller Guss GmbH
    45127 Essen · Ortsmitte

    MASCHINEN
    ● Pumpe 17        94 %   vor 2 Std.      ›
    ● Lüfter West     71 %   vor 3 Tagen     ›
    ○ Kompressor 3    Referenz fehlt         ›
```

Ein Tipp auf eine Zeile führt in die Maschinenansicht, die es schon gibt —
mit Zustand, Zeitstrahl, Anzahl der Prüfungen und dem Knopf, der die nächste
startet. Kein neues Blatt, kein zweiter Weg.

## 5. Was es kostet

Ehrlich beziffert, weil der Installationsumfang in dieser App ein Thema ist
(die Symbole wurden von 3,3 MB auf 88 KB gedrückt):

| Posten | Größe |
|---|---|
| `plz-centroids.json` (8.300 PLZ) | 226 KB |
| `plz-places.json` (Ortsnamen) | 175 KB |
| Leaflet | ~150 KB |

Zusammen gut 550 KB. Das ist kein Nichts, aber es ist einmalig, es liegt
offline vor, und es kauft eine ganze Ebene.

**Die Kacheln brauchen Netz.** Das ist die einzige echte Einschränkung: In
einer Halle ohne Empfang bleibt die Karte grau. Deshalb bleibt die Liste der
führende Weg zur Maschine und die Karte das zweite Fenster — nicht umgekehrt.

**Lizenzen** werden mitgeführt, wie es sich gehört: GeoNames (CC BY 4.0) für
die PLZ-Daten, OpenStreetMap-Mitwirkende (ODbL) für die Kacheln.

## 6. Was ausdrücklich nicht kommt

**Hallenlayout.** Ich hatte es als Alternative vorgeschlagen; der Auftraggeber
hat es für den ersten Schritt verworfen, und das ist richtig. Es wäre ein
eigenes Vorhaben — Bild hinterlegen, Maßstab, Platzierung, Speicherung —, und
es löst ein Problem, das die zwei bis drei Maschinen je Kunde noch gar nicht
haben. Bleibt als mögliche Sonderanfertigung vermerkt.

**Maschinen per Drag auf die Karte ziehen.** Die Geste ist gut, aber sie
gehört zum Hallenlayout, nicht zur Landkarte. Auf Stadtebene gäbe sie eine
Genauigkeit vor, die nichts bedeutet.

## 7. Schnitte

1. **Kunde anlegen** — Entität, PLZ-Eingabe, Ort füllt sich selbst, Maschine
   bekommt `customerId`. Nützlich ohne jede Karte: Der Bestand lässt sich nach
   Kunde gruppieren.
2. **Die Karte** — Leaflet, Marker, Zoom.
3. **Das Kundenblatt** — Name, Ort, seine Maschinen, Tipp führt in die
   Maschinenansicht.
4. **Liste einlesen** — mehrere Kunden auf einmal. Erst wenn jemand mehr als
   eine Handvoll hat.

Schnitt 1 steht für sich und ist der einzige, der ohne Netz auskommt. Er
kommt zuerst.
