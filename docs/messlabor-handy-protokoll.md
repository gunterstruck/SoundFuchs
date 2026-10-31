# Mess-Labor: Handy-Protokoll (eine Referenz, viele Prüfungen, AUC, kalibrierte Schwelle)

## Wozu

Am Handy lernt SoundFuchs aus **genau einer** Referenzaufnahme (10 s, Standard in
`src/utils/recordingSettings.ts`) und prüft spätere Aufnahmen derselben Maschine
dagegen. Die übrigen Labor-Modi messen etwas anderes:

- **AUC-Benchmark:** lernt bei MIMII aus der Hälfte aller Normal-Clips eines
  Bereichs (`planSplit`, Standard 0,5) und lässt die Handy-Vorverarbeitung weg.
  „Max. Dateien/Bereich“ kürzt Referenz und Test zugleich.
- **Handy-Simulation:** macht es wie am Handy, aber nur von Hand und ohne AUC.

Das Handy-Protokoll misst, was ein Nutzer wirklich erlebt.

## Das Protokoll

Für jeden Bereich (bei MIMII eine Maschinen-ID, z. B. `pump/id_00`) und jede
gewählte Engine:

1. **Testmenge und Referenzen festlegen:** Die Testmenge wird je Bereich einmal
   festgelegt und bleibt über alle Durchläufe gleich (siehe „Auswahl der
   Clips“). Je Durchlauf wird eine Referenz gezogen, N Durchläufe (Standard
   20), reproduzierbar per Seed (`mulberry32` / `shuffledIndices`).
2. **Anlernen wie am Handy:** In jedem Durchlauf wird die Referenz angelernt: `trainPipeline` (Cherry-Picking, Raumkompensation laut
   Einstellungen) → `trainFingerprint`. Für Bias-Match und Drift kommt die
   Referenz-Statistik dazu, wie in der Handy-Simulation.
3. **Prüfen wie am Handy:** Die Normal- und Abnormal-Clips der Testmenge. Jede Prüfung bekommt eine frische
   `LivePipeline`. Die Frames laufen durch `engine.classify()`. Je Clip wird
   aggregiert wie im AUC-Modus (`clipAggregate`, Rohwert-Basis bevorzugt).
4. **AUC und pAUC** (FPR ≤ 0,1) je Durchlauf mit `auc.ts`.
5. **Quoten mit den Schwellen aus den Einstellungen** (`phoneVerdict`, wie in der
   Handy-Simulation):
   - **Fehlalarm:** Anteil der Normal-Clips, die als „auffällig“ gelten.
   - **Erkennung:** Anteil der Abnormal-Clips, die als „auffällig“ gelten.
   - **Zwischenbereich:** Anteil der Clips, die als „unsicher“ gelten.

   Der angezeigte Score ist das Mittel der Frame-Scores, wie am Handy.

Der Bericht zeigt je Bereich und Engine Median, Quartile, Minimum und Maximum der
AUC über alle Durchläufe, dazu die Quoten und die beste und die schlechteste
Referenzdatei. **Die Spanne ist gewollt:** Sie zeigt, wie stark das Ergebnis an
der gewählten Referenz hängt.

## Kalibrierte Schwelle und Referenz aus mehreren Clips

Messungen mit vier MIMII-Pumpen zeigen: Die AUC ist brauchbar bis gut, aber die
festen Schwellen 90/80 melden bei manchen Pumpen fast keine Fehler und erzeugen
bei anderen je nach Referenz viele Fehlalarme. Die folgenden Optionen messen mit
den echten Engines nach, ob eine Schwelle aus wenigen bestätigten
Normal-Aufnahmen beides löst. **Mit den Standardwerten (m = 0, k = 1) verhält
sich der Modus wie bisher.**

- **Kalibrier-Clips m** (0–10, Standard 0): Je Durchlauf werden nach dem
  Anlernen m weitere Normal-Clips wie Prüfungen bewertet (frische
  `LivePipeline`, gleiche Aggregation). Aus ihren Rohwerten (1 − Ähnlichkeit,
  dieselbe Größe wie für die AUC) entsteht die Schwelle. Ein Testclip gilt
  kalibriert als „auffällig“, wenn sein Rohwert **über** der Schwelle liegt.
