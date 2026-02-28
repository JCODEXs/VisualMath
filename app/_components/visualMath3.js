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

// 8 harmonious accent colors for group checkerboard
const ACCENTS = [
  "#FF6B6B",
  "#FFD166",
  "#06D6A0",
  "#54A0FF",
  "#FF6EB4",
  "#A29BFE",
  "#F39C12",
  "#2ECC71",
];

// ─── Divisor math ──────────────────────────────────────────────────────────────
function getDivisors(n) {
  const divs = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) divs.push(i);
  return divs; // [1, 2, …, n]
}

// "Interesting" divisors: all except 1 when n>1 (1 creates n groups of 1, too noisy)
// but we always include n itself (= no split)
function getUsefulDivisors(n) {
  return getDivisors(n).filter((d) => d > 1);
}

// ─── Layout constants ──────────────────────────────────────────────────────────
const GAP = 1.28; // cube-to-cube spacing within a group
const GGAP_C = 1.9; // horizontal gap between column groups
const GGAP_R = 0.55; // extra Z gap every 2 rows inside a group (readability)
const FLOOR_H = 3.2; // Y lift between row groups (floors)

// Z position of local row lr inside its group, with every-2-row micro-gap
const localZ = (lr) => lr * GAP + Math.floor(lr / 2) * GGAP_R;

