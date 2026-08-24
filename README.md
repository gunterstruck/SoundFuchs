# SoundFuchs – Geräuschvergleich und Geräusch-Briefing

![Local First](https://img.shields.io/badge/Local--First-Audio%20bleibt%20lokal-2ea44f)
![Privacy by Design](https://img.shields.io/badge/Privacy%20by%20Design-kein%20Audio--Upload-blue)
![PWA](https://img.shields.io/badge/PWA-Progressive%20Web%20App-purple)
![MIT License](https://img.shields.io/badge/License-MIT-yellow)
![Version](https://img.shields.io/badge/Version-2.0.0-orange)

**Macht hörbar, was du meinst.**

---

## Überblick

**SoundFuchs 2.0** ist ein datenschutzfreundlicher **Geräusch-Assistent** als Progressive Web App (PWA). Er vergleicht Maschinenakustik, markiert auffällige Hörstellen und bereitet daraus ein kompaktes **Geräusch-Briefing** für Fachpersonen oder eine frei gewählte externe KI auf. Audio, Referenzprofile und Auswertung bleiben im Browser – **ohne Analyse-Backend und ohne Konto**. Die öffentliche PWA wird über Vercel ausgeliefert; Kartenkacheln und das optionale YAMNet-Modell werden bei Nutzung von externen Anbietern geladen. Als Sensor genügt das integrierte Mikrofon des Endgeräts.

SoundFuchs versteht sich bewusst **nicht als Diagnosewerkzeug**. SoundFuchs bereitet auf und übergibt; die fachliche Prüfung und Einordnung erfolgen beim Empfänger.

---

## Features

- **Edge-Only Verarbeitung**: FFT-Analyse, Spektrogramm und Mustervergleich vollständig lokal im Browser.
- **Ähnlichkeits-Score (0–100%)**: Mathematische Ähnlichkeit (Kosinus-Ähnlichkeit) zwischen Referenz- und Vergleichsaufnahme.
- **Vergleich statt Diagnose**: Rein mathematisch-statistischer Mustervergleich – kein Diagnose- oder Klassifikationssystem.
- **Geräusch-Briefing**: Original, markierte Hörstelle, Kontext, Aufnahmequalität und Arbeitsauftrag kompakt zur Weitergabe aufbereitet.
- **Auch ohne Referenz**: Eine Einzelaufnahme wird als ehrlicher Verdachtsfall gebrieft; zwei unbekannte Aufnahmen bleiben ein neutraler A/B-Kontrast.
- **Nutzerdefinierte Schwelle**: Nutzer legen selbst fest, ab welchem Score ein Zustand als „unauffällig" oder „abweichend" gilt.
- **Local First & Privacy by Design**: Kein Audio-Upload; Aufnahmen, Referenzprofile und Scores bleiben lokal. Technische Netzverbindungen für Hosting, Karten und optional YAMNet sind unten transparent aufgeführt.
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

## Architektur (lokale Auswertung)

SoundFuchs setzt für Audio und Auswertung auf eine **lokale Architektur** als Sicherheits- und Datenschutzmerkmal. Die Verarbeitungsschritte finden im Endgerät statt:

1. **Audioaufnahme** über integriertes Mikrofon
2. **FFT & Spektrogramm** zur Feature-Extraktion (WebAudio API)
3. **GMIA-basierte Analyse** (Generalized Mutual Interdependence Analysis) zur Extraktion stabiler Signalanteile
4. **Kosinus-Ähnlichkeit** für den mathematischen Mustervergleich
5. **Visuelles Feedback** über Spektrogramm, Ähnlichkeits-Score und Ampelanzeige

Es gibt **kein Analyse-Backend, kein SoundFuchs-Konto und keine zentrale Messdatenbank**. Alle Audioaufnahmen und Scores werden in der **lokalen IndexedDB** des Geräts gespeichert. Die Webdateien selbst kommen vom Hosting-Anbieter; die optionale Karte und YAMNet benötigen die unten beschriebenen Fremdabrufe.

### Netzwerktransparenz

| Anlass                      | Empfänger                                                           | Übertragener Inhalt                                                      |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Aufruf der öffentlichen PWA | Vercel                                                              | Technische Verbindungsdaten wie IP-Adresse, Zeitpunkt und Browserangaben |
| Öffnen der Karte            | OpenStreetMap, CARTO oder Esri                                      | Technische Verbindungsdaten und angefragter Kartenausschnitt             |
| Erster Einsatz von YAMNet   | Google TensorFlow Hub beziehungsweise dessen Auslieferungsendpunkte | Modellanfrage; kein Audio, Referenzprofil oder Score                     |

SoundFuchs enthält kein eigenes Tracking und lädt keine Messdaten zu diesen Diensten hoch. Ein exportiertes Geräusch-Briefing wird erst dann an Dritte übertragen, wenn der Nutzer es selbst weitergibt.

---

## NFC-basierter Sofortzugang

SoundFuchs unterstützt **NFC-Tags** an Maschinen:

- **Sofortzugang**: Smartphone an den NFC-Tag halten – die PWA öffnet sich direkt im Browser
- **Maschinen-ID**: Automatische Identifikation der Maschine
- **Referenzdaten**: Optional Verweis auf kundenspezifische Referenzdaten (lokal oder im Kundennetzwerk)
- **Local First**: Verknüpfte Referenzdaten können beim ersten Scan aus einer angegebenen Quelle geladen und danach lokal gespeichert werden. Der erste Abruf braucht Netz und ist nur so vertrauenswürdig wie die im NFC-Link gewählte Quelle.

---

## Robustheit über Geräte hinweg (ein Praxisversuch)

SoundFuchs wurde darauf ausgelegt, relative Vergleiche auch zwischen unterschiedlichen Smartphones zu unterstützen – ohne spezielle Gerätekalibrierung oder eigenes Machine-Learning-Training. Die folgenden Werte stammen aus **einem dokumentierten Praxisversuch** und sind kein allgemeiner Genauigkeits- oder Eignungsnachweis.

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

Aus diesem einzelnen Versuch darf weder ein allgemeiner Grenzwert noch eine garantierte Übertragbarkeit auf andere Maschinen, Mikrofone oder Umgebungen abgeleitet werden. Vor einem betrieblichen Einsatz müssen Wiederholbarkeit und Schwellen unter den tatsächlichen Bedingungen geprüft werden.

### Technische Arbeitshypothese

Die eingesetzte **GMIA-Methode** (Generalized Mutual Interdependence Analysis) extrahiert den gemeinsamen, stabilen Anteil mehrerer Zeitfenster:

- **Mikrofon- und Geräteunterschiede** sind meist: glatt, relativ konstant und nicht kohärent über alle Frequenzbänder
- **Maschinengeräusche** (insbesondere tonale/harmonische Systeme) sind: strukturiert, zeitlich stabil und reproduzierbar

Damit soll GMIA einen Teil gerätebedingter Effekte **ohne explizite Device-Adaptation** reduzieren. Wie stark das gelingt, hängt von Maschine, Mikrofon, Abstand, Umgebung und Betriebszustand ab.

### Designentscheidung

SoundFuchs ist bewusst als **relatives Vergleichsinstrument** konzipiert, nicht als kalibriertes Messgerät. Entscheidend sind **Veränderungen und Abweichungen**, nicht absolute Prozentwerte. Gerätebedingte Unterschiede müssen bei der Festlegung und Überprüfung geeigneter Schwellen berücksichtigt werden.

---

## Schnellstart

```bash
npm install
npm run dev
```

**Öffentliche Instanz:** [soundfuchs.vercel.app](https://soundfuchs.vercel.app)

---

## Architektur und technische Abgrenzung

SoundFuchs wurde unabhängig als **privates, nicht-kommerzielles Open-Source-Projekt** unter der **MIT-Lizenz** entwickelt. Die Auswertung basiert auf **offen beschriebenen mathematischen Verfahren** (Frequenzanalyse, Kosinus-Vergleiche) und optional dem vortrainierten offenen **YAMNet** als lokalem Merkmalsextraktor. SoundFuchs bildet lokale Referenzprofile und markiert Abweichungen anhand einstellbarer Schwellen; es trainiert kein eigenes neuronales Netz und leitet keine Schadensursache ab.

**Was SoundFuchs baulich nicht enthält:**

- **Kein Cloud-Upload von Messdaten** – SoundFuchs lädt Aufnahmen, Referenzen und Ergebnisse mit keiner Auswertungsmethode automatisch hoch
- **Keine IoT-Hardware** – ausschließlich das eingebaute Mikrofon, keine Spezialsensorik
- **Kein automatisiertes Diagnosesystem** – keine Klassifikation in Schadensbilder, keine Handlungsempfehlungen
- **Kein Analyse-Backend und kein Konto** – Messdaten werden nicht an einen SoundFuchs-Auswertungsserver übertragen

**Die Voreinstellung rechnet ohne gelerntes Modell.** GMIA vergleicht Spektren
mathematisch; nichts davon ist trainiert, alles läuft offline.

**Eine der vier wählbaren Methoden ist ausdrücklich eine KI-Methode.** In den
Einstellungen (Profi) lässt sich als Auswertungsmethode **YAMNet** wählen. Sie
benutzt ein **vortrainiertes, öffentlich verfügbares Modell von TensorFlow Hub**
als Merkmalsextraktor. Was das für die Aussagen oben bedeutet, gehört genannt:

|                                      |                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Voreingestellt?**                  | Nein. Voreingestellt ist GMIA; YAMNet muss ausdrücklich gewählt werden.                                                                                                                                                                                             |
| **Netzzugriff**                      | Einmalig beim ersten Gebrauch: Das Modell wird von `tfhub.dev` geladen und danach in IndexedDB gespeichert. Spätere Starts laden es von dort; schlägt die lokale Speicherung fehl, weist das Protokoll darauf hin und für den nächsten Start ist erneut Netz nötig. |
| **Was übertragen wird**              | Nur die Anfrage nach dem Modell. **Kein Ton, keine Aufnahme, kein Messwert** — die Auswertung selbst läuft weiterhin ausschließlich auf dem Gerät.                                                                                                                  |
| **Was auf dem Gerät „gelernt" wird** | Kein Modelltraining. Aus der eigenen Aufnahme entsteht eine Sammlung von Merkmalsvektoren, gegen die per Kosinus-Ähnlichkeit (k-NN) verglichen wird. Es werden keine Gewichte angepasst.                                                                            |
| **Klassifikation**                   | Auch hier keine. Das Ergebnis ist ein Ähnlichkeitswert zum eigenen Normalzustand, kein Schadensbild.                                                                                                                                                                |

Wer ohne ein fremdes Modell auswerten will, bleibt bei der Voreinstellung. Nach
dem Laden der PWA kann GMIA ohne den YAMNet-Modellabruf arbeiten; Hosting- und
gegebenenfalls Kartenabrufe sind davon getrennt zu betrachten.

**Zusammenfassung der Architektur:**

- Handelsübliche Mikrofone (keine Spezialhardware)
- Lokale Analyse (Spektrogramm, Ähnlichkeit) – in der Voreinstellung rein mathematisch-statistisch (Level 1)
- Verarbeitung der Messdaten auf dem Gerät; Netzverbindungen entstehen für Hosting, beim Öffnen externer Karten und beim ersten Modellabruf der optionalen YAMNet-Methode

### Relevante IP und technische Abgrenzung

| Referenz / Technik              | Quelle                                   | Geschützter Bereich                                                          | Abgrenzung zu SoundFuchs                                                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Siemens AG** (PAPDEOTT005125) | Defensive Veröffentlichung, 2016         | Cloudbasiertes Diagnosesystem mit zentralen Datenbanken und mobilen Sensoren | SoundFuchs verarbeitet Messdaten lokal, ohne Analyse-Backend, zentrale Messdatenbank oder Diagnose                                                                                                                                       |
| **Siemens AG** (EP3701708B1)    | Europäisches Patent, 2022                | ML-basierte Remote-Diagnose mit trainierten Modellen und Sensorik            | SoundFuchs kennt keine Remote-Diagnose und keine Analyse-Cloud. Die optionale YAMNet-Methode nutzt ein vortrainiertes, öffentliches Modell allein als Merkmalsextraktor auf dem Gerät — sie trainiert nichts und sendet keine Messdaten. |
| **Siemens Corp.** (US9263041B2) | US-Patent, 2016                          | Anwendung von GMIA für Sprach- und Hörsysteme                                | SoundFuchs nutzt GMIA-ähnliche Mathematik ausschließlich für Nicht-Sprache und lokale Vergleiche                                                                                                                                         |
| **Siemens** (US9443201B2)       | US-Patent, 2016                          | Klassifikation und Modelltraining von Sensorsignaturen                       | SoundFuchs erstellt lokale Referenzprofile und Ähnlichkeitswerte, trainiert aber kein eigenes neuronales Netz und leitet keine Schadensursache ab                                                                                        |
| **Schlumberger** (US9602781B2)  | US-Patent, 2017                          | Trennung seismischer Signale mittels GMIA                                    | Unterschiedliche Domäne und Signalart, nicht verwandt                                                                                                                                                                                    |
| **ABB**                         | Öffentliche Industrie-Präsentation, 2015 | Mobile Sensorik zur ad-hoc Diagnose mit Cloud- und Service-Integration       | SoundFuchs vermeidet Diagnose, Service-Workflows und Cloud-Anbindung                                                                                                                                                                     |
| **Prophecy Sensors**            | Industrie                                | Audio-Upload zur Diagnose                                                    | SoundFuchs speichert keine Daten extern                                                                                                                                                                                                  |
| **Fisher-Rosemount**            | Industrie                                | Externe Prozessdaten                                                         | SoundFuchs nutzt ausschließlich das Mikrofon                                                                                                                                                                                             |
| **FPT Software / SoundAI**      | Industrie                                | Trainierte Encoder-Decoder-Modelle mit Server-Training                       | SoundFuchs nutzt ausschließlich mathematisch-statistische Verfahren (Level 1) ohne Modelltraining                                                                                                                                        |
| **GMIA Verfahren**              | Mathematisch                             | Patentierte Cloud-Workflows und Sensor-Fusion-Setups                         | SoundFuchs nutzt den GMIA-Algorithmus als reine, lokale mathematische Implementierung in TypeScript (Open Source)                                                                                                                        |

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

Alle Verarbeitungen der Messdaten erfolgen **auf dem Gerät**. SoundFuchs lädt kein Audio, Referenzprofil oder Ergebnis zu einem eigenen Dienst hoch. Beim Seitenaufruf, beim Öffnen externer Karten und beim ersten Einsatz von YAMNet fallen jedoch technische Verbindungsdaten bei den jeweiligen Anbietern an. Gibt der Nutzer ein erzeugtes Briefing selbst weiter, gelten zusätzlich die Datenschutzbedingungen des gewählten Empfängers.

---

## Metainformationen

- **Version:** 2.0.0 (2026)
- **Entwickelt von:** Günter Struck
- **Lizenz:** [MIT](./LICENSE) – Weitergabe und Anpassung erlaubt, Namensnennung vorausgesetzt. Was die Lizenz nicht regelt (privat, unentgeltlich, kein Support, und wofuer SoundFuchs ausdruecklich nicht gedacht ist), steht in [NOTICE](./NOTICE).
- **Technologie-Stack:** TypeScript, Vite, Web Audio API, WebAssembly
- **Öffentliche Instanz:** [soundfuchs.vercel.app](https://soundfuchs.vercel.app)

---

**Leitgedanke:** _Hört sich die Maschine normal an?_
