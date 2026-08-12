# Gestaltprinzip: Aufmerksamkeit und semantische Tiefe

**Stand:** 12.08.2026 · **Rolle:** Product Owner · **Status:** Prüfregel, kein Umbauauftrag

**Herkunft:** Die Regel in Abschnitt 1 und die vier Prüffragen sind aus der
Schwester-App TourFuchs übernommen (`docs/gestaltprinzip-aufmerksamkeit.md`
dort). Sie sind nicht hier erfunden worden, und das ist Absicht: Zwei Apps
desselben Hauses sollten dieselbe Frage an ihre Oberflächen stellen. Neu sind
in diesem Papier die **Messung an Zanobo** (Abschnitt 2), die Auswertung der
Fachliteratur zum **semantischen Zoom** (Abschnitt 3) und die **drei Regeln**,
die sich daraus für Zanobo ergeben (Abschnitt 4).

---

## 1. Die Regel

> **Zeige immer nur das, was für den nächsten Gedanken wichtig ist.
> Nicht mehr. Aber auch nicht weniger.**

Und die vier Prüffragen, die jede neue Ansicht beantworten muss:

1. **Welchen nächsten Gedanken unterstützt das?**
2. **Was verdrängt es – und wie kommt der Nutzer zurück?** Verdrängung ist
   erlaubt, stille Verdrängung nicht.
3. **Zeigt die Übersicht den Prozess oder die Inhalte?**
4. **Beantwortet schon etwas anderes dieselbe Frage?**

---

## 2. Was die Messung gezeigt hat

`npm run attention-check` (`tools/attention-check.mjs`) befragt die **gebaute
App im echten Browser** an Handy- und Schreibtischmaßen. Die erste Messung
(12.08.2026) hat eine verbreitete Annahme über Zanobo widerlegt.

| Maß (390 × 844)            | Zanobo                | TourFuchs |
| -------------------------- | --------------------- | --------- |
| Bedienelemente im Erstbild | **7**                 | 16        |
| Alle Schritte offen        | 10                    | –         |
| Einstellungen, Basis       | 23 (13 im Dialog)     | –         |
| Einstellungen, Experte     | **45 (35 im Dialog)** | –         |
| Nutzbare Textbreite        | **274 px** → 330 px   | 362 px    |

**Zanobos Startbildschirm ist nicht überladen.** Er verlangt weniger als die
halbe Aufmerksamkeit von TourFuchs. Wer `index.html` liest, zählt 117 Knöpfe
und kommt zum gegenteiligen Schluss – aber gezählt wäre damit Markup, nicht
Oberfläche. Das ist die Lehre aus dem Vorbild, noch einmal: **Quelltext lesen
ist keine Messung.**

Die drei echten Befunde liegen woanders:

**Er ist ruhig, weil er leer ist.** Mit acht Maschinen und 48 Prüfungen in der
Datenbank zeigt der Startbildschirm exakt dasselbe wie ohne: drei Klappkarten.
Vom Gegenstand ist eine Ziffer im Kachel-Badge sichtbar. Prüffrage 3 ist damit
in die _andere_ Richtung falsch beantwortet – die Übersicht zeigt den Prozess,
und sonst nichts.

**Der Komplexitätsschalter liegt an der falschen Stelle.** Der Wechsel von
Basis auf Experte treibt den Einstellungsdialog von 13 auf 35 Bedienelemente –
Faktor 2,7. Ein Schalter, der die ganze App umstellt, steht dort zwischen
„Prüf-Audio speichern" und dem Theme-Wähler.

**Sieben Eingänge, eine Frage.** Auf _„welche Maschine?"_ antworten heute:
Kachel „Gespeicherte Maschinen", Kachel „QR / Barcode", Kachel „Neue Maschine",
NFC-Deep-Link, Auto-Erkennung am Klang, Quick-Select-Liste und der
Historie-Abschnitt. Das ist Prüffrage 4, siebenfach.

### Die Geometrie (behoben am 12.08.2026)

Bei 390 px Gerätebreite kamen **274 px** beim Text an. 116 px – 30 % des
Bildschirms – verschwanden in gestaffelten Containern: `.container` (24 px je
Seite) über `.main-container` (2 px Rahmen) über `.container-content` (32 px).
Die Kachelbeschriftung „Gespeicherte Maschinen" bekam davon 63 px und brach in
vier Zeilen.

