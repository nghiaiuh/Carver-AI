"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  List,
  MoreHorizontal,
  MoveRight,
  Orbit,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type {
  CanvasCameraDisplayMode,
  CanvasCameraShotSetNode,
  CanvasCameraShotSetState,
  CanvasConnectionKind,
  CanvasMultiAngleCamera,
  ImageHandlePosition,
} from "../../types/canvas";
import { getCanvasNodeVisualScale } from "../../utils/canvasNodePorts";
import { createMultiAngleCamera, getSelectedCamera } from "../../utils/cameraShotHelpers";
import PlanCameraViewport3D from "./PlanCameraViewport3D";

type CanvasCameraShotSetNodeCardProps = {
  node: CanvasCameraShotSetNode;
  selected: boolean;
  isConnectionTarget?: boolean;
  inputImageUrl?: string | null;
  onSelect: (id: string, event?: React.MouseEvent | React.PointerEvent) => void;
  onDragStart: (id: string, event: React.PointerEvent) => void;
  onSelectContextMenu: (id: string, x: number, y: number) => void;
  onUpdateCameraShotSet: (nodeId: string, value: CanvasCameraShotSetState) => void;
  onStartConnection: (
    nodeId: string,
    side: ImageHandlePosition,
    kind: CanvasConnectionKind,
    event: React.PointerEvent<HTMLButtonElement>,
    sourcePortId?: string,
  ) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const orbitPoint = (camera: CanvasMultiAngleCamera) => {
  const rotate = (camera.orbit.rotate * Math.PI) / 180;
  const tilt = (camera.orbit.tilt * Math.PI) / 180;
  return {
    x: 50 + Math.cos(tilt) * Math.sin(rotate) * 42,
    y: 50 - Math.sin(tilt) * 38,
  };
};

function iconButtonClass(active = false) {
  return `grid h-8 w-8 place-items-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canvas-theme-selection-ring)] ${active
    ? "border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-selection-soft)] text-[var(--canvas-theme-selection)]"
    : "border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-text-soft)] hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"}`;
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-medium text-[var(--canvas-theme-text-soft)]">
        <span>{label}</span>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            const next = window.prompt(`${label} (${suffix})`, String(value));
            if (next !== null && Number.isFinite(Number(next))) onChange(clamp(Number(next), min, max));
          }}
          className="text-[11px] text-[var(--canvas-theme-text-muted)] hover:text-[var(--canvas-theme-text)]"
        >
          {Number.isInteger(value) ? value : value.toFixed(1)}{suffix}
        </button>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="multi-angles-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--canvas-theme-border-strong)] accent-[var(--canvas-theme-selection)]"
      />
    </label>
  );
}

