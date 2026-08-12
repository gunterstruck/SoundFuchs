# Geteilte Referenzen

*Wie aus einer Einzelmessung etwas Gemeinsames wird — und was das kostet.*

---

## Worum es geht

Zanobo vergleicht ein Betriebsgeräusch mit einer Referenz. Solange jeder seine
eigene Referenz aufnimmt, ist die App ein Messgerät für eine Person: sie sagt,
ob **dieses** Auto heute anders klingt als letzten Monat. Das ist nützlich und
vollständig autark — und es endet an der Grenze des eigenen Geräts.

Es gibt in Zanobo schon einen Mechanismus, der über diese Grenze hinausreicht.
Er heißt im Code `customerId`, hieß in der Oberfläche „Kundenkennung" und ist in
Wahrheit etwas anderes: **der Name einer Sammlung von Referenzen, die im Netz
liegt.** Wer den Namen kennt, lädt die Referenzen. Das ist kein Kundenkonto und
keine Lizenz, das ist ein geteiltes Verzeichnis.

Dieses Dokument beschreibt den Mechanismus so, wie er heute wirklich ist —
einschließlich der Stellen, an denen er unfertig ist.

---

## Der Mechanismus in drei Zeilen

1. Ein Deep Link (QR-Code oder NFC-Tag) trägt neben der Maschinen-ID einen
   Parameter `c`: `#/m/<maschinen-id>?c=<sammlung>`
2. Daraus baut die App eine URL:
   `https://gunterstruck.github.io/<sammlung>/db-latest.json`
   (`HashRouter.buildDbUrlFromCustomerId`, `GITHUB_PAGES_BASE_URL` in
   `src/ui/HashRouter.ts`)
3. Diese Datei wird geladen, geprüft und ihre Modelle werden der Maschine
   zugeordnet (`ReferenceDbService.downloadAndApply`).

Zwei Sonderfälle, die im Code stehen:

- **Flotten:** `?c=<sammlung>&fleet=<name>` lädt
  `https://gunterstruck.github.io/<sammlung>/fleet-<fleet-id>.json`.
- **Direkte URL:** Wer in das Feld statt eines Namens ein vollständiges
  `https://…` einträgt, bekommt genau diese URL. GitHub-`/blob/`-Links werden
  automatisch auf `raw.githubusercontent.com` umgeschrieben. Die Sammlung muss
  also nicht auf GitHub Pages liegen.

Der Name landet unverändert (URL-kodiert) in der URL. Er ist damit öffentlich
sichtbar — auf dem Tag, im QR-Code, in der Ladeanzeige. Wer eine Sammlung
veröffentlicht, veröffentlicht auch ihren Namen.

---

## Das Dateiformat

Der Typ heißt `ReferenceDbFile` (`src/data/types.ts`). Pflicht sind `db_meta`
und `models`; alles andere ist optional oder Altlast.

```jsonc
{
  "db_meta": {
    "db_version": "1.2.0",        // wird VERGLICHEN: nur höher als lokal lädt neu
    "created_by": "user-export",
    "created_at": "2026-08-09",
    "description": "4-Zyl.-TDI, Leerlauf ~800/min, Mikro am Luftfilterkasten"
  },
  "machineName": "Golf 7 TDI",     // nur Anzeige
  "location": "Einfahrt",          // nur Anzeige
  "notes": "Motor warm, Klima aus, Standgas",
  "models": [
    {
      "label": "Normalzustand",     // PFLICHT — identifiziert die Referenz
      "type": "healthy",            // PFLICHT — "healthy" | "faulty"
      "weightVector": [0.0131, 0.0208, 0.0164, "… 512 Werte …"], // PFLICHT

      "machineId": "wird beim Import überschrieben",
      "engineId": "gmia",
      "featureLayout": "linear-512", // fehlt = linear-512 (Modell von vorher)
      "sampleRate": 48000,           // MUSS zur Aufnahmerate des Telefons passen
      "featureDimension": 512,
      "regularization": 1e9,
      "scalingConstant": 9.96,       // = atanh(√0.9) / meanCosineSimilarity
      "trainingDate": 1755000000000,
      "trainingDuration": 16.5,

      "baselineScore": 89.4,         // Mittel der Selbsttest-Scores
      "baselineMedian": 90.1,        // Median derselben Scores
      "baselineMad": 0.62,           // MAD derselben Scores (σ-skaliert)

      "metadata": {
        "meanCosineSimilarity": 0.1826,
        "targetScore": 0.9,
        "weightMagnitude": 0.0043
      }
    }
  ]
}
```

`weightVector` darf als gewöhnliches JSON-Array stehen; beim Import wird es zu
`Float64Array` (`applyModelsToMachine`). Modelle werden **gemischt, nicht
ersetzt**: eine Referenz mit einem Label, das lokal schon existiert, wird
übersprungen — eigene Aufnahmen überschreibt ein Download nicht.

### Die drei Zeilen, auf die es ankommt

