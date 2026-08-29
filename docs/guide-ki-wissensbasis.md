# SoundFuchs - Wissensbasis für den Guided Agent

**Version 2.0 · Stand: 29.08.2026 · App-Version: 2.0.0**

**Zweck:** Verbindliche Produkt-, Bedien-, Schulungs- und Supportgrundlage für
einen SoundFuchs Guided Agent. Der aktuelle App-Code und die sichtbaren
Beschriftungen haben Vorrang vor älteren Konzeptpapieren.

**Produktversprechen:** **Macht hörbar, was du meinst.**

**Klickpfad-Konvention:** `Ansicht -> Bereich -> Aktion`. Auf dem Smartphone
liegt die Karte im Hintergrund; das Blatt wird am Griff auf- oder eingeklappt.

---

## 1. Das große Bild

SoundFuchs ist eine lokal-first Progressive Web App für den akustischen
Vergleich von Maschinen und anderen technischen Geräuschen. Die App beantwortet
nicht „Welcher Schaden ist das?“, sondern drei engere und überprüfbare Fragen:

1. **Klingt diese Maschine heute ähnlich wie ihr eigener Normalzustand?**
2. **Wo liegt der hör- und sichtbare Unterschied?**
3. **Wie kann ich die Beobachtung sauber an eine Fachperson oder externe KI
   übergeben?**

Der verteidigbare Kern ist ein **Änderungsdetektor mit lokalem Gedächtnis** für
eine bestimmte Maschine. SoundFuchs berechnet lokal Spektralmerkmale, bildet
mit GMIA einen stabilen Normalzustand und vergleicht spätere Aufnahmen
mathematisch damit.

### 1.1 Was SoundFuchs ist

- lokales Vergleichswerkzeug für Audiosignale
- persönliches Archiv aus Standorten, Maschinen, Normalzuständen und Prüfungen
- Hör- und Visualisierungshilfe mit 2D-, 3D- und Spektrogrammansichten
- Ersteller eines lokalen Geräusch-Briefings
- installierbare PWA ohne SoundFuchs-Konto und Analyse-Backend

### 1.2 Was SoundFuchs ausdrücklich nicht ist

- kein technisches oder medizinisches Diagnosesystem
- keine Fehlerursachenklassifikation
- keine Reparatur-, Wartungs- oder Sicherheitsentscheidung
- kein kalibriertes Messgerät
- keine zentrale Flotten-Cloud
- kein Ersatz für Fachprüfung, Gefährdungsbeurteilung oder Herstellervorgaben

**Antwortregel:** Nie aus einem Score eine Ursache ableiten. Statt „Lagerschaden“
schreiben: „Die Messung klingt anders als der gespeicherte Normalzustand.“

### 1.3 Warum nicht einfach einen Film an eine KI schicken?

Für eine einmalige offene Frage kann eine externe KI der kürzere Weg sein.
SoundFuchs besitzt seinen Mehrwert dort, wo vorher ein gesunder Zustand derselben
Maschine aufgenommen wurde: gleiche Maschine, wiederholbarer Rechenweg,
lokaler Verlauf und ein strukturiertes Briefing. Ohne Normalzustand bleibt
SoundFuchs bewusst bei einer neutralen Einzelaufnahme und behauptet keine
Abweichungs-Prozentzahl.

---

## 2. Architektur und Datenmodell

### 2.1 Lokal-first

Audio, Referenzmodelle, Prüfungen, Standorte und Einstellungen liegen im Browser
des jeweiligen Geräts, überwiegend in IndexedDB beziehungsweise localStorage.
Es gibt kein SoundFuchs-Benutzerkonto und keine automatische Synchronisation.

Folgen:

- Ein anderes Gerät kennt die Daten nicht automatisch.
- Browserdaten löschen kann SoundFuchs-Daten entfernen.
- Vor Gerätewechsel oder Bereinigung sollte die Datenbank exportiert werden.
- Ein privates Browserfenster kann Speicherfunktionen einschränken.

### 2.2 Hierarchie

`Standort -> Maschine -> Normalzustand -> Prüfungen`

- Ein Standort kann mehrere Maschinen enthalten.
- Eine Maschine gehört optional zu einem Standort.
- Eine neue Maschine erhält für den aktuellen Produktweg einen lokalen
  GMIA-Normalzustand.
- Prüfungen bleiben im Verlauf der Maschine.
- Flottengruppen verbinden baugleiche Maschinen für Reihenvergleiche.

### 2.3 Netzverbindungen transparent erklären

