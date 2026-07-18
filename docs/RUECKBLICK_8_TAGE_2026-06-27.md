# Zanobot — 8‑Tage‑Rückblick & technischer Statusbericht

**Zeitraum:** 20.–27. Juni 2026
**Stand:** 27.06.2026
**Zweck:** Vollständiger fachlicher Rückblick auf die Änderungen der letzten acht Tage
(*was*, *warum*, *wie* — auch technisch), aktueller Architektur‑Stand und eine
ausführliche, diskussionsfähige Vorlage für den **nächsten großen Schritt**: eine
**vierte Engine** für **nicht‑stationäre / bewegte / transiente** Geräusche. Dieses
Dokument ist bewusst so geschrieben, dass es auch von einer **anderen KI** als
Grundlage für eine Fachdiskussion gelesen werden kann.

> **Einordnung in einem Satz:** Wir sind heute robust für **stationäre, kontinuierlich
> Geräusch abgebende Maschinen** (Pumpen, Lüfter, Motoren im Dauerlauf). Der nächste
> Schritt ist die **zeitliche Dimension**: Geräusche, die sich *über die Zeit* ändern,
> bewegen oder als kurze Ereignisse auftreten.

---

## 0. Kurzfassung (Executive Summary)

In acht Tagen hat sich Zanobot von „eine fest verdrahtete Auswertung (GMIA)“ zu einer
**Plattform mit drei zuschaltbaren, sauber gekapselten Auswerte‑Engines** entwickelt,
flankiert von einem großen **Architektur‑Refactoring**, **DSP‑Robustheitsfixes**,
deutlich besseren **Experten‑Visualisierungen**, voller **Banner‑Personalisierung** und
einem neuen **„schlechte Merkmale“‑Verlauf**.

Grobe Kennzahl: **~48 Dateien geändert, +5.674 / −391 Zeilen** im Zeitraum.

Die vier Phasen:

| Phase | Tage | Schwerpunkt |
|------|------|-------------|
| **A — Aufräumen & Architektur** | 20.–22.06. | Zerlegung der Monolithen `1-Identify` / `3-Diagnose` in getestete Module; Lazy‑Loading; Bundle‑Diät; i18n‑Konsistenz |
| **B — UX & PWA‑Sicherheit** | 23.–24.06. | Mess‑sicherer Update‑Prompt, Health‑Status‑Zusammenfassung, kleinere Bugfixes |
| **C — Engine‑Plattform** | 26.06. | Engine‑Interface + Registry; **Pivot Mahalanobis → Spektral‑Cosine**; BEAM/k‑NN; **YAMNet als 3. Engine (Beta)** |
| **D — Politur & Diagnostik** | 27.06. | DSP‑Robustheit (Median, Energy‑Gate), Experten‑Plots für alle Engines, Banner‑Personalisierung, **History „schlechte Merkmale“** |

**Invarianten, die durchgehend gehalten wurden:** GMIA bleibt **Default und mathematisch
unverändert** (λ = 1e9), die bestehende Echtzeit‑Diagnoseschleife bleibt für die
synchronen Engines unangetastet, und es gibt keine zerstörerische DB‑Migration der
GMIA‑Referenzen.

---

## 1. Ausgangslage (wo wir herkamen)

Vor dem Zeitraum war Zanobot eine Offline‑first‑PWA (TypeScript/Vite) mit **einer**
Auswertung: **GMIA** (Generalized Mean / energie‑gewichteter Cosine‑Vergleich mit
tanh²‑Kennlinie). Zwei große Dateien (`1-Identify.ts`, `3-Diagnose.ts`) trugen den
Großteil der Logik — schwer testbar, schwer erweiterbar. Das Ziel der acht Tage war
zweierlei:

1. **Fundament legen**, um mehrere Auswerteverfahren *sauber nebeneinander* betreiben zu
   können (Engine‑Plattform), und
2. **die Diagnose‑Qualität und ‑Transparenz** für stationäre Maschinen messbar zu
   verbessern (Robustheit + Experten‑Visualisierung).

---

## 2. Chronologie der acht Tage

### Phase A — Architektur‑Refactoring, Bundle & PWA (20.–22.06.)

**Was:** Konsequente Extraktion in eigenständige, **unit‑getestete** Module:

