# Tier 0 — Engine-Pivot: von diagonaler Mahalanobis zu Spektral-Cosine (One-Class)

**Fokus-Bericht zur Dokumentation für die prüfende KI**

| | |
|---|---|
| **Thema** | Warum die diagonale Mahalanobis-Engine im Feld 0 % lieferte, und warum die neue Spektral-Cosine-Engine funktionieren soll |
| **Stand** | Umgesetzt, getestet, auf `main` (Merge `b40ac4e`) |
| **Betroffen** | Nur die zuschaltbare Tier-0-Alternativ-Engine. **GMIA bleibt unverändert und Standard.** |
| **Begleitdokument** | `docs/TIER0_UMSETZUNGSBERICHT.md` (vollständiger Tier-0-Bericht; dieser Text vertieft §11.9–§11.10) |

---

## 0. Kurzfassung

Die ursprüngliche Tier-0-Alternative (diagonale Mahalanobis-Distanz auf den 512-Bin-ESD-Features) lieferte am echten Gerät **0 % „AUFFÄLLIG"**, obwohl das aufgenommene Signal **akustisch nahezu identisch** zur Referenz war (Spektrum-Overlay deckend, Betriebspunkt grün). Ursache ist **kein Programmierfehler**, sondern eine **prinzipielle Fehlanpassung** des Verfahrens an die Daten: Die Mahalanobis-Distanz gewichtet mit `1/Varianz` und betont damit die **energiearmen Rausch-Bins** am stärksten — genau die unzuverlässigsten. Eine minimale Änderung des Raumschalls genügt, damit die Distanz explodiert.

Die Engine wurde deshalb auf eine **energie-gewichtete, scale-freie Cosine-One-Class-Methode** umgestellt — denselben Wirkmechanismus, der GMIA robust macht. In Tests scort ein passendes Signal jetzt **> 75 % / healthy** statt 0; ein klar abweichendes Spektrum scort deutlich niedriger. Das ist der aktuelle Stand von Tier 0.

---

## 1. Kontext (was Tier 0 ist)

Tier 0 ist die **zuschaltbare zweite Auswertung** neben GMIA — bewusst „trivial" gehalten, um das Engine-Gerüst, die DB-Migration und den Settings-Umschalter abzusichern (Briefing §7/§14). Sie nutzt **dieselben 512-Bin-Energie-Spektraldichte-Features (ESD, Σ = 1)** wie GMIA — kein neues Audio, kein Modell-Download. GMIA ist und bleibt der Standard.

---

## 2. Symptom (zwei Gerätetests)

| | Test 1 | Test 2 (nach Fix-Versuch §11.9) |
|---|---|---|
| Score | 0 % / AUFFÄLLIG | 0 % / AUFFÄLLIG |
| Signal vs. Referenz | Spektrum deckend, Betriebspunkt grün (`Energie Δ +0.4 dB`, `Frequenz Δ −1 Hz`) | Messung/Referenz deckend (Prüfergebnis-Plot) |
| Debug-Werte | alle `--` (kein Modell ausgewählt) | **befüllt**: `cosine`-Proxy = 0.0246, `scalingConstant` (α) = 1.80, `RAW SCORE 0.0 %` |

Der entscheidende Messwert aus Test 2: Der angezeigte `cosine` war der interne Distanz-Proxy `1/(1+d)` = 0.0246 → **Mahalanobis-Distanz d ≈ 39,6**. Bei einem akustisch passenden Signal ist das absurd weit weg — die Engine, nicht die Maschine, lag falsch.