| Aktion | Empfänger | Inhalt |
|---|---|---|
| PWA öffnen/aktualisieren | Vercel | technische Verbindungsdaten und App-Dateien |
| Karte anzeigen | gewählter Kartenanbieter | technischer Abruf des Kartenausschnitts |
| externer Referenz-Link/NFC-Import | vom Link bestimmter Anbieter | angeforderte Datei und technische Verbindungsdaten |
| altes/importiertes YAMNet-Modell verwenden | TensorFlow-Hub-Auslieferung | Modellabruf, kein Audio und kein Score |
| Geräusch-Briefing weitergeben | gewählte Fachperson oder KI | nur durch bewusste Übergabe des Nutzers |

SoundFuchs enthält kein eigenes Tracking und lädt Audio nicht zu einem
SoundFuchs-Analysedienst hoch.

---

## 3. Basis und Profi

### 3.1 Basis

Basis ist der ruhige Alltagsweg und kein Spiel- oder Anfängermodus. Sichtbar
bleiben die Aufgaben, die für Anlegen, Normalzustand, Prüfung, Verlauf,
Geräusch-Briefing und Karte benötigt werden.

### 3.2 Profi

Profi ergänzt Spezial- und Verwaltungswerkzeuge, zum Beispiel mehr Details,
Flotten-/Reihenfunktionen, erweiterte Einstellungen, Datenwege sowie die Wahl
des Auswertungswerkzeugs. Profi ändert nicht die fachliche Grenze: Auch dort
stellt SoundFuchs keine Diagnose.

### 3.3 Wechsel

**Klickpfad:** `Einstellungen & mehr -> Ansicht: Basis oder Profi`.

Die Ansicht wird lokal gemerkt. Wenn ein erwarteter Spezialbereich fehlt, zuerst
prüfen, ob Basis aktiv ist.

---

## 4. Orientierung in der Oberfläche

### 4.1 Kopfzeile

- Menü
- Fuchsmarke
- lokale Suche nach Standort, Maschine oder PLZ
- Info-/Einstellungszugang

### 4.2 Karte und Blatt

Die Karte ist der räumliche Grund. Das Blatt enthält je nach Zustand Standorte,
Filter, Nähe, Maschinenarbeit oder Ergebnisse. Auf dem Smartphone:

- Griff antippen oder ziehen: Blatt öffnen/schließen
- `Zur Karte`: aus Standort oder Maschine zurück
- `Zur Maschine` beziehungsweise `Zum Standort`: eine Ebene zurück

### 4.3 Zwei Hauptaktionen auf der Karte

- **Erkennen:** Mikrofonaufnahme mit lokal bekannten Normalzuständen abgleichen
- **Import:** Tonspur aus einer vorhandenen Audio- oder Videodatei übernehmen

„Erkennen“ bedeutet nicht Schaden erkennen. „Import“ bedeutet nicht
Datenbankimport, sondern eine vorhandene Geräuschaufnahme mitbringen.

### 4.4 Einstellungen & mehr

Das Blatt gruppiert die Wege:

- **Entdecken:** Mini-Schulungen
- **Prüfen:** Aufnahme & Analyse, Raum & Störgeräusche,
  Auswertungswerkzeug
- **Maschinen:** NFC & QR, Standorte/Import, Datensicherung, Standortkarte
- **App:** Ansicht, Über SoundFuchs, Datenschutz, Impressum

---

## 5. Erststart und Beispieldaten

Ohne Standorte zeigt die Karte einen ruhigen Einstieg:

- **Erste Maschine anlegen**
- **Nur Standort anlegen**
- **Beispieldaten laden**

Beispieldaten sind gekennzeichnet und können wieder entfernt werden. Sie
enthalten erfundene Standorte und Maschinen ohne echte Referenzen.

**Empfehlung für Schulung:** Statt echter Daten die fünf Mini-Schulungen nutzen.
Sie erzeugen temporäre Maschinen und synthetische Töne, berühren vorhandene
Daten nicht und räumen nach dem Lauf auf.

---

## 6. Standort anlegen

**Klickpfad:** `Leere Karte -> Nur Standort anlegen` oder
`Standortliste -> Standort anlegen`.

Pflicht:

- Standortname
- entweder GPS oder fünfstellige PLZ

Optional:

- Ort
- Straße und Hausnummer

GPS-Koordinaten werden lokal gespeichert. Bei PLZ nutzt SoundFuchs das lokale
Verzeichnis für Ort und Kartenpunkt. Straße und Hausnummer dienen nur der
Orientierung; sie lösen keine Online-Geokodierung aus.

