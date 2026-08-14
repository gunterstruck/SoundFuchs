# Kunden und Karte

_Ausgearbeitet am 14.08.2026, nachdem der Auftraggeber einen Kompromiss zur
Karten-Frage vorgeschlagen hat._

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

| Feld         | Pflicht | Herkunft                          |
| ------------ | ------- | --------------------------------- |
| `id`         | ja      | vergeben                          |
| `name`       | ja      | eingegeben                        |
| `plz`        | ja      | eingegeben                        |
| `ort`        | nein    | **füllt sich aus der PLZ selbst** |
| `lat`, `lng` | nein    | aus der PLZ berechnet             |
| `geo`        | ja      | `plz` \| `none`                   |

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

| Posten                           | Größe   |
| -------------------------------- | ------- |
| `plz-centroids.json` (8.300 PLZ) | 226 KB  |
| `plz-places.json` (Ortsnamen)    | 175 KB  |
| Leaflet                          | ~150 KB |

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

1. **Kunde anlegen** — ✅ steht. Entität, PLZ-Eingabe, Ort füllt sich selbst,
   Maschine bekommt `customerId`. Nützlich ohne jede Karte: Der Bestand lässt
   sich nach Kunde gruppieren.
2. **Die Karte** — ✅ steht. Leaflet, Marker, Zoom.
3. **Das Kundenblatt** — ✅ steht, zusammen mit der Karte. Name, Ort, seine
   Maschinen, Tipp führt in die Maschinenansicht.
4. **Liste einlesen** — ✅ steht. Mehrere Kunden auf einmal, aus einer CSV.

Schnitt 1 steht für sich und ist der einzige, der ohne Netz auskommt. Er
kommt zuerst.

### Was Schnitt 1 geworden ist

Das Kundenfeld sitzt im Anlegen-Formular der Maschine, nicht in einer eigenen
Verwaltung. Wer eine Maschine anlegt, weiß in genau diesem Moment, bei wem sie
steht — später weiß es niemand mehr. Voreingestellt ist „kein Kunde"; wer die
Auswahl stehen lässt, merkt vom ganzen Vorgang nichts.

Sichtbar wird der Kunde an zwei Stellen: in der Nebenzeile der Maschinenzeile
(an der Stelle des freien Ortsfelds, nicht daneben — die Zeile bleibt
einzeilig) und im Maschinenblatt unter dem Namen.

**Eine Namensgleichheit, die täuscht.** `HashRouter` führt intern ebenfalls ein
`customerId` — das ist der `c`-Parameter aus dem NFC-Link und **kein Kunde**,
sondern der Name einer Referenz-Sammlung; die Oberfläche heißt ihn längst
„Referenz-Sammlung (c)". Er landet ausschließlich in `referenceDbUrl` und nie
an der Maschine. In `types.ts` steht das jetzt als Warnung, weil ein
Verwechseln jede über NFC eingerichtete Maschine an einen Kunden hängen würde,
den es nicht gibt.

Bewacht wird der Schnitt von `npm run attention-check`: „+ Neuer Kunde" muss
die Felder aufklappen, die PLZ 45127 muss „Essen" nachtragen, und der Kunde
muss danach an seiner Maschine erscheinen. Der mittlere Punkt hängt an den
beiden bewusst nicht vorgeladenen Geodaten-Dateien — verschiebt sie jemand,
fällt es hier auf und nirgends sonst.

### Was Schnitt 2 geworden ist

Die drei Kartengründe sind eins zu eins von TourFuchs übernommen
(`CONFIG.tileLayers`), samt Adressen, Zoomgrenzen und Quellenangaben — Hell,
Standard, Satellit. Nicht aus Bequemlichkeit: Wer beide Apps nebeneinander
benutzt, soll dieselbe Karte sehen. Die zuletzt gewählte Darstellung bleibt
gemerkt.

**Die Quellenangabe steht an drei Stellen**, weil sie Bedingung der Nutzung ist
und nicht Schmuck: am Datensatz selbst (`src/services/mapTiles.ts`), unten
rechts auf der Karte (Leaflets `attributionControl`, ausdrücklich
eingeschaltet, nur Leaflets eigene Werbezeile ist abgeschaltet) und im Dialog
„Über SoundFuchs". Die NOTICE führt sie ebenfalls. Ein Unit-Test hält fest,
dass keiner der drei Einträge seine Angabe verliert.

**Leaflet wird nachgeladen.** 150 KB Code und 16 KB Stylesheet stehen nicht im
Vorrat des Service Workers (`globIgnores`), sondern kommen per `import()` beim
ersten Öffnen und liegen danach im Zwischenspeicher — dieselbe Überlegung wie
bei den PLZ-Daten und beim TensorFlow-Paket. Der Umfang der Installation ist
dadurch unverändert: 30 Einträge wie zuvor.