- **Schwellenregel** (nur bei m > 0):
  - **„größte Abweichung × Faktor“** (Standard, Faktor 1,25): größter Rohwert
    der Kalibrier-Clips mal Faktor.
  - **„Mittel + z · Standardabweichung“** (z = 3): Mittel der Rohwerte plus
    z-mal die Stichproben-Standardabweichung. Erst ab m ≥ 3 möglich.
- **Referenz aus k Clips** (1–5, Standard 1): Die Engine lernt aus k
  Normal-Clips zusammen an, wie aus einer längeren Aufnahme. Die
  Handy-Vorverarbeitung läuft je Clip wie bisher; danach werden die Features
  (und für YAMNet das Rohsignal) aneinandergehängt. Die Referenz-Qualität im
  Bericht ist die schlechteste der k Clips.
- **Referenz-Lage** (nur bei k > 1 wirksam):
  - **„verteilt (mehrere Aufnahmen)“** (Standard, bisheriges Verhalten
    bitgleich): Die k Referenz-Clips werden zufällig über die ganze Aufnahme
    gezogen. Am Handy entspricht das mehreren Aufnahmen zu verschiedenen
    Zeiten.
  - **„am Stück (eine lange Aufnahme)“**: Die freien Normal-Clips (ohne die
    feste Testmenge) werden nach Dateinummer sortiert. Je Durchlauf wird ein
    Startpunkt aus dem Seed gezogen, und die nächsten k freien Clips bilden die
    Referenz. Am Handy entspricht das einer einzigen, k × 10 s langen
    Aufnahme. Die Kalibrier-Clips werden wie bisher zufällig aus dem Rest
    gezogen.
  - Bei k = 1 sind beide Lagen gleich.
  - Je Durchlauf steht im Bericht und in den Exporten die **Referenz-Spanne
    (Nummern)**: größte minus kleinste Dateinummer der Referenz-Clips. „Am
    Stück“ ohne Kappung ergibt k − 1. Mit fester Testmenge können dazwischen
    Testclips liegen; dann ist die Spanne etwas größer.

  **Annahme: Dateinummer = Aufnahmereihenfolge.** Bei MIMII scheint das zu
  gelten. Auf `pump/id_06` (k = 3, m = 5) weichen normale Clips, deren Nummer
  weit von der Referenz liegt, 3- bis 4-mal stärker ab als benachbarte
  (GMIA-Rohwert Median 0,034 bei Abstand < 10, 0,156 bei Abstand > 400). Die
  Lage der Referenz ist deshalb eine eigene Messgröße. Gilt die Annahme für
  einen Datensatz nicht, misst „am Stück“ nur eine andere Zufallsauswahl.

Der Bericht zeigt bei m > 0 je Bereich und Engine zusätzlich die Schwelle
(Median) sowie Fehlalarm- und Erkennungsquote mit der kalibrierten Schwelle
(Median, Min, Max über die Durchläufe), neben den bisherigen Quoten bei den
festen Schwellen aus den Einstellungen.

> **Hinweis:** Bei MIMII stammen die Kalibrier-Clips aus derselben
> Aufnahmeserie wie Referenz und Test. Im Feld kämen sie von anderen Tagen,
> mit anderer Temperatur, Last und Handhaltung. Die kalibrierten Quoten sind
> deshalb eher optimistisch.

### Auswahl der Clips

- **Testmenge fest:** Normal- und Abnormal-Clips werden je Klasse gleichmäßig
  verteilt auf „Max. Testclips/Klasse“ gekappt (wie `capEvenly`). Diese Menge
  bleibt über alle Durchläufe gleich.
- **Referenz und Kalibrierung aus dem Rest:** Referenz- (k) und Kalibrier-Clips
  (m) werden nur aus den **übrigen** Normal-Clips gezogen. Referenz,
  Kalibrierung und Test überschneiden sich nie.
- **„Max. Testclips/Klasse“ = 0** (alle) wie bisher: Es bleiben keine übrigen
  Clips. Referenz und Kalibrierung werden dann aus allen Normal-Clips gezogen
  und je Durchlauf aus dem Test herausgenommen. Dasselbe gilt, wenn zu wenige
  übrige Clips für k + m bleiben; der Bericht vermerkt das.
