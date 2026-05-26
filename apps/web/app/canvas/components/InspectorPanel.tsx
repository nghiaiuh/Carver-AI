"use client";

import { Camera, MapPin, SlidersHorizontal, Trash2, Zap } from "lucide-react";
import NextImage from "next/image";
import {
  aiStatusNote,
  budgetOptions,
  CanvasMarker,
  CanvasNode,
  CanvasObject,
  CanvasRegion,
  GenerationStatus,
  projectTypes,
  Selection,
  Source,
  SourceMix,
  styleOptions,
  outputOptions,
} from "../data/canvasData";
import SourceMixPanel from "./SourceMixPanel";

type InspectorPanelProps = {
  selection: Selection;
  status: GenerationStatus;
  sourceMix: SourceMix;
  nodes: CanvasNode[];
  sources: Source[];
  markers: CanvasMarker[];
  regions: CanvasRegion[];
  objects: CanvasObject[];
  onGenerate: () => void;
  onSelectMixRole: (role: keyof Omit<SourceMix, "instruction">) => void;
  onRemoveSelected: () => void;
};

export default function InspectorPanel({
  selection,
  status,
  sourceMix,
  nodes,
  sources,
  markers,
  regions,
  objects,
  onGenerate,
  onSelectMixRole,
  onRemoveSelected,
}: InspectorPanelProps) {
  return (
    <aside className="flex w-[360px] h-full shrink-0 flex-col border-l border-[#E5E7EB] bg-white overflow-hidden">
      <div className="border-b border-[#E5E7EB] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-[#0A0A0A]">Inspector</p>
            <p className="mt-1 text-xs font-semibold text-[#667085]">{status}</p>
          </div>
          <span className="rounded-full bg-[#F2F4F7] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#667085]">{aiStatusNote}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {selection.type === "none" ? (
          <DefaultInspector status={status} sourceMix={sourceMix} onGenerate={onGenerate} onSelectMixRole={onSelectMixRole} />
        ) : null}
        {selection.type === "source-mix" ? (
          <MixInspector role={selection.role} sourceMix={sourceMix} />
        ) : null}
        {selection.type === "node" ? (
          <NodeInspector node={nodes.find((node) => node.id === selection.id)} sources={sources} onRemove={onRemoveSelected} />
        ) : null}
        {selection.type === "marker" ? (
          <MarkerInspector marker={markers.find((marker) => marker.id === selection.id)} onRemove={onRemoveSelected} />
        ) : null}
        {selection.type === "region" ? (
          <RegionInspector region={regions.find((region) => region.id === selection.id)} onRemove={onRemoveSelected} />
        ) : null}
        {selection.type === "object" ? (
          <ObjectInspector object={objects.find((object) => object.id === selection.id)} onRemove={onRemoveSelected} />
        ) : null}
        {selection.type === "recipe" ? (
          <RecipeInspector />
        ) : null}
      </div>
    </aside>
  );
}

function DefaultInspector({
  status,
  sourceMix,
  onGenerate,
  onSelectMixRole,
}: {
  status: GenerationStatus;
  sourceMix: SourceMix;
  onGenerate: () => void;
  onSelectMixRole: (role: keyof Omit<SourceMix, "instruction">) => void;
}) {
  return (
    <div className="grid gap-4">
      <PanelTitle title="AI Generation Setup" copy="Visual controls first, prompt second." />
      <Segment title="Project Type" items={projectTypes} active="Garden" />
      <Segment title="Style" items={styleOptions} active="Vietnamese Courtyard" />
      <Segment title="Budget" items={budgetOptions} active="Premium" />
      <Segment title="Output" items={outputOptions} active="3 variations" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#98A2B3]">Preserve</p>
        {["Keep house unchanged", "Keep walkway unchanged", "Keep pond position", "Respect floorplan", "Low maintenance planting"].map((item, index) => (
          <label key={item} className="mb-3 flex items-center justify-between last:mb-0">
            <span className="text-sm font-bold text-[#111827]">{item}</span>
            <input type="checkbox" defaultChecked={index < 3} className="h-4 w-4 accent-[#111827]" />
          </label>
        ))}
      </div>
      <SourceMixPanel mix={sourceMix} compact onSelectRole={onSelectMixRole} />
      <button onClick={onGenerate} className="rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white">
        {status === "Generating" ? "Generating..." : "Generate Concept"}
      </button>
    </div>
  );
}