// ─── Build layout ──────────────────────────────────────────────────────────────
// colDiv : group size along columns (must divide a)
// rowDiv : group size along rows    (must divide b)
// Returns { cubes, groups, centroid, bbox }
function buildLayout(a, b, colDiv, rowDiv) {
  const numCG = a / colDiv; // number of column groups
  const numRG = b / rowDiv; // number of row groups (= floors)
  const cubes = [];

  // Precompute group X offsets (col groups spread horizontally)
  const groupW = (colDiv - 1) * GAP; // width of one col group
  const stepCG = groupW + GGAP_C; // step between col group origins

  for (let rg = 0; rg < numRG; rg++) {
    // row group (floor)
    for (let cg = 0; cg < numCG; cg++) {
      // col group
      const gid = rg * numCG + cg;
      for (let lr = 0; lr < rowDiv; lr++) {
        // local row within group
        for (let lc = 0; lc < colDiv; lc++) {
          // local col within group
          cubes.push({
            x: cg * stepCG + lc * GAP,
            y: rg * FLOOR_H,
            z: localZ(lr),
            gid,
            rg,
            cg,
            lr,
            lc,
          });
        }
      }
    }
  }

  // Center XZ
  const xs = cubes.map((c) => c.x),
    zs = cubes.map((c) => c.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  cubes.forEach((c) => {
    c.x -= cx;
    c.z -= cz;
  });

  // Group metadata
  const groups = {};
  cubes.forEach(({ x, y, z, gid, rg, cg }) => {
    if (!groups[gid])
      groups[gid] = { gid, rg, cg, xs: [], ys: [], zs: [], n: 0 };
    groups[gid].xs.push(x);
    groups[gid].ys.push(y);
    groups[gid].zs.push(z);
    groups[gid].n++;
  });
  Object.values(groups).forEach((g) => {
    g.x0 = Math.min(...g.xs) - 0.65;
    g.x1 = Math.max(...g.xs) + 0.65;
    g.y0 = Math.min(...g.ys);
    g.z0 = Math.min(...g.zs) - 0.65;
    g.z1 = Math.max(...g.zs) + 0.65;
    g.cx = (g.x0 + g.x1) / 2;
    g.cz = (g.z0 + g.z1) / 2;
    g.label = `${colDiv}×${rowDiv}=${colDiv * rowDiv}`;
  });

  const allX = cubes.map((c) => c.x),
    allY = cubes.map((c) => c.y),
    allZ = cubes.map((c) => c.z);
  const bbox = {
    dx: Math.max(...allX) - Math.min(...allX) + 1,
    dy: Math.max(...allY) - Math.min(...allY) + 1,
    dz: Math.max(...allZ) - Math.min(...allZ) + 1,
  };
  const centroid = {
    x: 0,
    y: (Math.min(...allY) + Math.max(...allY)) / 2,
    z: 0,
  };

  return { cubes, groups, centroid, bbox, numCG, numRG };
}

// ─── Text sprite ───────────────────────────────────────────────────────────────
function makeSprite(text, bg) {
  const cv = document.createElement("canvas");
  cv.width = 440;
  cv.height = 112;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = bg + "d8";
  ctx.beginPath();
  ctx.roundRect(6, 6, cv.width - 12, cv.height - 12, 24);
  ctx.fill();
  ctx.strokeStyle = "#ffffff44";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 52px Arial";
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
  spr.scale.set(4.4, 1.12, 1);
  return spr;
}

// ─── Group color (checkerboard by rg+cg parity, cycling accents) ──────────────
function groupColor(rg, cg, numCG, mainHex) {
  // Alternate primary / accent in checkerboard
  const idx = rg * numCG + cg;
  if (idx === 0) return mainHex;
  return ACCENTS[idx % ACCENTS.length];
}

// ─── Three.js Scene ────────────────────────────────────────────────────────────
function CubeScene({ a, b, colDiv, rowDiv, showLabels, mainColor }) {
  const mountRef = useRef(null);
  const sr = useRef({
    renderer: null,
    scene: null,
    camera: null,
    raf: null,
    rotY: 0.4,
    orbitR: 14,
    target: new THREE.Vector3(),
    cubes: [],
  });
  const clock = useRef(new THREE.Clock());

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

    scene.add(new THREE.AmbientLight(0xffffff, 0.52));
    const sun = new THREE.DirectionalLight(0xffffff, 1.45);
    sun.position.set(14, 24, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 250;
    ["left", "right", "top", "bottom"].forEach((k, i) => {
      sun.shadow.camera[k] = [-50, 50, 50, -50][i];
    });
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaaddff, 0.32);
    fill.position.set(-10, 8, -8);
    scene.add(fill);
    const bounce = new THREE.DirectionalLight(0xffeedd, 0.18);
    bounce.position.set(0, -6, 0);
    scene.add(bounce);
    camera.position.set(0, 16, 15);

    const animate = () => {
      st.raf = requestAnimationFrame(animate);
      const t = clock.current.getElapsedTime();
      st.cubes.forEach((cube) => {
        const { st: startT, sy } = cube.userData;
        const dt = Math.max(0, t - startT);
        const p = Math.min(1, dt / 0.52);
        const e = 1 - Math.pow(1 - p, 3) + Math.sin(p * Math.PI) * 0.065;
        cube.position.y = THREE.MathUtils.lerp(sy - 14, sy, Math.min(e, 1));
      });
      st.rotY += 0.0036;
      const R = st.orbitR,
        tgt = st.target;
      //   const want = new THREE.Vector3(
      //     tgt.x + Math.sin(st.rotY) * R * 0.6,
      //     tgt.y + R * 0.56,
      //     tgt.z + Math.cos(st.rotY) * R * 0.9,
      //   );
      //   camera.position.lerp(want, 0.035);
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

  useEffect(() => {
    const st = sr.current;
    if (!st.scene) return;
    const { scene, camera } = st;

    scene.children.filter((o) => o.userData.rm).forEach((o) => scene.remove(o));
    st.cubes = [];

    const { cubes, groups, centroid, bbox, numCG, numRG } = buildLayout(
      a,
      b,
      colDiv,
      rowDiv,
    );
    const t0 = clock.current.getElapsedTime();
    const isSplit = colDiv < a || rowDiv < b;

    // ── Ground grid ──
    const gndGeo = new THREE.PlaneGeometry(200, 200);
    const gndMat = new THREE.MeshStandardMaterial({
      color: 0x0c0c1e,
      roughness: 1,
    });
    const gnd = new THREE.Mesh(gndGeo, gndMat);
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -0.52;
    gnd.receiveShadow = true;
    gnd.userData.rm = true;
    scene.add(gnd);

    // ── Platforms per group ──
    if (isSplit) {
      Object.values(groups).forEach((g) => {
        const hex = groupColor(g.rg, g.cg, numCG, mainColor);
        const col = new THREE.Color(hex);
        const pw = g.x1 - g.x0,
          pd = g.z1 - g.z0;

        // Platform slab
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(pw, 0.2, pd),
          new THREE.MeshStandardMaterial({
            color: col,
            transparent: true,
            opacity: 0.18,
            roughness: 0.9,
          }),
        );
        slab.position.set(g.cx, g.y0 - 0.6, g.cz);
        slab.receiveShadow = true;
        slab.userData.rm = true;
        scene.add(slab);

        // Glowing border edges
        const border = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(pw, 0.2, pd)),
          new THREE.LineBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.55,
          }),
        );
        border.position.copy(slab.position);
        border.userData.rm = true;
        scene.add(border);

        // Corner sphere
        const knob = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 8, 8),
          new THREE.MeshStandardMaterial({
            color: col,
            emissive: col,
            emissiveIntensity: 0.5,
          }),
        );
        knob.position.set(g.x0, g.y0 - 0.5, g.z0);
        knob.userData.rm = true;
        scene.add(knob);

        // Thin vertical pillars at corners for multi-floor stacking
        if (numRG > 1 && g.rg > 0) {
          const pillarH = g.y0;
          const pillarGeo = new THREE.CylinderGeometry(0.06, 0.06, pillarH, 6);
          const pillarMat = new THREE.MeshStandardMaterial({
            color: col,
            transparent: true,
            opacity: 0.4,
          });
          [
            [g.x0, g.z0],
            [g.x1, g.z0],
            [g.x0, g.z1],
            [g.x1, g.z1],
          ].forEach(([px, pz]) => {
            const p = new THREE.Mesh(pillarGeo, pillarMat);
            p.position.set(px, pillarH / 2 - 0.5, pz);
            p.userData.rm = true;
            scene.add(p);
          });
        }
      });
    }

    // ── Cubes ──
    cubes.forEach(({ x, y, z, gid, rg, cg }, idx) => {
      const hex = groupColor(rg, cg, numCG, mainColor);
      const col = new THREE.Color(hex);
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.27,
        metalness: 0.2,
        emissive: col,
        emissiveIntensity: 0.07,
      });
      const cube = new THREE.Mesh(geo, mat);
      cube.position.set(x, y, z);
      cube.castShadow = cube.receiveShadow = true;
      cube.userData = { st: t0 + idx * 0.016, sy: y, rm: true };
      cube.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({
            color: new THREE.Color(hex).multiplyScalar(0.48),
            transparent: true,
            opacity: 0.42,
          }),
        ),
      );
      scene.add(cube);
      st.cubes.push(cube);
    });

    // ── Labels ──
    if (showLabels && isSplit) {
      Object.values(groups).forEach((g) => {
        const hex = groupColor(g.rg, g.cg, numCG, mainColor);
        const spr = makeSprite(g.label, hex);
        spr.position.set(g.cx, g.y0 + 2.0, g.cz);
        spr.userData.rm = true;
        scene.add(spr);
      });
    }

    // ── Camera fit ──
    const maxSpan = Math.max(bbox.dx, bbox.dz, bbox.dy * 1.5);
    const fovR = (camera.fov * Math.PI) / 180;
    st.orbitR = (maxSpan / 2 / Math.tan(fovR / 2)) * 1.7;
    st.target = new THREE.Vector3(centroid.x, centroid.y, centroid.z);
  }, [a, b, colDiv, rowDiv, showLabels, mainColor]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
    />
  );
}