- Ein Bereich braucht mindestens k + m + 1 Normal-Clips, sonst wird er
  übersprungen und genannt.

Einzige gewollte Änderung gegenüber der ersten Fassung: Mit „Max.
Testclips/Klasse“ > 0 ist die Testmenge jetzt fest, und die Referenzen kommen aus
den übrigen Normal-Clips. Bisher wurde die Referenz aus allen Normal-Clips
gezogen und der Test je Durchlauf neu gekappt.

## Mikrofon-Szenario

MIMII-2019-Dateien haben 8 Kanäle. Aufgenommen wurde mit einem Ringmikrofon
(TAMAGO-03); die Mikrofone liegen wenige Zentimeter auseinander, der Abstand zur
Maschine ist fest 50 cm. Bisher mittelt das Labor alle Kanäle zu einem. Ein Handy
liefert aber ein einziges Mikrofon-Signal, und seine Lage ändert sich von
Aufnahme zu Aufnahme. Die einzelnen Kanäle bilden das nach: gleiche Zeit, andere
Stelle und Richtung.

Aus der Praxis: Eine Referenz, bei der das Handy etwas bewegt wurde, ist
robuster. Das soll das Labor messen.

Auswahl „Mikrofon-Szenario“ (Kanäle 1-basiert, Kanal 1 = erster Kanal der
Datei):

| Szenario | Referenz | Kalibrierung und Test |
| --- | --- | --- |
| **A: Mittel aller Kanäle** (Standard) | Mittel | Mittel |
| **B: 1 Mikrofon, Prüfung an derselben Stelle** | Kanal 1 | Kanal 1 |
| **C: 1 Mikrofon, Prüfung an anderer Stelle** | alle k Clips aus Kanal 1 | Prüf-Pool |
| **D: Referenz an k Stellen, Prüfung an anderer Stelle** | k Clips aus k über den Ring verteilten Kanälen (k = 3: 1, 4, 6) | Prüf-Pool |

- **A** ist das bisherige Verhalten, bitgleich.
- **D** braucht k ≥ 2.
- **Prüf-Pool:** die Kanäle, die in D nicht Referenz sind. Bei k = 3 und 8
  Kanälen sind das 2, 3, 5, 7 und 8. Jeder Test- und Kalibrier-Clip bekommt per
  Seed einen festen Kanal aus diesem Pool. Er ist in C und D derselbe und bleibt
  über alle Durchläufe gleich. C und D unterscheiden sich also nur in der
  Referenz.
- **Clip-Planung:** In allen Szenarien gleich. A bis D unterscheiden sich nur in
  der Kanalwahl.
- **Ein Kanal:** Haben die Dateien nur einen Kanal, nutzen alle Szenarien
  diesen; der Bericht weist darauf hin. Die Kanalzahl der gelesenen Dateien
  steht immer im Bericht.
- **Bericht und Exporte:** Das Szenario steht in der Kopfzeile und im JSON. Je
  Durchlauf stehen die Referenz-Kanäle dabei, im Detail-Export je Clip der
  verwendete Kanal.

**Vergleichen:** Gleiche Pumpe, gleicher Seed, gleiches k. Zu vergleichen sind:

- B gegen C: Was kostet es, an einer anderen Stelle zu prüfen?
- C gegen D: Hilft eine Referenz, die an mehreren Stellen aufgenommen wurde?

**Grenzen:** Die Mikrofone liegen nur wenige Zentimeter auseinander, und der
Abstand zur Maschine ist fest. Am Handy schwankt die Lage deutlich stärker:
Abstand, Winkel, Hand und Hülle ändern sich. Die Messung zeigt daher eher die
**Untergrenze** des Effekts.

## GMIA-λ-Stufen

GMIA lernt den Gewichtsvektor w = X (XᵀX + λI)⁻¹ · 1. Die Regularisierung λ
entscheidet, was GMIA eigentlich vergleicht:

- **Großes λ:** (XᵀX + λI)⁻¹ ≈ I/λ. Dann ist w praktisch das mittlere
  Spektrum der Referenz, und GMIA ist ein Mittelwert-Vergleich (wie
  Spektral-Kosinus, deshalb liefern beide oft sehr ähnliche Werte).
