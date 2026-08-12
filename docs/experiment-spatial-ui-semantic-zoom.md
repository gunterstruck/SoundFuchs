# Experiment: Zanobo Spatial UI – vom Funktionsmenü zum Instrument

**Stand:** 08.08.2026  
**Status:** Produktkonzept / Experiment, ausdrücklich kein Umbauauftrag  
**Produktname:** Zanobo  
**Repository:** Zanobot

---

## 1. Ausgangspunkt

Zanobo hat eine sehr einfache Produktfrage:

> **Hört sich die Maschine normal an?**

Die heutige Anwendung ist über mehrere Entwicklungsstufen gewachsen und enthält inzwischen Maschinenverwaltung, Referenzen, Vergleiche, Historie, Flottenmodus, Fleet-Ranking, Queue, NFC/QR, mehrere Ansichtstiefen, Hilfesysteme und technische Detailansichten.

Dieses Experiment stellt deshalb nicht die vorhandene Funktionalität infrage, sondern die Form, in der sie angeboten wird.

Die Leitfrage lautet:

> **Wie würde Zanobo aussehen, wenn die Benutzeroberfläche heute von Grund auf neu entworfen würde – ohne Rücksicht auf die heutige Navigation, aber unter vollständiger Beibehaltung der fachlichen Fähigkeiten und Daten?**

Das Ziel ist keine futuristische Oberfläche, sondern eine radikale Vereinfachung um den eigentlichen Nutzergegenstand: **die Maschine und ihr Klangbild**.

---

## 2. Produktthese

Zanobo soll sich weniger wie eine Software mit Funktionen und stärker wie ein **Instrument zum Betrachten und Vergleichen von Maschinen** anfühlen.

Nicht die Funktionen „Maschinen“, „Referenz“, „Diagnose“, „Historie“ und „Flotte“ stehen im Vordergrund. Stattdessen steht zunächst nur der Gegenstand vor dem Nutzer.

Beispiel:

```text
Zanobo

Welche Maschine hörst du?

[Pumpe 17]   [Motor 4]   [Lüfter 2]

        [+ Neue Maschine]
```

Öffnet Zanobo über einen NFC-Link bereits mit Maschinenkontext, kann selbst diese Auswahl entfallen:

```text
Pumpe 17

Letzter Vergleich vor 12 Tagen

[ Jetzt anhören ]
```

Die Oberfläche beginnt also beim **nächsten Gedanken**, nicht bei der vollständigen Funktionsstruktur.

---

## 3. Maschinenzentrierte Navigation

Die Maschine ist die zentrale semantische Einheit.

Die oberste Ebene ist eine **Maschinenwelt**. Sie enthält einzelne Maschinen und – wo fachlich sinnvoll – räumlich erkennbare Gruppen beziehungsweise Flotten.

Ein Tap oder semantischer Zoom auf eine Maschine führt in deren eigene Welt.

Beispiel:

```text
Maschinenwelt
  → Pumpe 17
      → aktueller Vergleich
      → Historie
      → Referenz
      → Details
```

Diese Struktur soll nicht primär als Baum oder Menü dargestellt werden. Jede Ebene darf als eigene ruhige räumliche Arbeitsfläche erscheinen.

---

## 4. Drei fundamentale Bewegungen

Die experimentelle Navigation soll möglichst auf drei Regeln reduziert werden.

### 4.1 Wischen = bewegen

Wischen beziehungsweise Drag bewegt den Nutzer **innerhalb derselben semantischen Ebene**.

Beispiele:

- von einer Maschine zur benachbarten Maschine,
- innerhalb einer Flotte,
- zwischen Historie, Referenz und aktuellem Vergleich einer Maschine,
- zwischen zeitlich benachbarten Messungen.

### 4.2 Tap oder Pinch-out = verstehen / vertiefen

Ein Tap auf ein semantisch vertiefbares Objekt öffnet die nächste Bedeutungsebene.

Eine Zwei-Finger-Spreizgeste kann dieselbe Aktion räumlich auslösen. Entscheidend ist das Element am Mittelpunkt der Geste.

Der Zoom ist **kein geometrisches Vergrößern derselben Oberfläche**. Der Inhalt verändert seine Bedeutung und seinen Detailgrad.

### 4.3 Pinch-in = abstrahieren

Eine Zwei-Finger-Zusammenziehgeste führt genau eine semantische Ebene zurück.

