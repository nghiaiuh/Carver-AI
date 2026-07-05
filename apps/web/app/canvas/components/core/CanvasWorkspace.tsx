/*
 * CanvasWorkspace – UI shell only.
 *
 * All state, derived values, and action callbacks live in useCanvasWorkspace.
 * This component owns only:
 *   - The GSAP entry animation (needs a DOM ref in component scope).
 *   - The JSX layout: left sidebar, canvas board, right panel, modals, toast.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { gsap, useGSAP } from "../../../components/gsapSetup";
import { useCanvasWorkspace } from "../../hooks/useCanvasWorkspace";
import AddObjectMenu from "../panels/AddObjectMenu";
import CanvasBoard from "./CanvasBoard";
import CanvasLeftSidebar from "../panels/CanvasLeftSidebar";
import AiChatSidebar from "../panels/AiChatSidebar";
import GroupNameTagModal from "../panels/GroupNameTagModal";
import MultiAngleModal from "../panels/MultiAngleModal";
import QuickEditModal from "../panels/QuickEditModal";
import FeasibilityReviewPanel from "../panels/FeasibilityReviewPanel";
import ResizeHandle from "../widgets/ResizeHandle";
import RegionBrushToolbar from "../widgets/RegionBrushToolbar";

export default function CanvasWorkspace({ projectId }: { projectId?: string }) {
  const canvas = useCanvasWorkspace({ projectId });
  const { rootRef, leftSidebarPanelRef, rightPanelRef, leftSidebarResize, rightPanelResize } =
    canvas;
  const { state, modals, toast, actions, library } = canvas;
  const [isLeftSidebarRendered, setIsLeftSidebarRendered] = useState(state.leftSidebar.open);
  const [isRightPanelRendered, setIsRightPanelRendered] = useState(state.rightPanelOpen);
  const leftSidebarContentRef = useRef<HTMLDivElement | null>(null);
  const rightPanelContentRef = useRef<HTMLDivElement | null>(null);
  const leftSidebarTweenRef = useRef<gsap.core.Timeline | null>(null);
  const rightPanelTweenRef = useRef<gsap.core.Timeline | null>(null);
  const isLeftSidebarAnimatingRef = useRef(false);
  const isRightPanelAnimatingRef = useRef(false);
  const leftSidebarWidthRef = useRef(leftSidebarResize.width);
  const rightPanelWidthRef = useRef(rightPanelResize.width);

  useEffect(() => {
    leftSidebarWidthRef.current = leftSidebarResize.width;
  }, [leftSidebarResize.width]);

  useEffect(() => {
    rightPanelWidthRef.current = rightPanelResize.width;
  }, [rightPanelResize.width]);

  // GSAP entry animation – needs rootRef attached to DOM, so it lives here.
  useGSAP(
    () => {
      if (!rootRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.set("[data-shell-panel]", { willChange: "transform, opacity" });
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

  useEffect(() => {
    if (state.leftSidebar.open) {
      setIsLeftSidebarRendered(true);
    }
  }, [state.leftSidebar.open]);

  useEffect(() => {
    if (state.rightPanelOpen) {
      setIsRightPanelRendered(true);
    }
  }, [state.rightPanelOpen]);

  useEffect(() => {
    const wrapper = leftSidebarPanelRef.current;
    if (!wrapper || !isLeftSidebarRendered || !state.leftSidebar.open || isLeftSidebarAnimatingRef.current) return;
    gsap.set(wrapper, { width: leftSidebarResize.width, clearProps: "willChange" });
  }, [isLeftSidebarRendered, leftSidebarPanelRef, leftSidebarResize.width, state.leftSidebar.open]);

  useEffect(() => {
    const wrapper = rightPanelRef.current;
    if (!wrapper || !isRightPanelRendered || !state.rightPanelOpen || isRightPanelAnimatingRef.current) return;
    gsap.set(wrapper, { width: rightPanelResize.width, clearProps: "willChange" });
  }, [isRightPanelRendered, rightPanelRef, rightPanelResize.width, state.rightPanelOpen]);

  useEffect(() => {
    if (!leftSidebarResize.isResizing) return;

    const wrapper = leftSidebarPanelRef.current;
    const element = leftSidebarContentRef.current;
    leftSidebarTweenRef.current?.kill();
    isLeftSidebarAnimatingRef.current = false;

    if (!wrapper || !element || !state.leftSidebar.open) return;

    gsap.set(wrapper, { width: leftSidebarResize.width, overflow: "hidden", clearProps: "willChange" });
    gsap.set(element, { xPercent: 0, clearProps: "transform,willChange" });
  }, [leftSidebarPanelRef, leftSidebarResize.isResizing, leftSidebarResize.width, state.leftSidebar.open]);

  useEffect(() => {
    if (!rightPanelResize.isResizing) return;

    const wrapper = rightPanelRef.current;
    const element = rightPanelContentRef.current;
    rightPanelTweenRef.current?.kill();
    isRightPanelAnimatingRef.current = false;

    if (!wrapper || !element || !state.rightPanelOpen) return;

    gsap.set(wrapper, { width: rightPanelResize.width, overflow: "hidden", clearProps: "willChange" });
    gsap.set(element, { xPercent: 0, clearProps: "transform,willChange" });
  }, [rightPanelRef, rightPanelResize.isResizing, rightPanelResize.width, state.rightPanelOpen]);

  useEffect(() => {
    const wrapper = leftSidebarPanelRef.current;
    const element = leftSidebarContentRef.current;
    leftSidebarTweenRef.current?.kill();

    if (!isLeftSidebarRendered || !wrapper || !element) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      if (state.leftSidebar.open) {
        gsap.set(wrapper, { width: leftSidebarResize.width, clearProps: "width,willChange" });
        gsap.set(element, { xPercent: 0, clearProps: "transform,willChange" });
      } else {
        gsap.set(wrapper, { width: 0, clearProps: "width,willChange" });
        setIsLeftSidebarRendered(false);
      }
      return;
    }

    isLeftSidebarAnimatingRef.current = true;
    gsap.set(wrapper, { overflow: "hidden", willChange: "width" });
    gsap.set(element, { willChange: "transform" });

    if (state.leftSidebar.open) {
      gsap.set(wrapper, { width: 0 });
      gsap.set(element, { xPercent: -100 });
      leftSidebarTweenRef.current = gsap.timeline({
        onComplete: () => {
          isLeftSidebarAnimatingRef.current = false;
          gsap.set(wrapper, { width: leftSidebarWidthRef.current, clearProps: "willChange" });
          gsap.set(element, { xPercent: 0, clearProps: "transform,willChange" });
        },
      });
      leftSidebarTweenRef.current
        .to(wrapper, { width: leftSidebarWidthRef.current, duration: 0.34, ease: "power2.out" }, 0)
        .to(element, { xPercent: 0, duration: 0.34, ease: "power3.out" }, 0);
      return;
    }

    gsap.set(wrapper, { width: leftSidebarWidthRef.current });
    gsap.set(element, { xPercent: 0 });
    leftSidebarTweenRef.current = gsap.timeline({
      onComplete: () => {
        isLeftSidebarAnimatingRef.current = false;
        setIsLeftSidebarRendered(false);
        gsap.set(wrapper, { width: 0, clearProps: "willChange" });
        gsap.set(element, { xPercent: 0, clearProps: "transform,willChange" });
      },
    });
    leftSidebarTweenRef.current
      .to(element, { xPercent: -100, duration: 0.34, ease: "power3.inOut" }, 0)
      .to(wrapper, { width: 0, duration: 0.34, ease: "power2.inOut" }, 0);
  }, [isLeftSidebarRendered, leftSidebarPanelRef, state.leftSidebar.open]);

  useEffect(() => {
    return () => {
      leftSidebarTweenRef.current?.kill();
    };
  }, []);

  useEffect(() => {
    const wrapper = rightPanelRef.current;
    const element = rightPanelContentRef.current;
    rightPanelTweenRef.current?.kill();

    if (!isRightPanelRendered || !wrapper || !element) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      if (state.rightPanelOpen) {
        gsap.set(wrapper, { width: rightPanelResize.width, clearProps: "width,willChange" });
        gsap.set(element, { xPercent: 0, clearProps: "transform,willChange" });
      } else {
        gsap.set(wrapper, { width: 0, clearProps: "width,willChange" });
        setIsRightPanelRendered(false);
      }
      return;
    }

    isRightPanelAnimatingRef.current = true;
    gsap.set(wrapper, { overflow: "hidden", willChange: "width" });
    gsap.set(element, { willChange: "transform" });

    if (state.rightPanelOpen) {
      gsap.set(wrapper, { width: 0 });
      gsap.set(element, { xPercent: 100 });
      rightPanelTweenRef.current = gsap.timeline({
        onComplete: () => {
          isRightPanelAnimatingRef.current = false;
          gsap.set(wrapper, { width: rightPanelWidthRef.current, clearProps: "willChange" });
          gsap.set(element, { xPercent: 0, clearProps: "transform,willChange" });
        },
      });
      rightPanelTweenRef.current
        .to(wrapper, { width: rightPanelWidthRef.current, duration: 0.34, ease: "power2.out" }, 0)
        .to(element, { xPercent: 0, duration: 0.34, ease: "power3.out" }, 0);
      return;
    }

    gsap.set(wrapper, { width: rightPanelWidthRef.current });
    gsap.set(element, { xPercent: 0 });
    rightPanelTweenRef.current = gsap.timeline({
      onComplete: () => {
        isRightPanelAnimatingRef.current = false;
        setIsRightPanelRendered(false);
        gsap.set(wrapper, { width: 0, clearProps: "willChange" });
        gsap.set(element, { xPercent: 0, clearProps: "transform,willChange" });
      },
    });
    rightPanelTweenRef.current
      .to(element, { xPercent: 100, duration: 0.34, ease: "power3.inOut" }, 0)
      .to(wrapper, { width: 0, duration: 0.34, ease: "power2.inOut" }, 0);
  }, [isRightPanelRendered, rightPanelRef, state.rightPanelOpen]);

  useEffect(() => {
    return () => {
      rightPanelTweenRef.current?.kill();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      if (event.key.toLowerCase() === "r" && state.selectedNode) {
        event.preventDefault();
        actions.handleTool("region");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions, state.selectedNode]);

  return (
    <div
      ref={rootRef}
      className="relative min-h-screen overflow-hidden bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]"
      style={state.canvasThemeStyle}
    >
      <div
        aria-hidden="true"
        className="hidden"
        style={{
          background: [
            // Top-left warm bloom — ivory light refraction
            "radial-gradient(ellipse 58% 36% at 0% 0%, rgba(255,255,255,0.72), transparent 62%)",
            // Top-right cool atmospheric depth
            "radial-gradient(ellipse 42% 28% at 100% 0%, rgba(148,163,184,0.08), transparent 58%)",
            // Subtle bottom vignette for depth
            "linear-gradient(180deg, rgba(255,255,255,0.24), transparent 22%, transparent 78%, rgba(15,23,42,0.035))",
          ].join(", "),
        }}
      />
      {/* ── Desktop layout ──────────────────────────────────────────────────── */}
      <div className="hidden h-screen w-screen flex-col overflow-hidden bg-[var(--canvas-theme-surface)] xl:flex">
        <div data-enter className="relative flex min-h-0 flex-1">
          {/* Left sidebar */}
          {isLeftSidebarRendered ? (
            <div
              ref={leftSidebarPanelRef}
              className="relative h-full shrink-0 overflow-hidden"
              data-canvas-ui="true"
              data-shell-panel="left"
            >
              <div
                ref={leftSidebarContentRef}
                className="h-full shrink-0"
                style={{ width: leftSidebarResize.width }}
              >
                <CanvasLeftSidebar
                  language={state.language}
                  panel={state.leftSidebar.panel}
                  folders={library.folders}
                  activeFolderId={library.activeFolderId}
                  selectedAssetId={state.selectedLibraryAssetId}
                  onSelectFolder={library.setActiveFolderId}
                  onSelectAsset={actions.setSelectedLibraryAssetId}
                  onCreateFolder={library.createFolder}
                  onRenameFolder={library.renameFolder}
                  onDeleteFolder={actions.deleteLibraryFolder}
                  onDeleteAsset={actions.removeLibraryAsset}
                  onAddAssetToCanvas={(asset) => {
                    actions.setSelectedLibraryAssetId(asset.id);
                    actions.setPendingLibraryInsertAsset(asset);
                  }}
                  onUpsertPresetGroup={({ replaceAllChildren = false, ...params }) => {
                    actions.upsertPresetGroup(params, replaceAllChildren);
                  }}
                  onUploadAssets={actions.uploadAssetsToFolder}
                  onSyncLibraryFromBucket={actions.syncLibraryFromBucket}
                  onToast={actions.showToast}
                  onClose={actions.closeLeftSidebar}
                />
              </div>
              <ResizeHandle
                side="right"
                ariaLabel="Resize left sidebar"
                isResizing={leftSidebarResize.isResizing}
                onPointerDown={leftSidebarResize.startResize}
                onDoubleClick={leftSidebarResize.resetWidth}
              />
            </div>
          ) : null}

          {/* Canvas board */}
          <CanvasBoard
            language={state.language}
            onLanguageChange={actions.setLanguage}
            selectedItem={state.selectedItem}
            activeTool={state.activeTool}
            markers={state.markers}
            addedObjects={state.addedObjects}
            nodes={state.nodes}
            edges={state.edges}
            onSelect={actions.handleSelectItem}
            onImageAction={actions.handleImageAction}
            sketchLines={state.sketchLines}
            sketchGroups={state.sketchGroups}
            penStrokes={state.penStrokes}
            penSettings={state.penSettings}
            selectedSketchLineIds={state.selectedSketchLineIds}
            onAddSketchLine={actions.addSketchLine}
            onAddPenStroke={actions.addPenStroke}
            onDeletePenStroke={actions.deletePenStroke}
            onReplacePenStrokes={actions.replacePenStrokes}
            onPenSettingsChange={actions.setPenSettings}
            onSelectSketchLine={actions.selectSketchLine}
            onSelectSketchGroup={(id) => actions.handleSelectItem({ type: "sketchGroup", id })}
            onTool={actions.handleTool}
            onQuickEdit={() => actions.setShowQuickEditModal(true)}
            onMultiAngle={() => actions.setShowMultiAngleModal(true)}
            onAddObject={() => actions.setShowAddObjectMenu(true)}
            onRealityCheck={() => actions.setShowFeasibilityReviewPanel(true)}
            onGenerate={actions.generateConcept}
            onToast={actions.showToast}
            onNodesChange={actions.setNodes}
            onEdgesChange={actions.setEdges}
            activeGenerationTargetId={state.activeGenerationTargetId}
            activeNodeId={state.activeNodeId}
            onSetActiveNode={actions.setActiveNodeId}
            canvasThemeColor={state.canvasThemeColor}
            onCanvasThemeChange={actions.setCanvasThemeColor}
            activeLeftSidebarPanel={state.leftSidebar.open ? state.leftSidebar.panel : null}
            onToggleLeftSidebarPanel={actions.toggleLeftSidebarPanel}
            miniMapOpen={state.miniMapOpen}
            onToggleMiniMap={actions.toggleMiniMap}
            pendingLibraryInsertAsset={state.pendingLibraryInsertAsset}
            onConsumePendingLibraryInsert={actions.consumePendingLibraryInsert}
            pendingPresetGroupInsert={state.pendingPresetGroupInsert}
            onConsumePendingPresetGroupInsert={actions.consumePendingPresetGroupInsert}
            isResizingPanel={state.isResizingPanel}
            selectedNode={state.selectedNode}
            onSetActivePresetChild={actions.setActivePresetChild}
            onRemovePresetChild={actions.removePresetChild}
            onMovePresetChild={actions.movePresetChild}
            brushMode={state.brushMode}
            regionSelectionTool={state.regionSelectionTool}
            brushSize={state.brushSize}
            brushSoftness={state.brushSoftness}
            maskTrigger={state.maskTrigger}
            onBeginMaskChange={actions.pushMaskHistoryCheckpoint}
            onCommitMask={actions.commitMaskData}
            onUndoMask={actions.undoMask}
            onRedoMask={actions.redoMask}
            onBrushSizeChange={actions.setBrushSize}
            onBrushSoftnessChange={actions.setBrushSoftness}
            onCloseRegionEditor={actions.exitRegionMode}
          />

          {/* Right panel */}
          {isRightPanelRendered ? (
            <div
              ref={rightPanelRef}
              className="relative h-full shrink-0"
              style={{ width: state.rightPanelOpen ? rightPanelResize.width : 0 }}
              data-canvas-ui="true"
              data-shell-panel="right"
            >
              <div
                ref={rightPanelContentRef}
                className="h-full shrink-0"
                style={{ width: rightPanelResize.width }}
              >
                <AiChatSidebar
                  canvasId="canvas-main"
                  projectId={projectId}
                  targetTitle={state.activeGenerationTarget?.title ?? null}
                  targetImageUrl={state.activeGenerationTarget?.imageUrl ?? null}
                  targetReferenceCount={state.activeGenerationContext?.imageReferences.length ?? 0}
                  targetPresetCount={state.activeGenerationContext?.presetReferences.length ?? 0}
                  connectedImageReferences={state.activeGenerationContext?.imageReferences ?? []}
                  connectedPresetReferences={state.activeGenerationContext?.presetReferences ?? []}
                  generationAssistantMessages={state.generationAssistantMessages}
                  draft={state.promptText}
                  onDraftChange={actions.setPromptText}
                  onClearLinkedImage={() => actions.handleSelectItem({ type: "none" })}
                  onClose={actions.closeRightPanel}
                  onToast={actions.showToast}
                />
              </div>
              <ResizeHandle
                side="left"
                ariaLabel="Resize right panel"
                isResizing={rightPanelResize.isResizing}
                onPointerDown={rightPanelResize.startResize}
                onDoubleClick={rightPanelResize.resetWidth}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={actions.openRightPanel}
              className="absolute right-6 top-20 z-[70] grid h-10 w-10 place-items-center rounded-[14px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-icon)] shadow-[0_12px_28px_var(--canvas-theme-shadow)] transition hover:-translate-y-0.5 hover:border-[var(--canvas-theme-border-strong)]"
              title={state.language === "vi" ? "Mở chat" : "Open chat"}
            >
              <MessageSquare className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {state.activeTool === "region" && state.selectedNode ? (
          <RegionBrushToolbar workspace={canvas} />
        ) : null}

        {/* ── Modals & overlays ────────────────────────────────────────────── */}
        <QuickEditModal
          open={modals.showQuickEditModal}
          promptText={state.promptText}
          onPromptChange={actions.setPromptText}
          onClose={() => actions.setShowQuickEditModal(false)}
          onApply={actions.applyQuickEdit}
        />

        {state.selectedSketchLineIds.length > 0 && (
          <div className="fixed bottom-28 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-[18px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-4 py-3 shadow-[0_16px_36px_var(--canvas-theme-shadow)]">
            <span className="text-xs font-black text-[var(--canvas-theme-text-muted)]">
              {state.selectedSketchLineIds.length} sketch line
              {state.selectedSketchLineIds.length === 1 ? "" : "s"} selected
            </span>
            <button
              type="button"
              onClick={() => actions.setShowGroupNameModal(true)}
              className="rounded-xl bg-[var(--canvas-theme-active)] px-3 py-2 text-xs font-black text-[var(--canvas-theme-active-text)] shadow-[0_12px_24px_var(--canvas-theme-shadow)]"
            >
              Group + Name Tag
            </button>
          </div>
        )}

        <GroupNameTagModal
          open={modals.showGroupNameModal}
          lineCount={state.selectedSketchLineIds.length}
          onClose={() => actions.setShowGroupNameModal(false)}
          onCreate={actions.groupSelectedSketchLines}
        />
        <MultiAngleModal
          open={modals.showMultiAngleModal}
          onClose={() => actions.setShowMultiAngleModal(false)}
          onGenerate={actions.generateAngles}
        />
        <AddObjectMenu
          open={modals.showAddObjectMenu}
          onClose={() => actions.setShowAddObjectMenu(false)}
          onAdd={actions.addObject}
        />
        <FeasibilityReviewPanel
          open={modals.showFeasibilityReviewPanel}
          onClose={() => actions.setShowFeasibilityReviewPanel(false)}
        />

        {/* Toast */}
        {toast && (
          <div className="toast-message fixed left-1/2 top-20 z-[120] -translate-x-1/2 rounded-[14px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-4 py-2 text-sm font-black text-[var(--canvas-theme-text)] shadow-[0_12px_28px_var(--canvas-theme-shadow)]">
            {toast}
          </div>
        )}
      </div>

      {/* ── Mobile / small screen fallback ──────────────────────────────────── */}
      <div className="grid min-h-screen place-items-center bg-[#F7F8FA] p-8 xl:hidden">
        <div className="max-w-md rounded-3xl border border-[#E5E7EB] bg-white p-8 text-center shadow-xl shadow-black/8">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#111827] text-lg font-black text-white">
            C
          </div>
          <h1 className="mt-6 text-2xl font-black text-[#0A0A0A]">Canvas is best on desktop.</h1>
          <p className="mt-3 text-sm leading-6 text-[#667085]">
            Open this workspace on a larger screen to use object selection, contextual tools,
            markers, regions, and AI actions.
          </p>
        </div>
      </div>
    </div>
  );
}
