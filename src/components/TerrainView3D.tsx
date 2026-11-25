import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronUp,
  Grid3X3,
  Layers,
  RotateCcw,
  Box
} from 'lucide-react';
import { CalculatedStation, DaylightPoint } from '../types/survey';
import { getFGLAtChainage } from '../utils/levelingEngine';

interface TerrainView3DProps {
  stations: CalculatedStation[];
  fglZero: number;
  gradientPct: number;
  corridorWidth: number;
  useCrossOffsets: boolean;
  daylights: DaylightPoint[];
  heightClass?: string;
}

type CameraPreset = 'iso' | 'profile' | 'plan';

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createTextSprite(
  text: string,
  color: string,
  maxAnisotropy: number,
  fontSizePx = 28
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `600 ${fontSizePx}px "JetBrains Mono", monospace`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const padX = 16;
  const padY = 10;
  canvas.width = Math.max(64, Math.ceil(metrics.width + padX * 2));
  canvas.height = Math.max(36, fontSizePx + padY * 2);

  ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 8);
  ctx.fill();
  ctx.stroke();

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false
  });
  const sprite = new THREE.Sprite(mat);
  const scaleFactor = 0.045;
  sprite.scale.set(canvas.width * scaleFactor, canvas.height * scaleFactor, 1);
  return sprite;
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).geometry) {
      (obj as THREE.Mesh).geometry.dispose();
    }
    const mat = (obj as THREE.Mesh | THREE.Line | THREE.Sprite).material;
    if (mat) {
      const mats = Array.isArray(mat) ? mat : [mat];
      mats.forEach((m) => {
        const sm = m as THREE.SpriteMaterial;
        if (sm.map) sm.map.dispose();
        m.dispose();
      });
    }
  });
}

