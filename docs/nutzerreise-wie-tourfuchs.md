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

---

## 0g. Zwei Entscheidungen

**Die Maschinen im Standort-Popup stehen als Liste, immer.** Keine Knopfreihe,
keine Schwelle, ab der aus Knöpfen eine Liste wird, keine Suche. Begründung des
Auftraggebers: „Es wird praktisch nie zu viele geben." Das ist zugleich die
einfachere Sache — eine Form statt zweier, kein Umschaltpunkt, der getestet
werden müsste. Die Form steht schon (`docs/kunden-und-karte.md` §4):

```
    Müller Guss GmbH
    45127 Essen · Ortsmitte

    MASCHINEN
    ● Pumpe 17        94 %   vor 2 Std.      ›
    ● Lüfter West     71 %   vor 3 Tagen     ›
    ○ Kompressor 3    Referenz fehlt         ›
```

Jede Zeile ist der Knopf aus §0c — dahinter der Prüfablauf im semantischen
Zoom. Die Zeile ersetzt also nicht den Knopf, sie _ist_ er.

**Der angefangene Kartenabschnitt auf der Startseite ist verworfen.** Er war
die kleine Antwort auf „ich finde die Karte nicht". In der neuen Schale ist die
Karte der Grund; ein Abschnitt, der auf sie zeigt, verschwände in Schnitt 2
wieder. Etwas einzubauen, das kurz darauf herausgenommen wird, ist Unruhe ohne
Gewinn. Bis die Schale steht, bleibt die Karte über ☰ → „Standortkarte"
erreichbar.

## 0h. Der Stamm wird übernommen, nicht nachgebaut

**Alles vor diesem Abschnitt beschreibt den falschen Weg.** Die Schnitte 0–7
sind gebaut, gemessen und verschmolzen — und sie beantworten die Frage, die
nicht gestellt war. Der Auftraggeber hat es nach dem Blick auf das Ergebnis in
einem Satz gesagt:

> „Du willst keine SoundFuchs-Oberfläche, die TourFuchs lediglich ähnlich
> sieht. Du willst die bereits geprüfte TourFuchs-Oberfläche tatsächlich als
> Ausgangsbasis übernehmen."

### Was ich stattdessen gebaut hatte

TourFuchs' **Skelett** mit SoundFuchs' **altem Körper** darin. Ich habe
Reiter angelegt, die TourFuchs' Reitern ähneln, und die vorhandenen
SoundFuchs-Karten hineingehängt — mit `haengeUm()`, einer Umzugsliste und
Platzhaltern, die beim Verlassen der Schale alles zurückräumen. Das Ergebnis
ist ehrlich benannt eine **Verkleidung**: dieselbe Silhouette, fremde Substanz.

Am deutlichsten wird es an einer Zeile, die ich selbst geschrieben habe:

```css
html[data-schale='neu'] .fab-row { display: none }
```

Ich habe SoundFuchs' schwebende Pillen **ausgeblendet** — also genau das
Element entfernt, das TourFuchs' erstes Bild ausmacht, während ich behauptete,
TourFuchs nachzubilden. Eine Ähnlichkeit, die man durch Wegnehmen erreicht, ist
keine.

### Der Beschluss

**TourFuchs ist der unveränderte gestalterische Stamm.** Nicht Vorbild, nicht
Inspiration, nicht Messlatte — Ausgangspunkt. Die Richtung dreht sich um:

| | bisher | ab jetzt |
|---|---|---|
| Ausgangspunkt | SoundFuchs' Schale | TourFuchs' Schale |
| Bewegung | SoundFuchs wird „tourfuchsiger" | TourFuchs wird fachlich reduziert |
| Ergebnis | Ähnlichkeit | Deckungsgleichheit vor dem Scharnier |
| Prüffrage | „sieht es aus wie …?" | „ist es dasselbe?" |

Vor dem Scharnier wird **nur weggenommen und umbenannt**, nichts hinzuerfunden.
Hinter dem Scharnier entsteht Neues — aber vollständig in der Formensprache des
Stamms, aus seinen Karten, Blättern, Knöpfen und Abständen.

### Das Scharnier

Der klickbare **Name** ist der Übergang. Fünf Ebenen, eine Kette:

```
  TourFuchs-Oberfläche mit Karte    ← unverändert, nur reduziert
        │
        └─ Maschinenstandortname    ← das Scharnier: ein Klick
              │
              └─ Standortansicht    ← Name, Adresse, alle Maschinen
                    │
                    └─ Maschinenliste
                          │
                          └─ Maschinenansicht
                                │
                                └─ Zanobo: Referenz, Vergleich, Spektrum
```

### Die Zuordnung der Daten

| TourFuchs | SoundFuchs |
|---|---|
| Kunde | Maschinenstandort |
| Kundenname | Maschinenstandortname |
| Kundenmarker | Standortmarker |
| Kundenliste | Maschinenstandortliste |
| „Neuer Kunde" | „Neuen Maschinenstandort anlegen" |
| — | ein Standort enthält **mehrere** Maschinen |
| Kundendatenimport | Standort- und Maschinenimport |
| Tourplanung | entfällt |
| Umsatz-/Vertriebsdaten | entfallen |
| Vertriebsgebiete | nur, falls für Standorte sinnvoll |

### Was das kostet

Gemessen, nicht geschätzt:

| | Zeilen |
|---|---|
| TourFuchs-Schale, zu übernehmen | ~1 100 HTML · 4 551 CSS · ~5 260 JS |
| TourFuchs-Teile, die entfallen | ~6 000 (Tourplaner, Showcase, Lasso, Tresor, Besuchsplaner, Gebietseditor, SafeTransfer, Mobilvorschau) |
| SoundFuchs-Motor, unberührt | ~17 200 (DSP, ML, Datenbank, Typen) |
| Meine Schale aus Schnitt 2–7 | ~1 500 — **wird ersetzt, nicht behalten** |

Die letzte Zeile ist der Punkt. Zwei Schalen nebeneinander stehen zu lassen
wäre die bequeme Wahl und die falsche: „Die Anwendung darf nicht wie zwei
zusammengesetzte Programme wirken." Das gilt auch für den Quelltext.

### Was beim Übernehmen verändert wird — und was nicht

**Verändert:** der Stamm ist JavaScript, SoundFuchs ist TypeScript mit
strengen Prüfungen. Der übernommene Quelltext wird beim Herüberholen nach
TypeScript geschrieben. Das ist keine Kosmetik: `tsc`, `eslint`, `css-check`,
`token-check` und `check-i18n` haben in diesem Vorhaben nahezu jeden echten
Fehler gefunden. Eine JavaScript-Insel liefe an allen fünf vorbei.

**Nicht verändert:** Aufbau, Proportionen, Navigation, Farben, Komponenten,
Abstände, Interaktionen. Das CSS kommt Datei für Datei unverändert herüber
(`src/styles/stamm/`), nicht abgeschrieben.

### Die drei Auflagen gelten weiter

Kamerabild während der Prüfung, Abspielen der Aufnahmen, 3D-Spektrum. Sie
liegen hinter dem Scharnier, also im neu gebauten Teil — der Durchlauf
(Schritte 12–14) bleibt ihr Wächter und muss nach jedem Schnitt grün sein.

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

Eine neue Datei `src/ui/shell/Schale.ts`, die:

1. Grund, Kopfstreifen, Blatt und Reiterleiste aufbaut,
2. die vorhandenen Abschnitte per `appendChild` in ihre Reiter hängt,
3. beim Abschalten alles an den Ursprungsplatz zurückhängt.

Keine Zeile in `1-Identify.ts`, `2-Reference.ts`, `3-Diagnose.ts`. Wenn dort
etwas geändert werden muss, ist der Umzug an dieser Stelle noch nicht richtig
zugeschnitten.

---

## 6. Schnitte

