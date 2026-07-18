# Konzept: Tier 2 — Temporal-Engine für nicht-stationäre, bewegte und transiente Geräusche

**Status:** T2-a1 + T2-a2 + T2-a3 umgesetzt (Tier 2a vollständig).

*T2-a1* (Engine `temporal` mit Frame-Bank + DMM/RDP-Aggregation, LONO-
Kalibrierung, Mess-Labor-Anbindung). Labor-Messung auf synthetischem
Valve-Datensatz (Anomalie nur in seltenen Klack-Transienten, natürliche
Amplituden-/Detune-Varianz pro Clip, 20 Normal-/8-Anomal-Clips à 12 s):
**AUC GMIA 0,375 · Spektral-Cosine 0,738 · Zeitmuster (Tier 2) 0,925** —
die Temporal-Engine trennt genau dort, wo Mittelwert-Signaturen blind sind.

*T2-a2* (Ereignis-Pfad T3 §4.4: Onset-Gate, Ereignis-Bank, Ereignisdichte-
Wächter, Ereignis-Zeitleiste im Expert-UI). Labor-Messung Missing-Beat-
Datensatz (Anomalie = Takt von 120/min auf 30/min ausgedünnt, Klack-Spektrum
unverändert): **AUC GMIA 0,050 · Spektral-Cosine 0,388 · Zeitmuster (Tier 2)
1,000** — die Mittelwert-Engines halten den fehlenden Takt sogar für
GESÜNDER (AUC < 0,5), nur der Dichte-Wächter sieht den Befund. Die
T2-a1-Messung bleibt mit Ereignis-Pfad unverändert (0,925, kein Fehlalarm
des Dichte-Wächters).

*T2-a3* (Zyklus-Pfad T4 §4.5: Autokorrelations-Periode, DTW mit Sakoe-
Chiba-Band ±15 % gegen ein phasen-aligniertes, ausreißer-getrimmtes
Zyklus-Template; Auto-Empfehlung §7 beim Anlernen). Labor-Messung
Zyklusform-Datensatz (Anomalie = GESPIEGELTER 2-s-Lastzyklus, gleiche
Spektren, gleiche Pegelverteilung, andere Reihenfolge): **AUC GMIA 0,425 ·
Spektral-Cosine 0,450 · Zeitmuster (Tier 2) 1,000** — Reihenfolge im
Zyklus ist für Mittelwert-Signaturen UND Frame-kNN prinzipbedingt
unsichtbar, nur DTW sieht sie. Domänentrennung T3/T4: Takte < 1 s gehören
dem Dichte-Wächter, Lastzyklen ≥ 1 s dem DTW-Pfad (spikige Hüllkurven
eichen nicht stabil). Regressionen: valveset 0,925 und Missing-Beat 1,000
unverändert.

Echte MIMII-Valve/Slider-Baseline (T2-0) steht noch aus (Datensatz-Download
durch den Betreiber). Nächste Stufe wäre T2-b (nur bei nachgewiesener
Restlücke), siehe Stufenplan §9.
**Datum:** 2026-07-02
**Grundlage:** 8-Tage-Rückblick §6 (Diskussionsvorlage 4. Engine), Diagnose-Mathematik-Doku,
Tier-0-Berichte, plus Forschungsstand 2026 (Quellen in §10)

---

## 0. Kurzfassung