- Aus `1-Identify.ts`: `MachineHistoryModal`, `QrShareModal`, `NfcWriteModal`,
  Mikrofon/Hardware‑Controller, History/Sparkline‑SVG‑Helfer, Fleet/Score‑Statistik
  (`fleetStats`), `MachineOverviewRenderer`, `FleetRankingRenderer`, `FleetCreationModal`,
  `MachineDetailModal`, `NfcOnboardingController`, `ScannerController`, `QuickSelectList`,
  `DashboardRenderer`.
- Aus `3-Diagnose.ts`: reine Analyse‑Helfer nach `analysisRender.ts`,
  `maintenanceExport`, `getScoreVerbalStatus` (getestet).
- Aus `2-Reference.ts`: `referenceAudioExport`, `referenceLabelModal`.

**Warum:** Testbarkeit + Vorbereitung der Engine‑Plattform. Reine Funktionen ohne
`this`‑State lassen sich isoliert testen und wiederverwenden.

**Begleitend:**
- **Lazy‑Loading** der Phasen (Reference/Diagnose/Auto‑Detection) und der QR‑Bibliotheken
  → kleineres Initial‑Bundle.
- **Repo‑Hygiene:** ~32 MB Junk‑Binaries entfernt.
- **i18n‑Konsistenz:** akkurater Checker + vollständige Schlüsselsätze für `es/fr/zh`
  (146 Fallback‑Keys übersetzt). Der Checker erzwingt seither, dass **jede** Sprache
  **alle** Keys hat.

### Phase B — UX & mess‑sichere PWA (23.–24.06.)

- **Mess‑sicherer Update‑Prompt** (`registerType: 'prompt'`): Ein Service‑Worker‑Update
  darf eine laufende Messung **nicht** unterbrechen. Der Nutzer muss aktiv zustimmen.
  (Wichtige Konsequenz für Tests: Neuer Code wird erst nach Bestätigen/Hard‑Reload aktiv.)
- **Health‑Status‑Zusammenfassung** im Maschinen‑Detail.
- Bugfixes: „Neue/Erste Maschine anlegen“‑Buttons, Ergebnis‑Screen‑Glättung
  (feste Slot‑Reihenfolge + Fade‑in), Lesbarkeit des Frequenz‑Charts (theme‑aware).

### Phase C — Engine‑Plattform (26.06.)

Der inhaltlich dichteste Tag. Drei große Stränge:

1. **Engine‑Gerüst (Tier 0).** Ein **`DiagnosisEngine`**‑Interface, ein
   **GMIA‑Wrapper** (byte‑identisch), eine **Registry** zur Dispatch‑Auswahl nach
   `model.engineId`, ein **Settings‑Umschalter** und eine **DB‑Migration**. Zweck laut
   Briefing §7 bewusst „trivial“: die Umschaltmechanik end‑to‑end absichern, *bevor* das
   schwere YAMNet dazukommt.

2. **Der Pivot: diagonale Mahalanobis → Spektral‑Cosine‑One‑Class.** Die erste
   Alternativ‑Engine war eine diagonale Mahalanobis‑Distanz. Felddaten zeigten ein
   **strukturelles** Problem (siehe §3.3): Bei N ≪ 512 Trainings‑Frames ist die
   Per‑Bin‑Varianz instabil; leise Rausch‑Bins mit winziger Varianz dominierten die
   Distanz. Auch nach Varianz‑Shrinkage blieb das Symptom. Lösung: Umstellung auf eine
   **energie‑gewichtete, skalen‑freie Cosine‑One‑Class‑Methode** — derselbe Wirkmechanismus,
   der GMIA robust macht.
   - **+ BEAM Sub‑Band‑Matching (Paper A)** und **k‑NN über Sub‑Fenster (§17.2)**: statt
     nur gegen ein Mittelspektrum zu vergleichen, wird die Aufnahme in Sub‑Bänder und
     Sub‑Fenster zerlegt → trägt **multimodale** Signaturen besser.
   - **Auto‑Detection engine‑aware** gemacht (Cosine‑Maschinen werden korrekt erkannt).

3. **YAMNet als dritte Engine (Beta).** Neuronale Variante über
   **AudioSet‑Embeddings**. Erforderte einen **asynchronen** Engine‑Pfad
   (`AsyncDiagnosisEngine`): 16‑kHz‑Resampler, 1‑s‑Ringpuffer (unit‑getestet), lazy
   TF.js‑Load, Embedding + Cosine‑k‑NN, getrennte Trainings‑/Diagnose‑Zweige in
   `2-Reference` / `3-Diagnose`. GMIA und Spektral‑Cosine bleiben **synchron** und
   unberührt.
   - Bugfix: Eine getroffene **Fehler‑Referenz** wird nicht mehr fälschlich als
     „healthy“ gespeichert.

