import { Euler, Quaternion, Vector3 } from 'three';
import type { SimulationParams, TelemetryState } from '../types/maritime';
import { settlePhysics } from '../simulation/physics';

type Vec3=[number,number,number];
type Quat=[number,number,number,number];
interface Pose {position:Vec3;quaternion:Quat}
export const IMU_SPEC={
  source:'ideal_simulated_imu',sampleRateHz:100,windowMs:200,samplesPerFrame:21,
  clock:'simulation milliseconds; zero is the simulator time origin, not Unix time',
  synchronization:'Last IMU sample is exactly the RGB frame telemetry timestamp. Each image is an independent scene; windows from different frame IDs must not be concatenated.',
  sensorFrame:'Tug model local right-handed XYZ: +Y up, +Z bow, +X model lateral axis. Sensor aligned with model at local origin [0,0,0].',
  rotation:'quaternion [x,y,z,w] maps sensor/body to simulator world; Euler XYZ [pitch,yaw,roll] degrees',
  accelerometer:'body specific force in m/s^2: inverse rotation of (world linear acceleration - gravity); rest upright = [0,+9.80665,0]',
  gyroscope:'body angular velocity in rad/s, shortest quaternion rotation over a centered 20ms difference',
  gravityWorldMps2:[0,-9.80665,0],
  limitations:'Noise-free model-derived samples, not hardware measurements. Centered numerical derivatives use neighboring virtual poses; no future images are included. Sensor bias, latency and real-vessel validation are not modeled.',
} as const;

/** Centered derivatives of physical poses, not differences between randomized images. */
export function measureImu(previous:Pose,current:Pose,next:Pose,dt:number) {
  if(!Number.isFinite(dt)||dt<=0)throw new Error('Invalid IMU time step');
  const q=new Quaternion(...current.quaternion).normalize();
  const acceleration=new Vector3(...next.position).add(new Vector3(...previous.position)).addScaledVector(new Vector3(...current.position),-2).multiplyScalar(1/(dt*dt));
  const specificForce=acceleration.clone().sub(new Vector3(0,-9.80665,0)).applyQuaternion(q.clone().invert());
  const delta=new Quaternion(...next.quaternion).normalize().multiply(new Quaternion(...previous.quaternion).normalize().invert()).normalize();
  // q and -q are the same attitude; always take the short rotation arc.
  if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);
  const sinHalf=Math.hypot(delta.x,delta.y,delta.z);
  const angle=2*Math.atan2(sinHalf,delta.w);
  const omega=new Vector3(delta.x,delta.y,delta.z).multiplyScalar(sinHalf>1e-12?angle/(sinHalf*2*dt):0).applyQuaternion(q.clone().invert());
  return {accelerometerMps2:specificForce.toArray() as Vec3,gyroscopeRadS:omega.toArray() as Vec3,linearAccelerationWorldMps2:acceleration.toArray() as Vec3};
}

function poseOf(telemetry:TelemetryState):Pose {
  return {position:telemetry.tugPosition,quaternion:new Quaternion().setFromEuler(new Euler(...telemetry.tugRotation)).toArray() as Quat};
}

export function createSyncedImu(frameId:string,params:SimulationParams,telemetry:TelemetryState) {
  const timestampMs=telemetry.timestamp;
  if(!Number.isFinite(timestampMs))throw new Error('Invalid image timestamp');
  // Retain the exact pose rendered for the image at offset zero.
  const poses=new Map<number,TelemetryState>([[0,telemetry]]);
  const get=(offset:number)=>{
    if(!poses.has(offset))poses.set(offset,settlePhysics(params,timestampMs+offset*10));
    return poses.get(offset)!;
  };
  const samples=Array.from({length:21},(_,i)=>{
    const offset=i-20,current=get(offset);
    return {
      timestampMs:timestampMs+offset*10,offsetMs:offset*10,
      ...measureImu(poseOf(get(offset-1)),poseOf(current),poseOf(get(offset+1)),.01),
      orientationQuaternion:poseOf(current).quaternion,
      orientationEulerDeg:current.tugRotation.map(v=>v*180/Math.PI) as Vec3,
      positionWorldM:[...current.tugPosition] as Vec3,
      simulatorRollRateDegS:current.imuRollRateDegS,
    };
  });
  return {frameId,sequenceId:frameId,timestampMs,sampleRateHz:100,windowMs:200,sample:samples[20],samples};
}
export type SyncedImu=ReturnType<typeof createSyncedImu>;