`baselineScore`, `baselineMedian` und `baselineMad` sind neu und wirken wie
Buchhaltung. Sie sind der Grund, warum eine geteilte Referenz mehr ist als eine
Datei: aus ihnen berechnet die App die **Auflösung** dieser Referenz
(`baselineResolution` in `src/core/ml/baselineSpread.ts`) und schreibt sie unter
die Ampel — „Auflösung dieser Referenz: 2,1 Punkte."

Damit reist mit einer geteilten Referenz nicht nur ein Vergleichsmaßstab, sondern
auch die Angabe, was er wert ist. Eine sorgfältig aufgenommene Referenz löst
feiner auf als eine im Wind aufgenommene, und man kann es sehen, ohne den
Aufnehmenden zu kennen. Das ist die einzige Qualitätsangabe in diesem Format —
und die einzige, die nicht behauptet, sondern gemessen ist.

Fehlen die Felder (Referenzen aus der Zeit davor), zeigt die App keine Zahl,
sondern sagt, dass sie keine hat.

---

## Was mitreist — und was nicht

**Mit:** Gewichtsvektoren, Layout, Sample-Rate, Kalibrierkonstante,
Eigenstreuung, Maschinenname, Ort, Notizen, Beschreibung.

**Nicht mit:** die Audioaufnahmen selbst, Prüfhistorie, Diagnosen, Einstellungen,
Rauschprofile, Raummessungen. Ein Gewichtsvektor ist kein Audio und lässt sich
nicht zurück in Klang verwandeln — geteilt wird ein Maßstab, keine Aufnahme.

Das ist auch die Datenschutz-Antwort: Wer eine Sammlung veröffentlicht,
veröffentlicht 512 Zahlen pro Referenz und ein paar Metadaten. Wer sich
vertippt und die Notizen mit Klarnamen füllt, veröffentlicht die auch — die
Felder `notes`, `location` und `machineName` sind Freitext und werden ungefiltert
übernommen.

---

## Was eine geteilte Referenz NICHT leisten kann

Diese Grenzen stehen hier, weil sie sonst als Enttäuschung entdeckt werden.

**Sample-Rate.** Ein Modell mit `sampleRate: 48000` wird auf einem Telefon, das
mit 44 100 Hz aufnimmt, ausgeschlossen — nicht schlecht bewertet, sondern gar
nicht gerechnet (`partitionModels` in `src/core/ml/modelCompatibility.ts`). Wer
eine Sammlung teilt, sollte in `description` nennen, mit welcher Rate sie
aufgenommen wurde. Beide Raten anzubieten ist erlaubt: zwei Modelle mit
demselben Label gehen nicht, zwei mit `Normalzustand 48k` und `Normalzustand
44k1` schon.

**Merkmals-Layout.** `featureLayout` muss zum Layout der laufenden App passen.
Heute ist das überall `linear-512`, deshalb fällt es nicht auf. Ändert sich das
Layout, werden alte Sammlungen unbrauchbar und die App sagt es — sie rechnet
nicht kulant weiter. Das ist beabsichtigt: zwei Layouts mit gleicher Länge
liefern einen fehlerfreien, bedeutungslosen Score.

**Betriebspunkt.** Eine Referenz gilt für den Zustand, in dem sie aufgenommen
wurde. Leerlauf warm ist nicht Leerlauf kalt, und mit eingeschalteter Klima ist
es eine andere Maschine. Der Name der Sammlung sollte den Betriebspunkt tragen,
nicht nur das Modell: `golf-7-tdi-leerlauf-warm` sagt mehr als `golf-7`.

**Mikrofonposition und Gerät.** Die eigenen Cross-Device-Messungen des Projekts
liegen bei 93–94 % (README) — auf demselben Gerät bei 95–97 %. Ein Gerätewechsel
kostet also etwa so viel Score wie eine leichte Veränderung der Maschine. Eine
geteilte Referenz ist damit gröber als eine eigene. Sie ist nicht wertlos: sie
sagt „so klingt dieser Motortyp normalerweise". Sie ist nur kein Ersatz für die
eigene erste Aufnahme.

**Vertrauen.** Es gibt keine Signatur, keine Prüfsumme und keine Herkunft außer
`created_by` — einem Freitextfeld. Wer die URL kontrolliert, kontrolliert die
Referenz. Für eine Sammlung, die man selbst betreibt oder von jemandem lädt, den
man kennt, ist das angemessen. Für alles darüber wäre es zu wenig, und das
Format sagt es nicht von sich aus.

---

## Veröffentlichen

Im Maschinen-Detail steht **„📤 Sammlung teilen"** (nur, wenn die Maschine
mindestens eine angelernte Referenz hat). Der Knopf erzeugt genau die Datei aus
dem Abschnitt oben und gibt sie über die Teilen-Funktion des Systems heraus — auf
Geräten ohne diese fällt er auf einen Download zurück.

1. Referenz in Zanobo anlernen (damit `baselineMedian`/`baselineMad` entstehen —
   ohne sie reist die Auflösungszahl nicht mit).
2. Maschinen-Detail öffnen → „Sammlung teilen".
3. Die Datei als `db-latest.json` unter `<sammlung>/` in ein
   GitHub-Pages-Repository legen. Der Ordnername **ist** der Sammlungsname.
