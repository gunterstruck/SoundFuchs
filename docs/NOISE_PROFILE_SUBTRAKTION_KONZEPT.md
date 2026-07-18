# Konzept: Lärmprofil-Subtraktion („Noise Fingerprint")

**Status:** MVP + Stufe 1 umgesetzt (siehe §6; Stufe 2/3 offen)
**Datum:** 2026-07-02
**Branch:** `claude/noise-fingerprint-subtraction-ckazyb`

> **Umsetzungsstand:**
> - **MVP** ✅ – `src/core/dsp/noiseProfile.ts` (Capture/Batch/Realtime/
>   Settings, robuster Median-Scale-Fit statt Least Squares – LS erwies
>   sich im Test als anfällig für Maschinen-Spektrallinien),
>   Profilaufnahme-UI in den Einstellungen (Expert), Integration in
>   Referenz- und Diagnose-Phase, PipelineStatus-Zeile, 5 Sprachen.
> - **Stufe 1** ✅ – SNR-Konfidenz-Ampel (±Schwellen +15/−5 dB),
>   Staleness-Warnung (7 Tage), Überlappungswarnung Profil↔Referenz
>   (Kosinus > 0.9, R5), Gerätewechsel-Hinweis (deviceLabel, R4).
>   Stationarität wird bei der Aufnahme berechnet und gemeldet.
> - **Stufe 2** ✅ – Mess-Labor-Modus „Lärm-Robustheit (A/B)"
>   (`src/lab/noiseBenchmark.ts`): mischt echte Maschinen-Clips mit einer
>   separaten Lärm-WAV bei definierten SNR-Stufen und misst AUC/pAUC mit
>   vs. ohne Subtraktion (Profil aus 1. Hälfte der Lärmdatei, gemischt
>   wird die 2. Hälfte; Training auf sauberen Clips = Werks-Szenario).
>   Zeigt zusätzlich den Produktions-SNR-Schätzer gegen die bekannte
>   Misch-SNR (validiert die Ampel; im Arbeitsbereich ±1 dB genau,
>   unterhalb ~−15 dB überschätzt er den Lärm — dort ist das Ergebnis
>   ohnehin rot markiert). CSV/JSON-Export. Nur Sync-Engines.
> - **Stufe 3 (Minimum-Statistics-Fallback)** ✅ –
>   `MinimumStatisticsNoiseEstimator` + `RealtimeMinStatsSubtraction`
>   (vereinfachtes Martin 2001): Wenn kein kompatibles Profil vorliegt
>   und der Fallback aktiviert ist, wird der Lärmboden während der
>   Diagnose aus dem gleitenden Energie-Minimum geschätzt. Zentrale
>   Absicherung: Subtraktion NUR in maschinen-schwachen Bins
>   (refLogMean-Maske) – bei stationären Maschinen würde das Minimum
>   sonst die Maschinensignatur selbst als "Lärm" lernen. Braucht daher
>   eine vorhandene Referenz; Default aus.
> - **„Maschine ohne Halle" anhören** (§5.5) bewusst offen: Die
>   Resynthese-Qualität muss nach Gehör an echter Hardware beurteilt
>   werden (vgl. Hinweis in differenceIsolation.ts) – ungeeignet für
>   Umsetzung ohne Hörprüfung.

---

## 1. Ausgangsidee

Eine Maschine wird im Werk „eingelernt" (Referenz-Fingerprint unter sauberen
Bedingungen). Beim Kunden herrscht Umgebungslärm (Lüftung, Nachbarmaschinen,
Halle). Die Idee:

