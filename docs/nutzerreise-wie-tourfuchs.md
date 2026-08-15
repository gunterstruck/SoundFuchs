# Die Nutzerreise von TourFuchs übernehmen

_Strategie, 15.08.2026. Auftrag: „Die Nutzerreise soll genauso aussehen wie bei
TourFuchs. Also Struktur und Design. 100 % wo möglich, komplett analog. Aber:
Kundendaten haben PLZ, Stadt und ggf. die zugehörigen Maschinen — nichts
weiter. Alles parallel, weil Konzept ist geprüft, jede Designänderung
kritisch."_

**Diese Datei setzt nichts um. Sie beschreibt, was ist, was werden soll und in
welcher Reihenfolge — damit vor dem ersten Handgriff entschieden ist, was
gebaut wird.**

---

## 0. Die Regel

**TourFuchs ist die Vorgabe. Übernehmen ist der Normalfall und braucht keine
Begründung. Abweichen ist der Sonderfall und braucht eine — in Struktur,
Design und Funktion gleichermaßen.**

Diese Fassung führt deshalb ein vollständiges **Abweichungsregister** (§4a):
jedes Bauteil von TourFuchs, in der Reihenfolge des Quelltexts, mit Marke und
Grund. Was ohne Marke steht, wird eins zu eins übernommen.

| Marke | Bedeutung                                                                |
| ----- | ------------------------------------------------------------------------ |
| **Ü** | Übernommen — keine Abweichung                                            |
| **F** | Füllung — derselbe Platz, gefüllt mit dem, was SoundFuchs dort hat       |
| **A** | Auftrag — ausdrücklich so bestellt                                       |
| **I** | Kein Inhalt — SoundFuchs hat nichts, was hineingehört                    |
| **L** | Später — übernehmbar, nur nicht in den ersten Schnitten. Keine Ablehnung |
| **S** | Sache — die Aufgabe der App ist eine andere. Stärkste Begründung nötig   |

Bilanz: 14 × Ü · 5 × F · 3 × A · 5 × I · 4 × L · **2 × S**. Nur die beiden S
sind echte Abweichungen aus eigenem Urteil.

---

## 0b. Was ich zurücknehme

In der ersten Fassung habe ich vorgeschlagen, das Blatt auf „Halb" starten zu
lassen statt auf „Peek" wie TourFuchs — mit dem Argument, ohne Empfang bliebe
sonst eine graue Fläche stehen.

**Das war eine Abweichung, die ich nicht hätte erfinden müssen.** TourFuchs hat
für genau diesen Fall längst eine Regel; ich hatte sie nur nicht gelesen
(`src/styles/responsive.css`):

```css
/* Erster Start / Neustart nach dem Zuruecksetzen: bewusst kompakt (rund ein
   Drittel bis knapp die Haelfte), damit oben die Deutschlandkarte sichtbar
   bleibt. */
.sidebar.onboarding {
  height: min(52dvh, 480px);
}
```

Dazu `sidebarOpen: !isPhoneUi()` (am Handy startet das Blatt eingeklappt) und
`goToTourPlanning()`, das es von selbst aufzieht, sobald jemand zu arbeiten
anfängt.

**Drei Zustände, alle von TourFuchs:**

| Lage              | Blatt                                              |
| ----------------- | -------------------------------------------------- |
| Leerer Bestand    | rund halbhoch (52 dvh), Karte bleibt oben sichtbar |
| Daten da, in Ruhe | Peek (46 px)                                       |
| Beim Arbeiten     | zieht sich selbst auf Arbeitshöhe                  |

Für SoundFuchs heißt „beim Arbeiten": eine Maschine ist gewählt, eine Prüfung
beginnt. Keine eigene Erfindung nötig — und der Einwand mit der grauen Fläche
ist damit auch erledigt.

---

## 0c. Fassung 3: die wichtigste Korrektur

Fassung 2 bildete TourFuchs' Reiter _Tour_ auf einen Reiter _Prüfen_ ab —
derselbe Dreischritt, andere Sache. Formal richtig, inhaltlich falsch.

**SoundFuchs entspricht nicht dem Tour-Reiter, sondern dem Briefing-Knopf.**