### Phase D — Politur, Diagnostik, Personalisierung (27.06.)

- **DSP‑Robustheit:** `averageSpectrum()` nutzt jetzt **Per‑Bin‑Median** über die Fenster
  (statt Mittelwert) → robust gegen Transienten/Klicks. Gemeinsame Primitive für
  Iris/Ghost/Quick‑Compare/SpectrumComparison.
- **Energy‑Gate (Spektral‑Cosine):** `trainingRms` wird gespeichert; der Score wird mit
  dem Verhältnis Live‑/Trainings‑RMS skaliert (GATE_LO = 0,08 / GATE_HI = 0,25). Folge:
  **Stille scort niedrig** statt 50–60 %.
- **Experten‑Visualisierung für alle drei Engines:** Log‑Log‑Spektrum mit beschrifteten
  Peak‑Frequenzen, **Referenz‑„Ghost“**‑Overlay, **Work‑Point‑Ranking** (auch für YAMNet),
  Frequenz‑Abweichungs‑Plot.
- **Ghost‑Skalierung:** Die gestrichelte Referenzkurve lag visuell fast doppelt so hoch
  wie das Live‑Spektrum (anderer Amplituden‑Transform). `GHOST_AMPLITUDE_GAIN`
  1,0 → **0,7** trimmt sie um ~30 %, sodass sie sich deckt.
- **Banner‑Personalisierung (komplett):** Zuschneide‑Modal mit Pinch‑Zoom, **pro‑Theme**
  Bild + Text + Textposition, Häkchen „Text ausblenden“, theme‑aware Vorschau,
  Lesbarkeits‑Halo, sauberes Reset (Bild **und** Text/Position/Hidden).
- **History „schlechte Merkmale“** (heute neu): siehe §3.6.
- **Rename‑Hygiene:** `mahalanobis` → `spectral-cosine` als sauberer Schnitt (siehe §3.3,
  „bewusste Altlast“).

---

## 3. Technische Tiefe je Themenblock

### 3.1 Engine‑Architektur (Strategy‑Pattern, sync/async)

Zentrale Datei: `src/core/ml/engine/types.ts`.

- **`DiagnosisEngine` (synchron):** `train(input, machineId) → ReferenceModel`,
  `classify(models, frame) → DiagnosisResult`, `scoreAll(models, frame) → WorkPointScore[]`.
  GMIA und Spektral‑Cosine rechnen synchron → die heikle Echtzeitschleife
  `processChunkDirectly()` in `3-Diagnose.ts` bleibt unverändert.
- **`AsyncDiagnosisEngine` (asynchron):** zusätzlich `init(): Promise<void>` (lazy,
  schwer), `isAsync: true`, optional `dispose()`. Bewusst **getrennt** gehalten, damit der
  synchrone Dispatcher und die bestehenden Engines völlig unangetastet bleiben.
- **`FrameInput`:** bietet je Frame sowohl das **512‑Bin‑Relative‑ESD‑Feature** (GMIA,
  Spektral‑Cosine) als auch optional den **rohen 330‑ms‑Chunk** (`rawChunk`, für YAMNet).
  Jede Engine nimmt, was sie braucht.
- **`EngineId = 'gmia' | 'spectral-cosine' | 'yamnet'`.** Dispatch erfolgt über die
  **Registry** anhand des gespeicherten `model.engineId`.

**Designprinzip:** „GMIA ist heilig“. Jede Erweiterung wurde additiv gebaut; der
Default‑Pfad und λ = 1e9 sind nie angefasst worden.

### 3.2 Die drei Engines im Vergleich