> **Bevor die Maschine aufgebaut ist bzw. läuft, wird der Umgebungslärm vor Ort
> aufgenommen („Lärm-Fingerprint"). Bei der späteren Diagnose wird dieses
> Hintergrundprofil vom gemessenen Signal abgezogen, sodass der Vergleich mit
> der Werksreferenz wieder unter „quasi-sauberen" Bedingungen stattfindet.**

Das ist ein bekanntes, gut verstandenes Verfahren: **Spektrale Subtraktion**
(Boll 1979) mit einem **offline gemessenen Rauschprofil** – exakt das, was
z. B. Audacitys „Noise Reduction" mit einem Rauschsample macht. Es passt
außerdem hervorragend zur bestehenden Zanobo-Architektur (siehe §4).

---

## 2. Physikalische Bewertung: Wann funktioniert das?

### 2.1 Grundannahme

Umgebungslärm ist (näherungsweise) **additiv und unkorreliert** zum
Maschinensignal. Dann gilt im Energiespektrum pro Frequenz-Bin `k`:

```
E[|Y(k)|²] = E[|S(k)|²] + E[|N(k)|²]
   Y = Messung, S = Maschine, N = Hintergrund
```

Das heißt: Die **mittlere** Lärmenergie pro Bin lässt sich von der gemessenen
Energie abziehen und liefert im Erwartungswert das reine Maschinenspektrum.
Genau auf solchen Energie-Vektoren (512 Bins, `absoluteFeatures`) arbeitet
Zanobo bereits – die Subtraktion ist also eine natürliche Pipeline-Stufe.

### 2.2 Die drei SNR-Regime (Einschätzung der Ausgangsidee)

| Regime | SNR (Maschine vs. Lärm) | Nutzen der Subtraktion | Bewertung |
|---|---|---|---|
| Maschine dominiert | > ~15 dB | Gering – Lärm geht ohnehin unter | Korrekt: robust auch ohne Feature |
| **Ähnliche Pegel** | **ca. −5 … +15 dB** | **Maximal – hier rettet die Subtraktion den Score** | **Das ist der Sweet Spot der Idee** |
| Lärm dominiert | < ~−5 dB (in den relevanten Bins) | Begrenzt bis unzuverlässig | Einschränkung, siehe unten |

Die Intuition „bei ähnlichen Pegeln bringt es am meisten, bei sehr lauter
Maschine ist es egal" ist **physikalisch korrekt**. Eine wichtige Ergänzung:

**Bei stark negativem SNR kippt das Verfahren.** Abgezogen werden kann nur der
*Mittelwert* des Lärms; seine *Schwankung* (Varianz) bleibt im Signal. Ist der
Lärm z. B. 10 dB lauter als die Maschine, ist nach der Subtraktion das
Residuum von den Lärmfluktuationen dominiert, nicht von der Maschine – der
Score wird dann scheinbar „bereinigt", ist aber Rauschen. **Konsequenz: Das
Feature braucht zwingend eine SNR-Ampel, die dem Nutzer sagt, wie
vertrauenswürdig das Ergebnis nach der Subtraktion ist** (§5.2).

### 2.3 Was die Subtraktion kann – und was nicht

**Entfernt wird zuverlässig:**
- Stationärer/quasi-stationärer Lärm: Lüftung, HVAC, Kompressoren-Dauerlauf,
  Brummen von Nachbaraggregaten, Hallengrundpegel, 50-Hz-Netzbrumm.

**Nicht (oder schlecht) entfernt wird:**
- **Instationäres:** Stimmen, Gabelstapler, Türen, Hupen, Druckluftstöße.
  → Dafür existiert bereits Cherry-Picking (Energy-Entropy-Gate,
  `cherryPicking.ts`), das transiente Frames verwirft. Die beiden Stufen
  ergänzen sich perfekt: Cherry-Picking gegen Transienten, Lärmprofil gegen
  den stationären Sockel.
- **Tonaler Lärm exakt auf Maschinenfrequenzen:** Der fieseste Fall ist eine
  *baugleiche Nachbarmaschine* – deren Spektrallinien liegen auf denselben
  Bins. Subtraktion zieht dann auch Maschinenenergie ab (Verzerrung der
  Signatur). Erkennbar und warnbar über Überlappungsanalyse (§5.3), aber
  nicht vollständig lösbar.

### 2.4 Randbedingungen im Zanobo-Kontext (geprüft)

- **AGC ist bereits deaktiviert** (`audioHelper.ts`: `autoGainControl: false`,
  ebenso `echoCancellation`/`noiseSuppression`). Ohne diese Voraussetzung wäre
  eine session-übergreifende Absolut-Energie-Subtraktion sinnlos. ✅
- **Restliche Pegelunsicherheit** (Mikrofonabstand, anderes Gerät, andere
  Handyhaltung zwischen Lärmaufnahme und Diagnose) bleibt. Lösung: ein
  **globaler Skalierungsfaktor `g`**, per Least-Squares auf den
  *lärmdominierten* Bins geschätzt – dieselbe Technik verwendet
  `differenceIsolation.ts` bereits erfolgreich für den Referenzabgleich. ✅
- **Die Pipeline normalisiert Features auf Summe 1** (Kosinus-Vergleich).
  Die Subtraktion muss deshalb **vor** der Normalisierung auf den
  `absoluteFeatures` stattfinden und danach re-normalisieren – exakt das
  Muster, das `roomCompensation.ts` in allen Stufen benutzt. ✅
- **Reihenfolge:** Additive Störungen (Lärm) zuerst entfernen, konvolutive
  (Raum/T60, Bias Match) danach. Lärmsubtraktion wird also die **erste**
  Kompensationsstufe nach Cherry-Picking. Wichtig: Session Bias Match würde
  stationären Lärm sonst teilweise „mitkorrigieren" – aber undifferenziert,
  und dabei auch echte Anomalien glattbügeln. Die Lärmsubtraktion ist der
  prinzipiell sauberere Mechanismus für diesen Störungstyp. ✅

---

## 3. Risiken (von allen Seiten geprüft)

| # | Risiko | Schwere | Gegenmaßnahme |
|---|---|---|---|
| R1 | **Lärm ändert sich zwischen Profilaufnahme und Diagnose** (Schichtbetrieb, Anlagen an/aus) | Hoch | (a) Profil-Alter anzeigen + Staleness-Warnung. (b) Mehrere benannte Profile pro Standort („Schicht A", „Wochenende"). (c) Schnell-Recapture (15 s) direkt vor der Diagnose, wenn die Maschine kurz aus ist. (d) Plausibilitätscheck: Lärmpegel in maschinenarmen Bins während der Diagnose gegen das Profil vergleichen → Warnung bei Abweichung. |
| R2 | **Über-Subtraktion verzerrt die Maschinensignatur** → Score fällt fälschlich, Fehlalarm | Mittel | Spectral Floor pro Bin (Gain min. `spectralFloor`, wie bei T60-Stufe), Über-Subtraktions-Faktor `β` konservativ bei 1.0, beides einstellbar (UI-Muster von Room Comp übernehmen). |
| R3 | **SNR zu schlecht → Ergebnis wertlos, wirkt aber „bereinigt"** | Hoch | SNR-Konfidenz-Ampel (§5.2) verpflichtend mit ausliefern; unter Schwellwert Diagnose-Ergebnis explizit als „eingeschränkt aussagekräftig" markieren. |
| R4 | **Pegel-Mismatch** (anderes Gerät/Abstand bei Profilaufnahme) | Mittel | Globaler Scale-Fit `g` auf lärmdominierten Bins (§4.2); Geräte-Metadaten am Profil speichern und bei Gerätewechsel warnen. |
| R5 | **Baugleiche Nachbarmaschine im Profil** | Mittel | Überlappungswarnung: Wenn Profilspektrum und Referenzspektrum stark korrelieren (Kosinus > Schwellwert), Hinweis „Hintergrund enthält maschinenähnliche Anteile – Subtraktion mit Vorsicht". |
| R6 | **Falsches Sicherheitsgefühl** („mit Subtraktion ist jede Messung gut") | Mittel | Feature default **AUS**, klar als Kompensations-Werkzeug kommuniziert (konsistent mit Zanobo-Philosophie „Vergleich statt Diagnose"); Pipeline-Status zeigt aktiv an, dass und wie stark subtrahiert wurde. |
| R7 | **Profil verrauscht/instationär aufgenommen** (jemand redet währenddessen) | Niedrig | Live-Stationaritätscheck während der Profilaufnahme (§5.1): Varianz/Mittelwert pro Bin überwachen, Nutzer-Feedback „stabil / bitte länger aufnehmen". Cherry-Picking auch auf die Profilaufnahme anwenden. |

**Gesamturteil:** Die Idee ist tragfähig, der Nutzen im Ziel-Regime (SNR ≈ 0
… 15 dB) real und signifikant, die Risiken sind alle mit bekannten, im Projekt
teils schon implementierten Mustern beherrschbar. Der kritischste Punkt ist
nicht die Mathematik, sondern **R1 (Nichtstationarität über Stunden/Tage)** –
deshalb gehören Profilverwaltung + Frische-Checks von Anfang an dazu.

---

## 4. Lösungsvorschlag

### 4.1 Architektur: neue optionale Pipeline-Stufe „0.5"

```
Mikrofon → Feature-Extraktion (512 Bins, absoluteFeatures)
  → [Stufe 1] Cherry-Picking            (transiente Frames raus)      – existiert
  → [Stufe 1.5] LÄRMPROFIL-SUBTRAKTION  (stationären Sockel abziehen) – NEU
  → [Stufe 3.5] Room Compensation       (T60 / Bias Match / CMN)      – existiert
  → GMIA / SpectralCosine → Score
```

Neues Modul `src/core/dsp/noiseProfile.ts`, nach dem bewährten Muster von
`roomCompensation.ts`:

- `captureNoiseProfile(features: FeatureVector[]): NoiseProfile` – aus einer
  30–60 s Aufnahme (Maschine aus) Mittelwert **und** Standardabweichung der
  Energie pro Bin berechnen.
- `applyNoiseSubtraction(features, profile, settings): FeatureVector[]` –
  Batch-Variante für Referenz-Phase und Mess-Labor.
- `class RealtimeNoiseSubtraction` – Streaming-Variante für die
  Diagnose-Phase (Spiegelbild von `RealtimeT60Subtraction`: ein `process(fv)`
  pro Frame, zustandsarm).
- `NoiseSubtractionSettings` + localStorage-Persistenz (`enabled`, `beta`,
  `spectralFloor`, `activeProfileId`), Defaults: **aus**, `β = 1.0`,
  Floor `0.05`.

### 4.2 Mathematik pro Frame und Bin

`absoluteFeatures[k]` ist „Square Root Mean Value" der FFT-Magnituden, also
eine Amplitude. Subtrahiert wird in der **Energie-Domäne** (Quadrate), als
Gain-Formel im Stil der vorhandenen Lebart-Stufe:

```
P_y(k)   = Y(k)²                        // Energie der Messung im Bin k
P_n(k)   = (g · N_mean(k))²             // skalierte Profilenergie
G(k)     = max(1 − β · P_n(k) / (P_y(k) + ε), spectralFloor)
Y_clean(k) = sqrt(G(k)) · Y(k)          // danach Re-Normalisierung auf Summe 1
```

Skalierungsfaktor `g` (kompensiert Abstand/Gerät zwischen den Sessions):

```
Lärmdominierte Bins B = { k : N_mean(k) > median(N_mean) und R_ref(k) klein }
g = Σ_B (Y_mean(k)·N_mean(k)) / Σ_B N_mean(k)²   // Least-Squares, geclampt z. B. auf [0.25, 4]
```

`R_ref(k)` = mittleres Referenzspektrum der Maschine (liegt als `refLogMean`
bereits pro Maschine vor). In Bins, in denen die Maschine laut ist, kann `g`
nicht geschätzt werden – dort würde Maschinenenergie den Fit verfälschen.

### 4.3 Datenmodell

Neue eigenständige Entität (ein Standort-Profil kann mehreren Maschinen
dienen), gespeichert in IndexedDB:

```ts
interface NoiseProfile {
  id: string;
  name: string;                 // z. B. "Halle 3, Schicht A"
  createdAt: number;
  durationSec: number;
  meanEnergy: number[];         // 512 Bins, lineare Energie (wie absoluteFeatures)
  stdEnergy: number[];          // 512 Bins – für Stationaritäts-/Konfidenzchecks
  broadbandRms: number;         // Gesamtpegel zur Plausibilisierung
  sampleRate: number;
  deviceLabel?: string;         // Mikrofon-/Gerätekennung → Warnung bei Wechsel
}
```

Verknüpfung: `Machine.noiseProfileId?: string | null` (Muster analog
`fleetReferenceSourceId`). `number[]` statt TypedArray – konsistent mit
`refLogMean` (IndexedDB/JSON-Serialisierung).

### 4.4 UX-Ablauf

1. **Profil aufnehmen** (neuer Punkt in Einstellungen oder Referenz-Phase):
   „Umgebungslärm aufnehmen – Maschine ausgeschaltet lassen." Geführte
   30–60 s-Aufnahme mit Live-Feedback (§5.1). Benennen, speichern.
   Das deckt exakt das Szenario ab: *Techniker ist vor Ort, Maschine noch
   nicht aufgebaut → Profil jetzt aufnehmen, Diagnose Tage später.*
2. **Aktivieren:** Toggle „Lärmprofil-Subtraktion" in den
   Pipeline-Einstellungen (UI-Muster der Room-Compensation-Sektion in
   `4-Settings.ts`), Profilauswahl pro Maschine.
3. **Diagnose:** `PipelineStatus` zeigt aktives Profil, Alter, geschätztes
   SNR und die Konfidenz-Ampel. Warnungen bei Staleness, Gerätewechsel,
   SNR-Unterschreitung oder Profil/Referenz-Überlappung (R5).
4. **Referenz-Phase optional ebenfalls:** Wird die *Referenz* selbst in
   lauter Umgebung erstellt (Einlernen erst beim Kunden), verbessert dieselbe
   Stufe auch das Einlernen – gleicher Code, Batch-Variante.

### 4.5 Validierung im Mess-Labor (bereits vorhandene Infrastruktur nutzen)

Das Mess-Labor (`src/lab`) hat Benchmark- und AUC-Auswertung. Erweiterung:

- **Synthetisches Mixing:** Maschinenaufnahmen + separate Lärmaufnahmen bei
  definierten SNR-Stufen (−10, −5, 0, +5, +10, +15 dB) mischen.
- **A/B-Metrik:** AUC bzw. Score-Separation (gut/anomal) **mit vs. ohne**
  Subtraktion je SNR-Stufe. Erwartung: deutlicher Gewinn im Bereich
  −5…+15 dB, Neutralität darüber, dokumentierter Zerfall darunter → daraus
  die Schwellwerte der Konfidenz-Ampel ableiten (nicht raten, messen).
- Zusätzlich Robustheitstest: Diagnose-Lärm ≠ Profil-Lärm (leicht verschobene
  Spektren) → quantifiziert R1.

---

## 5. Kreative Erweiterungen

### 5.1 Live-Stationaritätscheck bei der Profilaufnahme

Während der Aufnahme laufend `stdEnergy/meanEnergy` pro Bin aggregieren:

- Quasi-stationär (Variationskoeffizient klein) → „✅ Lärmprofil stabil,
  Aufnahme kann beendet werden."
- Unruhig (jemand spricht, Stapler fährt) → „⚠️ Umgebung unruhig – bitte
  länger aufnehmen" (Mittelung glättet Transienten heraus; zusätzlich
  Cherry-Picking auf die Profil-Frames anwenden).