In TourFuchs trägt jedes Kunden-Popup unten eine Knopfreihe
(`customerPopupHtml`, `src/features/map.js`):

```
🚩 Als Start   🏁 Als Ziel   ➕ Zur Tour   📋 Briefing
```

Die ersten drei planen die Route. Der vierte öffnet die eigentliche Tiefe:
einen Dialog, dessen Umfang die Ansichtstiefe steuert
(`customerBriefingFlow(depth)` → `manual` oder `choice`).

Genau dort sitzt SoundFuchs. Nur nicht mit _einem_ Knopf je Kunde, sondern mit
**einem Knopf je Maschine** — und dahinter entfaltet sich per semantischem
Zoom der ganze Prüfablauf.

| TourFuchs · Kunden-Popup    | SoundFuchs · Standort-Popup          |
| --------------------------- | ------------------------------------ |
| Müller Guss GmbH            | Müller Guss GmbH                     |
| 45127 Essen · ca. PLZ-Mitte | 45127 Essen · ca. PLZ-Mitte          |
| ~~🚩 Als Start~~            | 🎧 Pumpe 17 · 94 %                   |
| ~~🏁 Als Ziel~~             | 🎧 Lüfter West · 71 %                |
| ~~➕ Zur Tour~~             | 🎧 Kompressor 3 · Referenz fehlt     |
| **📋 Briefing**             | _je Maschine ein Knopf in die Tiefe_ |

Damit steht auch, warum der Reiter _Tour_ ersatzlos entfällt und nicht
umgedeutet wird: Er plant Wege, SoundFuchs hat keine. Und das Prüfen einer
einzelnen Maschine ist **kein Reiter** — es liegt hinter dem Maschinenknopf im
Popup und ebenso hinter der Maschinenzeile im Reiter „Daten", damit der Weg
auch ohne Empfang trägt.

---

## 0d. Standort statt Kunde

Ein Ort trägt **Name, Postleitzahl, Stadt** und die Maschinen, die dort
stehen. Der Name muss keine Firma sein; _zu Hause_ ist ein zulässiger
Standort.

Deshalb heißt die Sache künftig **Standort**, nicht Kunde. Das ist keine
Kosmetik: „Kunde" verspricht Handel — Umsatz, Vertrag, Ansprechpartner —, und
genau das trägt SoundFuchs ausdrücklich nicht. „Standort" verspricht einen
Ort, und mehr ist es auch nicht. Der schmale Datensatz ist dann kein
beschnittener Kunde, sondern ein vollständiger Standort.

Kosten: Umbenennen in Oberfläche und Sprachdateien, die Datenstruktur bleibt.
Die Brücke zu TourFuchs trägt weiter — ein TourFuchs-Kunde _ist_ ein Standort,
nur einer mit mehr daran.

---

## 0e. Die Flotte ist nicht gleichrangig

Fassung 2 füllte TourFuchs' Modus-Schalter mit „Prüfen · Flotte". **Falsch.**
Die Flotte steht nicht neben dem Prüfen einer Maschine, sie ist ein Sonderfall
davon. Der Modus-Schalter bekommt damit keinen Inhalt und entfällt — wie in
Fassung 1, diesmal aus dem richtigen Grund.

Stattdessen zwei Funktionen im Blatt. Beide gibt es heute schon, nur an
prominenter falscher Stelle:

| Funktion                   | Was sie tut                                                                                       | Heute                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Flotte aus dem Bestand** | Aus den bekannten Maschinen eine Flotte zusammenstellen und prüfen                                | „Flottencheck", Umschalter mitten in der Maschinenliste |
| **Flotte ohne Bestand**    | Mehrere unbekannte Maschinen vergleichen, ohne sie anzulegen — der Standort darf schon feststehen | „Schnellvergleich — Maschinen vergleichen ohne Setup"   |

Beide ziehen ins Blatt, dorthin, wo TourFuchs seinen Besuchsplaner hat. Damit
ist der Tour-Platz doch besetzt — aber mit dem, was der Auftrag dorthin
stellt, nicht mit einer Umdeutung: Beide sammeln erst eine Menge zusammen und
arbeiten sie dann ab, dieselbe Form wie „Vorschläge → meine Tour".

---

