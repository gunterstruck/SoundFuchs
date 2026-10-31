/**
 * ZANOBOT · Mess-Labor — Export des Handy-Protokolls (CSV / JSON), reine
 * String-Bauer angelehnt an exportResult.ts.
 *
 *  - toCsvPhone      : eine Zeile je Bereich × Engine × Durchlauf (mit
 *                      Referenzdatei) plus Zusammenfassungs-Zeilen.
 *  - toCsvPhoneDetail: eine Zeile je geprüfter Paarung (Referenz × Testclip)
 *                      mit Rohwert und angezeigtem Score — zum Nachprüfen.
 *  - toJsonPhone     : alles maschinenlesbar (optional inkl. Detail).
 */

import type { EngineId } from '@data/types.js';
import type { PhoneProtocolResult } from './phoneProtocol.js';
import { summarize, type SpreadSummary } from './phoneProtocolPlan.js';
import { ENGINE_LABEL } from './exportResult.js';

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function fmt(v: number, digits = 3): string {
  return Number.isFinite(v) ? v.toFixed(digits) : '';
}

function label(e: EngineId): string {
  return ENGINE_LABEL[e] ?? e;
}

/** Anzeigename einer Berichtszeile (Engine oder GMIA-λ-Stufe). */
function unitLabel(result: PhoneProtocolResult, key: string): string {
  const u = result.units.find((x) => x.key === key);
  if (!u) return key;
  return u.gmiaStage === undefined || u.gmiaStage === 'standard' ? label(u.engineId) : u.label;
}

/** Zahl in Exponentialschreibweise (λ, Konditionszahl) oder leer. */
function fmtExp(v: number): string {
  return Number.isFinite(v) ? v.toExponential(3) : '';
}

/** Klartext der Schwellenregel, z. B. „größte Abweichung × 1,25“. */
export function calibRuleLabel(result: PhoneProtocolResult): string {
  if (result.calibClips <= 0) return 'keine';
  return result.calibRule === 'mean-z'
    ? `Mittel + ${result.calibZ} · Standardabweichung`
    : `größte Abweichung × ${result.calibFactor}`;
}

/** Klartext der Referenz-Lage. */
export function refLayoutLabel(result: PhoneProtocolResult): string {
  return result.refLayout === 'block'
    ? 'am Stück (eine lange Aufnahme)'
    : 'verteilt (mehrere Aufnahmen)';
}

/** Referenz-Spanne je Bereich + Durchlauf (für den Detail-Export). */
function spanIndex(result: PhoneProtocolResult): Map<string, number> {
  const idx = new Map<string, number>();
  for (const sec of result.sections) {
    for (const r of Object.values(sec.perEngine)) {
      for (const run of r?.runs ?? []) idx.set(`${sec.key}|${run.run}`, run.refSpan);
    }
  }
  return idx;
}

function header(result: PhoneProtocolResult): string {
  return (
    `# Zanobot Mess-Labor · Handy-Protokoll · ` +
    `${result.runs} Durchläufe/Bereich · Seed ${result.seed} · ` +
    `Referenz aus k=${result.refClips} Clip(s), Lage ${refLayoutLabel(result)} · ` +
    `Kalibrier-Clips m=${result.calibClips} · ` +
    `Schwellenregel ${calibRuleLabel(result)} · ` +
    (result.gmiaStages.some((st) => st !== 'standard')
      ? `GMIA-λ-Stufen ${result.gmiaStages.map((st) => (st === 'standard' ? 'Standard 1e9' : `α=${st}`)).join('/')} · `
      : '') +
    `Testclips/Klasse ${result.maxTestPerClass > 0 ? result.maxTestPerClass : 'alle'} · ` +
    `Aggregation ${result.clipAgg} · ` +
    `${result.pipeline}`
  );
}

/** Parameter-Spalten der neuen Optionen (gleich in allen Zeilen eines Laufs). */
function paramCols(result: PhoneProtocolResult): string[] {
  const m = result.calibClips;
  return [
    String(m),
    String(result.refClips),
    m > 0 ? result.calibRule : '',
    m > 0 && result.calibRule === 'max-factor' ? String(result.calibFactor) : '',
    m > 0 && result.calibRule === 'mean-z' ? String(result.calibZ) : '',
  ];
}
const PARAM_HEADS = ['m (Kalibrier-Clips)', 'k (Referenz-Clips)', 'Regel', 'Faktor', 'z'];

