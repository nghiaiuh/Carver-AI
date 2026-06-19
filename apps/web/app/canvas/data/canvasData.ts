/*
 * Flow: Defines static canvas UI data.
 * 1. Export tool, prompt, or preset definitions.
 * 2. Keep canvas components data-driven.
 * 3. Avoid embedding repeated labels inside UI code.
 */

import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Camera,
  Eraser,
  Hand,
  ImagePlus,
  Lock,
  MapPin,
  MessageCircle,
  MousePointer2,
  PenLine,
  PackagePlus,
} from "lucide-react";

export type ToolId =
  | "select"
  | "pan"
  | "mark"
  | "add-object"
  | "eraser"
  | "multi-angle"
  | "comment";

export type Selection =
  | { type: "none" }
  | { type: "node"; id: string }
  | { type: "marker"; id: string }
  | { type: "object"; id: string }
  | { type: "recipe"; id: string }
  | { type: "source-mix"; role: SourceRole };

export type GenerationStatus = "Ready" | "Generating" | "Concept created";
export type SourceRole = "layout" | "style" | "material" | "object";

export type Source = {
  id: string;
  name: string;
  type: "Site Photo" | "Floorplan" | "Style Reference" | "Material Reference" | "Object Reference";
  role: SourceRole;
  thumbnail: string;
  accent: string;
};

export type CanvasNode = {
  id: string;
  sourceId?: string;
  kind: "source" | "output";
  title: string;
  subtitle: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
};

export type CanvasEdge = {
  id: string;
  from: string;
  to: string;
  label: SourceRole;
};

export type CanvasMarker = {
  id: string;
  name: string;
  instruction: string;
  objectType: string;
  priority: "Low" | "Medium" | "High";
  x: number;
  y: number;
};



export type CanvasObject = {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  scale: number;
};

export type OutputConcept = {
  id: string;
  title: string;
  style: string;
  budgetFit: number;
  feasibility: number;
  accent: string;
};

export type SourceMix = Record<SourceRole, string> & {
  instruction: string;
};

export type CanvasTool = {
  id: ToolId;
  label: string;
  group: "Navigate" | "Mark & Region" | "Object" | "Camera" | "Assist";
  icon: LucideIcon;
  tip: string;
};

export const projectName = "Villa Koi Garden Concept";

export const canvasTools: CanvasTool[] = [
  { id: "select", label: "Select", group: "Navigate", icon: MousePointer2, tip: "Select nodes, markers, regions, and objects." },
  { id: "pan", label: "Pan", group: "Navigate", icon: Hand, tip: "Move around the canvas." },
  { id: "mark", label: "Mark", group: "Mark & Region", icon: MapPin, tip: "Place a marker with an instruction." },
  { id: "add-object", label: "Object", group: "Object", icon: PackagePlus, tip: "Add koi pond, waterfall, plants, people, or hardscape." },
  { id: "eraser", label: "Erase", group: "Object", icon: Eraser, tip: "Erase pen marks by area." },
  { id: "multi-angle", label: "Angles", group: "Camera", icon: Camera, tip: "Create a multi-angle concept set." },
  { id: "comment", label: "Comment", group: "Assist", icon: MessageCircle, tip: "Leave a design note for collaborators." },
];

export const demoSources: Source[] = [
  { id: "src-site", name: "Current garden photo", type: "Site Photo", role: "layout", thumbnail: "/assets/garden_3d_render.png", accent: "#16A34A" },
  { id: "src-plan", name: "Floorplan", type: "Floorplan", role: "layout", thumbnail: "/assets/canvas_texture.png", accent: "#111827" },
  { id: "src-koi", name: "Koi pond reference", type: "Object Reference", role: "object", thumbnail: "/assets/mark_generation.png", accent: "#6D5DFB" },
  { id: "src-stone", name: "Tai Meo stone", type: "Material Reference", role: "material", thumbnail: "/assets/canvas_texture.png", accent: "#667085" },
  { id: "src-planting", name: "Tropical planting", type: "Style Reference", role: "style", thumbnail: "/assets/garden_3d_render.png", accent: "#22C55E" },
];

