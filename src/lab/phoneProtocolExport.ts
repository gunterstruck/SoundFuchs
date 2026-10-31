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
import type { SpreadSummary } from './phoneProtocolPlan.js';
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

function header(result: PhoneProtocolResult): string {
  return (
    `# Zanobot Mess-Labor · Handy-Protokoll (1 Referenz je Durchlauf) · ` +
    `${result.runs} Durchläufe/Bereich · Seed ${result.seed} · ` +
    `Testclips/Klasse ${result.maxTestPerClass > 0 ? result.maxTestPerClass : 'alle'} · ` +
    `Aggregation ${result.clipAgg} · ` +
    `${result.pipeline}`
  );
}

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
      'Fehler',
    ].join(',')
  );
  for (const sec of result.sections) {
    for (const e of result.engines) {
      const r = sec.perEngine[e];
      if (!r) continue;
      for (const run of r.runs) {
        lines.push(
          [
            csvCell(sec.key),
            csvCell(label(e)),
            String(run.run + 1),
            csvCell(run.refPath),
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
      'beste Referenz',
      'schlechteste Referenz',
      'Hinweise',
    ].join(',')
  );
  for (const sec of result.sections) {
    for (const e of result.engines) {
      const r = sec.perEngine[e];
      if (!r) continue;
      const s = r.summary;
      lines.push(
        [
          csvCell(sec.key),
          csvCell(label(e)),
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
    ].join(','),
  ];
  for (const d of result.details) {
    lines.push(
      [
        csvCell(d.sectionKey),
        csvCell(label(d.engine)),
        String(d.run + 1),
        csvCell(d.refPath),
        csvCell(d.testPath),
        d.label === 1 ? 'abnormal' : 'normal',
        fmt(d.raw, 5),
        fmt(d.capped, 2),
        fmt(d.displayScore, 1),
        d.status,
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
        'Handy-Protokoll: je Durchlauf GENAU EIN Referenz-Clip, angelernt mit der Handy-' +
        'Vorverarbeitung (trainPipeline); geprüft mit LivePipeline; AUC/pAUC auf Rohähnlichkeit ' +
        '(scoreBasis je Durchlauf); Quoten mit phoneVerdict und den Schwellen aus den Einstellungen. ' +
        'Strikt lesend.',
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