- **Kleines λ:** w nähert sich der MIA-Lösung. Das ist die Richtung, die in allen
  Frames gleich stark vorkommt; Anteile, die von Frame zu Frame schwanken,
  zählen weniger.

**Warum relativ:** λ wirkt nur im Verhältnis zur Größe von XᵀX. Die Merkmale
sind je Frame auf Summe 1 normiert, die Einträge von XᵀX sind deshalb klein.
Gegen sie ist der Standard der App, λ = 10^9, riesig. Er bedeutet hier
Mittelwert-Vergleich. Ein festes λ hätte je nach Aufnahme eine andere Wirkung.
Das Labor rechnet die Stufen deshalb **relativ**:

> λ = α · Spur(XᵀX) / N  (N = Zahl der Frames der Referenz, je Training neu)

Spur(XᵀX) / N ist die mittlere quadrierte Frame-Norm. α = 1 heißt also: λ in
der Größe der typischen Diagonale von XᵀX.

**Bedienung:** Im Handy-Protokoll unter „GMIA-λ-Stufen“ eine oder mehrere
Stufen anhaken: Standard 1e9, α = 1, 0,1, 0,01, 0,001. Die Stufen wirken nur,
wenn GMIA als Engine angehakt ist. Jede Stufe erscheint im Bericht und in den
Exporten als eigene Zeile, z. B. „GMIA α=0,1“, mit AUC, Quoten und, bei m > 0,
kalibrierten Quoten. Das Anlernen ist sonst genau wie in der App: Selbsttest,
Baseline und Skalierung. Die Zeile „GMIA“ ist der unveränderte Standard.

**Konditionszahl:** Je Training wird die Konditionszahl von XᵀX + λI
mitgeschrieben (CSV-Spalten „GMIA λ“, „GMIA Konditionszahl“). Liegt sie über
10^10, ist die Lösung numerisch unsicher. Die Stufe steht dann im Bericht als
**eingeschränkt** mit Hinweis. Bei sehr kleinem λ kann die Inversion ganz
scheitern; der Durchlauf zählt dann als fehlgeschlagen und wird ebenfalls
gemeldet.

**Vergleichen:** Gleiche Pumpe, gleicher Seed, gleiche Testmenge. Die Stufen
laufen im selben Messlauf gegen dieselben Referenzen und Testclips; die
Unterschiede kommen also nur von λ. Zu vergleichen sind:

- AUC-Median und Min–Max: Trennt ein kleineres α besser, und hängt es weniger
  an der Referenz?
- Fehlalarm und Erkennung mit kalibrierter Schwelle.
- Ob die Konditionszahl unter 10^10 bleibt.

Ein Vorteil zählt nur, wenn er über mehrere Pumpen hinweg auftritt.

Die App selbst ändert sich dadurch nicht: Ohne Angabe trainiert GMIA weiter mit
λ = 10^9, bitgleich wie bisher.

### Ergebnis

Gemessen auf `pump/id_06` (k = 3, 20 Durchläufe):

| λ-Stufe | AUC (Median) |
| --- | --- |
| Standard (λ = 10^9) | 0,990 |
| α = 1 | 0,327 |
| α ≤ 0,01 | ≈ 0,08 |

Bei kleinem α sind die Rohwerte über alle Referenzen praktisch gleich
(Rangkorrelation 1,000). Die Referenz spielt dann keine Rolle mehr.

**Grund:** Jeder Frame ist auf Summe 1 normiert. Damit erfüllt er die
MIA-Bedingung (Projektion auf w = 1) schon mit dem Einsvektor: 1ᵀf = 1. Für
kleines λ wird w deshalb zur Projektion des Einsvektors auf die belegten Bänder,
also zu einem flachen Vektor. Der Kosinus zwischen w und einem Frame f misst dann
nur noch 1/‖f‖₂, also wie breitbandig der Frame ist, unabhängig von der
Referenz.

**Entscheidung:** Die App bleibt bei λ = 10^9 (Mittelwert-Vergleich). Kleinere λ
sind auf diesen Merkmalen nicht sinnvoll, solange die Merkmale je Frame auf
Summe 1 normiert sind. Die λ-Stufen bleiben im Labor, um das bei Bedarf
nachzumessen.

### Engines

