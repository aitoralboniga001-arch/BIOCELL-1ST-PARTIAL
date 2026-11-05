/**
 * Stage3D: the 3D viewport of a stage. Owns the <Canvas> (ACES, dpr [1,2], antialias), the procedural
 * studio lighting (Environment + Lightformers only — no network HDRs), fog, OrbitControls, the camera rig,
 * the anchor registry and the 2D callout overlay. Scenes render as children and use the kit hooks.
 */
import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { ACESFilmicToneMapping, PerspectiveCamera, SRGBColorSpace } from 'three';
import { CalloutEngine, type LabelMode } from './calloutEngine';
import { CameraRig, type ControlsLike } from './cameraRig';
import { FocusContext, KIT, ServicesContext, useServices, type StageServices } from './context';
import { PALETTE } from './palette';

export interface StageApi {
  reset(): void;
  zoom(factor: number): void;
  /** ids that currently have anchors in the scene */
  anchoredIds(): string[];
}

export interface Stage3DProps {
  /** changes when a different stage is loaded (camera snaps instead of gliding) */
  stageKey: string;
  t: number;
  stepIndex: number;
  focus: string[];
  /** id → display name for labels */
  names: Record<string, string>;
  labelMode: LabelMode;
  /** ids whose labels may show in 'step' mode (null = all) */
  labelIds: ReadonlySet<string> | null;
  playing: boolean;
  onUserOrbit?: (user: boolean) => void;
  /** skip all easing (labels, glow) — deterministic frames for screenshots (debug `paused=1`) */
  instant?: boolean;
  children: ReactNode;
}

export const Stage3D = forwardRef<StageApi, Stage3DProps>(function Stage3D(props, ref) {
  const services = useMemo<StageServices>(() => ({ engine: new CalloutEngine(), rig: new CameraRig() }), []);
  const focusSet = useMemo(() => new Set(props.focus), [props.focus.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const { engine, rig } = services;

  // sync props into the services before the frame
  engine.mode = props.labelMode;
  engine.visibleIds = props.labelIds;
  engine.focus = focusSet;
  KIT.instant = !!props.instant;
  rig.t = props.t;
  rig.step = props.stepIndex;
  rig.onUserChange = props.onUserOrbit ?? null;

  // setNames notifies the label layer's store: never during render
  useLayoutEffect(() => {
    engine.setNames(props.names);
  }, [engine, props.names]);

  useLayoutEffect(() => {
    rig.snap();
  }, [props.stageKey, rig]);

  return (
    <div className="stage3d" onDoubleClick={() => services.rig.reset()}>
      <Canvas
        className="stage3d-canvas"
        dpr={[1, 2]}
        frameloop={props.playing ? 'always' : 'demand'}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace, powerPreference: 'high-performance' }}
        camera={{ fov: 40, near: 0.1, far: 200, position: [0, 2, 12] }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 1.05;
        }}
      >
        <ServicesContext.Provider value={services}>
          <FocusContext.Provider value={focusSet}>
            <Inner api={ref} services={services} propsKey={`${props.labelMode}|${props.labelIds ? [...props.labelIds].join(',') : '*'}|${props.focus.join(',')}|${props.t}`} />
            <StudioLights />
            {props.children}
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.09}
              enablePan={false}
              minDistance={1.2}
              maxDistance={70}
              rotateSpeed={0.7}
              zoomSpeed={0.8}
              onStart={() => services.rig.userStart()}
            />
            <Projector />
          </FocusContext.Provider>
        </ServicesContext.Provider>
      </Canvas>
      <div className="stage3d-vignette" />
      <CalloutLayer engine={engine} />
    </div>
  );
});

/** Exposes the imperative API and invalidates the demand loop when label/focus props change. */
function Inner({ api, services, propsKey }: { api: React.ForwardedRef<StageApi>; services: StageServices; propsKey: string }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const invalidate = useThree((s) => s.invalidate);
  useImperativeHandle(
    api,
    () => ({
      reset: () => {
        services.rig.reset();
        invalidate();
      },
      zoom: (f: number) => {
        services.rig.zoom(f, camera, controls);
        invalidate();
      },
      anchoredIds: () => services.engine.anchoredIds(),
    }),
    [services, camera, controls, invalidate],
  );
  useLayoutEffect(() => {
    invalidate();
  }, [propsKey, invalidate]);
  return null;
}

function Projector() {
  const { engine } = useServices();
  useFrame((state, dt) => {
    const moving = engine.frame(state.camera, state.size.width, state.size.height, dt);
    if (moving) state.invalidate();
  });
  return null;
}


/** Soft studio lighting: procedural environment (Lightformers) + key + rim + fill, and depth fog. */
export function StudioLights() {
  return (
    <>
      <color attach="background" args={[PALETTE.cytosol]} />
      <fog attach="fog" args={[PALETTE.cytosol, 16, 48]} />
      <hemisphereLight args={['#c9dcff', '#1a1612', 0.35]} />
      <directionalLight position={[6, 10, 8]} intensity={1.5} color="#fff3e2" />
      <directionalLight position={[-9, 3, -8]} intensity={1.15} color="#9cc6ff" />
      <directionalLight position={[0, -8, 4]} intensity={0.25} color="#7fd1c8" />
      <Environment resolution={256} frames={1} environmentIntensity={0.9}>
        <Lightformer form="rect" intensity={2.4} position={[0, 7, 6]} scale={[12, 5, 1]} />
        <Lightformer form="rect" intensity={1.3} color="#a8ccff" position={[-9, 2, -3]} rotation-y={Math.PI / 2} scale={[9, 4, 1]} />
        <Lightformer form="ring" intensity={1.8} color="#ffd9b0" position={[8, 3, 3]} scale={3.5} />
        <Lightformer form="rect" intensity={0.5} color="#2b3642" position={[0, -7, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} />
        <Lightformer form="circle" intensity={0.8} color="#ffffff" position={[3, 5, -8]} scale={4} />
      </Environment>
    </>
  );
}

/** DOM overlay: leader lines, anchor dots, pills and edge tags (positions are written by the engine). */
function CalloutLayer({ engine }: { engine: CalloutEngine }) {
  useSyncExternalStore(engine.subscribe, engine.getVersion, engine.getVersion);
  const entries = [...engine.entries.values()];
  const tags = [...engine.tags.values()];
  return (
    <div className="callouts" aria-hidden="false">
      <svg className="callout-leaders">
        {entries.map((e) => (
          <g key={e.key}>
            <line className={`callout-line${e.focus ? ' is-focus' : ''}`} style={{ opacity: 0 }} ref={(n) => engine.bind(e.key, 'line', n)} />
            <circle className={`callout-dot${e.focus ? ' is-focus' : ''}`} r={3.4} style={{ opacity: 0 }} ref={(n) => engine.bind(e.key, 'dot', n)} />
          </g>
        ))}
      </svg>
      {entries.map((e) => (
        <div key={e.key} className={`callout-pill${e.focus ? ' is-focus' : ''}`} style={{ opacity: 0 }} ref={(n) => engine.bind(e.key, 'el', n)}>
          {engine.label(e)}
        </div>
      ))}
      {tags.map((t) => (
        <div key={t.key} className={`edge-tag edge-${t.side}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