/** Zusammenfassung als CSV-Spalten (Median/Min/Q1/Q3/Max). */
function spreadCols(s: SpreadSummary): string[] {
  return [fmt(s.median), fmt(s.min), fmt(s.q1), fmt(s.q3), fmt(s.max)];
}

/**
 * CSV: Abschnitt 1 = eine Zeile je Bereich × Engine × Durchlauf;
 * Abschnitt 2 = Zusammenfassung je Bereich × Engine.
 */
export function toCsvPhone(result: PhoneProtocolResult): string {
  const lines: string[] = [header(result)];
  for (const n of result.notes) lines.push(`# Hinweis: ${n.replace(/\n/g, ' ')}`);
  for (const s of result.skipped) lines.push(`# Übersprungen: ${s.key} — ${s.reason}`);

  lines.push(
    [
      'Bereich',
      'Engine',
      'Durchlauf',
      'Referenzdatei',
      'Referenz-Qualität',
      'AUC',
      'pAUC',
      'AUC-Basis',
      'Test normal',
      'Test abnormal',
      'Fehlalarmquote',
      'Erkennungsquote',
      'Zwischenbereich normal',
      'Zwischenbereich abnormal',
      'Zwischenbereich gesamt',
      ...PARAM_HEADS,
      'Kalibrier-Dateien',
      'Referenz-Lage',
      'Referenz-Spanne (Nummern)',
      'GMIA λ',
      'GMIA Konditionszahl',
      'Schwelle (Rohwert)',
      'Fehlalarmquote kalibriert',
      'Erkennungsquote kalibriert',
      'Fehler',
    ].join(',')
  );
  for (const sec of result.sections) {
    for (const u of result.units) {
      const e = u.key;
      const r = sec.perEngine[e];
      if (!r) continue;
      for (const run of r.runs) {
        lines.push(
          [
            csvCell(sec.key),
            csvCell(unitLabel(result, e)),
            String(run.run + 1),
            csvCell(run.refPaths.join(' + ')),
            run.refQuality ?? '',
            fmt(run.auc),
            fmt(run.pAuc),
            run.scoreBasis,
            String(run.nTestNormal),
            String(run.nTestAbnormal),
            fmt(run.falseAlarmRate),
            fmt(run.detectionRate),
            fmt(run.normalUncertainRate),
            fmt(run.abnormalUncertainRate),
            fmt(run.uncertainRate),
            ...paramCols(result),
            csvCell(run.calibPaths.join(' + ')),
            result.refLayout,
            Number.isFinite(run.refSpan) ? String(run.refSpan) : '',
            fmtExp(run.lambda),
            fmtExp(run.conditionNumber),
            fmt(run.threshold, 5),
            fmt(run.calibFalseAlarmRate),
            fmt(run.calibDetectionRate),
            csvCell(run.error ?? ''),
          ].join(',')
        );
      }
    }
  }

  lines.push('');
  lines.push('# Zusammenfassung je Bereich × Engine (über alle Durchläufe)');
  lines.push(
    [
      'Bereich',
      'Engine',
      'Zustand',
      'Durchläufe ok',
      'Durchläufe fehlgeschlagen',
      'AUC Median',
      'AUC Min',
      'AUC Q1',
      'AUC Q3',
      'AUC Max',
      'pAUC Median',
      'Fehlalarmquote Median',
      'Fehlalarmquote Min',
      'Fehlalarmquote Max',
      'Erkennungsquote Median',
      'Erkennungsquote Min',
      'Erkennungsquote Max',
      'Zwischenbereich Median',
      ...PARAM_HEADS,
      'Schwelle Median',
      'Fehlalarmquote kalibriert Median',
      'Fehlalarmquote kalibriert Min',
      'Fehlalarmquote kalibriert Max',
      'Erkennungsquote kalibriert Median',
      'Erkennungsquote kalibriert Min',
      'Erkennungsquote kalibriert Max',
      'Testmenge fest',
      'Referenz-Lage',
      'Referenz-Spanne Median',
      'GMIA λ Median',
      'GMIA Konditionszahl Max',
      'beste Referenz',
      'schlechteste Referenz',
      'Hinweise',
    ].join(',')
  );
  for (const sec of result.sections) {
    for (const u of result.units) {
      const e = u.key;
      const r = sec.perEngine[e];
      if (!r) continue;
      const s = r.summary;
      const conds = r.runs.map((x) => x.conditionNumber).filter((x) => Number.isFinite(x));
      const lambdas = r.runs
        .map((x) => x.lambda)
        .filter((x) => Number.isFinite(x))
        .sort((a, b) => a - b);
      lines.push(
        [
          csvCell(sec.key),
          csvCell(unitLabel(result, e)),
          s.health,
          String(s.runsOk),
          String(s.runsFailed),
          ...spreadCols(s.auc),
          fmt(s.pAuc.median),
          fmt(s.falseAlarmRate.median),
          fmt(s.falseAlarmRate.min),
          fmt(s.falseAlarmRate.max),
          fmt(s.detectionRate.median),
          fmt(s.detectionRate.min),
          fmt(s.detectionRate.max),
          fmt(s.uncertainRate.median),
          ...paramCols(result),
          fmt(s.threshold.median, 5),
          fmt(s.calibFalseAlarmRate.median),
          fmt(s.calibFalseAlarmRate.min),
          fmt(s.calibFalseAlarmRate.max),
          fmt(s.calibDetectionRate.median),
          fmt(s.calibDetectionRate.min),
          fmt(s.calibDetectionRate.max),
          sec.testSetFixed ? 'ja' : 'nein',
          result.refLayout,
          fmt(summarize(r.runs.map((x) => x.refSpan)).median, 0),
          lambdas.length ? fmtExp(lambdas[Math.floor((lambdas.length - 1) / 2)]) : '',
          conds.length ? fmtExp(Math.max(...conds)) : '',
          csvCell(s.bestRef ? s.bestRef.path : ''),
          csvCell(s.worstRef ? s.worstRef.path : ''),
          csvCell([...sec.notes, ...s.issues].join(' | ')),
        ].join(',')
      );
    }
  }
  return lines.join('\n');
}