Zur Auswahl stehen alle vier Engines wie im AUC-Modus: GMIA, Spektral-Kosinus,
YAMNet und Zeitmuster.

- **Zeitmuster:** Vor jedem Clip wird `resetSequenceState()` aufgerufen, wie im
  AUC-Modus. Die Handy-Simulation bietet Zeitmuster bisher nicht an.
- **YAMNet:** läuft asynchron in Fenstern von etwa 1 s über das Rohsignal.
  Cherry-Picking und Raumkompensation wirken dort nicht, wie am Handy.

Weicht eine Engine von der Handy-Pipeline ab, steht sie im Bericht unter
„Zustand“ als **eingeschränkt** oder **fehler** und bekommt einen Hinweis. Sie
wird nicht still weggelassen. Das gilt in diesen Fällen:

- Durchläufe sind fehlgeschlagen.
- Der Rohwert fehlte; die AUC wurde dann auf dem gedeckelten Score berechnet.
- Das Gate hat bei Zeitmuster Frames verworfen, die Sequenz hat also Lücken.
- YAMNet lief bei aktiven spektralen Stufen.

GMIA und Spektral-Kosinus dürfen sehr ähnliche Werte liefern; das ist bekannt.

### Randfälle

- Bereiche mit weniger als k + m + 1 Normal-Clips (Standard: 2) werden
  übersprungen und im Bericht genannt.
- Gibt es weniger Normal-Clips als angefragte Durchläufe, laufen entsprechend
  weniger Durchläufe; der Bericht vermerkt das.
- Die Abtastrate jeder Datei wird aus dem WAV-Kopf gelesen. 16-kHz-Dateien
  werden wie im AUC-Modus beim Dekodieren auf 48 kHz umgerechnet. Der Bericht
  vermerkt das.

## Starten mit dem MIMII-Satz (6 dB, zuerst Pumpe)

1. Den MIMII-Datensatz von 2019 herunterladen: `6_dB_pump.zip` von Zenodo,
   Record 3384388. Danach entpacken; die Ordnerstruktur ist
   `pump/id_00/normal/*.wav` und `pump/id_00/abnormal/*.wav` (dazu `id_02`,
   `id_04`, `id_06`).
2. Das **Mess-Labor** öffnen. In der normalen Oberfläche gibt es dafür
   absichtlich keinen Knopf. Stattdessen SoundFuchs am Desktop-Browser mit dem
   Parameter `?labor` aufrufen, zum Beispiel:
   - Vercel-Vorschau oder Produktion: `https://<adresse>/?labor`
   - lokal mit `npm run dev`: `http://localhost:5173/?labor`

   Der Parameter steht vor einem eventuellen `#…`, also `/?labor#/…` und nicht
   `/#/…?labor`. Das Labor öffnet sich nach dem Laden direkt als Vollbild-Fenster.
   Es funktioniert nur in einem Desktop-Browser mit mindestens 900 px Breite und
   Ordnerauswahl (z. B. Chrome, Edge oder Firefox). Auf dem Handy oder in einem schmalen Fenster
   erscheint nur ein kurzer Hinweis. `?labor=0` schaltet den Einstieg wieder ab.
   Nach dem Schließen (✕) die Seite mit `?labor` neu laden, um das Labor erneut
   zu öffnen.
3. Den Modus **„Handy-Protokoll (1 Referenz)“** wählen.
4. Über **📂 Ordner wählen…** den Ordner `pump` (oder nur `pump/id_00`) wählen.
5. Die Optionen einstellen:
   - **Engines** wählen.
   - **Durchläufe:** Standard 20.
   - **Seed:** gleicher Seed ergibt dieselben Referenzen.
   - **Max. Testclips/Klasse:** 0 bedeutet alle. Bei einer Zahl > 0 ist die
     Testmenge fest; Referenz und Kalibrierung kommen aus den übrigen
     Normal-Clips.
   - **Referenz aus k Clips:** Standard 1, wie am Handy.
   - **Referenz-Lage:** „verteilt“ (Standard) oder „am Stück“. Wirkt nur bei
     k > 1.
   - **Mikrofon-Szenario:** A „Mittel aller Kanäle“ (Standard) bis D. D braucht
     k ≥ 2.
   - **Kalibrier-Clips m:** Standard 0. Für die kalibrierte Schwelle z. B. 5.
   - **Schwellenregel, Faktor, z:** wirken nur bei m > 0.
   - **Aggregation** wählen.
