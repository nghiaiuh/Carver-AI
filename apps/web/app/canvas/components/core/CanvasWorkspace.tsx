/*
 * CanvasWorkspace – UI shell only.
 *
 * All state, derived values, and action callbacks live in useCanvasWorkspace.
 * This component owns only:
 *   - The GSAP entry animation (needs a DOM ref in component scope).
 *   - The JSX layout: left sidebar, canvas board, right panel, modals, toast.
 */

"use client";

import { useEffect } from "react";
import { MessageSquare, PanelLeftOpen } from "lucide-react";
import { gsap, useGSAP } from "../../../components/gsapSetup";
import { useCanvasWorkspace } from "../../hooks/useCanvasWorkspace";
import { LEFT_SIDEBAR_PANEL_LABELS } from "../../types/canvas";
import AddObjectMenu from "../panels/AddObjectMenu";
import CanvasBoard from "./CanvasBoard";
import EditorLeftSidebar from "../panels/EditorLeftSidebar";
import EditorRightPanel from "../panels/EditorRightPanel";
import GroupNameTagModal from "../panels/GroupNameTagModal";
import MultiAngleModal from "../panels/MultiAngleModal";
import QuickEditModal from "../panels/QuickEditModal";
import RealityCheckPanel from "../panels/RealityCheckPanel";
import ResizeHandle from "../widgets/ResizeHandle";
import RegionBrushToolbar from "../widgets/RegionBrushToolbar";

export default function CanvasWorkspace() {
  const canvas = useCanvasWorkspace();
  const { rootRef, leftSidebarPanelRef, rightPanelRef, leftSidebarResize, rightPanelResize } =
    canvas;
  const { state, modals, toast, actions, library } = canvas;

  // GSAP entry animation – needs rootRef attached to DOM, so it lives here.
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
            "radial-gradient(ellipse 60% 40% at 0% 0%, rgba(255,252,245,0.55), transparent 60%)",
            // Top-right cool atmospheric depth
            "radial-gradient(ellipse 45% 30% at 100% 0%, rgba(12,15,20,0.05), transparent 55%)",
            // Subtle bottom vignette for depth
            "radial-gradient(ellipse 80% 40% at 50% 100%, rgba(20,14,8,0.04), transparent 70%)",
          ].join(", "),
        }}
      />
      {/* ── Desktop layout ──────────────────────────────────────────────────── */}
      <div className="hidden h-screen w-screen flex-col overflow-hidden bg-[var(--canvas-theme-surface)] xl:flex">
        <div data-enter className="relative flex min-h-0 flex-1">
          {/* Left sidebar */}
          {state.leftSidebar.open ? (
            <div
              ref={leftSidebarPanelRef}
              className="relative h-full shrink-0"
              style={{ width: leftSidebarResize.width }}
              data-canvas-ui="true"
            >
              <EditorLeftSidebar
                language={state.language}
                panel={state.leftSidebar.panel}
                folders={library.folders}
                activeFolderId={library.activeFolderId}
                selectedAssetId={state.selectedLibraryAssetId}
                onSelectFolder={library.setActiveFolderId}
                onSelectAsset={actions.setSelectedLibraryAssetId}
                onCreateFolder={library.createFolder}
                onRenameFolder={library.renameFolder}
                onDeleteFolder={library.deleteFolder}
                onDeleteAsset={library.removeAssetFromFolder}
                onAddAssetToCanvas={(asset) => {
                  actions.setSelectedLibraryAssetId(asset.id);
                  actions.setPendingLibraryInsertAsset(asset);
                }}
                onUpsertPresetGroup={({ replaceAllChildren = false, ...params }) => {
                  actions.upsertPresetGroup(params, replaceAllChildren);
                }}
                onUploadAssets={actions.uploadAssetsToFolder}
                onToast={actions.showToast}
                onClose={actions.closeLeftSidebar}
              />
              <ResizeHandle
                side="right"
                ariaLabel="Resize left sidebar"
                isResizing={leftSidebarResize.isResizing}
                onPointerDown={leftSidebarResize.startResize}
                onDoubleClick={leftSidebarResize.resetWidth}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={actions.openLeftSidebar}
              className="absolute left-3 top-3 z-[70] grid h-10 w-10 place-items-center rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/90 text-[var(--canvas-theme-icon)] shadow-[0_18px_45px_var(--canvas-theme-shadow)] backdrop-blur-md"
              title={`Open ${LEFT_SIDEBAR_PANEL_LABELS[state.leftSidebar.panel]}`}
            >
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            </button>
          )}

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
            mockConcepts={state.mockConcepts}
            angleResults={state.outputAngles}
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
            onRealityCheck={() => actions.setShowRealityCheckPanel(true)}
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
          {state.rightPanelOpen ? (
            <div
              ref={rightPanelRef}
              className="relative h-full shrink-0"
              style={{ width: rightPanelResize.width }}
              data-canvas-ui="true"
            >
              <EditorRightPanel
                canvasId="canvas-main"
                targetTitle={state.activeGenerationTarget?.title ?? null}
                targetImageUrl={state.activeGenerationTarget?.imageUrl ?? null}
                targetReferenceCount={state.activeGenerationContext?.imageReferences.length ?? 0}
                targetPresetCount={state.activeGenerationContext?.presetReferences.length ?? 0}
                connectedImageReferences={state.activeGenerationContext?.imageReferences ?? []}
                connectedPresetReferences={state.activeGenerationContext?.presetReferences ?? []}
                draft={state.promptText}
                onDraftChange={actions.setPromptText}
                onClearLinkedImage={() => actions.handleSelectItem({ type: "none" })}
                onClose={actions.closeRightPanel}
                onToast={actions.showToast}
              />
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
              className="absolute right-3 top-3 z-[70] grid h-10 w-10 place-items-center rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/90 text-[var(--canvas-theme-icon)] shadow-[0_18px_45px_var(--canvas-theme-shadow)] backdrop-blur-md"
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
          <div className="fixed bottom-28 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-[22px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/94 px-4 py-3 shadow-[0_24px_60px_var(--canvas-theme-shadow)] backdrop-blur-xl">
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
        <RealityCheckPanel
          open={modals.showRealityCheckPanel}
          onClose={() => actions.setShowRealityCheckPanel(false)}
        />

        {/* Toast */}
        {toast && (
          <div className="toast-message fixed left-1/2 top-20 z-[120] -translate-x-1/2 rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-4 py-2 text-sm font-black text-[var(--canvas-theme-text)] shadow-2xl shadow-[var(--canvas-theme-shadow)]">
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
