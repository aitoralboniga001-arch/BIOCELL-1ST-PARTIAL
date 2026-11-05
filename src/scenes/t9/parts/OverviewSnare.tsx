/**
 * SnarePair (t9-overview): one v-SNARE strand rooted in the vesicle membrane and two t-SNARE strands rooted in the
 * target membrane. `reach` 0..1 brings the free ends together at the midpoint (the two find each other); `zip` 0..1
 * winds them into one helical bundle that spans the whole gap (trans-SNARE complex) — the strands' tips run past
 * each other toward the opposite membrane, which is what pulls the two membranes together.
 * Drawn with instanced rods + joints (no per-frame allocation).
 */
import { useLayoutEffect, useRef } from 'react';
import { CylinderGeometry, InstancedMesh, Matrix4, SphereGeometry, Vector3 } from 'three';
import type { V3 } from '@/engine/anim';
import { PALETTE, proteinMaterial, segmentMatrix, useDisposable, useKitHighlight } from '@/three/kit';

const SEG = 9;
const RAD = 0.06;
const _a = new Vector3();
const _b = new Vector3();
const _ax = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _m = new Matrix4();
const _tmp = new Vector3();

function point(out: Vector3, t0: V3, a: number, phase: number, r: number, turns: number) {
  const th = phase + a * turns * Math.PI * 2;
  out.set(t0[0], t0[1], t0[2]).addScaledVector(_ax, a);
  out.addScaledVector(_e1, Math.cos(th) * r).addScaledVector(_e2, Math.sin(th) * r);
  return out;
}

export interface SnarePairProps {
  vRoot: V3;
  tRoot: V3;
  reach: number;
  zip: number;
  opacity?: number;
}

export function SnarePair({ vRoot, tRoot, reach, zip, opacity = 1 }: SnarePairProps) {
  const geos = useDisposable(() => [new CylinderGeometry(1, 1, 1, 10, 1), new SphereGeometry(1, 12, 10)], []);
  const vMats = useDisposable(() => [proteinMaterial(PALETTE.vSnare)], []);
  const tMats = useDisposable(() => [proteinMaterial(PALETTE.tSnare)], []);
  useKitHighlight(vMats, 'v-snare', { opacity });
  useKitHighlight(tMats, 't-snare', { opacity });
  const vRod = useRef<InstancedMesh>(null);
  const vJoint = useRef<InstancedMesh>(null);
  const tRod = useRef<InstancedMesh>(null);
  const tJoint = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const vr = vRod.current;
    const vj = vJoint.current;
    const tr = tRod.current;
    const tj = tJoint.current;
    if (!vr || !vj || !tr || !tj) return;
    _ax.set(vRoot[0] - tRoot[0], vRoot[1] - tRoot[1], vRoot[2] - tRoot[2]);
    _tmp.copy(_ax).normalize();
    _e1.set(0, 0, 1).cross(_tmp);
    if (_e1.lengthSq() < 1e-4) _e1.set(1, 0, 0);
    _e1.normalize();
    _e2.crossVectors(_tmp, _e1).normalize();
    // helix radius: strands sit side by side (0.1) and wind tighter once zipped
    const r = 0.1 - 0.02 * zip;
    const turns = 1.1 * zip;
    const tipV = (1 - 0.25 - 0.25 * reach) * (1 - zip) + 0.06 * zip; // v strand: from a = 1 down to tipV
    const tipT = (0.25 + 0.25 * reach) * (1 - zip) + 0.94 * zip; // t strands: from a = 0 up to tipT
    const strands = [
      { mesh: vr, joint: vj, a0: 1, a1: tipV, phase: 0, slot: 0 },
      { mesh: tr, joint: tj, a0: 0, a1: tipT, phase: (Math.PI * 2) / 3, slot: 0 },
      { mesh: tr, joint: tj, a0: 0, a1: tipT, phase: (Math.PI * 4) / 3, slot: 1 },
    ];
    for (const s of strands) {
      for (let i = 0; i < SEG; i++) {
        const u0 = s.a0 + ((s.a1 - s.a0) * i) / SEG;
        const u1 = s.a0 + ((s.a1 - s.a0) * (i + 1)) / SEG;
        point(_a, tRoot, u0, s.phase, r, turns);
        point(_b, tRoot, u1, s.phase, r, turns);
        segmentMatrix(_a, _b, RAD, _m);
        s.mesh.setMatrixAt(s.slot * SEG + i, _m);
        _m.makeScale(RAD, RAD, RAD).setPosition(_b);
        s.joint.setMatrixAt(s.slot * (SEG + 1) + i + 1, _m);
        if (i === 0) {
          _m.makeScale(RAD, RAD, RAD).setPosition(_a);
          s.joint.setMatrixAt(s.slot * (SEG + 1), _m);
        }
      }
    }
    for (const m of [vr, vj, tr, tj]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  });

  const vis = opacity > 0.01;
  return (
    <group visible={vis}>
      <instancedMesh ref={vRod} args={[geos[0], vMats[0], SEG]} frustumCulled={false} />
      <instancedMesh ref={vJoint} args={[geos[1], vMats[0], SEG + 1]} frustumCulled={false} />
      <instancedMesh ref={tRod} args={[geos[0], tMats[0], SEG * 2]} frustumCulled={false} />
      <instancedMesh ref={tJoint} args={[geos[1], tMats[0], (SEG + 1) * 2]} frustumCulled={false} />
    </group>
  );
}
