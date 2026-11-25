import {
  ArithmeticCheckResult,
  CalculatedStation,
  DaylightPoint,
  EarthworkSummary,
  FlowDirection,
  SegmentDrainage,
  SegmentEarthwork,
  SurveyRow
} from '../types/survey';

export function percentToDegrees(pct: number): number {
  return (Math.atan(pct / 100.0) * 180.0) / Math.PI;
}

export function degreesToPercent(deg: number): number {
  const clamped = Math.max(-45, Math.min(45, deg));
  return Math.tan((clamped * Math.PI) / 180.0) * 100.0;
}

export function percentToRatioText(pct: number): string {
  if (Math.abs(pct) < 0.005) return 'Flat (1 : ∞)';
  const n = 100 / Math.abs(pct);
  const sign = pct > 0 ? '+' : '-';
  const formatted = n >= 100 ? n.toFixed(0) : n.toFixed(1);
  return `${sign}1 : ${formatted}`;
}

export function getFGLAtChainage(chainage: number, fglZero: number, gradientPct: number): number {
  return fglZero + (gradientPct / 100.0) * chainage;
}

const isNum = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && !Number.isNaN(v) && Number.isFinite(v);

/**
 * Computes both Height of Instrument (Collimation / HI) and Rise & Fall
 * reductions simultaneously, plus full leveling arithmetic checks.
 */
export function calculateLeveling(
  rows: SurveyRow[],
  bmRL: number
): {
  stations: CalculatedStation[];
  check: ArithmeticCheckResult;
} {
  const stations: CalculatedStation[] = [];
  const structuralErrors: string[] = [];

  let currentHI: number | null = null;
  let prevStaffReading: number | null = null;
  let runningRL: number | null = bmRL;

  let totalBS = 0;
  let totalFS = 0;
  let totalRise = 0;
  let totalFall = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const hasBS = isNum(raw.bs);
    const hasIS = isNum(raw.is);
    const hasFS = isNum(raw.fs);

    if (hasBS) totalBS += raw.bs!;
    if (hasFS) totalFS += raw.fs!;

    let hi: number | null = null;
    let rl: number | null = null;
    let rise: number | null = null;
    let fall: number | null = null;
    let isCP = false;
    let hasWarning = false;
    let warningMessage: string | undefined;

    if (i === 0) {
      rl = bmRL;
      runningRL = bmRL;
      if (hasBS) {
        currentHI = rl + raw.bs!;
        prevStaffReading = raw.bs!;
        hi = currentHI;
      } else {
        hasWarning = true;
        warningMessage = 'Benchmark station requires a Backsight (BS).';
        structuralErrors.push(`Stn ${raw.stn}: Missing starting Backsight (BS).`);
      }
      if (hasIS || hasFS) {
        hasWarning = true;
        warningMessage = 'Benchmark station should normally only record a Backsight (BS).';
        structuralErrors.push(`Stn ${raw.stn}: Unexpected IS/FS on starting Benchmark.`);
      }
    } else {
      if (hasIS && (hasBS || hasFS)) {
        hasWarning = true;
        warningMessage = 'An Intermediate Sight (IS) should not share a row with BS or FS.';
        structuralErrors.push(`Stn ${raw.stn}: Combined IS with BS/FS.`);
      }

      if (hasIS && currentHI !== null && prevStaffReading !== null) {
        const diff = prevStaffReading - raw.is!;
        if (diff > 0) {
          rise = diff;
          totalRise += diff;
        } else if (diff < 0) {
          fall = Math.abs(diff);
          totalFall += fall;
        } else {
          rise = 0;
        }
        rl = currentHI - raw.is!;
        hi = currentHI;
        prevStaffReading = raw.is!;
        runningRL = rl;
      } else if (hasFS && currentHI !== null && prevStaffReading !== null) {
        const diff = prevStaffReading - raw.fs!;
        if (diff > 0) {
          rise = diff;
          totalRise += diff;
        } else if (diff < 0) {
          fall = Math.abs(diff);
          totalFall += fall;
        } else {
          rise = 0;
        }
        rl = currentHI - raw.fs!;
        runningRL = rl;

        if (hasBS) {
          isCP = true;
          currentHI = rl + raw.bs!;
          hi = currentHI;
          prevStaffReading = raw.bs!;
        } else {
          hi = currentHI;
          // Instrument setup ends on FS without a new BS
          currentHI = null;
          prevStaffReading = null;
        }
      } else if (hasBS && runningRL !== null) {
        // New setup started on standalone BS row
        currentHI = runningRL + raw.bs!;
        hi = currentHI;
        rl = runningRL;
        prevStaffReading = raw.bs!;
        if (i < rows.length - 1 && !hasFS) {
          hasWarning = true;
          warningMessage = 'Standalone BS without preceding FS at this station.';
          structuralErrors.push(`Stn ${raw.stn}: BS entered without closing FS from prior setup.`);
        }
      } else {
        hasWarning = true;
        if (!hasBS && !hasIS && !hasFS) {
          warningMessage = 'No staff reading entered for this station.';
          structuralErrors.push(`Stn ${raw.stn}: Missing staff reading (BS/IS/FS).`);
        } else {
          warningMessage = 'Previous instrument setup was closed by FS; enter a BS to continue.';
          structuralErrors.push(`Stn ${raw.stn}: No active Instrument Height (missing prior BS).`);
        }
        rl = runningRL;
        hi = currentHI;
      }

      // Check chainage order against previous row
      if (raw.chainage <= rows[i - 1].chainage) {
        hasWarning = true;
        warningMessage =
          warningMessage ||
          `Chainage (${raw.chainage}m) should increase strictly after Stn ${rows[i - 1].stn}.`;
      }
    }

    stations.push({
      ...raw,
      hi,
      rl,
      rise,
      fall,
      isCP,
      hasWarning,
      warningMessage
    });
  }

  const validStations = stations.filter((s) => isNum(s.rl));
  const firstRL = validStations.length > 0 ? validStations[0].rl! : bmRL;
  const lastRL = validStations.length > 0 ? validStations[validStations.length - 1].rl! : bmRL;

  const diffBSFS = totalBS - totalFS;
  const diffRiseFall = totalRise - totalFall;
  const diffRL = lastRL - firstRL;

  const discrepancyBSFS = diffBSFS - diffRL;
  const discrepancyRiseFall = diffRiseFall - diffRL;

  const isCheckPassed =
    structuralErrors.length === 0 &&
    Math.abs(discrepancyBSFS) < 0.0015 &&
    Math.abs(discrepancyRiseFall) < 0.0015;

  return {
    stations,
    check: {
      totalBS,
      totalFS,
      totalRise,
      totalFall,
      diffBSFS,
      diffRiseFall,
      diffRL,
      discrepancyBSFS,
      discrepancyRiseFall,
      isCheckPassed,
      structuralErrors
    }
  };
}

