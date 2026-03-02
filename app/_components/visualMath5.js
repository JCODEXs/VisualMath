"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useRewardStore } from "../store/reward";

const trigger = useRewardStore.getState().trigger;

// ══════════════════════════════════════════════════════════════════════════════
// QUANTITY → COLOR SYSTEM
// The ONLY thing that determines a cube's color is the SIZE of its group.
// Same count → same color. Always. Everywhere.
// This uses the golden-angle hue distribution for maximal visual separation.
// ══════════════════════════════════════════════════════════════════════════════
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Precomputed for n=1..180, golden-angle hue, vivid but not blinding
const QC_CACHE = {};
function quantityColor(n) {
  if (QC_CACHE[n]) return QC_CACHE[n];
  const hue = (n * 137.508) % 360;
  // Vary lightness slightly to help distinguish very close hues
  const l = 52 + (n % 7) * 2.5;
  const s = 72 - (n % 5) * 2;
  return (QC_CACHE[n] = hslToHex(hue, s, l));
}

// Darker version of the same color for edges / platforms
function quantityColorDark(n) {
  const hue = (n * 137.508) % 360;
  const l = 30 + (n % 7) * 1.5;
  const s = 60 - (n % 5) * 2;
  return hslToHex(hue, s, l);
}

// Human-readable color name buckets (for legend labels)
const HUE_NAMES = [
  [15, "Rojo"],
  [45, "Naranja"],
  [75, "Amarillo"],
  [120, "Verde"],
  [165, "Menta"],
  [195, "Cian"],
  [240, "Azul"],
  [280, "Violeta"],
  [320, "Púrpura"],
  [345, "Rosa"],
  [360, "Rojo"],
];
function colorName(n) {
  const h = (n * 137.508) % 360;
  for (const [max, name] of HUE_NAMES) if (h <= max) return name;
  return "Rojo";
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLE ACCENT  (just for header tags / UI chrome, not for cubes)
// ══════════════════════════════════════════════════════════════════════════════
const TABLE_UI = {
  1: "#FF6B6B",
  2: "#FF9F43",
  3: "#FECA57",
  4: "#48CA8B",
  5: "#00D2D3",
  6: "#54A0FF",
  7: "#9B59B6",
  8: "#FF6EB4",
  9: "#2ECC71",
  10: "#E74C3C",
  11: "#A29BFE",
  12: "#F39C12",
  13: "#513509ff",
  14: "#f34e12ff",
  15: "#3ff312ff",
  16: "#3f12f3ff",
  17: "#12f3f3ff",
  18: "#f3123fff",
  19: "#333333ff",
  20: "#333333ff",
};

function getDivisors(n) {
  const d = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) d.push(i);
  return d;
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYOUT ENGINE
// Produces 4 rectangular regions based on free gcols / grows:
//   full    — (gcols × grows)  repeated nfc × nfr times
//   remcol  — (rc    × grows)  remainder columns
//   remrow  — (gcols × rr)     remainder rows
//   corner  — (rc    × rr)     corner remainder
// ══════════════════════════════════════════════════════════════════════════════
const GAP = 1.28;
const MICRO = 0.28; // extra Z every 2 rows (readability)
const SEP = 1.85; // gap between full-group tiles
const REM_SEP = 0.5; // gap before remainder zone

const localZ = (lr) => lr * GAP + Math.floor(lr / 2) * MICRO;
const groupZSpan = (h) => localZ(h - 1) + GAP + SEP;

function buildLayout(a, b, gcols, grows) {
  const nfc = Math.floor(a / gcols),
    rc = a % gcols;
  const nfr = Math.floor(b / grows),
    rr = b % grows;

  // group sizes → colors
  const sz_full = gcols * grows;
  const sz_remcol = rc * grows;
  const sz_remrow = gcols * rr;
  const sz_corner = rc * rr;

  // X origins
  const stepCX = gcols * GAP + SEP;
  const xOrigin = (cg) => (cg < nfc ? cg * stepCX : nfc * stepCX + REM_SEP);

  // Z origins
  const remZOrig = nfr * groupZSpan(grows) + (nfr > 0 ? REM_SEP : 0);
  const zOrigin = (rg) => (rg < nfr ? rg * groupZSpan(grows) : remZOrig);

  const cubes = [];

  const addRegion = (cg, rg, w, h, type) => {
    const xO = xOrigin(cg),
      zO = zOrigin(rg);
    for (let lr = 0; lr < h; lr++)
      for (let lc = 0; lc < w; lc++)
        cubes.push({
          x: xO + lc * GAP,
          y: 0,
          z: zO + localZ(lr),
          cg,
          rg,
          lc,
          lr,
          type,
          w,
          h,
        });
  };

  for (let rg = 0; rg < nfr; rg++)
    for (let cg = 0; cg < nfc; cg++) addRegion(cg, rg, gcols, grows, "full");

  if (rc > 0)
    for (let rg = 0; rg < nfr; rg++) addRegion(nfc, rg, rc, grows, "remcol");

  if (rr > 0)
    for (let cg = 0; cg < nfc; cg++) addRegion(cg, nfr, gcols, rr, "remrow");

  if (rc > 0 && rr > 0) addRegion(nfc, nfr, rc, rr, "corner");

  if (!cubes.length)
    return {
      cubes: [],
      groups: {},
      nfc,
      rc,
      nfr,
      rr,
      sz_full,
      sz_remcol,
      sz_remrow,
      sz_corner,
      centroid: { x: 0, y: 0, z: 0 },
      bbox: { dx: 2, dy: 1, dz: 2 },
    };

  // Center XZ
  const xs = cubes.map((c) => c.x),
    zs = cubes.map((c) => c.z);
  const cxc = (Math.min(...xs) + Math.max(...xs)) / 2;
  const czc = (Math.min(...zs) + Math.max(...zs)) / 2;
  cubes.forEach((c) => {
    c.x -= cxc;
    c.z -= czc;
  });

  // Group metadata (per tile)
  const groups = {};
  cubes.forEach(({ x, z, cg, rg, type, w, h }) => {
    const key = `${type}_${cg}_${rg}`;
    if (!groups[key])
      groups[key] = { type, cg, rg, w, h, xs: [], zs: [], n: 0 };
    groups[key].xs.push(x);
    groups[key].zs.push(z);
    groups[key].n++;
  });
  Object.values(groups).forEach((g) => {
    g.x0 = Math.min(...g.xs) - 0.65;
    g.x1 = Math.max(...g.xs) + 0.65;
    g.z0 = Math.min(...g.zs) - 0.65;
    g.z1 = Math.max(...g.zs) + 0.65;
    g.cx = (g.x0 + g.x1) / 2;
    g.cz = (g.z0 + g.z1) / 2;
    g.size = g.w * g.h; // THE key — this determines the color
  });

  const allX = cubes.map((c) => c.x),
    allZ = cubes.map((c) => c.z);
  return {
    cubes,
    groups,
    nfc,
    rc,
    nfr,
    rr,
    sz_full,
    sz_remcol,
    sz_remrow,
    sz_corner,
    centroid: { x: 0, y: 0, z: 0 },
    bbox: {
      dx: Math.max(...allX) - Math.min(...allX) + 1,
      dy: 1,
      dz: Math.max(...allZ) - Math.min(...allZ) + 1,
    },
  };
}

// Cube-level size: look up its parent tile w×h
function cubeSize(cube) {
  return cube.w * cube.h;
}

// ══════════════════════════════════════════════════════════════════════════════
// TEXT SPRITE
// ══════════════════════════════════════════════════════════════════════════════
function makeSprite(text, hex) {
  const cv = document.createElement("canvas");
  cv.width = 400;
  cv.height = 100;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = hex + "cc";
  ctx.beginPath();
  ctx.roundRect(5, 5, 390, 90, 20);
  ctx.fill();
  ctx.strokeStyle = "#3229297e";
  ctx.lineWidth = 3.8;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 56px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#00000077";
  ctx.shadowBlur = 7;
  ctx.fillText(text, 200, 50);
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      depthTest: false,
    }),
  );
  spr.scale.set(4, 1, 1);
  return spr;
}

