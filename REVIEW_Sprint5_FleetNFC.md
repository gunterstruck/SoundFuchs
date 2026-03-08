# TECHNISCHES REVIEW: Sprint 5 + Fleet NFC/QR Provisioning

**Reviewer:** Claude Opus 4.6
**Datum:** 2026-02-26
**Geprüfte Dokumente:**
- Dokument A: `PROMPT_Sprint5_FleetWorkflow.md` (5 Maßnahmen)
- Dokument B: `PROMPT_FleetNFC_Provisioning.md` (4 Maßnahmen)

**Methode:** Abgleich beider Prompt-Dokumente gegen den aktuellen Codestand (`types.ts`, `HashRouter.ts`, `router.ts`, `3-Diagnose.ts`, `1-Identify.ts`, alle i18n-Dateien, `index.html`)

---

## WICHTIGE VORBEMERKUNG

**Beide Prompts wurden bereits implementiert.** Der Codestand zeigt, dass Sprint 5 und Fleet NFC/QR Provisioning vollständig umgesetzt wurden. Das Review prüft daher sowohl die Prompt-Qualität als auch die tatsächliche Implementierung auf Konsistenz.

---

## 1. KRITISCHE FEHLER (MUSS vor nächstem Release gefixt werden)

### 1.1 ❌ Diagnose-Queue: Auto-Click auf `diagnose-btn` ist fragil (Prompt A, Maßnahme 4)

**Prompt-Spezifikation (router.ts, Zeile 978–981):**
```typescript
setTimeout(() => {
    const diagnoseBtn = document.getElementById('diagnose-btn');
    if (diagnoseBtn) diagnoseBtn.click();
}, 300);
```

**Problem:** Dieser `setTimeout`-basierte Auto-Click ist ein Race Condition:
- Die 300ms reichen möglicherweise nicht, damit die `DiagnosePhase.init()` den Event-Listener auf `diagnose-btn` registriert hat.
- Auf langsamen Geräten (alte Android-Phones in Werkhallen) kann die Phase-Initialisierung länger als 300ms dauern.
- Wenn `onMachineSelected()` → `initializePhases()` → `initializeLevel1Phases()` nicht abgeschlossen ist, bevor der Timeout feuert, passiert nichts – die Queue hängt.

**Empfehlung:** Statt `setTimeout` + blind click → `initializeLevel1Phases` sollte ein Promise zurückgeben und `advanceFleetQueue` sollte auf dessen Completion warten. Oder: Den `diagnoseBtn.click()` in einen `requestAnimationFrame`-Loop mit max 5 Retries wrappen.

**Schweregrad:** HOCH – Queue kann bei langsamen Geräten hängen bleiben, ohne Fehlermeldung.

### 1.2 ❌ Keine Escape-Taste-Behandlung im Fleet-Erstellungs-Modal (Prompt A, Maßnahme 3)

**Prompt-Spezifikation:** Das Modal kann per Overlay-Klick und ✕-Button geschlossen werden. Aber es fehlt:
- `Escape`-Taste Listener
- `aria-modal="true"` ist gesetzt, aber kein Focus-Trap (Tab-Navigation kann aus dem Modal heraus)

**Im Code (1-Identify.ts):** Bestätigt – kein `keydown`-Listener für Escape. WCAG-Anforderung für modale Dialoge nicht vollständig erfüllt.

**Empfehlung:** `document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); })` hinzufügen. Focus-Trap mit `firstFocusable`/`lastFocusable` einbauen.

**Schweregrad:** MITTEL – funktional, aber Accessibility-Mangel.

### 1.3 ❌ Rollback in `commitFleetImport` ist nicht atomic für Updates (Prompt B, Maßnahme 2)

**Prompt-Spezifikation & Code (HashRouter.ts, Zeile 842–880):**
Der Rollback löscht nur `createdIds` (neu erstellte Maschinen). Aber `toUpdate`-Maschinen (bestehende, deren `fleetGroup` gesetzt wurde) werden per `Object.assign` modifiziert und via `saveMachine` geschrieben – OHNE Rollback-Logik.

```typescript
// Rollback: Delete machines we just created
for (const id of createdIds) {
    await deleteMachine(id);
}
// ← Updates werden NICHT rückgängig gemacht!
```

**Szenario:** 3 von 8 Maschinen werden erstellt, 2 bestehende werden geupdated, dann crasht es bei Maschine 6 → die 3 neuen werden gelöscht, aber die 2 aktualisierten Maschinen haben jetzt ein `fleetGroup` gesetzt, das zu einer halben Flotte gehört.