| | **GMIA** (Default) | **Spektral‑Cosine** (One‑Class) | **YAMNet** (Beta) |
|---|---|---|---|
| **Feature** | 512‑Bin relative ESD | 512‑Bin relative ESD | AudioSet‑Embedding (1024‑dim) aus rohem 16‑kHz‑Audio |
| **Referenzmodell** | regularisierter Gewichtsvektor `w_p` | Mittelspektrum μ + `scalingConstant C` (+ optional BEAM‑Bank) | Menge von Embedding‑Ankern |
| **Score** | `cos(w_p, f)` → tanh²‑Kennlinie, baseline‑normiert | `cos(μ, f)` bzw. Sub‑Band‑k‑NN → tanh²‑Kennlinie | Cosine‑k‑NN im Embedding‑Raum |
| **Skalierung** | scale‑frei (Cosine) | scale‑frei + **Energy‑Gate** (Stille → niedrig) | scale‑frei (Embedding) |
| **Sync/Async** | sync | sync | **async** (TF.js, lazy) |
| **Stärke** | bewährt, robust, interpretierbar | leichtgewichtig, multimodal (k‑NN) | semantisch reichhaltig, lernt „Klangtypen“ |
| **Grenze** | eine Mittel‑Signatur | weiterhin **stationär** gedacht | 0,96‑s‑Fenster, „Alltagsklang“-Bias |

**Gemeinsame, fundamentale Grenze:** Alle drei reduzieren die Aufnahme letztlich auf eine
(oder wenige) **zeit‑gemittelte** spektrale/embeddete Signatur(en). Sie modellieren
**„wie klingt es im Mittel?“** — nicht **„wie entwickelt sich der Klang über die Zeit?“**.
Genau hier setzt die geplante 4. Engine an (§6).

### 3.3 Der Pivot Mahalanobis → Spektral‑Cosine (warum)

Belege: `docs/TIER0_ENGINE_PIVOT_COSINE.md`, `docs/TIER0_UMSETZUNGSBERICHT.md`.

- **Symptom im Feld:** Ein *passendes* Signal scort 0 statt hoch; Stille scort 50–60 %.
- **Ursache:** Diagonale Mahalanobis `Σ (fᵢ−μᵢ)²/σᵢ²` ist bei **N ≪ 512** Trainings‑Frames
  schlecht konditioniert: leise Bins (Rauschboden) haben winzige σ² → ihr Beitrag
  explodiert; die Distanz wird vom **Rauschboden** dominiert, nicht von den lauten,
  informativen Peaks. Varianz‑Shrinkage (erster Fix) milderte, behob es nicht.
- **Warum GMIA das Problem nicht hat:** Cosine ist **energie‑gewichtet** (laute Peaks
  dominieren) und **skaleninvariant**; GMIA kalibriert auf **Cosine‑Wert‑Niveau**
  (`C = atanh(√0,9)/μ`), nicht auf einer Streuung. Das deckt sich mit Briefing **§17.2**:
  *„Mahalanobis ist die parametrische Alternative; k‑NN/Cosine ist nicht‑parametrisch und
  bei sehr wenig Daten oft robuster.“*
- **Lösung:** energie‑gewichtete, skalen‑freie **Cosine‑One‑Class**‑Engine; value‑kalibriert
  wie GMIA. Ergebnis in Tests: passendes Signal **> 75 % / healthy**.
- **Bewusste Altlast:** Beim Rename `mahalanobis → spectral-cosine` wurde **keine
  Migration** gebaut — alte „mahalanobis“‑Referenzen sind verwaist (vom Nutzer akzeptiert,
  da Beta). GMIA‑Referenzen sind nicht betroffen.

### 3.4 DSP‑Robustheit

- **Per‑Bin‑Median statt Mittelwert** in `averageSpectrum()`: Ein Median über die
  STFT‑Fenster ist robust gegen einzelne Transienten (Türklappen, Klicks), die einen
  Mittelwert verzerren würden. (Ironischerweise ist genau diese Transienten‑Unterdrückung
  ein Grund, warum die *vierte* Engine eine andere Pipeline braucht — sie *will* die
  Transienten sehen, siehe §6.)
- **Energy‑Gate:** Score‑Skalierung mit Live/Training‑RMS verhindert „falsch‑gesund bei
  Stille“.

### 3.5 Experten‑Visualisierung

- **Log‑Log‑Spektrum** mit beschrifteten Peak‑Frequenzen.
- **Referenz‑Ghost** (gestrichelt) hinter dem Live‑Spektrum, jetzt korrekt skaliert (0,7).
- **Work‑Point‑Ranking** für alle Engines (auch YAMNet): zeigt, welches Referenzmodell /
  welcher Betriebspunkt am besten passt.
