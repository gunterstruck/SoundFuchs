# ZANOBOT - Professioneller UX-Audit

**Datum:** 2026-03-08
**Perspektive:** Senior UX Designer / Product Designer
**Zielgruppe:** Servicetechniker, Maschinenbediener, Instandhalter
**Plattform:** Progressive Web App (PWA), Mobile-first, Offline-fähig

---

## 1. USER JOURNEY

### Gesamtablauf eines Nutzers

```
App öffnen
  │
  ├─ EINSTIEG: Hero-Banner + 3 Aktions-Karten
  │   ├─ "Maschine auswählen" (Phase 1)
  │   ├─ "Referenz aufnehmen" (Phase 2)
  │   └─ "Zustand prüfen" (Phase 3)
  │
  ├─ ERSTE INTERAKTION: Maschine identifizieren
  │   ├─ QR-/Barcode scannen
  │   ├─ NFC-Tag antippen
  │   ├─ Manuell anlegen
  │   └─ Aus Liste wählen
  │
  ├─ HAUPTFUNKTION: Akustische Diagnose
  │   ├─ Referenz aufnehmen (10s Normalzustand)
  │   ├─ GMIA-Modell trainieren (automatisch)
  │   └─ Live-Diagnose starten (Echtzeit-Vergleich)
  │
  ├─ AUSWERTUNG: Ergebnis bewerten
  │   ├─ Health Gauge (0-100%)
  │   ├─ Status: Unauffällig / Abweichung / Auffällig
  │   └─ Work-Point-Ranking (Frequenzanalyse)
  │
  └─ HISTORIE: Verlaufsdaten
      ├─ History Chart (Zeitreihe)
      ├─ Sparklines in der Maschinenliste
      └─ Flottenvergleich (Quick Compare)
```

### Bewertung

**Ist der Einstieg verständlich?**
- TEILWEISE. Der Hero-Banner ("Hört sich die Anlage normal an?") ist gut formuliert und kontextbezogen. Jedoch sieht der Erstnutzer 3 gleichwertige Karten ohne klare Priorisierung (außer im Focus-Theme). Es fehlt ein "Was soll ich zuerst tun?"-Signal.
- POSITIV: Das Empty-State-Mini-Guide ("So funktioniert Zanobot" mit 3 Schritten) hilft Erstnutzern enorm. Dies wird aber nur gezeigt, wenn keine Maschinen existieren.

**Gibt es unnötige Schritte?**
- JA. Der Nutzer muss im Standard-Flow erst eine Maschine anlegen, dann Referenz aufnehmen, dann Diagnose starten. Das sind 3 separate Phasen mit jeweils eigenen Aufnahme-Modals. Der Zero-Friction-Modus (Auto-Detect) existiert, ist aber visuell nicht als primärer Pfad erkennbar.
- Die Trennung "Referenz aufnehmen" vs. "Zustand prüfen" ist für technische Laien verwirrend. Ein Servicetechniker denkt: "Ich will wissen, ob die Maschine OK ist" - nicht "Ich möchte ein GMIA-Modell trainieren".

**Wo entsteht Verwirrung?**
- Phase 2 (Referenz) vs. Phase 3 (Diagnose) sind konzeptionell ähnlich: Beide starten eine Audio-Aufnahme. Der Unterschied (Training vs. Inferenz) ist nicht intuitiv.
- "Zustand prüfen" als Button-Text ist gut, aber die Karte enthält auch "Auto-Detect" und manuelle Auswahl, was die Karte überladen macht.
- Die Settings (Phase 4) enthalten kritische Funktionen wie Database-Export/-Import neben kosmetischen Einstellungen wie Theme-Wechsel. Keine Priorisierung.

---

## 2. KLICKPFADE

### Pfad 1: Maschine erstellen (Erstnutzung)

| Schritt | Aktion | Klicks |
|---------|--------|--------|
| 1 | App öffnen | 0 |
| 2 | "Maschine auswählen" antippen | 1 |
| 3 | "Manuell anlegen" wählen | 1 |
| 4 | Maschinenname eingeben | 1 (Tastatur) |
| 5 | Optional: Maschinen-ID eingeben | 1 |
| 6 | "Erstellen" bestätigen | 1 |
| **Gesamt** | | **5 Klicks + Texteingabe** |

**UX-Probleme:**
- Es gibt keinen "Quick-Create"-Modus (z.B. direkt aus dem Banner heraus)
- Der optionale ID-Feld verwirrt ("SAP-Nr." ist branchenspezifisch)
- Keine Validierungs-Preview (z.B. "Pumpe 3 - Westhalle wird angelegt")

**Verbesserung:**
- Single-Field-Create: Nur Name eingeben, sofort erstellen
- ID erst nachträglich in Details editierbar machen

---