export const demoNodes: CanvasNode[] = [
  { id: "node-site", sourceId: "src-site", kind: "source", title: "Current Garden Photo", subtitle: "Site Photo", x: 92, y: 120, w: 210, h: 142, color: "#ECFDF3" },
  { id: "node-plan", sourceId: "src-plan", kind: "source", title: "Floorplan", subtitle: "Layout source", x: 106, y: 330, w: 210, h: 128, color: "#F2F4F7" },
  { id: "node-koi", sourceId: "src-koi", kind: "source", title: "Koi Pond Reference", subtitle: "Object source", x: 378, y: 80, w: 220, h: 132, color: "#F4F3FF" },
  { id: "node-stone", sourceId: "src-stone", kind: "source", title: "Tai Meo Stone", subtitle: "Material source", x: 390, y: 300, w: 220, h: 132, color: "#F7F8FA" },
  { id: "node-planting", sourceId: "src-planting", kind: "source", title: "Tropical Planting", subtitle: "Style source", x: 360, y: 500, w: 220, h: 132, color: "#F0FDF4" },
  { id: "node-output", kind: "output", title: "Generated Concept A", subtitle: "Output concept", x: 760, y: 244, w: 274, h: 190, color: "#111827" },
];

export const demoEdges: CanvasEdge[] = [
  { id: "edge-plan", from: "node-plan", to: "node-output", label: "layout" },
  { id: "edge-planting", from: "node-planting", to: "node-output", label: "style" },
  { id: "edge-stone", from: "node-stone", to: "node-output", label: "material" },
  { id: "edge-koi", from: "node-koi", to: "node-output", label: "object" },
];

export const demoMarkers: CanvasMarker[] = [
  { id: "marker-1", name: "Marker 01", instruction: "Place koi pond here", objectType: "Koi pond", priority: "High", x: 680, y: 180 },
];



export const demoObjects: CanvasObject[] = [
  { id: "object-koi", label: "Koi pond", type: "Koi pond", x: 700, y: 326, w: 150, h: 78, rotation: -3, scale: 1 },
];

export const defaultSourceMix: SourceMix = {
  layout: "Floorplan",
  style: "Tropical planting reference",
  material: "Tai Meo stone",
  object: "Koi pond reference",
  instruction: "Keep house unchanged",
};

export const projectTypes = ["Garden", "Koi Pond", "Rockery / Non Bo", "Waterfall", "Courtyard"];
export const styleOptions = ["Tropical Modern", "Vietnamese Courtyard", "Japanese Koi Garden", "Minimal Garden", "Resort Garden", "Non Bo Tam Son Nhi Ha"];
export const budgetOptions = ["Economy", "Standard", "Premium", "Luxury"];
export const outputOptions = ["Single concept", "3 variations", "Multi-angle set"];
export const promptChips = ["Keep layout", "Add koi pond", "Add waterfall", "Low maintenance", "Make it luxury", "Generate 3 angles"];

export const commandRecipes = [
  { id: "recipe-koi", title: "Create koi pond in marked area", prompt: "Create a small koi pond in Marker 01 with natural stone edging." },
  { id: "recipe-tropical", title: "Replace this zone with tropical garden", prompt: "Replace the editable zone with layered tropical planting and soft lighting." },
  { id: "recipe-house", title: "Keep house and redesign garden", prompt: "Keep the house unchanged and redesign the garden around it." },
  { id: "recipe-angles", title: "Generate 3 camera angles", prompt: "Generate front, eye-level, and top-down camera angles." },
  { id: "recipe-people", title: "Add people for scale", prompt: "Add subtle people silhouettes for scale without changing the garden design." },
];

export const objectLibrary = ["Koi pond", "Waterfall", "Rockery / Non Bo", "Tree", "Shrub", "Pathway", "Pergola", "Outdoor seating", "People", "Deer statue", "Lighting", "Stepping stone"];

export const outputConcepts: OutputConcept[] = [
  { id: "concept-a", title: "Concept A", style: "Vietnamese tropical koi", budgetFit: 82, feasibility: 78, accent: "#6D5DFB" },
  { id: "concept-b", title: "Concept B", style: "Resort garden with waterfall", budgetFit: 76, feasibility: 81, accent: "#16A34A" },
  { id: "concept-c", title: "Concept C", style: "Minimal courtyard pond", budgetFit: 88, feasibility: 84, accent: "#111827" },
];

export const angleResults = ["Angle A", "Angle B", "Top View", "Night View"];

export const emptySelection: Selection = { type: "none" };
export const aiStatusNote = "API integration pending";
export const AssistantIcon = Bot;
export const UploadIcon = ImagePlus;