- **Frequenz‑Abweichungs‑Plot** + Betriebspunkt‑Warnung (dominante Frequenz verschoben →
  evtl. andere Drehzahl/Last statt Defekt).

### 3.6 History „schlechte Merkmale“ (heute neu)

**Motivation des Nutzers:** Im Verlauf sollen erkannte **Auffälligkeiten** (Frequenzbänder,
in denen die Messung Energie hat, die die Referenz nicht hat) dokumentiert werden — als
**Liste** (auch schwache Werte) und als **rote Marker** in der Zeitachse (ab Stärke 50 %).

**Umsetzung:**
- **`topDeviations(ref, meas, nyquist)`** (neu, unit‑getestet): findet Bänder mit der
  meisten *neu hinzugekommenen* relativen Energie. **Stärke 0–100 %** = Anteil der Energie
  dieses Bandes, der **nicht** durch die Referenz erklärt ist (≈100 % = neuer Ton, 50 % ≈
  doppelte Referenz‑Energie). Rauschboden‑Bins werden verworfen, Nachbar‑Peaks gemerged.
- **Persistenz:** Auf dem Ergebnis‑Screen (wo Referenz‑ und Mess‑Spektrum vorliegen) werden
  die Merkmale einmalig berechnet und am Test gespeichert
  (`DiagnosisResult.analysis.frequencyAnomalies`). Ältere Tests werden **nachgefüllt**,
  solange ihr Audio noch vorhanden ist.
- **Verlauf‑Grafik (`HistoryChart`):** Tests mit starkem Merkmal (≥ 50 %) erhalten roten
  Punkt + roten Ring und werden mit einer **roten gestrichelten Linie** verbunden — die
  Health‑Trendlinie und die Referenz‑/Schwellenlinien bleiben unverändert. Tooltip zeigt
  das stärkste Merkmal.
- **Liste:** „Auffällige Merkmale (letzte Prüfung)“ im Verlauf‑Modal.

**Konzeptioneller Hinweis:** Dies ist bereits ein **erster, sehr einfacher Schritt in die
zeitliche Dimension** — aber nur als Buchhaltung *über mehrere getrennte Tests hinweg*,
nicht als Modell des Klang‑Verlaufs *innerhalb* einer Aufnahme.

### 3.7 Banner‑Personalisierung

Vollständige, pro‑Theme Personalisierung des Start‑Banners: Zuschneide‑Modal
(Drag/Pinch‑Zoom, 1024×500‑Ausgabe), Bild + Überschrift + Unterzeile + Textposition (zwei
Schieberegler), „Text ausblenden“, theme‑aware Vorschau, Lesbarkeits‑Halo, sauberes Reset.
Technisch interessant: Init‑Reihenfolge‑Fix (BannerManager **vor** dem Router), Crossfade
zwischen zwei Hero‑Layern, und das Lesen des **gespeicherten** Blobs für die Vorschau
(statt der asynchron umschaltenden Live‑Ebene).

### 3.8 Stabilität / PWA / i18n

- 5 Sprachen (de/en/es/fr/zh), **1.234 Keys**, durch `check-i18n-consistency.mjs`
  erzwungen.
- Theme‑aware Statusleiste/Overscroll.
- Mess‑sicherer Update‑Prompt.

---

## 4. Aktueller Stand (Snapshot)

- **Engines:** 3 (GMIA default/sync, Spektral‑Cosine sync, YAMNet async/Beta), sauber über
  Registry + Settings umschaltbar.
- **Feature‑Pipeline:** 330‑ms‑Frames, 512‑Bin relative ESD (Σ = 1); für YAMNet zusätzlich
  16‑kHz‑Resample + 1‑s‑Ringpuffer.
- **Tests:** **239 grün** (2 skipped), `tsc`/ESLint/Vite‑Build sauber, GMIA‑Regression
  unverändert grün.
- **Qualität/Transparenz:** Mess‑Qualitäts‑Gate, Betriebspunkt‑Warnung, Experten‑Plots,
  „schlechte Merkmale“ im Verlauf.
- **Bewusste Grenzen:**
  1. **Stationaritäts‑Annahme** in allen drei Engines (zeit‑gemittelte Signatur).
  2. **Keine echte Feldmessung von AUC/pAUC** auf Benchmark‑Datensätzen (MIMII DG /
     ToyADMOS2) — der eigentliche Hebel, um Engine‑Güte zu beziffern.
  3. YAMNet ist Beta (0,96‑s‑Fenster, Alltagsklang‑Bias von AudioSet).

