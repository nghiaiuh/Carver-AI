"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { Camera, CircleDot } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CanvasCameraDisplayMode, CanvasMultiAngleCamera } from "../../types/canvas";
import {
  clampOrbitTilt,
  orbitTransformToWorld,
  wrapOrbitDegrees,
} from "../../utils/orbitCameraMath";

type OrbitCameraViewport3DProps = {
  inputImageUrl: string;
  cameras: CanvasMultiAngleCamera[];
  selectedCamera: CanvasMultiAngleCamera;
  displayMode: CanvasCameraDisplayMode;
  onSelect: (id: string) => void;
  onUpdateCamera: (
    id: string,
    change: (camera: CanvasMultiAngleCamera) => CanvasMultiAngleCamera,
  ) => void;
};

type SceneRuntime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  editorCamera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  cameraObjects: Map<string, THREE.PerspectiveCamera>;
  cameraHelpers: Map<string, THREE.CameraHelper>;
  aimLines: Map<string, THREE.Line>;
  sphereGrid: THREE.Group;
  imagePlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  render: () => void;
  dispose: () => void;
};

type CameraDrag = {
  cameraId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startRotate: number;
  startTilt: number;
  rotate: number;
  tilt: number;
  distance: number;
};

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

function createCameraVisual(color: THREE.Color) {
  const material = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    transparent: true,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.36), material);
  body.renderOrder = 8;

  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.2, 0.36, 16),
    material.clone(),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.36;
  lens.renderOrder = 8;

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.13, 0.2),
    material.clone(),
  );
  top.position.y = 0.25;
  top.renderOrder = 8;

  return [body, lens, top];
}

