# Tier 0 — Umsetzungs- und Konformitätsbericht

**Zuschaltbare Alternativ-Auswertung neben GMIA: Engine-Gerüst + Mahalanobis/One-Class**

| | |
|---|---|
| **Status** | Umgesetzt, getestet, auf `main` gemergt |
| **Branch** | `claude/new-session-l6038g` → Merge-Commit `70ab131` |
| **Feature-Commit** | `ac91ac6` |
| **DB-Version** | 7 → 8 (additiv) |
| **Default-Engine** | `gmia` (unverändert) |
| **Adressat** | Die recherchierende/prüfende KI sowie das Entwicklungsteam |
| **Zweck** | Lückenloser Nachweis, *was* umgesetzt wurde, *warum* (Entscheidungen), und *ob es mathematisch konform* zu den beiden Vorgabedokumenten ist — als Grundlage für die Entscheidung über Tier 1. |

> **Nachtrag (Stand nach Review):** Die in §4.3.1 / §8.2 angesprochene §8-Kalibrierung wurde inzwischen durch eine **offizielle, verbindliche Klarstellung** des Auftraggebers aufgelöst (Dokument *„Korrektur & Klarstellung zu §8 (Kalibrierung)"*). Die dort festgelegte **Zwei-Anker-Form** ist umgesetzt, die Varianz-Flooring-Konstante ist bestätigt und durch Pflicht-Tests abgesichert. Details in **§11 (Nachtrag)** am Ende dieses Dokuments. Die Abschnitte §2–§10 beschreiben den ursprünglichen Auslieferungsstand; §11 hält die finalen Entscheidungen fest.

---

## 1. Referenzdokumente (Vorgaben)

Dieser Bericht bezieht sich präzise auf die zwei vom Auftraggeber bereitgestellten Dokumente:

1. **„Zanobot — Build-Briefing: Zuschaltbare Alternativ-Auswertung neben GMIA"**
   (im Folgenden **[Briefing]**). Maßgeblich: §5 (Engine-Interface), §6 (Umschalter), **§7 (Tier 0 — Mahalanobis/One-Class)**, **§8 (Kalibrierung ohne baselineScore)**, **§9 (Multiclass)**, §12 (Datenmodell & DB-Migration), §14 (Reihenfolge der Umsetzung), §15 (Grenzen), §17/§19 (Verfeinerungen & Freiheitsgrade), §18 (Quellen).

2. **„Zanobot – Diagnose-Mathematik & Auswertungs-Architektur"**
   (im Folgenden **[Mathematik]**). Maßgeblich: §2 (Pipeline End-to-End), §2.1/Stufe 1 (Feature-Extraktion, 512-Bin ESD), Stufe 2 (GMIA-Gleichung 2), Stufe 3 (tanh²-Score, Gleichung 4, `baselineScore`-Kalibrierung), Stufe 4 (Multiclass), §8 (Kapselung & Austauschbarkeit), §9 (Hinweise für die Alternative).

> Tier 0 entspricht **[Briefing] §14, Schritte 1–6**. Sein erklärter Zweck ist laut **[Briefing] §7**: *„Die Umschalt-Mechanik end-to-end absichern, ohne neues I/O und ohne Modell-Download … Dieser Schritt ist bewusst trivial — sein Zweck ist, das Engine-Gerüst, die DB-Migration und den Settings-Toggle abzusichern, bevor YAMNet dazukommt."*

---

## 2. Entscheidungspunkte (Rückfragen → getroffene Entscheidungen)

Vor der Umsetzung wurden vier Punkte vorgelegt; der Auftraggeber hat **alle Empfehlungen bestätigt** („Alle Empfehlungen"). Sie sind hier dokumentiert, damit die prüfende KI die Designgründe nachvollziehen und ggf. revidieren kann.

### Entscheidung 1 — Engine-Interface **synchron** (statt async)
- **Gewählt:** Das `DiagnosisEngine`-Interface ist **synchron**. GMIA und Mahalanobis rechnen synchron; die heikle Echtzeit-Schleife `processChunkDirectly()` in `3-Diagnose.ts` (Score-/Label-History, Cherry-Pick-Reihenfolge) bleibt unverändert.
- **Begründung:** Tier 0 braucht keine Asynchronität. Das **[Briefing] §5** definiert das Interface zwar mit `Promise<…>`, das ist aber erst für einen Embedding-Encoder (YAMNet, Tier 1, **[Briefing] §10**: *„Inferenz in einem Web Worker"*) nötig. Eine vorgezogene Async-Umstellung würde ohne Nutzen den sensibelsten Code anfassen.
- **Konsequenz für Tier 1:** Beim Einstieg in YAMNet ist das Interface auf async zu heben (bzw. ein async-fähiger Pfad zu ergänzen). Das ist der einzige bewusst aufgeschobene Interface-Aspekt.

### Entscheidung 2 — Mahalanobis-Variante **Diagonalvarianz** (statt voller Shrinkage-Kovarianz)
- **Gewählt:** Diagonale Mahalanobis-Distanz (nur Varianz pro Bin), mit Varianz-Flooring.
- **Begründung:** Exakt der in **[Briefing] §7** empfohlene Default: *„Bei N ≪ 512 diagonale Varianz verwenden (`diagVar`) — robust und browser-leicht."* Die dort optional erwähnte *„Ledoit-Wolf-artige Shrinkage Σ̂ = (1−γ)·S + γ·diag(S)"* (volle 512×512-Kovarianz) wurde bewusst zurückgestellt (mehr Rechenlast, größeres Modell, höheres Numerik-Risiko).

### Entscheidung 3 — **Volles Tier 0** (Gerüst **und** Mahalanobis zusammen)
- **Gewählt:** Engine-Interface + GMIA-Wrapper + Registry + Settings-Toggle + DB-Migration **und** die MahalanobisEngine als ein zusammenhängendes Paket (= **[Briefing] §14, Schritte 1–6**).
- **Begründung:** Genau das ist die Definition von Tier 0; die triviale zweite Engine ist das Mittel, mit dem das Gerüst, die Migration und der Toggle abgesichert werden.

### Entscheidung 4 — Cross-Machine-Auto-Erkennung bleibt **GMIA-only** (für Tier 0)
- **Gewählt:** Die maschinenübergreifende Auto-Erkennung (`classifyAcrossAllMachines` / `classifyAgainstMachine`, genutzt im „Zustand prüfen"-Flow) wertet vorerst **nur GMIA-Modelle** aus; Mahalanobis-Modelle werden dort übersprungen.
- **Begründung:** Scores verschiedener Engines sind nicht direkt vergleichbar (GMIA-Score über tanh²/cosine vs. Mahalanobis-Score über Distanz-Kennlinie). Eine saubere Cross-Engine-Normalisierung ist Tier-1+-Thema. Innerhalb **einer** Maschine ist die Engine-Auswahl dagegen voll wirksam (siehe §4.4).

---

## 3. Architektur-Leitprinzipien (aus [Briefing] §4, eingehalten)

1. **GMIA bleibt unangetastet und ist Standard.** `trainGMIA`, `inferGMIA`, `classifyDiagnosticState`, `calculateHealthScore`, die DSP-Kette und die gesamte UI sind funktional identisch. Kein „Aufräumen" nebenbei. → Nachweis in §5.
2. **Reine Erweiterung per Strategy-Pattern**, nach dem Muster der vorhandenen optionalen DSP-Stufen (eigenes Settings-Modul, reine Funktion/Klasse).
3. **PWA / offline-first bleibt.** Tier 0 nutzt nur die bereits vorhandenen 512-Bin-Features — kein neues I/O, kein Modell-Download.
4. **Echtzeit ~3 Auswertungen/s** unverändert (synchrone Mathematik).
5. **Rückwärtskompatibel.** Bestehende `GMIAModel`-Datensätze ohne `engineId` werden als `'gmia'` gelesen; DB-Migration nur additiv.

---

## 4. Was genau umgesetzt wurde

### 4.1 Neues Engine-Gerüst — `src/core/ml/engine/`

| Datei | Inhalt |
|---|---|
| `types.ts` | `DiagnosisEngine`-Interface (synchron), `FrameInput` (`feature`, optional `rawChunk`, `sampleRate`), `TrainInput` (`trainingData`, optional `rawBuffer`, `sampleRate`). |
| `GmiaEngine.ts` | Dünner Wrapper. Delegiert **unverändert** an `trainGMIA` / `classifyDiagnosticState` / `getAllModelScores`. Enthält den **identisch reproduzierten** Baseline-Selbsttest (siehe §5.2). |
| `MahalanobisEngine.ts` | Tier-0-Engine: Diagonalvarianz-Training, Distanz→Score-Kennlinie (§4.3), Multiclass. |
| `registry.ts` | `getEngine(id)`-Factory **und** der **engine-bewusste Dispatcher** `classifyWithEngines` / `scoreAllWithEngines`, plus `resolveEngineId` und `getModelWeightVector`. |
| `MahalanobisEngine.test.ts` | 6 Unit-Tests (Modellform, Selbst-Score-Band, In-Distribution healthy, Anomalie-Abstand, scoreAll, Score-Klemmung). |

Das Interface (synchron, Entscheidung 1):

```ts
export interface DiagnosisEngine {
  readonly id: EngineId;
  train(input: TrainInput, machineId: string): ReferenceModel;
  classify(models: ReferenceModel[], frame: FrameInput): DiagnosisResult;
  scoreAll(models: ReferenceModel[], frame: FrameInput): WorkPointScore[];
}
```

### 4.2 Datenmodell (`src/data/types.ts`)

- `EngineId = 'gmia' | 'mahalanobis'`.
- `GMIAModel.engineId?: 'gmia'` — **optional**; fehlt es (Altdaten), gilt `'gmia'`.
- **Neu:** `MahalanobisModel` (engine-diskriminiert über `engineId: 'mahalanobis'`).
- `ReferenceModel = GMIAModel | MahalanobisModel`.
- `Machine.referenceModels: ReferenceModel[]` (vorher `GMIAModel[]`).
- Type-Guard `isGMIAModel(model)` (Altmodelle ohne `engineId` zählen als GMIA) — zum sicheren Zugriff auf GMIA-only-Felder (`weightVector`, `scalingConstant`, `metadata.weightMagnitude`) quer durch den Code.

`MahalanobisModel` (Felder als `number[]`, damit sie IndexedDB-Structured-Clone **und** JSON-Export unverändert überstehen):

```ts
export interface MahalanobisModel {
  engineId: 'mahalanobis';
  machineId: string;
  label: string;
  type: 'healthy' | 'faulty';
  mean: number[];                 // 512 Per-Bin-Mittelwert
  diagVar: number[];              // 512 Per-Bin-Varianz (gefloort)
  calibration: { tau: number; alpha: number };
  featureDimension: number;       // 512
  sampleRate: number;             // an FFT-Bins gebunden (wie GMIA)
  trainingDate: number;
  trainingDuration: number;
  baselineScore?: number;         // mittlerer Selbst-Score (Quality-Gate + Ranking)
  metadata?: { meanDistance?: number; targetScore?: number };
}
```

### 4.3 MahalanobisEngine — Mathematik im Detail

**Eingang:** `FrameInput.feature.features` = der **identische** 512-Bin-ESD-Relativvektor (Σ = 1), den auch GMIA verwendet (**[Mathematik] Stufe 1**). Kein Roh-Audio, kein neuer Datenpfad → **[Briefing] §7**: *„passt 1:1 auf das bestehende Boundary."*

**Training** (`train`):

1. Per-Bin-Mittelwert μ über die N Trainingsvektoren.
2. Per-Bin-Varianz (Populationsvarianz) `var[k] = (1/N)·Σ (f_i[k] − μ[k])²`.
3. **Varianz-Flooring** (Numerik-Schutz, „Shrinkage-lite"): `var[k] = max(var[k], floor)` mit `floor = max(1e-12, VAR_FLOOR_FRACTION · median(var))` und **`VAR_FLOOR_FRACTION = 0.01`** (= 1e-2, **kleiner** Bruchteil von 1 % des Medians). Hebt nur die *winzigen* Varianzen an, damit ein nahezu konstanter Bin die Distanz nicht dominiert; die Per-Bin-Gewichtung informativer Bins bleibt erhalten (durch Pflicht-Tests abgesichert, siehe §11).
4. Trainingsdistanzen `d_i = √(Σ_k (f_i[k] − μ[k])² / var[k])`.
5. Kalibrierung (siehe §4.3.1): `med = median(d_i)`, `mad = median(|d_i − med|)`, daraus `tau`, `alpha`.
6. `baselineScore` = Mittel der Selbst-Scores `score(d_i)`.

**Klassifikation** (`classify`, pro Frame): Distanz `d` → Score über die Kennlinie → Multiclass (§4.3.2).

#### 4.3.1 Distanz→Score-Kennlinie (Kalibrierung) — **mit ausdrücklich markierter Abweichung**

Verwendete Kennlinie (Sigmoid-Variante aus **[Briefing] §8**, Formel 1):

```
healthScore = 100 · (1 − sigmoid(alpha · (d − tau)))     , geklemmt auf [0, 100]
```

Kalibrierung im Code:

```
tau   = median(d_i) + 3 · MAD(d_i)            // Distanz, die auf 50 % abbildet
alpha = −logit(1 − target) / (3 · MAD(d_i))   // target = 0.95 (TARGET_SELF_SCORE)
```

Daraus folgt analytisch:
- bei `d = median`: `score = 100 · (1 − sigmoid(−2.944)) = 100 · 0.95 = 95` → Referenz-Selbstscores liegen im **gesunden Band ~90–100** ✓
- bei `d = tau`: `score = 50` (definierte 50-%-Grenze).

> **⚠️ Bewusste, dokumentierte Abweichung vom Wortlaut [Briefing] §8 — bitte prüfen.**
> **[Briefing] §8** schreibt wörtlich `τ = median(d_i)` *und* die Sigmoid-Formel `100·(1 − sigmoid(α·(d − τ)))`. Diese beiden Aussagen sind **zusammen nicht konsistent**: Bei `τ = median` ist `score(median) = 100·(1 − sigmoid(0)) = 50` — die Referenz würde sich selbst nur mit **50 %** erkennen, im Widerspruch zur ebenfalls in §8 geforderten Aussage *„α so wählen, dass Referenz-Selbstscores im gesunden Band (~90–100) liegen."*
>
> **Auflösung im Code:** Wir behalten die **exakte funktionale Form** der Sigmoid-Formel bei, interpretieren `tau` aber als den **50-%-Grenzabstand** (`median + 3·MAD`) und leiten `alpha` so ab, dass der **Median-Selbstabstand auf das Zielband (95 %)** fällt. Das erfüllt die **erklärte Absicht** von §8 (Selbstscores 90–100, absolute 0–100-Ausgabe) und ist damit *intentionskonform*, weicht aber von der wörtlichen Definition `τ = median` ab.
>
> **[Briefing] §8** bietet als gleichwertige Alternative `100·tanh(α·max(0, τ_max − d))²` an (analog zur GMIA-tanh²-Kennlinie). Diese hätte mit `τ = median` ebenfalls funktioniert. Wir haben uns für die Sigmoid-Variante entschieden, weil sie monoton, beidseitig glatt und ohne `τ_max`-Zusatzparameter auskommt.
>
> **Prüfauftrag an die recherchierende KI:** Bitte entscheiden, ob (a) diese Auflösung (Sigmoid + `tau = median + 3·MAD`) übernommen wird, oder (b) auf die tanh²-Variante mit `τ = median` gewechselt wird, oder (c) eine quantilbasierte Schwelle gemäß **[Briefing] §17.6** (Gamma-Fit der Normal-Score-Verteilung, Schwelle als hohes Quantil) gesetzt wird. Die Kennlinie ist in **einer** Funktion (`scoreFromDistance`) und einer Konstanten (`TARGET_SELF_SCORE`) gekapselt und damit trivial austauschbar.

#### 4.3.2 Multiclass (§4.3.2) — konform zu [Briefing] §9 / [Mathematik] Stufe 4

`MahalanobisEngine.classify` bildet exakt das Verhalten von `classifyDiagnosticState` nach:
- über **alle** Modelle der Maschine scoren, **bestes gewinnt** (`bestScore`, `bestLabel`),
- liegt `bestScore` unter dem nutzerkonfigurierten `confidenceThreshold` (aus `getRecordingSettings()`) → `status = 'uncertain'`, Label `UNKNOWN`,
- sonst `status = bestModel.type` (`healthy`/`faulty`).

Das gelieferte `DiagnosisResult` hat **dieselbe Form** wie das von GMIA (inkl. `metadata.detectedState`, `multiclassMode`, `evaluatedModels`, `analysis.hint` über denselben `generateMulticlassHint`, sowie ein formkompatibles `metadata.debug`), sodass **die komplette nachgelagerte Kette unverändert greift**: Glättung (Trimmed Mean), Majority Voting, Anzeige (HealthGauge, WorkPointRanking), IndexedDB-Speicherung.

### 4.4 Umschalter & engine-bewusstes Dispatching

- `src/utils/evaluationSettings.ts`: `getEvaluationEngine()` / `setEvaluationEngine()`, **Default `'gmia'`** (localStorage + Change-Event, Muster wie `recordingSettings.ts`).
- `index.html` + `src/ui/phases/4-Settings.ts`: Selector **„Auswertungs-Engine"** (GMIA / Mahalanobis) in der bestehenden „Analysemethode"-Sektion. i18n: `de` + `en` (übrige Sprachen fallen sauber auf `en`/`de` zurück).
- **Auswahl-Logik (entscheidend, [Briefing] §6):** Bei der **Diagnose** entscheidet die **Engine des gespeicherten Modells** (`model.engineId`), **nicht** die aktuelle Einstellung — sonst würden GMIA-Gewichte mit Mahalanobis-Statistiken verglichen. Die Einstellung steuert **nur**, womit **neue** Referenzen in `2-Reference.ts` erzeugt werden.
- `registry.classifyWithEngines` gruppiert die aktiven Modelle nach `engineId`:
  - **Ein-Engine-Maschine** (Normal- und einziger durch die UX erzeugbarer Fall): Single-Fast-Path → identischer Aufruf wie bisher (für reine GMIA-Maschinen **bit-identisch** zum Status quo).
  - **Gemischte Engines** (Randfall, nur falls die Einstellung zwischen zwei Trainings gewechselt wurde): defensiv — jede Engine-Gruppe wird gescort, **bester `healthScore`** gewinnt.

### 4.5 Verdrahtung der Aufrufstellen ([Briefing] §14, Schritt 4)

- `2-Reference.ts`: Training läuft über `getEngine(getEvaluationEngine()).train(...)`. Das **Quality-Gate** (`baselineScore < 75 ⇒ Referenz verwerfen`) bleibt **identisch** und greift jetzt uniform für beide Engines.
- `3-Diagnose.ts`: `classifyDiagnosticState(...)` → `classifyWithEngines(...)`; `getAllModelScores(...)` → `scoreAllWithEngines(...)`; `activeModels` ist jetzt `ReferenceModel[]`. Drei rein **dekorative** `weightVector`-Lesezugriffe (Ghost-Spektrum) sind über `getModelWeightVector`/`isGMIAModel` abgesichert.

### 4.6 DB-Migration 7 → 8 ([Briefing] §12 / [Mathematik] §4) — additiv

- `DB_VERSION 7 → 8`. **Keine** Store-Änderung, **kein** Daten-Rewrite. Migrationsblock nur mit Log-Hinweis.
- Engine-bewusste (De-)Serialisierung im **Backup-Export/Import** (`db.ts`): GMIA-`weightVector` ⇄ `number[]` (wie bisher); Mahalanobis-Felder sind bereits `number[]` und werden unverändert durchgereicht. Helfer `serializeReferenceModel` / `deserializeReferenceModel`.
- **IndexedDB-Speicherpfad** (`saveMachine`/`getMachine`) braucht **keine** Sonderbehandlung: Structured Clone überträgt `Float64Array` (GMIA) und `number[]` (Mahalanobis) nativ.
- Altmodelle ohne `engineId` werden beim Lesen als `'gmia'` interpretiert (`resolveEngineId` / `isGMIAModel`).
- **Fleet/NFC/QR-Provisioning** (`ReferenceDbService.ts`): für Tier 0 GMIA-only (Mahalanobis-Modelle werden aus dem Gold-Standard-Export übersprungen) — siehe §6.

---

## 5. Konformitätsnachweis: „GMIA bleibt unverändert"

Das ist das wichtigste nicht-verhandelbare Prinzip (**[Briefing] §4.1**, **[Mathematik] §8**). Nachweis:

### 5.1 Kern-Algorithmus unangetastet
`trainGMIA`, `inferGMIA`, `calculateHealthScore`, `classifyDiagnosticState`, `getAllModelScores` in `src/core/ml/gmia.ts` und `src/core/ml/scoring.ts` wurden **inhaltlich nicht verändert**. `LAMBDA = 1e9` (**[Mathematik] Stufe 2**, **[Briefing] §15**) ist unberührt. Die einzigen Änderungen an `scoring.ts` sind:
- zwei bestehende Hilfsfunktionen wurden **additiv exportiert** (`calculateConfidenceFromScore`, `generateMulticlassHint`) — keine Logikänderung;
- `classifyAgainstMachine` filtert die Modelle jetzt zusätzlich auf GMIA (Entscheidung 4) — für reine GMIA-Bestände verhaltensneutral.

### 5.2 Baseline-Selbsttest: relocation, aber bit-identisch
Der GMIA-`baselineScore`-Selbsttest wurde aus `2-Reference.ts` in `GmiaEngine.train` **verschoben** (nicht verändert):
- gleiche Stichprobengröße (`min(20, N)`), gleicher Spreizungs-Schritt,
- gleicher Aufruf `classifyDiagnosticState([model], …, sampleRate)`,
- **gleiche Eingabedaten**: Der ursprüngliche Test las `this.currentFeatures[i]` (vollständige `FeatureVector`); der Wrapper liest `trainingData.featureVectors[i]`. Es gilt im Code `trainingData.featureVectors[i] === currentFeatures[i].features` (dieselbe `Float64Array`-Referenz, gesetzt in `2-Reference.ts`). `classifyDiagnosticState`/`inferGMIA` liest **ausschließlich** `.features`. → Der berechnete `baselineScore` ist **bit-identisch**.

### 5.3 Score-Kette unverändert
Für reine GMIA-Maschinen liefert `classifyWithEngines` über den Single-Engine-Fast-Path **denselben** `classifyDiagnosticState`-Aufruf wie zuvor. Glättung, Majority Voting, Anzeige, Speicherung sind unberührt.

### 5.4 Belegt durch Tests
Die **gesamte bestehende Test-Suite bleibt grün** (siehe §7), insbesondere `gmia.test.ts`, `scoring.test.ts`, `mathUtils.test.ts`, `db.test.ts`. Der einzige angepasste Erwartungswert war die DB-Versionsnummer (7 → 8).

---

## 6. Bewusst NICHT umgesetzt (Tier-0-Grenzen) — Liste für die Prüfung

Diese Punkte sind **außerhalb** des Tier-0-Scopes (**[Briefing] §7/§14**) und bewusst aufgeschoben:

1. **Async-Interface / Web Worker** — erst für Tier 1 (YAMNet) nötig (Entscheidung 1, **[Briefing] §10**).
2. **Roh-Audio-Tap** (`FrameInput.rawChunk`) — im Interface vorgesehen, in Tier 0 ungenutzt; nötig erst für Embedding-Engines (**[Briefing] §15**).
3. **Cross-Machine-Auto-Erkennung mit gemischten Engines** — bleibt GMIA-only (Entscheidung 4).
4. **Fleet/NFC/QR-Provisioning von Mahalanobis-Modellen** — der Gold-Standard-Export überspringt Nicht-GMIA-Modelle (lokaler Backup-Export/Import deckt Mahalanobis dagegen ab).
5. **Dekorative Fingerprint-/Iris-Grafik** für Mahalanobis-Maschinen — derzeit nur für GMIA (nutzt `weightVector`); rein kosmetisch, kein Diagnose-Einfluss. (Mögliche Erweiterung: `mean` als Referenzspektrum verwenden.)
6. **Ledoit-Wolf-Shrinkage / volle Kovarianz** — zurückgestellt (Entscheidung 2).
7. **Verfeinerungen aus [Briefing] §17** (GeM/RDP-Pooling, k-NN-Backend, Bandpass-Frontend, Domain-Generalization, Gamma-Quantil-Schwelle) — betreffen primär Tier 1/2 bzw. sind optionale Robustheitsschritte.

---

## 7. Verifikation

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` (Typecheck) | ✅ grün |
| `npx eslint src` | ✅ grün |
| `npm run build` (`tsc && vite build` + PWA-Precache) | ✅ grün |
| `npx vitest run` (gesamte Suite) | ✅ **219 passed**, 2 skipped, 13 Dateien |
| neue `MahalanobisEngine.test.ts` | ✅ 6/6 |
| GMIA-Regression (`gmia`/`scoring`/`mathUtils`/`db`) | ✅ unverändert grün |

**Empirisch beobachtet** (aus Testlauf, synthetische Daten, 16-Bin-Spielzeug): Mahalanobis-Modell mit N=40 → `τ≈4.94`, `α≈2.93`, `baseline≈88.9 %`; In-Distribution-Frame → `healthy` mit hohem Score; klar abweichendes Spektrum → deutlich niedrigerer Score (Abstand > 20 Punkte). Das ist **Plausibilitäts-** und **Mechanik-Validierung**, **kein** AUC/pAUC-Benchmark auf echten Maschinendaten (siehe Prüfaufträge §8).

---

## 8. Mathematische Konformität — Zusammenfassung & Prüfaufträge

### 8.1 Konformitätsmatrix

| Vorgabe | Quelle | Umsetzung | Konform? |
|---|---|---|---|
| Eingang = vorhandener 512-Bin-ESD-`feature` | [Briefing] §7 | `FrameInput.feature.features` | ✅ exakt |
| Diagonalvarianz bei N≪512 | [Briefing] §7 | `diagVar`, Per-Bin | ✅ exakt |
| Mahalanobis-Distanz `d=√(Σ(f−μ)²/var)` | [Briefing] §7 | `mahalanobisDistance()` | ✅ exakt |
| Distanz→Score, absolute 0–100 (kein `baselineScore`-Zwang) | [Briefing] §8 | Sigmoid-Kennlinie, geklemmt | ✅ Form exakt |
| `τ = median(d_i)` **wörtlich** | [Briefing] §8 | `tau = median + 3·MAD` (50-%-Punkt) | ⚠️ **Abweichung, dokumentiert (§4.3.1)** |
| Selbstscores ~90–100 (Absicht) | [Briefing] §8 | `target=95 %` per `alpha`-Ableitung | ✅ intentionskonform |
| Status über bestehende `HEALTH_THRESHOLDS`/`confidenceThreshold` | [Briefing] §8/§9 | unverändert genutzt | ✅ exakt |
| Multiclass: bestes Modell, sonst `uncertain`/UNKNOWN | [Briefing] §9, [Mathematik] Stufe 4 | nachgebildet | ✅ exakt |
| `DiagnosisResult`-Form unverändert | [Mathematik] §8 | identische Form | ✅ exakt |
| DB additiv, Altmodelle als `gmia` | [Briefing] §12 | DB 7→8 additiv | ✅ exakt |
| GMIA unverändert & Default | [Briefing] §4, [Mathematik] §8 | siehe §5 | ✅ nachgewiesen |
| Mathe in `mathUtils.ts` (Singularitätsschutz) | [Briefing] §7 | diagonal ⇒ keine Matrixinverse nötig; eigene gefloorte Varianz | ✅ (vereinfacht, da diagonal) |

### 8.2 Der **eine** zu prüfende Punkt
Die einzige inhaltliche Abweichung von der **wörtlichen** Vorgabe ist die **Kalibrierungsschwelle** (§4.3.1): `tau = median + 3·MAD` statt `τ = median`, in Kombination mit der Sigmoid-Formel. Sie ist nötig, weil §8 in sich (median + Sigmoid) widersprüchlich ist, und sie erfüllt die erklärte Absicht. **[Briefing] §19** räumt hierfür ausdrücklich Spielraum ein (*„Empfehlung, kein Dogma"*; präzise Definitionen ggf. gegen die Quelle übernehmen). 

**Konkrete Prüf-/Forschungsaufträge an die recherchierende KI** (vor Tier 1):
1. **Kalibrierung bestätigen oder ersetzen:** Sigmoid + `median+3·MAD` (aktuell) vs. tanh²-Variante mit `τ=median` (**[Briefing] §8**) vs. Gamma-Quantil-Schwelle (**[Briefing] §17.6**). Datengetrieben entscheiden.
2. **Backend prüfen:** parametrisch (diagonale Mahalanobis, aktuell) vs. nicht-parametrisch **k-NN** auf den Sub-Fenstern *einer* Aufnahme (**[Briefing] §17.2**, oft robuster bei sehr wenig Daten). Beide nutzen dieselbe eine Referenzaufnahme.
3. **Varianz-Flooring quantifizieren:** Der Faktor `VAR_FLOOR_FRACTION = 0.01` (= 1 % des Medians) ist eine pragmatische Wahl; gegen Ledoit-Wolf-Shrinkage (**[Briefing] §7**) benchmarken. (Im Code als benannte Konstante, durch Pflicht-Tests gegen einen Kollaps abgesichert — siehe §11.)
4. **Messen vor Optimieren** (**[Briefing] §19**): AUC/pAUC der Mahalanobis-Engine auf **echten** Zanobot-Fällen bzw. MIMII DG / ToyADMOS2 (**[Briefing] §18**) erheben, bevor über Tier 1 (YAMNet) oder Verfeinerungen entschieden wird.

### 8.3 UX-Invariante (eingehalten, [Briefing] §19)
**Eine Aufnahme → eine Signatur → ein Ergebnis.** Tier 0 erzwingt keine Mehrfachaufnahmen; die nötige Statistik (μ, Varianz, Distanzverteilung für τ/α) kommt aus den Sub-Fenstern **derselben einen** Referenzaufnahme.

---

## 9. Empfehlung für den nächsten Schritt

Tier 0 ist abgeschlossen und erfüllt seinen Zweck: Engine-Gerüst, DB-Migration und Toggle sind durch eine reale zweite Engine abgesichert; GMIA ist nachweislich unverändert und Default.

**Vor Tier 1** empfiehlt sich:
1. Entscheidung über den Prüfauftrag §8.2 (Kalibrierung) — idealerweise datengetrieben (§8.2 Punkt 4).
2. Bestätigung, dass das Interface mit dem YAMNet-Einstieg auf **async** gehoben wird (Entscheidung 1).
3. Klärung des Roh-Audio-Taps (`FrameInput.rawChunk`, **[Briefing] §10/§15**) und der 16-kHz-Resampling-/1-s-Ringpuffer-Strategie.

---

## 10. Changeset (Dateiindex)

**Neu**
- `src/core/ml/engine/types.ts`, `GmiaEngine.ts`, `MahalanobisEngine.ts`, `registry.ts`, `MahalanobisEngine.test.ts`
- `src/utils/evaluationSettings.ts`
- `docs/TIER0_UMSETZUNGSBERICHT.md` (dieses Dokument)

**Geändert**
- `src/data/types.ts` (Union, `MahalanobisModel`, `isGMIAModel`)
- `src/data/db.ts` (DB 7→8, engine-bewusste Serialisierung)
- `src/data/ReferenceDbService.ts` (Gold-Standard-Export GMIA-only)
- `src/core/ml/scoring.ts` (additive Exporte, Auto-Erkennung GMIA-Filter)
- `src/ui/phases/2-Reference.ts` (Training über Engine)
- `src/ui/phases/3-Diagnose.ts` (Dispatcher, `weightVector`-Guards)
- `src/ui/phases/4-Settings.ts` + `index.html` (Toggle)
- `src/i18n/locales/de.ts`, `en.ts` (Strings)
- `src/ui/QuickCompareController.ts`, `MachineDetailModal.ts`, `MachineOverviewRenderer.ts`, `referenceIris.ts`, `router.ts` (engine-sichere Modell-Zugriffe)
- `src/data/db.test.ts` (DB-Version 8)

**Commits:** `ac91ac6` (Feature), `70ab131` (Merge nach `main`), plus Bericht + Review-Antwort (siehe §11).

---

## 11. Nachtrag — Antwort auf die offizielle §8-Klarstellung

Nach Auslieferung von Tier 0 hat der Auftraggeber die in §4.3.1/§8.2 markierte Inkonsistenz mit einer **verbindlichen Klarstellung** beantwortet (Dokument *„Korrektur & Klarstellung zu §8 (Kalibrierung)"*). Kernaussagen und deren Umsetzung:

### 11.1 §8-Widerspruch offiziell aufgelöst — Zwei-Anker-Form ist Standard
Die ursprüngliche §8 forderte gleichzeitig `τ = median`, die Sigmoid-Formel **und** Selbstscores 90–100 — bei `d = median` liefert `sigmoid(0) = 0.5` aber zwingend 50 %. Die im Tier-0-Bericht gewählte Auflösung wird **offiziell als Standard bestätigt** und für alle distanzbasierten Engines auf die **Zwei-Anker-Form** präzisiert:

```
healthScore(d) = 100 · (1 − sigmoid(α · (d − τ50))) , geklemmt auf [0,100]
α = logit(s_hi) / (τ50 − d_lo)        // logit(0.95) = ln(19) ≈ 2.944
```
- **Gesund-Anker** `d_lo → s_hi` (Default `s_hi = 0.95`, Konstante `TARGET_SELF_SCORE`).
- **Grenz-Anker** `τ50` = der 50-%-Abstand.

**Umgesetzt:** `MahalanobisEngine.ts` berechnet die Kalibrierung jetzt explizit über `anchorsToCalibration({ dLo, tau50 })`. Die Form ist verhaltensneutral zum Auslieferungsstand (verifiziert: identische `τ=4.94`, `α=2.9333`, `baseline=88.9 %` im Engine-Testlauf).

### 11.2 Tier 0 — MAD-Anker beibehalten (bestätigt)
```
d_lo = median(d_i) ;  τ50 = median(d_i) + 3·MAD(d_i) ;  α = ln(19)/(3·MAD)
```
→ `d = median → 95 %`, `d = τ50 → 50 %`. Umgesetzt als `madAnchors()`, **aktiver Default** in Tier 0.

### 11.3 Tier 1+ — quantilbasierte Schwelle (verbindliche Ziel-Kennlinie, vorbereitet)
Begründung der Klarstellung: `3·MAD` unterstellt **symmetrische** Streuung; Distanzverteilungen sind **rechtsschief** (bei 0 begrenzt, langer oberer Schwanz) → MAD unterschätzt die obere Streuung, die Schwelle wird zu eng, Falsch-Positive steigen. Ziel-Kennlinie:
```
d_lo = Q50(d_i) ;  τ50 = Q_p(d_i)  (Default p = 0.95) ;  α = ln(19)/(Q_p − Q50)
```
→ erwartete Falsch-Positiv-Rate am 50-%-Punkt ≈ `(1 − p)`; `p` ist der **direkte Robustheits-Regler**.

**Umgesetzt (vorbereitet, getestet, noch nicht aktiv):** `quantileAnchors(distances, p = NORMAL_QUANTILE_P)` mit `NORMAL_QUANTILE_P = 0.95`. Die Engine nutzt in Tier 0 weiterhin `madAnchors`; der Umstieg auf `quantileAnchors` ist ein Einzeiler in `train()` und ändert die Kennlinienform nicht. **Policy-Option** (dokumentiert, nicht geraten): `τ50` kann statt auf den 50-%-Punkt auch auf die Healthy/Uncertain-Grenze (75 %) gelegt werden → `(1 − p)` der Normal-Frames landen in „uncertain" statt „faulty". Default bleibt der 50-%-Anker. Die optionale **Gamma-Fit**-Variante (§17.6) bleibt als robustere Alternative bei sehr kleinem N vorgemerkt.

> **Hinweis zur Aktivierung (Review-Ergänzung):** Bei **kleinem N** (z. B. N ≈ 40 Distanzen) ist das **empirische Q₉₅ instabil** — es liegt praktisch auf dem zweithöchsten Wert und schwankt stark zwischen Aufnahmen. Genau hier spielt der vorgemerkte **Gamma-Fit** seinen Vorteil aus (er glättet den oberen Schwanz, statt ihn an einem einzelnen Ausreißer festzumachen). **Empfehlung fürs Messen:** beim Aktivieren des Quantil-Pfads `Q₉₅` und `Gamma-Q₉₅` **parallel** mitloggen und erst anhand der **realen Falsch-Positiv-Rate auf Normaldaten** entscheiden, ob das einfache empirische Quantil genügt oder N dafür zu klein ist. Erst messen, dann festlegen.

### 11.4 Varianz-Flooring — Konstante fixiert + Pflicht-Tests (Code-Korrektur)
- **Befund:** Der **echte Code** verwendete bereits den korrekten kleinen Bruchteil. Die im PDF-Render scheinbar abweichende Stelle (`1e2`) war ein **Glyph-Artefakt** (zwei dicht stehende Minuszeichen in `1e-12, 1e-2`); im Markdown-Quelltext stand an **beiden** Stellen `1e-2` (Codepoint-geprüft).
- **Umgesetzt:** Konstante in `VAR_FLOOR_FRACTION = 1e-2` (= 0,01) umbenannt (entspricht dem offiziell benannten `VAR_FLOOR_FRACTION`), mit ausführlichem Kommentar zur Kollaps-Gefahr.
- **Pflicht-Tests ergänzt** (genau wie gefordert):
  1. *Metrik respektiert Per-Bin-Varianz:* gleiche absolute Abweichung in zwei Bins unterschiedlicher Varianz trägt **unterschiedlich** zur Distanz bei (quadratische Beiträge im exakten Varianz-Verhältnis ×4).
  2. *Flooring egalisiert nicht:* nach dem Training behalten informativ verschiedene Bins ihren Varianz-Abstand (`diagVar[0] > diagVar[2]·5`); ein 100×-Flooring würde alle Bins angleichen und **diesen Test fallen lassen** — die Regression ist damit gefangen.

### 11.5 Übrige Prüfpunkte — Status
- **k-NN-Variante (Tier 1, vorgemerkt):** Für die Messphase neben die diagonale Mahalanobis stellen. Begründung der Klarstellung: eine **bewegte** Referenzaufnahme erzeugt eine **multimodale** Feature-Wolke (mehrere Positionen = mehrere Cluster), die *eine* diagonale Gauß-Annäherung schlecht modelliert; k-NN über die Sub-Fenster trägt multimodale Wolken natürlich. → Relevant für die robuste „eine bewegte Aufnahme"-UX.
- **AUC/pAUC vor Tier 1 (nachdrücklich bestätigt):** Der Engine-Testlauf validiert nur die **Mechanik**, nicht die Erkennungsgüte. Vor jedem YAMNet-Aufwand reale Zahlen auf MIMII DG / ToyADMOS2 bzw. eigenen Maschinen erheben und dabei die quantilbasierte Kennlinie gegen die MAD-Variante vergleichen.
- **Tier-1-Voraussetzungen:** async-Interface, Roh-Audio-Tap + 16-kHz-Resampling + 1-s-Ringpuffer — unverändert vorgemerkt.

### 11.6 Was unverändert bleibt
GMIA (512-Bin): `trainGMIA`, `inferGMIA`, `classifyDiagnosticState`, `calculateHealthScore`, `λ = 1e9`, tanh²-Kennlinie, `baselineScore`-Kalibrierung — **unberührt und Default**. Nachgelagerte Kette, Multiclass-Verhalten, DB 7→8 additiv, Engine-nach-Modell-Auswahl — wie im Bericht.

### 11.7 Verifikation des Nachtrags
`tsc` ✅ · `eslint` ✅ · **`vitest run`: 225 passed** (vorher 219; +6 neue: Zwei-Anker-Kalibrierung, MAD-/Quantil-Anker, Rechtsschiefe, zwei Flooring-Guards). Die ursprünglichen 6 Engine-Tests bleiben grün und belegen die Verhaltensneutralität des Refactors. GMIA-Regression unverändert grün.

**Geänderte/neue Dateien im Nachtrag:** `src/core/ml/engine/MahalanobisEngine.ts` (Zwei-Anker-Form, `VAR_FLOOR_FRACTION`, `madAnchors`/`quantileAnchors`/`anchorsToCalibration`, Exporte), `src/core/ml/engine/MahalanobisEngine.test.ts` (6 neue Tests), dieses Dokument.

### 11.8 Code-Review-Befund B1 — Mahalanobis-`baselineScore`-Gate ist self-fitting

Ein allgemeines Code-Review des Tier-0-Changesets fand **keine Korrektheits-/Crash-Bugs** (kein Div-by-Zero, keine NaN, kein Null-Deref; Serialisierung round-trippt; GMIA verifiziert unangetastet; Tests/tsc/eslint grün). Ein Design-Punkt verdient aber Dokumentation:

- **Befund:** Der Mahalanobis-`baselineScore` (Mittel der Selbst-Scores) ist **strukturell fast immer hoch** (~88–95 %), weil die Kalibrierung `median(d_i) → TARGET_SELF_SCORE` abbildet. Das `< 75 %`-Quality-Gate in `2-Reference` ist damit für Mahalanobis **praktisch wirkungslos** — selbst eine nahezu konstante/degenerierte Aufnahme bekäme ~95 % und würde es passieren (GMIA bricht in dem Fall dagegen hart ab).
- **Warum kein akutes Problem:** Das **engine-unabhängige** Primär-Gate `assessRecordingQuality()` (RMS, spektrale Varianz, Rausch-/Magnitude-Check) läuft in `2-Reference` **vor** dem Training und lehnt schlechte/verrauschte Aufnahmen ohnehin ab — für beide Engines. Das Mahalanobis-Baseline-Gate ist also nur ein redundanter, schwacher Zweitfilter.
- **Empfehlung (kein Handlungsbedarf jetzt):** So belassen; falls später ein Mahalanobis-spezifisches Gate gewünscht ist, an einem **absoluten** Signalkriterium festmachen (z. B. minimale spektrale Varianz / SNR), nicht am self-fit-Baseline. Im Code als `NOTE` an der `baselineScore`-Berechnung vermerkt.
- **Kleinere Notizen (unkritisch):** Bei Mahalanobis ist `rawCosineSimilarity`/`debug.cosine` ein Distanz-Proxy (kein echter Cosine) — nur für gespeicherte Analytics relevant; und die neuen Settings-Strings sind nur `de`/`en` (übrige Sprachen fallen zurück).
- **Verifiziert (Distanz-Proxy):** Eine repo-weite Prüfung aller Konsumenten von `rawCosineSimilarity` / `debug.cosine` / `MachineMatchResult.rawCosine` ergab: **kein** nachgelagerter Konsument legt eine cosine-spezifische Schwelle auf diese Felder. Die einzigen Reads sind die kosmetische Expert-Debug-Anzeige (`3-Diagnose.ts`, nur `toFixed`) und der **GMIA-only** Auto-Erkennungspfad (`classifyAgainstMachine`, sieht den Mahalanobis-Proxy nie). Status/Score hängen ausschließlich am `healthScore` + `HEALTH_THRESHOLDS`/`confidenceThreshold`. Der mögliche stille Fehlschluss („Proxy als echter Cosine interpretiert") existiert im Code nicht.

### 11.9 Feldbefund — Mahalanobis-Score kollabiert auf 0 % (behoben)

**Symptom (erster Gerätetest):** Eine frisch angelernte Mahalanobis-Referenz lieferte bei der Live-Diagnose **0 % / AUFFÄLLIG**, obwohl das Spektrum-Overlay optisch passte und der Betriebspunkt-Monitor `Energie Δ +0.4 dB` und `Frequenz Δ −1 Hz` (beide grün) zeigte — das Signal war also akustisch nahezu identisch zur Referenz. Alle Expert-Debug-Werte standen auf `--`.

**Ursache (zwei zusammenwirkende Punkte):**
1. **Varianz-Heterogenität (Kern):** Auf relativen ESD-Features (Σ=1) ist die Per-Bin-Varianz extrem ungleich — die meisten der 512 Bins sind energiearmes **Grundrauschen** mit nahezu null Varianz. Die diagonale Mahalanobis-Distanz `Σ (f−μ)²/var` **gewichtet genau diese unzuverlässigen Rausch-Bins am stärksten** (`var → 0`). Schon minimale Raum-/Rauschunterschiede zwischen Anlernen und Diagnose lassen die Distanz explodieren → Score 0, obwohl die *informativen* Peak-Bins passen. Das Varianz-Flooring war zudem an den **Median** der Varianzen gebunden (selbst winzig), half also kaum.
2. **`bestModel`-Auswahl:** `classify` setzte den besten Treffer nur bei `score > bestScore` (Start 0). Bei Score 0 blieb `bestModel = null` → `metadata.debug = undefined` → alle Debug-Werte `--`.

**Fix:**
1. **Shrinkage der Varianz Richtung Mittelwert** (scaled-identity / Ledoit-Wolf-Stil, [Briefing] §7): `var_eff[k] = (1−γ)·var[k] + γ·meanVar`, Konstante `VAR_SHRINKAGE_GAMMA = 0.5`. Das **kappt die Übergewichtung** der Rausch-Bins; ein akustisch passendes Signal landet wieder im gesunden Band. Das Flooring referenziert jetzt den **Mittelwert** statt des Medians.
2. **`classify` wählt immer das nächstgelegene Modell** (Vergleich über die Distanz, nicht den Score) → `bestModel`/Debug sind immer gesetzt.

**Tests:** Neuer realitätsnaher Test (wenige Peaks + viele Rausch-Bins): ein passendes Live-Frame scort jetzt **im gesunden Band (> 50), nicht 0**; ein klar abweichendes Spektrum scort niedriger. Der Flooring-Test prüft nun, dass Shrinkage die Streuung **komprimiert, aber die Ordnung erhält** (kein Kollaps). 226 Tests grün, tsc/eslint/Build sauber.

> **Wichtig für den nächsten Gerätetest:** Der Fix wirkt beim **Anlernen** (die Shrinkage steckt in den gespeicherten `diagVar` und der τ/α-Kalibrierung). **Bereits angelernte Mahalanobis-Referenzen müssen neu aufgenommen werden** — alte Modelle tragen die un-geshrinkten Varianzen und liefern weiterhin 0. GMIA-Referenzen sind nicht betroffen.

> **Offen (Messphase):** `γ = 0.5` ist ein robuster, aber **ungetunter** Default. Der richtige Wert (und ob diagonal-Mahalanobis hier überhaupt k-NN/Cosine schlägt — vgl. [Briefing] §17.2) gehört in die AUC/pAUC-Messung auf echten Daten. Der Feldbefund bestätigt die „Messen statt Bauen"-Priorität nachdrücklich.

### 11.10 Zweiter Gerätetest → Pivot der Engine auf Spektral-Cosine (One-Class)

**Symptom (zweiter Test, neu angelernte Referenz „Neu3"):** weiterhin **0 % / AUFFÄLLIG**, obwohl Messung und Referenz sich deckten (Prüfergebnis-Plot) und der Betriebspunkt grün war. Die Debug-Werte waren jetzt befüllt (Fix §11.9 war deployed): `cosine` (Distanz-Proxy `1/(1+d)`) = **0.0246 → Live-Distanz d ≈ 39,6**, `scalingConstant` (= α) = **1.80**, `RAW SCORE 0.0 %`.

**Erkenntnis (tiefer als §11.9):** Die Shrinkage allein reicht nicht. Das Problem ist **prinzipiell**: Mahalanobis gewichtet mit `1/Varianz` und betont damit die energiearmen Rausch-Bins; zusätzlich leitet die Kalibrierung ihre Skala aus der winzigen Streuung der stark überlappenden, fast identischen Trainingsfenster ab — jede natürliche Live-Abweichung wirkt dadurch „riesig". Eine akustisch passende Aufnahme ist in diesem Distanzraum real weit entfernt. Genau das nimmt [Briefing] **§17.2** vorweg: *„Mahalanobis ist die parametrische Alternative; k-NN [Cosine] ist nicht-parametrisch und bei sehr wenig Daten oft robuster."*

**Entscheidung (mit dem Auftraggeber):** Die Tier-0-Alternative wird auf eine **energie-/cosine-gewichtete One-Class-Engine** umgestellt — der Ansatz, der GMIA robust macht.

**Umsetzung:**
- **Distanz → Cosine-zur-Mittelwert-Signatur:** Modell = Referenz-**Mittelspektrum μ** (relative ESD) + tanh²-Konstante `C`. Diagnose: `score = 100·tanh(C·cos(f,μ))²` (GMIA-Gl. 4-Form), `C = atanh(√0.9)/μ_cos` mit `μ_cos` = mittlere Cosinus-Ähnlichkeit der Trainingsframes zu μ. **Energie-gewichtet** (laute Peak-Bins dominieren) und **scale-frei** — kein Kollaps mehr. Plus dieselbe `baselineScore`-Normalisierung wie GMIA (perfekter Treffer → ~100 %).
- **`engineId` bleibt `'mahalanobis'`** (Speicher-/Registry-Stabilität, keine Migration); Klassen-/Modelltyp-Namen unverändert. Modellfelder `diagVar`/`calibration` entfallen, neu `scalingConstant`. Nutzer-Label heißt jetzt **„Spektral-Cosine (One-Class)"**.
- `rawCosineSimilarity` ist für diese Engine jetzt ein **echter** Cosine (kein Proxy mehr).

**Tests (neu, 8 Stück):** u. a. **„FIELD FINDING": ein akustisch passendes Live-Frame (Peaks + Rauschboden) scort jetzt > 75 % und `healthy`** (statt 0); ein klar abweichendes Spektrum scort deutlich niedriger; **Robustheit gegen einen veränderten Rauschboden** (der Fall, der Mahalanobis kippte). 221 Tests grün, tsc/eslint/Build sauber, GMIA unangetastet und Default.

> **Wichtig für den nächsten Gerätetest:** Das Modell-Format hat sich geändert (jetzt μ + `scalingConstant`). **Die bestehende „Spektral-Cosine"-Referenz bitte erneut löschen und neu anlernen.** GMIA-Referenzen sind nicht betroffen.

> **Einordnung:** Cosine-zur-Mittelwert-Signatur ist verhaltensähnlich zu GMIA (deshalb robust) und der natürliche Vorbau für Tier 1 (YAMNet = Embedding + Cosine). Eine **k-NN-Variante über die Sub-Fenster** (Briefing §17.2, robuster gegen multimodale/„bewegte" Aufnahmen) bleibt als nächste Ausbaustufe vorgemerkt. Der eigentliche Hebel bleibt die **AUC/pAUC-Messung** auf echten Daten.

### 11.11 Ausbaustufe — k-NN über die Sub-Fenster (umgesetzt)

Die in §11.10 vorgemerkte k-NN-Variante (Briefing §17.2) ist jetzt umgesetzt — sie macht die Cosine-Engine erstmals **deutlich robuster als ein simpler Mittelwert** und damit klar von GMIA unterscheidbar, ohne neues Paket und offline.

**Idee:** Statt gegen *ein* gemitteltes Referenzspektrum vergleicht die Engine das Live-Frame gegen die **k nächsten Referenz-Sub-Fenster** (`KNN_K = 5`). Bei einer **bewegten** Aufnahme („Sweet Spot" suchen, mehrere Mikrofonpositionen in *einer* Aufnahme) ist das Mittelspektrum eine Verwischung mehrerer Cluster; k-NN trifft das nächste Cluster und bleibt stabil.

**Modell:** zusätzlich eine **Memory-Bank** `bank: number[][]` der Trainings-Sub-Fenster, gleichmäßig auf `MAX_BANK = 64` unterabgetastet (Speicher-/Export-Schranke). `mean` bleibt erhalten (Ghost-Overlay + Fallback).

**Ähnlichkeit:** `sim(f) = Mittel der k höchsten cos(f, bank_i)`. Kalibrierung weiterhin GMIA-Form (`C = atanh(√0.9)/μ_sim`), aber μ_sim wird **leave-one-out** über die Bank bestimmt (jedes Bank-Vektor schließt sich selbst aus) — ehrlich statt trivialer Selbsttreffer 1.0. Baseline-Normalisierung unverändert.

**Rückwärtskompatibel:** Modelle **ohne** Bank (die kurzlebige reine Cosine-zur-Mittelwert-Variante aus §11.10) funktionieren weiter — `modelSimilarity` fällt dann auf cos(f, μ) zurück. Ein erneutes Anlernen ist **nicht zwingend**, gibt der Referenz aber die k-NN-Robustheit (mit Bank).

**Tests (neu, +2):** die Bank wird angelegt und auf ≤ 64 gedeckelt; und auf einer **multimodalen** Referenz (zwei Positionen) scort ein Live-Frame der einen Position mit **k-NN klar höher als mit dem Mittelwert-Fallback**. 223 Tests grün, tsc/eslint/Build sauber, GMIA unangetastet.

> Damit ist die Tier-0-Alternative robust (Cosine), multimodal-tauglich (k-NN) und der saubere Vorbau für Tier 1 (YAMNet-Embeddings + Cosine/k-NN). Nächster echter Hebel bleibt die AUC/pAUC-Messung bzw. der Tier-1-Bau.

### 11.12 Feldbefund — Auto-Erkennung erkannte Cosine-Maschinen nicht (behoben)

**Symptom:** Die normale Diagnose lief am Gerät einwandfrei (Cosine 0.96, Score 99 %, „UNAUFFÄLLIG"), aber die **automatische Geräte-Erkennung** („Zustand prüfen") meldete *„Dieses Geräusch kenne ich noch nicht"*, obwohl eine Cosine-Referenz existierte.

**Ursache:** Die maschinenübergreifende Auto-Erkennung (`classifyAgainstMachine` / `classifyAcrossAllMachines`) war bewusst **GMIA-only** (Entscheidung Q4, Tier-0-Scope): Sie filterte mit `isGMIAModel`, sodass reine Cosine-Maschinen unsichtbar blieben. Begründung damals: Mahalanobis-Distanz-Scores waren nicht mit GMIA-Scores vergleichbar.

**Warum die Begründung weggefallen ist:** Seit dem Pivot (§11.10) liefert die Cosine-Engine **dieselbe GMIA-artige 0–100-Kalibrierung** (tanh² + baselineScore-Normalisierung). GMIA- und Cosine-Scores sind damit **direkt vergleichbar** — die ursprüngliche Q4-Sorge gilt nicht mehr.

**Fix:** Die Auto-Erkennung ist jetzt **engine-bewusst**: `classifyAgainstMachine` filtert nur noch nach Sample-Rate (nicht mehr nach Engine) und scort über den Registry-Dispatcher `classifyWithEngines(...)` mit der Engine des **jeweils gespeicherten** Modells. `MachineMatchResult.bestModel` ist auf `ReferenceModel` geweitet (Konsumenten lesen nur `.machine.name`/`.similarity`). Kein Import-Zyklus (lazy ESM, Build sauber).

**Test (neu):** `classifyAcrossAllMachines` erkennt eine reine **Spektral-Cosine-Maschine** jetzt mit `high_confidence` (~97 %) statt `no_match`. 224 Tests grün, tsc/eslint/Build sauber, GMIA unangetastet.

> Hinweis: Damit ist die in §9 / Entscheidung Q4 genannte GMIA-only-Einschränkung der Auto-Erkennung **aufgehoben**. Gemischte Engines pro Flotte sind über den Dispatcher konsistent (bester kalibrierter Score gewinnt).

### 11.13 Ausbaustufe — BEAM Sub-Band-Matching (umgesetzt)

Nach Durchsicht zweier aktueller Arbeiten (Paper A: Saengthong & Shinozaki, *Sub-Band Spectral Matching with Localized Score Aggregation*, arXiv 2603.13749; Paper B: *DCASE 2026 Task 2 — Noise-Aware Unsupervised ASD*, arXiv 2606.01578) wurde die Cosine/k-NN-Engine auf **BEAM** (Band-wise Equalized Anomaly Measure) gehoben — datengetrieben begründet, da Paper A genau die Schwäche unserer globalen Cosine-Bewertung benennt:

> *„cosine-based matching is energy-coupled, allowing a few high-energy bands to dominate score computation under normal energy fluctuations and further increase variance."*

Das ist exakt die Rauschboden-/Umgebungs-Instabilität aus dem Feld (§11.10 ff.).

**Verfahren:** Statt eines globalen Cosine über das ganze Spektrum wird das Spektrum in **oktav-artige Sub-Bänder** (log-spaced: 0,8,16,32,…,dim) geteilt. Jedes Band macht sein **eigenes k-NN** gegen dasselbe Band der Memory-Bank, und die Per-Band-Ähnlichkeiten werden **uniform aggregiert** (jedes Band gleich gewichtet). Das behebt **zwei** Varianzquellen der globalen Bewertung: (1) *tied-reference mismatch* (ein globaler Nachbar für alle Bänder erzwungen) und (2) *energy coupling* (wenige laute Bänder dominieren). Mehr Bandauflösung liegt bei tiefen Frequenzen (wo Maschinensignaturen sitzen).

**Implementierung:** rein im bestehenden 512-Bin-Featureraum, **kein** Modell-Download, offline. Die **Modellform bleibt** (μ + Bank + `scalingConstant`); Sub-Bänder werden zur Laufzeit aus den Bank-Vektoren geschnitten (Views, kein Mehrspeicher). Kalibrierung wie gehabt (GMIA-tanh²-Wertkennlinie, leave-one-out über die Bank), nur auf der **BEAM-Ähnlichkeit**. `AdaBEAM` (adaptive Mean/Max-Fusion über die Zeit) ist im Echtzeit-Per-Frame-Pfad weniger direkt anwendbar und bleibt vorgemerkt.

**Tests (+1, 225 gesamt):** alle bestehenden Verhaltens-/Robustheitstests grün (kein Regress); neu: eine **band-lokalisierte Anomalie** (ein Sub-Band verändert) senkt den Score — genau die Stärke der Per-Band-Bewertung. tsc/eslint/Build sauber, GMIA unangetastet.

> **Wichtig für den Gerätetest:** Die Kalibrierung ist jetzt BEAM-basiert. **Bestehende Cosine-Referenzen bitte neu anlernen** (gleiche Bedienung), damit `scalingConstant` zur Sub-Band-Ähnlichkeit passt. GMIA nicht betroffen.

> **Ehrliche Grenze:** Der *quantitative* Vorteil von BEAM (geringere Falsch-Positiv-Varianz unter Rauschen/Domain-Shift) ist in den Papers an DCASE-Benchmarks belegt; auf euren Maschinen zeigt ihn erst die **AUC/pAUC-Messung**. Die Unit-Tests sichern nur, dass BEAM nicht regressiert und band-lokalisierte Änderungen sieht.

> **Einordnung Roadmap:** Damit ist die „Matching-Achse" (Paper A) für Tier 0 ausgereizt. Der nächste *grundsätzlich* andere Schritt ist die „Encoder-Achse" — Tier 1 (YAMNet/Embeddings) für **zeitveränderliche** Signaturen, die weder Cosine noch BEAM greifen. Diese Entscheidung sollte **gemessen** werden (generisches YAMNet ist laut Briefing §17.5 und Paper A nicht zwingend das Optimum).

### 11.14 Feldbefund — erkannter Fehler wurde als „unauffällig" angezeigt (behoben)

**Symptom:** Legt man eine zweite Referenz als **Fehler** an (z. B. „mies", `type: faulty`) und die Maschine klingt später so, matcht die Diagnose dieses Fehler-Modell mit hohem Score (z. B. 97 %). Angezeigt **und gespeichert** wurde aber „UNAUFFÄLLIG 97 %".

**Ursache (engine-unabhängig, betrifft auch GMIA):** `3-Diagnose.ts` leitete den Status **nur aus der Score-Zahl** ab (`classifyHealthStatus(filteredScore)`, ≥75 → gesund) und ignorierte den **Typ** des getroffenen Modells. Ein 97-%-Treffer auf eine *Fehler*-Referenz heißt aber „Fehler zu 97 % bestätigt", nicht „gesund".

**Fix (Design „zwei Punkte", mit dem Auftraggeber abgestimmt):**
- Pro Frame werden die Per-Zustand-Scores nach **Typ** getrennt (`scoreAllWithEngines` liefert `isHealthy`): bester **gesunder** und bester **fehlerhafter** Score, jeweils separat geglättet.
- **Hauptanzeige (Gauge) = Nähe zur gesunden Referenz.** Eine sicher gematchte **Fehler-Referenz** setzt den Status auf **AUFFÄLLIG** (unabhängig von der Score-Höhe) und wird als **separate Aussage** mit *ihrer* Qualität gezeigt: „Fehler erkannt: «mies» (97 %)".
- Status: `faulty`, wenn ein Fehler-Match ≥ `confidenceThreshold`; sonst wie bisher aus dem Gesund-Score. **Gespeichert** wird der korrekte Status + `faultLabel`/`faultScore` in den Metadaten (Verlauf/Ergebnis-Screen zeigen es). Nur **neue** Messungen; Altdaten unberührt.
- **Kein Regress** für reine Normal-Referenz-Maschinen (ohne Fehler-Modelle ist die Logik identisch zum bisherigen Verhalten).

225 Tests grün, tsc/eslint/Build sauber. GMIA-Mathematik unangetastet (reine Anzeige-/Orchestrierungslogik).

### 11.15 Tier 1 — YAMNet als dritte, separat wählbare Engine (Beta)

Auf Wunsch des Auftraggebers als **eigenständige dritte Engine** (Umschalter: GMIA / Spektral-Cosine / **YAMNet**) — mit der nicht verhandelbaren Vorgabe: **die ersten beiden Engines und die gesamte UI bleiben exakt unverändert.**

**Isolation (Kernprinzip):**
- Eigene **asynchrone** Engine-Schnittstelle (`AsyncDiagnosisEngine`) **getrennt** von der synchronen (`DiagnosisEngine`). GMIA/Cosine und der synchrone Dispatcher sind **unangetastet**; der Sync-Dispatcher **filtert yamnet-Modelle heraus** (`resolveEngineId !== 'yamnet'`).
- TF.js wird **lazy** geladen (`await import('@tensorflow/tfjs')`, Code-Split in einen stabilen `tfjs-*.js`-Chunk) — nur wenn YAMNet genutzt wird. **Haupt-Bundle unverändert** (~273 kB); der ~1,9-MB-TF.js-Chunk ist **aus dem PWA-Precache ausgeschlossen** (`globIgnores`), lädt on-demand und wird per Runtime-Caching offline-fähig. Nutzer der ersten beiden Engines laden TF.js **nie**.
- Diagnose-Pfad: In `3-Diagnose.processChunkDirectly` führt **ein** Branch am Anfang yamnet-Maschinen in `processChunkYamnet` (async); der gesamte synchrone Code darunter (GMIA/Cosine + UI) bleibt Zeile für Zeile gleich.

**Verfahren (YAMNet):** Roh-Audio → **16-kHz-Resampling** → YAMNet-Embedding (1024-dim) → **Cosine-k-NN** gegen eine Memory-Bank von Referenz-Embeddings, **wert-kalibriert wie die Spektral-Cosine-Engine** (tanh² + Baseline). Echtzeit über einen **~1-s-Rolling-Buffer** (deckt YAMNets 0,96-s-Fenster) + Busy-Flag gegen Inferenz-Stau. Sample-rate-**unabhängig** (Briefing §13): der Rate-Filter wird für yamnet übersprungen. Die fault-bewusste Anzeige (§11.14) gilt auch hier.

**Testbar/getestet hier:** Resampler + Rolling-Buffer (7 Unit-Tests), Cosine/k-NN/Kalibrierung (via Spektral-Engine), tsc/eslint/**232 Tests**/Build grün, Isolation (Bundle-Split, Precache ohne TF.js).
**Nur am Gerät validierbar:** die eigentliche **TF.js-Inferenz** (Modell-Load + `model.execute`). Modell-URL und Output-Auswahl sind als Konstanten gekapselt (leicht am Gerät anzupassen).

> **Status:** strukturell vollständig und isoliert, als **Beta** im Umschalter. GMIA bleibt Default; die ersten beiden Engines und die UI sind nachweislich unverändert. Nächster Schritt: Gerätetest der Inferenz (Modell lädt, plausibler Score), danach ggf. Web-Worker-Auslagerung und Service-Worker-Precache des Modells für volle Offline-Fähigkeit.

---

## §11.16 — Doppelprüfung Tier 1 (Mathematik, Verfahren, Robustheit)

Auftrag: „prüfe doppelt anhand den Dokumenten, ob dies mathematisch und Verfahren funktionieren sollte und prüfe auf Fehler sowie Robustheit." Geprüft gegen Build-Briefing (§8 Embedding-Pipeline, §10 Worker/Offline, §13 Kalibrierung, §17 Robustheit) und Paper A (BEAM, distanzbasiertes One-Class-Matching).

### Verfahrensketten-Prüfung (sollte es funktionieren?)

| Schritt | Umsetzung | Bewertung |
|---|---|---|
| Resampling → 16 kHz | lineare Interpolation, gleicher Resampler für Training **und** Diagnose | ✓ konsistent (gemeinsame Aliasing-Charakteristik kürzt sich beim Cosine-Vergleich) |
| Fensterung | 0,96 s Fenster / 0,48 s Hop @ 16 kHz (15360/7680) | ✓ YAMNet-Standardraster |
| Embedding | YAMNet → frames×1024, Mittel über frames, L2-Normierung | ✓ ein stabiler 1024-d-Vektor pro Fenster |
| Memory-Bank | Embeddings je Referenz, Cap 32 | ✓ (Cap gesenkt, s. u.) |
| Kalibrierung | C = atanh(√0,9)/μ_sim, Score = 100·tanh²(C·cos), Leave-one-out-μ | ✓ identisch zur Spektral-Engine (§13); GMIA-konform |
| Klassifikation | Cosine-k-NN (k=5) gegen Bank, Multiklassen-Argmax, Baseline-Normierung | ✓ entspricht BEAM-Prinzip (distanzbasiert, ohne dichtebasierte Annahmen) |
| Fehler-Anzeige | gesund/Fehler-Split, separate Fehlerlinie ≥ confidenceThreshold | ✓ gleich wie synchroner Pfad |

**Fazit:** Mathematik und Verfahren sind in sich konsistent und entsprechen dem Briefing. Tier 1 ersetzt nur die **Repräsentation** (ESD → YAMNet-Embedding); Matching und Kalibrierung sind die bereits feldverifizierte Cosine-/k-NN-Logik.

### Gefundene/behobene Robustheitspunkte

1. **Falsche Resample-Rate beim Training (behoben).** In `2-Reference.ts` wurde das Roh-Audio mit `config.sampleRate` (Wunschrate) statt mit `currentAudioBuffer.sampleRate` (echte Hardwarerate) an die Engine übergeben. Weicht die Hardware ab (häufig auf Android), wäre die Referenz beim Resampling auf 16 kHz tonhöhenverschoben worden → korrupte Embeddings. Jetzt wird die **echte Buffer-Rate** verwendet.
2. **Bank-Reallokation pro Frame (behoben).** `classify`/`scoreAll` haben die gespeicherte `number[][]`-Bank bei **jedem** Live-Frame neu in `Float32Array[]` umgewandelt (tausende Typed-Array-Allokationen/Minute). Jetzt `WeakMap`-Cache pro Modellobjekt (GC-sicher, kein Leak).
3. **Export-Größe (entschärft).** `MAX_BANK` von 64 → **32** gesenkt. Jeder Bank-Eintrag ist ein 1024-d-Vektor im JSON-Export; 64×mehrere Zustände sprengten zuvor das Geräte-Teilen-Limit („Datei zu groß"). 32 Fenster decken ~15 s Referenz beim 0,48-s-Hop ab.
4. **Output-Auswahl (bereits gehärtet).** `embed()` wählt den Embeddings-Tensor per Form `[N,1024]` und wirft bei Abweichung einen klaren Fehler (statt still den falschen Tensor zu mitteln).

### Verbleibende, bewusst akzeptierte Grenzen

- **Auto-Erkennung überspringt YAMNet.** Der synchrone Dispatcher filtert `yamnet`-Modelle (Isolations-Anforderung). Folge: „Gerät automatisch erkennen" findet YAMNet-Maschinen **nicht** — bewusste Regression zugunsten der geforderten Trennung der ersten beiden Engines.
- **Kein Web-Worker (Briefing §10).** Inferenz läuft im Main-Thread; `yamnetBusy`-Flag verhindert Pile-up, aber lange `execute`-Calls können kurz ruckeln. Worker-Auslagerung bleibt Folgeschritt.
- **Inferenz nur am Gerät verifizierbar.** Modell-Load + `model.execute` sind nicht in CI testbar; URL und Output-Auswahl sind als Konstanten gekapselt.

### Verifikation

tsc ✓ · eslint ✓ · **232 Tests** ✓ · Build ✓ — Haupt-Bundle unverändert **273 kB**, TF.js isoliert im Lazy-Chunk (Precache 5260 KiB **ohne** TF.js). GMIA bleibt Default; erste beide Engines und UI unverändert.