### Pfad 2: Referenz aufnehmen

| Schritt | Aktion | Klicks |
|---------|--------|--------|
| 1 | Maschine auswählen (falls nicht ausgewählt) | 1-3 |
| 2 | "Referenz aufnehmen" Karte öffnen | 1 |
| 3 | "Aufnehmen" antippen | 1 |
| 4 | 10 Sekunden warten (Aufnahme läuft) | 0 (Wartezeit) |
| 5 | Aufnahme stoppt automatisch oder manuell | 0-1 |
| 6 | Qualitäts-Check abwarten | 0 (automatisch) |
| 7 | "Referenz speichern" bestätigen | 1 |
| **Gesamt** | | **4-7 Klicks + 10s Wartezeit** |

**UX-Probleme:**
- HIGH: Während der 10s-Aufnahme sieht der Nutzer nur einen Audiovisualizer ohne klare Fortschrittsanzeige ("Noch 7 Sekunden...")
- MEDIUM: Nach der Aufnahme: automatischer Qualitäts-Check ohne Nutzer-Feedback, ob die Qualität gut genug ist. Bei schlechter Qualität: Modal mit technischer Fehlermeldung
- LOW: "Referenz" ist ein Fachbegriff. Besser: "Normalzustand aufnehmen" oder "So klingt sie gesund"

**Verbesserung:**
- Countdown-Timer während der Aufnahme anzeigen ("Noch 7 Sekunden")
- Qualitäts-Ampel nach der Aufnahme (Grün/Gelb/Rot) statt technischer Fehlermeldung
- Automatisch speichern bei guter Qualität, nur bei schlechter Qualität nachfragen

---

### Pfad 3: Diagnose durchführen (Zustand prüfen)

| Schritt | Aktion | Klicks |
|---------|--------|--------|
| 1 | "Zustand prüfen" antippen | 1 |
| 2a | Auto-Detect: Aufnahme startet sofort | 0 |
| 2b | Manuell: Maschine wählen | 1-3 |
| 3 | Aufnahme läuft (Echtzeit-Analyse) | 0 |
| 4 | "Stop & Save" antippen | 1 |
| 5 | Ergebnis wird angezeigt | 0 |
| **Gesamt (Auto)** | | **2 Klicks** |
| **Gesamt (Manuell)** | | **3-5 Klicks** |

**UX-Probleme:**
- HIGH: Der Auto-Detect-Modus ("Jetzt prüfen") ist der schnellste Weg, aber visuell nicht dominant genug (außer im Focus-Theme)
- MEDIUM: Während der Live-Diagnose zeigt die App viele Metriken gleichzeitig (Health Gauge, Visualizer, Operating Point Monitor, Pipeline Status, Work Point Ranking). Für Basic-Nutzer überwältigend
- LOW: "Stop & Save" kombiniert zwei Aktionen. Der Nutzer will vielleicht nur stoppen ohne zu speichern

**Verbesserung:**
- Auto-Detect als primären, visuell dominanten Button auf der Startseite positionieren
- View-Level "Basic" konsequent nutzen: Nur Health Gauge + Status-Text zeigen
- Separaten "Verwerfen"-Button nach dem Stoppen anbieten

---

### Pfad 4: Historie ansehen

| Schritt | Aktion | Klicks |
|---------|--------|--------|
| 1 | "Maschine auswählen" Karte öffnen | 1 |
| 2 | "Übersicht" Tab wählen | 1 |
| 3 | Maschine aus Liste antippen | 1 |
| 4 | Detail-Ansicht mit Sparkline sehen | 0 |
| **Gesamt** | | **3 Klicks** |

**UX-Probleme:**
- HIGH: Es gibt keinen dedizierten "Historie"-Bereich. Verlaufsdaten sind in der Maschinenauswahl versteckt
- MEDIUM: Der History Chart ist nur in der Diagnose-Phase sichtbar, nicht als eigenständige Ansicht
- HIGH: Kein Zugang zu Einzeldiagnose-Details (Timestamp, Score, Dauer)

**Verbesserung:**
- Dedizierter "Verlauf"-Tab/Bereich auf der Startseite
- Einzelne Diagnoseergebnisse anklickbar mit Detail-Ansicht
- Schnellfilter: "Letzte 7 Tage", "Letzte 30 Tage", "Auffällige"

---

### Pfad 5: Flottenvergleich (Quick Compare)

| Schritt | Aktion | Klicks |
|---------|--------|--------|
| 1 | Quick Compare starten | 1 |
| 2 | Anzahl Maschinen wählen | 1 |
| 3 | Maschine 01 aufnehmen (Referenz) | 1 + 10s |
| 4 | Maschine 02-N aufnehmen (je Diagnose) | N-1 × (1 + 10s) |
| 5 | Ergebnis-Screen | 0 |
| **Gesamt** | | **3 + N Klicks + N × 10s** |

