/**
 * Camera rig: the camera follows the scene's keyframes (eased glides between keys), never cuts.
 *  - playing / scrubbing smoothly: the pose is the keyed pose at t;
 *  - a jump in t (step buttons, a click on the scrubber, a stage reload) or a step change after the user
 *    orbited: a ≈1.2 s glide from wherever the camera is to the keyed pose (which keeps moving with t);
 *  - the user drags / wheels: the rig lets go until the next step change or "reset view".
 * Interpolation is orbital (target lerp + offset direction nlerp + log-radius lerp), so glides swing
 * around the specimen instead of flying through it.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { easeInOut, type V3 } from '@/engine/anim';

export interface CamKey {
  /** stage time of this key (keys sorted by `at`) */
  at: number;
  pos: V3;
  target: V3;
  fov?: number;
}

interface Pose {
  pos: Vector3;
  target: Vector3;
  fov: number;
}

const newPose = (): Pose => ({ pos: new Vector3(), target: new Vector3(), fov: 40 });
const GLIDE = 1.2;
const DEFAULT_KEYS: CamKey[] = [{ at: 0, pos: [0, 2, 12], target: [0, 0, 0], fov: 40 }];

// scratch
const oa = new Vector3();
const ob = new Vector3();

/** Orbital blend of two poses into `out` (out may alias neither input). */
function blend(a: Pose, b: Pose, k: number, out: Pose) {
  out.target.lerpVectors(a.target, b.target, k);
  oa.subVectors(a.pos, a.target);
  ob.subVectors(b.pos, b.target);
  const ra = Math.max(1e-4, oa.length());
  const rb = Math.max(1e-4, ob.length());
  oa.divideScalar(ra);
  ob.divideScalar(rb);
  const dir = oa.lerp(ob, k);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const r = Math.exp(Math.log(ra) + (Math.log(rb) - Math.log(ra)) * k);
  out.pos.copy(out.target).addScaledVector(dir, r);
  out.fov = a.fov + (b.fov - a.fov) * k;
}

export interface ControlsLike {
  target: Vector3;
  update: () => void;
}

export class CameraRig {
  keys: CamKey[] = DEFAULT_KEYS;
  /** stage time and step, written by Stage3D every render */
  t = 0;
  step = 0;
  userControl = false;
  private first = true;
  private lastT = 0;
  private lastStep = 0;
  private glide: { from: Pose; start: number; dur: number } | null = null;
  private zoomTween: { from: number; to: number; start: number } | null = null;
  private clock = 0;
  private keyed = newPose();
  private cur = newPose();
  private out = newPose();
  private ka = newPose();
  private kb = newPose();
  /** set by Stage3D; called when the user starts orbiting */
  onUserChange: ((user: boolean) => void) | null = null;

  setKeys(keys: CamKey[]) {
    this.keys = this.override ?? (keys.length ? keys : DEFAULT_KEYS);
  }

  /** Debug: `?cam=px,py,pz,tx,ty,tz[,fov]` pins the camera (inspect a scene from any viewpoint). */
  private override: CamKey[] | null = (() => {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('cam') ?? new URLSearchParams(window.location.search).get('cam');
    const v = q?.split(',').map(Number);
    if (!v || v.length < 6 || v.some((x) => !Number.isFinite(x))) return null;
    return [{ at: 0, pos: [v[0], v[1], v[2]], target: [v[3], v[4], v[5]], fov: v[6] ?? 40 }];
  })();

  /** Re-snap on next frame (e.g. new stage mounted). */
  snap() {
    this.first = true;
  }

  userStart() {
    this.glide = null;
    if (!this.userControl) {
      this.userControl = true;
      this.onUserChange?.(true);
    }
  }

  reset() {
    this.startGlide();
    this.zoomTween = null;
    if (this.userControl) {
      this.userControl = false;
      this.onUserChange?.(false);
    }
  }

  zoom(factor: number, camera: PerspectiveCamera, controls: ControlsLike | null) {
    const target = controls ? controls.target : this.keyed.target;
    const d = camera.position.distanceTo(target);
    this.userStart();
    this.zoomTween = { from: d, to: Math.min(80, Math.max(1.2, d * factor)), start: this.clock };
  }

  private startGlide() {
    this.glide = { from: { pos: this.cur.pos.clone(), target: this.cur.target.clone(), fov: this.cur.fov }, start: this.clock, dur: GLIDE };
  }

  private poseAt(t: number, out: Pose) {
    const ks = this.keys;
    const set = (k: CamKey, p: Pose) => {
      p.pos.set(k.pos[0], k.pos[1], k.pos[2]);
      p.target.set(k.target[0], k.target[1], k.target[2]);
      p.fov = k.fov ?? 40;
    };
    if (t <= ks[0].at || ks.length === 1) return set(ks[0], out);
    const last = ks[ks.length - 1];
    if (t >= last.at) return set(last, out);
    let i = 0;
    while (i < ks.length - 2 && t >= ks[i + 1].at) i++;
    const a = ks[i];
    const b = ks[i + 1];
    const k = b.at > a.at ? easeInOut(Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at)))) : 1;
    set(a, this.ka);
    set(b, this.kb);
    blend(this.ka, this.kb, k, out);
  }

  /** Per-frame update. Returns true while animating (caller keeps rendering in demand mode). */
  update(camera: PerspectiveCamera, controls: ControlsLike | null, dt: number): boolean {
    this.clock += Math.min(dt, 0.1);
    this.poseAt(this.t, this.keyed);
    // current camera pose
    this.cur.pos.copy(camera.position);
    this.cur.target.copy(controls ? controls.target : this.keyed.target);
    this.cur.fov = camera.fov;

    if (this.first) {
      this.first = false;
      this.lastT = this.t;
      this.lastStep = this.step;
      this.apply(this.keyed, camera, controls);
      return false;
    }

    const stepChanged = this.step !== this.lastStep;
    const jumped = Math.abs(this.t - this.lastT) > 0.012;
    this.lastT = this.t;
    this.lastStep = this.step;
    if (stepChanged && this.userControl) {
      this.userControl = false;
      this.zoomTween = null;
      this.onUserChange?.(false);
      this.startGlide();
    } else if (jumped && !this.userControl) {
      this.startGlide();
    }

    if (this.userControl) {
      if (this.zoomTween && controls) {
        const k = easeInOut(Math.min(1, (this.clock - this.zoomTween.start) / 0.35));
        const d = this.zoomTween.from + (this.zoomTween.to - this.zoomTween.from) * k;
        oa.subVectors(camera.position, controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(oa, d);
        controls.update();
        if (k >= 1) this.zoomTween = null;
        return true;
      }
      return false;
    }

    if (this.glide) {
      const k = Math.min(1, (this.clock - this.glide.start) / this.glide.dur);
      blend(this.glide.from, this.keyed, easeInOut(k), this.out);
      if (k >= 1) this.glide = null;
      this.apply(this.out, camera, controls);
      return true;
    }
    this.apply(this.keyed, camera, controls);
    return false;
  }

  private apply(p: Pose, camera: PerspectiveCamera, controls: ControlsLike | null) {
    camera.position.copy(p.pos);
    if (Math.abs(camera.fov - p.fov) > 1e-3) {
      camera.fov = p.fov;
      camera.updateProjectionMatrix();
    }
    if (controls) {
      controls.target.copy(p.target);
      controls.update();
    } else camera.lookAt(p.target);
    camera.updateMatrixWorld();
  }
}