**Der Menüeintrag erscheint erst, wenn es etwas zu sehen gibt.** Ohne einen
verorteten Kunden bliebe die Karte ein graues Feld — und ein Knopf, der auf ein
graues Feld führt, ist genau die Sorte, die hier schon fünfmal ausgemerzt
wurde. Dieselbe Regel wie bei den Themen in den Einstellungen, nur zu Daten
statt zu Ansichtsstufen.

**Der Marker sagt, was er weiß.** Ein Kunde liegt auf der Ortsmitte seiner
Postleitzahl; der gestrichelte Ring und die Zeile „Ortsmitte" im Blatt halten
das fest, statt eine Hausnummer-Genauigkeit zu behaupten. Kunden ohne
Koordinaten verschwinden nicht stillschweigend — eine Zeile unter der Karte
sagt, wie viele es sind.

Bewacht wird die ganze Kette von `attention-check`: Menüzeile → Karte → Marker
→ Kundenblatt → Maschinenansicht, dazu die Zahl der Kartengründe und das
Vorhandensein der Quellenangabe. Jedes Glied kann still reißen, und keines
davon würde ein Unit-Test bemerken.

### Beispieldaten und Schnitt 4: eine Liste einlesen

Zwei weitere Bausteine, in derselben Kategorie „Kunden" der Einstellungen
(Experten-Stufe, wie die Datenverwaltung direkt daneben — beides
Einrichtungs-, keine Alltagsaufgaben).

**Beispieldaten.** Wer die App vorführen will, braucht etwas zum Zeigen, ohne
vorher fremde Kunden einzutippen. Rund 100 erfundene Kunden entstehen
deutschlandweit verteilt — dasselbe Grundprinzip wie bei TourFuchs
(`createDemoCustomers`): ein deterministischer Zufallsgenerator, grobe
Bezirks-Anker über das Land verteilt, jede Postleitzahl ihrem nächsten Anker
zugeordnet. Nicht übernommen ist TourFuchs' Vertriebslogik — Umsatz, Kanal,
Zuständigkeit —, die passt zu TourFuchs, nicht zu einer App, die
Maschinenzustände prüft. Die Branchen sind deshalb andere: Gießerei, Sägewerk,
Kläranlage — Orte mit rotierenden Maschinen.

Jeder Beispielkunde trägt `demo: true` und einen Namen, der mit
„SoundFuchs Demo · " beginnt; jede seiner Maschinen (genau eine je Kunde)
trägt dasselbe Feld. „Beispieldaten entfernen" löscht gezielt darüber, nicht
über den Namen — und lässt jeden echten Kunden unberührt, was ein Test
festhält.

**Keine erfundene Referenz.** Die Beispielmaschinen bleiben unangelernt und
zeigen „Referenz fehlt". Das ist eine bewusste Entscheidung, keine
Unterlassung: Eine Referenz ist ein trainiertes Muster aus einer echten
Aufnahme. Sie vorzutäuschen hieße, Gewichte zu erfinden, die wie eine Messung
aussehen, aber keine ist — dieselbe Art Täuschung, die die
Postleitzahl-Verortung an anderer Stelle bewusst vermeidet (sie sagt
„Ortsmitte", statt eine Hausnummer-Genauigkeit zu behaupten, die sie nicht
hat). Ein erfundenes Klangbild wäre dasselbe, nur im Ton statt auf der Karte.

**Schnitt 4 — eine Kundenliste einlesen.** Eine CSV-Datei mit bis zu vier
Spalten: Name und PLZ Pflicht, Ort und Maschine optional. Von TourFuchs
abgeschaut ist die Idee des Imports, nicht das Format — dort wird eine ganze
Kundenverwaltung mit Umsatz, Vertriebsbezirk und Kanal eingelesen
(`src/services/excel.js` + `src/ui/importWizard.js`, zusammen rund 1700
Zeilen); das gehört zu TourFuchs' Aufgabe. Ein Kunde hier ist schmal (§2), und
die Liste, die jemand mitbringt, ist es auch. Ein erneutes Einlesen derselben
Datei verdoppelt nichts — Name und PLZ zusammen sind der Schlüssel, gegen den
geprüft wird.

Bewacht wird beides von `attention-check`: der Knopf lädt tatsächlich rund 100
Maschinen und wechselt seine Beschriftung, „entfernen" räumt tatsächlich
alles wieder ab, und — der eigentliche Fund beim Bauen — das Thema „Kunden"
blendet fremde Abschnitte im Dialog auch wirklich aus. Diese letzte Prüfung
kam nicht aus Vorsicht dazu: Die CSS-Regel, die Themen filtert, zählt sie
einzeln auf statt sie generisch zu behandeln; „kunden" fehlte zunächst in
dieser Liste, der Dialog zeigte beim Test klaglos _alles_ statt nur der
eigenen Kategorie, und kein einzelner Sichtbarkeits-Check hätte das bemerkt,
weil der eigene Knopf ja trotzdem da war.
