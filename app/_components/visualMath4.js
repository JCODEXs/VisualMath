"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

// ─── Palette ───────────────────────────────────────────────────────────────────
const TABLE_COLORS = {
  1: { main: "#FF6B6B", dark: "#C0392B", name: "Rojo" },
  2: { main: "#FF9F43", dark: "#E67E22", name: "Naranja" },
  3: { main: "#FECA57", dark: "#D4AC0D", name: "Amarillo" },
  4: { main: "#48CA8B", dark: "#1E8449", name: "Verde" },
  5: { main: "#00D2D3", dark: "#0097A7", name: "Cian" },
  6: { main: "#54A0FF", dark: "#1565C0", name: "Azul" },
  7: { main: "#9B59B6", dark: "#6C3483", name: "Violeta" },
  8: { main: "#FF6EB4", dark: "#AD1457", name: "Rosa" },
  9: { main: "#2ECC71", dark: "#1A7A44", name: "Esmeralda" },
  10: { main: "#E74C3C", dark: "#922B21", name: "Carmín" },
  11: { main: "#A29BFE", dark: "#4834D4", name: "Índigo" },
  12: { main: "#F39C12", dark: "#9A6A00", name: "Dorado" },
};

// Accent checkerboard for full groups
const FULL_ACCENTS = [
  "#FF6B6B",
  "#FFD166",
  "#06D6A0",
  "#54A0FF",
  "#FF6EB4",
  "#A29BFE",
  "#F39C12",
  "#2ECC71",
];

// Fixed remainder colors by type
const REM_COLORS = {
  remcol: "#F0A500", // amber — column remainder
  remrow: "#00B4D8", // ocean — row remainder
  corner: "#FF6EB4", // pink  — corner remainder
};

function getDivisors(n) {
  const d = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) d.push(i);
  return d;
}

// ─── Layout engine ─────────────────────────────────────────────────────────────
const GAP = 1.28; // cube spacing within group
const MICRO = 0.4; // extra Z every 2 rows inside a group (readability)
const GRP_SEP = 1.9; // gap between adjacent same-type groups
const REM_GAP = 3.4; // extra separation before remainder region

// Z position of local row lr within a group
const localZ = (lr) => lr * GAP + Math.floor(lr / 2) * MICRO;

// Height (Z span) of a group with h rows, plus one separator
const groupZSpan = (h) => localZ(h - 1) + GAP + GRP_SEP;

// Colour for a given cube
function blockColor(type, cg, rg, nfc, mainHex) {
  if (type === "full") {
    const idx = rg * nfc + cg;
    return idx === 0 ? mainHex : FULL_ACCENTS[idx % FULL_ACCENTS.length];
  }
  return REM_COLORS[type] ?? "#ffffff";
}

/*
 * buildLayout returns:
 *   cubes:  [{x,y,z, type, cg, rg, lc, lr}]
 *   groups: { key → {type,cg,rg,n,x0,x1,z0,z1,cx,cz,w,h,label} }
 *   nfc, rc, nfr, rr (full group counts and remainders)
 *   centroid, bbox
 */
function buildLayout(a, b, gcols, grows) {
  const nfc = Math.floor(a / gcols);
  const rc = a % gcols;
  const nfr = Math.floor(b / grows);
  const rr = b % grows;

  // X step between full col groups
  const stepCX = gcols * GAP + GRP_SEP;
  // X origin: full cg < nfc → cg*stepCX; remainder → after all full + extra gap
  const xOrig = (cg) => (cg < nfc ? cg * stepCX : nfc * stepCX + REM_GAP);

  // Z origins: full row groups then remainder row band
  const fullZStep = groupZSpan(grows);
  const remZOrig = nfr * fullZStep + (nfr > 0 ? REM_GAP : 0);
  const zOrig = (rg) => (rg < nfr ? rg * fullZStep : remZOrig);

  const cubes = [];
  const addBlock = (cg, rg, w, h, type) => {
    const xO = xOrig(cg);
    const zO = zOrig(rg);
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
        });
  };

  // Full blocks
  for (let rg = 0; rg < nfr; rg++)
    for (let cg = 0; cg < nfc; cg++) addBlock(cg, rg, gcols, grows, "full");

  // Column-remainder strip (right)
  if (rc > 0)
    for (let rg = 0; rg < nfr; rg++) addBlock(nfc, rg, rc, grows, "remcol");

  // Row-remainder strip (front)
  if (rr > 0)
    for (let cg = 0; cg < nfc; cg++) addBlock(cg, nfr, gcols, rr, "remrow");

  // Corner remainder
  if (rc > 0 && rr > 0) addBlock(nfc, nfr, rc, rr, "corner");

  if (!cubes.length)
    return {
      cubes: [],
      groups: {},
      nfc,
      rc,
      nfr,
      rr,
      centroid: { x: 0, y: 0, z: 0 },
      bbox: { dx: 1, dy: 1, dz: 1 },
    };

  // Center in XZ
  const xs = cubes.map((c) => c.x),
    zs = cubes.map((c) => c.z);
  const cxc = (Math.min(...xs) + Math.max(...xs)) / 2;
  const czc = (Math.min(...zs) + Math.max(...zs)) / 2;
  cubes.forEach((c) => {
    c.x -= cxc;
    c.z -= czc;
  });

  // Build group metadata
  const groups = {};
  cubes.forEach(({ x, z, cg, rg, type }) => {
    const key = `${cg},${rg}`;
    if (!groups[key]) groups[key] = { type, cg, rg, xs: [], zs: [], n: 0 };
    groups[key].xs.push(x);
    groups[key].zs.push(z);
    groups[key].n++;
  });
  Object.entries(groups).forEach(([, g]) => {
    g.x0 = Math.min(...g.xs) - 0.65;
    g.x1 = Math.max(...g.xs) + 0.65;
    g.z0 = Math.min(...g.zs) - 0.65;
    g.z1 = Math.max(...g.zs) + 0.65;
    g.cx = (g.x0 + g.x1) / 2;
    g.cz = (g.z0 + g.z1) / 2;
    g.w = g.type === "full" ? gcols : g.type === "remrow" ? gcols : rc;
    g.h = g.type === "full" ? grows : g.type === "remcol" ? grows : rr;
    g.label = `${g.w}×${g.h}=${g.w * g.h}`;
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
    centroid: { x: 0, y: 0, z: 0 },
    bbox: {
      dx: Math.max(...allX) - Math.min(...allX) + 1,
      dy: 1,
      dz: Math.max(...allZ) - Math.min(...allZ) + 1,
    },
  };
}

