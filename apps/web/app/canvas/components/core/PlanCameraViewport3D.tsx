"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Crosshair, Move, RotateCw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { CanvasMultiAngleCamera } from "../../types/canvas";
import {
  getPitchDegrees,
  getPlanWorldSize,
  planPointToWorld,
  resolvePlanTargetWorld,
  worldPointToPlan,
  type PlanWorldSize,
} from "../../utils/planCameraMath";

type GizmoMode = "move" | "rotate" | "target";
type ViewPreset = "perspective" | "top" | "image-top" | "image-right" | "image-bottom" | "image-left";

type SceneRuntime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  editorCamera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  transformControls: TransformControls;
  transformHelper: THREE.Object3D;
  cameraObjects: Map<string, THREE.PerspectiveCamera>;
  targetObject: THREE.Object3D;
  aimLine: THREE.Line;
  groundLine: THREE.Line;
  planPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  grid: THREE.GridHelper;
  render: () => void;
  dispose: () => void;
};

type PlanCameraViewport3DProps = {
  inputImageUrl: string;
  cameras: CanvasMultiAngleCamera[];
  selectedCamera: CanvasMultiAngleCamera;
  onSelect: (id: string) => void;
  onUpdateCamera: (
    id: string,
    change: (camera: CanvasMultiAngleCamera) => CanvasMultiAngleCamera,
  ) => void;
};

const viewPresets: Array<{ id: ViewPreset; label: string; title: string }> = [
  { id: "perspective", label: "3D", title: "Perspective view" },
  { id: "top", label: "Top", title: "Top plan view" },
  { id: "image-top", label: "↑", title: "View from the top edge of the image" },
  { id: "image-right", label: "→", title: "View from the right edge of the image" },
  { id: "image-bottom", label: "↓", title: "View from the bottom edge of the image" },
  { id: "image-left", label: "←", title: "View from the left edge of the image" },
];

const degToRad = (degrees: number) => (degrees * Math.PI) / 180;
const radToDeg = (radians: number) => (radians * 180) / Math.PI;
const round = (value: number, digits = 4) => Number(value.toFixed(digits));

function getThemeColor(element: HTMLElement, token: string, fallback: string) {
  const value = getComputedStyle(element).getPropertyValue(token).trim();
  const color = new THREE.Color();
  try {
    color.setStyle(value || fallback);
  } catch {
    color.setStyle(fallback);
  }
  return color;
}

function setCameraAim(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  rollDegrees: number,
) {
  camera.up.set(0, 0, 1);
  camera.lookAt(target);
  camera.rotateZ(degToRad(rollDegrees));
  camera.updateMatrixWorld(true);
}

function getCameraRollDegrees(camera: THREE.PerspectiveCamera, target: THREE.Vector3) {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const actualUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  const baseline = new THREE.PerspectiveCamera();
  baseline.up.set(0, 0, 1);
  baseline.position.copy(camera.position);
  baseline.lookAt(target);
  baseline.updateMatrixWorld(true);
  const baselineUp = new THREE.Vector3(0, 1, 0).applyQuaternion(baseline.quaternion).normalize();
  const cross = new THREE.Vector3().crossVectors(baselineUp, actualUp);
  return radToDeg(Math.atan2(forward.dot(cross), baselineUp.dot(actualUp)));
}

function updateLine(line: THREE.Line, from: THREE.Vector3, to: THREE.Vector3) {
  const geometry = line.geometry as THREE.BufferGeometry;
  geometry.setFromPoints([from, to]);
  geometry.computeBoundingSphere();
}

function createCameraVisual(color: THREE.Color) {
  const bodyMaterial = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.34), bodyMaterial);
  body.renderOrder = 8;

  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.2, 0.34, 16),
    new THREE.MeshBasicMaterial({ color, depthTest: false }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.34;
  lens.renderOrder = 8;

  return [body, lens];
}

function createTargetVisual(color: THREE.Color) {
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 24), material);
  outer.renderOrder = 9;
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), material);
  center.renderOrder = 9;
  return [outer, center];
}

function findInteractionTarget(object: THREE.Object3D | null) {
  let current = object;
  while (current) {
    if (current.userData.cameraId || current.userData.kind === "target") return current;
    current = current.parent;
  }
  return null;
}

