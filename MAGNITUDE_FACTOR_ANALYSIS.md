# 🔬 Magnitude Factor Analysis - GMIA Extension

## Executive Summary

Der **Magnitude Factor** ist eine **nicht-dokumentierte Erweiterung** des ursprünglichen GMIA-Algorithmus. Diese Erweiterung wurde in `src/core/ml/scoring.ts` implementiert, um **False Positives bei niedrig-energetischen Signalen** zu verhindern.

**Status**: ⚠️ Mathematisch sinnvoll, aber ungetestet und undokumentiert

---

## 1. Mathematischer Hintergrund

### Original GMIA Algorithmus

Der GMIA-Algorithmus berechnet die Ähnlichkeit zwischen Test-Features und Referenz-Modell über die **Cosinus-Ähnlichkeit**:

```
cos(α) = (w · f) / (||w|| · ||f||)
```

Dabei:
- `w` = Gewichtsvektor (trainiertes Modell)
- `f` = Feature-Vektor (Test-Signal)
- `||w||` = L2-Norm (Magnitude) von w
- `||f||` = L2-Norm (Magnitude) von f

**Problem**: Die Cosinus-Ähnlichkeit ist **normiert** - sie ignoriert die absolute Größe (Magnitude) der Vektoren!

### Was bedeutet das praktisch?

```
Beispiel 1: Lautes Signal
  w = [100, 200, 300]  (||w|| = 374)
  f = [105, 195, 305]  (||f|| = 380)
  → cos(α) ≈ 0.999  (sehr ähnlich!)

Beispiel 2: Leises Signal (identisches Muster, aber 100x leiser)
  w = [100, 200, 300]  (||w|| = 374)
  f = [1.05, 1.95, 3.05]  (||f|| = 3.8)
  → cos(α) ≈ 0.999  (immer noch 0.999!)
```

**Kritisches Problem**: Ein **extrem leises** Signal (z.B. fast Stille) mit **zufälligem Rauschen** kann eine hohe Cosinus-Ähnlichkeit haben, obwohl es physikalisch **kein Maschinensignal** ist!

---

## 2. Die Magnitude Factor Lösung

### Implementierung

**Datei**: `src/core/ml/scoring.ts:566-575`

```typescript
function calculateMagnitudeFactor(
  weightVector: Float64Array,
  featureVector: Float64Array
): number {
  const featureMagnitude = vectorMagnitude(featureVector);
  const weightMagnitude = vectorMagnitude(weightVector);

  if (!isFinite(featureMagnitude) || !isFinite(weightMagnitude) || weightMagnitude === 0) {
    return 0;
  }

  return Math.min(1, featureMagnitude / weightMagnitude);
}
```

**Verwendung** (Zeile 509-510):

```typescript
const magnitudeFactor = calculateMagnitudeFactor(model.weightVector, featureVector.features);
const adjustedCosine = cosine * magnitudeFactor;
```

### Mathematische Formel

```
adjustedCosine = cos(α) · min(1, ||f|| / ||w||)
```

**Effekt**:
- Wenn `||f|| ≥ ||w||`: Factor = 1 → Keine Änderung
- Wenn `||f|| < ||w||`: Factor < 1 → **Penalty** proportional zur Energiedifferenz
- Wenn `||f|| << ||w||`: Factor → 0 → Score geht gegen 0

### Beispiel-Rechnung

```
Modell-Magnitude:  ||w|| = 100
Test-Magnitude:    ||f|| = 10
Cosinus:           cos(α) = 0.95

Original GMIA:
  → Score = 100 · tanh²(C · 0.95) ≈ 85%  (FALSE POSITIVE!)

Mit Magnitude Factor:
  → magnitudeFactor = min(1, 10/100) = 0.1
  → adjustedCosine = 0.95 · 0.1 = 0.095
  → Score = 100 · tanh²(C · 0.095) ≈ 8%  (KORREKT: zu leise!)
```

---

## 3. Physikalische Begründung

### Warum ist das sinnvoll?

**Szenario 1: Maschine ist aus**
- Mikrofon nimmt nur Hintergrundrauschen auf
- Niedriger RMS-Pegel (~0.001)
- FFT zeigt nur Rauschen
- **Ohne Magnitude Factor**: Könnte zufällig hohe Cosinus-Ähnlichkeit haben
- **Mit Magnitude Factor**: Score wird auf nahe 0% gedrückt ✅