// ══════════════════════════════════════════════════════════════════════════════
// THREE.JS SCENE
// ══════════════════════════════════════════════════════════════════════════════
function CubeScene({ a, b, gcols, grows, showLabels }) {
  const mountRef = useRef(null);
  const sr = useRef({
    renderer: null,
    scene: null,
    camera: null,
    raf: null,
    rotY: 0.3,
    orbitR: 15,
    target: new THREE.Vector3(),
    animCubes: [],
  });
  const clock = useRef(new THREE.Clock());

  useEffect(() => {
    const el = mountRef.current,
      W = el.clientWidth,
      H = el.clientHeight,
      st = sr.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    st.renderer = renderer;

    const scene = new THREE.Scene();
    st.scene = scene;
    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 600);
    st.camera = camera;
    const controls = new OrbitControls(camera, renderer.domElement);
    st.controls = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(14, 24, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 300;
    ["left", "right", "top", "bottom"].forEach((k, i) => {
      sun.shadow.camera[k] = [-55, 55, 55, -55][i];
    });
    scene.add(sun);
    const f1 = new THREE.DirectionalLight(0xaaddff, 0.28);
    f1.position.set(-10, 8, -8);
    scene.add(f1);
    const f2 = new THREE.DirectionalLight(0xffeedd, 0.16);
    f2.position.set(0, -6, 0);
    scene.add(f2);
    camera.position.set(0, 20, 15);
    controls.update();

    const animate = () => {
      st.raf = requestAnimationFrame(animate);
      const t = clock.current.getElapsedTime();
      st.animCubes.forEach((cube) => {
        const { st0, sy } = cube.userData;
        const dt = Math.max(0, t - st0),
          p = Math.min(1, dt / 0.5);
        const e = 1 - Math.pow(1 - p, 3) + Math.sin(p * Math.PI) * 0.062;
        cube.position.y = THREE.MathUtils.lerp(sy - 14, sy, Math.min(e, 1));
      });
      st.rotY += 0.0036;
      const R = st.orbitR,
        tgt = st.target;
      //   camera.position.lerp(
      //     new THREE.Vector3(
      //       tgt.x + Math.sin(st.rotY) * R * 0.62,
      //       tgt.y + R * 0.58,
      //       tgt.z + Math.cos(st.rotY) * R * 0.9,
      //     ),
      //     0.03,
      //   );
      camera.lookAt(tgt);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(st.raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const st = sr.current;
    if (!st.scene) return;
    const { scene, camera } = st;
    scene.children.filter((o) => o.userData.rm).forEach((o) => scene.remove(o));
    st.animCubes = [];

    // Ground
    const gnd = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0c0c1e, roughness: 1 }),
    );
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -0.52;
    gnd.receiveShadow = true;
    gnd.userData.rm = true;
    scene.add(gnd);

    const { cubes, groups } = buildLayout(a, b, gcols, grows);
    if (!cubes.length) return;
    const t0 = clock.current.getElapsedTime();
    const isGrouped = gcols < a || grows < b;

    // ── Platforms per group tile ──
    Object.values(groups).forEach((g) => {
      const hex = quantityColor(g.size);
      const col = new THREE.Color(hex);
      const hexD = quantityColorDark(g.size);
      const colD = new THREE.Color(hexD);
      const pw = g.x1 - g.x0,
        pd = g.z1 - g.z0;
      const isRem = g.type !== "full";

      // Slab
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(pw, 0.16, pd),
        new THREE.MeshStandardMaterial({
          color: col,
          transparent: true,
          opacity: isRem ? 0.1 : 0.2,
          roughness: 0.9,
        }),
      );
      slab.position.set(g.cx, -0.58, g.cz);
      slab.receiveShadow = true;
      slab.userData.rm = true;
      scene.add(slab);

      // Glow border
      const border = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(pw, 0.16, pd)),
        new THREE.LineBasicMaterial({
          color: col,
          transparent: true,
          opacity: isRem ? 0.7 : 0.55,
        }),
      );
      border.position.copy(slab.position);
      border.userData.rm = true;
      scene.add(border);

      // Remainder diagonal X marker
      if (isRem && isGrouped) {
        const pts = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(g.x0, -0.48, g.z0),
          new THREE.Vector3(g.x1, -0.48, g.z1),
          new THREE.Vector3(g.x1, -0.48, g.z0),
          new THREE.Vector3(g.x0, -0.48, g.z1),
        ]);
        const xl = new THREE.LineSegments(
          pts,
          new THREE.LineBasicMaterial({
            color: colD,
            transparent: true,
            opacity: 0.55,
          }),
        );
        xl.userData.rm = true;
        scene.add(xl);
      }

      // Corner knob
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 8, 8),
        new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.55,
        }),
      );
      knob.position.set(g.x0, -0.5, g.z0);
      knob.userData.rm = true;
      scene.add(knob);
    });

    // ── Cubes ──
    cubes.forEach(({ x, y, z, w, h }, idx) => {
      const size = w * h;
      const hex = quantityColor(size);
      const col = new THREE.Color(hex);
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.26,
        metalness: 0.18,
        emissive: col,
        emissiveIntensity: 0.08,
      });
      const cube = new THREE.Mesh(geo, mat);
      cube.position.set(x, y, z);
      cube.castShadow = cube.receiveShadow = true;
      cube.userData = { st0: t0 + idx * 0.013, sy: y, rm: true };
      cube.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({
            color: new THREE.Color(hex).multiplyScalar(0.4),
            transparent: true,
            opacity: 0.38,
          }),
        ),
      );
      scene.add(cube);
      st.animCubes.push(cube);
    });

    // ── Labels (show group size) ──
    if (showLabels && isGrouped) {
      Object.values(groups).forEach((g) => {
        const hex = quantityColor(g.size);
        const spr = makeSprite(`${g.size}`, hex);
        // spr.material.depthTest = false;
        // spr.scale.set(2, 2, 2);
        spr.position.set(g.cx, 1.8, g.cz);
        spr.userData.rm = true;
        scene.add(spr);
      });
    }

    // ── Fit camera ──
    const allX = cubes.map((c) => c.x),
      allZ = cubes.map((c) => c.z);
    const dx = Math.max(...allX) - Math.min(...allX) + 1;
    const dz = Math.max(...allZ) - Math.min(...allZ) + 1;
    const fovR = (camera.fov * Math.PI) / 180;
    st.orbitR = (Math.max(dx, dz) / 2 / Math.tan(fovR / 2)) * 1.75;
    st.target.set(0, 0, 0);
  }, [a, b, gcols, grows, showLabels]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// QUANTITY COLOR LEGEND
