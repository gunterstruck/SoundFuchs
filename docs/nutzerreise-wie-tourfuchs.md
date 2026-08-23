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
html[data-schale='neu'] .fab-row {
  display: none;
}
```

Ich habe SoundFuchs' schwebende Pillen **ausgeblendet** — also genau das
Element entfernt, das TourFuchs' erstes Bild ausmacht, während ich behauptete,
TourFuchs nachzubilden. Eine Ähnlichkeit, die man durch Wegnehmen erreicht, ist
keine.

### Der Beschluss

**TourFuchs ist der unveränderte gestalterische Stamm.** Nicht Vorbild, nicht
Inspiration, nicht Messlatte — Ausgangspunkt. Die Richtung dreht sich um:

|               | bisher                          | ab jetzt                             |
| ------------- | ------------------------------- | ------------------------------------ |
| Ausgangspunkt | SoundFuchs' Schale              | TourFuchs' Schale                    |
| Bewegung      | SoundFuchs wird „tourfuchsiger" | TourFuchs wird fachlich reduziert    |
| Ergebnis      | Ähnlichkeit                     | Deckungsgleichheit vor dem Scharnier |
| Prüffrage     | „sieht es aus wie …?"           | „ist es dasselbe?"                   |

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

| TourFuchs              | SoundFuchs                                 |
| ---------------------- | ------------------------------------------ |
| Kunde                  | Maschinenstandort                          |
| Kundenname             | Maschinenstandortname                      |
| Kundenmarker           | Standortmarker                             |
| Kundenliste            | Maschinenstandortliste                     |
| „Neuer Kunde"          | „Neuen Maschinenstandort anlegen"          |
| —                      | ein Standort enthält **mehrere** Maschinen |
| Kundendatenimport      | Standort- und Maschinenimport              |
| Tourplanung            | entfällt                                   |
| Umsatz-/Vertriebsdaten | entfallen                                  |
| Vertriebsgebiete       | nur, falls für Standorte sinnvoll          |

### Was das kostet

Gemessen, nicht geschätzt:

|                                 | Zeilen                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| TourFuchs-Schale, zu übernehmen | ~1 100 HTML · 4 551 CSS · ~5 260 JS                                                                     |
| TourFuchs-Teile, die entfallen  | ~6 000 (Tourplaner, Showcase, Lasso, Tresor, Besuchsplaner, Gebietseditor, SafeTransfer, Mobilvorschau) |
| SoundFuchs-Motor, unberührt     | ~17 200 (DSP, ML, Datenbank, Typen)                                                                     |
| Meine Schale aus Schnitt 2–7    | ~1 500 — **wird ersetzt, nicht behalten**                                                               |

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

## 0i. Produktleuchtturm: das Geräusch-Briefing

**SoundFuchs stellt keine Diagnose.** Sein Leuchtturm ist ein anderer, klarer
Nutzen: SoundFuchs macht hörbar, was ein Mensch meint, und bereitet es so auf,
dass eine Fachperson oder externe KI ohne langes Nachfragen weiterarbeiten
kann.

> **SoundFuchs – der Assistent für auffällige Geräusche.**
>
> **Macht hörbar, was du meinst.**

Das verbindliche Produktbild besteht aus vier Teilen:

| Ebene     | Verbindlicher Begriff                 | Bedeutung                                                                        |
| --------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| Rolle     | **Geräusch-Assistent**                | führt durch Aufnahme, Markierung, Aufbereitung und Übergabe                      |
| Bild      | **akustischer Textmarker / Hör-Lupe** | hebt das Gemeinte hervor, ohne es als Ursache zu deuten                          |
| Tätigkeit | **Geräusch aufbereiten**              | Original, Hörstelle, Kontext und technische Grenzen verständlich zusammenstellen |
| Ergebnis  | **Geräusch-Briefing**                 | kompakte, weitergebbare Arbeitsgrundlage für Fachperson oder externe KI          |

Die einfache Reise lautet damit:

```text
Aufnehmen → markieren → aufbereiten → Geräusch-Briefing weitergeben
```

Die Rollen dürfen in keinem Text vermischt werden:

- **SoundFuchs** vergleicht, markiert, macht hörbar und stellt zusammen.
- **Der Nutzer** beschreibt, was er wahrnimmt, und entscheidet über die
  Weitergabe.
- **Fachperson oder externe KI** prüfen, ordnen ein und stellen gegebenenfalls
  eine Diagnose. Diese Leistung wird SoundFuchs nie zugeschrieben.

„Briefing" ist dabei kein dekorativer Anglizismus. Es bezeichnet den Zweck:
Jemand erhält kompakt alle Informationen, die für die nächste Prüfung nötig
sind. „Paket" bezeichnet nur den ZIP-Behälter, „Fall" nur die konkrete
Situation und „Prompt" nur den technischen Arbeitsauftrag innerhalb des
Briefings. Keiner dieser Begriffe ersetzt den Produktbegriff
**Geräusch-Briefing**.

### Verbindliches Vokabular

| Verwenden                                    | Nicht als Produktversprechen verwenden     |
| -------------------------------------------- | ------------------------------------------ |
| Geräusch-Briefing                            | Diagnosepaket, KI-Diagnose                 |
| Geräusch aufbereiten                         | Schaden analysieren                        |
| Auffälligkeit, Muster, Unterschied, Kontrast | Fehler erkannt, Defekt festgestellt        |
| Hör-Lupe, markierte Hörstelle, Hörhilfe      | Beweis, Schadenssignal                     |
| fachliche Prüfung und Einordnung             | automatische Diagnose                      |
| nächste Gegenaufnahme                        | Fehlerbestätigung                          |
| Arbeitsauftrag                               | Analyse-Prompt als sichtbarer Hauptbegriff |

Technische Bestandsnamen wie `AnalysisPackageDialog` oder die historische
Datei `3-Diagnose.ts` dürfen intern zunächst stabil bleiben. Nutzertexte,
Exporte, neue Dokumentation und neue Tests folgen ab jetzt ausschließlich
diesem Begriffsmodell. Übersetzungen verwenden die jeweilige natürliche
Entsprechung von „Geräusch-Briefing"; sie müssen nicht den deutschen
Anglizismus wörtlich übernehmen.

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

|                  | TourFuchs       | SoundFuchs      |
| ---------------- | --------------- | --------------- |
| Kopfleiste       | 0,0 390×52      | 0,0 390×52      |
| Kopfstreifen     | 0,52 390×100    | 0,52 390×100    |
| Blatt (sichtbar) | 0,744 390×100   | 0,744 390×100   |
| Karte            | 0,52 390×792    | 0,52 390×792    |
| Knopfzeile       | 0,676 390×38    | 0,676 390×38    |
| Ansichtstiefe    | im Kopfstreifen | im Kopfstreifen |

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

| Fenster  | Gesicht | Streifen    | Karte         | Knopfzeile  | Reiter oben |
| -------- | ------- | ----------- | ------------- | ----------- | ----------- |
| 390×844  | phone   | 0,52 390×55 | 0,52 390×792  | 0,676       | 0           |
| 820×1180 | phone   | 0,52 820×55 | 0,52 820×1128 | 0,**1011**  | 0           |
| 1180×820 | desktop | —           | 0,52 1180×768 | **400**,759 | 0           |
| 1440×900 | desktop | —           | 0,52 1440×848 | 400,839     | 0           |

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

|                                             | vorher                                                     |
| ------------------------------------------- | ---------------------------------------------------------- |
| Maschinenzeilen im Arbeitskontext           | **130**                                                    |
| fokussierbare Elemente hinter dem Scharnier | **178**                                                    |
| Höhe des Arbeitsbereichs                    | **10 174 px** (Handy), 11 016 px (Tisch)                   |
| Aufnahmeknopf                               | **52 px unter dem Rand**, nach zwei Tipps darauf           |
| Fenster dazwischen                          | ein Auswahlfenster für die Maschine, die man gerade wählte |

### Was jetzt dasteht

|                                       | nachher                                     |
| ------------------------------------- | ------------------------------------------- |
| Maschinenzeilen                       | **0** — auf Maschinen- **und** Arbeitsebene |
| fokussierbare Elemente                | **2**                                       |
| Höhe der Maschinenebene               | **792 px** (Handy)                          |
| Höhe der Arbeitsebene                 | **896 px**                                  |
| Tipps Maschinenzeile → Aufnahmefläche | **2**                                       |
| dominante Handlungen je Bild          | **1**                                       |
| Antippziele unter 44 px               | **0**                                       |

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

|                                                    |                                                     |
| -------------------------------------------------- | --------------------------------------------------- |
| Tipps Maschinenzeile → gespeicherter Normalzustand | **3**                                               |
| Fenster nach einer guten Aufnahme                  | **0**                                               |
| Fingerabdruck wirklich gezeichnet                  | **ja** (Bildpunkte gemessen, nicht Element gezählt) |
| Urteil danach                                      | „Bereit zum Prüfen"                                 |
| nächste Handlung                                   | „Jetzt Gegenprobe machen"                           |

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

|                                             |                           |
| ------------------------------------------- | ------------------------- |
| Ende der Messung → sichtbares Ergebnis      | **0 Tipps**               |
| Ergebnis → hörbarer Unterschied (Fall A)    | **1 Tipp**                |
| Maschinenebene → letzte Hör-Lupe (Fall C)   | **1 Tipp**                |
| Fenster im Ergebnis                         | **0**                     |
| dominante Handlungen je Ergebniszustand     | **1**                     |
| Urteil und Handlung ohne Scrollen           | **ja**                    |
| Antippziele unter 44 px                     | **0**                     |
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

Die **Hervorhebung des Unterschieds** (`Originalmessung · Deutlich · Stark`) ist nicht
dabei. Sie ist kein Anzeigetrick, sondern DSP: Pegelabgleich, Headroom, Fades,
Limiter — und vor allem ein Lautheitsabgleich zwischen den Fassungen, damit
„lauter" nicht mit „überzeugender" verwechselt wird. Der Auftrag lässt diesen
Aufschub ausdrücklich zu und verlangt dafür, `Normalzustand | Messung |
Unterschied` prominent zu liefern; genau das steht jetzt da. Simuliert wird
nichts.

Ebenfalls zu diesem Stand offen: freie Auswahl im Spektrogramm, „Mit Fachmann teilen", der
vollständige Schreibtisch-Analysearbeitsplatz (die dritte Spalte mit großem
2D-Spektrum), und das Entfernen des alten Ergebnisdialogs aus den übrigen
Wegen.

**S4a/4b — Hervorhebung und Teilen.** ✅ _erledigt._
Unterschied in drei Stufen mit Clipping-Schutz und Lautheitsabgleich; den
wirklich gehörten Vergleich als Original plus gekennzeichnete Hörhilfe mit
einem Fachmann teilen.

**S4c — Rechteckige 2D-Hör-Auswahl.** ✅ _erledigt._ Den auffälligen Bereich
der Differenz über Zeit und Frequenz markieren, als gekennzeichnete Hörhilfe
abspielen und zusammen mit dem Original teilen. Freies Einkreisen bleibt eine
spätere Bedienvariante desselben Auswahlmodells.

### S4e — Ein Maßstab und eine Richtung (18.08.2026)

✅ _erledigt._ Zwei Fragen des Auftraggebers, die dieselbe Wurzel haben: Was
heißt beim Vergleichen eigentlich „gleichzeitig", und was heißt „Unterschied"?

**Was vorher wirklich gerechnet wurde.** `isolateDifference()` vergleicht nicht
zwei Aufnahmen. Es reduziert den Normalzustand auf **ein einziges gemitteltes
Spektrum** und zieht das von jedem Rahmen der Messung ab:

```
keep = max(0, |M| − α · g · R)      α = 1,6   N = 2048   hop = 512
```

Daraus folgt dreierlei, und alle drei waren nirgends aufgeschrieben:

1. Es gibt **keine Zeitzuordnung** — Rahmen 3 der Messung wird gegen dasselbe
   Mittel gehalten wie Rahmen 300.
2. Beide Aufnahmen werden bei **12 Sekunden** abgeschnitten, immer ab 0.
3. `max(0, …)` schneidet **eine ganze Richtung** ab.

### Die Zeit: ein Maßstab für alle Ansichten

Die 3D-Geometrie legt die Zeilen einer Matrix auf eine **feste Tiefe** um
(`z = r/(rows−1) · 2 − 1`). Gemessen hieß das:

| Ansicht | Dauer | Tiefe im Bild |
|---|---|---|
| Normalzustand | 10 s | volle Tiefe |
| Messung | 25 s | volle Tiefe |
| Unterschied | 12 s (Kappung) | volle Tiefe |

Dreimal dieselbe Tiefe für drei verschiedene Zeiten. Die Beschriftung stimmte —
sie kommt aus `durationSec` —, die **Form** nicht: Derselbe Vorgang wanderte
beim Umschalten und wirkte einmal dichter, einmal gedehnter. Beim
Intensitätsmaßstab war das längst gelöst (gemeinsame dB-Decke); bei der Zeit
fehlte es.

`cropSpectrogramMatrix()` schneidet jede Ansicht auf das **gemeinsame Fenster**
zu — die kürzere der beiden Aufnahmen. Danach sind alle gleich lang, und die
Streckung auf die volle Tiefe ist für alle dieselbe Abbildung. Ein Chip
`⏱ Gleiche Zeit` (Vorgabe an) schaltet auf die ganze Aufnahme zurück, wenn man
sie einzeln ansehen will.

Was **nicht** passiert: Kürzeres wird nie gestreckt. Lieber ein ehrlich
kürzeres Gebirge als eine erfundene Zeit.

### Die Richtung: „Mehr oder weniger"

`max(0, …)` heißt: Was neu dazugekommen ist, bleibt stehen; was **verschwunden**
ist, wird zu Null — unsichtbar und unhörbar. Wegen α = 1,6 verschwindet sogar,
was nur leiser geworden ist.

Für das Ohr ist das richtig: Ein Ton, der fehlt, lässt sich nicht abspielen.
Für das Auge ist es falsch. „Der Lüfter läuft nicht mehr" ist oft
aussagekräftiger als „da ist etwas Neues".

`signedDifferenceMatrix()` rechnet je Anzeigeband und Zeitschritt

```
Δ dB = Pegel(Messung) − Pegel(Normalzustand) − Versatz
```

Höhe = Betrag, Farbe = Richtung: warm heißt lauter geworden, kalt leiser, in
der Mitte ein neutrales Grau. Nicht Turbo — ein Regenbogen hat keine Mitte und
kein Vorzeichen.

**Der Versatz ist ein Median, kein Mittelwert.** Zwei Aufnahmen derselben
Maschine unterscheiden sich fast immer im Gesamtpegel; ohne Ausgleich wäre das
Bild einfarbig. Der Median ist unempfindlich gegen wenige stark veränderte
Bänder — und die sind genau das, was gesucht wird. Ein Mittelwert würde einen
kräftigen neuen Ton in den Versatz einrechnen und ihn damit teilweise selbst
wieder wegkürzen. Falsifiziert: Mit Mittelwert statt Median fallen drei der
17 Prüfungen um, darunter „lässt sich von einem einzelnen starken Band nicht
den Versatz verbiegen".

**Die Höhe bedeutet hier etwas anderes**, und die Achse sagt das auch: „gleich"
am Boden, „±N dB" an der Spitze — statt „−50 dB" und „0 dB". Dieselbe Höhe
bedeutet sonst zweierlei. Aus demselben Grund bleibt die Vorzeichen-Ansicht aus
der gemeinsamen dB-Decke heraus: Ein Abstand und ein Schalldruck gehören nicht
auf eine Skala.

### Was gemessen wird

17 Unit-Tests auf reinen Funktionen — unter anderem: ein neues Band gilt als
„lauter", ein verschwundenes als „leiser", **ein reiner Pegelunterschied gilt
als keine Veränderung** (Mikrofon 6 dB näher darf nicht rot leuchten), der
Betrag wird gedeckelt, Zeitachse und Zeilen kommen von der Messung.

Im Browser prüft `durchlauf` Schritt 14 jetzt nicht mehr, ob eine Leinwand
Maße hat — das war derselbe blinde Fleck wie einst beim Fingerabdruck —,
sondern ob die **Höhenachse** „gleich" und „±N dB" trägt. Steht das da, ist die
Vorzeichen-Matrix wirklich durchgelaufen. Falsifiziert: Ohne die Angabe, dass
die Höhe ein Unterschied ist, meldet Schritt 14 „Richtungsansicht LEER".

### Was offen bleibt

Die **zyklussynchrone** Stufe. Bei einem Motor im Leerlauf steckt das normale
Tackern in der Referenz nur zeitweise; im Mittelwert wird es verschmiert und
erscheint mit kleinerem Pegel, als es im Moment des Schlags hat. Rahmenweise
verglichen überragt es dieses Mittel dann — **das völlig normale Tackern landet
im „Unterschied"**, und dazwischen wird über-subtrahiert. Die Bausteine dafür
liegen schon in `core/ml/engine/temporalCycle.ts` (`detectCyclePeriod`,
`alignPhase`, `buildCycleTemplate`): Statt eines Mittelspektrums ein
**Phasenprofil**, und jeder Messrahmen gegen das Profil seiner eigenen Phase.

Nicht gebaut, weil es echte Maschinenaufnahmen zum Beurteilen braucht: Ob ein
Phasenprofil ein normales Tackern wirklich auslöscht, entscheidet das Ohr an
einer laufenden Maschine, nicht ein synthetischer Testton.

Ebenfalls offen: **„Nicht mehr da" als vierte Hörquelle.** Für das Ohr wäre das
dieselbe Funktion mit vertauschten Rollen — `resynthesizeResidual(ref,
measProfile, …)`. Erst zeigt das Bild, ob es sich lohnt.

### S4f — Die leere Hälfte bekommt das Klangbild (18.08.2026)

✅ _erledigt._ Der Auftraggeber fragte, wie viele Tipps es bis zu den
eindrucksvollen Funktionen sind. Nachgezählt im Browser, mit echten Daten,
auf 390 × 844:

| | vorher |
|---|---|
| Angebote auf der ruhenden Maschinenseite | 5 |
| unterstes Element endet bei | **422 px** |
| ungenutzter Bildschirm darunter | **422 px — genau die Hälfte** |
| Tipps bis zum 3D-Gebirge (ab Maschinenseite) | **4** (Verlauf → Hören → 3D → Quelle) |
| dasselbe ab der Karte | **7**, und vorher auf „Profi" umschalten |
| Geräusch-Briefing | sichtbar bei **y = 1027 px**, also unter dem Rand |

Die halbe Seite stand leer, und das Eindrucksvollste lag vier Türen weiter.

**Das ist kein Platzproblem, sondern ein Belegungsproblem.** Der Auftraggeber
schlug vor, alles um ein Viertel zu verkleinern, damit mehr ins Bild passt.
Dem habe ich widersprochen: In den Schnitten davor wurden dreimal Antippziele
nach oben korrigiert, weil sie zu klein waren (34 px, 15 px, 32 px). Minus
25 % macht aus 44 px wieder 33 und nimmt genau die Bedienbarkeit zurück, die
gerade hergestellt wurde. Die leere Hälfte bekommt stattdessen das, wofür man
sonst vier Tipps braucht.

### Was jetzt dasteht

```
    ‹ Zum Standort
    Kompressor 1
    ● Bereit zum Prüfen
    Zuletzt 72 % · gerade eben

    [   Jetzt 10 Sekunden prüfen   ]
    Halte das Gerät wie beim letzten Mal an dieselbe Stelle.

    ┌───────────────────────────┐
    │   K L A N G B I L D       │  240 px, ohne Tipp da
    │   der letzten Prüfung     │  „Antippen für die große Ansicht"
    └───────────────────────────┘
    [Normalzustand][Messung][Unterschied]
    Letzte Prüfung · 72 % · gerade eben

    [ 🔍 Letzten Unterschied anhören ]
    Verlauf