export default function CanvasCameraShotSetNodeCard({
  node,
  selected,
  isConnectionTarget = false,
  inputImageUrl,
  onSelect,
  onDragStart,
  onSelectContextMenu,
  onUpdateCameraShotSet,
  onStartConnection,
}: CanvasCameraShotSetNodeCardProps) {
  const scale = getCanvasNodeVisualScale(node);
  const width = node.width * scale;
  const height = node.height * scale;
  const state = node.cameraShotSet;
  const selectedCamera = getSelectedCamera(node);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [cameraManagerOpen, setCameraManagerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [draggedCameraId, setDraggedCameraId] = useState<string | null>(null);
  const frameClass = selected
    ? "border-[var(--canvas-theme-selection)] ring-2 ring-[var(--canvas-theme-selection-ring)]"
    : isConnectionTarget
      ? "border-[var(--canvas-theme-connector-active)] ring-2 ring-[var(--canvas-theme-guide-soft)]"
      : "border-[var(--canvas-theme-border-strong)] hover:border-[var(--canvas-theme-selection)]";

  const visibleCameras = useMemo(() => state.cameras.filter((camera) => {
    if (!camera.isVisible) return false;
    return state.cameraDisplayMode !== "selected-only" || camera.id === selectedCamera?.id;
  }), [selectedCamera?.id, state.cameraDisplayMode, state.cameras]);

  const commit = (next: CanvasCameraShotSetState) => onUpdateCameraShotSet(node.id, next);
  const updateCamera = (cameraId: string, change: (camera: CanvasMultiAngleCamera) => CanvasMultiAngleCamera) => {
    commit({ ...state, cameras: state.cameras.map((camera) => camera.id === cameraId ? change(camera) : camera) });
  };
  const selectCamera = (cameraId: string) => commit({ ...state, selectedCameraId: cameraId });
  const duplicateSelectedCamera = () => {
    const source = selectedCamera ?? createMultiAngleCamera(1);
    const index = state.cameras.length + 1;
    const next = {
      ...source,
      id: createMultiAngleCamera(index).id,
      name: `Camera ${String(index).padStart(2, "0")}`,
      plan: { ...source.plan, u: clamp(source.plan.u + 0.04, 0.06, 0.94), v: clamp(source.plan.v + 0.03, 0.06, 0.94) },
      orbit: { ...source.orbit, rotate: ((source.orbit.rotate + 30 + 180) % 360) - 180 },
    };
    commit({ ...state, cameras: [...state.cameras, next], selectedCameraId: next.id });
  };
  const deleteCamera = (cameraId: string) => {
    if (state.cameras.length <= 1) return;
    const index = state.cameras.findIndex((camera) => camera.id === cameraId);
    const cameras = state.cameras.filter((camera) => camera.id !== cameraId);
    commit({ ...state, cameras, selectedCameraId: cameras[Math.max(0, index - 1)]?.id ?? cameras[0]?.id ?? null });
  };
  const resetCamera = () => {
    if (!selectedCamera) return;
    const replacement = createMultiAngleCamera(state.cameras.findIndex((camera) => camera.id === selectedCamera.id) + 1);
    updateCamera(selectedCamera.id, () => ({ ...replacement, id: selectedCamera.id, name: selectedCamera.name }));
  };
  const renameCamera = (camera: CanvasMultiAngleCamera) => {
    const name = window.prompt("Camera name", camera.name)?.trim();
    if (name) updateCamera(camera.id, (current) => ({ ...current, name }));
  };
  const updateFromPointer = (event: React.PointerEvent<HTMLElement>, kind: "camera" | "target" | "orbit", cameraId?: string) => {
    const camera = cameraId ? state.cameras.find((entry) => entry.id === cameraId) ?? selectedCamera : selectedCamera;
    if (!camera || !viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0.04, 0.96);
    const y = clamp((event.clientY - rect.top) / rect.height, 0.05, 0.95);
    if (kind === "orbit") {
      updateCamera(camera.id, (current) => ({
        ...current,
        orbit: { ...current.orbit, rotate: clamp((x - 0.5) * 360, -180, 180), tilt: clamp((0.5 - y) * 160, -80, 80) },
      }));
      return;
    }
    updateCamera(camera.id, (current) => ({
      ...current,
      plan: kind === "target"
        ? { ...current.plan, targetU: x, targetV: y }
        : { ...current.plan, u: x, v: y },
    }));
  };
  const handleViewportPointerDown = (event: React.PointerEvent<HTMLElement>, kind: "camera" | "target" | "orbit", cameraId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event, kind, cameraId);
  };
  const handleViewportPointerMove = (event: React.PointerEvent<HTMLElement>, kind: "camera" | "target" | "orbit", cameraId?: string) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.stopPropagation();
    updateFromPointer(event, kind, cameraId);
  };
  const hasInput = Boolean(inputImageUrl);

  return (
    <div
      data-canvas-node-id={node.id}
      className="group absolute select-none"
      style={{ left: node.x, top: node.y, width, height, zIndex: selected ? 80 : 5 }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectContextMenu(node.id, event.clientX, event.clientY);
      }}
    >
      <div
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-[20px] border bg-[var(--canvas-theme-surface-panel)] shadow-[0_18px_48px_var(--canvas-theme-shadow)] ${frameClass}`}
        style={{ backgroundColor: "var(--canvas-theme-surface-panel)", opacity: 1 }}
      >
        <header
          className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-4"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect(node.id, event);
            onDragStart(node.id, event);
          }}
        >
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--canvas-theme-selection-soft)] text-[var(--canvas-theme-selection)]"><Orbit className="h-3.5 w-3.5" /></span>
          <span className="text-[15px] font-semibold text-[var(--canvas-theme-text)]">Multi-Angles</span>
          <span className="text-[12px] text-[var(--canvas-theme-text-muted)]">{state.cameras.length} {state.cameras.length === 1 ? "shot" : "shots"}</span>
          <span className="flex-1" />
          <button type="button" aria-label="Add camera" title="Duplicate current camera" onPointerDown={(event) => event.stopPropagation()} onClick={duplicateSelectedCamera} className={iconButtonClass()}><Plus className="h-4 w-4" /></button>
          <div className="relative">
            <button type="button" aria-label="Open camera manager" aria-expanded={cameraManagerOpen} onPointerDown={(event) => event.stopPropagation()} onClick={() => setCameraManagerOpen((open) => !open)} className={iconButtonClass(cameraManagerOpen)}><List className="h-4 w-4" /></button>
            {cameraManagerOpen ? <CameraManager cameras={state.cameras} selectedCameraId={selectedCamera?.id ?? null} onSelect={selectCamera} onDuplicate={duplicateSelectedCamera} onDelete={deleteCamera} onRename={renameCamera} /> : null}
          </div>
          <div className="relative">
            <button type="button" aria-label="More camera options" aria-expanded={moreOpen} onPointerDown={(event) => event.stopPropagation()} onClick={() => setMoreOpen((open) => !open)} className={iconButtonClass(moreOpen)}><MoreHorizontal className="h-4 w-4" /></button>
            {moreOpen ? <OverflowMenu displayMode={state.cameraDisplayMode} onDisplayMode={(cameraDisplayMode) => commit({ ...state, cameraDisplayMode })} onReset={resetCamera} onResetAll={() => commit({ ...state, cameras: state.cameras.map((camera, index) => ({ ...createMultiAngleCamera(index + 1), id: camera.id, name: camera.name })), selectedCameraId: selectedCamera?.id ?? state.cameras[0]?.id ?? null })} /> : null}
          </div>
        </header>

        <div className="flex shrink-0 items-center gap-1 px-5 pb-3">
          {(["plan", "orbit"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={state.mode === mode}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => commit({ ...state, mode })}
              className={`rounded-[10px] border px-4 py-1.5 text-[11px] font-medium transition ${state.mode === mode ? "border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-selection)]" : "border-transparent text-[var(--canvas-theme-text-muted)] hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"}`}
            >
              {mode === "plan" ? "Plan Surface" : "Orbit 360"}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 border-y border-[var(--canvas-theme-border)]">
          <div ref={viewportRef} className="relative min-w-0 flex-[0_0_74%] overflow-hidden bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.035),transparent_68%)]" style={{ backgroundColor: "var(--canvas-theme-surface)" }} onPointerDown={(event) => handleViewportPointerDown(event, state.mode === "plan" ? "camera" : "orbit")} onPointerMove={(event) => handleViewportPointerMove(event, state.mode === "plan" ? "camera" : "orbit")}>
            {hasInput && selectedCamera ? state.mode === "plan"
              ? <PlanSurface inputImageUrl={inputImageUrl!} cameras={visibleCameras} selectedCamera={selectedCamera} onSelect={selectCamera} onUpdateCamera={updateCamera} />
              : <OrbitSurface inputImageUrl={inputImageUrl!} cameras={visibleCameras} selectedCamera={selectedCamera} displayMode={state.cameraDisplayMode} onSelect={selectCamera} onCameraPointerDown={(event, cameraId) => handleViewportPointerDown(event, "orbit", cameraId)} onCameraPointerMove={(event, cameraId) => handleViewportPointerMove(event, "orbit", cameraId)} />
              : <EmptyViewport />}
          </div>
          <div className="flex-1 bg-[var(--canvas-theme-surface-muted)]" style={{ backgroundColor: "var(--canvas-theme-surface-muted)" }}>
            <CameraInspector state={state} selectedCamera={selectedCamera} onSelect={selectCamera} onAdd={duplicateSelectedCamera} onUpdateCamera={updateCamera} />
          </div>
        </div>

        <CameraFilmstrip state={state} inputImageUrl={inputImageUrl ?? null} draggedCameraId={draggedCameraId} onDragStart={setDraggedCameraId} onReorder={(fromId, toId) => {
          const from = state.cameras.findIndex((camera) => camera.id === fromId); const to = state.cameras.findIndex((camera) => camera.id === toId);
          if (from < 0 || to < 0 || from === to) return;
          const cameras = [...state.cameras]; const [moved] = cameras.splice(from, 1); cameras.splice(to, 0, moved!); commit({ ...state, cameras });
        }} onSelect={selectCamera} onDuplicate={duplicateSelectedCamera} onDelete={deleteCamera} onRename={renameCamera} onAdd={duplicateSelectedCamera} />
      </div>

      <span aria-label="Input image connector" className="absolute left-[-16px] top-[calc(100%-61px)] z-20 grid h-8 w-8 place-items-center rounded-full border border-[var(--canvas-theme-handle-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-connection-image)] shadow-[0_8px_18px_var(--canvas-theme-shadow)]"><ImageIcon className="h-3.5 w-3.5" /></span>
      <button type="button" title="Connect multi-angle shots" aria-label="Connect multi-angle shots" className="absolute right-[-16px] top-[45px] z-20 grid h-8 w-8 place-items-center rounded-full border border-[var(--canvas-theme-handle-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-connection-text)] shadow-[0_8px_18px_var(--canvas-theme-shadow)] transition hover:scale-105" onPointerDown={(event) => { event.stopPropagation(); onStartConnection(node.id, "right", "text", event, "camera-shot-set-output-text"); }}><MoveRight className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function EmptyViewport() {
  return <div className="absolute inset-0 grid place-items-center px-8 text-center"><div><ImageIcon className="mx-auto h-5 w-5 text-[var(--canvas-theme-icon-muted)]" /><p className="mt-3 text-[13px] font-medium text-[var(--canvas-theme-text)]">Connect an image to set up camera angles</p><p className="mt-1 text-[11px] leading-4 text-[var(--canvas-theme-text-muted)]">Use a floor plan with Plan Surface or a scene image with Orbit 360.</p></div></div>;
}

function PlanSurface({ inputImageUrl, cameras, selectedCamera, onSelect, onUpdateCamera }: { inputImageUrl: string; cameras: CanvasMultiAngleCamera[]; selectedCamera: CanvasMultiAngleCamera; onSelect: (id: string) => void; onUpdateCamera: (id: string, change: (camera: CanvasMultiAngleCamera) => CanvasMultiAngleCamera) => void; }) {
  return <PlanCameraViewport3D inputImageUrl={inputImageUrl} cameras={cameras} selectedCamera={selectedCamera} onSelect={onSelect} onUpdateCamera={onUpdateCamera} />;
}

function OrbitSurface({ inputImageUrl, cameras, selectedCamera, displayMode, onSelect, onCameraPointerDown, onCameraPointerMove }: { inputImageUrl: string; cameras: CanvasMultiAngleCamera[]; selectedCamera: CanvasMultiAngleCamera; displayMode: CanvasCameraDisplayMode; onSelect: (id: string) => void; onCameraPointerDown: (event: React.PointerEvent<HTMLElement>, cameraId: string) => void; onCameraPointerMove: (event: React.PointerEvent<HTMLElement>, cameraId: string) => void; }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-[2%] h-[96%] w-[96%]" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-[var(--canvas-theme-border-strong)]" strokeOpacity=".45" strokeWidth=".32" />
        <ellipse cx="50" cy="50" rx="42" ry="11" fill="none" stroke="currentColor" className="text-[var(--canvas-theme-border-strong)]" strokeOpacity=".28" strokeWidth=".25" />
        <ellipse cx="50" cy="50" rx="42" ry="24" fill="none" stroke="currentColor" className="text-[var(--canvas-theme-border-strong)]" strokeOpacity=".34" strokeWidth=".25" />
        <ellipse cx="50" cy="50" rx="42" ry="35" fill="none" stroke="currentColor" className="text-[var(--canvas-theme-border-strong)]" strokeOpacity=".22" strokeWidth=".25" />
        <ellipse cx="50" cy="50" rx="13" ry="42" fill="none" stroke="currentColor" className="text-[var(--canvas-theme-border-strong)]" strokeOpacity=".32" strokeWidth=".25" />
        <ellipse cx="50" cy="50" rx="27" ry="42" fill="none" stroke="currentColor" className="text-[var(--canvas-theme-border-strong)]" strokeOpacity=".28" strokeWidth=".25" />
        <ellipse cx="50" cy="50" rx="37" ry="42" fill="none" stroke="currentColor" className="text-[var(--canvas-theme-border-strong)]" strokeOpacity=".18" strokeWidth=".25" />
        <path d="M 50 8 V 92 M 8 50 H 92" stroke="currentColor" className="text-[var(--canvas-theme-border)]" strokeOpacity=".25" strokeWidth=".25" strokeDasharray="1.2 1.8" />
      </svg>

      <span aria-hidden="true" className="absolute left-1/2 top-[5%] grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full bg-[var(--canvas-theme-surface-muted)]/90 text-[var(--canvas-theme-text-muted)]">⌃</span>
      <span aria-hidden="true" className="absolute bottom-[5%] left-1/2 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full bg-[var(--canvas-theme-surface-muted)]/90 text-[var(--canvas-theme-text-muted)]">⌄</span>

      <div className="absolute left-1/2 top-1/2 z-10 h-[39%] w-[45%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-muted)] shadow-[0_12px_28px_rgba(0,0,0,.35)]">
        <img src={inputImageUrl} alt="Connected scene reference" draggable={false} className="h-full w-full object-contain" />
      </div>

      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {cameras.map((camera) => {
          const point = orbitPoint(camera);
          const active = camera.id === selectedCamera.id;
          return (
            <g key={`orbit-guideline-${camera.id}`}>
              <line
                x1={point.x}
                y1={point.y}
                x2="50"
                y2="50"
                stroke="var(--canvas-theme-selection)"
                strokeOpacity={active ? ".8" : ".16"}
                strokeWidth=".38"
                strokeDasharray="1.5 1.4"
              />
              <circle cx={point.x} cy={point.y} r="1" fill="var(--canvas-theme-selection)" fillOpacity={active ? ".9" : ".25"} />
            </g>
          );
        })}
      </svg>

      <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-surface-panel)]" />

      {cameras.map((camera) => {
        const point = orbitPoint(camera);
        const active = camera.id === selectedCamera.id;
        return (
          <button
            key={camera.id}
            type="button"
            aria-label={`Drag ${camera.name} around orbit`}
            className={`absolute z-30 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[13px] border shadow-[0_10px_18px_rgba(0,0,0,.3)] transition ${active ? "border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-text)]" : "border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-text-muted)]"} ${displayMode === "ghost" && !active ? "opacity-30" : ""}`}
            style={{ left: `${point.x}%`, top: `${point.y}%`, transform: "translate(-50%, -50%) rotate(-18deg)" }}
            onPointerDown={(event) => { onSelect(camera.id); onCameraPointerDown(event, camera.id); }}
            onPointerMove={(event) => onCameraPointerMove(event, camera.id)}
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--canvas-theme-text)] text-[var(--canvas-theme-surface-panel)] shadow-sm">
              <Camera className="h-4 w-4" strokeWidth={1.8} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CameraInspector({ state, selectedCamera, onSelect, onAdd, onUpdateCamera }: { state: CanvasCameraShotSetState; selectedCamera: CanvasMultiAngleCamera | null; onSelect: (id: string) => void; onAdd: () => void; onUpdateCamera: (id: string, change: (camera: CanvasMultiAngleCamera) => CanvasMultiAngleCamera) => void; }) {
  if (!selectedCamera) return null;
  const plan = selectedCamera.plan; const orbit = selectedCamera.orbit;
  return (
    <aside className="min-w-[184px] flex-1 overflow-y-auto bg-[var(--canvas-theme-surface-muted)] px-4 py-4">
      <p className="mb-2 text-[11px] font-medium text-[var(--canvas-theme-text-muted)]">Camera</p>
      <label className="relative mb-2 block">
        <select aria-label="Selected camera" value={selectedCamera.id} onChange={(event) => onSelect(event.target.value)} className="h-9 w-full appearance-none rounded-[10px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)] px-3 pr-8 text-[12px] font-medium text-[var(--canvas-theme-text)] outline-none focus:border-[var(--canvas-theme-selection)]">
          {state.cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-[var(--canvas-theme-icon-muted)]" />
      </label>
      <button type="button" onClick={onAdd} className="mb-4 flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--canvas-theme-border)] text-[12px] font-medium text-[var(--canvas-theme-text-soft)] transition hover:bg-[var(--canvas-theme-hover)]"><Plus className="h-3.5 w-3.5" /> Add Camera</button>
      <div className="border-t border-[var(--canvas-theme-border)] pt-4">
        <p className="mb-1 text-[12px] font-medium text-[var(--canvas-theme-text)]">{state.mode === "plan" ? "Plan Control" : "Orbit Control"}</p>
        {state.mode === "plan" ? (
          <div className="space-y-4">
            <p className="mb-3 text-[10px] leading-4 text-[var(--canvas-theme-text-muted)]">Use the viewport gizmo for XYZ position, rotation, and target.</p>
            <RangeControl label="Height" value={plan.height} min={.1} max={30} step={.1} suffix=" m" onChange={(height) => onUpdateCamera(selectedCamera.id, (camera) => ({ ...camera, plan: { ...camera.plan, height } }))} />
            <RangeControl label="Lens" value={plan.lens} min={18} max={70} step={1} suffix=" mm" onChange={(lens) => onUpdateCamera(selectedCamera.id, (camera) => ({ ...camera, plan: { ...camera.plan, lens } }))} />
            <RangeControl label="Pitch" value={plan.pitch} min={-89} max={89} step={1} suffix="°" onChange={(pitch) => onUpdateCamera(selectedCamera.id, (camera) => ({ ...camera, plan: { ...camera.plan, pitch, targetHeight: undefined } }))} />
            <RangeControl label="Roll" value={plan.roll ?? 0} min={-180} max={180} step={1} suffix="°" onChange={(roll) => onUpdateCamera(selectedCamera.id, (camera) => ({ ...camera, plan: { ...camera.plan, roll } }))} />
          </div>
        ) : (
          <div className="space-y-4">
            <RangeControl label="Rotate" value={orbit.rotate} min={-180} max={180} step={1} suffix="°" onChange={(rotate) => onUpdateCamera(selectedCamera.id, (camera) => ({ ...camera, orbit: { ...camera.orbit, rotate } }))} />
            <RangeControl label="Tilt" value={orbit.tilt} min={-80} max={80} step={1} suffix="°" onChange={(tilt) => onUpdateCamera(selectedCamera.id, (camera) => ({ ...camera, orbit: { ...camera.orbit, tilt } }))} />
            <RangeControl label="Distance" value={orbit.distance} min={3} max={15} step={.1} suffix=" m" onChange={(distance) => onUpdateCamera(selectedCamera.id, (camera) => ({ ...camera, orbit: { ...camera.orbit, distance } }))} />
            <div>
              <p className="mb-2 text-[11px] font-medium text-[var(--canvas-theme-text-soft)]">Quick Angles</p>
              <div className="flex gap-1.5">
                {[{ label: "Front", rotate: 0, tilt: 0 }, { label: "Left", rotate: -90, tilt: 0 }, { label: "Right", rotate: 90, tilt: 0 }, { label: "Back", rotate: 180, tilt: 0 }, { label: "Top", rotate: 0, tilt: 65 }].map((preset) => (
                  <button key={preset.label} type="button" title={preset.label} aria-label={`${preset.label} orbit angle`} onClick={() => onUpdateCamera(selectedCamera.id, (camera) => ({ ...camera, orbit: { ...camera.orbit, rotate: preset.rotate, tilt: preset.tilt } }))} className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--canvas-theme-border)] text-[9px] text-[var(--canvas-theme-text-muted)] transition hover:border-[var(--canvas-theme-selection)] hover:text-[var(--canvas-theme-selection)]">{preset.label[0]}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function CameraFilmstrip({ state, inputImageUrl, draggedCameraId, onDragStart, onReorder, onSelect, onDuplicate, onDelete, onRename, onAdd }: { state: CanvasCameraShotSetState; inputImageUrl: string | null; draggedCameraId: string | null; onDragStart: (id: string | null) => void; onReorder: (fromId: string, toId: string) => void; onSelect: (id: string) => void; onDuplicate: () => void; onDelete: (id: string) => void; onRename: (camera: CanvasMultiAngleCamera) => void; onAdd: () => void; }) { return <footer className="shrink-0 px-5 py-3"><div className="mb-2 flex items-center justify-between"><p className="text-[12px] font-medium text-[var(--canvas-theme-text)]">Cameras ({state.cameras.length})</p><span className="text-[10px] text-[var(--canvas-theme-text-muted)]">Drag to reorder</span></div><div className="flex gap-2 overflow-x-auto pb-0.5">{state.cameras.map((camera, index) => <div key={camera.id} draggable onDragStart={() => onDragStart(camera.id)} onDragEnd={() => onDragStart(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedCameraId) onReorder(draggedCameraId, camera.id); onDragStart(null); }} className={`group/thumb relative h-[66px] w-[88px] shrink-0 overflow-hidden rounded-lg border transition ${camera.id === state.selectedCameraId ? "border-[var(--canvas-theme-selection)] shadow-[0_0_0_1px_var(--canvas-theme-selection-soft)]" : "border-[var(--canvas-theme-border)]"}`}><button type="button" aria-label={`Select ${camera.name}`} onClick={() => onSelect(camera.id)} className="absolute inset-0 bg-[var(--canvas-theme-surface-muted)]">{inputImageUrl ? <img src={inputImageUrl} alt="" draggable={false} className="h-full w-full object-cover opacity-75" /> : <span className="grid h-full place-items-center"><Camera className="h-4 w-4 text-[var(--canvas-theme-icon-muted)]" /></span>}<span className="absolute left-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-semibold text-white">{String(index + 1).padStart(2, "0")}</span><span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-left text-[9px] text-white">{camera.name}</span></button><button type="button" aria-label={`Rename ${camera.name}`} onClick={(event) => { event.stopPropagation(); onRename(camera); }} className="absolute right-1 top-1 hidden h-4 w-4 place-items-center rounded bg-black/55 text-white group-hover/thumb:grid"><GripVertical className="h-3 w-3" /></button><div className="absolute right-1 top-6 hidden flex-col gap-0.5 group-hover/thumb:flex"><button type="button" aria-label={`Duplicate ${camera.name}`} onClick={(event) => { event.stopPropagation(); onSelect(camera.id); onDuplicate(); }} className="grid h-4 w-4 place-items-center rounded bg-black/55 text-white"><Copy className="h-2.5 w-2.5" /></button>{state.cameras.length > 1 ? <button type="button" aria-label={`Delete ${camera.name}`} onClick={(event) => { event.stopPropagation(); onDelete(camera.id); }} className="grid h-4 w-4 place-items-center rounded bg-black/55 text-white"><Trash2 className="h-2.5 w-2.5" /></button> : null}</div></div>)}<button type="button" aria-label="Add camera" onClick={onAdd} className="grid h-[66px] w-[72px] shrink-0 place-items-center rounded-lg border border-dashed border-[var(--canvas-theme-border-strong)] text-[var(--canvas-theme-text-muted)] transition hover:border-[var(--canvas-theme-selection)] hover:text-[var(--canvas-theme-selection)]"><Plus className="h-5 w-5" /></button></div></footer>; }

function CameraManager({ cameras, selectedCameraId, onSelect, onDuplicate, onDelete, onRename }: { cameras: CanvasMultiAngleCamera[]; selectedCameraId: string | null; onSelect: (id: string) => void; onDuplicate: () => void; onDelete: (id: string) => void; onRename: (camera: CanvasMultiAngleCamera) => void; }) { return <div className="absolute right-0 top-10 z-40 w-52 rounded-xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] p-1.5 shadow-[0_16px_36px_var(--canvas-theme-shadow)]">{cameras.map((camera) => <div key={camera.id} className={`flex items-center gap-1 rounded-lg px-2 py-1.5 ${camera.id === selectedCameraId ? "bg-[var(--canvas-theme-selection-soft)]" : "hover:bg-[var(--canvas-theme-hover)]"}`}><button type="button" onClick={() => onSelect(camera.id)} className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-[var(--canvas-theme-text)]">{camera.name}</button><button type="button" aria-label={`Rename ${camera.name}`} onClick={() => onRename(camera)} className="text-[var(--canvas-theme-icon-muted)]"><MoreHorizontal className="h-3.5 w-3.5" /></button>{cameras.length > 1 ? <button type="button" aria-label={`Delete ${camera.name}`} onClick={() => onDelete(camera.id)} className="text-[var(--canvas-theme-icon-muted)] hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button> : null}</div>)}<button type="button" onClick={onDuplicate} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-[var(--canvas-theme-text-soft)] hover:bg-[var(--canvas-theme-hover)]"><Copy className="h-3.5 w-3.5" />Duplicate selected</button></div>; }

function OverflowMenu({ displayMode, onDisplayMode, onReset, onResetAll }: { displayMode: CanvasCameraDisplayMode; onDisplayMode: (value: CanvasCameraDisplayMode) => void; onReset: () => void; onResetAll: () => void; }) { const options: Array<{ value: CanvasCameraDisplayMode; label: string; icon: typeof Eye }> = [{ value: "show-all", label: "Show all cameras", icon: Eye }, { value: "ghost", label: "Ghost other cameras", icon: Eye }, { value: "selected-only", label: "Hide other cameras", icon: EyeOff }]; return <div className="absolute right-0 top-10 z-40 w-52 rounded-xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] p-1.5 shadow-[0_16px_36px_var(--canvas-theme-shadow)]">{options.map((option) => { const Icon = option.icon; return <button key={option.value} type="button" onClick={() => onDisplayMode(option.value)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] ${displayMode === option.value ? "bg-[var(--canvas-theme-selection-soft)] text-[var(--canvas-theme-selection)]" : "text-[var(--canvas-theme-text-soft)] hover:bg-[var(--canvas-theme-hover)]"}`}><Icon className="h-3.5 w-3.5" />{option.label}</button>; })}<div className="my-1 border-t border-[var(--canvas-theme-border)]" /><button type="button" onClick={onReset} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--canvas-theme-text-soft)] hover:bg-[var(--canvas-theme-hover)]"><RotateCcw className="h-3.5 w-3.5" />Reset current camera</button><button type="button" onClick={onResetAll} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--canvas-theme-text-soft)] hover:bg-[var(--canvas-theme-hover)]"><RotateCcw className="h-3.5 w-3.5" />Reset all cameras</button></div>; }
