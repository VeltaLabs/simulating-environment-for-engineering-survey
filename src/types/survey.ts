export type LevelingMethod = 'hi' | 'rise_fall';

export type ViewMode = '2d' | '3d' | 'split';

export interface SurveyRow {
  id: string;
  stn: number;
  chainage: number;
  bs: number | null;
  is: number | null;
  fs: number | null;
  /** Optional lateral ground RL offset at Left corridor edge (-B/2) relative to centerline RL */
  leftDeltaRL?: number | null;
  /** Optional lateral ground RL offset at Right corridor edge (+B/2) relative to centerline RL */
  rightDeltaRL?: number | null;
  remarks: string;
}

export interface CalculatedStation extends SurveyRow {
  hi: number | null;
  rl: number | null;
  rise: number | null;
  fall: number | null;
  isCP: boolean;
  hasWarning: boolean;
  warningMessage?: string;
}

export interface ArithmeticCheckResult {
  totalBS: number;
  totalFS: number;
  totalRise: number;
  totalFall: number;
  diffBSFS: number;
  diffRiseFall: number;
  diffRL: number;
  discrepancyBSFS: number;
  discrepancyRiseFall: number;
  isCheckPassed: boolean;
  structuralErrors: string[];
}

export interface DaylightPoint {
  chainage: number;
  elevation: number;
}

export interface SegmentEarthwork {
  fromStn: number;
  toStn: number;
  fromCh: number;
  toCh: number;
  dx: number;
  cutArea: number;
  fillArea: number;
  cutVol: number;
  fillVol: number;
}

export interface EarthworkSummary {
  cutArea: number;
  fillArea: number;
  cutVol: number;
  fillVol: number;
  netVol: number;
  daylights: DaylightPoint[];
  segments: SegmentEarthwork[];
}

export type FlowDirection = 'downhill' | 'uphill' | 'flat';
export type DrainageStatus = 'positive' | 'marginal' | 'reverse-sag';

export interface SegmentDrainage {
  fromStn: number;
  toStn: number;
  fromCh: number;
  toCh: number;
  dx: number;
  dRL: number;
  slopePct: number;
  flowDirection: FlowDirection;
  status: DrainageStatus;
  isSagPointAtStart: boolean;
  note: string;
}

export interface SampleDataset {
  id: string;
  name: string;
  subtitle: string;
  bmRL: number;
  fglZero: number;
  gradientPct: number;
  corridorWidth: number;
  useCrossOffsets: boolean;
  rows: SurveyRow[];
}
