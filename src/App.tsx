import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Maximize2,
  Minimize2,
  RotateCcw,
  SlidersHorizontal
} from 'lucide-react';
import { ProfileCanvas2D } from './components/ProfileCanvas2D';
import { SurveyTable } from './components/SurveyTable';
import { TerrainView3D } from './components/TerrainView3D';
import { SAMPLE_DATASETS } from './data/presets';
import { LevelingMethod, SurveyRow, ViewMode } from './types/survey';
import {
  analyzeDrainage,
  autoBalanceFGL,
  calculateEarthworks,
  calculateLeveling,
  degreesToPercent,
  exportSurveyCSV,
  percentToDegrees,
  percentToRatioText
} from './utils/levelingEngine';

export default function App() {
  const initialPreset = SAMPLE_DATASETS[0];

  const [activePresetId, setActivePresetId] = useState<string>(initialPreset.id);
  const [method, setMethod] = useState<LevelingMethod>('hi');
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [projectorMode, setProjectorMode] = useState<boolean>(false);

  const [bmRL, setBmRL] = useState<number>(initialPreset.bmRL);
  const [rows, setRows] = useState<SurveyRow[]>(() =>
    initialPreset.rows.map((r) => ({ ...r }))
  );
  const [useCrossOffsets, setUseCrossOffsets] = useState<boolean>(
    initialPreset.useCrossOffsets
  );

  const [fglZero, setFglZero] = useState<number>(initialPreset.fglZero);
  const [gradientPct, setGradientPct] = useState<number>(initialPreset.gradientPct);
  const [corridorWidth, setCorridorWidth] = useState<number>(initialPreset.corridorWidth);

  const [ratioDenominator, setRatioDenominator] = useState<string>(() => {
    if (Math.abs(initialPreset.gradientPct) < 0.005) return '';
    return (100 / initialPreset.gradientPct).toFixed(0);
  });

  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  // Leveling calculations (both HI & Rise/Fall)
  const { stations, check } = useMemo(() => calculateLeveling(rows, bmRL), [rows, bmRL]);

  // Earthworks integration
  const earthworks = useMemo(
    () =>
      calculateEarthworks(
        stations,
        fglZero,
        gradientPct,
        corridorWidth,
        useCrossOffsets
      ),
    [stations, fglZero, gradientPct, corridorWidth, useCrossOffsets]
  );

  // Station-to-station slope & drainage analysis
  const drainageSegments = useMemo(
    () => analyzeDrainage(stations, gradientPct, 0.5),
    [stations, gradientPct]
  );

  // Defer 3D geometry rebuilds during rapid typing or slider drags
  const deferredStations = useDeferredValue(stations);
  const deferredFglZero = useDeferredValue(fglZero);
  const deferredGradientPct = useDeferredValue(gradientPct);
  const deferredCorridorWidth = useDeferredValue(corridorWidth);
  const deferredDaylights = useDeferredValue(earthworks.daylights);

  // Dynamic FGL slider bounds based on current Ground RL range
  const fglBounds = useMemo(() => {
    const validRLs = stations.map((s) => s.rl).filter((v): v is number => v !== null);
    if (validRLs.length === 0) return { min: 95, max: 105 };
    const minRL = Math.min(...validRLs);
    const maxRL = Math.max(...validRLs);
    return {
      min: Math.floor((minRL - 4) * 10) / 10,
      max: Math.ceil((maxRL + 4) * 10) / 10
    };
  }, [stations]);

  const applyGradientPercent = (pct: number) => {
    const clamped = Math.max(-15, Math.min(15, pct));
    setGradientPct(clamped);
    if (Math.abs(clamped) < 0.01) {
      setRatioDenominator('');
    } else {
      const denom = 100 / clamped;
      setRatioDenominator(Math.abs(denom) >= 100 ? denom.toFixed(0) : denom.toFixed(1));
    }
  };

  const applyGradientDegrees = (deg: number) => {
    applyGradientPercent(degreesToPercent(deg));
  };

  const applySlopeRatioInput = (raw: string) => {
    setRatioDenominator(raw);
    const num = parseFloat(raw);
    if (!Number.isFinite(num) || Math.abs(num) < 1) return;
    applyGradientPercent(100 / num);
  };

  const loadPreset = (presetId: string) => {
    const found = SAMPLE_DATASETS.find((p) => p.id === presetId);
    if (!found) return;
    setActivePresetId(found.id);
    setBmRL(found.bmRL);
    setRows(found.rows.map((r) => ({ ...r })));
    setUseCrossOffsets(found.useCrossOffsets);
    setFglZero(found.fglZero);
    applyGradientPercent(found.gradientPct);
    setCorridorWidth(found.corridorWidth);
    setConfirmReset(false);
  };

  const handleUpdateRow = (index: number, field: keyof SurveyRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      if (field === 'remarks') {
        row.remarks = value;
      } else {
        const trimmed = value.trim();
        const parsed = trimmed === '' ? null : parseFloat(trimmed);
        if (field === 'stn') {
          row.stn = parsed !== null && Number.isFinite(parsed) ? parsed : row.stn;
        } else if (field === 'chainage') {
          row.chainage = parsed !== null && Number.isFinite(parsed) ? parsed : 0;
        } else {
          row[field] = parsed !== null && Number.isFinite(parsed) ? parsed : null;
        }
      }
      next[index] = row;
      return next;
    });
  };

  const handleAddRow = () => {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      const nextStn = last ? last.stn + 1 : 1;
      const nextCh = last ? last.chainage + 10 : 0;
      return [
        ...prev,
        {
          id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          stn: nextStn,
          chainage: nextCh,
          bs: null,
          is: 1.5,
          fs: null,
          leftDeltaRL: useCrossOffsets ? 0 : null,
          rightDeltaRL: useCrossOffsets ? 0 : null,
          remarks: 'Ground reading'
        }
      ];
    });
  };

  const handleDeleteRow = (index: number) => {
    setRows((prev) => (prev.length > 2 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleAutoBalance = () => {
    const balanced = autoBalanceFGL(
      stations,
      gradientPct,
      corridorWidth,
      useCrossOffsets
    );
    setFglZero(balanced);
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      window.setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    loadPreset(activePresetId);
  };

  const gradientDeg = percentToDegrees(gradientPct);
  const netAbs = Math.abs(earthworks.netVol);
  const netStatusText =
    netAbs < 1.0
      ? 'Balanced Earthwork'
      : earthworks.netVol > 0
        ? 'Surplus Cut (Haul Off)'
        : 'Deficit Fill (Import)';

  const sagOrReverseCount = drainageSegments.filter(
    (s) => s.status === 'reverse-sag'
  ).length;
  const marginalCount = drainageSegments.filter((s) => s.status === 'marginal').length;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Top Bar: Clean Single-Row Contract */}
      <header className="border-b border-slate-800/90 bg-[#0d1524] px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <a
          href="#top"
          onClick={(e) => e.preventDefault()}
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          Leveling &amp; Earthworks Visualizer
        </a>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleAutoBalance}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Auto-Balance Cut/Fill
          </button>

          <button
            type="button"
            onClick={handleReset}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              confirmReset
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-[#111a2c] hover:bg-slate-800 text-slate-200 border-slate-700'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {confirmReset ? 'Click to Confirm Reset' : 'Reset Dataset'}
          </button>

          <button
            type="button"
            onClick={() => setProjectorMode((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#111a2c] hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {projectorMode ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-sky-400" />
                Split Workspace
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                Expand Viewport
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => exportSurveyCSV(stations, check, useCrossOffsets)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </header>

      {/* Workspace Toolbar: Sample Datasets + View Mode Switch */}
      <div className="border-b border-slate-800/70 bg-[#0b111e] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400 mr-1 whitespace-nowrap">
            Sample Datasets:
          </span>
          {SAMPLE_DATASETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => loadPreset(preset.id)}
              title={preset.subtitle}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePresetId === preset.id
                  ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                  : 'bg-[#111a2c] border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 hidden sm:inline">
            {check.isCheckPassed ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Closure Balanced
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                Closure Discrepancy
              </span>
            )}
          </span>

          <div
            className="inline-flex items-center p-1 bg-[#090d16] border border-slate-800 rounded-lg"
            role="group"
            aria-label="Visualization mode"
          >
            <button
              type="button"
              onClick={() => setViewMode('2d')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === '2d'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2D Profile
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              3D Surface
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Split View
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Grid */}
      <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
        <div
          className={`grid gap-5 items-start ${
            projectorMode ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-12'
          }`}
        >
          {/* Left Column: Optical Surveying Field Sheet */}
          {!projectorMode && (
            <div className="xl:col-span-6">
              <SurveyTable
                bmRL={bmRL}
                onBmRLChange={setBmRL}
                method={method}
                onMethodChange={setMethod}
                useCrossOffsets={useCrossOffsets}
                onToggleCrossOffsets={() => setUseCrossOffsets((v) => !v)}
                stations={stations}
                check={check}
                onUpdateRow={handleUpdateRow}
                onAddRow={handleAddRow}
                onDeleteRow={handleDeleteRow}
              />
            </div>
          )}

          {/* Right Column: Grading Simulator, KPIs, 2D/3D Viewport & Drainage */}
          <div className={`${projectorMode ? '' : 'xl:col-span-6'} flex flex-col gap-4`}>
            <section className="bg-[#111a2c] border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col gap-4">
              {/* Section Header + Datum Mode */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div>
                  <h2 className="text-base font-semibold text-slate-100 tracking-tight">
                    Cut-and-Fill &amp; Formation Grade Simulator
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Adjust datum elevation, longitudinal slope, and corridor width
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyGradientPercent(0)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      Math.abs(gradientPct) < 0.01
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                        : 'bg-[#090d16] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    Horizontal Datum (0%)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyGradientPercent(-0.5)}
                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-[#090d16] border border-slate-800 text-slate-300 hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    -0.5% Drain
                  </button>
                  <button
                    type="button"
                    onClick={() => applyGradientPercent(1.5)}
                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-[#090d16] border border-slate-800 text-slate-300 hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    +1.5% Ramp
                  </button>
                </div>
              </div>

              {/* Formation Elevation, Synchronized Slope & Width Controls */}
              <div className="bg-[#0b1322] border border-slate-800 rounded-lg p-3.5 flex flex-col gap-3.5">
                {/* FGL_0 Slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="fglNumber"
                      className="text-xs font-medium text-slate-200"
                    >
                      Design Formation Elevation (FGL₀ at Ch 0.0m)
                    </label>
                    <div className="flex items-center gap-1.5 font-mono-tabular">
                      <input
                        id="fglNumber"
                        type="number"
                        step="0.05"
                        value={fglZero.toFixed(2)}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (Number.isFinite(v)) setFglZero(v);
                        }}
                        className="w-20 bg-[#090d16] border border-slate-700 focus:border-amber-400 rounded px-2 py-0.5 text-xs font-semibold text-amber-300 text-right outline-none"
                      />
                      <span className="text-xs text-slate-400">m</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    aria-label="Design formation elevation slider"
                    min={fglBounds.min}
                    max={fglBounds.max}
                    step="0.02"
                    value={Math.max(fglBounds.min, Math.min(fglBounds.max, fglZero))}
                    onChange={(e) => setFglZero(parseFloat(e.target.value))}
                    className="engineering-slider"
                  />
                </div>

                {/* Target Slope Inputs: % Grade, Degrees, Slope Ratio 1:N */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2.5 border-t border-slate-800/80">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="gradPctInput" className="text-slate-300 font-medium">
                        Grade (%)
                      </label>
                      <span className="font-mono-tabular text-amber-300 font-semibold">
                        {gradientPct >= 0 ? '+' : ''}
                        {gradientPct.toFixed(2)}%
                      </span>
                    </div>
                    <input
                      id="gradPctInput"
                      type="number"
                      step="0.05"
                      min="-15"
                      max="15"
                      value={Number(gradientPct.toFixed(2))}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) applyGradientPercent(v);
                      }}
                      className="bg-[#090d16] border border-slate-700 focus:border-amber-400 rounded px-2.5 py-1 text-xs font-mono-tabular text-slate-100 outline-none"
                    />
                    <input
                      type="range"
                      aria-label="Grade percentage slider"
                      min="-5"
                      max="5"
                      step="0.05"
                      value={Math.max(-5, Math.min(5, gradientPct))}
                      onChange={(e) => applyGradientPercent(parseFloat(e.target.value))}
                      className="engineering-slider"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="gradDegInput" className="text-slate-300 font-medium">
                        Angle (°)
                      </label>
                      <span className="font-mono-tabular text-sky-300 font-semibold">
                        {gradientDeg >= 0 ? '+' : ''}
                        {gradientDeg.toFixed(2)}°
                      </span>
                    </div>
                    <input
                      id="gradDegInput"
                      type="number"
                      step="0.01"
                      min="-10"
                      max="10"
                      value={Number(gradientDeg.toFixed(2))}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) applyGradientDegrees(v);
                      }}
                      className="bg-[#090d16] border border-slate-700 focus:border-sky-400 rounded px-2.5 py-1 text-xs font-mono-tabular text-slate-100 outline-none"
                    />
                    <input
                      type="range"
                      aria-label="Grade angle degrees slider"
                      min="-3"
                      max="3"
                      step="0.01"
                      value={Math.max(-3, Math.min(3, gradientDeg))}
                      onChange={(e) => applyGradientDegrees(parseFloat(e.target.value))}
                      className="engineering-slider slider-cyan"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slopeRatioInput" className="text-slate-300 font-medium">
                        Ratio (1 : N)
                      </label>
                      <span className="font-mono-tabular text-slate-400 text-[11px]">
                        {percentToRatioText(gradientPct)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono-tabular text-slate-400">1 :</span>
                      <input
                        id="slopeRatioInput"
                        type="number"
                        step="10"
                        placeholder="∞ (Flat)"
                        value={ratioDenominator}
                        onChange={(e) => applySlopeRatioInput(e.target.value)}
                        className="w-full bg-[#090d16] border border-slate-700 focus:border-sky-400 rounded px-2 py-1 text-xs font-mono-tabular text-slate-100 outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <label htmlFor="widthInput" className="text-[11px] text-slate-400 whitespace-nowrap">
                        Corridor Width:
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          id="widthInput"
                          type="number"
                          min="1"
                          max="100"
                          step="0.5"
                          value={corridorWidth}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v >= 0.5) setCorridorWidth(v);
                          }}
                          className="w-16 bg-[#090d16] border border-slate-700 focus:border-sky-400 rounded px-1.5 py-0.5 text-xs font-mono-tabular text-right text-slate-100 outline-none"
                        />
                        <span className="text-[11px] text-slate-400 font-mono-tabular">m</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4-Column KPI Metrics Strip (Clean Hairline Borders) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-[#090d16] border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Cut Volume (Excavation)
                  </div>
                  <div className="text-lg font-bold text-rose-400 font-mono-tabular mt-0.5">
                    {earthworks.cutVol.toFixed(1)} m³
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
                    Area: {earthworks.cutArea.toFixed(2)} m²
                  </div>
                </div>

                <div className="bg-[#090d16] border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Fill Volume (Embankment)
                  </div>
                  <div className="text-lg font-bold text-emerald-400 font-mono-tabular mt-0.5">
                    {earthworks.fillVol.toFixed(1)} m³
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
                    Area: {earthworks.fillArea.toFixed(2)} m²
                  </div>
                </div>

                <div className="bg-[#090d16] border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Net Earthwork Balance
                  </div>
                  <div className="text-lg font-bold text-sky-400 font-mono-tabular mt-0.5">
                    {netAbs.toFixed(1)} m³
                  </div>
                  <div
                    className={`text-[11px] font-medium mt-0.5 ${
                      netAbs < 1.0
                        ? 'text-emerald-400'
                        : earthworks.netVol > 0
                          ? 'text-rose-400'
                          : 'text-sky-300'
                    }`}
                  >
                    {netStatusText}
                  </div>
                </div>

                <div className="bg-[#090d16] border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] font-medium text-slate-400">
                    Daylight Crossings
                  </div>
                  <div className="text-lg font-bold text-purple-400 font-mono-tabular mt-0.5">
                    {earthworks.daylights.length}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Cut / Fill transitions
                  </div>
                </div>
              </div>

              {/* Visualization Viewport: 2D Profile, 3D Surface, or Split View */}
              {viewMode === '2d' && (
                <ProfileCanvas2D
                  stations={stations}
                  fglZero={fglZero}
                  gradientPct={gradientPct}
                  daylights={earthworks.daylights}
                  drainageSegments={drainageSegments}
                  heightClass={projectorMode ? 'h-[480px]' : 'h-[360px]'}
                />
              )}

              {viewMode === '3d' && (
                <TerrainView3D
                  stations={deferredStations}
                  fglZero={deferredFglZero}
                  gradientPct={deferredGradientPct}
                  corridorWidth={deferredCorridorWidth}
                  useCrossOffsets={useCrossOffsets}
                  daylights={deferredDaylights}
                  heightClass={projectorMode ? 'h-[520px]' : 'h-[400px]'}
                />
              )}

              {viewMode === 'split' && (
                <div className="grid grid-cols-1 gap-3">
                  <ProfileCanvas2D
                    stations={stations}
                    fglZero={fglZero}
                    gradientPct={gradientPct}
                    daylights={earthworks.daylights}
                    drainageSegments={drainageSegments}
                    heightClass="h-[270px]"
                  />
                  <TerrainView3D
                    stations={deferredStations}
                    fglZero={deferredFglZero}
                    gradientPct={deferredGradientPct}
                    corridorWidth={deferredCorridorWidth}
                    useCrossOffsets={useCrossOffsets}
                    daylights={deferredDaylights}
                    heightClass="h-[340px]"
                  />
                </div>
              )}

              {/* Concise 2D Legend */}
              {viewMode !== '3d' && (
                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-slate-400 pt-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-sky-400 inline-block" />
                    Existing Ground (EGL)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-0.5 border-b-2 border-dashed border-amber-400 inline-block" />
                    Formation Line (FGL)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-rose-500/40 border border-rose-500 inline-block" />
                    Cut
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-emerald-500/40 border border-emerald-500 inline-block" />
                    Fill
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-400 border border-white inline-block" />
                    Daylight
                  </span>
                </div>
              )}
            </section>

            {/* Drainage & Segment Slope Diagnostics */}
            <section className="bg-[#111a2c] border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Ground Slope &amp; Drainage Flow Check
                  </h3>
                  <p className="text-xs text-slate-400">
                    Station-to-station grade direction and ponding risk (threshold: 0.50% min slope)
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-medium">
                  {sagOrReverseCount > 0 && (
                    <span className="text-rose-400 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {sagOrReverseCount} Sag / Reverse
                    </span>
                  )}
                  {marginalCount > 0 && (
                    <span className="text-amber-300 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {marginalCount} Flat Spot
                    </span>
                  )}
                  {sagOrReverseCount === 0 && marginalCount === 0 && (
                    <span className="text-emerald-400 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Positive Drainage
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {drainageSegments.map((seg) => (
                  <div
                    key={`${seg.fromStn}-${seg.toStn}-${seg.fromCh}`}
                    className={`rounded-lg border px-3 py-2 text-xs flex flex-col gap-1 ${
                      seg.status === 'reverse-sag'
                        ? 'bg-rose-950/20 border-rose-800/60'
                        : seg.status === 'marginal'
                          ? 'bg-amber-950/20 border-amber-800/60'
                          : 'bg-[#090d16] border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular font-semibold text-slate-200">
                        Stn {seg.fromStn}→{seg.toStn} ({seg.fromCh}–{seg.toCh}m)
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 font-mono-tabular font-semibold ${
                          seg.status === 'reverse-sag'
                            ? 'text-rose-400'
                            : seg.status === 'marginal'
                              ? 'text-amber-300'
                              : 'text-emerald-400'
                        }`}
                      >
                        {seg.flowDirection === 'downhill' && (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        )}
                        {seg.flowDirection === 'uphill' && (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        )}
                        {seg.flowDirection === 'flat' && (
                          <ArrowRight className="w-3.5 h-3.5" />
                        )}
                        {seg.slopePct >= 0 ? '+' : ''}
                        {seg.slopePct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate" title={seg.note}>
                      {seg.note} · ΔRL {seg.dRL >= 0 ? '+' : ''}
                      {seg.dRL.toFixed(3)}m
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
