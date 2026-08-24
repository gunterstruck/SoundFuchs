# Über SoundFuchs

**Geräusch-Assistent – macht hörbar, was du meinst**

---

## Einleitung

**SoundFuchs 2.0** ist eine datenschutzfreundliche Progressive Web App (PWA) für den akustischen Vergleich. Die Anwendung nimmt Maschinengeräusche lokal auf, vergleicht sie auf dem Gerät und bereitet sie als **Geräusch-Briefing** für Fachpersonen oder eine externe KI auf – ohne SoundFuchs-Analyse-Backend, Konto oder externe Sensoren. Die öffentliche PWA wird über Vercel ausgeliefert; Kartenkacheln und das optionale YAMNet-Modell werden bei Nutzung von externen Anbietern geladen.

SoundFuchs versteht sich bewusst **nicht als Diagnosewerkzeug**. Es macht auffällige Hörstellen nachvollziehbar und stellt Original, Hörhilfe, Kontext und technische Grenzen kompakt zusammen. Die fachliche Prüfung und Einordnung bleiben beim Empfänger.

---

## Kernfunktionen

- **Offline-First:** Aufnahmen und akustische Berechnungen erfolgen lokal im Browser. Hosting, externe Karten und der erste optionale YAMNet-Abruf benötigen Netz.
- **Ähnlichkeits-Score (0–100%):** SoundFuchs berechnet eine mathematische Ähnlichkeit (Kosinus-Ähnlichkeit) zwischen Referenz- und Vergleichsaufnahme.
- **Nutzerdefinierte Schwelle:** Nutzer legen selbst fest, ab welchem Score ein Zustand als „unauffällig" oder „abweichend" gilt.
- **Visuelles Spektrum-Feedback:** Echtzeit-Darstellung von Frequenzspektrum und Vergleichsergebnis.
- **Lokale Datenspeicherung:** Alle Audioaufnahmen und Scores werden ausschließlich in der lokalen IndexedDB des Geräts gespeichert.
- **Geräusch-Briefing:** Aufnahmen, markierte Hörstellen, Kontext und Arbeitsauftrag werden lokal zur bewussten Weitergabe aufbereitet.

---

## Anwendungsfälle

SoundFuchs ermöglicht zwei grundlegende Vergleichsszenarien, die sich in ihrer zeitlichen und räumlichen Struktur unterscheiden:

### a) Serieller Vergleich (Zeitlicher Vergleich / Trend)

**Prinzip:**
Vergleich einer aktuellen Aufnahme mit einer zuvor erstellten Referenz **derselben Maschine**.

**Ziel:**
Veränderungen des akustischen Musters über die Zeit sichtbar machen.

**Anwendung:**

- Eine Referenzaufnahme wird zu einem Zeitpunkt erstellt, an dem die Maschine als „unauffällig" bewertet wird
- Spätere Aufnahmen werden mit dieser Referenz verglichen
- Abweichungen vom ursprünglichen Muster werden quantifiziert (Ähnlichkeits-Score)

**Hinweis:**
SoundFuchs zeigt lediglich **ob und wie stark** sich das aktuelle Geräusch von der Referenz unterscheidet. Die Interpretation, ob eine Abweichung relevant ist, erfolgt durch den Nutzer. Das System trifft keine Diagnose und gibt keine Prognose ab.

---

### b) Paralleler Vergleich (Vergleich baugleicher Maschinen / Flotten-Check)

**Prinzip:**
Vergleich mehrerer baugleicher Maschinen unter ähnlichen Betriebsbedingungen.

**Ziel:**
Identifikation akustischer Ausreißer innerhalb einer Gruppe baugleicher Anlagen.

**Anwendung:**

- Aufnahmen von mehreren baugleichen Maschinen (z. B. in einer Produktionshalle) werden erstellt
- SoundFuchs berechnet die akustische Ähnlichkeit zwischen den Maschinen
- Maschinen, deren Geräuschsignatur deutlich von der Gruppe abweicht, werden sichtbar

**Besonderheit:**
Funktioniert **auch ohne historische Referenz**. Die Vergleichsbasis bildet die Gruppe selbst.