**UX-Probleme:**
- MEDIUM: Quick Compare ist ein fortgeschrittenes Feature, aber auf der gleichen Ebene wie Basisfunktionen zugänglich
- LOW: Bei vielen Maschinen (>10) wird der Workflow repetitiv und langweilig
- MEDIUM: Kein Fortschrittsbalken über den gesamten Vergleich ("Maschine 3/8 wird geprüft")

**Verbesserung:**
- Gesamtfortschrittsanzeige: "Maschine 3 von 8 wird geprüft"
- Zwischenergebnisse anzeigen (bereits geprüfte Maschinen als Thumbnails)
- Möglichkeit, den Vergleich zu pausieren und später fortzusetzen

---

## 3. INFORMATION ARCHITECTURE

### Aktuelle Struktur

```
Startseite
├── Hero Banner (branding)
├── Aktionskarten
│   ├── Maschine auswählen (Phase 1)
│   │   ├── Scannen
│   │   ├── Auswählen (Liste)
│   │   ├── Erstellen
│   │   └── Übersicht (Maschinenliste mit Historie)
│   ├── Referenz aufnehmen (Phase 2)
│   │   ├── Aufnahme-Modal
│   │   ├── Qualitäts-Check
│   │   └── Modell-Verwaltung
│   └── Zustand prüfen (Phase 3)
│       ├── Auto-Detect
│       ├── Manuelle Auswahl
│       ├── Live-Diagnose
│       └── Ergebnis-Review
├── Footer
│   ├── Quick Compare
│   ├── Einstellungen (Phase 4)
│   └── Info / About
└── Deep Links (NFC/QR)
    ├── #/m/<id> → Maschine
    ├── #/f/<id> → Flotte
    ├── #/q/<n> → Quick Compare
    └── #/import → Datenbank
```

### Bewertung

**Ist klar unterscheidbar: Maschine, Messung, Zustand, Historie, Flotte?**

- **Maschine**: GUT. Klar abgegrenzt als "Phase 1: Maschine auswählen". Hat eigene Karte.
- **Messung (Referenz)**: PROBLEMATISCH. "Referenz aufnehmen" ist für Endnutzer unklar. Der Begriff "Referenz" setzt Wissen über das Vergleichsprinzip voraus.
- **Zustand (Diagnose)**: GUT. "Zustand prüfen" ist verständlich und handlungsorientiert.
- **Historie**: SCHLECHT. Keine eigenständige Entität in der Navigation. Verlaufsdaten sind fragmentiert: Sparklines in der Maschinenliste, History Chart nur im Diagnose-Modus, keine dedizierte Ansicht.
- **Flotte**: UNEINHEITLICH. Quick Compare auf der Startseite, Fleet via Deep Link, kein Fleet-Management-Bereich in der App selbst.

**Gibt es zu viele Ebenen?**

- NEIN im Sinne der Tiefe (maximal 2 Ebenen: Startseite → Aktion → Modal)
- JA im Sinne der Breite: Die Startseite bietet zu viele gleichwertige Einstiegspunkte gleichzeitig

**Unklare Begriffe:**

| Begriff | Problem | Besser |
|---------|---------|--------|
| Referenz | Technisch, unklar | "Normalzustand" / "Gesund-Profil" |
| GMIA | Algorithmus-Name, irrelevant für Nutzer | Nicht anzeigen oder "KI-Analyse" |
| Operating Point | Englisch, technisch | "Betriebspunkt" oder gar nicht zeigen |
| Cherry-Picking | Englisch, Data-Science-Jargon | "Signalfilter" |
| T60 / CMN | Akustik-Fachbegriffe | Nur im Expert-Modus |
| Pipeline Status | Entwickler-Sprache | "Analyse-Details" |
| Drift Detection | Englisch | "Veränderungserkennung" |

**Fehlende Zusammenhänge:**

- Kein visueller Zusammenhang zwischen Referenz und Diagnose (z.B. "Zuletzt trainiert am..." in der Diagnose-Karte)
- Kein Dashboard-View, der alle Maschinen mit ihrem aktuellen Status auf einen Blick zeigt
- Kein Zusammenhang zwischen Einzeldiagnose und Trend ("Dieser Wert ist 15% schlechter als letzte Woche")

---

## 4. INTERFACE & VISUAL FEEDBACK

### Buttons

**Positiv:**
- Gut dimensioniertes Button-System mit 3 Größen (sm, md, lg)
- Touch-Targets sind ausreichend groß (min-height 44px durch Padding)
- Active-Press-Feedback (`scale(0.98)`) gibt taktiles Gefühl
- Klare Primary/Secondary/Danger-Varianten

