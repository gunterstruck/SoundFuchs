/**
 * ZANOBOT - Spanish (Español) Translations
 */

import type { TranslationDict } from '../index.js';

export const es: TranslationDict = {
  // ============================================================================
  // BUTTONS
  // ============================================================================
  buttons: {
    stop: 'Detener',
    stopAndSave: 'Detener y guardar',
    scan: 'Escanear',
    create: 'Crear',
    record: 'Grabar',
    startDiagnosis: 'Verificar estado',
    analyze: 'Analizar',
    close: 'Cerrar',
    cancel: 'Cancelar',
    save: 'Guardar',
    discard: 'Descartar',
    trainAnother: 'Entrenar otro estado',
    newMachine: 'Nueva máquina',
    stopRecording: 'Detener grabación',
    saveReference: 'Guardar referencia',
  },

  // ============================================================================
  // BANNER
  // ============================================================================
  banner: {
    headline: '¿El sistema suena normal?',
    subline: 'Verificar estado en segundos – directamente en el dispositivo, sin conexión',
  },

  // ============================================================================
  // STATUS
  // ============================================================================
  status: {
    healthy: 'Normal',
    uncertain: 'Desviación',
    faulty: 'Anormal',
    unknown: 'Desconocido',
    noData: 'Sin datos',
    notChecked: 'Aún no verificado',
    ready: 'Listo',
    analyzing: 'ANALIZANDO...',
    consistent: 'Machine consistent',
    slightDeviation: 'Slight deviation',
    significantChange: 'Significant change',
    strongDeviation: 'Strong deviation – check recommended',
  },

  // ============================================================================
  // MODAL TITLES
  // ============================================================================
  modals: {
    referenceRecording: 'Grabación de referencia',
    liveDiagnosis: 'Diagnóstico en vivo - Encontrar punto óptimo',
    qrScanner: 'Escáner QR/Código de barras',
    databaseError: 'Error de base de datos',
    browserIncompatible: 'Navegador no compatible',
    accessDenied: 'Acceso denegado',
    processingError: 'Error de procesamiento',
    saveError: 'Error al guardar',
    sampleRateMismatch: 'Frecuencia de muestreo incompatible',
    unsuitable: 'Señal inadecuada',
    referenceUnsuitable: 'Grabación de referencia inadecuada',
    recordingDiscarded: 'Grabación descartada',
    cameraOptional: 'Cámara opcional',
    noSignalDetected: 'No se detectó señal',
    scanError: 'Error de escaneo',
    databaseExported: 'Base de datos exportada',
    databaseShared: 'Base de datos compartida',
    databaseImported: 'Base de datos importada',
    databaseCleared: 'Base de datos borrada',
    nfcDiagnosisTitle: '¿Verificar estado?',
    nfcDiagnosisPrompt: 'Máquina detectada. ¿Verificar estado ahora?',
    closeDialog: 'Cerrar diálogo',
  },

  // ============================================================================
  // PHASE 1: IDENTIFY (Machine Selection)
  // ============================================================================
  identify: {
    selectMachine: 'Seleccionar máquina',
    scanQrCode: 'Escanear código QR',
    scanQrDescription: 'Identificar máquina via código QR',
    manualEntry: 'Crear manualmente',
    manualEntryDescription: 'Crear nueva máquina con nombre',
    machineName: 'Nombre de la máquina',
    machineId: 'ID de la máquina (opcional)',
    machineNameHint: 'Unique name, e.g. Pump 3 – West Hall',
    machineNameRequired: 'Please enter a machine name.',
    machineNamePlaceholder: 'e.g. Pump 3 – West Hall',
    machineIdHint: 'Optional: Internal ID (e.g. SAP number). Not used for analysis.',
    deleteMachine: 'Delete machine',
    confirmDeleteMachine: 'Delete machine "{{name}}"? All diagnoses will be lost.',
    confirmDeleteMachineWithData: 'Machine "{{name}}" has {{count}} recordings. Really delete EVERYTHING?',
    machineDeleted: '\uD83D\uDDD1\uFE0F Machine "{{name}}" deleted',
    quickAccess: 'Acceso rápido',
    quickAccessDescription: 'Acceso rápido a máquinas usadas recientemente',
    recentlyUsed: 'Usado recientemente',
    overview: 'Vista general',
    machineOverview: 'Vista general de máquinas',
    history: 'Historial',
    noMeasurements: 'Sin mediciones todavía',
    noMachines: 'No hay máquinas disponibles',
    statesTrained: '{{count}} estados entrenados',

    machineDetail: {
      title: 'Máquina',
      select: 'Cargar máquina',
    },

    errors: {
      scannerStart: 'Error al iniciar el escáner',
      cameraAccessDenied: 'Acceso a la cámara denegado',
      cameraAccessHint: 'Por favor permita el acceso a la cámara en la configuración de su navegador',
      noCameraFound: 'No se encontró cámara',
      noCameraHint: 'Por favor asegúrese de que su dispositivo tiene una cámara',
      qrProcessing: 'Error al procesar el código QR',
      invalidCode: 'Código inválido escaneado',
      codeProcessing: 'Error al procesar el código',
      manualEntryLoad: 'No se pudo cargar la entrada manual',
      invalidMachineId: 'ID de máquina inválido',
      machineLoad: 'Error al cargar la máquina',
      machineNotFound: 'Máquina no encontrada. Por favor seleccione de nuevo.',
      nameRequired: 'Por favor ingrese un nombre de máquina',
      nameWhitespace: 'El nombre de la máquina no puede ser solo espacios',
      nameTooLong: 'El nombre de la máquina es demasiado largo (máximo 100 caracteres)',
      machineExists: 'Ya existe una máquina con este ID',
      machineCreate: 'Error al crear la máquina',
      idEmpty: 'El ID de la máquina no puede estar vacío',
      idTooShort: 'El ID de la máquina es demasiado corto',
      idTooLong: 'El ID de la máquina es demasiado largo (máximo 100 caracteres)',
      idWhitespace: 'El ID de la máquina no puede ser solo espacios',
      microphoneLoad: 'Error al cargar los micrófonos',
      microphoneSwitch: 'Error al cambiar el micrófono',
    },

    success: {
      machineLoaded: 'Máquina "{{name}}" cargada',
      machineCreated: 'Máquina creada: {{name}}',
      machineAutoCreated: 'Nueva máquina "{{name}}" creada automáticamente.',
      microphoneOptimized: 'Micrófono configurado automáticamente a "{{label}}" para mejor diagnóstico',
      microphoneChanged: 'Micrófono cambiado: {{label}}',
    },

    warnings: {
      preferredMicrophoneUnavailable:
        'El micrófono preferido ya no está disponible. Se usará el micrófono predeterminado.',
    },

    messages: {
      codeRecognized: 'Código reconocido: {{code}}',
      autoMachineName: 'Máquina {{id}}',
      loadingMachine: 'Cargando máquina...',
    },

    time: {
      justNow: 'ahora mismo',
      minutesAgo: 'hace {{minutes}} min.',
      hoursAgo: 'hace {{hours}} h.',
      dayAgo: 'hace 1 día',
      daysAgo: 'hace {{days}} días',
      weekAgo: 'hace 1 semana',
      weeksAgo: 'hace {{weeks}} semanas',
    },

    // Sprint 3 UX: Sparkline accessibility
    sparkline: {
      ariaLabel: 'Trend of last {{count}} diagnoses',
    },
  },

  // ============================================================================
  // PHASE 2: REFERENCE (Training)
  // ============================================================================
  reference: {
    recordReference: 'Grabar referencia',
    tenSecondRecording: 'Grabación de referencia de {{duration}} segundos',
    noReferenceModel: 'No hay modelo de referencia disponible',
    trainedStates: 'Estados entrenados',
    noModelsYet: 'Aún no hay modelos de referencia disponibles',
    existingModels: 'MODELOS EXISTENTES:',
    statesTrainedCount: '{{count}} estado(s) ya entrenado(s)',
    recordingStatusHighQuality: 'Alta calidad de audio detectada',
    explainBefore: 'The reference defines your machine\u2019s normal state. All future comparisons are based on it.',
    explainDuring: 'Slowly move the smartphone around the machine. This helps filter out environmental influences.',
    savedSuccess: '\u2705 Reference saved – Environment profile detected',
    savedTitle: 'Reference created',
    cherryPickingHint: '\uD83D\uDEE1\uFE0F Background noise is automatically detected and discarded.',
    noModels: 'No references yet.',
    unnamed: 'Reference #{{index}}',
    deleteModel: 'Delete reference',
    confirmDeleteModel: 'Delete reference "{{name}}"? This cannot be undone.',
    modelDeleted: '\uD83D\uDDD1\uFE0F Reference "{{name}}" deleted',

    // State-based card UI (mirrors diagnose card)
    statesRecorded: '{{count}} estado grabado',
    noReferenceYet: 'Sin referencia aún',
    changeMachine: 'Cambiar máquina',
    noMachinesYet: 'No hay máquinas creadas aún.',
    noMachinesHint: 'Por favor cree una nueva máquina primero.',

    recording: {
      alreadyRunning: 'Ya hay una grabación en progreso.',
      cameraNotAvailable: 'Cámara no disponible. La grabación continuará sin imagen de posición.',
      browserNotCompatible: 'Su navegador no soporta grabación de audio. Por favor use un navegador moderno.',
      stabilizing: 'Estabilizando...',
      waitingForSignal: 'Esperando señal',
      recording: 'Grabación en progreso',
      microphoneFailed: 'Acceso al micrófono fallido',
      processingFailed: 'No se pudo procesar la grabación',
      noSignal: 'Por favor acérquese más a la máquina e intente de nuevo.',
      positionImage: '📷 La imagen de posición se capturará automáticamente',
      instruction: 'Sostenga el micrófono a 10-30 cm frente a la máquina.',
      // iOS Audio Blocked (watchdog detection)
      iosAudioBlocked: 'Micrófono bloqueado',
      iosAudioBlockedMessage: 'El micrófono no está proporcionando datos de audio.\n\nPosibles causas:\n• Otra aplicación está usando el micrófono\n• iOS está bloqueando el acceso al micrófono\n• El volumen del sistema está silenciado\n\nPor favor cierre otras aplicaciones e intente de nuevo.',
      iosAudioBlockedRetry: 'Intentar de nuevo',
    },

    quality: {
      signalStable: '✓ Señal estable',
      slightUnrest: '⚠ Ligera inestabilidad',
      signalUnstable: '✗ Advertencia: ¡Señal inestable!',
      // Sprint 3 UX: Reference quality badge
      good: 'Ref: Good',
      ok: 'Ref: OK',
      unknown: 'Ref: ?',
      ariaLabel: 'Reference quality: {{rating}}',
    },

    errors: {
      tooShort: 'Grabación demasiado corta: {{duration}}s de duración total es menor que la fase de calentamiento de {{warmup}}s. Duración mínima: {{minDuration}}s',
      trainingTooShort: 'Datos de entrenamiento demasiado cortos: {{duration}}s (después de la fase de calentamiento). Mínimo requerido: {{minDuration}}s. Por favor grabe al menos {{totalDuration}}s.',
      qualityTooLow: 'Calidad de grabación muy baja para entrenamiento. Por favor grabe de nuevo en un ambiente tranquilo con una señal clara de la máquina.\n\nProblemas:\n{{issues}}',
      signalTooWeak: 'Señal muy débil o difusa (posiblemente solo ruido).\n\nFuerza de la señal (RMS): {{magnitude}} (Mínimo: 0.03)\nCalidad: {{quality}}%\n\nPor favor asegúrese:\n• El micrófono está lo suficientemente cerca de la máquina (10-30cm)\n• La máquina funciona con suficiente volumen\n• No está grabando solo ruido de fondo\n\nProblemas:\n{{issues}}',
      qualityWarning: '⚠️ ADVERTENCIA: Mala calidad de grabación\n\nLa calidad de esta grabación es mala. El entrenamiento podría no ser confiable.\n\nProblemas:\n{{issues}}\n\n¿Desea guardar de todos modos?',
      baselineTooLow: 'Grabación de referencia demasiado confusa o ruidosa.\n\nPuntuación de auto-reconocimiento: {{score}}%\nMínimo requerido: {{minScore}}%\n\nPosibles causas:\n• Señal demasiado débil o inestable\n• Demasiado ruido de fondo\n• Máquina no funcionando de manera constante\n\nPor favor repita la grabación en mejores condiciones:\n• Micrófono más cerca de la máquina (10-30cm)\n• Ambiente tranquilo\n• Máquina funcionando de manera estable durante toda la grabación',
      noAudioFile: 'Por favor cree primero una grabación de referencia.',
      exportFailed: 'Exportación fallida',
      saveFailed: 'Error al guardar',
      machineDataMissing: 'Faltan datos de la máquina',
    },

    success: {
      modelTrained: '✅ ¡Modelo de referencia entrenado exitosamente!\n\nMáquina: {{name}}\n\n¿Desea descargar el archivo de audio de referencia?\n(Recomendado para respaldo)',
      canStartNew: 'Puede iniciar una nueva grabación de referencia.',
    },

    labels: {
      baseline: 'Referencia',
      prompt: 'Ingrese un nombre para este estado de la máquina:\n\nEjemplos:\n• Estados de operación normales: "Ralentí", "Carga completa", "Carga parcial"\n• Fallas: "Desequilibrio simulado", "Daño en rodamiento", "Error de ventilador"',
      confirmType: 'Estado: "{{label}}"\n\n¿Es este un estado de operación NORMAL?\n\n🟢 OK (Sí) → Estado normal (ej. "Ralentí", "Carga completa")\n🔴 Cancelar (No) → Falla conocida (ej. "Desequilibrio", "Daño en rodamiento")\n\nNota: Esta elección determina si un diagnóstico se muestra como "saludable" o "defectuoso".',
      enterName: 'Por favor ingrese un nombre',
      cancelled: 'Cancelado',
    },
  },

  // ============================================================================
  // PHASE 3: DIAGNOSE (Real-time)
  // ============================================================================
  diagnose: {
    alreadyRunning: 'Ya hay un diagnóstico en progreso.',
    noReferenceModel: 'No se encontró modelo de referencia. Por favor cree primero una grabación de referencia.',
    browserNotCompatible: 'Su navegador no soporta diagnóstico en tiempo real. Por favor use Chrome, Edge o Safari.',
    noValidSampleRate: 'No se encontró modelo de referencia con frecuencia de muestreo válida.',
    cameraNotAvailable: 'Cámara no disponible. El diagnóstico continuará sin guía de posición.',
    diagnosisRunning: 'Diagnóstico en ejecución',
    compareComplete: '\u2705 Comparison complete',
    saveFailed: 'No se pudo guardar el diagnóstico',
    liveAnalysis: 'Realizar análisis en vivo',

    sampleRateError: 'Error de configuración de audio: Su micrófono funciona a {{actual}}Hz, pero ningún modelo de referencia fue entrenado a esta frecuencia de muestreo (Modelos: {{expected}}Hz). Por favor use la misma configuración de audio que durante el entrenamiento o cree un nuevo modelo de referencia con la frecuencia de muestreo actual.',

    display: {
      referenceModels: 'MODELO(S) DE REFERENCIA:',
      statesTrainedCount: '{{count}} estado(s) entrenado(s)',
      debugValues: '🔍 VALORES DE DEPURACIÓN:',
      signalHint: 'Acerque el teléfono a la máquina para una señal óptima',
      match: 'Coincidencia',
      ghostHint: '👻 Mueva el teléfono hasta que la imagen en vivo y la imagen de referencia coincidan',
      noCameraAvailable: 'No hay imagen de posición disponible',
      machineQuestion: '¿La máquina suena normal?',
      reference: 'Referencia',
      waitingForSignal: 'Esperando señal...',
    },

    smartStart: {
      stabilizing: '🎙️ {{message}}\n(Ajustando micrófono, estabilizando filtros del sistema...)',
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
      healthyMatch: 'La firma acústica coincide con el estado de referencia "{{state}}" ({{score}}%). Sin anomalías.',
      faultyMatch: 'Anomalía detectada: La firma coincide con el patrón entrenado "{{state}}" ({{score}}%). Se recomienda inspección.',
    },

    // State-based card UI (horizontal tiles)
    scanCode: 'Escanear QR',
    selectExisting: 'Seleccionar máquina',
    createNew: 'Nueva máquina',
    statesReady: '{{count}} estado entrenado',
    noReference: 'Sin referencia aún',
    changeMachine: 'Cambiar máquina',
    noMachinesYet: 'No hay m\u00e1quinas creadas a\u00fan.',
    noMachinesHint: 'Cree una nueva m\u00e1quina primero.',

    // Sprint 3 UX: Operating point hint
    opHint: {
      changed: 'ℹ️ Operating point differed during measurement – consider when interpreting score',
    },
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
  pipelineStatus: {
    title: 'Estado del pipeline',
    room: 'Sala',
    rejected: 'rechazados',
    active: 'activo',
    waiting: 'listo',
    chirpPending: 'Ejecutando chirp...',
    chirpFailed: 'Chirp fallido – solo CMN',
    t60VeryDry: 'muy seco',
    t60Dry: 'seco',
    t60Medium: 'reverberación media',
    t60Reverberant: 'reverberante',
    t60VeryReverberant: 'muy reverberante',
  },

  // OPERATING POINT MONITOR (Expert Mode)
  // ============================================================================
  opMonitor: {
    title: 'Estado operativo / Calidad de se\u00f1al',
    initializingBaseline: 'Capturando punto de operaci\u00f3n de referencia \u2013 mantenga el dispositivo estable\u2026',
    operatingPointChanged: 'Punto de operaci\u00f3n cambiado \u2013 comparaci\u00f3n de referencia limitada.',
    scoreInvalid: '\u26A0 Punto de operaci\u00f3n desviado \u2013 puntuaci\u00f3n no comparable',
    similarityP10: {
      shortLabel: 'Estabilidad',
      description: 'Eval\u00faa los \u00abpeores\u00bb momentos de la grabaci\u00f3n (percentil 10).',
      warning: '\u2139\uFE0F Se\u00f1al inestable: El promedio es bueno, pero hay ca\u00eddas breves. \u00bfHay ruidos fluctuantes o interrupciones?',
      explain: 'Eval\u00faa los \u00abpeores\u00bb momentos de la grabaci\u00f3n. Un valor bajo indica que el sonido es inestable, aunque el promedio se vea bien.',
    },
    energyDelta: {
      shortLabel: 'Energ\u00eda \u0394',
      description: 'Diferencia de volumen respecto a la referencia en decibelios.',
      warning: '\u26A0\uFE0F Atenci\u00f3n: La se\u00f1al es significativamente m\u00e1s fuerte/d\u00e9bil que la referencia. \u00bfLa m\u00e1quina funciona con diferente carga o se cambi\u00f3 la distancia del micr\u00f3fono? La puntuaci\u00f3n puede no ser comparable.',
      explain: 'Muestra la diferencia de volumen respecto a la referencia. Grandes desviaciones indican cambio de carga, diferente distancia o un entorno m\u00e1s ruidoso.',
    },
    frequencyDelta: {
      shortLabel: 'Frecuencia \u0394',
      description: 'Desplazamiento medio de los picos espectrales dominantes respecto a la referencia. Puede indicar cambio de RPM o del punto de operaci\u00f3n.',
      warning: '\u26A0\uFE0F Punto de operaci\u00f3n desviado: Las frecuencias dominantes han cambiado. La m\u00e1quina probablemente funciona a una velocidad diferente a la de la referencia.',
      explain: 'Compara los picos espectrales dominantes (ej. RPM del motor y arm\u00f3nicos) con la referencia. Un desplazamiento generalmente significa que la m\u00e1quina funciona m\u00e1s r\u00e1pido o m\u00e1s lento.',
    },
    stability: {
      shortLabel: 'Estabilidad de se\u00f1al',
      description: 'Proporci\u00f3n de segmentos de se\u00f1al estables durante la medici\u00f3n.',
      warning: '\u26A0\uFE0F Se\u00f1al inestable: Ruidos fluctuantes o interrupciones detectadas. Repetir la medici\u00f3n en condiciones estables.',
      explain: 'Mide la consistencia del sonido a lo largo del tiempo. Valores bajos indican condiciones operativas fluctuantes o interferencias.',
    },
  },

  // ============================================================================
  // PHASE 4: SETTINGS
  // ============================================================================
  settings: {
    databaseNotAvailable: 'Base de datos no disponible. Por favor permita IndexedDB en la configuración de su navegador o desactive el modo de privacidad estricto.',
    exportError: 'Error al exportar la base de datos',
    importError: 'Error al importar',
    shareError: 'Error al compartir la base de datos',

    import: {
      confirmMerge: 'Importar base de datos desde: {{filename}}\n\n¿Desea FUSIONAR los datos?\n\nSÍ = Fusionar con datos existentes\nNO = REEMPLAZAR todos los datos existentes',
      confirmReplace: '⚠️ ¡ADVERTENCIA!\n\n¡Todos los datos existentes serán ELIMINADOS y reemplazados con los datos importados!\n\n¿Desea continuar?',
      success: 'Máquinas: {{machines}}\nGrabaciones: {{recordings}}\nDiagnósticos: {{diagnoses}}\n\nModo: {{mode}}',
      modeMerged: 'Fusionado',
      modeReplaced: 'Reemplazado',
      partialWarning: 'Máquinas: {{machinesImported}} importadas, {{machinesSkipped}} omitidas\nGrabaciones: {{recordingsImported}} importadas, {{recordingsSkipped}} omitidas\nDiagnósticos: {{diagnosesImported}} importados, {{diagnosesSkipped}} omitidos\n\n{{totalSkipped}} registro(s) no pudieron ser importados.\nModo: {{mode}}',
      setupError: 'Error al preparar la importación',
    },

    clear: {
      confirmFirst: '⚠️ ¡ADVERTENCIA!\n\nTodos los datos serán PERMANENTEMENTE eliminados:\n- Todas las máquinas\n- Todos los modelos de referencia\n- Todas las grabaciones\n- Todos los diagnósticos\n\n¿Desea continuar?',
      confirmSecond: '¿Está ABSOLUTAMENTE SEGURO?\n\n¡Esta acción NO PUEDE deshacerse!',
      success: 'Todos los datos han sido eliminados',
      error: 'Error al eliminar los datos',
    },

    export: {
      success: 'Archivo: {{filename}}\n\nMáquinas: {{machines}}\nGrabaciones: {{recordings}}\nDiagnósticos: {{diagnoses}}',
    },

    share: {
      title: 'Copia de seguridad de la base de datos de Zanobot',
      text: 'Copia de seguridad de la base de datos: {{filename}}',
      success: 'Copia compartida: {{filename}}',
      fallback: 'No se puede compartir. Se descargó {{filename}} en su lugar.',
      preparing: 'La exportación se está preparando... por favor espere un momento e intente de nuevo.',
    },
  },

  // ============================================================================
  // MAIN APP / STARTUP
  // ============================================================================
  app: {
    browserNotSupported: 'Su navegador no es compatible con Zanobo.\n\nCaracterísticas faltantes:\n{{features}}\n\nPor favor use un navegador moderno como Chrome, Edge, Firefox o Safari.',
    uiLoadFailed: 'No se pudo cargar la interfaz de usuario',
    fatalError: 'Error fatal',
    browserNotSupportedTitle: 'Navegador no soportado',
  },

  // ============================================================================
  // CORE ML / SCORING
  // ============================================================================
  scoring: {
    matchesReference: 'La firma acústica coincide con la referencia. Sin anomalías.',
    moderateDeviation: 'Desviación moderada del patrón de referencia. Se recomienda revisión.',
    significantDeviation: 'Se detectó desviación significativa del patrón de referencia. Se recomienda inspección.',
    noMatch: 'Desviación significativa del patrón de referencia ({{score}}%). La señal no coincide con ningún estado entrenado. Se recomienda inspección.',
    hints: {
      matchesReference: 'La firma acústica coincide con la referencia.',
      minorDeviations: 'Desviaciones menores dentro del rango aceptable.',
      moderateDeviation: 'Se detectó desviación moderada del patrón de referencia.',
      recommendInspection: 'Se recomienda inspección.',
      significantAnomaly: 'Se detectó anomalía significativa.',
      immediateInspection: 'Se recomienda inspección inmediata.',
    },
    multiclass: {
      noMatch: 'Sin coincidencia con estados entrenados ({{score}}%). Señal no clara.',
      healthy: 'Estado base "{{label}}" detectado ({{score}}% coincidencia). Máquina operando normalmente.',
      faulty: 'Estado "{{label}}" detectado ({{score}}% coincidencia). Desviación del estado normal.',
    },
  },

  // ============================================================================
  // HARDWARE CHECK
  // ============================================================================
  hardware: {
    suitable: 'Hardware adecuado para diagnóstico de máquinas',
    voiceOptimized: 'El hardware optimizado para voz filtra los sonidos de la máquina.',
    useStudioMic: 'Use un micrófono de estudio o el micrófono integrado del dispositivo',
    headsetsOptimized: 'Los auriculares están optimizados para frecuencias de voz',
    mayFilter: 'Los sonidos de la máquina podrían ser filtrados o suprimidos',
    lowSampleRate: 'Las frecuencias de muestreo bajas no pueden capturar señales de máquina de alta frecuencia',
    microphoneDenied: 'Acceso al micrófono denegado o no disponible',
    iphoneBackMic: 'Micrófono trasero de iPhone',
    micReady: 'Micrófono listo',
    iosMicHint: 'iOS necesita acceso breve a la cámara para seleccionar el mejor micrófono – la cámara no se usará.',
  },


  // ============================================================================
  // ZERO-FRICTION RECORDING (Auto-Machine Creation)
  // ============================================================================
  zeroFriction: {
    autoMachineName: 'Máquina {{number}}',
    referenceCreatedToast: 'Referencia para {{machineName}} creada',
    editMachineName: 'Editar',
    editMachineNamePrompt: 'Introduzca un nuevo nombre para la máquina:',
    machineRenamed: 'Máquina renombrada a "{{newName}}"',
    noMachineSelected: 'No hay máquina seleccionada – se creará automáticamente',
  },

  // ============================================================================
  // AUTO-DETECTION (Simplified "Verificar estado" Flow)
  // ============================================================================
  autoDetect: {
    startButton: 'Verificar ahora',
    hint: 'El sistema reconoce automáticamente las máquinas conocidas',
    showManualSelection: 'Seleccionar manualmente',
    hideManualSelection: 'Ocultar selección manual',
    listening: 'Escuchando...',
    waitingForSignal: 'Por favor, acerque el micrófono a la máquina',
    initializing: 'Inicializando...',
    analyzing: 'Analizando sonido...',
    machineRecognized: 'Máquina reconocida',
    matchConfidence: 'Coincidencia',
    continueAnalysis: 'Continuar análisis',
    differentMachine: 'Otra máquina',
    uncertainMatch: '¿Qué máquina es esta?',
    selectMachine: 'Por favor, seleccione la máquina correspondiente',
    noMatch: 'No reconozco este sonido todavía',
    noMatchHint: '¿Desea grabar una referencia?',
    recordReference: 'Grabar referencia',
    newMachine: 'Crear nueva máquina',
  },

  // ============================================================================
  // COMMON
  // ============================================================================
  common: {
    machine: 'Máquina',
    error: 'Error',
    warning: 'Advertencia',
    info: 'Info',
    success: 'Éxito',
    yes: 'Sí',
    no: 'No',
    or: 'o',
    ok: 'OK',
    loading: 'Cargando...',
    initializing: 'Inicializando...',
    unknown: 'desconocido',
  },

  router: {
    statesTrained: '{{count}} estado{{plural}} entrenado(s) (último: {{date}}) - Agregar más',
    referenceRequired: 'Grabación de referencia de {{duration}} segundos (requerido para diagnóstico)',
    liveAnalysis: 'Realizar análisis en vivo',
    lastCheck: 'Última verificación {{time}}',
  },
  viewLevels: {
    basic: 'Pantalla simple de semáforo para operadores',
    advanced: 'Detalles para supervisores y mantenimiento',
    expert: 'Vista técnica completa para ingenieros',
    basicLabel: 'Básico', basicDesc: 'Simple',
    advancedLabel: 'Avanzado', advancedDesc: 'Detalles',
    expertLabel: 'Experto', expertDesc: 'Técnico',
    viewModeTitle: 'Modo de vista',
    viewModeDescription: 'Ajuste la complejidad de la interfaz a sus necesidades.',
  },
  notifications: {
    confirmRequired: 'Confirmación requerida',
    closeNotification: 'Cerrar notificación',
  },
  errorBoundary: {
    unexpectedError: 'Se ha producido un error inesperado.',
    unexpectedErrorTitle: 'Error inesperado',
    permissionDenied: 'Acceso denegado',
    permissionHint: 'Por favor permita el acceso al micrófono/cámara en la configuración de su navegador.',
    hardwareNotFound: 'Hardware no encontrado',
    hardwareHint: 'Por favor asegúrese de que su micrófono/cámara esté conectado.',
    audioSystemError: 'Error del sistema de audio',
    audioSystemHint: 'Por favor recargue la página. Si el problema persiste, use un navegador actualizado.',
    storageFull: 'Por favor elimine diagnósticos o grabaciones de referencia antiguos.',
    networkError: 'Por favor verifique su conexión a internet.',
    technicalDetails: 'Detalles técnicos',
    noStackTrace: 'Sin traza de pila disponible',
  },
  qualityCheck: {
    noFeatures: 'No hay features disponibles',
    noAudioData: 'No se extrajeron datos de audio (Frame Count 0)',
    highVariance: 'Alta varianza espectral - Señal inestable',
    veryHighVariance: 'Varianza muy alta - Por favor grabe en un entorno más tranquilo',
    outliers: '{{count}} valores atípicos detectados ({{ratio}}%) - Posible ruido de interferencia',
    weakSignal: 'Señal muy débil/difusa - Posiblemente solo ruido. Acérquese más a la máquina.',
    weakTonal: 'Señal tonal débil - La relación señal/ruido podría ser muy baja.',
    trainingSignalWeak: 'Señal demasiado débil o inconsistente para entrenamiento. Asegúrese: micrófono cerca de la máquina, máquina funcionando, no solo ruido de fondo. (Similitud coseno promedio: {{value}})',
    invalidSampleRate: 'Tasa de muestreo inválida: {{rate}}Hz. Esperada: 8000-192000Hz (típica: 44100Hz o 48000Hz)',
  },
  healthGauge: {
    normal: 'NORMAL',
    deviation: 'DESVIACION',
    abnormal: 'ANORMAL',
    explain: 'The score shows similarity to the reference state (0–100%). 100% = nearly identical. A declining trend matters more than a single value.',
    explainTitle: 'What does the score mean?',
  },
  audio: { ready: 'Listo', stabilizing: 'Estabilización acústica... {{seconds}}s', waitingForSignal: 'Esperando señal...', recordingRunning: 'Grabación en curso' },
  settingsUI: {
    title: 'Configuración', nfcWriterTitle: 'Etiquetas NFC', nfcWriterDescription: 'Escribe etiquetas NFC para acceder a la app o a una máquina seleccionada.', appearance: 'Apariencia',
    audioSettings: 'Configuración de audio', audioHardware: 'Hardware de audio',
    detectingMic: 'Detectando micrófono...', detectingMicrophone: 'Detectando micrófono...', initHardwareCheck: 'Inicializando verificación de hardware',
    changeMicrophone: 'Cambiar micrófono', confidenceThreshold: 'Umbral de confianza',
    faultyThreshold: 'Umbral de anomalía',
    recordingDuration: 'Duración de grabación',
    recordingDurationDesc: 'Tiempo neto de grabación para datos de entrenamiento. Se añaden 5 segundos adicionales de estabilización para una calidad de audio óptima.',
    seconds5: '5 segundos', seconds10: '10 segundos', seconds15: '15 segundos', seconds: 'segundos',
    frequencyAxis: 'Eje de frecuencia', frequencyAxisDesc: 'Logarítmico (más detalle en rango 20-500 Hz)', frequencyLogDesc: 'Logarítmico (más detalle en rango 20-500 Hz)',
    amplitudeAxis: 'Eje Y / Amplitud', amplitudeAxisDesc: 'Logarítmico (dB) – enfatiza señales débiles', amplitudeLogDesc: 'Logarítmico (dB) – enfatiza señales débiles',
    disableAudioTriggerLabel: 'Desactivar disparador de audio', disableAudioTriggerDesc: 'Inicia la medición inmediatamente, incluso con señales muy débiles, sin esperar un nivel mínimo. Para máquinas o entornos extremadamente silenciosos.',
    analysisMethod: 'Método de análisis', analysisMethodDesc: 'Seleccione el método de análisis apropiado para su máquina.',
    gmaiMethodDesc: 'GMIA (Generalized Mutual Interdependence Analysis) extrae los componentes comunes y estables de múltiples ventanas de tiempo mientras suprime efectos específicos del dispositivo. Ideal para sonidos de máquinas estructurados y estables en el tiempo.',
    level1Info: 'Nivel 1: Los ajustes de frecuencia y amplitud de arriba están activos',
    dataManagement: 'Gestión de datos', exportDatabase: 'Exportar base de datos', shareDatabase: 'Enviar base de datos',
    importDatabase: 'Importar base de datos', statistics: 'Estadísticas:',
    machines: 'Máquinas', recordings: 'Grabaciones', diagnoses: 'Diagnósticos',
    clearAllData: 'Eliminar todos los datos', deleteAllData: 'Eliminar todos los datos',
    quickAccessDesc: 'Acceso rápido a máquinas usadas recientemente',
    noMachines: 'No hay máquinas disponibles', or: 'o',
    selectMicrophone: 'Seleccionar micrófono',
    microphoneAdvice: 'Seleccione el mejor micrófono para diagnóstico de máquinas. Evite auriculares y dispositivos Bluetooth ya que están optimizados para voz.',
    manualInput: 'Introducir manualmente', machineIdInput: 'Introducir ID de máquina', continue: 'Continuar',
    qrHint: 'Coloque el código QR o código de barras en el marco', codeRecognized: '¡Código reconocido!',
    // Configuración del banner
    bannerTitle: 'Imagen del banner',
    bannerDescription: 'Personalice la imagen del banner de la página de inicio. Cada tema puede tener su propio banner.',
    bannerUpload: 'Subir banner',
    bannerReset: 'Restablecer a predeterminado',
    bannerHint: 'Recomendado: 1024×400 o 1024×500 píxeles, formato PNG. El tercio izquierdo queda libre para texto.',
    bannerFormatError: 'El formato debe ser 1024×400 o 1024×500 PNG.',
    bannerUpdated: 'El banner ha sido actualizado.',
    bannerSaveError: 'No se pudo guardar el banner.',
    bannerResetSuccess: 'Banner predeterminado restaurado.',
    bannerResetError: 'Error al restablecer el banner.',
    themeToggle: 'Cambiar tema',
    closeSettings: 'Cerrar configuración',
    // Reset to Defaults
    resetSection: 'Configuración predeterminada',
    resetDescription: 'Restablece todas las opciones de visualización al estado inicial. Los datos de la máquina se conservan.',
    resetButton: 'Restaurar configuración predeterminada',
    resetConfirm: '¿Realmente restablecer?',
    resetSuccess: 'Configuración predeterminada restaurada.',
    resetDescriptionShort: 'Los datos de la máquina se conservan.',
  },
  nfc: {
    title: 'Escribir etiqueta NFC',
    description: 'Elija qué información se escribirá en la etiqueta NFC.',
    supportDetails: 'Contexto seguro: {{secureContext}} · NDEFReader disponible: {{ndefReader}}',
    openWriter: 'Escribir etiqueta NFC',
    writeButton: 'Escribir ahora',
    optionGeneric: 'Enlace de la app (genérico)',
    optionGenericDetail: 'Abre la app sin un ID de máquina.',
    optionSpecific: 'Enlace de máquina',
    optionSpecificDetailDefault: 'Abre la app para la máquina seleccionada actualmente.',
    optionSpecificDetail: 'Abre la app para "{{name}}" (ID: {{id}}).',
    optionSpecificUnavailable: 'Seleccione primero una máquina para escribir un enlace específico.',
    hint: 'Acerque la etiqueta NFC a la parte trasera de su dispositivo.',
    unavailableHint: 'La escritura NFC solo está disponible en Chrome para Android.',
    statusWriting: 'Escribiendo etiqueta NFC...',
    statusSuccess: 'Etiqueta NFC escrita correctamente.',
    statusCancelled: 'Escritura cancelada.',
    statusError: 'No se pudo escribir la etiqueta NFC.',
    unsupported: 'La escritura NFC no es compatible con este dispositivo.',
    requiresSecureContext: 'La escritura NFC requiere una conexión segura (HTTPS).',
    unsupportedBrowser: 'La escritura NFC requiere Chrome en Android.',
    // Customer ID (Variante B)
    customerIdLabel: 'ID de cliente (c)',
    customerIdDescription: 'Este ID determina qué datos de referencia se cargan al escanear la etiqueta NFC. Los datos se cargan automáticamente desde GitHub Pages.',
    customerIdPlaceholder: 'ej. ID_Cliente_1',
    customerIdRequired: 'Por favor ingrese un ID de cliente.',
    dbUrlPreview: 'URL de datos: {{url}}',
    closeDialog: 'Cerrar diálogo NFC',
    optionFleet: 'Fleet link (fleet check)',
    optionFleetDetailDefault: 'Opens the app with a complete fleet.',
    optionFleetDetail: 'Opens the app for fleet "{{name}}".',
    fleetSelectLabel: 'Select fleet',
    noFleets: 'No fleets available',
    machine: 'machine',
    machines: 'machines',
    fleetRequiresCustomerId: 'Please enter a customer ID and select a fleet.',
    // Quick Compare count-only option
    optionQuickCompareCount: 'Quick compare (count only)',
    optionQuickCompareCountDetailDefault: 'Opens the app for a quick compare with a set number of machines. No internet needed.',
    optionQuickCompareCountDetail: 'Opens a quick compare with {{count}} machines. No internet needed.',
    quickCompareCountLabel: 'How many machines?',
    quickCompareCountHint: 'No internet needed when scanning. Machines are named automatically.',
  },

  // ============================================================================
  // QR CODE GENERATOR
  // ============================================================================
  qrCode: {
    title: 'Crear código QR',
    description: 'Cree un código QR para imprimir o guardar. Simplemente colóquelo en la máquina — listo.',
    openGenerator: 'Crear código QR',
    optionGeneric: 'Enlace de la app (genérico)',
    optionGenericDetail: 'Abre la app sin un ID de máquina.',
    optionSpecific: 'Enlace de máquina',
    optionSpecificDetailDefault: 'Abre la app para la máquina seleccionada actualmente.',
    optionSpecificDetail: 'Abre la app para "{{name}}" (ID: {{id}}).',
    optionSpecificUnavailable: 'Seleccione primero una máquina para crear un código QR específico.',
    customerIdLabel: 'ID de cliente (c)',
    customerIdDescription: 'Este ID determina qué datos de referencia se cargan al escanear.',
    customerIdPlaceholder: 'ej. ID_Cliente_1',
    customerIdRequired: 'Por favor ingrese un ID de cliente.',
    dbUrlPreview: 'URL de datos: {{url}}',
    urlPreview: 'Vista previa del enlace',
    downloadPng: 'Guardar como imagen',
    print: 'Imprimir',
    closeDialog: 'Cerrar diálogo de código QR',
    generatedFor: 'Código QR para',
    machineLabel: 'Máquina',
    machineIdLabel: 'ID',
    dateLabel: 'Creado el',
    printTitle: 'Código QR de Máquina',
    printInstructions: 'Recorte el código QR y colóquelo en la máquina.',
    genericLabel: 'Acceso App',
    optionFleet: 'Fleet link (fleet check)',
    optionFleetDetailDefault: 'Creates a QR code for a complete fleet.',
    optionFleetDetail: 'Creates QR code for fleet "{{name}}".',
    fleetSelectLabel: 'Select fleet',
    fleetLabel: 'Fleet',
    fleetPrintTitle: 'Fleet QR Code',
    // Quick Compare count-only option
    optionQuickCompareCount: 'Quick compare (count only)',
    optionQuickCompareCountDetailDefault: 'Creates a QR code for a quick compare with a set number of machines.',
    optionQuickCompareCountDetail: 'Creates quick compare QR code for {{count}} machines.',
  },

  review: {
    title: 'Revisar grabación', subtitle: 'Control de calidad',
    listenTitle: 'Escuchar grabación',
    browserNoAudio: 'Su navegador no admite reproducción de audio.',
    recordingInfo: '{{total}} segundos de grabación (5s estabilización + {{duration}}s entrenamiento)',
    positionImageTitle: 'Imagen de posición guardada',
    savedPositionImage: 'Imagen de posición guardada',
    positionImageCheck: 'Verifique si la imagen muestra la posición correcta.',
    qualityTitle: 'Evaluación de calidad', quality: 'Calidad',
    issuesTitle: 'Problemas detectados:', discardNew: 'Descartar / Nuevo',
    saveAsReference: 'Guardar como referencia',
  },
  diagnosisResults: {
    title: 'Resultados del diagnóstico',
    fingerprintLabel: 'Huella',
    confidenceScoreLabel: 'Puntuación de confianza',
    varianceTitle: 'Varianza',
    frequencyAnomalyLabel: 'Anomalía de frecuencia',
    analysisHintDefault: 'Consejo: señal ligeramente elevada alrededor de 20 kHz',
    referenceQualityTitle: 'Calidad de referencia',
    referenceQualityStatusGood: 'BUENA',
    referenceQualityDescription: 'La grabación de referencia cumple las condiciones recomendadas',
    featureModeLabel: 'Modo de características',
    viewHistory: 'Ver historial',
    closeDialog: 'Cerrar diagnóstico',
  },
  results: {
    envMatch: {
      moreReverberant: '🏠 Environment more reverberant than reference – score may be affected',
      lessReverberant: '🏠 Environment less reverberant than reference – score may be affected',
      critical: '⚠️ Environment strongly deviating – score interpretation limited',
    },
  },
  historyChart: {
    title: 'Historial de la máquina',
    machineName: 'Máquina',
    dataPoints: 'Puntos de datos',
    timeRange: 'Período de tiempo',
    xAxisLabel: 'Tiempo',
    yAxisLabel: 'Puntuación de salud (%)',
    noData: 'Aún no hay historial disponible',
    noDataMessage: 'Todavía no se han guardado diagnósticos para esta máquina.',
    errorMessage: 'Error al cargar el historial.',
    closeDialog: 'Cerrar historial',
  },
  themes: {
    focusTitle: 'Steve Jobs',
    focusDescription: 'Una acción. Sin ruido. Enfoque en lo esencial – todo lo demás desaparece.',
    focusDesc: 'Una acción. Sin ruido. Claridad que funciona.',
    daylightTitle: 'Daylight',
    daylightDescription: 'Tema claro y anti‑deslumbramiento para exteriores. Contraste nítido para leer a la luz del sol.',
    daylightDesc: 'Tema claro y anti‑deslumbramiento para exteriores. Contraste nítido para leer a la luz del sol.',
    brandTitle: 'Zanobo',
    brandDescription: 'Claro, amigable, confiable. IA en la que puedes confiar.',
    brandDesc: 'Claro, amigable, confiable. IA en la que puedes confiar.',
    neonTitle: 'Neon Industrial',
    neonDescription: 'Paleta neón de alto contraste para entornos con poca luz. Los acentos guían a las acciones clave.',
    neonDesc: 'Paleta neón de alto contraste para entornos con poca luz. Los acentos guían a las acciones clave.',
  },
  footer: {
    impressum: 'Aviso legal',
    privacy: 'Política de privacidad',
    about: 'Acerca de Zanobo',
    settings: 'Configuración',
    closeImpressum: 'Cerrar aviso legal',
    closePrivacy: 'Cerrar política de privacidad',
    closeAbout: 'Cerrar acerca de Zanobo',
  },

  // NFC IMPORT (Deep Link Import via ?importUrl=)
  nfcImport: {
    modalTitle: 'Copia de seguridad NFC detectada',
    warningOverwrite: '¡Atención: La base de datos local será sobrescrita!',
    currentData: 'Datos actuales',
    newData: 'Nuevos datos',
    exportedAt: 'Exportado el',
    confirmButton: 'Importar datos',
    success: '¡Base de datos importada con éxito!',
    successTitle: 'Importación completada',
    error: 'Error de importación',
    errorTitle: 'Error de importación',
    errorGitHubBlob: 'Error: Por favor use el enlace "Raw" de GitHub, no el enlace web.',
    errorFetchFailed: 'Descarga fallida. Por favor verifique la URL.',
    errorNotJson: 'Error: La URL devuelve HTML en lugar de JSON.\n\nPor favor use el enlace "Raw" de GitHub.',
    errorInvalidJson: 'Error: El archivo no contiene un formato JSON válido.',
    errorInvalidStructure: 'Error: El archivo no tiene el formato de copia de seguridad esperado.',
    errorNetwork: 'Error de red al cargar los datos. Por favor verifique su conexión.',
    nfcMergeSuccess: '\u2705 Database updated – {{added}} new references added, {{skipped}} already present',
    nfcMergeInfo: 'Existing machines and references are preserved.',
  },

  // BADGES (UI Hints)
  badges: {
    recommended: 'Recomendado',
    nextStep: 'Siguiente paso',
  },

  // WORK POINT RANKING
  workPointRanking: {
    title: 'Análisis de estados',
    states: 'Estados',
    ariaLabel: 'Ranking de estados detectados de la máquina',
    statusHealthy: 'Normal',
    statusFaulty: 'Fallo',
    noData: 'No hay datos de análisis disponibles',
    rank: 'Rango',
    probability: 'Probabilidad',
    topMatch: 'Mejor coincidencia',
    sectionTitle: 'Distribución detallada de estados',
    sectionDescription: 'Distribución de probabilidad de todos los estados entrenados de la máquina',
  },

  // DATABASE MIGRATION
  migration: {
    title: 'Actualización de base de datos',
    dataCleared:
      'La base de datos se ha restablecido debido a una actualización. Se han eliminado todas las máquinas, grabaciones y diagnósticos.',
  },

  // ============================================================================
  // INSPECTION VIEW (Simplified PWA)
  // ============================================================================
  inspection: {
    // Header
    mainQuestion: '¿La máquina suena normal?',
    subtitle: 'Inspección en curso – por favor permanezca cerca de la máquina',
    subtitleInitializing: 'Preparando – por favor espere',
    // Status words (simple, non-technical)
    statusNormal: 'Normal',
    statusUncertain: 'Incierto',
    statusDeviation: 'Desviación',
    // Reference info
    referenceState: 'Estado de referencia',
    referenceDefault: 'Operación normal',
    // Dynamic hints for poor signal quality
    hintMoveCloser: 'Por favor acérquese más a la máquina',
    hintChangePosition: 'Cambie ligeramente de posición',
    hintHoldSteady: 'Mantenga el dispositivo firme',
    hintWaiting: 'Esperando señal de la máquina...',
    // Button
    stopButton: 'DETENER',
  },

  // ============================================================================
  // MACHINE SETUP (NFC Deep Link - Status/Error Messages)
  // ============================================================================
  machineSetup: {
    // Validation errors
    urlEmpty: 'Por favor ingrese un enlace de BD de referencia.',
    urlInvalid: 'El enlace no parece ser una URL válida.',
    urlNotHttps: 'El enlace debe comenzar con https://.',
    urlNotOfficialSource: 'Solo se aceptan fuentes de datos oficiales (gunterstruck.github.io).',

    // Download status
    downloadingReference: 'Cargando datos de referencia...',
    statusDownloading: 'Descargando datos de referencia...',
    statusParsing: 'Procesando datos...',
    statusValidating: 'Validando formato...',
    statusSaving: 'Guardando localmente...',
    statusComplete: '¡Completado!',

    // Download errors
    errorMachineNotFound: 'Máquina no configurada. Por favor contacte al técnico de servicio.',
    errorNoReferenceUrl: 'No hay datos de referencia configurados. Por favor contacte al técnico de servicio.',
    errorDownloadFailed: 'Descarga fallida. Por favor verifique su conexión a internet.',
    errorInvalidFormat: 'Los datos de referencia tienen un formato inválido.',
    errorInvalidStructure: 'La estructura de datos está corrupta.',
    errorNoModels: 'No se encontraron modelos de referencia en los datos.',
    errorInvalidModel: 'Uno o más modelos de referencia están corruptos.',
    errorUnknown: 'Ocurrió un error desconocido.',

    // Success messages
    referenceLoaded: '¡Datos de referencia cargados exitosamente!',

    // Loading overlay
    loadingTitle: 'Cargando referencia',
    loadingSubtitle: 'Por favor espere...',
    testingBlocked: 'Las pruebas solo están disponibles después de cargar los datos de referencia.',
  },

  // ============================================================================
  // URL IMPORT (Deep Link Import via #/import?url=)
  // ============================================================================
  urlImport: {
    statusFetching: 'Cargando base de datos...',
    statusValidating: 'Validando datos...',
    statusImporting: 'Importando datos...',
    success: '¡Base de datos importada con éxito!',
    successTitle: 'Importación completada',
    errorTitle: 'Importación fallida',
    errorGeneric: 'La importación falló.',
    errorInvalidUrl: 'URL no válida.',
    errorFetchFailed: 'Descarga fallida (HTTP {{status}}).',
    errorFileTooLarge: 'Archivo demasiado grande. Tamaño máximo: 50 MB.',
    errorNotJson: 'La URL devuelve HTML en lugar de JSON. Por favor, revise el enlace.',
    errorInvalidJson: 'El archivo no contiene un formato JSON válido.',
    errorInvalidStructure: 'El archivo no tiene el formato de base de datos esperado.',
    errorNetwork: 'Error de red al cargar los datos. Por favor, compruebe su conexión a Internet.',
  },

  // ============================================================================
  // ONBOARDING TRACE (Debug Protocol)
  // ============================================================================
  trace: {
    // UI
    title: 'Protocolo de depuración',
    toggle: 'Alternar protocolo',
    copyToClipboard: 'Copiar protocolo',
    copy: 'Copiar',
    copied: '¡Copiado!',
    copyFailed: 'Error',
    noEntries: 'Sin entradas aún',

    // Status
    statusRunning: 'En ejecución...',
    statusComplete: 'Completado',
    statusFailed: 'Fallido',

    // Step labels - these map to TraceStepId
    steps: {
      // Deep Link Processing
      deep_link_detected: 'Deep link detectado',
      hash_parsed: 'Hash analizado',
      machine_id_extracted: 'ID de máquina extraído',
      customer_id_extracted: 'ID de cliente extraído',
      db_url_derived: 'URL de BD derivada',
      import_url_detected: 'URL de importación detectada',

      // Download Process
      download_started: 'Descarga iniciada',
      download_complete: 'Descarga completada',
      download_failed: 'Descarga fallida',

      // JSON Processing
      json_parse_started: 'Análisis JSON iniciado',
      json_parse_complete: 'Análisis JSON exitoso',
      json_parse_failed: 'Análisis JSON fallido',

      // Validation
      schema_validation_started: 'Validación de esquema iniciada',
      schema_validation_complete: 'Validación de esquema exitosa',
      schema_validation_failed: 'Validación de esquema fallida',

      // Database Operations
      db_reset_started: 'Reinicio de BD iniciado',
      db_import_started: 'Importación de BD iniciada',
      db_import_complete: 'Importación de BD completada',
      db_import_failed: 'Importación de BD fallida',

      // App State
      app_state_reload: 'Estado de la app recargado',

      // Machine Operations
      machine_lookup: 'Buscando máquina',
      machine_found: 'Máquina encontrada',
      machine_not_found: 'Máquina no encontrada',
      machine_created: 'Máquina creada',
      machine_selected: 'Máquina seleccionada',

      // Final Steps
      test_dialog_shown: 'Diálogo de prueba mostrado',
      process_complete: 'Proceso completado',
      process_failed: 'Proceso fallido',
    },
  },

  // ============================================================================
  // ABOUT MODAL
  // ============================================================================
  about: {
    title: 'Acerca de Zanobo',
    subtitle: 'Asistente para comparación acústica de estados de máquinas',

    // Introduction
    intro: '<strong>Zanobo 2.0</strong> es una Progressive Web App (PWA) respetuosa con la privacidad, diseñada para el análisis comparativo de acústica de máquinas. La aplicación permite grabar y comparar sonidos de máquinas completamente <strong>offline</strong> – sin servicios en la nube, sin sensores externos y sin modelos de IA entrenados.<br><br>Zanobo se entiende deliberadamente <strong>no como una herramienta de diagnóstico</strong>, sino como un <strong>instrumento de comparación y orientación</strong> que apoya la evaluación humana.',

    // Core Features
    coreFeaturesTitle: 'Características principales',
    coreFeatures: {
      offlineFirst: '<strong>Offline-First:</strong> Todas las grabaciones y cálculos se realizan localmente en el navegador.',
      similarityScore: '<strong>Puntuación de similitud (0–100%):</strong> Zanobo calcula una similitud matemática (similitud del coseno) entre grabación de referencia y de comparación.',
      userThreshold: '<strong>Umbral definido por el usuario:</strong> Los usuarios definen ellos mismos a partir de qué puntuación un estado cuenta como "normal" o "desviado".',
      visualFeedback: '<strong>Retroalimentación visual del espectro:</strong> Visualización en tiempo real del espectro de frecuencia y resultado de comparación.',
      noDataLeaks: '<strong>Almacenamiento local de datos:</strong> Todas las grabaciones de audio y puntuaciones se almacenan exclusivamente en la IndexedDB local del dispositivo.',
    },

    // Legal Position
    legalTitle: 'Posición legal y revisión de propiedad intelectual',
    legalIntro: 'Zanobo fue desarrollado independientemente como un <strong>proyecto privado de código abierto no comercial</strong> bajo la <strong>licencia MIT</strong>. Su funcionalidad se basa en <strong>procedimientos matemáticos descritos abiertamente</strong> (p. ej., análisis de frecuencia y comparaciones de coseno similares a GMIA) y no incorpora <strong>ninguna lógica de sistema patentada</strong>, <strong>ningún mecanismo de clasificación</strong> ni <strong>ningún modelo de aprendizaje</strong>.',
    legalReview: 'Antes del lanzamiento, se realizó una <strong>revisión técnica y de contenido</strong> para garantizar que Zanobo no entre en conflicto con patentes existentes o enfoques de diagnóstico industrial conocidos.',

    // IP Table
    ipTableTitle: 'Propiedad intelectual relevante y diferenciación técnica',
    ipTable: {
      headers: {
        reference: 'Referencia / Título',
        source: 'Fuente y estado',
        protectedScope: 'Ámbito protegido',
        zanoboDiff: 'Diferenciación de Zanobo',
      },
      rows: {
        '0': {
          reference: '<strong>PAPDEOTT005125</strong><br><em>Procedimiento para diagnóstico de máquinas</em>',
          source: 'Publicación defensiva, Siemens AG, 2016',
          protectedScope: 'Sistema de diagnóstico basado en la nube que utiliza bases de datos centrales y sensores móviles',
          zanoboDiff: 'Zanobo opera completamente local, sin nube, sin base de datos central, sin diagnósticos',
        },
        '1': {
          reference: '<strong>EP3701708B1</strong><br><em>Análisis remoto del estado de la máquina</em>',
          source: 'Patente europea, Siemens AG, 2022',
          protectedScope: 'Diagnóstico remoto basado en ML con modelos entrenados y sensores',
          zanoboDiff: 'Zanobo no usa aprendizaje automático, sin nube, sin lógica de diagnóstico integrada',
        },
        '2': {
          reference: '<strong>US9263041B2</strong><br><em>Detección de canales en ruido usando GMIA</em>',
          source: 'Siemens Corp., 2016',
          protectedScope: 'Aplicación de GMIA para sistemas de voz y audición',
          zanoboDiff: 'Zanobo usa matemáticas similares a GMIA exclusivamente para no-voz y comparaciones locales',
        },
        '3': {
          reference: '<strong>US9443201B2</strong><br><em>Aprendizaje de firmas de sensores</em>',
          source: 'Siemens, 2016',
          protectedScope: 'Clasificación y entrenamiento de modelos de firmas de sensores',
          zanoboDiff: 'Zanobo no realiza clasificación ni entrenamiento de modelos',
        },
        '4': {
          reference: '<strong>US9602781B2</strong><br><em>Desmezcla de señales sísmicas (GMIA)</em>',
          source: 'Schlumberger, 2017',
          protectedScope: 'Separación de señales sísmicas usando GMIA',
          zanoboDiff: 'Dominio y tipo de señal diferentes, no relacionados',
        },
        '5': {
          reference: '<strong>ABB – Integration of Mobile Measurement</strong>',
          source: 'Presentación industrial pública, ABB, 2015',
          protectedScope: 'Sensores móviles para diagnóstico ad-hoc con integración de nube y servicio',
          zanoboDiff: 'Zanobo evita diagnósticos, flujos de trabajo de servicio y conectividad a la nube, enfocándose en la comparación local',
        },
      },
    },

    // Transparency
    transparencyTitle: 'Transparencia e intención',
    transparencyText1: 'Zanobo <strong>no es una herramienta de diagnóstico</strong> y <strong>no realiza evaluaciones técnicas automatizadas</strong>. Proporciona exclusivamente una <strong>ayuda de comparación visual y matemática</strong>.',
    transparencyText2: 'Todo el procesamiento ocurre <strong>offline</strong>. <strong>No se transmiten, almacenan ni evalúan datos del usuario</strong>.',
    transparencyText3: 'Esta transparencia expresa un enfoque consciente hacia la responsabilidad, la protección de datos y los derechos de terceros.',
    transparencyList: {
      noClassification: 'sin clasificación de estados',
      noCauseAnalysis: 'sin análisis de causas de fallas',
      noRepairRecommendations: 'sin recomendaciones de reparación',
    },

    // Public Instance
    publicInstance: 'Instancia pública:',
    publicInstanceUrl: 'https://zanobo.vercel.app',

    // Version Info
    version: 'Versión:',
    versionNumber: '2.0.0 (2026)',
    developedBy: 'Desarrollado por:',
    developerName: 'Günter Struck',
    license: 'Licencia:',
    licenseType: 'MIT',
    stack: 'Stack tecnológico:',
    stackTech: 'TypeScript, Vite, Web Audio API',

    // Guiding Principle
    guidingPrincipleTitle: 'Principio rector',
    guidingPrincipleQuestion: '¿La máquina suena normal?',
    guidingPrincipleStatement: 'Los teléfonos inteligentes escuchan los sonidos de las máquinas.',
  },

  // Sprint 4 UX: Fleet Check Mode (English fallbacks)
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
      noMachinesHint: 'Run diagnoses or assign machines to a fleet group.',
    },
    ranking: {
      noData: 'No verificado',
      minimumHint: 'Se necesitan al menos 2 máquinas para una comparación de flota significativa.',
    },
    stats: {
      median: 'Median',
      worst: 'Worst',
      spread: 'Spread',
    },
    quickSave: {
      hint: 'Quick Fleet – won\'t show tomorrow.',
      button: 'Save as fleet…',
      prompt: 'Enter fleet name (e.g. "Heating West"):',
      success: '{{count}} machines saved as "{{name}}".',
    },
    cta: { newFleet: 'New Fleet' },
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
    queue: {
      startButton: 'Check {{count}} machines',
      progress: '{{name}} ({{current}} of {{total}})',
      complete: 'Fleet check complete: {{count}} machines in "{{name}}" checked.',
      completePartial: '{{checked}} of {{total}} machines checked ({{skipped}} skipped) – {{name}}',
      cancelled: 'Fleet check cancelled.',
      resumed: 'Fleet check resumed.',
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
      method: 'You briefly record each machine – the app compares the sounds and shows you the \u201Codd one out\u201D.',
      howTo: 'How it works:',
      step1: 'Go to the displayed machine',
      step2: 'Hold your smartphone close to the machine',
      step3: 'Tap \u201CStart recording\u201D',
      step4: 'Hold still for 10 sec. – done',
      startButton: 'First machine',
      noMachines: 'No machines in the fleet.',
    },
    goldStandard: { badge: 'Gold Standard (referencia para la flota)', deleted: 'El Gold Standard "{{name}}" fue eliminado – {{count}} máquinas ahora usan su propia referencia.' },
    export: {
      button: 'Export fleet',
      success: 'Fleet "{{name}}" exported. Upload file to GitHub Pages for NFC/QR.',
      failed: 'Fleet export failed.',
    },
    provision: {
      success: 'Fleet "{{name}}" provisioned: {{created}} created, {{updated}} updated.',
      alreadyExists: 'Fleet "{{name}}" already exists ({{skipped}} machines skipped).',
      downloading: 'Loading fleet…',
      error: 'Could not load fleet.',
      offline: 'No internet connection. Please connect to the network and scan the tag again.',
      rollbackComplete: 'Import failed – changes rolled back.',
      updateRecommended: 'Fleet file was exported from a newer app version. App update recommended.',
      skippedDifferentFleet: '"{{name}}" belongs to fleet "{{fleet}}" – not reassigned.',
    },
    // Fleet Result Modal (English fallback)
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
      discardConfirm: 'Delete diagnoses from this run? Machines and references will be kept.',
      discardDone: '{{count}} diagnoses discarded',
      viewHistory: 'View history',
    },
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

  // Sprint 7: Quick Compare (English fallback)
  quickCompare: {
    startButton: 'Quick Compare',
    hint: 'Compare machines – no setup needed',
    wizard: {
      title: 'Quick Compare',
      howMany: 'How many machines do you want to compare?',
      customCount: 'Custom count',
      explanation: 'Go to each machine in order and record it. The first recording is automatically used as the comparison baseline.',
      next: 'Next',
      minMachines: 'At least 2 machines',
      maxMachines: 'Maximum 30 machines',
    },
    reference: {
      title: 'Record reference',
      instruction: 'Record the first machine',
      hint: 'Automatically used as the comparison baseline.',
      startRecording: 'Record reference',
      saved: 'Reference saved',
      goldName: 'Reference (Gold)',
      recordingHint: 'Record the reference machine now.',
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
    nfcOnboarding: {
      title: 'Quick Compare \u2013 {{count}} machines',
      titleSingular: 'Quick Compare \u2013 1 machine',
      concept: 'Does one machine sound different from the others? This app finds out.',
      method: 'Go to each machine in order and briefly record it. The app compares all sounds and shows you which one sounds different.',
      startButton: 'Let\u2019s go',
      minMachines: 'At least 2 machines required for quick compare.',
      timeEstimate: 'Duraci\u00F3n: aprox. {{minutes}} minutos para {{count}} m\u00E1quinas.',
      privacyHint: 'El micr\u00F3fono y la c\u00E1mara solo se usan para el an\u00E1lisis. Todos los datos permanecen en su dispositivo.',
    },
    guidedPrompt: {
      referenceHint: 'Esta grabaci\u00F3n se usar\u00E1 como base de comparaci\u00F3n.',
      positionInstruction: 'Sostenga el smartphone a aprox. 10\u201320 cm de la m\u00E1quina. Por favor, no hable.',
      positionMemory: 'Consejo: recuerde el lugar \u2013 misma posici\u00F3n para todas las m\u00E1quinas.',
      noiseHint: 'Por favor, no hable ni se mueva durante la grabaci\u00F3n.',
    },
    inspectionReference: {
      mainQuestion: 'Grabando referencia...',
      subtitle: 'Esta grabaci\u00F3n se guardar\u00E1 como base de comparaci\u00F3n.',
      scorePlaceholder: 'Referencia \u2013 sin comparaci\u00F3n',
      comparingWith: 'Comparando con {{name}}...',
    },
    ghostOverlay: {
      hint: 'Gu\u00EDa de posici\u00F3n: alinee la imagen en vivo con el contorno semitransparente.',
    },
    scoreExplanation: {
      hint: '{{score}}% = Similitud con la referencia. Verde = normal, Naranja = revisar, Rojo = anomal\u00EDa.',
    },
    resultContext: {
      allGood: 'Todas las m\u00E1quinas suenan similar \u2013 no se detectaron anomal\u00EDas.',
      outlierWarning: 'Atenci\u00F3n: {{name}} muestra una desviaci\u00F3n significativa. Recomendaci\u00F3n: inspeccionar m\u00E1s a fondo.',
      outlierWarningMultiple: 'Atenci\u00F3n: {{count}} m\u00E1quinas muestran una desviaci\u00F3n significativa. Recomendaci\u00F3n: inspeccionar m\u00E1s a fondo.',
      fleetSaveHint: 'Las flotas guardadas permiten revisiones regulares con gu\u00EDa de posici\u00F3n.',
    },
  },
};