Beispiel:

```text
Frequenzdetails
  ← Ergebnis
  ← Pumpe 17
  ← Flotte Pumpen
  ← Maschinenwelt
```

Der Rückweg muss zusätzlich immer sichtbar und ohne Gesten bedienbar sein.

---

## 5. Die Maschine als „Welt“

Nach dem Eintritt in eine Maschine soll Zanobo zunächst nicht alle Funktionen zeigen.

Beispiel:

```text
Pumpe 17

Letzter Vergleich
94 % ähnlich
Kaum verändert

Referenz: 14. Juli

[ Jetzt vergleichen ]
```

Die zentrale Information lautet nicht „welche Funktion möchte ich öffnen?“, sondern:

> **Wie steht diese Maschine im Vergleich zu ihrem bekannten Klangbild da?**

Historie, Referenz und technische Details bleiben vorhanden, treten aber zunächst zurück.

---

## 6. Messung als Instrument, nicht als Formularstrecke

Beim Start eines Vergleichs soll die Oberfläche möglichst vollständig zur Messfläche werden.

Vereinfachtes Modell:

```text
Pumpe 17

        ◉
    Höre zu …
```

Eine ruhige Echtzeitdarstellung darf den Klang sichtbar machen. Nach Abschluss verwandelt sich dieselbe Bühne in das Ergebnis.

```text
94 % ähnlich

Kaum verändert
gegenüber der Referenz vom 14. Juli
```

Der Nutzer muss beim normalen Vergleich nicht gleichzeitig FFT, GMIA, Spektrogramm, Driftmetriken und weitere technische Ebenen sehen.

Die technische Tiefe bleibt erhalten – sie wird durch semantisches Zoomen erreichbar.

---

## 7. Sprache: Vergleich statt Diagnose

Zanobo ist ein Vergleichs- und Orientierungsinstrument, kein Diagnosesystem.

Die neue Oberfläche muss diese Grenze konsequent sprachlich und visuell einhalten.

Bevorzugte Aussagen:

- sehr ähnlich,
- ähnlich,
- verändert,
- deutlich verändert,
- stärker abweichend als beim letzten Vergleich,
- innerhalb der Flotte auffällig anders.

Zu vermeiden sind Aussagen wie:

- Maschine gesund,
- Defekt erkannt,
- Schaden festgestellt,
- Reparatur notwendig.

Die Interpretation bleibt beim Nutzer.

---

## 8. Semantischer Zoom im Ergebnis

Das Ergebnis selbst ist ein hineinzoombares Objekt.

### Ebene A – schnelle Orientierung

```text
94 % ähnlich
Kaum verändert
```

### Ebene B – Erklärung

```text
Wo unterscheidet sich das Signal?
```

Hier können Spektrogramm, Frequenzbereiche oder Verlauf sichtbar werden.

### Ebene C – technische Tiefe

Für technisch interessierte Nutzer können weitere Werte erscheinen, beispielsweise:

- Spektralvergleich,
- GMIA-/Referenzmodellinformationen,
- Drift,
- Operating-Point-Hinweise,
- Rohmetriken.

Damit wird der heutige Gedanke verschiedener View-Level nicht abgeschafft, sondern in eine Bewegung übersetzt:

> **Je tiefer der Nutzer hineingeht, desto technischer wird Zanobo.**

Ein permanenter „Basic / Advanced / Expert“-Schalter könnte dadurch langfristig weniger wichtig werden. Für das Experiment wird der bestehende Mechanismus jedoch nicht verändert.

---

## 9. Flotten als räumliche Landschaft

Der Flottenmodus eignet sich besonders für eine räumliche Darstellung.

Die heutige Anwendung besitzt bereits Flottengruppen, Rankings, Median/MAD-basierte Ausreißerlogik, Gold-Standard-Referenzen und eine Prüf-Queue.

Das Experiment darf diese vorhandenen Daten anders visualisieren.

Beispiel:

```text
Pumpen Halle 2

P01    P02    P03
   P04    P05
P06                 P07
       P08
```

Die räumliche Anordnung darf Ähnlichkeit beziehungsweise Abweichung ausdrücken, sofern sie sauber aus vorhandenen Vergleichsdaten berechnet werden kann.

Eine Maschine, die stärker abweicht, kann sichtbar außerhalb des Clusters liegen.

Nicht:

> P07 DEFEKT

sondern:

> **P07 klingt anders als die Gruppe.**

Ein Tap oder Pinch auf P07 führt in die Maschine und zeigt die nächste Erklärungsebene.

Für einen ersten Prototyp darf diese Flottenlandschaft auch vereinfacht sein. Es dürfen keine mathematischen Beziehungen vorgetäuscht werden, die aus den vorhandenen Daten nicht tatsächlich ableitbar sind.

---

## 10. Räumlichkeit ohne 3D-Zwang

„Spatial UI“ bedeutet nicht automatisch 3D, Globus oder freie Kamerafahrt.

Eine gute erste Version darf eine zweidimensionale, ruhige Fläche sein.

Die räumliche Idee besteht aus:

- Nachbarschaft,
- Richtung,
- wiedererkennbarer Position,
- semantischer Tiefe,
- Bewegung zwischen Gegenständen.

Keine 3D-Bibliothek soll nur wegen der Metapher eingeführt werden.

---

## 11. Orientierung

Die größte Gefahr einer räumlichen UI ist Orientierungsverlust.

Der Nutzer muss jederzeit beantworten können:

1. Wo bin ich?
2. Was liegt um mich herum?
3. Wie tief bin ich?
4. Wie komme ich zurück?

Für den Prototyp ist deshalb eine sichtbare semantische Spur sinnvoll:

```text
Zanobo › Pumpen Halle 2 › Pumpe 17 › Vergleich
```

Sie ist ein Sicherheitsinstrument des Experiments und muss nicht die endgültige Gestaltung sein.

---

## 12. Versteckter Parallelbetrieb

Die heutige Zanobo-Oberfläche bleibt vollständig erhalten.

Die neue Spatial UI wird als **alternative Präsentationsschicht** parallel aufgebaut.

Konzeptionell:

```text
                 ┌─ bestehende Zanobo-UI
Daten + Dienste ─┤
                 └─ experimentelle Spatial UI
```

Es darf keine zweite Datenbank, keine Kopie der Maschinen und keine zweite Analyse-Pipeline entstehen.

Die bestehende IndexedDB und die bestehenden Dienste bleiben die fachliche Wahrheit.

### Aktivierung

Für den ersten Versuch wird ein absichtlich versteckter Schalter verwendet.

Empfohlene Geste:

> **Fünf schnelle Taps/Klicks innerhalb von ca. 2,5 Sekunden auf den großen Hero-Bereich mit der Überschrift „Hört sich die Anlage normal an?“**

Der Hero ist auf der Startoberfläche groß genug für Touch und kein normales interaktives Bedienelement. Einzelne Taps haben dort keine produktive Funktion.

Die experimentelle Oberfläche darf außerdem über einen Entwicklungs-/Test-Hook aktivierbar sein, damit automatisierte Tests nicht fünf echte Pointer-Ereignisse simulieren müssen.

### Verlassen

In der Spatial UI steht jederzeit sichtbar:

> **Zur klassischen Oberfläche**

Das Verlassen muss sofort, deterministisch und ohne Reload möglich sein.

Die Aktivierung wird für den ersten Prototyp **nicht persistent gespeichert**.

---

## 13. Technische Leitplanken aus dem heutigen Repository

Die heutige Anwendung ist TypeScript + Vite und verwendet eine lokale IndexedDB.

Relevante vorhandene Architektur:

- `src/main.ts` initialisiert Datenbank, Router, UI, PWA und globale Einstellungen.
- `src/data/db.ts` ist die zentrale lokale Datenschicht und stellt unter anderem `getAllMachines()` und `getMachine()` bereit.
- `src/ui/router.ts` bildet den bestehenden Workflow ab.
- `src/ui/HashRouter.ts` behandelt Deep Links und NFC-/Importpfade.
- `src/ui/phases/1-Identify.ts` enthält Maschinen- und Flottenauswahl.
- `src/ui/phases/2-Reference.ts` enthält den Referenz-Workflow.
- `src/ui/phases/3-Diagnose.ts` enthält Vergleich, Analyse und Ergebnisdarstellung.
- `src/ui/phases/DashboardRenderer.ts`, `MachineOverviewRenderer.ts`, `FleetRankingRenderer.ts`, `MachineHistoryModal.ts` und weitere spezialisierte Renderer enthalten bereits wiederverwendbare Datenlogik beziehungsweise Darstellungsideen.

