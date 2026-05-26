"use client";

import { useRef, useState } from "react";
import { Download, Save, Share2, Sparkles } from "lucide-react";
import { gsap, useGSAP } from "../../components/gsapSetup";
import AddObjectMenu from "./AddObjectMenu";
import CanvasBoard from "./CanvasBoard";
import EditorLeftSidebar from "./EditorLeftSidebar";
import EditorRightPanel from "./EditorRightPanel";
import MultiAngleModal from "./MultiAngleModal";
import QuickEditModal from "./QuickEditModal";
import RealityCheckPanel from "./RealityCheckPanel";

export type EditorTool =
  | "select"
  | "mark-position"
  | "add-source"
  | "grid"
  | "draw-region"
  | "lock-area"
  | "text-note"
  | "add-object"
  | "generate"
  | "erase"
  | "edit-elements"
  | "move-object";

export type SelectedItem =
  | { type: "none" }
  | { type: "image"; id: string; menu?: { x: number; y: number } }
  | { type: "reference"; id: string }
  | { type: "marker"; id: string }
  | { type: "region"; id: string }
  | { type: "object"; id: string };

export type Marker = {
  id: string;
  x: number;
  y: number;
  label: string;
};

export type Region = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  kind: "editable" | "locked";
};

export type AddedObject = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label: string;
};

const initialMarkers: Marker[] = [{ id: "marker-1", x: 58, y: 56, label: "Place koi pond here" }];
const initialRegions: Region[] = [
  { id: "region-lock-1", x: 9, y: 10, w: 34, h: 19, label: "Keep unchanged", kind: "locked" },
  { id: "region-edit-1", x: 48, y: 58, w: 34, h: 21, label: "Editable Zone", kind: "editable" },
];