**Probleme:**
- HIGH: Im Diagnose-Card sind sowohl "Jetzt prüfen" (Auto-Detect) als auch "Scannen/Auswählen/Erstellen" sichtbar. Zu viele Optionen in einer Karte
- MEDIUM: Button-Texte wie "Stop & Save" kombinieren zwei Aktionen - gegen das Single-Action-Prinzip
- LOW: Hover-Effekte (`translateY(-2px)`) sind auf Touchscreens irrelevant, verursachen aber keine Probleme

### Statusanzeigen

**Positiv:**
- Health Gauge ist visuell stark: Große, farbkodierte Kreisanzeige (Grün/Gelb/Rot)
- Status-Texte sind verständlich: "Unauffällig", "Abweichung", "Auffällig"
- Ampel-System im Operating Point Monitor (Expert-Modus)

**Probleme:**
- HIGH: Der Health Gauge zeigt Prozent-Werte (z.B. "67%"), aber der Nutzer weiß nicht, was "67%" bedeutet. Ist das gut? Mittel? Schlecht? Die Schwellwerte (75/50) sind nicht sichtbar
- MEDIUM: Der Work Point Ranking zeigt "Normalbetrieb 50Hz 94.5% Healthy" - zu viele Informationen auf einmal für den Basic-Modus
- MEDIUM: Kein persistenter Status-Indikator in der Maschinenliste (z.B. farbiger Punkt neben dem Namen)

### Ladezustände

**Positiv:**
- Reference Loading Overlay mit Fortschrittsbalken und Statusmeldungen
- Toast-Notifications für Feedback bei Aktionen

**Probleme:**
- HIGH: Während der GMIA-Modell-Berechnung nach der Referenzaufnahme fehlt ein klarer Ladeindikator. Der Nutzer weiß nicht, wie lange das dauert
- MEDIUM: Kein Skeleton-Loading für die Maschinenliste beim App-Start
- LOW: Die Audio-Aufnahme hat keinen visuellen Countdown

### Fehlermeldungen

**Positiv:**
- Detaillierte Error-Modals mit klaren Titeln ("Datenbank-Fehler", "Zugriff verweigert")
- Fehlertexte sind übersetzt (i18n)
- Differenzierte Fehlertypen (Toast: success/error/warning/info)

**Probleme:**
- HIGH: Technische Fehlermeldungen wie "Inkompatible Sample Rate" sind für Endnutzer unverständlich. Besser: "Die Aufnahme konnte nicht verglichen werden. Bitte erneut aufnehmen."
- MEDIUM: Bei Mikrofonzugriffs-Verweigerung wird nur ein Text angezeigt, kein visuelles How-To
- LOW: Keine Retry-Buttons in Fehlermeldungen

### Visuelles Feedback

**Weiß der Nutzer immer, was gerade passiert?**
- TEILWEISE. Während der Live-Diagnose: JA (Health Gauge aktualisiert sich in Echtzeit)
- Beim Modell-Training: NEIN (keine sichtbare Fortschrittsanzeige)
- Bei NFC-Import: JA (Onboarding Trace Overlay, aber nur im Debug-Modus)

**Wird Erfolg/Fehler klar kommuniziert?**
- Erfolg: JA (Toast "Referenz gespeichert", grüner Status)
- Fehler: TEILWEISE (Modal mit Text, aber manchmal zu technisch)

---

## 5. INDUSTRIE-TAUGLICHKEIT

### Große Buttons
- **BEWERTUNG: 7/10**
- Button-Padding ist solide (1rem 2rem für lg-Variante)
- Aber: In der Diagnose-Karte sind Buttons zu dicht beieinander
- Touch-Target-Size ist grenzwertig bei kleinen Geräten (iPhone SE)
- Die responsive Downscaling-Logik (13px bei max-height: 700px) könnte Buttons zu klein machen

### Schnelle Bedienung
- **BEWERTUNG: 6/10**
- Auto-Detect ist der schnellste Pfad (2 Klicks zum Ergebnis) - EXZELLENT
- NFC-Deep-Links ermöglichen One-Tap-Diagnose - EXZELLENT
- Aber: Standard-Flow hat zu viele Schritte (5+ Klicks)
- Kein Shortcut von der Maschinenliste direkt zur Diagnose
- Quick Compare erfordert repetitive Aufnahmen ohne Batch-Modus

### Gute Lesbarkeit
- **BEWERTUNG: 8/10**
- Responsive Font-Sizes mit `clamp()` sind vorbildlich
- Neon-Theme hat hohe Kontraste für dunkle Umgebungen
- Light/Daylight-Theme für helle Umgebungen (Tageslicht, Werkshalle)
- PROBLEM: Muted Text (`#78909C` auf dunklem Hintergrund) hat zu wenig Kontrast
- PROBLEM: Der Audiovisualizer ist ohne Kontext schwer zu interpretieren

