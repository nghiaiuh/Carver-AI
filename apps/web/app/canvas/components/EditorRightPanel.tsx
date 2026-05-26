"use client";

import { Camera, Gauge, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import type { AddedObject, EditorTool, Marker, Region, SelectedItem } from "./CanvasWorkspace";

type EditorRightPanelProps = {
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  markers: Marker[];
  regions: Region[];
  addedObjects: AddedObject[];
  promptText: string;
  onPromptChange: (value: string) => void;
  onQuickEdit: () => void;
  onMultiAngle: () => void;
  onRealityCheck: () => void;
  onGenerate: () => void;
  onRemoveSelected: () => void;
};

export default function EditorRightPanel({
  selectedItem,
  activeTool,
  markers,
  regions,
  addedObjects,
  promptText,
  onPromptChange,
  onQuickEdit,
  onMultiAngle,
  onRealityCheck,
  onGenerate,
  onRemoveSelected,
}: EditorRightPanelProps) {
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] p-4">
        <p className="text-sm font-black text-[#0A0A0A]">Inspector</p>
        <p className="mt-1 text-xs font-semibold text-[#667085]">Active tool: {activeTool.replaceAll("-", " ")}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {selectedItem.type === "none" ? (
          <DefaultPanel promptText={promptText} onPromptChange={onPromptChange} onGenerate={onGenerate} />
        ) : null}
        {selectedItem.type === "image" || selectedItem.type === "reference" ? (
          <ImagePanel
            label={selectedItem.type === "image" ? "Main Image" : "Reference Image"}
            onQuickEdit={onQuickEdit}
            onMultiAngle={onMultiAngle}
            onRealityCheck={onRealityCheck}
            onGenerate={onGenerate}
          />
        ) : null}
        {selectedItem.type === "marker" ? (
          <MarkerPanel marker={markers.find((marker) => marker.id === selectedItem.id)} onRemove={onRemoveSelected} />
        ) : null}
        {selectedItem.type === "region" ? (
          <RegionPanel region={regions.find((region) => region.id === selectedItem.id)} onRemove={onRemoveSelected} />
        ) : null}
        {selectedItem.type === "object" ? (
          <ObjectPanel object={addedObjects.find((object) => object.id === selectedItem.id)} onRemove={onRemoveSelected} />
        ) : null}
      </div>
    </aside>
  );
}

function DefaultPanel({ promptText, onPromptChange, onGenerate }: { promptText: string; onPromptChange: (value: string) => void; onGenerate: () => void }) {
  return (
    <div className="grid gap-4">
      <PanelHeader title="AI Edit Setup" copy="Select the image to reveal contextual tools, or use the dock below the canvas." />
      <textarea
        value={promptText}
        onChange={(event) => onPromptChange(event.target.value)}
        className="min-h-32 rounded-3xl border border-[#E5E7EB] bg-[#F7F8FA] p-4 text-sm font-semibold text-[#111827] outline-none focus:border-[#6D5DFB] focus:ring-4 focus:ring-[#6D5DFB]/10"
        placeholder="Add a small koi pond here, keep the house unchanged..."
      />
      <div className="grid gap-2">
        {["Keep layout", "Add koi pond", "Add waterfall", "Low maintenance", "Generate 3 angles"].map((chip) => (
          <button key={chip} onClick={() => onPromptChange(promptText ? `${promptText} ${chip}.` : `${chip}.`)} className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-left text-xs font-black text-[#667085] hover:bg-[#F7F8FA]">
            {chip}
          </button>
        ))}
      </div>
      <button onClick={onGenerate} className="rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white">Generate Concept</button>
    </div>
  );
}

function ImagePanel({ label, onQuickEdit, onMultiAngle, onRealityCheck, onGenerate }: { label: string; onQuickEdit: () => void; onMultiAngle: () => void; onRealityCheck: () => void; onGenerate: () => void }) {
  return (
    <div className="grid gap-4">
      <PanelHeader title={label} copy="Contextual controls are also available above the selected image." />
      <InfoRow label="Type" value={label === "Main Image" ? "Site Photo" : "Object Reference"} />
      <InfoRow label="Size" value={label === "Main Image" ? "1522 × 1146" : "640 × 480"} />
      <ActionButton icon={Sparkles} label="Quick Edit" onClick={onQuickEdit} />
      <ActionButton icon={Camera} label="Create Multi-Angle Set" onClick={onMultiAngle} />
      <ActionButton icon={Gauge} label="Reality Check" onClick={onRealityCheck} />
      <button onClick={onGenerate} className="rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white">Generate Concept</button>
    </div>
  );
}

function MarkerPanel({ marker, onRemove }: { marker?: Marker; onRemove: () => void }) {
  if (!marker) return null;
  return (
    <div className="grid gap-4">
      <PanelHeader title="Marker" copy="Instruction anchor on the selected image." />
      <InfoRow label="Label" value={marker.label} />
      <InfoRow label="Instruction" value="Place koi pond here" />
      <InfoRow label="Priority" value="High" />
      <DangerButton label="Remove marker" onClick={onRemove} />
    </div>
  );
}

function RegionPanel({ region, onRemove }: { region?: Region; onRemove: () => void }) {
  if (!region) return null;
  return (
    <div className="grid gap-4">
      <PanelHeader title={region.label} copy={region.kind === "locked" ? "Protected area" : "Editable AI region"} />
      <InfoRow label="Region type" value={region.kind === "locked" ? "Locked area" : "Editable area"} />
      <InfoRow label="Instruction" value={region.kind === "locked" ? "Keep unchanged" : "Redesign this zone"} />
      <DangerButton label="Remove region" onClick={onRemove} />
    </div>
  );
}

function ObjectPanel({ object, onRemove }: { object?: AddedObject; onRemove: () => void }) {
  if (!object) return null;
  return (
    <div className="grid gap-4">
      <PanelHeader title={object.label} copy="Object transform controls" />
      <InfoRow label="Mode" value="Move / rotate / scale handles visible" />
      <Slider label="Rotation" value={Math.abs(object.rotation) + 12} />
      <Slider label="Scale" value={72} />
      <DangerButton label="Remove object" onClick={onRemove} />
    </div>
  );
}

function PanelHeader({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-[#F7F8FA] p-4">
      <SlidersHorizontal className="h-5 w-5 text-[#6D5DFB]" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-black text-[#0A0A0A]">{title}</h2>
      <p className="mt-1 text-sm font-semibold leading-6 text-[#667085]">{copy}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
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
      <div className="mb-3 flex justify-between text-xs font-black uppercase tracking-[0.16em] text-[#98A2B3]">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-[#F2F4F7]">
        <div className="h-full rounded-full bg-[#3B82F6]" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: typeof Sparkles; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-black text-[#111827] hover:bg-[#F7F8FA]">
      <Icon className="h-4 w-4 text-[#6D5DFB]" aria-hidden="true" />
      {label}
    </button>
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