```

| | nachher |
|---|---|
| Klangbild ohne Tipp | **gemalt, 238 px, ohne Scrollen im Bild** |
| ungenutzter Bildschirm | **83 px** statt 422 |
| Tipps bis zum Gebirge | **1** — auf das Bild tippen |
| Profi-Stufe nötig | **nein** |
| Seitenhöhe | 792 px bei 844 px Fenster — alles passt |

### Warum erst flach, dann Gebirge

Ein Gebirge in 240 px Höhe ist eine Briefmarke, und ein WebGL-Kontext ist eine
knappe Ressource — Browser vergeben nur eine Handvoll pro Seite. Das flache
Spektrogramm ist billig, sofort da und zeigt dieselbe Sache: **das ehrliche
Vorschaubild seiner selbst.** Ein Tipp verwandelt es an Ort und Stelle in das
Gebirge; derselbe Tipp führt zurück.

**Keine neue Ebene.** Der Auftraggeber hat ausdrücklich weniger Ebenen
verlangt, nicht mehr — das Bild wächst dort, wo es steht. Der Wächter prüft
das mit: Nach dem Tipp muss der Körper weiterhin auf `tiefe-maschine` stehen.

### Eine Farbe für eine Intensität

Damit die Verwandlung als Zoom lesbar ist und nicht als Sprung, müssen Vorschau
und Gebirge **dasselbe Bild** sein. Es gab dafür zwei Formeln: den
Turbo-Verlauf im Gebirge und eine eigene, von Hand gemischte im
Auswahl-Spektrogramm. Beide liegen jetzt in `core/dsp/klangfarben.ts`, zusammen
mit der Umrechnung Matrix → Bildpunkte. Zwei Formeln sind zwei Aussagen
darüber, was „laut" aussieht.

Nebenwirkung, offen benannt: Das Auswahl-Spektrogramm aus Schnitt 4c sieht
seither anders aus — nämlich wie das Gebirge.

### Was gemessen wird

Neun Unit-Tests auf der reinen Bildrechnung. Der wichtigste: **das höchste Band
liegt oben.** Ein Spektrogramm mit gespiegelter Frequenzachse sieht „irgendwie
richtig" aus und ist es nicht — falsifiziert, der Test fällt.

Im Browser prüft `wow` in Fall C: Klangbild da, **wirklich gemalt** (gesetzte
Bildpunkte, nicht bloß eine Leinwand mit Maßen — dieselbe Lehre wie beim
Fingerabdruck), ohne Scrollen im Bild, drei Quellen, höchstens 160 px
ungenutzter Bildschirm, und ein Tipp bringt das Gebirge, ohne die Ebene zu
wechseln.

### Was als Nächstes drankommt

Der Entwurf hat noch zwei Teile: **das Briefing aus dem Keller holen** (es steht
weiter unter dem Bildschirmrand) und **den Verlauf zu dem machen, was er sein
sollte** — eine Liste vergangener Prüfungen mit Zahl, die den Inhalt des
Klangbildes wechselt, statt die einzige Tür zu allem Guten zu sein.

### S4g — Briefing und Verlauf kommen aus dem Keller (18.08.2026)

✅ _erledigt._ Der zweite Teil des Entwurfs. Aus dem ersten blieben zwei Punkte
offen; beide sind jetzt zu.

**Das Briefing stand bei y = 1027 px** — 183 px unter dem Bildschirmrand, und
nur erreichbar, wenn man erst die Hör-Lupe aufmachte und dann wusste, dass man
scrollen muss. Für den Produktleuchtturm des Hauses (#71) der falsche Ort. Es
steht jetzt **neben** dem Nachhören, in einer Zeile: zwei gleichwertige zweite
Wege. Die eine dominante Handlung bleibt „Prüfen".

**Der Verlauf war ein Wort in Kleinschrift** und trotzdem die einzige Tür zu
allem Guten. Er trägt jetzt seine Zahl — „Verlauf · 7 Prüfungen" —, und die
letzten Prüfungen stehen als Reihe unter dem Klangbild: **Ein Tipp wechselt,
was im Bild steht.** Der Verlauf öffnet damit keine neue Welt mehr, sondern
wechselt den Inhalt des Fensters. Das ist der semantische Zoom, den der
Auftraggeber gemeint hat — im Bild, nicht in der Navigation.

Die Reihe erscheint erst ab zwei wählbaren Prüfungen (eine Wahl ohne
Alternative ist keine) und nur für Prüfungen mit gespeichertem Ton.

### Zwei Fehler, die das Messen gefunden hat

**Die untere Hälfte kam zu spät.** Nach dem Einbau fehlten Zweitaktionen und
Verlauf im Aufmaß — obwohl beide später funktionierten. Kein Seitenfehler, nur
Zeit: Die Seite wartete auf das Laden der Aufnahmen, bevor sie fertig gebaut
war. Zwei Ursachen, beide selbst gebaut:

1. **Ein Ladevorgang je Prüfung.** `getRecordingsForMachine` liefert ohnehin
   alles auf einmal — jetzt einmal laden, dann zuordnen. Das ist auch weniger
   Arbeit als vorher.
2. **Ein voller Durchlauf durch alle Diagnosen**, nur um die Zahl im
   Verlaufs-Etikett zu zeigen. Die Zahl trägt sich jetzt nach, wenn sie da
   ist; darauf wartet die Seite nicht.

Daraus wurde eine Regel: **Was ohne Ton auskommt, steht sofort.** Der
tonabhängige Teil bekommt einen reservierten Platz und füllt ihn, wenn er kann.
Wer schnell tippt, findet die Seite fertig vor.

**„Verlauf · 1 Prüfungen".** Ein eigener Schlüssel für den Einzelfall.

### Gemessen (390 × 844, Maschine in Ruhe)

| | vor S4f | jetzt |
|---|---|---|
| ungenutzter Bildschirm | 422 px | **85 px** |
| Tipps bis zum Gebirge | 4 | **1** |
| Briefing | y = 1027 px, unter dem Rand | **im Bild, 48 px hoch** |
| Verlauf | „Verlauf" | **„Verlauf · N Prüfungen"** |
| Prüfung wechseln | Verlauf → Hören (2 Tipps, neues Fenster) | **1 Tipp, im Bild** |

Alles zusammen 759 px bei 844 px Fenster: **Urteil, Handlung, Klangbild,
Hörweg, Briefing und Verlauf ohne Scrollen.**

`wow` bewacht in Fall C zusätzlich: Briefing vorhanden, ohne Scrollen im Bild,
mindestens 44 px hoch — und der Verlauf nennt eine Zahl.

### S4h — Eine Zeile für den Weg, und der Text wird wieder sichtbar (21.08.2026)

Der Auftraggeber schickte ein Bildschirmfoto im Dunkelmodus mit einer klaren
Anweisung: „Bitte den Platz zusammentreffen, zurück zu Standort, 10 Sek prüfen
in eine Zeile, den Punkt und den Zeilentext weg, da nun redundant."

**Das Zusammenlegen.** Rückweg und die eine Handlung standen untereinander und
brauchten zwei Zeilen für zwei Knöpfe, die beide kurz sind. Sie stehen jetzt
nebeneinander in `.maschine-aktionszeile`. Der Rückweg wird dabei **verschoben,
nicht verdoppelt** — es bleibt derselbe Knopf, den die anderen Ebenen oben
benutzen; `rueckwegNachHause()` gibt ihn zurück, bevor die Maschinenebene
geleert wird und wenn eine andere Ebene aufgeht. Zwei Knöpfe mit demselben Ziel
wären zwei Wahrheiten über den Rückweg.

**Der Punkt und die Zeile.** Auf einer Maschine in Ruhe stand unter dem Namen
ein Punkt mit „Bereit" — und direkt darunter „Zuletzt 87 % · vor 4 Tagen". Der
Auftraggeber hat recht: Das ist dieselbe Auskunft zweimal. Der Punkt bleibt
deshalb nur dort, wo er etwas sagt, das sonst nirgends steht: in den
Ergebniszuständen und bei den zwei Blockaden (Tonqualität, Mikrofonfreigabe).

**Was das Messen darunter gefunden hat.** Im selben Bildschirmfoto fehlte der
Maschinenname. Das war nicht Redundanz, sondern ein Defekt:

```
=== dark === (vorher)
  .maschine-kopf h2  „Kompressor 1"  rgb(15,23,42) auf rgb(15,23,42) → 1:1
  .maschine-lage                     rgb(15,23,42) auf rgb(15,23,42) → 1:1
```

Der Name stand da und war unsichtbar. Die Ursache ist genau die Naht, für die
es `tiefe.css` gibt: Der Stamm ist hell und kennt keinen Dunkelmodus, seine
Marken (`--color-text` und Geschwister) sind fest hell. SoundFuchs' Dunkelschema
setzt `--bg-primary` auf `#0f172a` — denselben Wert, den der Stamm für Text
benutzt. Behoben wird das in der Grenzschicht: Innerhalb von `.zanobo-tiefe`
zeigen die Stamm-Marken im Dunkeln auf SoundFuchs' Marken. Der Stamm bleibt
unberührt. Nachher: **16,3:1 dunkel, 17,1:1 hell.**

### Der Wächter, den es dafür jetzt gibt

Ein Bildschirmfoto zeigt so etwas nur dem, der hinschaut. `wow` misst es:
Das Handy läuft jetzt **zweimal** durch die Geometrie, hell und dunkel, und auf
der Maschinenebene wird für jedes sichtbare Element mit eigenem Text der
Kontrast gegen den Grund gerechnet, der wirklich dahinterliegt — mit der
größenabhängigen Schwelle (3:1 ab 24 px oder ab 18,66 px fett, sonst 4,5:1).

Der Wächter wurde absichtlich falsifiziert: Mit abgeschaltetem Dunkelblock
meldet er `handy-dunkel: h2 „Kompressor 1" 1:1 statt 3:1`.

**Und er hat beim ersten Lauf etwas gefunden, wonach niemand gesucht hatte:**

```
handy · handy-dunkel · tablet-hoch · tablet-quer · tisch
  primary maschine-aktion „Normalzustand aufn" 3,7:1 statt 4,5:1
```

Der wichtigste Knopf der Anwendung war in **allen** Formaten unter der Schwelle
— weiße Schrift auf `--color-primary` (`#0d9488`). Das ist kein Fehler des
Umbaus, das war immer so. Behoben ohne neue Farbe: Die eine Handlung benutzt
`--color-primary-dark` (`#0f766e`), den Ton, den der Stamm für dieselbe Fläche
beim Überfahren schon vorsieht. **5,5:1.** Die Palette bleibt dieselbe.

### Was mit dem freigewordenen Platz passiert

Zusammengelegte Zeile plus gestrichene Statuszeile ergeben 88 px. Auf dieser
Seite ist freier Platz kein Gewinn — die halbe leere Seite war der Anlass für
das Klangbild (§S4f). Der Platz geht deshalb an das Bild:
`clamp(240px, 34vh, 320px)` statt fester 240 px. Gemessen in Fall C sinkt der
ungenutzte Bildschirm von **173 px auf 126 px**, und die Vorschau wird um 47 px
höher.

| | vor S4h | jetzt |
|---|---|---|
| Zeilen für Rückweg + Handlung | 2 | **1** |
| Statuszeile auf ruhender Maschine | Punkt + Text, doppelt | **entfällt** |
| Kontrast Maschinenname (dunkel) | **1:1** | **16,3:1** |
| Kontrast der einen Handlung | 3,7:1 | **5,5:1** |
| Höhe des Klangbilds | 240 px | **287 px** (Handy) |
| ungenutzter Bildschirm (Fall C) | 173 px | **126 px** |

### S4i — Die Standortebene bekommt dieselbe Behandlung (21.08.2026)

Die Maschinenebene ist über sieben Schnitte gemessen, korrigiert und bewacht
worden. Die Ebene davor — die, auf der ein Techniker ankommt — hatte in
derselben Zeit **keinen einzigen Wächter**. Der Durchlauf ging über sie hinweg
zur Maschine, und `wow` fing erst dort an zu zählen.

Eine Messung von Hand hat nachgeholt, was seither niemand gefragt hat:

```
=== handy (390 × 844) ===
  Antippziele:  4 × Maschinenzeile 42 px, „Neue Maschine anlegen" 37 px
  Kontrast:     Kachelbeschriftungen 4,3:1 · „Referenz fehlt" 4,2:1
                „Neue Maschine anlegen" 3,7:1
  ungenutzt:    310 px von 844

=== handy (dunkel) ===
  near-name „Kompressor 2"          1:1     ← die berührte Zeile
  standort-maschine-lage            1,3:1
```

**Der dunkle Befund ist der interessanteste.** `--color-primary-light`
(`#ccfbf1`) ist die Fläche, die der Stamm einer Zeile unter dem Finger gibt.
Sie ist hell gedacht und blieb im Dunkeln hell, während der Text hell wurde:
Der Maschinenname verschwand **genau in dem Moment, in dem man ihn antippte**.
Auf einem Bildschirmfoto sieht man das nie — dort hält niemand den Finger.

Der Token wird trotzdem nicht umgebogen: Er ist im Stamm auch der Fokusring von
Eingabefeldern, und ein Fokusring in Flächenfarbe wäre der nächste unsichtbare
Zustand. Umgestellt wird nur die Fläche der Zeile. Im Dunkeln sinkt sie unter
dem Finger ab, statt aufzuleuchten — 9,9:1 für den Nebentext, 13,2:1 für den
Namen.