## 0f. Die Live-Demos

TourFuchs' Schaufenster führt echte Klicks durch die laufende App. Für
SoundFuchs passt davon inhaltlich noch nichts — die Reise, die sie zeigen
müssten, entsteht ja gerade erst.

**Beschluss: Platzhalter.** Die Stelle im Blatt bleibt vorgesehen und leer;
welche Demos sinnvoll sind, wird entschieden, wenn die Reiter stehen. Eine
Demo, die eine Reise zeigt, die es noch nicht gibt, wäre nur eine weitere
Sache, die man später wegwirft.

## 1. Was ich falsch verstanden hatte

Bis heute früh habe ich „wie TourFuchs" als **Aussehen** gelesen: dieselben
Farben, dieselben Radien, dieselbe Kopfleiste, das Fuchszeichen, die zwei
Pillen, das Blatt von unten. Das ist alles gebaut und stimmt auch.

Gemeint war aber die **Reise** — die Reihenfolge, in der man Dinge tut, und
wo sie liegen. Und da sind die beiden Apps nicht ähnlich, sondern
gegensätzlich aufgebaut. Das ist der eigentliche Befund dieses Dokuments, und
er lässt sich in einer Tabelle sagen.

---

## 2. Der Befund: zwei umgekehrte Grundschichten

Gemessen an `index.html` und `src/styles/` beider Apps.

|                         | **TourFuchs**                                              | **SoundFuchs heute**                 |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------ |
| Was immer im Bild steht | **Die Deutschlandkarte** (`<main id="map">`)               | Eine scrollende Seite                |
| Die Arbeitsfläche       | **Blatt von unten**, mit Reitern (`<aside id="sidebar">`)  | Dieselbe scrollende Seite            |
| Wozu das Blatt dient    | Der Arbeitsplatz — alles passiert darin                    | Nur ein Menü: „Einstellungen & mehr" |
| Wo die Karte liegt      | Der Grund, immer da                                        | Ein Fenster, das man öffnet          |
| Navigation              | **Reiter**: Karte · Daten · Filter · Tour                  | Scrollen + drei aufklappbare Karten  |
| Tiefe (Basis/Profi)     | Im schwebenden Kopfstreifen über der Karte                 | Inline unter der Kopfleiste          |
| Fokus                   | **Modus-Schalter**: Außendienst · Gebietsplanung · Service | —                                    |

Alles andere folgt daraus. TourFuchs hat **eine** Seite, die sich nie ändert,
und darüber ein Blatt, das man hochzieht und dessen Inhalt man über Reiter
wechselt. SoundFuchs hat eine lange Seite, durch die man scrollt, und Fenster,
die sich darüberlegen.

### Die Maße, an denen das hängt

TourFuchs, `src/styles/responsive.css`:

```
--mobile-sheet-peek: 46px;            /* eingeklappt sichtbar          */
--mobile-sheet-half: min(68dvh,620px) /* nach dem Hochziehen           */
.sidebar { transform: translateY(calc(100% - var(--mobile-sheet-peek))) }
.sidebar.open { transform: translateY(0) }
```

Und ein Kniff, den SoundFuchs übernehmen kann, weil er das Risiko klein hält:
`applyMobileChrome()` in `src/ui/sidebar.js` **verschiebt** die vorhandenen
Elemente (Tiefenschalter, Reiterleiste) je nach Bildschirmbreite zwischen
Sidebar und Kopfstreifen — es baut sie nicht neu. Dieselben Knöpfe, dieselben
Zuhörer, nur ein anderer Platz.

---

## 3. Die eine echte Spannung — und wie sie sich auflöst

**TourFuchs' Aufgabe ist geografisch.** Wohin fahre ich, in welcher
Reihenfolge? Die Karte _ist_ die Arbeit. Sie als Grund zu nehmen, ist keine
Gestaltungsidee, sondern die Sache selbst.

**SoundFuchs' Aufgabe ist akustisch.** Handy an die Maschine, aufnehmen,
vergleichen. Die Arbeit ist das Mikrofon und das Ergebnis. Die Geografie ist
der _Zusammenhang_, nicht die Arbeit.

Daraus folgen zwei Dinge, die ich benennen muss, bevor irgendjemand baut:

**a) Der reibungsarme Weg darf nicht länger werden.** Heute misst
`npm run durchlauf` elf Schritte vom leeren Bestand bis zum gespeicherten
Ergebnis. Wird die Karte zum Grund und die Arbeit wandert ins Blatt, kann
daraus leicht ein Schritt mehr werden. **Das ist die Zahl, an der die ganze
Umstellung zu messen ist** — vorher und nachher, nicht nach Gefühl.

**b) Ohne Empfang ist der Grund grau.** Kacheln brauchen Netz. In einer Halle
ohne Empfang blickt der Techniker auf eine graue Fläche. TourFuchs hat
dasselbe Problem, aber dort ist es ehrlich: Ohne Netz kann man auch nicht
navigieren. Bei SoundFuchs wäre es ein Rückschritt — geprüft wird gerade
_dort_, wo kein Empfang ist.

**Die Auflösung steht in §0b und stammt von TourFuchs selbst.** Ich hatte
hier zunächst einen abweichenden Startwert vorgeschlagen; das war unnötig.
TourFuchs führt drei Blatt-Zustände — halbhoch im leeren Bestand, Peek in
Ruhe, aufgezogen beim Arbeiten. Übernimmt man alle drei, ist Punkt b)
miterledigt: Im leeren Bestand und beim Arbeiten steht die Arbeit im Bild, die
graue Fläche nie zwischen jemandem und seiner Aufgabe.

Punkt a) bleibt: **die elf Schritte sind die Zahl, an der die Umstellung zu
messen ist** — vorher und nachher, nicht nach Gefühl.

---

## 4. Die Zuordnung: was wird woraus

### 4.1 Die Reiter

TourFuchs führt im Fokus „Außendienst" vier Reiter. Für jeden gibt es in
SoundFuchs eine Entsprechung — teils existiert sie schon, nur an anderer
Stelle.