### Wenig Texte
- **BEWERTUNG: 5/10**
- Status-Texte sind kurz und prägnant ("Unauffällig", "Auffällig")
- Aber: Modals enthalten zu viel erklärenden Text
- About-Modal ist extrem textlastig (Feature-Listen, IP-Vergleichstabellen, Technologie-Stack)
- Fehlermeldungen sind zu lang und technisch
- Banner-Subline "Zustand in Sekunden prüfen - direkt am Gerät, offline" ist gut, aber Marketing-Sprache

### Klare Signale
- **BEWERTUNG: 7/10**
- Ampelfarben (Grün/Gelb/Rot) für Status - universell verständlich
- Health Gauge als zentrale Anzeige - visuell stark
- PROBLEM: Kein akustisches Feedback (Vibration, Ton) bei Ergebnis
- PROBLEM: Kein großes, eindeutiges "ALLES OK" oder "ACHTUNG"-Signal am Ende der Diagnose

---

## 6. UX PROBLEME

### HIGH Priority

| # | Problem | Bereich | Impact |
|---|---------|---------|--------|
| H1 | **Keine klare Primäraktion auf der Startseite** (außer Focus-Theme). 3 gleichwertige Karten verwirren Erstnutzer. "Was mache ich zuerst?" | Navigation | Hohe Abbruchrate bei Erstnutzern |
| H2 | **Historie nicht zugänglich.** Kein dedizierter Verlaufs-Bereich. Diagnoseergebnisse versteckt in Maschinenliste-Sparklines. Keine Detail-Ansicht einzelner Diagnosen | Information Architecture | Techniker können Trends nicht analysieren |
| H3 | **Technische Fehlermeldungen.** "Inkompatible Sample Rate", "Ungeeignetes Signal" - für Feldpersonal unverständlich | Feedback | Nutzer ratlos bei Problemen |
| H4 | **Kein Dashboard/Übersichtsscreen.** Alle Maschinen mit aktuellem Status auf einen Blick fehlt komplett | Feature Gap | Flottenmanager sehen nicht den Gesamtzustand |
| H5 | **Kein visueller Countdown** während der Audio-Aufnahme. 10 Sekunden stille Wartezeit ohne klaren Fortschritt | Feedback | Nutzer unsicher, ob App funktioniert |
| H6 | **"Referenz" als Begriff** ist für Endnutzer unverständlich. Das Konzept "Referenzaufnahme vs. Diagnoseaufnahme" erfordert Vorwissen | Terminology | Kognitive Belastung, Fehlbedienung |

### MEDIUM Priority

| # | Problem | Bereich | Impact |
|---|---------|---------|--------|
| M1 | **Diagnose-Karte überladen.** Enthält Auto-Detect, manuelle Auswahl (Scan/Select/Create), Machine-Info. Zu viele Optionen | UI Complexity | Entscheidungsparalyse |
| M2 | **View-Level-System** (Basic/Advanced/Expert) existiert, wird aber nicht konsequent genutzt. Viele technische Details auch im Basic-Modus sichtbar | Complexity Management | Überfordert Basis-Nutzer |
| M3 | **Kein akustisches/haptisches Feedback.** Bei Abschluss der Diagnose keine Vibration oder Sound. In lauter Umgebung wird visuelles Feedback leicht übersehen | Accessibility | Ergebnis wird verpasst |
| M4 | **Settings zu unstrukturiert.** Theme-Wechsel, Sprachauswahl, Database-Export/Import, T60-Kalibrierung, Expert-Mode alles in einer flachen Liste | Information Architecture | Wichtige Funktionen gehen unter |
| M5 | **Flottenmanagement nur via Deep Link.** Kein in-App Fleet-Management (erstellen, bearbeiten, Mitglieder verwalten) | Feature Gap | Abhängigkeit von externen Tools |
| M6 | **Kein Undo/Rückgängig.** Maschine gelöscht? Diagnose verworfen? Kein Zurück | Error Recovery | Datenverlust bei Fehleingaben |
| M7 | **Kein Offline-Indikator.** App funktioniert offline, aber zeigt nicht an, ob gerade online oder offline | Status | Nutzer unsicher über Sync-Status |

### LOW Priority