**Szenario 2: Mikrofon zu weit entfernt**
- Signal ist physikalisch da, aber zu leise (Dämpfung durch Distanz)
- Magnitude viel kleiner als Trainings-Magnitude
- **Interpretation**: "Signal ist da, aber Bedingungen stimmen nicht überein mit Training"
- **Ergebnis**: Niedriger Score → Nutzer wird gewarnt ✅

**Szenario 3: Normale Diagnose**
- Mikrofon am gleichen Ort wie beim Training
- Ähnliche Lautstärke
- `||f|| ≈ ||w||` → Factor ≈ 1
- **Keine Beeinflussung des Original-Scores** ✅

---

## 4. Kritische Analyse

### ✅ Vorteile

1. **Verhindert False Positives** bei Stille/Rauschen
2. **Physikalisch sinnvoll**: Energie ist ein Indikator für Signal-Qualität
3. **Sanfte Degradation**: Proportionale Penalty, kein harter Cut-off
4. **Rückwärtskompatibel**: Wenn `||f|| = ||w||`, ändert sich nichts

### ⚠️ Potenzielle Probleme

#### Problem 1: **Undokumentiert**
- Nicht im ursprünglichen GMIA-Algorithmus erwähnt
- Keine wissenschaftliche Referenz
- Schwer für andere Entwickler nachvollziehbar

#### Problem 2: **Ungetestet**
- **Keine Unit-Tests** für `calculateMagnitudeFactor`
- Keine Tests für Low-Energy-Szenarien
- Keine Validierung der Schwellwerte

#### Problem 3: **Asymmetrisches Verhalten**
```
Fall A: ||f|| = 0.5 · ||w||  →  Factor = 0.5  (50% Penalty)
Fall B: ||f|| = 2.0 · ||w||  →  Factor = 1.0  (keine Penalty!)
```

**Frage**: Warum wird ein **lauteres** Signal nicht bestraft?

**Möglicher Grund**:
- Lauteres Signal könnte durch Mikrofon-Nähe entstehen
- Mehr Energie = mehr Signal-to-Noise-Ratio = besser?
- Aber: Könnte auch Clipping/Verzerrung sein!

#### Problem 4: **Multiclass-Spezifisch**
Die Magnitude-Korrektur wird **nur** in `classifyDiagnosticState()` verwendet, **nicht** im Standard-Scoring (`generateDiagnosisResult`).

**Wo verwendet**:
- ✅ Multiclass-Diagnose (Phase 3, mehrere Modelle)
- ❌ Nicht in Standard-Diagnose (ein Modell)

**Konsequenz**: Inkonsistentes Verhalten zwischen Single-Model und Multi-Model Modi!

---

## 5. Tests die fehlen

### Unit Tests für `calculateMagnitudeFactor`

```typescript
describe('calculateMagnitudeFactor()', () => {
  it('should return 1.0 when magnitudes are equal', () => {
    const w = new Float64Array([1, 2, 3]);
    const f = new Float64Array([1, 2, 3]);
    expect(calculateMagnitudeFactor(w, f)).toBeCloseTo(1.0, 2);
  });

  it('should return < 1.0 when feature magnitude is smaller', () => {
    const w = new Float64Array([10, 20, 30]);  // ||w|| ≈ 37.4
    const f = new Float64Array([1, 2, 3]);      // ||f|| ≈ 3.74
    const factor = calculateMagnitudeFactor(w, f);
    expect(factor).toBeCloseTo(0.1, 2);
  });

  it('should return 1.0 (clamped) when feature magnitude is larger', () => {
    const w = new Float64Array([1, 2, 3]);
    const f = new Float64Array([10, 20, 30]);
    expect(calculateMagnitudeFactor(w, f)).toBe(1.0);
  });

  it('should return 0 for zero feature vector', () => {
    const w = new Float64Array([1, 2, 3]);
    const f = new Float64Array([0, 0, 0]);
    expect(calculateMagnitudeFactor(w, f)).toBe(0);
  });

  it('should return 0 for zero weight vector (edge case)', () => {
    const w = new Float64Array([0, 0, 0]);
    const f = new Float64Array([1, 2, 3]);
    expect(calculateMagnitudeFactor(w, f)).toBe(0);
  });
});
```

### Integration Tests