| TourFuchs                        | SoundFuchs   | Woraus es entsteht                                               |
| -------------------------------- | ------------ | ---------------------------------------------------------------- |
| **Karte** (mobil, „In der Nähe") | **Karte**    | `CustomerMap` (steht) + neue Nahliste                            |
| **📄 Daten**                     | **📄 Daten** | Maschinenübersicht + Kunden + Import/Beispieldaten (alles steht) |
| **Filter**                       | **Filter**   | neu, klein: Zustand · Kunde · Flottengruppe                      |
| **Tour** (Besuchsplaner)         | **Prüfen**   | die drei aufklappbaren Karten (stehen)                           |

**Der stärkste Fund dieser Untersuchung steht in der letzten Zeile.**
TourFuchs' Besuchsplaner ist ein Dreischritt mit waagerechter Schrittleiste
(`#tour-stepper`): 1 Startpunkt · 2 Vorschläge · 3 Meine Tour. SoundFuchs hat
längst denselben Dreischritt, nur als scrollende Karten untereinander:
1 Scannen oder anlegen · 2 Normalzustand aufnehmen · 3 Zustand prüfen.

Das ist keine Analogie, die man sich zurechtlegt — das ist dieselbe Form. Der
Reiter „Prüfen" ist damit kein Neubau, sondern ein Umzug: dieselben drei
Abschnitte, dieselben Knöpfe, in TourFuchs' Schrittleiste statt untereinander.

### 4.2 Was NICHT übernommen wird

**Der Modus-Schalter** ist keine Abweichung, sondern ein Platz, den SoundFuchs
füllen kann. TourFuchs führt dort drei Berufe; SoundFuchs hat zwei Betriebsarten,
die es heute schon gibt — „Übersicht" und „Flottencheck", derzeit als Umschalter
mitten in der Maschinenliste. Sie ziehen an TourFuchs' Stelle. Der Tiefenschalter
Basis/Profi bleibt daneben, wie dort.

**Alles am Kunden außer PLZ, Ort und seinen Maschinen** — so ausdrücklich
beauftragt. TourFuchs' Kunden-Popup führt Straße, Kundennummer, Kanal ›
Gruppe › Bezirk, Umsatz, Ansprechpartner, Serviceeinsätze, Verträge,
Besuchsrhythmus. Nichts davon kommt mit. Das steht bereits so
(`docs/kunden-und-karte.md` §2) und ändert sich nicht.

**Panel-Zoom** (`+ / 100% / −`), **Sidebar-Breite ziehen**, **Mobile-Vorschau**
(`📱`). Werkzeuge für den Schreibtisch eines Vertrieblers mit 1.500 Kunden.
Sie kosten Bedienelemente im Budget und lösen bei SoundFuchs kein Problem.

**Die Live-Demos** (`showcase.js`, „echte Klicks in der laufenden App"). Ein
eigenes Vorhaben, das man später erwägen kann. Beispieldaten allein
beantworten die Frage „was ist das hier" schon.

### 4.3 Was schon eins zu eins da ist

Damit die Liste ehrlich ist — das folgende ist bereits übernommen und muss
nicht angefasst werden: Farbtafel und Radien (`--radius-s/m/l/xl/pill`,
`#0d9488`), Kopfleiste 52 px mit Zeichen links / Suche mittig / runde Knöpfe
rechts, die drei Striche für das Blatt, der ziehbare Griff, Basis/Profi als
Segmentschalter, die drei Kartengründe Hell · Standard · Satellit, die
Marker-Stapel, `attention-check` als Messstrecke.

---

## 4a. Das Abweichungsregister

Jedes Bauteil von TourFuchs, in der Reihenfolge des Quelltexts. Marken siehe
§0. Was ohne Marke steht, wird eins zu eins übernommen.

### Kopfleiste

| TourFuchs                |       | SoundFuchs              | Grund                                                                                                                                                            |
| ------------------------ | ----- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ☰ Blatt-Schalter        | Ü     | steht                   | —                                                                                                                                                                |
| 🦊 Zeichen               | Ü     | steht                   | —                                                                                                                                                                |
| Schriftzug, am Handy aus | Ü     | steht                   | —                                                                                                                                                                |
| Suche „Kunde, Ort, PLZ"  | Ü     | „Maschine, Ort oder ID" | dieselbe Sache, eigene Begriffe                                                                                                                                  |
| 📱 Mobile-Vorschau       | **S** | entfällt                | zeigt dem Schreibtisch die Handy-Ansicht. SoundFuchs wird am Handy benutzt, der Schreibtisch ist nur die Einrichtung — die Vorschau zeigte, wo man ohnehin steht |
| 🔓 Tresor                | I     | entfällt                | Tresor steht bei SoundFuchs als „später" im Menü                                                                                                                 |
| ⓘ Info                   | Ü     | steht                   | —                                                                                                                                                                |

### Kopfstreifen und Grund

| TourFuchs                   |     | SoundFuchs | Grund |
| --------------------------- | --- | ---------- | ----- |
| `#mobile-topnav`            | Ü   | zu bauen   | —     |
| `<main id="map">` als Grund | Ü   | zu bauen   | —     |

### Das Blatt

| TourFuchs                          |     | SoundFuchs                       | Grund                                                                             |
| ---------------------------------- | --- | -------------------------------- | --------------------------------------------------------------------------------- |
| Griff zum Ziehen                   | Ü   | steht                            | —                                                                                 |
| Peek / Halb / Voll, 46 px · 68 dvh | Ü   | zu bauen                         | samt der drei Zustände aus §0b                                                    |
| Breite ziehen (Schreibtisch)       | L   | später                           | gehört zur Schreibtisch-Anordnung, Schnitt 6                                      |
| Panel-Zoom + / 100 % / −           | L   | später                           | kein Grund dagegen; kostet drei Bedienelemente, deshalb nicht in Schnitt 1        |
| 🧪 Beispieldaten-Streifen          | Ü   | **fehlt heute**                  | Lücke, keine Abweichung — kommt dazu                                              |
| Basis / Profi                      | Ü   | steht                            | —                                                                                 |
| Modus-Schalter (3 Fokus)           | F   | Prüfen · Flotte                  | „Übersicht / Flottencheck" ist heute schon ein Umschalter, nur an falscher Stelle |
| Modus-Hinweis                      | Ü   | mit dem Modus                    | —                                                                                 |
| Service-Handlungsbedarf            | I   | entfällt                         | keine Serviceverträge                                                             |
| Kartenstil als Auswahl             | Ü   | **heute drei Pillen im Fenster** | wird angeglichen: Auswahl ins Blatt                                               |
| Hinweis „nur am Schreibtisch"      | I   | entfällt                         | keine Gebietsplanung                                                              |
| Erste-Schritte-Checkliste          | Ü   | **heute anders**                 | „So funktioniert SoundFuchs" (1·2·3) wird Checkliste mit Fortschritt              |

### Die Reiter

| TourFuchs                 |     | SoundFuchs | Grund                                           |
| ------------------------- | --- | ---------- | ----------------------------------------------- |
| Karte („In der Nähe")     | Ü   | Karte      | —                                               |
| 📄 Daten                  | Ü   | 📄 Daten   | Beschriftung übernommen, nicht „Bestand"        |
| Filter                    | F   | Filter     | statt Bezirken: Zustand · Kunde · Flottengruppe |
| Tour (Besuchsplaner)      | F   | Prüfen     | derselbe Dreischritt mit Schrittleiste — §4.1   |
| 🗺️ Gebiete                | I   | entfällt   | keine Vertriebsbezirke                          |
| 🧰 Einsätze · 🛡️ Verträge | I   | entfällt   | kein Servicevertrags-Begriff                    |

### Am Kunden

| TourFuchs                                                                                              |     | SoundFuchs      | Grund                                                                             |
| ------------------------------------------------------------------------------------------------------ | --- | --------------- | --------------------------------------------------------------------------------- |
| Name · PLZ · Ort                                                                                       | Ü   | steht           | —                                                                                 |
| Marker „ca. (PLZ-Mitte)"                                                                               | Ü   | steht           | —                                                                                 |
| Stapel ab 5–6 Markern                                                                                  | Ü   | steht           | —                                                                                 |
| Straße · Kd.-Nr. · Kanal · Gruppe · Bezirk · Umsatz · Ansprechpartner · Einsätze · Verträge · Rhythmus | A   | entfällt        | „Kundendaten haben PLZ, Stadt und ggf. die zugehörigen Maschinen — nichts weiter" |
| — (gibt es dort nicht)                                                                                 | F   | seine Maschinen | an der Stelle, an der TourFuchs Umsatz und Kanal zeigt                            |

### Weiteres

| TourFuchs                        |       | SoundFuchs | Grund                                                                                                                     |
| -------------------------------- | ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Live-Demos im Schaufenster       | L     | später     | eigenes Vorhaben, rund 1.000 Zeilen; Beispieldaten beantworten „was ist das" schon                                        |
| Tourplanung, Routen, Google Maps | **S** | entfällt   | zwischen Maschinen desselben Kunden gibt es kein Wegeproblem — genau dafür ist TourFuchs da, und dort entsteht die Brücke |
| Nominatim-Adressgenauigkeit      | A     | entfällt   | ohne Straße keine Hausnummer; PLZ-Mitte genügt                                                                            |

**Nur die beiden mit S sind Abweichungen aus eigenem Urteil.** Alles andere ist
übernommen, gefüllt, ausdrücklich bestellt, inhaltlich leer oder zurückgestellt.

---

## 5. Der Weg: parallel, nicht als Umbau

Der Auftrag sagt es deutlich: _„Alles parallel — weil Konzept ist geprüft,
jede Designänderung kritisch."_ Das ist die richtige Vorsicht. Die geprüften
Dinge sind der Prüfablauf (elf Schritte, gemessen), das Kamerabild während der
Prüfung, das Abspielen der Aufnahmen, das 3D-Gebirge. Nichts davon darf
unterwegs kaputtgehen, auch nicht für einen Tag.

### Drei mögliche Wege — und warum ich einen davon empfehle

**(a) Zweite HTML-Datei** (`schale.html` neben `index.html`). _Abgelehnt._
Genau diese Falle steht schon einmal im Quelltext: `vite.config.ts` erklärt,
warum der GitHub-Pages-Weg entfiel — „zwei Ziele für dieselbe App bedeuten
zwei Stände, die auseinanderlaufen". Das gilt für zwei Schalen genauso.

**(b) Nur CSS umschalten.** _Reicht nicht._ Ein Reiter muss Inhalte
nebeneinanderstellen, die heute untereinander stehen; das braucht einen
Elternwechsel im DOM, den CSS nicht leisten kann.

**(c) Eine Schale, die vorhandene Abschnitte umhängt — umschaltbar.**
**Empfohlen.** Genau das macht TourFuchs selbst (`applyMobileChrome()`): Die
Abschnitte bleiben, wo sie im Quelltext stehen, samt ihren IDs, ihren
Zuhörern, ihren Tests. Eine neue Schale hebt sie zur Laufzeit an ihren neuen
Platz. Ein Schalter (Profi-Einstellung, anfangs standardmäßig aus) entscheidet,
welche Schale läuft.

Das hat drei Eigenschaften, die hier zählen:

- **Die alte Reise bleibt bis zum Schluss vollständig benutzbar** — nicht als
  Kopie, sondern als dieselbe.
- **Beide lassen sich am selben Bau messen.** `durchlauf` und
  `attention-check` können nacheinander gegen beide Schalen laufen und die
  Zahlen nebeneinanderlegen. Genau das verlangt „Konzept ist geprüft".
- **Der Rückweg ist ein Schalter**, kein Zurückrollen.

### Was das konkret heißt

Eine neue Datei `src/ui/shell/Schale.ts` (Name offen), die:

1. Grund, Kopfstreifen, Blatt und Reiterleiste aufbaut,
2. die vorhandenen Abschnitte per `appendChild` in ihre Reiter hängt,
3. beim Abschalten alles an den Ursprungsplatz zurückhängt.

Keine Zeile in `1-Identify.ts`, `2-Reference.ts`, `3-Diagnose.ts`. Wenn dort
etwas geändert werden muss, ist der Umzug an dieser Stelle noch nicht richtig
zugeschnitten.

---

## 6. Schnitte

Jeder Schnitt ist für sich prüfbar und für sich zurücknehmbar.

**0 — Das Messgerät schärfen.** `durchlauf` um Kamerabild, Abspielen und
3D-Gebirge erweitern. _Vor allem anderen_ — sonst wird der größte Umbau mit
einem Messgerät geprüft, das die Auflagen des Auftraggebers nicht ansieht.

**1 — Die Schale, leer.** Grund (Karte), Kopfstreifen (Tiefe + Reiter), Blatt
mit Peek/Halb/Voll und den TourFuchs-Maßen. Noch ohne Inhalte: Die Reiter
sind da, die Abschnitte liegen weiter, wo sie liegen. _Prüfbar:_ Die Gesten
tragen, die alte Schale ist unverändert.

**2 — Reiter „Prüfen".** Die drei Karten ziehen in die Schrittleiste um.
_Der wichtigste Schnitt_ — hier entscheidet sich, ob die Reise besser oder
schlechter wird. _Prüfbar:_ `durchlauf` muss elf Schritte bleiben, und der Weg
von kalt bis „Prüfung starten" darf nicht länger werden.

**3 — Reiter „Bestand".** Maschinenübersicht, Kunden, Import, Beispieldaten.
_Prüfbar:_ Zeilentipp öffnet weiterhin die Maschinenansicht.

**4 — Reiter „Karte".** Die Karte ist der Grund; der Reiter trägt die Nahliste
(„In der Nähe", Kartenmitte oder Standort) wie TourFuchs' `#tab-karte`.

**5 — Reiter „Filter".** Zustand · Kunde · Flottengruppe. Klein, neu.

**6 — Umschalten.** Voreinstellung auf die neue Schale drehen, alte Schale als
Rückweg behalten. Erst wenn die Zahlen aus 2 stimmen.

**7 — Aufräumen.** Alte Schale entfernen, wenn niemand sie mehr braucht.

Schnitt 1 und 2 sind zusammen die Entscheidung. Wenn nach Schnitt 2 die Zahlen
schlechter sind als heute, ist das die Antwort — und der Schalter bleibt aus.

---

## 7. Was gemessen wird

Vor dem ersten Schnitt aufnehmen, nach jedem Schnitt wiederholen, beide
Schalen nebeneinander:

| Maß                                   | Heute          | Muss           |
| ------------------------------------- | -------------- | -------------- |
| `durchlauf` Schritte bis zum Ergebnis | 11 ✓           | 11, nicht mehr |
| Tipps von kalt bis „Prüfung starten"  | (aufzunehmen)  | nicht mehr     |
| Erstbild, Bedienelemente (Handy)      | 11 (Budget 12) | ≤ 12           |
| Nutzbare Textbreite (Handy)           | 332 px von 390 | ≥ 332 px       |
| Einstellungen Basis / Profi           | 26 / 47        | ≤ 28 / ≤ 52    |
| Kamerabild während der Prüfung        | trägt          | trägt          |
| Abspielen der Aufnahmen               | trägt          | trägt          |
| 3D-Gebirge                            | trägt          | trägt          |

Die letzten drei sind die ausdrücklichen Auflagen des Auftraggebers
(„technisch muss alles erhalten bleiben"). Sie sind heute nicht automatisch
bewacht — **Vorschlag: `durchlauf` um drei Schritte erweitern**, die genau
das anfassen, bevor Schnitt 2 beginnt. Sonst prüft man die Umstellung mit
einem Messgerät, das die kritischen Stellen gar nicht ansieht.

---

## 8. Risiken, offen benannt

**Die Reise wird länger statt kürzer.** Das größte Risiko, und der Grund für
die Messung in §7. Ein Blatt, das man erst hochziehen muss, kostet eine Geste,
die es heute nicht gibt. Gegenmittel: Startwert „Halb" (§3), und die Zahlen
entscheiden, nicht der Geschmack.

**Der graue Grund ohne Empfang.** Siehe §3b. Gegenmittel: Startwert „Halb",
und die Karte ist nie Voraussetzung für die Arbeit.

**Zwei Schalen, die auseinanderlaufen.** Das Risiko des parallelen Wegs.
Gegenmittel: Weg (c) — es gibt nur eine Fassung der Abschnitte, beide Schalen
zeigen dieselben Elemente. Läuft etwas auseinander, ist es die Schale, nicht
der Inhalt.

**Aufwand.** Ehrlich: Das ist der größte Umbau dieser Sitzung. Schnitt 1 und 2
sind zusammen deutlich mehr Arbeit als alles bisher Gebaute. Die Schnitte 3–5
sind Umzüge und gehen schneller.

**Ich habe mich heute schon einmal in dieser Sache geirrt.** Die Karte lag
drei Tipps tief im Menü, und ich hielt das für ausreichend, bis der
Auftraggeber sie dreimal nicht fand. Dieselbe Sorte Irrtum ist hier wieder
möglich — deshalb steht in §7 eine Messung und kein Urteil.

---

## 9. Was mit dem angefangenen Kartenabschnitt passiert

Vor diesem Auftrag hatte ich begonnen, die Karte als Abschnitt auf die
Startseite zu setzen (kleines Deutschlandbild, Tipp öffnet die Karte). Das ist
gebaut und funktioniert, liegt aber ungeprüft in einem Stash.

**Vorschlag:** verwerfen. Er löst dasselbe Problem noch einmal auf einem
anderen Weg — in der neuen Schale ist die Karte der Grund und braucht keinen
Abschnitt mehr, der auf sie zeigt. Ihn jetzt einzubauen hieße, eine Lösung zu
liefern, die Schnitt 1 sofort wieder entfernt.

_Falls die Entscheidung gegen die neue Schale fällt_, ist er die richtige
kleine Antwort auf „ich finde die Karte nicht" und kann in einer Stunde
gemergt werden.

---

## 10. Was ich zur Entscheidung brauche

1. **Startwert des Blattes** — „Halb" wie vorgeschlagen (§3), oder doch
   „Peek" wie TourFuchs, mit dem grauen Grund als bewusstem Preis?
2. **Der Kartenabschnitt aus §9** — verwerfen oder als Zwischenlösung mergen?
3. **Reiter-Beschriftungen** — „Prüfen · Bestand · Filter · Karte", oder
   näher an TourFuchs mit „Daten" statt „Bestand"?

Alles andere kann ich als Produktverantwortlicher entscheiden und tue es auch.
Diese drei Punkte ändern die Reise so grundsätzlich, dass ich sie nicht allein
setze.
