import { Box3, PerspectiveCamera, Vector3 } from 'three'

export interface YoloBox {
  xCenter: number
  yCenter: number
  width: number
  height: number
}

type Point = { x: number; y: number }

function convexHull(points: Point[]): Point[] {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const half = (input: Point[]) => {
    const result: Point[] = []
    for (const point of input) {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop()
      result.push(point)
    }
    return result.slice(0, -1)
  }
  return [...half(sorted), ...half(sorted.reverse())]
}

function clipViewport(polygon: Point[]): Point[] {
  for (const [axis, boundary, sign] of [['x', -1, 1], ['x', 1, -1], ['y', -1, 1], ['y', 1, -1]] as const) {
    const output: Point[] = []
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i]
      const end = polygon[(i + 1) % polygon.length]
      const startInside = (start[axis] - boundary) * sign >= 0
      const endInside = (end[axis] - boundary) * sign >= 0
      if (startInside !== endInside) {
        const t = (boundary - start[axis]) / (end[axis] - start[axis])
        const intersection = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
        intersection[axis] = boundary
        output.push(intersection)
      }
      if (endInside) output.push(end)
    }
    polygon = output
  }
  return polygon
}

/** Projects an amodal world AABB; does not perform occlusion or segmentation. */
export function projectBoxToYolo(box: Box3, camera: PerspectiveCamera): YoloBox | null {
  if (box.isEmpty() || ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) return null
  if (!Number.isFinite(camera.near) || !Number.isFinite(camera.far) || camera.near <= 0 || camera.far <= camera.near) return null
  camera.updateWorldMatrix(true, false)
  camera.updateProjectionMatrix()
  const corners: Vector3[] = []
  for (let i = 0; i < 8; i++) {
    corners.push(new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(camera.matrixWorldInverse))
  }
  if (corners.some((point) => !point.toArray().every(Number.isFinite))) return null
  const points: Vector3[] = []
  const minimumZ = -camera.far
  const maximumZ = -camera.near
  // Clip the twelve box edges in view space before perspective division.
  // Their endpoints include every vertex of the box clipped by near/far planes.
  for (let i = 0; i < 8; i++) {
    for (const bit of [1, 2, 4]) {
      if (i & bit) continue
      const start = corners[i]
      const end = corners[i | bit]
      const deltaZ = end.z - start.z
      let from = 0
      let to = 1
      if (deltaZ === 0) {
        if (start.z < minimumZ || start.z > maximumZ) continue
      } else {
        const a = (minimumZ - start.z) / deltaZ
        const b = (maximumZ - start.z) / deltaZ
        from = Math.max(0, Math.min(a, b))
        to = Math.min(1, Math.max(a, b))
        if (from > to) continue
      }
      points.push(start.clone().lerp(end, from), start.clone().lerp(end, to))
    }
  }
  // Project clipped points through the public Three camera projection path.
  const projected = points.map((point) => point.applyMatrix4(camera.matrixWorld).project(camera))
  if (projected.length === 0 || projected.some((point) => !point.toArray().every(Number.isFinite))) return null
  // Clip the projected convex polygon, not only its rectangle: an offscreen
  // diagonal silhouette can have a rectangle that overlaps the viewport.
  const visible = clipViewport(convexHull(projected))
  if (visible.length < 3) return null
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  const left = clamp((Math.min(...visible.map((point) => point.x)) + 1) / 2)
  const right = clamp((Math.max(...visible.map((point) => point.x)) + 1) / 2)
  const top = clamp((1 - Math.max(...visible.map((point) => point.y))) / 2)
  const bottom = clamp((1 - Math.min(...visible.map((point) => point.y))) / 2)
  if (right <= left || bottom <= top) return null
  return { xCenter: (left + right) / 2, yCenter: (top + bottom) / 2, width: right - left, height: bottom - top }
}

export function formatYoloLabel(classId: number, box: YoloBox): string {
  if (!Number.isInteger(classId) || classId < 0 || classId > 3) throw new RangeError('YOLO class ID must be an integer from 0 to 3')
  const values = [box.xCenter, box.yCenter, box.width, box.height]
  const epsilon = 1e-9
  if (!values.every(Number.isFinite) || box.width <= 0 || box.height <= 0 ||
      box.xCenter - box.width / 2 < -epsilon || box.xCenter + box.width / 2 > 1 + epsilon ||
      box.yCenter - box.height / 2 < -epsilon || box.yCenter + box.height / 2 > 1 + epsilon) {
    throw new RangeError('YOLO box must have positive area and lie inside normalized image bounds')
  }
  return `${classId} ${values.map((value) => value.toFixed(6)).join(' ')}`
}