> **Achtung.** Die Schnitte 0–7 unten sind gebaut und verschmolzen — und
> gehören zum Weg, den §0h zurücknimmt. Sie stehen als Aufzeichnung da, nicht
> als Plan. Was jetzt gilt, sind die Stamm-Schnitte darunter.

### Stamm-Schnitte

**S1 — Das Gerüst steht.** ✅ _erledigt._ Der Stamm ist eingebunden und
trägt das erste Bild.

- CSS Datei für Datei aus TourFuchs übernommen (`src/styles/stamm/`,
  4 551 Zeilen, unverändert). Sie steht **nach** `style.css`: Acht Klassennamen
  kommen in beiden vor, und es sind genau die, die ich vorher nachgebaut habe.
- `stamm/core/viewport.ts` — die eine Definition von „mobil". Zwei Gesichter,
  Orientierung entscheidet, Zahlen mitgebracht statt neu gewählt.
- `stamm/ui/schale.ts` — Blatt, Griff, Reiter, Kopfstreifen. Aus
  `sidebar.js` herausgelöst, ohne Tourplaner, Gebietseditor und Vertragsradar.
- `stamm/ui/scharnier.ts` — die Tür. Auf, zu, Escape, Rückweg.
- `stamm/ui/beispieldaten.ts` — die Karte füllt sich beim ersten Besuch
  selbst, wie im Stamm. Ohne das war das erste Bild ein leerer Umriss.
- Das HTML-Gerüst ersetzt die nachgebaute Kopfleiste. Kartenstil,
  Leerzustand, Standortblatt und der Hinweis auf Standorte ohne Koordinaten
  sind aus dem alten Kartenfenster auf die Kartenebene gezogen.
- **Entfernt:** `Schale.ts`, `schale.css`, `schaleSettings.ts`, `Nahliste.ts`,
  `Filterleiste.ts`, der Schalter in den Einstellungen und der Nachbau von
  `.topbar` / `.depth-switch` in `style.css`. Zwei Schalen nebeneinander wären
  die bequeme Wahl gewesen und die falsche.

Gemessen (`npm run stammvergleich`, neu — es ersetzt `schalenvergleich`):

| | TourFuchs | SoundFuchs |
|---|---|---|
| Kopfleiste | 0,0 390×52 | 0,0 390×52 |
| Kopfstreifen | 0,52 390×100 | 0,52 390×100 |
| Blatt (sichtbar) | 0,744 390×100 | 0,744 390×100 |
| Karte | 0,52 390×792 | 0,52 390×792 |
| Knopfzeile | 0,676 390×38 | 0,676 390×38 |
| Ansichtstiefe | im Kopfstreifen | im Kopfstreifen |

