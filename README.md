# SoundFuchs – Geräuschvergleich und Geräusch-Briefing

![Local First](https://img.shields.io/badge/Local--First-100%25%20Browser-2ea44f)
![Privacy by Design](https://img.shields.io/badge/Privacy%20by%20Design-Edge--Only-blue)
![PWA](https://img.shields.io/badge/PWA-Progressive%20Web%20App-purple)
![MIT License](https://img.shields.io/badge/License-MIT-yellow)
![Version](https://img.shields.io/badge/Version-2.0.0-orange)

**Macht hörbar, was du meinst.**

---

## Überblick

**SoundFuchs 2.0** ist ein datenschutzfreundlicher **Geräusch-Assistent** als Progressive Web App (PWA). Er vergleicht Maschinenakustik, markiert auffällige Hörstellen und bereitet daraus ein kompaktes **Geräusch-Briefing** für Fachpersonen oder eine frei gewählte externe KI auf. Die Signalverarbeitung läuft vollständig lokal im Browser – **ohne Cloud, ohne Backend und ohne Konto**. Als Sensor genügt das integrierte Mikrofon des Endgeräts.

SoundFuchs versteht sich bewusst **nicht als Diagnosewerkzeug**. SoundFuchs bereitet auf und übergibt; die fachliche Prüfung und Einordnung erfolgen beim Empfänger.

---

## Features

- **Edge-Only Verarbeitung**: FFT-Analyse, Spektrogramm und Mustervergleich vollständig lokal im Browser.
- **Ähnlichkeits-Score (0–100%)**: Mathematische Ähnlichkeit (Kosinus-Ähnlichkeit) zwischen Referenz- und Vergleichsaufnahme.
- **Vergleich statt Diagnose**: Rein mathematisch-statistischer Mustervergleich – kein Diagnose- oder Klassifikationssystem.
- **Geräusch-Briefing**: Original, markierte Hörstelle, Kontext, Aufnahmequalität und Arbeitsauftrag kompakt zur Weitergabe aufbereitet.
- **Auch ohne Referenz**: Eine Einzelaufnahme wird als ehrlicher Verdachtsfall gebrieft; zwei unbekannte Aufnahmen bleiben ein neutraler A/B-Kontrast.
- **Nutzerdefinierte Schwelle**: Nutzer legen selbst fest, ab welchem Score ein Zustand als „unauffällig" oder „abweichend" gilt.
- **Local First & Privacy by Design**: Keine Datenübertragung, kein Upload, keine Cloud-Komponenten.
- **Sensorik-Minimalismus**: Keine externen Sensoren, keine IoT-Hardware, keine Zusatzgeräte.
- **PWA-Workflow**: Läuft im Browser auf Smartphone oder Desktop, installierbar als PWA – kein App Store erforderlich.
- **NFC-Sofortzugang**: NFC-Tags an Maschinen ermöglichen direkten App-Start und optionalen Kontextbezug.

---

## Anwendungsfälle

### Serieller Vergleich (Zeitlicher Trend)

Vergleich einer aktuellen Aufnahme mit einer zuvor erstellten Referenz **derselben Maschine**. Veränderungen des akustischen Musters werden über die Zeit sichtbar – z. B. ob sich das Betriebsgeräusch seit der letzten Aufnahme verändert hat.

### Paralleler Vergleich (Flotten-Check)

Vergleich mehrerer **baugleicher Maschinen** unter ähnlichen Betriebsbedingungen. Akustische Ausreißer innerhalb einer Gruppe werden identifiziert – auch **ohne historische Referenz**, da die Gruppe selbst als Vergleichsbasis dient.

> **Hinweis:** SoundFuchs zeigt ausschließlich **ob und wie stark** sich Geräusche unterscheiden. Die Interpretation, ob eine Abweichung relevant ist, liegt beim Nutzer.

---

## Architektur (Edge-Only)

SoundFuchs setzt auf eine **Edge-Only Architektur** als Sicherheits- und Datenschutzmerkmal. Alle Verarbeitungsschritte finden im Endgerät statt:

1. **Audioaufnahme** über integriertes Mikrofon
2. **FFT & Spektrogramm** zur Feature-Extraktion (WebAudio API)
3. **GMIA-basierte Analyse** (Generalized Mutual Interdependence Analysis) zur Extraktion stabiler Signalanteile
4. **Kosinus-Ähnlichkeit** für den mathematischen Mustervergleich
5. **Visuelles Feedback** über Spektrogramm, Ähnlichkeits-Score und Ampelanzeige

Es gibt **keine Cloud-Services**, **keinen Backend-Server** und **keine Datenbankanbindung**. Alle Audioaufnahmen und Scores werden ausschließlich in der **lokalen IndexedDB** des Geräts gespeichert.

---

## NFC-basierter Sofortzugang

SoundFuchs unterstützt **NFC-Tags** an Maschinen:

- **Sofortzugang**: Smartphone an den NFC-Tag halten – die PWA öffnet sich direkt im Browser
- **Maschinen-ID**: Automatische Identifikation der Maschine
- **Referenzdaten**: Optional Verweis auf kundenspezifische Referenzdaten (lokal oder im Kundennetzwerk)
- **Kein Cloud-Bezug**: Referenzdaten werden beim ersten Scan heruntergeladen und danach lokal gespeichert – alle weiteren Vergleiche erfolgen offline

---

## Robustheit über Geräte hinweg (Praxis-Test)

SoundFuchs wurde darauf ausgelegt, auch auf unterschiedlichen Smartphones zuverlässig zu funktionieren – ohne spezielle Gerätekalibrierung oder Machine-Learning-Training.

### Getestetes Szenario

- Referenzaufnahme auf **Gerät A**
- Export der Datenbank
- Import auf:
  - ein anderes **Samsung-Smartphone**
  - ein **iOS-Gerät**
- Testobjekt: **50 Hz Frequenzumrichter mit Elektromotor**

### Ergebnisse

| Vergleichsart          | Ähnlichkeit |
| ---------------------- | ----------- |
| Same-Device Vergleich  | ca. 95–97 % |
| Cross-Device Vergleich | ca. 93–94 % |

Der Verlust von lediglich **1–3 Prozentpunkten** beim Gerätewechsel ist in der Audioanalyse üblich und praktisch unkritisch. In vergleichbaren Bereichen (z. B. Speaker Recognition, Acoustic Monitoring) gelten **>90 % ohne Domain-Adaptation** bereits als sehr stabil.

### Warum das funktioniert

Die eingesetzte **GMIA-Methode** (Generalized Mutual Interdependence Analysis) extrahiert den gemeinsamen, stabilen Anteil mehrerer Zeitfenster:

- **Mikrofon- und Geräteunterschiede** sind meist: glatt, relativ konstant und nicht kohärent über alle Frequenzbänder
- **Maschinengeräusche** (insbesondere tonale/harmonische Systeme) sind: strukturiert, zeitlich stabil und reproduzierbar

Dadurch unterdrückt GMIA einen Großteil gerätebedingter Effekte **ohne explizite Device-Adaptation**.

### Designentscheidung

SoundFuchs ist bewusst als **relatives Vergleichsinstrument** konzipiert, nicht als kalibriertes Messgerät. Entscheidend sind **Veränderungen und Abweichungen**, nicht absolute Prozentwerte. Kleine gerätebedingte Unterschiede sind normal und werden in der Praxis durch geeignete Schwellen berücksichtigt.

---

## Schnellstart

```bash
npm install
npm run dev
```

**Öffentliche Instanz:** [soundfuchs.vercel.app](https://soundfuchs.vercel.app)

---

## Architektur und technische Abgrenzung

SoundFuchs wurde unabhängig als **privates, nicht-kommerzielles Open-Source-Projekt** unter der **MIT-Lizenz** entwickelt. Die Auswertung im Auslieferungszustand basiert auf **offen beschriebenen mathematischen Verfahren** (Frequenzanalyse, GMIA-ähnliche Kosinus-Vergleiche) und integriert **keine patentierte Systemlogik** und **keine Klassifikationsmechanismen**.

**Was SoundFuchs baulich nicht enthält:**

- **Kein Cloud-Upload von Messdaten** – Aufnahmen, Referenzen und Ergebnisse verlassen das Gerät nie, mit keiner Auswertungsmethode
- **Keine IoT-Hardware** – ausschließlich das eingebaute Mikrofon, keine Spezialsensorik
- **Kein automatisiertes Diagnosesystem** – keine Klassifikation in Schadensbilder, keine Handlungsempfehlungen
- **Kein Backend und kein Konto** – es gibt keinen Server, an den etwas ginge

**Die Voreinstellung rechnet ohne gelerntes Modell.** GMIA vergleicht Spektren
mathematisch; nichts davon ist trainiert, alles läuft offline.

**Eine der vier wählbaren Methoden ist ausdrücklich eine KI-Methode.** In den
Einstellungen (Profi) lässt sich als Auswertungsmethode **YAMNet** wählen. Sie
benutzt ein **vortrainiertes, öffentlich verfügbares Modell von TensorFlow Hub**
als Merkmalsextraktor. Was das für die Aussagen oben bedeutet, gehört genannt:

| | |
| --- | --- |
| **Voreingestellt?** | Nein. Voreingestellt ist GMIA; YAMNet muss ausdrücklich gewählt werden. |
| **Netzzugriff** | Einmalig beim ersten Gebrauch: Das Modell wird von `tfhub.dev` geladen und danach im Browser-Cache gehalten. Ab dann offline. |
| **Was übertragen wird** | Nur die Anfrage nach dem Modell. **Kein Ton, keine Aufnahme, kein Messwert** — die Auswertung selbst läuft weiterhin ausschließlich auf dem Gerät. |
| **Was auf dem Gerät „gelernt" wird** | Kein Modelltraining. Aus der eigenen Aufnahme entsteht eine Sammlung von Merkmalsvektoren, gegen die per Kosinus-Ähnlichkeit (k-NN) verglichen wird. Es werden keine Gewichte angepasst. |
| **Klassifikation** | Auch hier keine. Das Ergebnis ist ein Ähnlichkeitswert zum eigenen Normalzustand, kein Schadensbild. |

Wer die Aussage „vollständig offline, kein fremdes Modell" ohne Einschränkung
braucht, bleibt bei der Voreinstellung — sie ist genau das.

**Zusammenfassung der Architektur:**

- Handelsübliche Mikrofone (keine Spezialhardware)
- Lokale Analyse (Spektrogramm, Ähnlichkeit) – in der Voreinstellung rein mathematisch-statistisch (Level 1)
- Verarbeitung der Messdaten ausschließlich auf dem Gerät; der einzige mögliche Netzzugriff ist der einmalige Modell-Download der optionalen YAMNet-Methode

### Relevante IP und technische Abgrenzung

| Referenz / Technik              | Quelle                                   | Geschützter Bereich                                                          | Abgrenzung zu SoundFuchs                                                                                          |
| ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Siemens AG** (PAPDEOTT005125) | Defensive Veröffentlichung, 2016         | Cloudbasiertes Diagnosesystem mit zentralen Datenbanken und mobilen Sensoren | SoundFuchs arbeitet vollständig lokal, ohne Cloud, ohne zentrale Datenbank, ohne Diagnose                         |
| **Siemens AG** (EP3701708B1)    | Europäisches Patent, 2022                | ML-basierte Remote-Diagnose mit trainierten Modellen und Sensorik            | SoundFuchs kennt keine Remote-Diagnose: keine Cloud, keine eingebettete Diagnose-Logik, keine Klassifikation in Schadensbilder. Die optionale YAMNet-Methode nutzt ein vortrainiertes, öffentliches Modell allein als Merkmalsextraktor auf dem Gerät — sie trainiert nichts und sendet keine Messdaten. |
| **Siemens Corp.** (US9263041B2) | US-Patent, 2016                          | Anwendung von GMIA für Sprach- und Hörsysteme                                | SoundFuchs nutzt GMIA-ähnliche Mathematik ausschließlich für Nicht-Sprache und lokale Vergleiche                  |
| **Siemens** (US9443201B2)       | US-Patent, 2016                          | Klassifikation und Modelltraining von Sensorsignaturen                       | SoundFuchs führt keine Klassifikation und kein Modelltraining durch                                               |
| **Schlumberger** (US9602781B2)  | US-Patent, 2017                          | Trennung seismischer Signale mittels GMIA                                    | Unterschiedliche Domäne und Signalart, nicht verwandt                                                             |
| **ABB**                         | Öffentliche Industrie-Präsentation, 2015 | Mobile Sensorik zur ad-hoc Diagnose mit Cloud- und Service-Integration       | SoundFuchs vermeidet Diagnose, Service-Workflows und Cloud-Anbindung                                              |
| **Prophecy Sensors**            | Industrie                                | Audio-Upload zur Diagnose                                                    | SoundFuchs speichert keine Daten extern                                                                           |
| **Fisher-Rosemount**            | Industrie                                | Externe Prozessdaten                                                         | SoundFuchs nutzt ausschließlich das Mikrofon                                                                      |
| **FPT Software / SoundAI**      | Industrie                                | Trainierte Encoder-Decoder-Modelle mit Server-Training                       | SoundFuchs nutzt ausschließlich mathematisch-statistische Verfahren (Level 1) ohne Modelltraining                 |
| **GMIA Verfahren**              | Mathematisch                             | Patentierte Cloud-Workflows und Sensor-Fusion-Setups                         | SoundFuchs nutzt den GMIA-Algorithmus als reine, lokale mathematische Implementierung in TypeScript (Open Source) |

Die Tabelle beschreibt, wie sich SoundFuchs technisch von den genannten Verfahren unterscheidet. Sie ist eine Darstellung der eigenen Bauweise und **keine schutzrechtliche Bewertung** – eine solche kann und will dieses Projekt nicht abgeben.

---

## Haftungsausschluss & Nutzungsgrenzen

SoundFuchs ist **kein medizinisches Gerät** und **kein technisches Diagnosesystem**. Die Anwendung ist ein **visuelles Vergleichswerkzeug** für Audiosignale.

**SoundFuchs führt explizit nicht durch:**

- **Keine Diagnose** von Schäden oder Ursachen
- **Keine Zustandsklassifikation** oder Fehlerursachenanalyse
- **Keine Wartungsempfehlungen** oder Handlungsanweisungen
- **Keine automatisierte Klassifikation** von Fehlern
- **Keine Reparaturempfehlungen**

Die Ergebnisse dienen ausschließlich der **musterbasierten Visualisierung** von Ähnlichkeiten und Abweichungen. Die **Interpretationshoheit** liegt stets beim Nutzer.

Alle Verarbeitungen der Messdaten erfolgen **auf dem Gerät**. Es werden **keine Nutzerdaten übertragen, extern gespeichert oder ausgewertet**. Der einzige mögliche Netzzugriff der Auswertung ist der einmalige Download des YAMNet-Modells, wenn diese Methode ausdrücklich gewählt wird — dabei geht eine Anfrage nach dem Modell hinaus, sonst nichts.

---

## Metainformationen

- **Version:** 2.0.0 (2026)
- **Entwickelt von:** Günter Struck
- **Lizenz:** [MIT](./LICENSE) – Weitergabe und Anpassung erlaubt, Namensnennung vorausgesetzt. Was die Lizenz nicht regelt (privat, unentgeltlich, kein Support, und wofuer SoundFuchs ausdruecklich nicht gedacht ist), steht in [NOTICE](./NOTICE).
- **Technologie-Stack:** TypeScript, Vite, Web Audio API, WebAssembly
- **Öffentliche Instanz:** [soundfuchs.vercel.app](https://soundfuchs.vercel.app)

---

**Leitgedanke:** _Hört sich die Maschine normal an?_