export default function PlanCameraViewport3D({
  inputImageUrl,
  cameras,
  selectedCamera,
  onSelect,
  onUpdateCamera,
}: PlanCameraViewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const planSizeRef = useRef<PlanWorldSize>(getPlanWorldSize(1));
  const selectedCameraRef = useRef(selectedCamera);
  const camerasRef = useRef(cameras);
  const onSelectRef = useRef(onSelect);
  const onUpdateCameraRef = useRef(onUpdateCamera);
  const modeRef = useRef<GizmoMode>("move");
  const draggingRef = useRef(false);
  const activeAimDistanceRef = useRef(4);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<GizmoMode>("move");
  const [activeView, setActiveView] = useState<ViewPreset>("perspective");
  const statusText = mode === "target"
    ? "Target controls camera direction"
    : mode === "rotate"
      ? "Rotate camera"
      : "Move camera on X, Y, or Z";

  useEffect(() => {
    selectedCameraRef.current = selectedCamera;
    camerasRef.current = cameras;
    onSelectRef.current = onSelect;
    onUpdateCameraRef.current = onUpdateCamera;
    modeRef.current = mode;
  }, [cameras, mode, onSelect, onUpdateCamera, selectedCamera]);

  const syncSelectedCamera = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || draggingRef.current) return;
    const camera = selectedCameraRef.current;
    const shotCamera = runtime.cameraObjects.get(camera.id);
    if (!shotCamera) return;

    const planSize = planSizeRef.current;
    const position = planPointToWorld(camera.plan.u, camera.plan.v, camera.plan.height, planSize);
    const target = resolvePlanTargetWorld(camera.plan, planSize);
    shotCamera.position.set(position.x, position.y, position.z);
    runtime.targetObject.position.set(target.x, target.y, target.z);
    activeAimDistanceRef.current = Math.max(0.5, shotCamera.position.distanceTo(runtime.targetObject.position));
    setCameraAim(shotCamera, runtime.targetObject.position, camera.plan.roll ?? 0);
    shotCamera.fov = THREE.MathUtils.clamp(2 * radToDeg(Math.atan(18 / Math.max(1, camera.plan.lens))), 18, 100);
    shotCamera.updateProjectionMatrix();

    runtime.transformControls.detach();
    runtime.transformControls.attach(modeRef.current === "target" ? runtime.targetObject : shotCamera);
    runtime.transformControls.setMode(modeRef.current === "rotate" ? "rotate" : "translate");
    runtime.transformControls.setSpace("world");
    runtime.transformControls.showX = true;
    runtime.transformControls.showY = true;
    runtime.transformControls.showZ = true;

    updateLine(runtime.aimLine, shotCamera.position, runtime.targetObject.position);
    const ground = runtime.targetObject.position.clone();
    ground.z = 0;
    updateLine(runtime.groundLine, runtime.targetObject.position, ground);
    runtime.render();
  }, []);

  const syncCameraObjects = useCallback(() => {
    const runtime = runtimeRef.current;
    const container = containerRef.current;
    if (!runtime || !container || draggingRef.current) return;

    const selectionColor = getThemeColor(container, "--canvas-theme-selection", "#7b8bff");
    const mutedColor = getThemeColor(container, "--canvas-theme-text-muted", "#7d8799");
    const nextIds = new Set(camerasRef.current.map((camera) => camera.id));

    for (const [id, cameraObject] of runtime.cameraObjects) {
      if (nextIds.has(id)) continue;
      runtime.scene.remove(cameraObject);
      cameraObject.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
          else child.material.dispose();
        }
      });
      runtime.cameraObjects.delete(id);
    }

    for (const camera of camerasRef.current) {
      let cameraObject = runtime.cameraObjects.get(camera.id);
      if (!cameraObject) {
        cameraObject = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        cameraObject.userData.cameraId = camera.id;
        for (const visual of createCameraVisual(camera.id === selectedCameraRef.current.id ? selectionColor : mutedColor)) {
          visual.userData.cameraId = camera.id;
          cameraObject.add(visual);
        }
        runtime.cameraObjects.set(camera.id, cameraObject);
        runtime.scene.add(cameraObject);
      }

      const planSize = planSizeRef.current;
      const position = planPointToWorld(camera.plan.u, camera.plan.v, camera.plan.height, planSize);
      const target = resolvePlanTargetWorld(camera.plan, planSize);
      cameraObject.position.set(position.x, position.y, position.z);
      setCameraAim(cameraObject, new THREE.Vector3(target.x, target.y, target.z), camera.plan.roll ?? 0);
      cameraObject.visible = camera.isVisible;
      cameraObject.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const material = child.material as THREE.MeshBasicMaterial;
        material.color.copy(camera.id === selectedCameraRef.current.id ? selectionColor : mutedColor);
        material.opacity = camera.id === selectedCameraRef.current.id ? 1 : 0.42;
        material.transparent = camera.id !== selectedCameraRef.current.id;
      });
    }

    syncSelectedCamera();
  }, [syncSelectedCamera]);

  const commitSceneTransform = useCallback(() => {
    const runtime = runtimeRef.current;
    const camera = selectedCameraRef.current;
    const shotCamera = runtime?.cameraObjects.get(camera.id);
    if (!runtime || !shotCamera) return;

    const planSize = planSizeRef.current;
    const cameraPlan = worldPointToPlan(shotCamera.position, planSize);
    const targetPlan = worldPointToPlan(runtime.targetObject.position, planSize);
    const pitch = getPitchDegrees(shotCamera.position, runtime.targetObject.position);
    const roll = getCameraRollDegrees(shotCamera, runtime.targetObject.position);

    onUpdateCameraRef.current(camera.id, (current) => ({
      ...current,
      plan: {
        ...current.plan,
        u: round(cameraPlan.u),
        v: round(cameraPlan.v),
        height: round(Math.max(0.05, cameraPlan.z), 3),
        targetU: round(targetPlan.u),
        targetV: round(targetPlan.v),
        targetHeight: round(targetPlan.z, 3),
        pitch: round(pitch, 2),
        roll: round(roll, 2),
        viewDirection: "look-at-target",
      },
    }));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const selectionColor = getThemeColor(container, "--canvas-theme-selection", "#7b8bff");
    const borderColor = getThemeColor(container, "--canvas-theme-border-strong", "#3f4654");
    const textColor = getThemeColor(container, "--canvas-theme-text-muted", "#8b94a6");
    const axisXColor = getThemeColor(container, "--canvas-theme-danger", "#ef6262");
    const axisYColor = getThemeColor(container, "--canvas-theme-success", "#66c98b");
    const axisZColor = getThemeColor(container, "--canvas-theme-connection-image", "#6699ff");
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "absolute inset-0 h-full w-full touch-none";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const editorCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    editorCamera.up.set(0, 0, 1);
    editorCamera.position.set(11, -13, 11);

    const orbitControls = new OrbitControls(editorCamera, renderer.domElement);
    orbitControls.target.set(0, 0, 0);
    orbitControls.enableDamping = false;
    orbitControls.screenSpacePanning = true;
    orbitControls.minDistance = 3;
    orbitControls.maxDistance = 80;

    // OrbitControls owns wheel zoom while the pointer is over this renderer.
    // Prevent the event from bubbling to CanvasBoard's canvas-wide wheel zoom.
    const stopCanvasWheelZoom = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    renderer.domElement.addEventListener("wheel", stopCanvasWheelZoom, { passive: false });
    // Toolbar overlays sit above the renderer, so they need the same boundary
    // even though their wheel events never target the WebGL canvas directly.
    container.addEventListener("wheel", stopCanvasWheelZoom, { passive: false });

    const planPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(planSizeRef.current.width, planSizeRef.current.depth),
      new THREE.MeshBasicMaterial({ color: borderColor, side: THREE.DoubleSide }),
    );
    planPlane.position.z = -0.015;
    scene.add(planPlane);

    const grid = new THREE.GridHelper(26, 26, borderColor, borderColor);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.035;
    const gridMaterial = grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.34;
    scene.add(grid);

    const targetObject = new THREE.Object3D();
    targetObject.userData.kind = "target";
    for (const visual of createTargetVisual(selectionColor)) {
      visual.userData.kind = "target";
      targetObject.add(visual);
    }
    scene.add(targetObject);

    const aimLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: selectionColor, dashSize: 0.24, gapSize: 0.14, depthTest: false }),
    );
    aimLine.computeLineDistances();
    aimLine.renderOrder = 7;
    scene.add(aimLine);

    const groundLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: textColor, dashSize: 0.12, gapSize: 0.1, depthTest: false, transparent: true, opacity: 0.7 }),
    );
    groundLine.computeLineDistances();
    groundLine.renderOrder = 6;
    scene.add(groundLine);

    const transformControls = new TransformControls(editorCamera, renderer.domElement);
    transformControls.setSize(0.82);
    transformControls.setColors(axisXColor, axisYColor, axisZColor, selectionColor);
    const transformHelper = transformControls.getHelper();
    scene.add(transformHelper);

    let frameId: number | null = null;
    const render = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        renderer.render(scene, editorCamera);
      });
    };

    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry?.contentRect.width ?? container.clientWidth);
      const height = Math.max(1, entry?.contentRect.height ?? container.clientHeight);
      renderer.setSize(width, height, false);
      editorCamera.aspect = width / height;
      editorCamera.updateProjectionMatrix();
      render();
    });
    resizeObserver.observe(container);

    orbitControls.addEventListener("change", render);
    orbitControls.addEventListener("start", () => setActiveView("perspective"));
    transformControls.addEventListener("change", render);
    transformControls.addEventListener("mouseDown", () => {
      draggingRef.current = true;
      orbitControls.enabled = false;
    });
    transformControls.addEventListener("objectChange", () => {
      const currentCamera = selectedCameraRef.current;
      const shotCamera = runtimeRef.current?.cameraObjects.get(currentCamera.id);
      if (!shotCamera) return;

      if (modeRef.current === "rotate") {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(shotCamera.quaternion).normalize();
        targetObject.position.copy(shotCamera.position).addScaledVector(forward, activeAimDistanceRef.current);
      } else if (modeRef.current === "target") {
        setCameraAim(shotCamera, targetObject.position, currentCamera.plan.roll ?? 0);
      } else {
        setCameraAim(shotCamera, targetObject.position, currentCamera.plan.roll ?? 0);
      }
      updateLine(aimLine, shotCamera.position, targetObject.position);
      const ground = targetObject.position.clone();
      ground.z = 0;
      updateLine(groundLine, targetObject.position, ground);
      (aimLine.material as THREE.LineDashedMaterial).needsUpdate = true;
      aimLine.computeLineDistances();
      groundLine.computeLineDistances();
    });
    transformControls.addEventListener("mouseUp", () => {
      draggingRef.current = false;
      orbitControls.enabled = true;
      commitSceneTransform();
    });

    const handlePointerDown = (event: PointerEvent) => {
      pointerStartRef.current = { x: event.clientX, y: event.clientY };
    };
    const handlePointerUp = (event: PointerEvent) => {
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (!start || draggingRef.current || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, editorCamera);
      const hits = raycaster.intersectObjects([...runtimeRef.current!.cameraObjects.values(), targetObject], true);
      const target = findInteractionTarget(hits[0]?.object ?? null);
      if (target?.userData.cameraId) onSelectRef.current(target.userData.cameraId as string);
      if (target?.userData.kind === "target") setMode("target");
    };
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    const runtime: SceneRuntime = {
      renderer,
      scene,
      editorCamera,
      orbitControls,
      transformControls,
      transformHelper,
      cameraObjects: new Map(),
      targetObject,
      aimLine,
      groundLine,
      planPlane,
      grid,
      render,
      dispose: () => {
        if (frameId !== null) window.cancelAnimationFrame(frameId);
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
        renderer.domElement.removeEventListener("pointerup", handlePointerUp);
        renderer.domElement.removeEventListener("wheel", stopCanvasWheelZoom);
        container.removeEventListener("wheel", stopCanvasWheelZoom);
        orbitControls.dispose();
        transformControls.dispose();
        planPlane.material.map?.dispose();
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.GridHelper)) return;
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        });
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      },
    };
    runtimeRef.current = runtime;
    syncCameraObjects();
    render();

    return () => {
      runtimeRef.current = null;
      runtime.dispose();
    };
  }, [commitSceneTransform, syncCameraObjects]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    let disposed = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      inputImageUrl,
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, runtime.renderer.capabilities.getMaxAnisotropy());
        const image = texture.image as { width?: number; height?: number };
        const aspect = image.width && image.height ? image.width / image.height : 1;
        const size = getPlanWorldSize(aspect);
        planSizeRef.current = size;
        runtime.planPlane.geometry.dispose();
        runtime.planPlane.geometry = new THREE.PlaneGeometry(size.width, size.depth);
        runtime.planPlane.material.map?.dispose();
        runtime.planPlane.material.map = texture;
        runtime.planPlane.material.color.set("#ffffff");
        runtime.planPlane.material.needsUpdate = true;
        runtime.grid.scale.set(Math.max(1, size.width / 12), 1, Math.max(1, size.depth / 12));
        syncCameraObjects();
        runtime.render();
      },
      undefined,
      () => {
        runtime.planPlane.material.map = null;
        runtime.planPlane.material.needsUpdate = true;
        runtime.render();
      },
    );
    return () => {
      disposed = true;
    };
  }, [inputImageUrl, syncCameraObjects]);

  useEffect(() => {
    syncCameraObjects();
  }, [cameras, selectedCamera.id, syncCameraObjects]);

  useEffect(() => {
    syncSelectedCamera();
  }, [mode, syncSelectedCamera]);

  const applyViewPreset = (preset: ViewPreset) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const size = planSizeRef.current;
    const distance = Math.max(size.width, size.depth) * 1.5;
    const height = distance * 0.58;
    const positions: Record<ViewPreset, [number, number, number]> = {
      perspective: [distance * 0.72, -distance, height],
      top: [0, 0, distance],
      "image-top": [0, distance, height * 0.45],
      "image-right": [distance, 0, height * 0.45],
      "image-bottom": [0, -distance, height * 0.45],
      "image-left": [-distance, 0, height * 0.45],
    };
    runtime.editorCamera.position.set(...positions[preset]);
    runtime.editorCamera.up.set(0, preset === "top" ? 1 : 0, preset === "top" ? 0 : 1);
    runtime.orbitControls.target.set(0, 0, 0);
    runtime.editorCamera.lookAt(runtime.orbitControls.target);
    runtime.orbitControls.update();
    setActiveView(preset);
    runtime.render();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && draggingRef.current) {
      runtimeRef.current?.transformControls.reset();
      draggingRef.current = false;
      if (runtimeRef.current) runtimeRef.current.orbitControls.enabled = true;
      syncSelectedCamera();
      return;
    }
    if (event.key.toLowerCase() === "w") setMode("move");
    if (event.key.toLowerCase() === "e") setMode("rotate");
    if (event.key.toLowerCase() === "t") setMode("target");
    if (event.key.toLowerCase() === "f") applyViewPreset("perspective");
  };

  return (
    <div
      ref={containerRef}
      data-canvas-wheel-scope="local"
      tabIndex={0}
      aria-label="2.5D plan camera viewport"
      className="absolute inset-0 overflow-hidden bg-[var(--canvas-theme-surface)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--canvas-theme-selection-ring)]"
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.focus();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,var(--canvas-theme-selection-soft),transparent_52%)] opacity-30" />

      <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/95 p-1 shadow-[0_8px_22px_var(--canvas-theme-shadow)] backdrop-blur">
        <ViewportToolButton active={mode === "move"} label="Move camera (W)" onClick={() => setMode("move")}><Move className="h-3.5 w-3.5" /></ViewportToolButton>
        <ViewportToolButton active={mode === "rotate"} label="Rotate camera (E)" onClick={() => setMode("rotate")}><RotateCw className="h-3.5 w-3.5" /></ViewportToolButton>
        <ViewportToolButton active={mode === "target"} label="Move target (T)" onClick={() => setMode("target")}><Crosshair className="h-3.5 w-3.5" /></ViewportToolButton>
      </div>

      <div className="absolute right-3 top-3 z-20 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/95 p-1 shadow-[0_8px_22px_var(--canvas-theme-shadow)] backdrop-blur">
        <div className="mb-1 flex items-center gap-1 px-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--canvas-theme-text-muted)]"><Box className="h-3 w-3" /> View</div>
        <div className="grid grid-cols-3 gap-1">
          {viewPresets.map((preset) => (
            <button key={preset.id} type="button" title={preset.title} aria-pressed={activeView === preset.id} onClick={() => applyViewPreset(preset.id)} className={`grid h-7 min-w-7 place-items-center rounded-md px-1 text-[9px] font-semibold transition ${activeView === preset.id ? "bg-[var(--canvas-theme-selection-soft)] text-[var(--canvas-theme-selection)]" : "text-[var(--canvas-theme-text-soft)] hover:bg-[var(--canvas-theme-hover)]"}`}>{preset.label}</button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-lg border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/90 px-2.5 py-1.5 text-[10px] text-[var(--canvas-theme-text-muted)] backdrop-blur">
        <span className="font-semibold text-[var(--canvas-theme-text-soft)]">{selectedCamera.name}</span>
        <span className="mx-1.5">•</span>
        {statusText}
        <span className="mx-1.5">•</span>
        Drag background to orbit · wheel to zoom
      </div>
    </div>
  );
}

function ViewportToolButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-lg transition ${active ? "bg-[var(--canvas-theme-selection-soft)] text-[var(--canvas-theme-selection)]" : "text-[var(--canvas-theme-text-soft)] hover:bg-[var(--canvas-theme-hover)]"}`}
    >
      {children}
    </button>
  );
}
