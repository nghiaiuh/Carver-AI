import type { CanvasOrbitCameraTransform } from "../types/canvas";

export type OrbitWorldPoint = {
  x: number;
  y: number;
  z: number;
};

export const MIN_ORBIT_TILT = -80;
export const MAX_ORBIT_TILT = 80;

const degToRad = (degrees: number) => (degrees * Math.PI) / 180;
const radToDeg = (radians: number) => (radians * 180) / Math.PI;

export function wrapOrbitDegrees(degrees: number) {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

export function clampOrbitTilt(tilt: number) {
  return Math.min(MAX_ORBIT_TILT, Math.max(MIN_ORBIT_TILT, tilt));
}

/**
 * Orbit convention: 0 degrees is in front of the image (+Z), 90 is image-right
 * (+X), and positive tilt moves above the image (+Y).
 */
export function orbitTransformToWorld(
  orbit: Pick<CanvasOrbitCameraTransform, "rotate" | "tilt" | "distance">,
): OrbitWorldPoint {
  const azimuth = degToRad(orbit.rotate);
  const elevation = degToRad(clampOrbitTilt(orbit.tilt));
  const radius = Math.max(0, orbit.distance);
  const horizontalRadius = radius * Math.cos(elevation);

  return {
    x: horizontalRadius * Math.sin(azimuth),
    y: radius * Math.sin(elevation),
    z: horizontalRadius * Math.cos(azimuth),
  };
}

export function worldPointToOrbit(point: OrbitWorldPoint) {
  const distance = Math.hypot(point.x, point.y, point.z);
  if (distance < 0.000001) {
    return { rotate: 0, tilt: 0, distance: 0 };
  }

  return {
    rotate: wrapOrbitDegrees(radToDeg(Math.atan2(point.x, point.z))),
    tilt: clampOrbitTilt(radToDeg(Math.asin(point.y / distance))),
    distance,
  };
}
