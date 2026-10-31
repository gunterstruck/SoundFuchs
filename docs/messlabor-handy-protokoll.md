# Mess-Labor: Handy-Protokoll (eine Referenz, viele Prüfungen, AUC)

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

1. **Referenzen ziehen:** N Normal-Clips (Standard 20), reproduzierbar per Seed
   (`mulberry32` / `shuffledIndices`). Gezogen wird immer aus **allen**
   Normal-Clips.
2. **Anlernen wie am Handy:** In jedem Durchlauf wird genau dieser eine Clip
   angelernt: `trainPipeline` (Cherry-Picking, Raumkompensation laut
   Einstellungen) → `trainFingerprint`. Für Bias-Match und Drift kommt die
   Referenz-Statistik dazu, wie in der Handy-Simulation.
3. **Prüfen wie am Handy:** Alle übrigen Normal-Clips (ohne die Referenz) und
   alle Abnormal-Clips desselben Bereichs. Jede Prüfung bekommt eine frische
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

- Bereiche mit weniger als 2 Normal-Clips werden übersprungen und im Bericht
  genannt.
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
   - **Max. Testclips/Klasse:** 0 bedeutet alle. Die Kappung kürzt nur den
     Test, nie die Referenz-Ziehung.
   - **Aggregation** wählen.
6. **▶ Messen** starten. Abbrechen ist jederzeit möglich.
7. Die Ergebnisse exportieren:
   - **CSV:** eine Zeile je Bereich × Engine × Durchlauf mit Referenzdatei,
     danach die Zusammenfassung.
   - **JSON:** alle Werte maschinenlesbar.
   - **Detail (CSV):** eine Zeile je geprüftem Clip mit Bereich, Engine,
     Referenzdatei, Testdatei, Label, Rohwert, angezeigtem Score und Urteil.
     Damit lassen sich einzelne Paarungen nachprüfen.

**Laufzeit:** Das Einlesen kostet je 10-s-Clip spürbar Zeit. Jeder Clip wird
dekodiert, auf 48 kHz umgerechnet und in Frames zerlegt, und jede Prüfung
läuft für jede gewählte Engine und jede Referenz, in der der Clip im Test
steht. `pump/id_00` hat rund 1000 Normal- und 140 Abnormal-Clips. Mit
20 Durchläufen und allen Clips sind das über 20 000 Prüfungen je Engine.

**Für den ersten Lauf daher:**

- „Max. Testclips/Klasse“ = **100**: so werden je Durchlauf 100 Normal- und
  100 Abnormal-Clips geprüft. Die Referenzen werden trotzdem aus allen
  Normal-Clips gezogen.
- **YAMNet aus.** YAMNet ist die mit Abstand langsamste Engine, weil sie jedes
  ≈1-s-Fenster durch ein neuronales Netz schickt. Sie lädt außerdem beim ersten
  Mal ihr Modell.
- Erst wenn das Ergebnis plausibel aussieht, mit allen Clips oder mit YAMNet
  nachmessen.

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