### Was die Ebene jetzt sagt

**Ein Satz statt drei Kacheln.** Dort stand „4 Maschinen · 0 auffällig ·
4 ungeprüft" in drei Kacheln, 66 px hoch, darunter die Überschrift „Maschinen",
darunter die Maschinen — dasselbe Wort dreimal auf 150 px. Und bei vier
ungeprüften Maschinen ist „0 auffällig" keine Auskunft, sondern die Folge davon,
dass noch nichts gemessen wurde. Jetzt: **„4 Maschinen · noch keine geprüft"**.

**Jede Zeile sagt, was mit ihrer Maschine los ist** — und zwar in denselben
Worten wie die Maschinenseite selbst (`maschine.lage*`). Wer in der Liste
„Klingt wie der Normalzustand" liest und die Zeile antippt, liest dort denselben
Satz. Vorher stand an dieser Stelle „Referenz fehlt": die Sprache der Datenbank,
nicht die der Werkstatt. Die zweite Zeile ist zugleich die Größe — 56 px statt
42.

**Anlegen ist nicht die Aufgabe.** „➕ Neue Maschine anlegen" war der eine große
grüne Knopf dieser Seite. Das sagte dem Techniker, der gerade angekommen ist:
Deine Aufgabe hier ist es, Maschinen anzulegen. Seine Aufgabe ist es, sie zu
prüfen — und diese Handlung ist die Liste. Anlegen ist jetzt ein gewöhnlicher
Knopf mit 44 px; die dominante Handlung ist es nur auf einem leeren Standort,
wo es tatsächlich das Einzige ist, was man tun kann.

**Am Schreibtisch zwei Spalten.** Gemessen bei 1440 × 900 stand dort eine Zeile
und 502 px Leere darunter.

### Was NICHT gemacht wurde, und warum

Für den ungenutzten Bildschirm gibt es auf dieser Ebene **absichtlich keine
Grenze**. Auf der Maschinenebene war leerer Platz ein Befund: Dort lag das Beste
vier Tipps entfernt, während die halbe Seite leer stand. Hier hängt die Höhe an
der Zahl der Maschinen — ein Standort mit vier Maschinen füllt kein Handy, und
das ist eine Tatsache über den Standort, keine über den Entwurf. Eine Obergrenze
würde zum Auffüllen zwingen, und Auffüllen ist genau das, was diese Ebene vorher
hatte.

### Was das Bauen an den Regeln gefunden hat

Die erste Fassung der Zwei-Spalten-Regel stand als `@media (min-width: 900px)`
da. `gesichter.test.ts` hat sie abgewiesen, und zu Recht: Eine eigene Schwelle
bei 900 trifft das Tablet hochkant und sonst niemanden — ein drittes Gesicht,
entstanden nicht aus Absicht, sondern aus Bequemlichkeit. Jetzt steht dort
`DESKTOP_FACE_MEDIA`, wortgleich.

### Der Wächter, den es dafür jetzt gibt

`wow` misst die Standortebene, bevor sie verlassen wird — in allen fünf
Formaten, hell und dunkel: Antippgrößen, Kontrast, dass jede Zeile ihre Lage
sagt, dass der Standort seine Lage in einem Satz sagt, dass keine Kachel und
keine Überschrift über einer Liste steht, die sich selbst erklärt, und dass
neben dieser Liste keine dominante Handlung steht.

Die Lesbarkeitsmessung ist dafür aus der Maschinenmessung herausgelöst worden
und gilt jetzt für jede Ebene. Dass die Standortebene ihre Befunde so lange
behalten durfte, lag nicht daran, dass sie schwer zu finden waren.

Alle Prüfungen absichtlich falsifiziert:

```
✗ handy/Standort: Antippziele unter 44 px — near-row standort-maschine(42×362) …
✗ handy/Standort: eine Maschinenzeile sagt nicht, was mit ihrer Maschine los ist
✗ handy/Standort: 1 dominante Handlungen neben einer Liste, die selbst die Handlung ist
✗ handy-dunkel/Standort: near-name „Kompressor 3" 1:1 statt 4.5:1
```

| | vor S4i | jetzt |
|---|---|---|
| Höhe einer Maschinenzeile | 42 px | **56 px** |
| „Neue Maschine anlegen" | 37 px (Handy), 33 px (Tisch), dominant | **44 px, sekundär** |
| Kontrast Maschinenname, berührt (dunkel) | **1:1** | **13,2:1** |
| Kontrast Nebentext | 4,2–4,3:1 | **7:1** |
| Kacheln + Überschriften über der Liste | 3 + 1 | **0 + 0** |
| Was eine Zeile über ihre Maschine sagt | „Referenz fehlt" | **„Noch kein Normalzustand"** |
| Wächter auf dieser Ebene | **0** | **7, in 5 Formaten** |

### S5 — Das Konzept „Ein Bildplatz, zwei Stufen, eine Leiste" (22.08.2026)

Der Auftraggeber hat am 22.08.2026 fünf Dinge benannt. Sie hängen zusammen, und
deshalb steht hier zuerst, was sie zusammen ergeben — und danach, in welcher
Reihenfolge sie gebaut werden.

**Die Klammer.** Die Maschinenseite hat eine Mitte: das Bild. Alles, was ein
Techniker dort tut, dreht sich darum — hinsehen, vergleichen, hineinhören,
hineinzoomen. Bisher war dieses Bild ein Element unter anderen, das je nach
Zustand mal da war, mal nicht, und das verrutschte. Es wird zum **Bildplatz**:
ein fester Ort auf der Seite, mit wechselndem Inhalt und wachsendem Werkzeug.

Die fünf Schnitte:

| | was | warum |
|---|---|---|
| **S5a** | Der Bildplatz wandert nicht | Das Auge vergleicht nur, was an derselben Stelle steht |
| **S5b** | Die Iris als vierte Quelle | „Ähnlich oder nicht?" in einem Blick, rund statt flach |
| **S5c** | Auswählen und Abspielen im Bild | Eine Stelle im Spektrogramm herausgreifen und hören |
| **S5d** | Basis und Profi hinter dem Scharnier | Zwei Stufen wie im Stamm — und eine Einordnung, was wohin gehört |
| **S5e** | Die Seitenleiste hinter dem Scharnier | Dieselbe Leiste wie vor dem Scharnier, mit den Einstellungen darin |

**Die Einordnung in Basis und Profi** (S5d), als Entscheidung des Produktleiters
vorweggenommen, damit S5b und S5c wissen, wohin sie gehören:

*Basis — alles, was zur Frage „klingt sie anders?" gehört:* Prüfen,
Normalzustand aufnehmen, der Bildplatz mit seinen Quellen (Normalzustand,
Messung, Unterschied, **Iris**), ein Tipp auf das Gebirge, Unterschied anhören,
Verlauf, die Runde, das Geräusch-Briefing.

*Profi — die Werkzeuge zum Sezieren:* das tiefe Auswahlwerkzeug in der Hör-Lupe
(Maßstabsvergleich, eigene Quellenwahl, Teilen), die Hervorhebungsstufen, das
Teilen- und Exportpaket, Kennzahlen und Debug-Ausgaben, Schnellvergleich und
Flotte, die Einstellungen der Auswertung.

_Korrigiert am 22.08.2026 mit §S5c:_ Das schlichte Aufziehen und Anhören eines
Ausschnitts stand hier zuerst unter Profi. Das war falsch gedacht — es ist der
Kern eines akustischen Werkzeugs, nicht sein Zubehör, und der Auftraggeber hat
es ausdrücklich für die obere Ebene verlangt. Es gehört zu Basis.

Das Gebirge bleibt ausdrücklich in **Basis**. Es war einmal hinter der
Profi-Stufe versteckt, und genau das hat der Auftraggeber im August als Fehler
benannt: Das Eindrucksvollste lag vier Tipps entfernt und hinter einem Schalter.

### S5a — Der Bildplatz wandert nicht (22.08.2026)

Der Auftraggeber: „Wenn dann Ergebnis kommt, dann rutscht das Bild runter und
die Interpretation rutscht da rein. Das ist blöd, weil dann kann ich das direkt
mit dem Auge nicht mehr vergleichen. Bitte einfach die Position tauschen, dass
das Ergebnis darunter läuft — mit dem Vorteil, dass das Spektrogramm immer noch
an der gleichen Stelle ist."

**Gemessen, bevor gebaut wurde** (390 × 844, dieselbe Maschine, zwei Zustände):

```
Bildplatz (Ruhe → Ergebnis)    179 px → 267 px      = 88 px Versatz
```

Die 88 px sind Punkt, Ergebnissatz und Beleg, die sich zwischen Kopf und Bild
schoben.

**Jetzt steht über dem Bild nur noch, was in JEDEM Zustand dasteht:** Name,
letzter Stand, die eine Handlung. Alles Zustandsabhängige — Urteil,
Ergebnissatz, Beleg, Hinweis, die Runde, die Hör-Lupe — steht darunter.

```
Bildplatz (Ruhe → Ergebnis)    179 px → 179 px      = 0 px
```

**Und im Ergebnis steht jetzt überhaupt ein Bild.** Bis hierher gab es das
Klangbild nur im Ruhezustand; im Ergebnis stand an seiner Stelle die Hör-Lupe.
Wer nach einer Prüfung sehen wollte, was sich geändert hat, musste erst
„Fertig" drücken. Die Aufnahmen liegen im Ergebnis ohnehin im Speicher — es aus
ihnen zu zeichnen kostet keinen Ladevorgang.

Die Prüfungsreihe ist mit ins Bild gewandert: Sie steuert, was im Bild steht,
und gehört deshalb zu ihm und nicht zu den Zweitaktionen.

`wow` misst den Versatz zwischen Fall C (Ruhe) und Fall A (Ergebnis) — dieselbe
Maschine, dasselbe Fenster, wenige Sekunden auseinander — und erlaubt 2 px.
Absichtlich falsifiziert, indem der Urteilsblock wieder über das Bild gehängt
wurde:

```
✗ Fall A: der Bildplatz wandert zwischen Ruhe und Ergebnis um 88 px (erlaubt 2)
```

### S5b — Die Iris kommt zurück, als Vergleich (22.08.2026)

Der Auftraggeber: „Dort gab es eine Funktion, wo eine Iris dargestellt wird —
einfach nur die Spektralanalyse, nur eben rund. Das würde ich auch gerne wieder
sehen, weil man kann direkt schnell erkennen, ob der Fingerabdruck wenigstens
ähnlich ist oder eben nicht."

**Sie kommt als vierte Quelle des Bildplatzes zurück** — neben Normalzustand,
Messung und Unterschied. Und sie kommt als *Vergleich* zurück, nicht als
Einzelbild: Der Normalzustand liegt als ruhige Fläche darin, die Messung als
Linie darauf, und der Zwischenraum trägt die Richtungsfarbe — warm, wo die
Messung lauter ist, kühl, wo sie leiser ist.

**Drei Entscheidungen:**

*Ein Maßstab für beide.* Jedes Spektrum für sich zu normieren wäre der Fehler,
der den ganzen Vergleich wertlos macht: Eine durchweg doppelt so laute Messung
sähe dann genauso aus wie der Normalzustand. Beide werden gegen den gemeinsamen
Höchstwert in dB gerechnet.