/** Detail-CSV: eine Zeile je geprüftem Clip (Referenz × Testclip × Engine). */
export function toCsvPhoneDetail(result: PhoneProtocolResult): string {
  const spans = spanIndex(result);
  const lines = [
    header(result),
    [
      'Bereich',
      'Engine',
      'Durchlauf',
      'Referenzdatei',
      'Testdatei',
      'Label',
      'Rohwert (1−Ähnlichkeit)',
      'Anomalie gedeckelt (100−Score)',
      'Angezeigter Score',
      'Urteil',
      'Schwelle',
      'kalibriertes Urteil',
      'Referenz-Spanne (Nummern)',
    ].join(','),
  ];
  for (const d of result.details) {
    lines.push(
      [
        csvCell(d.sectionKey),
        csvCell(unitLabel(result, d.unit)),
        String(d.run + 1),
        csvCell(d.refPath),
        csvCell(d.testPath),
        d.label === 1 ? 'abnormal' : 'normal',
        fmt(d.raw, 5),
        fmt(d.capped, 2),
        fmt(d.displayScore, 1),
        d.status,
        fmt(d.threshold, 5),
        d.calibFlag === null ? '' : d.calibFlag ? 'auffällig' : 'unauffällig',
        fmt(spans.get(`${d.sectionKey}|${d.run}`) ?? NaN, 0),
      ].join(',')
    );
  }
  return lines.join('\n');
}

/** JSON: Parameter, Bereiche mit allen Durchläufen + Zusammenfassung; Detail optional. */
export function toJsonPhone(result: PhoneProtocolResult, includeDetails = false): string {
  const { details, ...rest } = result;
  return JSON.stringify(
    {
      tool: 'zanobot-mess-labor',
      mode: 'phone-protocol',
      note:
        'Handy-Protokoll: je Durchlauf eine Referenz aus refClips Normal-Clips, angelernt mit der ' +
        'Handy-Vorverarbeitung (trainPipeline je Clip, Features aneinandergehängt); geprüft mit ' +
        'LivePipeline gegen eine feste Testmenge; AUC/pAUC auf Rohähnlichkeit (scoreBasis je ' +
        'Durchlauf); Quoten mit phoneVerdict und den Schwellen aus den Einstellungen. Bei ' +
        'calibClips > 0 zusätzlich eine Schwelle aus den Rohwerten der Kalibrier-Clips ' +
        '(calibRule); kalibriert auffällig = Rohwert > Schwelle. Strikt lesend.',
      calibRuleText: calibRuleLabel(result),
      refLayoutText: refLayoutLabel(result),
      ...rest,
      startedAt: new Date(result.startedAt).toISOString(),
      finishedAt: new Date(result.finishedAt).toISOString(),
      nDetails: details.length,
      ...(includeDetails ? { details } : {}),
    },
    null,
    2
  );
}