Alle drei bestehenden Engines (GMIA, Spektral-Cosine, YAMNet) reduzieren eine
Aufnahme auf eine **zeitgemittelte** Signatur — sie beantworten „wie klingt es
im Mittel?". Für Ventile, Pressen, Roboterzellen, Anfahr-Rampen und bewegte
Aufnahmen ist genau das die falsche Frage. Der Zahlenbeleg aus der aktuellen
Literatur ist drastisch: Auf den nicht-stationären MIMII-Maschinen (Valve)
liegt Mean-Pooling-basiertes Matching bei **~53–55 % AUC (Ratenniveau)**,
während transienten-erhaltende Verfahren (Temporal-Max/LPC) auf **bis zu
99,9 % AUC** kommen [BEAM, Tab. „MIMII", Fig. 5]. Die Lücke ist also nicht
graduell, sondern kategorisch — und sie ist mit browser-tauglichen,
**trainingsfreien** Mitteln schließbar.

**Vorschlag:** Tier 2 = eine vierte, synchrone Engine `temporal`, die die
vorhandene 512-Bin-Frame-Pipeline **behält**, aber drei Dinge ändert:

1. **Zeit behalten statt mitteln:** Referenz = Frame-Bank + Trajektorie
   (nicht ein Mittelspektrum µ).
2. **Anomalie-Zeitreihe statt Einzelwert:** pro Frame eine kNN-Anomalie,
   dann **deviation-/max-bewusste temporale Aggregation** (DMM aus AdaBEAM,
   RDP aus Wilkinghoff et al. 2026) statt Trimmed Mean.
3. **Zwei Spezialpfade:** ein **Ereignis-Pfad** (Onsets segmentieren und
   gegen eine Ereignis-Bank prüfen — das invertierte Cherry-Picking) und ein
   **Zyklus-Pfad** (Hüllkurven-Template + DTW mit engem Warping-Band für
   getaktete Maschinen).

Alles davon ist synchron, trainingsfrei und interpretierbar („Tier-2a"),
folgt also exakt der bewährten Linie „erst schlank/interpretierbar, dann
neuronal". Ein Embedding-Sequenz-Ausbau (BEATs/EAT, async) ist als Tier-2b
vorgesehen, aber erst nach Messung.

---

## 1. Ausgangslage (aus den internen Dokumenten)

- **Drei Engines, eine gemeinsame Grenze** (Rückblick §3.2): GMIA (Cosine
  gegen w_p), Spektral-Cosine (Cosine/kNN gegen µ bzw. Sub-Fenster-Bank,
  inkl. BEAM-Sub-Bändern) und YAMNet (Embedding-kNN) mitteln alle über die
  Zeit. Der Score-Filter (Trimmed Mean der letzten 10 Scores) verwirft
  zusätzlich gezielt Ausreißer — und der neue Per-Bin-**Median** in
  `averageSpectrum()` unterdrückt Transienten sogar absichtlich.
- **Cherry-Picking** (Stufe 1) wirft transiente Frames weg. Für stationäre
  Diagnose richtig — für Tier 2 ist genau das das Signal (Rückblick §3.4:
  „Ironischerweise…").
- **Die Engine-Plattform steht:** `DiagnosisEngine` (sync) /
  `AsyncDiagnosisEngine` (async), Registry-Dispatch über `model.engineId`,
  additive DB-Migrationen, Settings-Umschalter — Tier 2 ist ein weiterer
  Registry-Eintrag, GMIA bleibt unangetastet (Invariante „GMIA ist heilig").
- **`FrameInput` liefert schon alles:** pro 330-ms-Frame das 512-Bin-ESD-
  Feature **und** optional den rohen Chunk. Eine sequenz-sammelnde Schicht
  (Ringpuffer, für YAMNet bereits gebaut) liefert die Zeitreihe.
- **Neu seit Ende Juni:** Lärmprofil-Subtraktion (Pipeline-Stufe 1.5) samt
  Mess-Labor-A/B-Benchmark und SNR-Ampel. Beides ist Tier-2-kompatibel, weil
  es **vor** der Engine auf FeatureVectors arbeitet; das Mess-Labor liefert
  die Evaluations-Infrastruktur gleich mit.

---

## 2. Forschungsstand 2026 (geprüft; Quellen §10)

### 2.1 BEAM / AdaBEAM (arXiv:2603.13749, März 2026)

Training-freies Sub-Band-kNN-Matching (bereits teilweise in unserer
Spektral-Cosine-Engine als „Paper A" umgesetzt). Für Tier 2 sind zwei
Ergebnisse zentral:

- **MIMII-Analyse stationär vs. nicht-stationär:** Fan/Pump (stationär)
  funktionieren mit Temporal-**Mean** gut; Slider/Valve (nicht-stationär)
  brechen mit Mean ein und brauchen Temporal-**Max**: z. B. valve-id_00
  ≈ 53–55 % AUC (Mean) vs. **99,9/99,4 % AUC** (LPC-Spektrum bzw. Log-Mel
  Temporal-Max). Wörtlich: *„temporal max pooling consistently outperformed
  temporal mean pooling, highlighting the importance of retaining transient
  information for non-stationary machines."*
- **DMM (Dynamic Mean–Max):** zwei Speicher-Sichten (mean- und max-gepoolt)
  parallel scoren und parameterfrei fusionieren → robust, ohne pro Maschine
  wählen zu müssen. Genau unser „stationär + transient"-Spagat.
- Nebenbefund: das **LPC-Spektrum** (All-Pole-Hüllkurve) ist auf
  nicht-stationären Maschinen überraschend stark (schlägt dort z. T. BEATs)
  und ist billig zu berechnen — ein Kandidat für einen zweiten Feature-Kanal.

### 2.2 Temporal Pooling / RDP (Wilkinghoff, Yadav, Tan; arXiv:2603.04605, März 2026)

Systematische Studie zu temporalem Pooling für trainingsfreies ASD:
**Relative Deviation Pooling (RDP)** gewichtet Zeitabschnitte mit starker
Abweichung stärker (statt sie wegzumitteln); hybrid mit Generalized-Mean-
Pooling schlägt es auf DCASE-2025-Daten sogar trainierte Systeme/Ensembles.
Für uns die Blaupause für die **Aggregation der Frame-Anomalie-Zeitreihe**:
nicht Trimmed Mean (der Anomalie-Spitzen abschneidet), sondern
deviation-gewichtet.

### 2.3 Scoring-Backends (Zhou & Wang; arXiv:2606.19269, Juni 2026)

*„Scoring backends matter more than pooling"*: Der Wechsel des Backends
(kNN-Cosine, Mahalanobis, dichte-normalisiertes kNN/LDN, PCA-Residuum)
verschiebt die Ziel-Domänen-AUC im Mittel um **13,8 Punkte** (bis 53,8),
Pooling nur um 3,2. Beste Einzelmaßnahme: **label-freie Min-Fusion
z-normalisierter Backends** (Selbst-Scores der Referenz als Normierung).
Konsequenz für Tier 2: das Backend modular halten und die Min-Fusion als
günstige Option einplanen; unsere baselineScore-Idee (Selbsttest) ist
konzeptionell genau diese Selbst-Score-Normierung.

### 2.4 DCASE 2026 Task 2 (arXiv:2606.01578, Juni 2026)

Der Community-Benchmark geht 2026 auf **Noise-aware UASD** (Zweikanal
nah/fern). Zwei Anschlüsse für uns: (i) unsere Lärmprofil-Subtraktion
entspricht exakt dem DCASE-2025-Setting („recordings containing only noise"
— Maschine-aus-Aufnahme) und bleibt vor Tier 2 einfach aktiv; (ii) selbst
die AE-Baseline nutzt **5-Frame-Kontextfenster** — zeitlicher Kontext ist
Standard, nur wir mitteln ihn bisher weg.

### 2.5 EPFL Lausanne — IMOS (Chair of Intelligent Maintenance and Operations Systems, Prof. Olga Fink)

Der angefragte Lehrstuhl in Lausanne ist die **IMOS-Gruppe an der EPFL**
(Intelligent Maintenance and Operations Systems). Für Tier 2 relevant sind
ihre methodischen Leitplanken (weniger konkrete Browser-Algorithmen):

- **Invarianz vs. Sensitivität:** Contrastive/Triplet-Feature-Learning, das
  gegen wechselnde **Betriebsbedingungen invariant** bleibt, aber neue
  Fehlertypen erkennt — exakt unsere DTW-Frage „Tempo tolerieren, Fehler
  nicht verschleiern".
- **Zeitlich evolvierende Beziehungen explizit modellieren:** DyEdgeGAT
  (dynamische Graph-Attention über Sensorsignale) für **Early Fault
  Detection** — die akademische Bestätigung, dass der Weg über die zeitliche
  Struktur führt, nicht über bessere Mittelwerte.
- **Residual-basierte Detektion** (Autoencoder-/Input-Output-Residuen unter
  wechselnden Betriebszuständen) und **generative Anomalie-Synthese**
  (Diffusion/GAN) zur Evaluation, wenn echte Fehlerdaten fehlen — Letzteres
  ist eine Idee für unser Mess-Labor (synthetische transiente Anomalien
  einmischen, analog zum SNR-Mixing des Lärm-Benchmarks).

Direkt 1:1 in den Browser übernehmen lässt sich davon nichts (Trainings-
Pipelines, Sensor-Arrays) — aber Tier-2a unten ist so entworfen, dass es
diesen Prinzipien folgt, mit trainingsfreien Mitteln.

---

## 3. Zielbild und Abgrenzung

**Tier 2 beantwortet drei neue Fragen** (Taxonomie aus Rückblick §6.3):

| Zielklasse | Frage | Tier-2-Baustein |
|---|---|---|
| Transient/Ereignis (Ventil, Klacken, Lagerschlag) | Tritt ein anomales **Ereignis** auf? Fehlt ein erwartetes? | Ereignis-Pfad (T3) |
| Zyklisch/getaktet (Presse, Roboterzelle, Rampe) | Stimmt der **Verlauf/Zyklus**? | Zyklus-Pfad (T4, DTW) |
| Bewegt/multimodal (Abschreiten, mehrere Betriebspunkte) | Liegt **jeder Abschnitt** im Normalbereich? | Frame-Bank + DMM/RDP (T1+T2) |

**Nicht-Ziele:** kein Ersatz für GMIA bei stationären Maschinen; keine
Cloud/kein Training zur Laufzeit; kein neues Audio-I/O. Koexistenz statt
Übernahme — siehe §7 (Auto-Empfehlung).

---

## 4. Technisches Konzept Tier-2a (trainingsfrei, synchron)

### 4.1 Referenzmodell `TemporalModel` (engineId `'temporal'`)

Aus der Referenzaufnahme (bestehende Batch-Extraktion, Hop 66 ms) wird
**nicht gemittelt**, sondern gespeichert:

```
interface TemporalModel {
  engineId: 'temporal';
  // T1: Frame-Bank (kNN-Speicher), zeitlich geordnet
  frameBank: Float32Array[];      // ≤ ~150 Frames à 512 Bins (subsampled/quantisiert)
  frameOrder: true;               // Reihenfolge = Trajektorie
  // T3: Ereignis-Bank
  events: Array<{                 // aus Onset-Segmentierung der Referenz
    meanSpectrum: Float32Array;   // 512-Bin-Mittel über das Ereignis
    durationFrames: number;
    energyRatio: number;          // Ereignis-Energie / Grundpegel
  }>;
  eventRatePerMin: number;        // erwartete Ereignisdichte (z. B. Ventil-Takte)
  // T4: Zyklus-Template (nur wenn zyklisch erkannt)
  cycleEnvelope?: Float32Array;   // Energie-Hüllkurve eines Zyklus (downsampled)
  cyclePeriodSec?: number;        // dominante Periode (Autokorrelation)
  // Kalibrierung
  scalingConstant: number;        // tanh²-Kennlinie, wie GMIA/Spektral-Cosine
  baselineScore?: number;         // Selbsttest (Leave-One-Window-Out, §4.6)
  stationarity: number;           // Variationskoeffizient (siehe §7)
  sampleRate: number;
}
```

Größenbudget: 150×512 Float32 ≈ 300 KB → IndexedDB unkritisch; für QR/NFC-
Export ist das Modell zu groß → Export zunächst nur via Backup-Datei
(dokumentierte Grenze, wie YAMNet).

**Wichtig:** Für die Tier-2-Referenz wird Cherry-Picking **nicht**
angewendet (Engine-interner Bypass) — die Transienten sind hier Signal.
Die Lärmprofil-Subtraktion (Stufe 1.5) bleibt dagegen aktiv nutzbar, da
additiver Hallenlärm auch für Tier 2 Störung ist.

### 4.2 T1 — Frame-Anomalie (kNN gegen die Bank)

Pro Live-Frame (das bestehende 512-Bin-Feature):

```
a(t) = 1 − meanTopK( cos(f_t, bank) )        // k≈5, wie SpectralCosine-kNN
```

Das ist exakt der bewährte Mechanismus der Spektral-Cosine-Engine (energie-
gewichtet, scale-frei) — nur wird `a(t)` **nicht sofort verrechnet**,
sondern in einen Sequenz-Ringpuffer geschrieben (z. B. 10 s ≈ 30 Frames).
Backend modular halten (§2.3): kNN-Cosine als Default, LDN-Normierung und
Min-Fusion z-normierter Backends als Messoption im Labor.

### 4.3 T2 — Temporale Aggregation (der eigentliche Hebel)

Aus der Anomalie-Zeitreihe {a(t)} des Fensters wird der Engine-Score:

```
S_mean = GeM_p({a(t)})                        // generalized mean, p≈2
S_max  = softmax-Top-Quantil({a(t)})          // z. B. Mittel der obersten 10 %
S_rdp  = Σ w(t)·a(t),  w(t) ∝ |a(t) − median| // Relative Deviation Pooling
Score  = DMM-Fusion(S_mean, S_max[, S_rdp])   // parameterfrei (Mittel), AdaBEAM-Stil
```

Begründung aus den Daten (§2.1/§2.2): Mean-only verdünnt kurze Anomalien
(Valve: Ratenniveau), Max-only ist rausch-empfindlich; DMM/RDP kombinieren
beides parameterfrei. Der bestehende App-weite Score-Filter (Trimmed Mean
über 10 Scores) muss für Tier 2 **umgangen oder ersetzt** werden — er würde
die Spitzen wieder wegschneiden. Vorschlag: Engine liefert bereits den
sequenz-aggregierten Score; Glättung darüber nur noch mild (Median über 3).

### 4.4 T3 — Ereignis-Pfad (Transienten)

1. **Onset-Gate:** Spectral-Flux/Energie-Sprung auf der Frame-Zeitreihe —
   technisch das invertierte Cherry-Picking (dieselbe Energy-Entropy-Statistik,
   nur als Selektor statt als Filter). Kein neues DSP nötig.
2. **Ereignis-Deskriptor:** Mittelspektrum über die Ereignis-Frames + Dauer
   + Energie-Verhältnis.
3. **Bewertung:** Cosine gegen die Ereignis-Bank der Referenz →
   *bekanntes Ereignis* (Ventil-Klack normal) vs. *anomales Ereignis*.
   Zusätzlich **Ereignisdichte**: deutlich mehr/weniger Ereignisse pro
   Minute als die Referenz ist selbst ein Befund (fehlender Takt!).
4. **Erklärbarkeit:** Jedes Ereignis bekommt einen Zeitstempel → UI-
   **Ereignis-Zeitleiste** (rote/graue Marker), das zeitliche Pendant zu den
   „schlechten Merkmalen" (die bleiben das Frequenz-Pendant).

### 4.5 T4 — Zyklus-Pfad (DTW, nur wenn zyklisch)

1. Beim Anlernen: dominante Periode der Energie-Hüllkurve per
   Autokorrelation; wenn stabil (Peak-Prominenz über Schwelle), wird ein
   **Zyklus-Template** gespeichert (Hüllkurve, ggf. plus grobe 8-Band-
   Spektral-Trajektorie).
2. In der Diagnose: Live-Zyklen segmentieren, **DTW mit Sakoe-Chiba-Band
   (±10–20 % Warping)** gegen das Template. Das enge Band ist die Antwort
   auf die Tempo-vs.-Sensitivität-Frage (Rückblick §6.7.3): moderate Last-/
   Tempovarianz wird toleriert, ein fehlender/vertauschter Phasenabschnitt
   nicht. Kosten: O(n·Band) auf Hüllkurven mit n ≈ 100–300 Punkten —
   browser-trivial.
3. DTW-Distanz → eigener Teilscore; der Alignment-Pfad ist die Erklärung
   („Phase 3 zu lang / fehlt").

Matrix-Profile-Discords als Alternative wurden geprüft und **zurückgestellt**:
stark bei „einmalige Anomalie in langer Aufnahme", aber unsere Diagnosen
sind kurz (5–15 s) und referenzbasiert — kNN-gegen-Bank deckt den Fall ab.

### 4.6 Score, Kalibrierung, Multiclass

- Teilscores (T2-Sequenz, T3-Ereignis, T4-Zyklus falls vorhanden) werden
  z-normalisiert über die **Selbst-Scores der Referenz** und per
  **Min-Fusion** kombiniert (schlechtester Aspekt zählt — konservativ,
  und exakt die 2026-Empfehlung aus §2.3).
- Kennlinie: `100·tanh(C·(1−A))²` mit Selbsttest-`baselineScore` — aber
  **Leave-One-Window-Out**: Selbsttest-Fenster werden beim kNN von „sich
  selbst" ausgeschlossen, sonst wiederholt sich der Tier-0-Fehler der
  künstlich winzigen Trainings-Streuung durch überlappende Fenster
  (Pivot-Bericht §3.2).
- Multiclass: unverändert Best-Model-gewinnt über `classifyWithEngines`;
  `DiagnosisResult` bleibt der Vertrag (healthScore/status/confidence).

### 4.7 Architektur-Fit (alles vorhanden)

| Baustein | Anknüpfung |
|---|---|
| Engine-Registrierung | `registry.ts`, additiv; `EngineId` + `'temporal'` |
| Sync-Pfad | `DiagnosisEngine` reicht (kein Modell-Download) — Ringpuffer der Frame-Anomalien lebt in der Engine-Instanz, wie `RealtimeBiasMatch` |
| Frames + Roh-Chunk | `FrameInput` liefert beides schon |
| Referenz-Batch | `2-Reference.ts` trainiert engine-agnostisch über `engine.train()` |
| DB | additiv (neues Modellformat unter bestehendem `referenceModels[]`), Migration wie 7→8 |
| Settings/i18n | Engine-Auswahl existiert; +1 Option, 5 Sprachen |
| Mess-Labor | AUC/Noise-Benchmark laufen engine-parametrisiert; Tier 2 einfach als Auswahl ergänzen |
| UI | Ereignis-Zeitleiste als neues Panel (Expert), Spektrogramm-Diff später |

---

## 5. Tier-2b (Ausbau, async — erst nach Messung)

Embedding-Sequenz statt ESD-Frames: BEATs/EAT-Encoder (laut §2.1/§2.2 klar
stärker als YAMNet), Patch-Embeddings über den vorhandenen Async-Pfad,
gleiche T2-Aggregation (RDP/DMM) und gleiches Backend obendrauf. Kosten:
~90 MB Modell, WebGPU/wasm-Inferenz — nur sinnvoll, wenn Tier-2a im Labor
eine messbare Restlücke lässt. Die Aggregations- und Backend-Schicht aus
Tier-2a wird dabei vollständig wiederverwendet (bewusste Schichtung).

---

## 6. Evaluation — „Erst messen, dann bauen"

Reihenfolge (nutzt das vorhandene Mess-Labor):

1. **Baseline-Messung (vor jeder Implementierung):** AUC/pAUC von GMIA und
   Spektral-Cosine auf **MIMII Slider + Valve** (die etablierten nicht-
   stationären Teilmengen; Fan/Pump als stationäre Kontrolle) und
   ToyADMOS2. Erwartung laut Literatur: Valve nahe Ratenniveau → die Lücke
   wird beziffert, nicht behauptet.
2. **Tier-2a-Zwischenmessungen pro Baustein:** erst T1+T2 (Bank + DMM/RDP)
   — laut §2.1 allein schon der große Sprung —, dann T3, dann T4. Jeder
   Baustein muss seine AUC-Delta-Rechtfertigung im Labor liefern, sonst
   fliegt er (Tier-0-Disziplin).
3. **Transienten-Synthese im Labor** (IMOS-inspiriert): dem Lärm-Benchmark
   folgend synthetische Klack-/Schlag-Anomalien in gesunde Clips mischen →
   kontrollierte Sensitivitätsmessung, wo echte Fehlerdaten fehlen.
4. **Feld:** eigene Aufnahmen der Zielklassen (Ventil, getaktete Anlage,
   Abschreiten) — in Benchmarks unterrepräsentiert.

---

## 7. Koexistenz & Auto-Empfehlung (Antwort auf Rückblick-Frage 4/5)

**Erkennen, nicht übernehmen:** Beim Anlernen wird die vorhandene
Stationaritäts-Kennzahl (Variationskoeffizient der Frame-Energien — bereits
implementiert und geeicht in der Lärmprofil-Stufe) auf die Referenzaufnahme
angewendet:

- CV klein → Empfehlung GMIA/Spektral-Cosine (Status quo).
- CV groß bzw. Onset-Dichte hoch bzw. stabile Periodizität → Hinweis
  „Diese Maschine klingt nicht-stationär — die Zeitmuster-Engine (Tier 2)
  ist dafür gebaut", mit einem Tap umschaltbar. Keine Automatik-Magie,
  der Nutzer entscheidet (Zanobo-Philosophie: Vergleich statt Diagnose).

Minimale Referenzmenge (Rückblick-Frage 5): eine Aufnahme von **2–3 vollen
Zyklen** bzw. ≥ 20 s bei bewegten Aufnahmen; das Quality-Gate prüft
zusätzlich, ob die Ereignis-/Zyklus-Extraktion stabil war (sonst Hinweis
„länger aufnehmen" — Muster der Profil-Stationaritätswarnung).

---

## 8. Risiken

| # | Risiko | Gegenmaßnahme |
|---|---|---|
| R1 | Max-/Deviation-Pooling ist rauschempfindlich (ein Knall = Fehlalarm) | DMM-Fusion statt Max-only; Ereignis-Pfad klassifiziert den Knall (bekannt/unbekannt), Ereignis-**Dichte** statt Einzelereignis entscheidet; Lärmprofil-Stufe davor |
| R2 | DTW verschleiert Fehler durch zu viel Warping | Sakoe-Chiba-Band ±10–20 %, Band-Verletzung selbst als Befund werten |
| R3 | Selbsttest-Kalibrierung zu optimistisch (überlappende Fenster) | Leave-One-Window-Out im Selbsttest (Lehre aus Tier-0-Pivot §3.2) |
| R4 | App-weiter Trimmed-Mean-Filter frisst die Tier-2-Spitzen wieder auf | Engine liefert sequenz-aggregierten Score; Filter engine-abhängig mild schalten (additiv, GMIA-Pfad unverändert) |
| R5 | Modellgröße (Frame-Bank) sprengt QR/NFC-Export | Subsampling/Quantisierung; Export vorerst nur Backup-Datei (dokumentiert) |
| R6 | Scope-Explosion (4 Bausteine) | Strikte Baustein-Reihenfolge mit Labor-Gate (§6.2); T4 nur bei nachgewiesener Periodizität |

---

## 9. Stufenplan (Vorschlag)

| Stufe | Inhalt | Charakter |
|---|---|---|
| **T2-0 Messung** | MIMII-Valve/Slider-Baseline der bestehenden Engines im Mess-Labor | offen (echte MIMII-Daten nötig); ersatzweise synthetische Valve-Messung ✅ |
| **T2-a1** ✅ | Engine-Gerüst `temporal` + Frame-Bank (T1) + DMM/RDP-Aggregation (T2) + Kalibrierung; Labor-Messung | umgesetzt; synthetische Valve-Messung: AUC 0,925 vs. 0,738 (Spektral) / 0,375 (GMIA) |
| **T2-a2** ✅ | Ereignis-Pfad (T3) + Ereignis-Zeitleiste (UI) | umgesetzt; Missing-Beat-Messung: AUC 1,000 vs. 0,388 (Spektral) / 0,050 (GMIA) |
| **T2-a3** ✅ | Zyklus-Pfad (T4, DTW) + Auto-Empfehlung stationär/instationär (§7) | umgesetzt; Zyklusform-Messung: AUC 1,000 vs. 0,450 (Spektral) / 0,425 (GMIA) |
| **T2-b** | Embedding-Sequenz (BEATs/EAT, async) auf derselben Aggregations-Schicht | nur bei nachgewiesener Restlücke |

---

## 10. Quellen

**Intern:** Diagnose-Mathematik-Doku; 8-Tage-Rückblick 2026-06-27 (§6
Diskussionsvorlage); Tier-0-Umsetzungsbericht; Tier-0-Engine-Pivot-Bericht;
docs/NOISE_PROFILE_SUBTRAKTION_KONZEPT.md.

**Extern (verifiziert Juli 2026):**
- Saengthong & Shinozaki: *Sub-Band Spectral Matching with Localized Score
  Aggregation for Robust ASD* (BEAM/AdaBEAM, DMM; MIMII-Stationaritäts-
  analyse), arXiv:2603.13749, März 2026.
- Wilkinghoff, Yadav & Tan: *Temporal Pooling Strategies for Training-Free
  ASD with Self-Supervised Audio Embeddings* (RDP), arXiv:2603.04605,
  März 2026.
- Zhou & Wang: *Scoring Backends Matter More Than Pooling* (Backend-Fusion),
  arXiv:2606.19269, Juni 2026.
- Nishida et al.: *DCASE 2026 Challenge Task 2: Noise-aware UASD*,
  arXiv:2606.01578, Juni 2026.
- EPFL IMOS Lab (Prof. Olga Fink, Lausanne): Fault Detection & Diagnostics
  (Contrastive Learning unter wechselnden Betriebsbedingungen, DyEdgeGAT
  Early Fault Detection, generative Anomalie-Synthese),
  epfl.ch/labs/imos.
