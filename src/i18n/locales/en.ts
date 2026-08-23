/**
 * SOUNDFUCHS - English Translations
 */

import type { TranslationDict } from '../index.js';

export const en: TranslationDict = {
  fab: {
    detect: 'Identify',
    newMachine: 'Add',
  },

  sheet: {
    groupCheck: 'Checking',
    groupMachines: 'Machines',
    groupApp: 'App',
    recording: 'Recording & analysis',
    room: 'Room & background noise',
    labels: 'Write NFC & QR',
    data: 'Back up & reset data',
    vault: 'Vault',
    soon: 'later',
    view: 'View: basic or pro',
    map: 'Site map',
    customerData: 'Sites: samples & import',
    tool: 'Analysis tool',
  },

  // Der Stamm: die von TourFuchs uebernommene Oberflaeche vor dem
  // Scharnier (docs/nutzerreise-wie-tourfuchs.md §0h).
  // Das Scharnier und die Standortansicht (§0h, Stamm-Schnitt 3).
  hinge: {
    backToMap: 'To the map',
    backToMachine: 'To the machine',
    backToSite: 'To the site',
  },
  // Die Maschinen-Arbeitsebene (Zanobot_UI_Nutzerreise, Schnitt 1).
  maschine: {
    rundeFertig: '✓ Round complete — {{anzahl}} machines checked at this site',
    naechsteMaschine: '▸ Next: {{name}}',
    lageUntrained: 'No reference sound yet',
    lageReady: 'Ready to check',
    lageSimilar: 'Sounds like the reference',
    lageDeviating: 'Clearly different sound',
    lageMikrofon: 'Microphone not allowed',
    lageQualitaet: 'Recording not usable for comparison',
    lageOffline: 'No connection',
    lageLaeuft: 'Working …',
    fingerabdruckFertig: 'Reference sound is ready',
    fingerabdruckAlt: 'Acoustic fingerprint of this machine',
    aktionGegenprobe: 'Run a counter-check now',
    aktionReferenz: 'Record reference sound',
    aktionPruefen: 'Check for 10 seconds',
    aktionStoppen: 'Stop',
    aktionRechnet: 'Analysing …',
    aktionFertig: 'Done',
    aktionUnterschied: 'Listen to the difference',
    aktionMikrofon: 'Allow microphone',
    aktionWiederholen: 'Record again',
    aktionErneut: 'Try again',
    zuletzt: 'Last {{wert}} % · {{wann}}',
    hinweisGegenprobe:
      'Record the same machine again — you will see right away how precise the comparison is.',
    hinweisReferenz: 'Record the machine as it sounds in good normal operation.',
    hinweisPruefung: 'Hold the device in the same place as last time.',
    ergebnisAbweichung: 'The measurement sounds different from the normal state.',
    ergebnisAehnlich: 'The measurement sounds like the normal state.',
    aehnlichkeit: 'Similarity {{wert}} % · {{wann}}',
    trotzdemHoeren: 'Listen to the comparison anyway',
    letzterUnterschied: '🔍 Listen to the last difference',
    briefing: '✨ Sound briefing',
    verlaufMitZahl: 'History · {{anzahl}} checks',
    verlaufEine: 'History · 1 check',
    pruefungKurz: '{{wert}} % · {{wann}}',
    keinTonGespeichert: 'No audio was stored for this check.',
    rechnetHinweis: 'The recording is being compared with the normal state.',
  },
  // The listening lens (slice 3): normal state · measurement · difference.
  // The sound picture on the machine page.
  klangbild: {
    irisLegende: 'Colour = strength of the frequency · white line = normal state',
    auswahlSpielen: '▶ Play selection',
    auswahlStoppen: '■ Stop',
    auswahlWeg: 'Clear selection',
    auswahlBereich: '{{von}}–{{bis}} s · {{tief}}–{{hoch}}',
    ziehen: 'Tap for the 3D view · drag to pick out a spot.',
    quelleIris: 'Iris',
    irisAlt: 'Round comparison: normal state and measurement overlaid',
    vergroessern: 'Tap for the large view',
    alt: 'Sound picture of the last check',
    leer: 'No sound picture available for this check',
    quelleNormalzustand: 'Normal state',
    quelleMessung: 'Measurement',
    quelleUnterschied: 'Difference',
  },
  hoerlupe: {
    quelleNormalzustand: '🔊 Normal state',
    quelleMessung: '🔊 Measurement',
    quelleUnterschied: '🔍 Difference',
    quelleAufnahme: '🔊 Recording',
    einzelaufnahmeHinweis:
      'No comparison recording needed: mark the suspicious pattern and make it easier to hear.',
    feinEinstellen: 'Fine-tune',
    hoerbarMachen: '🎧 Make the anomaly audible',
    hervorhebungTitel: 'Highlight difference',
    hervorhebungAus: 'Original measurement',
    hervorhebungDeutlich: 'Clear',
    hervorhebungStark: 'Strong',
    hervorhebungHinweis:
      'Processed listening aid. The original measurement and rating remain unchanged.',
    hervorhebungDeutlichLaeuft: 'Measurement · difference clearly highlighted',
    hervorhebungStarkLaeuft: 'Measurement · difference strongly highlighted',
    vergleichTeilen: '📤 Share with a specialist',
    vergleichWirdVorbereitet: 'Preparing WAV files …',
    vergleichTitel: 'SoundFuchs listening comparison · {{name}}',
    vergleichText:
      'Original measurement and processed listening aid ({{stufe}}). The listening aid does not change the rating.',
    vergleichGeteilt: 'Listening comparison was handed to the share sheet.',
    vergleichHeruntergeladen:
      'Original measurement and listening aid were downloaded as WAV files.',
    vergleichFehlgeschlagen: 'The listening comparison could not be exported.',
    auswahlOeffnen: '🎯 Select an area in the spectrogram',
    auswahlHinweis:
      'Draw a frame around the conspicuous pattern. Then switch between normal state, measurement and difference – time and frequency stay the same.',
    auswahlHinweisEinzeln:
      'Draw a frame around the suspicious pattern. This exact time and frequency range is added to the sound briefing as a listening aid.',
    auswahlQuelleAufnahme: 'Recording',
    auswahlQuellenTitel: 'Spectrogram selection source',
    auswahlLaedt: 'Preparing spectrogram …',
    auswahlCanvasLabel: 'Spectrogram selection. Time is horizontal, frequency vertical.',
    auswahlAchseFrequenz: '↕ Frequency',
    auswahlAchseZeit: 'Time →',
    auswahlAnhoeren: '🔊 Listen to selection',
    auswahlAnhoerenQuelle: '🔊 Listen to selection from {{quelle}}',
    auswahlNichtVerfuegbar: 'No listening aid can be built for this area.',
    auswahlQuelle: 'Spectrogram selection',
    auswahlBeschreibung: 'Selection {{quelle}} · {{vonZeit}}–{{bisZeit}} s · {{vonHz}}–{{bisHz}}',
    staerkeTitel: 'Strength of the acoustic deviation',
    staerkeInnerhalb: 'Within normal variation',
    staerkeLeicht: 'Slightly elevated',
    staerkeDeutlich: 'Clearly elevated',
    staerkeStark: 'Strongly elevated',
    staerkeAnteil: 'Before amplification: {{prozent}}% difference RMS of the measurement.',
    staerkeVergleich:
      'Before amplification: {{prozent}}% difference RMS · {{faktor}}× internal variation of the normal state.',
    staerkeHinweis:
      'The difference is amplified afterwards to make it detectable. This describes an acoustic change, not the severity of damage.',
    laeuft: 'Playing: {{quelle}}',
  },
  analysisPackage: {
    entryEyebrow: 'New · local & open',
    entryTitle: 'Turn the sound into a clear briefing',
    entryHint:
      'Baseline, measurement, marked difference and context — for a specialist or AI of your choice.',
    entryButton: '✨ Create sound briefing',
    entrySingleEyebrow: 'No reference? No problem.',
    entrySingleTitle: 'Turn a suspicion into a clear sound briefing',
    entrySingleHint:
      'Original, marked focus, listening aid, recording quality and a plan for the best counter-recording.',
    entrySingleButton: '✨ Create sound briefing',
    eyebrow: 'SoundFuchs sound assistant',
    title: 'Prepare sound briefing',
    intro:
      'Describe the situation. SoundFuchs prepares the recording, listening focus and context for handover — locally, without uploads or an account.',
    caseModeTitle: 'What do you know about the two recordings?',
    caseModeHint: 'This prevents an acoustic difference from being mistaken for damage.',
    modeHealthyTitle: 'The baseline was healthy',
    modeHealthyHint: 'Classic comparison: what is new in the later measurement?',
    modeNeutralTitle: 'Health state is unknown',
    modeNeutralHint: 'Neutral A/B contrast: different, but neither side is labelled defective.',
    noReferenceTitle: 'No healthy reference? No problem.',
    noReferenceHint:
      'SoundFuchs honestly looks for patterns within this recording and includes a plan for the most useful counter-recording.',
    close: 'Close dialog',
    situationTitle: 'What was recorded?',
    situationHint:
      'Good context helps specialists and AI distinguish an engine bay, kitchen or workshop.',
    situationVehicle: '🚗 Vehicle · engine bay',
    situationHousehold: '🏠 Household appliance · indoors',
    situationBuilding: '🔥 Building services · plant room',
    situationTool: '🛠️ Tool or garden equipment',
    situationOther: '✍️ Other situation',
    vehicleDetails: 'What applies? Select more than one if needed.',
    hoodOpen: 'hood open',
    hoodClosed: 'hood closed',
    coldStart: 'cold start',
    warmIdle: 'warm idle',
    raisedRpm: 'raised RPM',
    descriptionLabel: 'What should the recipient know?',
    descriptionVehiclePlaceholder:
      'For example: whistling front right, after 30 minutes, around 1,800 RPM …',
    descriptionPlaceholder: 'Briefly describe device, place, operating state and unusual sound …',
    dictate: '🎙️ Dictate situation',
    dictating: '● Listening — tap to stop',
    dictationNote:
      'Only recognized text enters the briefing. Your browser may use its speech service.',
    selectionIncluded: '🎯 Marked focus included: {{from}}–{{to}} s · {{low}}–{{high}} Hz',
    privacyTitle: 'You decide what is included',
    privacyText:
      'Location and customer data stay out. Audio may still contain voices or ambient sounds.',
    includeName: 'Include machine label “{{name}}”',
    consent: 'I have checked that I may share these audio files with a specialist or external AI.',
    localPromise: '🔒 SoundFuchs uploads nothing',
    create: 'Download briefing + copy assignment',
    working: 'Preparing sound briefing locally …',
    failed: 'The complete sound briefing could not be created. Please try again.',
    successTitle: 'Your sound briefing is ready',
    successCopied: 'The ZIP was downloaded and the identical assignment is in your clipboard.',
    successFallback:
      'The ZIP was downloaded. The assignment is safely inside and can also be copied below.',
    successWarnings:
      '{{count}} optional file(s) could not be created; details are in HINWEISE.txt inside the ZIP.',
    promptBackup: 'Backup: review and copy the assignment',
    copyAgain: 'Copy assignment again',
    copied: '✓ Assignment copied',
    copyManually: 'Text selected — please copy',
    done: 'Done',
    openIn: 'Open in {{name}}',
    openInHint: 'Paste it there and attach the downloaded ZIP file. SoundFuchs uploads nothing.',
    useInstead: 'Use {{name}} instead',
  },
  tool: {
    title: 'Analysis tool',
    description:
      'The sound briefing is built in your browser. Where you take it afterwards is your choice — SoundFuchs opens the tool but uploads nothing.',
    label: 'Tool',
    hint: 'At the end of the briefing a button leads there. The work order is then on your clipboard, the package in your downloads folder.',
  },
  site: {
    countMachines: '{{n}} machines',
    countMachineOne: '1 machine',
    stateNoneChecked: 'none checked yet',
    stateDeviating: '{{n}} sound different from their normal state',
    stateDeviatingOne: '1 sounds different from its normal state',
    stateUnchecked: '{{n}} without a normal state',
    stateUncheckedOne: '1 without a normal state',
    stateAllFine: 'all sound like their normal state',
    newMachine: 'Add a machine',
    operator: 'Operator',
    justNow: 'just now',
    agoMinutes: '{{count}} min ago',
    agoHours: '{{count}} h ago',
    agoDays: '{{count}} days ago',
    compareRow: '⇄ {{name}}: compare {{count}} machines',
  },
  reihe: {
    faelltAuf: '{{name}} stands out from the group.',
    fallenAuf: '{{name}} stand out from the group.',
    keineFaelltAuf: 'None of the {{count}} machines checked stands out.',
    bedeutung: 'It deviates further from its own baseline than the others do.',
    bedeutungMehrere: 'They deviate further from their own baselines than the others do.',
    belegGeprueft: '{{checked}} of {{total}} checked',
    belegSpanne: 'similarity {{von}}–{{bis}}%',
    und: 'and',
    undWeitere: 'and {{count}} more',
    fertig: 'Done',
    zuWenige: 'A comparison needs at least {{count}} machines checked.',
    zuWenigeBedeutung:
      'With two, the comparison cannot say which one deviates — each has its own result on its own page.',
  },
  stamm: {
    depthBasic: '🌱 Basic',
    depthExpert: '🛠️ Pro',
    demoBannerWord: 'Sample data',
    demoBannerText: '– demo sites.',
    demoBannerCta: 'Remove',
    tabMap: 'Map',
    tabData: '📄 Sites',
    tabFilter: 'Filter',
    nearby: 'Nearby',
    dropzone: '📥 Drop an Excel or CSV file here',
  },
  schale: {
    navLabel: 'View and sections',
    gripLabel: 'Open sheet',
    gripClose: 'Collapse sheet',
    zoomBack: '‹ Data',
    stepDone: 'done',
    stepOpen: 'open',
    fleet: {
      fromStock:
        'From your machines: grouped by fleet. Pick a fleet and check them one after another.',
      withoutStock:
        'Without your machines: compare several unknown machines without creating them first.',
    },
    tab: {
      daten: 'Data',
      flotte: 'Fleet',
      karte: 'Map',
      filter: 'Filter',
    },
    nearby: {
      title: 'Nearby',
      originMap: '🗺 Map centre',
      originGps: '📍 My location',
      visible: '{{count}} visible',
      filtered: 'filtered',
      unchecked: 'unchecked',
      empty: 'No site nearby.',
      gpsWaiting: 'Looking for your location …',
      gpsDenied: 'Location not granted',
      gpsUnavailable: 'Location not available',
    },
    filter: {
      all: 'all',
      condition: 'Condition',
      site: 'Site',
      fleet: 'Fleet',
      healthy: 'fine',
      warning: 'noticeable',
      critical: 'critical',
      unchecked: 'unchecked',
      reset: 'Reset filter',
    },
    settingTitle: 'New interface',
    settingDescription:
      'Map as the ground, sheet from below, tabs — the user journey from TourFuchs. It is being built and is not complete yet. The switch goes back at any time.',
    settingToggle: 'Use the new interface',
    settingHint: 'Preview. What is still missing, the empty tabs say themselves.',
  },

  search: {
    placeholder: 'Search site, machine, postcode…',
    noHits: 'Nothing found.',
    sheetTitle: 'Settings & more',
  }, // ============================================================================
  // BUTTONS
  // ============================================================================
  buttons: {
    stop: 'Stop',
    stopAndSave: 'Stop & Save',
    scan: 'Scan',
    create: 'Create',
    record: 'Record',
    startDiagnosis: 'Check Status',
    analyze: 'Analyze',
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    discard: 'Discard',
    trainAnother: 'Train Another State',
    newMachine: 'New Machine',
    stopRecording: 'Stop Recording',
    saveReference: 'Save Normal State',
    continue: 'Continue',
    toOverview: 'Back to overview',
  },

  // ============================================================================
  // BANNER
  // ============================================================================
  banner: {
    headline: 'Does the system sound normal?',
    subline: 'Check status in seconds – directly on the device, offline',
  },

  // ============================================================================
  // STATUS
  // ============================================================================
  status: {
    healthy: 'Normal',
    uncertain: 'Deviation',
    faulty: 'Abnormal',
    unknown: 'Unknown',
    noData: 'No Data',
    notChecked: 'Not Yet Checked',
    ready: 'Ready',
    analyzing: 'ANALYZING...',
    consistent: 'Machine consistent',
    slightDeviation: 'Slight deviation',
    significantChange: 'Significant change',
    strongDeviation: 'Strong deviation – consider checking',
  },

  // ============================================================================
  // MODAL TITLES
  // ============================================================================
  modals: {
    unsuitableSignal: 'Signal not suitable',
    referenceRecording: 'Record Normal State',
    liveDiagnosis: 'Live Check - Find Sweet Spot',
    qrScanner: 'QR/Barcode Scanner',
    databaseError: 'Database Error',
    browserIncompatible: 'Browser Not Supported',
    accessDenied: 'Access Denied',
    processingError: 'Processing Error',
    saveError: 'Save Error',
    sampleRateMismatch: 'Audio Devices Not Compatible',
    unsuitable: 'Sound Not Recognizable',
    referenceUnsuitable: 'Recording Unsuitable',
    recordingDiscarded: 'Recording Discarded',
    cameraOptional: 'Camera Optional',
    noSignalDetected: 'No Signal Detected',
    scanError: 'Scan Error',
    databaseExported: 'Database Exported',
    databaseShared: 'Database Shared',
    databaseImported: 'Database Imported',
    databaseCleared: 'Database Cleared',
    nfcDiagnosisTitle: 'Check status?',
    nfcDiagnosisPrompt: 'Machine detected. Check status now?',
    closeDialog: 'Close dialog',
  },

  map: {
    stackTitle: '{{count}} machine sites – tap to zoom in',
    stackUnit: 'sites',
    openDetails: 'Open details',
    openSite: 'Open machine site',
    demoBadge: 'Demo',
    noMachinesShort: 'no machine yet',
    machineCount: '{{count}} machines',
    machineCountOne: '1 machine',
    stateHealthy: 'Normal',
    stateWarning: 'Noticeable',
    stateCritical: 'Critical',
    stateUnchecked: 'Unchecked',
    basemapLabel: 'Map style',
    title: 'Site map',
    tileLight: 'Light',
    tileStandard: 'Standard',
    tileSatellite: 'Satellite',
    machinesLabel: 'Machines',
    accuracyPlz: 'Town centre',
    noMachines: 'No machine at this site yet.',
    noReference: 'No reference',
    unlocated: '{{count}} site(s) without a map position — the postcode is unknown.',
    areaWithMachines: 'Postcode area {{plz}} · {{count}} machines',
    areaEmpty: 'Postcode area {{plz}} · no machine yet',
    emptyTitle: 'No site on the map yet',
    emptyText: 'Sites are created together with a machine — or here, to try it out.',
    emptyButton: 'Load sample data',
    emptyLoading: 'Loading …',
  },

  customers: {
    label: 'Site (optional)',
    none: '— no site —',
    new: '+ New site',
    nameLabel: 'Name',
    namePlaceholder: 'e.g. Müller Guss GmbH or Home',
    plzLabel: 'Postcode',
    plzPlaceholder: '45127',
    ortLabel: 'Town',
    hint: 'The postcode supplies town and map position — nothing else is needed.',
    nameRequired: 'Please enter a name for the site.',
    plzInvalid: 'Please enter a five-digit German postcode.',
    plzFound: '{{ort}} — taken from the postcode.',
    plzUnknown: 'This postcode is unknown. The site is created, but without a map position.',
    demoTitle: 'Sample data',
    demoDescription:
      'About 100 invented sites, spread across Germany, each with one machine without a reference. For demos — real data stays untouched.',
    demoLoad: 'Load sample data',
    demoRemove: 'Remove sample data',
    demoCount: '{{count}} sample sites loaded',
    demoLoaded: '{{count}} sample sites created',
    demoRemoved: '{{count}} sample sites removed',
    demoError: 'Sample data could not be processed.',
    importTitle: 'Import a site list',
    importDescription:
      'CSV file with the columns Name, Postcode, optionally Town and Machine. Town and map position come from the postcode.',
    importButton: 'Choose CSV',
    importSummary:
      '{{angelegt}} sites created, {{maschinen}} machines, {{uebersprungen}} skipped, {{fehler}} invalid rows',
    importNoColumns: 'The file has no "Name" or "Postcode" column — nothing was imported.',
    importError: 'The site list could not be imported.',
  },

  // ============================================================================
  // PHASE 1: IDENTIFY (Machine Selection)
  // ============================================================================
  identify: {
    addMachine: 'Scan or create',
    scanQrCode: 'Scan QR Code',
    scanQrDescription: 'Identify machine via QR code',
    manualEntry: 'Create Manually',
    manualEntryDescription: 'Create new machine with name',
    machineName: 'Machine Name',
    machineId: 'Machine ID (optional)',
    machineNameHint: 'Unique name, e.g. Pump 3 – West Hall',
    machineNameRequired: 'Please enter a machine name.',
    machineNamePlaceholder: 'e.g. Pump 3 – West Hall',
    machineIdHint: 'Optional: Internal ID (e.g. SAP number). Not used for analysis.',
    machineDetails: 'Details & manage',
    deleteMachine: 'Delete machine',
    confirmDeleteMachine: 'Delete machine "{{name}}"? All checks will be lost.',
    confirmDeleteMachineWithData:
      'Machine "{{name}}" has {{count}} recordings. Really delete EVERYTHING?',
    machineDeleted: '\uD83D\uDDD1\uFE0F Machine "{{name}}" deleted',
    quickAccess: 'Quick Access',
    quickAccessDescription: 'Quick access to recently used machines',
    recentlyUsed: 'Recently Used',
    overview: 'Overview',
    machineOverview: 'Machine Overview',
    history: 'History',
    noMeasurements: 'No measurements yet',
    noMachines: 'No machines available',
    statesTrained: '{{count}} states trained',

    // Welle 5: Identify tiles
    tiles: {
      savedMachines: 'Saved Machines',
      scanQR: 'QR / Barcode',
      newMachine: 'New Machine',
    },

    // Machine detail modal
    machineDetail: {
      title: 'Machine',
      startCheck: 'Start check',
      startRecording: 'Record normal state',
    },

    // Sprint 2 UX: Empty state mini guide
    emptyGuide: {
      title: 'How SoundFuchs works',
      step1Title: 'Create machine',
      step1Desc: 'Give your machine a unique name.',
      step2Title: 'Record normal state',
      step2Desc: '10 seconds of normal operation.',
      step3Title: 'Check condition',
      step3Desc: 'Compare against the normal state anytime.',
      cta: 'Create first machine',
    },

    errors: {
      createFailed: 'Could not create machine.',
      invalidReferenceUrl: 'Invalid reference database URL.',
      scannerStart: 'Error starting scanner',
      cameraAccessDenied: 'Camera access denied',
      cameraAccessHint: 'Please allow camera access in your browser settings',
      noCameraFound: 'No camera found',
      noCameraHint: 'Please make sure your device has a camera',
      qrProcessing: 'Error processing QR code',
      invalidCode: 'Invalid code scanned',
      codeProcessing: 'Error processing code',
      manualEntryLoad: 'Manual entry could not be loaded',
      invalidMachineId: 'Invalid machine ID',
      machineLoad: 'Error loading machine',
      machineNotFound: 'Machine not found. Please select again.',
      nameRequired: 'Please enter a machine name',
      nameWhitespace: 'Machine name cannot be only whitespace',
      nameTooLong: 'Machine name is too long (maximum 100 characters)',
      machineExists: 'A machine with this ID already exists',
      machineCreate: 'Error creating machine',
      idEmpty: 'Machine ID cannot be empty',
      idTooShort: 'Machine ID is too short',
      idTooLong: 'Machine ID is too long (maximum 100 characters)',
      idWhitespace: 'Machine ID cannot be only whitespace',
      microphoneLoad: 'Error loading microphones',
      microphoneSwitch: 'Error switching microphone',
    },

    success: {
      machineLoaded: 'Machine "{{name}}" loaded',
      machineCreated: 'Machine created: {{name}}',
      machineAutoCreated: 'New machine "{{name}}" automatically created.',
      microphoneOptimized: 'Microphone automatically set to "{{label}}" for best results',
      microphoneChanged: 'Microphone changed: {{label}}',
    },

    warnings: {
      preferredMicrophoneUnavailable:
        'Preferred microphone is no longer available. Using the default microphone.',
    },

    messages: {
      codeRecognized: 'Code recognized: {{code}}',
      autoMachineName: 'Machine {{id}}',
      loadingMachine: 'Loading machine...',
    },

    time: {
      justNow: 'just now',
      minutesAgo: '{{minutes}} min. ago',
      hoursAgo: '{{hours}} hrs. ago',
      dayAgo: '1 day ago',
      daysAgo: '{{days}} days ago',
      weekAgo: '1 week ago',
      weeksAgo: '{{weeks}} weeks ago',
    },

    // Sprint 3 UX: Sparkline accessibility
    sparkline: {
      ariaLabel: 'Trend of last {{count}} checks',
    },
  },

  // ============================================================================
  // PHASE 2: REFERENCE (Training)
  // ============================================================================
  reference: {
    recordReference: 'Record Normal State',
    tenSecondRecording: '{{duration}}-second normal state recording',
    noReferenceModel: 'No normal state available',
    trainedStates: 'Trained States',
    noModelsYet: 'No normal states available yet',
    existingModels: 'EXISTING MODELS:',
    statesTrainedCount: '{{count}} state(s) already trained',
    recordingStatusHighQuality: 'High audio quality detected',
    explainBefore:
      'The normal state defines how your machine sounds during healthy operation. All future comparisons are based on it.',
    explainDuring:
      'Slowly move the smartphone around the machine. This helps filter out environmental influences.',
    savedSuccess: '\u2705 Normal state saved – Environment profile detected',
    savedTitle: 'Normal state created',
    cherryPickingHint:
      '\uD83D\uDEE1\uFE0F Background noise is automatically detected and discarded.',
    noModels: 'No normal states yet.',
    unnamed: 'Normal state #{{index}}',
    deleteModel: 'Delete normal state',
    confirmDeleteModel: 'Delete normal state "{{name}}"? This cannot be undone.',
    modelDeleted: '\uD83D\uDDD1\uFE0F Normal state "{{name}}" deleted',
    makeBaseline: 'Set as main reference',
    baselinePromoted: '\u2B50 "{{name}}" is now the main reference',

    // State-based card UI (mirrors diagnose card)
    statesRecorded: '{{count}} signature(s) available',
    noReferenceYet: 'No normal state yet',
    changeMachine: 'Change machine',
    noMachinesYet: 'No machines created yet.',
    noMachinesHint: 'Please create a new machine first.',

    recording: {
      alreadyRunning: 'A recording is already in progress.',
      cameraNotAvailable: 'Camera not available. Recording will continue without position image.',
      browserNotCompatible:
        'Your browser does not support audio recording. Please use Chrome or Edge.',
      stabilizing: 'Stabilizing...',
      waitingForSignal: 'Waiting for signal',
      recording: 'Recording in progress',
      microphoneFailed: 'Please allow microphone access in your device settings.',
      processingFailed: 'An error occurred. Please try again.',
      failedFriendly:
        'The recording did not work this time. This can happen after a brief hiccup — just try again.',
      retryAction: 'Record again',
      noSignal:
        'No machine sound detected. Is the machine running? Please hold the device closer and try again.',
      positionImage: '📷 Position image will be captured automatically',
      instruction: 'Hold the microphone 10-30 cm in front of the machine.',
      // iOS Audio Blocked (watchdog detection)
      iosAudioBlocked: 'Microphone blocked',
      iosAudioBlockedMessage:
        'The microphone is not providing audio data.\n\nPossible causes:\n• Another app is using the microphone\n• iOS is blocking microphone access\n• System volume is muted\n\nPlease close other apps and try again.',
      iosAudioBlockedRetry: 'Try again',
      // Welle 1 UX: Countdown tip
      countdownTip: 'Hold the device close to the machine',
    },

    quality: {
      signalStable: '✓ Signal stable',
      slightUnrest: '⚠ Slight instability',
      signalUnstable: '✗ Warning: Signal unstable!',
      // Sprint 3 UX: Reference quality badge
      good: 'Ref: Good',
      ok: 'Ref: OK',
      unknown: 'Ref: ?',
      ariaLabel: 'Recording quality: {{rating}}',
    },

    signalQuality: {
      label: 'Signal',
      good: 'Good',
      ok: 'Sufficient',
      weak: 'Too weak',
      hintCloser: 'Hold smartphone closer to the machine',
      hintTooWeak: 'Signal too weak – move closer to the sound source',
    },

    errors: {
      recordingTooShort:
        'Recording too short: {duration} s. After {warmup} s warm-up too little remains — record at least {minDuration} s.',
      trainingDataTooShort:
        'Usable part too short: {duration} s, {minDuration} s required. Record at least {totalMinDuration} s in total.',
      baselineScoreTooLow:
        'The reference matches itself only {baselineScore} %; {minScore} % required. Please record again in a quieter place.',
      tooShort:
        'Recording too short: {{duration}}s total duration is shorter than the {{warmup}}s warmup phase. Minimum duration: {{minDuration}}s',
      trainingTooShort:
        'Training data too short: {{duration}}s (after warmup phase). Minimum required: {{minDuration}}s. Please record at least {{totalDuration}}s.',
      qualityTooLow:
        'Recording quality too poor for training. Please record again in a quiet environment with a clear machine signal.\n\nIssues:\n{{issues}}',
      signalTooWeak:
        'Signal too weak or diffuse (possibly just noise).\n\nSignal strength (RMS): {{magnitude}} (Minimum: 0.03)\nQuality: {{quality}}%\n\nPlease ensure:\n• Microphone is close enough to the machine (10-30cm)\n• Machine is running at sufficient volume\n• Not recording pure background noise\n\nIssues:\n{{issues}}',
      qualityWarning:
        '⚠️ WARNING: Poor recording quality\n\nThe quality of this recording is poor. Training may be unreliable.\n\nIssues:\n{{issues}}\n\nDo you still want to save?',
      baselineTooLow:
        'Reference recording too unclear or noisy.\n\nSelf-recognition score: {{score}}%\nMinimum required: {{minScore}}%\n\nPossible causes:\n• Signal too weak or unstable\n• Too much background noise\n• Machine not running consistently\n\nPlease repeat recording under better conditions:\n• Microphone closer to machine (10-30cm)\n• Quiet environment\n• Machine running steadily throughout recording',
      noAudioFile: 'Please create a reference recording first.',
      exportFailed: 'Export failed',
      saveFailed: 'Save failed',
      machineDataMissing: 'Machine data missing',
    },

    success: {
      downloadPrompt: 'File is being downloaded.',
      modelTrained:
        '✅ Reference model successfully trained!\n\nMachine: {{name}}\n\nWould you like to download the reference audio file?\n(Recommended for backup)',
      canStartNew: 'You can start a new reference recording.',
    },

    labels: {
      baseline: 'Reference',
      formerBaseline: 'Former reference',
      enterName: 'Please enter a name',
      cancelled: 'Cancelled',
    },

    labelModal: {
      title: 'Name this state',
      hint: 'Examples for normal states: "Idle", "Full Load". Examples for faults: "Imbalance", "Bearing damage".',
      placeholder: 'Name of this state',
      healthyLabel: 'Normal state',
      faultyLabel: 'Known fault',
    },
  },

  // ============================================================================
  // WELLE 1 UX: Machine List Status Dots
  // ============================================================================
  machineList: {
    statusHealthy: 'Normal',
    statusWarning: 'Deviation',
    statusCritical: 'Abnormal',
    statusUnknown: 'Not yet checked',
  },

  // ============================================================================
  // PHASE 3: DIAGNOSE (Real-time)
  // ============================================================================
  diagnose: {
    faultDetected: 'Fault detected: {{fault}}',
    faultChecked: 'Fault “{{fault}}”: {{score}} % – no match',
    faultGeneric: 'Fault',
    alreadyRunning: 'A check is already in progress.',
    noReferenceModel: 'No reference model found. Please create a reference recording first.',
    browserNotCompatible:
      'Your browser does not support real-time comparison. Please use Chrome, Edge, or Safari.',
    noValidSampleRate: 'No reference model with valid sample rate found.',
    cameraNotAvailable: 'Camera not available. Check will continue without position guide.',
    diagnosisRunning: 'Check running',
    compareComplete: '\u2705 Comparison complete',
    saveFailed: 'Check could not be saved',
    liveAnalysis: 'Run live analysis',

    // Welle 1 UX: Action notices
    recommendation: {
      healthy: 'No anomalies detected',
      warning: 'Monitor – check during next maintenance',
      critical: 'Consider on-site inspection',
    },

    sampleRateError:
      'The recording could not be compared. Your device uses a different audio quality ({{actual}}Hz) than during the normal state recording ({{expected}}Hz). Please use the same device or record the normal state again with this device.',

    display: {
      referenceModels: 'REFERENCE MODEL(S):',
      statesTrainedCount: '{{count}} state(s) trained',
      debugValues: '🔍 DEBUG VALUES:',
      signalHint: 'Move phone closer to machine for optimal signal',
      match: 'Match',
      ghostHint: '👻 Move the phone until live image and reference image align',
      noCameraAvailable: 'No position image available',
      machineQuestion: 'Does the machine sound normal?',
      reference: 'Reference',
      waitingForSignal: 'Waiting for signal...',
      spectrumReveal: '👁 Show spectrum',
      spectrumHide: 'Hide spectrum',
      listenSectionLabel: 'Listening lens',
      listenSectionHint: 'Compare the normal state and the measurement – or hear only what is new.',
      listenReference: '🔊 Reference',
      listenMeasurement: '🔊 This measurement',
      listenStop: '⏹ Stop',
      listenSlow: '🐢 Slow',
      listenNormal: '▶ Normal',
      listenFaster: '🐇 Higher',
      listenReopen: 'Listen',
      irisReference: 'Reference',
      irisMeasurement: 'Measurement',
      deviationFrequencyLabel: '⚠ Main deviating frequency: ~{{freq}}',
      operatingPointWarning:
        '⚠ Different operating point than the reference (dominant tone ≈{{refFreq}} → {{measFreq}}). A lower match may stem from a changed speed/load rather than a fault.',
      deviationFrequencyHint:
        'Check whether this frequency comes from the machine or the environment.',
      listenDifference: '🔍 Difference only',
      listenComputing: '… computing …',
      listenDifferenceTooShort: 'Recordings too short for difference analysis.',
      listenTune: '🎧 Into audible range',
      listenTuneResult: '🎧 {{peak}} → {{target}}',
      listenTuneClamped:
        'Factor limited so a rhythm stays perceivable — the target frequency is therefore not fully reached.',
      listenTuneExact: 'Largest difference pulled into the range where the ear resolves best.',
      spectrumTitle: 'Frequency comparison (reference ↔ measurement)',
      spectrumReference: 'Reference',
      spectrumMeasurement: 'This measurement',
      spectrumDifference: 'Extra energy',
    },

    smartStart: {
      stabilizing: '🎙️ {{message}}\n(Microphone leveling, OS filters stabilizing...)',
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
        'Acoustic signature matches reference state "{{state}}" ({{score}}%). No abnormalities.',
      faultyMatch:
        'Abnormality detected: Signature matches trained pattern "{{state}}" ({{score}}%). Consider inspecting.',
    },

    // State-based card UI (horizontal tiles)
    scanCode: 'Scan QR',
    selectExisting: 'Select machine',
    createNew: 'New machine',
    statesReady: '{{count}} state trained',
    noReference: 'No normal state yet',
    changeMachine: 'Change machine',
    noMachinesYet: 'No machines created yet.',
    noMachinesHint: 'Create a new machine first.',

    // Sprint 3 UX: Operating point hint
    opHint: {
      changed: 'ℹ️ Operating point differed during measurement – consider when interpreting score',
    },

    // Sprint 9: Fleet Quick Check in Phase 3
    orFleet: 'or',
    fleetQuickCheck: 'Fleet Quick Check',
    fleetQuickCheckAria: 'Fleet Quick Check: Compare multiple machines',
  },

  // ============================================================================
  // SPRINT 3 UX: TREND
  // ============================================================================
  trend: {
    improving: 'Trend: improving',
    stable: 'Trend: stable',
    declining: 'Trend: declining',
    uncertain: 'Trend: not yet reliable',
    noTrend: 'No trend yet',
  },

  // ============================================================================
  // PIPELINE STATUS DASHBOARD (Expert Mode)
  // ============================================================================
  pipelineStatus: {
    title: 'Pipeline Status',
    room: 'Room',
    rejected: 'rejected',
    active: 'active',
    waiting: 'ready',
    chirpPending: 'Running chirp...',
    chirpFailed: 'Chirp failed',
    t60VeryDry: 'very dry',
    t60Dry: 'dry',
    t60Medium: 'medium reverberant',
    t60Reverberant: 'reverberant',
    t60VeryReverberant: 'very reverberant',
  },

  // ============================================================================
  // ENVIRONMENT COMPARISON (Reference T60 vs. Check T60)
  // ============================================================================
  envCompare: {
    environment: 'Environment',
    reference: 'Ref.',
    ok: 'Similar environment to reference',
    moreReverberant: 'Environment significantly more reverberant than reference',
    lesserReverberant: 'Environment significantly less reverberant than reference',
    muchMoreReverberant: 'Test environment strongly deviating \u2014 score may be affected',
    muchLessReverberant: 'Test environment strongly deviating \u2014 score may be affected',
    recommendCloser: 'Notice: Measure closer to machine or enable room compensation',
    recommendCompensation: 'Notice: Enable Session Bias Match or T60 equalization',
    recommendNote: 'Note: Score deviations may be environment-related',
  },

  // ============================================================================
  // OPERATING POINT MONITOR (Expert Mode)
  // ============================================================================
  opMonitor: {
    title: 'Operating Condition / Signal Quality',
    initializingBaseline:
      'Capturing reference operating point \u2013 please hold device steady\u2026',
    operatingPointChanged: 'Operating point changed \u2013 reference comparison limited.',
    scoreInvalid: '\u26A0 Operating point deviation \u2013 score not comparable',
    similarityP10: {
      shortLabel: 'Stability',
      description: 'Evaluates the "worst" moments of the recording (10th percentile).',
      warning:
        '\u2139\uFE0F Signal unstable: The average is good, but there are brief dips. Are there fluctuating noises or dropouts?',
      explain:
        'Evaluates the "worst" moments of the recording. A low value indicates that the sound is unstable, even if the average looks good.',
    },
    energyDelta: {
      shortLabel: 'Energy \u0394',
      description: 'Volume difference to reference in decibels.',
      warning:
        '\u26A0\uFE0F Caution: Signal is significantly louder/quieter than reference. Is the machine running under different load or has the microphone distance changed? The score may not be comparable.',
      explain:
        'Shows the volume difference to the reference. Large deviations indicate changed load, different distance, or a louder environment.',
    },
    frequencyDelta: {
      shortLabel: 'Frequency \u0394',
      description:
        'Median shift of the dominant spectral peaks compared to reference. May indicate RPM change or changed operating point.',
      warning:
        '\u26A0\uFE0F Deviating operating point: The dominant frequencies have shifted. The machine is likely running at a different speed than during the reference.',
      explain:
        'Compares the dominant spectral peaks (e.g. motor RPM and harmonics) with the reference. A shift usually means the machine is running faster or slower.',
    },
    stability: {
      shortLabel: 'Signal Stability',
      description: 'Proportion of stable signal segments during measurement.',
      warning:
        '\u26A0\uFE0F Signal unstable: Fluctuating noises or interruptions detected. Repeat measurement under stable conditions.',
      explain:
        'Measures how consistent the sound is over time. Low values indicate fluctuating operating conditions or interference.',
    },
  },

  // ============================================================================
  // PHASE 4: SETTINGS
  // ============================================================================
  settings: {
    databaseNotAvailable:
      'Storage not available. Please disable strict privacy mode in your browser settings or use a different browser.',
    exportError: 'Error exporting database',
    importError: 'Error importing',
    shareError: 'Error sharing database',

    import: {
      modalTitle: 'Import database',
      modalDescription:
        'The machines from the file will be added to your existing machines. Existing data is kept.',
      includeSettings: 'Apply saved settings',
      includeSettingsHint:
        'Apply the banner, view level, thresholds and other app settings from the file.',
      confirmButton: 'Import',
      confirmMerge:
        'Import database from: {{filename}}\n\nWould you like to MERGE the data?\n\nYES = Merge with existing data\nNO = REPLACE all existing data',
      confirmReplace:
        '⚠️ WARNING!\n\nAll existing data will be DELETED and replaced with the import data!\n\nDo you want to continue?',
      success:
        'Machines: {{machines}}\nRecordings: {{recordings}}\nChecks: {{diagnoses}}\n\nMode: {{mode}}',
      modeMerged: 'Merged',
      modeReplaced: 'Replaced',
      partialWarning:
        'Machines: {{machinesImported}} imported, {{machinesSkipped}} skipped\nRecordings: {{recordingsImported}} imported, {{recordingsSkipped}} skipped\nChecks: {{diagnosesImported}} imported, {{diagnosesSkipped}} skipped\n\n{{totalSkipped}} record(s) could not be imported.\nMode: {{mode}}',
      setupError: 'Error preparing import',
    },

    clear: {
      confirmFirst:
        '⚠️ WARNING!\n\nAll data will be PERMANENTLY deleted:\n- All machines\n- All reference models\n- All recordings\n- All checks\n\nDo you want to continue?',
      confirmSecond: 'Are you ABSOLUTELY SURE?\n\nThis action CANNOT be undone!',
      success: 'All data has been deleted',
      error: 'Error deleting data',
    },

    export: {
      modalTitle: 'Export database',
      modalDescription:
        'Your machines, recordings and checks will be exported. Would you also like to include the current settings?',
      includeSettings: 'Include settings',
      includeSettingsHint:
        'Add the banner, view level, thresholds and other app settings to the file.',
      confirmButton: 'Export',
      success:
        'File: {{filename}}\n\nMachines: {{machines}}\nRecordings: {{recordings}}\nChecks: {{diagnoses}}',
    },

    share: {
      title: 'SoundFuchs database backup',
      text: 'Database backup: {{filename}}',
      success: 'Backup shared: {{filename}}',
      fallback: 'Sharing not available. Downloaded {{filename}} instead.',
      preparing: 'Export is being prepared... please wait a moment and try again.',
    },
  },

  // ============================================================================
  // MAIN APP / STARTUP
  // ============================================================================
  update: {
    available: {
      later: 'Later',
      title: 'New version available',
      message: 'A new version is ready. Your data stays intact.',
      action: 'Update',
    },
    deferred: 'Will update after the current measurement.',
  },

  app: {
    browserNotSupported:
      'Your browser is not compatible with SoundFuchs.\n\nMissing features:\n{{features}}\n\nPlease use a modern browser such as Chrome, Edge, Firefox, or Safari.',
    uiLoadFailed: 'User interface could not be loaded',
    fatalError: 'Fatal Error',
    browserNotSupportedTitle: 'Browser Not Supported',
  },

  // ============================================================================
  // CORE ML / SCORING
  // ============================================================================
  scoring: {
    matchesReference: 'Acoustic signature matches the reference. No abnormalities.',
    moderateDeviation: 'Moderate deviation from reference pattern. Consider reviewing.',
    significantDeviation:
      'Significant deviation from reference pattern detected. Consider inspecting.',
    noMatch:
      'Significant deviation from reference pattern ({{score}}%). Signal does not match any trained state. Consider inspecting.',
    hints: {
      matchesReference: 'Acoustic signature matches reference.',
      minorDeviations: 'Minor deviations within acceptable range.',
      moderateDeviation: 'Moderate deviation from reference pattern detected.',
      recommendInspection: 'Consider inspecting.',
      significantAnomaly: 'Significant anomaly detected.',
      immediateInspection: 'Consider immediate inspection.',
    },
    multiclass: {
      noMatch: 'No match with trained states ({{score}}%). Signal unclear.',
      healthy:
        'Baseline state "{{label}}" detected ({{score}}% match). Machine operating normally.',
      faulty: 'State "{{label}}" detected ({{score}}% match). Deviation from normal state.',
    },
  },

  // ============================================================================
  // HARDWARE CHECK
  // ============================================================================
  hardware: {
    sampleRateLow: 'Sample rate too low ({sampleRate} Hz)',
    currentSampleRate: 'Current: {sampleRate} Hz',
    recommendedSampleRate: 'Recommended: at least {minRate} Hz',
    microphoneId: 'Microphone {id}',
    optimizedForDiagnosis: '{label} – suitable for testing',
    suitable: 'Hardware suitable for machine check',
    voiceOptimized: 'Voice-optimized hardware filters machine sounds.',
    useStudioMic: 'Use a studio microphone or the built-in device microphone',
    headsetsOptimized: 'Headsets are optimized for voice frequencies',
    mayFilter: 'Machine sounds may be filtered or suppressed',
    lowSampleRate: 'Low sample rates cannot capture high-frequency machine signals',
    microphoneDenied: 'Microphone access denied or not available',
    iphoneBackMic: 'iPhone rear microphone',
    micReady: 'Microphone ready',
    iosMicHint:
      'iOS briefly needs camera access to select the best microphone – camera will not be used.',
  },

  // ============================================================================
  // COMMON
  // ============================================================================
  common: {
    machine: 'Machine',
    error: 'Error',
    warning: 'Warning',
    info: 'Info',
    success: 'Success',
    yes: 'Yes',
    no: 'No',
    or: 'or',
    ok: 'OK',
    loading: 'Loading...',
    initializing: 'Initializing...',
    saving: 'Saving…',
    unknown: 'unknown',
  },

  // ============================================================================
  // ROUTER / UI DESCRIPTIONS
  // ============================================================================
  router: {
    statesTrained: '{{count}} state{{plural}} trained (last: {{date}}) - Add more',
    referenceRequired: '{{duration}}-second normal state recording (Required for check)',
    liveAnalysis: 'Run live analysis',
    lastCheck: 'Last check {{time}}',
  },

  diagnosisAudio: {
    title: 'Store check audio',
    description:
      'Controls whether the measurement audio is kept so a past check can be replayed later.',
    noneLabel: 'No audio',
    noneDesc: 'Lean',
    latestLabel: 'Latest only',
    latestDesc: 'Recommended',
    allLabel: 'All',
    allDesc: 'Full',
  },
  viewLevels: {
    basic: 'Simple traffic light display for operators',
    advanced: 'Details for supervisors & maintenance staff',
    expert: 'All technical values and tools',
    basicLabel: 'Basic',
    basicDesc: 'Simple',
    advancedLabel: 'Advanced',
    advancedDesc: 'Details',
    expertLabel: 'Pro',
    expertDesc: 'Everything',
    viewModeTitle: 'View Mode',
    viewModeDescription: 'Adjust the complexity of the user interface to your needs.',
  },

  notifications: {
    confirmRequired: 'Confirmation required',
    closeNotification: 'Close notification',
  },

  errorBoundary: {
    unexpectedError: 'An unexpected error has occurred.',
    unexpectedErrorTitle: 'Unexpected Error',
    permissionDenied: 'Access denied',
    permissionHint: 'Please allow access to microphone/camera in your browser settings.',
    hardwareNotFound: 'Hardware not found',
    hardwareHint: 'Please make sure your microphone/camera is connected.',
    audioSystemError: 'Audio system error',
    audioSystemHint: 'Please reload the page. If the problem persists, use an up-to-date browser.',
    storageFull: 'Please delete old checks or reference recordings.',
    networkError: 'Please check your internet connection.',
    technicalDetails: 'Technical details',
    noStackTrace: 'No stack trace available',
  },

  qualityCheck: {
    noFeatures: 'No features available',
    noAudioData: 'No audio data extracted (Frame Count 0)',
    highVariance: 'High spectral variance - Signal unstable',
    veryHighVariance: 'Very high variance - Please record in a quieter environment',
    outliers: '{{count}} outliers detected ({{ratio}}%) - Possible interference noise',
    weakSignal:
      'Very weak/diffuse signal - Possibly just noise. Please move closer to the machine.',
    weakTonal: 'Weak tonal signal - Signal-to-noise ratio may be too low.',
    trainingSignalWeak:
      'Signal too weak or inconsistent for training. Please ensure: microphone close to machine, machine is running, not just background noise. (Average cosine similarity: {{value}})',
    invalidSampleRate:
      'Invalid sample rate: {{rate}}Hz. Expected: 8000-192000Hz (typical: 44100Hz or 48000Hz)',
  },

  healthGauge: {
    normal: 'NORMAL',
    deviation: 'DEVIATION',
    abnormal: 'ABNORMAL',
    explain:
      'The score shows similarity to the reference state (0–100%). 100% = nearly identical. A declining trend matters more than a single value.',
    explainTitle: 'What does the score mean?',
  },

  // Inspection View (Simplified PWA)
  inspection: {
    // Header
    mainQuestion: 'Does the machine sound normal?',
    subtitle: 'Inspection running – please stay close to the machine',
    subtitleInitializing: 'Preparing – please wait',
    // Status words (simple, non-technical)
    statusNormal: 'Normal',
    statusUncertain: 'Uncertain',
    statusDeviation: 'Deviation',
    // Reference info
    referenceState: 'Reference state',
    referenceDefault: 'Normal operation',
    // Dynamic hints for poor signal quality
    hintMoveCloser: 'Please move closer to the machine',
    hintChangePosition: 'Slightly change position',
    hintHoldSteady: 'Hold device steady',
    hintWaiting: 'Waiting for machine signal...',
    // Button
    stopButton: 'STOP',
  },

  audio: {
    ready: 'Ready',
    stabilizing: 'Acoustic stabilization... {{seconds}}s',
    waitingForSignal: 'Waiting for signal...',
    recordingRunning: 'Recording in progress',
  },

  settingsUI: {
    allSettings: 'All settings',
    title: 'Settings',
    nfcWriterTitle: 'NFC tags',
    nfcWriterDescription: 'Write NFC tags for app access or a selected machine.',
    appearance: 'Appearance',
    audioSettings: 'Audio Settings',
    audioHardware: 'Audio Hardware',
    detectingMic: 'Detecting microphone...',
    detectingMicrophone: 'Detecting microphone...',
    initHardwareCheck: 'Initializing hardware check',
    changeMicrophone: 'Change microphone',
    confidenceThreshold: 'Confidence threshold',
    faultyThreshold: 'Anomaly threshold',
    recordingDuration: 'Recording duration',
    recordingDurationDesc:
      'Net recording time for training data. An additional 5 seconds of stabilization time is added for optimal audio quality.',
    seconds5: '5 seconds',
    seconds10: '10 seconds',
    seconds15: '15 seconds',
    seconds: 'seconds',
    frequencyAxis: 'Frequency axis',
    frequencyAxisDesc: 'Logarithmic (more detail in 20-500 Hz range)',
    frequencyLogDesc: 'Logarithmic (more detail in 20-500 Hz range)',
    amplitudeAxis: 'Y-axis / Amplitude',
    amplitudeAxisDesc: 'Logarithmic (dB) - emphasizes quiet signals',
    amplitudeLogDesc: 'Logarithmic (dB) - emphasizes quiet signals',
    disableAudioTriggerLabel: 'Disable Audio Trigger',
    disableAudioTriggerDesc:
      'Starts the measurement immediately, even with very quiet signals, without waiting for a minimum level. For extremely quiet machines or environments.',
    analysisMethod: 'Analysis Method',
    analysisMethodDesc: 'Select the appropriate analysis method for your machine.',
    gmaiMethodDesc:
      'GMIA (Generalized Mutual Interdependence Analysis) extracts the common, stable components from multiple time windows while suppressing device-specific effects. Ideal for structured, time-stable machine sounds. Runs fully offline.',
    engineDescSpectral:
      'Compares the sound spectrum against an averaged reference, independent of loudness. Ideal for single, steady machines. Runs fully offline.',
    engineDescYamnet:
      'Neural sound fingerprint via an AI model. Ideal for complex or time-varying sounds. Downloads a model on first use, then works offline.',
    engineDescTemporal:
      'Temporal pattern analysis (Tier 2): keeps the time course instead of averaging – for non-stationary machines with cycles, clicks or changing operating points (e.g. valves, presses). Runs fully offline.',
    evaluationEngineLabel: 'Evaluation engine',
    evaluationEngineGmia: 'GMIA (default)',
    evaluationEngineSpectral: 'Spectral cosine (one-class)',
    evaluationEngineYamnet: 'YAMNet (neural, beta)',
    evaluationEngineTemporal: 'Temporal patterns (Tier 2, Beta)',
    evaluationEngineDesc:
      'Selects the evaluation for NEW reference recordings. Already trained machines are still evaluated with their original engine. GMIA remains the default.',
    evaluationEngineSaveError:
      'The evaluation engine could not be saved. Storage may be full or you may be in private mode.',
    evaluationEngineSaveErrorTitle: 'Storage error',
    level1Info: 'Level 1: Frequency and amplitude settings above are active',
    dataManagement: 'Data Management',
    exportDatabase: 'Export database',
    shareDatabase: 'Send database file',
    importDatabase: 'Import database',
    statistics: 'Statistics:',
    machines: 'Machines',
    recordings: 'Recordings',
    diagnoses: 'Checks',
    clearAllData: 'Delete all data',
    deleteAllData: 'Delete all data',
    quickAccessDesc: 'Quick access to recently used machines',
    noMachines: 'No machines available',
    or: 'or',
    selectMicrophone: 'Select microphone',
    microphoneAdvice:
      'Select the best microphone for machine check. Avoid headsets and Bluetooth devices as they are optimized for speech.',
    manualInput: 'Enter manually',
    machineIdInput: 'Enter machine ID',
    continue: 'Continue',
    qrHint: 'Hold QR code or barcode in the frame',
    codeRecognized: 'Code recognized!',
    // Banner settings
    themeToggle: 'Toggle theme',
    closeSettings: 'Close settings',
    // Room Compensation (Expert only)
    roomCompTitle: 'Room Compensation',
    roomCompDescription:
      'Compensates acoustic room effects (reverberation) for more stable results across different environments.',
    roomCompEnabled: 'Enable Room Compensation',
    biasMatchEnabled: 'Session Bias Match',
    biasMatchHint:
      'Compensates spectral differences between recording sessions (different rooms, mic positions). Recommended for room changes.',
    cmnEnabled: 'CMN (experimental)',
    cmnWarning:
      '⚠️ May degrade scores for stationary machines. Prefer "Session Bias Match" or T60/Dereverb.',
    t60Enabled: 'Room measurement via chirp',
    t60Hint: 'Automatically plays a short tone to measure reverberation time',
    betaLabel: 'Compensation Strength (β)',
    roomCompActiveHint: '🔧 Room compensation active',
    // Cherry-Picking (Expert only)
    cherryPickTitle: 'Cherry-Picking',
    cherryPickDescription:
      'Automatically filters transient interference (horns, hammering, doors) from recordings.',
    cherryPickEnabled: 'Cherry-Picking enabled',
    sigmaLabel: 'Sensitivity (σ)',
    sigmaHint: 'Low = stricter (more frames rejected), High = more tolerant',
    cherryPickActiveHint:
      'Cherry-Picking active: Transient interference is automatically detected and removed.',
    // Reset to Defaults
    resetSection: 'Default Settings',
    resetDescription: 'Resets all display options to the initial state. Machine data is preserved.',
    resetButton: 'Restore Default Settings',
    resetConfirm: 'Really reset?',
    resetSuccess: 'Default settings restored.',
    resetDescriptionShort: 'Machine data is preserved.',
  },

  // ============================================================================
  // ROOM MEASUREMENT (Standalone T60 in Settings)
  // ============================================================================
  roomMeasure: {
    title: 'Room Measurement',
    description:
      "Measures the reverberation time (T60) of your current environment using a chirp signal. Hold the smartphone freely in the room (don't cover it).",
    measureBtn: 'Measure room',
    measureAgain: 'Measure again',
    measuring: 'Measuring...',
    chirpProgress: 'Chirp {{current}}/{{total}}...',
    individual: 'Individual measurements',
    stddev: 'Standard deviation',
    stable: 'stable',
    unstable: 'unstable',
    veryDry: 'very dry',
    dry: 'dry',
    medium: 'medium reverberant',
    reverberant: 'reverberant',
    veryReverberant: 'very reverberant',
    classVeryDry: 'Very dry room – ideal for measurements',
    classDry: 'Dry room – good conditions',
    classMedium: 'Medium reverberant – acceptable conditions',
    classReverberant: 'Reverberant – results may be affected',
    classVeryReverberant: 'Very reverberant – move closer to the machine',
    errorNoResult:
      'Measurement failed. Possible causes:\n• Environment too loud (turn off machine)\n• Smartphone speaker too quiet\n• Increase device volume',
    errorMicPermission: 'No microphone access. Please allow access in browser settings.',
    errorNoMic: 'No microphone found.',
    errorGeneric: 'Measurement failed. Please try again.',
  },

  // ============================================================================
  // NOISE PROFILE SUBTRACTION
  // ============================================================================
  noiseSub: {
    title: 'Noise Profile Subtraction',
    description:
      'Subtracts a previously recorded ambient noise profile (machine off) from the measurement. Helpful when background noise and machine are similarly loud.',
    enabled: 'Enable noise profile subtraction',
    profileLabel: 'Active noise profile',
    noProfile: 'No profile selected',
    recordBtn: 'Record ambient noise',
    recordHint:
      'Important: turn the machine off (or leave it off). {{seconds}} seconds of pure ambient noise will be recorded.',
    recording: 'Recording… {{seconds}}s',
    processing: 'Computing profile…',
    saved: 'Noise profile saved.',
    savedUnstable:
      'Profile saved – the environment was unsteady during recording. Re-record when it is quieter for a more stable profile.',
    defaultName: 'Noise profile {{date}}',
    deleteBtn: 'Delete profile',
    deleteConfirm: 'Really delete the selected noise profile?',
    betaLabel: 'Subtraction strength (β)',
    profileMeta: '{{date}} · {{duration}}s · {{frames}} frames',
    limitReached:
      'Maximum number of profiles reached ({{max}}). Please delete an old profile first.',
    errorGeneric: 'Recording failed. Please try again.',
    errorMicPermission: 'No microphone access. Please allow access in browser settings.',
    errorNoMic: 'No microphone found.',
    rowLabel: 'Noise profile',
    incompatible:
      'Noise profile does not match the current recording configuration (sample rate) – subtraction skipped.',
    snrMachineDominates: 'Machine dominates',
    snrSimilarLevels: 'Similar levels – subtraction effective',
    snrNoiseDominates: 'Background louder – limited reliability',
    warnStale: 'Profile {{days}} days old – consider re-recording',
    warnOverlap: 'Profile resembles the machine signature (neighboring machine?)',
    warnDevice: 'Different microphone than during profile recording',
    minStatsEnabled: 'Fallback without profile (minimum statistics)',
    minStatsHint:
      'When no matching profile is available, the noise floor is estimated live during the check from the running energy minimum (only in machine-weak frequency ranges; requires an existing reference). Less accurate than a real profile.',
    minStatsName: 'Minimum statistics (no profile)',
  },

  // ============================================================================
  // ZERO-FRICTION RECORDING (Auto-Machine Creation)
  // ============================================================================
  zeroFriction: {
    // Auto-generated machine names
    autoMachineName: 'Machine {{number}}',
    // Success toast after silent save
    referenceCreatedToast: 'Normal state for {{machineName}} created',
    // Edit button in toast/success screen
    editMachineName: 'Edit',
    // Prompt for editing machine name after creation
    editMachineNamePrompt: 'Enter new name for the machine:',
    // Success after renaming
    machineRenamed: 'Machine renamed to "{{newName}}"',
    // No machine selected hint (for when starting recording without machine)
    noMachineSelected: 'No machine selected – will be created automatically',
  },

  // ============================================================================
  // AUTO-DETECTION (Simplified "Check condition" Flow)
  // ============================================================================
  autoDetect: {
    // Primary CTA
    startButton: 'Check now',
    hint: 'The system automatically recognizes known machines',

    // Manual selection toggle
    showManualSelection: 'Select machine manually',
    hideManualSelection: 'Hide manual selection',

    // Listening modal
    listening: 'Listening...',
    waitingForSignal: 'Please hold microphone near the machine',
    initializing: 'Initializing...',
    analyzing: 'Analyzing sound...',

    // Fall A: Machine recognized (≥80%)
    machineRecognized: 'Machine recognized',
    matchConfidence: 'Match confidence',
    continueAnalysis: 'Continue analysis',
    differentMachine: 'Different machine',

    // Fall B: Uncertain match (40-79%)
    uncertainMatch: 'Which machine is this?',
    selectMachine: 'Please select the matching machine',

    // Fall C: No match (<40%)
    noMatch: "I don't recognize this sound yet",
    noMatchHint: 'Would you like to record a normal state?',
    recordReference: 'Record normal state',
    newMachine: 'Create new machine',
  },

  // ============================================================================
  // NFC WRITER
  // ============================================================================
  nfc: {
    title: 'Write NFC tag',
    description: 'Choose what information should be written to the NFC tag.',
    supportDetails: 'Secure context: {{secureContext}} · NDEFReader available: {{ndefReader}}',
    openWriter: 'Write NFC tag',
    writeButton: 'Write now',
    optionGeneric: 'App link (generic)',
    optionGenericDetail: 'Opens the app without a machine ID.',
    optionSpecific: 'Machine link',
    optionSpecificDetailDefault: 'Opens the app for the currently selected machine.',
    optionSpecificDetail: 'Opens the app for "{{name}}" (ID: {{id}}).',
    optionSpecificUnavailable: 'Select a machine first to write a specific link.',
    hint: 'Hold the NFC tag to the back of your device.',
    unavailableHint: 'NFC writing is only available in Chrome on Android.',
    statusWriting: 'Writing NFC tag...',
    statusSuccess: 'NFC tag written successfully.',
    statusCancelled: 'Write cancelled.',
    statusError: 'Could not write NFC tag.',
    unsupported: 'NFC writing is not supported on this device.',
    requiresSecureContext: 'NFC writing requires a secure (HTTPS) connection.',
    unsupportedBrowser: 'NFC writing requires Chrome on Android.',
    // Customer ID (Variant B)
    customerIdLabel: 'Reference collection (c)',
    customerIdDescription:
      'The name of the collection the references are loaded from when the NFC tag is scanned. Your own or a shared one: whoever publishes a collection passes their normal state on to everyone who knows the name.',
    customerIdPlaceholder: 'e.g. golf-7-tdi-idle',
    customerIdRequired: 'Please enter a name for the reference collection.',
    dbUrlPreview: 'Data URL: {{url}}',
    closeDialog: 'Close NFC dialog',
    // Fleet option
    optionFleet: 'Fleet link (fleet check)',
    optionFleetDetailDefault: 'Opens the app with a complete fleet.',
    optionFleetDetail: 'Opens the app for fleet "{{name}}".',
    fleetSelectLabel: 'Select fleet',
    noFleets: 'No fleets available',
    machine: 'machine',
    machines: 'machines',
    fleetRequiresCustomerId: 'Please choose a reference collection and a fleet.',
    // Quick Compare count-only option
    optionQuickCompareCount: 'Quick compare (count only)',
    optionQuickCompareCountDetailDefault:
      'Opens the app for a quick compare with a set number of machines. No internet needed.',
    optionQuickCompareCountDetail:
      'Opens a quick compare with {{count}} machines. No internet needed.',
    quickCompareCountLabel: 'How many machines?',
    quickCompareCountHint: 'No internet needed when scanning. Machines are named automatically.',
  },

  // ============================================================================
  // QR CODE GENERATOR
  // ============================================================================
  qrCode: {
    title: 'Create QR Code',
    description: 'Create a QR code to print or save. Simply attach it to the machine — done.',
    openGenerator: 'Create QR Code',
    optionGeneric: 'App link (generic)',
    optionGenericDetail: 'Opens the app without a machine ID.',
    optionSpecific: 'Machine link',
    optionSpecificDetailDefault: 'Opens the app for the currently selected machine.',
    optionSpecificDetail: 'Opens the app for "{{name}}" (ID: {{id}}).',
    optionSpecificUnavailable: 'Select a machine first to create a specific QR code.',
    customerIdLabel: 'Reference collection (c)',
    customerIdDescription:
      'The name of the collection the references are loaded from when scanning — your own or a shared one.',
    customerIdPlaceholder: 'e.g. golf-7-tdi-idle',
    customerIdRequired: 'Please enter a name for the reference collection.',
    dbUrlPreview: 'Data URL: {{url}}',
    urlPreview: 'Link preview',
    downloadPng: 'Save as image',
    print: 'Print',
    closeDialog: 'Close QR code dialog',
    generatedFor: 'QR code for',
    machineLabel: 'Machine',
    machineIdLabel: 'ID',
    dateLabel: 'Created on',
    printTitle: 'Machine QR Code',
    printInstructions: 'Cut out QR code and attach to the machine.',
    genericLabel: 'App Access',
    // Fleet option
    optionFleet: 'Fleet link (fleet check)',
    optionFleetDetailDefault: 'Creates a QR code for a complete fleet.',
    optionFleetDetail: 'Creates QR code for fleet "{{name}}".',
    fleetSelectLabel: 'Select fleet',
    fleetLabel: 'Fleet',
    fleetPrintTitle: 'Fleet QR Code',
    // Quick Compare count-only option
    optionQuickCompareCount: 'Quick compare (count only)',
    optionQuickCompareCountDetailDefault:
      'Creates a QR code for a quick compare with a set number of machines.',
    optionQuickCompareCountDetail: 'Creates quick compare QR code for {{count}} machines.',
  },

  review: {
    title: 'Review Recording',
    subtitle: 'Quality Control',
    listenTitle: 'Listen to Recording',
    browserNoAudio: 'Your browser does not support audio playback.',
    recordingInfo: '{{total}} seconds recording (5s stabilization + {{duration}}s training)',
    positionImageTitle: 'Saved Position Image',
    savedPositionImage: 'Saved Position Image',
    positionImageCheck: 'Check if the image shows the correct position.',
    qualityTitle: 'Quality Assessment',
    quality: 'Quality',
    issuesTitle: 'Detected Issues:',
    discardNew: 'Discard / New',
    saveAsReference: 'Save as Reference',
  },

  diagnosisResults: {
    title: 'Check Results',
    fingerprintLabel: 'Fingerprint',
    confidenceScoreLabel: 'Confidence score',
    varianceTitle: 'Variance',
    frequencyAnomalyLabel: 'Frequency anomaly',
    analysisHintDefault: 'Hint: Slightly increased signal around 20 kHz',
    measurementQualityWarning:
      '⚠ Measurement signal very weak – result barely usable. Move closer to the machine and measure again in a quieter environment.',
    referenceQualityTitle: 'Recording Quality',
    referenceQualityStatusGood: 'GOOD',
    referenceQualityDescription: 'Recording meets recommended conditions',
    featureModeLabel: 'Feature Mode',
    viewHistory: 'View History',
    closeDialog: 'Close check',
  },

  // ============================================================================
  // RESULTS – Result Modal Context Hints
  // ============================================================================
  results: {
    envMatch: {
      moreReverberant: '🏠 Environment more reverberant than reference – score may be affected',
      lessReverberant: '🏠 Environment less reverberant than reference – score may be affected',
      critical: '⚠️ Environment strongly deviating – score interpretation limited',
    },
  },

  historyChart: {
    title: 'Machine History',
    machineName: 'Machine',
    dataPoints: 'Data Points',
    timeRange: 'Time Range',
    xAxisLabel: 'Time',
    yAxisLabel: 'Similarity Score (%)',
    noData: 'No history available yet',
    noDataMessage: 'No checks have been saved for this machine yet.',
    errorMessage: 'Error loading history.',
    closeDialog: 'Close history',
    anomalyListTitle: 'Notable features (last check)',
    anomalyNone: 'No notable features detected.',
    tooltipAnomaly: 'Notable: {{freq}} ({{strength}}%)',
  },

  // Work Point Ranking (Probability Distribution View)
  workPointRanking: {
    title: 'State Analysis',
    states: 'States',
    ariaLabel: 'Ranking of detected machine states',
    statusHealthy: 'Normal',
    statusFaulty: 'Abnormal',
    noData: 'No analysis data available',
    rank: 'Rank',
    probability: 'Probability',
    topMatch: 'Best match',
    sectionTitle: 'Detailed State Distribution',
    sectionDescription: 'Probability distribution of all trained machine states',
  },

  themes: {
    focusTitle: 'Steve Jobs',
    focusDescription: 'One action. No noise. Focus on what matters – everything else fades away.',
    focusDesc: 'One action. No noise. Clarity that works.',
    daylightTitle: 'Daylight',
    daylightDescription:
      'Bright, glare-friendly theme for outdoor use. Clear contrast improves readability in sunlight.',
    daylightDesc:
      'Bright, glare-friendly theme for outdoor use. Clear contrast improves readability in sunlight.',
    brandTitle: 'SoundFuchs',
    brandDescription: 'Light, friendly, trustworthy. AI you can trust.',
    brandDesc: 'Light, friendly, trustworthy. AI you can trust.',
    neonTitle: 'Neon Industrial',
    neonDescription:
      'High-contrast neon palette for low-light environments. Accents guide attention to critical actions.',
    neonDesc:
      'High-contrast neon palette for low-light environments. Accents guide attention to critical actions.',
  },

  // ============================================================================
  // MACHINE SETUP (NFC Deep Link - Status/Error Messages)
  // Note: Manual URL entry UI was removed - referenceDbUrl is now derived
  // from customerId via HashRouter.buildDbUrlFromCustomerId()
  // ============================================================================
  machineSetup: {
    downloadFailedHint:
      'Reference data could not be loaded. You can record the normal state directly at the machine — or retry the download.',
    retryDownload: 'Retry download',
    // Validation errors (used by 1-Identify.ts for URL validation)
    urlEmpty: 'Please enter a reference DB link.',
    urlInvalid: 'The link does not appear to be a valid URL.',
    urlNotHttps: 'The link must start with https://.',
    urlNotOfficialSource: 'Only official data sources (gunterstruck.github.io) are accepted.',

    // Download status (used by HashRouter, 1-Identify.ts, ReferenceLoadingOverlay)
    downloadingReference: 'Loading reference data...',
    statusDownloading: 'Downloading reference data...',
    statusParsing: 'Processing data...',
    statusValidating: 'Validating format...',
    statusSaving: 'Saving locally...',
    statusComplete: 'Complete!',

    // Download errors (used by HashRouter, 1-Identify.ts)
    errorMachineNotFound: 'Machine not set up. Please contact the service technician.',
    errorNoReferenceUrl: 'No reference data configured. Please contact the service technician.',
    errorDownloadFailed: 'Download failed. Please check your internet connection.',
    errorInvalidFormat: 'The reference data has an invalid format.',
    errorInvalidStructure: 'The data structure is corrupted.',
    errorNoModels: 'No reference models found in the data.',
    errorInvalidModel: 'One or more reference models are corrupted.',
    errorUnknown: 'An unknown error occurred.',

    // Success messages (used by ReferenceLoadingOverlay)
    referenceLoaded: 'Reference data loaded successfully!',

    // Loading overlay (used by ReferenceLoadingOverlay)
    loadingTitle: 'Loading reference',
    loadingSubtitle: 'Please wait...',
    testingBlocked: 'Testing is only available after reference data is loaded.',
  },

  footer: {
    impressum: 'Legal Notice',
    privacy: 'Privacy Policy',
    about: 'About SoundFuchs',
    settings: 'Settings',
    closeImpressum: 'Close legal notice',
    closePrivacy: 'Close privacy policy',
    closeAbout: 'Close about SoundFuchs',
  },

  // ============================================================================
  // NFC IMPORT (Deep Link Import via ?importUrl=)
  // ============================================================================
  nfcImport: {
    // Modal
    modalTitle: 'NFC Backup Detected',
    warningOverwrite: 'Warning: Local database will be overwritten!',
    currentData: 'Current Data',
    newData: 'New Data',
    exportedAt: 'Exported on',
    confirmButton: 'Import Data',

    // Success
    success: 'Database imported successfully!',
    successTitle: 'Import Complete',

    // Errors
    error: 'Import failed',
    errorTitle: 'Import Failed',
    errorGitHubBlob: 'Error: Please use the "Raw" link from GitHub, not the web link.',
    errorFetchFailed: 'Download failed. Please check the URL.',
    errorNotJson:
      'Error: The URL returns HTML instead of JSON.\n\nPlease use the "Raw" link from GitHub:\n1. Open the file on GitHub\n2. Click on "Raw"\n3. Copy the URL from the address bar',
    errorInvalidJson: 'Error: The file does not contain valid JSON format.',
    errorInvalidStructure: 'Error: The file does not have the expected backup format.',
    errorNetwork: 'Network error loading data. Please check your internet connection.',
    nfcMergeSuccess:
      '\u2705 Database updated – {{added}} new references added, {{skipped}} already present',
    nfcMergeInfo: 'Existing machines and references are preserved.',
  },

  // ============================================================================
  // URL IMPORT (Deep Link Import via #/import?url=)
  // ============================================================================
  urlImport: {
    // Status messages (loading overlay)
    statusFetching: 'Loading database...',
    statusValidating: 'Validating data...',
    statusImporting: 'Importing data...',

    // Success
    success: 'Database imported successfully!',
    successTitle: 'Import Complete',

    // Errors
    errorTitle: 'Import Failed',
    errorGeneric: 'Import failed.',
    errorInvalidUrl: 'Invalid URL.',
    errorFetchFailed: 'Download failed (HTTP {{status}}).',
    errorFileTooLarge: 'File too large. Maximum size: 50 MB.',
    errorNotJson: 'The URL returns HTML instead of JSON. Please check the link.',
    errorInvalidJson: 'The file does not contain valid JSON format.',
    errorInvalidStructure: 'The file does not have the expected database format.',
    errorNetwork: 'Network error loading data. Please check your internet connection.',
  },

  // ============================================================================
  // ONBOARDING TRACE (Debug Protocol)
  // ============================================================================
  trace: {
    // UI
    title: 'Debug Protocol',
    toggle: 'Toggle protocol',
    copyToClipboard: 'Copy protocol',
    copy: 'Copy',
    copied: 'Copied!',
    copyFailed: 'Error',
    noEntries: 'No entries yet',

    // Status
    statusRunning: 'Running...',
    statusComplete: 'Complete',
    statusFailed: 'Failed',

    // Step labels - these map to TraceStepId
    steps: {
      // Deep Link Processing
      deep_link_detected: 'Deep link detected',
      hash_parsed: 'Hash parsed',
      machine_id_extracted: 'Machine ID extracted',
      customer_id_extracted: 'Reference collection recognised',
      db_url_derived: 'DB URL derived',
      import_url_detected: 'Import URL detected',

      // Download Process
      download_started: 'Download started',
      download_complete: 'Download complete',
      download_failed: 'Download failed',

      // JSON Processing
      json_parse_started: 'JSON parse started',
      json_parse_complete: 'JSON parse successful',
      json_parse_failed: 'JSON parse failed',

      // Validation
      schema_validation_started: 'Schema validation started',
      schema_validation_complete: 'Schema validation successful',
      schema_validation_failed: 'Schema validation failed',

      // Database Operations
      db_reset_started: 'DB reset started',
      db_import_started: 'DB import started',
      db_import_complete: 'DB import complete',
      db_import_failed: 'DB import failed',

      // App State
      app_state_reload: 'App state reloaded',

      // Machine Operations
      machine_lookup: 'Looking up machine',
      machine_found: 'Machine found',
      machine_not_found: 'Machine not found',
      machine_created: 'Machine created',
      machine_selected: 'Machine selected',

      // Final Steps
      test_dialog_shown: 'Test dialog shown',
      process_complete: 'Process complete',
      process_failed: 'Process failed',
    },
  },

  // ============================================================================
  // BADGES (UI Hints)
  // ============================================================================
  badges: {
    recommended: 'Suggested',
    nextStep: 'Next Step',
  },

  // ============================================================================
  // DATABASE MIGRATION
  // ============================================================================
  migration: {
    title: 'Database Update',
    dataCleared:
      'The database was reset due to an update. All machines, recordings and checks have been deleted.',
  },

  // ============================================================================
  // ABOUT MODAL
  // ============================================================================
  about: {
    dataTitle: 'Data used',
    dataPlzPlaces: 'Postcode place names',
    dataPlzCoords: 'Postcode coordinates',
    dataPlzAreas: 'Postcode areas (polygons)',
    dataMapTiles: 'Map tiles',
    title: 'About SoundFuchs',
    subtitle: 'Assistant for acoustic comparison of machine states',

    // Introduction
    intro:
      '<strong>SoundFuchs 2.0</strong> is a privacy-friendly <strong>sound assistant</strong>. The Progressive Web App records, compares and marks machine sounds locally and prepares a <strong>sound briefing</strong> for specialists or external AI — without cloud services or an account.<br><br><strong>SoundFuchs does not diagnose.</strong> It makes clear what the user means; professional review and interpretation remain with the recipient.',

    // Core Features
    coreFeaturesTitle: 'Core Features',
    coreFeatures: {
      offlineFirst:
        '<strong>Offline-First:</strong> All recordings and calculations are performed locally in the browser.',
      similarityScore:
        '<strong>Similarity Score (0–100%):</strong> SoundFuchs computes a mathematical similarity (cosine similarity) between reference and comparison recording.',
      userThreshold:
        '<strong>User-defined Threshold:</strong> Users define themselves at which score a state counts as "normal" or "deviating".',
      visualFeedback:
        '<strong>Visual Spectrum Feedback:</strong> Real-time display of frequency spectrum and comparison result.',
      noDataLeaks:
        "<strong>Local Data Storage:</strong> All audio recordings and scores are stored exclusively in the device's local IndexedDB.",
    },

    // Technische Abgrenzung
    legalTitle: 'Technical Delimitation',
    legalIntro:
      'SoundFuchs was independently developed as a <strong>private, non-commercial open-source project</strong> under the <strong>MIT license</strong>. Its functionality is based on <strong>openly described mathematical procedures</strong> (e.g., frequency analysis and GMIA-like cosine comparisons) and incorporates <strong>no patented system logic</strong>, <strong>no classification mechanisms</strong>, and <strong>no learning models</strong>.',

    // IP Table
    ipTableTitle: 'Relevant IP and Technical Differentiation',
    ipTable: {
      headers: {
        reference: 'Reference / Title',
        source: 'Source & Status',
        protectedScope: 'Protected Scope',
        soundfuchsDiff: 'Differentiation from SoundFuchs',
      },
      rows: {
        '0': {
          reference:
            '<strong>PAPDEOTT005125</strong><br><em>Procedure for diagnosing machines</em>',
          source: 'Defensive publication, Siemens AG, 2016',
          protectedScope:
            'Cloud-based diagnostic system using central databases and mobile sensors',
          soundfuchsDiff:
            'SoundFuchs operates fully locally, without cloud, without central database, without diagnostics',
        },
        '1': {
          reference: '<strong>EP3701708B1</strong><br><em>Remote machine condition analysis</em>',
          source: 'European Patent, Siemens AG, 2022',
          protectedScope: 'ML-based remote diagnostics with trained models and sensors',
          soundfuchsDiff:
            'SoundFuchs uses no machine learning, no cloud, no embedded diagnostic logic',
        },
        '2': {
          reference:
            '<strong>US9263041B2</strong><br><em>Channel detection in noise using GMIA</em>',
          source: 'Siemens Corp., 2016',
          protectedScope: 'Application of GMIA for speech and hearing systems',
          soundfuchsDiff:
            'SoundFuchs uses GMIA-like mathematics exclusively for non-speech and local comparisons',
        },
        '3': {
          reference: '<strong>US9443201B2</strong><br><em>Learning of sensor signatures</em>',
          source: 'Siemens, 2016',
          protectedScope: 'Classification and model training of sensor signatures',
          soundfuchsDiff: 'SoundFuchs performs no classification and no model training',
        },
        '4': {
          reference: '<strong>US9602781B2</strong><br><em>Seismic signal deblending (GMIA)</em>',
          source: 'Schlumberger, 2017',
          protectedScope: 'Separation of seismic signals using GMIA',
          soundfuchsDiff: 'Different domain and signal type, unrelated',
        },
        '5': {
          reference: '<strong>ABB – Integration of Mobile Measurement</strong>',
          source: 'Public industry presentation, ABB, 2015',
          protectedScope:
            'Mobile sensors for ad-hoc diagnostics with cloud and service integration',
          soundfuchsDiff:
            'SoundFuchs avoids diagnostics, service workflows, and cloud connectivity, focusing on local comparison',
        },
      },
    },

    // Use Cases
    useCasesTitle: 'Use Cases',
    useCasesIntro:
      'SoundFuchs enables two fundamental comparison scenarios that differ in their temporal and spatial structure:',

    // Serial Comparison
    serialComparisonTitle: 'a) Serial Comparison (Temporal Comparison / Trend)',
    serialComparisonPrinciple:
      '<strong>Principle:</strong> Comparison of a current recording with a previously created reference of <strong>the same machine</strong>.',
    serialComparisonGoal:
      '<strong>Goal:</strong> Making changes in the acoustic pattern visible over time.',
    serialComparisonApplication:
      '<strong>Application:</strong><ul><li>A reference recording is created at a time when the machine is assessed as "normal"</li><li>Later recordings are compared with this reference</li><li>Deviations from the original pattern are quantified (similarity score)</li></ul>',
    serialComparisonHint:
      '<strong>Note:</strong> SoundFuchs only shows <strong>whether and how strongly</strong> the current sound differs from the reference. The interpretation of whether a deviation is relevant is made by the user. The system makes no assessment and provides no prognosis.',

    // Parallel Comparison
    parallelComparisonTitle:
      'b) Parallel Comparison (Comparison of Identical Machines / Fleet Check)',
    parallelComparisonPrinciple:
      '<strong>Principle:</strong> Comparison of multiple identical machines under similar operating conditions.',
    parallelComparisonGoal:
      '<strong>Goal:</strong> Identification of acoustic outliers within a group of identical machines.',
    parallelComparisonApplication:
      '<strong>Application:</strong><ul><li>Recordings of multiple identical machines (e.g., in a production hall) are created</li><li>SoundFuchs calculates the acoustic similarity between the machines</li><li>Machines whose sound signature significantly deviates from the group become visible</li></ul>',
    parallelComparisonSpecial:
      '<strong>Special feature:</strong> Works <strong>even without historical reference</strong>. The group itself forms the comparison basis.',
    parallelComparisonHint:
      '<strong>Note:</strong> SoundFuchs does not decide which machine is defective or which represents the "target state". It only shows <strong>relative deviations</strong> within the group. The assessment of whether a deviating machine should be further investigated is up to the user.',

    // NFC Section
    nfcTitle: 'NFC-based Instant Access and Context-based Comparison',
    nfcIntro:
      'SoundFuchs supports the <strong>use of NFC tags</strong> on machines to simplify app access and optionally provide a machine-specific context.',

    nfcFunctionalityTitle: 'How it works',
    nfcTagDescription:
      '<strong>NFC tag on the machine:</strong> An NFC tag placed on the housing or access point can contain the following information:<ul><li>URL to the SoundFuchs PWA (direct app launch in browser)</li><li>Machine ID for automatic identification</li><li>Optional: Reference to your own reference data (URL to a JSON file)</li></ul>',
    nfcInstantAccess:
      '<strong>Instant access without installation:</strong><ul><li>The user holds the smartphone to the NFC tag</li><li>The SoundFuchs PWA opens directly in the browser (no app store, no registration required)</li><li>Optional: The stored machine ID is automatically loaded</li></ul>',

    nfcReferenceDataTitle: 'Optional context-based reference data',
    nfcReferenceDataDescription:
      'The NFC tag can additionally contain a <strong>URL to a reference database</strong>. This database is provided by the machine operator or service partner and can include:<ul><li><strong>Reference recordings</strong> for various operating states of the machine</li><li><strong>Machine-specific metadata</strong> (e.g., type, year of manufacture, location)</li><li><strong>Comparison parameters</strong> for fleet checks of identical machines</li></ul>',

    nfcAdvantageTitle: 'Advantage for new or external users',
    nfcAdvantageDescription:
      'A service technician or operator checking the machine for the first time can:<ul><li><strong>Immediately perform an acoustic check</strong> without having to record a reference themselves</li><li><strong>Directly compare against existing reference data</strong> provided by the operator</li><li><strong>Without prior knowledge</strong> make an initial assessment of whether the current sound deviates from the stored reference</li></ul>',

    nfcDataPrivacyTitle: 'Data storage and privacy',
    nfcDataPrivacyImportant:
      "<strong>Important:</strong> The reference data is <strong>not stored in a SoundFuchs cloud</strong>. It is provided:<ul><li>In the operator's <strong>local network</strong> (e.g., intranet server)</li><li>In a <strong>self-hosted environment</strong> (e.g., GitHub Pages, own web server)</li><li>As a <strong>static JSON file</strong> accessible via an HTTPS URL</li></ul>",
    nfcDataPrivacyStorage:
      'The reference database is downloaded on the first NFC scan and then stored <strong>locally on the device</strong> (IndexedDB). All further comparisons are performed offline.',

    nfcFocusTitle: 'Focus and distinction',
    nfcFocusDescription:
      'The NFC-based access serves exclusively for <strong>accessibility and comparability</strong>. It enables:<ul><li>Quick start without manual configuration</li><li>Use of existing reference data without own recording</li><li>Consistent comparison basis for multiple users or locations</li></ul>',
    nfcNoFeatures:
      '<strong>Even when using NFC-based reference data, SoundFuchs:</strong><ul><li>Performs <strong>no assessment</strong> (no statement about damage cause or condition)</li><li>Performs <strong>no automation</strong> of decisions (no "good/bad" judgment)</li><li>Performs <strong>no cloud-based evaluation</strong> (all calculations are local)</li></ul>',
    nfcInterpretation: 'The interpretation of comparison results always remains with the user.',

    // Transparency
    transparencyTitle: 'Transparency and Intent',
    transparencyText1:
      'SoundFuchs is <strong>not a diagnostic tool</strong> and makes <strong>no automated technical assessments</strong>. It provides a <strong>visual and mathematical comparison aid</strong> and prepares a shareable <strong>sound briefing</strong>.',
    transparencyText2:
      'All processing happens <strong>offline</strong>. <strong>No user data is transmitted, stored, or evaluated</strong>.',
    transparencyText3:
      'This transparency expresses a conscious approach to responsibility, data protection, and third-party rights.',
    transparencyList: {
      noClassification: 'no state classification',
      noCauseAnalysis: 'no fault cause analysis',
      noRepairRecommendations: 'no repair notices',
    },

    // Public Instance
    publicInstance: 'Public instance:',
    publicInstanceUrl: 'https://soundfuchs.vercel.app',

    // Version Info
    version: 'Version:',
    versionNumber: '2.0.0 (2026)',
    developedBy: 'Developed by:',
    developerName: 'Günter Struck',
    license: 'License:',
    licenseType: 'MIT',
    stack: 'Technology Stack:',
    stackTech: 'TypeScript, Vite, Web Audio API',

    // Guiding Principle
    guidingPrincipleTitle: 'Guiding Principle',
    guidingPrincipleQuestion: 'Does the machine sound normal?',
    guidingPrincipleStatement: 'Smartphones hear machine sounds.',
    buildLabel: 'Build:',
    checkUpdate: 'Check for update',
    checkRunning: 'Checking …',
    checkFound: 'New version found — the update prompt appears shortly.',
    checkCurrent: 'This is the current version.',
    checkUnavailable: 'Checking is not possible here (no service worker).',
  },

  // ============================================================================
  // DRIFT DETECTOR (Change Analysis)
  // ============================================================================
  // EVENT TIMELINE (Tier 2 temporal engine, T2-a2)
  // ============================================================================
  // 3D SPECTROGRAM "MOUNTAIN" (history modal, expert)
  // ============================================================================
  // Deutscher Text bewusst auch hier: Übersetzung ausgesetzt (abgestimmt). t()
  // liefert bei fehlendem Schlüssel den rohen Schlüsselnamen zurück – deutscher
  // Klartext ist besser als "models.layoutOutdated" auf dem Bildschirm, und die
  // Paritätsprüfung (check-i18n) bleibt grün.

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
    show: '3D view (mountain)',
    hide: 'Close 3D view',
    hint: '1 finger: rotate · 2 fingers: zoom',
    axis: 'Axes: frequency (logarithmic) · time · height = intensity (dB)',
    sourceMeasurement: 'Measurement',
    sourceReference: 'Normal state',
    sourceDifference: 'Difference',
    sourceSigned: 'More or less',
    sameTime: '⏱ Same time span',
    fullTime: '⏱ Full recording',
    resetView: 'Reset view',
    compareScale: '⚖ Compare strength',
    detailScale: '🔎 Show detail',
    computing: '… computing …',
    unavailable: 'No view can be built from these recordings.',
  },

  // ============================================================================
  // SHARE RESULT AS IMAGE
  // ============================================================================
  share: {
    resultButton: 'Share as image',
    resultFooter: 'SoundFuchs sound check',
    resultFailed: 'The image could not be created.',
  },

  // ============================================================================
  temporalEvents: {
    title: 'Event timeline',
    legendKnown: 'known',
    legendAnomalous: 'anomalous',
    noEvents: 'No events detected yet',
    rateLine: 'Events/min: {{observed}} · reference: {{expected}}',
    densityMissing: 'Expected rhythm is missing: far fewer events than in the reference.',
    densityExcess: 'Far more events than in the reference (external noise?).',
    cycleLine: 'Cycle: {{period}} s · shape deviation: {{status}}',
    cycleOk: 'ok',
    cycleDeviant: 'high',
    cyclePending: 'observing …',
    recommendTitle: 'Non-stationary machine detected',
    recommendBody:
      'This machine sounds non-stationary (moving level, beat or cycle). The temporal-pattern engine (Tier 2) is built for this.',
    recommendAction: 'Enable temporal engine',
    recommendSwitched: 'Temporal engine enabled — it applies to newly trained references.',
  },

  // ============================================================================
  drift: {
    // Settings
    settingsTitle: '\uD83D\uDD0D Change Analysis',
    settingsDescription:
      'Analyzes whether score changes are caused by the environment (room) or the machine. Shows a separate assessment during check.',
    enabled: 'Change analysis enabled',
    howItWorks:
      'The system separates spectral changes into two components: Smooth, broadband drift (= room/environment) and local, narrowband changes (= machine). This helps you see whether a score drop comes from the room or the machine.',
    smoothWindow: 'Smoothing window',
    smoothHint:
      'Larger = more separation between room and machine. Smaller = more sensitive to room characteristics.',
    lowFreqCutoff: 'Low-frequency protection',
    lowFreqHint:
      'Bins below this are ignored for machine analysis. Protects against room modes in the bass that could be misinterpreted as machine changes. 0 = no protection.',
    globalThreshold: 'Environment sensitivity',
    globalThresholdHint: 'Low = warns earlier on room change. High = more tolerant.',
    localThreshold: 'Machine sensitivity',
    localThresholdHint: 'Low = detects small machine changes. High = more tolerant.',

    // Diagnose Panel
    title: 'Change Analysis',
    environment: 'Environment',
    machine: 'Machine',

    // Global Status
    globalOk: 'Environment consistent',
    globalWarning: 'Environment slightly changed',
    globalCritical: 'Environment strongly changed',

    // Local Status
    localOk: 'No structural change',
    localWarning: 'Minor change detected',
    localCritical: 'Significant change detected',

    // Interpretations
    allOk: '\u2705 Environment and machine consistent with reference',
    roomChange: '\uD83D\uDFE1 Environment change detected – machine unchanged',
    machineChange: '\uD83D\uDD34 Machine change detected – check machine',
    both: '\uD83D\uDFE0 Environment and machine changed – interpret results with caution',
    uncertain: '\uD83D\uDFE1 Unclear situation – measure closer to machine or create new reference',

    // Notices
    recommendRoom:
      'Score drop likely caused by environment or microphone position. Measure closer to machine, use same position as reference, or create new reference in this environment.',
    recommendMachine: 'Structural change in machine detected. Check maintenance.',
    recommendBoth:
      'Both environment and machine changed. For reliable results: create new reference in current environment.',
    recommendUncertain:
      'For clearer results: measure closer to machine, use same position as reference, or create reference in current environment.',

    // Contextual hints
    roomChangeButScoreOk:
      "\uD83D\uDCA1 Environment change detected, but score stable – that's a good sign.",
    roomChangeMayCauseScoreDrop:
      '\uD83D\uDCA1 Score drop may be caused by environment or microphone position, not the machine. Use same position as reference or create new reference here.',
    machineChangeDetected: '\u26A0\uFE0F Structural change in machine detected. Please check.',

    // Reference phase
    referenceHint:
      '\uD83D\uDCA1 Change analysis active: This recording also defines the reference environment and microphone position. Future checks will show whether the environment or machine has changed.',
    referenceStored:
      '\u2705 Environment profile stored. Future checks will automatically analyze whether changes come from the environment or the machine.',

    // Sprint 2 UX: Simplified drift summary (Advanced view)
    initializing: 'Environment analysis running…',
    summaryOk: 'Environment stable',
    summaryRoomChange: 'Environment changed – score may deviate',
    summaryMachineChange: 'Machine sound has changed',
    summaryBoth: 'Environment and machine changed',
    summaryUncertain: 'Environment analysis not yet conclusive',
  },

  // Sprint 2 UX: Contextual help texts (InfoBottomSheet)
  help: {
    reference: {
      title: 'What is the normal state?',
      body: '<p>The normal state is a 10-second recording of your machine during healthy operation.</p><p>All future checks compare against this state. The better the recording, the more accurately changes are detected.</p><p><strong>Tip:</strong> Record the normal state during normal operation and slowly move the smartphone around the machine so environmental influences can be filtered out.</p>',
    },
    diagnose: {
      title: 'What happens during "Check condition"?',
      body: '<p>The app records the current machine sound and mathematically compares it to the stored reference.</p><p>The result is a similarity score (0–100%). 100% means the machine sounds exactly like during the reference recording.</p><p>A declining trend across multiple measurements is more meaningful than a single value.</p>',
    },
    machines: {
      title: 'Why create a machine?',
      body: '<p>Every machine has its own acoustic profile. By creating a machine with a unique name, references and check history can be assigned.</p><p>This way you can see trends over time and detect changes early.</p>',
    },
    viewLevel: {
      title: 'View mode',
      body: '<p><strong>Basic:</strong> Simple traffic light display. For daily use by operators.</p><p><strong>Advanced:</strong> Additional details like spectrogram and environment monitoring. For maintenance staff.</p><p><strong>Expert:</strong> Full technical view with DSP parameters and debug information. For engineers.</p>',
    },
    spectrogram: {
      title: 'What does the spectrogram show?',
      body: '<p>The spectrogram shows the frequency distribution of the machine sound in real time.</p><p>The horizontal axis shows time, the vertical axis frequency. Bright areas indicate high energy at that frequency.</p><p>Changes in the pattern can indicate mechanical problems (e.g., bearing damage creates new frequency bands).</p>',
    },
    drift: {
      title: 'What is drift detection?',
      body: '<p>Drift detection monitors whether the environment or the machine has changed since the reference recording.</p><p><strong>Environment drift:</strong> Position, temperature, acoustics – can affect the score without the machine being faulty.</p><p><strong>Machine drift:</strong> Actual change in machine sound.</p><p>This distinction helps avoid false alarms.</p>',
    },
    // Sprint 5 UX: Fleet check help texts
    fleet: {
      title: 'What is Fleet Check?',
      body: '<p><strong>Fleet Check</strong> compares multiple identical machines against each other – e.g., 24 pumps of the same type.</p><p>Instead of showing the trend for a single machine (that\'s Overview), Fleet Check shows a <strong>ranking</strong>: Which machine deviates?</p><p><strong>When to use?</strong> When you have many similar machines on-site and want to quickly find the outliers.</p><p><strong>Tip:</strong> Assign machines to a fleet group (e.g., "Heating West") so they are compared together.</p>',
    },
    fleetRanking: {
      title: 'Understanding the ranking',
      body: '<p>Each <strong>bar</strong> shows the similarity score (0–100%). Machines are sorted: lowest score at the top.</p><p><strong>Orange</strong> machines deviate statistically from the rest.</p><p><strong>Median:</strong> The middle score – more robust than an average.</p><p><strong>Spread:</strong> Difference between best and worst score.</p><p><strong>Tip:</strong> Tap a machine to start its check.</p>',
    },
    // Sprint 9: Fleet Quick Check help
    fleetQuickCheck: {
      title: 'Fleet Quick Check',
      body:
        '<p><strong>What is this?</strong> Check multiple identical machines in one go. The app compares their sounds and instantly shows you which machine sounds different \u2013 the \u201Codd one out\u201D.</p>' +
        "<p><strong>When should I use this?</strong> When you're standing in front of several identical machines (e.g. 5 pumps in a row) and want to quickly find out if one stands out.</p>" +
        '<p><strong>How does it work?</strong></p>' +
        '<p>\u2022 <strong>Fleet exists:</strong> Select a saved fleet \u2013 the app guides you through machine by machine.</p>' +
        '<p>\u2022 <strong>No fleet:</strong> No problem! The app creates machines automatically, you just record. You can save the result as a fleet afterwards.</p>' +
        '<p><strong>Difference from single check:</strong> \u201CCheck now\u201D compares one machine against its own reference (trend over time). The fleet quick check compares multiple machines against each other (find the outlier).</p>',
    },
  },

  // Sprint 2 UX: Smart Start visual ready moment
  smartStartReady: {
    signalDetected: '✅ Signal detected – Analysis starting',
  },

  // ============================================================================
  // SPRINT 4 UX: FLEET CHECK MODE
  // ============================================================================
  fleet: {
    toggle: {
      series: 'Overview',
      fleet: 'Fleet Check',
    },
    group: {
      label: 'Fleet group (optional)',
      hint: 'e.g. "Heating West" – machines in the same group are compared',
      recent24h: 'Last 24 hours',
      noMachines: 'No machines for fleet check',
      noMachinesHint: 'Run checks or assign machines to a fleet group.',
    },
    ranking: {
      noData: 'Not checked',
      minimumHint: 'At least 2 machines needed for a meaningful fleet comparison.',
    },
    stats: {
      median: 'Median',
      worst: 'Worst',
      spread: 'Spread',
    },
    quickSave: {
      hint: "Quick Fleet – won't show tomorrow.",
      button: 'Save as fleet…',
      prompt: 'Enter fleet name (e.g. "Heating West"):',
      success: '{{count}} machines saved as "{{name}}".',
    },
    // Sprint 5 UX: Context-sensitive CTA
    cta: {
      newFleet: 'New Fleet',
    },
    // Sprint 5 UX: Fleet creation modal
    create: {
      title: 'Create new fleet',
      nameLabel: 'Fleet name',
      namePlaceholder: 'e.g. Heating West',
      selectMachines: 'Select machines (min. 2)',
      goldStandard: 'Gold Standard (optional)',
      goldHint: 'Which machine serves as the reference for the entire fleet?',
      goldNone: 'No Gold Standard (each machine uses its own reference)',
      createButton: 'Create fleet',
      success: 'Fleet "{{name}}" created with {{count}} machines.',
      noMachines: 'No machines available. Create machines first.',
    },
    // Sprint 5 UX: Fleet check queue
    queue: {
      startButton: 'Check {{count}} machines',
      progress: '{{name}} ({{current}} of {{total}})',
      complete: 'Fleet check complete: {{count}} machines in "{{name}}" checked.',
      completePartial: '{{checked}} of {{total}} machines checked ({{skipped}} skipped) – {{name}}',
      cancelled: 'Fleet check cancelled.',
      resumed: 'Fleet check resumed.',
      // Sprint 6: Guided fleet check
      guided: {
        goTo: 'Go to:',
        startRecording: '\u25B6 Start recording',
        skip: 'Skip',
        machineOf: '{{current}} of {{total}}',
        waitingForUser: 'Ready? Hold your smartphone near the machine.',
      },
    },
    // Onboarding Splash (after NFC fleet provisioning)
    onboarding: {
      title: 'Fleet Check – {{count}} machines',
      titleSingular: 'Fleet Check – 1 machine',
      concept: 'Does one machine sound different from the others? This app finds out.',
      method:
        'You briefly record each machine – the app compares the sounds and shows you the \u201Codd one out\u201D.',
      howTo: 'How it works:',
      step1: 'Go to the displayed machine',
      step2: 'Hold your smartphone close to the machine',
      step3: 'Tap \u201CStart recording\u201D',
      step4: 'Hold still for 10 sec. – done',
      startButton: 'First machine',
      noMachines: 'No machines in the fleet.',
    },
    // Sprint 5 UX: Gold Standard badge
    goldStandard: {
      badge: 'Gold Standard (reference for the fleet)',
      deleted: 'Gold Standard "{{name}}" deleted – {{count}} machines now use own reference.',
    },
    // Fleet NFC/QR provisioning: Export
    export: {
      button: 'Export fleet',
      success: 'Fleet "{{name}}" exported. Upload file to GitHub Pages for NFC/QR.',
      failed: 'Fleet export failed.',
    },
    // Fleet NFC/QR provisioning: Import
    provision: {
      success: 'Fleet "{{name}}" provisioned: {{created}} created, {{updated}} updated.',
      alreadyExists: 'Fleet "{{name}}" already exists ({{skipped}} machines skipped).',
      downloading: 'Loading fleet…',
      error: 'Could not load fleet.',
      offline: 'No internet connection. Please connect to the network and scan the tag again.',
      rollbackComplete: 'Import failed – changes rolled back.',
      updateRecommended:
        'Fleet file was exported from a newer app version. App update recommended.',
      skippedDifferentFleet: '"{{name}}" belongs to fleet "{{fleet}}" – not reassigned.',
    },
    // Fleet Result Modal (after fleet queue completes)
    result: {
      title: 'Fleet Result',
      complete: 'Fleet check complete',
      completeWithOutliers: 'Fleet check complete – outliers detected',
      summary: '"{{name}}" · {{checked}} of {{total}} checked',
      summarySkipped: '{{skipped}} skipped',
      statsMedian: 'Median',
      statsSpread: 'Spread',
      statsWorst: 'Worst',
      rankingTitle: 'Ranking',
      notChecked: 'Not checked',
      save: 'Save results',
      discard: 'Discard',
      discardConfirm: 'Delete checks from this run? Machines and references will be kept.',
      discardDone: '{{count}} checks discarded',
      viewHistory: 'View history',
      closeAndContinue: 'Continue',
    },
    // Fleet History Modal
    history: {
      title: 'Fleet Check History',
      subtitle: '{{name}}',
      date: 'Date',
      median: 'Median',
      spread: 'Spread',
      checked: 'Checked',
      noTrend: 'No trend yet – available after multiple fleet checks.',
      close: 'Close',
    },
  },

  // ============================================================================
  // SPRINT 7: QUICK COMPARE
  // ============================================================================
  quickCompare: {
    startButton: 'Quick Compare',
    hint: 'Compare machines – no setup needed',
    wizard: {
      title: 'Quick Compare',
      howMany: 'How many machines do you want to compare?',
      customCount: 'Custom count',
      explanation:
        'Go to each machine in order and record it. The first recording is automatically used as the comparison baseline.',
      next: 'Next',
      minMachines: 'At least 2 machines',
      maxMachines: 'Maximum 30 machines',
    },
    reference: {
      title: 'Record normal state',
      instruction: 'Record the first machine',
      hint: 'Automatically used as the comparison baseline.',
      startRecording: 'Record normal state',
      saved: 'Normal state saved',
      goldName: 'Reference (Gold)',
      recordingHint: 'Record the normal state now.',
    },
    compare: {
      goTo: 'Go to:',
      machineOf: 'Machine {{current}} of {{total}}',
      startRecording: 'Start recording',
      skip: 'Skip',
      hint: 'Hold your smartphone near the machine.',
    },
    result: {
      title: 'Results',
      summary: '{{checked}} of {{total}} machines checked',
      allGood: 'All machines within normal range',
      outlierFound: '{{count}} machine(s) show deviation',
      notChecked: 'Not checked',
      goldLabel: 'Comparison baseline',
      saveAsFleet: 'Save as fleet',
      saveFleetName: 'Fleet name (optional):',
      saveFleetPlaceholder: 'e.g. Heat Pumps East',
      defaultFleetName: 'Quick Compare {{date}}',
      fleetSaved: 'Fleet "{{name}}" saved with {{count}} machines.',
      done: 'Done',
      rename: 'Rename',
      cleanup: 'Delete test data',
      cleanupConfirm: 'Delete {{count}} machines from this quick compare?',
      cleanupDone: '{{count}} machines deleted',
    },
    // NFC-triggered quick compare onboarding splash
    nfcOnboarding: {
      title: 'Quick Compare \u2013 {{count}} machines',
      titleSingular: 'Quick Compare \u2013 1 machine',
      concept: 'Does one machine sound different from the others? This app finds out.',
      method:
        'Go to each machine in order and briefly record it. The app compares all sounds and shows you which one sounds different.',
      startButton: 'Let\u2019s go',
      minMachines: 'At least 2 machines required for quick compare.',
      // UX improvement: time estimate and privacy hint
      timeEstimate: 'Duration: approx. {{minutes}} minutes for {{count}} machines.',
      privacyHint:
        'Microphone and camera are only used for analysis. All data stays on your device.',
    },
    // UX improvement: Guided prompt hints
    guidedPrompt: {
      referenceHint: 'This recording will be used as the comparison baseline.',
      positionInstruction:
        'Hold smartphone approx. 10\u201320 cm near the machine. Please keep quiet.',
      positionMemory: 'Tip: Remember the spot \u2013 same position for all machines.',
      noiseHint: 'Please keep quiet and avoid moving during the recording.',
    },
    // UX improvement: Inspection modal in reference mode
    inspectionReference: {
      mainQuestion: 'Recording normal state...',
      subtitle: 'This recording will be saved as comparison baseline.',
      scorePlaceholder: 'Normal state \u2013 no comparison',
      comparingWith: 'Comparing with {{name}}...',
    },
    // UX improvement: Ghost overlay hint
    ghostOverlay: {
      hint: 'Position guide: Align live image with semi-transparent outline.',
    },
    // UX improvement: One-time score explanation
    scoreExplanation: {
      hint: '{{score}}% = Similarity to reference. Green = normal, Orange = check, Red = anomaly.',
    },
    // UX improvement: Result screen context
    resultContext: {
      allGood: 'All machines sound similar \u2013 no anomalies detected.',
      outlierWarning:
        'Warning: {{name}} shows significant deviation. Notice: consider inspecting further.',
      outlierWarningMultiple:
        'Warning: {{count}} machines show significant deviation. Notice: consider inspecting further.',
      fleetSaveHint: 'Saved fleets enable regular checks with position guidance.',
    },
  },

  // Welle 2 UX: Status Dashboard
  dashboard: {
    totalMachines: 'machines',
    healthy: 'normal',
    warning: 'deviation',
    critical: 'abnormal',
    unchecked: 'not checked',
    checkNow: 'Check now',
    attentionPrefix: 'Consider checking',
    lastCheck: 'Last check',
  },

  // Welle 2 UX: Ampel-Banner im Ergebnis
  resultAmpel: {
    explanationHealthy: 'The machine sounds as expected.',
    explanationWarning: 'The machine sounds different from the normal state.',
    explanationCritical: 'The machine deviates significantly from the normal state.',
    trendStable: 'Stable across {{count}} checks',
    trendImproving: '{{delta}}% across {{count}} checks',
    trendDeclining: '{{delta}}% across {{count}} checks',
    // Deutscher Text bewusst auch hier: Übersetzung ausgesetzt (abgestimmt). t()
    // liefert bei fehlendem Schlüssel den rohen Schlüsselnamen zurück – deutscher
    // Klartext ist besser als „resultAmpel.resolution" auf dem Bildschirm.
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
    newCheck: 'New check',
    reportMaintenance: 'Report maintenance',
    copiedToClipboard: 'Maintenance report copied to clipboard',
    maintenanceReportTitle: 'Maintenance Report',
    machine: 'Machine',
    score: 'Score',
    status: 'Status',
    date: 'Date',
    recommendation: 'Notice',
  },

  // ============================================================================
  // REFERENZ-SAMMLUNG TEILEN (Maschinen-Detail)
  // ============================================================================
  // Deutscher Text bewusst auch hier: Übersetzung ausgesetzt (abgestimmt). t()
  // liefert bei fehlendem Schlüssel den rohen Schlüsselnamen zurück.
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
    fullHistory: 'Full history',
    openHistory: 'View history for {{name}}',
    viewHistory: 'History',
    diagnosisCount: '{{count}} checks',
    noDiagnoses: '{{name}} has no checks yet.',
    noMatchingDiagnoses: 'No checks match this filter.',
    filterAll: 'All',
    filter7d: '7 days',
    filter30d: '30 days',
    filterAbnormal: 'Abnormal',
    chartAriaLabel: 'History chart with {{count}} data points',
    stableVsPrevious: 'stable vs previous',
    vsPrevious: 'vs previous',
    detectedState: 'Detected state',
  },

  // ============================================================================
  // WELLE 4: REPORT EXPORT (SV1)
  // ============================================================================
  report: {
    exportButton: 'Export report',
    formatChoiceTitle: 'Report format',
    formatPDF: 'PDF (Printable)',
    formatCSV: 'CSV (Excel)',
    formatJSON: 'JSON (Ticket system)',
    title: 'SoundFuchs Inspection Report',
    fleetTitle: 'Fleet Check Report',
    allMachinesTitle: 'Machine Overview',
    totalLabel: 'Total',
    healthyLabel: 'Normal',
    warningLabel: 'Deviation',
    criticalLabel: 'Abnormal',
    medianLabel: 'Median',
    colMachine: 'Machine',
    colScore: 'Score',
    colStatus: 'Status',
    colTrend: 'Trend',
    colRecommendation: 'Notice',
    colDate: 'Date',
    footer: 'Generated by SoundFuchs · Acoustic Machine Comparison',
    exported: 'Report exported',
  },

  // ============================================================================
  // WELLE 4: MAINTENANCE INTEGRATION (SV3)
  // ============================================================================
  maintenance: {
    exportTitle: 'Report Maintenance',
    copyToClipboard: 'Copy to clipboard',
    exportJSON: 'Download JSON report',
    exportCSV: 'Download CSV report',
    reportButton: 'Report maintenance',
    reportTitle: 'Maintenance Report',
  },

  // ============================================================================
  // WELLE 4: TREND ANALYSIS (SV4)
  // ============================================================================
  trendAnalysis: {
    criticalDecline:
      'Score dropping sharply across {{count}} checks ({{from}}% → {{to}}%). Consider immediate inspection.',
    declining: 'Score declining across {{count}} checks ({{from}}% → {{to}}%). Monitor closely.',
    improving: 'Score improving across {{count}} checks ({{from}}% → {{to}}%).',
  },

  unifiedFlow: {
    newMachineTitle: 'New Machine',
    missingRefTitle: 'Normal State Missing',
    noMachinesExplanation:
      'No known machine detected. Create a new machine \u2013 the normal state will be recorded right away.',
    missingRefExplanation:
      "The following machines don't have a normal state yet. Select one to record it now.",
    machineNameLabel: 'Machine name',
    machineNamePlaceholder: 'e.g. Pump 3 \u2013 West Hall',
    createAndRecord: 'Create & Record Normal State',
    recordNormalState: 'Record normal state \u2192',
    recordingStarted: 'Recording normal state for {{name}}...',
    referenceSavedSuccess: 'Normal state saved for {{name}}.',
    referenceSavedHint: 'Next time you check, {{name}} will be recognized automatically.',
  },

  // ============================================================================
  // SPRINT 9: FLEET QUICK CHECK
  // ============================================================================
  fleetSelect: {
    title: 'Select Fleet',
    machineCount: '{{count}} machines',
    machineCountSingular: '1 machine',
    lastChecked: 'checked {{time}}',
    neverChecked: 'never checked',
    newQuickCompare: 'New Quick Compare',
    newQuickCompareHint: 'Compare machines without setup',
    singleMachineHint: 'Fleet "{{name}}" has only 1 machine. At least 2 required for comparison.',
  },
  alerts: {
    genericError: 'An error occurred. Please try again.',
  },
};