**Hinweis:**
SoundFuchs entscheidet nicht, welche Maschine defekt ist oder welche den „Sollzustand" darstellt. Es zeigt ausschließlich **relative Abweichungen** innerhalb der Gruppe. Die Bewertung, ob eine abweichende Maschine weiter untersucht werden sollte, liegt beim Nutzer.

---

## NFC-basierter Sofortzugang und kontextbasierter Vergleich

SoundFuchs unterstützt den **Einsatz von NFC-Tags** an Maschinen, um den Zugang zur App zu vereinfachen und optional einen maschinenspezifischen Kontext bereitzustellen.

### Funktionsweise

**NFC-Tag an der Maschine:**
Ein am Gehäuse oder an der Zugangsstelle platzierter NFC-Tag kann folgende Informationen enthalten:

- URL zur SoundFuchs-PWA (direkter App-Start im Browser)
- Maschinen-ID zur automatischen Identifikation
- Optional: Verweis auf kundenspezifische Referenzdaten (URL zu einer JSON-Datei)

**Sofortzugang ohne Installation:**

- Der Nutzer hält das Smartphone an den NFC-Tag
- Die SoundFuchs-PWA öffnet sich direkt im Browser (kein App Store, keine Registrierung erforderlich)
- Optional: Die hinterlegte Maschinen-ID wird automatisch geladen

### Optionale kontextbasierte Referenzdaten

Der NFC-Tag kann zusätzlich eine **URL zu einer Referenzdatenbank** enthalten. Diese Datenbank wird vom Maschinenbetreiber oder Servicepartner bereitgestellt und kann beinhalten:

- **Referenzaufnahmen** für verschiedene Betriebszustände der Maschine
- **Maschinenspezifische Metadaten** (z. B. Typ, Baujahr, Standort)
- **Vergleichsparameter** für Flotten-Checks baugleicher Maschinen

### Vorteil für neue oder externe Nutzer

Ein Servicetechniker oder Bediener, der die Maschine zum ersten Mal prüft, kann:

- **Sofort eine akustische Prüfung durchführen**, ohne selbst eine Referenz aufnehmen zu müssen
- **Direkt gegen vorhandene Referenzdaten vergleichen**, die vom Betreiber bereitgestellt wurden
- **Ohne Vorwissen** eine erste Einschätzung treffen, ob das aktuelle Geräusch von der hinterlegten Referenz abweicht

### Datenhaltung und Datenschutz

**Wichtig:**
Die Referenzdaten liegen **nicht in einer Cloud von SoundFuchs**. Sie werden bereitgestellt:

- Im **lokalen Netzwerk** des Betreibers (z. B. Intranet-Server)
- In einer **kundeneigenen Umgebung** (z. B. GitHub Pages, eigener Webserver)
- Als **statische JSON-Datei**, die über eine HTTPS-URL abrufbar ist

Die Referenzdatenbank wird beim ersten NFC-Scan von der im Tag angegebenen Quelle heruntergeladen und anschließend **lokal im Gerät** gespeichert (IndexedDB). Weitere Vergleiche können danach ohne erneuten Referenzabruf erfolgen.

### Fokus und Abgrenzung

Der NFC-basierte Zugang dient ausschließlich der **Zugänglichkeit und Vergleichbarkeit**. Er ermöglicht:

- Schnellen Einstieg ohne manuelle Konfiguration
- Nutzung vorhandener Referenzdaten ohne eigene Aufnahme
- Konsistente Vergleichsbasis bei mehreren Nutzern oder Standorten

**SoundFuchs führt auch bei Nutzung von NFC-basierten Referenzdaten:**