---

## 5. Literatur‑ und Methoden‑Grundlage (bisher)

Im Projekt referenziert / wirksam:

- **Interne Spezifikation:** *Build‑Briefing „Zuschaltbare Alternativ‑Auswertung neben
  GMIA“* (§5 Engine‑Interface, §7 Tier 0 One‑Class/Mahalanobis, §8 Kalibrierung, §9
  Multiclass, §12 Datenmodell/DB, §17.2 k‑NN vs. Mahalanobis, §18 Quellen) und das
  *Mathematik*-Dokument (512‑Bin ESD, GMIA‑Gleichungen 2 & 4, tanh²‑Score,
  baselineScore‑Kalibrierung).
- **GMIA** (Generalized Mean / energie‑gewichteter Cosine‑Vergleich) — Kern der
  Default‑Engine; in `docs/about-zanobo.md` von patentierter Systemlogik abgegrenzt
  (nur offen beschriebene Mathematik, MIT‑Lizenz).
- **One‑Class / k‑NN über Sub‑Fenster** (Briefing §17.2) — Grundlage der
  Spektral‑Cosine‑Engine.
- **BEAM Sub‑Band‑Matching** („Paper A“) — Sub‑Band‑Zerlegung der Spektral‑Engine.
- **YAMNet / AudioSet** — Embedding‑Encoder der 3. Engine.
- **Benchmark‑Datensätze (vorgemerkt, noch nicht gemessen):** **MIMII / MIMII DG**,
  **ToyADMOS2**, **DCASE Task 2** (Anomalous Sound Detection, inkl. Domain‑Shift).

> Für die 4. Engine ist diese Liste **bewusst zu erweitern** (siehe §6.4): Sequenz‑/
> Ereignis‑/Bewegungs‑Modelle gehören methodisch in eine andere Familie als die bisherigen
> „mittelnden“ Verfahren.

---

## 6. Nächster großer Schritt — Vierte Engine: nicht‑stationäre, bewegte und transiente Geräusche

> **Diskussionsvorlage (auch für eine andere KI).** Dieser Abschnitt formuliert das
> Problem, warum die bestehenden Engines hier strukturell nicht ausreichen, eine Taxonomie
> der Zielsignale, kandidatische Lösungsansätze samt Literatur‑Richtungen, den
> Architektur‑Fit und die Evaluationsfrage. Ziel ist **gemeinsame Bewertung**, noch keine
> festgelegte Implementierung.

### 6.1 Problemstellung

Die bisherigen Engines beantworten „klingt der **Dauerzustand** dieser Maschine wie die
Referenz?“. Viele reale Fälle sind aber **nicht‑stationär**:

- **Zeitvariante Maschinen:** Anlagen mit Zyklen/Phasen (Anlauf → Last → Auslauf,
  Pressen, Roboterzellen, Förderbänder mit Takt).
- **Bewegte Quellen:** Der Prüfling oder das Mikrofon bewegt sich; das Spektrum „wandert“
  über die Aufnahme (mehrere Betriebspunkte/Positionen in *einer* Messung).
- **Transiente Ereignisse:** Kurze, seltene Geräusche (Klacken, Schlagen, Knacken,
  Schleifen‑Impulse) — diagnostisch oft am wichtigsten, vom Median aber gerade
  *unterdrückt*.

**Kerngedanke:** Wir müssen vom **„Spektrum im Mittel“** zur **„Zeit‑Frequenz‑Struktur“**
und zur **Sequenz/Ereignis‑Ebene** übergehen.

### 6.2 Warum die bestehenden drei Engines hier scheitern

1. **Zeit‑Mittelung zerstört die Information.** GMIA/Spektral‑Cosine mitteln (jetzt sogar
   **median**, §3.4) über die Aufnahme — genau die transiente/zeitvariante Information geht
   verloren bzw. wird absichtlich entfernt.
2. **Eine Signatur ≠ eine Trajektorie.** Eine bewegte Aufnahme ist eine **Wolke/Bahn**
   im Feature‑Raum. Die k‑NN‑Variante (§3.2) ist ein Teilschritt, modelliert aber **keine
   Reihenfolge** (Zeitachse).
3. **YAMNets 0,96‑s‑Fenster** erfasst kurze Transienten nur grob und ist auf
   „Alltagsklassen“ (AudioSet) vortrainiert, nicht auf Maschinen‑Mikrostruktur.