*Die Farben des Unterschieds, nicht die der alten Iris.* Die Einzel-Iris hat
eine eigene Skala (blau → grün → braun, für „wie stark ist dieses Band"). Für
den Vergleich zählt die Richtung, und dafür gibt es in diesem Haus schon eine
Sprache: warm heißt mehr, kühl heißt weniger — dieselbe wie im Spektrogramm und
im Gebirge. Wer sie einmal gelernt hat, soll sie nicht zweimal lernen müssen.

*Kein Gebirge aus der Iris.* Die runde Ansicht hat keine Zeitachse. Ein Tipp auf
sie tut deshalb nichts, und der Hinweis „Antippen für die große Ansicht"
verschwindet, solange sie steht. Ein Versprechen, das die Fläche nicht hält, ist
schlimmer als keines.

**Was das erste Aufmaß gefunden hat.** Die erste Fassung zeichnete beide Spektren
nur als Linien. Auf dem Bildschirmfoto lagen zwei helle Linien fast
deckungsgleich übereinander, und man sah weder die eine noch die andere. Der
Normalzustand ist jetzt eine gefüllte Fläche: Er ist die Form, gegen die
verglichen wird, und muss auch da zu sehen sein, wo nichts abweicht.

`wow` tippt in Fall C auf „Iris" und prüft vier Dinge: dass die runde Ansicht
kommt, dass sie **gezeichnet** ist (gezählte Bildpunkte, nicht Maße), dass das
flache Spektrogramm nicht darunter stehen bleibt, und dass der Hinweis auf die
große Ansicht verschwunden ist. Absichtlich falsifiziert:

```
✗ Fall C: die Iris ist leer — eine Leinwand mit Maßen ist kein Bild
```

### S5c — Eine Stelle herausgreifen und hören (22.08.2026)

Der Auftraggeber: „Jetzt im Moment sehe ich direkt das zweidimensionale
Spektrum, aber ich kann da bestimmte Stellen nicht herausnehmen — diese Funktion
fehlt noch. … Würde auch ganz gerne, dass ich dieses Spektrogramm eben auch
vorspielen lassen kann. Fände das schon gut, wenn das direkt auf dieser oberen
Ebene machbar und sichtbar ist."

**Es gab das schon — eine Etage tiefer.** In der Hör-Lupe steckt ein
vollständiges Werkzeug (`SpectrogramSelectionPanel`) mit eigener Quellenwahl,
Maßstabsschaltern und aufklappbarem Rahmen. Es dorthin zu kopieren hätte auf der
Maschinenseite ein zweites Bild mit zweiten Reitern über das erste gelegt.

**Deshalb ist es hier keine Werkzeugkiste, sondern eine Geste:**

> **Tipp** heißt Gebirge. **Zug** heißt Auswahl.

Dieselbe Fläche, zwei Absichten, die man nicht verwechseln kann — und die man
auch technisch nicht verwechseln darf. Ab 10 px Wegstrecke gilt es als Zug; ein
Zug unterdrückt anschließend den Klick, sonst öffnete jedes aufgezogene Rechteck
danach das Gebirge.

Unter dem Bild erscheint dann eine Zeile: **„▶ Auswahl hören"**, daneben der
Bereich in Klartext — `2,0–7,0 s · 96 Hz–2,5 kHz` — und ein ✕, das sie aufhebt.

**Gespielt wird, was man sieht.** Steht „Messung" im Bild, hört man den
Ausschnitt der Messung; steht „Unterschied" darin, den des Unterschieds. Etwas
anderes zu spielen als das Gezeigte wäre die eine Verwechslung, die dieses
Werkzeug nicht machen darf — das Bild ist der Beleg für das Gehörte. Der
Rahmen bleibt beim Quellenwechsel stehen: Dieselbe Stelle, andere Aufnahme.

In der Iris gibt es keine Auswahl: Sie hat keine Zeitachse.

### Was `wow` davon misst

Die ganze Kette, mit echten Zeigerereignissen statt gesetzter Zustände — ob Tipp
und Zug auseinandergehalten werden, ist ja genau die Frage:

```
Zug auf dem Bild            Rahmen steht
Bereich                     2.0–7.0 s · 96 Hz–2,5 kHz
ein Tipp spielt die Auswahl ■ Stoppen
```

Geprüft wird: Der Rahmen steht und hat Fläche; die Zeile darunter ist da; sie
nennt Zeit **und** Frequenz; das Gebirge ist **nicht** aufgegangen; und ein Tipp
auf „Auswahl hören" schaltet den Knopf auf „Stoppen".

Absichtlich falsifiziert, indem die Zug-Sperre entfernt wurde:

```
✗ Fall C: ein Zug über das Bild hinterlässt keinen Auswahlrahmen
✗ Fall C: der Zug wurde als Tipp gewertet — das Gebirge steht, statt eine Auswahl zu bestehen
```

### Eine Korrektur an der Einordnung aus §S5

Im Konzept stand die Auswahl unter **Profi**. Das war falsch gedacht: Der
Auftraggeber hat sie ausdrücklich als etwas benannt, das ihm auf der *oberen*
Ebene fehlt. Ein Ausschnitt aufziehen und anhören ist der Kern eines
akustischen Werkzeugs, nicht sein Zubehör.

Unter Profi bleibt deshalb das **tiefe** Werkzeug in der Hör-Lupe — mit
Maßstabsvergleich, Quellenwahl und Teilen. Die Geste auf dem Bildplatz gehört zu
**Basis**.

### S5b-Nachtrag — Die Iris bekommt ihre Farbe zurück (22.08.2026)

Der Auftraggeber, nach dem ersten Blick auf die neue Iris: „Schau da noch mal
nach. Bei Zanobo haben wir da noch Farben — Farbe für die Stärke der Frequenz,
und zwar kalt, wenn es leise ist, und rot, wenn die Frequenz stark ausgeprägt
ist. Jetzt sehe ich hier unter der Iris eigentlich nur den Pfad oder eine Linie
im Kreis."

**Er hat recht, und der Verlust war hausgemacht.** Die alte Einzel-Iris
(`renderMachineFingerprint`) färbt jeden Sektor nach der Stärke seines Bandes.
Der neue Vergleich zeichnete stattdessen zwei Linien und färbte nur den
Zwischenraum nach Richtung. Damit war die Form zu sehen — aber nicht mehr, **wo**
die Maschine laut ist. Genau die Auskunft, für die es die Iris gibt.

**Jetzt:** Der Körper ist die Messung, Sektor für Sektor nach Stärke eingefärbt.
Darüber liegt der Normalzustand als weiße gestrichelte Umrisslinie.

**Warum `turboColor` und nicht die alte Skala.** Die Einzel-Iris hat eine eigene
Rampe (blau → grün → braun). Im Bildplatz liegen aber Spektrogramm, Gebirge und
Iris nebeneinander, einen Reiter voneinander entfernt — zwei Stärkeskalen im
selben Bild wären zwei Antworten auf dieselbe Frage. `turboColor` ist die Skala,
die dort schon gilt, und sie ist genau die, die der Auftraggeber beschrieben
hat: kalt für leise, rot für stark.

**Und nur EINE Farbbedeutung.** Die Richtungsfarbe des Zwischenraums ist damit
weg. Zwei Farbsprachen in einem Kreis heißt, beim Hinsehen nicht zu wissen,
welche gerade gilt. Die Richtung liest man jetzt an der Form: Wo Farbe über die
weiße Linie hinausragt, ist es lauter geworden; wo die Linie außen liegt,
leiser. In Farbe gibt es die Richtung eine Quelle weiter, unter „Unterschied".

**Eine Legende, weil eine weiße gestrichelte Linie sonst ein Rätsel ist.** Unter
dem Bild steht in der Iris: „Farbe = Stärke der Frequenz · weiße Linie =
Normalzustand". Sie steht in derselben Zeile, die sonst die Ziehgeste erklärt —
gleiche Höhe, damit der Bildplatz nicht wandert.

`wow` prüft jetzt nicht mehr nur, DASS die Iris gemalt ist, sondern dass sie
**kalte und warme** Bildpunkte enthält. Eine einfarbige Fläche oder eine bloße
Linie fällt damit auf. Absichtlich falsifiziert:

```
✗ Fall C: die Iris zeigt keine Stärke — kalt für leise, rot für stark fehlt im Bild
```

### S5d — Zwei Stufen hinter dem Scharnier (22.08.2026)

Der Auftraggeber: „Auch die Funktion, dass oben Basis und Experte — dass man das
immer noch sehen kann, dahin und her schalten kann. Es macht auch Sinn, die
Funktionen darunter in Basis und Experten zu unterscheiden."

**Gemessen, bevor gebaut wurde** (Handy und Schreibtisch, Standort- wie
Maschinenebene):

```
schalter:       unsichtbar
schalterOrt:    mobile-topnav (Handy) / sidebar (Schreibtisch)
leiste:         unsichtbar
☰ von dort:     schließt die Tiefe   → man landet auf der Karte
```

Der Schalter war hinter dem Scharnier **gar nicht erreichbar**. Er lag im
Kopfstreifen beziehungsweise in der Seitenleiste, und beide liegen in `#app`,
das dort auf `visibility: hidden` ruht. „☰" half nicht: Es schloss die Tiefe.
Wer die Ansichtstiefe umstellen wollte, musste die Maschine verlassen und
danach den ganzen Weg zurückgehen.

### Drei Änderungen, eine Idee

Die Idee: **Es bleibt derselbe Schalter am selben Ort — die Leiste kommt zu
ihm.**

1. **„☰" zieht die Leiste auf, auch hinter dem Scharnier.** Sie legt sich über
   die Tiefe; die Tiefe bleibt stehen. Wer die Leiste zuzieht, steht wieder da,
   wo er war. Zurück auf die Karte führt weiterhin der Rückweg im Inhalt — der
   gehört dem Inhalt, nicht der Navigation.
2. **Der Schalter zieht mit um.** `reiterUmhaengen()` bekommt einen dritten
   Fall: Ist die Tiefe offen, gehört er in die Leiste — auch unterwegs, wo er
   sonst im Kopfstreifen liegt. Umgehängt, nicht verdoppelt: Zwei Schalter für
   eine Stufe wären zwei Wahrheiten.
3. **Beim Betreten der Tiefe tritt die Navigation zur Seite.** Am Schreibtisch
   stand die Leiste sonst offen und legte sich über die Arbeitsfläche — 400 px
   über einer Maschinenseite, die 1120 px breit mittig steht. Über der Karte ist
   das richtig, die kann man darunter weiterschieben; über einer Arbeitsfläche
   ist es eine Verdeckung.

### Was der Aufmerksamkeitstest gefunden hat

Die erste Fassung knüpfte die Sichtbarkeit an „Leiste ist offen". Der
Aufmerksamkeitstest betritt die Tiefe aber über Klassen statt über den Weg —
dabei blieb `blattOffen` am Schreibtisch stehen, und die Leiste legte sich
ungefragt über die Arbeitsfläche:

```
✗ desktop: Erstbild 17 > Budget 12
✗ desktop: Schritte offen 19 > Budget 16
✗ desktop: Einstellungen/Basis 32 > Budget 28
✗ desktop: Einstellungen/Experte 54 > Budget 52
```

Das war kein Fehler des Messgeräts, sondern eine Schwäche des Entwurfs: Eine
Leiste, die *zufällig* offen steht, soll nicht über einer Arbeitsfläche liegen.
Jetzt entsteht die Absicht genau an einer Stelle — beim Tipp auf „☰" — und trägt
einen eigenen Namen (`leiste-ueber-tiefe`). Ohne diese Absicht ruht die Leiste.

### Die Einordnung

*Basis* ist alles, was die Frage „klingt sie anders?" beantwortet: Prüfen,
Normalzustand aufnehmen, der Bildplatz mit seinen vier Quellen, ein Tipp aufs
Gebirge, die Auswahl-Geste mit Abspielen, Unterschied anhören, Verlauf, die
Runde, das Geräusch-Briefing.

*Profi* sind die Werkzeuge zum Sezieren. In diesem Schnitt umgestellt:

| | vorher | jetzt |
|---|---|---|
| Bearbeitete Hörhilfe (Deutlich/Stark) | immer | **Profi** |
| Tiefe Auswahl mit Maßstabsvergleich und Teilen | immer | **Profi** |

Beides ist bearbeitetes Material, dessen Verstärkung man verstehen muss, um es
nicht für die Aufnahme zu halten. Wer es sucht, findet es; wer es nicht sucht,
wird nicht von ihm befragt. Das Gebirge bleibt ausdrücklich in Basis.

### Der Wächter

`wow` geht den Weg jetzt ganz: Es misst in Fall A auf **Basis**, dass die beiden
Profi-Werkzeuge nicht zu sehen sind, tippt dann auf „☰", prüft, dass der
Schalter dasteht (44 px) und die Tiefe **offen bleibt**, drückt „Profi" und
misst noch einmal — jetzt müssen beide da sein.

Gefragt wird nach **Sichtbarkeit**, nicht nach Anwesenheit: Die Stufe versteckt
per `display: none`, und ein `querySelectorAll` findet solche Elemente weiter.
Ein Wächter, der sie zählt, misst den Baum statt der Oberfläche.

Absichtlich falsifiziert, indem „☰" wieder die Tiefe schloss:

```
✗ S5d: „☰" wirft aus der Tiefe heraus — die Leiste soll sich darüberlegen, nicht die Arbeit beenden
✗ S5d: der Stufenschalter ist 40 px hoch
✗ Fall A/Profi: die Hervorhebung zeigt 0 Stufen statt Originalmessung, Deutlich und Stark
✗ Fall A/Profi: die tiefe Auswahl fehlt, obwohl Profi eingeschaltet ist
```

Dabei fiel zum vierten Mal derselbe Mangel am Messgerät auf: Der Lauf **starb**,
statt zu berichten — die Klicks nach der Stufenumschaltung liefen in einen
Zeitablauf, und alle Befunde davor gingen verloren. Sie sind jetzt geduldig
(`.catch`), und der falsifizierte Lauf meldet elf Befunde, statt abzustürzen.

### Ein Stamm-Test, der eine Zeichenzahl für eine Regel hielt

`gesichter.test.ts` las die ersten **700 Zeichen** von `reiterUmhaengen()` und
suchte darin `topnav.appendChild(tiefe)`. Der dritte Fall samt Begründung schob
den Aufruf hinter die Grenze — der Test schlug an, obwohl sich am Verhalten
nichts geändert hatte. Er liest jetzt die ganze Funktion. Eine Zeichenzahl ist
keine Regel; gemeint war „in dieser Funktion".

### S5e — Was in die Leiste gehört (22.08.2026)

Der Auftraggeber: „Darüber hinaus hätte ich gern, dass das Konzept Seitenleiste
auch hier Verwendung findet — 1:1 von TourFuchs beziehungsweise das, was
oberhalb des Standorts schon existiert — und dass man überlegt, welche Funktion
man da hineinlegt. Einstellungen finde ich wichtig, wenn man etwas einstellen
möchte."

**Die Leiste steht seit §S5d hinter dem Scharnier** — dieselbe wie davor,
nicht nachgebaut. Bleibt die zweite Hälfte der Frage: Was gehört hinein?

**Gemessen, was sie dort anbietet** (Handy, Tiefe offen, nach „☰"):

```
inDerLeiste: [ 'Entfernen', '🌱 Basis', '🛠️ Profi', 'Hell · Standard · Satellit' ]
```

| | gehört hinein? | |
|---|---|---|
| Ansichtstiefe (Basis/Profi) | **ja** | gilt für die ganze Anwendung, auch für das darunter |
| Beispieldaten-Hinweis | **ja** | eine stehende Auskunft, überall gültig |
| Reiter (Standorte/Filter) | **ja** | der Weg zurück auf die Karte; sie schließen die Tiefe (§S5d) |
| Kartenstil | **nein** | eine Bedienung für eine Karte, die man dort nicht sieht |
| Einstellungen | **schon da** | ⓘ in der Kopfleiste, in jedem Zustand sichtbar gemessen |

**Der Kartenstil ist verschwunden**, solange die Tiefe offen ist. Er bleibt im
Baum stehen — `reiterUmhaengen()` hängt den Stufenschalter davor ein —, aber er
zeigt sich nicht.

**Einstellungen bekommen keinen zweiten Eingang.** Das war der naheliegende
Griff, und er wäre falsch gewesen: Gemessen ist `#btn-info` in **jedem** Zustand
sichtbar — vor dem Scharnier, auf der Standortebene, auf der Maschinenebene,
Handy wie Schreibtisch. Ein Eintrag in der Leiste wäre eine zweite Tür in
denselben Raum. Dieselbe Regel, die den Rückweg und den Stufenschalter
verschiebt statt sie zu verdoppeln, gilt auch hier.

`wow` prüft mit demselben ☰-Schritt wie §S5d, dass der Kartenstil hinter dem
Scharnier **nicht** zu sehen ist. Absichtlich falsifiziert:

```
✗ S5e: die Leiste bietet hinter dem Scharnier den Kartenstil an — eine Bedienung
  für eine Karte, die man dort nicht sieht
```

### Was aus diesem Auftrag NICHT gebaut wurde

Der Auftraggeber nannte als Beispiel für eine Einstellung: „ein anderes
Auswertungstool statt Gemini, zum Beispiel Kognitive". Eine solche Wahl gibt es
nicht — die Anwendung hat keine Anbindung an Gemini oder ein anderes externes
Werkzeug; die Auswertung läuft vollständig im Gerät (GMIA, `core/ml`). Es ist
also keine Frage der Platzierung, sondern ein eigenes Vorhaben. Es steht hier
als offener Punkt und nicht als erfundene Einstellung: Ein Auswahlfeld, hinter
dem nichts liegt, wäre ein Versprechen ohne Gegenstand.

### S5f — Der Rahmen bleibt stehen (22.08.2026, Korrektur zu S5d/S5e)

Der Auftraggeber, auf ein Bildschirmfoto der Maschinenseite: „Oben sehe ich
immer noch nicht dieses Hin- und Herschalten zwischen Basis und Profi. Das
sollte eigentlich da sein, auch darunterliegend. Und auch, wenn man tiefer in
die ganze Auswertung geht — die Sidebar unten, die fehlt hier an dieser Stelle.
Die hätte ich auch noch gerne."

**Er hat recht, und §S5d hat die Frage falsch beantwortet.** Dort stand: „er
will den Schalter erreichen können" — und die Antwort war eine Leiste, die man
mit „☰" über die Tiefe holt. Gemeint war: **sehen**. Ein Schalter hinter einem
Tipp ist kein sichtbarer Schalter.

### Die Tiefe ist eine Scheibe, keine Decke

Bis hierher legte sich die Tiefe über alles außer der Kopfleiste; Kopfstreifen,
Blatt und Seitenleiste ruhten auf `visibility: hidden`. Jetzt ruhen sie nicht
mehr, und die Tiefe liegt **zwischen ihren Kanten** — genau dort, wo sonst die
Karte liegt:

```
Handy, Maschinenebene (390 × 844)
  Kopfstreifen   y = 52 … 107   🌱 Basis · 🛠️ Profi
  Tiefe          y = 107 … 744
  Blatt          ab y = 744     (Guckhöhe)
```

Auf dem Schreibtisch schiebt die offene Leiste die Tiefe nach rechts, statt sich
über sie zu legen — auch das wie bei der Karte.

**Gemessen auf jeder Ebene, ohne einen einzigen Tipp:** Kopfstreifen sichtbar
(390 × 55), Schalter sichtbar (370 × 40), Blatt sichtbar. Vorher: dreimal
`unsichtbar`.

### Was dabei zurückgenommen wurde

Aus §S5d fallen der dritte Fall in `reiterUmhaengen()` (der Schalter bleibt, wo
er unterwegs immer steht), das Zur-Seite-Treten der Leiste beim Betreten der
Tiefe und die Klasse `leiste-ueber-tiefe`. Sie waren Antworten auf ein Problem,
das es nicht mehr gibt. Was bleibt: „☰" zieht die Leiste auf, ohne die Tiefe zu
schließen, und ein Reiter ist ein Ortswechsel.

### Zwei Fehler auf dem Weg

**Eine Marke, am falschen Ort gelesen.** Die erste Fassung setzte die drei Maße
aus JavaScript und las `--mobile-sheet-peek` am `html`. Dort gilt 46 px — die
100 px des Beispieldatenbetriebs stehen an `body.demo-data-active`. Gemessen
ragte die Tiefe dadurch **54 px unter das Blatt**, und der Weg zur Hör-Lupe lag
darunter begraben; `wow` meldete prompt „der Weg zur Hör-Lupe führt nicht zur
Hör-Lupe". Eine Marke muss man dort lesen, wo sie gilt.

**Ein Rahmen, der vom Ereignis abhing.** Die Maße aus JavaScript zu setzen hieß:
Wer die Tiefe öffnet, ohne das Ereignis auszulösen, bekommt keinen Rahmen. Genau
das tut `attention-check` — und meldete daraufhin, die Tür gehe nicht mehr zu
(auf dem Schreibtisch verdeckte die Leiste den Rückweg). Jetzt steht alles in
CSS, mit den beiden Gesichtsabfragen wortgleich. Die einzige Zahl darin ist die
Höhe des Kopfstreifens, und die bewacht `attention-check` ohnehin.

### Die Budgets, angehoben mit Begründung

Der Rahmen zählt jetzt mit. Die Zahlen sind nicht bis zum Grün geschoben,
sondern um genau das, was er mitbringt:

| | vorher | jetzt | |
|---|---|---|---|
| Erstbild | 12 | **16** | Handy +1 (die Pille), Schreibtisch +4 (Pille, zwei Reiter, „Entfernen") |
| Schritte offen | 16 | **18** | |
| Einstellungen/Basis | 28 | **31** | |
| Einstellungen/Experte | 52 | **53** | |

### Der Wächter

`wow` misst in Fall A ohne jeden Tipp: Steht der Schalter da? Beginnt die Tiefe
**unter** dem Kopfstreifen (sonst scrollt ihr Inhalt unter der Pille durch)?
Endet sie **über** dem Blatt? Absichtlich falsifiziert, indem der Rahmen wieder
zur Ruhe gelegt wurde:

```
✗ S5d: der Basis/Profi-Schalter ist hinter dem Scharnier nicht zu sehen — er soll
  dastehen, nicht in einem Tipp liegen
✗ S5d: der Stufenschalter ist 0 px hoch
```

### S6 — Ein Ergebnis, ein Ort (22.08.2026)

Seit §S3 zeigt die Maschinenebene das Ergebnis einer Prüfung: in Alltagssprache,
mit dem Bildplatz und der Hör-Lupe. Daneben stand die ganze Zeit der alte
Ergebnisdialog — dieselbe Prüfung, zwei Darstellungen, und nur eine davon
bewacht.

**Die Weiche stand in `3-Diagnose`:**

```ts
if (gehoertDerMaschinenebene(this.machine.id)) …  // neue Ebene
else this.showResults(diagnosis);                  // alter Dialog
```

Wer über die Maschinenebene hereinkam, sah das Neue; wer über die
**Bestandsliste** kam, den alten Dialog mit Tacho und „HEALTHY". Das war beim
Bau von §S3 als Zwischenschritt ausdrücklich so entschieden — „ihn in einem Zug
mit umzubauen hieße, zwei Dinge auf einmal zu ändern". Dieser Schnitt holt es
nach.

**Die Weiche ist weg.** Eine Prüfung betrifft genau eine Maschine, und ihr
Ergebnis gehört auf die Seite dieser Maschine — gleich, wo man losgegangen ist.
Mit ihr entfallen der Merker `pruefungAngemeldet()` und die Frage
`gehoertDerMaschinenebene()`: Wenn es nur einen Ort gibt, braucht niemand mehr
zu wissen, wer gestartet hat.

### Die eine Ausnahme, und warum sie keine ist

Der **Flottenlauf** prüft eine Reihe von Maschinen und schaltet sich nach
1,5 Sekunden selbst weiter. Ihn nach jeder Maschine auf eine Maschinenseite zu
führen, unterbräche genau das, was er ist. Er behält deshalb den kurzen Dialog.

Das ist keine Ausnahme vom Ort, sondern eine andere Sache: Der Flottenlauf ist
kein Blick auf **eine** Prüfung, sondern ein Durchlauf durch viele. Sein
Ergebnis ist die Zusammenfassung am Ende, nicht das Bild dazwischen.

Gesagt wird es ausdrücklich — `router` → `diagnosePhase.setFlottenlauf(…)` —
und nicht aus dem Vorhandensein eines Rückrufs erraten. Der Router weiß es,
also sagt er es.

**Der Schnellvergleich** bleibt ebenfalls unberührt: Er vergleicht mehrere
Maschinen miteinander und zeigt eine Liste. Das ist von vornherein kein
Prüfergebnis, sondern eine Gegenüberstellung.

### Was der Durchlauf jetzt misst

`durchlauf` geht ab Schritt 8 genau den Weg, um den es geht: **über die
Bestandsliste**, nicht über die Maschinenebene. Zwei neue Schritte am Ende:

```
✓ 15. Ergebnis steht auf der Maschinenseite  →  Die Messung klingt wie der Normalzustand.
✓ 16. der alte Ergebnisdialog bleibt zu      →  zu
```

Beides, nicht nur eines: Nur zu prüfen, dass der alte Dialog zubleibt, hieße ein
Verschwinden zu messen statt eines Orts. Absichtlich falsifiziert, indem die
alte Verzweigung wiederhergestellt wurde:

```
✗ 15. Ergebnis steht auf der Maschinenseite  →  nicht auf der Maschinenebene
✗ 16. der alte Ergebnisdialog bleibt zu      →  er steht offen
```

### Was der alte Dialog noch trägt

`showResults()` bleibt im Code — für den Flottenlauf. Er verschwindet, wenn auch
die Reihe ihre eigene Form bekommt; bis dahin ist er kein toter Code, sondern
der Weg einer anderen Sache.

### S7 — Auch das Gebirge wandert nicht (22.08.2026)

Der Auftraggeber, auf ein Bildschirmfoto der 3D-Ansicht: „Jede
Kommentarzumessung kommt immer noch oberhalb von diesem 3D-Gebirge, und deswegen
verschiebt sich das. Nun ist ein Vergleich ziemlich schlecht."

**Derselbe Fehler wie §S5a, eine Etage tiefer.** Im `Spectrogram3DPanel` stand:

```ts
root.appendChild(row);                     // Knopfzeile: Quellen, Maßstab, Zeit
root.appendChild(this.strength.element);   // „STÄRKE DER AKUSTISCHEN ABWEICHUNG"
root.appendChild(this.host);               // das Gebirge
```

Die Stärkeanzeige steht nur beim **Unterschied** — bei Messung und
Normalzustand ist sie leer. Wer zwischen den Quellen wechselt, um zu
vergleichen, verschiebt das Bild also genau dann, wenn es am meisten darauf
ankommt.

**Gemessen:**

```
Gebirge bei „Unterschied"    471 px → 659 px      = 188 px Versatz
```

Jetzt steht das Gebirge über seiner Beurteilung: Über dem Bild liegt nur noch
die Knopfzeile, und die hat in jedem Zustand dieselbe Höhe. Nachher: **471 px →
471 px**.

Damit gilt die Regel aus §S5a jetzt an beiden Orten, an denen man vergleicht:
*Was man vergleicht, bleibt stehen; was es beurteilt, steht darunter.*

### Ein Wächter, der zuerst nichts gemessen hat

Der erste Entwurf wechselte auf „die zweite Quelle" — und das war
„Normalzustand". Dort ist die Stärkeanzeige leer, genau wie bei „Messung": ein
Wechsel zwischen zwei leeren Zuständen verschiebt nichts. Der Wächter blieb
deshalb auch dann grün, als der Fehler zur Falsifikation absichtlich wieder
eingebaut war.

Erst der Wechsel auf **„Unterschied"** misst die Sache. Das ist der vierte Fall
in dieser Reihe, in dem eine Prüfung erst durch das Falsifizieren zu einer
Prüfung wurde — und der deutlichste: Sie war nicht zu lasch eingestellt, sie sah
an der falschen Stelle hin.

```
✗ Fall C: das Gebirge wandert beim Quellenwechsel um 188 px (erlaubt 2)
```

### S4j — Eine Auskunft an einer Stelle, und die Runde (22.08.2026)

Der Auftraggeber schickte ein Bildschirmfoto von „Pumpe 1" mit zwei Sätzen:
„Zuletzt 87 % · vor 3 Tagen" sei **zweimal sichtbar**, besser nur oben — und
dann „direkt rechts neben den Maschinennamen".

**Beides umgesetzt.** Der letzte Stand steht jetzt in derselben Zeile wie der
Name; bei einem langen Namen bricht die Zeile um und es steht wieder
untereinander. Dann entscheidet der Platz, nicht eine feste Regel.

**Die zweite Fundstelle war mehr als eine Dopplung.** Unter dem Klangbild stand
„Letzte Prüfung · 87 % · vor 4 Tagen". Wer in der Prüfungsreihe darunter auf
„89 % · vor 5 Tagen" tippte, bekam weiterhin das Wort **„Letzte Prüfung"** über
einer Prüfung, die nicht die letzte war. Die Beschriftung ist ersatzlos weg:
Welche Prüfung im Bild steht, sagt die hervorgehobene Kachel in der Reihe — und
die sagt es richtig. Mit ihr sind die Option `bildunterschrift`, der Schlüssel
`maschine.letztePruefung` und die Regel `.klangbild-satz` entfallen. Toter Code
wird nicht aufbewahrt, er wird später falsch wiederverwendet.

Die frei gewordenen 47 px gehen wie beim letzten Mal an das Klangbild
(`clamp(240px, 38vh, 340px)`). Ungenutzter Bildschirm in Fall C: 173 → **139 px**.

### Die Runde

Der zweite Teil des Auftrags war „weiter mit deiner Idee" — S4j, wie hier
vorgemerkt.

Ein Techniker prüft an einem Standort nicht eine Maschine, sondern Maschine für
Maschine. Bisher endete jede Prüfung an derselben Stelle: bei „Fertig", einem
Knopf, der die Seite neu zeichnet und sonst nichts. Wer weitermachen wollte,
tippte „Zum Standort", suchte in der Liste die nächste und tippte darauf — zwei
Tipps und ein Suchvorgang je Maschine, obwohl feststeht, was ohnehin drankommt.

Nach einem Ergebnis steht dort jetzt **„▸ Nächste: Kompressor 2"**.

Drei Entscheidungen dazu, alle bewusst:

- **Ein Angebot, keine Führung.** Die eine dominante Handlung bleibt, was sie
  war. Die Runde ist ein zweiter, leiserer Knopf; wer sie nicht geht, geht daran
  vorbei. Die Alternative — „Nächste Maschine" als dominante Handlung statt
  „Fertig" — wäre eleganter gewesen und hätte einen Techniker in eine Runde
  gedrängt, auf der er vielleicht gar nicht ist. Sie hätte außerdem die
  Zustandsmaschine um Standortwissen erweitert, das nicht zu ihr gehört: Sie
  urteilt über EINE Maschine.
- **Erst nach einem Ergebnis.** Vorher wäre es ein Drängen — „Nächste Maschine",
  bevor man diese geprüft hat.
- **Mit Namen.** „Weiter" ohne Ziel wäre ein Sprung ins Ungewisse. Und gibt es
  nichts Nächstes, steht dort nichts: Ein Knopf, der zur eigenen Maschine
  zurückführt, wäre eine Runde von eins.

Welche als Nächstes drankommt, entscheidet dieselbe Frage wie die Sortierung der
Standortliste: Was noch nie geprüft wurde, kommt zuerst; danach das, was am
längsten her ist; bei Gleichstand der Name, damit die Reihenfolge zwischen zwei
Besuchen dieselbe bleibt.

`wow` bewacht in Fall B, dass nach dem Ergebnis dasteht, welche Maschine als
Nächstes drankommt, und dass es **nicht** die ist, auf der man schon steht.
Beides absichtlich falsifiziert:

```
✗ Fall B: nach dem Ergebnis steht nicht, welche Maschine als Nächstes drankommt
✗ Fall B: die Runde bietet die Maschine an, auf der man schon steht — „▸ Nächste: Kompressor 1"
```

| | vor S4j | jetzt |
|---|---|---|
| „Zuletzt 87 % · vor 4 Tagen" | zweimal, eigene Zeile | **einmal, neben dem Namen** |
| Bildunterschrift bei alter Prüfung | „Letzte Prüfung" — falsch | **entfällt** |
| Höhe des Klangbilds (Handy) | 287 px | **321 px** |
| ungenutzter Bildschirm (Fall C) | 173 px | **139 px** |
| Tipps zur nächsten Maschine | 2 + Suchen in der Liste | **1, beim Namen genannt** |

**S4d — Audiodateien als Normalzustand oder Messung importieren.**
_Vorgemerkt, noch nicht umgesetzt._ Eine vorhandene Tondatei vom Smartphone,
Rekorder oder Schreibtisch soll denselben Analyseweg benutzen können wie eine
Live-Aufnahme. Die Rolle ergibt sich aus dem Einstieg: „Audiodatei verwenden"
unter „Normalzustand aufnehmen" legt nach Qualitätsprüfung einen Normalzustand
an; dieselbe Nebenhandlung unter „Prüfung starten" führt die Datei als Messung
durch Vergleich, Ergebnis und Hör-Lupe. Einzelheiten und Abnahmekriterien
stehen in §7e.

**S5 — Die Reiter füllen.** _offen._ „Standorte", „Filter" und der
Nähe-Begleiter im Karten-Reiter; Standort- und Maschinenimport.

### S8 — Die Runde endet (22.08.2026)

S4j gab der Maschinenseite ein Angebot: „▸ Nächste: Rührwerk 2". Welche das
war, entschied allein die Ablage — was am längsten nicht geprüft wurde, kommt
dran. Damit war die Runde ein halbes Ding, und ein halb gebautes ist schlechter
als ein nicht angefangenes.

**Der Befund, gemessen an einem Standort mit zwei Maschinen:**

```
Nach Maschine 2 (Rührwerk 2):
  Runde:  „▸ Nächste: Rührwerk 1"
```

Nach der letzten Maschine zeigte sie wieder auf die erste — die war ja
inzwischen die mit der ältesten Prüfung. Ein Karussell, keine Runde. Wer eine
Runde geht, erfährt nie, dass er fertig ist; er tippt „Zum Standort" und zählt
die Zeilen nach. Ein Ende, das man selbst feststellen muss, ist kein Ende.

**Was fehlte, war ein Gedächtnis.** Der Unterschied zwischen „lange nicht
geprüft" und „gerade eben von mir geprüft" steht nicht in der Ablage — er ist
eine Tatsache über DIESEN Besuch. Also steht er in
`src/stamm/maschine/runde.ts`, für die Dauer des Besuchs, und nicht in der
Datenbank: Ein „erledigt"-Feld in `machines` wäre eine Buchführung, die über
Tage weiterläuft und beim nächsten Besuch Maschinen überspringt, die niemand
geprüft hat.

Drei Entscheidungen dazu:

- **Eine Runde gehört einem Standort.** Beim Betreten eines anderen beginnt
  eine neue. Beim Betreten desselben läuft die alte weiter — sonst setzte jeder
  Wechsel zwischen Standort- und Maschinenebene sie zurück, und es gäbe sie
  nicht.
- **Sie endet mit dem Verlassen der Tiefe**, vollständig oder nicht. Wer den
  Standort verlässt, hat aufgehört, ihn durchzugehen.
- **Das Ende ist eine Auskunft, kein Erfolgsbanner.** „✓ Runde fertig — 2
  Maschinen an diesem Standort geprüft", in Textfarbe und Textgröße, ohne
  Rahmen und ohne Fläche. Wer fertig ist, braucht keine Belohnung. Und erst ab
  zwei: Eine „Runde" von einer Maschine für abgeschlossen zu erklären wäre eine
  Feier für das Aufstehen.

Die Entscheidung selbst ist rein — `naechsteInDerRunde(kandidaten, erledigt)`
kennt weder Ablage noch Browser. Elf Tests in
`src/stamm/maschine/runde.test.ts` halten sie fest, darunter der Anlass:
„endet, wenn alle dran waren".

**Der Wächter.** Was die Tests nicht sehen, ist die Verdrahtung: ob
`merkeGeprueft` beim Ergebnis wirklich gerufen wird, ob die Runde den
Ebenenwechsel überlebt, ob sie beim Verlassen endet. Dafür gibt es
`npm run runde` (`tools/runde-lauf.mjs`) — er kürzt einen Flottenstandort der
Beispieldaten auf zwei Maschinen und spielt beide vollständig durch, mit echtem
Mikrofonsignal. Er steht bewusst NICHT im Standard-Satz: zwei vollständige
Prüfungen kosten Minuten, und er gehört zu Änderungen an der Runde, nicht zu
jedem Schnitt.

Absichtlich falsifiziert, indem das Gedächtnis wieder entfernt wurde
(`naechsteInDerRunde(mitStand, new Set())`):

```
✗ DER BEFUND: nach der letzten Maschine bietet die Runde weiter an — „▸ Nächste: Rührwerk 1"
✗ das Ende steht da und nennt die Zahl — „"
```

Mit dem Gedächtnis:

```
Nach Maschine 2 (Rührwerk 2):
  Runde:  „"
  Fertig: „✓ Runde fertig — 2 Maschinen an diesem Standort geprüft"
✓ Die Runde endet.
```

| | vor S8 | jetzt |
|---|---|---|
| Angebot nach der letzten Maschine | „▸ Nächste: Rührwerk 1" — die erste wieder | **entfällt** |
| Auskunft, dass die Runde fertig ist | keine | **„✓ Runde fertig — 2 Maschinen …"** |
| Gedächtnis über den Besuch hinaus | — | **keins, mit Absicht** |

### S9 — Das Auswertungswerkzeug (23.08.2026)

Der Auftraggeber hatte sich in der Seitenleiste „Einstellungen wie z. B. ein
anderes Auswertungswerkzeug wählen statt Gemini" gewünscht. Das war blockiert:
Es gab kein Gemini im Code und auch kein anderes externes Werkzeug — nichts,
wovon man hätte wegwählen können. Am 23.08.2026 hat er die Liste genannt:
**„auswahlwerkzeuge: Claude, Chatgpt"**.

**Der eigentliche Befund lag daneben.** Das Geräusch-Briefing entsteht
vollständig im Browser — ein ZIP mit den Aufnahmen und ein Arbeitsauftrag in
der Zwischenablage. Der Erfolgsbildschirm endete dort, mit zwei Knöpfen:
„Nochmal kopieren" und „Fertig". Keiner führte irgendwohin. Wer das Briefing
erzeugt hatte, musste selbst einen Tab öffnen, sich an den Namen einer KI
erinnern, sie ansteuern, einfügen und die ZIP-Datei aus dem Download-Ordner
anhängen. Der letzte Schritt einer Funktion, die es genau für diesen Schritt
gibt, war der einzige ohne Weg.

Die Wahl des Werkzeugs ist deshalb nicht nur eine Einstellung geworden,
sondern vor allem eine **Tür**: Am Ende des Briefings steht jetzt
„**In Claude öffnen**", darunter in einem Satz, was dort zu tun ist
(„Dort einfügen und die heruntergeladene ZIP-Datei anhängen. SoundFuchs lädt
nichts hoch."), und darunter leise „Stattdessen ChatGPT benutzen".

Vier Entscheidungen, alle bewusst:

- **Keine Schnittstelle.** Die naheliegende Erwartung an „Auswertungswerkzeug
  wählen" wäre, dass die App das Briefing selbst hinschickt und die Antwort
  anzeigt. Das hieße: Zugangsschlüssel im Browser, Audio auf fremde Server,
  und ein Datenschutzversprechen („Das Briefing wurde lokal erzeugt.
  SoundFuchs hat nichts hochgeladen."), das dann nicht mehr stimmt. Ein
  Werkzeug ist hier ein **Name und eine Adresse**, mehr nicht.
- **Kein Vorausfüllen.** Der Arbeitsauftrag ist über tausend Zeichen lang und
  wäre in einer Adresszeile ein Glücksspiel; die ZIP-Datei kann ohnehin nur
  der Nutzer anhängen. Der Knopf öffnet ein leeres Gespräch — `claude.ai/new`,
  nicht die Startseite: Wer mit einem Auftrag in der Zwischenablage ankommt,
  will ein leeres Eingabefeld und nicht das Gespräch von gestern.
- **Der Wechsel steht an der Tür, nicht nur in den Einstellungen.** Wer dort
  tippt, wählt für dieses Mal UND für das nächste. Eine Wahl, die man an der
  Tür trifft und die dann vergessen wird, müsste man jedes Mal neu treffen.
- **Die Einstellung steht auf Basis.** Sie ist keine Feineinstellung der
  Messung, sondern die Entscheidung, an wen man das Geräusch weitergibt. Läge
  sie auf Profi, stünde am Ende des Briefings ein Werkzeug, das man nicht
  wechseln kann, ohne vorher eine Stufe zu finden, von der man nicht weiß,
  dass es sie gibt. `attention-check` bewacht das.

Die Liste steht an **einer** Stelle (`src/stamm/einstellungen/werkzeug.ts`) und
nicht auch noch im Dialog — zwei Listen wären zwei Stellen, an denen ein
drittes Werkzeug fehlen kann. 14 Tests halten fest, was die Oberfläche
voraussetzt: dass eine fehlende Merkung eine Vorgabe ergibt, dass eine
unbekannte Kennung gar nicht erst gespeichert wird, und dass eine Ablage, die
wirft oder fehlt, den Weg zur Tür nicht versperrt.

**Der Wächter.** `wow` öffnet in Fall C das Briefing, erzeugt das Paket und
misst den Erfolgsbildschirm: den Namen des Knopfes, den Satz darunter, den
leisen Wechsel, die Zahl der dominanten Handlungen — und **wohin der Knopf
führt**. Gemessen wird dabei die Adresse, die das Produkt dem Browser übergibt,
nicht der geladene Tab: Der erste Versuch fing das neue Fenster ab und las
dessen `url()`. Das maß zwei Dinge auf einmal — unsere Adresse und die
Erreichbarkeit von claude.ai. Im abgeschotteten Lauf gibt es keine Route nach
draußen; der Tab ging auf und blieb ohne Adresse, und der Wächter meldete
„führt nirgendwohin", obwohl die Tür stand.

Zweimal absichtlich falsifiziert. Mit einer falschen Adresse:

```
✗ Briefing: der Knopf führt nach „https://example.invalid/" statt zum gewählten Werkzeug
```

Und ohne die Tür überhaupt:

```
✗ Briefing: am Ende steht kein Weg zum gewählten Werkzeug — „"
✗ Briefing: der Knopf führt nach „nirgendwohin" statt zum gewählten Werkzeug
✗ Briefing: kein leiser Wechsel zum anderen Werkzeug — „"
✗ Briefing: der Knopf sagt nicht, was am Ziel zu tun ist — einfügen und das ZIP anhängen
✗ Briefing: 0 dominante Handlungen auf dem Erfolgsbildschirm statt genau einer
```

|                                     | vor S9                        | jetzt                             |
| ----------------------------------- | ----------------------------- | --------------------------------- |
| Ende des Briefings                  | „Nochmal kopieren" · „Fertig" | **„In Claude öffnen"**            |
| Weg zum Werkzeug                    | keiner                        | **ein Tipp, ins leere Gespräch**  |
| Wahl des Werkzeugs                  | keine                         | **Claude / ChatGPT, gemerkt**     |
| Bedienelemente in den Einstellungen | 31 / 53                       | **32 / 54** (+1, das Auswahlfeld) |
| Hochgeladen wird                    | nichts                        | **weiterhin nichts**              |

### S10 — Die Reihe (23.08.2026)

Nach S6 hat jede **einzelne** Prüfung genau einen Ergebnisort. Eine **Reihe**
hatte gar keinen — und, wie sich beim Nachmessen zeigte, nicht einmal einen
Eingang.

**Zwei Befunde, gemessen am 23.08.2026.**

Der erste stand auf der Standortseite:

```
Angebote am Standort      ➕ Neue Maschine anlegen
Weg in die Reihe          FEHLT
```

Der Flottenlauf lag hinter der Bestandsebene, und die öffnete sich nur, wenn
man eine Maschine anlegen wollte. Die eine Funktion, die „welche dieser vier
fällt auf?" beantwortet, war an dem Ort, an dem diese vier stehen, nicht
startbar.

Der zweite stand am Ende des Laufs:

```
Banner        Flottencheck abgeschlossen
Kennzahlen    100% Median · 0% Spannweite · 100% Schlechteste
Satz          FEHLT
Knöpfe        📊 Verlauf · 📄 Bericht · Weiter · ✅ Ergebnisse speichern · 🗑 Verwerfen
```

Eine Armaturentafel statt einer Auskunft: Sie sagt nicht, was der Techniker
wissen will, sondern woraus man es ausrechnen könnte. Und drei der fünf Knöpfe
taten dasselbe — „Speichern" speicherte nichts (die Ergebnisse liegen längst in
der Ablage), „Weiter" schloss ebenfalls, das × zum dritten Mal.

#### Die Reihe ist nicht die Runde

Die naheliegende Vermutung war, dass Flottenlauf und Runde (§S8) dasselbe sind
— beide gehen die Maschinen eines Standorts durch. Sie sind es nicht:

- Die **Runde** fragt „war ich überall?" und beantwortet je Maschine „klingt
  sie wie ihr eigener Normalzustand?".
- Die **Reihe** fragt „**welche von diesen fällt auf?**" — und vergleicht dafür
  nicht die Maschinen miteinander, sondern ihre **Abstände zum jeweils eigenen
  Normalzustand**.

Der Unterschied entscheidet über den Satz. „Rührwerk 3 klingt anders als die
anderen" wäre falsch: Es darf bauartbedingt anders klingen und trotzdem völlig
unverändert sein. Richtig ist „Rührwerk 3 fällt aus der Reihe — es weicht
stärker von seinem eigenen Normalzustand ab als die anderen." Und wie überall:
nie eine Ursache.

#### Was gebaut wurde

**Der Weg hinein.** Stehen an einem Standort mehrere gleichartige Maschinen mit
Normalzustand, steht dort jetzt „⇄ Rührwerk: 2 Maschinen vergleichen" — unter
der Liste, über „Neue Maschine anlegen", ungefüllt. Die Liste bleibt die
Handlung dieser Ebene; die Reihe ist ein Angebot daneben. Der Ort wird aus dem
Flottennamen gestrichen („Rührwerk · Windbergen" → „Rührwerk"): Man steht
gerade dort.

**Der Satz.** An der Stelle, an der Banner und Kacheln standen, mit dem Beleg
darunter — dieselbe Rangfolge wie im Ergebnis einer einzelnen Maschine. Kein
Ampelgrün und kein Warndreieck, nur ein Streifen an der Kante in der Farbe, die
`standortmarker.ts` für diesen Zustand ohnehin führt. Eine zweite Definition in
CSS wäre eine zweite Stelle, an der dieselbe Farbe auseinanderlaufen kann.

**Vier Knöpfe statt fünf.** Einer hinaus, zwei, die etwas mit dem Ergebnis tun,
einer, der es wegwirft — und „Fertig" führt zurück auf den Standort, von dem
die Reihe ausging, nicht in die Bestandsliste.

#### Der Fund beim Falsifizieren

Ich habe einen Ausreißer erzwungen — **und er erschien nicht.**

Das war kein Fehler der Falsifikation, sondern Arithmetik: Bei genau zwei
Werten liegt der Median zwischen ihnen, beide weichen gleich weit ab, und
`Median − 2·MAD` fällt unter beide. **Bei zwei Maschinen kann nie eine
auffallen.** „Keine fällt aus der Reihe" wäre dort ein wahrer Satz, der nichts
gemessen hat — und bei 40 % gegen 92 % legte er das Gegenteil dessen nahe, was
dasteht.

Der Befund sagt jetzt selbst, ob er etwas sagen kann:

```
Satz          Für einen Vergleich braucht es mindestens 3 geprüfte Maschinen.
was das heißt Bei zweien sagt der Vergleich nicht, welche der beiden abweicht —
              jede steht auf ihrer eigenen Seite mit ihrem eigenen Ergebnis.
Beleg         Rührwerk · Windbergen · 2 von 2 geprüft · Ähnlichkeit 100–100 %
```

Eine zweite Grenze steht ebenfalls als Test fest: Weicht die **Hälfte** der
Reihe ab, findet das Verfahren niemanden (`[92, 91, 55, 40]` → Median 73,
MAD 18,5, Schwelle 36). Auch das ist keine Panne, sondern die Aussage des
Verfahrens: „Fällt eine aus der Reihe?" ist eine andere Frage als „Geht es
dieser Reihe gut?". Die zweite beantwortet die Standortliste, Maschine für
Maschine.

#### Der Wächter

`npm run reihe` (`tools/reihe-lauf.mjs`) kürzt einen Flottenstandort der
Beispieldaten auf zwei Maschinen, nimmt für beide einen Normalzustand auf,
startet die Reihe über den neuen Weg und liest, was am Ende dasteht. Wie
`runde` steht er nicht im Standard-Satz — er kostet Minuten.

Falsifiziert, indem der Weg hinein und der Zweierfall wieder entfernt wurden:

```
✗ am Standort führt kein Weg in die Reihe — die Funktion, die „welche fällt auf?"
  beantwortet, ist dort nicht startbar
✗ die Zweierreihe behauptet ein Ergebnis, das sie nicht haben kann —
  „Keine der 2 geprüften Maschinen fällt aus der Reihe."
```

**Drei Fehler lagen dabei am Messgerät, nicht am Produkt** — alle derselbe:
Die Standortansicht bleibt im Baum stehen, wenn die Maschinenseite darüber
liegt. Der Wächter zählte ihre verborgenen Zeilen, glaubte sich auf dem
Standort, tippte ins Leere und meldete „nur 1 von 2", als läge es an der App.
Gefragt wird jetzt nach **Sichtbarkeit** — der einzigen Eigenschaft, die für
einen Menschen den Unterschied macht.

| | vor S10 | jetzt |
|---|---|---|
| Weg in die Reihe am Standort | **keiner** | „⇄ Rührwerk: 2 Maschinen vergleichen" (48 px) |
| Aussage am Ende | Banner + 3 Kennzahlkacheln | **ein Satz, Beleg darunter** |
| Knöpfe am Ende | 5, drei davon dasselbe | **4, genau eine dominante Handlung** |
| „Fertig" führt nach | Bestandsliste | **zurück auf den Standort** |
| Zweierreihe | „Keine fällt aus der Reihe" | **„Dafür braucht es mindestens 3"** |

### S11 — Die Analyse liegt im Blatt (23.08.2026, §7g umgesetzt)

Der Vorschlag stand in §7g, geprüft und gemessen. Hier steht, was beim Bauen
dazukam — und das war mehr als erwartet.

#### Drei Fehler, die keiner sehen konnte

**1. Unterwegs hatte das Blatt gar keine Reiter.** §7g maß „Reiter im Blatt:
📄 Standorte · Filter, Inhalt leer" — das war die Wahrheit über den Baum, nicht
über den Bildschirm. Auf dem Handy blendet der Stamm die ganze Leiste aus:

```
responsive.css:509   .sidebar .tabs { display: none; }
„Ein Bereich braucht keine Reiterleiste: Mobil gibt es nur die Tour."
```

Für TourFuchs stimmt das — dort hat das Blatt unterwegs einen Inhalt. Hinter
dem Scharnier hat es drei. Gemessen: Der Reiterknopf hatte `display:
inline-block` und trotzdem einen Kasten von **0 × 0 px an (0, 0)**. Der Stamm
bleibt unangetastet (§0h); die Grenzschicht holt die Leiste zurück, nur bei
offener Tiefe.

**2. Ein Tipp auf einen Reiter schloss die ganze Tiefe.** In `schale.ts` stand,
mit damals richtiger Begründung:

> Ein Reiter ist ein Ortswechsel. Wer dort „Standorte" wählt, will zur Karte.
> `if (tiefeIstOffen()) schliesseTiefe();`

Solange im Blatt nur Kartenreiter lagen, war das wahr. Mit der Analyse darin
warf ein Tipp auf „3D" den Nutzer auf die Karte. Gemessen: Ebene vor dem Tipp
`tiefe-offen tiefe-maschine`, danach `(keine)`. Jetzt entscheidet, zu welchem
Satz der Reiter gehört.

**3. Der Reiter „3D" zeigte Chips statt Gebirge.** Das Panel baut sein Gebirge
erst beim Tipp auf „🏔️ 3D-Ansicht" — richtig, solange es unangefordert auf
einer Seite steht. Im Reiter ist dieser Tipp einer zu viel: Der Reiter IST die
Bitte.

#### Eine Entscheidung, die das Bauen erzwungen hat

§7g sagte: „Das Klangbild bleibt oben, verliert aber seine Werkzeuge." Beim
Umsetzen zeigte sich, dass darin zwei verschiedene Werkzeuge stecken — und der
Code sagte selbst, dass sie nicht dasselbe sind:

> Auf dem Bildplatz gibt es die schlichte Geste: Zug heißt Auswahl, ein Tipp
> spielt sie. **Das ist Basis und bleibt es.** Dieses Werkzeug hier ist die
> Werkbank dazu. Beides gleichzeitig in Basis wären zwei Auswahlen, von denen
> man nicht weiß, welche gemeint ist.  — `ListenPanel.ts`

Hätte ich beides gestrichen, wäre der **Basis**-Stufe still eine Fähigkeit
verlorengegangen. Das Klangbild hat deshalb zwei getrennte Schalter bekommen:

| | Maschinenseite | Reiter „2D" |
|---|---|---|
| Quellen (Normalzustand · Messung · Unterschied · Iris) | ✓ | ✓ |
| Ziehen und Hören (**Basis**) | — | ✓ |
| Tipp ins Gebirge | — | — (eigener Reiter) |
| Hör-Lupe: Hervorhebung, tiefe Auswahl (**Profi**) | — | ✓ |

Oben steht damit der **Beleg** des Urteils, unten das **Werkzeug**. Beide sind
selten gleichzeitig zu sehen: Aufgezogen beginnt das Blatt bei 404 px, das Bild
oben bei 234 px und ist 240–340 px hoch.

#### Was jetzt wo liegt

```
Maschinenseite       Name · Standort · Stand
(Blatt unten,         die eine Handlung
 637 px wie bisher)   das Klangbild als Beleg
                      das Urteil in einem Satz · der Beleg
                      die Runde

Blatt (bis 784 px)   [ 2D ] [ 3D ] [ Briefing ]
                      2D:       Klangbild mit Zug + Hör-Lupe
                      3D:       das Gebirge, sofort gebaut
                      Briefing: ein Satz und der Weg hinein
```

Die Handlungen der Seite sind geblieben, führen aber ins Blatt:
„Unterschied anhören", „Trotzdem anhören" und „Letzten Unterschied anhören"
ziehen das Blatt auf, öffnen 2D und spielen. Zwei Wege zu einem Werkzeug gibt
es nicht mehr — der Briefing-Knopf der Seite ist entfallen, und `css-check`
hat die beiden zurückgebliebenen CSS-Regeln gefunden, bevor sie totes Gut
wurden.

#### Was die Wächter jetzt messen

`wow` meldete nach dem Umzug **19 Befunde**. Siebzehn davon waren Wächter, die
die Werkzeuge noch dort suchten, wo sie lagen — sie sind mitgezogen. Zwei waren
echt:

- **Am Schreibtisch stand die Hör-Lupe in der zweiten Spalte des Ergebnisses.**
  Jetzt liegt sie in der Seitenleiste — also links statt rechts. Die Frage ist
  dieselbe geblieben und heißt jetzt so: Muss man scrollen, oder liegt sie
  daneben? Gemessen: „ja, auf gleicher Höhe".
- **Bei aufgezogenem Blatt überlappen Tiefe und Blatt.** Das ist die
  Aufteilung, nicht ihr Bruch; der Rahmenwächter kennt diese Absicht jetzt.

Neu bewacht: dass das Blatt sich nicht von selbst aufzieht, dass es
2D · 3D · Briefing trägt, dass die Reiter 44 px hoch sind, dass der Reiter „3D"
wirklich ein Gebirge bringt, und dass der Weg zum Briefing weiterhin bis zur
Tür des Auswertungswerkzeugs führt.

| | vor S11 | jetzt |
|---|---|---|
| Reiter im Blatt (Maschine) | „📄 Standorte" · „Filter", Inhalt leer | **2D · 3D · Briefing** |
| Reiter unterwegs überhaupt | `display: none` (Stamm) | **sichtbar, 118 × 44 px** |
| Wege zu den drei Werkzeugen | drei verschiedene | **einer, drei Reiter** |
| Tipp auf einen Reiter | schloss die Tiefe | **schaltet um** |
| Reiter „3D" | Chips ohne Gebirge | **Gebirge steht** |
| Platz für die Analyse | 637 px (die ganze Seite) | **bis 784 px** |

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

### 7b. Schnitt 4a — den Unterschied hervorheben (17.08.2026)

Die Hör-Lupe hat unter „Fein einstellen" jetzt drei Stufen: **Originalmessung ·
Deutlich · Stark**. „Originalmessung" spielt wörtlich den vorhandenen
Mess-Buffer; „Deutlich" und
„Stark" sind flüchtige, bearbeitete Hörhilfen. Sie werden weder gespeichert
noch an Bewertung, Prozentwert oder Ampel zurückgegeben. Dieser Satz steht
direkt unter den drei Knöpfen, nicht nur in dieser Dokumentation.

Die technische Grenze ist wichtig: Die spektrale Differenz wird in
`differenceIsolation` für das eigene Abspielen auf 90 % Spitzenpegel
normalisiert. Ihre absolute Lautstärke ist deshalb keine physikalische Aussage
mehr. Schnitt 4a mischt sie nicht blind zurück, sondern dosiert ihre Form
relativ zur RMS-Lautheit der Messung:

- „Deutlich" zielt auf 45 % der Mess-RMS, „Stark" auf 85 %.
- Danach wird die gesamte Ableitung wieder auf die RMS-Lautheit der Messung
  abgeglichen. „Stark" heißt mehr Anteil des Unterschieds, nicht einfach mehr Lautstärke.
- Ein Peak-Limiter hält 0,92 als feste digitale Obergrenze ein.
- Der zugemischte Anteil blendet 12 ms ein und aus; beim Quellenwechsel liegen
  18 ms Ein- und Ausblendung übereinander, damit der Schalter kein künstliches
  Knacken erzeugt.
- Stereo- und unterschiedlich lange Kanäle bleiben erhalten; ungültige Werte,
  Stille und zu kurze Signale fallen sicher auf die Messung zurück. Alle
  Eingaben bleiben unverändert.

Sieben neue Signaltests prüfen: keine Differenz, synthetischen Zusatzton,
Monotonie Deutlich < Stark, Headroom, Lautheitsabgleich, Sonderfälle und
Unveränderlichkeit. Der vollständige Unit-Lauf steht bei **652 bestanden, 2
übersprungen**. Der erweiterte Wow-Wächter schaltet alle drei Stufen und
vergleicht Prüfwerte der tatsächlich gebauten AudioBuffer. Eine zusätzliche
Komponentenprüfung mit synthetischem Maschinenklang ergab verschiedene
Fingerabdrücke (`8fe2b894` / `58ad5ae3`) und Mischfaktoren (0,114 / 0,216);
„Aus" hatte keine Ableitung. Mobil und am Schreibtisch waren alle drei Ziele
44 px hoch und gleich breit.

### 7c. Schnitt 4b — den gehörten Vergleich teilen (17.08.2026)

„Mit Fachmann teilen" erscheint erst, nachdem **Deutlich** oder **Stark**
wirklich berechnet und gehört werden kann. Die zuletzt gewählte Stufe ist die
Stufe, die ausgegeben wird — kein Standard, den die App im Hintergrund
heimlich auswählt.

Die Übergabe enthält zwei gewöhnliche 16-Bit-PCM-WAV-Dateien:

1. `…-messung-original.wav` — die unveränderte Messaufnahme,
2. `…-hoerhilfe-deutlich.wav` oder `…-hoerhilfe-stark.wav` — genau die
   gekennzeichnete Ableitung.

Auf Mobilgeräten öffnet SoundFuchs das System-Teilen-Sheet mit beiden Dateien
und einem Satz, der die Hörhilfe als bearbeitet kennzeichnet. Ohne Datei-Share
werden beide WAVs lokal heruntergeladen. SoundFuchs lädt dabei selbst nichts
hoch; erst der bewusste Tipp des Nutzers übergibt Dateien an das Betriebssystem.
Der Empfänger braucht weder SoundFuchs noch ein proprietäres Format.

Vier Exporttests prüfen WAV-Kopf, Stereo-Verschachtelung, Peak-Begrenzung,
unveränderte Eingaben, Fehlerfälle und sichere Dateinamen. Der Wow-Wächter
hält zusätzlich fest: vor der Auswahl kein Teilen; nach „Deutlich" genau
`clear`, nach „Stark" genau `strong`.

### 7d. Schnitt 4c — im 2D-Spektrogramm auswählen und hören (17.08.2026)

Unter „Fein einstellen" liegt jetzt **„Bereich im Spektrogramm auswählen"**.
Die Ansicht ist absichtlich flach: horizontal läuft die Zeit, vertikal die
logarithmische Frequenzachse. Im 3D-Gebirge dreht ein Finger die Kamera; in
dieser Ansicht bedeutet Ziehen immer nur eines — einen Bereich markieren.
Darum wurde die Auswahl nicht auf die vorhandene 3D-Geste gelegt.

Gezeigt wird die bereits zeitlich ausgerichtete **Differenz**. Der Nutzer sucht
also im Auffälligen und nicht noch einmal zwischen allen bekannten
Motorgeräuschen. Der Startbereich umfasst die gesamte Zeit und 1–4 kHz, das
anschauliche Beispiel aus dem Produktkonzept. Danach gilt:

- Finger oder Maus ziehen ein Rechteck über Zeit und Frequenz.
- Pfeiltasten verschieben es; Umschalt + Pfeiltasten verändern seine Größe.
- Die genaue Auswahl steht als Text darunter, zum Beispiel
  `1,8–5,4 s · 940 Hz–4,2 kHz`.
- „Auswahl anhören" schneidet genau die Zeitspanne aus und begrenzt sie mit
  Hoch- und Tiefpass 4. Ordnung auf das markierte Frequenzband.
- 12-ms-Blenden verhindern künstliche Knackser. Die Hörhilfe wird höchstens
  zwölfmal angehoben und bleibt unter 0,90 digitalem Spitzenpegel.
- Das Ergebnis ist ausdrücklich eine bearbeitete Hörhilfe. Es verändert weder
  Originalmessung, gespeicherte Messung, Differenz noch Bewertung.

Nach dem Anhören zeigt „Mit Fachmann teilen" auf **genau diese Auswahl** und
gibt sie gemeinsam mit der unveränderten Messaufnahme aus. Damit kann ein
Nutzer nicht nur sagen „da pfeift etwas", sondern einen kleinen, hörbaren
Beleg mit Zeit- und Frequenzangabe übergeben.

Sieben neue Tests prüfen Achsenzuordnung, rückwärts gezogene Rechtecke,
Grenzwerte, Zeitschnitt, Bandunterdrückung, Blenden, Headroom, Mehrkanalton und
unveränderte Eingaben. Der vollständige Unit-Lauf steht jetzt bei **663
bestanden, 2 übersprungen**. Der Wow-Wächter zieht zusätzlich im echten mobilen
Ergebnis ein Rechteck und weist nach, dass ein kürzerer Buffer mit plausiblen
Frequenzgrenzen, eigenem Fingerabdruck und höchstens 0,90 Peak entsteht und
anschließend als `selection` teilbar ist.

### 7e. Vorgemerkt — Audiodatei importieren

**Produktziel:** Ein bereits aufgenommenes Geräusch soll nicht erst über den
Lautsprecher eines zweiten Geräts erneut aufgenommen werden müssen. SoundFuchs
nimmt eine lokale Audiodatei entgegen und behandelt sie wahlweise als
**Normalzustand** oder als **Messung**. Danach gelten dieselben Analyse-, Hör-
und Freigabewerkzeuge wie bei einer Live-Aufnahme.

Der Import ist kein neuer Hauptmodus. Er sitzt dort, wo die Entscheidung schon
klar ist:

- Fehlt der Maschine ein Normalzustand, bleibt „Normalzustand aufnehmen" die
  dominante Handlung. Direkt darunter steht als ruhige Alternative
  **„Audiodatei verwenden"**.
- Hat die Maschine einen Normalzustand, steht dieselbe Alternative unter
  „Prüfung starten". Eine dort gewählte Datei ist automatisch eine Messung.
- Am Schreibtisch darf die Datei zusätzlich auf die Aufnahmefläche gezogen
  werden. Mobil öffnet derselbe Knopf die Dateiauswahl. Beide Wege führen in
  dieselbe Vorschau; Drag-and-drop ist keine eigene Funktion.
- Ein allgemeiner Import im Daten-Reiter darf später beide Rollen anbieten.
  Er fragt erst nach der Maschine und dann eindeutig: **„Als Normalzustand"
  oder „Als Messung prüfen"**. Im Maschinenweg entfällt diese zusätzliche
  Frage.

#### Der kurze Weg

```text
Maschine → Audiodatei verwenden → anhören und Ausschnitt prüfen
         → verwenden → Ergebnis beziehungsweise Normalzustand bereit
```

Nach der Dateiwahl zeigt SoundFuchs genau eine Vorschau mit Dateiname,
Spieldauer, abspielbarer Wellenform und dem vorgesehenen Ziel
„Normalzustand“ oder „Messung“. Eine passende Datei braucht nur noch
**„Verwenden“**. Ist sie länger als die für die Analyse benötigte Dauer, kann
der Nutzer einen Ausschnitt verschieben; SoundFuchs schlägt automatisch einen
ruhigen, nicht übersteuerten Abschnitt mit ausreichendem Maschinensignal vor.
Die Auswahl bleibt jederzeit anhörbar. Eine zu kurze oder unlesbare Datei
führt nicht in eine Sackgasse, sondern erklärt konkret, was fehlt, und bietet
„Andere Datei wählen" an.

Ein vorhandener Normalzustand wird nie still überschrieben. Vor dem Ersetzen
steht: **„Diese Datei ersetzt den bisherigen Normalzustand. Frühere Prüfungen
bleiben erhalten.“** Dazu gibt es „Abbrechen“ und „Normalzustand ersetzen“.
Bei einer Messung gibt es keine solche Zusatzfrage; nach „Verwenden“ erscheint
direkt das Ergebnis mit Hör-Lupe.

#### Formate und technische Wahrheit

Die Oberfläche darf nicht „jedes Format“ versprechen, weil Browser und
Betriebssysteme verschiedene Decoder mitbringen. Die Dateiauswahl akzeptiert
`audio/*`; zuerst sollen mindestens WAV, MP3, AAC/M4A und Ogg/Opus abgedeckt
werden, soweit der jeweilige Browser sie dekodiert. FLAC ist willkommen, wenn
der Browser es unterstützt. Schlägt das Dekodieren fehl, nennt SoundFuchs das
Format und empfiehlt WAV oder MP3 — nicht bloß „Import fehlgeschlagen“.

Nach dem Dekodieren arbeitet die vorhandene Audio-Pipeline: Kanäle werden
kontrolliert verarbeitet, die Abtastrate intern angepasst und nur der gewählte
Ausschnitt analysiert. Lautheitsanhebung darf eine schlechte Aufnahme nicht
als gute Referenz tarnen. Die bestehende Qualitätsprüfung für den
Normalzustand bleibt deshalb verbindlich; Übersteuerung, Stille, zu wenig
Maschinensignal und ungeeignete Dauer werden vor dem Speichern gemeldet.

Importierte Dateien tragen sichtbar **„Importiert“**, ursprünglichen
Dateinamen und Importzeitpunkt. Dieser Herkunftshinweis ist wichtig, weil
Mikrofonposition, Entfernung, Raum und Betriebspunkt unbekannt sein können.
SoundFuchs bewertet deshalb nicht die Herkunft, weist aber vor dem Vergleich
knapp darauf hin, möglichst Aufnahmen derselben Maschine unter vergleichbaren
Bedingungen zu verwenden.

#### Datenschutz und Speicherung

Der Import bleibt wie die Aufnahme lokal. Keine Datei wird allein durch die
Auswahl hochgeladen oder geteilt. Gespeichert wird nur das, was die vorhandene
Aufbewahrungseinstellung erlaubt; eine daraus erzeugte Hörhilfe bleibt eine
gekennzeichnete Ableitung. Vor dem endgültigen Übernehmen kann der Nutzer die
Datei verwerfen, ohne dass ein Datensatz zurückbleibt.

#### Abnahmekriterien für den späteren Schnitt

1. Import ist auf Handy und Schreibtisch erreichbar, ohne die Live-Aufnahme
   zur zweiten Primärhandlung zu machen.
2. Dieselbe Datei kann bewusst als Normalzustand oder Messung verwendet
   werden; der Maschinenkontext vermeidet eine unnötige Rollenfrage.
3. Vorschau, Abspielen und Ausschnittswahl geschehen vor dem Speichern oder
   Vergleichen.
4. Ein bestehender Normalzustand wird niemals ohne ausdrückliche Bestätigung
   ersetzt.
5. Unterstützte Formate, Stereo/Mono, abweichende Abtastraten, sehr lange,
   zu kurze, stille, übersteuerte, beschädigte und falsch benannte Dateien
   sind automatisiert geprüft.
6. Eine importierte Messung erreicht dasselbe Ergebnis, dieselbe Hör-Lupe und
   dieselben Teilfunktionen wie eine Live-Messung.
7. Ein Browser ohne Decoder-Unterstützung erhält eine verständliche
   Formatmeldung und einen sicheren Rückweg.
8. Der gesamte Vorgang funktioniert nach dem Laden der App offline und lädt
   ohne ausdrückliche Freigabe nichts hoch.

### 7f. Leuchtturm umgesetzt — Geräusch-Briefing (18.08.2026)

Schnitt 6A/6B hat aus der bisherigen „KI-Analysepaket"-Übergabe den
Leuchtturm der Produktstrategie gemacht: ein **Geräusch-Briefing**, das lokal
entsteht und an eine Fachperson oder eine frei gewählte externe KI übergeben
werden kann. Die externe KI ist ein möglicher Empfänger, nicht Bestandteil
und nicht Voraussetzung von SoundFuchs.

Das Briefing funktioniert in drei ehrlichen Ausgangslagen:

1. **Bekannter Normalzustand + Messung:** SoundFuchs dokumentiert den hörbaren
   Unterschied, ohne daraus Ursache oder Schadensschwere abzuleiten.
2. **Eine verdächtige Aufnahme:** SoundFuchs beschreibt und markiert Muster
   innerhalb dieser Aufnahme und legt einen Plan für die sinnvollste
   Gegenaufnahme bei.
3. **Zwei Aufnahmen mit unbekanntem Zustand:** SoundFuchs nennt das Ergebnis
   neutralen A/B-Kontrast und erklärt keine Seite für gesund oder defekt.

Jedes Geräusch-Briefing enthält je nach Ausgangslage Originalaufnahmen,
markierte Hörhilfen, Spektrogramme, Aufnahmequalität, Aufnahmekontext,
technische Grenzen, einen Arbeitsauftrag und die nächste sinnvolle
Gegenaufnahme. Der Arbeitsauftrag liegt im ZIP und zusätzlich in der
Zwischenablage. SoundFuchs lädt selbst nichts hoch.

**Abnahme des Leuchtturms:** Ein Empfänger muss nach dem Öffnen in weniger als
einer Minute verstehen können: Was wurde aufgenommen? Welche Stelle meint der
Nutzer? Was ist Original und was Hörhilfe? Welche Aussage ist zulässig? Was
soll als Nächstes geprüft werden? Erst wenn alle fünf Antworten ohne Rückfrage
auffindbar sind, ist es ein vollständiges Geräusch-Briefing.

Die weitere Roadmap wird daran priorisiert:

- **P1 · Konsistente Sprache:** alle sichtbaren Übergabetexte und Exportnamen
  auf Geräusch-Briefing, Aufbereitung und Arbeitsauftrag umstellen.
- **P1 · Briefing-Qualität messen:** Verständlichkeit mit Fachpersonen und
  verschiedenen externen KI-Oberflächen prüfen; keine Diagnosegüte behaupten.
- **P2 · Aufnahmebedingungen stärken:** Position, Abstand, Betriebszustand und
  Vergleichbarkeit einfacher dokumentieren.
- **P2 · Audioimport:** vorhandene Audiodateien als Aufnahme oder
  Normalzustand übernehmen (§7e) und direkt in ein Briefing führen.
- **P3 · Empfängerhilfe:** anbieterneutrale Hinweise, wie ZIP oder
  Mindestdateien an Fachpersonen und unterschiedliche KI-Oberflächen
  übergeben werden.

Ein Roadmap-Punkt erhält Vorrang, wenn er das Briefing schneller,
verständlicher, ehrlicher oder besser weitergebbar macht. Eine Funktion, die
nur wie Diagnose wirkt, ohne die Übergabe zu verbessern, gehört nicht zu
diesem Leuchtturm.

---

## 7g. Konzept — Die Analyse gehört ins Blatt (23.08.2026)

_Vom Auftraggeber vorgeschlagen, hier geprüft. **Noch nicht umgesetzt.**_

Der Vorschlag: Das Blatt hinter dem Scharnier — dasselbe, das man bei TourFuchs
aufzieht, um eine Tour zu planen — nimmt die **gesamte Analyse** auf, in drei
Reitern: **1 = 2D**, **2 = 3D-Gebirge**, **3 = Briefing**. Was oben stehen
bleibt, wenn das Blatt unten liegt, ist das Zentrale: die aktuelle **Prüfung
und der Vergleich**.

### Der Befund, der den Vorschlag trägt

Gemessen am 23.08.2026, Handy 390 × 844, auf der Maschinenebene:

```
Körper                tiefe-offen tiefe-maschine
Reiter im Blatt       „📄 Standorte"  ·  „Filter"
offener Reiter        „📄 Standorte"
Inhalt des Reiters    ""            ← leer
Griff                 „Einstellungen & mehr"
Blatt-Oberkante       744 px        → aufgezogen 404 px
Tiefe                 107–744 px (637 px hoch)
```

Das Blatt ist hinter dem Scharnier also **schon da, lässt sich schon aufziehen
— und ist falsch beschriftet und leer.** Wer an einer Maschine steht, sieht
unten zwei Reiter über Standorte und Kartenfilter, und dahinter nichts.

Damit ist der Vorschlag keine Erweiterung, sondern eine Reparatur: Es geht
nicht darum, einen Ort zu schaffen, sondern einen vorhandenen richtig zu
füllen.

### Was dafür spricht — drei Maße

**Ein Ort statt dreier.** Die drei Werkzeuge werden heute auf drei
verschiedenen Wegen erreicht:

| Werkzeug | Weg heute |
|---|---|
| 2D-Analyse (Hör-Lupe) | über „Unterschied anhören" bzw. „Trotzdem anhören" |
| 3D-Gebirge | ein Tipp auf das Klangbild |
| Briefing | ein Knopf weit unten in der Zweitaktionszeile |

Drei Werkzeuge derselben Art, drei verschiedene Türen, und keine davon heißt
„Analyse". Im Blatt wären es eine Geste und drei Reiter — immer dieselben,
unabhängig davon, in welchem Zustand die Maschine gerade ist.

**Mehr Platz, nicht weniger.** Das Blatt kann bis auf
`innerHeight − Kopfleiste − 8` aufgezogen werden, gemessen **784 px**. Die
Maschinenebene selbst hat 637 px. Die Analyse bekäme also 147 px **mehr** Raum
als die ganze Seite heute hat — und das Gebirge ist das Element, das am
meisten davon profitiert.

**Nichts geht oben verloren.** Liegt das Blatt auf Guckhöhe (Oberkante 744 px),
bleiben der Maschinenebene dieselben 637 px wie heute. Der Vorschlag kostet
oben nichts.

### Was er kostet — ehrlich benannt

**Das Blatt verdeckt, was darüber steht.** Aufgezogen liegt seine Oberkante bei
404 px; von der Tiefe bleiben 297 px sichtbar. Das Klangbild beginnt heute bei
234 px und ist 240–340 px hoch — es wäre zu gut der Hälfte verdeckt.

Das ist **kein Einwand, sondern die Bestätigung der Aufteilung**: Wer die
Analyse aufzieht, arbeitet in der Analyse. Das Bild oben und das Bild unten
gleichzeitig zu brauchen, wäre ein Zeichen, dass die Trennung falsch liegt.
Daraus folgt aber eine Regel: **Was im Blatt liegt, muss dort vollständig
sein.** Ein Reiter, der auf etwas oben verweist, wäre eine halbe Sache.

**Der Tipp aufs Gebirge wird ein Zug plus ein Tipp.** Heute steht das Gebirge
nach einem Tipp auf das Klangbild. Im Blatt wären es zwei Handlungen. Dafür
steht es immer an derselben Stelle, statt nur dann, wenn oben gerade ein
Klangbild liegt. Ich halte den Tausch für richtig — Vorhersagbarkeit schlägt
einen Tipp —, aber es ist ein Tausch und keine reine Verbesserung.

**Basis und Profi.** Hervorhebungsstufen und die tiefe Bereichsauswahl liegen
heute auf Profi. Bleibt das so, ist Reiter 1 auf Basis deutlich dünner. Mein
Vorschlag: Das Blatt gibt es auf beiden Stufen, die Inhalte behalten ihre
heutigen Stufenregeln. Basis bekommt Bild, Abspielen und Briefing; Profi
zusätzlich Hervorhebung, Bereichsauswahl und Zeitfenster.

**Das Blatt hat drei Kontexte, nicht zwei.** Karte → Standorte/Filter.
Maschine → 1/2/3. Und die **Standortebene**? Dort stünden heute weiter die
Kartenreiter, und das wäre genauso falsch wie auf der Maschinenebene. Das ist
die eine offene Frage dieses Konzepts. Naheliegend wäre die Reihe (§S10) —
aber das ist eine Vermutung, keine Entscheidung.

### Was oben bleibt

Alles, was zur **aktuellen Prüfung** gehört, in dieser Reihenfolge:

```
Name · Standort · „Zuletzt 87 % · vor 3 Tagen"
die eine Handlung           („Jetzt 10 Sekunden prüfen")
das Klangbild               (flach, als Beleg — ohne Werkzeuge)
das Urteil in einem Satz    („Die Messung klingt wie der Normalzustand.")
der Beleg                   („Ähnlichkeit 100 % · gerade eben")
die Runde                   („▸ Nächste: Rührwerk 2")
```

Das Klangbild bleibt oben, verliert aber seine Werkzeuge: kein Tipp ins
Gebirge, kein Zug für die Auswahl. Es ist dann, was es im Ruhezustand ohnehin
ist — **der Beleg des letzten Urteils, nicht das Werkzeug**. Die Werkzeuge
liegen eine Geste tiefer.

### Mein Urteil als Produktverantwortlicher

**Der Vorschlag trägt.** Er ist nicht „noch ein Ort", sondern die Antwort auf
eine Unordnung, die messbar dasteht: ein leeres, falsch beschriftetes Blatt und
drei gleichartige Werkzeuge hinter drei verschiedenen Türen. Und er benutzt
kein neues Formenvokabular — das Blatt mit Reitern ist der Stamm selbst (§0h).

Die Analogie zu TourFuchs stimmt genau: Dort zieht man das Blatt auf, um zu
planen; hier zieht man es auf, um zu analysieren. Beides ist Arbeit, die man
nicht immer will, aber oft genug, um sie einen Zug entfernt zu haben.

**Was vor einer Umsetzung entschieden sein muss:**

1. Was liegt auf der **Standortebene** im Blatt? (offen)
2. Wandert das Klangbild oben wirklich in die reine Belegrolle — also ohne
   Tipp ins Gebirge? (mein Vorschlag: ja)
3. Bleiben die Stufenregeln der Werkzeuge unverändert? (mein Vorschlag: ja)

**Was die Umsetzung anfassen würde:** `Klangbild`, `ListenPanel` (Hör-Lupe),
`Spectrogram3DPanel` und der Briefing-Knopf werden neu eingehängt, nicht neu
gebaut. Angefasst werden müssten außerdem `schale.ts` (Reiter je Kontext),
`tiefe.css` und die Wächter `wow` (Bildplatz, Hör-Lupe, Gebirge) sowie
`attention-check` (Budgets).

---

## 7h. Konzept — Ein Video mitbringen (23.08.2026)

_Vom Auftraggeber vorgeschlagen. **Noch nicht umgesetzt.**_

Der Vorschlag: Menschen filmen, was komisch klingt — die offene Motorhaube, die
Waschmaschine, den Lüfter. Das Video liegt schon auf dem Telefon. SoundFuchs
soll es entgegennehmen, **die Tonspur herauslösen** und mit denselben Methoden
verarbeiten wie eine eigene Aufnahme.

### Die Machbarkeit ist gemessen, nicht geschätzt

Gemessen am 23.08.2026 im mitgelieferten Chromium, auf der eigenen Herkunft:

```
video/mp4                     Aufnahme 65 984 Bytes  →  decodeAudioData: ok
                                 1,12 s · 44 100 Hz · 1 Kanal
video/webm;codecs=vp8,opus    Aufnahme 63 000 Bytes  →  decodeAudioData: ok
                                 1,20 s · 44 100 Hz · 1 Kanal
WebCodecs AudioDecoder        vorhanden
```

**`decodeAudioData` liest die Tonspur direkt aus dem Video-Container.** Die
Bildspur wird dabei schlicht ignoriert. Es braucht **keine neue Bibliothek,
keinen Demuxer und keinen Server** — der Weg ist derselbe, den
`2-Reference.ts` und `3-Diagnose.ts` heute schon für Audio gehen.

Damit ist der Video-Import kein neuer Analysepfad, sondern **eine Zeile mehr im
Dateifilter** plus die Oberfläche darum herum.

### Er hängt an einem Konzept, das schon steht

§7e beschreibt den Audiodatei-Import vollständig: Einstieg unter der einen
Handlung, eine Vorschau mit Wellenform und Ausschnitt, Vorschlag eines ruhigen
Abschnitts, kein stilles Überschreiben des Normalzustands. **Das Video ändert
davon nichts** — es kommt genau ein Schritt davor dazu: Die Datei darf auch ein
Video sein.

Und der Fall „ich habe nur dieses eine verdächtige Geräusch, keinen
Normalzustand" ist ebenfalls schon gebaut: Das Geräusch-Briefing kennt den
Modus `single-recording` mit der ausdrücklichen Regel

> „Es gibt keine Vergleichsaufnahme. Verwende deshalb nicht die Begriffe
> Abweichung, Verschlechterung oder neu hinzugekommen …"

und die Aufnahmesituation `vehicle-engine-bay` — den Motorraum. Ein gefilmtes
Motorgeräusch fällt also in einen Pfad, den es bereits gibt.

### Der eine wirklich neue Teil: die Stelle im Video finden

Ein Video ist lang, und das Interessante darin ist kurz. §7e schlägt für Audio
schon einen ruhigen, nicht übersteuerten Abschnitt vor. Beim Video kommt eine
Hilfe dazu, die es bei Audio nicht gibt: **Man hat das Bild.**

```
Video wählen
  → Vorschau: Bild oben, Wellenform darunter, Ausschnitt darin
  → Beim Schieben des Ausschnitts springt das Bild mit
  → „Diesen Ausschnitt verwenden"
```

Wer gefilmt hat, weiß, wann er die Haube aufgemacht und wo er hingehalten hat.
Das Bild ist der Wegweiser zur Stelle — deshalb gehört es in die Vorschau und
nicht weggeworfen.

**Danach ist das Video zu Ende.** Gespeichert wird die Tonspur des gewählten
Ausschnitts, nicht der Film: Ein Video im Speicher jeder Prüfung wäre in zwei
Wochen ein volles Telefon. Ob ein Standbild des gewählten Augenblicks als
Positionsbild aufgehoben werden sollte — die App kennt ein solches schon aus
der Live-Prüfung —, ist eine offene Frage. Sie ist verlockend und kostet
Speicher; sie gehört entschieden, nicht nebenbei gemacht.

### Die Grenzen, vorher benannt

**Was ich gemessen habe und was nicht.** Gemessen ist ein MP4, das der Browser
selbst erzeugt hat. **Nicht** gemessen ist ein echtes Telefonvideo — iPhone
liefert `.mov` mit HEVC-Bild und AAC-Ton, Android meist `.mp4` mit H.264 und
AAC. Für `decodeAudioData` zählt nur der Ton, und AAC ist dort der Normalfall;
sicher ist es aber erst mit einer echten Datei. **Der Auftraggeber hat ein
Beispiel angeboten — das ist die erste Messung vor jeder Zeile Code.**

**Der Speicher.** `decodeAudioData` braucht die ganze Datei am Stück im
Arbeitsspeicher; teilweises Lesen geht nicht, weil die Verwaltungsdaten eines
MP4 am Ende stehen können. Ein zweiminütiges 1080p-Video sind schnell 200 MB.
Es braucht also eine Obergrenze mit einem Satz, der sagt, was zu tun ist —
nicht eine Sackgasse und nicht einen stillen Absturz.

**Videos ohne Ton.** Kommen vor (stummgeschaltet aufgenommen). Der Fall muss
beim Namen genannt werden: „In diesem Video ist keine Tonspur." — nicht
„Datei konnte nicht gelesen werden".

**Schlechter Ton.** Handymikrofone in einem Motorraum übersteuern und rauschen,
und manche Kameras nehmen mit 8 kHz auf. Die Qualitätsprüfung, die es für
Live-Aufnahmen schon gibt, muss auch hier laufen und darf nicht wegen der
bequemen Herkunft milder sein.

**Was die App weiterhin nicht kann.** Aus einem Motorgeräusch ohne
Normalzustand eine Diagnose zu machen. Sie kann das Geräusch beschreiben,
hörbar machen, markieren und weitergeben — genau das, wofür der Modus
`single-recording` und das Briefing gebaut sind. Ein Video-Import, der am Ende
„Lager defekt" sagt, wäre der Punkt, an dem dieses Produkt sein Versprechen
bricht.

### Vorgeschlagene Reihenfolge

1. **§7e zuerst.** Der Audiodatei-Import ist die Grundlage; das Video ist ein
   Dateifilter mehr plus die Bildvorschau. Andersherum baut man dieselbe
   Vorschau zweimal.
2. **Mit einer echten Telefonaufnahme messen**, bevor die Oberfläche entsteht.
3. **Das Video als Wegweiser**, nicht als gespeicherter Inhalt.

### Was zu entscheiden ist

1. Wird ein Standbild des gewählten Augenblicks aufgehoben? (Speicher gegen
   Nachvollziehbarkeit)
2. Wo liegt die Obergrenze für die Dateigröße?
3. Führt ein Video ohne bekannte Maschine in einen „Schnellcheck" ohne
   Maschinenanlage — oder verlangt der Weg wie heute erst eine Maschine?
   Der zweite ist einfacher, der erste ist näher an dem, was jemand tut, der
   gerade ein Video von seinem eigenen Auto gemacht hat.

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