export const TerrainView3D: React.FC<TerrainView3DProps> = ({
  stations,
  fglZero,
  gradientPct,
  corridorWidth,
  useCrossOffsets,
  daylights,
  heightClass = 'h-[380px]'
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [showWireframe, setShowWireframe] = useState(false);
  const [showGridAxes, setShowGridAxes] = useState(true);
  const [showFormation, setShowFormation] = useState(true);
  const [verticalExag, setVerticalExag] = useState<number>(3);
  const [dockExpanded, setDockExpanded] = useState(true);
  const [contextLost, setContextLost] = useState(false);

  const sortedStations = useMemo(
    () =>
      [...stations]
        .filter((s) => s.rl !== null && !Number.isNaN(s.rl))
        .sort((a, b) => a.chainage - b.chainage),
    [stations]
  );

  // Refs to share scene state cleanly without tearing down WebGL on UI edits
  const sceneStateRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    dynamicGroup: THREE.Group;
    gridGroup: THREE.Group;
    formationGroup: THREE.Group;
    groundWireMesh: THREE.Mesh | null;
    maxAnisotropy: number;
    requestRender: () => void;
    transitionTargetPos: THREE.Vector3 | null;
    transitionTargetLook: THREE.Vector3 | null;
    boundsSpan: number;
    isSoftwareGl: boolean;
  } | null>(null);

  const applyCameraPreset = (preset: CameraPreset) => {
    const st = sceneStateRef.current;
    if (!st) return;
    const span = Math.max(20, st.boundsSpan);

    const nextPos = new THREE.Vector3();
    const nextLook = new THREE.Vector3(0, 0, 0);

    if (preset === 'iso') {
      nextPos.set(span * 0.65, span * 0.45, span * 0.72);
    } else if (preset === 'profile') {
      nextPos.set(0, span * 0.14, span * 0.95);
    } else {
      nextPos.set(0, span * 1.05, 0.01);
    }

    if (st.isSoftwareGl) {
      st.camera.position.copy(nextPos);
      st.controls.target.copy(nextLook);
      st.controls.update();
      st.transitionTargetPos = null;
      st.transitionTargetLook = null;
      st.requestRender();
    } else {
      st.transitionTargetPos = nextPos;
      st.transitionTargetLook = nextLook;
      st.requestRender();
    }
  };

  // 1. Initialize WebGLRenderer, Scene, RoomEnvironment, Lighting & OrbitControls ONCE
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initW = Math.max(100, container.clientWidth);
    const initH = Math.max(100, container.clientHeight);
    renderer.setSize(initW, initH);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b12);
    scene.fog = new THREE.FogExp2(0x070b12, 0.0038);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, initW / initH, 0.2, 1200);
    camera.position.set(42, 26, 48);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 6;
    controls.maxDistance = 360;

    // 3-Point Studio + Natural Outdoor Fill Lighting
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1db, 1.45);
    keyLight.position.set(40, 65, 35);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 5;
      keyLight.shadow.camera.far = 200;
      const d = 55;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.55);
    rimLight.position.set(-45, 25, -40);
    scene.add(rimLight);

    const dynamicGroup = new THREE.Group();
    const gridGroup = new THREE.Group();
    const formationGroup = new THREE.Group();
    dynamicGroup.add(gridGroup);
    dynamicGroup.add(formationGroup);
    scene.add(dynamicGroup);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    // Coalesced On-Demand Rendering Loop + Software-WebGL afterDraw Pacing
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        renderDirty = false;

        const st = sceneStateRef.current;
        let needsAnotherFrame = false;

        if (st && st.transitionTargetPos && st.transitionTargetLook) {
          const factor = 1 - Math.exp(-8 * dt);
          camera.position.lerp(st.transitionTargetPos, factor);
          controls.target.lerp(st.transitionTargetLook, factor);
          if (
            camera.position.distanceTo(st.transitionTargetPos) < 0.08 &&
            controls.target.distanceTo(st.transitionTargetLook) < 0.05
          ) {
            camera.position.copy(st.transitionTargetPos);
            controls.target.copy(st.transitionTargetLook);
            st.transitionTargetPos = null;
            st.transitionTargetLook = null;
          } else {
            needsAnotherFrame = true;
          }
        }

        const dampingActive = controls.update();
        if (dampingActive && controls.enableDamping) {
          needsAnotherFrame = true;
        }

        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsAnotherFrame) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    sceneStateRef.current = {
      scene,
      camera,
      renderer,
      controls,
      dynamicGroup,
      gridGroup,
      formationGroup,
      groundWireMesh: null,
      maxAnisotropy,
      requestRender,
      transitionTargetPos: null,
      transitionTargetLook: null,
      boundsSpan: 60,
      isSoftwareGl
    };

    controls.addEventListener('start', () => {
      if (sceneStateRef.current) {
        sceneStateRef.current.transitionTargetPos = null;
        sceneStateRef.current.transitionTargetLook = null;
      }
    });
    controls.addEventListener('change', () => requestRender());

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const resizeObserver = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = Math.max(100, container.clientWidth);
      const h = Math.max(100, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      disposeObject3D(dynamicGroup);
      envRT.dispose();
      renderer.dispose();
      sceneStateRef.current = null;
    };
  }, []);

  // 2. Rebuild 3D Corridor Surfaces, Cut/Fill Prisms & Grid cleanly on Data/Parameter Changes
  useEffect(() => {
    const st = sceneStateRef.current;
    if (!st) return;

    const { dynamicGroup, gridGroup, formationGroup, maxAnisotropy, requestRender } = st;

    // Dispose old corridor children cleanly while preserving group shells
    for (let i = dynamicGroup.children.length - 1; i >= 0; i--) {
      const child = dynamicGroup.children[i];
      if (child !== gridGroup && child !== formationGroup) {
        disposeObject3D(child);
        dynamicGroup.remove(child);
      }
    }
    for (let i = gridGroup.children.length - 1; i >= 0; i--) {
      const child = gridGroup.children[i];
      disposeObject3D(child);
      gridGroup.remove(child);
    }
    for (let i = formationGroup.children.length - 1; i >= 0; i--) {
      const child = formationGroup.children[i];
      disposeObject3D(child);
      formationGroup.remove(child);
    }
    st.groundWireMesh = null;

    if (sortedStations.length < 2) {
      requestRender();
      return;
    }

    const minCh = sortedStations[0].chainage;
    const maxCh = sortedStations[sortedStations.length - 1].chainage;
    const lengthCh = Math.max(10, maxCh - minCh);
    const midCh = (minCh + maxCh) / 2;
    const halfW = Math.max(1, corridorWidth) / 2;

    const fglStart = getFGLAtChainage(minCh, fglZero, gradientPct);
    const fglEnd = getFGLAtChainage(maxCh, fglZero, gradientPct);

    const allElevs: number[] = [fglStart, fglEnd];
    sortedStations.forEach((s) => {
      allElevs.push(s.rl!);
      if (useCrossOffsets) {
        if (s.leftDeltaRL != null) allElevs.push(s.rl! + s.leftDeltaRL);
        if (s.rightDeltaRL != null) allElevs.push(s.rl! + s.rightDeltaRL);
      }
    });

    const minRL = Math.min(...allElevs);
    const maxRL = Math.max(...allElevs);
    const midRL = (minRL + maxRL) / 2;

    const toWorldX = (ch: number) => ch - midCh;
    const toWorldY = (rl: number) => (rl - midRL) * verticalExag;

    const baseElevation = minRL - 1.2;
    const baseY = toWorldY(baseElevation);

    const boundsSpan = Math.max(lengthCh, corridorWidth * 1.5, 28);
    st.boundsSpan = boundsSpan;

    // Helper: Ground elevation at (ch, z) interpolated across segments & Left/Center/Right offsets
    const sampleGroundRL = (s: CalculatedStation, z: number): number => {
      const c = s.rl!;
      if (!useCrossOffsets) return c;
      const l = c + (s.leftDeltaRL ?? 0);
      const r = c + (s.rightDeltaRL ?? 0);
      if (z <= 0) {
        const t = (z + halfW) / halfW;
        return l + t * (c - l);
      }
      const t = z / halfW;
      return c + t * (r - c);
    };

    // Build subdivided longitudinal & transverse mesh grid for ground + formation + cut/fill volumes
    const nxPerSeg = useCrossOffsets ? 8 : 6;
    const zSamples = useCrossOffsets
      ? [-halfW, -halfW * 0.5, 0, halfW * 0.5, halfW]
      : [-halfW, 0, halfW];

    const xChainages: number[] = [];
    const groundGrid: number[][] = []; // [ix][iz] -> RL
    const fglGrid: number[] = []; // [ix] -> FGL RL

    for (let i = 0; i < sortedStations.length - 1; i++) {
      const s1 = sortedStations[i];
      const s2 = sortedStations[i + 1];
      const dx = s2.chainage - s1.chainage;
      if (dx <= 0) continue;

      const startK = i === 0 ? 0 : 1;
      for (let k = startK; k <= nxPerSeg; k++) {
        const t = k / nxPerSeg;
        const ch = s1.chainage + t * dx;
        xChainages.push(ch);
        fglGrid.push(getFGLAtChainage(ch, fglZero, gradientPct));

        const zRow: number[] = [];
        for (let iz = 0; iz < zSamples.length; iz++) {
          const z = zSamples[iz];
          const g1 = sampleGroundRL(s1, z);
          const g2 = sampleGroundRL(s2, z);
          zRow.push(g1 + t * (g2 - g1));
        }
        groundGrid.push(zRow);
      }
    }

    const nx = xChainages.length;
    const nz = zSamples.length;

    // A. EXISTING GROUND SURFACE + SUBTERRANEAN SKIRT
    if (nx >= 2) {
      const groundPositions: number[] = [];
      const groundColors: number[] = [];
      const groundIndices: number[] = [];

      const cLow = new THREE.Color(0x0e4f73);
      const cHigh = new THREE.Color(0x38bdf8);
      const tmpColor = new THREE.Color();
      const elevSpan = Math.max(0.25, maxRL - minRL);

      for (let ix = 0; ix < nx; ix++) {
        const wx = toWorldX(xChainages[ix]);
        for (let iz = 0; iz < nz; iz++) {
          const rl = groundGrid[ix][iz];
          const wy = toWorldY(rl);
          const wz = zSamples[iz];
          groundPositions.push(wx, wy, wz);

          const normH = THREE.MathUtils.clamp((rl - minRL) / elevSpan, 0, 1);
          tmpColor.copy(cLow).lerp(cHigh, normH);
          groundColors.push(tmpColor.r, tmpColor.g, tmpColor.b);
        }
      }

      for (let ix = 0; ix < nx - 1; ix++) {
        for (let iz = 0; iz < nz - 1; iz++) {
          const a = ix * nz + iz;
          const b = (ix + 1) * nz + iz;
          const c = (ix + 1) * nz + (iz + 1);
          const d = ix * nz + (iz + 1);
          groundIndices.push(a, d, b);
          groundIndices.push(b, d, c);
        }
      }

      const groundGeo = new THREE.BufferGeometry();
      groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(groundPositions, 3));
      groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));
      groundGeo.setIndex(groundIndices);
      groundGeo.computeVertexNormals();

      const groundMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0.08,
        side: THREE.DoubleSide
      });
      const groundMesh = new THREE.Mesh(groundGeo, groundMat);
      groundMesh.receiveShadow = true;
      groundMesh.castShadow = true;
      dynamicGroup.add(groundMesh);

      // Wireframe overlay mesh for Ground (toggled via showWireframe)
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0xbae6fd,
        wireframe: true,
        transparent: true,
        opacity: 0.35
      });
      const wireMesh = new THREE.Mesh(groundGeo, wireMat);
      wireMesh.visible = showWireframe;
      dynamicGroup.add(wireMesh);
      st.groundWireMesh = wireMesh;

      // Ground Centerline Highlight Ribbon Line
      const centerLinePts: THREE.Vector3[] = [];
      const midZIdx = Math.floor(nz / 2);
      for (let ix = 0; ix < nx; ix++) {
        centerLinePts.push(
          new THREE.Vector3(toWorldX(xChainages[ix]), toWorldY(groundGrid[ix][midZIdx]) + 0.03, 0)
        );
      }
      const centerLineGeo = new THREE.BufferGeometry().setFromPoints(centerLinePts);
      const centerLineMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc });
      dynamicGroup.add(new THREE.Line(centerLineGeo, centerLineMat));

      // Subterranean Soil Skirt Walls around perimeter so terrain reads as a solid block
      const skirtPositions: number[] = [];
      const addSkirtQuad = (
        x1: number,
        y1: number,
        z1: number,
        x2: number,
        y2: number,
        z2: number
      ) => {
        skirtPositions.push(x1, y1, z1, x1, baseY, z1, x2, y2, z2);
        skirtPositions.push(x2, y2, z2, x1, baseY, z1, x2, baseY, z2);
      };

      for (let ix = 0; ix < nx - 1; ix++) {
        const x1 = toWorldX(xChainages[ix]);
        const x2 = toWorldX(xChainages[ix + 1]);
        addSkirtQuad(x1, toWorldY(groundGrid[ix][0]), -halfW, x2, toWorldY(groundGrid[ix + 1][0]), -halfW);
        addSkirtQuad(
          x1,
          toWorldY(groundGrid[ix][nz - 1]),
          halfW,
          x2,
          toWorldY(groundGrid[ix + 1][nz - 1]),
          halfW
        );
      }
      for (let iz = 0; iz < nz - 1; iz++) {
        addSkirtQuad(
          toWorldX(xChainages[0]),
          toWorldY(groundGrid[0][iz]),
          zSamples[iz],
          toWorldX(xChainages[0]),
          toWorldY(groundGrid[0][iz + 1]),
          zSamples[iz + 1]
        );
        addSkirtQuad(
          toWorldX(xChainages[nx - 1]),
          toWorldY(groundGrid[nx - 1][iz]),
          zSamples[iz],
          toWorldX(xChainages[nx - 1]),
          toWorldY(groundGrid[nx - 1][iz + 1]),
          zSamples[iz + 1]
        );
      }
      const skirtGeo = new THREE.BufferGeometry();
      skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
      skirtGeo.computeVertexNormals();
      const skirtMat = new THREE.MeshStandardMaterial({
        color: 0x0f1d32,
        roughness: 0.9,
        metalness: 0.05,
        side: THREE.DoubleSide
      });
      dynamicGroup.add(new THREE.Mesh(skirtGeo, skirtMat));

      // B. FORMATION DESIGN PLANE
      const fglPositions = new Float32Array([
        toWorldX(minCh), toWorldY(fglStart), -halfW,
        toWorldX(maxCh), toWorldY(fglEnd), -halfW,
        toWorldX(maxCh), toWorldY(fglEnd), halfW,
        toWorldX(minCh), toWorldY(fglStart), halfW
      ]);
      const fglGeo = new THREE.BufferGeometry();
      fglGeo.setAttribute('position', new THREE.BufferAttribute(fglPositions, 3));
      fglGeo.setIndex([0, 3, 1, 1, 3, 2]);
      fglGeo.computeVertexNormals();

      const fglMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.34,
        roughness: 0.4,
        metalness: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const fglMesh = new THREE.Mesh(fglGeo, fglMat);
      fglMesh.renderOrder = 2;
      formationGroup.add(fglMesh);

      const fglOutlineGeo = new THREE.EdgesGeometry(fglGeo);
      const fglOutline = new THREE.LineSegments(
        fglOutlineGeo,
        new THREE.LineBasicMaterial({ color: 0xfbbf24 })
      );
      formationGroup.add(fglOutline);

      const fglCenterGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(toWorldX(minCh), toWorldY(fglStart) + 0.02, 0),
        new THREE.Vector3(toWorldX(maxCh), toWorldY(fglEnd) + 0.02, 0)
      ]);
      formationGroup.add(
        new THREE.Line(fglCenterGeo, new THREE.LineBasicMaterial({ color: 0xfde68a }))
      );

      // C. CUT & FILL VOLUMETRIC PRISM ZONES
      // Construct solid-looking top/bottom/side triangles between groundGrid and fglGrid
      const cutPos: number[] = [];
      const fillPos: number[] = [];

      const pushPrismCell = (
        target: number[],
        x0: number,
        x1: number,
        z0: number,
        z1: number,
        top00: number,
        top10: number,
        top11: number,
        top01: number,
        bot00: number,
        bot10: number,
        bot11: number,
        bot01: number,
        isLeftWall: boolean,
        isRightWall: boolean,
        isStartWall: boolean,
        isEndWall: boolean
      ) => {
        // Top cap
        target.push(x0, top00, z0, x0, top01, z1, x1, top10, z0);
        target.push(x1, top10, z0, x0, top01, z1, x1, top11, z1);
        // Bottom cap
        target.push(x0, bot00, z0, x1, bot10, z0, x0, bot01, z1);
        target.push(x1, bot10, z0, x1, bot11, z1, x0, bot01, z1);

        if (isLeftWall) {
          target.push(x0, top00, z0, x1, top10, z0, x0, bot00, z0);
          target.push(x1, top10, z0, x1, bot10, z0, x0, bot00, z0);
        }
        if (isRightWall) {
          target.push(x0, top01, z1, x0, bot01, z1, x1, top11, z1);
          target.push(x1, top11, z1, x0, bot01, z1, x1, bot11, z1);
        }
        if (isStartWall) {
          target.push(x0, top00, z0, x0, bot00, z0, x0, top01, z1);
          target.push(x0, top01, z1, x0, bot00, z0, x0, bot01, z1);
        }
        if (isEndWall) {
          target.push(x1, top10, z0, x1, top11, z1, x1, bot10, z0);
          target.push(x1, top11, z1, x1, bot11, z1, x1, bot10, z0);
        }
      };

      for (let ix = 0; ix < nx - 1; ix++) {
        const x0 = toWorldX(xChainages[ix]);
        const x1 = toWorldX(xChainages[ix + 1]);
        const f0 = fglGrid[ix];
        const f1 = fglGrid[ix + 1];

        for (let iz = 0; iz < nz - 1; iz++) {
          const z0 = zSamples[iz];
          const z1 = zSamples[iz + 1];

          const g00 = groundGrid[ix][iz];
          const g10 = groundGrid[ix + 1][iz];
          const g11 = groundGrid[ix + 1][iz + 1];
          const g01 = groundGrid[ix][iz + 1];

          const isLeft = iz === 0;
          const isRight = iz === nz - 2;
          const isStart = ix === 0;
          const isEnd = ix === nx - 2;

          // Cut region: clamp ground above formation
          const cTop00 = toWorldY(Math.max(g00, f0));
          const cTop10 = toWorldY(Math.max(g10, f1));
          const cTop11 = toWorldY(Math.max(g11, f1));
          const cTop01 = toWorldY(Math.max(g01, f0));
          const fY0 = toWorldY(f0);
          const fY1 = toWorldY(f1);

          if (
            Math.max(g00 - f0, g10 - f1, g11 - f1, g01 - f0) > 0.002
          ) {
            pushPrismCell(
              cutPos,
              x0,
              x1,
              z0,
              z1,
              cTop00,
              cTop10,
              cTop11,
              cTop01,
              fY0,
              fY1,
              fY1,
              fY0,
              isLeft,
              isRight,
              isStart,
              isEnd
            );
          }

          // Fill region: clamp ground below formation
          const fBot00 = toWorldY(Math.min(g00, f0));
          const fBot10 = toWorldY(Math.min(g10, f1));
          const fBot11 = toWorldY(Math.min(g11, f1));
          const fBot01 = toWorldY(Math.min(g01, f0));

          if (
            Math.max(f0 - g00, f1 - g10, f1 - g11, f0 - g01) > 0.002
          ) {
            pushPrismCell(
              fillPos,
              x0,
              x1,
              z0,
              z1,
              fY0,
              fY1,
              fY1,
              fY0,
              fBot00,
              fBot10,
              fBot11,
              fBot01,
              isLeft,
              isRight,
              isStart,
              isEnd
            );
          }
        }
      }

      if (cutPos.length > 0) {
        const cutGeo = new THREE.BufferGeometry();
        cutGeo.setAttribute('position', new THREE.Float32BufferAttribute(cutPos, 3));
        cutGeo.computeVertexNormals();
        const cutMat = new THREE.MeshStandardMaterial({
          color: 0xf43f5e,
          transparent: true,
          opacity: 0.48,
          roughness: 0.5,
          metalness: 0.05,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const cutMesh = new THREE.Mesh(cutGeo, cutMat);
        cutMesh.renderOrder = 3;
        dynamicGroup.add(cutMesh);

        const cutEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(cutGeo, 28),
          new THREE.LineBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.75 })
        );
        dynamicGroup.add(cutEdges);
      }

      if (fillPos.length > 0) {
        const fillGeo = new THREE.BufferGeometry();
        fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fillPos, 3));
        fillGeo.computeVertexNormals();
        const fillMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          transparent: true,
          opacity: 0.48,
          roughness: 0.5,
          metalness: 0.05,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const fillMesh = new THREE.Mesh(fillGeo, fillMat);
        fillMesh.renderOrder = 3;
        dynamicGroup.add(fillMesh);

        const fillEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(fillGeo, 28),
          new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.75 })
        );
        dynamicGroup.add(fillEdges);
      }
    }

    // D. SURVEY STATION MARKERS & DAYLIGHT CROSSING LINES
    const markerGeo = new THREE.SphereGeometry(0.32, 14, 14);
    const stnMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.3,
      metalness: 0.3
    });
    const cpMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.3,
      metalness: 0.4
    });

    sortedStations.forEach((s) => {
      const wx = toWorldX(s.chainage);
      const wy = toWorldY(s.rl!);
      const marker = new THREE.Mesh(markerGeo, s.isCP ? cpMat : stnMat);
      marker.position.set(wx, wy + 0.16, 0);
      dynamicGroup.add(marker);

      const poleGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(wx, baseY, 0),
        new THREE.Vector3(wx, wy, 0)
      ]);
      const pole = new THREE.Line(
        poleGeo,
        new THREE.LineBasicMaterial({
          color: s.isCP ? 0xf59e0b : 0x38bdf8,
          transparent: true,
          opacity: 0.45
        })
      );
      dynamicGroup.add(pole);
    });

    daylights.forEach((dl) => {
      const wx = toWorldX(dl.chainage);
      const wy = toWorldY(dl.elevation) + 0.04;
      const dlGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(wx, wy, -halfW - 0.5),
        new THREE.Vector3(wx, wy, halfW + 0.5)
      ]);
      dynamicGroup.add(
        new THREE.Line(dlGeo, new THREE.LineBasicMaterial({ color: 0xc084fc }))
      );
    });

    // E. REFERENCE DATUM GRID & AXIS LABELS
    const gridSize = Math.ceil(Math.max(lengthCh + 20, corridorWidth + 20) / 10) * 10;
    const gridDivs = Math.max(8, Math.round(gridSize / 5));
    const gridHelper = new THREE.GridHelper(gridSize, gridDivs, 0x334155, 0x172236);
    gridHelper.position.y = baseY - 0.05;
    gridGroup.add(gridHelper);

    const startLabel = createTextSprite(
      `Ch ${minCh.toFixed(0)}m`,
      '#94a3b8',
      maxAnisotropy
    );
    startLabel.position.set(toWorldX(minCh), baseY + 0.8, halfW + 2.4);
    gridGroup.add(startLabel);

    const endLabel = createTextSprite(
      `Ch ${maxCh.toFixed(0)}m`,
      '#94a3b8',
      maxAnisotropy
    );
    endLabel.position.set(toWorldX(maxCh), baseY + 0.8, halfW + 2.4);
    gridGroup.add(endLabel);

    const widthLabel = createTextSprite(
      `Width ${corridorWidth.toFixed(1)}m`,
      '#38bdf8',
      maxAnisotropy
    );
    widthLabel.position.set(toWorldX(maxCh) + 3.5, baseY + 0.8, 0);
    gridGroup.add(widthLabel);

    const elevLabel = createTextSprite(
      `RL ${maxRL.toFixed(2)}m (${verticalExag}× V-Scale)`,
      '#f59e0b',
      maxAnisotropy
    );
    elevLabel.position.set(toWorldX(minCh) - 2, toWorldY(maxRL) + 1.8, -halfW - 1.5);
    gridGroup.add(elevLabel);

    gridGroup.visible = showGridAxes;
    formationGroup.visible = showFormation;
    requestRender();
  }, [
    sortedStations,
    fglZero,
    gradientPct,
    corridorWidth,
    useCrossOffsets,
    daylights,
    verticalExag,
    showWireframe,
    showGridAxes,
    showFormation
  ]);

  // Fast visibility updates for toggles
  useEffect(() => {
    const st = sceneStateRef.current;
    if (!st) return;
    st.gridGroup.visible = showGridAxes;
    st.formationGroup.visible = showFormation;
    if (st.groundWireMesh) st.groundWireMesh.visible = showWireframe;
    st.requestRender();
  }, [showWireframe, showGridAxes, showFormation]);

  return (
    <div
      className={`relative w-full ${heightClass} bg-[#070b12] border border-slate-800 rounded-lg overflow-hidden select-none`}
    >
      {/* Dedicated Empty WebGL Mount */}
      <div ref={mountRef} className="w-full h-full" />

      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#090d16]/95 text-slate-300 text-xs p-4 text-center">
          3D WebGL context was suspended by the browser. Switch to 2D Profile or reload to restore.
        </div>
      )}

      {/* Top-Left Minimal Legend Overlay (No backdrop-filter over WebGL) */}
      <div
        className="absolute top-3 left-3 z-10 pointer-events-none rounded-md border border-slate-700/80 px-2.5 py-1.5 text-[11px] text-slate-200 flex flex-wrap items-center gap-x-3 gap-y-1"
        style={{ backgroundColor: 'rgba(11, 19, 34, 0.90)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-sky-400 inline-block" />
          Ground
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-amber-400 inline-block" />
          Formation
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
          Cut
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
          Fill
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-purple-400 inline-block" />
          Daylight
        </span>
      </div>

      {/* Collapsible Bottom Control Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[95%] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockExpanded((v) => !v)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white border border-slate-700/90 border-b-0 rounded-t-md cursor-pointer"
          style={{ backgroundColor: 'rgba(11, 19, 34, 0.94)' }}
        >
          {dockExpanded ? (
            <>
              <ChevronDown className="w-3 h-3" />
              <span>Hide 3D Controls</span>
            </>
          ) : (
            <>
              <ChevronUp className="w-3 h-3" />
              <span>Show 3D Controls</span>
            </>
          )}
        </button>

        {dockExpanded && (
          <div
            className="flex flex-wrap items-center justify-center gap-1.5 px-2.5 py-2 border border-slate-700/90 rounded-lg shadow-xl"
            style={{ backgroundColor: 'rgba(11, 19, 34, 0.94)' }}
          >
            {/* Camera Presets */}
            <div className="flex items-center gap-1 pr-2 border-r border-slate-800">
              <button
                type="button"
                onClick={() => applyCameraPreset('iso')}
                className="px-2 py-1 text-[11px] font-medium text-slate-200 hover:text-sky-300 hover:bg-slate-800/80 rounded cursor-pointer whitespace-nowrap"
              >
                Iso
              </button>
              <button
                type="button"
                onClick={() => applyCameraPreset('profile')}
                className="px-2 py-1 text-[11px] font-medium text-slate-200 hover:text-sky-300 hover:bg-slate-800/80 rounded cursor-pointer whitespace-nowrap"
              >
                Side
              </button>
              <button
                type="button"
                onClick={() => applyCameraPreset('plan')}
                className="px-2 py-1 text-[11px] font-medium text-slate-200 hover:text-sky-300 hover:bg-slate-800/80 rounded cursor-pointer whitespace-nowrap"
              >
                Plan
              </button>
              <button
                type="button"
                onClick={() => applyCameraPreset('iso')}
                title="Reset camera view"
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-200 hover:text-amber-300 hover:bg-slate-800/80 rounded cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>

            {/* Vertical Exaggeration */}
            <div className="flex items-center gap-1 pr-2 border-r border-slate-800">
              <span className="text-[11px] text-slate-400 px-1">V-Scale:</span>
              {[1, 2, 3, 5].map((scale) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => setVerticalExag(scale)}
                  className={`px-1.5 py-0.5 text-[11px] font-mono-tabular rounded cursor-pointer ${
                    verticalExag === scale
                      ? 'bg-sky-600 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {scale}×
                </button>
              ))}
            </div>

            {/* Geometry Display Toggles */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowWireframe((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded cursor-pointer whitespace-nowrap ${
                  showWireframe
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'text-slate-300 hover:bg-slate-800 border border-transparent'
                }`}
              >
                <Box className="w-3 h-3" />
                Wireframe
              </button>
              <button
                type="button"
                onClick={() => setShowGridAxes((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded cursor-pointer whitespace-nowrap ${
                  showGridAxes
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'text-slate-300 hover:bg-slate-800 border border-transparent'
                }`}
              >
                <Grid3X3 className="w-3 h-3" />
                Grid &amp; Axes
              </button>
              <button
                type="button"
                onClick={() => setShowFormation((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded cursor-pointer whitespace-nowrap ${
                  showFormation
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-300 hover:bg-slate-800 border border-transparent'
                }`}
              >
                <Layers className="w-3 h-3" />
                Formation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