Das Experiment soll diese Module zunächst **nicht umbauen**. Es soll Daten und bestehende Dienste wiederverwenden, aber eine eigene Rendering-Schicht erhalten.

---

## 14. Minimaler Prototyp

Der erste Prototyp soll bewusst klein sein.

### Muss enthalten

1. versteckte Aktivierung über fünf schnelle Hero-Taps,
2. eigene experimentelle Root-Fläche,
3. Maschinenwelt aus echten `getAllMachines()`-Daten,
4. Tap auf Maschine → Maschinenwelt,
5. mindestens eine weitere semantische Ebene mit echten vorhandenen Daten,
6. sichtbare Pfadanzeige,
7. sichtbarer Rückweg,
8. sichtbarer Wechsel zur klassischen Oberfläche,
9. Drag/Swipe innerhalb einer Ebene,
10. Pinch-out zum semantischen Eintritt auf Touch-Geräten,
11. Pinch-in für genau eine Ebene zurück,
12. Desktop-Fallback mit Maus + Klick.

### Sinnvolle erste Inhalte einer Maschine

- Maschinenname,
- Zeitpunkt des letzten Vergleichs,
- letzter vorhandener Ähnlichkeits-/Vergleichswert, sofern sauber aus bestehender Datenstruktur verfügbar,
- vorhandene Referenz ja/nein,
- Anzahl historischer Prüfungen,
- Flottenzugehörigkeit, sofern vorhanden.

### Nicht Bestandteil von Version 1

- vollständige Feature-Parität,
- neue Audio-/DSP-Pipeline,
- neue Diagnoseberechnungen,
- vollständiger Messworkflow in der Spatial UI,
- 3D-Globus,
- neue Datenbank,
- neue Cloud-Komponenten,
- Änderungen an NFC-/Importformaten,
- Entfernung bestehender View-Level.

---

## 15. Zweite Ausbaustufe, falls der Prototyp trägt

Erst wenn die Navigation verständlich wirkt, sollen zwei echte Kernwege experimentell aufgebaut werden.

### Weg A – Einzelmaschine

```text
Maschinenwelt
  → Pumpe 17
      → Jetzt vergleichen
          → Ergebnis
              → Erklärung
                  → technische Tiefe
```

### Weg B – Flotte

```text
Maschinenwelt
  → Pumpen Halle 2
      → Flottenlandschaft
          → P07
              → Vergleich zur Gruppe
```

Damit lässt sich prüfen, ob die neue UI sowohl seriellen Vergleich über die Zeit als auch parallelen Flottenvergleich verständlich abbildet.

---

## 16. Erfolgskriterien

Der Prototyp ist erfolgreich, wenn er Erkenntnisse liefert – nicht erst, wenn er die alte UI ersetzen kann.

Zu prüfen sind insbesondere:

- Wird die Maschine als Gegenstand stärker wahrgenommen als die App-Funktion?
- Versteht der Nutzer Tap/Pinch als semantische Vertiefung?
- Ist der Rückweg jederzeit klar?
- Wird der normale Vergleich schneller verständlich?
- Braucht der Nutzer weniger gleichzeitig sichtbare Bedienelemente?
- Ist die technische Tiefe weiterhin auffindbar?
- Hilft räumliche Nachbarschaft beim Wiederfinden von Maschinen und Flotten?
- Kann der bestehende Basic/Advanced/Expert-Gedanke später teilweise durch semantische Tiefe ersetzt werden?
- Welche Teile funktionieren unabhängig vom Gesamtkonzept?

Ein gültiges Ergebnis wäre auch:

> Die komplette Spatial UI ist nicht sinnvoll, aber Maschinenzentrierung, semantische Ergebnisvertiefung oder die Flottenlandschaft verbessern die bestehende Zanobo-UI.

---

## 17. Arbeitshypothese

> **Zanobo kann als Instrument statt als Funktionssammlung gestaltet werden: Der Nutzer bewegt sich zwischen Maschinen und Vergleichskontexten und zoomt bei Interesse semantisch tiefer in Ergebnisse und technische Details hinein.**

Diese Aussage ist eine Hypothese, keine Produktentscheidung.

Die bestehende Anwendung bleibt die produktive Referenz. Der nächste Schritt ist ein technisch isolierter Prototyp hinter einem versteckten Experiment-Schalter.