4. QR-Code oder NFC-Tag mit diesem Namen im Feld „Referenz-Sammlung (c)"
   schreiben.

Schritt 3 bleibt Handarbeit: der GitHub-Pages-Workflow, der `db-latest.json`
veröffentlicht hätte, wurde gelöscht (er war dauerhaft rot). Wer eine Sammlung
betreibt, betreibt ein Repository — das ist Absicht, nicht Lücke. Ein
Veröffentlichungsdienst hätte einen Betreiber.

### Was der Knopf NICHT ist

Der Knopf „Datenbank exportieren" in den Einstellungen macht etwas anderes: er
exportiert die vollständige App-Sicherung (`buildExportPayload` in
`4-Settings.ts`) — Maschinen, Aufnahmen, Prüfhistorie, Einstellungen. Das ist ein
Backup für dich, keine teilbare Sammlung. Beide bleiben, weil sie verschiedene
Fragen beantworten: „wie komme ich auf ein neues Telefon" gegen „wie bekommt
jemand anders meinen Maßstab".

### Korrektur zu einer früheren Fassung dieses Dokuments

Hier stand, `downloadExport()` müsse nur „an einen Knopf gehängt" werden. Das war
falsch. `exportDatabase()` las die Modelle ausschließlich aus dem
`ReferenceDatabase`-Datensatz — und den gibt es nur, wenn schon einmal eine
Sammlung von einer URL **geladen** wurde. Wer seinen Normalzustand selbst
aufnimmt (also der ganze Fahrzeugfall, und genau die Person, die etwas zu teilen
hat), hat keinen solchen Datensatz: der Knopf hätte für sie `null` geliefert und
nichts getan.

Selbst angelernte Referenzen liegen in `machine.referenceModels`. Der Aufbau
liest jetzt dort zuerst und mischt einen vorhandenen `ReferenceDatabase` dazu
(`data/referenceCollection.ts`), damit eine geladene Sammlung beim Weitergeben
nicht ärmer wird als beim Empfangen.

### Versionen

Ein Verbraucher lädt nur neu, wenn `db_version` **höher** ist als seine eigene.
Eine Version, die sich beim Neu-Veröffentlichen nicht ändert, heißt: niemand
bekommt die neue Datei. Deshalb zwei Fälle:

- Sammlung stammt von einer URL → Patch wird hochgezählt (`1.4.2` → `1.4.3`), die
  veröffentlichte Kette reißt nicht ab.
- Selbst angelernt → aus dem Inhalt abgeleitet:
  `1.<anzahl referenzen>.<tag der jüngsten anlernung>`. Zweimal dieselbe Datei
  exportieren ergibt dieselbe Version — richtig so, es gibt nichts nachzuladen.
  Eine hinzugefügte oder neu aufgenommene Referenz hebt die Nummer.

Bekannte Kante: eine Referenz löschen und am selben Tag eine andere aufnehmen
hält Anzahl und Tag gleich, obwohl der Inhalt sich geändert hat. Dann muss
`db_version` in der Datei von Hand angehoben werden.

---

## Verzicht

Damit dieses Konzept trägt, gibt Zanobo dreierlei auf:

- **Kein Konto, keine Rechteverwaltung, keine Rücknahme.** Wer den
  Sammlungsnamen kennt, lädt. Wer etwas veröffentlicht hat, kann es löschen,
  aber nicht zurückholen. Der Preis dafür, dass Teilen keinen Server braucht.
- **Keine zentrale Liste.** Es gibt kein Verzeichnis der Sammlungen und keine
  Suche. Sammlungen verbreiten sich, wie ihre Namen sich verbreiten — über einen
  Tag am Motorraum, eine Nachricht, ein Forum. Ein Verzeichnis wäre ein Dienst,
  und ein Dienst wäre ein Betreiber.
- **Keine Qualitätsprüfung außer der Auflösungszahl.** Niemand prüft, ob eine
  geteilte Referenz sinnvoll aufgenommen wurde. Die einzige Auskunft ist die
  Eigenstreuung, die die Referenz selbst mitbringt — messbar, unbestechlich und
  begrenzt: sie sagt, wie gleichmäßig aufgenommen wurde, nicht, ob die Maschine
  beim Aufnehmen gesund war.

---

## Verwandte Stellen im Code

| Was | Wo |
| --- | --- |
| URL-Aufbau, Deep-Link-Parsing | `src/ui/HashRouter.ts` |
| Laden, Prüfen, Anwenden, Export | `src/data/ReferenceDbService.ts` |
| Sammlung zum Teilen bauen, Versionsregel | `src/data/referenceCollection.ts` |
| Knopf „Sammlung teilen" | `src/ui/phases/MachineDetailModal.ts` |
| Dateiformat | `ReferenceDbFile` in `src/data/types.ts` |
| Auflösung einer Referenz | `src/core/ml/baselineSpread.ts` |
| Verträglichkeitsprüfung | `src/core/ml/modelCompatibility.ts` |
| Eingabefeld „Referenz-Sammlung" | `NfcWriteModal.ts`, `QrShareModal.ts` |