4. **Kein Alignment gegen Tempo/Last:** Variiert die Zyklusdauer, fehlt jeder Mechanismus,
   zwei Aufnahmen zeitlich aufeinander auszurichten.

### 6.3 Taxonomie der Zielsignale (für die Diskussion zu schärfen)

| Klasse | Beispiel | Diagnostische Frage |
|---|---|---|
| **Quasi‑periodisch‑instationär** | Anlauf/Auslauf, Drehzahlrampe | Ist der *Verlauf* (Ramp) normal? |
| **Zyklisch/getaktet** | Presse, Roboterzelle, Förderer | Stimmt die *Sequenz der Phasen*? |
| **Bewegte Quelle/Mikrofon** | Abschreiten einer Anlage | Liegt jede *Position* im Normalbereich? |
| **Transient/Ereignis** | Lagerschlag, Klacken | Tritt ein *anomales Ereignis* auf? |

### 6.4 Kandidatische Lösungsansätze + Literatur‑Richtungen

> Bewusst als **Optionen** formuliert; Quellenangaben sind **Richtungen zur Verifikation**,
> kein Festlegen. (Wissensstand bis ~Anfang 2026 — bitte vor Umsetzung gegenprüfen.)

**A) Zeit‑Frequenz‑Sequenzmodell (Encoder über Frames + temporale Aggregation).**
   Frames behalten, ihre **zeitliche Abfolge** modellieren statt mitteln.
   - *Klassisch:* RNN/LSTM‑ oder TCN‑**Autoencoder** auf Mel/Log‑Mel‑Sequenzen;
     Rekonstruktionsfehler = Anomalie‑Score (verbreitet in **DCASE Task 2**).
   - *Transformer:* **AST** (Audio Spectrogram Transformer), **BEATs**, **PANNs (CNN14)**,
     **CLAP** als reichhaltigere Encoder als YAMNet; Embedding‑Sequenz + Aggregator.
   - *One‑Class:* Embedding‑Sequenz → **Deep SVDD** / Mahalanobis im Embedding‑Raum
     (robuster als im Rohspektrum).

**B) Sequenz‑Alignment / variable Geschwindigkeit.**
   - **Dynamic Time Warping (DTW)** zwischen Mess‑ und Referenz‑Sequenz: toleriert
     Tempo‑/Lastvariation; Distanz als Score. Gut interpretierbar, leicht „erklärbar“.
   - **Hidden Markov Models (HMM)** für **getaktete** Maschinen: Phasen als Zustände, die
     **Phasenfolge** wird selbst zum Merkmal.

**C) Time‑Series‑Novelty / Changepoint (gerätelokal, leichtgewichtig).**
   - **Matrix Profile** (Motif/Discord‑Discovery) auf einer skalaren Energie‑/Feature‑Zeitreihe
     → findet wiederkehrende Muster und **Diskords** (seltene Anomalien) ohne Training.
   - **Changepoint‑Detection** für Betriebspunkt‑Wechsel.

**D) Sound‑Event‑Detection (SED) für Transienten.**
   - **Onset‑Detection** + Ereignis‑Klassifikation (Richtung **DCASE Task 4**): kurze
     Ereignisse explizit segmentieren und bewerten — statt sie zu mitteln.
   - Verbindet sich natürlich mit dem heutigen „schlechte Merkmale“‑Konzept (§3.6), nur auf
     der **Zeitachse innerhalb einer Aufnahme**.

**Pragmatische Empfehlung zur Diskussion:** Ein **zweistufiger** Ansatz —
*(i)* eine **schlanke, trainingsfreie** Basis (DTW gegen Referenz‑Sequenz **oder** Matrix
Profile) als sofort interpretierbarer Einstieg, kombiniert mit
*(ii)* einer **Embedding‑Sequenz + One‑Class** (A) für semantische Tiefe. Stufe (i) hält die
Offline‑/Browser‑Constraints leicht; (ii) skaliert die Güte. Das spiegelt exakt unsere
bewährte Linie „erst schlank/interpretierbar, dann neuronal“ (Tier 0 → Tier 1).

### 6.5 Architektur‑Fit

