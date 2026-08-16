/*
 * CanvasWorkspace - UI shell only.
 *
 * All state, derived values, and action callbacks live in useCanvasWorkspace.
 * This component owns only:
 *   - The GSAP entry animation (needs a DOM ref in component scope).
 *   - The JSX layout: studio chrome, canvas board, right panel, modals, toast.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gsap, useGSAP } from "../../../components/gsapSetup";
import { useCanvasWorkspace } from "../../hooks/useCanvasWorkspace";
import type { PresetGroupCategory } from "../../types/canvas";
import type { LibraryAsset } from "../../types/library";
import AddObjectMenu from "../panels/AddObjectMenu";
import CanvasBoard from "./CanvasBoard";
import CanvasAssetLibraryModal from "./CanvasAssetLibraryModal";
import type { SceneRecipeItemId } from "../../types/sceneRecipe";
import FloatingProjectNav from "./FloatingProjectNav";
import FloatingControlCluster from "./FloatingControlCluster";
import FloatingToolRail from "./FloatingToolRail";
import FloatingPageControls from "./FloatingPageControls";
import FloatingZoomControls from "./FloatingZoomControls";
import QuickAddMenu from "../panels/QuickAddMenu";
import GroupNameTagModal from "../panels/GroupNameTagModal";
import MultiAngleModal from "../panels/MultiAngleModal";
import FeasibilityReviewPanel from "../panels/FeasibilityReviewPanel";
import RegionBrushToolbar from "../widgets/RegionBrushToolbar";
import DrawToolToolbar from "../widgets/DrawToolToolbar";

export default function CanvasWorkspace({ projectId }: { projectId?: string }) {
  const canvas = useCanvasWorkspace({ projectId });
  const { rootRef } = canvas;
  const { state, modals, toast, actions, library } = canvas;
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [isCanvasLocked, setIsCanvasLocked] = useState(false);
  const [activeRecipeModal, setActiveRecipeModal] = useState<SceneRecipeItemId | null>(null);
  const canvasHistoryActionsRef = useRef<{
    undo: () => void;
    redo: () => void;
  } | null>(null);
  const dismissDraftWarning = actions.dismissDraftWarning;
  const handleHistoryActionsChange = useCallback((nextActions: {
    undo: () => void;
    redo: () => void;
  } | null) => {
    canvasHistoryActionsRef.current = nextActions;
  }, []);
  const triggerUndo = useCallback(() => {
    canvasHistoryActionsRef.current?.undo();
  }, []);
  const triggerRedo = useCallback(() => {
    canvasHistoryActionsRef.current?.redo();
  }, []);
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

  useEffect(() => {
    if (!state.draftWarning) return;

    const timeout = window.setTimeout(() => {
      dismissDraftWarning();
    }, 5_000);

    return () => window.clearTimeout(timeout);
  }, [dismissDraftWarning, state.draftWarning]);

  return (
    <div
      ref={rootRef}
      className="relative min-h-screen overflow-hidden bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]"
      style={state.canvasThemeStyle}
      data-canvas-theme={state.canvasTheme}
    >
      {/* Desktop layout */}
      <div className="hidden h-screen w-screen flex-col overflow-hidden bg-[var(--canvas-theme-surface)] xl:flex">
        {state.draftWarning ? (
          <div className="fixed right-6 top-24 z-[130] w-[min(360px,calc(100vw-48px))] rounded-2xl border border-[#E8D8A8] bg-[#FFF9E8] px-4 py-3 text-sm text-[#6E4B00] shadow-[0_18px_45px_rgba(47,35,10,0.16)]">
            <div className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#D5961F]" />
              <p className="leading-5">{state.draftWarning}</p>
            </div>
          </div>
        ) : null}
        {/* Top-Left Floating Project Nav */}
        <div className="absolute left-6 top-4 z-[90]">
          <FloatingProjectNav
            projectName={projectName}
            snapshotStatus={snapshotStatusText}
            isSaving={state.isSnapshotSaving}
            hasUnsavedChanges={state.hasUnsavedSnapshotChanges}
            onSave={() => void actions.saveVersion()}
            onExport={() => actions.showToast("Exporting canvas workflow...")}
          />
        </div>

        {/* Top-Right Floating Control Cluster */}
        <div className="absolute right-6 top-4 z-[90]">
          <FloatingControlCluster
            creditsAmount={state.creditsAmount}
            onUndo={triggerUndo}
            onRedo={triggerRedo}
            onShare={() => actions.showToast("Share options opened")}
          />
        </div>

        {/* Floating Vertical Tool Rail */}
        <FloatingToolRail
          activeTool={state.activeTool}
          onTool={actions.handleTool}
          onAddNode={() => setQuickAddOpen(true)}
          onAddAssistantNode={actions.addAssistantNode}
          onOpenLibrary={() => setActiveRecipeModal("style")}
          onUndo={triggerUndo}
          onRedo={triggerRedo}
        />

        {/* Bottom-Left Page Controls */}
        <div className="absolute bottom-6 left-6 z-[90]">
          <FloatingPageControls
            currentPageName="Page 1"
            isLocked={isCanvasLocked}
            onToggleLock={() => setIsCanvasLocked(!isCanvasLocked)}
          />
        </div>

        {/* Bottom-Right Zoom Controls */}
        <div className="absolute bottom-6 right-6 z-[90]">
          <FloatingZoomControls
            zoomPercentage={state.viewportZoom * 100}
            theme={state.canvasTheme}
            onThemeChange={actions.setCanvasTheme}
            onZoomIn={() => actions.setViewportZoom(state.viewportZoom + 0.1)}
            onZoomOut={() => actions.setViewportZoom(state.viewportZoom - 0.1)}
            onZoomSelect={(zoomPercentage) => actions.setViewportZoom(zoomPercentage / 100)}
            onFitAll={() => actions.setViewportZoom(1)}
            onResetView={actions.resetViewport}
            onToggleMinimap={actions.toggleMiniMap}
            onGiveFeedback={() => actions.showToast("Feedback dialog opened")}
          />
        </div>

        {quickAddOpen ? (
          <QuickAddMenu
            open
            onClose={() => setQuickAddOpen(false)}
            onSelectType={(nodeType) => {
            switch (nodeType) {
              case "carver-generate":
                actions.addImageGeneratorNode();
                return;
              case "ai-brief":
                actions.addAssistantNode();
                return;
              case "camera-shot-set":
                actions.addCameraShotSetNode();
                return;
              case "upload-image":
                setActiveRecipeModal("site");
                actions.showToast("Choose a site image to add to the canvas");
                return;
              default:
                actions.showToast(`Added ${nodeType} node to canvas`);
                return;
            }
            }}
          />
        ) : null}

        <div data-enter className="relative flex min-h-0 flex-1 bg-[#FAF9F6]">
          {/* Canvas board */}
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <CanvasBoard
              projectId={projectId}
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
              onMultiAngle={() => actions.setShowMultiAngleModal(true)}
              onAddObject={() => actions.setShowAddObjectMenu(true)}
              onRealityCheck={() => actions.setShowFeasibilityReviewPanel(true)}
              onToast={actions.showToast}
              onNodesChange={actions.setNodes}
              onEdgesChange={actions.setEdges}
              viewportZoom={state.viewportZoom}
              viewportResetVersion={state.viewportResetVersion}
              onViewportZoomChange={actions.setViewportZoom}
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
              onPersistCanvasNodeImageAsset={actions.persistCanvasNodeImageAsset}
              onRunAssistantNode={actions.runAssistantNode}
              onRunImageGeneratorNode={actions.runImageGeneratorNode}
              onToggleCameraShot={actions.toggleCameraShot}
              generatorAssetUrls={state.resolvedGeneratorAssetUrls}
              onHistoryActionsChange={handleHistoryActionsChange}
            />

            <CanvasAssetLibraryModal
              open={Boolean(activeRecipeModal)}
              activeItem={activeRecipeModal}
              folders={library.folders}
              onClose={() => setActiveRecipeModal(null)}
              onAddAssets={addLibraryAssetsFromRecipe}
            />

          </div>

          {state.activeTool === "region" && state.selectedNode ? (
            <RegionBrushToolbar workspace={canvas} />
          ) : null}

          {state.activeTool === "pen" || state.activeTool === "eraser" ? (
            <DrawToolToolbar
              activeTool={state.activeTool}
              penSettings={state.penSettings}
              onTool={actions.handleTool}
              onPenSettingsChange={(update) =>
                actions.setPenSettings((current) => ({ ...current, ...update }))
              }
            />
          ) : null}

          {/* ── Modals & overlays ────────────────────────────────────────────── */}
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
            onGenerate={(shotIds) => {
              actions.addCameraShotSetNode(shotIds);
              actions.setShowMultiAngleModal(false);
            }}
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
