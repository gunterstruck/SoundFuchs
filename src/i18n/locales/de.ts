/**
 * SOUNDFUCHS - German (Deutsch) Translations
 *
 * This is the primary language file containing all original German strings.
 */

import type { TranslationDict } from '../index.js';

export const de: TranslationDict = {
  // ============================================================================
  // BUTTONS
  // ============================================================================
  buttons: {
    stop: 'Stop',
    stopAndSave: 'Stop & Save',
    scan: 'Scannen',
    create: 'Erstellen',
    record: 'Aufnehmen',
    startDiagnosis: 'Zustand prüfen',
    analyze: 'Analysieren',
    close: 'Schließen',
    cancel: 'Abbrechen',
    save: 'Speichern',
    discard: 'Verwerfen',
    trainAnother: 'Weiteren Zustand trainieren',
    newMachine: 'Neue Maschine',
    stopRecording: 'Aufnahme stoppen',
    saveReference: 'Normalzustand speichern',
    continue: 'Weiter',
  },

  // ============================================================================
  // BANNER
  // ============================================================================
  banner: {
    headline: 'Hört sich die Anlage normal an?',
    subline: 'Zustand in Sekunden prüfen – direkt am Gerät, offline',
  },

  // ============================================================================
  // STATUS
  // ============================================================================
  status: {
    healthy: 'Unauffällig',
    uncertain: 'Abweichung',
    faulty: 'Auffällig',
    unknown: 'Unbekannt',
    noData: 'Keine Daten',
    notChecked: 'Noch nicht geprüft',
    ready: 'Bereit',
    analyzing: 'ANALYSIERE...',
    consistent: 'Maschine konsistent',
    slightDeviation: 'Leichte Abweichung',
    significantChange: 'Signifikante Änderung',
    strongDeviation: 'Starke Abweichung – vor-Ort-Prüfung erwägen',
  },

  // ============================================================================
  // MODAL TITLES
  // ============================================================================
  modals: {
    referenceRecording: 'Normalzustand aufnehmen',
    liveDiagnosis: 'Live Diagnosis - Find Sweet Spot',
    qrScanner: 'QR/Barcode Scanner',
    databaseError: 'Datenbank-Fehler',
    browserIncompatible: 'Browser nicht unterstützt',
    accessDenied: 'Zugriff verweigert',
    processingError: 'Verarbeitungsfehler',
    saveError: 'Speicherfehler',
    sampleRateMismatch: 'Audiogeräte nicht kompatibel',
    unsuitable: 'Geräusch nicht erkennbar',
    referenceUnsuitable: 'Aufnahme ungeeignet',
    recordingDiscarded: 'Aufnahme verworfen',
    cameraOptional: 'Kamera optional',
    noSignalDetected: 'Kein Signal erkannt',
    scanError: 'Scanfehler',
    databaseExported: 'Datenbank exportiert',
    databaseShared: 'Datenbank versendet',
    databaseImported: 'Datenbank importiert',
    databaseCleared: 'Datenbank geleert',
    nfcDiagnosisTitle: 'Zustand prüfen?',
    nfcDiagnosisPrompt: 'Maschine erkannt. Zustand jetzt prüfen?',
    closeDialog: 'Dialog schließen',
  },

  // ============================================================================
  // PHASE 1: IDENTIFY (Machine Selection)
  // ============================================================================
  identify: {
    selectMachine: 'Maschine auswählen',
    scanQrCode: 'QR-Code scannen',
    scanQrDescription: 'Identifiziere Maschine via QR-Code',
    manualEntry: 'Manuell anlegen',
    manualEntryDescription: 'Neue Maschine mit Namen erstellen',
    machineName: 'Maschinenname',
    machineId: 'Maschinen-ID (optional)',
    machineNameHint: 'Eindeutiger Name, z.B. Pumpe 3 – Westhalle',
    machineNameRequired: 'Bitte gib einen Maschinennamen ein.',
    machineNamePlaceholder: 'z.B. Pumpe 3 – Westhalle',
    machineIdHint:
      'Optional: Interne Kennung (z.B. SAP-Nr.). Wird nicht für die Analyse verwendet.',
    machineDetails: 'Details & Verwaltung',
    deleteMachine: 'Maschine löschen',
    confirmDeleteMachine: 'Maschine „{{name}}" löschen? Alle Prüfungen gehen verloren.',
    confirmDeleteMachineWithData:
      'Maschine „{{name}}" hat {{count}} Aufnahmen. Wirklich ALLES löschen?',
    machineDeleted: '\uD83D\uDDD1\uFE0F Maschine „{{name}}" gelöscht',
    quickAccess: 'Schnellwahl',
    quickAccessDescription: 'Schneller Zugriff auf kürzlich verwendete Maschinen',
    recentlyUsed: 'Zuletzt verwendet',
    overview: 'Übersicht',
    machineOverview: 'Maschinenübersicht',
    history: 'Verlauf',
    noMeasurements: 'Noch keine Messungen vorhanden',
    noMachines: 'Keine Maschinen vorhanden',
    statesTrained: '{{count}} Zustände trainiert',

    // Welle 5: Identify tiles
    tiles: {
      savedMachines: 'Gespeicherte Maschinen',
      scanQR: 'QR / Barcode',
      newMachine: 'Neue Maschine',
    },

    // Machine detail modal
    machineDetail: {
      title: 'Maschine',
      select: 'Maschine laden',
    },

    // Sprint 2 UX: Empty state mini guide
    emptyGuide: {
      title: 'So funktioniert SoundFuchs',
      step1Title: 'Maschine anlegen',
      step1Desc: 'Gib deiner Maschine einen eindeutigen Namen.',
      step2Title: 'Normalzustand aufnehmen',
      step2Desc: '10 Sekunden Normalzustand aufnehmen.',
      step3Title: 'Zustand prüfen',
      step3Desc: 'Vergleiche jederzeit gegen den Normalzustand.',
      cta: 'Erste Maschine anlegen',
    },

    errors: {
      scannerStart: 'Fehler beim Starten des Scanners',
      cameraAccessDenied: 'Kamerazugriff wurde verweigert',
      cameraAccessHint: 'Bitte erlauben Sie den Kamerazugriff in Ihren Browser-Einstellungen',
      noCameraFound: 'Keine Kamera gefunden',
      noCameraHint: 'Bitte stellen Sie sicher, dass Ihr Gerät eine Kamera hat',
      qrProcessing: 'Fehler beim Verarbeiten des QR-Codes',
      invalidCode: 'Ungültiger Code gescannt',
      codeProcessing: 'Fehler beim Verarbeiten des Codes',
      manualEntryLoad: 'Manuelle Eingabe konnte nicht geladen werden',
      invalidMachineId: 'Ungültige Maschinen-ID',
      machineLoad: 'Fehler beim Laden der Maschine',
      machineNotFound: 'Maschine nicht gefunden. Bitte neu auswählen.',
      nameRequired: 'Bitte geben Sie einen Maschinennamen ein',
      nameWhitespace: 'Maschinenname darf nicht nur aus Leerzeichen bestehen',
      nameTooLong: 'Maschinenname ist zu lang (maximal 100 Zeichen)',
      machineExists: 'Eine Maschine mit dieser ID existiert bereits',
      machineCreate: 'Fehler beim Erstellen der Maschine',
      idEmpty: 'Maschinen-ID darf nicht leer sein',
      idTooShort: 'Maschinen-ID ist zu kurz',
      idTooLong: 'Maschinen-ID ist zu lang (maximal 100 Zeichen)',
      idWhitespace: 'Maschinen-ID darf nicht nur aus Leerzeichen bestehen',
      microphoneLoad: 'Fehler beim Laden der Mikrofone',
      microphoneSwitch: 'Fehler beim Wechseln des Mikrofons',
    },

    success: {
      machineLoaded: 'Maschine "{{name}}" geladen',
      machineCreated: 'Maschine erstellt: {{name}}',
      machineAutoCreated: 'Neue Maschine "{{name}}" automatisch angelegt.',
      microphoneOptimized: 'Mikrofon automatisch auf "{{label}}" optimiert für beste Prüfung',
      microphoneChanged: 'Mikrofon gewechselt: {{label}}',
    },

    warnings: {
      preferredMicrophoneUnavailable:
        'Bevorzugtes Mikrofon ist nicht mehr verfügbar. Es wird das Standardmikrofon verwendet.',
    },

    messages: {
      codeRecognized: 'Code erkannt: {{code}}',
      autoMachineName: 'Maschine {{id}}',
      loadingMachine: 'Maschine wird geladen...',
    },

    time: {
      justNow: 'gerade eben',
      minutesAgo: 'vor {{minutes}} Min.',
      hoursAgo: 'vor {{hours}} Std.',
      dayAgo: 'vor 1 Tag',
      daysAgo: 'vor {{days}} Tagen',
      weekAgo: 'vor 1 Woche',
      weeksAgo: 'vor {{weeks}} Wochen',
    },

    // Sprint 3 UX: Sparkline accessibility
    sparkline: {
      ariaLabel: 'Verlauf der letzten {{count}} Prüfungen',
    },
  },

  // ============================================================================
  // PHASE 2: REFERENCE (Training)
  // ============================================================================
  reference: {
    recordReference: 'Normalzustand aufnehmen',
    tenSecondRecording: '{{duration}}-Sekunden Aufnahme des Normalzustands',
    noReferenceModel: 'Kein Normalzustand vorhanden',
    trainedStates: 'Trainierte Zustände',
    noModelsYet: 'Noch keine Normalzustände vorhanden',
    existingModels: 'VORHANDENE MODELLE:',
    statesTrainedCount: '{{count}} Zustand(e) bereits trainiert',
    recordingStatusHighQuality: 'Hohe Audioqualität erkannt',
    explainBefore:
      'Der Normalzustand definiert, wie sich deine Maschine im Normalbetrieb anhört. Alle zukünftigen Vergleiche basieren darauf.',
    explainDuring:
      'Bewege das Smartphone langsam um die Maschine. So können Umgebungseinflüsse herausgerechnet werden.',
    savedSuccess: '✅ Normalzustand gespeichert – Umgebungsprofil erkannt',
    savedTitle: 'Normalzustand erstellt',
    cherryPickingHint: '\uD83D\uDEE1\uFE0F Störgeräusche werden automatisch erkannt und verworfen.',
    noModels: 'Noch keine Normalzustände vorhanden.',
    unnamed: 'Normalzustand #{{index}}',
    deleteModel: 'Normalzustand löschen',
    confirmDeleteModel:
      'Normalzustand „{{name}}" löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
    modelDeleted: '🗑️ Normalzustand „{{name}}" gelöscht',
    makeBaseline: 'Als Hauptreferenz festlegen',
    baselinePromoted: '⭐ „{{name}}" ist jetzt die Hauptreferenz',

    // State-based card UI (mirrors diagnose card)
    statesRecorded: '{{count}} Signatur(en) vorhanden',
    noReferenceYet: 'Noch kein Normalzustand',
    changeMachine: 'Maschine wechseln',
    noMachinesYet: 'Noch keine Maschinen angelegt.',
    noMachinesHint: 'Legen Sie zuerst eine neue Maschine an.',

    recording: {
      alreadyRunning: 'Eine Aufnahme läuft bereits.',
      cameraNotAvailable: 'Kamera nicht verfügbar. Aufnahme wird ohne Positionsbild fortgesetzt.',
      browserNotCompatible:
        'Ihr Browser unterstützt leider keine Audioaufnahme. Bitte verwenden Sie Chrome oder Edge.',
      stabilizing: 'Stabilisierung...',
      waitingForSignal: 'Warte auf Signal',
      recording: 'Aufnahme läuft',
      microphoneFailed:
        'Bitte erlauben Sie den Zugriff auf das Mikrofon in Ihren Geräteeinstellungen.',
      processingFailed: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es noch einmal.',
      failedFriendly:
        'Die Aufnahme hat leider nicht geklappt. Das kann bei kurzen Störungen passieren — einfach noch einmal versuchen.',
      retryAction: 'Erneut aufnehmen',
      noSignal:
        'Kein Maschinengeräusch erkannt. Läuft die Maschine? Bitte näher an die Maschine halten und erneut versuchen.',
      positionImage: '📷 Positionsbild wird automatisch aufgenommen',
      instruction: 'Halten Sie das Mikrofon 10–30 cm vor die Maschine.',
      // iOS Audio Blocked (watchdog detection)
      iosAudioBlocked: 'Mikrofon blockiert',
      iosAudioBlockedMessage:
        'Das Mikrofon liefert keine Audiodaten.\n\nMögliche Ursachen:\n• Eine andere App verwendet das Mikrofon\n• iOS blockiert den Mikrofonzugriff\n• Systemlautstärke ist stummgeschaltet\n\nBitte schließen Sie andere Apps und versuchen Sie es erneut.',
      iosAudioBlockedRetry: 'Erneut versuchen',
      // Welle 1 UX: Countdown tip
      countdownTip: 'Halten Sie das Gerät nah an die Maschine',
    },

    quality: {
      signalStable: '✓ Signal stabil',
      slightUnrest: '⚠ Leichte Unruhe',
      signalUnstable: '✗ Warnung: Signal instabil!',
      // Sprint 3 UX: Reference quality badge
      good: 'Ref: Gut',
      ok: 'Ref: OK',
      unknown: 'Ref: ?',
      ariaLabel: 'Aufnahmequalität: {{rating}}',
    },

    signalQuality: {
      label: 'Signal',
      good: 'Gut',
      ok: 'Ausreichend',
      weak: 'Zu schwach',
      hintCloser: 'Smartphone näher an die Maschine halten',
      hintTooWeak: 'Signal zu schwach – näher an die Schallquelle gehen',
    },

    errors: {
      tooShort:
        'Aufnahme zu kurz: {{duration}}s Gesamtdauer ist kürzer als die {{warmup}}s Warmup-Phase. Mindestdauer: {{minDuration}}s',
      trainingTooShort:
        'Trainings-Daten zu kurz: {{duration}}s (nach Warmup-Phase). Minimum erforderlich: {{minDuration}}s. Bitte mindestens {{totalDuration}}s aufnehmen.',
      qualityTooLow:
        'Aufnahme zu schlecht für Training. Bitte in ruhiger Umgebung mit deutlichem Maschinensignal erneut aufnehmen.\n\nProbleme:\n{{issues}}',
      signalTooWeak:
        'Signal zu schwach oder diffus (möglicherweise nur Rauschen).\n\nSignal-Stärke (RMS): {{magnitude}} (Minimum: 0.03)\nQualität: {{quality}}%\n\nBitte sicherstellen:\n• Mikrofon ist nah genug an der Maschine (10-30cm)\n• Maschine läuft mit ausreichend Lautstärke\n• Kein reines Hintergrundrauschen wird aufgenommen\n\nProbleme:\n{{issues}}',
      qualityWarning:
        '⚠️ WARNUNG: Schlechte Aufnahmequalität\n\nDie Qualität dieser Aufnahme ist schlecht. Das Training könnte unzuverlässig sein.\n\nProbleme:\n{{issues}}\n\nMöchten Sie trotzdem speichern?',
      baselineTooLow:
        'Referenzaufnahme zu undeutlich oder verrauscht.\n\nSelbsterkennungs-Score: {{score}}%\nMinimum erforderlich: {{minScore}}%\n\nMögliche Ursachen:\n• Signal zu schwach oder instabil\n• Zu viel Hintergrundgeräusch\n• Maschine läuft nicht konstant\n\nBitte Aufnahme unter besseren Bedingungen wiederholen:\n• Mikrofon näher an der Maschine (10-30cm)\n• Ruhige Umgebung\n• Maschine läuft stabil während gesamter Aufnahme',
      noAudioFile: 'Bitte zuerst eine Referenzaufnahme erstellen.',
      exportFailed: 'Export fehlgeschlagen',
      saveFailed: 'Speichern fehlgeschlagen',
      machineDataMissing: 'Maschinendaten fehlen',
    },

    success: {
      modelTrained:
        '✅ Referenzmodell erfolgreich trainiert!\n\nMaschine: {{name}}\n\nMöchten Sie die Referenz-Audiodatei herunterladen?\n(Empfohlen für Backup)',
      canStartNew: 'Sie können eine neue Referenzaufnahme starten.',
    },

    labels: {
      baseline: 'Referenz',
      formerBaseline: 'Frühere Referenz',
      enterName: 'Bitte einen Namen eingeben',
      cancelled: 'Abgebrochen',
    },

    labelModal: {
      title: 'Zustand benennen',
      hint: 'Beispiele für Normalzustände: „Leerlauf", „Volllast". Beispiele für Fehler: „Unwucht", „Lagerschaden".',
      placeholder: 'Name dieses Zustands',
      healthyLabel: 'Normalzustand',
      faultyLabel: 'Bekannter Fehler',
    },
  },

  // ============================================================================
  // WELLE 1 UX: Machine List Status Dots
  // ============================================================================
  machineList: {
    statusHealthy: 'Unauffällig',
    statusWarning: 'Abweichung',
    statusCritical: 'Auffällig',
    statusUnknown: 'Noch nicht geprüft',
  },

  // ============================================================================
  // PHASE 3: DIAGNOSE (Real-time)
  // ============================================================================
  diagnose: {
    faultDetected: 'Fehler erkannt: {{fault}}',
    faultChecked: 'Fehler „{{fault}}": {{score}} % – kein Treffer',
    faultGeneric: 'Fehler',
    alreadyRunning: 'Eine Prüfung läuft bereits.',
    noReferenceModel: 'Kein Normalzustand vorhanden. Bitte zuerst einen Normalzustand aufnehmen.',
    browserNotCompatible:
      'Ihr Browser unterstützt leider keine Live-Prüfung. Bitte verwenden Sie Chrome, Edge oder Safari.',
    noValidSampleRate: 'Kein Normalzustand mit passender Audioqualität gefunden.',
    cameraNotAvailable: 'Kamera nicht verfügbar. Prüfung wird ohne Positionshilfe fortgesetzt.',
    diagnosisRunning: 'Prüfung läuft',
    compareComplete: '\u2705 Vergleich durchgeführt',
    saveFailed: 'Prüfung konnte nicht gespeichert werden',
    liveAnalysis: 'Live-Analyse durchführen',

    // Welle 1 UX: Action recommendations
    recommendation: {
      healthy: 'Keine Auffälligkeiten',
      warning: 'Beobachten – bei nächster Wartung prüfen',
      critical: 'Auffällig – vor-Ort-Prüfung erwägen',
    },

    sampleRateError:
      'Die Aufnahme konnte nicht verglichen werden. Ihr Gerät verwendet eine andere Audioqualität ({{actual}}Hz) als bei der Aufnahme des Normalzustands ({{expected}}Hz). Bitte verwenden Sie das gleiche Gerät oder nehmen Sie den Normalzustand mit diesem Gerät neu auf.',

    display: {
      referenceModels: 'REFERENZMODELL(E):',
      statesTrainedCount: '{{count}} Zustand(e) trainiert',
      debugValues: '🔍 DEBUG VALUES:',
      signalHint: 'Telefon näher an die Maschine halten für optimales Signal',
      match: 'Übereinstimmung',
      ghostHint: '👻 Bewegen Sie das Handy, bis Live-Bild und Referenzbild übereinstimmen',
      noCameraAvailable: 'Kein Positionsbild verfügbar',
      machineQuestion: 'Hört sich die Maschine unauffällig an?',
      reference: 'Referenz',
      waitingForSignal: 'Warte auf Signal...',
      spectrumReveal: '👁 Spektrum ansehen',
      spectrumHide: 'Spektrum ausblenden',
      listenReference: '🔊 Referenz',
      listenMeasurement: '🔊 Diese Messung',
      listenStop: '⏹ Stopp',
      listenSlow: '🐢 Langsam',
      listenNormal: '▶ Normal',
      listenFaster: '🐇 Höher',
      listenReopen: 'Anhören',
      irisReference: 'Referenz',
      irisMeasurement: 'Messung',
      deviationFrequencyLabel: '⚠ Abweichende Hauptfrequenz: ~{{freq}}',
      operatingPointWarning:
        '⚠ Anderer Betriebspunkt als die Referenz (dominanter Ton ≈{{refFreq}} → {{measFreq}}). Eine geringere Übereinstimmung kann an geänderter Drehzahl/Last liegen statt an einem Defekt.',
      deviationFrequencyHint: 'Prüfen, ob diese Frequenz von der Anlage oder aus dem Umfeld kommt.',
      listenDifference: '🔍 Nur Unterschied',
      listenComputing: '… rechne …',
      listenDifferenceTooShort: 'Aufnahmen zu kurz für die Differenz-Analyse.',
      listenTune: '🎧 Auf hörbaren Bereich',
      listenTuneResult: '🎧 {{peak}} → {{target}}',
      listenTuneClamped:
        'Faktor begrenzt, damit ein Takt hörbar bleibt — die Zielfrequenz wird deshalb nicht ganz erreicht.',
      listenTuneExact:
        'Größter Unterschied auf den Bereich gezogen, in dem das Ohr am besten auflöst.',
      spectrumTitle: 'Frequenzvergleich (Referenz ↔ Messung)',
      spectrumReference: 'Referenz',
      spectrumMeasurement: 'Diese Messung',
      spectrumDifference: 'Mehr-Energie',
    },

    smartStart: {
      stabilizing: '🎙️ {{message}}\n(Mikrofon pegelt ein, OS-Filter werden stabilisiert...)',
      waiting: '🔍 {{message}}',
    },

    debug: {
      weightMagnitude: 'weightMagnitude: {{value}}',
      featureMagnitude: 'featureMagnitude: {{value}}',
      magnitudeFactor: 'magnitudeFactor: {{value}}',
      cosine: 'cosine: {{value}}',
      adjustedCosine: 'adjustedCosine: {{value}}',
      scalingConstant: 'scalingConstant: {{value}}',
      rawScore: 'RAW SCORE: {{value}}%',
      rawScorePlaceholder: 'RAW SCORE: --',
    },

    analysis: {
      healthyMatch:
        'Akustische Signatur entspricht Normalzustand "{{state}}" ({{score}}%). Keine Auffälligkeiten.',
      faultyMatch:
        'Auffälligkeit erkannt: Signatur entspricht trainiertem Muster "{{state}}" ({{score}}%). Inspektion erwägen.',
    },

    // State-based card UI (horizontal tiles)
    scanCode: 'QR scannen',
    selectExisting: 'Maschine wählen',
    createNew: 'Neue Maschine',
    statesReady: '{{count}} Zustand trainiert',
    noReference: 'Noch kein Normalzustand',
    changeMachine: 'Maschine wechseln',
    noMachinesYet: 'Noch keine Maschinen angelegt.',
    noMachinesHint: 'Legen Sie zuerst eine neue Maschine an.',

    // Sprint 3 UX: Operating point hint
    opHint: {
      changed:
        'ℹ️ Betriebspunkt wich während der Messung ab – Score-Interpretation berücksichtigen',
    },

    // Sprint 9: Fleet Quick Check in Phase 3
    orFleet: 'oder',
    fleetQuickCheck: 'Flotten-Schnellcheck',
    fleetQuickCheckAria: 'Flotten-Schnellcheck: Mehrere Maschinen vergleichen',
  },

  // ============================================================================
  // SPRINT 3 UX: TREND
  // ============================================================================
  trend: {
    improving: 'Trend: verbessert',
    stable: 'Trend: stabil',
    declining: 'Trend: sinkend',
    uncertain: 'Trend: noch unsicher',
    noTrend: 'Noch kein Trend',
  },

  // ============================================================================
  // PIPELINE STATUS DASHBOARD (Expert Mode)
  // ============================================================================
  pipelineStatus: {
    title: 'Pipeline-Status',
    room: 'Raum',
    rejected: 'verworfen',
    active: 'aktiv',
    waiting: 'bereit',
    chirpPending: 'Chirp wird ausgeführt...',
    chirpFailed: 'Chirp fehlgeschlagen',
    t60VeryDry: 'sehr trocken',
    t60Dry: 'trocken',
    t60Medium: 'mittel hallig',
    t60Reverberant: 'hallig',
    t60VeryReverberant: 'sehr hallig',
  },

  // ============================================================================
  // ENVIRONMENT COMPARISON (Reference T60 vs. Diagnosis T60)
  // ============================================================================
  envCompare: {
    environment: 'Umgebung',
    reference: 'Ref.',
    ok: '\u00c4hnliche Umgebung wie Referenz',
    moreReverberant: 'Umgebung deutlich halliger als Referenz',
    lesserReverberant: 'Umgebung deutlich trockener als Referenz',
    muchMoreReverberant:
      'Pr\u00fcfumgebung stark abweichend \u2014 Score kann verf\u00e4lscht sein',
    muchLessReverberant:
      'Pr\u00fcfumgebung stark abweichend \u2014 Score kann verf\u00e4lscht sein',
    recommendCloser: 'Empfehlung: N\u00e4her an Maschine messen oder Raumkompensation aktivieren',
    recommendCompensation: 'Empfehlung: Session Bias Match oder T60-Entzerrung aktivieren',
    recommendNote: 'Hinweis: Score-Abweichungen k\u00f6nnen umgebungsbedingt sein',
  },

  // ============================================================================
  // OPERATING POINT MONITOR (Expert Mode)
  // ============================================================================
  opMonitor: {
    title: 'Betriebszustand / Signalqualit\u00e4t',
    initializingBaseline:
      'Referenz-Betriebspunkt wird erfasst \u2013 bitte Ger\u00e4t konstant halten\u2026',
    operatingPointChanged:
      'Betriebspunkt ge\u00e4ndert \u2013 Referenzvergleich eingeschr\u00e4nkt.',
    scoreInvalid: '\u26A0 Betriebspunkt abweichend \u2013 Score nicht vergleichbar',
    similarityP10: {
      shortLabel: 'Stabilit\u00e4t',
      description: 'Bewertet die \u201eschlechtesten\u201c Momente der Aufnahme (10. Perzentil).',
      warning:
        '\u2139\uFE0F Signal unruhig: Der Durchschnitt ist gut, aber es gibt kurze Einbr\u00fcche. Gibt es schwankende Ger\u00e4usche oder Aussetzer?',
      explain:
        'Bewertet die \u201eschlechtesten\u201c Momente der Aufnahme. Ein niedriger Wert zeigt, dass das Ger\u00e4usch unruhig ist, auch wenn der Durchschnitt gut aussieht.',
    },
    energyDelta: {
      shortLabel: 'Energie \u0394',
      description: 'Lautst\u00e4rke-Differenz zur Referenz in Dezibel.',
      warning:
        '\u26A0\uFE0F Achtung: Signal ist deutlich lauter/leiser als die Referenz. L\u00e4uft die Maschine unter anderer Last oder wurde der Mikrofonabstand ge\u00e4ndert? Der Score ist daher evtl. nicht vergleichbar.',
      explain:
        'Zeigt die Lautst\u00e4rke-Differenz zur Referenz. Starke Abweichungen deuten auf ver\u00e4nderte Last, anderen Abstand oder eine lautere Umgebung hin.',
    },
    frequencyDelta: {
      shortLabel: 'Frequenz \u0394',
      description:
        'Mittlere Verschiebung der wichtigsten Spektral-Peaks im Vergleich zur Referenz. Kann auf Drehzahl\u00e4nderung oder ge\u00e4nderten Betriebspunkt hinweisen.',
      warning:
        '\u26A0\uFE0F Abweichender Betriebspunkt: Die Hauptfrequenzen haben sich verschoben. Die Maschine l\u00e4uft vermutlich mit einer anderen Drehzahl als bei der Referenz.',
      explain:
        'Vergleicht die wichtigsten Spektral-Peaks (z.\u00A0B. Motordrehzahl und Oberwellen) mit der Referenz. Eine Verschiebung bedeutet meist, dass die Maschine schneller oder langsamer l\u00e4uft.',
    },
    stability: {
      shortLabel: 'Signal-Stabilit\u00e4t',
      description: 'Anteil stabiler Signalabschnitte w\u00e4hrend der Messung.',
      warning:
        '\u26A0\uFE0F Signal instabil: Schwankende Ger\u00e4usche oder Unterbrechungen erkannt. Messung unter stabilen Bedingungen wiederholen.',
      explain:
        'Misst, wie gleichm\u00e4\u00dfig das Ger\u00e4usch \u00fcber die Zeit ist. Niedrige Werte deuten auf schwankende Betriebsbedingungen oder St\u00f6rger\u00e4usche hin.',
    },
  },

  // ============================================================================
  // PHASE 4: SETTINGS
  // ============================================================================
  settings: {
    databaseNotAvailable:
      'Speicher nicht verfügbar. Bitte deaktivieren Sie den strikten Privacy-Modus in Ihren Browser-Einstellungen oder verwenden Sie einen anderen Browser.',
    exportError: 'Fehler beim Exportieren der Datenbank',
    importError: 'Fehler beim Importieren',
    shareError: 'Fehler beim Versenden der Datenbank',

    import: {
      modalTitle: 'Datenbank importieren',
      modalDescription:
        'Die Maschinen aus der Datei werden zu Ihren bestehenden Maschinen hinzugefügt. Bestehende Daten bleiben erhalten.',
      includeSettings: 'Gespeicherte Einstellungen übernehmen',
      includeSettingsHint:
        'Banner, Ansichtsstufe, Schwellenwerte und weitere App-Einstellungen aus der Datei anwenden.',
      confirmButton: 'Importieren',
      confirmMerge:
        'Datenbank importieren aus: {{filename}}\n\nMöchten Sie die Daten ZUSAMMENFÜHREN?\n\nJA = Zusammenführen mit bestehenden Daten\nNEIN = Alle bestehenden Daten ERSETZEN',
      confirmReplace:
        '⚠️ ACHTUNG!\n\nAlle bestehenden Daten werden GELÖSCHT und durch die Import-Daten ersetzt!\n\nMöchten Sie fortfahren?',
      success:
        'Maschinen: {{machines}}\nAufnahmen: {{recordings}}\nPrüfungen: {{diagnoses}}\n\nModus: {{mode}}',
      modeMerged: 'Zusammengeführt',
      modeReplaced: 'Ersetzt',
      partialWarning:
        'Maschinen: {{machinesImported}} importiert, {{machinesSkipped}} übersprungen\nAufnahmen: {{recordingsImported}} importiert, {{recordingsSkipped}} übersprungen\nPrüfungen: {{diagnosesImported}} importiert, {{diagnosesSkipped}} übersprungen\n\n{{totalSkipped}} Datensatz/Datensätze konnten nicht importiert werden.\nModus: {{mode}}',
      setupError: 'Fehler beim Vorbereiten des Imports',
    },

    clear: {
      confirmFirst:
        '⚠️ ACHTUNG!\n\nAlle Daten werden UNWIDERRUFLICH gelöscht:\n- Alle Maschinen\n- Alle Referenzmodelle\n- Alle Aufnahmen\n- Alle Prüfungen\n\nMöchten Sie fortfahren?',
      confirmSecond:
        'Sind Sie ABSOLUT SICHER?\n\nDiese Aktion kann NICHT rückgängig gemacht werden!',
      success: 'Alle Daten wurden gelöscht',
      error: 'Fehler beim Löschen der Daten',
    },

    export: {
      modalTitle: 'Datenbank exportieren',
      modalDescription:
        'Ihre Maschinen, Aufnahmen und Prüfungen werden exportiert. Möchten Sie zusätzlich die aktuellen Einstellungen mit sichern?',
      includeSettings: 'Einstellungen mitexportieren',
      includeSettingsHint:
        'Banner, Ansichtsstufe, Schwellenwerte und weitere App-Einstellungen mit in die Datei aufnehmen.',
      confirmButton: 'Exportieren',
      success:
        'Datei: {{filename}}\n\nMaschinen: {{machines}}\nAufnahmen: {{recordings}}\nPrüfungen: {{diagnoses}}',
    },

    share: {
      title: 'SoundFuchs Datenbank-Backup',
      text: 'Datenbank-Backup: {{filename}}',
      success: 'Backup versendet: {{filename}}',
      fallback: 'Teilen nicht verfügbar. {{filename}} wurde stattdessen heruntergeladen.',
      preparing: 'Export wird vorbereitet... bitte kurz warten und erneut versuchen.',
    },
  },

  // ============================================================================
  // MAIN APP / STARTUP
  // ============================================================================
  update: {
    available: {
      title: 'Neue Version verfügbar',
      message: 'Eine neue Version ist bereit. Deine Daten bleiben erhalten.',
      action: 'Aktualisieren',
    },
    deferred: 'Wird nach der laufenden Messung aktualisiert.',
  },

  app: {
    browserNotSupported:
      'Ihr Browser ist nicht kompatibel mit SoundFuchs.\n\nFehlende Features:\n{{features}}\n\nBitte verwenden Sie einen modernen Browser wie Chrome, Edge, Firefox oder Safari.',
    uiLoadFailed: 'Benutzeroberfläche konnte nicht geladen werden',
    fatalError: 'Schwerwiegender Fehler',
    browserNotSupportedTitle: 'Browser nicht unterstützt',
  },

  // ============================================================================
  // CORE ML / SCORING
  // ============================================================================
  scoring: {
    matchesReference: 'Akustische Signatur entspricht dem Normalzustand. Keine Auffälligkeiten.',
    moderateDeviation: 'Moderate Abweichung vom Normalzustand. Überprüfung erwägen.',
    significantDeviation: 'Signifikante Abweichung vom Normalzustand erkannt. Inspektion erwägen.',
    noMatch:
      'Signifikante Abweichung vom Normalzustand ({{score}}%). Das Signal passt zu keinem trainierten Zustand. Inspektion erwägen.',
    hints: {
      matchesReference: 'Akustische Signatur entspricht dem Normalzustand.',
      minorDeviations: 'Geringfügige Abweichungen im akzeptablen Bereich.',
      moderateDeviation: 'Moderate Abweichung vom Normalzustand erkannt.',
      recommendInspection: 'Inspektion erwägen.',
      significantAnomaly: 'Signifikante Anomalie erkannt.',
      immediateInspection: 'Sofortige Inspektion erwägen.',
    },
    multiclass: {
      noMatch: 'Kein Übereinstimmung mit trainierten Zuständen ({{score}}%). Signal unklar.',
      healthy:
        'Baseline-Zustand "{{label}}" erkannt ({{score}}% Übereinstimmung). Maschine arbeitet normal.',
      faulty:
        'Zustand "{{label}}" erkannt ({{score}}% Übereinstimmung). Abweichung vom Normalzustand.',
    },
  },

  // ============================================================================
  // HARDWARE CHECK
  // ============================================================================
  hardware: {
    suitable: 'Hardware geeignet für Maschinenprüfung',
    voiceOptimized: 'Sprach-optimierte Hardware filtert Maschinengeräusche.',
    useStudioMic: 'Verwenden Sie ein Studio-Mikrofon oder das eingebaute Geräte-Mikrofon',
    headsetsOptimized: 'Headsets sind für Sprachfrequenzen optimiert',
    mayFilter: 'Maschinengeräusche könnten gefiltert oder unterdrückt werden',
    lowSampleRate: 'Niedrige Sample Rates können hochfrequente Maschinensignale nicht erfassen',
    microphoneDenied: 'Mikrofonzugriff verweigert oder nicht verfügbar',
    iphoneBackMic: 'iPhone Rückseiten-Mikrofon',
    micReady: 'Mikrofon bereit',
    iosMicHint:
      'iOS benötigt kurz Kamera-Zugriff für das beste Mikrofon – die Kamera wird nicht genutzt.',
  },

  // ============================================================================
  // COMMON
  // ============================================================================
  common: {
    machine: 'Maschine',
    error: 'Fehler',
    warning: 'Warnung',
    info: 'Info',
    success: 'Erfolg',
    yes: 'Ja',
    no: 'Nein',
    or: 'oder',
    ok: 'OK',
    loading: 'Laden...',
    initializing: 'Initialisierung...',
    saving: 'Speichern…',
    unknown: 'unbekannt',
  },

  // ============================================================================
  // ROUTER / UI DESCRIPTIONS
  // ============================================================================
  router: {
    statesTrained: '{{count}} Zustand{{plural}} trainiert (zuletzt: {{date}}) - Weitere hinzufügen',
    referenceRequired:
      '{{duration}}-Sekunden Aufnahme des Normalzustands (Erforderlich für Prüfung)',
    liveAnalysis: 'Live-Analyse durchführen',
    lastCheck: 'Letzte Prüfung {{time}}',
  },

  // ============================================================================
  // VIEW LEVELS
  // ============================================================================
  diagnosisAudio: {
    title: 'Prüf-Audio speichern',
    description:
      'Legt fest, ob das Mess-Audio gespeichert wird, damit eine Prüfung später wieder angehört werden kann.',
    noneLabel: 'Ohne Audio',
    noneDesc: 'Schlank',
    latestLabel: 'Nur jüngste',
    latestDesc: 'Empfohlen',
    allLabel: 'Alle',
    allDesc: 'Voll',
  },
  viewLevels: {
    basic: 'Einfache Ampel-Anzeige für Bediener',
    advanced: 'Details für Vorarbeiter & Instandhalter',
    expert: 'Volle technische Ansicht für Ingenieure',
    basicLabel: 'Basis',
    basicDesc: 'Einfach',
    advancedLabel: 'Fortgeschritten',
    advancedDesc: 'Details',
    expertLabel: 'Experte',
    expertDesc: 'Technisch',
    viewModeTitle: 'Ansichtsmodus',
    viewModeDescription:
      'Passen Sie die Komplexität der Benutzeroberfläche an Ihre Bedürfnisse an.',
  },

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================
  notifications: {
    confirmRequired: 'Bestätigung erforderlich',
    closeNotification: 'Benachrichtigung schließen',
  },

  // ============================================================================
  // ERROR BOUNDARY
  // ============================================================================
  errorBoundary: {
    unexpectedError: 'Ein unerwarteter Fehler ist aufgetreten.',
    unexpectedErrorTitle: 'Unerwarteter Fehler',
    permissionDenied: 'Zugriff verweigert',
    permissionHint:
      'Bitte erlauben Sie den Zugriff auf Mikrofon/Kamera in Ihren Browser-Einstellungen.',
    hardwareNotFound: 'Hardware nicht gefunden',
    hardwareHint: 'Bitte stellen Sie sicher, dass Ihr Mikrofon/Kamera angeschlossen ist.',
    audioSystemError: 'Audio-System-Fehler',
    audioSystemHint:
      'Bitte laden Sie die Seite neu. Falls das Problem weiterhin besteht, verwenden Sie einen aktuellen Browser.',
    storageFull: 'Bitte löschen Sie alte Prüfungen oder Normalzustands-Aufnahmen.',
    networkError: 'Bitte überprüfen Sie Ihre Internetverbindung.',
    technicalDetails: 'Technische Details',
    noStackTrace: 'Kein Stack Trace verfügbar',
  },

  // ============================================================================
  // QUALITY CHECK
  // ============================================================================
  qualityCheck: {
    noFeatures: 'Keine Features vorhanden',
    noAudioData: 'Keine Audiodaten extrahiert (Frame Count 0)',
    highVariance: 'Hohe Spektralvarianz - Signal instabil',
    veryHighVariance: 'Sehr hohe Varianz - Bitte in ruhigerer Umgebung aufnehmen',
    outliers: '{{count}} Ausreißer erkannt ({{ratio}}%) - Mögliche Störgeräusche',
    weakSignal:
      'Sehr schwaches/diffuses Signal - Möglicherweise nur Rauschen. Bitte näher an die Maschine gehen.',
    weakTonal: 'Schwaches tonales Signal - Signal-Rausch-Verhältnis könnte zu niedrig sein.',
    trainingSignalWeak:
      'Signal zu schwach oder inkonsistent für Training. Bitte sicherstellen: Mikrofon nah an Maschine, Maschine läuft, kein reines Hintergrundrauschen. (Durchschnittliche Cosinus-Ähnlichkeit: {{value}})',
    invalidSampleRate:
      'Ungültige Sample Rate: {{rate}}Hz. Erwartet: 8000-192000Hz (typisch: 44100Hz oder 48000Hz)',
  },

  // ============================================================================
  // HEALTH GAUGE
  // ============================================================================
  healthGauge: {
    normal: 'UNAUFFÄLLIG',
    deviation: 'ABWEICHUNG',
    abnormal: 'AUFFÄLLIG',
    explain:
      'Der Score zeigt die Ähnlichkeit zum Normalzustand (0–100%). 100% = nahezu identisch. Ein sinkender Trend ist wichtiger als ein einzelner Wert.',
    explainTitle: 'Was bedeutet der Score?',
  },

  // ============================================================================
  // INSPECTION VIEW (Simplified PWA)
  // ============================================================================
  inspection: {
    // Header
    mainQuestion: 'Hört sich die Maschine unauffällig an?',
    subtitle: 'Prüfung läuft – bitte nahe an die Maschine gehen',
    subtitleInitializing: 'Vorbereitung – bitte warten',
    // Status words (simple, non-technical)
    statusNormal: 'Unauffällig',
    statusUncertain: 'Unsicher',
    statusDeviation: 'Abweichung',
    // Reference info
    referenceState: 'Normalzustand',
    referenceDefault: 'Normalbetrieb',
    // Dynamic hints for poor signal quality
    hintMoveCloser: 'Bitte näher an die Maschine gehen',
    hintChangePosition: 'Position leicht verändern',
    hintHoldSteady: 'Gerät ruhig halten',
    hintWaiting: 'Warte auf Maschinensignal...',
    // Button
    stopButton: 'STOP',
  },

  // ============================================================================
  // AUDIO
  // ============================================================================
  audio: {
    ready: 'Bereit',
    stabilizing: 'Akustische Stabilisierung... {{seconds}}s',
    waitingForSignal: 'Warte auf Signal...',
    recordingRunning: 'Aufnahme läuft',
  },

  // ============================================================================
  // SETTINGS UI (index.html)
  // ============================================================================
  settingsUI: {
    title: 'Einstellungen',
    nfcWriterTitle: 'NFC-Tags',
    nfcWriterDescription:
      'Schreiben Sie NFC-Tags für den App-Zugang oder eine ausgewählte Maschine.',
    appearance: 'Erscheinungsbild',
    audioSettings: 'Audioeinstellungen',
    audioHardware: 'Audio Hardware',
    detectingMic: 'Erkenne Mikrofon...',
    detectingMicrophone: 'Erkenne Mikrofon...',
    initHardwareCheck: 'Initialisiere Hardware-Check',
    changeMicrophone: 'Anderes Mikrofon wählen',
    confidenceThreshold: 'Vertrauensschwelle',
    faultyThreshold: 'Auffälligkeitsschwelle',
    recordingDuration: 'Aufnahmedauer',
    recordingDurationDesc:
      'Reine Aufnahmezeit für Trainingsdaten. Zusätzlich werden 5 Sekunden Stabilisierungszeit für optimale Audioqualität vorgeschaltet.',
    seconds5: '5 Sekunden',
    seconds10: '10 Sekunden',
    seconds15: '15 Sekunden',
    seconds: 'Sekunden',
    frequencyAxis: 'Frequenzachse',
    frequencyAxisDesc: 'Logarithmisch (mehr Details im Bereich 20–500 Hz)',
    frequencyLogDesc: 'Logarithmisch (mehr Details im Bereich 20–500 Hz)',
    amplitudeAxis: 'Y-Achse / Amplitude',
    amplitudeAxisDesc: 'Logarithmisch (dB) – betont leise Signale',
    amplitudeLogDesc: 'Logarithmisch (dB) – betont leise Signale',
    disableAudioTriggerLabel: 'Audio-Trigger deaktivieren',
    disableAudioTriggerDesc:
      'Startet die Messung sofort, auch bei sehr leisen Signalen, ohne auf einen Mindestpegel zu warten. Für extrem leise Maschinen oder Umgebungen.',
    analysisMethod: 'Analysemethode',
    analysisMethodDesc: 'Wählen Sie die passende Analysemethode für Ihre Maschine.',
    gmaiMethodDesc:
      'GMIA (Generalized Mutual Interdependence Analysis) extrahiert den gemeinsamen, stabilen Anteil mehrerer Zeitfenster und unterdrückt gerätespezifische Effekte. Ideal für strukturierte, zeitlich stabile Maschinengeräusche. Läuft komplett offline.',
    engineDescSpectral:
      'Vergleicht das Klangspektrum mit einer gemittelten Referenz, unabhängig von der Lautstärke. Ideal für einzelne, gleichmäßige Maschinen. Läuft komplett offline.',
    engineDescYamnet:
      'Neuronaler Klang-Fingerabdruck per KI-Modell. Ideal für komplexe oder zeitlich veränderliche Geräusche. Lädt beim ersten Mal ein Modell, danach offline.',
    engineDescTemporal:
      'Zeitmuster-Analyse (Tier 2): behält den zeitlichen Verlauf statt zu mitteln – für nicht-stationäre Maschinen mit Takten, Klacken oder wechselnden Betriebspunkten (z. B. Ventile, Pressen). Läuft komplett offline.',
    evaluationEngineLabel: 'Auswertungs-Engine',
    evaluationEngineGmia: 'GMIA (Standard)',
    evaluationEngineSpectral: 'Spektral-Cosine (One-Class)',
    evaluationEngineYamnet: 'YAMNet (Neuronal, Beta)',
    evaluationEngineTemporal: 'Zeitmuster (Tier 2, Beta)',
    evaluationEngineDesc:
      'Wählt die Auswertung für NEUE Referenzaufnahmen. Bereits angelernte Maschinen werden weiterhin mit ihrer ursprünglichen Engine ausgewertet. GMIA bleibt Standard.',
    evaluationEngineSaveError:
      'Die Auswertungs-Engine konnte nicht gespeichert werden. Möglicherweise ist der Speicher voll oder Sie befinden sich im privaten Modus.',
    evaluationEngineSaveErrorTitle: 'Speicherfehler',
    level1Info: 'Level 1: Frequenz- und Amplitudeneinstellungen oben aktiv',
    dataManagement: 'Datenverwaltung',
    exportDatabase: 'Datenbank exportieren',
    shareDatabase: 'Datenbank versenden',
    importDatabase: 'Datenbank importieren',
    statistics: 'Statistik:',
    machines: 'Maschinen',
    recordings: 'Aufnahmen',
    diagnoses: 'Prüfungen',
    clearAllData: 'Alle Daten löschen',
    deleteAllData: 'Alle Daten löschen',
    quickAccessDesc: 'Schneller Zugriff auf kürzlich verwendete Maschinen',
    noMachines: 'Keine Maschinen vorhanden',
    or: 'oder',
    selectMicrophone: 'Mikrofon auswählen',
    microphoneAdvice:
      'Wählen Sie das beste Mikrofon für die Maschinenprüfung. Vermeiden Sie Headsets und Bluetooth-Geräte, da diese für Sprache optimiert sind.',
    manualInput: 'Manuell eingeben',
    machineIdInput: 'Maschinen-ID eingeben',
    continue: 'Weiter',
    qrHint: 'QR-Code oder Barcode in den Rahmen halten',
    codeRecognized: 'Code erkannt!',
    // Banner-Einstellungen
    themeToggle: 'Theme wechseln',
    closeSettings: 'Einstellungen schließen',
    // Room Compensation (Expert only)
    roomCompTitle: 'Raumkompensation',
    roomCompDescription:
      'Kompensiert akustische Raumeinflüsse (Nachhall) für stabilere Ergebnisse in verschiedenen Umgebungen.',
    roomCompEnabled: 'Raumkompensation aktivieren',
    biasMatchEnabled: 'Session Bias Match',
    biasMatchHint:
      'Kompensiert spektrale Unterschiede zwischen Aufnahme-Sessions (verschiedene Räume, Mikro-Positionen). Empfohlen für Raumwechsel.',
    cmnEnabled: 'CMN (experimentell)',
    cmnWarning:
      '⚠️ Kann bei stationären Maschinen den Score verschlechtern. Nutze bevorzugt "Session Bias Match" oder T60/Dereverb.',
    t60Enabled: 'Raumvermessung per Chirp',
    t60Hint: 'Spielt automatisch einen kurzen Ton ab, um die Nachhallzeit zu messen',
    betaLabel: 'Kompensationsstärke (β)',
    roomCompActiveHint: '🔧 Raumkompensation aktiv',
    // Cherry-Picking (Expert only)
    cherryPickTitle: 'Cherry-Picking',
    cherryPickDescription:
      'Filtert transiente Störgeräusche (Hupen, Hämmern, Türen) automatisch aus der Aufnahme.',
    cherryPickEnabled: 'Cherry-Picking aktiviert',
    sigmaLabel: 'Empfindlichkeit (σ)',
    sigmaHint: 'Niedrig = strenger (mehr Frames verworfen), Hoch = toleranter',
    cherryPickActiveHint:
      'Cherry-Picking aktiv: Transiente Störgeräusche werden automatisch erkannt und verworfen.',
    // Reset to Defaults
    resetSection: 'Grundeinstellung',
    resetDescription:
      'Setzt alle Anzeigeoptionen auf den Ausgangszustand zurück. Maschinendaten bleiben erhalten.',
    resetButton: 'Grundeinstellung wiederherstellen',
    resetConfirm: 'Wirklich zurücksetzen?',
    resetSuccess: 'Grundeinstellung wiederhergestellt.',
    resetDescriptionShort: 'Maschinendaten bleiben erhalten.',
  },

  // ============================================================================
  // ROOM MEASUREMENT (Standalone T60 in Settings)
  // ============================================================================
  roomMeasure: {
    title: 'Raummessung',
    description:
      'Misst die Nachhallzeit (T60) deiner aktuellen Umgebung per Chirp-Signal. Halte das Smartphone frei in den Raum (nicht abdecken).',
    measureBtn: 'Raum messen',
    measureAgain: 'Erneut messen',
    measuring: 'Messung läuft...',
    chirpProgress: 'Chirp {{current}}/{{total}}...',
    individual: 'Einzelmessungen',
    stddev: 'Standardabweichung',
    stable: 'stabil',
    unstable: 'instabil',
    veryDry: 'sehr trocken',
    dry: 'trocken',
    medium: 'mittel hallig',
    reverberant: 'hallig',
    veryReverberant: 'sehr hallig',
    classVeryDry: 'Sehr trockener Raum – ideal für Messungen',
    classDry: 'Trockener Raum – gute Bedingungen',
    classMedium: 'Mittel hallig – akzeptable Bedingungen',
    classReverberant: 'Hallig – Ergebnisse können beeinflusst werden',
    classVeryReverberant: 'Sehr hallig – näher an die Maschine gehen',
    errorNoResult:
      'Messung fehlgeschlagen. Mögliche Ursachen:\n• Umgebung zu laut (Maschine abstellen)\n• Smartphone-Lautsprecher zu leise\n• Lautstärke am Gerät erhöhen',
    errorMicPermission:
      'Kein Mikrofon-Zugriff. Bitte erlaube den Zugriff in den Browser-Einstellungen.',
    errorNoMic: 'Kein Mikrofon gefunden.',
    errorGeneric: 'Messung fehlgeschlagen. Bitte versuche es erneut.',
  },

  // ============================================================================
  // NOISE PROFILE SUBTRACTION (Lärmprofil-Subtraktion)
  // ============================================================================
  noiseSub: {
    title: 'Lärmprofil-Subtraktion',
    description:
      'Zieht ein zuvor aufgenommenes Umgebungslärm-Profil (Maschine aus) von der Messung ab. Hilfreich, wenn Hintergrundlärm und Maschine ähnlich laut sind.',
    enabled: 'Lärmprofil-Subtraktion aktivieren',
    profileLabel: 'Aktives Lärmprofil',
    noProfile: 'Kein Profil ausgewählt',
    recordBtn: 'Umgebungslärm aufnehmen',
    recordHint:
      'Wichtig: Maschine ausschalten bzw. noch nicht einschalten. Es werden {{seconds}} Sekunden reiner Umgebungslärm aufgenommen.',
    recording: 'Aufnahme läuft… {{seconds}}s',
    processing: 'Profil wird berechnet…',
    saved: 'Lärmprofil gespeichert.',
    savedUnstable:
      'Profil gespeichert – die Umgebung war während der Aufnahme unruhig. Für ein stabileres Profil erneut aufnehmen, wenn es ruhiger ist.',
    defaultName: 'Lärmprofil {{date}}',
    deleteBtn: 'Profil löschen',
    deleteConfirm: 'Ausgewähltes Lärmprofil wirklich löschen?',
    betaLabel: 'Subtraktionsstärke (β)',
    profileMeta: '{{date}} · {{duration}}s · {{frames}} Frames',
    limitReached:
      'Maximale Anzahl an Profilen erreicht ({{max}}). Bitte zuerst ein altes Profil löschen.',
    errorGeneric: 'Aufnahme fehlgeschlagen. Bitte erneut versuchen.',
    errorMicPermission:
      'Kein Mikrofon-Zugriff. Bitte erlaube den Zugriff in den Browser-Einstellungen.',
    errorNoMic: 'Kein Mikrofon gefunden.',
    rowLabel: 'Lärmprofil',
    incompatible:
      'Lärmprofil passt nicht zur aktuellen Aufnahme-Konfiguration (Sample-Rate) – Subtraktion übersprungen.',
    snrMachineDominates: 'Maschine dominiert',
    snrSimilarLevels: 'Pegel ähnlich – Subtraktion wirksam',
    snrNoiseDominates: 'Hintergrund lauter – Aussagekraft eingeschränkt',
    warnStale: 'Profil {{days}} Tage alt – ggf. neu aufnehmen',
    warnOverlap: 'Profil ähnelt der Maschinensignatur (Nachbarmaschine?)',
    warnDevice: 'Anderes Mikrofon als bei der Profilaufnahme',
    minStatsEnabled: 'Fallback ohne Profil (Minimum-Statistik)',
    minStatsHint:
      'Wenn kein passendes Profil vorliegt, wird der Lärmboden während der Prüfung live aus dem gleitenden Energie-Minimum geschätzt (nur in maschinen-schwachen Frequenzbereichen; braucht eine vorhandene Referenz). Ungenauer als ein echtes Profil.',
    minStatsName: 'Minimum-Statistik (ohne Profil)',
  },

  // ============================================================================
  // ZERO-FRICTION RECORDING (Auto-Machine Creation)
  // ============================================================================
  zeroFriction: {
    // Auto-generated machine names
    autoMachineName: 'Maschine {{number}}',
    // Success toast after silent save
    referenceCreatedToast: 'Normalzustand für {{machineName}} erstellt',
    // Edit button in toast/success screen
    editMachineName: 'Bearbeiten',
    // Prompt for editing machine name after creation
    editMachineNamePrompt: 'Neuen Namen für die Maschine eingeben:',
    // Success after renaming
    machineRenamed: 'Maschine umbenannt zu "{{newName}}"',
    // No machine selected hint (for when starting recording without machine)
    noMachineSelected: 'Keine Maschine ausgewählt – wird automatisch erstellt',
  },

  // ============================================================================
  // AUTO-DETECTION (Simplified "Zustand prüfen" Flow)
  // ============================================================================
  autoDetect: {
    // Primary CTA
    startButton: 'Jetzt prüfen',
    hint: 'Das System erkennt automatisch bekannte Maschinen',

    // Manual selection toggle
    showManualSelection: 'Maschine manuell auswählen',
    hideManualSelection: 'Manuelle Auswahl ausblenden',

    // Listening modal
    listening: 'Höre zu...',
    waitingForSignal: 'Bitte Mikrofon an die Maschine halten',
    initializing: 'Initialisiere...',
    analyzing: 'Analysiere Geräusch...',

    // Fall A: Machine recognized (≥80%)
    machineRecognized: 'Maschine erkannt',
    matchConfidence: 'Übereinstimmung',
    continueAnalysis: 'Weiter prüfen',
    differentMachine: 'Andere Maschine',

    // Fall B: Uncertain match (40-79%)
    uncertainMatch: 'Welche Maschine ist das?',
    selectMachine: 'Bitte wählen Sie die passende Maschine',

    // Fall C: No match (<40%)
    noMatch: 'Dieses Geräusch kenne ich noch nicht',
    noMatchHint: 'Möchten Sie einen Normalzustand aufnehmen?',
    recordReference: 'Normalzustand aufnehmen',
    newMachine: 'Neue Maschine anlegen',
  },

  // ============================================================================
  // NFC WRITER
  // ============================================================================
  nfc: {
    title: 'NFC-Tag beschreiben',
    description: 'Wählen Sie aus, welche Information auf den NFC-Tag geschrieben wird.',
    supportDetails: 'Sicherer Kontext: {{secureContext}} · NDEFReader verfügbar: {{ndefReader}}',
    openWriter: 'NFC-Tag beschreiben',
    writeButton: 'Jetzt schreiben',
    optionGeneric: 'App-Link (generisch)',
    optionGenericDetail: 'Öffnet die App ohne Maschinen-ID.',
    optionSpecific: 'Maschinen-Link',
    optionSpecificDetailDefault: 'Öffnet die App mit der aktuell ausgewählten Maschine.',
    optionSpecificDetail: 'Öffnet die App für "{{name}}" (ID: {{id}}).',
    optionSpecificUnavailable:
      'Wählen Sie zuerst eine Maschine aus, um einen spezifischen Link zu schreiben.',
    hint: 'Halten Sie den NFC-Tag an die Rückseite Ihres Geräts.',
    unavailableHint: 'NFC-Schreiben ist nur in Chrome auf Android verfügbar.',
    statusWriting: 'Schreibe NFC-Tag...',
    statusSuccess: 'NFC-Tag erfolgreich beschrieben.',
    statusCancelled: 'Schreibvorgang abgebrochen.',
    statusError: 'NFC-Tag konnte nicht beschrieben werden.',
    unsupported: 'NFC-Schreiben wird auf diesem Gerät nicht unterstützt.',
    requiresSecureContext: 'NFC-Schreiben erfordert eine sichere (HTTPS) Verbindung.',
    unsupportedBrowser: 'NFC-Schreiben erfordert Chrome auf Android.',
    closeDialog: 'NFC-Dialog schließen',
    // Referenz-Sammlung (im Code weiterhin `customerId`, Parameter `c`).
    //
    // „Kundenkennung" war das falsche Wort für das, was hier passiert: der Name
    // zeigt auf einen Ordner mit Referenzen im Netz, und wer diesen Namen kennt,
    // lädt sie. Das ist kein Kundenkonto, das ist eine geteilte Sammlung — die
    // einzige Stelle, an der SoundFuchs aus einer Einzelmessung etwas Gemeinsames
    // machen kann. Der Schlüsselname bleibt `customerId`, damit gespeicherte
    // Links, NFC-Tags und der HashRouter unberührt bleiben. Siehe
    // docs/geteilte-referenzen.md.
    customerIdLabel: 'Referenz-Sammlung (c)',
    customerIdDescription:
      'Der Name der Sammlung, aus der beim NFC-Scan die Referenzen geladen werden. Eine eigene oder eine geteilte: Wer eine Sammlung veröffentlicht, gibt seinen Normalzustand an alle weiter, die den Namen kennen.',
    customerIdPlaceholder: 'z.B. golf-7-tdi-leerlauf',
    customerIdRequired: 'Bitte einen Namen für die Referenz-Sammlung eingeben.',
    dbUrlPreview: 'Daten-URL: {{url}}',
    // Fleet option
    optionFleet: 'Flotten-Link (Flottencheck)',
    optionFleetDetailDefault: 'Öffnet die App mit einer kompletten Flotte.',
    optionFleetDetail: 'Öffnet die App für Flotte „{{name}}".',
    fleetSelectLabel: 'Flotte auswählen',
    noFleets: 'Keine Flotten vorhanden',
    machine: 'Maschine',
    machines: 'Maschinen',
    fleetRequiresCustomerId: 'Bitte Referenz-Sammlung und Flotte auswählen.',
    // Quick Compare count-only option
    optionQuickCompareCount: 'Schnellvergleich (nur Anzahl)',
    optionQuickCompareCountDetailDefault:
      'Öffnet die App für einen Schnellvergleich mit einer bestimmten Anzahl Maschinen. Kein Internet nötig.',
    optionQuickCompareCountDetail:
      'Öffnet einen Schnellvergleich mit {{count}} Maschinen. Kein Internet nötig.',
    quickCompareCountLabel: 'Wie viele Maschinen?',
    quickCompareCountHint:
      'Kein Internet nötig beim Scannen. Maschinen werden automatisch benannt.',
  },

  // ============================================================================
  // QR CODE GENERATOR
  // ============================================================================
  qrCode: {
    title: 'QR-Code erstellen',
    description:
      'Erstellen Sie einen QR-Code zum Ausdrucken oder Speichern. Einfach an der Maschine anbringen — fertig.',
    openGenerator: 'QR-Code erstellen',
    optionGeneric: 'App-Link (generisch)',
    optionGenericDetail: 'Öffnet die App ohne Maschinen-ID.',
    optionSpecific: 'Maschinen-Link',
    optionSpecificDetailDefault: 'Öffnet die App mit der aktuell ausgewählten Maschine.',
    optionSpecificDetail: 'Öffnet die App für "{{name}}" (ID: {{id}}).',
    optionSpecificUnavailable:
      'Wählen Sie zuerst eine Maschine aus, um einen spezifischen QR-Code zu erstellen.',
    // Siehe die Begründung im NFC-Block oben: Sammlung statt Kunde.
    customerIdLabel: 'Referenz-Sammlung (c)',
    customerIdDescription:
      'Der Name der Sammlung, aus der beim Scan die Referenzen geladen werden — eine eigene oder eine geteilte.',
    customerIdPlaceholder: 'z.B. golf-7-tdi-leerlauf',
    customerIdRequired: 'Bitte einen Namen für die Referenz-Sammlung eingeben.',
    dbUrlPreview: 'Daten-URL: {{url}}',
    urlPreview: 'Link-Vorschau',
    downloadPng: 'Als Bild speichern',
    print: 'Drucken',
    closeDialog: 'QR-Code Dialog schließen',
    generatedFor: 'QR-Code für',
    machineLabel: 'Maschine',
    machineIdLabel: 'ID',
    dateLabel: 'Erstellt am',
    printTitle: 'Maschinen-QR-Code',
    printInstructions: 'QR-Code ausschneiden und an der Maschine anbringen.',
    genericLabel: 'App-Zugang',
    // Fleet option
    optionFleet: 'Flotten-Link (Flottencheck)',
    optionFleetDetailDefault: 'Erstellt einen QR-Code für eine komplette Flotte.',
    optionFleetDetail: 'Erstellt QR-Code für Flotte „{{name}}".',
    fleetSelectLabel: 'Flotte auswählen',
    fleetLabel: 'Flotte',
    fleetPrintTitle: 'Flotten-QR-Code',
    // Quick Compare count-only option
    optionQuickCompareCount: 'Schnellvergleich (nur Anzahl)',
    optionQuickCompareCountDetailDefault:
      'Erstellt QR-Code für einen Schnellvergleich mit einer bestimmten Anzahl Maschinen.',
    optionQuickCompareCountDetail: 'Erstellt Schnellvergleich-QR-Code für {{count}} Maschinen.',
  },

  // ============================================================================
  // REVIEW MODAL
  // ============================================================================
  review: {
    title: 'Aufnahme prüfen',
    subtitle: 'Qualitätskontrolle',
    listenTitle: 'Aufnahme anhören',
    browserNoAudio: 'Ihr Browser unterstützt keine Audio-Wiedergabe.',
    recordingInfo: '{{total}} Sekunden Aufnahme (5s Stabilisierung + {{duration}}s Training)',
    positionImageTitle: 'Gespeichertes Positionsbild',
    savedPositionImage: 'Gespeichertes Positionsbild',
    positionImageCheck: 'Prüfen Sie, ob das Bild die korrekte Position zeigt.',
    qualityTitle: 'Qualitätsbewertung',
    quality: 'Qualität',
    issuesTitle: 'Erkannte Probleme:',
    discardNew: 'Verwerfen / Neu',
    saveAsReference: 'Als Normalzustand speichern',
  },

  // ============================================================================
  // DIAGNOSIS RESULTS MODAL
  // ============================================================================
  diagnosisResults: {
    title: 'Prüfergebnisse',
    fingerprintLabel: 'Fingerprint',
    confidenceScoreLabel: 'Vertrauensscore',
    varianceTitle: 'Varianz',
    frequencyAnomalyLabel: 'Frequenzabweichung',
    analysisHintDefault: 'Hinweis: Leicht erhöhtes Signal um 20 kHz',
    measurementQualityWarning:
      '⚠ Messsignal sehr schwach – Ergebnis kaum verwertbar. Bitte näher an die Maschine und in ruhigerer Umgebung erneut messen.',
    referenceQualityTitle: 'Aufnahmequalität',
    referenceQualityStatusGood: 'GUT',
    referenceQualityDescription: 'Aufnahme erfüllt empfohlene Bedingungen',
    featureModeLabel: 'Feature-Modus',
    viewHistory: 'Verlauf anzeigen',
    closeDialog: 'Prüfung schließen',
  },

  // ============================================================================
  // RESULTS – Ergebnis-Modal Kontext-Hinweise
  // ============================================================================
  results: {
    envMatch: {
      moreReverberant: '🏠 Umgebung halliger als bei Referenz – Score kann beeinflusst sein',
      lessReverberant: '🏠 Umgebung trockener als bei Referenz – Score kann beeinflusst sein',
      critical: '⚠️ Umgebung stark abweichend – Score-Interpretation eingeschränkt',
    },
  },

  // ============================================================================
  // HISTORY CHART MODAL
  // ============================================================================
  historyChart: {
    title: 'Maschinen-Verlauf',
    machineName: 'Maschine',
    dataPoints: 'Datenpunkte',
    timeRange: 'Zeitraum',
    xAxisLabel: 'Zeit',
    yAxisLabel: 'Ähnlichkeits-Score (%)',
    noData: 'Noch keine Historie vorhanden',
    noDataMessage: 'Für diese Maschine sind noch keine Prüfungen gespeichert.',
    errorMessage: 'Fehler beim Laden des Verlaufs.',
    closeDialog: 'Verlauf schließen',
    anomalyListTitle: 'Auffällige Merkmale (letzte Prüfung)',
    anomalyNone: 'Keine auffälligen Merkmale erkannt.',
    tooltipAnomaly: 'Auffällig: {{freq}} ({{strength}}%)',
  },

  // ============================================================================
  // WORK POINT RANKING (Probability Distribution View)
  // ============================================================================
  workPointRanking: {
    title: 'Zustandsanalyse',
    states: 'Zustände',
    ariaLabel: 'Ranking der erkannten Maschinenzustände',
    statusHealthy: 'Normal',
    statusFaulty: 'Fehler',
    noData: 'Keine Analysedaten verfügbar',
    rank: 'Rang',
    probability: 'Wahrscheinlichkeit',
    topMatch: 'Beste Übereinstimmung',
    sectionTitle: 'Detaillierte Zustandsverteilung',
    sectionDescription: 'Wahrscheinlichkeitsverteilung aller trainierten Maschinenzustände',
  },

  // ============================================================================
  // THEME DESCRIPTIONS
  // ============================================================================
  themes: {
    focusTitle: 'Steve Jobs',
    focusDescription:
      'Eine Aktion. Kein Rauschen. Das Wesentliche im Fokus – alles andere tritt zurück.',
    focusDesc: 'Eine Aktion. Kein Rauschen. Klarheit, die funktioniert.',
    daylightTitle: 'Daylight',
    daylightDescription:
      'Helles, blendarmes Design für den Außeneinsatz. Klare Kontraste bleiben in der Sonne lesbar.',
    daylightDesc:
      'Helles, blendarmes Design für den Außeneinsatz. Klare Kontraste bleiben in der Sonne lesbar.',
    brandTitle: 'SoundFuchs',
    brandDescription: 'Hell, freundlich, vertrauenswürdig. KI, der man vertraut.',
    brandDesc: 'Hell, freundlich, vertrauenswürdig. KI, der man vertraut.',
    neonTitle: 'Neon Industrial',
    neonDescription:
      'Kontrastreiches Neon-Design für dunkle Umgebungen. Akzente führen den Blick zu wichtigen Aktionen.',
    neonDesc:
      'Kontrastreiches Neon-Design für dunkle Umgebungen. Akzente führen den Blick zu wichtigen Aktionen.',
  },

  // ============================================================================
  // MACHINE SETUP (NFC Deep Link - Status/Error Messages)
  // Note: Manual URL entry UI was removed - referenceDbUrl is now derived
  // from customerId via HashRouter.buildDbUrlFromCustomerId()
  // ============================================================================
  machineSetup: {
    downloadFailedHint:
      'Referenzdaten konnten nicht geladen werden. Du kannst den Normalzustand direkt an der Maschine aufnehmen — oder den Download erneut versuchen.',
    retryDownload: 'Download erneut versuchen',
    // Validation errors (used by 1-Identify.ts for URL validation)
    urlEmpty: 'Bitte geben Sie einen Referenz-DB-Link ein.',
    urlInvalid: 'Der Link scheint keine gültige URL zu sein.',
    urlNotHttps: 'Der Link muss mit https:// beginnen.',
    urlNotOfficialSource: 'Nur offizielle Datenquellen (gunterstruck.github.io) werden akzeptiert.',

    // Download status (used by HashRouter, 1-Identify.ts, ReferenceLoadingOverlay)
    downloadingReference: 'Referenzdaten werden geladen...',
    statusDownloading: 'Lade Referenzdaten herunter...',
    statusParsing: 'Verarbeite Daten...',
    statusValidating: 'Prüfe Datenformat...',
    statusSaving: 'Speichere lokal...',
    statusComplete: 'Fertig!',

    // Download errors (used by HashRouter, 1-Identify.ts)
    errorMachineNotFound:
      'Maschine nicht eingerichtet. Bitte wenden Sie sich an den Servicetechniker.',
    errorNoReferenceUrl:
      'Keine Referenzdaten hinterlegt. Bitte wenden Sie sich an den Servicetechniker.',
    errorDownloadFailed: 'Download fehlgeschlagen. Bitte überprüfen Sie Ihre Internetverbindung.',
    errorInvalidFormat: 'Die Referenzdaten haben ein ungültiges Format.',
    errorInvalidStructure: 'Die Datenstruktur ist fehlerhaft.',
    errorNoModels: 'Keine Referenzmodelle in den Daten gefunden.',
    errorInvalidModel: 'Ein oder mehrere Referenzmodelle sind fehlerhaft.',
    errorUnknown: 'Ein unbekannter Fehler ist aufgetreten.',

    // Success messages (used by ReferenceLoadingOverlay)
    referenceLoaded: 'Referenzdaten erfolgreich geladen!',

    // Loading overlay (used by ReferenceLoadingOverlay)
    loadingTitle: 'Referenz wird geladen',
    loadingSubtitle: 'Bitte warten...',
    testingBlocked: 'Testen ist erst nach dem Laden der Referenzdaten möglich.',
  },

  // ============================================================================
  // FOOTER
  // ============================================================================
  footer: {
    impressum: 'Impressum',
    privacy: 'Datenschutz',
    about: 'Über SoundFuchs',
    settings: 'Einstellungen',
    closeImpressum: 'Impressum schließen',
    closePrivacy: 'Datenschutzerklärung schließen',
    closeAbout: 'Über SoundFuchs schließen',
  },

  // ============================================================================
  // NFC IMPORT (Deep Link Import via ?importUrl=)
  // ============================================================================
  nfcImport: {
    // Modal
    modalTitle: 'NFC-Backup erkannt',
    warningOverwrite: 'Achtung: Die lokale Datenbank wird überschrieben!',
    currentData: 'Aktuelle Daten',
    newData: 'Neue Daten',
    exportedAt: 'Exportiert am',
    confirmButton: 'Daten importieren',

    // Success
    success: 'Datenbank erfolgreich importiert!',
    successTitle: 'Import abgeschlossen',

    // Errors
    error: 'Import fehlgeschlagen',
    errorTitle: 'Import fehlgeschlagen',
    errorGitHubBlob: 'Fehler: Bitte nutzen Sie den "Raw"-Link von GitHub, nicht den Web-Link.',
    errorFetchFailed: 'Download fehlgeschlagen. Bitte prüfen Sie die URL.',
    errorNotJson:
      'Fehler: Die URL liefert HTML statt JSON.\n\nBitte nutzen Sie den "Raw"-Link von GitHub:\n1. Öffnen Sie die Datei auf GitHub\n2. Klicken Sie auf "Raw"\n3. Kopieren Sie die URL aus der Adressleiste',
    errorInvalidJson: 'Fehler: Die Datei enthält kein gültiges JSON-Format.',
    errorInvalidStructure: 'Fehler: Die Datei hat nicht das erwartete Backup-Format.',
    errorNetwork: 'Netzwerkfehler beim Laden der Daten. Bitte prüfen Sie Ihre Internetverbindung.',
    nfcMergeSuccess:
      '\u2705 Datenbank ergänzt – {{added}} neue Referenzen hinzugefügt, {{skipped}} bereits vorhanden',
    nfcMergeInfo: 'Vorhandene Maschinen und Referenzen bleiben erhalten.',
  },

  // ============================================================================
  // URL IMPORT (Deep Link Import via #/import?url=)
  // ============================================================================
  urlImport: {
    // Status messages (loading overlay)
    statusFetching: 'Datenbank wird geladen...',
    statusValidating: 'Daten werden geprüft...',
    statusImporting: 'Daten werden importiert...',

    // Success
    success: 'Datenbank erfolgreich importiert!',
    successTitle: 'Import abgeschlossen',

    // Errors
    errorTitle: 'Import fehlgeschlagen',
    errorGeneric: 'Import fehlgeschlagen.',
    errorInvalidUrl: 'Ungültige URL.',
    errorFetchFailed: 'Download fehlgeschlagen (HTTP {{status}}).',
    errorFileTooLarge: 'Datei zu groß. Maximale Größe: 50 MB.',
    errorNotJson: 'Die URL liefert HTML statt JSON. Bitte prüfen Sie den Link.',
    errorInvalidJson: 'Die Datei enthält kein gültiges JSON-Format.',
    errorInvalidStructure: 'Die Datei hat nicht das erwartete Datenbank-Format.',
    errorNetwork: 'Netzwerkfehler beim Laden der Daten. Bitte prüfen Sie Ihre Internetverbindung.',
  },

  // ============================================================================
  // ONBOARDING TRACE (Debug Protocol)
  // ============================================================================
  trace: {
    // UI
    title: 'Debug-Protokoll',
    toggle: 'Protokoll ein-/ausklappen',
    copyToClipboard: 'Protokoll kopieren',
    copy: 'Kopieren',
    copied: 'Kopiert!',
    copyFailed: 'Fehler',
    noEntries: 'Noch keine Einträge',

    // Status
    statusRunning: 'Läuft...',
    statusComplete: 'Abgeschlossen',
    statusFailed: 'Fehlgeschlagen',

    // Step labels - these map to TraceStepId
    steps: {
      // Deep Link Processing
      deep_link_detected: 'Deep-Link erkannt',
      hash_parsed: 'Hash geparst',
      machine_id_extracted: 'Maschinen-ID extrahiert',
      customer_id_extracted: 'Referenz-Sammlung erkannt',
      db_url_derived: 'DB-URL abgeleitet',
      import_url_detected: 'Import-URL erkannt',

      // Download Process
      download_started: 'Download gestartet',
      download_complete: 'Download abgeschlossen',
      download_failed: 'Download fehlgeschlagen',

      // JSON Processing
      json_parse_started: 'JSON-Parse gestartet',
      json_parse_complete: 'JSON-Parse erfolgreich',
      json_parse_failed: 'JSON-Parse fehlgeschlagen',

      // Validation
      schema_validation_started: 'Schema-Validierung gestartet',
      schema_validation_complete: 'Schema-Validierung erfolgreich',
      schema_validation_failed: 'Schema-Validierung fehlgeschlagen',

      // Database Operations
      db_reset_started: 'DB-Reset gestartet',
      db_import_started: 'DB-Import gestartet',
      db_import_complete: 'DB-Import abgeschlossen',
      db_import_failed: 'DB-Import fehlgeschlagen',

      // App State
      app_state_reload: 'App-Status neu geladen',

      // Machine Operations
      machine_lookup: 'Maschine wird gesucht',
      machine_found: 'Maschine gefunden',
      machine_not_found: 'Maschine nicht gefunden',
      machine_created: 'Maschine erstellt',
      machine_selected: 'Maschine ausgewählt',

      // Final Steps
      test_dialog_shown: 'Test-Dialog angezeigt',
      process_complete: 'Prozess abgeschlossen',
      process_failed: 'Prozess fehlgeschlagen',
    },
  },

  // ============================================================================
  // BADGES (UI Hints)
  // ============================================================================
  badges: {
    recommended: 'Empfohlen',
    nextStep: 'Nächster Schritt',
  },

  // ============================================================================
  // DATABASE MIGRATION
  // ============================================================================
  migration: {
    title: 'Datenbank-Update',
    dataCleared:
      'Die Datenbank wurde aufgrund eines Updates zurückgesetzt. Alle Maschinen, Aufnahmen und Prüfungen wurden gelöscht.',
  },

  // ============================================================================
  // ABOUT MODAL
  // ============================================================================
  about: {
    title: 'Über SoundFuchs',
    subtitle: 'Assistent für akustischen Vergleich von Maschinenzuständen',

    // Introduction
    intro:
      '<strong>SoundFuchs 2.0</strong> ist eine datenschutzfreundliche Progressive Web App (PWA) für die vergleichende Analyse von Maschinenakustik. Die Anwendung ermöglicht es, Maschinengeräusche vollständig <strong>offline</strong> aufzuzeichnen und miteinander zu vergleichen – ohne Cloud-Dienste, ohne externe Sensoren und ohne trainierte KI-Modelle.<br><br>SoundFuchs versteht sich bewusst <strong>nicht als Diagnosewerkzeug</strong>, sondern als <strong>Vergleichs- und Orientierungsinstrument</strong>, das menschliche Einschätzung unterstützt.',

    // Core Features
    coreFeaturesTitle: 'Kernfunktionen',
    coreFeatures: {
      offlineFirst:
        '<strong>Offline-First:</strong> Alle Aufnahmen und Berechnungen erfolgen lokal im Browser.',
      similarityScore:
        '<strong>Ähnlichkeits-Score (0–100%):</strong> SoundFuchs berechnet eine mathematische Ähnlichkeit (Kosinus-Ähnlichkeit) zwischen Referenz- und Vergleichsaufnahme.',
      userThreshold:
        '<strong>Nutzerdefinierte Schwelle:</strong> Nutzer legen selbst fest, ab welchem Score ein Zustand als „unauffällig" oder „abweichend" gilt.',
      visualFeedback:
        '<strong>Visuelles Spektrum-Feedback:</strong> Echtzeit-Darstellung von Frequenzspektrum und Vergleichsergebnis.',
      noDataLeaks:
        '<strong>Lokale Datenspeicherung:</strong> Alle Audioaufnahmen und Scores werden ausschließlich in der lokalen IndexedDB des Geräts gespeichert.',
    },

    // Technische Abgrenzung
    legalTitle: 'Technische Abgrenzung',
    legalIntro:
      'SoundFuchs wurde unabhängig als <strong>privates, nicht-kommerzielles Open-Source-Projekt</strong> unter der <strong>MIT-Lizenz</strong> entwickelt. Die Funktionalität basiert auf <strong>offen beschriebenen mathematischen Verfahren</strong> (z.B. Frequenzanalyse und GMIA-ähnliche Kosinus-Vergleiche) und integriert <strong>keine patentierte Systemlogik</strong>, <strong>keine Klassifikationsmechanismen</strong> und <strong>keine Lernmodelle</strong>.',

    // IP Table
    ipTableTitle: 'Relevante IP und technische Abgrenzung',
    ipTable: {
      headers: {
        reference: 'Referenz / Titel',
        source: 'Quelle & Status',
        protectedScope: 'Geschützter Bereich',
        soundfuchsDiff: 'Abgrenzung von SoundFuchs',
      },
      rows: {
        '0': {
          reference:
            '<strong>PAPDEOTT005125</strong><br><em>Verfahren zur Diagnose von Maschinen</em>',
          source: 'Defensive Veröffentlichung, Siemens AG, 2016',
          protectedScope:
            'Cloudbasiertes Diagnosesystem mit zentralen Datenbanken und mobilen Sensoren',
          soundfuchsDiff:
            'SoundFuchs arbeitet vollständig lokal, ohne Cloud, ohne zentrale Datenbank, ohne Befundung',
        },
        '1': {
          reference: '<strong>EP3701708B1</strong><br><em>Remote machine condition analysis</em>',
          source: 'Europäisches Patent, Siemens AG, 2022',
          protectedScope: 'ML-basierte Remote-Diagnose mit trainierten Modellen und Sensorik',
          soundfuchsDiff:
            'SoundFuchs verwendet kein Machine Learning, keine Cloud, keine eingebettete Befundungs-Logik',
        },
        '2': {
          reference:
            '<strong>US9263041B2</strong><br><em>Channel detection in noise using GMIA</em>',
          source: 'Siemens Corp., 2016',
          protectedScope: 'Anwendung von GMIA für Sprach- und Hörsysteme',
          soundfuchsDiff:
            'SoundFuchs nutzt GMIA-ähnliche Mathematik ausschließlich für Nicht-Sprache und lokale Vergleiche',
        },
        '3': {
          reference: '<strong>US9443201B2</strong><br><em>Learning of sensor signatures</em>',
          source: 'Siemens, 2016',
          protectedScope: 'Klassifikation und Modelltraining von Sensorsignaturen',
          soundfuchsDiff: 'SoundFuchs führt keine Klassifikation und kein Modelltraining durch',
        },
        '4': {
          reference: '<strong>US9602781B2</strong><br><em>Seismic signal deblending (GMIA)</em>',
          source: 'Schlumberger, 2017',
          protectedScope: 'Trennung seismischer Signale mittels GMIA',
          soundfuchsDiff: 'Unterschiedliche Domäne und Signalart, nicht verwandt',
        },
        '5': {
          reference: '<strong>ABB – Integration of Mobile Measurement</strong>',
          source: 'Öffentliche Industrie-Präsentation, ABB, 2015',
          protectedScope: 'Mobile Sensorik zur ad-hoc Diagnose mit Cloud- und Service-Integration',
          soundfuchsDiff:
            'SoundFuchs vermeidet Befundung, Service-Workflows und Cloud-Anbindung und fokussiert sich auf lokalen Vergleich',
        },
      },
    },

    // Use Cases
    useCasesTitle: 'Anwendungsfälle',
    useCasesIntro:
      'SoundFuchs ermöglicht zwei grundlegende Vergleichsszenarien, die sich in ihrer zeitlichen und räumlichen Struktur unterscheiden:',

    // Serial Comparison
    serialComparisonTitle: 'a) Serieller Vergleich (Zeitlicher Vergleich / Trend)',
    serialComparisonPrinciple:
      '<strong>Prinzip:</strong> Vergleich einer aktuellen Aufnahme mit einer zuvor erstellten Referenz <strong>derselben Maschine</strong>.',
    serialComparisonGoal:
      '<strong>Ziel:</strong> Veränderungen des akustischen Musters über die Zeit sichtbar machen.',
    serialComparisonApplication:
      '<strong>Anwendung:</strong><ul><li>Eine Referenzaufnahme wird zu einem Zeitpunkt erstellt, an dem die Maschine als „unauffällig" bewertet wird</li><li>Spätere Aufnahmen werden mit dieser Referenz verglichen</li><li>Abweichungen vom ursprünglichen Muster werden quantifiziert (Ähnlichkeits-Score)</li></ul>',
    serialComparisonHint:
      '<strong>Hinweis:</strong> SoundFuchs zeigt lediglich <strong>ob und wie stark</strong> sich das aktuelle Geräusch von der Referenz unterscheidet. Die Interpretation, ob eine Abweichung relevant ist, erfolgt durch den Nutzer. Das System trifft keine Diagnose und gibt keine Prognose ab.',

    // Parallel Comparison
    parallelComparisonTitle:
      'b) Paralleler Vergleich (Vergleich baugleicher Maschinen / Flotten-Check)',
    parallelComparisonPrinciple:
      '<strong>Prinzip:</strong> Vergleich mehrerer baugleicher Maschinen unter ähnlichen Betriebsbedingungen.',
    parallelComparisonGoal:
      '<strong>Ziel:</strong> Identifikation akustischer Ausreißer innerhalb einer Gruppe baugleicher Anlagen.',
    parallelComparisonApplication:
      '<strong>Anwendung:</strong><ul><li>Aufnahmen von mehreren baugleichen Maschinen (z. B. in einer Produktionshalle) werden erstellt</li><li>SoundFuchs berechnet die akustische Ähnlichkeit zwischen den Maschinen</li><li>Maschinen, deren Geräuschsignatur deutlich von der Gruppe abweicht, werden sichtbar</li></ul>',
    parallelComparisonSpecial:
      '<strong>Besonderheit:</strong> Funktioniert <strong>auch ohne historische Referenz</strong>. Die Vergleichsbasis bildet die Gruppe selbst.',
    parallelComparisonHint:
      '<strong>Hinweis:</strong> SoundFuchs entscheidet nicht, welche Maschine defekt ist oder welche den „Sollzustand" darstellt. Es zeigt ausschließlich <strong>relative Abweichungen</strong> innerhalb der Gruppe. Die Bewertung, ob eine abweichende Maschine weiter untersucht werden sollte, liegt beim Nutzer.',

    // NFC Section
    nfcTitle: 'NFC-basierter Sofortzugang und kontextbasierter Vergleich',
    nfcIntro:
      'SoundFuchs unterstützt den <strong>Einsatz von NFC-Tags</strong> an Maschinen, um den Zugang zur App zu vereinfachen und optional einen maschinenspezifischen Kontext bereitzustellen.',

    nfcFunctionalityTitle: 'Funktionsweise',
    nfcTagDescription:
      '<strong>NFC-Tag an der Maschine:</strong> Ein am Gehäuse oder an der Zugangsstelle platzierter NFC-Tag kann folgende Informationen enthalten:<ul><li>URL zur SoundFuchs-PWA (direkter App-Start im Browser)</li><li>Maschinen-ID zur automatischen Identifikation</li><li>Optional: Verweis auf kundenspezifische Referenzdaten (URL zu einer JSON-Datei)</li></ul>',
    nfcInstantAccess:
      '<strong>Sofortzugang ohne Installation:</strong><ul><li>Der Nutzer hält das Smartphone an den NFC-Tag</li><li>Die SoundFuchs-PWA öffnet sich direkt im Browser (kein App Store, keine Registrierung erforderlich)</li><li>Optional: Die hinterlegte Maschinen-ID wird automatisch geladen</li></ul>',

    nfcReferenceDataTitle: 'Optionale kontextbasierte Referenzdaten',
    nfcReferenceDataDescription:
      'Der NFC-Tag kann zusätzlich eine <strong>URL zu einer Referenzdatenbank</strong> enthalten. Diese Datenbank wird vom Maschinenbetreiber oder Servicepartner bereitgestellt und kann beinhalten:<ul><li><strong>Referenzaufnahmen</strong> für verschiedene Betriebszustände der Maschine</li><li><strong>Maschinenspezifische Metadaten</strong> (z. B. Typ, Baujahr, Standort)</li><li><strong>Vergleichsparameter</strong> für Flotten-Checks baugleicher Maschinen</li></ul>',

    nfcAdvantageTitle: 'Vorteil für neue oder externe Nutzer',
    nfcAdvantageDescription:
      'Ein Servicetechniker oder Bediener, der die Maschine zum ersten Mal prüft, kann:<ul><li><strong>Sofort eine akustische Prüfung durchführen</strong>, ohne selbst eine Referenz aufnehmen zu müssen</li><li><strong>Direkt gegen vorhandene Referenzdaten vergleichen</strong>, die vom Betreiber bereitgestellt wurden</li><li><strong>Ohne Vorwissen</strong> eine erste Einschätzung treffen, ob das aktuelle Geräusch von der hinterlegten Referenz abweicht</li></ul>',

    nfcDataPrivacyTitle: 'Datenhaltung und Datenschutz',
    nfcDataPrivacyImportant:
      '<strong>Wichtig:</strong> Die Referenzdaten liegen <strong>nicht in einer Cloud von SoundFuchs</strong>. Sie werden bereitgestellt:<ul><li>Im <strong>lokalen Netzwerk</strong> des Betreibers (z. B. Intranet-Server)</li><li>In einer <strong>kundeneigenen Umgebung</strong> (z. B. GitHub Pages, eigener Webserver)</li><li>Als <strong>statische JSON-Datei</strong>, die über eine HTTPS-URL abrufbar ist</li></ul>',
    nfcDataPrivacyStorage:
      'Die Referenzdatenbank wird beim ersten NFC-Scan heruntergeladen und anschließend <strong>lokal im Gerät</strong> gespeichert (IndexedDB). Alle weiteren Vergleiche erfolgen offline.',

    nfcFocusTitle: 'Fokus und Abgrenzung',
    nfcFocusDescription:
      'Der NFC-basierte Zugang dient ausschließlich der <strong>Zugänglichkeit und Vergleichbarkeit</strong>. Er ermöglicht:<ul><li>Schnellen Einstieg ohne manuelle Konfiguration</li><li>Nutzung vorhandener Referenzdaten ohne eigene Aufnahme</li><li>Konsistente Vergleichsbasis bei mehreren Nutzern oder Standorten</li></ul>',
    nfcNoFeatures:
      '<strong>SoundFuchs führt auch bei Nutzung von NFC-basierten Referenzdaten:</strong><ul><li><strong>Keine Befundung</strong> durch (keine Aussage über Schadensursache oder Zustand)</li><li><strong>Keine Automatisierung</strong> von Entscheidungen (kein „Gut/Schlecht"-Urteil)</li><li><strong>Keine Cloud-basierte Auswertung</strong> (alle Berechnungen erfolgen lokal)</li></ul>',
    nfcInterpretation: 'Die Interpretation der Vergleichsergebnisse liegt stets beim Nutzer.',

    // Transparency
    transparencyTitle: 'Transparenz und Intention',
    transparencyText1:
      'SoundFuchs ist <strong>kein Befundungswerkzeug</strong> und trifft <strong>keine automatisierten technischen Bewertungen</strong>. Es stellt ausschließlich eine <strong>visuelle und mathematische Vergleichshilfe</strong> bereit.',
    transparencyText2:
      'Alle Verarbeitungen erfolgen <strong>offline</strong>. Es werden <strong>keine Nutzerdaten übertragen, gespeichert oder ausgewertet</strong>.',
    transparencyText3:
      'Diese Transparenz ist Ausdruck eines bewussten Umgangs mit Verantwortung, Datenschutz und Rechten Dritter.',
    transparencyList: {
      noClassification: 'keine Zustandsklassifikation',
      noCauseAnalysis: 'keine Fehlerursachenanalyse',
      noRepairRecommendations: 'keine Reparaturempfehlungen',
    },

    // Public Instance
    publicInstance: 'Öffentliche Instanz:',
    publicInstanceUrl: 'https://soundfuchs.vercel.app',

    // Version Info
    version: 'Version:',
    versionNumber: '2.0.0 (2026)',
    developedBy: 'Entwickelt von:',
    developerName: 'Günter Struck',
    license: 'Lizenz:',
    licenseType: 'MIT',
    stack: 'Technologie-Stack:',
    stackTech: 'TypeScript, Vite, Web Audio API',

    // Guiding Principle
    guidingPrincipleTitle: 'Leitgedanke',
    guidingPrincipleQuestion: 'Hört sich die Maschine normal an?',
    guidingPrincipleStatement: 'Smartphones hören Maschinenklänge.',
  },

  // ============================================================================
  // DRIFT DETECTOR (Change Analysis)
  // ============================================================================
  // EREIGNIS-ZEITLEISTE (Tier 2 Temporal-Engine, T2-a2)
  // ============================================================================
  // 3D-SPEKTROGRAMM "GEBIRGE" (Verlaufs-Modal, Expert)
  // ============================================================================
  // ============================================================================
  // MERKMALS-LAYOUT: Referenz passt nicht zur aktuellen Bandaufteilung
  // ============================================================================
  models: {
    layoutOutdatedTitle: 'Referenz nicht mehr vergleichbar',
    layoutOutdated:
      'Die Bandaufteilung der Analyse hat sich geändert. {{count}} gespeicherte Referenz(en) dieser Maschine stammen aus der alten Aufteilung und lassen sich nicht mehr vergleichen. Bitte Normalzustand neu aufnehmen.',
    layoutOutdatedPartial:
      '{{count}} Referenz(en) aus der alten Bandaufteilung werden übersprungen. Für ein vollständiges Bild neu anlernen.',
  },

  spectro3d: {
    show: '3D-Ansicht (Gebirge)',
    hide: '3D-Ansicht schließen',
    hint: '1 Finger: drehen · 2 Finger: zoomen',
    axis: 'Achsen: Frequenz (logarithmisch) · Zeit · Höhe = Intensität (dB)',
    sourceMeasurement: 'Messung',
    sourceReference: 'Referenz',
    sourceDifference: 'Differenz',
    computing: '… rechne …',
    unavailable: 'Für diese Aufnahmen lässt sich keine Ansicht bilden.',
  },

  // ============================================================================
  // ERGEBNIS ALS BILD TEILEN
  // ============================================================================
  share: {
    resultButton: 'Als Bild teilen',
    resultFooter: 'SoundFuchs Klang-Prüfung',
    resultFailed: 'Das Bild konnte nicht erstellt werden.',
  },

  // ============================================================================
  temporalEvents: {
    title: 'Ereignis-Zeitleiste',
    legendKnown: 'bekannt',
    legendAnomalous: 'anomal',
    noEvents: 'Noch keine Ereignisse erkannt',
    rateLine: 'Ereignisse/min: {{observed}} · Referenz: {{expected}}',
    densityMissing: 'Erwarteter Takt fehlt: deutlich weniger Ereignisse als in der Referenz.',
    densityExcess: 'Deutlich mehr Ereignisse als in der Referenz (Fremdgeräusche?).',
    cycleLine: 'Zyklus: {{period}} s · Formabweichung: {{status}}',
    cycleOk: 'ok',
    cycleDeviant: 'hoch',
    cyclePending: 'wird beobachtet …',
    recommendTitle: 'Nicht-stationäre Maschine erkannt',
    recommendBody:
      'Diese Maschine klingt nicht-stationär (bewegter Pegel, Takt oder Zyklus). Die Zeitmuster-Engine (Tier 2) ist dafür gebaut.',
    recommendAction: 'Zeitmuster-Engine aktivieren',
    recommendSwitched: 'Zeitmuster-Engine aktiviert — sie gilt für neu angelernte Referenzen.',
  },

  // ============================================================================
  drift: {
    // Settings
    settingsTitle: '\uD83D\uDD0D Änderungsanalyse',
    settingsDescription:
      'Analysiert ob Score-Änderungen durch die Umgebung (Raum) oder die Maschine verursacht werden. Zeigt während der Prüfung eine separate Bewertung an.',
    enabled: 'Änderungsanalyse aktiviert',
    howItWorks:
      'Das System trennt spektrale Änderungen in zwei Komponenten: Glatte, breitbandige Drift (= Raum/Umgebung) und lokale, schmalbandige Änderungen (= Maschine). So siehst du, ob ein Score-Abfall vom Raum oder von der Maschine kommt.',
    smoothWindow: 'Glättungsfenster',
    smoothHint:
      'Größer = mehr Trennung zwischen Raum und Maschine. Kleiner = empfindlicher für Raumeigenheiten.',
    lowFreqCutoff: 'Tieffrequenz-Schutz',
    lowFreqHint:
      'Bins unterhalb werden für die Maschinen-Analyse ignoriert. Schützt vor Raummoden im Bass, die sonst als Maschinenänderung fehlgedeutet werden. 0 = kein Schutz.',
    globalThreshold: 'Umgebungs-Empfindlichkeit',
    globalThresholdHint: 'Niedrig = warnt früher bei Umgebungswechsel. Hoch = toleranter.',
    localThreshold: 'Maschinen-Empfindlichkeit',
    localThresholdHint: 'Niedrig = erkennt kleine Maschinenänderungen. Hoch = toleranter.',

    // Diagnose Panel
    title: 'Änderungsanalyse',
    environment: 'Umgebung',
    machine: 'Maschine',

    // Global Status
    globalOk: 'Umgebung konsistent',
    globalWarning: 'Umgebung leicht verändert',
    globalCritical: 'Umgebung stark verändert',

    // Local Status
    localOk: 'Keine strukturelle Änderung',
    localWarning: 'Leichte Änderung erkannt',
    localCritical: 'Deutliche Änderung erkannt',

    // Interpretations
    allOk: '\u2705 Umgebung und Maschine konsistent zur Referenz',
    roomChange: '\uD83D\uDFE1 Umgebungsänderung erkannt – Maschine unverändert',
    machineChange: '\uD83D\uDD34 Maschinenänderung erkannt – Maschine prüfen',
    both: '\uD83D\uDFE0 Umgebung und Maschine verändert – Ergebnis mit Vorsicht interpretieren',
    uncertain:
      '\uD83D\uDFE1 Unklare Situation – näher an Maschine messen oder neue Referenz erstellen',

    // Recommendations
    recommendRoom:
      'Score-Abfall wahrscheinlich durch Umgebung oder Mikrofonposition verursacht. Näher an Maschine messen, gleiche Position wie bei Referenz wählen, oder Referenz in dieser Umgebung neu erstellen.',
    recommendMachine: 'Strukturelle Änderung an der Maschine erkannt. Wartung prüfen.',
    recommendBoth:
      'Sowohl Umgebung als auch Maschine verändert. Für zuverlässiges Ergebnis: Referenz in aktueller Umgebung neu erstellen.',
    recommendUncertain:
      'Für klareres Ergebnis: Näher an Maschine messen, gleiche Position wie bei Referenz wählen, oder Referenz in aktueller Umgebung erstellen.',

    // Contextual hints
    roomChangeButScoreOk:
      '\uD83D\uDCA1 Umgebungsänderung erkannt, aber Score stabil – das ist ein gutes Zeichen.',
    roomChangeMayCauseScoreDrop:
      '\uD83D\uDCA1 Score-Abfall könnte durch Umgebung oder Mikrofonposition verursacht sein, nicht durch die Maschine. Gleiche Position wie bei Referenz wählen oder Referenz hier neu erstellen.',
    machineChangeDetected:
      '\u26A0\uFE0F Strukturelle Änderung an der Maschine erkannt. Bitte prüfen.',

    // Reference phase
    referenceHint:
      '\uD83D\uDCA1 Änderungsanalyse aktiv: Diese Aufnahme definiert auch die Referenz-Umgebung und Mikrofonposition. Spätere Prüfungen zeigen ob sich die Umgebung oder die Maschine verändert hat.',
    referenceStored:
      '\u2705 Umgebungsprofil gespeichert. Bei zukünftigen Prüfungen wird automatisch analysiert ob Änderungen von der Umgebung oder der Maschine kommen.',

    // Sprint 2 UX: Simplified drift summary (Advanced view)
    initializing: 'Umgebungsanalyse läuft…',
    summaryOk: 'Umgebung stabil',
    summaryRoomChange: 'Umgebung verändert – Score kann abweichen',
    summaryMachineChange: 'Maschinengeräusch hat sich verändert',
    summaryBoth: 'Umgebung und Maschine verändert',
    summaryUncertain: 'Umgebungsanalyse noch nicht aussagekräftig',
  },

  // Sprint 2 UX: Contextual help texts (InfoBottomSheet)
  help: {
    reference: {
      title: 'Was ist der Normalzustand?',
      body: '<p>Der Normalzustand ist eine 10-Sekunden-Aufnahme deiner Maschine bei normalem Betrieb.</p><p>Alle zukünftigen Prüfungen vergleichen gegen diesen Zustand. Je besser die Aufnahme, desto genauer die Erkennung von Veränderungen.</p><p><strong>Tipp:</strong> Nimm den Normalzustand bei normalem Betrieb auf und bewege das Smartphone langsam um die Maschine, damit Umgebungseinflüsse herausgerechnet werden können.</p>',
    },
    diagnose: {
      title: 'Was passiert bei „Zustand prüfen"?',
      body: '<p>Die App nimmt das aktuelle Maschinengeräusch auf und vergleicht es mathematisch mit der gespeicherten Referenz.</p><p>Das Ergebnis ist ein Ähnlichkeits-Score (0–100%). 100% bedeutet: Die Maschine klingt genau wie bei der Referenzaufnahme.</p><p>Ein sinkender Trend über mehrere Messungen ist aussagekräftiger als ein einzelner Wert.</p>',
    },
    machines: {
      title: 'Warum eine Maschine anlegen?',
      body: '<p>Jede Maschine hat ein eigenes akustisches Profil. Durch das Anlegen einer Maschine mit eindeutigem Namen können Referenzen und Prüfhistorie zugeordnet werden.</p><p>So siehst du den zeitlichen Verlauf und erkennst Veränderungen frühzeitig.</p>',
    },
    viewLevel: {
      title: 'Ansichtsmodus',
      body: '<p><strong>Basic:</strong> Einfache Ampel-Anzeige. Für den täglichen Einsatz durch Bediener.</p><p><strong>Advanced:</strong> Zusätzliche Details wie Spektrogramm und Umgebungsüberwachung. Für Wartungspersonal.</p><p><strong>Expert:</strong> Volle technische Ansicht mit DSP-Parametern und Debug-Informationen. Für Ingenieure.</p>',
    },
    spectrogram: {
      title: 'Was zeigt das Spektrogramm?',
      body: '<p>Das Spektrogramm zeigt die Frequenzverteilung des Maschinengeräuschs in Echtzeit.</p><p>Die horizontale Achse zeigt die Zeit, die vertikale die Frequenz. Helle Bereiche bedeuten hohe Energie bei dieser Frequenz.</p><p>Veränderungen im Muster können auf mechanische Probleme hinweisen (z.B. Lagerschäden erzeugen neue Frequenzbänder).</p>',
    },
    drift: {
      title: 'Was ist Drift-Erkennung?',
      body: '<p>Die Drift-Erkennung überwacht, ob sich die Umgebung oder die Maschine seit der Referenzaufnahme verändert hat.</p><p><strong>Umgebungs-Drift:</strong> Position, Temperatur, Hall – kann den Score beeinflussen, ohne dass die Maschine defekt ist.</p><p><strong>Maschinen-Drift:</strong> Tatsächliche Veränderung im Maschinengeräusch.</p><p>Die Unterscheidung hilft, Fehlalarme zu vermeiden.</p>',
    },
    // Sprint 5 UX: Fleet check help texts
    fleet: {
      title: 'Was ist der Flottencheck?',
      body: '<p>Der <strong>Flottencheck</strong> vergleicht mehrere baugleiche Maschinen miteinander – z.B. 24 Pumpen derselben Baureihe.</p><p>Statt den zeitlichen Verlauf einer einzelnen Maschine zu zeigen (das macht die Übersicht), zeigt der Flottencheck ein <strong>Ranking</strong>: Welche Maschine weicht vom Rest ab?</p><p><strong>Wann nutzen?</strong> Wenn Sie vor Ort viele gleichartige Maschinen haben und schnell die „schwarzen Schafe" finden wollen.</p><p><strong>Tipp:</strong> Weisen Sie Maschinen eine Flottengruppe zu (z.B. „Fernwärme Ost"), damit sie automatisch zusammen verglichen werden.</p>',
    },
    fleetRanking: {
      title: 'Ranking verstehen',
      body: '<p>Jeder <strong>Balken</strong> zeigt den Ähnlichkeits-Score einer Maschine (0–100%). Maschinen sind sortiert: niedrigster Score oben.</p><p><strong>Orange markierte</strong> Maschinen weichen statistisch vom Rest ab. Orange heißt: „Diese Maschine klingt anders als ihre Geschwister."</p><p><strong>Median:</strong> Der mittlere Score aller Maschinen – robuster als ein Durchschnitt.</p><p><strong>Spannweite:</strong> Differenz zwischen bestem und schlechtestem Score. Große Spannweite = mindestens eine Maschine weicht deutlich ab.</p><p><strong>Tipp:</strong> Tippen Sie auf eine Maschine im Ranking, um deren Prüfung zu starten.</p>',
    },
    // Sprint 9: Fleet Quick Check help
    fleetQuickCheck: {
      title: 'Flotten-Schnellcheck',
      body:
        '<p><strong>Was ist das?</strong> Prüfen Sie mehrere baugleiche Maschinen in einem Durchgang. Die App vergleicht die Geräusche und zeigt Ihnen sofort, welche Maschine anders klingt – das „schwarze Schaf".</p>' +
        '<p><strong>Wann nutze ich das?</strong> Wenn Sie vor mehreren gleichen Maschinen stehen (z.B. 5 Pumpen in einer Reihe) und schnell wissen wollen, ob eine davon auffällig ist.</p>' +
        '<p><strong>Wie funktioniert es?</strong></p>' +
        '<p>• <strong>Flotte vorhanden:</strong> Wählen Sie eine gespeicherte Flotte – die App führt Sie Maschine für Maschine durch.</p>' +
        '<p>• <strong>Keine Flotte:</strong> Kein Problem! Die App erstellt automatisch Maschinen, Sie nehmen nur auf. Hinterher können Sie das Ergebnis als Flotte speichern.</p>' +
        '<p><strong>Unterschied zur Einzelprüfung:</strong> „Jetzt prüfen" vergleicht eine Maschine mit ihrer eigenen Referenz (Trend über Zeit). Der Flotten-Schnellcheck vergleicht mehrere Maschinen untereinander (Ausreißer finden).</p>',
    },
  },

  // Sprint 2 UX: Smart Start visual ready moment
  smartStartReady: {
    signalDetected: '✅ Signal erkannt – Analyse startet',
  },

  // ============================================================================
  // SPRINT 4 UX: FLEET CHECK MODE
  // ============================================================================
  fleet: {
    toggle: {
      series: 'Übersicht',
      fleet: 'Flottencheck',
    },
    group: {
      label: 'Flottengruppe (optional)',
      hint: 'z.B. „Fernwärme Ost" – Maschinen mit gleicher Gruppe werden verglichen',
      recent24h: 'Letzte 24 Stunden',
      noMachines: 'Keine Maschinen für Flottencheck',
      noMachinesHint:
        'Führen Sie Prüfungen durch oder weisen Sie Maschinen einer Flottengruppe zu.',
    },
    ranking: {
      noData: 'Nicht geprüft',
      minimumHint: 'Mindestens 2 Maschinen für einen aussagekräftigen Flottenvergleich nötig.',
    },
    stats: {
      median: 'Median',
      worst: 'Schlechteste',
      spread: 'Spannweite',
    },
    quickSave: {
      hint: 'Quick Fleet – wird morgen nicht mehr angezeigt.',
      button: 'Als Flotte speichern…',
      prompt: 'Flottenname eingeben (z.B. „Fernwärme Ost"):',
      success: '{{count}} Maschinen als „{{name}}" gespeichert.',
    },
    // Sprint 5 UX: Context-sensitive CTA
    cta: {
      newFleet: 'Neue Flotte',
    },
    // Sprint 5 UX: Fleet creation modal
    create: {
      title: 'Neue Flotte erstellen',
      nameLabel: 'Flottenname',
      namePlaceholder: 'z.B. Fernwärme Ost',
      selectMachines: 'Maschinen auswählen (min. 2)',
      goldStandard: 'Gold-Standard (optional)',
      goldHint: 'Welche Maschine dient als Referenz für die gesamte Flotte?',
      goldNone: 'Kein Gold-Standard (jede Maschine nutzt eigene Referenz)',
      createButton: 'Flotte erstellen',
      success: 'Flotte „{{name}}" mit {{count}} Maschinen erstellt.',
      noMachines: 'Keine Maschinen vorhanden. Legen Sie zuerst Maschinen an.',
    },
    // Sprint 5 UX: Fleet diagnosis queue
    queue: {
      startButton: '{{count}} Maschinen prüfen',
      progress: '{{name}} ({{current}} von {{total}})',
      complete: 'Flottencheck abgeschlossen: {{count}} Maschinen in „{{name}}" geprüft.',
      completePartial:
        '{{checked}} von {{total}} Maschinen geprüft ({{skipped}} übersprungen) – {{name}}',
      cancelled: 'Flottencheck abgebrochen.',
      resumed: 'Flottencheck fortgesetzt.',
      // Sprint 6: Guided fleet check
      guided: {
        goTo: 'Geh zu:',
        startRecording: '\u25B6 Aufnahme starten',
        skip: '\u00DCberspringen',
        machineOf: '{{current}} von {{total}}',
        waitingForUser: 'Bereit? Halte das Smartphone an die Maschine.',
      },
    },
    // Onboarding Splash (after NFC fleet provisioning)
    onboarding: {
      title: 'Flottencheck – {{count}} Maschinen',
      titleSingular: 'Flottencheck – 1 Maschine',
      concept: 'Klingt eine Maschine anders als die anderen? Diese App findet es heraus.',
      method:
        'Sie nehmen jede Maschine kurz auf – die App vergleicht die Geräusche und zeigt Ihnen das \u201Eschwarze Schaf\u201C.',
      howTo: 'So geht\u2019s:',
      step1: 'Zur angezeigten Maschine gehen',
      step2: 'Smartphone nah an die Maschine halten',
      step3: '\u201EAufnahme starten\u201C tippen',
      step4: '10 Sek. still halten – fertig',
      startButton: 'Erste Maschine',
      noMachines: 'Keine Maschinen in der Flotte.',
    },
    // Sprint 5 UX: Gold Standard badge
    goldStandard: {
      badge: 'Gold-Standard (Referenz für die Flotte)',
      deleted:
        'Gold-Standard „{{name}}" gelöscht – {{count}} Maschinen nutzen jetzt eigene Referenz.',
    },
    // Fleet NFC/QR provisioning: Export
    export: {
      button: 'Flotte exportieren',
      success: 'Flotte „{{name}}" exportiert. Datei auf GitHub Pages hochladen für NFC/QR.',
      failed: 'Flotten-Export fehlgeschlagen.',
    },
    // Fleet NFC/QR provisioning: Import
    provision: {
      success: 'Flotte „{{name}}" eingerichtet: {{created}} erstellt, {{updated}} aktualisiert.',
      alreadyExists:
        'Flotte „{{name}}" ist bereits vorhanden ({{skipped}} Maschinen übersprungen).',
      downloading: 'Flotte wird geladen…',
      error: 'Flotte konnte nicht geladen werden.',
      offline:
        'Keine Internetverbindung. Bitte verbinden Sie sich mit dem Netzwerk und scannen Sie den Tag erneut.',
      rollbackComplete: 'Import fehlgeschlagen – Änderungen rückgängig gemacht.',
      updateRecommended:
        'Die Flotten-Datei wurde mit einer neueren App-Version erstellt. App-Update empfohlen.',
      skippedDifferentFleet: '„{{name}}" gehört zu Flotte „{{fleet}}" – nicht umgehängt.',
    },
    // Fleet Result Modal (after fleet queue completes)
    result: {
      title: 'Flotten-Ergebnis',
      complete: 'Flottencheck abgeschlossen',
      completeWithOutliers: 'Flottencheck abgeschlossen – Ausreißer erkannt',
      summary: '„{{name}}" · {{checked}} von {{total}} geprüft',
      summarySkipped: '{{skipped}} übersprungen',
      statsMedian: 'Median',
      statsSpread: 'Spannweite',
      statsWorst: 'Schlechteste',
      rankingTitle: 'Ranking',
      notChecked: 'Nicht geprüft',
      save: 'Ergebnisse speichern',
      discard: 'Verwerfen',
      discardConfirm:
        'Prüfungen dieses Durchlaufs wirklich löschen? Die Maschinen und Referenzen bleiben erhalten.',
      discardDone: '{{count}} Prüfungen verworfen',
      viewHistory: 'Verlauf anzeigen',
      closeAndContinue: 'Weiter',
    },
    // Fleet History Modal
    history: {
      title: 'Flottencheck-Verlauf',
      subtitle: '{{name}}',
      date: 'Datum',
      median: 'Median',
      spread: 'Spannweite',
      checked: 'Geprüft',
      noTrend: 'Noch kein Trend – erst nach mehreren Flottenprüfungen verfügbar.',
      close: 'Schließen',
    },
  },

  // ============================================================================
  // SPRINT 7: QUICK COMPARE (Schnellvergleich)
  // ============================================================================
  quickCompare: {
    startButton: 'Schnellvergleich',
    hint: 'Maschinen vergleichen – ohne Setup',
    wizard: {
      title: 'Schnellvergleich',
      howMany: 'Wie viele Maschinen willst du vergleichen?',
      customCount: 'Eigene Anzahl',
      explanation:
        'Geh der Reihe nach zu jeder Maschine und nimm sie auf. Die erste Aufnahme wird automatisch als Vergleichsbasis verwendet.',
      next: 'Weiter',
      minMachines: 'Mindestens 2 Maschinen',
      maxMachines: 'Maximal 30 Maschinen',
    },
    reference: {
      title: 'Normalzustand aufnehmen',
      instruction: 'Erste Maschine aufnehmen',
      hint: 'Wird automatisch als Vergleichsbasis verwendet.',
      startRecording: 'Normalzustand aufnehmen',
      saved: 'Normalzustand gespeichert',
      goldName: 'Referenz (Gold)',
      recordingHint: 'Nimm jetzt den Normalzustand auf.',
    },
    compare: {
      goTo: 'Geh zu:',
      machineOf: 'Maschine {{current}} von {{total}}',
      startRecording: 'Aufnahme starten',
      skip: 'Überspringen',
      hint: 'Halte das Smartphone an die Maschine.',
    },
    result: {
      title: 'Ergebnis',
      summary: '{{checked}} von {{total}} Maschinen geprüft',
      allGood: 'Alle Maschinen im Normalbereich',
      outlierFound: '{{count}} Maschine(n) weichen ab',
      notChecked: 'Nicht geprüft',
      goldLabel: 'Vergleichsbasis',
      saveAsFleet: 'Als Flotte speichern',
      saveFleetName: 'Flottenname (optional):',
      saveFleetPlaceholder: 'z.B. Fernwärme Ost',
      defaultFleetName: 'Schnellvergleich {{date}}',
      fleetSaved: 'Flotte „{{name}}" mit {{count}} Maschinen gespeichert.',
      done: 'Fertig',
      rename: 'Umbenennen',
      cleanup: 'Testdaten löschen',
      cleanupConfirm: '{{count}} Maschinen aus diesem Schnellvergleich löschen?',
      cleanupDone: '{{count}} Maschinen gelöscht',
    },
    // NFC-triggered quick compare onboarding splash
    nfcOnboarding: {
      title: 'Schnellvergleich – {{count}} Maschinen',
      titleSingular: 'Schnellvergleich – 1 Maschine',
      concept: 'Klingt eine Maschine anders als die anderen? Diese App findet es heraus.',
      method:
        'Gehen Sie der Reihe nach zu jeder Maschine und nehmen Sie sie kurz auf. Die App vergleicht alle Geräusche und zeigt Ihnen, welche anders klingt.',
      startButton: 'Los geht\u2019s',
      minMachines: 'Mindestens 2 Maschinen für einen Schnellvergleich nötig.',
      // UX improvement: time estimate and privacy hint
      timeEstimate: 'Dauer: ca. {{minutes}} Minuten für {{count}} Maschinen.',
      privacyHint:
        'Mikrofon und Kamera werden nur zur Analyse genutzt. Alle Daten bleiben auf Ihrem Gerät.',
    },
    // UX improvement: Guided prompt hints
    guidedPrompt: {
      referenceHint: 'Diese Aufnahme wird als Vergleichsbasis verwendet.',
      positionInstruction:
        'Smartphone ca. 10–20 cm nah an die Maschine halten. Bitte wenig sprechen.',
      positionMemory: 'Tipp: Merken Sie sich die Stelle – bei allen Maschinen gleiche Position.',
      noiseHint: 'Bitte möglichst wenig sprechen oder bewegen während der Aufnahme.',
    },
    // UX improvement: Inspection modal in reference mode
    inspectionReference: {
      mainQuestion: 'Normalzustand wird aufgenommen...',
      subtitle: 'Diese Aufnahme wird als Vergleichsbasis gespeichert.',
      scorePlaceholder: 'Normalzustand – kein Vergleich',
      comparingWith: 'Vergleich mit {{name}} läuft...',
    },
    // UX improvement: Ghost overlay hint
    ghostOverlay: {
      hint: 'Positionierhilfe: Livebild am halbtransparenten Umriss ausrichten.',
    },
    // UX improvement: One-time score explanation
    scoreExplanation: {
      hint: '{{score}}% = Ähnlichkeit zur Referenz. Grün = unauffällig, Orange = prüfen, Rot = auffällig.',
    },
    // UX improvement: Result screen context
    resultContext: {
      allGood: 'Alle Maschinen klingen ähnlich – keine Auffälligkeiten.',
      outlierWarning: 'Achtung: {{name}} weicht deutlich ab. Empfehlung: genauer prüfen.',
      outlierWarningMultiple:
        'Achtung: {{count}} Maschinen weichen deutlich ab. Empfehlung: genauer prüfen.',
      fleetSaveHint: 'Gespeicherte Flotten ermöglichen regelmäßige Checks mit Positionierhilfe.',
    },
  },

  // Welle 2 UX: Status Dashboard
  dashboard: {
    totalMachines: 'Maschinen',
    healthy: 'unauffällig',
    warning: 'Abweichung',
    critical: 'auffällig',
    unchecked: 'nicht geprüft',
    checkNow: 'Jetzt prüfen',
    attentionPrefix: 'Prüfung erwägen',
    lastCheck: 'Letzte Prüfung',
  },

  // Welle 2 UX: Ampel-Banner im Ergebnis
  resultAmpel: {
    explanationHealthy: 'Die Maschine klingt wie erwartet.',
    explanationWarning: 'Die Maschine klingt anders als beim Normalzustand.',
    explanationCritical: 'Die Maschine weicht deutlich vom Normalzustand ab.',
    trendStable: 'Stabil seit {{count}} Prüfungen',
    trendImproving: '{{delta}}% seit {{count}} Prüfungen',
    trendDeclining: '{{delta}}% seit {{count}} Prüfungen',
    // Auflösung DIESER Referenz — was der Vergleich trennen kann. Der Satz sagt
    // absichtlich, was SoundFuchs LEISTET, nicht nur was es nicht tut: „ich
    // diagnostiziere nicht" ist ohne diese Zahl bloß eine Ausrede.
    resolution:
      'Auflösung dieser Referenz: {{points}} Punkte. Kleinere Abstände sind Streuung der Messung, nicht der Maschine.',
    resolutionUnknown:
      'Auflösung dieser Referenz unbekannt — sie wurde angelernt, bevor die Eigenstreuung gemessen wurde. Neu anlernen sagt, welche Unterschiede der Vergleich trennt.',
    resolutionDetail:
      'Aus der Wiederholstreuung der Referenz „{{label}}" selbst: {{k}} · MAD ihrer Selbsttest-Scores, auf die angezeigte Skala gestreckt. Keine Schwelle — die Ampel entscheidet unverändert.',
  },

  // Welle 2 UX: Result action buttons
  resultActions: {
    details: 'Details',
    newCheck: 'Neue Prüfung',
    reportMaintenance: 'Auffälligkeit melden',
    copiedToClipboard: 'Prüfbericht in Zwischenablage kopiert',
    maintenanceReportTitle: 'Prüfbericht',
    machine: 'Maschine',
    score: 'Score',
    status: 'Status',
    date: 'Datum',
    recommendation: 'Empfehlung',
  },

  // ============================================================================
  // REFERENZ-SAMMLUNG TEILEN (Maschinen-Detail)
  // ============================================================================
  shareCollection: {
    button: '📤 Sammlung teilen',
    hint: 'Gibt die Referenzen dieser Maschine als Datei heraus. Unter <name>/db-latest.json veröffentlicht, kann sie jeder laden, der den Sammlungsnamen kennt.',
    working: '… bereite vor …',
    doneTitle: 'Sammlung bereit',
    done: 'Datei erstellt. Als db-latest.json in den Ordner der Sammlung legen — dann laden andere sie über den Sammlungsnamen.',
    failed: 'Die Sammlung konnte nicht herausgegeben werden.',
  },

  // ============================================================================
  // WELLE 3: HISTORY MODAL + UNIFIED FLOW
  // ============================================================================
  history: {
    openHistory: 'Verlauf von {{name}} anzeigen',
    viewHistory: 'Verlauf',
    diagnosisCount: '{{count}} Prüfungen',
    noDiagnoses: '{{name}} hat noch keine Prüfungen.',
    noMatchingDiagnoses: 'Keine Prüfungen für diesen Filter.',
    filterAll: 'Alle',
    filter7d: '7 Tage',
    filter30d: '30 Tage',
    filterAbnormal: 'Auffällige',
    chartAriaLabel: 'Verlaufschart mit {{count}} Datenpunkten',
    stableVsPrevious: 'stabil zur Vorprüfung',
    vsPrevious: 'zur Vorprüfung',
    detectedState: 'Erkannter Zustand',
  },

  // ============================================================================
  // WELLE 4: REPORT EXPORT (SV1)
  // ============================================================================
  report: {
    exportButton: 'Bericht exportieren',
    formatChoiceTitle: 'Bericht-Format',
    formatPDF: 'PDF (Druckbar)',
    formatCSV: 'CSV (Excel)',
    formatJSON: 'JSON (Ticketsystem)',
    title: 'SoundFuchs Prüfbericht',
    fleetTitle: 'Flottencheck-Bericht',
    allMachinesTitle: 'Maschinenübersicht',
    totalLabel: 'Gesamt',
    healthyLabel: 'Unauffällig',
    warningLabel: 'Abweichung',
    criticalLabel: 'Auffällig',
    medianLabel: 'Median',
    colMachine: 'Maschine',
    colScore: 'Score',
    colStatus: 'Status',
    colTrend: 'Trend',
    colRecommendation: 'Empfehlung',
    colDate: 'Datum',
    footer: 'Erstellt mit SoundFuchs · Akustische Maschinenprüfung',
    exported: 'Bericht exportiert',
  },

  // ============================================================================
  // WELLE 4: MAINTENANCE INTEGRATION (SV3)
  // ============================================================================
  maintenance: {
    exportTitle: 'Auffälligkeit melden',
    copyToClipboard: 'In Zwischenablage kopieren',
    exportJSON: 'JSON-Bericht herunterladen',
    exportCSV: 'CSV-Bericht herunterladen',
    reportButton: 'Auffälligkeit melden',
    reportTitle: 'Prüfbericht',
  },

  // ============================================================================
  // WELLE 4: TREND ANALYSIS (SV4)
  // ============================================================================
  trendAnalysis: {
    criticalDecline:
      'Score sinkt stark seit {{count}} Prüfungen ({{from}}% → {{to}}%). Sofortige Prüfung erwägen.',
    declining: 'Score sinkt seit {{count}} Prüfungen ({{from}}% → {{to}}%). Beobachten.',
    improving: 'Score steigt seit {{count}} Prüfungen ({{from}}% → {{to}}%).',
  },

  unifiedFlow: {
    newMachineTitle: 'Neue Maschine',
    missingRefTitle: 'Normalzustand fehlt',
    noMachinesExplanation:
      'Keine bekannte Maschine erkannt. Legen Sie eine neue Maschine an \u2013 der Normalzustand wird direkt aufgenommen.',
    missingRefExplanation:
      'Folgende Maschinen haben noch keinen Normalzustand. W\u00e4hlen Sie eine aus, um den Normalzustand jetzt aufzunehmen.',
    machineNameLabel: 'Name der Maschine',
    machineNamePlaceholder: 'z.B. Pumpe 3 \u2013 Westhalle',
    createAndRecord: 'Anlegen & Normalzustand aufnehmen',
    recordNormalState: 'Normalzustand aufnehmen \u2192',
    recordingStarted: 'Normalzustand wird aufgenommen f\u00fcr {{name}}...',
    referenceSavedSuccess: 'Normalzustand f\u00fcr {{name}} gespeichert.',
    referenceSavedHint: 'Beim n\u00e4chsten Pr\u00fcfen wird {{name}} automatisch erkannt.',
  },

  // ============================================================================
  // SPRINT 9: FLEET QUICK CHECK (Flotten-Schnellcheck)
  // ============================================================================
  fleetSelect: {
    title: 'Flotte w\u00e4hlen',
    machineCount: '{{count}} Maschinen',
    machineCountSingular: '1 Maschine',
    lastChecked: 'gepr\u00fcft {{time}}',
    neverChecked: 'nie gepr\u00fcft',
    newQuickCompare: 'Neuen Schnellvergleich',
    newQuickCompareHint: 'Maschinen ohne Setup vergleichen',
    singleMachineHint:
      'Flotte \u201E{{name}}\u201C hat nur 1 Maschine. Mindestens 2 n\u00f6tig f\u00fcr einen Vergleich.',
  },
  alerts: {
    genericError: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
  },
};