Eine Maschine kann direkt danach oder später zum Standort hinzugefügt werden.

---

## 7. Maschine anlegen

**Klickpfad:** `Standort öffnen -> Neue Maschine anlegen` oder
`Leere Karte -> Erste Maschine anlegen`.

Pflicht:

- Maschinenname

Optional, zunächst eingeklappt:

- Standortzuordnung
- Maschinen-ID, zum Beispiel SAP-Nummer
- Flottengruppe

Der Speichern-Knopf liegt bewusst nah am Namen. Optionale Angaben können vor
dem Speichern aufgeklappt oder später gepflegt werden.

**Maschinen-ID:** dient Identifikation und Import, nicht der Audioanalyse.

**Flottengruppe:** verbindet vergleichbare Maschinen für einen Reihenvergleich.

---

## 8. Normalzustand aufnehmen

### 8.1 Bedeutung

Der Normalzustand ist der lokale Maßstab dieser Maschine. Er soll aufgenommen
werden, wenn die Maschine nach Wissen des Nutzers normal läuft.

**Klickpfad:** `Maschine -> Normalzustand aufnehmen`.

### 8.2 Gute Aufnahmebedingungen

- gleiche Position und ähnlicher Abstand
- vergleichbarer Betriebszustand und Lastpunkt
- Gerät ruhig halten
- möglichst wenig Stimmen und wechselnde Fremdgeräusche
- normales Smartphone-Mikrofon statt Bluetooth-Headset

SoundFuchs prüft Mindestdauer und Signalqualität. Eine ungeeignete Aufnahme wird
nicht stillschweigend zum Maßstab.

### 8.3 GMIA

Neue Normalzustände werden ausschließlich lokal mit GMIA aufgebaut. SoundFuchs
bildet stabile Signalanteile mehrerer Zeitfenster und vergleicht spätere
Spektralmerkmale mathematisch. Dafür wird kein neuronales Modell geladen.

### 8.4 Gegenprobe

Nach dem ersten Normalzustand empfiehlt SoundFuchs eine unmittelbare
Gegenprobe. Sie zeigt, wie reproduzierbar Position, Maschine und Umgebung sind.

---

## 9. Maschine prüfen

**Klickpfad:** `Maschine -> Jetzt 10 Sekunden prüfen`.

Voraussetzungen:

- Normalzustand vorhanden
- Mikrofon freigegeben
- Maschine in vergleichbarem Betriebszustand

Ergebnisfälle:

- **Klingt wie der Normalzustand**
- **Die Messung klingt anders als der Normalzustand**
- **Aufnahme reicht nicht zum Vergleichen**
- **Abtastraten inkompatibel**: SoundFuchs verweigert den Vergleich statt
  unpassende Frequenzfelder zu verrechnen

Der Prozentwert ist eine mathematische Ähnlichkeit, keine
Schadenswahrscheinlichkeit. Die Schwelle ist vom Nutzer einstellbar und muss
unter realen Bedingungen validiert werden.

---

## 10. Geräusch aus Datei oder Handyfilm importieren

### 10.1 Schnellweg ohne vorhandene Maschine

**Klickpfad:** `Karte -> Import -> Datei wählen -> Ausschnitt verwenden`.

SoundFuchs liest die Tonspur lokal, lässt den relevanten Ausschnitt wählen und
legt erst nach erfolgreicher Übernahme eine Maschine im Sammelstandort
**„Meine Geräusche“** an. Der Dateiname wird als verständlicher Maschinenname
verwendet.

Ohne Normalzustand gilt:

- keine seriöse Abweichungs-Prozentzahl
- Aufnahme ansehen und anhören
- auffälligen Bereich markieren
- neutrales Einzelaufnahme-Briefing erstellen
- Aufnahme bei Eignung als Normalzustand speichern

### 10.2 Import innerhalb einer bekannten Maschine

Der Ausschnitt kann:

- als Prüfung gegen den vorhandenen Normalzustand ausgewertet werden
- als erster Normalzustand gespeichert werden
- einen vorhandenen Normalzustand nach Bestätigung ersetzen

Frühere Prüfungen bleiben beim Ersetzen erhalten.

### 10.3 Grenzen

Formatunterstützung hängt vom Browser ab. Große Videos müssen vollständig in
den Gerätespeicher passen. Eine Datei ohne Tonspur oder ein zu kurzer Ausschnitt
wird abgewiesen.