// ─── Text sprite ───────────────────────────────────────────────────────────────
function makeSprite(text, bg) {
  const cv = document.createElement("canvas");
  cv.width = 440;
  cv.height = 110;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = bg + "cc";
  ctx.beginPath();
  ctx.roundRect(6, 6, cv.width - 12, cv.height - 12, 22);
  ctx.fill();
  ctx.strokeStyle = "#ffffff44";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 50px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#00000066";
  ctx.shadowBlur = 8;
  ctx.fillText(text, cv.width / 2, cv.height / 2);
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      depthTest: false,
    }),
  );
  spr.scale.set(4.2, 1.05, 1);
  return spr;
}

// ─── Three.js Scene ────────────────────────────────────────────────────────────
function CubeScene({ a, b, gcols, grows, showLabels, mainColor }) {
  const mountRef = useRef(null);
  const sr = useRef({
    renderer: null,
    scene: null,
    camera: null,
    raf: null,
    rotY: 0.35,
    orbitR: 12,
    target: new THREE.Vector3(),
    cubes: [],
  });
  const clock = useRef(new THREE.Clock());

  // ── Initial mount ──
  useEffect(() => {
    const el = mountRef.current;
    const W = el.clientWidth,
      H = el.clientHeight;
    const st = sr.current;

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
    // scene.add(
    //   Object.assign(new THREE.DirectionalLight(0xaaddff, 0.3), {
    //     position: new THREE.Vector3(-10, 8, -8),
    //   }),
    // );
    // scene.add(
    //   Object.assign(new THREE.DirectionalLight(0xffeedd, 0.18), {
    //     position: new THREE.Vector3(0, -6, 0),
    //   }),
    // );

    const animate = () => {
      st.raf = requestAnimationFrame(animate);
      const t = clock.current.getElapsedTime();
      st.cubes.forEach((cube) => {
        const { st0, sy } = cube.userData;
        const dt = Math.max(0, t - st0),
          p = Math.min(1, dt / 0.52);
        const e = 1 - Math.pow(1 - p, 3) + Math.sin(p * Math.PI) * 0.065;
        cube.position.y = THREE.MathUtils.lerp(sy - 14, sy, Math.min(e, 1));
      });
      st.rotY += 0.0036;
      const R = st.orbitR,
        tgt = st.target;
      camera.position.lerp(
        new THREE.Vector3(
          tgt.x + Math.sin(st.rotY) * R * 0.62,
          tgt.y + R * 0.58,
          tgt.z + Math.cos(st.rotY) * R * 0.9,
        ),
        0.032,
      );
      camera.lookAt(tgt);
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

  // ── Rebuild on param change ──
  useEffect(() => {
    const st = sr.current;
    if (!st.scene) return;
    const { scene, camera } = st;
    scene.children.filter((o) => o.userData.rm).forEach((o) => scene.remove(o));
    st.cubes = [];

    const gnd = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0c0c1e, roughness: 1 }),
    );
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -0.52;
    gnd.receiveShadow = true;
    gnd.userData.rm = true;
    scene.add(gnd);

    const { cubes, groups, nfc, rc } = buildLayout(a, b, gcols, grows);
    const t0 = clock.current.getElapsedTime();
    const isGrouped = gcols < a || grows < b;

    // ── Platforms ──
    Object.values(groups).forEach((g) => {
      const hex = blockColor(g.type, g.cg, g.rg, nfc || 1, mainColor);
      const col = new THREE.Color(hex);
      const pw = g.x1 - g.x0,
        pd = g.z1 - g.z0;
      const isRem = g.type !== "full";

      // Slab
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(pw, 0.18, pd),
        new THREE.MeshStandardMaterial({
          color: col,
          transparent: true,
          opacity: isRem ? 0.09 : 0.18,
          roughness: 0.9,
          side: THREE.DoubleSide,
        }),
      );
      slab.position.set(g.cx, -0.59, g.cz);
      slab.receiveShadow = true;
      slab.userData.rm = true;
      scene.add(slab);

      // Border lines
      const borderMat = new THREE.LineBasicMaterial({
        color: col,
        transparent: true,
        opacity: isRem ? 0.65 : 0.45,
      });
      const border = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(pw, 0.18, pd)),
        borderMat,
      );
      border.position.copy(slab.position);
      border.userData.rm = true;
      scene.add(border);

      // For remainder: add "R" marker cross on platform
      if (isRem && isGrouped) {
        const mkLine = (ax, ay, az, bx, by, bz) => {
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(ax, ay, az),
            new THREE.Vector3(bx, by, bz),
          ]);
          const l = new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({
              color: col,
              transparent: true,
              opacity: 0.5,
            }),
          );
          l.userData.rm = true;
          scene.add(l);
        };
        mkLine(g.x0, -0.49, g.z0, g.x1, -0.49, g.z1);
        mkLine(g.x1, -0.49, g.z0, g.x0, -0.49, g.z1);
      }

      // Corner sphere indicator
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.5,
        }),
      );
      knob.position.set(g.x0, -0.5, g.z0);
      knob.userData.rm = true;
      scene.add(knob);
    });

    // ── Cubes ──
    cubes.forEach(({ x, y, z, cg, rg, type }, idx) => {
      const hex = blockColor(type, cg, rg, nfc || 1, mainColor);
      const col = new THREE.Color(hex);
      const isRem = type !== "full";
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.28,
        metalness: 0.18,
        emissive: col,
        emissiveIntensity: isRem ? 0.04 : 0.08,
        transparent: isRem,
        opacity: isRem ? 0.82 : 1.0,
      });
      const cube = new THREE.Mesh(geo, mat);
      cube.position.set(x, y, z);
      cube.castShadow = cube.receiveShadow = true;
      cube.userData = { st0: t0 + idx * 0.014, sy: y, rm: true };
      cube.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({
            color: new THREE.Color(hex).multiplyScalar(0.45),
            transparent: true,
            opacity: 0.4,
          }),
        ),
      );
      scene.add(cube);
      st.cubes.push(cube);
    });

    // ── Labels ──
    if (showLabels && isGrouped) {
      Object.values(groups).forEach((g) => {
        const hex = blockColor(g.type, g.cg, g.rg, nfc || 1, mainColor);
        const spr = makeSprite(g.label, hex);
        spr.position.set(g.cx, 1.85, g.cz);
        spr.userData.rm = true;
        scene.add(spr);
      });
    }

    // ── Camera fit ──
    if (cubes.length) {
      const allX = cubes.map((c) => c.x),
        allZ = cubes.map((c) => c.z);
      const dx = Math.max(...allX) - Math.min(...allX) + 1;
      const dz = Math.max(...allZ) - Math.min(...allZ) + 1;
      const fovR = (camera.fov * Math.PI) / 180;
      st.orbitR = (Math.max(dx, dz) / 2 / Math.tan(fovR / 2)) * 1.72;
      st.target.set(0, 0, 0);
    }
  }, [a, b, gcols, grows, showLabels, mainColor]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
    />
  );
}