TourFuchs erreicht am selben Gerät 362 px, weil sein Blatt **genau eine**
Polsterung hat: `.tab-panel { padding: 14px }`.

**Regel:** _Auf dem Handy hat Inhalt genau einen Rand._ Die Karte trägt die
sichtbare Kante, die Hülle hält sie nur von der Bildschirmkante fort. Umgesetzt
als `--space-shell-x` (12 px) und `--space-card-x` (16 px); ab 768 px kehrt die
großzügige Polsterung zurück, dort ist Platz kein knappes Gut.

Ergebnis: **274 → 330 px** Textbreite, **63 → 81 px** Kachelbeschriftung.

---

## 3. Semantischer Zoom: was die Literatur tatsächlich sagt

Das vorhandene Konzeptpapier `experiment-spatial-ui-semantic-zoom.md` schlägt
eine räumliche Oberfläche mit fünf Zoomstufen vor. Die Recherche zum Stand der
Technik trägt diesen Entwurf **nicht** – und zwar aus vier Richtungen
unabhängig voneinander.

### 3.1 Semantischer Zoom ist nicht dasselbe wie Navigation

Der Begriff stammt aus der ZUI-Linie (Pad++, Perlin/Hollan/Bederson) und
bedeutet: **derselbe Gegenstand, andere Darstellungstiefe.** Nicht: ein anderer
Gegenstand. Das Konzeptpapier schlägt vor

```text
Maschinenwelt → Pumpe 17 → Vergleich → Ergebnis → technische Tiefe
```

und nennt das durchgehend „semantischen Zoom". Die ersten drei Schritte sind
aber **Navigation** – jedes Mal ein anderes Objekt. Nur der letzte Schritt ist
echter semantischer Zoom: Das Ergebnis „94 % ähnlich" und das Spektrum darunter
sind derselbe Gegenstand in zwei Auflösungen.

Die Vermischung ist folgenreich, weil beide Bewegungen verschiedene
Orientierungshilfen brauchen: Navigation braucht zu wissen **wo man ist**, Zoom
braucht zu wissen **wie tief man ist**.

### 3.2 Die einzige breit ausgelieferte Umsetzung kennt zwei Stufen

Microsofts `SemanticZoom` (Windows 8, bis heute in den WinUI-Richtlinien) ist
die einzige Fassung, die je in Millionen Händen war. Ihre Leitlinien sind
bemerkenswert konservativ:

- **Genau zwei Stufen** – hineingezoomt und herausgezoomt.
- **Layout und Wischrichtung dürfen sich zwischen den Stufen nicht ändern.**
- **Der Gültigkeitsbereich darf sich nicht ändern** – ein Fotoalbum springt
  nicht in die Ordneransicht.
- Die herausgezoomte Ansicht soll höchstens drei Bildschirme umfassen.

Punkt drei schließt die Leiter des Konzeptpapiers aus: Von „Vergleich" zu
„Ergebnis" ändert sich der Gegenstand, das ist ein Bereichswechsel.

### 3.3 Nutzer bevorzugen Übersicht, auch wenn Zoom schneller ist

Hornbæk, Bederson und Plaisant (ACM ToCHI 2002) haben zoombare Oberflächen
gegen „Übersicht + Detail" an 32 Probanden auf Karten gemessen:

- Die zoombare Oberfläche war **rund 22 % schneller** auf mehrstufigen Karten.
- **80 % der Probanden bevorzugten trotzdem die Übersicht + Detail**, mit der
  Begründung, man wisse dort besser, wo man ist.

Für Zanobo ist die Abwägung eindeutig. Die Nutzer sind keine Vielnutzer, die
sich Geschwindigkeit erarbeiten: Ein Servicetechniker öffnet die App vor einer
Maschine, vielleicht wöchentlich. Für ihn ist Orientierung mehr wert als 22 %.

### 3.4 „Desert Fog" – und Zanobo ist besonders anfällig

