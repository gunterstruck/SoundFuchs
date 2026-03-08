/**
 * ZANOBOT - Chinese (中文) Translations
 */

import type { TranslationDict } from '../index.js';

export const zh: TranslationDict = {
  // ============================================================================
  // BUTTONS
  // ============================================================================
  buttons: {
    stop: '停止',
    stopAndSave: '停止并保存',
    scan: '扫描',
    create: '创建',
    record: '录制',
    startDiagnosis: '检查状态',
    analyze: '分析',
    close: '关闭',
    cancel: '取消',
    save: '保存',
    discard: '丢弃',
    trainAnother: '训练另一个状态',
    newMachine: '新建机器',
    stopRecording: '停止录制',
    saveReference: '保存参考',
  },

  // ============================================================================
  // BANNER
  // ============================================================================
  banner: {
    headline: '系统听起来正常吗?',
    subline: '几秒内检查状态 – 直接在设备上，离线操作',
  },

  // ============================================================================
  // STATUS
  // ============================================================================
  status: {
    healthy: '正常',
    uncertain: '偏差',
    faulty: '异常',
    unknown: '未知',
    noData: '无数据',
    notChecked: '尚未检查',
    ready: '就绪',
    analyzing: '分析中...',
    consistent: 'Machine consistent',
    slightDeviation: 'Slight deviation',
    significantChange: 'Significant change',
    strongDeviation: 'Strong deviation – check recommended',
  },

  // ============================================================================
  // MODAL TITLES
  // ============================================================================
  modals: {
    referenceRecording: '参考录制',
    liveDiagnosis: '实时诊断 - 寻找最佳点',
    qrScanner: '二维码/条形码扫描器',
    databaseError: '数据库错误',
    browserIncompatible: '浏览器不兼容',
    accessDenied: '访问被拒绝',
    processingError: '处理错误',
    saveError: '保存错误',
    sampleRateMismatch: '采样率不兼容',
    unsuitable: '信号不适合',
    referenceUnsuitable: '参考录制不适合',
    recordingDiscarded: '录制已丢弃',
    cameraOptional: '摄像头可选',
    noSignalDetected: '未检测到信号',
    scanError: '扫描错误',
    databaseExported: '数据库已导出',
    databaseShared: '数据库已分享',
    databaseImported: '数据库已导入',
    databaseCleared: '数据库已清空',
    nfcDiagnosisTitle: '检查状态？',
    nfcDiagnosisPrompt: '检测到机器。现在检查状态吗？',
    closeDialog: '关闭对话框',
  },

  // ============================================================================
  // PHASE 1: IDENTIFY (Machine Selection)
  // ============================================================================
  identify: {
    selectMachine: '选择机器',
    scanQrCode: '扫描二维码',
    scanQrDescription: '通过二维码识别机器',
    manualEntry: '手动创建',
    manualEntryDescription: '使用名称创建新机器',
    machineName: '机器名称',
    machineId: '机器ID（可选）',
    machineNameHint: 'Unique name, e.g. Pump 3 – West Hall',
    machineNameRequired: 'Please enter a machine name.',
    machineNamePlaceholder: 'e.g. Pump 3 – West Hall',
    machineIdHint: 'Optional: Internal ID (e.g. SAP number). Not used for analysis.',
    deleteMachine: 'Delete machine',
    confirmDeleteMachine: 'Delete machine "{{name}}"? All diagnoses will be lost.',
    confirmDeleteMachineWithData: 'Machine "{{name}}" has {{count}} recordings. Really delete EVERYTHING?',
    machineDeleted: '\uD83D\uDDD1\uFE0F Machine "{{name}}" deleted',
    quickAccess: '快速访问',
    quickAccessDescription: '快速访问最近使用的机器',
    recentlyUsed: '最近使用',
    overview: '概览',
    machineOverview: '机器概览',
    history: '历史记录',
    noMeasurements: '暂无测量数据',
    noMachines: '暂无可用机器',
    statesTrained: '{{count}} 个状态已训练',

    machineDetail: {
      title: '机器',
      select: '加载机器',
    },

    errors: {
      scannerStart: '启动扫描器时出错',
      cameraAccessDenied: '摄像头访问被拒绝',
      cameraAccessHint: '请在浏览器设置中允许访问摄像头',
      noCameraFound: '未找到摄像头',
      noCameraHint: '请确保您的设备有摄像头',
      qrProcessing: '处理二维码时出错',
      invalidCode: '扫描到无效代码',
      codeProcessing: '处理代码时出错',
      manualEntryLoad: '无法加载手动输入',
      invalidMachineId: '无效的机器ID',
      machineLoad: '加载机器时出错',
      machineNotFound: '未找到机器。请重新选择。',
      nameRequired: '请输入机器名称',
      nameWhitespace: '机器名称不能只包含空格',
      nameTooLong: '机器名称太长（最多100个字符）',
      machineExists: '此ID的机器已存在',
      machineCreate: '创建机器时出错',
      idEmpty: '机器ID不能为空',
      idTooShort: '机器ID太短',
      idTooLong: '机器ID太长（最多100个字符）',
      idWhitespace: '机器ID不能只包含空格',
      microphoneLoad: '加载麦克风时出错',
      microphoneSwitch: '切换麦克风时出错',
    },

    success: {
      machineLoaded: '机器"{{name}}"已加载',
      machineCreated: '机器已创建：{{name}}',
      machineAutoCreated: '新机器"{{name}}"已自动创建。',
      microphoneOptimized: '麦克风已自动设置为"{{label}}"以获得最佳诊断效果',
      microphoneChanged: '麦克风已切换：{{label}}',
    },

    warnings: {
      preferredMicrophoneUnavailable: '首选麦克风已不可用，将使用默认麦克风。',
    },

    messages: {
      codeRecognized: '已识别代码：{{code}}',
      autoMachineName: '机器 {{id}}',
      loadingMachine: '正在加载机器...',
    },

    time: {
      justNow: '刚刚',
      minutesAgo: '{{minutes}}分钟前',
      hoursAgo: '{{hours}}小时前',
      dayAgo: '1天前',
      daysAgo: '{{days}}天前',
      weekAgo: '1周前',
      weeksAgo: '{{weeks}}周前',
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
    recordReference: '录制参考',
    tenSecondRecording: '{{duration}}秒参考录制',
    noReferenceModel: '无可用的参考模型',
    trainedStates: '已训练状态',
    noModelsYet: '尚无参考模型',
    existingModels: '现有模型：',
    statesTrainedCount: '{{count}} 个状态已训练',
    recordingStatusHighQuality: '检测到高音频质量',
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
    statesRecorded: '{{count}} 个状态已录制',
    noReferenceYet: '尚无参考',
    changeMachine: '更换机器',
    noMachinesYet: '尚未创建机器。',
    noMachinesHint: '请先创建一台新机器。',

    recording: {
      alreadyRunning: '录制已在进行中。',
      cameraNotAvailable: '摄像头不可用。录制将在无位置图像的情况下继续。',
      browserNotCompatible: '您的浏览器不支持音频录制。请使用现代浏览器。',
      stabilizing: '稳定中...',
      waitingForSignal: '等待信号',
      recording: '录制中',
      microphoneFailed: '麦克风访问失败',
      processingFailed: '无法处理录制',
      noSignal: '请靠近机器并重试。',
      positionImage: '📷 位置图像将自动捕获',
      instruction: '将麦克风保持在机器前10-30厘米处。',
      // iOS Audio Blocked (watchdog detection)
      iosAudioBlocked: '麦克风被阻止',
      iosAudioBlockedMessage: '麦克风未提供音频数据。\n\n可能原因：\n• 其他应用正在使用麦克风\n• iOS 阻止了麦克风访问\n• 系统音量已静音\n\n请关闭其他应用并重试。',
      iosAudioBlockedRetry: '重试',
    },

    quality: {
      signalStable: '✓ 信号稳定',
      slightUnrest: '⚠ 轻微不稳定',
      signalUnstable: '✗ 警告：信号不稳定！',
      // Sprint 3 UX: Reference quality badge
      good: 'Ref: Good',
      ok: 'Ref: OK',
      unknown: 'Ref: ?',
      ariaLabel: 'Reference quality: {{rating}}',
    },

    errors: {
      tooShort: '录制太短：{{duration}}秒总时长短于{{warmup}}秒预热阶段。最短时长：{{minDuration}}秒',
      trainingTooShort: '训练数据太短：{{duration}}秒（预热阶段后）。最低要求：{{minDuration}}秒。请至少录制{{totalDuration}}秒。',
      qualityTooLow: '录制质量太差，无法训练。请在安静环境中使用清晰的机器信号重新录制。\n\n问题：\n{{issues}}',
      signalTooWeak: '信号太弱或分散（可能只是噪音）。\n\n信号强度（RMS）：{{magnitude}}（最小值：0.03）\n质量：{{quality}}%\n\n请确保：\n• 麦克风足够靠近机器（10-30厘米）\n• 机器以足够的音量运行\n• 没有只录制背景噪音\n\n问题：\n{{issues}}',
      qualityWarning: '⚠️ 警告：录制质量差\n\n此录制的质量较差。训练可能不可靠。\n\n问题：\n{{issues}}\n\n您仍要保存吗？',
      baselineTooLow: '参考录制太不清晰或有噪音。\n\n自我识别分数：{{score}}%\n最低要求：{{minScore}}%\n\n可能的原因：\n• 信号太弱或不稳定\n• 背景噪音太多\n• 机器运行不稳定\n\n请在更好的条件下重新录制：\n• 麦克风更靠近机器（10-30厘米）\n• 安静的环境\n• 机器在整个录制过程中稳定运行',
      noAudioFile: '请先创建参考录制。',
      exportFailed: '导出失败',
      saveFailed: '保存失败',
      machineDataMissing: '缺少机器数据',
    },

    success: {
      modelTrained: '✅ 参考模型训练成功！\n\n机器：{{name}}\n\n您想下载参考音频文件吗？\n（建议备份）',
      canStartNew: '您可以开始新的参考录制。',
    },

    labels: {
      baseline: '参考',
      prompt: '为此机器状态输入名称：\n\n示例：\n• 正常运行状态："空转"、"满载"、"部分负载"\n• 故障："模拟不平衡"、"轴承损坏"、"风扇故障"',
      confirmType: '状态："{{label}}"\n\n这是正常运行状态吗？\n\n🟢 确定（是）→ 正常状态（如"空转"、"满载"）\n🔴 取消（否）→ 已知故障（如"不平衡"、"轴承损坏"）\n\n注意：此选择决定诊断显示为"健康"还是"故障"。',
      enterName: '请输入名称',
      cancelled: '已取消',
    },
  },

  // ============================================================================
  // PHASE 3: DIAGNOSE (Real-time)
  // ============================================================================
  diagnose: {
    alreadyRunning: '诊断已在进行中。',
    noReferenceModel: '未找到参考模型。请先创建参考录制。',
    browserNotCompatible: '您的浏览器不支持实时诊断。请使用Chrome、Edge或Safari。',
    noValidSampleRate: '未找到具有有效采样率的参考模型。',
    cameraNotAvailable: '摄像头不可用。诊断将在无位置指南的情况下继续。',
    diagnosisRunning: '诊断运行中',
    compareComplete: '\u2705 Comparison complete',
    saveFailed: '无法保存诊断',
    liveAnalysis: '执行实时分析',

    sampleRateError: '音频设置错误：您的麦克风运行在{{actual}}Hz，但没有参考模型是在此采样率下训练的（模型：{{expected}}Hz）。请使用与训练时相同的音频设置，或使用当前采样率创建新的参考模型。',

    display: {
      referenceModels: '参考模型：',
      statesTrainedCount: '{{count}} 个状态已训练',
      debugValues: '🔍 调试值：',
      signalHint: '将手机靠近机器以获得最佳信号',
      match: '匹配度',
      ghostHint: '👻 移动手机直到实时图像与参考图像对齐',
      noCameraAvailable: '无可用的位置图像',
      machineQuestion: '机器听起来正常吗？',
      reference: '参考',
      waitingForSignal: '等待信号...',
    },

    smartStart: {
      stabilizing: '🎙️ {{message}}\n(麦克风调平中，系统滤波器稳定中...)',
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
      healthyMatch: '声学特征与参考状态"{{state}}"匹配（{{score}}%）。无异常。',
      faultyMatch: '检测到异常：特征与训练模式"{{state}}"匹配（{{score}}%）。建议检查。',
    },

    // State-based card UI (horizontal tiles)
    scanCode: '扫描二维码',
    selectExisting: '选择机器',
    createNew: '新建机器',
    statesReady: '{{count}} 个状态已训练',
    noReference: '尚无参考',
    changeMachine: '更换机器',
    noMachinesYet: '\u5c1a\u672a\u521b\u5efa\u673a\u5668\u3002',
    noMachinesHint: '\u8bf7\u5148\u521b\u5efa\u4e00\u53f0\u65b0\u673a\u5668\u3002',

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
    title: '管道状态',
    room: '房间',
    rejected: '已拒绝',
    active: '活跃',
    waiting: '就绪',
    chirpPending: '正在执行啁啾信号...',
    chirpFailed: '啁啾信号失败 – 仅使用CMN',
    t60VeryDry: '非常干燥',
    t60Dry: '干燥',
    t60Medium: '中等混响',
    t60Reverberant: '混响',
    t60VeryReverberant: '强混响',
  },

  // OPERATING POINT MONITOR (Expert Mode)
  // ============================================================================
  opMonitor: {
    title: '\u8fd0\u884c\u72b6\u6001 / \u4fe1\u53f7\u8d28\u91cf',
    initializingBaseline: '\u6b63\u5728\u6355\u83b7\u53c2\u8003\u8fd0\u884c\u70b9 \u2013 \u8bf7\u4fdd\u6301\u8bbe\u5907\u7a33\u5b9a\u2026',
    operatingPointChanged: '\u8fd0\u884c\u70b9\u5df2\u53d8\u66f4 \u2013 \u53c2\u8003\u6bd4\u8f83\u53d7\u9650\u3002',
    scoreInvalid: '\u26A0 \u8fd0\u884c\u70b9\u504f\u5dee \u2013 \u5206\u6570\u4e0d\u53ef\u6bd4\u8f83',
    similarityP10: {
      shortLabel: '\u7a33\u5b9a\u6027',
      description: '\u8bc4\u4f30\u5f55\u97f3\u4e2d\u201c\u6700\u5dee\u201d\u7684\u65f6\u523b\uff08\u7b2c10\u767e\u5206\u4f4d\uff09\u3002',
      warning: '\u2139\uFE0F \u4fe1\u53f7\u4e0d\u7a33\u5b9a\uff1a\u5e73\u5747\u503c\u826f\u597d\uff0c\u4f46\u5b58\u5728\u77ed\u6682\u4e0b\u964d\u3002\u662f\u5426\u6709\u6ce2\u52a8\u7684\u566a\u58f0\u6216\u4e2d\u65ad\uff1f',
      explain: '\u8bc4\u4f30\u5f55\u97f3\u4e2d\u201c\u6700\u5dee\u201d\u7684\u65f6\u523b\u3002\u4f4e\u503c\u8868\u793a\u58f0\u97f3\u4e0d\u7a33\u5b9a\uff0c\u5373\u4f7f\u5e73\u5747\u503c\u770b\u8d77\u6765\u5f88\u597d\u3002',
    },
    energyDelta: {
      shortLabel: '\u80fd\u91cf \u0394',
      description: '\u4e0e\u53c2\u8003\u7684\u97f3\u91cf\u5dee\u5f02\uff08\u5206\u8d1d\uff09\u3002',
      warning: '\u26A0\uFE0F \u6ce8\u610f\uff1a\u4fe1\u53f7\u660e\u663e\u6bd4\u53c2\u8003\u66f4\u54cd/\u66f4\u5f31\u3002\u673a\u5668\u662f\u5426\u5728\u4e0d\u540c\u8d1f\u8f7d\u4e0b\u8fd0\u884c\uff0c\u6216\u8005\u9ea6\u514b\u98ce\u8ddd\u79bb\u662f\u5426\u6539\u53d8\uff1f\u5206\u6570\u53ef\u80fd\u4e0d\u53ef\u6bd4\u8f83\u3002',
      explain: '\u663e\u793a\u4e0e\u53c2\u8003\u7684\u97f3\u91cf\u5dee\u5f02\u3002\u8f83\u5927\u504f\u5dee\u8868\u793a\u8d1f\u8f7d\u53d8\u5316\u3001\u4e0d\u540c\u8ddd\u79bb\u6216\u66f4\u5927\u7684\u73af\u5883\u566a\u58f0\u3002',
    },
    frequencyDelta: {
      shortLabel: '\u9891\u7387 \u0394',
      description: '\u4e3b\u97f3\uff08\u4e3b\u9891\u7387\uff09\u7684\u504f\u79fb\u3002',
      warning: '\u26A0\uFE0F \u8fd0\u884c\u70b9\u504f\u5dee\uff1a\u57fa\u9891\u5df2\u504f\u79fb\u3002\u673a\u5668\u53ef\u80fd\u4ee5\u4e0e\u53c2\u8003\u4e0d\u540c\u7684\u8f6c\u901f\u8fd0\u884c\u3002',
      explain: '\u5c06\u6700\u5f3a\u4e3b\u97f3\uff08\u4f8b\u5982\u7535\u673a\u8f6c\u901f\uff09\u4e0e\u53c2\u8003\u8fdb\u884c\u6bd4\u8f83\u3002\u504f\u79fb\u901a\u5e38\u610f\u5473\u7740\u673a\u5668\u8fd0\u884c\u5f97\u66f4\u5feb\u6216\u66f4\u6162\u3002',
    },
    stability: {
      shortLabel: '\u4fe1\u53f7\u7a33\u5b9a\u6027',
      description: '\u6d4b\u91cf\u671f\u95f4\u7a33\u5b9a\u4fe1\u53f7\u6bb5\u7684\u6bd4\u4f8b\u3002',
      warning: '\u26A0\uFE0F \u4fe1\u53f7\u4e0d\u7a33\u5b9a\uff1a\u68c0\u6d4b\u5230\u6ce2\u52a8\u566a\u58f0\u6216\u4e2d\u65ad\u3002\u8bf7\u5728\u7a33\u5b9a\u6761\u4ef6\u4e0b\u91cd\u590d\u6d4b\u91cf\u3002',
      explain: '\u6d4b\u91cf\u58f0\u97f3\u968f\u65f6\u95f4\u7684\u4e00\u81f4\u6027\u3002\u4f4e\u503c\u8868\u793a\u8fd0\u884c\u6761\u4ef6\u6ce2\u52a8\u6216\u5e72\u6270\u3002',
    },
  },

  // ============================================================================
  // PHASE 4: SETTINGS
  // ============================================================================
  settings: {
    databaseNotAvailable: '数据库不可用。请在浏览器设置中允许IndexedDB或禁用严格隐私模式。',
    exportError: '导出数据库时出错',
    importError: '导入时出错',
    shareError: '分享数据库时出错',

    import: {
      confirmMerge: '从以下位置导入数据库：{{filename}}\n\n您想合并数据吗？\n\n是 = 与现有数据合并\n否 = 替换所有现有数据',
      confirmReplace: '⚠️ 警告！\n\n所有现有数据将被删除并替换为导入数据！\n\n您要继续吗？',
      success: '机器：{{machines}}\n录制：{{recordings}}\n诊断：{{diagnoses}}\n\n模式：{{mode}}',
      modeMerged: '已合并',
      modeReplaced: '已替换',
      partialWarning: '机器：{{machinesImported}} 已导入，{{machinesSkipped}} 已跳过\n录制：{{recordingsImported}} 已导入，{{recordingsSkipped}} 已跳过\n诊断：{{diagnosesImported}} 已导入，{{diagnosesSkipped}} 已跳过\n\n{{totalSkipped}} 条记录无法导入。\n模式：{{mode}}',
      setupError: '准备导入时出错',
    },

    clear: {
      confirmFirst: '⚠️ 警告！\n\n所有数据将被永久删除：\n- 所有机器\n- 所有参考模型\n- 所有录制\n- 所有诊断\n\n您要继续吗？',
      confirmSecond: '您绝对确定吗？\n\n此操作无法撤消！',
      success: '所有数据已删除',
      error: '删除数据时出错',
    },

    export: {
      success: '文件：{{filename}}\n\n机器：{{machines}}\n录制：{{recordings}}\n诊断：{{diagnoses}}',
    },

    share: {
      title: 'Zanobot 数据库备份',
      text: '数据库备份：{{filename}}',
      success: '备份已分享：{{filename}}',
      fallback: '无法分享，已改为下载 {{filename}}。',
      preparing: '正在准备导出...请稍候再试。',
    },
  },

  // ============================================================================
  // MAIN APP / STARTUP
  // ============================================================================
  app: {
    browserNotSupported: '您的浏览器与Zanobo不兼容。\n\n缺少的功能：\n{{features}}\n\n请使用现代浏览器，如Chrome、Edge、Firefox或Safari。',
    uiLoadFailed: '无法加载用户界面',
    fatalError: '致命错误',
    browserNotSupportedTitle: '浏览器不支持',
  },

  // ============================================================================
  // CORE ML / SCORING
  // ============================================================================
  scoring: {
    matchesReference: '声学特征与参考匹配。无异常。',
    moderateDeviation: '与参考模式有中等偏差。建议检查。',
    significantDeviation: '检测到与参考模式有显著偏差。建议检查。',
    noMatch: '与参考模式有显著偏差（{{score}}%）。信号与任何训练状态都不匹配。建议检查。',
    hints: {
      matchesReference: '声学特征与参考匹配。',
      minorDeviations: '轻微偏差在可接受范围内。',
      moderateDeviation: '检测到与参考模式的中等偏差。',
      recommendInspection: '建议检查。',
      significantAnomaly: '检测到显著异常。',
      immediateInspection: '建议立即检查。',
    },
    multiclass: {
      noMatch: '与训练状态不匹配（{{score}}%）。信号不明确。',
      healthy: '检测到基准状态"{{label}}"（{{score}}%匹配）。机器正常运行。',
      faulty: '检测到状态"{{label}}"（{{score}}%匹配）。偏离正常状态。',
    },
  },

  // ============================================================================
  // HARDWARE CHECK
  // ============================================================================
  hardware: {
    suitable: '硬件适合机器诊断',
    voiceOptimized: '语音优化的硬件会过滤机器声音。',
    useStudioMic: '使用录音室麦克风或设备内置麦克风',
    headsetsOptimized: '耳机针对语音频率进行了优化',
    mayFilter: '机器声音可能被过滤或抑制',
    lowSampleRate: '低采样率无法捕获高频机器信号',
    microphoneDenied: '麦克风访问被拒绝或不可用',
    iphoneBackMic: 'iPhone后置麦克风',
    micReady: '麦克风就绪',
    iosMicHint: 'iOS需要短暂的相机访问权限来选择最佳麦克风——不会使用相机。',
  },


  // ============================================================================
  // ZERO-FRICTION RECORDING (Auto-Machine Creation)
  // ============================================================================
  zeroFriction: {
    autoMachineName: '机器 {{number}}',
    referenceCreatedToast: '已为 {{machineName}} 创建参考',
    editMachineName: '编辑',
    editMachineNamePrompt: '输入机器的新名称：',
    machineRenamed: '机器已重命名为 "{{newName}}"',
    noMachineSelected: '未选择机器 – 将自动创建',
  },

  // ============================================================================
  // AUTO-DETECTION (Simplified "检查状态" Flow)
  // ============================================================================
  autoDetect: {
    startButton: '立即检查',
    hint: '系统自动识别已知机器',
    showManualSelection: '手动选择',
    hideManualSelection: '隐藏手动选择',
    listening: '正在聆听...',
    waitingForSignal: '请将麦克风靠近机器',
    initializing: '正在初始化...',
    analyzing: '正在分析声音...',
    machineRecognized: '已识别机器',
    matchConfidence: '匹配度',
    continueAnalysis: '继续分析',
    differentMachine: '其他机器',
    uncertainMatch: '这是哪台机器？',
    selectMachine: '请选择匹配的机器',
    noMatch: '我还不认识这个声音',
    noMatchHint: '您想录制参考吗？',
    recordReference: '录制参考',
    newMachine: '创建新机器',
  },

  // ============================================================================
  // COMMON
  // ============================================================================
  common: {
    machine: '机器',
    error: '错误',
    warning: '警告',
    info: '信息',
    success: '成功',
    yes: '是',
    no: '否',
    or: '或',
    ok: '确定',
    loading: '加载中...',
    initializing: '初始化中...',
    unknown: '未知',
  },

  router: {
    statesTrained: '{{count}} 个状态已训练（最近：{{date}}）- 添加更多',
    referenceRequired: '{{duration}}秒参考录制（诊断必需）',
    liveAnalysis: '执行实时分析',
    lastCheck: '上次检查 {{time}}',
  },
  viewLevels: {
    basic: '操作员简单交通灯显示',
    advanced: '主管和维护人员详细信息',
    expert: '工程师完整技术视图',
    basicLabel: '基础', basicDesc: '简单',
    advancedLabel: '高级', advancedDesc: '详细',
    expertLabel: '专家', expertDesc: '技术',
    viewModeTitle: '显示模式',
    viewModeDescription: '根据您的需求调整界面复杂度。',
  },
  notifications: { confirmRequired: '需要确认', closeNotification: '关闭通知' },
  errorBoundary: {
    unexpectedError: '发生了意外错误。',
    unexpectedErrorTitle: '意外错误',
    permissionDenied: '访问被拒绝',
    permissionHint: '请在浏览器设置中允许访问麦克风/摄像头。',
    hardwareNotFound: '未找到硬件',
    hardwareHint: '请确保您的麦克风/摄像头已连接。',
    audioSystemError: '音频系统错误',
    audioSystemHint: '请重新加载页面。如果问题仍然存在，请使用最新版本的浏览器。',
    storageFull: '请删除旧的诊断或参考录制。',
    networkError: '请检查您的网络连接。',
    technicalDetails: '技术详情',
    noStackTrace: '无堆栈跟踪可用',
  },
  qualityCheck: {
    noFeatures: '无可用特征',
    noAudioData: '未提取到音频数据（帧数为0）',
    highVariance: '频谱方差高 - 信号不稳定',
    veryHighVariance: '方差非常高 - 请在更安静的环境中录制',
    outliers: '检测到{{count}}个异常值（{{ratio}}%）- 可能存在干扰噪音',
    weakSignal: '信号非常弱/分散 - 可能只是噪音。请靠近机器。',
    weakTonal: '音调信号弱 - 信噪比可能过低。',
    trainingSignalWeak: '信号太弱或不一致，无法训练。请确保：麦克风靠近机器，机器正在运行，不只是背景噪音。（平均余弦相似度：{{value}}）',
    invalidSampleRate: '无效的采样率：{{rate}}Hz。预期：8000-192000Hz（典型：44100Hz或48000Hz）',
  },
  healthGauge: {
    normal: '正常',
    deviation: '偏差',
    abnormal: '异常',
    explain: 'The score shows similarity to the reference state (0–100%). 100% = nearly identical. A declining trend matters more than a single value.',
    explainTitle: 'What does the score mean?',
  },
  audio: { ready: '就绪', stabilizing: '声学稳定中... {{seconds}}秒', waitingForSignal: '等待信号...', recordingRunning: '录制中' },
  settingsUI: {
    title: '设置', nfcWriterTitle: 'NFC 标签', nfcWriterDescription: '为应用入口或选定机器写入 NFC 标签。', appearance: '外观',
    audioSettings: '音频设置', audioHardware: '音频硬件',
    detectingMic: '正在检测麦克风...', detectingMicrophone: '正在检测麦克风...', initHardwareCheck: '初始化硬件检查',
    changeMicrophone: '更换麦克风', confidenceThreshold: '置信度阈值',
    faultyThreshold: '异常阈值',
    recordingDuration: '录制时长',
    recordingDurationDesc: '训练数据的净录制时间。额外增加5秒稳定时间以获得最佳音频质量。',
    seconds5: '5秒', seconds10: '10秒', seconds15: '15秒', seconds: '秒',
    frequencyAxis: '频率轴', frequencyAxisDesc: '对数（20-500 Hz范围更多细节）', frequencyLogDesc: '对数（20-500 Hz范围更多细节）',
    amplitudeAxis: 'Y轴/振幅', amplitudeAxisDesc: '对数（dB）- 强调微弱信号', amplitudeLogDesc: '对数（dB）- 强调微弱信号',
    disableAudioTriggerLabel: '禁用音频触发', disableAudioTriggerDesc: '即使信号非常微弱，也立即开始测量，无需等待最小电平。适用于极其安静的机器或环境。',
    analysisMethod: '分析方法', analysisMethodDesc: '为您的机器选择合适的分析方法。',
    gmaiMethodDesc: 'GMIA（广义互依赖分析）从多个时间窗口中提取共同的稳定成分，同时抑制设备特定效应。适用于结构化、时间稳定的机器声音。',
    level1Info: '等级 1：上方的频率和振幅设置处于活动状态',
    dataManagement: '数据管理', exportDatabase: '导出数据库', shareDatabase: '发送数据库',
    importDatabase: '导入数据库', statistics: '统计：',
    machines: '机器', recordings: '录制', diagnoses: '诊断',
    clearAllData: '删除所有数据', deleteAllData: '删除所有数据',
    quickAccessDesc: '快速访问最近使用的机器',
    noMachines: '没有可用的机器', or: '或',
    selectMicrophone: '选择麦克风',
    microphoneAdvice: '选择最佳麦克风进行机器诊断。避免使用耳机和蓝牙设备，因为它们针对语音进行了优化。',
    manualInput: '手动输入', machineIdInput: '输入机器ID', continue: '继续',
    qrHint: '将二维码或条形码放入框内', codeRecognized: '识别成功！',
    // 横幅设置
    bannerTitle: '横幅图片',
    bannerDescription: '自定义首页横幅图片。每个主题可以有自己的横幅。',
    bannerUpload: '上传横幅',
    bannerReset: '恢复默认',
    bannerHint: '推荐：1024×400 或 1024×500 像素，PNG 格式。左侧三分之一保留用于文字。',
    bannerFormatError: '格式必须为 1024×400 或 1024×500 的 PNG。',
    bannerUpdated: '横幅已更新。',
    bannerSaveError: '无法保存横幅。',
    bannerResetSuccess: '已恢复默认横幅。',
    bannerResetError: '重置横幅时出错。',
    themeToggle: '切换主题',
    closeSettings: '关闭设置',
    // Reset to Defaults
    resetSection: '默认设置',
    resetDescription: '将所有显示选项重置为初始状态。机器数据将被保留。',
    resetButton: '恢复默认设置',
    resetConfirm: '确定要重置吗？',
    resetSuccess: '已恢复默认设置。',
    resetDescriptionShort: '机器数据将被保留。',
  },
  nfc: {
    title: '写入 NFC 标签',
    description: '选择要写入 NFC 标签的信息。',
    supportDetails: '安全上下文：{{secureContext}} · NDEFReader 可用：{{ndefReader}}',
    openWriter: '写入 NFC 标签',
    writeButton: '立即写入',
    optionGeneric: '应用链接（通用）',
    optionGenericDetail: '打开应用但不包含机器 ID。',
    optionSpecific: '机器链接',
    optionSpecificDetailDefault: '打开当前选择的机器。',
    optionSpecificDetail: '打开 "{{name}}"（ID：{{id}}）。',
    optionSpecificUnavailable: '请先选择一台机器以写入专用链接。',
    hint: '将 NFC 标签贴近设备背面。',
    unavailableHint: '仅在 Android 的 Chrome 中支持 NFC 写入。',
    statusWriting: '正在写入 NFC 标签...',
    statusSuccess: 'NFC 标签写入成功。',
    statusCancelled: '写入已取消。',
    statusError: '无法写入 NFC 标签。',
    unsupported: '此设备不支持 NFC 写入。',
    requiresSecureContext: 'NFC 写入需要安全（HTTPS）连接。',
    unsupportedBrowser: 'NFC 写入需要 Android 上的 Chrome。',
    // Customer ID (Variant B)
    customerIdLabel: '客户 ID (c)',
    customerIdDescription: '此 ID 决定扫描 NFC 标签时加载哪些参考数据。数据将自动从 GitHub Pages 加载。',
    customerIdPlaceholder: '例如 Customer_ID_1',
    customerIdRequired: '请输入客户 ID。',
    dbUrlPreview: '数据 URL：{{url}}',
    closeDialog: '关闭 NFC 对话框',
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
    title: '创建二维码',
    description: '创建可打印或保存的二维码。只需贴在机器上即可。',
    openGenerator: '创建二维码',
    optionGeneric: '应用链接（通用）',
    optionGenericDetail: '打开应用但不包含机器 ID。',
    optionSpecific: '机器链接',
    optionSpecificDetailDefault: '打开当前选择的机器。',
    optionSpecificDetail: '打开 "{{name}}"（ID：{{id}}）。',
    optionSpecificUnavailable: '请先选择一台机器以创建专用二维码。',
    customerIdLabel: '客户 ID (c)',
    customerIdDescription: '此 ID 决定扫描时加载哪些参考数据。',
    customerIdPlaceholder: '例如 Customer_ID_1',
    customerIdRequired: '请输入客户 ID。',
    dbUrlPreview: '数据 URL：{{url}}',
    urlPreview: '链接预览',
    downloadPng: '保存为图片',
    print: '打印',
    closeDialog: '关闭二维码对话框',
    generatedFor: '二维码用于',
    machineLabel: '机器',
    machineIdLabel: 'ID',
    dateLabel: '创建日期',
    printTitle: '机器二维码',
    printInstructions: '剪下二维码并贴在机器上。',
    genericLabel: '应用入口',
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
    title: '检查录制', subtitle: '质量控制',
    listenTitle: '听录制',
    browserNoAudio: '您的浏览器不支持音频播放。',
    recordingInfo: '{{total}}秒录制（5秒稳定 + {{duration}}秒训练）',
    positionImageTitle: '已保存的位置图像',
    savedPositionImage: '已保存的位置图像',
    positionImageCheck: '检查图像是否显示正确的位置。',
    qualityTitle: '质量评估', quality: '质量',
    issuesTitle: '检测到的问题：', discardNew: '丢弃/重新',
    saveAsReference: '保存为参考',
  },
  diagnosisResults: {
    title: '诊断结果',
    fingerprintLabel: '指纹',
    confidenceScoreLabel: '置信度分数',
    varianceTitle: '方差',
    frequencyAnomalyLabel: '频率异常',
    analysisHintDefault: '提示：约 20 kHz 附近信号略有升高',
    referenceQualityTitle: '参考质量',
    referenceQualityStatusGood: '良好',
    referenceQualityDescription: '参考录制符合推荐条件',
    featureModeLabel: '特征模式',
    viewHistory: '查看历史',
    closeDialog: '关闭诊断',
  },
  results: {
    envMatch: {
      moreReverberant: '🏠 Environment more reverberant than reference – score may be affected',
      lessReverberant: '🏠 Environment less reverberant than reference – score may be affected',
      critical: '⚠️ Environment strongly deviating – score interpretation limited',
    },
  },
  historyChart: {
    title: '机器历史',
    machineName: '机器',
    dataPoints: '数据点',
    timeRange: '时间范围',
    xAxisLabel: '时间',
    yAxisLabel: '健康评分 (%)',
    noData: '暂无历史记录',
    noDataMessage: '此机器尚未保存任何诊断记录。',
    errorMessage: '加载历史记录时出错。',
    closeDialog: '关闭历史',
  },
  themes: {
    focusTitle: 'Steve Jobs',
    focusDescription: '一个动作。没有噪音。专注本质 - 其余一切退居幕后。',
    focusDesc: '一个动作。没有噪音。清晰有效。',
    daylightTitle: 'Daylight',
    daylightDescription: '明亮防眩主题，适合户外。清晰对比保证阳光下可读。',
    daylightDesc: '明亮防眩主题，适合户外。清晰对比保证阳光下可读。',
    brandTitle: 'Zanobo',
    brandDescription: '明亮、友好、值得信赖。您信任的AI。',
    brandDesc: '明亮、友好、值得信赖。您信任的AI。',
    neonTitle: 'Neon Industrial',
    neonDescription: '高对比霓虹配色，适合弱光环境。强调色引导关键操作。',
    neonDesc: '高对比霓虹配色，适合弱光环境。强调色引导关键操作。',
  },
  footer: {
    impressum: '法律声明',
    privacy: '隐私政策',
    about: '关于Zanobo',
    settings: '设置',
    closeImpressum: '关闭法律声明',
    closePrivacy: '关闭隐私政策',
    closeAbout: '关闭关于Zanobo',
  },

  // NFC IMPORT (Deep Link Import via ?importUrl=)
  nfcImport: {
    modalTitle: '检测到NFC备份',
    warningOverwrite: '警告：本地数据库将被覆盖！',
    currentData: '当前数据',
    newData: '新数据',
    exportedAt: '导出于',
    confirmButton: '导入数据',
    success: '数据库导入成功！',
    successTitle: '导入完成',
    error: '导入失败',
    errorTitle: '导入失败',
    errorGitHubBlob: '错误：请使用GitHub的"Raw"链接，而不是网页链接。',
    errorFetchFailed: '下载失败。请检查URL。',
    errorNotJson: '错误：URL返回的是HTML而不是JSON。\n\n请使用GitHub的"Raw"链接。',
    errorInvalidJson: '错误：文件不包含有效的JSON格式。',
    errorInvalidStructure: '错误：文件格式不是预期的备份格式。',
    errorNetwork: '加载数据时出现网络错误。请检查您的网络连接。',
    nfcMergeSuccess: '\u2705 Database updated – {{added}} new references added, {{skipped}} already present',
    nfcMergeInfo: 'Existing machines and references are preserved.',
  },

  // BADGES (UI Hints)
  badges: {
    recommended: '推荐',
    nextStep: '下一步',
  },

  // WORK POINT RANKING
  workPointRanking: {
    title: '状态分析',
    states: '状态',
    ariaLabel: '检测到的机器状态排名',
    statusHealthy: '正常',
    statusFaulty: '故障',
    noData: '没有可用的分析数据',
    rank: '排名',
    probability: '概率',
    topMatch: '最佳匹配',
    sectionTitle: '详细状态分布',
    sectionDescription: '所有已训练机器状态的概率分布',
  },

  // DATABASE MIGRATION
  migration: {
    title: '数据库更新',
    dataCleared:
      '由于更新，数据库已被重置。所有机器、录音和诊断都已删除。',
  },

  // ============================================================================
  // INSPECTION VIEW (Simplified PWA)
  // ============================================================================
  inspection: {
    // Header
    mainQuestion: '机器听起来正常吗？',
    subtitle: '检查运行中 – 请保持靠近机器',
    subtitleInitializing: '准备中 – 请稍候',
    // Status words (simple, non-technical)
    statusNormal: '正常',
    statusUncertain: '不确定',
    statusDeviation: '偏差',
    // Reference info
    referenceState: '参考状态',
    referenceDefault: '正常运行',
    // Dynamic hints for poor signal quality
    hintMoveCloser: '请靠近机器',
    hintChangePosition: '稍微改变位置',
    hintHoldSteady: '保持设备稳定',
    hintWaiting: '等待机器信号...',
    // Button
    stopButton: '停止',
  },

  // ============================================================================
  // MACHINE SETUP (NFC Deep Link - Status/Error Messages)
  // ============================================================================
  machineSetup: {
    // Validation errors
    urlEmpty: '请输入参考数据库链接。',
    urlInvalid: '该链接似乎不是有效的 URL。',
    urlNotHttps: '链接必须以 https:// 开头。',
    urlNotOfficialSource: '仅接受官方数据源（gunterstruck.github.io）。',

    // Download status
    downloadingReference: '正在加载参考数据...',
    statusDownloading: '正在下载参考数据...',
    statusParsing: '正在处理数据...',
    statusValidating: '正在验证格式...',
    statusSaving: '正在本地保存...',
    statusComplete: '完成！',

    // Download errors
    errorMachineNotFound: '机器未设置。请联系服务技术人员。',
    errorNoReferenceUrl: '未配置参考数据。请联系服务技术人员。',
    errorDownloadFailed: '下载失败。请检查您的网络连接。',
    errorInvalidFormat: '参考数据格式无效。',
    errorInvalidStructure: '数据结构已损坏。',
    errorNoModels: '数据中未找到参考模型。',
    errorInvalidModel: '一个或多个参考模型已损坏。',
    errorUnknown: '发生了未知错误。',

    // Success messages
    referenceLoaded: '参考数据加载成功！',

    // Loading overlay
    loadingTitle: '正在加载参考',
    loadingSubtitle: '请稍候...',
    testingBlocked: '只有在加载参考数据后才能进行测试。',
  },

  // ============================================================================
  // URL IMPORT (Deep Link Import via #/import?url=)
  // ============================================================================
  urlImport: {
    statusFetching: '正在加载数据库...',
    statusValidating: '正在验证数据...',
    statusImporting: '正在导入数据...',
    success: '数据库导入成功！',
    successTitle: '导入完成',
    errorTitle: '导入失败',
    errorGeneric: '导入失败。',
    errorInvalidUrl: '无效的URL。',
    errorFetchFailed: '下载失败 (HTTP {{status}})。',
    errorFileTooLarge: '文件过大。最大大小：50 MB。',
    errorNotJson: 'URL返回的是HTML而不是JSON。请检查链接。',
    errorInvalidJson: '文件不包含有效的JSON格式。',
    errorInvalidStructure: '文件不具有预期的数据库格式。',
    errorNetwork: '加载数据时出现网络错误。请检查您的互联网连接。',
  },

  // ============================================================================
  // ONBOARDING TRACE (Debug Protocol)
  // ============================================================================
  trace: {
    // UI
    title: '调试协议',
    toggle: '切换协议',
    copyToClipboard: '复制协议',
    copy: '复制',
    copied: '已复制！',
    copyFailed: '错误',
    noEntries: '暂无条目',

    // Status
    statusRunning: '运行中...',
    statusComplete: '完成',
    statusFailed: '失败',

    // Step labels - these map to TraceStepId
    steps: {
      // Deep Link Processing
      deep_link_detected: '检测到深层链接',
      hash_parsed: '哈希已解析',
      machine_id_extracted: '已提取机器 ID',
      customer_id_extracted: '已提取客户 ID',
      db_url_derived: '已派生数据库 URL',
      import_url_detected: '检测到导入 URL',

      // Download Process
      download_started: '下载已开始',
      download_complete: '下载完成',
      download_failed: '下载失败',

      // JSON Processing
      json_parse_started: 'JSON 解析已开始',
      json_parse_complete: 'JSON 解析成功',
      json_parse_failed: 'JSON 解析失败',

      // Validation
      schema_validation_started: '架构验证已开始',
      schema_validation_complete: '架构验证成功',
      schema_validation_failed: '架构验证失败',

      // Database Operations
      db_reset_started: '数据库重置已开始',
      db_import_started: '数据库导入已开始',
      db_import_complete: '数据库导入完成',
      db_import_failed: '数据库导入失败',

      // App State
      app_state_reload: '应用状态已重新加载',

      // Machine Operations
      machine_lookup: '正在查找机器',
      machine_found: '已找到机器',
      machine_not_found: '未找到机器',
      machine_created: '机器已创建',
      machine_selected: '机器已选择',

      // Final Steps
      test_dialog_shown: '测试对话框已显示',
      process_complete: '流程完成',
      process_failed: '流程失败',
    },
  },

  // ============================================================================
  // ABOUT MODAL
  // ============================================================================
  about: {
    title: '关于 Zanobo',
    subtitle: '机器状态声学比较助手',

    // Introduction
    intro: '<strong>Zanobo 2.0</strong> 是一个注重隐私的渐进式 Web 应用（PWA），专为机器声学的比较分析而设计。该应用程序允许完全<strong>离线</strong>记录和比较机器声音 – 无需云服务、无需外部传感器、无需训练的 AI 模型。<br><br>Zanobo 刻意将自己理解为<strong>非诊断工具</strong>，而是作为支持人工评估的<strong>比较和指导工具</strong>。',

    // Core Features
    coreFeaturesTitle: '核心功能',
    coreFeatures: {
      offlineFirst: '<strong>离线优先：</strong>所有录音和计算都在浏览器本地进行。',
      similarityScore: '<strong>相似度评分（0-100%）：</strong>Zanobo 计算参考录音和比较录音之间的数学相似度（余弦相似度）。',
      userThreshold: '<strong>用户定义阈值：</strong>用户自行定义在什么评分下状态算作"正常"或"偏离"。',
      visualFeedback: '<strong>可视化频谱反馈：</strong>实时显示频谱和比较结果。',
      noDataLeaks: '<strong>本地数据存储：</strong>所有音频录音和评分都专门存储在设备的本地 IndexedDB 中。',
    },

    // Legal Position
    legalTitle: '法律地位和知识产权审查',
    legalIntro: 'Zanobo 作为<strong>私人非商业开源项目</strong>独立开发，采用 <strong>MIT 许可证</strong>。其功能基于<strong>公开描述的数学程序</strong>（例如频率分析和类 GMIA 余弦比较），不包含<strong>任何专利系统逻辑</strong>、<strong>任何分类机制</strong>和<strong>任何学习模型</strong>。',
    legalReview: '在发布之前进行了<strong>技术和内容审查</strong>，以确保 Zanobo 不与现有专利或已知的工业诊断方法冲突。',

    // IP Table
    ipTableTitle: '相关知识产权和技术差异',
    ipTable: {
      headers: {
        reference: '参考 / 标题',
        source: '来源和状态',
        protectedScope: '保护范围',
        zanoboDiff: '与 Zanobo 的差异',
      },
      rows: {
        '0': {
          reference: '<strong>PAPDEOTT005125</strong><br><em>机器诊断程序</em>',
          source: '防御性出版物，西门子公司，2016',
          protectedScope: '使用中央数据库和移动传感器的基于云的诊断系统',
          zanoboDiff: 'Zanobo 完全在本地运行，无云、无中央数据库、无诊断',
        },
        '1': {
          reference: '<strong>EP3701708B1</strong><br><em>远程机器状态分析</em>',
          source: '欧洲专利，西门子公司，2022',
          protectedScope: '基于机器学习的远程诊断，带有训练模型和传感器',
          zanoboDiff: 'Zanobo 不使用机器学习，无云、无嵌入式诊断逻辑',
        },
        '2': {
          reference: '<strong>US9263041B2</strong><br><em>使用 GMIA 进行噪声中的信道检测</em>',
          source: '西门子公司，2016',
          protectedScope: 'GMIA 在语音和听觉系统中的应用',
          zanoboDiff: 'Zanobo 仅将类 GMIA 数学用于<strong>非语音</strong>和本地比较',
        },
        '3': {
          reference: '<strong>US9443201B2</strong><br><em>传感器特征学习</em>',
          source: '西门子，2016',
          protectedScope: '传感器特征的分类和模型训练',
          zanoboDiff: 'Zanobo 不进行分类和模型训练',
        },
        '4': {
          reference: '<strong>US9602781B2</strong><br><em>地震信号去混合（GMIA）</em>',
          source: '斯伦贝谢，2017',
          protectedScope: '使用 GMIA 分离地震信号',
          zanoboDiff: '不同的领域和信号类型，不相关',
        },
        '5': {
          reference: '<strong>ABB – Integration of Mobile Measurement</strong>',
          source: '公开工业演示，ABB，2015',
          protectedScope: '用于临时诊断的移动传感器，带有云和服务集成',
          zanoboDiff: 'Zanobo 避免诊断、服务工作流程和云连接，专注于本地比较',
        },
      },
    },

    // Transparency
    transparencyTitle: '透明度和意图',
    transparencyText1: 'Zanobo <strong>不是诊断工具</strong>，<strong>不进行自动技术评估</strong>。它仅提供<strong>视觉和数学比较辅助</strong>。',
    transparencyText2: '所有处理都<strong>离线</strong>进行。<strong>不传输、存储或评估用户数据</strong>。',
    transparencyText3: '这种透明度表达了对责任、数据保护和第三方权利的自觉态度。',
    transparencyList: {
      noClassification: '无状态分类',
      noCauseAnalysis: '无故障原因分析',
      noRepairRecommendations: '无维修建议',
    },

    // Public Instance
    publicInstance: '公共实例：',
    publicInstanceUrl: 'https://zanobo.vercel.app',

    // Version Info
    version: '版本：',
    versionNumber: '2.0.0 (2026)',
    developedBy: '开发者：',
    developerName: 'Günter Struck',
    license: '许可证：',
    licenseType: 'MIT',
    stack: '技术栈：',
    stackTech: 'TypeScript、Vite、Web Audio API',

    // Guiding Principle
    guidingPrincipleTitle: '指导原则',
    guidingPrincipleQuestion: '机器听起来正常吗？',
    guidingPrincipleStatement: '智能手机聆听机器声音。',
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
      noData: '未检查',
      minimumHint: '至少需要2台机器才能进行有意义的车队比较。',
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
    goldStandard: { badge: '金标准（车队参考）', deleted: '金标准「{{name}}」已删除 – {{count}} 台机器现在使用自己的参考。' },
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
      timeEstimate: '\u65F6\u957F\uFF1A\u7EA6 {{minutes}} \u5206\u949F\uFF0C\u5171 {{count}} \u53F0\u673A\u5668\u3002',
      privacyHint: '\u9EA6\u514B\u98CE\u548C\u6444\u50CF\u5934\u4EC5\u7528\u4E8E\u5206\u6790\u3002\u6240\u6709\u6570\u636E\u4FDD\u7559\u5728\u60A8\u7684\u8BBE\u5907\u4E0A\u3002',
    },
    guidedPrompt: {
      referenceHint: '\u6B64\u5F55\u97F3\u5C06\u4F5C\u4E3A\u6BD4\u8F83\u57FA\u51C6\u3002',
      positionInstruction: '\u5C06\u624B\u673A\u4FDD\u6301\u5728\u8DDD\u673A\u5668\u7EA6 10\u201320 \u5398\u7C73\u5904\u3002\u8BF7\u4FDD\u6301\u5B89\u9759\u3002',
      positionMemory: '\u63D0\u793A\uFF1A\u8BB0\u4F4F\u4F4D\u7F6E \u2013 \u6240\u6709\u673A\u5668\u4FDD\u6301\u76F8\u540C\u4F4D\u7F6E\u3002',
      noiseHint: '\u5F55\u97F3\u671F\u95F4\u8BF7\u4FDD\u6301\u5B89\u9759\uFF0C\u907F\u514D\u79FB\u52A8\u3002',
    },
    inspectionReference: {
      mainQuestion: '\u6B63\u5728\u5F55\u5236\u53C2\u8003...',
      subtitle: '\u6B64\u5F55\u97F3\u5C06\u4FDD\u5B58\u4E3A\u6BD4\u8F83\u57FA\u51C6\u3002',
      scorePlaceholder: '\u53C2\u8003 \u2013 \u65E0\u6BD4\u8F83',
      comparingWith: '\u6B63\u5728\u4E0E {{name}} \u6BD4\u8F83...',
    },
    ghostOverlay: {
      hint: '\u4F4D\u7F6E\u5F15\u5BFC\uFF1A\u5C06\u5B9E\u65F6\u56FE\u50CF\u4E0E\u534A\u900F\u660E\u8F6E\u5ED3\u5BF9\u9F50\u3002',
    },
    scoreExplanation: {
      hint: '{{score}}% = \u4E0E\u53C2\u8003\u7684\u76F8\u4F3C\u5EA6\u3002\u7EFF\u8272 = \u6B63\u5E38\uFF0C\u6A59\u8272 = \u68C0\u67E5\uFF0C\u7EA2\u8272 = \u5F02\u5E38\u3002',
    },
    resultContext: {
      allGood: '\u6240\u6709\u673A\u5668\u58F0\u97F3\u76F8\u4F3C \u2013 \u672A\u68C0\u6D4B\u5230\u5F02\u5E38\u3002',
      outlierWarning: '\u6CE8\u610F\uFF1A{{name}} \u663E\u793A\u663E\u8457\u504F\u5DEE\u3002\u5EFA\u8BAE\uFF1A\u8FDB\u4E00\u6B65\u68C0\u67E5\u3002',
      outlierWarningMultiple: '\u6CE8\u610F\uFF1A{{count}} \u53F0\u673A\u5668\u663E\u793A\u663E\u8457\u504F\u5DEE\u3002\u5EFA\u8BAE\uFF1A\u8FDB\u4E00\u6B65\u68C0\u67E5\u3002',
      fleetSaveHint: '\u4FDD\u5B58\u7684\u8F66\u961F\u53EF\u4EE5\u5B9A\u671F\u68C0\u67E5\u5E76\u63D0\u4F9B\u4F4D\u7F6E\u5F15\u5BFC\u3002',
    },
  },
};
