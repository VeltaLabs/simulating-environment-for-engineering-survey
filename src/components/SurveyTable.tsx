import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Columns3,
  Plus,
  Trash2
} from 'lucide-react';
import {
  ArithmeticCheckResult,
  CalculatedStation,
  LevelingMethod,
  SurveyRow
} from '../types/survey';

interface SurveyTableProps {
  bmRL: number;
  onBmRLChange: (val: number) => void;
  method: LevelingMethod;
  onMethodChange: (method: LevelingMethod) => void;
  useCrossOffsets: boolean;
  onToggleCrossOffsets: () => void;
  stations: CalculatedStation[];
  check: ArithmeticCheckResult;
  onUpdateRow: (index: number, field: keyof SurveyRow, value: string) => void;
  onAddRow: () => void;
  onDeleteRow: (index: number) => void;
}

const formatNum = (val: number | null | undefined, digits = 3): string => {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return val.toFixed(digits);
};

export const SurveyTable: React.FC<SurveyTableProps> = ({
  bmRL,
  onBmRLChange,
  method,
  onMethodChange,
  useCrossOffsets,
  onToggleCrossOffsets,
  stations,
  check,
  onUpdateRow,
  onAddRow,
  onDeleteRow
}) => {
  const [rowLimitNotice, setRowLimitNotice] = useState(false);

  const handleDelete = (index: number) => {
    if (stations.length <= 2) {
      setRowLimitNotice(true);
      window.setTimeout(() => setRowLimitNotice(false), 2600);
      return;
    }
    onDeleteRow(index);
  };

  return (
    <section className="bg-[#111a2c] border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col gap-4">
      {/* Header + Method Segmented Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            Optical Surveying Field Sheet
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {method === 'hi'
              ? 'Height of Instrument (HI = RL + BS · RL = HI - Sight)'
              : 'Rise & Fall Reduction (Δ = Prev Reading - Curr Reading)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center p-1 bg-[#090d16] border border-slate-800 rounded-lg"
            role="group"
            aria-label="Leveling reduction method"
          >
            <button
              type="button"
              onClick={() => onMethodChange('hi')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                method === 'hi'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              HI / Collimation
            </button>
            <button
              type="button"
              onClick={() => onMethodChange('rise_fall')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                method === 'rise_fall'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rise &amp; Fall
            </button>
          </div>

          <button
            type="button"
            onClick={onAddRow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-sky-400" />
            Add Station
          </button>
        </div>
      </div>

      {/* Benchmark & Cross-Section Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0b1322] border border-slate-800/90 rounded-lg px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <label
            htmlFor="bmInput"
            className="text-xs font-medium text-slate-300 whitespace-nowrap"
          >
            Starting Benchmark (BM) RL:
          </label>
          <input
            id="bmInput"
            type="number"
            step="0.001"
            value={Number.isFinite(bmRL) ? bmRL : 100}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              onBmRLChange(Number.isFinite(parsed) ? parsed : 100.0);
            }}
            className="w-28 bg-[#090d16] border border-slate-700 focus:border-sky-400 rounded-md px-2.5 py-1 text-sm font-semibold text-sky-400 font-mono-tabular outline-none"
          />
          <span className="text-xs text-slate-400 font-mono-tabular">m</span>
        </div>

        <button
          type="button"
          onClick={onToggleCrossOffsets}
          title="Toggle Left/Right corridor edge ground RL offsets for 3D multi-strip meshing"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            useCrossOffsets
              ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
              : 'bg-[#090d16] border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Columns3 className="w-3.5 h-3.5" />
          <span>{useCrossOffsets ? 'Cross-Offsets L/R: On' : 'Cross-Offsets L/R: Off'}</span>
        </button>
      </div>

      {rowLimitNotice && (
        <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>At least 2 survey stations are required to define a ground profile.</span>
        </div>
      )}

      {/* Field Sheet Table */}
      <div className="survey-scroll overflow-x-auto max-h-[430px] overflow-y-auto border border-slate-800 rounded-lg bg-[#090d16]">
        <table className="w-full border-collapse text-xs text-right">
          <thead className="sticky top-0 z-10 bg-[#0d1524] text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-2 text-center font-semibold w-12">Stn</th>
              <th className="py-2.5 px-2 font-semibold w-20">Ch (m)</th>
              <th className="py-2.5 px-2 font-semibold w-20">BS (m)</th>
              <th className="py-2.5 px-2 font-semibold w-20">IS (m)</th>
              <th className="py-2.5 px-2 font-semibold w-20">FS (m)</th>
              {method === 'hi' ? (
                <th className="py-2.5 px-2 font-semibold w-24 text-sky-300">HI (m)</th>
              ) : (
                <>
                  <th className="py-2.5 px-2 font-semibold w-20 text-emerald-300">Rise (+)</th>
                  <th className="py-2.5 px-2 font-semibold w-20 text-rose-300">Fall (-)</th>
                </>
              )}
              <th className="py-2.5 px-2 font-semibold w-24 text-slate-100">RL (m)</th>
              {useCrossOffsets && (
                <>
                  <th
                    className="py-2.5 px-2 font-semibold w-20 text-cyan-300"
                    title="Left edge ground elevation delta relative to centerline RL"
                  >
                    L ΔRL
                  </th>
                  <th
                    className="py-2.5 px-2 font-semibold w-20 text-cyan-300"
                    title="Right edge ground elevation delta relative to centerline RL"
                  >
                    R ΔRL
                  </th>
                </>
              )}
              <th className="py-2.5 px-2.5 text-left font-semibold min-w-[120px]">Remarks</th>
              <th className="py-2.5 px-1.5 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 font-mono-tabular">
            {stations.map((stn, idx) => (
              <tr
                key={stn.id}
                className={`transition-colors ${
                  stn.hasWarning
                    ? 'bg-rose-950/20 hover:bg-rose-950/30'
                    : stn.isCP
                      ? 'bg-amber-950/15 hover:bg-amber-950/25'
                      : 'hover:bg-sky-950/20'
                }`}
              >
                <td className="p-1.5 text-center">
                  <input
                    type="number"
                    aria-label={`Station ${stn.stn}`}
                    value={stn.stn}
                    onChange={(e) => onUpdateRow(idx, 'stn', e.target.value)}
                    className="w-11 text-center bg-transparent hover:bg-[#0f172a] focus:bg-[#0f172a] border border-transparent focus:border-sky-400 rounded px-1 py-1 text-slate-200 outline-none"
                  />
                </td>
                <td className="p-1.5">
                  <input
                    type="number"
                    step="1"
                    aria-label={`Chainage for station ${stn.stn}`}
                    value={stn.chainage}
                    onChange={(e) => onUpdateRow(idx, 'chainage', e.target.value)}
                    className="w-full text-right bg-transparent hover:bg-[#0f172a] focus:bg-[#0f172a] border border-transparent focus:border-sky-400 rounded px-1.5 py-1 text-slate-200 outline-none"
                  />
                </td>
                <td className="p-1.5">
                  <input
                    type="number"
                    step="0.001"
                    placeholder="—"
                    aria-label={`BS for station ${stn.stn}`}
                    value={stn.bs ?? ''}
                    onChange={(e) => onUpdateRow(idx, 'bs', e.target.value)}
                    className="w-full text-right bg-transparent hover:bg-[#0f172a] focus:bg-[#0f172a] border border-transparent focus:border-sky-400 rounded px-1.5 py-1 text-slate-100 placeholder:text-slate-600 outline-none"
                  />
                </td>
                <td className="p-1.5">
                  <input
                    type="number"
                    step="0.001"
                    placeholder="—"
                    aria-label={`IS for station ${stn.stn}`}
                    value={stn.is ?? ''}
                    onChange={(e) => onUpdateRow(idx, 'is', e.target.value)}
                    className="w-full text-right bg-transparent hover:bg-[#0f172a] focus:bg-[#0f172a] border border-transparent focus:border-sky-400 rounded px-1.5 py-1 text-slate-100 placeholder:text-slate-600 outline-none"
                  />
                </td>
                <td className="p-1.5">
                  <input
                    type="number"
                    step="0.001"
                    placeholder="—"
                    aria-label={`FS for station ${stn.stn}`}
                    value={stn.fs ?? ''}
                    onChange={(e) => onUpdateRow(idx, 'fs', e.target.value)}
                    className="w-full text-right bg-transparent hover:bg-[#0f172a] focus:bg-[#0f172a] border border-transparent focus:border-sky-400 rounded px-1.5 py-1 text-slate-100 placeholder:text-slate-600 outline-none"
                  />
                </td>

                {method === 'hi' ? (
                  <td className="p-2 font-semibold text-sky-400">{formatNum(stn.hi)}</td>
                ) : (
                  <>
                    <td className="p-2 font-semibold text-emerald-400">
                      {stn.rise !== null && stn.rise > 0 ? `+${stn.rise.toFixed(3)}` : '—'}
                    </td>
                    <td className="p-2 font-semibold text-rose-400">
                      {stn.fall !== null && stn.fall > 0 ? `-${stn.fall.toFixed(3)}` : '—'}
                    </td>
                  </>
                )}

                <td className="p-2 font-bold text-white">{formatNum(stn.rl)}</td>

                {useCrossOffsets && (
                  <>
                    <td className="p-1.5">
                      <input
                        type="number"
                        step="0.05"
                        placeholder="0.00"
                        aria-label={`Left offset for station ${stn.stn}`}
                        value={stn.leftDeltaRL ?? ''}
                        onChange={(e) => onUpdateRow(idx, 'leftDeltaRL', e.target.value)}
                        className="w-full text-right bg-transparent hover:bg-[#0f172a] focus:bg-[#0f172a] border border-transparent focus:border-sky-400 rounded px-1 py-1 text-cyan-300 placeholder:text-slate-600 outline-none"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        step="0.05"
                        placeholder="0.00"
                        aria-label={`Right offset for station ${stn.stn}`}
                        value={stn.rightDeltaRL ?? ''}
                        onChange={(e) => onUpdateRow(idx, 'rightDeltaRL', e.target.value)}
                        className="w-full text-right bg-transparent hover:bg-[#0f172a] focus:bg-[#0f172a] border border-transparent focus:border-sky-400 rounded px-1 py-1 text-cyan-300 placeholder:text-slate-600 outline-none"
                      />
                    </td>
                  </>
                )}

                <td className="p-1.5 text-left">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      aria-label={`Remarks for station ${stn.stn}`}
                      value={stn.remarks}
                      onChange={(e) => onUpdateRow(idx, 'remarks', e.target.value)}
                      className="w-full min-w-[90px] bg-transparent hover:bg-[#0f172a] focus:bg-[#0f172a] border border-transparent focus:border-sky-400 rounded px-1.5 py-1 text-slate-300 font-sans outline-none"
                    />
                    {stn.isCP && (
                      <span className="text-[11px] font-semibold text-amber-400 shrink-0">
                        CP
                      </span>
                    )}
                    {stn.hasWarning && (
                      <span
                        title={stn.warningMessage}
                        className="text-rose-400 shrink-0"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleDelete(idx)}
                    title="Delete station"
                    className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Leveling Arithmetic Check */}
      <div className="bg-[#0b1322] border border-slate-800 rounded-lg p-3.5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-200">
            Arithmetic Closure Verification
          </span>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
              check.isCheckPassed ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {check.isCheckPassed ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Arithmetic Check Passed</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  Discrepancy Detected (Δ {check.discrepancyBSFS >= 0 ? '+' : ''}
                  {check.discrepancyBSFS.toFixed(3)} m)
                </span>
              </>
            )}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono-tabular">
          <div className="bg-[#090d16] border border-slate-800/90 rounded-md p-2">
            <div className="text-[11px] font-sans text-slate-400">Sum BS (ΣBS)</div>
            <div className="text-sm font-semibold text-slate-100 mt-0.5">
              {check.totalBS.toFixed(3)}
            </div>
          </div>
          <div className="bg-[#090d16] border border-slate-800/90 rounded-md p-2">
            <div className="text-[11px] font-sans text-slate-400">Sum FS (ΣFS)</div>
            <div className="text-sm font-semibold text-slate-100 mt-0.5">
              {check.totalFS.toFixed(3)}
            </div>
          </div>
          <div className="bg-[#090d16] border border-slate-800/90 rounded-md p-2">
            <div className="text-[11px] font-sans text-slate-400">ΣBS − ΣFS</div>
            <div className="text-sm font-semibold text-sky-400 mt-0.5">
              {check.diffBSFS >= 0 ? '+' : ''}
              {check.diffBSFS.toFixed(3)}
            </div>
          </div>
          <div className="bg-[#090d16] border border-slate-800/90 rounded-md p-2">
            <div className="text-[11px] font-sans text-slate-400">Last RL − First RL</div>
            <div
              className={`text-sm font-semibold mt-0.5 ${
                check.isCheckPassed ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {check.diffRL >= 0 ? '+' : ''}
              {check.diffRL.toFixed(3)}
            </div>
          </div>
        </div>

        {method === 'rise_fall' && (
          <div className="grid grid-cols-3 gap-2.5 font-mono-tabular">
            <div className="bg-[#090d16] border border-slate-800/90 rounded-md p-2">
              <div className="text-[11px] font-sans text-slate-400">Sum Rise (ΣRise)</div>
              <div className="text-sm font-semibold text-emerald-400 mt-0.5">
                +{check.totalRise.toFixed(3)}
              </div>
            </div>
            <div className="bg-[#090d16] border border-slate-800/90 rounded-md p-2">
              <div className="text-[11px] font-sans text-slate-400">Sum Fall (ΣFall)</div>
              <div className="text-sm font-semibold text-rose-400 mt-0.5">
                -{check.totalFall.toFixed(3)}
              </div>
            </div>
            <div className="bg-[#090d16] border border-slate-800/90 rounded-md p-2">
              <div className="text-[11px] font-sans text-slate-400">ΣRise − ΣFall</div>
              <div className="text-sm font-semibold text-sky-400 mt-0.5">
                {check.diffRiseFall >= 0 ? '+' : ''}
                {check.diffRiseFall.toFixed(3)}
              </div>
            </div>
          </div>
        )}

        {check.structuralErrors.length > 0 && (
          <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded-md px-3 py-2 space-y-1">
            {check.structuralErrors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-slate-400 font-mono-tabular">
          {method === 'hi'
            ? 'Check rule: ΣBS − ΣFS = Last RL − First RL'
            : 'Check rule: ΣBS − ΣFS = ΣRise − ΣFall = Last RL − First RL'}
        </p>
      </div>
    </section>
  );
};
