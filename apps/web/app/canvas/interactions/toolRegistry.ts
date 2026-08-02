import {
  Pencil,
  Scissors,
  Smile,
  Spline,
  Square,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { EditorTool } from "../types/canvas";
import DrawPencilSvgIcon from "./DrawPencilSvgIcon";

export type CanvasToolIcon = ComponentType<SVGProps<SVGSVGElement> & {
  strokeWidth?: number;
}>;

export type StickerActionId = "sticky" | "draw" | "reaction";
export type ConnectionActionId = "cut" | "connection";

export type CanvasToolAction<TId extends string = string> = {
  id: TId;
  label: string;
  shortcut: string;
  icon: CanvasToolIcon;
  tool: EditorTool;
};

/** Metadata only. Tool rendering and event handling stay independent. */
export const STICKER_TOOL_ACTIONS: readonly CanvasToolAction<StickerActionId>[] = [
  { id: "sticky", label: "Sticky note", shortcut: "T", icon: Square, tool: "text-note" },
  { id: "draw", label: "Draw", shortcut: "P", icon: DrawPencilSvgIcon, tool: "pen" },
  { id: "reaction", label: "Stickers", shortcut: "S", icon: Smile, tool: "mark-position" },
];

export const CONNECTION_TOOL_ACTIONS: readonly CanvasToolAction<ConnectionActionId>[] = [
  { id: "cut", label: "Cut", shortcut: "X", icon: Scissors, tool: "cut" },
  { id: "connection", label: "Connection", shortcut: "L", icon: Spline, tool: "connection" },
];

export const CANVAS_TOOL_SHORTCUTS: Readonly<Record<string, EditorTool>> = {
  v: "select",
  h: "add-source",
  t: "text-note",
  x: "cut",
  c: "mark-position",
};