| # | Problem | Bereich | Impact |
|---|---------|---------|--------|
| L1 | **"Stop & Save"** kombiniert zwei Aktionen. Trennung in "Stoppen" → "Speichern/Verwerfen" wäre klarer | Button Design | Geringfügige Verwirrung |
| L2 | **About-Modal zu textlastig.** IP-Vergleichstabellen und Technologie-Stack interessieren Feldtechniker nicht | Content | Irrelevante Information |
| L3 | **Hover-Effekte auf Touchscreens.** `translateY(-2px)` und `scale(1.02)` auf Hover haben auf Mobile keinen Effekt | CSS | Kein Impact, aber unnötiger Code |
| L4 | **Hero-Banner nimmt Platz ein.** Auf kleinen Screens ist das Branding-Banner (1024x400/500) wertvoll verschwendeter Platz | Layout | Weniger Platz für Aktionen |
| L5 | **Kein Onboarding-Tutorial** für den Focus-Theme-Wechsel. Nutzer verstehen nicht, warum sich das Layout ändert | Discoverability | Verwirrung bei Theme-Wechsel |
| L6 | **QR-Code-Generator** in der Machine-Detail-Ansicht ist ein Power-Feature, das unkommentiert erscheint | Discoverability | Nutzer wissen nicht, dass sie QR-Codes erstellen können |

---

## 7. KONKRETE UX VERBESSERUNGEN

### 7.1 Neue Navigation: "One Big Button"-Prinzip

**Aktuell:** 3 gleichwertige Karten
**Vorschlag:** Ein prominenter CTA-Button + kontextuelle Sekundäroptionen

```
┌──────────────────────────────────────┐
│  [Hero: "Hört sich die Anlage       │
│   normal an?"]                       │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  ▶  JETZT PRÜFEN            │    │  ← Großer primärer Button
│  │     (Maschine wird erkannt)  │    │     min-height: 80px
│  └──────────────────────────────┘    │
│                                      │
│  Zuletzt geprüft:                    │
│  ┌────────┐ ┌────────┐ ┌────────┐   │  ← Horizontale Scroll-Cards
│  │Pumpe 3 │ │Motor 7 │ │Fan 12  │   │
│  │✓ 94%   │ │⚠ 67%   │ │✗ 34%   │   │
│  │vor 2h  │ │vor 1d  │ │vor 3d  │   │
│  └────────┘ └────────┘ └────────┘   │
│                                      │
│  [+ Neue Maschine]  [QR scannen]     │  ← Sekundäre Aktionen
│                                      │
│  ─── Aktionen ───                    │
│  📊 Alle Maschinen    ▶ Verlauf      │  ← Navigationslinks
│  ⚡ Flottenvergleich   ⚙ Settings    │
└──────────────────────────────────────┘
```

### 7.2 Bessere Startseite: Status-Dashboard

Statt 3 leerer Karten: **Dashboard mit Maschinenstatus**

```
┌──────────────────────────────────────┐
│  Ihre Maschinen            [Alle →]  │
│                                      │
│  ✅ 4 unauffällig                    │
│  ⚠️  1 mit Abweichung                │
│  ❌ 0 auffällig                      │
│  ⏸  2 nicht geprüft                  │
│                                      │
│  Nächste Prüfung fällig:            │
│  ┌──────────────────────────────┐   │
│  │  Motor 7 · letzte Prüfung   │   │
│  │  vor 3 Tagen · ⚠ 67%        │   │
│  │  [Jetzt prüfen →]           │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

### 7.3 Vereinfachter Aufnahme-Workflow

**Aktuell:** Referenz ↔ Diagnose als separate Phasen
**Vorschlag:** Unified Recording Flow

```
Nutzer tippt "Jetzt prüfen"
    ↓
Auto-Detect erkennt Maschine?
    ├─ JA → Live-Diagnose startet sofort
    │       └─ Ergebnis-Screen (Ampel + Empfehlung)
    │
    └─ NEIN → "Neue Maschine erkannt"
              ├─ "Name eingeben: [_________]"
              └─ "Aufnahme wird als Referenz gespeichert"
                  → Automatischer Wechsel: Nächste Aufnahme = Diagnose