---

## 11. Maschine am Geräusch erkennen

**Klickpfad:** `Karte -> Erkennen -> Aufnahme`.

SoundFuchs gleicht die Aufnahme ausschließlich mit Normalzuständen ab, die auf
diesem Gerät bekannt sind. Das Ergebnis kann sein:

- eindeutiger lokaler Treffer
- mehrere Kandidaten
- unbekannt

Das ist **Maschinenwiedererkennung**, keine Fehlererkennung. Erst nach der
Zuordnung kann die Maschine geöffnet und eine Prüfung gestartet werden.

---

## 12. Unterschied sehen und hören

Nach einer Prüfung stehen mehrere Sichten auf denselben Vergleich bereit:

- **Verlauf:** frühere Prüfungen
- **2D:** Klangbild/Spektrogramm
- **3D:** Frequenz, Zeit und Stärke als Gebirge
- **Briefing:** Übergabe vorbereiten
- je nach Ansicht weitere Details

### 12.1 Quellen

- Normalzustand
- Messung
- Unterschied
- gemeinsamer Fingerabdruck

### 12.2 Hör-Lupe

Die Hör-Lupe hebt Unterschiede akustisch hervor. Sie ist eine bearbeitete
Hörhilfe; Originalmessung und Bewertung bleiben unverändert.

### 12.3 Markierter Bereich

Im Spektrogramm kann ein Zeit- und Frequenzfenster markiert werden. Genau dieser
Fokus kann als Hörhilfe und Kontext in das Geräusch-Briefing eingehen.

### 12.4 Einordnung der Stärke

„Leicht“, „deutlich“ oder „stark erhöht“ beschreibt die akustische Differenz im
gewählten Bereich, nicht die Schwere eines Schadens.

---

## 13. Geräusch-Briefing

### 13.1 Zweck

Das Briefing bündelt das Material, das eine Fachperson oder externe KI zur
Einordnung braucht, ohne selbst eine Diagnose zu behaupten.

### 13.2 Fälle

- **Gesunder Normalzustand bekannt:** spätere Messung wird dagegen gestellt.
- **Zustand beider Aufnahmen unklar:** neutraler A/B-Kontrast.
- **Nur Einzelaufnahme:** Verdachtsfall plus Plan für eine bessere
  Gegenaufnahme, ohne Abweichungsbehauptung.

### 13.3 Inhalt

- Originalaufnahme(n)
- bearbeitete Hörhilfe(n)
- markierter Zeit-/Frequenzbereich
- Aufnahmequalität und technische Metadaten
- vom Nutzer gewählter Situationskontext
- Arbeitsauftrag als Text
- Hinweise und Grenzen

### 13.4 Datenschutz und Einwilligung

Vor der Erstellung entscheidet der Nutzer:

- ob die Maschinenbezeichnung enthalten sein darf
- welche Situation und Beschreibung mitgeht
- ob er zur Weitergabe der Audiodateien berechtigt ist

Standort- und Kundendaten bleiben standardmäßig draußen. Audio kann trotzdem
Stimmen oder Ortsgeräusche enthalten und muss vor Weitergabe geprüft werden.

### 13.5 Erstellung und Übergabe

**Klickpfad:** `Maschine -> Geräusch-Briefing -> Kontext prüfen ->
Briefing herunterladen + Arbeitsauftrag kopieren`.

SoundFuchs erzeugt lokal ein ZIP und kopiert den identischen Arbeitsauftrag.
Danach kann es Claude oder ChatGPT öffnen. Die App übergibt nichts automatisch:
Der Nutzer fügt den Text selbst ein und hängt das ZIP selbst an.

Das voreingestellte Auswertungswerkzeug ist Claude. Unter Profi kann ChatGPT
gewählt werden; die Wahl wird lokal gespeichert.

---

## 14. Verlauf, Runde, Reihe und Flotte

### 14.1 Verlauf

Jede Prüfung bleibt bei der Maschine mit Zeit und Ähnlichkeitswert. Der Verlauf
zeigt Entwicklung, ersetzt aber keine fachliche Trendprognose.

### 14.2 Runde am Standort

Sind mehrere Maschinen an einem Standort vorhanden, führt SoundFuchs zur
nächsten Maschine und zeigt den Fortschritt einer Prüfrunde.

### 14.3 Reihe/Flottenvergleich

Baugleiche Maschinen können über ihre Flottengruppe verglichen werden.
SoundFuchs zeigt, welche geprüften Maschinen stärker von ihrem jeweils eigenen
Normalzustand abweichen als die anderen.