/**
 * Integrates cut and fill areas along the centerline and volumes across corridor width.
 * If cross-section offsets are enabled, integrates transverse strips across [-B/2, +B/2]
 * to stay exact with the 3D surface mesh.
 */
export function calculateEarthworks(
  stations: CalculatedStation[],
  fglZero: number,
  gradientPct: number,
  corridorWidth: number,
  useCrossOffsets: boolean
): EarthworkSummary {
  const sorted = [...stations]
    .filter((s) => isNum(s.rl))
    .sort((a, b) => a.chainage - b.chainage);

  if (sorted.length < 2) {
    return {
      cutArea: 0,
      fillArea: 0,
      cutVol: 0,
      fillVol: 0,
      netVol: 0,
      daylights: [],
      segments: []
    };
  }

  let totalCutArea = 0;
  let totalFillArea = 0;
  let totalCutVol = 0;
  let totalFillVol = 0;
  const daylights: DaylightPoint[] = [];
  const segments: SegmentEarthwork[] = [];

  const halfW = Math.max(0.5, corridorWidth) / 2.0;

  const integrateSegment1D = (x1: number, x2: number, d1: number, d2: number) => {
    const dx = x2 - x1;
    if (dx <= 0) return { cutA: 0, fillA: 0 };
    if ((d1 >= 0 && d2 >= 0) || (d1 <= 0 && d2 <= 0)) {
      const area = ((Math.abs(d1) + Math.abs(d2)) / 2.0) * dx;
      return d1 >= 0 && d2 >= 0 ? { cutA: area, fillA: 0 } : { cutA: 0, fillA: area };
    }
    const ratio = Math.abs(d1) / (Math.abs(d1) + Math.abs(d2));
    const dx1 = ratio * dx;
    const dx2 = dx - dx1;
    const a1 = 0.5 * Math.abs(d1) * dx1;
    const a2 = 0.5 * Math.abs(d2) * dx2;
    return d1 > 0 ? { cutA: a1, fillA: a2 } : { cutA: a2, fillA: a1 };
  };

  for (let i = 0; i < sorted.length - 1; i++) {
    const s1 = sorted[i];
    const s2 = sorted[i + 1];
    const x1 = s1.chainage;
    const x2 = s2.chainage;
    const dx = x2 - x1;
    if (dx <= 0) continue;

    const f1 = getFGLAtChainage(x1, fglZero, gradientPct);
    const f2 = getFGLAtChainage(x2, fglZero, gradientPct);

    const d1Center = s1.rl! - f1;
    const d2Center = s2.rl! - f2;

    if ((d1Center > 0 && d2Center < 0) || (d1Center < 0 && d2Center > 0)) {
      const ratio = Math.abs(d1Center) / (Math.abs(d1Center) + Math.abs(d2Center));
      const xCross = x1 + ratio * dx;
      daylights.push({
        chainage: xCross,
        elevation: getFGLAtChainage(xCross, fglZero, gradientPct)
      });
    }

    const { cutA, fillA } = integrateSegment1D(x1, x2, d1Center, d2Center);
    totalCutArea += cutA;
    totalFillArea += fillA;

    let segCutVol = cutA * corridorWidth;
    let segFillVol = fillA * corridorWidth;

    const hasOffsets =
      useCrossOffsets &&
      (isNum(s1.leftDeltaRL) ||
        isNum(s1.rightDeltaRL) ||
        isNum(s2.leftDeltaRL) ||
        isNum(s2.rightDeltaRL));

    if (hasOffsets) {
      // Transverse numerical integration across 12 slices over [-B/2, +B/2]
      const slices = 12;
      const dz = corridorWidth / slices;
      let accCut = 0;
      let accFill = 0;

      const l1 = s1.rl! + (s1.leftDeltaRL ?? 0);
      const r1 = s1.rl! + (s1.rightDeltaRL ?? 0);
      const l2 = s2.rl! + (s2.leftDeltaRL ?? 0);
      const r2 = s2.rl! + (s2.rightDeltaRL ?? 0);

      const groundAt = (s: CalculatedStation, l: number, r: number, z: number) => {
        if (z <= 0) {
          const t = (z + halfW) / halfW; // 0 at left edge, 1 at center
          return l + t * (s.rl! - l);
        }
        const t = z / halfW; // 0 at center, 1 at right edge
        return s.rl! + t * (r - s.rl!);
      };

      for (let k = 0; k < slices; k++) {
        const zMid = -halfW + (k + 0.5) * dz;
        const g1 = groundAt(s1, l1, r1, zMid);
        const g2 = groundAt(s2, l2, r2, zMid);
        const res = integrateSegment1D(x1, x2, g1 - f1, g2 - f2);
        accCut += res.cutA * dz;
        accFill += res.fillA * dz;
      }

      segCutVol = accCut;
      segFillVol = accFill;
    }

    totalCutVol += segCutVol;
    totalFillVol += segFillVol;

    segments.push({
      fromStn: s1.stn,
      toStn: s2.stn,
      fromCh: x1,
      toCh: x2,
      dx,
      cutArea: cutA,
      fillArea: fillA,
      cutVol: segCutVol,
      fillVol: segFillVol
    });
  }

  return {
    cutArea: totalCutArea,
    fillArea: totalFillArea,
    cutVol: totalCutVol,
    fillVol: totalFillVol,
    netVol: totalCutVol - totalFillVol,
    daylights,
    segments
  };
}