> Wichtige Zwischenerkenntnis: In Test 2 waren die Debug-Werte erstmals befüllt — d. h. der erste Fix-Versuch (Varianz-Shrinkage + „nächstes Modell immer wählen", §11.9) **war deployed und aktiv**. Das Symptom blieb trotzdem. Das schloss einen bloßen Tuning-/Deploy-Fehler aus und wies auf ein **strukturelles** Problem hin.

---

## 3. Warum es bisher nicht funktioniert hat (Begründung)

### 3.1 Die Mahalanobis-Distanz gewichtet die falschen Bins

Die diagonale Mahalanobis-Distanz ist

```
d² = Σ_k (f_k − μ_k)² / var_k
```

Jeder Frequenz-Bin geht **mit 1/var_k** ein. Auf relativen ESD-Features (Σ = 1) ist die Per-Bin-Varianz aber **extrem ungleich verteilt**:

- Wenige **Peak-Bins** (die eigentliche Maschinensignatur) tragen Energie und schwanken merklich → größere Varianz.
- Die **große Mehrheit** der 512 Bins ist **energiearmes Grundrauschen** mit **nahezu null Varianz**.

Wegen des `1/var_k`-Gewichts dominieren genau die **Rausch-Bins mit `var → 0`** die Distanz. Schon eine winzige, physikalisch unvermeidbare Änderung im Grundrauschen (anderer Raum, Mikrofonabstand, Lüfter, Betriebspunkt) erzeugt in diesen Bins eine Abweichung `Δ`, die durch eine fast-null Varianz geteilt wird → **riesiger Beitrag**. Summiert über hunderte solcher Bins **explodiert die Distanz** — obwohl die *informativen* Peak-Bins gut passen. Genau das zeigte d ≈ 39,6 bei deckendem Spektrum.

> Anschaulich: Mahalanobis vertraut den **leisesten** Teilen des Spektrums am meisten. Bei Maschinendiagnose ist das die schlechtest mögliche Wahl.

### 3.2 Die Kalibrierung skaliert auf einer zu kleinen Streuung

Die Referenz entsteht aus **stark überlappenden** Fenstern (Hop 66 ms auf 330-ms-Fenstern, ~5:1-Überlappung) **einer kurzen** Aufnahme. Benachbarte Fenster sind dadurch fast identisch → die **Trainings-Streuung ist künstlich winzig**. Die Distanz→Score-Kennlinie (τ/α) leitete ihre Skala aus genau dieser Streuung ab. Ein echtes Live-Frame weicht naturgemäß stärker von der Referenz ab als die überlappenden Trainingsfenster voneinander — und liegt damit sofort weit außerhalb der kalibrierten Skala → Score 0.

### 3.3 Warum der erste Fix-Versuch (§11.9) nicht reichte

Die Varianz-Shrinkage (`var_eff = (1−γ)·var + γ·meanVar`, γ = 0.5) milderte die Übergewichtung, behob aber **nicht** die beiden Kernpunkte: das Gewicht bleibt grundsätzlich varianz-invers (statt energie-orientiert), und die Skala bleibt an der zu kleinen Trainings-Streuung hängen. Das Symptom (d ≈ 40) blieb.

### 3.4 Warum GMIA dasselbe Problem **nicht** hat

GMIA vergleicht über **Cosine-Ähnlichkeit** `cos(w_p, f)`. Cosine ist eine **energie-gewichtete** Größe: Die lauten Peak-Bins dominieren das Skalarprodukt, die leisen Rausch-Bins tragen kaum bei. Zudem ist Cosine **skaleninvariant** (Pegel, Mikrofonabstand) und GMIA kalibriert auf dem **Cosine-Wert-Niveau** (`C = atanh(√0,9)/μ`), nicht auf einer Streuung. Deshalb ist GMIA auf genau dieser Maschine robust — und liefert sinnvolle Scores. Das ist der direkte Hinweis, was die Alternative tun muss.

Diese Diagnose deckt sich exakt mit Briefing **§17.2**: *„Die Mahalanobis-Distanz ist die parametrische Alternative; k-NN [Cosine] ist nicht-parametrisch und bei sehr wenig Daten oft robuster."* Die Felddaten haben das bestätigt.

---

## 4. Was jetzt implementiert wurde

Die Tier-0-Alternative ist jetzt eine **Spektral-Cosine-One-Class-Engine**:

### 4.1 Modell
Aus den N Trainings-Frames wird das **Referenz-Mittelspektrum μ** (relative ESD, 512-dim) gebildet — eine kompakte, interpretierbare Signatur. Dazu eine **tanh²-Skalierungskonstante C** (GMIA-Gleichung-4-Form):

```
C = atanh(√target) / μ_cos          mit target = 0,9
μ_cos = Mittel über die Trainings-Frames von cos(frame, μ)
```

Gespeichert wird also nur `mean` (512 Werte) + `scalingConstant` — winzig, exportfreundlich.

### 4.2 Diagnose
Pro Live-Frame:

```
cos   = cosine_similarity(f, μ)                  (energie-gewichtet, scale-frei)
score = 100 · tanh(C · cos)²                     (auf [0,100] geklemmt)
score = min(100, score / baselineScore · 100)    (gleiche Normalisierung wie GMIA → perfekter Treffer ~100 %)
```

Multiclass (bestes Modell gewinnt, sonst `uncertain`/UNKNOWN), Glättung, Anzeige und Speicherung laufen **unverändert** über die bestehende Kette.

### 4.3 Technische Randpunkte
- **`engineId` bleibt `'mahalanobis'`** (Speicher-/Registry-Stabilität, keine DB-Migration). Nutzer-Label heißt jetzt **„Spektral-Cosine (One-Class)"**.
- Modellfelder `diagVar`/`calibration` entfallen, neu `scalingConstant`.
- `rawCosineSimilarity` ist für diese Engine jetzt ein **echter Cosine** (kein Distanz-Proxy mehr) — die Expert-Debug-Anzeige zeigt damit einen interpretierbaren Wert.
- **GMIA-Pfad, λ = 1e9, UI, DB 7→8 — unangetastet.**

---

## 5. Warum das jetzt funktionieren soll (Begründung)

1. **Richtiges Gewicht.** Cosine wird von den **energiereichen Peak-Bins** getragen — genau den Bins, die die Maschinensignatur ausmachen. Die unzuverlässigen Rausch-Bins tragen kaum bei und können die Bewertung nicht mehr kippen. Das behebt Ursache 3.1 direkt.
2. **Scale-frei.** Cosine ist invariant gegen Pegel/Lautstärke (Mikrofonabstand, Verstärkung). Pegelunterschiede zwischen Anlernen und Diagnose erzeugen keine Strafe mehr. Das behebt Ursache 3.2 mit, weil die Kennlinie auf dem **Cosine-Wert** kalibriert (wie GMIA), nicht auf einer winzigen Streuung.
3. **Bewährt auf genau dieser Maschine.** GMIA nutzt denselben Wirkmechanismus (Cosine + tanh²-Kennlinie) und liefert dort sinnvolle Ergebnisse. Die neue Engine ist verhaltensähnlich (Cosine zur Mittelwert-Signatur statt zum regularisierten GMIA-Gewichtsvektor) und erbt damit dessen Robustheit.
4. **Testnachweis.** Ein neuer, realitätsnaher Test bildet exakt den Feldfall nach (wenige Peaks + viele Rausch-Bins, akustisch passendes Live-Frame):

| Testfall | diagonale Mahalanobis (vorher) | Spektral-Cosine (jetzt) |
|---|---|---|
| Passendes Live-Frame | **0 %** | **> 75 %, `healthy`**, echter Cosine > 0,9 |
| Veränderter Rauschboden (3× höher), Peaks gleich | kollabiert | bleibt > 60 % |
| Peaks verschoben (andere Signatur) | — | deutlich niedriger (Abstand > 20 Punkte) |
| Referenz-Selbstscore (Quality-Gate) | self-fit ~95 % | ≥ 75 % (passt Gate) |

**221 Tests grün, tsc/eslint/Build sauber, GMIA-Regression unverändert grün.**

> Ehrlichkeitshinweis: Diese Tests validieren die **Mechanik und das Robustheitsverhalten** an synthetischen, aber realitätsnah strukturierten Daten. Den **endgültigen** Beweis liefert der erneute Gerätetest (siehe §6) und später die AUC/pAUC-Messung auf echten Maschinendaten.

---

## 6. Was zu tun ist / Grenzen

- **⚠️ Erneut anlernen:** Das Modell-Format hat sich geändert (jetzt μ + `scalingConstant`). Die bestehende „Spektral-Cosine"-Referenz **löschen und neu aufnehmen**, dann diagnostizieren. GMIA-Referenzen sind nicht betroffen.
- **Erwartung:** Passender Schall → hoher Score (~90–100, wie bei GMIA). Falls nicht: Der Debug zeigt jetzt einen **echten** Cosine — daran ist sofort ablesbar, ob es an der Kalibrierung (`C`) liegt.
- **Nächste Ausbaustufe (vorgemerkt):** Eine **k-NN-Variante** über die Sub-Fenster der einen Aufnahme (Briefing §17.2) trägt **multimodale** Wolken (z. B. eine bewegte Aufnahme mit mehreren Positionen) besser als eine einzelne Mittelwert-Signatur. Erst messen, dann entscheiden.
- **Offene Messung:** AUC/pAUC auf echten Fällen (bzw. MIMII DG / ToyADMOS2) — der eigentliche Hebel, um Tier-0-Güte zu beziffern und über Tier 1 (YAMNet) zu entscheiden.

---

## 7. Stand Tier 0

- **GMIA** unverändert und Standard; gesamte nachgelagerte Kette unberührt.
- **Tier-0-Alternative** = **Spektral-Cosine-One-Class** (energie-gewichtet, scale-frei), value-kalibriert wie GMIA, über den Settings-Umschalter wählbar.
- Engine-Gerüst, DB 7→8, Multiclass, Serialisierung, Tests — alles steht und ist grün.
- Der diagonale-Mahalanobis-Ansatz wurde aufgrund des Feldbefunds **datengetrieben verworfen** (Begründung §3) — exakt der „Messen statt Bauen"-Mechanismus, den Tier 0 absichern sollte.

**Damit ist der aktuelle Stand von Tier 0 dokumentiert.** Der nächste Schritt ist der erneute Gerätetest und anschließend die echte Messung.