function createUnitSphereGrid(color: THREE.Color) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  for (const latitude of [-60, -30, 0, 30, 60]) {
    const elevation = THREE.MathUtils.degToRad(latitude);
    const radius = Math.cos(elevation);
    const y = Math.sin(elevation);
    const points = Array.from({ length: 65 }, (_, index) => {
      const azimuth = (index / 64) * Math.PI * 2;
      return new THREE.Vector3(
        radius * Math.sin(azimuth),
        y,
        radius * Math.cos(azimuth),
      );
    });
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  for (let longitude = 0; longitude < 180; longitude += 30) {
    const azimuth = THREE.MathUtils.degToRad(longitude);
    const points = Array.from({ length: 65 }, (_, index) => {
      const angle = (index / 64) * Math.PI * 2;
      return new THREE.Vector3(
        Math.sin(angle) * Math.sin(azimuth),
        Math.cos(angle),
        Math.sin(angle) * Math.cos(azimuth),
      );
    });
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  return group;
}

function updateLine(line: THREE.Line, from: THREE.Vector3, to: THREE.Vector3) {
  const geometry = line.geometry as THREE.BufferGeometry;
  geometry.setFromPoints([from, to]);
  geometry.computeBoundingSphere();
}

function findCameraId(object: THREE.Object3D | null) {
  let current = object;
  while (current) {
    if (typeof current.userData.cameraId === "string") return current.userData.cameraId as string;
    current = current.parent;
  }
  return null;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((entry) => {
    if (entry instanceof THREE.Mesh || entry instanceof THREE.Line) {
      entry.geometry.dispose();
      const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

export default function OrbitCameraViewport3D({
  inputImageUrl,
  cameras,
  selectedCamera,
  displayMode,
  onSelect,
  onUpdateCamera,
}: OrbitCameraViewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const camerasRef = useRef(cameras);
  const selectedCameraRef = useRef(selectedCamera);
  const displayModeRef = useRef(displayMode);
  const onSelectRef = useRef(onSelect);
  const onUpdateCameraRef = useRef(onUpdateCamera);

  useEffect(() => {
    camerasRef.current = cameras;
    selectedCameraRef.current = selectedCamera;
    displayModeRef.current = displayMode;
    onSelectRef.current = onSelect;
    onUpdateCameraRef.current = onUpdateCamera;
  }, [cameras, displayMode, onSelect, onUpdateCamera, selectedCamera]);

  const syncCameraObjects = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const selectedId = selectedCameraRef.current.id;
    const activeIds = new Set(camerasRef.current.map((camera) => camera.id));
    for (const [cameraId, cameraObject] of runtime.cameraObjects) {
      if (activeIds.has(cameraId)) continue;
      const helper = runtime.cameraHelpers.get(cameraId);
      const aimLine = runtime.aimLines.get(cameraId);
      runtime.scene.remove(cameraObject);
      disposeObject(cameraObject);
      if (helper) {
        runtime.scene.remove(helper);
        helper.dispose();
        runtime.cameraHelpers.delete(cameraId);
      }
      if (aimLine) {
        runtime.scene.remove(aimLine);
        disposeObject(aimLine);
        runtime.aimLines.delete(cameraId);
      }
      runtime.cameraObjects.delete(cameraId);
    }

    const selectionColor = getThemeColor(
      runtime.renderer.domElement,
      "--canvas-theme-selection",
      "#7b8bff",
    );
    const mutedColor = getThemeColor(
      runtime.renderer.domElement,
      "--canvas-theme-text-muted",
      "#8b94a6",
    );

    for (const camera of camerasRef.current) {
      let cameraObject = runtime.cameraObjects.get(camera.id);
      let helper = runtime.cameraHelpers.get(camera.id);
      let aimLine = runtime.aimLines.get(camera.id);
      if (!cameraObject) {
        cameraObject = new THREE.PerspectiveCamera(50, 1.35, 0.25, 20);
        cameraObject.userData.cameraId = camera.id;
        for (const visual of createCameraVisual(mutedColor)) {
          visual.userData.cameraId = camera.id;
          cameraObject.add(visual);
        }
        runtime.scene.add(cameraObject);
        runtime.cameraObjects.set(camera.id, cameraObject);

        helper = new THREE.CameraHelper(cameraObject);
        helper.userData.cameraId = camera.id;
        helper.renderOrder = 6;
        helper.setColors(
          selectionColor,
          selectionColor,
          selectionColor,
          selectionColor,
          selectionColor,
        );
        runtime.scene.add(helper);
        runtime.cameraHelpers.set(camera.id, helper);

        aimLine = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineDashedMaterial({
            color: selectionColor,
            transparent: true,
            opacity: 0.18,
            dashSize: 0.25,
            gapSize: 0.18,
            depthTest: false,
          }),
        );
        aimLine.renderOrder = 5;
        runtime.scene.add(aimLine);
        runtime.aimLines.set(camera.id, aimLine);
      }

      const active = camera.id === selectedId;
      const world = orbitTransformToWorld(camera.orbit);
      cameraObject.position.set(world.x, world.y, world.z);
      cameraObject.up.set(0, 1, 0);
      cameraObject.lookAt(0, 0, 0);
      cameraObject.near = 0.2;
      cameraObject.far = Math.max(1.2, camera.orbit.distance * 0.72);
      cameraObject.setFocalLength(camera.orbit.lens);
      cameraObject.updateProjectionMatrix();
      cameraObject.updateMatrixWorld(true);
      cameraObject.visible = camera.isVisible;

      cameraObject.traverse((entry) => {
        if (!(entry instanceof THREE.Mesh)) return;
        const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
        for (const material of materials) {
          if (!(material instanceof THREE.MeshBasicMaterial)) continue;
          material.color.copy(active ? selectionColor : mutedColor);
          material.opacity = active ? 1 : displayModeRef.current === "ghost" ? 0.3 : 0.68;
        }
      });

      if (helper) {
        helper.visible = active && camera.isVisible;
        const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
        materials.forEach((material) => {
          material.depthTest = false;
          material.transparent = true;
          material.opacity = 0.48;
        });
        helper.update();
      }

      if (aimLine) {
        aimLine.visible = camera.isVisible;
        updateLine(aimLine, cameraObject.position, new THREE.Vector3());
        aimLine.computeLineDistances();
        (aimLine.material as THREE.LineDashedMaterial).opacity = active ? 0.82 : 0.16;
      }
    }

    runtime.sphereGrid.scale.setScalar(Math.max(0.1, selectedCameraRef.current.orbit.distance));
    runtime.render();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const editorCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    editorCamera.position.set(16, 10, 16);
    editorCamera.lookAt(0, 0, 0);

    const orbitControls = new OrbitControls(editorCamera, renderer.domElement);
    orbitControls.target.set(0, 0, 0);
    orbitControls.enableDamping = false;
    orbitControls.enablePan = false;
    orbitControls.minDistance = 5;
    orbitControls.maxDistance = 55;
    orbitControls.rotateSpeed = 0.65;
    orbitControls.zoomSpeed = 0.8;

    const borderColor = getThemeColor(container, "--canvas-theme-border-strong", "#3f4654");
    const surfaceColor = getThemeColor(container, "--canvas-theme-surface-muted", "#20242c");
    const sphereGrid = createUnitSphereGrid(borderColor);
    scene.add(sphereGrid);

    const imagePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 3.2),
      new THREE.MeshBasicMaterial({
        color: surfaceColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
      }),
    );
    imagePlane.renderOrder = 2;
    scene.add(imagePlane);

    const centerMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      new THREE.MeshBasicMaterial({
        color: getThemeColor(container, "--canvas-theme-selection", "#7b8bff"),
        depthTest: false,
      }),
    );
    centerMarker.renderOrder = 9;
    scene.add(centerMarker);

    const render = () => renderer.render(scene, editorCamera);
    orbitControls.addEventListener("change", render);

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      editorCamera.aspect = width / height;
      editorCamera.updateProjectionMatrix();
      render();
    });
    resizeObserver.observe(container);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let cameraDrag: CameraDrag | null = null;

    const getCameraAtPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, editorCamera);
      const hits = raycaster.intersectObjects(Array.from(runtime.cameraObjects.values()), true);
      return findCameraId(hits[0]?.object ?? null);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target !== renderer.domElement || event.button !== 0) return;
      const cameraId = getCameraAtPointer(event);
      if (!cameraId) return;
      const camera = camerasRef.current.find((entry) => entry.id === cameraId);
      if (!camera) return;

      event.preventDefault();
      event.stopPropagation();
      container.focus();
      container.setPointerCapture(event.pointerId);
      orbitControls.enabled = false;
      cameraDrag = {
        cameraId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRotate: camera.orbit.rotate,
        startTilt: camera.orbit.tilt,
        rotate: camera.orbit.rotate,
        tilt: camera.orbit.tilt,
        distance: camera.orbit.distance,
      };
      onSelectRef.current(cameraId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!cameraDrag || cameraDrag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const rotate = wrapOrbitDegrees(
        cameraDrag.startRotate + ((event.clientX - cameraDrag.startClientX) / width) * 300,
      );
      const tilt = clampOrbitTilt(
        cameraDrag.startTilt - ((event.clientY - cameraDrag.startClientY) / height) * 180,
      );
      const cameraId = cameraDrag.cameraId;
      if (cameraDrag.rotate === rotate && cameraDrag.tilt === tilt) return;

      cameraDrag.rotate = rotate;
      cameraDrag.tilt = tilt;

      const cameraObject = runtime.cameraObjects.get(cameraId);
      if (!cameraObject) return;

      const world = orbitTransformToWorld({ rotate, tilt, distance: cameraDrag.distance });
      cameraObject.position.set(world.x, world.y, world.z);
      cameraObject.lookAt(0, 0, 0);
      cameraObject.updateMatrixWorld(true);

      const helper = runtime.cameraHelpers.get(cameraId);
      helper?.update();
      const aimLine = runtime.aimLines.get(cameraId);
      if (aimLine) {
        updateLine(aimLine, cameraObject.position, new THREE.Vector3());
        aimLine.computeLineDistances();
      }
      runtime.render();
    };

    const finishCameraDrag = (event: PointerEvent) => {
      if (!cameraDrag || cameraDrag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const { cameraId, rotate, tilt, startRotate, startTilt } = cameraDrag;
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
      cameraDrag = null;
      orbitControls.enabled = true;
      if (rotate === startRotate && tilt === startTilt) return;
      onUpdateCameraRef.current(cameraId, (camera) => {
        if (camera.orbit.rotate === rotate && camera.orbit.tilt === tilt) return camera;
        return {
          ...camera,
          orbit: { ...camera.orbit, rotate, tilt },
        };
      });
    };

    container.addEventListener("pointerdown", handlePointerDown, true);
    container.addEventListener("pointermove", handlePointerMove, true);
    container.addEventListener("pointerup", finishCameraDrag, true);
    container.addEventListener("pointercancel", finishCameraDrag, true);

    const stopCanvasWheelZoom = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    renderer.domElement.addEventListener("wheel", stopCanvasWheelZoom, { passive: false });
    container.addEventListener("wheel", stopCanvasWheelZoom, { passive: false });

    const runtime: SceneRuntime = {
      renderer,
      scene,
      editorCamera,
      orbitControls,
      cameraObjects: new Map(),
      cameraHelpers: new Map(),
      aimLines: new Map(),
      sphereGrid,
      imagePlane,
      render,
      dispose: () => {
        resizeObserver.disconnect();
        container.removeEventListener("pointerdown", handlePointerDown, true);
        container.removeEventListener("pointermove", handlePointerMove, true);
        container.removeEventListener("pointerup", finishCameraDrag, true);
        container.removeEventListener("pointercancel", finishCameraDrag, true);
        renderer.domElement.removeEventListener("wheel", stopCanvasWheelZoom);
        container.removeEventListener("wheel", stopCanvasWheelZoom);
        orbitControls.removeEventListener("change", render);
        orbitControls.dispose();
        imagePlane.material.map?.dispose();
        scene.traverse((object) => {
          if (object instanceof THREE.CameraHelper) {
            object.dispose();
          } else if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        renderer.dispose();
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
  }, [syncCameraObjects]);

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
        const aspect = image.width && image.height ? image.width / image.height : 1.5;
        const maxWidth = 4.8;
        const maxHeight = 3.6;
        const width = aspect >= maxWidth / maxHeight ? maxWidth : maxHeight * aspect;
        const height = aspect >= maxWidth / maxHeight ? maxWidth / aspect : maxHeight;
        runtime.imagePlane.geometry.dispose();
        runtime.imagePlane.geometry = new THREE.PlaneGeometry(width, height);
        runtime.imagePlane.material.map?.dispose();
        runtime.imagePlane.material.map = texture;
        runtime.imagePlane.material.color.set("#ffffff");
        runtime.imagePlane.material.needsUpdate = true;
        runtime.render();
      },
      undefined,
      () => runtime.render(),
    );
    return () => {
      disposed = true;
    };
  }, [inputImageUrl]);

  useEffect(() => {
    syncCameraObjects();
  }, [cameras, displayMode, selectedCamera.id, syncCameraObjects]);

  return (
    <div
      ref={containerRef}
      data-canvas-wheel-scope="local"
      tabIndex={0}
      aria-label="3D spherical orbit camera viewport"
      className="absolute inset-0 overflow-hidden bg-[var(--canvas-theme-surface)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--canvas-theme-selection-ring)]"
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.focus();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,var(--canvas-theme-selection-soft),transparent_58%)] opacity-25" />

      <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-2 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/92 px-2.5 py-2 text-[10px] text-[var(--canvas-theme-text-muted)] shadow-[0_8px_22px_var(--canvas-theme-shadow)] backdrop-blur">
        <CircleDot className="h-3.5 w-3.5 text-[var(--canvas-theme-selection)]" />
        <span className="font-semibold text-[var(--canvas-theme-text-soft)]">Spherical orbit</span>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-lg border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/90 px-2.5 py-1.5 text-[10px] text-[var(--canvas-theme-text-muted)] backdrop-blur">
        <span className="inline-flex items-center gap-1 font-semibold text-[var(--canvas-theme-text-soft)]">
          <Camera className="h-3 w-3" />
          {selectedCamera.name}
        </span>
        <span className="mx-1.5">•</span>
        {Math.round(selectedCamera.orbit.rotate)}° / {Math.round(selectedCamera.orbit.tilt)}° / {selectedCamera.orbit.distance.toFixed(1)} m
        <span className="mx-1.5">•</span>
        Drag camera · drag background to inspect · wheel to zoom
      </div>
    </div>
  );
}