Mindestens drei geprüfte Maschinen sind nötig. Bei zwei Maschinen lässt sich
nicht begründen, welche Seite der Ausreißer ist.

### 14.4 Flottenvergleich ohne Bestand

Der Profi-Weg erlaubt auch mehrere unbekannte Maschinen nacheinander zu
vergleichen, ohne sie vorher vollständig anzulegen. Auch hier gilt: Vergleich,
nicht Diagnose.

---

## 15. Suche, Karte und Nähe

Die lokale Suche findet Standorte, Maschinen und PLZ. Filter können nach
Zustand, Standort, Flotte und Prüfalter einschränken.

**In der Nähe** verwendet wahlweise Kartenmitte oder den freigegebenen
Gerätestandort. GPS-Koordinaten werden lokal verarbeitet. Die Karte selbst ruft
Kacheln beim gewählten Anbieter ab.

Standorte ohne bekannte PLZ oder GPS bleiben in der Standortliste sichtbar,
haben aber keinen Kartenpunkt.

---

## 16. Daten sichern, importieren und löschen

### 16.1 Datenbank exportieren

**Klickpfad:** `Einstellungen & mehr -> Daten sichern & zurücksetzen ->
Datenbank exportieren`.

Je nach Wahl können Daten und Einstellungen enthalten sein. Ein Export ist vor
Browserwechsel, Gerätewechsel oder Datenlöschung sinnvoll.

### 16.2 Datenbank importieren

Ein SoundFuchs-Datenbankimport **ergänzt** Maschinen und Daten; er ist kein
vollständiger Ersatz. Einstellungen werden nur übernommen, wenn der Nutzer dies
auswählt.

### 16.3 Standortliste importieren

CSV mit `Name`, `PLZ`, optional `Ort`, `Straße` und `Maschine`. Die
Kartenposition kommt lokal aus der PLZ.

### 16.4 Alle Daten löschen

Destruktive Aktion. Vorher Export anbieten und klar sagen, dass lokale
Maschinen, Normalzustände, Aufnahmen und Prüfungen verloren gehen können.

### 16.5 NFC, QR und externe Referenzen

NFC-/QR-Verweise können Maschinen öffnen oder eine externe Referenzdatenbank
anfordern. Ein externer Abruf benötigt Netz und ist nur so vertrauenswürdig wie
die im Link gewählte Quelle. Vor Import werden Quelle und Inhalt geprüft und
bestätigt.

---

## 17. Einstellungen

Wichtige Kategorien:

- Basis/Profi
- Mikrofon und Aufnahmedauer
- Vergleichsschwelle
- Frequenz- und Amplitudendarstellung
- Raum- und Störgeräuschprofil
- Auswertungswerkzeug für das Briefing
- NFC/QR
- Datenverwaltung
- Sprache und Darstellung

Neue Normalzustände verwenden immer GMIA. Im Code vorhandene alternative
Engines dienen nur der Kompatibilität alter/importierter Modelle und werden
nicht als Auswahl für neue Normalzustände angeboten.

---

## 18. PWA, Offline und Updates

- PWA kann über den Browser installiert werden.
- App-Shell und Kernanalyse sind nach erfolgreichem Laden weitgehend offline
  nutzbar.
- Karte, Hosting/Updates und externe Links benötigen Netz.
- Ein Update erneuert App-Dateien, nicht automatisch die IndexedDB.
- Bei alter Oberfläche zuerst App neu laden; wenn nötig PWA entfernen und neu
  installieren, vorher Daten exportieren.

---

## 19. Die fünf Mini-Schulungen

**Klickpfad:** `Einstellungen & mehr -> Mini-Schulungen · 5 Live-Demos`.

1. **Heute normal, später vergleichen** - Normalzustand, Gegenprobe, Ergebnis,
   Verlauf.
2. **Den Unterschied sehen und hören** - Quellen, Hör-Lupe, 3D und Grenze.
3. **Einen Handyfilm mitbringen** - Tonspur, Ausschnitt und ehrlicher Weg ohne
   Referenz.
4. **Kennt SoundFuchs diese Maschine?** - lokale Wiedererkennung und
   „unbekannt“ als zulässiges Ergebnis.
5. **Eine Beobachtung sauber übergeben** - lokales ZIP, Arbeitsauftrag und
   bewusste Weitergabe.

Die Vorführungen verwenden synthetische Töne und reservierte temporäre Daten.
Sie fordern kein Mikrofon an, öffnen keinen Dateidialog, senden nichts und
stellen den vorherigen App-Zustand wieder her.