**Empfehlung:** Vor dem Commit die Original-Werte der zu updatenden Maschinen sichern (`const originals = plan.toUpdate.map(...)`) und im catch-Block wiederherstellen.

**Schweregrad:** MITTEL-HOCH – in der Praxis selten (IndexedDB-Writes scheitern fast nie), aber semantisch falsch für den Anspruch "Atomic Import".

---

## 2. LÜCKEN (SOLLTE ergänzt werden)

### 2.1 ⚠️ Maschine löschen → keine Bereinigung von `fleetReferenceSourceId`

**Nicht spezifiziert in beiden Prompts. Nicht im Code.**

**Szenario:** Techniker löscht die Gold-Standard-Maschine (z.B. "Pumpe 1"). Alle anderen Flotten-Maschinen haben noch `fleetReferenceSourceId = "pumpe-1-id"`. Bei der nächsten Diagnose greift der Fallback (Zeile 245–247 in 3-Diagnose.ts): `logger.warn(...)` und eigene Referenz wird genutzt. Das ist **funktional OK**, aber:
- Der 🏆-Badge verschwindet nicht (Ranking zeigt Badge für eine gelöschte Maschine)
- Der User erhält keine Warnung, dass sein Gold-Standard weg ist
- `currentGoldStandardId` zeigt auf eine ID, die nicht mehr existiert

**Empfehlung:** In der `deleteMachine`-Logik (oder im IdentifyPhase-Handler) nach dem Löschen prüfen: "Hat irgendeine Maschine `fleetReferenceSourceId === deletedId`?" → Warnung anzeigen.

### 2.2 ⚠️ Flotte mit 1 Maschine nach Löschung

**Szenario:** Flotte hat 2 Maschinen. User löscht eine. Die verbleibende Maschine hat noch `fleetGroup` gesetzt, aber das Ranking zeigt nur 1 Maschine → Median/MAD sind sinnlos.

**Nicht spezifiziert:** Weder Prompt A noch B behandeln diesen Edge-Case.

**Empfehlung:** In `renderFleetRanking()` prüfen: Wenn `ranked.length < 2` → speziellen Hinweis anzeigen ("Mindestens 2 Maschinen für Flottenvergleich nötig").

### 2.3 ⚠️ Diagnose-Queue: Mikrofon-Error bei Pumpe 12 von 24

**Prompt A, Maßnahme 4:** Kein Error-Handling spezifiziert für den Fall, dass eine Diagnose fehlschlägt.

**Im Code:** Der `onDiagnosisComplete`-Callback wird nur in `saveFinalDiagnosis()` (Zeile 1610) gefeuert. Wenn die Diagnose fehlschlägt (Mikrofon-Zugriff verweigert, Sample-Rate-Mismatch, etc.), wird der Callback NICHT gefeuert → die Queue bleibt bei der aktuellen Maschine hängen.

**Der User muss manuell abbrechen** (Cancel-Button im Progressbar). Aber es gibt keine Erklärung, warum es hängt.

**Empfehlung:** In `DiagnosePhase` einen `onDiagnosisError`-Callback einführen. Im Router bei Error: Maschine überspringen + Warnung → nächste Maschine.

### 2.4 ⚠️ Diagnose-Queue: App minimiert / geschlossen

**Nicht spezifiziert in Prompt A.**

Queue ist Session-State (nicht persistiert – das ist dokumentiert). Aber:
- App wird minimiert → Audio-Stream wird vom OS unterbrochen → Diagnose scheitert stumm
- PWA-Lifecycle: `visibilitychange` Event sollte die Queue pausieren, nicht blind weiterlaufen

**Empfehlung:** `document.addEventListener('visibilitychange', ...)` – bei `hidden`: Queue pausieren. Bei `visible`: Hinweis "Diagnose-Queue pausiert, fortsetzen?"

### 2.5 ⚠️ Loading-State bei Fleet-Import (50+ Maschinen)

**Prompt B, Maßnahme 2:** `handleFleetRoute()` ruft `onDownloadProgress` auf, aber:
- Der Progress springt von 30% (Download) direkt zu 70% (Import), ohne granulare Updates
- Bei 50 Maschinen kann `prepareFleetImport` + `commitFleetImport` mehrere Sekunden dauern (50× `getMachine` + 50× `saveMachine`)
- Kein Spinner oder Progress-Update während der Schleife