6. **▶ Messen** starten. Abbrechen ist jederzeit möglich.
7. Die Ergebnisse exportieren:
   - **CSV:** eine Zeile je Bereich × Engine × Durchlauf mit Referenzdatei(en),
     m, k, Regel, Faktor bzw. z, Kalibrier-Dateien, Schwelle und kalibrierten
     Quoten; danach die Zusammenfassung.
   - **JSON:** alle Werte maschinenlesbar.
   - **Detail (CSV):** eine Zeile je geprüftem Clip mit Bereich, Engine,
     Referenzdatei, Testdatei, Label, Rohwert, angezeigtem Score, Urteil,
     Schwelle und kalibriertem Urteil.
     Damit lassen sich einzelne Paarungen nachprüfen.

**Laufzeit:** Das Einlesen kostet je 10-s-Clip spürbar Zeit. Jeder Clip wird
dekodiert, auf 48 kHz umgerechnet und in Frames zerlegt, und jede Prüfung
läuft für jede gewählte Engine und jede Referenz, in der der Clip im Test
steht. `pump/id_00` hat rund 1000 Normal- und 140 Abnormal-Clips. Mit
20 Durchläufen und allen Clips sind das über 20 000 Prüfungen je Engine.

**Für den ersten Lauf daher:**

- „Max. Testclips/Klasse“ = **100**: so werden je Durchlauf 100 Normal- und
  100 Abnormal-Clips geprüft, in jedem Durchlauf dieselben. Referenz und
  Kalibrierung kommen aus den übrigen Normal-Clips.
- **YAMNet aus.** YAMNet ist die mit Abstand langsamste Engine, weil sie jedes
  ≈1-s-Fenster durch ein neuronales Netz schickt. Sie lädt außerdem beim ersten
  Mal ihr Modell.
- Erst wenn das Ergebnis plausibel aussieht, mit allen Clips oder mit YAMNet
  nachmessen.

Kalibrier-Clips kosten je Durchlauf m zusätzliche Prüfungen, eine Referenz aus
k Clips k Dekodierungen; beides ist gegenüber der Testmenge klein.

Während einer Messung hält das Labor den Bildschirm wach (Screen Wake Lock), damit
lange Läufe nicht durch den Bildschirmschoner gebremst werden. Ist die Funktion
im Browser nicht verfügbar, läuft die Messung ohne Fehler weiter.

Das Protokoll schreibt nichts in IndexedDB und berührt keine echten Referenzen.
Die Pipeline-Stufen und Schwellen kommen live aus den Einstellungen.

## Wo das Protokoll optimistisch bleibt

- **Das Mikrofon steht fest.** Bei MIMII hängt das Mikrofon für alle Clips einer
  ID an derselben Stelle. Am Handy hält der Nutzer das Gerät jedes Mal etwas
  anders: Abstand, Winkel, Hand und Hülle ändern sich. Diese Streuung zwischen
  Referenz und Prüfung fehlt hier.
- **Der Lärm ist nachträglich gemischt.** Im 6-dB-Satz wurde Fabriklärm
  nachträglich zur Maschine gemischt. Er ist in Referenz und Prüfung von gleicher
  Art. Echter Hallenlärm wechselt: andere Maschinen, Stapler, Stimmen.
- **Das Signal reicht nur bis 8 kHz.** MIMII liegt mit 16 kHz vor. Das Handy
  nimmt mit 48 kHz auf. Fehlerbilder oberhalb von 8 kHz, etwa Lagerpfeifen oder
  Ultraschall-nahe Anteile, kann das Protokoll nicht sehen. Umgekehrt fehlt auch
  das Rauschen dieser Bänder.
- **Gleiche Maschine, gleiche Session.** Referenz und Prüfungen stammen aus
  derselben Aufnahmeserie. Langsame Drift über Wochen (Temperatur, Verschleiß,
  Umbau) bildet MIMII nur begrenzt ab.

Die AUC-Werte des Protokolls sind deshalb eine **Obergrenze** dessen, was ein
Nutzer im Feld erlebt, keine Zusage.
