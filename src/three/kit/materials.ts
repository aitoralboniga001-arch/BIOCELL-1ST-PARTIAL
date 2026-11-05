/**
 * Material recipes. One look per kind of thing, used by every primitive:
 *  - protein: matte-satin (sheen + soft clearcoat)
 *  - membrane: glossy, slightly translucent
 *  - lipid: soft, slightly glossy heads; matte tails
 *  - nucleic: satin with a bit more gloss
 * Each call returns a NEW material (primitives own their materials so glow/dim/opacity stay per instance).
 */
import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';

export function proteinMaterial(color: string, o: { roughness?: number; emissive?: number } = {}) {
  const c = new Color(color);
  return new MeshPhysicalMaterial({
    color: c,
    roughness: o.roughness ?? 0.52,
    metalness: 0,
    clearcoat: 0.28,
    clearcoatRoughness: 0.45,
    sheen: 0.55,
    sheenRoughness: 0.5,
    sheenColor: c.clone().lerp(new Color('#ffffff'), 0.45),
    emissive: c.clone(),
    emissiveIntensity: o.emissive ?? 0.03,
  });
}

export function membraneMaterial(color: string, opacity = 0.55, o: { side?: 'double' | 'front'; roughness?: number } = {}) {
  const c = new Color(color);
  return new MeshPhysicalMaterial({
    color: c,
    roughness: o.roughness ?? 0.3,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
    sheen: 0.3,
    sheenColor: c.clone().lerp(new Color('#ffffff'), 0.5),
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 0.9,
    side: o.side === 'front' ? FrontSide : DoubleSide,
    emissive: c.clone(),
    emissiveIntensity: 0.04,
  });
}

export function lipidHeadMaterial(color: string) {
  const c = new Color(color);
  return new MeshPhysicalMaterial({
    color: c,
    roughness: 0.38,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    sheen: 0.3,
    sheenColor: new Color('#fff5e6'),
    emissive: c.clone(),
    emissiveIntensity: 0.02,
  });
}

export function lipidTailMaterial(color: string) {
  const c = new Color(color);
  return new MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0, emissive: c.clone(), emissiveIntensity: 0.02 });
}

export function nucleicMaterial(color: string) {
  const c = new Color(color);
  return new MeshPhysicalMaterial({
    color: c,
    roughness: 0.35,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    sheen: 0.3,
    sheenColor: c.clone().lerp(new Color('#ffffff'), 0.5),
    emissive: c.clone(),
    emissiveIntensity: 0.06,
  });
}

/** Unlit tint for volumes (lumen, cytosol haze). */
export function tintMaterial(color: string, opacity: number) {
  return new MeshStandardMaterial({
    color: new Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
    emissive: new Color(color),
    emissiveIntensity: 0.6,
  });
}
