"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hand,
  MessageSquare,
  MousePointer2,
  PenTool,
  Plus,
  Redo2,
  Scissors,
  Settings,
  Smile,
  Square,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { EditorTool } from "../../types/canvas";

type FloatingToolRailProps = {
  activeTool: EditorTool;
  onTool: (tool: EditorTool) => void;
  onAddNode: () => void;
  onOpenLibrary?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
};

type RailButtonProps = {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  hasSubmenu?: boolean;
  embeddedState?: "hover" | "selected";
  raised?: boolean;
  hideSubmenuIndicator?: boolean;
  showHint?: boolean;
  onHoverStart?: () => void;
  onClick: () => void;
};

type StickerActionId = "sticky" | "draw" | "reaction";

type StickerAction = {
  id: StickerActionId;
  label: string;
  shortcut: string;
  icon: LucideIcon;
  tool: EditorTool;
};

const STICKER_ACTIONS: readonly StickerAction[] = [
  { id: "sticky", label: "Sticky note", shortcut: "T", icon: Square, tool: "text-note" },
  { id: "draw", label: "Draw", shortcut: "P", icon: PenTool, tool: "pen" },
  { id: "reaction", label: "Stickers", shortcut: "S", icon: Smile, tool: "mark-position" },
];

const EDITABLE_ELEMENT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function RailButton({
  label,
  icon: Icon,
  active = false,
  disabled = false,
  hasSubmenu = false,
  embeddedState,
  raised = false,
  hideSubmenuIndicator = false,
  showHint = true,
  onHoverStart,
  onClick,
}: RailButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onHoverStart}
      className={[
        "group relative grid h-10 w-10 place-items-center rounded-xl",
        "transition-colors duration-150",
        "focus-visible:outline-none",
        raised ? "z-30" : "",
        disabled
          ? "cursor-default text-[var(--canvas-theme-text-muted)] opacity-50"
          : embeddedState === "selected"
            ? "cursor-pointer rounded-xl bg-[var(--canvas-theme-selection)] text-[var(--canvas-theme-active-text)]"
            : embeddedState === "hover"
              ? "cursor-pointer bg-[var(--canvas-theme-hover)] text-[var(--canvas-theme-text-soft)]"
            : active
              ? "cursor-pointer bg-[var(--canvas-theme-selection)] text-[var(--canvas-theme-active-text)]"
              : "cursor-pointer bg-transparent text-[var(--canvas-theme-icon)]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
      {hasSubmenu ? (
        <span
          className={`absolute bottom-2 right-1.5 h-0 w-0 border-b-[5px] border-l-[5px] border-l-transparent ${
            active ? "border-b-[var(--canvas-theme-surface-panel)]" : embeddedState || hideSubmenuIndicator ? "border-b-transparent" : "border-b-[var(--canvas-theme-icon)]"
          }`}
        />
      ) : null}
      {showHint && !hasSubmenu ? (
        <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-30 hidden -translate-y-1/2 whitespace-nowrap rounded-xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] px-2 py-1 text-[11px] font-medium text-[var(--canvas-theme-text)] shadow-[0_4px_12px_rgba(0,0,0,0.08)] group-hover:block">
          {label}
        </span>
      ) : null}
    </button>
  );
}

