/**
 * "Scene in preparation": shown for any stage whose scene id is not registered yet. It still draws the
 * stage's structures as labelled neutral blobs (glow on focus works), so the shell is fully testable.
 */
import type { SceneProps } from '@/content/types';
import { rand, type V3 } from '@/engine/anim';
import { Anchor, EdgeTag, Protein, useStageCamera, type CamKey } from '@/three/kit';

const CAM: CamKey[] = [
  { at: 0, pos: [0, 3.2, 11], target: [0, 0, 0], fov: 38 },
  { at: 0.5, pos: [6, 2.6, 9], target: [0, 0, 0], fov: 38 },
  { at: 1, pos: [0, 3.6, 11.5], target: [0, 0, 0], fov: 38 },
];

export default function PlaceholderScene({ ids, colors }: SceneProps & { ids: string[]; colors: Record<string, string | undefined> }) {
  useStageCamera(CAM);
  const n = Math.max(1, ids.length);
  return (
    <group>
      <EdgeTag side="top" text="SCENE IN PREPARATION" />
      {ids.map((id, i) => {
        const a = (i / n) * Math.PI * 2;
        const r = n === 1 ? 0 : 2.6 + 0.4 * rand(i + 3);
        const pos: V3 = [Math.cos(a) * r, (rand(i * 7) - 0.5) * 1.2, Math.sin(a) * r];
        return (
          <group key={id} position={pos}>
            <Protein id={id} shape="blob" size={1.1} seed={i + 2} color={colors[id] ?? '#8b96a3'} />
            <Anchor id={id} position={[0, 0, 0]} />
          </group>
        );
      })}
    </group>
  );
}