---

## 20. Klickpfad-Bibliothek

| Ziel | Klickpfad |
|---|---|
| Mini-Schulungen | `Einstellungen & mehr -> Mini-Schulungen · 5 Live-Demos` |
| Standort anlegen | `Leere Karte -> Nur Standort anlegen` |
| Maschine anlegen | `Standort -> Neue Maschine anlegen` |
| Normalzustand | `Maschine -> Normalzustand aufnehmen` |
| Gegenprobe | `Maschine -> Jetzt Gegenprobe machen` |
| Prüfung | `Maschine -> Jetzt 10 Sekunden prüfen` |
| Datei/Film | `Karte -> Import -> Datei -> Ausschnitt verwenden` |
| Maschine erkennen | `Karte -> Erkennen -> Aufnahme` |
| Unterschied | `Maschine -> Unterschied anhören` |
| Klangquellen | `Analyseblatt -> Normalzustand/Messung/Unterschied` |
| 3D | `Analyseblatt -> 3D` |
| Bereich markieren | `Hör-Lupe -> Bereich im Spektrogramm auswählen` |
| Geräusch-Briefing | `Maschine -> Geräusch-Briefing` |
| Auswertungswerkzeug | `Profi -> Einstellungen & mehr -> Auswertungswerkzeug` |
| Daten sichern | `Einstellungen & mehr -> Daten sichern & zurücksetzen` |
| Standortliste | `Einstellungen & mehr -> Standorte: Beispiele & Import` |
| Ansicht wechseln | `Einstellungen & mehr -> Ansicht: Basis oder Profi` |
| Karte | `Einstellungen & mehr -> Standortkarte` |

---

## 21. Diagnosebäume und typische Probleme

### 21.1 Mikrofon startet nicht

1. Browserberechtigung prüfen.
2. HTTPS beziehungsweise installierte PWA verwenden.
3. anderes Mikrofon auswählen.
4. Bluetooth-/Headset-Mikrofon vermeiden.
5. App neu fokussieren oder neu laden.

### 21.2 Normalzustand wird abgelehnt

- zu kurz
- zu leise oder kein stabiles Maschinensignal
- stark wechselnde Umgebung
- Aufnahme nicht stationär genug

Ruhigere Stelle wählen, Gerät näher und stabil halten, Betriebszustand prüfen.

### 21.3 Vergleich wird verweigert

- kein Normalzustand
- inkompatible Abtastrate
- Aufnahmequalität nicht ausreichend
- altes Modell nicht verfügbar

SoundFuchs verweigert lieber einen mathematisch unzulässigen Vergleich, als
einen scheinbar genauen Prozentwert zu erfinden.

### 21.4 Importierte Videoaufnahme funktioniert nicht

- Browser unterstützt Codec/Container nicht
- Datei zu groß
- keine Tonspur
- Ausschnitt zu kurz

Wenn möglich WAV, WebM oder ein vom aktuellen Browser lesbares Video verwenden.

### 21.5 Erkennen findet nichts

- auf diesem Gerät fehlen lokale Normalzustände
- Aufnahme ist zu unähnlich oder uneindeutig
- Abstand/Betriebszustand unterscheidet sich stark

Keinen Treffer erzwingen. Maschine über Karte/Suche öffnen oder neu anlegen.

### 21.6 Briefing öffnet Werkzeug, aber Text fehlt

Browser dürfen fremde Webseiten nicht automatisch befüllen. Arbeitsauftrag aus
Zwischenablage einfügen; ZIP aus Downloads anhängen. Im Dialog steht der Text
als Rückfallebene erneut zur Verfügung.

### 21.7 Daten fehlen auf einem anderen Gerät

Erwartetes Verhalten: keine Synchronisation. Datenbank exportieren und bewusst
auf dem Zielgerät importieren.

### 21.8 Karte bleibt leer

- Standort besitzt weder bekannte PLZ noch GPS
- Filter aktiv
- kein Standort angelegt
- Kartenanbieter offline

Standortliste bleibt auch ohne Kartenpunkt nutzbar.

---

## 22. Häufige Fragen mit Musterantworten

### Ist SoundFuchs vollständig offline?

> Die Kernanalyse und Messdatenverarbeitung laufen lokal. Hosting, Updates,
> Karten und bewusst geöffnete externe Links brauchen Netz. Ein altes
> importiertes YAMNet-Modell kann einmalig sein Modell laden; Audio wird dabei
> nicht übertragen.