function NodeInspector({ node, sources, onRemove }: { node?: CanvasNode; sources: Source[]; onRemove: () => void }) {
  if (!node) return null;
  const source = node.sourceId ? sources.find((item) => item.id === node.sourceId) : undefined;
  return (
    <div className="grid gap-4">
      <PanelTitle title={node.title} copy={source?.type ?? "Generated output"} />
      {source?.thumbnail ? (
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB]">
          <div className="relative h-32 w-full bg-[#F7F8FA]">
            <NextImage
              src={source.thumbnail}
              alt={source.name}
              fill
              className="object-cover"
              sizes="360px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute bottom-3 left-3 flex gap-2">
              <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#111827] backdrop-blur">
                {source.type}
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur"
                style={{ background: source.accent }}
              >
                {source.role}
              </span>
            </div>
          </div>
          {/* Feature highlights */}
          <div className="grid grid-cols-2 divide-x divide-[#E5E7EB] border-t border-[#E5E7EB]">
            <div className="flex flex-col items-center gap-1 p-3 text-center">
              <Camera className="h-4 w-4 text-[#6D5DFB]" aria-hidden="true" />
              <p className="text-[10px] font-black uppercase tracking-wide text-[#667085]">Multi-Angle</p>
              <p className="text-[10px] font-semibold text-[#98A2B3]">4 camera views</p>
            </div>
            <div className="flex flex-col items-center gap-1 p-3 text-center">
              <MapPin className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
              <p className="text-[10px] font-black uppercase tracking-wide text-[#667085]">Marker</p>
              <p className="text-[10px] font-semibold text-[#98A2B3]">Drag to place</p>
            </div>
          </div>
        </div>
      ) : null}
      {source ? (
        <>
          <Field label="Source type" value={source.type} />
          <Segment title="Role in generation" items={["Layout source", "Style source", "Material source", "Object source"]} active={`${source.role[0].toUpperCase()}${source.role.slice(1)} source`} />
          <Slider label="Influence" value={82} />
        </>
      ) : (
        <>
          <Field label="Output role" value="Primary concept target" />
          <Field label="Status" value="Concept created from connected sources" />
        </>
      )}
      <DangerButton onClick={onRemove} label="Remove source" />
    </div>
  );
}