- **Async ist bereits da:** `AsyncDiagnosisEngine` (für YAMNet gebaut) passt 1:1, falls die
  4. Engine ein Modell lädt. Eine **trainingsfreie** DTW/Matrix‑Profile‑Variante könnte
  sogar **synchron** bleiben.
- **`FrameInput` bietet schon `rawChunk`** und die Frame‑Features — eine
  **Sequenz‑sammelnde** Schicht (Ringpuffer wie bei YAMNet) liefert die Zeitreihe.
- **Neues Referenzmodell‑Format** nötig: eine **Sequenz/Trajektorie** (oder
  HMM‑Parameter / Embedding‑Set + Reihenfolge) statt eines einzelnen μ. `engineId` z. B.
  `'temporal'` o. ä.; sauberer additiver Eintrag in der Registry, GMIA unangetastet.
- **Visualisierung:** Statt eines statischen Ghost‑Spektrums eher ein **Spektrogramm‑
  Diff** über die Zeit und eine **Ereignis‑Zeitleiste** — knüpft an §3.6 an.

### 6.6 Evaluation / Datensätze

- **Erst messen, dann bauen.** Vor der 4. Engine die offene Messung aus §4 nachholen:
  AUC/pAUC der bestehenden Engines auf **MIMII DG** und **ToyADMOS2** (beide enthalten
  instationäre/getaktete Fälle) → quantifiziert, *wie groß* die Lücke wirklich ist und gibt
  eine **Baseline** für die 4. Engine.
- **Eigene Feld‑Aufnahmen** der Zielklassen (§6.3) sammeln — insbesondere bewegte und
  transiente Fälle, die in Benchmarks unterrepräsentiert sind.

### 6.7 Risiken & offene Fragen (für die KI‑Diskussion)

1. **Browser‑/Offline‑Budget:** Sequenzmodelle sind teurer. Was ist die schlankste Variante
   mit messbarem Mehrwert (DTW vs. LSTM‑AE vs. Embedding‑One‑Class)?
2. **Trainingsdaten‑Menge:** Wie viele Referenz‑Sequenzen braucht ein robustes Modell pro
   Maschine? (Heute: oft **eine** Referenzaufnahme.)
3. **Tempo‑/Last‑Invarianz vs. Sensitivität:** DTW toleriert Tempo — verschleiert es damit
   echte Fehler? Wo ist die Grenze?
4. **Erklärbarkeit:** Wie zeigen wir „wo in der Zeit“ es anomal war (analog zu „schlechte
   Merkmale“, aber auf der Zeitachse)?
5. **Abgrenzung der Engines:** Soll die 4. Engine die instationären Fälle *übernehmen* oder
   als Vorstufe *erkennen* („das ist nicht stationär → nutze Engine 4“)?

---

## 7. Offene Punkte / Backlog

- [ ] **AUC/pAUC‑Messung** der drei Engines auf MIMII DG / ToyADMOS2 (Baseline).
- [ ] 50 %‑Schwelle der „schlechten Merkmale“ im Feld validieren/justieren.
- [ ] YAMNet aus Beta heben (Fenster‑/Bias‑Themen, Worker‑Inferenz).
- [ ] Konzept‑Entscheid 4. Engine (§6.4) nach Diskussion + Messung.
- [ ] Optionale Migration verwaister „mahalanobis“‑Referenzen (derzeit bewusst nicht).

## 8. Diskussionsfragen für die andere KI

1. Welcher der Ansätze A–D (§6.4) bietet das **beste Verhältnis aus Güte, Erklärbarkeit und
   Browser‑Kosten** für offline‑first?
2. Ist ein **trainingsfreier DTW/Matrix‑Profile‑Einstieg** ein sinnvoller „Tier‑2‑trivial“-
   Schritt (analog zu Tier 0), bevor ein neuronales Sequenzmodell kommt?
3. Welche **Benchmark‑Teilmengen** isolieren instationäre/bewegte/transiente Fälle am
   saubersten?
4. Wie sollte die 4. Engine mit den bestehenden **koexistieren** (Auto‑Erkennung
   stationär vs. instationär)?
5. Welche **minimale Referenz‑Datenmenge** ist realistisch erhebbar, und welches Modell
   verträgt das?

---

*Erstellt am 27.06.2026. Faktenbasis: Git‑Historie 20.–27.06.2026, `docs/TIER0_*`,
`src/core/ml/engine/*`, `src/ui/phases/analysisRender.ts`, `src/ui/components/HistoryChart.ts`.*