// ─── Divisor picker ────────────────────────────────────────────────────────────
function DivisorPicker({ n, value, onChange, label, accentColor }) {
  const divs = getUsefulDivisors(n);
  return (
    <div style={S.dpWrap}>
      <div style={S.dpLabel}>
        {label} <span style={S.dpN}>({n})</span>
      </div>
      <div style={S.dpRow}>
        {divs.map((d) => {
          const groups = n / d;
          const active = d === value;
          const isNoSplit = d === n;
          return (
            <button
              key={d}
              onClick={() => onChange(d)}
              style={{
                ...S.dpBtn,
                borderColor: active ? accentColor : "#ffffff18",
                background: active ? accentColor + "22" : "transparent",
                color: active ? accentColor : "#777",
              }}
            >
              <span
                style={{ ...S.dpBtnMain, color: active ? accentColor : "#bbb" }}
              >
                {isNoSplit ? `${n}` : `${d}`}
              </span>
              <span style={S.dpBtnSub}>
                {isNoSplit
                  ? "sin dividir"
                  : `${groups} grupo${groups > 1 ? "s" : ""}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Group summary bar ─────────────────────────────────────────────────────────
function GroupSummary({ a, b, colDiv, rowDiv, mainColor }) {
  const numCG = a / colDiv;
  const numRG = b / rowDiv;
  const total = a * b;
  const perGroup = colDiv * rowDiv;
  const numGroups = numCG * numRG;
  const isSplit = colDiv < a || rowDiv < b;

  if (!isSplit)
    return (
      <div style={S.summarySimple}>
        <span style={{ color: mainColor, fontWeight: 800, fontSize: 13 }}>
          {a} × {b}
        </span>
        <span style={S.summarySimpleEq}> = </span>
        <span style={{ color: mainColor, fontWeight: 900, fontSize: 20 }}>
          {total}
        </span>
        <span style={S.summarySimpleSub}> cubos en total</span>
      </div>
    );

  return (
    <div style={S.summaryGrid}>
      <div style={S.summaryEquation}>
        <span style={S.seChunk}>
          <span style={{ color: "#aaa" }}>{numGroups} grupos</span>
          <span style={S.seOp}>×</span>
          <span style={{ color: mainColor }}>{perGroup} cubos</span>
        </span>
        <span style={S.seOp}>=</span>
        <span style={{ color: mainColor, fontWeight: 900, fontSize: 22 }}>
          {total}
        </span>
      </div>
      <div style={S.summaryBreakdown}>
        {Array.from({ length: numRG }).map((_, rg) =>
          Array.from({ length: numCG }).map((_, cg) => {
            const hex = groupColor(rg, cg, numCG, mainColor);
            const gid = rg * numCG + cg;
            return (
              <div
                key={gid}
                style={{
                  ...S.sumChip,
                  borderColor: hex + "55",
                  background: hex + "14",
                }}
              >
                <div style={{ ...S.sumChipDot, background: hex }} />
                <span style={S.sumChipLabel}>
                  {colDiv}×{rowDiv}={perGroup}
                </span>
              </div>
            );
          }),
        )}
      </div>
      <div style={S.summarySumLine}>
        {Array.from({ length: numGroups }).map((_, i) => (
          <span key={i} style={{ color: ACCENTS[i % ACCENTS.length] }}>
            {perGroup}
            {i < numGroups - 1 ? (
              <span style={{ color: "#555" }}> + </span>
            ) : (
              ""
            )}
          </span>
        ))}
        <span style={{ color: "#555" }}> = </span>
        <span style={{ color: mainColor, fontWeight: 900 }}>{total}</span>
      </div>
    </div>
  );
}

// ─── Mini 2D grid ──────────────────────────────────────────────────────────────
function MiniGrid({ a, b, colDiv, rowDiv, mainColor }) {
  const numCG = a / colDiv;
  const numRG = b / rowDiv;
  const rows = Math.min(b, 15),
    cols = Math.min(a, 12);
  return (
    <div style={S.miniWrap}>
      {Array.from({ length: rows }).map((_, r) => {
        const rg = Math.floor(r / rowDiv);
        const lr = r % rowDiv;
        const isFloorGap = lr === 0 && r > 0;
        return (
          <div key={r}>
            {isFloorGap && rowDiv < b && <div style={S.miniFloorGap} />}
            <div
              style={{
                ...S.miniRow,
                marginTop: lr > 0 && lr % 2 === 0 ? 4 : 0,
              }}
            >
              {Array.from({ length: cols }).map((_, c) => {
                const cg = Math.floor(c / colDiv);
                const lc = c % colDiv;
                const hex = groupColor(rg, cg, numCG, mainColor);
                return (
                  <div
                    key={c}
                    style={{
                      ...S.mCube,
                      background: hex,
                      marginRight: lc === colDiv - 1 && c < cols - 1 ? 5 : 0,
                    }}
                  />
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
  const [mult, setMult] = useState({ a: 6, b: 8 });
  const [colDiv, setColDiv] = useState(6); // default = no col split
  const [rowDiv, setRowDiv] = useState(8); // default = no row split
  const [showLabels, setShowLabels] = useState(true);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  const { a, b } = mult;
  const color = TABLE_COLORS[a] || TABLE_COLORS[1];
  const correct = a * b;
  const acc = score.total > 0 ? Math.round((score.ok / score.total) * 100) : 0;

  // When a or b changes, reset splits to "no split"
  const applyNewMult = useCallback((newA, newB) => {
    setMult({ a: newA, b: newB });
    setColDiv(newA);
    setRowDiv(newB);
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
    const n = parseInt(answer, 10);
    const ok = n === correct;
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

  const numCG = a / colDiv;
  const numRG = b / rowDiv;
  const isSplit = colDiv < a || rowDiv < b;

  return (
    <div style={S.root}>
      <div style={S.bgDots} />

      {/* ── Header ─────────────────────────────────────────────────── */}
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

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div style={S.body}>
        {/* LEFT */}
        <div style={S.left}>
          {/* Canvas */}
          <div
            style={{
              ...S.canvas3d,
              boxShadow: `0 0 80px ${color.main}18, 0 20px 60px #00000088`,
            }}
          >
            <CubeScene
              key={`${a}-${b}-${colDiv}-${rowDiv}-${showLabels}-${color.main}`}
              a={a}
              b={b}
              colDiv={colDiv}
              rowDiv={rowDiv}
              showLabels={showLabels}
              mainColor={color.main}
            />
            <div style={{ ...S.tag, background: color.main + "ee" }}>
              Tabla del <b>{a}</b> · {color.name}
            </div>
            {isSplit && (
              <div style={S.splitBadge}>
                {numCG > 1 && <span>{numCG} col</span>}
                {numCG > 1 && numRG > 1 && (
                  <span style={{ color: "#555" }}>×</span>
                )}
                {numRG > 1 && <span>{numRG} pisos</span>}
                <span style={{ color: "#555", margin: "0 4px" }}>·</span>
                <span style={{ color: color.main }}>
                  {numCG * numRG} grupos
                </span>
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

          {/* Group summary */}
          <GroupSummary
            a={a}
            b={b}
            colDiv={colDiv}
            rowDiv={rowDiv}
            mainColor={color.main}
          />

          {/* ── Divisor controls ── */}
          <div style={S.divPanel}>
            <div style={S.divPanelTop}>
              <span style={S.divPanelTitle}>
                DIVISORES · AGRUPACIÓN SIMÉTRICA
              </span>
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
            </div>

            <DivisorPicker
              n={a}
              value={colDiv}
              onChange={setColDiv}
              label="Columnas agrupadas de a"
              accentColor={color.main}
            />
            <DivisorPicker
              n={b}
              value={rowDiv}
              onChange={setRowDiv}
              label="Filas agrupadas de a"
              accentColor={color.dark}
            />

            {/* Explainer */}
            {isSplit && (
              <div
                style={{
                  ...S.explainer,
                  borderColor: color.main + "33",
                  background: color.main + "09",
                }}
              >
                <b style={{ color: color.main }}>
                  {a} = {colDiv} × {numCG}
                  {rowDiv < b ? ` y ${b} = ${rowDiv} × ${numRG}` : ""}
                </b>
                {" · "}
                {numCG * numRG} grupos simétricos de{" "}
                <b style={{ color: color.main }}>
                  {colDiv}×{rowDiv} = {colDiv * rowDiv}
                </b>{" "}
                cubos cada uno.
                {numRG > 1 && (
                  <span style={{ color: "#FECA57" }}>
                    {" "}
                    Apilados en {numRG} piso{numRG > 1 ? "s" : ""}.
                  </span>
                )}
              </div>
            )}

            <button
              onClick={() => {
                setColDiv(a);
                setRowDiv(b);
              }}
              style={{
                ...S.resetBtn,
                borderColor: isSplit ? "#ffffff22" : "#ffffff10",
                color: isSplit ? "#888" : "#444",
              }}
              disabled={!isSplit}
            >
              ↺ Sin agrupación
            </button>
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

            {/* Divisor hint below question */}
            {isSplit && (
              <div style={S.qHint}>
                <span style={{ color: "#555" }}>
                  {numCG > 1
                    ? `${a} = ${Array.from({ length: numCG })
                        .map(() => colDiv)
                        .join("+")}`
                    : ""}
                  {numCG > 1 && numRG > 1 ? "  ·  " : ""}
                  {numRG > 1
                    ? `${b} = ${Array.from({ length: numRG })
                        .map(() => rowDiv)
                        .join("+")}`
                    : ""}
                </span>
              </div>
            )}

            <MiniGrid
              a={a}
              b={b}
              colDiv={colDiv}
              rowDiv={rowDiv}
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
                {feedback === "wrong" && "✗ Cuenta los grupos y suma"}
                {feedback === "revealed" &&
                  `Respuesta: ${correct} — suma los bloques`}
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
    height: 420,
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
  splitBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#00000088",
    border: "1px solid #ffffff20",
    borderRadius: 9,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700,
    color: "#ccc",
    backdropFilter: "blur(6px)",
  },
  revealBox: {
    position: "absolute",
    bottom: 16,
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
  summarySimple: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "#ffffff07",
    border: "1px solid #ffffff10",
    borderRadius: 12,
    padding: "9px 16px",
    fontSize: 13,
    color: "#888",
  },
  summarySimpleEq: { color: "#444" },
  summarySimpleSub: { color: "#555", fontSize: 12 },
  summaryGrid: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 14,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },
  summaryEquation: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 700,
  },
  seChunk: { display: "flex", alignItems: "center", gap: 6 },
  seOp: { color: "#444", fontWeight: 300, fontSize: 16 },
  summaryBreakdown: { display: "flex", flexWrap: "wrap", gap: 5 },
  sumChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid",
    borderRadius: 9,
    padding: "4px 9px",
  },
  sumChipDot: { width: 9, height: 9, borderRadius: 2, flexShrink: 0 },
  sumChipLabel: { fontSize: 12, fontWeight: 700, color: "#ccc" },
  summarySumLine: { fontSize: 13, fontWeight: 700, color: "#888" },
  divPanel: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 16,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  divPanelTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  divPanelTitle: {
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
  dpWrap: { display: "flex", flexDirection: "column", gap: 6 },
  dpLabel: { fontSize: 11, color: "#666", fontWeight: 700 },
  dpN: { color: "#444" },
  dpRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  dpBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 10,
    border: "1.5px solid",
    cursor: "pointer",
    transition: "all 0.15s",
    minWidth: 52,
  },
  dpBtnMain: { fontSize: 16, fontWeight: 900, lineHeight: 1 },
  dpBtnSub: { fontSize: 10, color: "#555", marginTop: 1, whiteSpace: "nowrap" },
  explainer: {
    fontSize: 12,
    lineHeight: 1.7,
    color: "#999",
    border: "1px solid",
    borderRadius: 10,
    padding: "9px 12px",
  },
  resetBtn: {
    padding: "7px 14px",
    borderRadius: 10,
    border: "1.5px solid",
    background: "transparent",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    transition: "all 0.15s",
    alignSelf: "flex-start",
  },
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
  qHint: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
    background: "#ffffff06",
    borderRadius: 8,
    padding: "5px 8px",
  },
  miniWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    alignItems: "center",
    maxHeight: 110,
    overflow: "hidden",
  },
  miniRow: { display: "flex", gap: 2.5 },
  miniFloorGap: { height: 5, width: "100%" },
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
