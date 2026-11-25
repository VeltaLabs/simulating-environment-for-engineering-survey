import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalculatedStation,
  DaylightPoint,
  SegmentDrainage
} from '../types/survey';
import { getFGLAtChainage } from '../utils/levelingEngine';

interface ProfileCanvas2DProps {
  stations: CalculatedStation[];
  fglZero: number;
  gradientPct: number;
  daylights: DaylightPoint[];
  drainageSegments: SegmentDrainage[];
  heightClass?: string;
}

interface HoverState {
  px: number;
  py: number;
  chainage: number;
  groundRL: number;
  roadRL: number;
  segmentSlopePct: number | null;
  drainageNote: string | null;
}

export const ProfileCanvas2D: React.FC<ProfileCanvas2DProps> = ({
  stations,
  fglZero,
  gradientPct,
  daylights,
  drainageSegments,
  heightClass = 'h-[360px]'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);

  const validStations = React.useMemo(
    () =>
      [...stations]
        .filter((s) => s.rl !== null && !Number.isNaN(s.rl))
        .sort((a, b) => a.chainage - b.chainage),
    [stations]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    if (validStations.length < 2) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Enter at least 2 valid stations to render profile.', width / 2, height / 2);
      return;
    }

    const minX = validStations[0].chainage;
    const maxX = validStations[validStations.length - 1].chainage;
    const rangeX = maxX - minX || 10;

    const allY = [
      ...validStations.map((s) => s.rl!),
      getFGLAtChainage(minX, fglZero, gradientPct),
      getFGLAtChainage(maxX, fglZero, gradientPct)
    ];

    const rawMinY = Math.min(...allY);
    const rawMaxY = Math.max(...allY);
    const yPad = Math.max(0.8, (rawMaxY - rawMinY) * 0.28);
    const minY = rawMinY - yPad;
    const maxY = rawMaxY + yPad;
    const rangeY = maxY - minY || 4;

    const padLeft = 64;
    const padRight = 28;
    const padTop = 32;
    const padBottom = 46;

    const plotW = Math.max(40, width - padLeft - padRight);
    const plotH = Math.max(40, height - padTop - padBottom);

    const toX = (ch: number) => padLeft + ((ch - minX) / rangeX) * plotW;
    const toY = (rl: number) => padTop + plotH - ((rl - minY) / rangeY) * plotH;

    // 1. Grid & Axes
    ctx.strokeStyle = '#18243b';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "JetBrains Mono", monospace';

    const gridStepX = rangeX > 120 ? 20 : rangeX > 40 ? 10 : 5;
    ctx.textAlign = 'center';
    for (let xVal = Math.ceil(minX / gridStepX) * gridStepX; xVal <= maxX; xVal += gridStepX) {
      const px = toX(xVal);
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, padTop + plotH);
      ctx.stroke();
      ctx.fillText(`Ch ${xVal.toFixed(0)}m`, px, padTop + plotH + 18);
    }

    const gridStepY = rangeY > 10 ? 2 : rangeY > 4 ? 1 : 0.5;
    ctx.textAlign = 'right';
    for (let yVal = Math.floor(minY / gridStepY) * gridStepY; yVal <= maxY; yVal += gridStepY) {
      const py = toY(yVal);
      if (py < padTop - 2 || py > padTop + plotH + 2) continue;
      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(padLeft + plotW, py);
      ctx.stroke();
      ctx.fillText(`${yVal.toFixed(1)}m`, padLeft - 8, py + 4);
    }

    // Plot boundary
    ctx.strokeStyle = '#24344d';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    // 2. Cut & Fill Polygons
    for (let i = 0; i < validStations.length - 1; i++) {
      const s1 = validStations[i];
      const s2 = validStations[i + 1];
      const x1 = s1.chainage;
      const x2 = s2.chainage;
      const dx = x2 - x1;
      if (dx <= 0) continue;

      const e1 = s1.rl!;
      const e2 = s2.rl!;
      const f1 = getFGLAtChainage(x1, fglZero, gradientPct);
      const f2 = getFGLAtChainage(x2, fglZero, gradientPct);
      const d1 = e1 - f1;
      const d2 = e2 - f2;

      if ((d1 >= 0 && d2 >= 0) || (d1 <= 0 && d2 <= 0)) {
        const isCut = d1 >= 0 && d2 >= 0;
        ctx.beginPath();
        ctx.moveTo(toX(x1), toY(e1));
        ctx.lineTo(toX(x2), toY(e2));
        ctx.lineTo(toX(x2), toY(f2));
        ctx.lineTo(toX(x1), toY(f1));
        ctx.closePath();
        ctx.fillStyle = isCut ? 'rgba(244, 63, 94, 0.25)' : 'rgba(16, 185, 129, 0.25)';
        ctx.fill();
        ctx.strokeStyle = isCut ? 'rgba(244, 63, 94, 0.55)' : 'rgba(16, 185, 129, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        const ratio = Math.abs(d1) / (Math.abs(d1) + Math.abs(d2));
        const xCross = x1 + ratio * dx;
        const fCross = getFGLAtChainage(xCross, fglZero, gradientPct);

        ctx.beginPath();
        ctx.moveTo(toX(x1), toY(e1));
        ctx.lineTo(toX(xCross), toY(fCross));
        ctx.lineTo(toX(x1), toY(f1));
        ctx.closePath();
        ctx.fillStyle = d1 > 0 ? 'rgba(244, 63, 94, 0.25)' : 'rgba(16, 185, 129, 0.25)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(toX(xCross), toY(fCross));
        ctx.lineTo(toX(x2), toY(e2));
        ctx.lineTo(toX(x2), toY(f2));
        ctx.closePath();
        ctx.fillStyle = d2 > 0 ? 'rgba(244, 63, 94, 0.25)' : 'rgba(16, 185, 129, 0.25)';
        ctx.fill();
      }
    }

    // 3. Formation Line (FGL)
    ctx.beginPath();
    ctx.moveTo(toX(minX), toY(getFGLAtChainage(minX, fglZero, gradientPct)));
    ctx.lineTo(toX(maxX), toY(getFGLAtChainage(maxX, fglZero, gradientPct)));
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Existing Ground Profile (EGL)
    ctx.beginPath();
    validStations.forEach((s, idx) => {
      const px = toX(s.chainage);
      const py = toY(s.rl!);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 5. Drainage Segment Slope Callouts & Flow Direction Arrows
    ctx.font = '10px "JetBrains Mono", monospace';
    drainageSegments.forEach((seg) => {
      const s1 = validStations.find((s) => s.stn === seg.fromStn && s.chainage === seg.fromCh);
      const s2 = validStations.find((s) => s.stn === seg.toStn && s.chainage === seg.toCh);
      if (!s1 || !s2) return;

      const midX = toX((s1.chainage + s2.chainage) / 2);
      const midY = toY((s1.rl! + s2.rl!) / 2);

      // Only draw segment badges if segment width on screen is wide enough
      const segPxW = toX(s2.chainage) - toX(s1.chainage);
      if (segPxW >= 46) {
        const arrow =
          seg.flowDirection === 'downhill' ? '→' : seg.flowDirection === 'uphill' ? '←' : '—';
        const label = `${seg.slopePct >= 0 ? '+' : ''}${seg.slopePct.toFixed(1)}% ${arrow}`;
        const labelY = Math.max(padTop + 14, midY - 14);

        const metrics = ctx.measureText(label);
        const boxW = metrics.width + 10;
        const boxH = 16;

        ctx.fillStyle =
          seg.status === 'reverse-sag'
            ? 'rgba(244, 63, 94, 0.85)'
            : seg.status === 'marginal'
              ? 'rgba(245, 158, 11, 0.85)'
              : 'rgba(11, 19, 34, 0.85)';
        ctx.strokeStyle =
          seg.status === 'reverse-sag'
            ? '#fb7185'
            : seg.status === 'marginal'
              ? '#fbbf24'
              : '#334155';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.roundRect(midX - boxW / 2, labelY - boxH / 2, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.fillText(label, midX, labelY + 3.5);
      }

      // Highlight Sag Ponding Point at segment start if detected
      if (seg.isSagPointAtStart) {
        const sagX = toX(s1.chainage);
        const sagY = toY(s1.rl!);
        ctx.beginPath();
        ctx.arc(sagX, sagY, 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#fb7185';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // 6. Station Nodes & CP Instrument Icons
    validStations.forEach((s) => {
      const px = toX(s.chainage);
      const py = toY(s.rl!);

      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (s.isCP) {
        ctx.save();
        ctx.translate(px, py - 16);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(-6, 9);
        ctx.moveTo(0, -5);
        ctx.lineTo(0, 9);
        ctx.moveTo(0, -5);
        ctx.lineTo(6, 9);
        ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-5, -8, 10, 3.5);
        ctx.restore();
      }
    });

    // 7. Daylight Crossing Markers
    daylights.forEach((dl) => {
      const px = toX(dl.chainage);
      const py = toY(dl.elevation);
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#a855f7';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    });

    // 8. Hover Crosshair
    if (hoverState && hoverState.px >= padLeft && hoverState.px <= padLeft + plotW) {
      const px = hoverState.px;
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, padTop + plotH);
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.38)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(px, toY(hoverState.groundRL), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, toY(hoverState.roadRL), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
    }
  }, [validStations, fglZero, gradientPct, daylights, drainageSegments, hoverState]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(el);
    return () => observer.disconnect();
  }, [draw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || validStations.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const padLeft = 64;
    const padRight = 28;
    const plotW = rect.width - padLeft - padRight;
    if (px < padLeft || px > padLeft + plotW) {
      setHoverState(null);
      return;
    }

    const minX = validStations[0].chainage;
    const maxX = validStations[validStations.length - 1].chainage;
    const chainage = minX + ((px - padLeft) / plotW) * (maxX - minX);

    let groundRL = validStations[0].rl!;
    let segmentSlopePct: number | null = null;
    let drainageNote: string | null = null;

    for (let i = 0; i < validStations.length - 1; i++) {
      const s1 = validStations[i];
      const s2 = validStations[i + 1];
      if (chainage >= s1.chainage && chainage <= s2.chainage) {
        const dx = s2.chainage - s1.chainage || 1;
        const ratio = (chainage - s1.chainage) / dx;
        groundRL = s1.rl! + ratio * (s2.rl! - s1.rl!);
        const seg = drainageSegments[i];
        if (seg) {
          segmentSlopePct = seg.slopePct;
          drainageNote = seg.note;
        }
        break;
      }
    }

    const roadRL = getFGLAtChainage(chainage, fglZero, gradientPct);
    setHoverState({ px, py, chainage, groundRL, roadRL, segmentSlopePct, drainageNote });
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${heightClass} bg-[#070b12] border border-slate-800 rounded-lg overflow-hidden`}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverState(null)}
        className="w-full h-full block cursor-crosshair"
      />
      {hoverState && (
        <div
          className="pointer-events-none absolute z-20 bg-[#0b1322]/95 border border-sky-500/60 rounded-md px-3 py-2 text-xs font-mono-tabular text-slate-100 shadow-lg whitespace-nowrap"
          style={{
            left: Math.min(
              (containerRef.current?.clientWidth ?? 400) - 210,
              Math.max(12, hoverState.px + 14)
            ),
            top: Math.max(12, hoverState.py - 18)
          }}
        >
          <div className="font-semibold text-sky-400 mb-1">
            Ch {hoverState.chainage.toFixed(2)} m
          </div>
          <div>Ground RL: {hoverState.groundRL.toFixed(3)} m</div>
          <div>Formation RL: {hoverState.roadRL.toFixed(3)} m</div>
          <div
            className={`mt-1 font-semibold ${
              hoverState.groundRL - hoverState.roadRL >= 0 ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {hoverState.groundRL - hoverState.roadRL >= 0
              ? `CUT: ${(hoverState.groundRL - hoverState.roadRL).toFixed(3)} m`
              : `FILL: ${Math.abs(hoverState.groundRL - hoverState.roadRL).toFixed(3)} m`}
          </div>
          {hoverState.segmentSlopePct !== null && (
            <div className="text-[11px] text-slate-400 mt-1 border-t border-slate-800 pt-1">
              Ground Slope: {hoverState.segmentSlopePct >= 0 ? '+' : ''}
              {hoverState.segmentSlopePct.toFixed(2)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
};
