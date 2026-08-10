/*
 * CanvasNodeCard
 * Renders a single draggable image node on the canvas.
 * Receives all state and callbacks from CanvasBoard - no internal state except rendering.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { OPENAI_IMAGE_MODEL } from "@carver/shared";
import {
  IMAGE_GENERATOR_MAX_OUTPUT_COUNT,
  IMAGE_GENERATOR_MIN_OUTPUT_COUNT,
  MAX_IMAGE_GENERATOR_NODE_HEIGHT,
  MAX_IMAGE_GENERATOR_NODE_WIDTH,
  MIN_ASSISTANT_NODE_HEIGHT,
  MIN_ASSISTANT_NODE_WIDTH,
  MAX_ASSISTANT_NODE_HEIGHT,
  MAX_ASSISTANT_NODE_WIDTH,
  MIN_IMAGE_GENERATOR_NODE_HEIGHT,
  MIN_IMAGE_GENERATOR_NODE_WIDTH,
} from "../../types/canvas";
import type {
  AddedObject,
  CanvasAssistantNode,
  CanvasConnectionKind,
  CanvasEdge,
  CanvasImageGeneratorNode,
  CanvasNode,
  CanvasTextNode,
  EditorTool,
  Marker,
  SelectedItem,
  SketchGroup,
  SketchLine,
} from "../../types/canvas";
import {
  Box,
  ChevronDown,
  Copy,
  Image as ImageIcon,
  ImagePlus,
  MapPin,
  Minus,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Type,
} from "lucide-react";
import Sparkles from "../../../components/icons/CarverSparklesIcon";
import ContextualToolbar from "../widgets/ContextualToolbar";
import {
  AGGREGATE_HANDLE_OFFSET,
  getNodeConnectionCountsBySide,
  type ImageHandlePosition,
} from "./canvasConnectionGeometry";
import {
  getCanvasNodeVisualScale,
  getDefaultSourcePortId,
  getNodeSemanticPorts,
  getPortsBySide,
  isImageOutputOnlyNode,
} from "../../utils/canvasNodePorts";
import {
  getCornerAnchoredPortOffsetY,
  getGenericNodePortOffsetY,
  getImageOutputPortOffsetY,
} from "../../utils/canvasPortLayout";
import { isPresetGroupNode } from "../../utils/presetGroupHelpers";

const DEFAULT_DEVICE_PIXEL_RATIO = 1;

function getDevicePixelRatio() {
  if (typeof window === "undefined") return DEFAULT_DEVICE_PIXEL_RATIO;
  return Math.max(window.devicePixelRatio || DEFAULT_DEVICE_PIXEL_RATIO, DEFAULT_DEVICE_PIXEL_RATIO);
}

function getContainedRect({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
}: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (sourceRatio > targetRatio) {
    const height = targetWidth / sourceRatio;
    return {
      x: 0,
      y: (targetHeight - height) / 2,
      width: targetWidth,
      height,
    };
  }

  const width = targetHeight * sourceRatio;
  return {
    x: (targetWidth - width) / 2,
    y: 0,
    width,
    height: targetHeight,
  };
}

function getNodeFrameClassName({
  selected,
  isGenerationTarget,
  isConnectionTarget,
}: {
  selected: boolean;
  isGenerationTarget: boolean;
  isConnectionTarget: boolean;
}) {
  if (selected) {
    return "border-[var(--canvas-theme-selection)] ring-2 ring-[var(--canvas-theme-selection-ring)] shadow-[0_8px_24px_var(--canvas-theme-selection-ring)]";
  }

  if (isGenerationTarget) {
    return "border-[var(--canvas-theme-selection)] ring-2 ring-[var(--canvas-theme-selection-ring)]";
  }

  if (isConnectionTarget) {
    return "border-[var(--canvas-theme-connector-active)] ring-2 ring-[var(--canvas-theme-guide-soft)]";
  }

  return "border-[var(--canvas-theme-border)] hover:border-[var(--canvas-theme-border-strong)] shadow-[0_4px_20px_rgba(0,0,0,0.03)]";
}

function getNodeKindLabel(role: CanvasNode["role"]) {
  if (role === "assistant") {
    return "Assistant";
  }

  if (role === "generator") {
    return "Image Generator";
  }

  if (role === "text") {
    return "Text note";
  }

  if (role === "output") {
    return "Image";
  }

  if (role === "reference") {
    return "Reference";
  }

  return "Object";
}

const ASSISTANT_PLACEHOLDER =
  "Assistant is your creative sidekick-powered by a large language model. You can type a prompt, or even use images for context. It understands what you mean, builds on your ideas, and helps you move faster.";

const ASSISTANT_MODEL_OPTIONS = [
  "GPT-5 Mini",
  "GPT-5.5",
  "Claude Sonnet 4.5",
  "Gemini 3.5 Flash",
] as const;

const ASSISTANT_OUTPUT_OPTIONS: ReadonlyArray<{
  value: CanvasAssistantNode["assistant"]["outputFormat"];
  label: string;
}> = [
  { value: "list", label: "Export as list" },
  { value: "text", label: "Export as text" },
];

const IMAGE_GENERATOR_MODEL_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: OPENAI_IMAGE_MODEL, label: OPENAI_IMAGE_MODEL },
] as const;

const IMAGE_GENERATOR_ASPECT_RATIO_OPTIONS: ReadonlyArray<{
  value: CanvasImageGeneratorNode["imageGenerator"]["aspectRatio"];
  label: string;
}> = [
  { value: "1:1", label: "1:1" },
  { value: "2:3", label: "2:3" },
  { value: "3:2", label: "3:2" },
];

type ResolvedGeneratorAssetUrls = Record<string, {
  thumbUrl: string;
  previewUrl: string;
  originalUrl: string;
  expiresAt: string;
}>;

type ConnectedGeneratorImageReference = {
  edgeId: string;
  sourceNodeId: string;
  title: string;
  previewUrl: string;
  assetId?: string;
};

type ConnectedGeneratorTextReference = {
  edgeId: string;
  sourceNodeId: string;
  text: string;
};

function sortInboundCanvasEdges(a: CanvasEdge, b: CanvasEdge) {
  if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
    return a.createdAt.localeCompare(b.createdAt);
  }

  return a.id.localeCompare(b.id);
}

function AssistantPopoverButton({
  label,
  isOpen,
  onToggle,
  options,
  onSelect,
  align = "left",
  disabled = false,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  onSelect: (value: string) => void;
  align?: "left" | "right";
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        className={[
          "inline-flex h-6 min-w-0 items-center gap-1 rounded-full bg-[var(--canvas-theme-surface-muted)] px-3 text-xs font-medium text-[var(--canvas-theme-text-soft)] opacity-80 transition",
          disabled ? "cursor-not-allowed opacity-45" : "hover:bg-[var(--canvas-theme-hover)]",
        ].join(" ")}
        title={label}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span className="max-w-32 truncate text-left text-xs">{label}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <ChevronDown className="h-3 w-3" strokeWidth={1.9} />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={[
              "absolute bottom-[calc(100%+10px)] z-20 min-w-[170px] rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-1.5 shadow-[0_18px_40px_var(--canvas-theme-shadow)] backdrop-blur-xl",
              align === "right" ? "right-0" : "left-0",
            ].join(" ")}
            role="menu"
          >
            {options.map((option) => {
              const selected = option.label === label;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={[
                    "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition",
                    selected
                      ? "bg-[var(--canvas-theme-hover)] text-[var(--canvas-theme-text)]"
                      : "text-[var(--canvas-theme-text-soft)] hover:bg-[var(--canvas-theme-hover)]",
                  ].join(" ")}
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => onSelect(option.value)}
                >
                  <span>{option.label}</span>
                  <span
                    className={[
                      "h-2 w-2 rounded-full transition",
                      selected ? "bg-[var(--canvas-theme-selection)]" : "bg-transparent",
                    ].join(" ")}
                  />
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AssistantNodeSurface({
  node,
  onUpdateNode,
  onRunAssistant,
}: {
  node: CanvasAssistantNode;
  onUpdateNode: (id: string, update: (node: CanvasNode) => CanvasNode) => void;
  onRunAssistant: (nodeId: string) => void | Promise<void>;
}) {
  const assistant = node.assistant;
  const showingResult = assistant.mode === "result";
  const isRunning = assistant.status === "generating";
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [openMenu, setOpenMenu] = useState<"model" | "output" | null>(null);

  const updateAssistant = (update: Partial<CanvasAssistantNode["assistant"]>) => {
    onUpdateNode(node.id, (current) =>
      current.kind === "assistant"
        ? {
            ...current,
            assistant: {
              ...current.assistant,
              ...update,
            },
          }
        : current,
    );
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!surfaceRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const runAssistant = () => {
    void onRunAssistant(node.id);
    setOpenMenu(null);
  };

  return (
    <div
      ref={surfaceRef}
      className="flex h-full w-full flex-col bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]"
      data-canvas-interactive="true"
      onPointerDown={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("button, textarea, input, select")) {
          event.stopPropagation();
        }
      }}
    >
      <div className="flex h-12 items-center justify-between overflow-visible px-3 pb-2 pt-2">
        <div className="flex items-center gap-1.5">
          <div className="relative grid h-10 w-[76px] grid-cols-2 rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)] p-1 shadow-[0_1px_2px_var(--canvas-theme-shadow)]">
            <button
              type="button"
              className={[
                "relative z-10 grid h-8 w-8 place-items-center rounded-full p-0 leading-none transition",
                !showingResult
                  ? "bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-text)] shadow-[0_2px_7px_var(--canvas-theme-shadow)]"
                  : "text-[var(--canvas-theme-icon-muted)]",
              ].join(" ")}
              title="Prompt"
              aria-label="Show prompt"
              aria-pressed={!showingResult}
              onClick={() => updateAssistant({ mode: "prompt" })}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-4 w-4 fill-current"
                aria-hidden="true"
              >
                <path d="M13.116 7.875c0-.647-.525-1.172-1.172-1.172H6.516a1.172 1.172 0 0 0 0 2.344h5.428a1.17 1.17 0 0 0 1.172-1.172m-1.35 3.047a1.172 1.172 0 0 0 0 2.344h3.276a1.172 1.172 0 0 0 0-2.344zm2.953-3.047c0-.647.525-1.172 1.172-1.172h1.401a1.172 1.172 0 0 1 0 2.344h-1.401a1.17 1.17 0 0 1-1.172-1.172M6.516 15.14a1.172 1.172 0 0 0 0 2.344h2.807a1.172 1.172 0 0 0 0-2.343zm-1.172-3.046c0-.647.525-1.172 1.172-1.172h1.401a1.172 1.172 0 0 1 0 2.344H6.516a1.17 1.17 0 0 1-1.172-1.172" />
                <path
                  fillRule="evenodd"
                  d="M23.99 5.297v13.407a3.99 3.99 0 0 1-3.983 3.984H3.983a3.95 3.95 0 0 1-2.818-1.169A3.96 3.96 0 0 1 0 18.7L.008 12 0 5.301a3.96 3.96 0 0 1 1.165-2.82 3.95 3.95 0 0 1 2.818-1.168h16.024a3.99 3.99 0 0 1 3.982 3.984m-2.343 0c0-.904-.736-1.64-1.64-1.64H3.943A1.643 1.643 0 0 0 2.36 5.295L2.35 12l.008 6.705a1.643 1.643 0 0 0 1.624 1.639h16.024c.904 0 1.64-.736 1.64-1.64z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              type="button"
              className={[
                "relative z-10 grid h-8 w-8 place-items-center rounded-full p-0 leading-none transition",
                showingResult
                  ? "bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-text)] shadow-[0_2px_7px_var(--canvas-theme-shadow)]"
                  : "text-[var(--canvas-theme-icon-muted)]",
              ].join(" ")}
              title="Result"
              aria-label="Show result"
              aria-pressed={showingResult}
              onClick={() => updateAssistant({ mode: "result" })}
            >
              <Sparkles className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <AnimatePresence initial={false}>
            {!showingResult ? (
              <motion.button
                key="assistant-add-reference"
                type="button"
                disabled={isRunning}
                initial={{ opacity: 0, x: -8, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -6, scale: 0.96 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={[
                  "grid h-8 w-8 place-items-center rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-icon)] shadow-[0_3px_10px_var(--canvas-theme-shadow)] transition",
                  isRunning ? "cursor-not-allowed opacity-45" : "hover:bg-[var(--canvas-theme-hover)]",
                ].join(" ")}
                title="Add reference"
                onClick={() => {
                  updateAssistant({ mode: "prompt" });
                  textareaRef.current?.focus();
                }}
              >
                <Plus className="h-4 w-4" strokeWidth={2.3} />
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 px-4 pb-2 pt-1">
        <AnimatePresence mode="wait" initial={false}>
          {!showingResult ? (
            <motion.div
              key="assistant-prompt"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative min-h-0 flex-1"
            >
              <textarea
                ref={textareaRef}
                value={assistant.prompt}
                onChange={(event) =>
                  updateAssistant({
                    prompt: event.target.value,
                    status: assistant.status === "error" ? "idle" : assistant.status,
                    errorMessage: undefined,
                  })
                }
                placeholder={ASSISTANT_PLACEHOLDER}
                className="h-full min-h-40 w-full resize-none overflow-y-auto bg-transparent px-1 font-[var(--font-botanical-sans)] text-[14px] leading-[1.55] text-[var(--canvas-theme-text-soft)] outline-none placeholder:text-[var(--canvas-theme-text-muted)]"
              />
            </motion.div>
          ) : (
            <motion.div
              key="assistant-result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="assistant-result-scroll relative min-h-0 flex-1 overflow-y-auto pr-2"
            >
              {isRunning ? (
                <div className="flex items-start gap-3 px-1 py-1 text-[var(--canvas-theme-text-soft)]">
                  <RefreshCw className="mt-0.5 h-4 w-4 animate-spin text-[var(--canvas-theme-selection)]" strokeWidth={2} />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Carver AI is thinking...</p>
                    <p className="text-xs text-[var(--canvas-theme-text-muted)]">
                      Using this Assistant card&apos;s connected graph context only.
                    </p>
                  </div>
                </div>
              ) : assistant.status === "error" ? (
                <div className="px-1 py-1 text-sm leading-[1.55] text-[#B42318]">
                  {assistant.errorMessage || "Carver AI could not answer in this assistant card right now."}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap px-1 font-[var(--font-botanical-sans)] text-[14px] leading-[1.55] text-[var(--canvas-theme-text-soft)]">
                  {assistant.response || "Run the assistant to generate a result."}
                </pre>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-end justify-between px-3 pb-2">
        <div className="flex items-center gap-1.5">
          <AssistantPopoverButton
            label={assistant.model}
            isOpen={openMenu === "model"}
            onToggle={() => setOpenMenu((current) => (current === "model" ? null : "model"))}
            options={ASSISTANT_MODEL_OPTIONS.map((model) => ({ value: model, label: model }))}
            onSelect={(value) => {
              updateAssistant({ model: value });
              setOpenMenu(null);
            }}
            disabled={isRunning}
          />
          <button
            type="button"
            disabled={isRunning}
            className={[
              "grid h-6 w-6 place-items-center rounded-full bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-icon)] transition",
              isRunning ? "cursor-not-allowed opacity-45" : "hover:bg-[var(--canvas-theme-hover)]",
            ].join(" ")}
            title="Assistant settings"
          >
            <Settings className="h-3 w-3" strokeWidth={1.9} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <AssistantPopoverButton
            label={ASSISTANT_OUTPUT_OPTIONS.find((option) => option.value === assistant.outputFormat)?.label ?? "Export as text"}
            isOpen={openMenu === "output"}
            onToggle={() => setOpenMenu((current) => (current === "output" ? null : "output"))}
            options={ASSISTANT_OUTPUT_OPTIONS}
            onSelect={(value) => {
              updateAssistant({ outputFormat: value as CanvasAssistantNode["assistant"]["outputFormat"] });
              setOpenMenu(null);
            }}
            align="right"
            disabled={isRunning}
          />
          <button
            type="button"
            disabled={isRunning || assistant.prompt.trim().length === 0}
            className={[
              "flex h-7 w-7 items-center justify-center rounded-full bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)] transition",
              isRunning || assistant.prompt.trim().length === 0
                ? "cursor-not-allowed opacity-45"
                : "hover:bg-[var(--canvas-theme-selection-hover)]",
            ].join(" ")}
            title="Run assistant"
            onClick={runAssistant}
          >
            {isRunning ? (
              <RefreshCw className="h-3 w-3 animate-spin" strokeWidth={1.9} />
            ) : (
              <Play className="h-3 w-3 fill-current" strokeWidth={1.9} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageGeneratorNodeSurface({
  node,
  allNodes,
  edges,
  generatorAssetUrls,
  onUpdateNode,
  onRunImageGenerator,
  onToast,
}: {
  node: CanvasImageGeneratorNode;
  allNodes: CanvasNode[];
  edges: CanvasEdge[];
  generatorAssetUrls: ResolvedGeneratorAssetUrls;
  onUpdateNode: (id: string, update: (node: CanvasNode) => CanvasNode) => void;
  onRunImageGenerator: (nodeId: string) => void | Promise<void>;
  onToast: (message: string) => void;
}) {
  const generator = node.imageGenerator;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [openMenu, setOpenMenu] = useState<"model" | "aspect" | "settings" | null>(null);

  const connectedReferences = React.useMemo(() => {
    const inboundEdges = edges
      .filter((edge) => edge.targetId === node.id)
      .sort(sortInboundCanvasEdges);

    const imageReferences: ConnectedGeneratorImageReference[] = [];
    const textReferences: ConnectedGeneratorTextReference[] = [];

    inboundEdges.forEach((edge) => {
      const sourceNode = allNodes.find((candidate) => candidate.id === edge.sourceId);
      if (!sourceNode) {
        return;
      }

      if (edge.targetPortId === "image-generator-input-image") {
        let previewUrl = "";
        let assetId = sourceNode.sourceImage?.assetId;
        let title = sourceNode.title;

        if (isPresetGroupNode(sourceNode)) {
          const activeChild =
            sourceNode.presetGroup.children.find(
              (child) => child.id === sourceNode.presetGroup.activeChildId,
            ) ?? sourceNode.presetGroup.children[0];
          previewUrl = activeChild?.sourceImage?.url ?? activeChild?.imageSrc ?? "";
          assetId = activeChild?.sourceImage?.assetId ?? activeChild?.assetId;
          title = activeChild?.label ?? sourceNode.title;
        }

        if (assetId) {
          previewUrl =
            generatorAssetUrls[assetId]?.thumbUrl ??
            generatorAssetUrls[assetId]?.previewUrl ??
            generatorAssetUrls[assetId]?.originalUrl ??
            "";
        }

        if (!previewUrl) {
          previewUrl = sourceNode.sourceImage?.url ?? sourceNode.imageUrl ?? "";
          if (isPresetGroupNode(sourceNode)) {
            const activeChild =
              sourceNode.presetGroup.children.find(
                (child) => child.id === sourceNode.presetGroup.activeChildId,
              ) ?? sourceNode.presetGroup.children[0];
            previewUrl = activeChild?.sourceImage?.url ?? activeChild?.imageSrc ?? "";
          }
        }

        if (previewUrl) {
          imageReferences.push({
            edgeId: edge.id,
            sourceNodeId: sourceNode.id,
            title,
            previewUrl,
            assetId,
          });
        }
        return;
      }

      if (edge.targetPortId === "image-generator-input-text") {
        const text =
          sourceNode.kind === "text"
            ? sourceNode.text.content
            : sourceNode.kind === "assistant"
              ? sourceNode.assistant.response || sourceNode.assistant.prompt
              : sourceNode.prompt ?? "";

        if (!text.trim()) {
          return;
        }

        textReferences.push({
          edgeId: edge.id,
          sourceNodeId: sourceNode.id,
          text: text.trim(),
        });
      }
    });

    return { imageReferences, textReferences };
  }, [allNodes, edges, generatorAssetUrls, node.id]);

  const outputCards = React.useMemo(() => {
    return generator.outputs
      .map((output, index) => {
        const resolvedUrls = output.assetId ? generatorAssetUrls[output.assetId] : undefined;
        const previewUrl =
          resolvedUrls?.previewUrl ??
          resolvedUrls?.originalUrl ??
          resolvedUrls?.thumbUrl ??
          output.imageUrl ??
          "";

        if (!previewUrl) {
          return null;
        }

        return {
          id: output.assetId ?? `${node.id}-output-${index}`,
          assetId: output.assetId,
          previewUrl,
          alt: output.title || `${node.title} output ${index + 1}`,
        };
      })
      .filter((output): output is NonNullable<typeof output> => output !== null);
  }, [generator.outputs, generatorAssetUrls, node.id, node.title]);

  const activeOutputAssetId =
    generator.selectedOutputAssetId ??
    generator.outputAssetIds[0] ??
    outputCards[0]?.assetId ??
    null;

  const isRunning = generator.status === "queued" || generator.status === "generating";
  const hasPromptInput = generator.prompt.trim().length > 0 || connectedReferences.textReferences.length > 0;
  const selectedOutput =
    outputCards.find((output) => output.assetId && output.assetId === activeOutputAssetId) ??
    outputCards[0] ??
    null;

  const updateGenerator = (update: Partial<CanvasImageGeneratorNode["imageGenerator"]>) => {
    onUpdateNode(node.id, (current) =>
      current.kind === "image-generator"
        ? {
            ...current,
            imageGenerator: {
              ...current.imageGenerator,
              ...update,
            },
          }
        : current,
    );
  };

  const resizePromptTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    resizePromptTextarea();
  }, [generator.prompt, node.width, resizePromptTextarea]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!surfaceRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const runGenerator = () => {
    void onRunImageGenerator(node.id);
    setOpenMenu(null);
  };

  const selectOutput = (assetId?: string) => {
    if (!assetId) {
      return;
    }

    const selectedAssetUrls = generatorAssetUrls[assetId];
    updateGenerator({ selectedOutputAssetId: assetId });
    onUpdateNode(node.id, (current) =>
      current.kind === "image-generator"
        ? {
            ...current,
            imageUrl:
              selectedAssetUrls?.originalUrl ??
              selectedAssetUrls?.previewUrl ??
              current.imageUrl,
            sourceImage: selectedAssetUrls
              ? {
                  assetId,
                  url: selectedAssetUrls.originalUrl || selectedAssetUrls.previewUrl,
                  width: null,
                  height: null,
                  quality: "original",
                }
              : current.sourceImage,
          }
        : current,
    );
  };

  const gridColumnsClassName =
    outputCards.length <= 1 ? "grid-cols-1" : outputCards.length === 2 ? "grid-cols-2" : "grid-cols-2";

  return (
    <div
      ref={surfaceRef}
      className="flex h-full w-full flex-col bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]"
      data-canvas-interactive="true"
      onPointerDown={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("button, textarea, input, select")) {
          event.stopPropagation();
        }
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {outputCards.length > 0 ? (
            <div className={`grid h-full w-full ${gridColumnsClassName} gap-2 p-2`}>
              {outputCards.map((output) => {
                const isSelected = output.assetId ? output.assetId === activeOutputAssetId : output === selectedOutput;
                return (
                  <button
                    key={output.id}
                    type="button"
                    className={[
                      "group relative overflow-hidden rounded-[14px] border transition",
                      isSelected
                        ? "border-[var(--canvas-theme-selection)] ring-2 ring-[var(--canvas-theme-selection-ring)]"
                        : "border-[var(--canvas-theme-border)] hover:border-[var(--canvas-theme-border-strong)]",
                    ].join(" ")}
                    onClick={() => selectOutput(output.assetId)}
                    title="Use this output as the latest generator result"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={output.previewUrl}
                      alt={output.alt}
                      className="h-full w-full object-cover"
                      draggable={false}
                      decoding="async"
                    />
                    {isSelected ? (
                      <div className="pointer-events-none absolute inset-x-2 top-2 rounded-full bg-[var(--canvas-theme-surface-panel)]/88 px-2 py-1 text-[10px] font-semibold text-[var(--canvas-theme-text)] shadow-[0_6px_14px_var(--canvas-theme-shadow)]">
                        Latest output
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {isRunning ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--canvas-theme-surface-panel)]/72 backdrop-blur-[2px]">
              <div className="flex items-center gap-3 rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-4 py-2 text-sm font-medium text-[var(--canvas-theme-text)] shadow-[0_12px_24px_var(--canvas-theme-shadow)]">
                <RefreshCw className="h-4 w-4 animate-spin text-[var(--canvas-theme-selection)]" strokeWidth={2} />
                <span>{generator.status === "queued" ? "Queued..." : "Generating..."}</span>
              </div>
            </div>
          ) : null}

          {generator.status === "error" && generator.errorMessage ? (
            <div className="pointer-events-none absolute left-3 right-3 top-3 rounded-2xl border border-[#F0C4B5] bg-[#FFF5F1]/92 px-3 py-2 text-xs text-[#B42318] shadow-[0_8px_18px_rgba(180,35,24,0.08)]">
              {generator.errorMessage}
            </div>
          ) : null}
        </div>

        <div className="mt-2 flex min-h-10 items-center gap-2">
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-icon)] shadow-[0_4px_10px_var(--canvas-theme-shadow)] transition hover:bg-[var(--canvas-theme-hover)]"
            title="Add a reference image node"
            onClick={() => {
              textareaRef.current?.focus();
              onToast("Add or connect an image node to use it as a generator reference.");
            }}
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5">
            {connectedReferences.imageReferences.map((reference) => (
              <div
                key={reference.edgeId}
                className="shrink-0"
                title={reference.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={reference.previewUrl}
                  alt={reference.title}
                  className="h-10 w-10 rounded-lg object-cover shadow-[0_3px_8px_var(--canvas-theme-shadow)]"
                  draggable={false}
                  decoding="async"
                />
              </div>
            ))}
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={generator.prompt}
          onChange={(event) =>
            updateGenerator({
              prompt: event.target.value,
              status: generator.status === "error" ? "idle" : generator.status,
              errorMessage: undefined,
            })
          }
          onInput={resizePromptTextarea}
          placeholder={
            connectedReferences.textReferences.length > 0
              ? "Connected prompt. Use @ to add references or extra context"
              : "Describe the image you want to generate..."
          }
          className="mt-3 min-h-7 max-h-[120px] w-full resize-none overflow-y-auto bg-transparent px-0 font-[var(--font-botanical-sans)] text-sm leading-6 text-[var(--canvas-theme-text-soft)] outline-none placeholder:text-[var(--canvas-theme-text-muted)]"
        />

        <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5">
          <div className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-[var(--canvas-theme-surface-muted)] px-1">
            <button
              type="button"
              className="grid h-6 w-6 place-items-center rounded-full text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={isRunning || generator.outputCount <= IMAGE_GENERATOR_MIN_OUTPUT_COUNT}
              onClick={() =>
                updateGenerator({
                  outputCount: Math.max(
                    IMAGE_GENERATOR_MIN_OUTPUT_COUNT,
                    generator.outputCount - 1,
                  ),
                })
              }
              aria-label="Decrease output count"
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={2.1} />
            </button>
            <span className="min-w-[36px] text-center text-[11px] font-semibold text-[var(--canvas-theme-text)]">
              x{generator.outputCount}
            </span>
            <button
              type="button"
              className="grid h-6 w-6 place-items-center rounded-full text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={isRunning || generator.outputCount >= IMAGE_GENERATOR_MAX_OUTPUT_COUNT}
              onClick={() =>
                updateGenerator({
                  outputCount: Math.min(
                    IMAGE_GENERATOR_MAX_OUTPUT_COUNT,
                    generator.outputCount + 1,
                  ),
                })
              }
              aria-label="Increase output count"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.1} />
            </button>
          </div>

          <div className="shrink-0">
            <AssistantPopoverButton
              label={
                IMAGE_GENERATOR_MODEL_OPTIONS.find((option) => option.value === generator.model)?.label ??
                generator.model
              }
              isOpen={openMenu === "model"}
              onToggle={() => setOpenMenu((current) => (current === "model" ? null : "model"))}
              options={IMAGE_GENERATOR_MODEL_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onSelect={(value) => {
                updateGenerator({ model: value });
                setOpenMenu(null);
              }}
              disabled={isRunning}
            />
          </div>

          <div className="shrink-0">
            <AssistantPopoverButton
              label={generator.aspectRatio}
              isOpen={openMenu === "aspect"}
              onToggle={() => setOpenMenu((current) => (current === "aspect" ? null : "aspect"))}
              options={IMAGE_GENERATOR_ASPECT_RATIO_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onSelect={(value) => {
                updateGenerator({
                  aspectRatio: value as CanvasImageGeneratorNode["imageGenerator"]["aspectRatio"],
                });
                setOpenMenu(null);
              }}
              disabled={isRunning}
            />
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-full bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={isRunning}
              title="Advanced settings"
              onClick={() => setOpenMenu((current) => (current === "settings" ? null : "settings"))}
            >
              <Settings className="h-3.5 w-3.5" strokeWidth={1.9} />
            </button>
            <AnimatePresence>
              {openMenu === "settings" ? (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-[220px] rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-3 text-xs text-[var(--canvas-theme-text-soft)] shadow-[0_18px_40px_var(--canvas-theme-shadow)] backdrop-blur-xl"
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-[var(--canvas-theme-text)]">Generation settings</p>
                    <p>Model routing and aspect ratio are supported in phase 1.</p>
                    <p>Connected references: {connectedReferences.imageReferences.length} image / {connectedReferences.textReferences.length} text.</p>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="ml-auto shrink-0" />

          <button
            type="button"
            disabled={isRunning || !hasPromptInput}
            className={[
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)] transition",
              isRunning || !hasPromptInput
                ? "cursor-not-allowed opacity-45"
                : "hover:bg-[var(--canvas-theme-selection-hover)]",
            ].join(" ")}
            title="Run image generator"
            onClick={runGenerator}
          >
            {isRunning ? (
              <RefreshCw className="h-3 w-3 animate-spin" strokeWidth={1.9} />
            ) : (
              <Play className="h-3 w-3 fill-current" strokeWidth={1.9} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function TextNodeSurface({
  node,
  onUpdateNode,
}: {
  node: CanvasTextNode;
  onUpdateNode: (id: string, update: (node: CanvasNode) => CanvasNode) => void;
}) {
  return (
    <div
      className="flex h-full w-full flex-col bg-[var(--canvas-theme-surface-soft)] text-[var(--canvas-theme-text)]"
      data-canvas-interactive="true"
      onPointerDown={(event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("textarea")) {
          event.stopPropagation();
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-[var(--canvas-theme-border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--canvas-theme-text-muted)]">
        <Type className="h-3.5 w-3.5 text-[var(--canvas-theme-selection)]" strokeWidth={2} />
        <span>{node.title}</span>
      </div>
      <textarea
        value={node.text.content}
        onChange={(event) =>
          onUpdateNode(node.id, (current) =>
            current.kind === "text"
              ? { ...current, text: { content: event.target.value } }
              : current,
          )
        }
        placeholder="Write a site note, constraint, or prompt..."
        className="min-h-0 flex-1 resize-none bg-transparent px-3 py-2.5 font-[var(--font-botanical-sans)] text-sm leading-6 text-[var(--canvas-theme-text-soft)] outline-none placeholder:text-[var(--canvas-theme-text-muted)]"
      />
    </div>
  );
}

type CanvasNodeCardProps = {
  node: CanvasNode;
  allNodes: CanvasNode[];
  edges: CanvasEdge[];
  selected: boolean;
  isGenerationTarget?: boolean;
  showSelectionTools?: boolean;
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  markers: Marker[];
  addedObjects: AddedObject[];
  sketchLines: SketchLine[];
  sketchGroups: SketchGroup[];
  selectedSketchLineIds: string[];
  viewportZoom: number;
  imageRasterZoom?: number;
  isConnectionTarget?: boolean;
  onSelect: (id: string, event?: React.MouseEvent | React.PointerEvent) => void;
  onStartConnection: (
    nodeId: string,
    handle: ImageHandlePosition,
    connectionKind: CanvasConnectionKind,
    event: React.PointerEvent<HTMLButtonElement>,
    sourcePortId?: string,
  ) => void;
  onSelectOverlay: (item: SelectedItem) => void;
  onAddSketchLine: (line: SketchLine) => void;
  onSelectSketchLine: (id: string, additive: boolean) => void;
  onSelectSketchGroup: (id: string) => void;
  onSelectContextMenu: (id: string, x: number, y: number) => void;
  onUpdateNode: (id: string, update: (node: CanvasNode) => CanvasNode) => void;
  onCommitResize: (entry: {
    nodeId: string;
    before: { width: number; height: number };
    after: { width: number; height: number };
  }) => void;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onImageAction: (nodeId: string, xPercent: number, yPercent: number) => void;
  onMultiAngle: () => void;
  onAddObject: () => void;
  onTool: (tool: EditorTool) => void;
  onRealityCheck: () => void;
  onToast: (message: string) => void;
  onSetActiveNode: (id: string) => void;
  onDelete: (id: string) => void;
  onRunAssistant: (nodeId: string) => void | Promise<void>;
  onRunImageGenerator: (nodeId: string) => void | Promise<void>;
  generatorAssetUrls: ResolvedGeneratorAssetUrls;
};

export default function CanvasNodeCard({
  node,
  allNodes,
  edges,
  selected,
  isGenerationTarget = false,
  showSelectionTools = true,
  selectedItem,
  activeTool,
  markers,
  addedObjects,
  viewportZoom,
  imageRasterZoom = viewportZoom,
  isConnectionTarget = false,
  onSelect,
  onStartConnection,
  onSelectOverlay,
  onSelectContextMenu,
  onUpdateNode,
  onCommitResize,
  onDragStart,
  onImageAction,
  onMultiAngle,
  onAddObject,
  onTool,
  onToast,
  onSetActiveNode,
  onDelete,
  onRunAssistant,
  onRunImageGenerator,
  generatorAssetUrls,
}: CanvasNodeCardProps) {
  const nodeVisualScale = getCanvasNodeVisualScale(node);
  const displayWidth = node.width * nodeVisualScale;
  const displayHeight = node.height * nodeVisualScale;
  // Asset-backed nodes may restore their runtime URL into sourceImage.url first,
  // so rendering should not depend on imageUrl alone.
  const runtimeImageUrl = node.sourceImage?.url ?? node.imageUrl;
  const isAssistant = node.kind === "assistant";
  const isImageGenerator = node.kind === "image-generator";
  const isTextNode = node.kind === "text";
  const isImageOutputOnly = isImageOutputOnlyNode(node);
  const hasSemanticPorts = isAssistant || isTextNode || isImageGenerator;
  const connectionCountsBySide = getNodeConnectionCountsBySide(node.id, edges);
  const leftHandles: Array<{ kind: CanvasConnectionKind; count: number }> = [];
  const rightHandles: Array<{ kind: CanvasConnectionKind; count: number }> = [];

  if (isImageOutputOnly) {
    const imageConnectionCount =
      connectionCountsBySide.left.text +
      connectionCountsBySide.left.image +
      connectionCountsBySide.right.text +
      connectionCountsBySide.right.image;
    rightHandles.push({ kind: "image", count: imageConnectionCount });
  } else if (!hasSemanticPorts) {
    if (connectionCountsBySide.left.text > 0 || selected) {
      leftHandles.push({ kind: "text", count: connectionCountsBySide.left.text });
    }
    if (connectionCountsBySide.left.image > 0 || selected) {
      leftHandles.push({ kind: "image", count: connectionCountsBySide.left.image });
    }
    if (connectionCountsBySide.right.text > 0 || selected) {
      rightHandles.push({ kind: "text", count: connectionCountsBySide.right.text });
    }
    if (connectionCountsBySide.right.image > 0 || selected) {
      rightHandles.push({ kind: "image", count: connectionCountsBySide.right.image });
    }
  }
  const semanticPortHandles = hasSemanticPorts
    ? getNodeSemanticPorts(node).flatMap((port) => {
        const count = edges.filter((edge) =>
          port.direction === "input"
            ? edge.targetId === node.id && edge.targetPortId === port.id
            : edge.sourceId === node.id && edge.sourcePortId === port.id,
        ).length;
        const sameSidePorts = getPortsBySide(node, port.side);
        const portIndex = sameSidePorts.findIndex((candidate) => candidate.id === port.id);
        return selected || count > 0
          ? [{
              port,
              count,
              topOffset: getCornerAnchoredPortOffsetY({
                height: displayHeight,
                index: Math.max(portIndex, 0),
                total: sameSidePorts.length,
                side: port.side,
              }),
            }]
          : [];
      })
    : [];
  const nodeFrameClassName = getNodeFrameClassName({
    selected,
    isGenerationTarget,
    isConnectionTarget,
  });
  const legacyOverlayHost = isGenerationTarget || selected;
  const nodeMarkers = markers.filter(
    (marker) => marker.targetNodeId === node.id || (!marker.targetNodeId && legacyOverlayHost),
  );
  const nodeObjects = addedObjects.filter(
    (object) => object.targetNodeId === node.id || (!object.targetNodeId && legacyOverlayHost),
  );
  const frameClassName = isAssistant || isImageGenerator
    ? [
        "relative overflow-hidden rounded-[20px] border-[3px] bg-[var(--canvas-theme-surface)] shadow-[0_4px_16px_var(--canvas-theme-shadow)] transition-colors",
        nodeFrameClassName,
      ].join(" ")
    : [
        "relative overflow-hidden rounded-[18px] border bg-[var(--canvas-theme-surface-soft)] shadow-[0_18px_42px_rgba(23,50,37,0.08)] transition-colors",
        nodeFrameClassName,
      ].join(" ");
  const isActiveSelectedNode = selectedItem.type === "node" && selectedItem.id === node.id;
  const resizeSessionRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startWidth: number;
    startHeight: number;
    visualScale: number;
  } | null>(null);
  const latestResizableSizeRef = useRef({ width: node.width, height: node.height });
  const [isNodeResizing, setIsNodeResizing] = useState(false);
  const resizableNodeConstraints = isAssistant
    ? {
        minWidth: MIN_ASSISTANT_NODE_WIDTH,
        minHeight: MIN_ASSISTANT_NODE_HEIGHT,
        maxWidth: MAX_ASSISTANT_NODE_WIDTH,
        maxHeight: MAX_ASSISTANT_NODE_HEIGHT,
        label: "assistant",
      }
    : isImageGenerator
      ? {
          minWidth: MIN_IMAGE_GENERATOR_NODE_WIDTH,
          minHeight: MIN_IMAGE_GENERATOR_NODE_HEIGHT,
          maxWidth: MAX_IMAGE_GENERATOR_NODE_WIDTH,
          maxHeight: MAX_IMAGE_GENERATOR_NODE_HEIGHT,
          label: "image generator",
        }
      : null;

  useEffect(() => {
    latestResizableSizeRef.current = { width: node.width, height: node.height };
  }, [node.height, node.width]);

  const finishNodeResize = useCallback((
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resizeSessionRef.current = null;
    setIsNodeResizing(false);

    const finalSize = latestResizableSizeRef.current;
    if (
      finalSize.width !== session.startWidth ||
      finalSize.height !== session.startHeight
    ) {
      onCommitResize({
        nodeId: node.id,
        before: {
          width: session.startWidth,
          height: session.startHeight,
        },
        after: finalSize,
      });
    }
  }, [node.id, onCommitResize]);

  const handleNodeResizePointerDown = useCallback((
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!resizableNodeConstraints || !isActiveSelectedNode) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: node.width,
      startHeight: node.height,
      visualScale: Math.max(nodeVisualScale, 0.0001),
    };
    setIsNodeResizing(true);
  }, [isActiveSelectedNode, node.height, node.width, nodeVisualScale, resizableNodeConstraints]);

  const handleNodeResizePointerMove = useCallback((
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId || !resizableNodeConstraints) return;

    event.preventDefault();
    event.stopPropagation();

    const dx = (event.clientX - session.startClientX) / (Math.max(viewportZoom, 0.0001) * session.visualScale);
    const dy = (event.clientY - session.startClientY) / (Math.max(viewportZoom, 0.0001) * session.visualScale);
    const nextWidth = Math.min(
      resizableNodeConstraints.maxWidth,
      Math.max(resizableNodeConstraints.minWidth, Math.round(session.startWidth + dx)),
    );
    const nextHeight = Math.min(
      resizableNodeConstraints.maxHeight,
      Math.max(resizableNodeConstraints.minHeight, Math.round(session.startHeight + dy)),
    );

    latestResizableSizeRef.current = { width: nextWidth, height: nextHeight };
    onUpdateNode(node.id, (current) => (
      current.kind === node.kind &&
      (current.width !== nextWidth || current.height !== nextHeight)
        ? { ...current, width: nextWidth, height: nextHeight }
        : current
    ));
  }, [node.id, node.kind, onUpdateNode, resizableNodeConstraints, viewportZoom]);

  return (
    <div
      data-canvas-node-id={node.id}
      className="group absolute select-none bg-transparent"
      style={{
        left: node.x,
        top: node.y,
        width: displayWidth,
        height: displayHeight,
        zIndex: selected ? 80 : 15,
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect(node.id, event);
        if (activeTool !== "region") {
          onDragStart(node.id, event);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectContextMenu(node.id, event.clientX, event.clientY);
      }}
    >
      <div>
        <div className="relative">
          {isAssistant || isImageGenerator ? (
            <div className="pointer-events-none absolute -top-9 left-7 flex items-center gap-2 font-[var(--font-botanical-sans)] text-[18px] font-semibold text-[var(--canvas-theme-text-soft)]">
              {isImageGenerator ? (
                <ImageIcon className="h-4 w-4 text-[var(--canvas-theme-selection)]" strokeWidth={2.1} />
              ) : (
                <Sparkles className="h-4 w-4 text-[var(--canvas-theme-selection)]" strokeWidth={2.1} />
              )}
              <span>{node.title}</span>
            </div>
          ) : null}
          <div
            className={frameClassName}
            style={{ height: displayHeight }}
            onClick={(event) => {
              if (activeTool === "mark-position") {
                event.stopPropagation();
                onSetActiveNode(node.id);
                const rect = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 100;
                const y = ((event.clientY - rect.top) / rect.height) * 100;
                onImageAction(node.id, x, y);
              }
            }}
          >
            {isAssistant ? (
              <AssistantNodeSurface
                node={node as CanvasAssistantNode}
                onUpdateNode={onUpdateNode}
                onRunAssistant={onRunAssistant}
              />
            ) : isImageGenerator ? (
              <ImageGeneratorNodeSurface
                node={node as CanvasImageGeneratorNode}
                allNodes={allNodes}
                edges={edges}
                generatorAssetUrls={generatorAssetUrls}
                onUpdateNode={onUpdateNode}
                onRunImageGenerator={onRunImageGenerator}
                onToast={onToast}
              />
            ) : isTextNode ? (
              <TextNodeSurface
                node={node as CanvasTextNode}
                onUpdateNode={onUpdateNode}
              />
            ) : runtimeImageUrl ? (
              <AdaptiveImageRenderer
                imageUrl={runtimeImageUrl}
                title={node.title}
                displayWidth={displayWidth}
                displayHeight={displayHeight}
                viewportZoom={imageRasterZoom}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[var(--canvas-theme-text-muted)]">
                <ImagePlus className="h-8 w-8 opacity-50" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-[rgba(255,255,255,0.03)]" />

            {nodeObjects.map((object) => (
              <button
                key={object.id}
                type="button"
                className="added-object absolute z-30 flex min-h-7 min-w-10 items-center justify-center gap-1 rounded-lg border border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-selection-soft)]/95 px-2 text-[10px] font-semibold text-[var(--canvas-theme-text)] shadow-[0_4px_12px_rgba(23,50,37,0.16)] transition hover:bg-[var(--canvas-theme-surface-panel)]"
                style={{
                  left: `${object.x}%`,
                  top: `${object.y}%`,
                  width: `${object.w}%`,
                  height: `${object.h}%`,
                  transform: `translate(-50%, -50%) rotate(${object.rotation}deg)`,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectOverlay({ type: "object", id: object.id });
                }}
                title={object.label}
              >
                <Box className="h-3 w-3 shrink-0" aria-hidden />
                <span className="max-w-full truncate">{object.label}</span>
              </button>
            ))}

            {nodeMarkers.map((marker) => (
              <button
                key={marker.id}
                type="button"
                className="marker-pin absolute z-40 -translate-x-1/2 -translate-y-full text-left"
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectOverlay({ type: "marker", id: marker.id });
                }}
                title={marker.label}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--canvas-theme-handle-bg)] bg-[var(--canvas-theme-selection)] text-[var(--canvas-theme-active-text)] shadow-md">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                </span>
              </button>
            ))}
          </div>

          {hasSemanticPorts
            ? semanticPortHandles.map(({ port, count, topOffset }) => (
              <ConnectionHandleSlot
                key={port.id}
                count={count}
                kind={port.kind}
                side={port.side}
                selected={selected}
                isConnectionTarget={isConnectionTarget}
                displayHeight={displayHeight}
                topOverride={topOffset}
                interactive={port.direction === "output"}
                onPointerDown={(event) =>
                  onStartConnection(node.id, port.side, port.kind, event, port.id)
                }
              />
            ))
            : null}
          {!hasSemanticPorts && !isImageOutputOnly ? leftHandles.map((handle) => (
            <ConnectionHandleSlot
              key={`left-${handle.kind}`}
              count={handle.count}
              kind={handle.kind}
              side="left"
              selected={selected}
              isConnectionTarget={isConnectionTarget}
              displayHeight={displayHeight}
              topOverride={getGenericNodePortOffsetY(displayHeight, handle.kind, "left")}
              onPointerDown={(event) =>
                onStartConnection(
                  node.id,
                  "left",
                  handle.kind,
                  event,
                  getDefaultSourcePortId({ node, kind: handle.kind, side: "left" }),
                )
              }
            />
          )) : null}
          {!hasSemanticPorts ? rightHandles.map((handle) => (
            <ConnectionHandleSlot
              key={`right-${handle.kind}`}
              count={handle.count}
              kind={handle.kind}
              side="right"
              selected={selected}
              isConnectionTarget={isConnectionTarget}
              displayHeight={displayHeight}
              topOverride={
                isImageOutputOnly
                  ? getImageOutputPortOffsetY(displayHeight)
                  : getGenericNodePortOffsetY(displayHeight, handle.kind, "right")
              }
              onPointerDown={(event) =>
                onStartConnection(
                  node.id,
                  "right",
                  handle.kind,
                  event,
                  getDefaultSourcePortId({ node, kind: handle.kind, side: "right" }),
                )
              }
            />
          )) : null}
          {resizableNodeConstraints && isActiveSelectedNode ? (
            <button
              type="button"
              aria-label={`Resize ${resizableNodeConstraints.label}`}
              title={`Resize ${resizableNodeConstraints.label}`}
              className={[
                "absolute -bottom-3 -right-3 z-[155] grid h-7 w-7 place-items-center rounded-full border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-selection)] shadow-[0_8px_20px_var(--canvas-theme-shadow)] transition duration-150",
                isNodeResizing
                  ? "scale-[0.97] border-[var(--canvas-theme-selection)] text-[var(--canvas-theme-selection-hover)]"
                  : "hover:scale-[1.05] hover:border-[var(--canvas-theme-selection)] hover:text-[var(--canvas-theme-selection-hover)]",
              ].join(" ")}
              style={{ cursor: "nwse-resize" }}
              data-canvas-interactive="true"
              onPointerDown={handleNodeResizePointerDown}
              onPointerMove={handleNodeResizePointerMove}
              onPointerUp={finishNodeResize}
              onPointerCancel={finishNodeResize}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M6 18C12.5 18 18 12.5 18 6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M14.5 6H18V9.5"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </div>

        {!isAssistant && !isImageGenerator ? (
        <div className="px-1 pb-1 text-left" style={{ marginTop: "10px" }}>
          <h3 className="truncate font-[var(--font-botanical-display)] text-[17px] leading-tight text-[var(--canvas-theme-text)]">
            {node.title}
          </h3>
          {node.prompt ? (
            <p
              className="mt-1 line-clamp-1 text-xs leading-snug text-[var(--canvas-theme-text-muted)]"
              title={node.prompt}
            >
              {node.prompt}
            </p>
          ) : null}
        </div>
        ) : null}
      </div>

      {selected && showSelectionTools ? (
        <div
          className="pointer-events-none absolute inset-0 z-[120]"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-auto">
            <ContextualToolbar
              itemLabel={getNodeKindLabel(node.role)}
              viewportZoom={viewportZoom}
              onMultiAngle={onMultiAngle}
              onAddObject={onAddObject}
              onTool={onTool}
              onToast={onToast}
            />
          </div>
        </div>
      ) : null}

      {selected && selectedItem.type === "node" && selectedItem.menu ? (
        <div onPointerDown={(event) => event.stopPropagation()}>
          <ContextMenu
            x={selectedItem.menu.x}
            y={selectedItem.menu.y}
            onToast={onToast}
            onDelete={() => onDelete(node.id)}
          />
        </div>
      ) : null}
    </div>
  );
}

function getConnectionHandleStyles(kind: CanvasConnectionKind) {
  if (kind === "text") {
    return {
      border: "var(--canvas-theme-connection-text)",
      background: "var(--canvas-theme-surface-panel)",
      ring: "var(--canvas-theme-connection-text-soft)",
      text: "var(--canvas-theme-connection-text)",
    };
  }

  return {
    border: "var(--canvas-theme-connection-image)",
    background: "var(--canvas-theme-surface-panel)",
    ring: "var(--canvas-theme-connection-image-soft)",
    text: "var(--canvas-theme-connection-image)",
  };
}

function ConnectionHandleSlot({
  count,
  kind,
  side,
  selected,
  isConnectionTarget,
  displayHeight,
  topOverride,
  interactive = true,
  onPointerDown,
}: {
  count: number;
  kind: CanvasConnectionKind;
  side: ImageHandlePosition;
  selected: boolean;
  isConnectionTarget: boolean;
  displayHeight: number;
  topOverride?: number;
  interactive?: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  // A selected node exposes both semantic connection types. Text ports must be
  // visible, not merely clickable, so users can drag a text edge deliberately.
  const shouldRenderVisibleHandle = count > 0 || selected;
  const top = topOverride ?? displayHeight / 2;

  if (!shouldRenderVisibleHandle) {
    return null;
  }

  return (
    <div
      className="absolute z-[150]"
      style={{
        width: "32px",
        height: "32px",
        top,
        left: side === "left" ? `${-AGGREGATE_HANDLE_OFFSET}px` : "auto",
        right: side === "right" ? `${-AGGREGATE_HANDLE_OFFSET}px` : "auto",
        transform: "translateY(-50%)",
      }}
    >
      {shouldRenderVisibleHandle ? (
        <AggregateConnectionHandle
          count={count}
          kind={kind}
          selected={selected}
          active={selected || isConnectionTarget}
          interactive={interactive}
          onPointerDown={onPointerDown}
        />
      ) : null}
    </div>
  );
}

function AggregateConnectionHandle({
  count,
  kind,
  selected,
  active,
  interactive,
  onPointerDown,
}: {
  count: number;
  kind: CanvasConnectionKind;
  selected: boolean;
  active: boolean;
  interactive: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const styles = getConnectionHandleStyles(kind);
  const showCount = selected && count >= 2;
  const Icon = kind === "text" ? Type : ImageIcon;

  const content = (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={showCount ? `count-${count}` : `icon-${kind}`}
          initial={{ opacity: 0, scale: 0.76, y: 2 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.78, y: -2 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="flex h-4.5 w-4.5 items-center justify-center"
          style={{ color: styles.text }}
        >
          {showCount ? (
            <span className="text-[11px] font-semibold leading-none">{count}</span>
          ) : (
            <Icon className="h-[14px] w-[14px]" strokeWidth={1.9} />
          )}
        </motion.span>
      </AnimatePresence>
    </>
  );

  const sharedProps = {
    "aria-label": `${kind} connection${count > 1 ? ` (${count})` : ""}`,
    title: count > 1 ? `${count} ${kind} connections` : `${kind} connection`,
    className: [
      "relative flex h-8 w-8 items-center justify-center rounded-full border shadow-[0_8px_18px_rgba(15,23,42,0.14)] transition duration-150",
      interactive ? "hover:scale-[1.04]" : "cursor-default",
    ].join(" "),
    style: {
      borderColor: styles.border,
      background: styles.background,
      boxShadow: active
        ? `0 0 0 3px ${styles.ring}, 0 8px 18px rgba(15,23,42,0.14)`
        : "0 8px 18px rgba(15,23,42,0.14)",
    },
  };

  if (!interactive) {
    return (
      <div
        data-canvas-interactive="true"
        {...sharedProps}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {content}
      </div>
    );
  }

  return <button type="button" data-canvas-interactive="true" {...sharedProps} onPointerDown={onPointerDown}>{content}</button>;
}

function AdaptiveImageRenderer({
  imageUrl,
  title,
  displayWidth,
  displayHeight,
  viewportZoom,
}: {
  imageUrl: string;
  title: string;
  displayWidth: number;
  displayHeight: number;
  viewportZoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const ready = renderedUrl === imageUrl;

  useEffect(() => {
    let cancelled = false;

    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      imageRef.current = image;
      setRenderedUrl(imageUrl);
    };
    image.onerror = () => {
      if (cancelled) return;
      imageRef.current = null;
    };
    image.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !ready || displayWidth <= 0 || displayHeight <= 0) return;

    // The board can zoom every frame while the wheel gesture is active, so we
    // only reraster when the zoom settles instead of on every intermediate tick.
    const rasterScale = Math.max(viewportZoom * getDevicePixelRatio(), DEFAULT_DEVICE_PIXEL_RATIO);
    const rasterWidth = Math.max(1, Math.ceil(displayWidth * rasterScale));
    const rasterHeight = Math.max(1, Math.ceil(displayHeight * rasterScale));

    if (canvas.width !== rasterWidth) canvas.width = rasterWidth;
    if (canvas.height !== rasterHeight) canvas.height = rasterHeight;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    context.clearRect(0, 0, rasterWidth, rasterHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const rect = getContainedRect({
      sourceWidth: image.naturalWidth,
      sourceHeight: image.naturalHeight,
      targetWidth: rasterWidth,
      targetHeight: rasterHeight,
    });

    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }, [displayHeight, displayWidth, ready, viewportZoom]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none h-full w-full select-none"
        aria-label={title}
        role="img"
      />
      {!ready ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={title}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
          draggable={false}
          decoding="async"
        />
      ) : null}
    </>
  );
}

function ContextMenu({
  x,
  y,
  onToast,
  onDelete,
}: {
  x: number;
  y: number;
  onToast: (message: string) => void;
  onDelete: () => void;
}) {
  const items = [
    ["Duplicate", Copy],
    ["Replace image", ImagePlus],
    ["Use as layout source", RefreshCw],
    ["Use as style reference", Sparkles],
    ["Generate similar concept", Sparkles],
    ["Remove", Trash2],
  ] as const;

  return (
    <div
      className="fixed z-[90] w-56 rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-2 shadow-2xl shadow-[var(--canvas-theme-shadow)] backdrop-blur"
      style={{ left: x, top: y }}
    >
      {items.map(([label, Icon]) => (
        <button
          key={label}
          onClick={(event) => {
            event.stopPropagation();
            if (label === "Remove") {
              onDelete();
              return;
            }
            onToast(`${label} mock`);
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold text-[var(--canvas-theme-text)] hover:bg-[var(--canvas-theme-hover)]"
        >
          <Icon className="h-4 w-4 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