export default function CanvasWorkspace() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({ type: "none" });
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [gridVisible, setGridVisible] = useState(true);
  const [showQuickEditModal, setShowQuickEditModal] = useState(false);
  const [showMultiAngleModal, setShowMultiAngleModal] = useState(false);
  const [showAddObjectMenu, setShowAddObjectMenu] = useState(false);
  const [showRealityCheckPanel, setShowRealityCheckPanel] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>(initialMarkers);
  const [regions, setRegions] = useState<Region[]>(initialRegions);
  const [addedObjects, setAddedObjects] = useState<AddedObject[]>([
    { id: "object-1", x: 62, y: 58, w: 17, h: 10, rotation: -5, label: "Koi Pond" },
  ]);
  const [promptText, setPromptText] = useState("");
  const [mockConcepts, setMockConcepts] = useState<string[]>([]);
  const [outputAngles, setOutputAngles] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");

  useGSAP(
    () => {
      if (!rootRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(rootRef.current.querySelectorAll("[data-enter]"), {
        y: 16,
        autoAlpha: 0,
        duration: 0.55,
        stagger: 0.06,
        ease: "power3.out",
      });
    },
    { scope: rootRef },
  );

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  };

  const handleTool = (tool: EditorTool) => {
    setActiveTool(tool);
    if (tool === "add-object") setShowAddObjectMenu(true);
  };

  const handleImageAction = (x: number, y: number) => {
    if (activeTool === "mark-position") {
      const id = `marker-${markers.length + 1}`;
      setMarkers((items) => [...items, { id, x, y, label: "Place koi pond here" }]);
      setSelectedItem({ type: "marker", id });
      animateIn(".marker-pin");
    }
    if (activeTool === "draw-region" || activeTool === "lock-area") {
      const locked = activeTool === "lock-area";
      const id = `${locked ? "locked" : "region"}-${regions.length + 1}`;
      setRegions((items) => [
        ...items,
        {
          id,
          x: Math.min(x, 68),
          y: Math.min(y, 70),
          w: locked ? 28 : 32,
          h: locked ? 15 : 19,
          label: locked ? "Keep unchanged" : "Editable Zone",
          kind: locked ? "locked" : "editable",
        },
      ]);
      setSelectedItem({ type: "region", id });
      animateIn(".region-overlay");
    }
  };

  const addObject = (label: string) => {
    const id = `object-${addedObjects.length + 1}`;
    setAddedObjects((items) => [
      ...items,
      {
        id,
        x: 44 + items.length * 4,
        y: 45 + items.length * 3,
        w: label === "People" ? 10 : 18,
        h: label === "Waterfall" ? 17 : 11,
        rotation: label === "Pathway" ? -10 : -4,
        label,
      },
    ]);
    setSelectedItem({ type: "object", id });
    setShowAddObjectMenu(false);
    setActiveTool("select");
    animateIn(".added-object");
  };

  const generateConcept = () => {
    setStatus("Generating concept...");
    setMockConcepts([]);
    window.setTimeout(() => {
      setStatus("Concept created");
      setMockConcepts(["Concept A", "Concept B", "Concept C"]);
      animateIn(".output-thumb");
    }, 850);
  };

  const generateAngles = () => {
    setShowMultiAngleModal(false);
    setOutputAngles(["Angle A", "Angle B", "Top View", "Night View"]);
    showToast("Angle set created");
    animateIn(".output-thumb");
  };

  const applyQuickEdit = () => {
    setShowQuickEditModal(false);
    showToast("Edit instruction added");
  };

  const removeSelected = () => {
    if (selectedItem.type === "marker") setMarkers((items) => items.filter((item) => item.id !== selectedItem.id));
    if (selectedItem.type === "region") setRegions((items) => items.filter((item) => item.id !== selectedItem.id));
    if (selectedItem.type === "object") setAddedObjects((items) => items.filter((item) => item.id !== selectedItem.id));
    setSelectedItem({ type: "none" });
  };

  return (
    <div ref={rootRef} className="min-h-screen bg-white text-[#0A0A0A]">
      <div className="hidden h-screen w-screen flex-col overflow-hidden bg-white xl:flex">
        <header data-enter className="flex h-16 shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white px-5">
          <div className="flex items-center gap-4">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#111827] text-sm font-black text-white">C</div>
            <div>
              <p className="text-sm font-black leading-none">Carver AI</p>
              <p className="mt-1 text-xs font-semibold text-[#667085]">Object-based image editor · {status}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-bold text-[#111827] hover:bg-[#F7F8FA]">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-bold text-[#111827] hover:bg-[#F7F8FA]">
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-bold text-[#111827] hover:bg-[#F7F8FA]">
              <Download className="h-4 w-4" aria-hidden="true" />
              Export
            </button>
            <button onClick={generateConcept} className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/10">
              <Sparkles className="h-4 w-4 text-[#A7A1FF]" aria-hidden="true" />
              Generate
            </button>
          </div>
        </header>
        <div data-enter className="flex min-h-0 flex-1">
          <EditorLeftSidebar selectedItem={selectedItem} onSelectReference={() => setSelectedItem({ type: "reference", id: "reference-1" })} onToast={showToast} />
          <CanvasBoard
            selectedItem={selectedItem}
            activeTool={activeTool}
            gridVisible={gridVisible}
            markers={markers}
            regions={regions}
            addedObjects={addedObjects}
            mockConcepts={mockConcepts}
            angleResults={outputAngles}
            onSelect={setSelectedItem}
            onImageAction={handleImageAction}
            onTool={handleTool}
            onToggleGrid={() => setGridVisible((value) => !value)}
            onQuickEdit={() => setShowQuickEditModal(true)}
            onMultiAngle={() => setShowMultiAngleModal(true)}
            onAddObject={() => setShowAddObjectMenu(true)}
            onRealityCheck={() => setShowRealityCheckPanel(true)}
            onGenerate={generateConcept}
            onToast={showToast}
          />
          <EditorRightPanel
            selectedItem={selectedItem}
            activeTool={activeTool}
            markers={markers}
            regions={regions}
            addedObjects={addedObjects}
            promptText={promptText}
            onPromptChange={setPromptText}
            onQuickEdit={() => setShowQuickEditModal(true)}
            onMultiAngle={() => setShowMultiAngleModal(true)}
            onRealityCheck={() => setShowRealityCheckPanel(true)}
            onGenerate={generateConcept}
            onRemoveSelected={removeSelected}
          />
        </div>
        <QuickEditModal open={showQuickEditModal} promptText={promptText} onPromptChange={setPromptText} onClose={() => setShowQuickEditModal(false)} onApply={applyQuickEdit} />
        <MultiAngleModal open={showMultiAngleModal} onClose={() => setShowMultiAngleModal(false)} onGenerate={generateAngles} />
        <AddObjectMenu open={showAddObjectMenu} onClose={() => setShowAddObjectMenu(false)} onAdd={addObject} />
        <RealityCheckPanel open={showRealityCheckPanel} onClose={() => setShowRealityCheckPanel(false)} />
        {toast ? (
          <div className="toast-message fixed left-1/2 top-20 z-[120] -translate-x-1/2 rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-black text-[#111827] shadow-2xl shadow-black/12">
            {toast}
          </div>
        ) : null}
      </div>
      <div className="grid min-h-screen place-items-center bg-[#F7F8FA] p-8 xl:hidden">
        <div className="max-w-md rounded-3xl border border-[#E5E7EB] bg-white p-8 text-center shadow-xl shadow-black/8">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#111827] text-lg font-black text-white">C</div>
          <h1 className="mt-6 text-2xl font-black text-[#0A0A0A]">Canvas is best on desktop.</h1>
          <p className="mt-3 text-sm leading-6 text-[#667085]">Open this workspace on a larger screen to use object selection, contextual tools, markers, regions, and AI actions.</p>
        </div>
      </div>
    </div>
  );
}

function animateIn(selector: string) {
  window.setTimeout(() => {
    const items = document.querySelectorAll(selector);
    gsap.fromTo(items, { y: 10, scale: 0.96, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.38, stagger: 0.05, ease: "power3.out" });
  }, 20);
}