**Empfehlung:** Granulare Progress-Updates innerhalb der Schleife: `50 + (i / machines.length) * 20` für Prepare, `70 + (i / machines.length) * 30` für Commit.

### 2.6 ⚠️ Fehlende `fleet.create.noMachines` Keys in fr/es/zh

Die Keys `fleet.create.*`, `fleet.queue.*` und `fleet.goldStandard.*` sind in `fr.ts`, `es.ts`, `zh.ts` nur als englische Fallbacks vorhanden. Das ist im Prompt so spezifiziert ("fr/es/zh können englische Fallbacks verwenden"), aber die Keys `fleet.create.noMachines`, `fleet.export.*`, `fleet.provision.rollbackComplete` und einige NFC-Keys existieren tatsächlich auch in der englischen Form – also OK.

**Status:** Akzeptabel laut Prompt-Spezifikation, aber langfristig sollten echte Übersetzungen kommen.

---

## 3. INKONSISTENZEN ZWISCHEN A UND B

### 3.1 ✅ `fleetReferenceSourceId` – KONSISTENT

**Prompt A** definiert das Feld in `types.ts` (Maßnahme 5, Schritt 1). **Prompt B** nutzt es korrekt im Import (`prepareFleetImport`). Im Code ist es an beiden Stellen korrekt implementiert.

**Ergebnis:** Keine Inkonsistenz.

### 3.2 ✅ Gold-Standard-Logik – KONSISTENT

**Prompt A:** Modal → Gold-Standard-Dropdown → `createFleetFromSelection()` setzt `fleetReferenceSourceId`.
**Prompt B:** Export liest `fleetReferenceSourceId` → Import setzt es.

Die Logik zur Ermittlung des Gold-Standards (Most-Common-SourceId) ist in beiden Prompts identisch und auch im Code konsistent implementiert.

### 3.3 ✅ `fleetGroup`-Semantik – KONSISTENT

**Prompt A:** `setWorkflowMode('fleet')` filtert nach `fleetGroup`.
**Prompt B:** Import setzt `fleetGroup` auf `fleetData.fleet.name`.

Stimmt überein.

### 3.4 ✅ `activateFleetMode()` – KONSISTENT

**Prompt A** definiert `setWorkflowMode('fleet')`.
**Prompt B** definiert `activateFleetMode()` als öffentliche Wrapper-Methode die `setWorkflowMode('fleet')` aufruft.

Im Code ist beides korrekt implementiert (1-Identify.ts, Zeile 3099–3101).

### 3.5 ⚠️ MINOR: Slugify-Logik dupliziert

Die `slugifyFleetName()`-Logik existiert an drei Stellen:
1. `ReferenceDbService.exportFleet()` (inline)
2. `1-Identify.ts` NFC Writer (`slugifyFleetName()` Methode)
3. Prompt B spezifiziert es als separate Methode

Der Code ist identisch (Umlaute → ae/oe/ue, Sonderzeichen → Bindestrich, max 50 Zeichen), aber dreifach dupliziert. Kein Fehler, aber technische Schuld.

**Empfehlung:** In eine shared Utility auslagern (z.B. `src/utils/slug.ts`).

---

## 4. FELD-RISIKEN

### 4.1 🔴 QR-Code-URL-Länge

**Berechnung:**
```
https://gunterstruck.github.io/Kundenkennung_123/fleet-fernwaerme-pumpenreihe-ost-halle-3.json
= 94 Zeichen (Beispiel aus dem Review-Auftrag)
```

Typische URL-Länge: 60–120 Zeichen. QR-Code L-Correction: bis zu 4.296 alphanumerische Zeichen → **kein Problem**.

**Ergebnis:** QR-Code-URL-Länge ist KEIN Risiko.

### 4.2 🟡 NFC-Tag-Kapazität (NTAG213 = 137 Byte nutzbar)

**Berechnung:**
NFC NDEF URI Record Overhead: ~5 Byte (Record Header + URI Identifier Code)
URL mit `https://` Prefix: ~89 Byte (wenn URI Identifier Code 0x04 für `https://` genutzt wird, spart man 8 Byte → ~81 Byte Payload)

```
URL (94 chars) - "https://" (8 chars, encoded as 1 byte prefix) = 86 + 1 = 87 Byte
+ NDEF Header: ~7 Byte
= ~94 Byte
```

**94 Byte < 137 Byte → passt auf NTAG213.** Aber nur mit ~43 Byte Spielraum.

