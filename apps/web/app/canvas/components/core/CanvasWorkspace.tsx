/*
 * CanvasWorkspace - UI shell only.
 *
 * All state, derived values, and action callbacks live in useCanvasWorkspace.
 * This component owns only:
 *   - The GSAP entry animation (needs a DOM ref in component scope).
 *   - The JSX layout: studio chrome, canvas board, right panel, modals, toast.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { gsap, useGSAP } from "../../../components/gsapSetup";
import { useCanvasWorkspace } from "../../hooks/useCanvasWorkspace";
import type { PresetGroupCategory } from "../../types/canvas";
import type { LibraryAsset } from "../../types/library";
import AddObjectMenu from "../panels/AddObjectMenu";
import CanvasBoard from "./CanvasBoard";
import AiChatSidebar from "../panels/AiChatSidebar";
import CanvasAssetLibraryModal from "./CanvasAssetLibraryModal";
import ContextualAIComposer from "./ContextualAIComposer";
import SceneRecipeBar, { type SceneRecipeItemId } from "./SceneRecipeBar";
import StudioHeader from "./StudioHeader";
import StudioToolRail from "./StudioToolRail";
import GroupNameTagModal from "../panels/GroupNameTagModal";
import MultiAngleModal from "../panels/MultiAngleModal";
import QuickEditModal from "../panels/QuickEditModal";
import FeasibilityReviewPanel from "../panels/FeasibilityReviewPanel";
import ResizeHandle from "../widgets/ResizeHandle";
import RegionBrushToolbar from "../widgets/RegionBrushToolbar";
import { buildCanvasSnapshotWithGraph } from "../../utils/canvasGenerationContext";
import { isPresetGroupNode } from "../../utils/presetGroupHelpers";

export default function CanvasWorkspace({ projectId }: { projectId?: string }) {
  const canvas = useCanvasWorkspace({ projectId });
  const { rootRef, rightPanelRef, rightPanelResize } = canvas;
  const { state, modals, toast, actions, library } = canvas;
  const [isRightPanelRendered, setIsRightPanelRendered] = useState(state.rightPanelOpen);
  const [activeRecipeModal, setActiveRecipeModal] = useState<SceneRecipeItemId | null>(null);
  const rightPanelContentRef = useRef<HTMLDivElement | null>(null);
  const rightPanelTweenRef = useRef<gsap.core.Timeline | null>(null);
  const isRightPanelAnimatingRef = useRef(false);
  const rightPanelWidthRef = useRef(rightPanelResize.width);

  useEffect(() => {
    rightPanelWidthRef.current = rightPanelResize.width;
  }, [rightPanelResize.width]);

  // GSAP entry animation needs rootRef attached to DOM, so it lives here.
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
    if (state.rightPanelOpen) {
      queueMicrotask(() => setIsRightPanelRendered(true));
    }
  }, [state.rightPanelOpen]);

  const snapshotStatusText = useMemo(() => {
    if (!projectId) return "Local canvas";
    if (state.isSnapshotLoading) return "Loading snapshot";
    if (state.isSnapshotSaving) return "Saving version";
    if (state.isDraftSaving) return "Saving local draft";
    if (!state.currentSnapshotMeta) {
      return state.hasUnsavedSnapshotChanges ? "Unsaved changes" : "Not saved yet";
    }
    return state.hasUnsavedSnapshotChanges
      ? `Unsaved changes - v${state.currentSnapshotMeta.version}`
      : `Saved - v${state.currentSnapshotMeta.version}`;
  }, [
    projectId,
    state.currentSnapshotMeta,
    state.hasUnsavedSnapshotChanges,
    state.isDraftSaving,
    state.isSnapshotLoading,
    state.isSnapshotSaving,
  ]);

  const projectName = state.nodes[0]?.title || "Living Landscape Studio";
  const siteLabel = state.activeGenerationTarget?.title || state.nodes[0]?.title || "Select site";
  const recipeCounts = useMemo(() => {
    const groups = state.nodes.filter(isPresetGroupNode);
    return {
      style: groups.filter((node) => node.presetGroup.category === "garden-styles" || node.presetGroup.category === "environment").length,
      plants: groups.filter((node) => node.presetGroup.category === "plants" || node.presetGroup.category === "planting-zones").length,
      materials: groups.filter((node) => node.presetGroup.category === "material" || node.presetGroup.category === "rocks-terrain").length,
      objects: groups.filter((node) => node.presetGroup.category === "decor" || node.presetGroup.category === "hardscape").length,
    };
  }, [state.nodes]);

  const addLibraryAssetsFromRecipe = (assets: LibraryAsset[]) => {
    if (assets.length === 0) return;

    if (activeRecipeModal === "site") {
      const asset = assets[0];
      actions.setSelectedLibraryAssetId(asset.id);
      actions.setPendingLibraryInsertAsset(asset);
      actions.showToast("Site image added to board");
      return;
    }

    const categoryByRecipe: Partial<Record<SceneRecipeItemId, PresetGroupCategory>> = {
      style: "garden-styles",
      plants: "plants",
      materials: "material",
      objects: "decor",
      light: "lighting",
      season: "environment",
    };
    const category = activeRecipeModal ? categoryByRecipe[activeRecipeModal] : undefined;
    if (!category) return;
    const recipeLabel = activeRecipeModal ?? "reference";

    actions.upsertPresetGroup(
      {
        category,
        title: recipeLabel === "style" ? "Style" : recipeLabel,
        children: assets.map((asset, index) => ({
          id: `${asset.id}-${Date.now()}-${index}`,
          slot: asset.metadata?.categoryHint ?? recipeLabel,
          label: asset.title ?? `Reference ${index + 1}`,
          imageSrc: asset.previewSrc ?? asset.originalSrc ?? asset.thumbnailSrc ?? asset.src,
          prompt: asset.prompt ?? null,
          order: index,
          assetId: asset.id,
          sourceFolderId: asset.folderId,
          metadata: {
            notes: asset.metadata?.speciesName ?? asset.metadata?.categoryHint ?? undefined,
          },
        })),
        sourceFolderId: assets[0]?.folderId,
      },
      false,
    );
    actions.showToast(`${assets.length} asset${assets.length === 1 ? "" : "s"} added to scene recipe`);
  };

  useEffect(() => {
    const wrapper = rightPanelRef.current;
    if (!wrapper || !isRightPanelRendered || !state.rightPanelOpen || isRightPanelAnimatingRef.current) return;
    gsap.set(wrapper, { width: rightPanelResize.width, clearProps: "willChange" });
  }, [isRightPanelRendered, rightPanelRef, rightPanelResize.width, state.rightPanelOpen]);

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
        queueMicrotask(() => setIsRightPanelRendered(false));
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
  }, [isRightPanelRendered, rightPanelRef, rightPanelResize.width, state.rightPanelOpen]);

  useEffect(() => {
    return () => {
      rightPanelTweenRef.current?.kill();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void actions.saveVersion();
        return;
      }

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
      {/* Desktop layout */}
      <div className="hidden h-screen w-screen flex-col overflow-hidden bg-[var(--canvas-theme-surface)] xl:flex">
        {state.draftWarning ? (
          <div className="border-b border-[var(--canvas-theme-border)] bg-amber-50 px-4 py-2 text-sm text-amber-900">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
              <p>{state.draftWarning}</p>
              {state.draftConflict ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void actions.restoreLocalDraft()}
                    className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                  >
                    Restore local draft
                  </button>
                  <button
                    type="button"
                    onClick={() => void actions.useSavedVersion()}
                    className="rounded-full border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                  >
                    Use saved version
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <StudioHeader
          projectName={projectName}
          snapshotStatus={snapshotStatusText}
          creditsAmount={state.creditsAmount}
          isSaving={state.isSnapshotSaving}
          hasUnsavedChanges={state.hasUnsavedSnapshotChanges}
          onSave={() => void actions.saveVersion()}
          onOpenHistory={actions.openRightPanel}
          onExport={() => actions.showToast("Export flow coming next")}
          onUndo={() => actions.showToast("Use Ctrl+Z to undo the latest board edit")}
          onRedo={() => actions.showToast("Use Ctrl+Shift+Z to redo the latest board edit")}
        />
        <div data-enter className="relative flex min-h-0 flex-1 bg-[#F4F0E7]">
          <StudioToolRail
            activeTool={state.activeTool}
            onTool={actions.handleTool}
            onAddObject={() => actions.setShowAddObjectMenu(true)}
            onUpload={() => setActiveRecipeModal("site")}
          />

          {/* Canvas board */}
          <div className="relative min-w-0 flex-1 overflow-hidden">
          <CanvasBoard
            projectId={projectId}
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
            onSelectSketchLine={actions.selectSketchLine}
            onSelectSketchGroup={(id) => actions.handleSelectItem({ type: "sketchGroup", id })}
            onTool={actions.handleTool}
            onQuickEdit={() => actions.setShowQuickEditModal(true)}
            onMultiAngle={() => actions.setShowMultiAngleModal(true)}
            onAddObject={() => actions.setShowAddObjectMenu(true)}
            onRealityCheck={() => actions.setShowFeasibilityReviewPanel(true)}
            onToast={actions.showToast}
            onNodesChange={actions.setNodes}
            onEdgesChange={actions.setEdges}
            activeGenerationTargetId={state.activeGenerationTargetId}
            activeNodeId={state.activeNodeId}
            onSetActiveNode={actions.setActiveNodeId}
            isSnapshotLoading={state.isSnapshotLoading}
            isSnapshotSaving={state.isSnapshotSaving}
            isDraftSaving={state.isDraftSaving}
            currentSnapshotMeta={state.currentSnapshotMeta}
            hasUnsavedSnapshotChanges={state.hasUnsavedSnapshotChanges}
            creditsAmount={state.creditsAmount}
            miniMapOpen={state.miniMapOpen}
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
            onSaveVersion={() => void actions.saveVersion()}
            studioChrome
            onPersistCanvasNodeImageAsset={actions.persistCanvasNodeImageAsset}
          />

          <ContextualAIComposer
            targetTitle={state.activeGenerationTarget?.title ?? null}
            promptText={state.promptText}
            isGenerating={Boolean(state.pendingGenerationJob)}
            onPromptChange={actions.setPromptText}
            onGenerate={actions.generateConcept}
            onOpenHistory={actions.openRightPanel}
            onEnhance={() => actions.showToast("Open History to use the full prompt enhancer")}
          />

          <SceneRecipeBar
            siteLabel={siteLabel}
            styleCount={recipeCounts.style}
            plantCount={recipeCounts.plants}
            materialCount={recipeCounts.materials}
            objectCount={recipeCounts.objects}
            onOpen={setActiveRecipeModal}
            onGenerate={actions.generateConcept}
          />

          <CanvasAssetLibraryModal
            open={Boolean(activeRecipeModal)}
            activeItem={activeRecipeModal}
            folders={library.folders}
            onClose={() => setActiveRecipeModal(null)}
            onAddAssets={addLibraryAssetsFromRecipe}
          />

          {/* Right panel */}
          {isRightPanelRendered && state.rightPanelOpen ? (
            <div
              ref={rightPanelRef}
              className="absolute inset-y-0 right-0 z-[110] w-[420px] border-l border-[#D8D2C3] bg-[#FFFDF8] shadow-[-24px_0_70px_rgba(23,50,37,0.16)]"
              data-canvas-ui="true"
              data-shell-panel="right"
            >
              <div
                ref={rightPanelContentRef}
                className="h-full"
              >
                <AiChatSidebar
                  canvasId="canvas-main"
                  projectId={projectId}
                  targetNodeId={state.activeGenerationTarget?.id ?? null}
                  targetTitle={state.activeGenerationTarget?.title ?? null}
                  targetImageUrl={state.activeGenerationTarget?.imageUrl ?? null}
                  generationContext={state.activeGenerationContext}
                  generationSnapshot={buildCanvasSnapshotWithGraph({
                    nodes: state.nodes,
                    edges: state.edges,
                    activeGenerationTargetId: state.activeGenerationTargetId,
                  })}
                  connectedImageReferences={state.activeGenerationContext?.imageReferences ?? []}
                  connectedPresetReferences={state.activeGenerationContext?.presetReferences ?? []}
                  generationAssistantMessages={state.generationAssistantMessages}
                  draft={state.promptText}
                  onDraftChange={actions.setPromptText}
                  onCreditsChange={(creditsRemaining) => {
                    if (typeof creditsRemaining === "number") {
                      void actions.refreshProfileCredits().catch(() => undefined);
                    }
                  }}
                  onClearLinkedImage={() => actions.handleSelectItem({ type: "none" })}
                  onGenerationComplete={({ job, targetNodeId: completedTargetNodeId }) =>
                    actions.applyCompletedGenerationJob({
                      job,
                      targetNodeId: completedTargetNodeId,
                      syncAssistantMessage: false,
                    })}
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
              className="hidden"
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
      </div>

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
