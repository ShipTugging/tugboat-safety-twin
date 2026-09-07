import assert from 'node:assert/strict'
import test from 'node:test'
import { Box3, Group, PerspectiveCamera, Vector3 } from 'three'
import { formatYoloLabel, projectBoxToYolo } from '../src/dataset/projection'

const camera = () => new PerspectiveCamera(90, 1, 1, 100)
const box = (min: number[], max: number[]) => new Box3(new Vector3(...min), new Vector3(...max))
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

test('projects a centered box with known FOV and aspect', () => {
  const cam = camera()
  cam.aspect = 2
  const result = projectBoxToYolo(box([-1, -1, -6], [1, 1, -4]), cam)!
  close(result.xCenter, 0.5)
  close(result.yCenter, 0.5)
  close(result.width, 0.125)
  close(result.height, 0.25)
})

test('uses image coordinates with downward y', () => {
  const result = projectBoxToYolo(box([-1, 1, -4], [1, 2, -4]), camera())!
  close(result.yCenter, 0.3125)
  close(result.height, 0.125)
})

test('updates rotated camera and parent transforms', () => {
  const parent = new Group()
  const cam = camera()
  parent.position.set(10, 0, 0)
  parent.rotation.y = Math.PI / 2
  parent.add(cam)
  const result = projectBoxToYolo(box([4, -1, -1], [6, 1, 1]), cam)!
  close(result.xCenter, 0.5)
  close(result.yCenter, 0.5)
  close(result.width, 0.25)
})

test('clips a partially visible box to the viewport', () => {
  const result = projectBoxToYolo(box([3, -1, -4], [6, 1, -4]), camera())!
  close(result.xCenter, 0.9375)
  close(result.width, 0.125)
})

test('rejects behind, offscreen, beyond far and before near boxes', () => {
  for (const bounds of [box([-1, -1, 2], [1, 1, 4]), box([20, -1, -4], [22, 1, -2]), box([-1, -1, -105], [1, 1, -101]), box([-.1, -.1, -.5], [.1, .1, -.1])]) {
    assert.equal(projectBoxToYolo(bounds, camera()), null)
  }
})

test('clips edges crossing near plane even with corners behind the camera', () => {
  const result = projectBoxToYolo(box([-.5, -.5, -2], [.5, .5, 2]), camera())!
  close(result.xCenter, 0.5)
  close(result.width, 0.5)
  close(result.height, 0.5)
})

test('clips far-plane crossing edges', () => {
  const cam = camera()
  cam.far = 5
  const result = projectBoxToYolo(box([-1, -1, -8], [1, 1, -4]), cam)!
  close(result.width, 0.25)
})

test('box enclosing the viewing frustum covers the viewport', () => {
  const result = projectBoxToYolo(box([-1000, -1000, -1000], [1000, 1000, 1000]), camera())!
  assert.deepEqual(result, { xCenter: .5, yCenter: .5, width: 1, height: 1 })
})

test('rejects empty, nonfinite and zero projected area boxes', () => {
  for (const bounds of [new Box3(), box([NaN, 0, -3], [1, 1, -2]), box([-1, -1, -Infinity], [1, 1, -2]), box([0, 0, -4], [0, 0, -2])]) {
    assert.equal(projectBoxToYolo(bounds, camera()), null)
  }
})

test('formats six-decimal YOLO labels and validates the class and bounds', () => {
  const bounds = { xCenter: .5, yCenter: .25, width: .125, height: .1 }
  assert.equal(formatYoloLabel(3, bounds), '3 0.500000 0.250000 0.125000 0.100000')
  for (const id of [-1, 4, 1.5, NaN]) assert.throws(() => formatYoloLabel(id, bounds))
  for (const invalid of [{ ...bounds, width: 0 }, { ...bounds, height: NaN }, { ...bounds, xCenter: 1 }, { ...bounds, width: 2 }]) {
    assert.throws(() => formatYoloLabel(0, invalid))
  }
})