```

**Vorteil:** Der Nutzer muss nicht verstehen, was "Referenz" vs. "Diagnose" ist. Die App entscheidet automatisch.

### 7.4 Klarere Zustandsanzeigen

**Aktuell:** Health Gauge mit Prozent + Status-Text
**Vorschlag:** Dreistufiges Ergebnis-Display

```
┌──────────────────────────────────────┐
│                                      │
│           ✅ UNAUFFÄLLIG             │  ← Großes, klares Signal
│                                      │
│        Die Maschine klingt wie       │  ← Einfache Erklärung
│        bei der letzten Prüfung.      │
│                                      │
│     ┌──────────────────────────┐     │
│     │      ████████████ 94%    │     │  ← Fortschrittsbalken
│     └──────────────────────────┘     │
│                                      │
│   Trend: ↗ +2% seit letzter Woche   │  ← Kontext
│                                      │
│   [Details →]  [Neue Prüfung]        │
└──────────────────────────────────────┘
```

Für "AUFFÄLLIG":

```
┌──────────────────────────────────────┐
│                                      │
│           ❌ AUFFÄLLIG               │
│                                      │
│        Die Maschine klingt anders    │
│        als bei der Referenzprüfung.  │
│                                      │
│     ┌──────────────────────────┐     │
│     │  ████░░░░░░░░░░░░ 34%   │     │
│     └──────────────────────────┘     │
│                                      │
│   ⚠ Empfehlung: Prüfung vor Ort     │  ← Handlungsempfehlung
│   Trend: ↘ -18% seit letzter Woche  │
│                                      │
│   [Details →]  [Wartung melden →]    │
└──────────────────────────────────────┘
```

### 7.5 Countdown-Timer für Aufnahmen

```
┌──────────────────────────────────────┐
│                                      │
│           ⏱ 7 Sekunden              │  ← Großer Countdown
│                                      │
│   [████████░░░░░░░░░░░░░░] 70%       │  ← Fortschrittsbalken
│                                      │
│   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    │  ← Audiovisualizer (klein)
│   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    │
│                                      │
│   💡 Halten Sie das Gerät nah an     │  ← Kontext-Tipp
│      die Maschine                    │
│                                      │
│   [Abbrechen]                        │
└──────────────────────────────────────┘
```

### 7.6 Nutzerfreundliche Fehlermeldungen

| Technisch (aktuell) | Nutzerfreundlich (vorgeschlagen) |
|---------------------|--------------------------------|
| "Inkompatible Sample Rate" | "Die Aufnahme konnte nicht verglichen werden. Bitte versuchen Sie es erneut." |
| "Ungeeignetes Signal" | "Das aufgenommene Geräusch war zu leise oder zu kurz. Bitte näher an die Maschine halten." |
| "Kein Signal erkannt" | "Kein Maschinengeräusch erkannt. Läuft die Maschine?" |
| "Verarbeitungsfehler" | "Ein Fehler ist aufgetreten. Bitte versuchen Sie es noch einmal." |
| "Datenbank-Fehler" | "Die Daten konnten nicht gespeichert werden. Bitte versuchen Sie es noch einmal." |

### 7.7 Haptisches Feedback

```typescript
// Nach Diagnose-Abschluss
if (healthScore >= 75) {
  navigator.vibrate(200);                    // Kurze Vibration = OK
} else if (healthScore >= 50) {
  navigator.vibrate([200, 100, 200]);        // Doppelt = Achtung
} else {
  navigator.vibrate([200, 100, 200, 100, 200]); // Dreifach = Warnung
}
```

---

## 8. IDEALE USER EXPERIENCE

### Szenario: Servicetechniker Frank, 42, prüft 8 Pumpen in einer Produktionshalle

**06:45 - Ankunft in der Halle**

Frank öffnet Zanobot auf seinem Smartphone. Die App startet sofort (PWA, offline). Auf dem Dashboard sieht er:

> "8 Maschinen · 6 unauffällig · 1 Abweichung · 1 nicht geprüft"

Die Pumpe mit Abweichung ist rot markiert und steht ganz oben.

**06:46 - Erste Prüfung**

Frank geht zur auffälligen Pumpe. Er tippt auf den großen blauen Button "JETZT PRÜFEN" und hält das Smartphone an die Pumpe. Ein Countdown läuft: "10... 9... 8..."

Nach 10 Sekunden vibriert das Smartphone zweimal. Der Screen zeigt:

> ⚠ ABWEICHUNG · 62% · Trend ↘ seit 3 Prüfungen

Darunter: "Empfehlung: Lager prüfen"

Frank tippt "Wartung melden" → Eine Zusammenfassung wird in die Zwischenablage kopiert (für sein Ticketsystem).

**06:48 - Routine-Prüfung per NFC**

Frank geht zur nächsten Pumpe. Am Gehäuse klebt ein NFC-Tag. Er hält sein Smartphone daran. Die App erkennt die Maschine automatisch, startet sofort die Aufnahme.

10 Sekunden später: Kurze Vibration.

> ✅ UNAUFFÄLLIG · 91% · Stabil seit 2 Wochen

Frank geht weiter. Kein Tippen nötig.

**07:00 - Alle Pumpen geprüft**

Frank öffnet die Übersicht. Alle 8 Pumpen auf einen Blick:

```
Pumpe 1  ✅ 94%  ↗
Pumpe 2  ✅ 91%  →
Pumpe 3  ⚠ 62%  ↘  ← Wartung gemeldet
Pumpe 4  ✅ 88%  →
Pumpe 5  ✅ 96%  →
Pumpe 6  ✅ 85%  ↗
Pumpe 7  ✅ 90%  →
Pumpe 8  ✅ 93%  →
```

Er tippt auf "Bericht exportieren" → PDF mit allen Ergebnissen.

**Das ist die perfekte Nutzung:** Maximal 2 Interaktionen pro Maschine, klare Signale, keine Fachbegriffe, sofortige Handlungsempfehlungen.

---

## 9. UX ROADMAP

### Quick Wins (1-2 Sprints, sofort umsetzbar)

| # | Verbesserung | Aufwand | Impact |
|---|-------------|---------|--------|
| QW1 | **Countdown-Timer** in der Aufnahme anzeigen (verbleibende Sekunden + Fortschrittsbalken) | Klein | Hoch |
| QW2 | **Nutzerfreundliche Fehlermeldungen** - technische Texte durch verständliche Sprache ersetzen | Klein | Hoch |
| QW3 | **"Referenz" → "Normalzustand"** in allen Texten umbenennen | Klein | Mittel |
| QW4 | **Haptisches Feedback** (Vibration) bei Diagnose-Abschluss | Klein | Mittel |
| QW5 | **Focus-Theme als Default** setzen - "Zustand prüfen" als primäre Aktion | Klein | Hoch |
| QW6 | **Status-Punkte** (farbige Dots) in der Maschinenliste neben jedem Namen | Klein | Mittel |
| QW7 | **View-Level "Basic"** konsequent: Nur Health Gauge + Status-Text + Empfehlung | Mittel | Hoch |

### Wichtige Verbesserungen (3-5 Sprints)

| # | Verbesserung | Aufwand | Impact |
|---|-------------|---------|--------|
| WV1 | **Dashboard-Screen** mit Maschinenübersicht (alle Status auf einen Blick) | Groß | Sehr hoch |
| WV2 | **Vereinfachter Recording-Flow** - Auto-Entscheidung Referenz vs. Diagnose | Groß | Sehr hoch |
| WV3 | **Dedizierter Verlaufs-Bereich** mit Detail-Ansichten einzelner Diagnosen, Filterung, Trends | Groß | Hoch |
| WV4 | **Ergebnis-Screen Redesign** - Dreistufiges Ampel-Display mit Handlungsempfehlungen | Mittel | Hoch |
| WV5 | **Settings Redesign** - Gruppierung in "Allgemein", "Diagnose", "Daten", "Erweitert" | Mittel | Mittel |
| WV6 | **Gesamtfortschrittsanzeige** bei Quick Compare und Fleet-Check | Mittel | Mittel |
| WV7 | **Retry-Buttons** in Fehlermeldungen + "Hilfe"-Links | Klein | Mittel |

### Strategische Verbesserungen (6+ Sprints)

| # | Verbesserung | Aufwand | Impact |
|---|-------------|---------|--------|
| SV1 | **Bericht-Export** (PDF/CSV) mit allen Diagnoseergebnissen einer Sitzung | Groß | Sehr hoch |
| SV2 | **In-App Fleet-Management** - Flotten erstellen, bearbeiten, Maschinen zuordnen | Sehr groß | Hoch |
| SV3 | **Wartungs-Integration** - "Wartung melden" mit Export für Ticketsysteme | Groß | Hoch |
| SV4 | **Trendanalyse-Engine** - Automatische Verschlechterungserkennung mit Benachrichtigungen | Sehr groß | Sehr hoch |
| SV5 | **Onboarding-Wizard** - Geführte Ersteinrichtung mit interaktivem Tutorial | Mittel | Mittel |
| SV6 | **Offline-Sync-Indikator** + optionale Cloud-Synchronisation | Sehr groß | Hoch |
| SV7 | **Multi-Sensor-Support** - Nicht nur Akustik, auch Vibration (via Smartphone-Accelerometer) | Sehr groß | Strategisch |

---

## Zusammenfassung

Zanobot ist technisch beeindruckend: Edge-only ML, Offline-First, NFC-Integration und eine durchdachte DSP-Pipeline. Die **Kernfunktionalität** (akustische Maschinendiagnose in Sekunden) ist ein starkes Wertversprechen.

Die größten UX-Schwächen liegen in drei Bereichen:

1. **Navigations-Hierarchie:** Der Nutzer sieht zu viele gleichwertige Optionen und weiß nicht, was zuerst zu tun ist. Lösung: Ein klarer primärer CTA + Dashboard.

2. **Fachsprache statt Nutzersprache:** Begriffe wie "Referenz", "GMIA", "Operating Point" setzen technisches Wissen voraus. Lösung: Konsequente Übersetzung in Alltagssprache.

3. **Fehlende Auswertungs-Tiefe:** Diagnosen werden durchgeführt, aber der Nutzer kann Trends und Verläufe nicht einfach analysieren. Lösung: Dashboard + Verlaufs-Bereich + Trendanalyse.

Die empfohlene Reihenfolge: **Quick Wins (QW1-QW7) sofort umsetzen**, dann Dashboard (WV1) und vereinfachten Flow (WV2) als nächste Meilensteine.