**Risiko:** Wenn Customer-IDs oder Fleet-Namen sehr lang sind (>50 Zeichen), KÖNNTE es knapp werden. Die Slug-Begrenzung auf 50 Zeichen (`.substring(0, 50)`) in der Export-Logik ist eine gute Absicherung.

**Empfehlung:** Im NFC Writer eine Warnung anzeigen, wenn die URL > 130 Byte ist: "URL zu lang für Standard-NFC-Tags."

### 4.3 🔴 Offline-Szenario: NFC-Scan ohne Internet

**Szenario:** Basisnutzer scannt Fleet-NFC-Tag in der Werkhalle (kein WLAN, kein Mobilfunk).

**Was passiert:** `handleFleetRoute()` → `fetch(fleetDbUrl)` → Network Error → `catch` → `notify.error(t('fleet.provision.error'))` → "Flotte konnte nicht geladen werden."

**Problem:**
- Die Fehlermeldung ist generisch – der User versteht nicht, dass er Internet braucht
- Es gibt keinen Retry-Button oder Hinweis "Bitte Internet-Verbindung herstellen"
- Die Hash-Route (`#/f/...`) bleibt in der URL stehen → beim nächsten App-Start mit Internet wird der Import automatisch getriggert (gut!), aber der User weiß das nicht

**Empfehlung im Prompt:** Spezifischere Offline-Fehlermeldung: "Flotte konnte nicht geladen werden. Bitte stellen Sie eine Internetverbindung her und versuchen Sie es erneut." + Retry-Button.

### 4.4 🟡 Re-Scan: Fleet-NFC-Tag ein zweites Mal scannen

**Decision Table greift korrekt:** Alle Maschinen existieren bereits mit gleicher `fleetGroup` → alle werden übersprungen → "Flotte ist bereits vorhanden (8 Maschinen übersprungen)."

**UX-Problem:** Der Basisnutzer versteht möglicherweise nicht, warum "übersprungen" → er erwartet, dass etwas passiert. Die Meldung könnte positiver formuliert werden: "Flotte ist einsatzbereit – alle 8 Maschinen bereits vorhanden."

**Schweregrad:** Gering, aber UX-relevant.

### 4.5 🟡 Große Flotten: 50+ Maschinen

**Prompt A, Maßnahme 3:** Das Fleet-Erstellungs-Modal zeigt ALLE Maschinen als Checkbox-Liste. Bei 50+ Maschinen:
- Scrollbare Liste (`max-height: 40vh`) ist korrekt spezifiziert
- Aber: Kein Suchfeld / Filter für die Maschinenliste
- Bei 200 Maschinen wird die Liste unhandhabbar

**Empfehlung:** Ab 20+ Maschinen ein Suchfeld über der Liste einblenden. Nicht im ersten Sprint nötig, aber als Abgrenzung dokumentieren.

---

## 5. PROMPT-QUALITÄT

### 5.1 ✅ EXZELLENT: Prompt B, Maßnahme 2 (Hash-Route + Import)

- Decision Table ist unmissverständig
- Atomic Import mit Zweiphasen-Strategie ist klar beschrieben
- Validierungsregeln sind als Hard/Soft Reject klassifiziert
- Jeder Edge-Case hat ein definiertes Verhalten

**Dies ist die beste Spezifikation in beiden Dokumenten.**

### 5.2 ✅ GUT: Prompt A, Maßnahme 5 (Shared Fleet Reference)

- Klare Abgrenzung: "Nur die Quelle der Referenzmodelle ändert sich"
- `latestMachine = { ...latestMachine, referenceModels: ... }` – Spread-Operator-Muster explizit erklärt
- Reihenfolge im Code ("MUSS VOR den folgenden Zeilen stehen") ist hilfreich

### 5.3 🟡 VERBESSERUNGSWÜRDIG: Prompt A, Maßnahme 4 (Diagnose-Queue)

**Zu vage:**
- "Auto-start diagnosis after short delay (let UI settle)" – was ist "short"? 300ms ist willkürlich
- "Show result, then advance" – 1500ms Delay ist willkürlich und nicht konfigurierbar
- Kein Error-Handling spezifiziert (was wenn Diagnose fehlschlägt?)
- Keine Spezifikation für App-Minimierung/Hintergrund