/**
 * Evaluates station-to-station ground slopes for drainage flow, flat spots,
 * and sag/reverse-grade ponding traps.
 */
export function analyzeDrainage(
  stations: CalculatedStation[],
  targetGradientPct: number,
  minDrainageGradePct = 0.5
): SegmentDrainage[] {
  const sorted = [...stations]
    .filter((s) => isNum(s.rl))
    .sort((a, b) => a.chainage - b.chainage);

  const rawSegs: Array<{
    fromStn: number;
    toStn: number;
    fromCh: number;
    toCh: number;
    dx: number;
    dRL: number;
    slopePct: number;
    flowDirection: FlowDirection;
  }> = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const s1 = sorted[i];
    const s2 = sorted[i + 1];
    const dx = s2.chainage - s1.chainage;
    if (dx <= 0) continue;

    const dRL = s2.rl! - s1.rl!;
    const slopePct = (dRL / dx) * 100.0;
    const flowDirection: FlowDirection =
      Math.abs(slopePct) < 0.05 ? 'flat' : slopePct < 0 ? 'downhill' : 'uphill';

    rawSegs.push({
      fromStn: s1.stn,
      toStn: s2.stn,
      fromCh: s1.chainage,
      toCh: s2.chainage,
      dx,
      dRL,
      slopePct,
      flowDirection
    });
  }

  return rawSegs.map((seg, idx) => {
    const prev = idx > 0 ? rawSegs[idx - 1] : null;
    const isSagPointAtStart = Boolean(
      prev && prev.slopePct < -0.15 && seg.slopePct > 0.15
    );
    const opposesTarget =
      Math.abs(targetGradientPct) >= 0.25 &&
      Math.abs(seg.slopePct) >= 0.2 &&
      Math.sign(seg.slopePct) !== Math.sign(targetGradientPct);

    let status: SegmentDrainage['status'] = 'positive';
    let note = 'Adequate natural grade';

    if (isSagPointAtStart || opposesTarget) {
      status = 'reverse-sag';
      note = isSagPointAtStart
        ? `Ponding sag at Stn ${seg.fromStn} (Ch ${seg.fromCh}m)`
        : 'Reverse slope vs formation grade';
    } else if (Math.abs(seg.slopePct) < minDrainageGradePct) {
      status = 'marginal';
      note = `Flat / slow drainage (< ${minDrainageGradePct.toFixed(1)}%)`;
    } else {
      note = seg.flowDirection === 'downhill' ? 'Drains forward (+Ch)' : 'Drains back (-Ch)';
    }

    return {
      ...seg,
      status,
      isSagPointAtStart,
      note
    };
  });
}

