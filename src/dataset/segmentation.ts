import { Curve, PerspectiveCamera, Vector3 } from 'three';

export type Point2 = { x: number; y: number };
/** Normalized polygon vertices [x, y] in 0..1 image coordinates, y downward. */
export type Polygon = [number, number][];

export interface RopeSegmentation {
  polygons: Polygon[];
  /** Visible centerline samples in pixel coordinates, in curve order. */
  centerline: Point2[];
  /** Fraction of curve samples that survived the near plane, viewport and visibility tests. */
  visibleFraction: number;
}

export interface Sag2D {
  endpointDistancePx: number;
  maxDeviationPx: number;
  ratio: number;
}

function clipPolygon(polygon: Point2[], width: number, height: number): Point2[] {
  const edges: [keyof Point2, number, number][] = [['x', 0, 1], ['x', width, -1], ['y', 0, 1], ['y', height, -1]];
  for (const [axis, boundary, sign] of edges) {
    const output: Point2[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i];
      const end = polygon[(i + 1) % polygon.length];
      const startInside = (start[axis] - boundary) * sign >= 0;
      const endInside = (end[axis] - boundary) * sign >= 0;
      if (startInside !== endInside) {
        const t = (boundary - start[axis]) / (end[axis] - start[axis]);
        const intersection = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
        intersection[axis] = boundary;
        output.push(intersection);
      }
      if (endInside) output.push(end);
    }
    polygon = output;
    if (polygon.length === 0) break;
  }
  return polygon;
}

function polygonArea(polygon: Point2[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Projects the tube silhouette of a rope curve into image space as YOLO-Seg
 * polygons. Samples hidden by `isVisible` split the rope into separate visible
 * runs, so partially occluded ropes produce several polygons.
 */
export function projectRopeSegmentation(
  curve: Curve<Vector3>,
  radius: number,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  isVisible: (point: Vector3, index: number) => boolean = () => true,
  samples = 64,
): RopeSegmentation {
  camera.updateWorldMatrix(true, false);
  camera.updateProjectionMatrix();
  const focalPx = (height / 2) / Math.tan((camera.fov * Math.PI) / 360);
  const points = curve.getPoints(Math.max(2, samples));
  type Sample = { center: Point2; radiusPx: number } | null;
  const projected: Sample[] = points.map((point, index) => {
    const view = point.clone().applyMatrix4(camera.matrixWorldInverse);
    if (!(view.z < -camera.near) || view.z < -camera.far) return null;
    const ndc = point.clone().project(camera);
    if (!ndc.toArray().every(Number.isFinite)) return null;
    const center = { x: (ndc.x + 1) / 2 * width, y: (1 - ndc.y) / 2 * height };
    const margin = radius * focalPx / -view.z + 2;
    if (center.x < -margin || center.x > width + margin || center.y < -margin || center.y > height + margin) return null;
    if (!isVisible(point, index)) return null;
    return { center, radiusPx: Math.max(.75, radius * focalPx / -view.z) };
  });
  const polygons: Polygon[] = [];
  const centerline: Point2[] = [];
  let run: NonNullable<Sample>[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const left: Point2[] = [], right: Point2[] = [];
      for (let i = 0; i < run.length; i++) {
        const previous = run[Math.max(0, i - 1)].center, next = run[Math.min(run.length - 1, i + 1)].center;
        let dx = next.x - previous.x, dy = next.y - previous.y;
        const length = Math.hypot(dx, dy) || 1;
        dx /= length; dy /= length;
        const r = run[i].radiusPx;
        left.push({ x: run[i].center.x - dy * r, y: run[i].center.y + dx * r });
        right.push({ x: run[i].center.x + dy * r, y: run[i].center.y - dx * r });
      }
      // Round caps keep the ends from collapsing to a knife edge.
      const first = run[0], last = run[run.length - 1];
      const cap = (sample: NonNullable<Sample>, from: Point2, to: Point2) => {
        const out: Point2[] = [];
        const a0 = Math.atan2(from.y - sample.center.y, from.x - sample.center.x);
        let a1 = Math.atan2(to.y - sample.center.y, to.x - sample.center.x);
        while (a1 < a0) a1 += Math.PI * 2;
        for (let k = 1; k < 4; k++) {
          const a = a0 + (a1 - a0) * k / 4;
          out.push({ x: sample.center.x + Math.cos(a) * sample.radiusPx, y: sample.center.y + Math.sin(a) * sample.radiusPx });
        }
        return out;
      };
      const ring = [...left, ...cap(last, left[left.length - 1], right[right.length - 1]), ...right.reverse(), ...cap(first, right[right.length - 1], left[0])];
      const clipped = clipPolygon(ring, width, height);
      if (clipped.length >= 3 && polygonArea(clipped) >= 1) {
        polygons.push(clipped.map(p => [Math.min(1, Math.max(0, p.x / width)), Math.min(1, Math.max(0, p.y / height))]));
        centerline.push(...run.map(s => s.center));
      }
    }
    run = [];
  };
  for (const sample of projected) {
    if (sample) run.push(sample); else flush();
  }
  flush();
  return { polygons, centerline, visibleFraction: projected.filter(Boolean).length / projected.length };
}

/** Notion formula: SagRatio = MaximumDeviation / EndpointDistance, measured on the image-space centerline. */
export function estimateSag2D(centerline: Point2[]): Sag2D | null {
  if (centerline.length < 2) return null;
  const a = centerline[0], b = centerline[centerline.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-6) return null;
  let maxDeviation = 0;
  for (const p of centerline) {
    const deviation = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / chord;
    if (deviation > maxDeviation) maxDeviation = deviation;
  }
  return { endpointDistancePx: chord, maxDeviationPx: maxDeviation, ratio: maxDeviation / chord };
}

/** Axis-aligned box as a four-vertex YOLO-Seg polygon. */
export function boxToPolygon(box: { xCenter: number; yCenter: number; width: number; height: number }): Polygon {
  const l = box.xCenter - box.width / 2, r = box.xCenter + box.width / 2, t = box.yCenter - box.height / 2, b = box.yCenter + box.height / 2;
  return [[l, t], [r, t], [r, b], [l, b]];
}

export function formatYoloSegLabel(classId: number, polygon: Polygon, maxClassId = 5): string {
  if (!Number.isInteger(classId) || classId < 0 || classId > maxClassId) throw new RangeError(`YOLO-Seg class ID must be an integer from 0 to ${maxClassId}`);
  if (polygon.length < 3) throw new RangeError('YOLO-Seg polygon needs at least three vertices');
  const epsilon = 1e-9;
  for (const [x, y] of polygon) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -epsilon || x > 1 + epsilon || y < -epsilon || y > 1 + epsilon) {
      throw new RangeError('YOLO-Seg polygon vertices must lie inside normalized image bounds');
    }
  }
  return `${classId} ${polygon.map(([x, y]) => `${x.toFixed(6)} ${y.toFixed(6)}`).join(' ')}`;
}