Das macht die Profilqualität für Laien sichtbar – wichtig, weil das Profil
Tage später unbeaufsichtigt wirkt.

### 5.2 SNR-Konfidenz-Ampel (der wichtigste Zusatz)

Pro Diagnose berechnen: Anteil der Maschinenenergie, der in Bins mit
`SNR > X dB` liegt (Maschinenenergie ≈ Messung nach Subtraktion, Lärm ≈
skaliertes Profil):

- 🟢 „Maschine dominiert – Subtraktion kaum nötig"
- 🟡 „Ähnliche Pegel – Subtraktion aktiv und wirksam" *(der Sweet Spot)*
- 🔴 „Hintergrund lauter als Maschine – Ergebnis nur eingeschränkt
  aussagekräftig, Mikrofon näher an die Maschine"

Damit wird die SNR-Überlegung aus der Ausgangsidee direkt als
Nutzer-Feedback operationalisiert, und R3/R6 sind entschärft.

### 5.3 Profil/Referenz-Überlappungswarnung

Kosinus-Ähnlichkeit zwischen `NoiseProfile.meanEnergy` und dem
Referenzspektrum der Maschine berechnen. Hoch (> ~0.9) → „Hintergrund klingt
der Maschine sehr ähnlich (baugleiche Nachbarmaschine?) – Subtraktion kann
die Signatur verfälschen." (R5)