function MarkerInspector({ marker, onRemove }: { marker?: CanvasMarker; onRemove: () => void }) {
  if (!marker) return null;
  return (
    <div className="grid gap-4">
      <PanelTitle title={marker.name} copy="Position marker" />
      {/* Marker visual demo */}
      <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#FFFBEB]">
        <div className="flex items-center gap-3 p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F59E0B]/15">
            <MapPin className="h-5 w-5 text-[#F59E0B]" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-black text-[#111827]">Marker placed on canvas</p>
            <p className="text-xs font-semibold text-[#92400E]">AI will focus generation here</p>
          </div>
        </div>
        <div className="border-t border-[#FDE68A] bg-[#FFFDE7] px-4 py-2">
          <p className="text-[11px] font-semibold text-[#92400E]">💡 Tip: Use markers to place koi ponds, trees, or focal objects at exact positions.</p>
        </div>
      </div>
      <Field label="Instruction" value={marker.instruction} />
      <Field label="Object type" value={marker.objectType} />
      <Segment title="Priority" items={["Low", "Medium", "High"]} active={marker.priority} />
      {/* Multi-angle feature promo */}
      <div className="overflow-hidden rounded-2xl border border-[#E0E7FF] bg-[#F4F3FF]">
        <div className="flex items-center gap-3 p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#6D5DFB]/15">
            <Camera className="h-5 w-5 text-[#6D5DFB]" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-black text-[#111827]">Multi-Angle Views</p>
            <p className="text-xs font-semibold text-[#6D5DFB]">Generate 4 camera angles</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1 border-t border-[#E0E7FF] p-3">
          {["Front", "Eye-level", "Top", "Night"].map((angle) => (
            <div key={angle} className="flex flex-col items-center gap-1 rounded-xl bg-white/60 p-2">
              <Camera className="h-3 w-3 text-[#6D5DFB]" aria-hidden="true" />
              <p className="text-[9px] font-black text-[#6D5DFB]">{angle}</p>
            </div>
          ))}
        </div>
      </div>
      <button className="rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white">Attach to prompt</button>
      <DangerButton onClick={onRemove} label="Remove marker" />
    </div>
  );
}

function RegionInspector({ region, onRemove }: { region?: CanvasRegion; onRemove: () => void }) {
  if (!region) return null;
  return (
    <div className="grid gap-4">
      <PanelTitle title={region.label} copy="Region control" />
      <Segment title="Region type" items={["Editable area", "Locked area", "Replace area"]} active={region.type} />
      <Field label="Instruction" value={region.instruction} />
      <label className="flex items-center justify-between rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <span className="text-sm font-bold text-[#111827]">Preserve boundaries</span>
        <input type="checkbox" defaultChecked className="h-4 w-4 accent-[#111827]" />
      </label>
      <button className="rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white">Use as AI edit area</button>
      <DangerButton onClick={onRemove} label="Remove region" />
    </div>
  );
}

function ObjectInspector({ object, onRemove }: { object?: CanvasObject; onRemove: () => void }) {
  if (!object) return null;
  return (
    <div className="grid gap-4">
      <PanelTitle title={object.label} copy="Object controls" />
      <Field label="Object type" value={object.type} />
      <Slider label="X position" value={Math.round(object.x / 10)} />
      <Slider label="Y position" value={Math.round(object.y / 10)} />
      <Slider label="Rotation" value={Math.abs(object.rotation) + 12} />
      <Slider label="Scale" value={Math.round(object.scale * 70)} />
      <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-4 text-sm font-semibold text-[#667085]">
        Move, rotate, and scale handles are visible on the selected object.
      </div>
      <DangerButton onClick={onRemove} label="Remove object" />
    </div>
  );
}

function MixInspector({ role, sourceMix }: { role: keyof Omit<SourceMix, "instruction">; sourceMix: SourceMix }) {
  return (
    <div className="grid gap-4">
      <PanelTitle title={`Source Mix: ${role}`} copy="This role tells Carver how to use the selected source." />
      <Field label="Assigned source" value={sourceMix[role]} />
      <Slider label="Role strength" value={86} />
      <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-4 text-sm font-semibold text-[#667085]">
        Carver combines role-specific sources instead of guessing from one image.
      </div>
    </div>
  );
}

function RecipeInspector() {
  return (
    <div className="grid gap-4">
      <PanelTitle title="Command Recipe" copy="A preset instruction for faster visual editing." />
      <div className="rounded-2xl border border-[#E5E7EB] bg-[#F4F3FF] p-4 text-sm font-semibold text-[#111827]">
        Recipe applied to the prompt bar. Adjust regions or markers before generating.
      </div>
      {/* Feature highlights row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-3 text-center">
          <Camera className="h-4 w-4 text-[#6D5DFB]" aria-hidden="true" />
          <p className="text-[10px] font-black text-[#667085]">Multi-Angle</p>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-3 text-center">
          <MapPin className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
          <p className="text-[10px] font-black text-[#667085]">Markers</p>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-3 text-center">
          <Zap className="h-4 w-4 text-[#16A34A]" aria-hidden="true" />
          <p className="text-[10px] font-black text-[#667085]">AI Gen</p>
        </div>
      </div>
    </div>
  );
}

function PanelTitle({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-4">
      <SlidersHorizontal className="h-5 w-5 text-[#6D5DFB]" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-black text-[#0A0A0A]">{title}</h2>
      <p className="mt-1 text-sm font-semibold text-[#667085]">{copy}</p>
    </div>
  );
}

function Segment({ title, items, active }: { title: string; items: string[]; active: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#98A2B3]">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button key={item} className={`rounded-full px-3 py-1.5 text-xs font-black ${active === item ? "bg-[#111827] text-white" : "bg-[#F7F8FA] text-[#667085]"}`}>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#98A2B3]">{label}</p>
      <p className="mt-2 text-sm font-bold leading-6 text-[#111827]">{value}</p>
    </div>
  );
}

function Slider({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#98A2B3]">{label}</p>
        <span className="text-xs font-black text-[#111827]">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-[#F2F4F7]">
        <div className="h-full rounded-full bg-[#6D5DFB]" style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function DangerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-600">
      <Trash2 className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
