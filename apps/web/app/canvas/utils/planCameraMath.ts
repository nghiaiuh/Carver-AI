import type { CanvasPlanCameraTransform } from "../types/canvas";

export type PlanWorldSize = {
  width: number;
  depth: number;
};

export type PlanWorldPoint = {
  x: number;
  y: number;
  z: number;
};

export const DEFAULT_PLAN_WORLD_WIDTH = 12;

export function getPlanWorldSize(imageAspect: number): PlanWorldSize {
  const safeAspect = Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : 1;
  return {
    width: DEFAULT_PLAN_WORLD_WIDTH,
    depth: DEFAULT_PLAN_WORLD_WIDTH / safeAspect,
  };
}

export function planPointToWorld(
  u: number,
  v: number,
  z: number,
  size: PlanWorldSize,
): PlanWorldPoint {
  return {
    x: (u - 0.5) * size.width,
    y: (0.5 - v) * size.depth,
    z,
  };
}

export function worldPointToPlan(point: PlanWorldPoint, size: PlanWorldSize) {
  return {
    u: point.x / size.width + 0.5,
    v: 0.5 - point.y / size.depth,
    z: point.z,
  };
}

export function resolvePlanTargetWorld(
  plan: CanvasPlanCameraTransform,
  size: PlanWorldSize,
): PlanWorldPoint {
  const camera = planPointToWorld(plan.u, plan.v, plan.height, size);
  const targetOnPlan = planPointToWorld(plan.targetU, plan.targetV, 0, size);

  if (typeof plan.targetHeight === "number") {
    return { ...targetOnPlan, z: plan.targetHeight };
  }

  const horizontalDistance = Math.hypot(
    targetOnPlan.x - camera.x,
    targetOnPlan.y - camera.y,
  );
  return {
    ...targetOnPlan,
    z: camera.z + Math.tan((plan.pitch * Math.PI) / 180) * horizontalDistance,
  };
}

export function getPitchDegrees(camera: PlanWorldPoint, target: PlanWorldPoint) {
  const horizontalDistance = Math.hypot(target.x - camera.x, target.y - camera.y);
  if (horizontalDistance < 0.0001) {
    return target.z >= camera.z ? 90 : -90;
  }
  return (Math.atan2(target.z - camera.z, horizontalDistance) * 180) / Math.PI;
}
