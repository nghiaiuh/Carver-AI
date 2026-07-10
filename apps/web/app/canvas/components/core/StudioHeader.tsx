"use client";

import {
  Clock3,
  Download,
  Leaf,
  RotateCcw,
  RotateCw,
  Save,
  UserRound,
  Zap,
} from "lucide-react";

type StudioHeaderProps = {
  projectName: string;
  snapshotStatus: string;
  creditsAmount: number | null;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  onSave: () => void;
  onOpenHistory: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

export default function StudioHeader({
  projectName,
  snapshotStatus,
  creditsAmount,
  isSaving,
  hasUnsavedChanges,
  onSave,
  onOpenHistory,
  onExport,
  onUndo,
  onRedo,
}: StudioHeaderProps) {
  return (
    <header className="relative z-[90] flex h-16 shrink-0 items-center justify-between border-b border-[#D8D2C3] bg-[#FBF8EF]/95 px-4 text-[#173225] shadow-[0_1px_0_rgba(23,50,37,0.04)] backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#4D735B] text-[#FBF8EF]">
            <Leaf className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-base font-semibold">Carver</span>
        </div>
        <span className="h-7 w-px bg-[#D8D2C3]" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate font-[var(--font-botanical-display)] text-lg text-[#102A1F]">
            {projectName}
          </p>
        </div>
        <span className="rounded-full bg-[#DDEBDD] px-2.5 py-1 text-xs font-medium text-[#3F6B51]">
          {hasUnsavedChanges ? "Draft" : "Saved"}
        </span>
        <span className="hidden text-xs text-[#6F7B6F] lg:inline">{snapshotStatus}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#F1E7C8] px-3 text-sm font-medium text-[#7A6128]">
          <Zap className="h-4 w-4 fill-current" aria-hidden="true" />
          {typeof creditsAmount === "number" ? creditsAmount : "--"} credits
        </span>
        <IconButton label="Undo" onClick={onUndo} icon={RotateCcw} />
        <IconButton label="Redo" onClick={onRedo} icon={RotateCw} />
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#466E55] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(70,110,85,0.2)] transition hover:bg-[#365A45] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {isSaving ? "Saving" : "Save"}
        </button>
        <IconButton label="Export" onClick={onExport} icon={Download} />
        <button
          type="button"
          onClick={onOpenHistory}
          className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#D8D2C3] bg-[#FFFDF8] px-3 text-sm font-medium text-[#173225] transition hover:border-[#AEB99F] hover:bg-[#F5F0E4]"
        >
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          History
        </button>
        <IconButton label="Profile" onClick={() => undefined} icon={UserRound} />
      </div>
    </header>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-[12px] text-[#173225] transition hover:bg-[#EFE8DA]"
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