// ─── Divisor quick-pick row ────────────────────────────────────────────────────
function DivisorRow({ n, value, onChange, accentColor }) {
  const divs = getDivisors(n);
  return (
    <div style={S.divRow}>
      {divs.map((d) => {
        const rem = n % d,
          groups = Math.floor(n / d);
        const active = d === value;
        const isPerfect = rem === 0;
        return (
          <button
            key={d}
            onClick={() => onChange(d)}
            style={{
              ...S.divPill,
              borderColor: active
                ? accentColor
                : isPerfect
                  ? "#ffffff22"
                  : "#ffffff0f",
              background: active ? accentColor + "28" : "transparent",
              color: active ? accentColor : isPerfect ? "#aaa" : "#555",
            }}
          >
            <span
              style={{
                ...S.divPillN,
                color: active ? accentColor : isPerfect ? "#ddd" : "#666",
              }}
            >
              {d}
            </span>
            {!isPerfect && <span style={S.divPillRem}>R{rem}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Free slider with divisor quick-picks ─────────────────────────────────────
function GroupSlider({ n, value, onChange, label, accentColor }) {
  const rem = n % value;
  const groups = Math.floor(n / value);
  return (
    <div style={S.gslider}>
      <div style={S.gsliderTop}>
        <span style={S.gsliderLabel}>{label}</span>
        <div style={S.gsliderInfo}>
          <span style={{ color: accentColor, fontWeight: 900, fontSize: 15 }}>
            {value}
          </span>
          <span style={S.gsliderEq}>
            →&nbsp;
            <span style={{ color: "#ccc" }}>{groups}</span>
            <span style={{ color: "#555" }}> grupos</span>
            {rem > 0 && (
              <>
                <span style={{ color: "#555" }}> + </span>
                <span
                  style={{
                    color: rem === 0 ? "#555" : REM_COLORS.remcol,
                    fontWeight: 800,
                  }}
                >
                  {rem} resto
                </span>
              </>
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
        style={{ ...S.slider, accentColor }}
      />
      <DivisorRow
        n={n}
        value={value}
        onChange={onChange}
        accentColor={accentColor}
      />
    </div>
  );
}

// ─── Area model summary ────────────────────────────────────────────────────────
function AreaSummary({ a, b, gcols, grows, mainColor }) {
  const nfc = Math.floor(a / gcols),
    rc = a % gcols;
  const nfr = Math.floor(b / grows),
    rr = b % grows;
  const total = a * b;
  const isGrouped = gcols < a || grows < b;
  const hasColRem = rc > 0,
    hasRowRem = rr > 0;

  // Compute region contributions
  const fullCount = nfc * nfr * (gcols * grows);
  const remColCount = hasColRem ? nfr * (rc * grows) : 0;
  const remRowCount = hasRowRem ? nfc * (gcols * rr) : 0;
  const cornerCount = hasColRem && hasRowRem ? rc * rr : 0;
  const sumParts = fullCount + remColCount + remRowCount + cornerCount;

  if (!isGrouped)
    return (
      <div style={S.areaSimple}>
        <span style={{ color: mainColor, fontWeight: 800 }}>
          {a}×{b}
        </span>
        <span style={S.areaEq}> = </span>
        <span style={{ color: mainColor, fontWeight: 900, fontSize: 22 }}>
          {total}
        </span>
      </div>
    );

  // Build display rows for the area-model grid
  const colParts = [...Array(nfc).fill(gcols), ...(hasColRem ? [rc] : [])];
  const rowParts = [...Array(nfr).fill(grows), ...(hasRowRem ? [rr] : [])];

  return (
    <div style={S.areaGrid}>
      {/* Column labels header */}
      <div style={S.areaHeader}>
        <div style={S.areaCornerCell} />
        {colParts.map((cp, ci) => {
          const isRC = ci === nfc;
          const hex = isRC ? REM_COLORS.remcol : mainColor;
          return (
            <div
              key={ci}
              style={{
                ...S.areaColHdr,
                color: hex,
                borderBottomColor: hex + "66",
                flex: cp,
              }}
            >
              {cp}
              <span style={S.areaHdrSub}> col</span>
            </div>
          );
        })}
      </div>

      {/* Rows */}
      {rowParts.map((rp, ri) => {
        const isRR = ri === nfr;
        const rowHex = isRR ? REM_COLORS.remrow : mainColor;
        return (
          <div key={ri} style={S.areaRow}>
            <div
              style={{
                ...S.areaRowHdr,
                color: rowHex,
                borderRightColor: rowHex + "66",
              }}
            >
              {rp}
              <span style={S.areaHdrSub}> f</span>
            </div>
            {colParts.map((cp, ci) => {
              const isRC = ci === nfc;
              const type =
                !isRC && !isRR
                  ? "full"
                  : isRC && !isRR
                    ? "remcol"
                    : !isRC && isRR
                      ? "remrow"
                      : "corner";
              const gidx = ri * (nfc + (isRC ? 0 : 0)) + (isRC ? nfc : ci);
              const hex = blockColor(
                type,
                isRC ? nfc : ci,
                isRR ? nfr : ri,
                nfc || 1,
                mainColor,
              );
              const val = cp * rp;
              return (
                <div
                  key={ci}
                  style={{
                    ...S.areaCell,
                    flex: cp,
                    background: hex + "1a",
                    borderColor: hex + "44",
                    borderStyle: type === "full" ? "solid" : "dashed",
                  }}
                >
                  <span style={{ color: hex, fontWeight: 800, fontSize: 12 }}>
                    {cp}×{rp}
                  </span>
                  <span style={{ color: hex, fontWeight: 900, fontSize: 16 }}>
                    {val}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Sum breakdown */}
      <div style={S.areaSumLine}>
        {[
          fullCount > 0 && {
            label: `${nfc * nfr} bloques × ${gcols * grows}`,
            val: fullCount,
            col: mainColor,
          },
          remColCount > 0 && {
            label: `${nfr} col-resto × ${rc * grows}`,
            val: remColCount,
            col: REM_COLORS.remcol,
          },
          remRowCount > 0 && {
            label: `${nfc} fila-resto × ${gcols * rr}`,
            val: remRowCount,
            col: REM_COLORS.remrow,
          },
          cornerCount > 0 && {
            label: `esquina ${rc}×${rr}`,
            val: cornerCount,
            col: REM_COLORS.corner,
          },
        ]
          .filter(Boolean)
          .map((p, i, arr) => (
            <span
              key={i}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              <span style={{ color: p.col, fontWeight: 800 }}>{p.val}</span>
              {i < arr.length - 1 && <span style={{ color: "#444" }}>+</span>}
            </span>
          ))}
        <span style={{ color: "#444" }}>=</span>
        <span style={{ color: mainColor, fontWeight: 900, fontSize: 18 }}>
          {sumParts}
        </span>
      </div>
    </div>
  );
}

// ─── Mini 2D grid ──────────────────────────────────────────────────────────────
function MiniGrid({ a, b, gcols, grows, mainColor }) {
  const nfc = Math.floor(a / gcols),
    rc = a % gcols;
  const nfr = Math.floor(b / grows),
    rr = b % grows;
  const maxCols = Math.min(a, 16),
    maxRows = Math.min(b, 16);
  return (
    <div style={S.miniWrap}>
      {Array.from({ length: maxRows }).map((_, r) => {
        const rg = Math.floor(r / grows);
        const lr = r % grows;
        const isRR = rg >= nfr;
        const isRowSep = lr === 0 && r > 0;
        const isBigSep = isRowSep && isRR && r === nfr * grows;
        return (
          <div key={r}>
            {isRowSep && (
              <div
                style={{
                  height: isBigSep ? 7 : lr % 2 === 0 ? 4 : 0,
                  width: "100%",
                }}
              />
            )}
            <div style={{ ...S.miniRow, marginBottom: 1 }}>
              {Array.from({ length: maxCols }).map((_2, c) => {
                const cg = Math.floor(c / gcols);
                const lc = c % gcols;
                const isRC = cg >= nfc;
                const type =
                  !isRC && !isRR
                    ? "full"
                    : isRC && !isRR
                      ? "remcol"
                      : !isRC && isRR
                        ? "remrow"
                        : "corner";
                const hex = blockColor(
                  type,
                  isRC ? nfc : cg,
                  isRR ? nfr : rg,
                  nfc || 1,
                  mainColor,
                );
                const isColSep = lc === 0 && c > 0;
                const isBigColSep = isColSep && isRC && c === nfc * gcols;
                return (
                  <div
                    key={c}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    {isColSep && (
                      <div style={{ width: isBigColSep ? 6 : 2, height: 1 }} />
                    )}
                    <div
                      style={{
                        ...S.mCube,
                        background: hex,
                        opacity: type !== "full" ? 0.72 : 1,
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

// ─── Helpers ───────────────────────────────────────────────────────────────────
function randomMult() {
  return {
    a: Math.floor(Math.random() * 11) + 2,
    b: Math.floor(Math.random() * 11) + 2,
  };
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [mult, setMult] = useState({ a: 7, b: 8 });
  const [gcols, setGcols] = useState(7); // group cols (default = no split)
  const [grows, setGrows] = useState(8); // group rows
  const [showLabels, setShowLabels] = useState(true);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  const { a, b } = mult;
  const color = TABLE_COLORS[a] ?? TABLE_COLORS[1];
  const correct = a * b;
  const acc = score.total > 0 ? Math.round((score.ok / score.total) * 100) : 0;
  console.log("a:", a);
  console.log("color:", color);
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

  const nfc = Math.floor(a / gcols),
    rc = a % gcols;
  const nfr = Math.floor(b / grows),
    rr = b % grows;
  const isGrouped = gcols < a || grows < b;
  const hasRem = rc > 0 || rr > 0;

  return (
    <div style={S.root}>
      <div style={S.bgDots} />

      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.logo}>
          {[1, 3, 4].map((k) => (
            <span
              key={k}
              style={{ ...S.lCube, background: TABLE_COLORS[k].main }}
            />
          ))}
          <span style={S.lText}>MathCubes</span>
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
        {/* LEFT */}
        <div style={S.left}>
          {/* 3D canvas */}
          <div
            style={{
              ...S.canvas3d,
              boxShadow: `0 0 80px ${color.main}16,0 20px 60px #00000088`,
            }}
          >
            <CubeScene
              //   key={`${a}-${b}-${gcols}-${grows}-${showLabels}-${color.main}`}
              a={a}
              b={b}
              gcols={gcols}
              grows={grows}
              showLabels={showLabels}
              mainColor={color.main}
            />
            <div style={{ ...S.tag, background: color.main + "ee" }}>
              Tabla del <b>{a}</b> · {color.name}
            </div>
            {/* Region legend overlay */}
            {isGrouped && (
              <div style={S.legend}>
                {[
                  { type: "full", label: `${gcols}×${grows}`, col: mainColor },
                  rc > 0 && {
                    type: "remcol",
                    label: `${rc}×${grows}`,
                    col: REM_COLORS.remcol,
                  },
                  rr > 0 && {
                    type: "remrow",
                    label: `${gcols}×${rr}`,
                    col: REM_COLORS.remrow,
                  },
                  rc > 0 &&
                    rr > 0 && {
                      type: "corner",
                      label: `${rc}×${rr}`,
                      col: REM_COLORS.corner,
                    },
                ]
                  .filter(Boolean)
                  .map(({ label, col }) => (
                    <div key={label} style={S.legendItem}>
                      <div style={{ ...S.legendDot, background: col }} />
                      <span
                        style={{ color: col, fontWeight: 700, fontSize: 11 }}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {revealed && (
              <div style={S.revealBox}>
                <span style={{ ...S.revealN, color: color.main }}>
                  {correct}
                </span>
                <span style={S.revealS}>cubos en total</span>
              </div>
            )}
          </div>

          {/* Area model summary */}
          <AreaSummary
            a={a}
            b={b}
            gcols={gcols}
            grows={grows}
            mainColor={color.main}
          />

          {/* ── Group controls ── */}
          <div style={S.ctrlPanel}>
            <div style={S.ctrlTop}>
              <span style={S.ctrlTitle}>AGRUPACIÓN LIBRE CON RESIDUO</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  onClick={() => setShowLabels((v) => !v)}
                  style={{
                    ...S.lblBtn,
                    borderColor: showLabels ? color.main + "77" : "#333",
                    color: showLabels ? color.main : "#555",
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
                    style={{ ...S.resetBtn }}
                  >
                    ↺ Reset
                  </button>
                )}
              </div>
            </div>

            {/* Remainder status bar */}
            {isGrouped && (
              <div style={S.remBar}>
                <div style={S.remBarSection}>
                  <span style={S.remBarLabel}>Columnas:</span>
                  <span style={{ color: color.main, fontWeight: 800 }}>
                    {a}
                  </span>
                  <span style={S.remBarEq}>=</span>
                  <span style={{ color: color.main }}>{gcols}</span>
                  <span style={S.remBarOp}>×</span>
                  <span style={{ color: "#ccc" }}>{nfc}</span>
                  {rc > 0 && (
                    <>
                      <span style={S.remBarOp}>+</span>
                      <span
                        style={{ color: REM_COLORS.remcol, fontWeight: 800 }}
                      >
                        {rc}
                      </span>
                    </>
                  )}
                </div>
                <div style={S.remBarDiv} />
                <div style={S.remBarSection}>
                  <span style={S.remBarLabel}>Filas:</span>
                  <span style={{ color: color.dark, fontWeight: 800 }}>
                    {b}
                  </span>
                  <span style={S.remBarEq}>=</span>
                  <span style={{ color: color.dark }}>{grows}</span>
                  <span style={S.remBarOp}>×</span>
                  <span style={{ color: "#ccc" }}>{nfr}</span>
                  {rr > 0 && (
                    <>
                      <span style={S.remBarOp}>+</span>
                      <span
                        style={{ color: REM_COLORS.remrow, fontWeight: 800 }}
                      >
                        {rr}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            <GroupSlider
              n={a}
              value={gcols}
              onChange={setGcols}
              label="Columnas por grupo"
              accentColor={color.main}
            />
            <GroupSlider
              n={b}
              value={grows}
              onChange={setGrows}
              label="Filas por grupo"
              accentColor={color.dark}
            />
          </div>
        </div>

        {/* RIGHT */}
        <div style={S.right}>
          {/* Question card */}
          <div style={{ ...S.qCard, borderColor: color.main + "44" }}>
            <div style={S.qTop}>
              <span style={S.qLbl}>¿CUÁNTO ES?</span>
              {streak >= 2 && <span style={S.qStreak}>🔥 {streak}</span>}
            </div>
            <div style={S.qDisplay}>
              <span style={{ ...S.qN, color: color.main }}>{a}</span>
              <span style={S.qOp}>×</span>
              <span style={{ ...S.qN, color: color.dark }}>{b}</span>
              <span style={S.qOp}>=</span>
              <span style={S.qSlot}>?</span>
            </div>

            {/* Remainder decomposition hint */}
            {hasRem && isGrouped && (
              <div style={S.qDecomp}>
                {[
                  nfc > 0 &&
                    nfr > 0 && {
                      v: nfc * nfr * (gcols * grows),
                      col: mainColor,
                      t: `${nfc * nfr}×${gcols * grows}`,
                    },
                  rc > 0 &&
                    nfr > 0 && {
                      v: nfr * (rc * grows),
                      col: REM_COLORS.remcol,
                      t: `${nfr}×${rc * grows}`,
                    },
                  rr > 0 &&
                    nfc > 0 && {
                      v: nfc * (gcols * rr),
                      col: REM_COLORS.remrow,
                      t: `${nfc}×${gcols * rr}`,
                    },
                  rc > 0 &&
                    rr > 0 && {
                      v: rc * rr,
                      col: REM_COLORS.corner,
                      t: `${rc}×${rr}`,
                    },
                ]
                  .filter(Boolean)
                  .map((p, i, arr) => (
                    <span
                      key={i}
                      style={{ display: "flex", alignItems: "center", gap: 3 }}
                    >
                      <span
                        style={{ color: p.col, fontWeight: 800, fontSize: 12 }}
                        title={p.t}
                      >
                        {p.v}
                      </span>
                      {i < arr.length - 1 && (
                        <span style={{ color: "#444", fontSize: 12 }}>+</span>
                      )}
                    </span>
                  ))}
                <span style={{ color: "#444", fontSize: 12 }}>=</span>
                <span style={{ color: color.main, fontWeight: 900 }}>
                  {correct}
                </span>
              </div>
            )}

            <MiniGrid
              a={a}
              b={b}
              gcols={gcols}
              grows={grows}
              mainColor={color.main}
            />
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
                      : color.main + "55",
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
                {feedback === "wrong" && "✗ Suma los bloques y el residuo"}
                {feedback === "revealed" &&
                  `Respuesta: ${correct} — suma todos los grupos`}
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
                background: answer !== "" ? color.main : "#1a1a2e",
                cursor: answer !== "" ? "pointer" : "not-allowed",
                boxShadow:
                  answer !== "" ? `0 6px 22px ${color.main}44` : "none",
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
                { k: "a", label: "Tabla", max: 12 },
                { k: "b", label: "Veces", max: 12 },
              ].map(({ k, label, max }) => (
                <div key={k} style={S.sGroup}>
                  <div style={S.sTops}>
                    <span style={S.sLabelTxt}>{label}</span>
                    <span style={{ ...S.sNum, color: color.main }}>
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
                    style={{ ...S.slider, accentColor: color.main }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Table chips */}
          <div style={S.colorBox}>
            <span style={S.cTitle}>TABLA DEL COLOR</span>
            <div style={S.chips}>
              {Object.entries(TABLE_COLORS).map(([k, v]) => (
                <button
                  key={k}
                  title={`Tabla del ${k} · ${v.name}`}
                  onClick={() => applyNewMult(parseInt(k), b)}
                  style={{
                    ...S.chip,
                    background: v.main,
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

// ─── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    minHeight: "100vh",
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
    padding: "12px 22px",
    background: "#0b0b18ee",
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
    gap: 18,
    padding: "16px 20px",
    flexWrap: "wrap",
  },
  left: {
    flex: "1 1 440px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  canvas3d: {
    height: 410,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
    border: "1px solid #ffffff0f",
    background: "#0d0d20",
  },
  tag: {
    position: "absolute",
    top: 12,
    left: 12,
    borderRadius: 9,
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 800,
    color: "#fff",
    backdropFilter: "blur(6px)",
  },
  legend: {
    position: "absolute",
    bottom: 12,
    left: 12,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "#00000099",
    borderRadius: 8,
    padding: "4px 8px",
    backdropFilter: "blur(6px)",
  },
  legendDot: { width: 9, height: 9, borderRadius: 2, flexShrink: 0 },
  revealBox: {
    position: "absolute",
    bottom: 12,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#000000cc",
    borderRadius: 16,
    padding: "10px 28px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    backdropFilter: "blur(12px)",
    border: "1px solid #ffffff15",
  },
  revealN: { fontSize: 52, fontWeight: 900, lineHeight: 1 },
  revealS: { fontSize: 12, color: "#777", marginTop: 2 },
  // Area model
  areaSimple: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#ffffff07",
    border: "1px solid #ffffff0f",
    borderRadius: 12,
    padding: "9px 16px",
    fontSize: 14,
    color: "#888",
  },
  areaEq: { color: "#444" },
  areaGrid: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 14,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  areaHeader: { display: "flex", gap: 4 },
  areaCornerCell: { width: 28, flexShrink: 0 },
  areaColHdr: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: 800,
    paddingBottom: 5,
    borderBottom: "1.5px solid",
  },
  areaRow: { display: "flex", gap: 4, alignItems: "stretch" },
  areaRowHdr: {
    width: 28,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    fontSize: 11,
    fontWeight: 800,
    paddingRight: 6,
    borderRight: "1.5px solid",
  },
  areaHdrSub: { fontWeight: 400, fontSize: 9, opacity: 0.7 },
  areaCell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    border: "1px solid",
    padding: "5px 4px",
    gap: 1,
    minWidth: 0,
  },
  areaSumLine: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    borderTop: "1px solid #ffffff0f",
    paddingTop: 8,
    marginTop: 2,
    fontSize: 13,
    fontWeight: 700,
  },
  // Controls
  ctrlPanel: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 16,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  ctrlTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  ctrlTitle: {
    fontSize: 10,
    color: "#555",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  lblBtn: {
    fontSize: 12,
    fontWeight: 700,
    border: "1.5px solid",
    borderRadius: 9,
    padding: "5px 11px",
    background: "transparent",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  resetBtn: {
    fontSize: 12,
    fontWeight: 700,
    border: "1.5px solid #ffffff22",
    borderRadius: 9,
    padding: "5px 11px",
    background: "transparent",
    cursor: "pointer",
    color: "#888",
    transition: "all 0.2s",
  },
  remBar: {
    display: "flex",
    alignItems: "center",
    background: "#0e0e26",
    borderRadius: 10,
    padding: "8px 12px",
    gap: 8,
    flexWrap: "wrap",
  },
  remBarSection: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 13,
    fontWeight: 700,
  },
  remBarLabel: { color: "#555", fontSize: 11 },
  remBarEq: { color: "#444" },
  remBarOp: { color: "#444" },
  remBarDiv: { width: 1, height: 20, background: "#ffffff18", flexShrink: 0 },
  // Group slider
  gslider: { display: "flex", flexDirection: "column", gap: 7 },
  gsliderTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gsliderLabel: { fontSize: 11, color: "#666", fontWeight: 700 },
  gsliderInfo: { display: "flex", alignItems: "center", gap: 5 },
  gsliderEq: { fontSize: 11, color: "#666" },
  // Divisor row
  divRow: { display: "flex", flexWrap: "wrap", gap: 5 },
  divPill: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: 8,
    border: "1px solid",
    cursor: "pointer",
    transition: "all 0.13s",
    minWidth: 36,
    background: "transparent",
  },
  divPillN: { fontSize: 14, fontWeight: 900, lineHeight: 1 },
  divPillRem: {
    fontSize: 9,
    color: REM_COLORS.remcol,
    fontWeight: 800,
    marginTop: 1,
  },
  // Question card
  right: {
    flex: "0 0 308px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  qCard: {
    background: "#131325",
    border: "1.5px solid",
    borderRadius: 18,
    padding: "16px 18px",
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
    padding: "2px 0",
  },
  qN: { fontSize: 50, fontWeight: 900, lineHeight: 1 },
  qOp: { fontSize: 34, fontWeight: 300, color: "#333" },
  qSlot: { fontSize: 50, fontWeight: 900, color: "#1c1c38", lineHeight: 1 },
  qDecomp: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
    justifyContent: "center",
    background: "#0e0e26",
    borderRadius: 9,
    padding: "7px 10px",
  },
  miniWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    alignItems: "center",
    maxHeight: 110,
    overflow: "hidden",
  },
  miniRow: { display: "flex", gap: 2.5 },
  mCube: {
    width: 8,
    height: 8,
    borderRadius: 2,
    flexShrink: 0,
    transition: "background 0.25s",
  },
  inputGroup: { display: "flex", flexDirection: "column", gap: 8 },
  input: {
    background: "#181830",
    border: "2px solid",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 30,
    fontWeight: 900,
    color: "#fff",
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "border-color 0.2s,box-shadow 0.2s",
    MozAppearance: "textfield",
  },
  shakeAnim: { animation: "shake 0.4s ease" },
  fb: {
    borderRadius: 10,
    border: "1.5px solid",
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
  },
  btns: { display: "flex", gap: 7 },
  btnP: {
    flex: 2,
    padding: "12px 0",
    borderRadius: 12,
    border: "none",
    fontSize: 15,
    fontWeight: 800,
    color: "#fff",
    fontFamily: "inherit",
    transition: "all 0.18s",
  },
  btnS: {
    flex: 1,
    padding: "12px 0",
    borderRadius: 12,
    border: "1.5px solid #ffffff15",
    background: "transparent",
    fontSize: 13,
    fontWeight: 700,
    color: "#777",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnG: {
    flex: 1,
    padding: "12px 0",
    borderRadius: 12,
    border: "1.5px solid #ffffff0d",
    background: "transparent",
    fontSize: 13,
    fontWeight: 700,
    color: "#555",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  sliders: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 14,
    padding: "13px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  sTitle: {
    fontSize: 10,
    color: "#444",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  sRow: { display: "flex", gap: 14 },
  sGroup: { flex: 1, display: "flex", flexDirection: "column", gap: 6 },
  sTops: { display: "flex", justifyContent: "space-between" },
  sLabelTxt: { fontSize: 12, color: "#666", fontWeight: 600 },
  sNum: { fontSize: 16, fontWeight: 900 },
  slider: { width: "100%", cursor: "pointer" },
  colorBox: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 13,
    padding: "11px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  cTitle: {
    fontSize: 10,
    color: "#444",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  chips: { display: "flex", flexWrap: "wrap", gap: 5 },
  chip: {
    width: 29,
    height: 29,
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s",
    boxShadow: "0 2px 6px #00000050",
  },
};