/**
 * Binary search for FGL_0 that minimizes |Net Earthwork Volume|.
 */
export function autoBalanceFGL(
  stations: CalculatedStation[],
  gradientPct: number,
  corridorWidth: number,
  useCrossOffsets: boolean
): number {
  const valid = stations.filter((s) => isNum(s.rl));
  if (valid.length < 2) return 100.0;

  const rls = valid.map((s) => s.rl!);
  const chs = valid.map((s) => s.chainage);
  const maxOffset = Math.max(...chs.map((c) => Math.abs((gradientPct / 100.0) * c)));

  let low = Math.min(...rls) - maxOffset - 10;
  let high = Math.max(...rls) + maxOffset + 10;

  for (let iter = 0; iter < 36; iter++) {
    const mid = (low + high) / 2.0;
    const ew = calculateEarthworks(stations, mid, gradientPct, corridorWidth, useCrossOffsets);
    if (ew.netVol > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return Math.round(((low + high) / 2.0) * 100) / 100;
}

export function exportSurveyCSV(
  stations: CalculatedStation[],
  check: ArithmeticCheckResult,
  useCrossOffsets: boolean
): void {
  const headers = [
    'Station',
    'Chainage_m',
    'BS_m',
    'IS_m',
    'FS_m',
    'Rise_m',
    'Fall_m',
    'HI_m',
    'RL_m',
    ...(useCrossOffsets ? ['Left_Offset_m', 'Right_Offset_m'] : []),
    'Remarks'
  ];

  const lines = [headers.join(',')];

  stations.forEach((s) => {
    const row = [
      s.stn,
      s.chainage.toFixed(2),
      isNum(s.bs) ? s.bs!.toFixed(3) : '',
      isNum(s.is) ? s.is!.toFixed(3) : '',
      isNum(s.fs) ? s.fs!.toFixed(3) : '',
      isNum(s.rise) ? s.rise!.toFixed(3) : '',
      isNum(s.fall) ? s.fall!.toFixed(3) : '',
      isNum(s.hi) ? s.hi!.toFixed(3) : '',
      isNum(s.rl) ? s.rl!.toFixed(3) : '',
      ...(useCrossOffsets
        ? [
            isNum(s.leftDeltaRL) ? s.leftDeltaRL!.toFixed(3) : '',
            isNum(s.rightDeltaRL) ? s.rightDeltaRL!.toFixed(3) : ''
          ]
        : []),
      `"${(s.remarks || '').replace(/"/g, '""')}"`
    ];
    lines.push(row.join(','));
  });

  lines.push('');
  lines.push(`Arithmetic Check,${check.isCheckPassed ? 'PASSED' : 'DISCREPANCY'}`);
  lines.push(`Sum BS,${check.totalBS.toFixed(3)}`);
  lines.push(`Sum FS,${check.totalFS.toFixed(3)}`);
  lines.push(`Sum BS - Sum FS,${check.diffBSFS.toFixed(3)}`);
  lines.push(`Sum Rise - Sum Fall,${check.diffRiseFall.toFixed(3)}`);
  lines.push(`Last RL - First RL,${check.diffRL.toFixed(3)}`);

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'leveling_earthworks_field_sheet.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