### Was bedeutet 82 Prozent?

> Die aktuelle Aufnahme ist nach dem gewählten mathematischen Verfahren zu 82
> Prozent ähnlich zum lokalen Normalzustand. Das ist keine 82-prozentige
> Gesundheit und keine Diagnosewahrscheinlichkeit.

### Kann SoundFuchs einen Lagerschaden erkennen?

> Nein. SoundFuchs kann zeigen, dass und wo sich das Geräusch gegenüber dem
> Normalzustand verändert hat. Die Ursache muss eine Fachperson oder ein anderes
> geeignetes System prüfen.

### Kann ich nur einen Handyfilm verwenden?

> Ja. SoundFuchs übernimmt die Tonspur lokal und erstellt ein neutrales
> Einzelaufnahme-Briefing. Ohne früheren Normalzustand gibt es jedoch keine
> ehrliche Abweichungs-Prozentzahl.

### Lädt SoundFuchs das Briefing zu ChatGPT oder Claude hoch?

> Nein. SoundFuchs erstellt ZIP und Arbeitsauftrag lokal und öffnet nur die
> gewählte Website. Einfügen, Anhängen und Absenden übernimmt der Nutzer.

### Warum soll ich eine gesunde Maschine aufnehmen, wenn gerade nichts kaputt ist?

> Genau dann entsteht der persönliche Maßstab, den eine spätere Einzelaufnahme
> nicht nachträglich rekonstruieren kann. Der Normalzustand ist der langfristige
> Wert von SoundFuchs.

### Kann ich verschiedene Smartphones verwenden?

> Relative Vergleiche können funktionieren, SoundFuchs ist aber kein
> kalibriertes Messgerät. Abstand, Mikrofon und Umgebung beeinflussen das
> Ergebnis. Schwellen und Wiederholbarkeit müssen für den konkreten Einsatz
> geprüft werden.

---

## 23. Mini-Schulungen für den Guided Agent

### 23.1 SoundFuchs in fünf Minuten

**Ziel:** Produktgrenze und Kernweg verstehen.

1. Mini-Schulung „Heute normal, später vergleichen“ starten.
2. Normalzustand als Maßstab erklären.
3. Gegenprobe und späteren Vergleich unterscheiden.
4. Prozentwert als Ähnlichkeit einordnen.
5. Verlauf zeigen.

**Merksatz:** SoundFuchs diagnostiziert nicht; es vergleicht mit dem Gedächtnis
dieser Maschine.

### 23.2 Handyfilm in fünf Minuten

1. `Import` wählen.
2. Audio-/Videodatei öffnen.
3. Ausschnitt wählen und anhören.
4. ohne Referenz keine Abweichungszahl versprechen.
5. neutral briefen oder als Normalzustand speichern.

### 23.3 Geräusch-Briefing in zehn Minuten

1. Vergleich oder Einzelaufnahme öffnen.
2. auffälligen Bereich markieren.
3. Situation und Beschreibung ergänzen.
4. Datenschutzwahl und Berechtigung prüfen.
5. ZIP herunterladen und Arbeitsauftrag kopieren.
6. gewähltes Werkzeug öffnen, selbst einfügen, ZIP anhängen und absenden.

### 23.4 Datensicherheit in fünf Minuten

1. lokale Speicherung erklären.
2. Netzwerk-Ausnahmen nennen.
3. Datenbankexport zeigen.
4. Löschung und Gerätewechsel erklären.

---

## 24. Agentenregeln

1. Immer zuerst klären: Gibt es einen Normalzustand?
2. Ergebnis als Ähnlichkeit/Abweichung formulieren, nie als Diagnose.
3. Bei Klickpfaden sichtbare deutsche Beschriftungen verwenden.
4. Basis/Profi und Smartphone/Desktop unterscheiden, wenn relevant.
5. Vor destruktiven oder externen Aktionen Wirkung und Datenfluss nennen.
6. Keine erfundenen Maschinen, Scores, Schadensursachen, Bild-IDs oder URLs.
7. Bei sensiblen Fehlern anonymisierte Screenshots und Fehlermeldungen statt
   kompletter Datenbanken erbitten.
8. Wenn eine Funktion im dokumentierten Stand nicht existiert, offen sagen.

---

## 25. Prüfungsfragen mit Soll-Antworten