Jul und Furnas (UIST '98) haben den Zustand benannt, in dem eine zoombare
Oberfläche in einen Bereich ohne Objekte führt: Alle Orientierungsmerkmale
verschwinden, und der Nutzer kann weder ableiten, wo er ist, noch wohin er
müsste. In der Studie oben trat der Effekt bei sechs von 32 Probanden auf.

**Zanobos Ausgangszustand ist Desert Fog.** Eine neue Installation hat null
Maschinen. Eine neue Maschine hat keine Referenz. Eine Maschine mit Referenz
hat noch keine Historie. Wo TourFuchs' Karte immer Deutschland zeigt, kann bei
Zanobo jede einzelne Ebene leer sein.

---

## 4. Die drei Regeln, die daraus folgen

### 4.1 Navigation ist flach und sichtbar. Zoom ist tief und hat zwei Stufen.

Die beiden Bewegungen werden getrennt:

- **Navigation** – „welchen Gegenstand sehe ich?" – bleibt flach, benannt und
  jederzeit sichtbar. Das ist die Übersicht aus 3.3.
- **Semantischer Zoom** – „wie genau sehe ich ihn?" – gilt nur _innerhalb_ eines
  Gegenstands, hat **zwei Stufen**, ändert den Gegenstand nicht und lässt
  Anordnung und Wischrichtung unverändert.

Der Ort, an dem das trägt, ist das **Ergebnis**: „94 % · kaum verändert" ist die
herausgezoomte Stufe, Spektrum und Frequenzabweichungen die hineingezoomte.
Derselbe Gegenstand, zwei Auflösungen – das ist semantischer Zoom im Wortsinn.

Damit wird auch die Frage nach Basis/Fortgeschritten/Experte beantwortbar: Wo
Tiefe eine **Eigenschaft des betrachteten Gegenstands** ist, braucht sie keinen
globalen Schalter. Das ist eine eigene Entscheidung und ausdrücklich **nicht**
Teil dieses Papiers – aber die Richtung steht fest.

### 4.2 Keine Ebene ohne Boden

Jede Tiefe muss auch dann etwas zeigen, wenn sie leer ist – und zwar den Weg
heraus, nicht eine Entschuldigung. Kein Zustand der App darf aus einer leeren
Fläche ohne Anhaltspunkt bestehen. Das ist die direkte Konsequenz aus 3.4 und
gilt für jede neue Ansicht.

### 4.3 Die Oberfläche baut sich nicht selbst um

Gemessen: Ohne Maschinen stehen die drei Karten als `1 · 2 · 3` untereinander,
alle 342 px breit. Mit Maschinen springt „Zustand prüfen" auf Platz eins, die
anderen beiden schrumpfen auf 291 px und **verlieren ihre Ziffern**
(`[data-theme='focus']` mit `order: -1`, `style.css`).

Die Umsortierung ist deterministisch und passiert nur einmal – aber die
Prozessleiter verschwindet ausgerechnet in dem Moment, in dem der Nutzer noch
Anfänger ist. Muskelgedächtnis schlägt Anpassungsfähigkeit.

Das Theme ist hier die eigentliche Ursache: Es macht drei Dinge gleichzeitig –
Farbe, Layout und Hierarchie. **Kein `[data-theme]` darf `order`, `width` oder
`transform` setzen.**

---

## 5. Was ausdrücklich nicht übernommen wird

- **Die randlose, geschlossene Welt.** Sie nimmt die stärkste
  Orientierungshilfe weg, die es gibt – „hier ist Schluss" – und repariert den
  Verlust anschließend mit einer Pfadanzeige. Bei einer Maschinenliste sind die
  Ränder außerdem eine Information: „das sind alle acht".

- **Pinch-to-enter.** Zwei Gründe. Erstens ist die Geste in der klassischen
  Oberfläche bereits belegt. Zweitens, und schwerer: Zanobo wird **an der
  Maschine** benutzt – einhändig, oft mit Handschuhen, im Lärm. Eine
  Zwei-Finger-Geste ist in diesem Moment das falsche Primitiv. Große Ziele und
  eine Hand schlagen Gesten-Grammatik.

- **3D, Globus, freie Kamerafahrt.** Keine Bibliothek wegen einer Metapher.

---

## 6. Gemessen wird, nicht behauptet

`npm run attention-check` prüft gegen `dist/`, also nach `npm run build`.
Gemessen wird an zwei Gerätemaßen:

| Maß                | Frage                                                 |
| ------------------ | ----------------------------------------------------- |
| **Erstbild**       | Was steht im Fenster, ohne einen einzigen Klick?      |
| **Textbreite**     | Wie breit darf ein Satz an der engsten Stelle werden? |
| **Schritte offen** | Was verlangt die Seite, wenn nichts eingeklappt ist?  |
| **Einstellungen**  | Was kostet der Wechsel von Basis auf Experte?         |

Die Budgets sind der gemessene Ist-Stand plus wenig Luft. Sie sind eine
**Sperrklinke**: Sie verbieten nichts, was heute da ist, machen aber jedes
weitere Anwachsen sichtbar. Wer ein Budget hebt, trifft damit eine bewusste
Produktentscheidung.

Zwei Dinge misst das Werkzeug bewusst mit, die ein naiver Zähler übersieht:

- Die drei Hauptkarten sind `<div data-target>` mit reinem `click`-Listener,
  ohne `role`, `tabindex` oder `aria-expanded` – mit Tastatur oder Screenreader
  ist keiner der drei Hauptbereiche erreichbar. Sie werden trotzdem als
  Bedienelemente gezählt. Ein Messgerät, das sie übergeht, würde einen
  Bedienbarkeitsfehler mit einer _niedrigeren_ Zahl belohnen.
- Die Textbreite wird an einem eingehängten Probe-Block gemessen, nicht an
  vorhandenen Überschriften. Ein kurzes Wort ist schmal, weil es kurz ist.

---

## 7. Abbruchbedingungen

Eine Empfehlung ohne Bedingung, unter der sie stirbt, ist eine Meinung. Also:

1. **Der zweistufige Ergebnis-Zoom (4.1) stirbt,** wenn Nutzer die zweite Stufe
   nicht finden oder nach dem Hineinzoomen nicht mehr sagen können, welche
   Maschine sie gerade betrachten. Dann ist Tiefe hier kein Gewinn, sondern ein
   Versteck, und die technische Ebene gehört zurück in eine benannte Ansicht.
2. **Die Regel „ein Rand" (2) stirbt,** wenn die gewonnene Breite den Eindruck
   erzeugt, Inhalte klebten an der Bildschirmkante. Dann war die Staffelung
   Gestaltung und nicht Verschwendung – nachprüfbar am selben Werkzeug, das sie
   gefunden hat.

_Die Formulierungen sind ein Vorschlag des Verfassers und stehen unter dem
Vorbehalt des Produktverantwortlichen. Die Form – Bedingung ausgeschrieben,
bevor gebaut wird – steht nicht zur Wahl._

---

## 8. Kurzfassung fürs Review

- Jede Ansicht dient **einem** nächsten Gedanken.
- Verdrängen ist erlaubt, **stilles** Verdrängen nicht.
- **Navigation ist flach und sichtbar; semantischer Zoom hat zwei Stufen und
  ändert den Gegenstand nicht.**
- Keine Ebene ohne Boden – eine leere Fläche ist Desert Fog.
- Auf dem Handy hat Inhalt **genau einen Rand**.
- Was sich selbst umbaut, ist nicht klug, sondern unvorhersehbar.
- Gemessen wird mit `npm run attention-check`, nicht mit dem Bauchgefühl.

---

## Quellen

- Hornbæk, Bederson, Plaisant: _Navigation patterns and usability of zoomable
  user interfaces with and without an overview_, ACM ToCHI 9(4), 2002 –
  <https://dl.acm.org/doi/abs/10.1145/586081.586086>, Fassung des HCIL-Berichts
  unter <http://www.cs.umd.edu/hcil/trs/2001-11/2001-11.html>
- Jul, Furnas: _Critical Zones in Desert Fog: Aids to Multiscale Navigation_,
  UIST '98 –
  <https://www.researchgate.net/publication/2806120_Critical_Zones_in_Desert_Fog_Aids_to_Multiscale_Navigation>
- Microsoft: _Semantic Zoom_ (WinUI-Richtlinien) –
  <https://learn.microsoft.com/en-us/windows/apps/design/controls/semantic-zoom>
- _Zooming user interface_ (Pad++, Perlin/Hollan/Bederson; Raskins Archy) –
  <https://en.wikipedia.org/wiki/Zooming_user_interface>
- Musterkatalog semantischer Zoom-Interaktionen (LOD, progressive disclosure,
  Fisheye, Figma, Arc, tldraw) –
  <https://github.com/prathyvsh/semantic-zoom>
