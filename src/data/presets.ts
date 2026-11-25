import { SampleDataset } from '../types/survey';

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'drainage-check',
    name: 'Leveling & Drainage Check',
    subtitle: 'Urban roadway gutter survey with Change Point and sag ponding spot',
    bmRL: 100.0,
    fglZero: 99.8,
    gradientPct: -0.5,
    corridorWidth: 10.0,
    useCrossOffsets: false,
    rows: [
      { id: 'd1', stn: 1, chainage: 0, bs: 1.6, is: null, fs: null, leftDeltaRL: null, rightDeltaRL: null, remarks: 'BM (Start)' },
      { id: 'd2', stn: 2, chainage: 10, bs: null, is: 1.97, fs: null, leftDeltaRL: null, rightDeltaRL: null, remarks: 'Gutter station' },
      { id: 'd3', stn: 3, chainage: 20, bs: null, is: 2.775, fs: null, leftDeltaRL: null, rightDeltaRL: null, remarks: 'Low spot (sag)' },
      { id: 'd4', stn: 4, chainage: 30, bs: null, is: 1.394, fs: null, leftDeltaRL: null, rightDeltaRL: null, remarks: 'Crest shoulder' },
      { id: 'd5', stn: 5, chainage: 40, bs: 1.708, is: null, fs: 1.681, leftDeltaRL: null, rightDeltaRL: null, remarks: 'CP 1' },
      { id: 'd6', stn: 6, chainage: 50, bs: null, is: 1.89, fs: null, leftDeltaRL: null, rightDeltaRL: null, remarks: 'Ground reading' },
      { id: 'd7', stn: 7, chainage: 60, bs: null, is: null, fs: 1.246, leftDeltaRL: null, rightDeltaRL: null, remarks: 'Final station' }
    ]
  },
  {
    id: 'cut-fill-grading',
    name: 'Cut & Fill Grading',
    subtitle: 'Undulating hill corridor with balanced cut/fill zones and cross-slope offsets',
    bmRL: 102.5,
    fglZero: 102.65,
    gradientPct: -0.35,
    corridorWidth: 12.0,
    useCrossOffsets: true,
    rows: [
      { id: 'c1', stn: 1, chainage: 0, bs: 1.42, is: null, fs: null, leftDeltaRL: 0.25, rightDeltaRL: -0.15, remarks: 'BM Ridge Base' },
      { id: 'c2', stn: 2, chainage: 20, bs: null, is: 0.78, fs: null, leftDeltaRL: 0.4, rightDeltaRL: -0.25, remarks: 'Ridge crest' },
      { id: 'c3', stn: 3, chainage: 40, bs: null, is: 0.45, fs: null, leftDeltaRL: 0.35, rightDeltaRL: -0.3, remarks: 'Peak cut zone' },
      { id: 'c4', stn: 4, chainage: 60, bs: 1.85, is: null, fs: 1.54, leftDeltaRL: 0.15, rightDeltaRL: -0.2, remarks: 'CP 1 (Transition)' },
      { id: 'c5', stn: 5, chainage: 80, bs: null, is: 2.68, fs: null, leftDeltaRL: -0.2, rightDeltaRL: -0.45, remarks: 'Valley depression' },
      { id: 'c6', stn: 6, chainage: 100, bs: null, is: 2.95, fs: null, leftDeltaRL: -0.35, rightDeltaRL: -0.5, remarks: 'Deep fill zone' },
      { id: 'c7', stn: 7, chainage: 120, bs: 1.32, is: null, fs: 2.15, leftDeltaRL: -0.1, rightDeltaRL: -0.25, remarks: 'CP 2' },
      { id: 'c8', stn: 8, chainage: 140, bs: null, is: null, fs: 1.48, leftDeltaRL: 0.15, rightDeltaRL: -0.1, remarks: 'End tie-in' }
    ]
  },
  {
    id: 'sloped-formation',
    name: 'Sloped Formation',
    subtitle: 'Ascending access ramp (+2.0% grade) with two Change Points and flat terrace',
    bmRL: 95.0,
    fglZero: 94.9,
    gradientPct: 2.0,
    corridorWidth: 8.0,
    useCrossOffsets: false,
    rows: [
      { id: 's1', stn: 1, chainage: 0, bs: 2.15, is: null, fs: null, leftDeltaRL: null, rightDeltaRL: null, remarks: 'BM Ramp Toe' },
      { id: 's2', stn: 2, chainage: 20, bs: null, is: 1.88, fs: null, leftDeltaRL: null, rightDeltaRL: null, remarks: 'Lower apron' },
      { id: 's3', stn: 3, chainage: 40, bs: null, is: 1.86, fs: null, leftDeltaRL: null, rightDeltaRL: null, remarks: 'Flat shelf' },
      { id: 's4', stn: 4, chainage: 60, bs: 2.41, is: null, fs: 1.12, leftDeltaRL: null, rightDeltaRL: null, remarks: 'CP 1 (Mid slope)' },
      { id: 's5', stn: 5, chainage: 80, bs: null, is: 1.65, fs: null, leftDeltaRL: null, rightDeltaRL: null, remarks: 'Cut bench' },
      { id: 's6', stn: 6, chainage: 100, bs: 1.92, is: null, fs: 0.94, leftDeltaRL: null, rightDeltaRL: null, remarks: 'CP 2 (Upper)' },
      { id: 's7', stn: 7, chainage: 120, bs: null, is: null, fs: 1.45, leftDeltaRL: null, rightDeltaRL: null, remarks: 'Top abutment' }
    ]
  }
];