// Shows every distinct group size present in the current scene with its swatch
// ══════════════════════════════════════════════════════════════════════════════
function QuantityLegend({ a, b, gcols, grows }) {
  const { nfc, rc, nfr, rr, sz_full, sz_remcol, sz_remrow, sz_corner } =
    buildLayout(a, b, gcols, grows);

  // Collect all unique sizes present
  const entries = [];
  const seen = new Set();

  const add = (size, count, label) => {
    if (size <= 0 || count <= 0) return;
    const hex = quantityColor(size);
    if (!seen.has(size)) {
      seen.add(size);
      entries.push({ size, hex, label, count });
    }
  };

  if (nfc > 0 && nfr > 0) add(sz_full, nfc * nfr, `${gcols}×${grows}`);
  if (rc > 0 && nfr > 0) add(sz_remcol, nfr, `${rc}×${grows}`);
  if (rr > 0 && nfc > 0) add(sz_remrow, nfc, `${gcols}×${rr}`);
  if (rc > 0 && rr > 0) add(sz_corner, 1, `${rc}×${rr}`);

  if (entries.length === 0) return null;

  // Sum verification
  const sumStr = entries.map((e) => `${e.count}×${e.size}`).join(" + ");
  const sumVal = entries.reduce((acc, e) => acc + e.count * e.size, 0);

  return (
    <div style={S.legend}>
      <div style={S.legendTitle}>
        <span style={S.legendTitleText}>COLOR = CANTIDAD DE CUBOS</span>
        <span style={S.legendTitleSub}>
          mismo color → mismo tamaño de grupo
        </span>
      </div>

      {sumVal !== entries[0].size && (
        <div style={S.legendItems}>
          {entries.map((e) => (
            <div
              key={e.size}
              style={{
                ...S.legendItem,
                borderColor: e.hex + "55",
                background: e.hex + "12",
              }}
            >
              {/* Color swatch with number */}
              <div style={{ ...S.legendSwatch, background: e.hex }}>
                <span style={S.legendSwatchN}>{e.size}</span>
              </div>
              <div style={S.legendInfo}>
                <span style={{ color: e.hex, fontWeight: 900, fontSize: 18 }}>
                  {e.size}
                </span>
                <span style={S.legendInfoSub}>cubos · {colorName(e.size)}</span>
              </div>
              <div style={S.legendMult}>
                <span style={S.legendMultFormula}>{e.label}</span>
                <span style={S.legendMultCount}>
                  {e.count} {e.count === 1 ? "grupo" : "grupos"}
                </span>
              </div>
              <div style={{ ...S.legendContrib, color: e.hex }}>
                {e.count > 1 ? `${e.count}×` : ""}
                {e.size} = {e.count * e.size}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sum decomposition */}
      {entries.length > 1 && (
        <div style={S.legendSum}>
          <span style={S.legendSumLabel}>Suma:</span>
          {entries.map((e, i) => (
            <span
              key={e.size}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              <span style={{ ...S.legendSumChunk, color: e.hex }}>
                {e.count * e.size}
              </span>
              {i < entries.length - 1 && <span style={S.legendSumOp}>+</span>}
            </span>
          ))}
          <span style={S.legendSumOp}>=</span>
          {/* <span style={{ ...S.legendSumTotal, color: quantityColor(sz_full) }}>
            {sumVal}
          </span> */}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DIVISOR QUICK PICKS
// ══════════════════════════════════════════════════════════════════════════════
function DivisorRow({ n, gcols, grows, axis, onChange }) {
  const divs = getDivisors(n);
  return (
    <div style={S.divRow}>
      {divs
        .filter((d) => d >= 1)
        .map((d) => {
          const rem = n % d;
          const count = Math.floor(n / d);
          const size = axis === "col" ? d * grows : gcols * d;
          const active = d === (axis === "col" ? gcols : grows);
          const isPerfect = rem === 0;
          const hex = quantityColor(size);
          return (
            <button
              key={d}
              onClick={() => onChange(d)}
              style={{
                ...S.divPill,
                borderColor: active
                  ? hex
                  : isPerfect
                    ? "#ffffff25"
                    : "#ffffff0d",
                background: active ? hex + "28" : "transparent",
              }}
            >
              <div
                style={{
                  ...S.divPillSwatch,
                  background: hex,
                  opacity: active ? 1 : 0.55,
                }}
              />
              <span
                style={{
                  ...S.divPillN,
                  color: active ? hex : isPerfect ? "#ccc" : "#555",
                }}
              >
                {d}
              </span>
              {rem > 0 && <span style={S.divPillRem}>+{rem}</span>}
            </button>
          );
        })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GROUP SLIDER
// ══════════════════════════════════════════════════════════════════════════════
function GroupSlider({ n, gcols, grows, axis, onChange }) {
  const value = axis === "col" ? gcols : grows;
  const rem = n % value;
  const groups = Math.floor(n / value);
  const size = axis === "col" ? value * grows : gcols * value;
  const hex = quantityColor(size);
  const label = axis === "col" ? "Columnas por grupo" : "Filas por grupo";

  return (
    <div style={S.gslider}>
      <div style={S.gsliderTop}>
        <span style={S.gsliderLabel}>{label}</span>
        <div style={S.gsliderRight}>
          <div style={{ ...S.gsliderSwatch, background: hex }}>
            <span style={S.gsliderSwatchN}>{size}</span>
          </div>
          <span style={{ color: hex, fontWeight: 900, fontSize: 16 }}>
            {value}
          </span>
          <span style={S.gsliderMeta}>
            → {groups} gr.
            {rem > 0 && (
              <span style={{ color: quantityColor(size), opacity: 0.7 }}>
                {" "}
                +{rem}
              </span>
            )}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={1}
        max={n}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        style={{ ...S.slider, accentColor: hex }}
      />
      <DivisorRow
        n={n}
        gcols={gcols}
        grows={grows}
        axis={axis}
        onChange={onChange}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MINI 2D GRID  (color-coded by group size)
// ══════════════════════════════════════════════════════════════════════════════
function MiniGrid({ a, b, gcols, grows }) {
  const nfc = Math.floor(a / gcols),
    rc = a % gcols;
  const nfr = Math.floor(b / grows),
    rr = b % grows;
  const maxR = Math.min(b, 18),
    maxC = Math.min(a, 24);

  return (
    <div style={S.miniWrap}>
      {Array.from({ length: maxR }).map((_, r) => {
        const rg = Math.floor(r / grows);
        const lr = r % grows;
        const isRR = rg >= nfr;
        const isRowBound = lr === 0 && r > 0;
        const isBigBound = isRowBound && isRR && r === nfr * grows;
        return (
          <div key={r}>
            {isRowBound && (
              <div style={{ height: isBigBound ? 7 : lr % 2 === 0 ? 3 : 0 }} />
            )}
            <div style={{ ...S.miniRow }}>
              {Array.from({ length: maxC }).map((_2, c) => {
                const cg = Math.floor(c / gcols);
                const lc = c % gcols;
                const isRC = cg >= nfc;
                let sz;
                if (!isRC && !isRR) sz = gcols * grows;
                else if (isRC && !isRR) sz = rc * grows;
                else if (!isRC && isRR) sz = gcols * rr;
                else sz = rc * rr;
                const hex = quantityColor(sz);
                const isColBound = lc === 0 && c > 0;
                const isBigColBound = isColBound && isRC && c === nfc * gcols;
                return (
                  <div
                    key={c}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    {isColBound && (
                      <div style={{ width: isBigColBound ? 6 : 2 }} />
                    )}
                    <div
                      style={{
                        ...S.mCube,
                        background: hex,
                        opacity: isRC || isRR ? 0.65 : 1,
                        outline: isRC || isRR ? `1px dashed ${hex}88` : "none",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function randomMult() {
  return {
    a: Math.floor(Math.random() * 11) + 2,
    b: Math.floor(Math.random() * 11) + 2,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [mult, setMult] = useState({ a: 6, b: 8 });
  const [gcols, setGcols] = useState(6);
  const [grows, setGrows] = useState(8);
  const [showLabels, setShowLabels] = useState(true);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  const { a, b } = mult;
  const tableAccent = TABLE_UI[a] || "#54A0FF";
  const correct = a * b;
  const acc = score.total > 0 ? Math.round((score.ok / score.total) * 100) : 0;

  // Full-group color (dominant color of the scene)
  const domColor = quantityColor(gcols * grows);

  const applyNewMult = useCallback((na, nb) => {
    setMult({ a: na, b: nb });
    setGcols(na);
    setGrows(nb);
    setAnswer("");
    setFeedback(null);
    setRevealed(false);
  }, []);

  const newQ = useCallback(() => {
    const m = randomMult();
    applyNewMult(m.a, m.b);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [applyNewMult]);

  const check = () => {
    const n = parseInt(answer, 10),
      ok = n === correct;
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }));
    if (ok) {
      setFeedback("correct");

      trigger(streak + 1, score.total + 1);
      setStreak((s) => s + 1);
      setTimeout(newQ, 1400);
    } else {
      setFeedback("wrong");
      setStreak(0);
      setShake(true);
      setTimeout(() => setShake(false), 450);
    }
  };

  const reveal = () => {
    setRevealed(true);
    setFeedback("revealed");
    setStreak(0);
    setScore((s) => ({ ...s, total: s.total + 1 }));
    setTimeout(newQ, 2800);
  };

  const isGrouped = gcols < a || grows < b;

  // Decomposition hint values
  const nfc = Math.floor(a / gcols),
    rc = a % gcols;
  const nfr = Math.floor(b / grows),
    rr = b % grows;
  const parts = [
    nfc > 0 && nfr > 0 && { size: gcols * grows, count: nfc * nfr },
    rc > 0 && nfr > 0 && { size: rc * grows, count: nfr },
    rr > 0 && nfc > 0 && { size: gcols * rr, count: nfc },
    rc > 0 && rr > 0 && { size: rc * rr, count: 1 },
  ].filter(Boolean);

  return (
    <div style={S.root}>
      <div style={S.bgDots} />

      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.logo}>
          {[1, 3, 6].map((k) => (
            <span
              key={k}
              style={{
                ...S.lCube,
                background: `hsl(${(k * 7 * 137.508) % 360},70%,55%)`,
              }}
            />
          ))}
          <span style={S.lText}>MathCubes</span>
          <span style={{ ...S.lSub, color: domColor }}>
            {isGrouped ? `grupos de ${gcols * grows}` : "sin agrupar"}
          </span>
        </div>
        <div style={S.hStats}>
          {[
            ["✓", score.ok, "#48CA8B"],
            ["Total", score.total, "#ccc"],
            ["%", acc, acc > 70 ? "#48CA8B" : acc > 40 ? "#FECA57" : "#FF6B6B"],
          ].map(([l, v, c]) => (
            <div key={l} style={S.statChip}>
              <span style={S.sLbl}>{l}</span>
              <span style={{ ...S.sVal, color: c }}>{v}</span>
            </div>
          ))}
          {streak >= 3 && <div style={S.fire}>🔥 {streak}</div>}
        </div>
      </header>

      {/* ── Body ── */}
      <div style={S.body}>
        {/* LEFT ── */}
        <div style={S.left}>
          {/* 3D Canvas */}
          <div
            style={{
              ...S.canvas3d,
              boxShadow: `0 0 90px ${domColor}18, 0 20px 60px #00000090`,
            }}
          >
            <CubeScene
              key={`${a}-${b}-${gcols}-${grows}-${showLabels}`}
              a={a}
              b={b}
              gcols={gcols}
              grows={grows}
              showLabels={showLabels}
            />
            {/* <div style={{ ...S.canvasTag, background: tableAccent + "dd" }}>
              <b>{a}</b>×<b>{b}</b> = <b>{correct}</b>
            </div> */}
            {isGrouped && (
              <div
                style={{
                  ...S.colorTag,
                  background: domColor + "22",
                  borderColor: domColor + "66",
                }}
              >
                <div style={{ ...S.colorTagSwatch, background: domColor }} />
                <span style={{ color: domColor }}>
                  grupos de <b>{gcols * grows}</b>
                </span>
              </div>
            )}
            {revealed && (
              <div style={S.revealBox}>
                <span style={{ ...S.revealN, color: domColor }}>{correct}</span>
                <span style={S.revealS}>cubos en total</span>
              </div>
            )}
          </div>

          {/* Quantity color legend */}
          {/* <QuantityLegend a={a} b={b} gcols={gcols} grows={grows} /> */}

          {/* ── Grouping controls ── */}
          <div style={S.ctrlPanel}>
            <div style={S.ctrlTop}>
              <span style={S.ctrlTitle}>AGRUPACIÓN LIBRE</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setShowLabels((v) => !v)}
                  style={{
                    ...S.smallBtn,
                    borderColor: showLabels ? domColor + "77" : "#333",
                    color: showLabels ? domColor : "#555",
                  }}
                >
                  {showLabels ? "🏷 Ocultar" : "🏷 Mostrar"}
                </button>
                {isGrouped && (
                  <button
                    onClick={() => {
                      setGcols(a);
                      setGrows(b);
                    }}
                    style={S.smallBtn}
                  >
                    ↺ Reset
                  </button>
                )}
              </div>
            </div>

            {/* Status bar: division with remainder */}
            <div style={S.statusBar}>
              <div style={S.statusSection}>
                <span style={S.statusLbl}>Col</span>
                <span style={{ color: "#ddd", fontWeight: 800 }}>{a}</span>
                <span style={S.statusOp}>=</span>
                <span
                  style={{
                    color: quantityColor(gcols * grows),
                    fontWeight: 700,
                  }}
                >
                  {gcols}
                </span>
                <span style={S.statusOp}>×</span>
                <span style={{ color: "#bbb" }}>{nfc}</span>
                {rc > 0 && (
                  <>
                    <span style={S.statusOp}>+</span>
                    <span
                      style={{
                        color: quantityColor(rc * grows),
                        fontWeight: 800,
                      }}
                    >
                      {rc}
                    </span>
                  </>
                )}
              </div>
              <div style={S.statusDiv} />
              <div style={S.statusSection}>
                <span style={S.statusLbl}>Fil</span>
                <span style={{ color: "#ddd", fontWeight: 800 }}>{b}</span>
                <span style={S.statusOp}>=</span>
                <span
                  style={{
                    color: quantityColor(gcols * grows),
                    fontWeight: 700,
                  }}
                >
                  {grows}
                </span>
                <span style={S.statusOp}>×</span>
                <span style={{ color: "#bbb" }}>{nfr}</span>
                {rr > 0 && (
                  <>
                    <span style={S.statusOp}>+</span>
                    <span
                      style={{
                        color: quantityColor(gcols * rr),
                        fontWeight: 800,
                      }}
                    >
                      {rr}
                    </span>
                  </>
                )}
              </div>
            </div>

            <GroupSlider
              n={a}
              gcols={gcols}
              grows={grows}
              axis="col"
              onChange={setGcols}
            />
            <GroupSlider
              n={b}
              gcols={gcols}
              grows={grows}
              axis="row"
              onChange={setGrows}
            />
          </div>
        </div>

        {/* RIGHT ── */}
        <div style={S.right}>
          {/* Question card */}
          <div style={{ ...S.qCard, borderColor: tableAccent + "44" }}>
            <div style={S.qTop}>
              <span style={S.qLbl}>¿CUÁNTO ES?</span>
              {streak >= 2 && <span style={S.qStreak}>🔥 {streak}</span>}
            </div>
            <div style={S.qDisplay}>
              <span style={{ ...S.qN, color: tableAccent }}>{a}</span>
              <span style={S.qOp}>×</span>
              <span style={{ ...S.qN, color: tableAccent + "aa" }}>{b}</span>
              <span style={S.qOp}>=</span>
              <span style={S.qSlot}>?</span>
            </div>

            {/* Decomposition hint with quantity colors */}
            {isGrouped && parts.length > 0 && (
              <div style={S.qDecomp}>
                {parts.map((p, i) => {
                  const hex = quantityColor(p.size);
                  return (
                    <span
                      key={i}
                      style={{ display: "flex", alignItems: "center", gap: 3 }}
                    >
                      <div style={{ ...S.decompSwatch, background: hex }} />
                      <span
                        style={{ color: hex, fontWeight: 800, fontSize: 13 }}
                      >
                        {p.count > 1 ? `${p.count}×` : ""}
                        {p.size}={p.count * p.size}
                      </span>
                      {i < parts.length - 1 && (
                        <span style={{ color: "#444", fontSize: 12 }}>+</span>
                      )}
                    </span>
                  );
                })}
                <span style={{ color: "#444" }}>= </span>
                {/* <span style={{ color: domColor, fontWeight: 900 }}>
                  {correct}
                </span> */}
              </div>
            )}

            <MiniGrid a={a} b={b} gcols={gcols} grows={grows} />
          </div>

          {/* Input */}
          <div style={S.inputGroup}>
            <input
              ref={inputRef}
              type="number"
              min={0}
              max={9999}
              value={answer}
              placeholder="Tu respuesta…"
              onChange={(e) => {
                setAnswer(e.target.value);
                setFeedback(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && answer !== "" && check()}
              style={{
                ...S.input,
                ...(shake ? S.shakeAnim : {}),
                borderColor:
                  feedback === "correct"
                    ? "#48CA8B"
                    : feedback === "wrong"
                      ? "#FF6B6B"
                      : tableAccent + "55",
                boxShadow: feedback
                  ? `0 0 0 3px ${feedback === "correct" ? "#48CA8B33" : "#FF6B6B33"}`
                  : "none",
              }}
            />
            {feedback && (
              <div
                style={{
                  ...S.fb,
                  background:
                    feedback === "correct"
                      ? "#48CA8B18"
                      : feedback === "revealed"
                        ? "#FECA5718"
                        : "#FF6B6B18",
                  borderColor:
                    feedback === "correct"
                      ? "#48CA8B"
                      : feedback === "revealed"
                        ? "#FECA57"
                        : "#FF6B6B",
                  color:
                    feedback === "correct"
                      ? "#48CA8B"
                      : feedback === "revealed"
                        ? "#FECA57"
                        : "#FF6B6B",
                }}
              >
                {feedback === "correct" && "✓ ¡Correcto! Siguiente…"}
                {feedback === "wrong" && "✗ Suma los bloques del mismo color"}
                {feedback === "revealed" &&
                  `Respuesta: ${correct} — mira la leyenda de colores`}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div style={S.btns}>
            <button
              onClick={check}
              disabled={answer === ""}
              style={{
                ...S.btnP,
                background: answer !== "" ? domColor : "#1a1a2e",
                cursor: answer !== "" ? "pointer" : "not-allowed",
                boxShadow: answer !== "" ? `0 6px 22px ${domColor}44` : "none",
              }}
            >
              Verificar ↵
            </button>
            <button onClick={reveal} style={S.btnS}>
              Ver ✦
            </button>
            <button onClick={newQ} style={S.btnG}>
              Nueva ↺
            </button>
          </div>

          {/* Sliders */}
          <div style={S.sliders}>
            <span style={S.sTitle}>ELIGE LA MULTIPLICACIÓN</span>
            <div style={S.sRow}>
              {[
                { k: "a", label: "Tabla", max: 19 },
                { k: "b", label: "Veces", max: 19 },
              ].map(({ k, label, max }) => (
                <div key={k} style={S.sGroup}>
                  <div style={S.sTops}>
                    <span style={S.sLabelTxt}>{label}</span>
                    <span style={{ ...S.sNum, color: tableAccent }}>
                      {mult[k]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={max}
                    value={mult[k]}
                    onChange={(e) =>
                      applyNewMult(
                        k === "a" ? parseInt(e.target.value) : a,
                        k === "b" ? parseInt(e.target.value) : b,
                      )
                    }
                    style={{ ...S.slider, accentColor: tableAccent }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Table chips — accent only for UI, not cube colors */}
          <div style={S.colorBox}>
            <span style={S.cTitle}>TABLA</span>
            <div style={S.chips}>
              {Object.entries(TABLE_UI).map(([k, v]) => (
                <button
                  key={k}
                  title={`Tabla del ${k}`}
                  onClick={() => applyNewMult(parseInt(k), b)}
                  style={{
                    ...S.chip,
                    background: v,
                    outline: a === parseInt(k) ? "2.5px solid #fff" : "none",
                    outlineOffset: 2,
                    transform: a === parseInt(k) ? "scale(1.22)" : "scale(1)",
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════
const S = {
  root: {
    minHeight: "100vh",
    width: "100%",
    background: "#0b0b18",
    fontFamily: "'Nunito','Trebuchet MS',sans-serif",
    color: "#dde0f0",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
  },
  bgDots: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
    backgroundImage: "radial-gradient(circle,#ffffff06 1px,transparent 1px)",
    backgroundSize: "28px 28px",
  },
  header: {
    position: "relative",
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "11px 20px",
    background: "#0b0b18f0",
    borderBottom: "1px solid #ffffff0f",
    backdropFilter: "blur(10px)",
  },
  logo: { display: "flex", alignItems: "center", gap: 5 },
  lCube: { width: 11, height: 11, borderRadius: 3 },
  lText: {
    fontSize: 20,
    fontWeight: 900,
    color: "#fff",
    marginLeft: 6,
    letterSpacing: "-0.5px",
  },
  lSub: {
    fontSize: 11,
    fontWeight: 700,
    marginLeft: 8,
    letterSpacing: "0.3px",
  },
  hStats: { display: "flex", alignItems: "center", gap: 6 },
  statChip: {
    display: "flex",
    gap: 5,
    alignItems: "center",
    background: "#ffffff0b",
    border: "1px solid #ffffff12",
    borderRadius: 20,
    padding: "4px 12px",
  },
  sLbl: {
    fontSize: 11,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  },
  sVal: { fontSize: 15, fontWeight: 800 },
  fire: {
    background: "linear-gradient(135deg,#FF6B6B,#FF9F43)",
    borderRadius: 20,
    padding: "4px 12px",
    fontSize: 13,
    fontWeight: 800,
    color: "#fff",
  },
  body: {
    position: "relative",
    zIndex: 5,
    flex: 1,
    display: "flex",
    gap: 16,
    padding: "14px 18px",
    flexWrap: "wrap",
  },
  left: {
    flex: "1 1 440px",
    display: "flex",
    flexDirection: "column",
    gap: 11,
  },
  canvas3d: {
    height: 400,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
    border: "1px solid #ffffff0f",
    background: "#0d0d20",
  },
  canvasTag: {
    position: "absolute",
    top: 11,
    left: 11,
    borderRadius: 9,
    padding: "4px 11px",
    fontSize: 12,
    fontWeight: 800,
    color: "#fff",
    backdropFilter: "blur(6px)",
  },
  colorTag: {
    position: "absolute",
    top: 11,
    right: 11,
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 9,
    padding: "4px 10px",
    border: "1px solid",
    backdropFilter: "blur(6px)",
  },
  colorTagSwatch: { width: 10, height: 10, borderRadius: 2 },
  revealBox: {
    position: "absolute",
    bottom: 11,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#000000cc",
    borderRadius: 14,
    padding: "9px 26px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    backdropFilter: "blur(12px)",
    border: "1px solid #ffffff14",
  },
  revealN: { fontSize: 50, fontWeight: 900, lineHeight: 1 },
  revealS: { fontSize: 11, color: "#777", marginTop: 2 },
  // Legend
  legend: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 14,
    padding: "13px 15px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  legendTitle: { display: "flex", flexDirection: "column", gap: 1 },
  legendTitleText: {
    fontSize: 10,
    color: "#555",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  legendTitleSub: { fontSize: 11, color: "#444", fontStyle: "italic" },
  legendItems: { display: "flex", flexDirection: "column", gap: 6 },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid",
    borderRadius: 11,
    padding: "8px 12px",
  },
  legendSwatch: {
    width: 40,
    height: 40,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  legendSwatchN: {
    fontSize: 14,
    fontWeight: 900,
    color: "#fff",
    textShadow: "0 1px 4px #00000066",
  },
  legendInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    minWidth: 70,
  },
  legendInfoSub: { fontSize: 10, color: "#555" },
  legendMult: { display: "flex", flexDirection: "column", gap: 1, flex: 1 },
  legendMultFormula: { fontSize: 13, fontWeight: 800, color: "#bbb" },
  legendMultCount: { fontSize: 10, color: "#555" },
  legendContrib: { fontSize: 16, fontWeight: 900, flexShrink: 0 },
  legendSum: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
    borderTop: "1px solid #ffffff0a",
    paddingTop: 8,
  },
  legendSumLabel: { fontSize: 11, color: "#555", fontWeight: 700 },
  legendSumChunk: { fontWeight: 800, fontSize: 15 },
  legendSumOp: { color: "#444", fontWeight: 300 },
  legendSumTotal: { fontWeight: 900, fontSize: 20 },
  // Controls
  ctrlPanel: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 14,
    padding: "13px 15px",
    display: "flex",
    flexDirection: "column",
    gap: 11,
  },
  ctrlTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 5,
  },
  ctrlTitle: {
    fontSize: 10,
    color: "#555",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  smallBtn: {
    fontSize: 11,
    fontWeight: 700,
    border: "1.5px solid #ffffff22",
    borderRadius: 8,
    padding: "4px 10px",
    background: "transparent",
    cursor: "pointer",
    transition: "all 0.2s",
    color: "#777",
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    background: "#0e0e26",
    borderRadius: 9,
    padding: "7px 11px",
    gap: 8,
    flexWrap: "wrap",
  },
  statusSection: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 13,
    fontWeight: 700,
  },
  statusLbl: {
    fontSize: 10,
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  },
  statusOp: { color: "#333", fontWeight: 300 },
  statusDiv: { width: 1, height: 18, background: "#ffffff14", flexShrink: 0 },
  // Group slider
  gslider: { display: "flex", flexDirection: "column", gap: 6 },
  gsliderTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gsliderLabel: { fontSize: 11, color: "#666", fontWeight: 700 },
  gsliderRight: { display: "flex", alignItems: "center", gap: 6 },
  gsliderSwatch: {
    width: 26,
    height: 26,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  gsliderSwatchN: {
    fontSize: 10,
    fontWeight: 900,
    color: "#fff",
    textShadow: "0 1px 3px #00000055",
  },
  gsliderMeta: { fontSize: 11, color: "#555" },
  divRow: { display: "flex", flexWrap: "wrap", gap: 4 },
  divPill: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 8px 3px 5px",
    borderRadius: 8,
    border: "1px solid",
    cursor: "pointer",
    transition: "all 0.12s",
    background: "transparent",
  },
  divPillSwatch: { width: 8, height: 8, borderRadius: 2, flexShrink: 0 },
  divPillN: { fontSize: 13, fontWeight: 900, lineHeight: 1 },
  divPillRem: { fontSize: 9, color: "#888", fontWeight: 700 },
  // Question card
  right: {
    flex: "0 0 308px",
    display: "flex",
    flexDirection: "column",
    gap: 11,
  },
  qCard: {
    background: "#131325",
    border: "1.5px solid",
    borderRadius: 17,
    padding: "12px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  qTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  qLbl: {
    fontSize: 10,
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    fontWeight: 800,
  },
  qStreak: { fontSize: 12, fontWeight: 800, color: "#FF9F43" },
  qDisplay: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  qN: { fontSize: 50, fontWeight: 900, lineHeight: 1 },
  qOp: { fontSize: 32, fontWeight: 300, color: "#333" },
  qSlot: { fontSize: 50, fontWeight: 900, color: "#1c1c38", lineHeight: 1 },
  qDecomp: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "center",
    background: "#0e0e26",
    borderRadius: 9,
    padding: "7px 10px",
  },
  decompSwatch: { width: 9, height: 9, borderRadius: 2, flexShrink: 0 },
  miniWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    alignItems: "center",
    maxHeight: 110,
    // overflow: "",
    maxWidth: "100%",
  },
  miniRow: { display: "flex", gap: 2, width: "100%" },
  mCube: {
    width: 8,
    height: 8,
    borderRadius: 2,
    flexShrink: 0,
    transition: "background 0.2s",
  },
  inputGroup: { display: "flex", flexDirection: "column", gap: 7 },
  input: {
    background: "#181830",
    border: "2px solid",
    borderRadius: 11,
    padding: "11px 14px",
    fontSize: 30,
    fontWeight: 900,
    color: "#fff",
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "all 0.2s",
    MozAppearance: "textfield",
  },
  shakeAnim: { animation: "shake 0.4s ease" },
  fb: {
    borderRadius: 9,
    border: "1.5px solid",
    padding: "7px 11px",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
  },
  btns: { display: "flex", gap: 6 },
  btnP: {
    flex: 2,
    padding: "11px 0",
    borderRadius: 11,
    border: "none",
    fontSize: 14,
    fontWeight: 800,
    color: "#fff",
    fontFamily: "inherit",
    transition: "all 0.18s",
  },
  btnS: {
    flex: 1,
    padding: "11px 0",
    borderRadius: 11,
    border: "1.5px solid #ffffff14",
    background: "transparent",
    fontSize: 12,
    fontWeight: 700,
    color: "#777",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnG: {
    flex: 1,
    padding: "11px 0",
    borderRadius: 11,
    border: "1.5px solid #ffffff0c",
    background: "transparent",
    fontSize: 12,
    fontWeight: 700,
    color: "#555",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  sliders: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 13,
    padding: "12px 15px",
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },
  sTitle: {
    fontSize: 10,
    color: "#444",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  sRow: { display: "flex", gap: 12 },
  sGroup: { flex: 1, display: "flex", flexDirection: "column", gap: 5 },
  sTops: { display: "flex", justifyContent: "space-between" },
  sLabelTxt: { fontSize: 11, color: "#666", fontWeight: 600 },
  sNum: { fontSize: 15, fontWeight: 900 },
  slider: { width: "100%", cursor: "pointer" },
  colorBox: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 12,
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },
  cTitle: {
    fontSize: 10,
    color: "#444",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  chips: { display: "flex", flexWrap: "wrap", gap: 4 },
  chip: {
    width: 28,
    height: 28,
    borderRadius: 7,
    border: "none",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 800,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.14s",
    boxShadow: "0 2px 5px #00000050",
  },
};