```typescript
it('should reject silent background noise (low magnitude)', () => {
  const models = [baselineModel];

  // Simulate background noise: random pattern, very low energy
  const noisyFeature: FeatureVector = {
    features: new Float64Array(Array(512).fill(0).map(() => Math.random() * 0.001)),
    absoluteFeatures: new Float64Array(512),
    bins: 512,
    frequencyRange: [0, 22050],
  };

  const result = classifyDiagnosticState(models, noisyFeature, 44100);

  // Should have very low score due to low magnitude
  expect(result.healthScore).toBeLessThan(10);
});

it('should accept loud signal with similar pattern', () => {
  const models = [baselineModel];

  // Similar pattern to baseline, high energy
  const loudFeature: FeatureVector = {
    features: baselineModel.weightVector.map(v => v * 1.5), // 50% louder
    absoluteFeatures: new Float64Array(3),
    bins: 3,
    frequencyRange: [0, 22050],
  };

  const result = classifyDiagnosticState(models, loudFeature, 44100);

  // Should NOT be penalized (magnitude factor clamped to 1.0)
  expect(result.healthScore).toBeGreaterThan(80);
});
```

---

## 6. Vergleich mit Original GMIA

| Aspekt | Original GMIA | Ihre Implementierung |
|--------|---------------|---------------------|
| Cosinus-Ähnlichkeit | ✅ Ja | ✅ Ja |
| Tanh-Skalierung | ✅ Ja | ✅ Ja |
| Regularisierung λ=10⁹ | ✅ Ja | ✅ Ja |
| **Magnitude-Korrektur** | ❌ **Nein** | ✅ **Ja (Erweiterung)** |

**Bewertung**: Die Magnitude-Korrektur ist eine **pragmatische Erweiterung**, die ein reales Problem löst (False Positives bei Stille). Sie ist **nicht** Teil des ursprünglichen GMIA-Algorithmus.

---

## 7. Empfehlungen

### Kurzfristig (Kritisch)

1. **Tests schreiben** für `calculateMagnitudeFactor` (siehe oben)
2. **Code kommentieren**: Erklären, warum diese Erweiterung nötig ist
3. **Konsistenz prüfen**: Warum nicht auch im Single-Model-Modus?

### Mittelfristig (Optional)

4. **Schwellwert-Parameter**: Statt hartem `min(1, ...)` einen konfigurierbaren Threshold
   ```typescript
   const magnitudeRatio = featureMagnitude / weightMagnitude;
   const factor = magnitudeRatio > THRESHOLD_UPPER ? 1.0 :
                  magnitudeRatio < THRESHOLD_LOWER ? 0.0 :
                  magnitudeRatio; // Linear zwischen Thresholds
   ```

5. **Symmetrisches Verhalten**: Auch laute Signale bestrafen?
   ```typescript
   return Math.min(1, 1 / Math.abs(Math.log(magnitudeRatio) + 1));
   ```

6. **Wissenschaftliche Validierung**: Eventuell mit realen Datensätzen testen

### Langfristig (Nice-to-have)

7. **Separate Energie-Prüfung**: Statt Magnitude-Korrektur im Score-Calculation, könnte man auch einen **separaten Quality-Check** machen:
   ```typescript
   if (signalEnergy < MIN_SIGNAL_ENERGY) {
     return { status: 'uncertain', reason: 'Signal zu leise' };
   }
   ```

---

## 8. Fazit

### Ist der Magnitude Factor gut oder schlecht?

**Antwort**: **Gut, aber mit Verbesserungspotenzial**

**Pro**:
- Löst ein echtes Problem (False Positives bei Stille)
- Mathematisch nachvollziehbar
- Praxisnah

**Contra**:
- Undokumentiert (nicht im ursprünglichen GMIA-Algorithmus)
- Keine Tests
- Inkonsistent verwendet (nur Multiclass)
- Asymmetrisches Verhalten (nur Penalty für leise Signale)

### Sollte man es behalten?

**JA**, aber mit Verbesserungen:
1. Tests hinzufügen ✅ Kritisch
2. Code dokumentieren ✅ Kritisch
3. In Single-Model-Modus ebenfalls verwenden ⚠️ Optional
4. Symmetrie überdenken 💡 Nice-to-have

---

## 9. Nächste Schritte

- [ ] Unit-Tests schreiben (`calculateMagnitudeFactor.test.ts`)
- [ ] Inline-Kommentar in `scoring.ts` ergänzen
- [ ] Entscheidung: Auch in `generateDiagnosisResult()` verwenden?
- [ ] Issue erstellen: "Magnitude Factor wissenschaftlich validieren"

---

**Autor**: Code-Analyse
**Datum**: 2026-01-18
**Version**: 1.0
**Referenz**: Zanobot GMIA Implementation (v2.0)