- **Keine Diagnose** durch (keine Aussage über Schadensursache oder Zustand)
- **Keine Automatisierung** von Entscheidungen (kein „Gut/Schlecht"-Urteil)
- **Keine Cloud-basierte Auswertung** (alle Berechnungen erfolgen lokal)

Die Interpretation der Vergleichsergebnisse liegt stets beim Nutzer.

---

## Technische Abgrenzung

SoundFuchs wurde unabhängig als **privates, nicht-kommerzielles Open-Source-Projekt** unter der **MIT-Lizenz** entwickelt. Die Funktionalität basiert auf **offen beschriebenen mathematischen Verfahren** (z. B. Frequenzanalyse und GMIA-ähnliche Kosinus-Vergleiche) sowie optional einem vortrainierten YAMNet-Merkmalsextraktor. Diese Beschreibung der eigenen Bauweise ist keine schutzrechtliche Bewertung.

### Relevante IP und technische Abgrenzung

| Referenz / Titel                                             | Quelle & Status                               | Geschützter Bereich                                                          | Abgrenzung von SoundFuchs                                                                              |
| ------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **PAPDEOTT005125**<br>_Verfahren zur Diagnose von Maschinen_ | Defensive Veröffentlichung, Siemens AG, 2016  | Cloudbasiertes Diagnosesystem mit zentralen Datenbanken und mobilen Sensoren | SoundFuchs verarbeitet Messdaten lokal, ohne Analyse-Backend, zentrale Messdatenbank oder Diagnose     |
| **EP3701708B1**<br>_Remote machine condition analysis_       | Europäisches Patent, Siemens AG, 2022         | ML-basierte Remote-Diagnose mit trainierten Modellen und Sensorik            | SoundFuchs nutzt keine Remote-Diagnose; YAMNet dient optional nur als lokaler Merkmalsextraktor        |
| **US9263041B2**<br>_Channel detection in noise using GMIA_   | Siemens Corp., 2016                           | Anwendung von GMIA für Sprach- und Hörsysteme                                | SoundFuchs nutzt GMIA-ähnliche Mathematik ausschließlich für Nicht-Sprache und lokale Vergleiche       |
| **US9443201B2**<br>_Learning of sensor signatures_           | Siemens, 2016                                 | Klassifikation und Modelltraining von Sensorsignaturen                       | SoundFuchs nutzt lokale Referenzmodelle für Vergleiche, nicht für eine automatische Diagnose           |
| **US9602781B2**<br>_Seismic signal deblending (GMIA)_        | Schlumberger, 2017                            | Trennung seismischer Signale mittels GMIA                                    | Unterschiedliche Domäne und Signalart, nicht verwandt                                                  |
| **ABB – Integration of Mobile Measurement**                  | Öffentliche Industrie-Präsentation, ABB, 2015 | Mobile Sensorik zur ad-hoc Diagnose mit Cloud- und Service-Integration       | SoundFuchs vermeidet Diagnose und Service-Workflows und fokussiert sich auf lokalen Messdatenvergleich |

---

## Transparenz und Intention

SoundFuchs ist **kein Diagnosewerkzeug** und trifft **keine automatisierten technischen Bewertungen**. Es stellt eine **visuelle und mathematische Vergleichshilfe** sowie ein weitergebbares **Geräusch-Briefing** bereit.

**SoundFuchs führt explizit nicht durch:**

- Keine Zustandsklassifikation
- Keine Fehlerursachenanalyse
- Keine Reparaturempfehlungen

Messdaten werden **auf dem Gerät verarbeitet** und von SoundFuchs nicht zu einem Analyse-Dienst hochgeladen. Technische Verbindungsdaten entstehen beim Hosting über Vercel, beim Öffnen externer Karten und beim ersten Einsatz des optionalen YAMNet-Modells. Ein Geräusch-Briefing verlässt das Gerät nur, wenn der Nutzer es selbst weitergibt.

Diese Transparenz ist Ausdruck eines bewussten Umgangs mit Verantwortung, Datenschutz und Rechten Dritter.

---

## Leitgedanke

**Hört sich die Maschine normal an?**

Smartphones hören Maschinenklänge.

---

## Metainformationen

- **Version:** 2.0.0 (2026)
- **Entwickelt von:** Günter Struck
- **Lizenz:** MIT
- **Technologie-Stack:** TypeScript, Vite, Web Audio API
- **Öffentliche Instanz:** https://soundfuchs.vercel.app