**Zu rigide:**
- `diagnoseBtn.click()` als Mechanismus erzwingt DOM-Coupling. Ein direkter Methodenaufruf (`this.diagnosePhase.startDiagnosis()`) wäre robuster, aber der Prompt schließt das implizit aus.

### 5.4 🟡 VERBESSERUNGSWÜRDIG: Prompt A, Maßnahme 3 (Fleet-Erstellungs-Modal)

**Zu detailliert im DOM-Code, zu vage in der Logik:**
- 100+ Zeilen DOM-Manipulation werden im Prompt vorgegeben – eine KI-Implementierung könnte das 1:1 übernehmen, aber Fehler im Pseudocode werden direkt in Produktionscode
- Der `updateState()`-Handler prüft `machine.referenceModels && machine.referenceModels.length > 0` für die Gold-Standard-Dropdown-Filterung – aber was wenn ein User die Referenz NACH dem Erstellen der Flotte löscht?
- Keine Validierung des Gruppennamens (nur `trim().length > 0`): Sonderzeichen, nur Leerzeichen, Unicode-Sonderzeichen?

### 5.5 ✅ GUT: Prompt B, Maßnahmen 3+4 (NFC/QR Fleet-Option)

- "Analog zu Maßnahme 3, aber für QR Generator" – korrekte Referenzierung
- Radio-Option-Pattern folgt dem bestehenden Code
- Fleet-Dropdown-Population ist klar spezifiziert

### 5.6 ⚠️ LÜCKE: Kein `createdAt`-Feld im Fleet-Export-Maschinenformat

**Prompt B, FleetDbFile.machines[]:** Enthält `id`, `name`, `isGoldStandard`, `location`, `notes` – aber kein `createdAt`.

**Im Code (HashRouter.ts, Zeile 784):** `createdAt: Date.now()` wird beim Import gesetzt.

**Konsequenz:** Alle importierten Maschinen haben den Import-Zeitpunkt als `createdAt`, nicht den originalen Erstellungszeitpunkt. Für Sortierung nach Erstellungsdatum irrelevant (Techniker sortiert nicht danach), aber historisch ungenau.

**Empfehlung:** Optional `createdAt` in das Export-Format aufnehmen.

---

## 6. GESAMTBEWERTUNG

| Kriterium | Score | Begründung |
|---|---|---|
| **Vollständigkeit** | **8/10** | Kernfunktionalität vollständig spezifiziert. Fehlende Edge-Cases: Machine-Deletion-Cleanup, Queue-Error-Handling, Offline-UX, Escape-Taste im Modal. |
| **Konsistenz** | **9/10** | A und B sind bemerkenswert konsistent. `fleetReferenceSourceId`, Gold-Standard-Logik, `fleetGroup`-Semantik stimmen überein. Einzige Schwäche: Slugify-Duplikation. |
| **Implementierbarkeit** | **8/10** | Prompt B Maßnahme 2 ist exzellent spezifiziert. Prompt A Maßnahme 4 hat Lücken (Auto-Click Race Condition, fehlende Error-States). Generell: Zu viel inline-Code in den Prompts – eine KI kann Implementierungsdetails selbst ableiten, wenn die Logik klar ist. |
| **Feld-Tauglichkeit** | **7/10** | QR/NFC-Größe ist OK. Offline-Szenario schlecht abgefangen. Queue-Robustheit (langsame Geräte, Mikrofon-Errors, App-Hintergrund) unzureichend spezifiziert. Große Flotten (50+) brauchen Suchfeld im Modal. |

### Gesamtscore: **8/10**

**Stärken:**
- Sehr klare Architekturentscheidungen (Session-State Queue, Spread-Operator für lokale Modifikation, Atomic Import)
- Exzellente Decision Table für Fleet-Import
- Konsistente Terminologie und Namespace-Konvention
- Bestehende Flows werden nicht angefasst (defensiv, richtig)

**Schwächen:**
- Diagnose-Queue ist die architektonisch sensibelste Maßnahme, hat aber die schwächste Spezifikation
- Zu viel inline-DOM-Code in den Prompts (Risiko: Pseudocode-Fehler → Produktionsfehler)
- Offline/Error/Edge-Cases im Feld-Einsatz unterbelichtet

**Empfehlung für die nächste Iteration:**
1. Diagnose-Queue-Robustheit verbessern (Error-Recovery, Visibility-API)
2. Gold-Standard-Löschung behandeln (Cleanup oder Warnung)
3. Offline-UX für Fleet-Import spezifizieren
4. Slugify-Funktion zentralisieren