Am Schreibtisch ebenso, auf den Pixel. Was abweicht, weicht mit Auftrag ab:
Reiter (kein „Tour"), Pillen (kein Lasso), Zahl der Beispielpunkte.

Vier Befunde kamen erst durch das Messen ans Licht, keiner davon durch
Hinsehen: die Seitenleiste stand am Schreibtisch bei x = −400 (der Stamm setzt
`sidebarOpen: !isPhoneUi()`, ich hatte `false`); die Karte war leer, weil
SoundFuchs seine Beispieldaten nur auf Zuruf lädt; die Ansichtstiefe war
zweizeilig, weil ein `<span>` im Knopf auf `flex-direction: column` traf; und
das Blatt saß 54 px zu tief, weil `body.demo-data-active` fehlte — der Stamm
hängt die Guckhöhe daran.

Falsifiziert: Mit stillgelegter `demo-data-active`-Zeile meldet
`stammvergleich` zwei Befunde (Blatt 798 statt 744, Knopfzeile 730 statt 676).

Zwei Fehler fand erst der Durchlauf. Die Tiefe lag mit `z-index: 3700` über
den Dialogen der alten Oberfläche — „Normalzustand aufnehmen" war sichtbar,
anklickbar und traf trotzdem eine Maschinenzeile 900 px darüber. Und die Karte
frischte nach dem Zurückkommen nicht auf: Als Fenster zeichnete sie bei jedem
Öffnen neu, als Grund wird sie nie geöffnet.

Ein Entwurfsfehler fiel als Sackgasse auf: Die Tiefe nahm zuerst den ganzen
Bildschirm. Damit lagen ⓘ, Suche und Basis/Profi hinter ihr — und
„Einstellungen" in der Fußzeile steht nur auf Profi, also auf der Stufe, die
man dort erst hätte einschalten wollen. Die Kopfleiste bleibt jetzt stehen.
Sie ist das Dach über beiden Welten; ohne sie wirkte es wie zwei Programme.

**Und ein grüner Haken, der nichts wert war.** Der Durchlauf lud bis dahin
stillschweigend die Beispieldaten mit — der Stamm füllt die leere Karte ja von
selbst. Schritt 13 griff daraufhin mit `.first()` den Verlauf einer
_Demo-Maschine_ ab und meldete „4 Knöpfe · 2 Aufnahmen mit Ton". Der Schritt
war grün, und er maß den falschen Weg: nicht den, den der Lauf eben selbst
gegangen war.

Seit der Lauf die Beispieldaten absagt, misst er seine eigene Maschine — und
fand dabei drei Dinge nacheinander, die von außen alle gleich aussahen
(„Anhören fehlt"):

1. Der Verlauf ist zweistufig. Erst die Liste der Maschinen mit Prüfungen,
   dann deren Prüfungen. Die Zwischenstufe fehlte im Lauf.
2. Ein erzwungener Tipp landete auf dem festen Streifen „Einstellungen &
   mehr" am unteren Rand — Playwright scrollt so wenig wie möglich, und das
   Ziel parkte darunter. Es öffneten sich die Einstellungen.
3. Zeile und Kopfzeile hören beide auf Klicks. Ein Tipp klappte auf und
   sofort wieder zu; danach stand `display: none` an der Detailzeile, mit dem
   Knopf ordentlich darin.

Keiner der drei ist ein Fehler der Anwendung. Alle drei hätte ein Wächter, der
einmal tippt und dann urteilt, als „Knopf fehlt" gemeldet — die unangenehmste
Sorte Befund, weil sie auf die falsche Stelle zeigt.

**S2 — Die Karte, bis zum Scharnier.** ✅ _erledigt._ Marker, Stapel und Popup
aus dem Stamm — und der Maschinenstandortname als Tür.

- `stamm/features/standortmarker.ts` — übernommen aus `customerMarkers.js`.
  Vier Markerstufen (`dot` → `card` → `label` → `detail`), Stapelradius je
  Zoomstufe, Namensregel. Rein und deshalb geprüft: 18 Tests.
- **Progressive Offenlegung.** Erst ein anonymer Punkt zur Orientierung, ab
  Zoom 8 ein anklickbares Kärtchen, ab 14 (unterwegs 15) der Name, ab 15,5
  (16,5) der Zusatz. Entschieden wird das mit **einer Klasse am
  Kartenbehälter**, nicht im Marker — sonst müsste bei jeder Zoomstufe jeder
  Marker neu gebaut werden.
- **Der Stapelradius hängt jetzt am Zoom** (104 px auf Deutschland, 28 px auf
  Straßenebene). Vorher stand dort eine feste 45 — dieselbe Zahl für
  Deutschland und für eine Straße, und damit überall ein bisschen falsch.
- **Farbe statt Umsatz.** TourFuchs färbt Marker und Stapel nach
  Vertriebsgebiet. Hier tritt der Zustand der Maschinen an diese Stelle:
  grün · gelb · rot · **grau für ungeprüft**. Grau ist Absicht — ein Standort
  ohne Referenzaufnahme ist nicht gesund, er ist unbekannt.
  Der Stapel nimmt den **schlechtesten** Standort darin, so wie ein Standort
  die schlechteste Maschine nimmt. Ein Stapel, der nach dem Durchschnitt grün
  wäre, verdeckte genau das, wofür man auf die Karte schaut.
- **Aus dem Blatt wird ein Popup.** `#customer-sheet` am unteren Bildschirmrand
  war SoundFuchs' eigene Erfindung und ist entfernt. Der Stamm hängt die
  Auskunft an den Marker, den man angetippt hat. Das ist der Unterschied
  zwischen „hier ist etwas über einen Standort" und „hier ist etwas über
  **diesen** Standort".

### Das Scharnier steht

```
    Maschinenstandortname          ← <button class="popup-scharnier">
    45127 Essen · 📍 Ortsmitte
    4 Maschinen

    ● Kompressor 1   Referenz fehlt   ›
    ● Kompressor 2   Referenz fehlt   ›
```

Die Überschrift ist ein `<button>` und keine Zeile Text. Sie sieht aus wie
eine Überschrift, weil sie eine ist; sie ist ein Knopf, weil sie die Tür ist.
Ein `<h3>` mit `onclick` wäre für Tastatur und Vorlesewerkzeuge keine Tür,
sondern eine Überschrift, die sich seltsam verhält — deshalb prüft der
Wächter nicht, _dass_ der Name dasteht, sondern dass er ein `BUTTON` ist.

Falsifiziert: Als `<span>` gebaut meldet `attention-check` drei Befunde
(„der Name ist kein Knopf", „führt nirgendwohin", „die Maschinenzeile führt
nicht hinein").

Die Maschinen stehen als Liste, immer (§0g). Jede Zeile _ist_ der Knopf und
trägt ihn nicht bloß — sonst gäbe es eine antippbare Fläche und eine sichtbare
Zeile, und die beiden liefen früher oder später auseinander.

Gebaut wird das Popup als DOM und nicht als Zeichenkette. Der Stamm setzt dort
HTML zusammen; hier kämen Standort- und Maschinennamen aus der Datenbank in
eine Zeichenkette, die als HTML gelesen wird — ein Standort namens
`<img onerror=…>` wäre ein Einfallstor.

**Zwei Werkzeuge waren blind.** `token-check` und `css-check` lasen nur die
oberste Ebene von `src/styles/`. Seit der Stamm in einem Unterordner liegt,
sind das die meisten Regeln und Token — `--color-primary` galt als unbekannt,
obwohl `stamm/variables.css` ihn definiert. `token-check` steigt jetzt hinab
(119 statt 93 Token). Ein Werkzeug, das eine richtige Datei für falsch
erklärt, ist schlimmer als keines: Man lernt, seine Meldungen zu überblättern.

Dabei fiel ein geerbter Fehler auf: `--color-surface-muted` ist auch in
TourFuchs nirgends definiert, an derselben Zeile. Er wirkt trotzdem, weil ein
Ausweichwert danebensteht. Er ist als geerbt vermerkt und **nicht** in der
Stamm-Datei behoben — sonst wäre der Vergleich mit TourFuchs dahin.

**Hinter dem Scharnier steht noch die alte Oberfläche.** Das ist Absicht: Die
Tür steht an ihrem Platz, und was hinter ihr liegt, kann getauscht werden,
ohne sie anzufassen.

**S3 — Die Standortansicht.** ✅ _erledigt._ Die erste Ebene hinter der Tür.

Der Auftraggeber hat aufgezählt, was sie enthalten muss. Sie enthält es, und
sonst nichts:

```
    ‹ Zur Karte

    Gießerei 0081
    79199 Kirchzarten · 📍 Ortsmitte

    ┌──────┬──────┬──────┐
    │  4   │  0   │  4   │
    │Masch.│auff. │ungep.│
    └──────┴──────┴──────┘

    MASCHINEN
    ● Kompressor 1   Referenz fehlt   —   ›
    ● Kompressor 2   Referenz fehlt   —   ›

    [ ➕ Neue Maschine anlegen ]
```

**Sie ist kein Stamm — und sieht trotzdem so aus.** TourFuchs hat keine Ebene
unter dem Kunden; diese Ansicht ist Neubau. Gebaut ist sie aber aus den
Teilen, die dastehen: `.near-row` für die Zeilen (dasselbe Raster wie der
Nähe-Begleiter), `.stat-grid` für die Kopfzahlen, `button.primary` für die
Handlung. Kein eigenes Formenvokabular — das wäre der Anfang der zwei
Programme, die es nicht geben soll.

### Zwei Ebenen hinter der Tür

`standort` und `maschine`, umgeschaltet über **eine** Klasse am Körper. Nicht
über zwei Aufrufe an zwei Stellen: So kann es keinen Zustand geben, in dem
beide oder keine sichtbar sind.

Der Rückweg hat drei Stationen statt zwei — wer aus einer Maschine kommt, will
meistens zur Nachbarmaschine, nicht auf die Karte. Er sagt auch, wohin er
führt („‹ Zum Standort" bzw. „‹ Zur Karte"): „Zurück" allein wäre auf zwei
Ebenen zweimal dasselbe Wort für zwei verschiedene Ziele.

### Was das Messen gefunden hat

**Der Rückweg aus der Maschine führte ins Leere.** Eine Maschine öffnet das
bisherige Maschinenfenster — ein Dialog über der Tiefe. Sein Schließen landete
auf der bisherigen Maschinenliste, also auf einer Ebene, aus der man gar nicht
gekommen war. `close()` steht an vier Stellen, und zwei davon führen _weiter_
(Maschine wählen, Verlauf öffnen); ein blindes „beim Schließen zurückspringen"
hätte den Nutzer auch dann zurückgeworfen, wenn er vorwärts wollte. Deshalb
meldet jetzt nur der **Abbruch** ein Ereignis.

**Beide Messwerkzeuge maßen die falsche Ebene.** Sie machen die Tiefe direkt
auf (`classList.add('tiefe-offen')`) und landeten damit auf der Standortebene
— die den bisherigen Rumpf mit Absicht verdeckt. Jeder Block meldete „fehlt",
und zwar alle auf einmal. Sie nennen die Ebene jetzt ausdrücklich.

**„Referenz fehlt" sah aus wie eine gute Nachricht.** `.near-rev` färbt den
Wert teal und macht ihn fett — im Stamm steht dort der Umsatz, und da ist
beides richtig. Hier stand „Referenz fehlt" in derselben Auszeichnung wie
„94 %": Der Blick über die Liste las Grün und Fettdruck als Erfolg, und genau
das Gegenteil war gemeint.

**Der Wächter starb, statt zu melden.** Beim Falsifizieren des Rückwegs kam
ein `TimeoutError` statt dreier Befunde: Der Marker war von der Tiefe
verdeckt, und Playwright wartete 30 Sekunden auf ihn. Ein Stapelabzug zeigt
auf die falsche Stelle. Jetzt prüft der Lauf erst, ob er wieder auf der Karte
steht — und meldet sonst sauber.

Falsifiziert: mit stillgelegtem Rückweg meldet `attention-check` zwei Befunde.

**S3a — Zwei Gesichter, kein drittes.** ✅ _erledigt._ Der Stamm wird auf
`19b3951` nachgezogen: „Zwei Oberflächen, kein drittes Gesicht für Tablets".

Der Anlass war ein Auftrag mit Zahlen darin, und die Zahlen stimmten: Ein
hochkantes Tablet bekam bei SoundFuchs die Kartenknöpfe bei y = 164 statt
unten, der Kopfstreifen war 100 px hoch statt 55, und ein flaches Querformat
traf beide Gesichter zugleich.

### Die Wurzel: das Stamm-CSS war alt

`src/styles/stamm/` stammte vom Stand **vor** dieser Korrektur. Drei der sechs
Dateien wichen ab (components 124, map 8, responsive 302 Zeilen). Sie sind neu
kopiert — und damit waren der Tablet-Aufsatz
`(min-width: 769px) and (max-width: 1200px) and (orientation: portrait)`,
seine Sondermaße und `--mobile-topnav-bottom` in einem Schritt weg.

Das ist der Beleg dafür, dass §0h trägt: Weil der Stamm kopiert und nicht
nachgebaut ist, kostete die halbe Aufgabe einen `cp`-Befehl.

### `DESKTOP_FACE_MEDIA` — die exakte Verneinung

```
  nicht(w ≤ 768) und nicht(w ≤ 1200 und hochkant) und nicht(w ≤ 900 und h ≤ 520)
= w ≥ 769 und (w ≥ 1201 oder quer) und (w ≥ 901 oder h ≥ 521)
```

Kein Fenster trifft beide Listen, keines fällt zwischen ihnen durch. Geprüft
über ein Raster von 56 × 45 Fenstern.

### Die Reiter bleiben unten

Sie zogen bisher mit in den Kopfstreifen; der war dadurch zweizeilig und nahm
der Karte 45 px an ihrer wichtigsten Stelle. Die Begründung des Stamms trägt
auch hier: Die Ansichtstiefe gilt für die ganze Anwendung und muss immer
erreichbar sein. Die Reiter schalten den Inhalt **des Blatts** um — oben
angeheftet wären sie eine Navigation, die auf etwas zeigt, das eingeklappt ist.

Mit ihnen entfällt der Reiter „Karte": Ein Reiter, den man im Blatt antippt,
um das Blatt zuzumachen, ist ein Knopf, der sich selbst wegräumt. Zur Karte
führen der Griff und ☰.

### Zwei Lecks aus der alten `style.css`

Beide waren unsichtbar und beide veränderten die ganze Schale:

1. **`body { line-height: 1.6 }`** vererbte sich in `.topbar` — TourFuchs hat
   dort `normal`. Die Zeilenhöhe steht jetzt an `.zanobo-tiefe`, wo sie
   hingehört, und verschwindet mit ihr.
2. **Zwei Wurzelregeln** verkleinerten auf kurzen Fenstern die Schriftgröße
   (≤700 px → 13 px, ≤570 px → 11.5 px). `rem` ist wurzelbezogen, also traf
   das beide Welten; scopen ließ es sich nicht, und die Kopfleiste steht in
   beiden. Sichtbarer Rest: 35 px hohe Kartenknöpfe statt 39. Die Regeln sind
   entfernt. **Folge, offen benannt:** Hinter dem Scharnier ist die Schrift auf
   Geräten unter 700 px Höhe jetzt größer, und man scrollt dort mehr.

### Der Kartengrund

Voreinstellung ist **„Standard"/OSM** statt „Hell"/CARTO — wie im Stamm
(`state.ui.basemap: 'standard'`). Und die drei Pillen sind durch das
Auswahlfeld des Stamms ersetzt: Sie waren selbst einmal von TourFuchs
abgeschaut, stammten aber aus einer älteren Fassung. Eine Genehmigung, sie zu
behalten, lag nicht vor — also gilt das Vorbild.

### Was die Prüfungen jetzt können

`viewport.test.ts` und `gesichter.test.ts` sind aus dem Stamm übernommen
(79 Prüfungen im Stamm-Ordner). Sie werten **jede Medienabfrage aller
Stilblätter** aus und melden: eine Abfrage, die nur ein Tablet trifft; eine,
die über die Gesichtsgrenze greift; eine zweite Pixelentscheidung in einem
UI-Modul; eine wiedergekehrte Hochformatsperre.

`style.css` ist davon ausgenommen — sie ist die noch nicht überführte
Oberfläche hinter dem Scharnier, und ihre 768er-Schwellen sind Fragen nach der
Breite einer scrollenden Seite. Ungeprüft bleibt sie trotzdem nicht: Ein
eigener Block stellt ihr die Frage, die hier zählt — ob eine ihrer Regeln
eines der neun Stamm-Elemente anfasst.

Falsifiziert: Zwei eingebaute Lecks (`.topbar`, `#mobile-topnav`) — und der
Wächter fing zunächst nur eines. Sein Muster für Klassen war falsch
zusammengesetzt (`\.topbar` suchte einen echten Rückstrich) und ließ
ausgerechnet die Klassen durch. Behoben; jetzt fallen beide.

`stammvergleich` misst sechs Fenster statt zwei — vier Geräte und zwei
Grenzfälle — und meldet zusätzlich, wenn eines beide Gesichter zeigt.
`attention-check` erwartet im Kopfstreifen **0** Reiter; vorher schrieb er die
drei fest und wäre rot geworden, sobald jemand den Fehler behebt.

### Abnahme, gemessen

| Fenster | Gesicht | Streifen | Karte | Knopfzeile | Reiter oben |
|---|---|---|---|---|---|
| 390×844 | phone | 0,52 390×55 | 0,52 390×792 | 0,676 | 0 |
| 820×1180 | phone | 0,52 820×55 | 0,52 820×1128 | 0,**1011** | 0 |
| 1180×820 | desktop | — | 0,52 1180×768 | **400**,759 | 0 |
| 1440×900 | desktop | — | 0,52 1440×848 | 400,839 | 0 |

Die Kartenknöpfe des hochkanten Tablets stehen unten (1011) statt oben (164).
Am Schreibtisch sind sie 41 px hoch wie am 1440er — keine Touch-Vergrößerung.

**Das Drehen:** Tablet hochkant → quer → hochkant im selben Browser. Das
Gesicht wechselt, der Tiefenschalter zieht zwischen Streifen und Seitenleiste
um, und der Arbeitszustand bleibt: derselbe Standort, dieselben vier
Maschinen, keine Seitenfehler.

**S4 — Die Maschinen-Arbeitsebene.** ✅ _Schnitt 1 erledigt._ Eine Maschine ist
eine eigene Ebene, kein Abschnitt am Ende einer langen Bestandsseite.

### Was gemessen war

Nach einem Tipp auf eine Maschinenzeile, mit 130 Maschinen im Bestand:

| | vorher |
|---|---|
| Maschinenzeilen im Arbeitskontext | **130** |
| fokussierbare Elemente hinter dem Scharnier | **178** |
| Höhe des Arbeitsbereichs | **10 174 px** (Handy), 11 016 px (Tisch) |
| Aufnahmeknopf | **52 px unter dem Rand**, nach zwei Tipps darauf |
| Fenster dazwischen | ein Auswahlfenster für die Maschine, die man gerade wählte |

### Was jetzt dasteht

| | nachher |
|---|---|
| Maschinenzeilen | **0** — auf Maschinen- **und** Arbeitsebene |
| fokussierbare Elemente | **2** |
| Höhe der Maschinenebene | **792 px** (Handy) |
| Höhe der Arbeitsebene | **896 px** |
| Tipps Maschinenzeile → Aufnahmefläche | **2** |
| dominante Handlungen je Bild | **1** |
| Antippziele unter 44 px | **0** |

```
    ‹ Zum Standort

    Kompressor 1
    ● Noch kein Normalzustand

    [  Normalzustand aufnehmen  ]

    Nimm die Maschine so auf, wie sie sich
    im guten Normalbetrieb anhört.
```

### Die Zustandsmaschine

Sie steht als **Wert** in `stamm/maschine/zustand.ts`, nicht als Folge von
`style.display`-Schaltungen: zehn Zustände, und `handlungFuer()` gibt zu jedem
**genau eine** dominante Handlung. Das ist der Punkt — die Regel lässt sich
nicht nur einhalten, sie lässt sich beweisen. Der Test geht jeden Zustand
durch (25 Prüfungen), statt drei anzuklicken.

Die Ähnlichkeitsschwelle ist dieselbe wie im Bestand (75). Zwei Schwellen für
dieselbe Frage wären zwei Antworten, und die Karte zeigte grün, wo die
Maschinenebene „anders" sagt.

### Vier Ebenen hinter der Tür

`standort` · `maschine` · `arbeit` · `bestand`. Die vierte ist ein Übergang
und kein Entwurf: Anlegen, Scannen und Einlesen sind Bestandsaktionen und
bekommen in Schnitt 6 ihren richtigen Ort. Bis dahin liegen sie, wo sie lagen
— und die Ebene sagt wenigstens, dass das so ist, statt es unter „Arbeit" zu
verstecken.

Dass es sie braucht, habe ich selbst herbeigeführt: Als der Bestand aus der
Arbeitsebene verschwand, ging „Neue Maschine anlegen" aus der Standortansicht
mit kaputt — das Formular liegt in der Bestandskarte. Der Aufmerksamkeitstest
meldete es als Kaskade von zwanzig Befunden.

### Was noch nicht dasteht

Das Ergebnis kommt noch in der bisherigen Form, und die Hör-Lupe gibt es
nicht. Das sind die Schnitte 3 und 4. Was dieser Schnitt liefert, ist der
**Ort**, an dem sie stattfinden.

Falsifiziert: Mit dem Auswahlfenster zurück im Weg meldet `npm run wow` je
Fenster sieben Befunde — 130 Bestandszeilen, 0 dominante Handlungen, der
nächste Schritt nicht im Bild.

### Der erste Erfolg — Schnitt 2 (17.08.2026)

✅ _erledigt._ Die Referenzaufnahme endet jetzt in einem Bild statt in einem
Formular.

**Was vorher an dieser Stelle stand.** Nach zehn Sekunden Aufnahme kam ein
Bestätigungsfenster: anhören, Qualität ansehen, „Als Referenz speichern"
drücken. Das ist eine Frage, deren Antwort schon feststeht — und sie steht
genau dort, wo der erste Erfolg gefeiert gehört. Wer zum ersten Mal ein
Mikrofon an eine Maschine gehalten hat, bekam als Belohnung ein Formular.

**Was jetzt passiert.** Eine brauchbare Aufnahme speichert sich selbst und
führt zurück auf die Maschinenebene. Dort steht der akustische Fingerabdruck
dieser Maschine — die radiale Iris, gezeichnet aus ihrem Klang — mit dem Satz
„Normalzustand ist bereit". Darunter die eine nächste Handlung, und die heißt
in diesem Augenblick nicht „Jetzt 10 Sekunden prüfen", sondern **„Jetzt
Gegenprobe machen"**.

```
    ‹ Zum Standort

    Kompressor 1
    ● Bereit zum Prüfen

         ( ((●)) )        ← der Fingerabdruck, aus dieser Aufnahme
    Normalzustand ist bereit

    [  Jetzt Gegenprobe machen  ]

    Nimm dieselbe Maschine noch einmal auf — so
    siehst du sofort, wie genau der Vergleich ist.
```

Die Gegenprobe ist der Grund, warum das Bild allein nicht reicht. Der
Fingerabdruck belegt, dass etwas entstanden ist; erst die zweite Aufnahme
derselben gesunden Maschine zeigt, dass der Vergleich **funktioniert**. Das
ist der Moment, in dem aus „hübsch" Vertrauen wird — und er kostet den Nutzer
einen Tipp, weil er unmittelbar danebensteht.

**Gefragt wird noch, wo es etwas zu entscheiden gibt.** Bei `BAD` taugt die
Aufnahme nicht zum Vergleichen; dann muss der Nutzer erfahren, warum, und
wiederholen können — die schlechte Qualität ist ein lösbarer Zustand, kein
Abbruch. `OK` speichert mit: eine brauchbare Referenz ist besser als keine,
und der Hinweis darauf steht in der Meldung. Der Ausweg bleibt in jedem Fall,
eine neue Aufnahme zu machen; sie ersetzt die alte.

**Wo die Grenze liegt.** Der Merker „gerade gelernt" ist kein Zustand in
`zustand.ts`. Die Maschine ist danach schlicht `ready`; dass sie es gerade
erst geworden ist, ist ein Augenblick in der Reise und gehört der Oberfläche.
Die Zustandsmaschine kennt keine Augenblicke — sonst hätte sie bald elf
Zustände, von denen einer nur eine Beschriftung ist.

**Gemessen** (`npm run wow`, Handy 390×844, mit echtem Mikrofonsignal):

| | |
|---|---|
| Tipps Maschinenzeile → gespeicherter Normalzustand | **3** |
| Fenster nach einer guten Aufnahme | **0** |
| Fingerabdruck wirklich gezeichnet | **ja** (Bildpunkte gemessen, nicht Element gezählt) |
| Urteil danach | „Bereit zum Prüfen" |
| nächste Handlung | „Jetzt Gegenprobe machen" |

Der Wächter prüft die **Farbe** der Leinwand, nicht ihr Dasein. Eine leere
Leinwand im richtigen Rahmen ist genau der Fehler, den man sonst nicht sieht.

Zweimal falsifiziert:

- Bestätigungsfenster wieder bedingungslos → sechs Befunde (Fenster da, kein
  Fingerabdruck, Leinwand leer, keine Beschriftung, falsche Handlung, falsche
  Ebene).
- Auto-Speichern behalten, aber nicht zeichnen → **genau ein** Befund: „die
  Fingerabdruck-Leinwand ist leer". Der Test unterscheidet also wirklich
  zwischen Rahmen und Bild.

**Was der Durchlauf dabei gefunden hat.** Zwei Wächterfehler, beide älter als
dieser Schnitt:

1. `durchlauf` wartete fest auf den Speichern-Knopf und **starb** an einem
   Zeitablauf, statt einen Befund zu melden. Ein toter Wächter sagt nur, dass
   er tot ist. Er wartet jetzt auf beide gültigen Ausgänge und berichtet,
   welcher eingetreten ist.
2. Sein Helfer `inDieTiefe()` legte `tiefe-bestand` dazu, ohne `tiefe-maschine`
   zu entfernen — zwei Ebenen gleichzeitig, und die Bestandsliste blieb
   verborgen. Aufgefallen ist das erst, seit der gespeicherte Normalzustand
   von selbst auf die Maschinenebene zurückführt; vorher kam der Lauf nie mit
   einer anderen Ebene dort an.

Der Klanggenerator liegt seit diesem Schnitt in `tools/klang.mjs` und wird von
`durchlauf` und `wow` geteilt. Zwei Generatoren wären zwei Maschinen, und ein
Unterschied im Ergebnis nicht mehr vom Unterschied im Ton zu trennen.

### Das Ergebnis wird zur Hör-Lupe — Schnitt 3 (17.08.2026)

✅ _erledigt._ Nach einer Prüfung fällt der Nutzer nicht mehr in den alten
Ergebnisdialog. Das Ergebnis ist ein **Zustand derselben Reise**, und die
Hör-Lupe steht darin.

```
Standort → Maschine → Prüfung → Verarbeitung → Ergebnis/Hör-Lupe
```

**Die drei Fälle, alle drei gemessen.**

_Fall A — die Maschine klingt anders:_

```
    ‹ Zum Standort

    Kompressor 1
    ● Deutliche akustische Abweichung
    Die Messung klingt anders als der Normalzustand.
    Ähnlichkeit 72 % · gerade eben

    [      Unterschied anhören      ]

    ─────────────────────────────────
    HÖR-LUPE
    Vergleiche Normalzustand und Messung –
    oder höre nur, was neu hinzugekommen ist.

    [ 🔊 Normalzustand ][ 🔊 Messung ][ 🔍 Unterschied ]
    Läuft: 🔍 Unterschied
    ▸ Fein einstellen
```

Ein Tipp auf die Primäraktion **spielt** den Unterschied — kein weiterer
Dialog, kein Suchen. Die Aktion ruft die Komponente an ihrer eigenen
Schnittstelle auf (`spieleUnterschied()`), statt einen ihrer Knöpfe
nachzuklicken; ein nachgemachter Klick wäre eine zweite Bedienung derselben
Sache und die erste, die bricht, wenn dort jemand eine Klasse umbenennt.

_Fall B — sie klingt wie immer:_ „Fertig" ist die einzige Primäraktion, die
Hör-Lupe bleibt über einen sichtbaren Sekundärweg erreichbar („Vergleich
trotzdem anhören"). Auch ein gutes Ergebnis muss überprüfbar sein — aber es
bekommt keinen zweiten gleich lauten Knopf.

_Fall C — die Maschine später wieder öffnen:_ Die Ebene startet wieder in
`ready`. Darunter „🔍 Letzten Unterschied anhören", ein Tipp bis zum Ton. Der
Knopf erscheint **nur**, wenn Messaudio und eine örtliche Referenz wirklich da
sind: Die Aufbewahrung ist eine Einstellung des Nutzers und wird nicht
heimlich umgestellt, damit ein Knopf dastehen kann. Kein toter Knopf.

### Gemessen (`npm run wow`, Handy 390 × 844, echtes Mikrofonsignal)

| | |
|---|---|
| Ende der Messung → sichtbares Ergebnis | **0 Tipps** |
| Ergebnis → hörbarer Unterschied (Fall A) | **1 Tipp** |
| Maschinenebene → letzte Hör-Lupe (Fall C) | **1 Tipp** |
| Fenster im Ergebnis | **0** |
| dominante Handlungen je Ergebniszustand | **1** |
| Urteil und Handlung ohne Scrollen | **ja** |
| Antippziele unter 44 px | **0** |
| Ergebnisfläche am Schreibtisch (1440 × 900) | **1120 px, zwei Spalten** |

Am Schreibtisch steht links das Urteil mit der einen Handlung, rechts die
Hör-Lupe — dieselbe Reise, andere Anordnung. Vorher stand dort eine 900 px
breite Mobilspalte in der Mitte.

### Wie die Daten hinüberkommen

`stamm/maschine/ergebnis.ts` ist ein **Wert**, kein Ereignis mit Fracht. Das
Ereignis `PRUEFUNG_FERTIG` trägt nur die Maschinen-Kennung; die beiden
AudioBuffer holt sich der Empfänger. Zwei Gründe:

1. Ein Ereignis geht an alle. Zwei Zuhörer, die je einen Buffer festhalten,
   halten ihn unterschiedlich lange, und keiner weiß, wann er ihn loslassen
   darf. Zehn Sekunden Ton sind rund ein Megabyte.
2. Ein Ereignis ist ein Zeitpunkt, kein Zustand. Wer eine Sekunde zu spät
   zuhört, erfährt nichts — genau das passiert beim Zeichnen einer Ebene, die
   erst nach dem Ereignis aufgebaut wird.

Wer das Ergebnis zeigt, entscheidet ein Merker (`gehoertDerMaschinenebene`),
den `starteArbeit()` setzt — **keine** CSS-Klasse am `body`. Der Weg herein ist
eine Tatsache über die Reise, keine über das Aussehen. Alle anderen Wege
(Flottenlauf, Bestandsliste, Schnellvergleich) führen weiter in den bisherigen
Ergebnisdialog; ihn im selben Zug mit umzubauen hieße, zwei Dinge auf einmal
zu ändern.

Beim Verlassen der Maschine wird das Ergebnis vergessen und die Aufnahmen
losgelassen. Die Arbeitsebene zählt dabei nicht als Verlassen — dorthin führt
der Weg der Prüfung selbst.

### Eine Hör-Lupe, nicht drei

Es gab zwei Fassungen desselben Dings: `ui/components/ListenPanel.ts` (im
Verlauf) und 250 Zeilen in `3-Diagnose.ts` (im Ergebnis) — dieselben Knöpfe,
derselbe Spieler, dieselbe Differenz. Zwei Fassungen sind zwei Wahrheiten
darüber, was „Unterschied" bedeutet, und sie laufen auseinander, sobald jemand
nur eine anfasst. Jetzt benutzen Verlauf, alter Ergebnisdialog und neue
Ergebnisfläche **dieselbe** Komponente; die 250 Zeilen sind weg, mit ihnen ein
toter Spieler, ein totes Feld und sechs tote Importe.

Neu darin: die drei Quellen stehen oben und gleich groß, Tempo und
„Auffälligkeit hörbar machen" liegen unter „Fein einstellen". Was läuft, trägt
`aria-pressed` **und** steht geschrieben („Läuft: 🔍 Unterschied") — Farbe
allein wäre ausgerechnet bei einem Wiedergabegerät die schlechteste
Kennzeichnung.

### Was der Umbau an den Wächtern gefunden hat

**`css-check` sah den halben Bestand nicht.** Ein flaches `readdirSync`, und
seit die Stamm-Dateien in `src/styles/stamm/` liegen, prüfte das Werkzeug den
größten Teil des CSS gar nicht mehr — auch die Grenzschicht nicht. Aufgefallen
beim Falsifizieren: ein absichtlich erfundener Selektor wurde nicht gemeldet.
Jetzt läuft es rekursiv. Der kopierte Stamm wird dabei **berichtet, nicht
erzwungen** (809 ungenutzte Selektoren, Stand heute): Dort stehen TourFuchs-
Regeln für Tourenplanung, Lasso und Simulation — Dinge, die es hier bewusst
nicht gibt. Sie zu löschen hieße, den Stamm zu bearbeiten, und danach könnte
niemand mehr durch einen Vergleich feststellen, ob er noch der Stamm ist.
Derselbe Maßstab wie bei `stammvergleich`: Was uns gehört, wird erzwungen; was
kopiert ist, wird gezählt.

Beim Falsifizieren fiel noch etwas auf: Ein Klassenname, der aus Rumpf und
Variable entsteht, macht den ganzen Rumpf lebendig — danach gilt jeder
erfundene Selektor mit diesem Anfang als benutzt. Das Werkzeug liest dafür auch
Kommentare. Die drei Quellenklassen sind deshalb ausgeschrieben.

**Zwei Fehler, die der Lauf selbst gefunden hat** — nicht ein Mensch beim
Hinsehen: „Auffälligkeit hörbar machen" war 34 px hoch, der Verlaufs-Verweis
15 px. Beide sind jetzt 44.

**Und ein falscher Satz:** Unter „Unterschied anhören" stand „Halte das Gerät
wie beim letzten Mal an dieselbe Stelle" — ein Aufnahmehinweis unter einem
Knopf, der etwas abspielt. Im Ergebnis steht jetzt kein stützender Satz mehr;
die Hör-Lupe bringt ihren eigenen mit.

### Wie eine echte Abweichung gemessen wird

Chromiums Fake-Mikrofon liest eine Datei, die beim Start feststeht. Der
Wow-Lauf startet deshalb **zweimal auf demselben Profil**: Der Normalzustand
entsteht mit dem sauberen Klang, die Gegenprobe mit einem, der pfeift, klopft
und rauscht. Ergebnis: 72 % — eine echte Abweichung, keine behauptete.

Das ist der Unterschied zwischen Messen und Vorführen. Dem Ergebnis eine Zahl
unterzuschieben hätte dieselben Bildschirme gezeigt und genau das nicht
geprüft, worum es geht. Der Lauf meldet es auch, wenn die Bewertung den
veränderten Klang für den Normalzustand hielte — dann prüfte er ab da den
falschen Fall, und das darf nicht unbemerkt bleiben.

Falsifiziert: Mit dem alten Ergebnisdialog zurück im Weg meldet `npm run wow`
17 Befunde (Ergebnis im Fenster, kein Urteil in Alltagssprache, 0 dominante
Handlungen, der Tipp spielt nichts, …). Dabei fiel zum dritten Mal dasselbe
Muster auf: Der Wächter **starb** an einem verdeckten Knopf, statt zu melden.
Auch diese Klicks sind jetzt duldsam.

### Was dieser Schnitt nicht enthält

Die **Hervorhebung des Störanteils** (`Original · Deutlich · Stark`) ist nicht
dabei. Sie ist kein Anzeigetrick, sondern DSP: Pegelabgleich, Headroom, Fades,
Limiter — und vor allem ein Lautheitsabgleich zwischen den Fassungen, damit
„lauter" nicht mit „überzeugender" verwechselt wird. Der Auftrag lässt diesen
Aufschub ausdrücklich zu und verlangt dafür, `Normalzustand | Messung |
Unterschied` prominent zu liefern; genau das steht jetzt da. Simuliert wird
nichts.

Ebenfalls offen: freie Auswahl im Spektrogramm, „Mit Fachmann teilen", der
vollständige Schreibtisch-Analysearbeitsplatz (die dritte Spalte mit großem
2D-Spektrum), und das Entfernen des alten Ergebnisdialogs aus den übrigen
Wegen.

**S4c — Hervorhebung und Teilen.** _offen._ Störanteil in drei Stufen mit
Clipping-Schutz und Lautheitsabgleich; Befund mit einem Fachmann teilen.

**S5 — Die Reiter füllen.** _offen._ „Standorte", „Filter" und der
Nähe-Begleiter im Karten-Reiter; Standort- und Maschinenimport.

### Die zurückgenommenen Schnitte

Jeder Schnitt ist für sich prüfbar und für sich zurücknehmbar. Die
Reihenfolge folgt den Korrekturen aus §0c bis §0g — nicht der ersten Fassung,
die noch einen Reiter „Prüfen" und einen Modus-Schalter vorsah.

**0 — Das Messgerät schärfen.** ✅ _erledigt (#50)._ `durchlauf` um Kamerabild,
Abspielen und 3D-Gebirge erweitert. _Vor allem anderen_ — sonst wird der
größte Umbau mit einem Messgerät geprüft, das die Auflagen des Auftraggebers
nicht ansieht.

**1 — Standort statt Kunde.** ✅ _erledigt._ Umbenennen in Oberfläche und
Sprachdateien, die Datenstruktur bleibt (§0d). Klein, unabhängig, sofort
nützlich — und danach heißt in allen weiteren Schnitten dasselbe gleich.
_Prüfbar:_ `check-i18n`, `attention-check`; kein „Kunde" mehr in der
Oberfläche.

**2 — Die Schale, leer.** ✅ _erledigt._ Grund (Karte), Kopfstreifen (Tiefe +
Reiter), Blatt mit den drei TourFuchs-Zuständen und -Maßen, Reiterleiste,
Beispieldaten-Streifen. Noch ohne Inhalte: Die Reiter sind da, die Abschnitte
liegen weiter, wo sie liegen — der gesamte bisherige Rumpf zieht als Ganzes in
den Reiter „Daten". Gebaut in `src/ui/shell/Schale.ts`, geschaltet über
„Neue Oberfläche" in den Einstellungen, Voreinstellung bleibt die alte Schale.
_Prüfbar:_ `attention-check` misst Hinweg **und** Rückweg; `durchlauf` läuft
unverändert gegen die alte Schale.

**3 — Der Maschinenknopf im Popup.** ✅ _erledigt._ Je Maschine eine Zeile im
Standort-Popup, und dahinter baut sich im semantischen Zoom der Prüfablauf auf
(§0c, §0g). _Der entscheidende Schnitt_ — hier zeigt sich, ob die Reise besser
oder schlechter wird.

Die Zeile und das Maschinenblatt dahinter gab es schon (`CustomerMap`,
`MachineDetailModal`); zu bauen war die **Kette**, und sie hing an zwei
Stellen:

- Die Karte kannte ihren freien Bereich nicht. Im Grund liegt oben der
  Kopfstreifen und unten das Blatt darüber; ohne Polsterung rechnete sie mit
  der vollen Höhe, und die Standorte lagen hinter dem Blatt — die Kette begann
  nicht einmal. Die Polsterung allein reichte nicht: Der Rahmen der Karte
  (`setMaxBounds`) war so knapp, dass er das Verschieben wieder zurückzog.
- Das letzte Glied landete in einer eingeklappten Tafel. Der Ablauf klappt den
  nächsten Abschnitt auf und springt ihn an — nur trägt die Tafel eingeklappt
  `display: none`. Getippt, nichts passiert. Der Ablauf sagt jetzt an, was er
  vorhat (`MASCHINE_GEWAEHLT`); die Schale zieht auf, bevor er springt, und
  weiß nichts von ihr.

_Prüfbar:_ `attention-check` misst die ganze Kette Marker → Standortblatt →
Maschinenzeile → Maschinenblatt → nächster Schritt im Bild; `durchlauf` trägt
unverändert vierzehn Schritte.

**4 — Reiter „Daten".** ✅ _erledigt._ Maschinen, Standorte, Import,
Erste-Schritte-Liste. Die Maschinenzeile führt in denselben Ablauf wie der
Knopf aus Schnitt 3, damit der Weg auch ohne Empfang trägt.

Der Schnitt bestand aus einer Trennung und zwei Ergänzungen:

- **Die Prüf-Zoomstufe.** Die beiden Karten des Ablaufs lagen im Rumpf
  zwischen Bestand und Fußzeile — also mitten in den Daten, obwohl sie zu
  einer einzelnen Maschine gehören und ohne sie gar nichts tun können. Sie
  ziehen in eine eigene Tafel, die **keinen Reiter** hat: Man kommt hinein,
  indem man eine Maschine wählt, und über die Zoomleiste („‹ Daten" plus
  Maschinenname) wieder heraus. Das ist der semantische Zoom aus §0c, und der
  Grund, warum es weiterhin keinen Reiter „Prüfen" gibt.
- **Die Erste-Schritte-Liste** (TourFuchs `#first-steps`) steht jetzt oben im
  Reiter und zeigt Fortschritt statt nur einer Anleitung. Bisher lag die
  1-2-3-Erklärung im Leerzustand der Maschinenliste — sie verschwand also
  genau in dem Moment, in dem die erste Maschine stand und die restlichen
  zwei Schritte noch offen waren. Sie geht von selbst, wenn alle drei getan
  sind.
- **Die Standort-Zeile** schlägt das auf, was schon in den Einstellungen
  liegt (Beispieldaten, Import). Kein zweiter Bestand — zwei Orte für
  dieselbe Sache wären ein Ort zu viel.

_Prüfbar:_ `attention-check` misst Zoomstufe hinein und heraus, die Lage der
Prüfkarten, den Fortschritt in der Liste und das Ziel der Standort-Zeile.

**5 — Reiter „Flotte".** ✅ _erledigt._ Die beiden Funktionen aus §0e: Flotte
aus dem Bestand, Flotte ohne Bestand. Sie ziehen aus der Maschinenliste
dorthin, wo TourFuchs seinen Besuchsplaner hat.

- **Der Umschalter entfällt.** „Übersicht / Flottencheck" stand mitten in der
  Maschinenliste. Der Reiter _ist_ jetzt die Umschaltung; zwei Bedienelemente
  für denselben Zustand wären eines zu viel.
- **Eine Liste, die pendelt.** Der Bestand zieht in den Reiter und wird dort
  nach Flotten gruppiert, danach zurück in die Daten. Eine zweite Liste wäre
  eine zweite Wahrheit — wer in der einen anlegt und in der anderen nachsieht,
  hätte zwei Bestände, die auseinanderlaufen können.
- **Der Schnellvergleich ist nicht mehr „Profi".** Er war es, weil er sonst
  das Erstbild bestimmt hätte — er stand über der Maschinenliste. Im Reiter
  bestimmt er gar nichts mehr: Dorthin geht nur, wer eine Flotte prüfen will.

Zwei Befunde nebenbei, beide erst sichtbar, als der Reiter das Einzige war,
was dastand: Die **Beispieldaten konnten keine Flotte zeigen** (eine Maschine
je Standort, keine Gruppe) — jeder zehnte Standort trägt jetzt vier
gleichartige Maschinen. Und der **Flottenkopf trug seinen Namen nur mit
Kennzahlen**; eine frisch angelegte Flotte stand namenlos da. Der Name ist
keine Statistik.

_Prüfbar:_ `attention-check` misst beide Wege im Reiter, die Gruppierung, den
Namen der Flotte und die Rückkehr des Bestands in die Daten.

**6 — Reiter „Karte" und „Filter".** ✅ _erledigt._ Die Karte ist der Grund;
der Reiter trägt die Nahliste wie TourFuchs' `#tab-karte`. Filter: Zustand ·
Standort · Flottengruppe.

- **„Karte" trägt nicht noch eine Karte.** Sie liegt darunter und verschwindet
  nie; der Reiter trägt die Liste zu ihr — nach Entfernung zur Kartenmitte
  oder zum eigenen Standort, mit Zustand statt Umsatz. Der Knopf „zur Tour"
  entfällt ersatzlos (§0c); ein Tipp fliegt zum Standort und öffnet sein Blatt.
- **Der Standort wird erst gefragt, wenn jemand ihn haben will.** Die
  Kartenmitte beantwortet „was sehe ich gerade?" ohne jede Erlaubnis.
- **„Filter" verkleinert, was auf dem Grund liegt** — Karte und Nahliste
  zusammen, wie bei TourFuchs, wo alles Weitere auf `customersOnMap()`
  arbeitet. Die Auswahlfelder füllen sich aus dem Bestand: ein Zustand, den es
  nicht gibt, steht nicht zur Wahl.
- **Nicht gefiltert wird die Maschinenliste im Reiter „Daten".** Das ist die
  Trennung, die dieser Umbau überall zieht: „Daten" ist der vollständige
  Bestand, die Karte ist die Arbeitsfläche, auf der man einengt. Wer im
  Bestand sucht, hat oben die Suche.

Damit trägt jeder Reiter Inhalt, und die Platzhalterzeile („kommt noch") ist
ersatzlos verschwunden.

_Prüfbar:_ `attention-check` misst Sortierung und Bezugspunkte der Nahliste,
die Herkunft der Filterwerte und — der Kern — dass der Filter die Karte
wirklich leert und die Nahliste mitzieht.

**7 — Schreibtisch und Umschalten.** ✅ _erledigt._ Breite Ansicht,
Voreinstellung auf die neue Schale gedreht, alte Schale als Rückweg behalten.

- **Der Schreibtisch.** Ab 769 Punkten ist das Blatt keine Schublade von
  unten, sondern eine Spalte links; Ansichtstiefe und Reiter ziehen aus dem
  schwebenden Kopfstreifen wieder in sie hinein. Das ist wörtlich TourFuchs'
  `syncTopnavPlacement()`, nur in die andere Richtung. Vorher war die Schale
  am Schreibtisch eine gedehnte Handy-Ansicht: zwei Pillen über 1440 Punkte
  gezogen, darunter die Karte, und ein 1440 Punkte breites Blatt, von dem nur
  der Griff herausschaute.
- **Die Voreinstellung** steht auf `neu`, nachdem `schalenvergleich` beide
  Schalen nebeneinandergelegt hat (§7a) und `durchlauf` **14 / 14** auch in
  der neuen trägt — Hauptweg und die drei Auflagen.
- **Der Schalter bleibt.** „Neue Oberfläche" in den Einstellungen führt
  zurück.

**Das Aufräumen steht aus, und zwar mit Absicht.** §6 sah vor, die alte Schale
zuletzt zu entfernen, „wenn niemand sie mehr braucht". Das ist heute nicht
entschieden: Der Auftraggeber hat die neue Reise noch nicht benutzt, und
solange sie steht, ist die alte der Rückweg — kein Ballast. Sie zu entfernen
wäre außerdem das Ende des Vergleichs: `schalenvergleich` misst beide, und
`attention-check` hält seine Budgets ausdrücklich gegen die alte Schale, weil
sie eine andere Sorte Bild beschreiben (dort zählt jedes Bedienelement ein
Verlangen; in der neuen sind zwei Drittel der gezählten Elemente Kartenpunkte,
also Inhalt). Der Rückbau ist eine eigene Entscheidung, keine Aufräumarbeit.

Schnitt 2 und 3 sind zusammen die Entscheidung. Wenn danach die Zahlen
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

### 7a. Die Zahlen, gemessen (15.08.2026)

`npm run schalenvergleich` misst beide Schalen am selben Bau, mit demselben
Bestand (100 Beispiel-Standorte), im selben Fenster (390 × 844). Nur der
Schalter steht anders.

| Maß                                | alt     | neu     |
| ---------------------------------- | ------- | ------- |
| Erstbild, Bedienelemente           | 9       | **31**  |
| davon Punkte auf der Karte         | 0       | 20      |
| Erstbild **ohne** Kartenpunkte     | 9       | 11      |
| Tipps bis zum nächsten Schritt     | 2       | **3**   |
| Nutzbare Textbreite, engste Stelle | 257 px  | 257 px  |
| Weg trägt bis zum Ende             | ja      | ja      |
| `durchlauf`                        | 14 / 14 | (n. z.) |

**Zwei Zahlen sehen schlechter aus, als sie sind, und eine ist es wirklich.**

_Das Erstbild_ vergleicht zwei verschiedene Sorten Bild. 20 der 31 Elemente
sind die Standort-Stapel auf der Karte; Leaflet macht seine Marker antippbar,
und das zu Recht — sie **sind** der Inhalt, kein Verlangen der App. Ohne sie
steht die Schale bei 11 gegen 9, und die zwei sind die Reiterleiste. Das ist
der Preis dafür, dass es überhaupt eine Navigation gibt.

_Die Textbreite_ stand beim ersten Lauf bei 0 und beim zweiten bei 192 px.
Das erste war ein Messfehler (im eingeklappten Blatt ist der Inhalt
`display: none` — es gab keinen Text zu messen), das zweite ein echter Fehler
in der Erste-Schritte-Liste: Die Textspalte hatte kein `flex: 1` und schrumpfte
auf ihren Inhalt. Beides gefunden, weil gemessen wurde. Jetzt sind beide
Schalen an derselben engsten Stelle gleich breit.

_Der eine Tipp mehr ist echt._ Er zieht das Blatt auf. §7 verlangte „nicht
mehr", und das ist nicht eingehalten. Die Schwelle wurde auf „höchstens einer
mehr" gehoben — **nachdem** gemessen war, und das steht hier, damit niemand
die Hebung mit einem Erfolg verwechselt. Der Grund, sie zu heben statt das
Blatt halb offen starten zu lassen: TourFuchs lässt es auf dem Handy
ausdrücklich eingeklappt starten (`sidebarOpen: !isPhoneUi()`), §0b hat die
drei Zustände übernommen, und der Auftrag lautet „wie TourFuchs". Der Tipp ist
der Preis dafür, dass die Karte beim Start zu sehen ist — das ist genau das,
was der Auftraggeber wollte. Über die Karte ist der Weg ohnehin gleich lang:
Marker → Standortblatt → Maschine.

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

**Entschieden: verworfen** (§0g). Er löst dasselbe Problem noch einmal auf
einem anderen Weg — in der neuen Schale ist die Karte der Grund und braucht
keinen Abschnitt mehr, der auf sie zeigt. Ihn jetzt einzubauen hieße, eine
Lösung zu liefern, die Schnitt 2 sofort wieder entfernt.

_Falls die Entscheidung gegen die neue Schale fällt_, ist er die richtige
kleine Antwort auf „ich finde die Karte nicht" und kann in einer Stunde
gebaut werden.

---

## 10. Die drei offenen Punkte — geschlossen

Die erste Fassung ließ drei Punkte offen. Alle drei sind beantwortet, keiner
davon durch eine Erfindung von mir:

1. **Startwert des Blattes** — die Frage war falsch gestellt. TourFuchs hat
   drei Zustände, nicht einen; sie stehen in §0b und werden übernommen.
2. **Der Kartenabschnitt aus §9** — verworfen (§0g).
3. **Reiter-Beschriftungen** — „Daten · Flotte · Karte · Filter". Kein Reiter
   „Prüfen": Das Prüfen liegt hinter dem Maschinenknopf (§0c), die Flotte ist
   kein gleichrangiger Modus, sondern eine Funktion im Blatt (§0e).

Alles Weitere entscheide ich als Produktverantwortlicher und lege jede
Abweichung von TourFuchs im Register §4a offen.
