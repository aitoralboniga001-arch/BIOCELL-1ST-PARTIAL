/**
 * BudModel: one membrane patch that pits → buds → (neck) → pinches off (scission), or the reverse
 * (a vesicle fusing: pore opens and the vesicle collapses into the membrane). Holds the profiles and
 * renders them as lipids (<BudLipids>) or smooth sheets (<BudSheet>).
 *
 * Local frame: flat membrane at y = 0; the bud hangs into −y; its lumen is continuous with +y.
 */
import { useMemo } from 'react';
import type { V3 } from '@/engine/anim';
import { LipidRevolution, SheetRevolution } from './Membranes';
import { buildBud, buildDimple, buildSphere, hForNeck, Profile } from './profile';

export interface BudState {
  /** sphere (mid-surface) radius */
  R: number;
  /** fillet radius */
  rho: number;
  /** flat disc radius covered by the model */
  edge: number;
  /**
   * shape: either `h` (sphere centre depth, −R = flat … omega) or `neckR` (mid radius of the neck; the
   * h is solved). neckR wins if given.
   */
  h?: number;
  neckR?: number;
  /** straight neck length (dynamin collar) */
  neck?: number;
  /** after scission: true → separate vesicle + healing parent */
  cut?: boolean;
  /** after scission: vesicle centre y (local) */
  vesY?: number;
  /** after scission: dimple depth left in the parent (heals to 0) */
  dimple?: number;
}

export interface BudInfo {
  /** sphere centre y */
  cy: number;
  /** neck mid radius (Infinity when no neck) */
  neckR: number;
  /** y of the top of the neck (where it meets the lip) and the bottom (where it meets the bud) */
  neckTop: number;
  neckBot: number;
  rf: number;
  cut: boolean;
}

export class BudModel {
  bud = new Profile(700);
  parent = new Profile(700);
  info: BudInfo = { cy: 0, neckR: Infinity, neckTop: 0, neckBot: 0, rf: 0, cut: false };
  sigBud = 0;
  sigParent = 0;
  update(s: BudState): BudInfo {
    const i = this.info;
    if (s.cut) {
      const cy = s.vesY ?? -s.R * 1.6;
      buildSphere(s.R, cy, this.bud);
      buildDimple(s.edge, s.R * 0.9, s.dimple ?? 0, this.parent);
      i.cy = cy;
      i.neckR = Infinity;
      i.cut = true;
    } else {
      const h = s.neckR !== undefined ? hForNeck(s.R, s.rho, s.neckR) : (s.h ?? 0);
      const r = buildBud({ R: s.R, h, rho: s.rho, neck: s.neck, edge: s.edge }, this.bud, this.parent);
      i.cy = r.center;
      i.neckR = r.neckR;
      i.neckTop = -s.rho;
      i.neckBot = -s.rho - (Number.isFinite(r.neckR) ? (s.neck ?? 0) : 0);
      i.rf = r.rf;
      i.cut = false;
    }
    this.sigBud = this.bud.sig();
    this.sigParent = this.parent.sig();
    return i;
  }
}

export function useBudModel() {
  return useMemo(() => new BudModel(), []);
}

interface RenderProps {
  model: BudModel;
  id?: string | string[];
  budId?: string | string[];
  position?: V3;
  rotation?: V3;
  scale?: number;
  opacity?: number;
  cut?: { center: number; width: number };
  spacing?: number;
  thickness?: number;
  seed?: number;
}

/** Lipid rendering of a bud model (parent membrane + bud/vesicle). */
export function BudLipids(p: RenderProps) {
  const m = p.model;
  return (
    <group position={p.position} rotation={p.rotation} scale={p.scale}>
      <LipidRevolution profile={m.parent} sig={m.sigParent} flip id={p.id} opacity={p.opacity} cut={p.cut} spacing={p.spacing ?? 0.26} thickness={p.thickness ?? 1} seed={p.seed ?? 3} capacity={9000} />
      <LipidRevolution profile={m.bud} sig={m.sigBud} id={p.budId ?? p.id} opacity={p.opacity} cut={p.cut} spacing={p.spacing ?? 0.26} thickness={p.thickness ?? 1} seed={(p.seed ?? 3) + 11} capacity={7000} />
    </group>
  );
}

/** Smooth-sheet rendering of a bud model (organelle scale). */
export function BudSheet(p: RenderProps & { color?: string; budColor?: string; thetaStart?: number; thetaLength?: number; surfaceOpacity?: number }) {
  const m = p.model;
  const th = p.thickness ?? 0.12;
  return (
    <group position={p.position} rotation={p.rotation} scale={p.scale}>
      <SheetRevolution profile={m.parent} sig={m.sigParent} flip id={p.id} opacity={p.opacity} thickness={th} color={p.color} thetaStart={p.thetaStart} thetaLength={p.thetaLength} surfaceOpacity={p.surfaceOpacity} />
      <SheetRevolution profile={m.bud} sig={m.sigBud} id={p.budId ?? p.id} opacity={p.opacity} thickness={th} color={p.budColor ?? p.color} thetaStart={p.thetaStart} thetaLength={p.thetaLength} surfaceOpacity={p.surfaceOpacity} />
    </group>
  );
}