function StickerFlyoutButton({
  label,
  icon: Icon,
  selected,
  onHoverStart,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  selected: boolean;
  onHoverStart: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      onMouseEnter={onHoverStart}
      className={`grid h-[38px] w-[38px] place-items-center rounded-xl transition-colors duration-150 ${
        selected ? "bg-[var(--canvas-theme-selection)] text-[var(--canvas-theme-active-text)]" : "bg-transparent text-[var(--canvas-theme-text-soft)]"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
    </button>
  );
}

function StickersFlyout({
  open,
  selectedAction,
  hoveredAction,
  activeTool,
  onHoverAction,
  onAction,
}: {
  open: boolean;
  selectedAction: StickerActionId;
  hoveredAction: StickerActionId | null;
  activeTool: EditorTool;
  onHoverAction: (action: StickerActionId) => void;
  onAction: (action: StickerActionId) => void;
}) {
  const hovered = STICKER_ACTIONS.find((action) => action.id === hoveredAction);
  // The flyout layout stays stable: Sticky note is the rail trigger, then Draw and Stickers.
  const childActions = STICKER_ACTIONS.slice(1);
  const tooltipIndex = hoveredAction
    ? STICKER_ACTIONS.findIndex((action) => action.id === hoveredAction)
    : -1;

  return (
    <div
      aria-hidden={!open}
      className={`absolute -left-[6px] top-1/2 z-20 -translate-y-1/2 transition-[opacity,transform] duration-150 ease-out ${
        open ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none -translate-x-1 opacity-0"
      }`}
    >
      <div className="relative flex h-[42px] items-center rounded-xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] py-0.5 pl-[50px] pr-1 shadow-[0_8px_24px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.04)]">
        {hovered && tooltipIndex >= 0 ? (
          <div
            className="pointer-events-none absolute -top-10 z-40 -translate-x-1/2 whitespace-nowrap rounded-xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] px-2.5 py-1.5 text-sm font-medium text-[var(--canvas-theme-text)] shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
            style={{ left: `${26 + tooltipIndex * 39}px` }}
          >
            {hovered.label} <span className="ml-1 text-[var(--canvas-theme-text-muted)]">{hovered.shortcut}</span>
          </div>
        ) : null}
        {childActions.map((action) => (
          <StickerFlyoutButton
            key={action.id}
            label={action.label}
            icon={action.icon}
            selected={selectedAction === action.id && activeTool === action.tool}
            onHoverStart={() => onHoverAction(action.id)}
            onClick={() => onAction(action.id)}
          />
        ))}
      </div>
    </div>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || EDITABLE_ELEMENT_TAGS.has(target.tagName);
}

export default function FloatingToolRail({
  activeTool,
  onTool,
  onAddNode,
  onUndo,
  onRedo,
}: FloatingToolRailProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [selectedStickerAction, setSelectedStickerAction] = useState<StickerActionId>("sticky");
  const [representedStickerAction, setRepresentedStickerAction] = useState<StickerActionId>("sticky");
  const [hoveredStickerAction, setHoveredStickerAction] = useState<StickerActionId | null>(null);
  const [hasExplicitStickerSelection, setHasExplicitStickerSelection] = useState(false);

  const closeStickers = useCallback(() => {
    if (hasExplicitStickerSelection) {
      setRepresentedStickerAction(selectedStickerAction);
    }
    setStickersOpen(false);
    setHoveredStickerAction(null);
  }, [hasExplicitStickerSelection, selectedStickerAction]);

  const selectStickerAction = useCallback((action: StickerActionId) => {
    setSelectedStickerAction(action);
    setHasExplicitStickerSelection(true);
    const nextAction = STICKER_ACTIONS.find((item) => item.id === action) ?? STICKER_ACTIONS[0];
    onTool(nextAction.tool);
  }, [onTool]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeStickers();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "Escape") {
        closeStickers();
        return;
      }

      const key = event.key.toLowerCase();
      const toolByKey: Record<string, EditorTool> = {
        v: "select",
        h: "add-source",
        x: "edit-elements",
        c: "mark-position",
      };

      if (key === "s") {
        event.preventDefault();
        selectStickerAction("sticky");
        setRepresentedStickerAction("sticky");
        setStickersOpen(true);
        return;
      }

      const tool = toolByKey[key];
      if (tool) {
        event.preventDefault();
        onTool(tool);
        closeStickers();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeStickers, onTool, selectStickerAction]);

  const representativeAction =
    STICKER_ACTIONS.find((action) => action.id === representedStickerAction) ?? STICKER_ACTIONS[0];
  const stickyAction = STICKER_ACTIONS[0];
  const embeddedStickerState = stickersOpen
    ? hasExplicitStickerSelection &&
      selectedStickerAction === stickyAction.id &&
      activeTool === stickyAction.tool
      ? "selected"
      : "hover"
    : undefined;

  return (
    <div ref={rootRef} className="absolute left-6 top-1/2 z-[90] -translate-y-1/2" data-canvas-ui="true">
      <div className="flex h-[420px] w-[52px] flex-col gap-y-1 items-center overflow-visible rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] px-[6px] py-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.04)]">
        <RailButton label="Add" icon={Plus} onClick={onAddNode} />
        <RailButton label="Select" icon={MousePointer2} active={activeTool === "select"} onClick={() => onTool("select")} />
        <RailButton label="Hand" icon={Hand} active={activeTool === "add-source"} onClick={() => onTool("add-source")} />

        <div className="my-1.5 h-px w-[26px] bg-[var(--canvas-theme-border)]" />

        <RailButton
          label="Cut"
          icon={Scissors}
          active={activeTool === "edit-elements"}
          hasSubmenu
          onClick={() => onTool("edit-elements")}
        />
        <div
          className="relative"
          onMouseEnter={() => setStickersOpen(true)}
          onMouseLeave={() => {
            setHoveredStickerAction(null);
            closeStickers();
          }}
        >
          <RailButton
            label={stickersOpen ? stickyAction.label : representativeAction.label}
            icon={stickersOpen ? stickyAction.icon : representativeAction.icon}
            active={!stickersOpen && activeTool === representativeAction.tool}
            hasSubmenu
            embeddedState={embeddedStickerState}
            raised={stickersOpen}
            hideSubmenuIndicator={stickersOpen}
            showHint={!stickersOpen}
            onHoverStart={() => setHoveredStickerAction(stickyAction.id)}
            onClick={() => {
              // The first slot is always Sticky note while the flyout is visible.
              selectStickerAction(stickersOpen ? stickyAction.id : representedStickerAction);
              setStickersOpen(true);
            }}
          />
          <StickersFlyout
            open={stickersOpen}
            selectedAction={selectedStickerAction}
            hoveredAction={hoveredStickerAction}
            activeTool={activeTool}
            onHoverAction={setHoveredStickerAction}
            onAction={selectStickerAction}
          />
        </div>
        <RailButton
          label="Comments"
          icon={MessageSquare}
          active={activeTool === "mark-position"}
          onClick={() => onTool("mark-position")}
        />
        <RailButton label="Undo" icon={Undo2} disabled={!onUndo} onClick={() => onUndo?.()} />
        <RailButton label="Redo" icon={Redo2} disabled={!onRedo} onClick={() => onRedo?.()} />

        <div className="mt-auto" />
        <RailButton
          label="Settings"
          icon={Settings}
          active={activeTool === "grid"}
          onClick={() => onTool("grid")}
        />
      </div>
    </div>
  );
}