### 5.4 Ausbaustufe 2: Kontinuierliche Lärmschätzung ohne separates Profil

Wenn die Maschine nie ausgeschaltet werden kann und kein frisches Profil
existiert: **Minimum-Statistics-Schätzer** (Martin 2001) – verfolgt pro Bin
das gleitende Minimum der Energie über ein Fenster; das approximiert den
Lärmboden *während* die Maschine läuft. Weniger genau als ein echtes Profil,
aber immer aktuell. Ideal als Fallback und als Frische-Check fürs
gespeicherte Profil. Bewusst als spätere Ausbaustufe – erst das explizite
Profil validieren.

### 5.5 Synergie mit „Nur das Neue hören"

`differenceIsolation.ts` resynthetisiert bereits „Messung minus Referenz"
als hörbares Signal. Dieselbe Maschinerie mit dem Lärmprofil als Abzugsbasis
liefert **„Maschine ohne Halle" zum Anhören** – ein unmittelbar erlebbarer
Beleg, ob das Profil passt, und ein starkes Demo-Feature.

---

## 6. Empfehlung & Ausbaustufen

**Empfehlung: umsetzen** – als optionale, default-deaktivierte Pipeline-Stufe
im bewährten Muster (Cherry-Picking/Room Comp). Die Idee adressiert genau die
Lücke zwischen „Maschine übertönt alles" (kein Problem) und „Lärm erdrückt
alles" (kein Verfahren hilft), und die Codebasis bringt fast alle Bausteine
schon mit (Feature-Pipeline auf absoluten Energien, Gain-Formel mit Floor,
Realtime-Klassen-Muster, Scale-Fit, Profil-Persistenz analog `refLogMean`,
Mess-Labor zur Validierung).

| Stufe | Inhalt | Aufwand (grob) |
|---|---|---|
| **MVP** | `noiseProfile.ts` (Capture, Batch, Realtime, Settings), Profilaufnahme-UI, Toggle in Settings, Anwendung in Diagnose + Referenz, Anzeige im PipelineStatus | ~2–3 Tage |
| **Stufe 1** | SNR-Konfidenz-Ampel, Stationaritätscheck bei Aufnahme, Staleness-/Geräte-/Überlappungswarnungen, Mehrfach-Profile pro Standort | ~2 Tage |
| **Stufe 2** | Mess-Labor-Benchmark (SNR-Mixing, A/B-AUC) → Schwellwerte kalibrieren | ~1–2 Tage |
| **Stufe 3** | Minimum-Statistics-Fallback, „Maschine ohne Halle" anhören | optional |

**Nicht-Ziele:** kein Anspruch, instationären Lärm zu entfernen (das bleibt
Cherry-Picking), keine automatische Aktivierung, keine Vermischung mit der
konvolutiven Raumkompensation (getrennte, kombinierbare Stufen).