1. **Was ist der Normalzustand?** Lokaler akustischer Maßstab einer Maschine.
2. **Was bedeutet der Score?** Mathematische Ähnlichkeit, nicht Gesundheit.
3. **Welche Engine nutzt ein neuer Normalzustand?** GMIA, lokal.
4. **Ist Erkennen eine Schadensanalyse?** Nein, lokale Maschinenwiedererkennung.
5. **Was passiert ohne Normalzustand?** Einzelaufnahme ohne Abweichungswert.
6. **Wer sendet das Briefing an eine KI?** Der Nutzer selbst.
7. **Wo liegen die Daten?** Im Browser des jeweiligen Geräts.
8. **Synchronisiert SoundFuchs Geräte?** Nein.
9. **Was sendet die Karte?** Technischen Kachelabfrage/Kartenausschnitt an den
   Kartenanbieter.
10. **Wann darf „Lagerschaden“ behauptet werden?** Nie aufgrund von SoundFuchs
    allein.
11. **Was macht die Hör-Lupe?** Bearbeitete Hörhilfe, keine neue Bewertung.
12. **Wann ist ein Flottenausreißer sinnvoll?** Ab mindestens drei vergleichbar
    geprüften Maschinen.
13. **Wie verhält sich Datenbankimport?** Ergänzend; Einstellungen nur nach Wahl.
14. **Was vor Löschen tun?** Bei Bedarf Datenbank exportieren.
15. **Warum sind synthetische Live-Demos sicher?** Keine echten Daten, kein
    Mikrofon, temporäre Einträge, Aufräumen nach dem Lauf.

---

## 26. Glossar

- **GMIA:** lokale mathematische Methode zur Bildung stabiler Signalanteile.
- **Normalzustand:** gespeicherter akustischer Maßstab einer Maschine.
- **Prüfung:** spätere Aufnahme zum Vergleich mit dem Normalzustand.
- **Ähnlichkeit:** mathematischer Score von 0 bis 100 Prozent.
- **Hör-Lupe:** akustisch bearbeitete Hervorhebung eines Unterschieds.
- **Geräusch-Briefing:** lokales ZIP plus Arbeitsauftrag zur bewussten Übergabe.
- **Einzelaufnahme:** Geräusch ohne gesunden historischen Vergleich.
- **Erkennen:** Abgleich mit lokal bekannten Maschinenreferenzen.
- **Flottengruppe:** Gruppe baugleicher oder vergleichbarer Maschinen.
- **Runde:** nacheinander ausgeführte Prüfungen an einem Standort.
- **Reihe:** Vergleich mehrerer geprüfter Maschinen.
- **PWA:** installierbare Web-App mit Offline-Anteilen.
- **IndexedDB:** lokaler Browser-Datenspeicher.
- **Legacy-Modell:** alter/importierter Referenztyp, der aus Kompatibilitätsgründen
  weiter gelesen werden kann.

---

## 27. Schnellreferenz

| Thema | Verbindliche Kurzantwort |
|---|---|
| Kern | eigene Maschine heute mit ihrem Normalzustand vergleichen |
| Diagnose | nein; Vergleich und Briefing |
| Neuer Normalzustand | GMIA, lokal, kein KI-Modell-Download |
| Daten | lokal im Browser, keine automatische Synchronisation |
| Karte | externer Kachelabruf möglich |
| Import | vorhandene Audio-/Videotonspur lokal übernehmen |
| Erkennen | lokal bekannte Maschine wiederfinden, keinen Schaden erkennen |
| Ohne Referenz | neutrale Einzelaufnahme, keine Abweichungs-Prozentzahl |
| Briefing | ZIP + Arbeitsauftrag lokal; Nutzer übergibt selbst |
| Basis | vollständiger ruhiger Kernweg |
| Profi | Spezial-, Flotten-, Daten- und Konfigurationswerkzeuge |
| Verlauf | gespeicherte Prüfungen derselben Maschine |
| Flotte | Ausreißer relativ zur Gruppe und zu eigenen Normalzuständen |
| Vor Löschen | Datenbankexport anbieten |
| Live-Demos | fünf sichere Abläufe mit synthetischen Tönen |

---

## 28. Pflege

Bei jeder Produktänderung prüfen:

- sichtbare Beschriftungen und Klickpfade
- Basis-/Profi-Unterschiede
- Smartphone-/Desktop-Verhalten
- Normalzustand, Prüfung und Dateimport
- Erkennen und Briefing
- Datenschutz- und Netzwerkdarstellung
- Live-Demo-Schritte und Bildkatalog
- Systemprompt-Länge
- PDF und Guided-Agent-Exportpaket
