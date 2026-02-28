"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

const TABLE_COLORS = {
  1: { main: "#FF6B6B", alt: "#FF3E3E", name: "Rojo" },
  2: { main: "#FF9F43", alt: "#E67E22", name: "Naranja" },
  3: { main: "#FECA57", alt: "#F1C40F", name: "Amarillo" },
  4: { main: "#48CA8B", alt: "#27AE60", name: "Verde" },
  5: { main: "#00D2D3", alt: "#00A8A8", name: "Cian" },
  6: { main: "#54A0FF", alt: "#2980B9", name: "Azul" },
  7: { main: "#5F27CD", alt: "#8E44AD", name: "Violeta" },
  8: { main: "#FF6EB4", alt: "#E91E8C", name: "Rosa" },
  9: { main: "#2ECC71", alt: "#1A9E4E", name: "Esmeralda" },
  10: { main: "#E74C3C", alt: "#C0392B", name: "Carmín" },
  11: { main: "#9B59B6", alt: "#7D3C98", name: "Púrpura" },
  12: { main: "#F39C12", alt: "#D68910", name: "Dorado" },
};

// Accent colors for groups 0,1,2,3
const GRP = [
  { hex: null },
  { hex: "#FFD166" },
  { hex: "#06D6A0" },
  { hex: "#EF476F" },
];

const GAP = 1.4;
const GROW = 0.2;
const GGAP = 1.55;

// ─── Build cube layout ─────────────────────────────────────────────────────────
function buildLayout(a, b, mode) {
  const raw = [];

  if (mode === "none") {
    for (let r = 0; r < b; r++)
      for (let c = 0; c < a; c++)
        raw.push({
          c,
          r,
          x: c * GAP + (c % 2 === 0 ? GROW : 0),
          z: r * GAP + (r % (b / 2) === 0 ? GROW : 0),
          g: 0,
        });
  } else if (mode === "col5") {
    for (let r = 0; r < b; r++) {
      let xOff = 0;
      for (let c = 0; c < a; c++) {
        if (c > 0 && c % 5 === 0) xOff += GGAP;
        raw.push({ c, r, x: xOff + c * GAP, z: r * GAP, g: Math.floor(c / 5) });
      }
    }
  } else if (mode === "row5") {
    for (let r = 0; r < b; r++) {
      const g = Math.floor(r / 5);
      const z = r * GAP + g * GGAP;
      for (let c = 0; c < a; c++) raw.push({ c, r, x: c * GAP, z, g });
    }
  } else if (mode === "smart") {
    let axis = "col",
      split = 5;
    if (a > 5) {
      axis = "col";
      split = 5;
    } else if (b > 5) {
      axis = "row";
      split = 5;
    } else if (a >= b) {
      axis = "col";
      split = Math.floor(a / 2) || 1;
    } else {
      axis = "row";
      split = Math.floor(b / 2) || 1;
    }

    if (axis === "col") {
      for (let r = 0; r < b; r++) {
        let xOff = 0;
        for (let c = 0; c < a; c++) {
          if (c === split) xOff += GGAP;
          raw.push({
            c,
            r,
            x: xOff + c * GAP,
            z: r * GAP,
            g: c < split ? 0 : 1,
          });
        }
      }
    } else {
      for (let r = 0; r < b; r++) {
        const z = r * GAP + (r >= split ? GGAP : 0);
        for (let c = 0; c < a; c++)
          raw.push({ c, r, x: c * GAP, z, g: r < split ? 0 : 1 });
      }
    }
  }

  // Center
  const xs = raw.map((p) => p.x),
    zs = raw.map((p) => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  raw.forEach((p) => {
    p.x -= cx;
    p.z -= cz;
  });

  // Group meta: bounds, centroid, label
  const acc = {};
  raw.forEach(({ x, z, g }) => {
    if (!acc[g]) acc[g] = { xs: [], zs: [], n: 0 };
    acc[g].xs.push(x);
    acc[g].zs.push(z);
    acc[g].n++;
  });
  const meta = {};
  Object.entries(acc).forEach(([gid, { xs: gx, zs: gz, n }]) => {
    const id = parseInt(gid);
    const x0 = Math.min(...gx),
      x1 = Math.max(...gx);
    const z0 = Math.min(...gz),
      z1 = Math.max(...gz);
    meta[id] = {
      n,
      cx: (x0 + x1) / 2,
      cz: (z0 + z1) / 2,
      x0: x0 - 0.66,
      x1: x1 + 0.66,
      z0: z0 - 0.66,
      z1: z1 + 0.66,
    };
  });

  // Labels
  const getSplit = () => {
    if (a > 5) return { axis: "col", s: 5 };
    if (b > 5) return { axis: "row", s: 5 };
    if (a >= b) return { axis: "col", s: Math.floor(a / 2) || 1 };
    return { axis: "row", s: Math.floor(b / 2) || 1 };
  };
  if (mode === "none") {
    meta[0].label = `${a} × ${b} = ${a * b}`;
  } else if (mode === "col5") {
    Object.keys(meta).forEach((gid) => {
      const g = parseInt(gid),
        cnt = Math.min(5, a - g * 5);
      meta[g].label = `${b}×${cnt} = ${b * cnt}`;
    });
  } else if (mode === "row5") {
    Object.keys(meta).forEach((gid) => {
      const g = parseInt(gid),
        cnt = Math.min(5, b - g * 5);
      meta[g].label = `${a}×${cnt} = ${a * cnt}`;
    });
  } else if (mode === "smart") {
    const { axis, s } = getSplit();
    if (axis === "col") {
      if (meta[0]) meta[0].label = `${b}×${s} = ${b * s}`;
      if (meta[1]) meta[1].label = `${b}×${a - s} = ${b * (a - s)}`;
    } else {
      if (meta[0]) meta[0].label = `${a}×${s} = ${a * s}`;
      if (meta[1]) meta[1].label = `${a}×${b - s} = ${a * (b - s)}`;
    }
  }

  return { cubes: raw, meta };
}

// ─── Canvas label sprite ───────────────────────────────────────────────────────
function makeSprite(text, bg) {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 128;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = bg + "cc";
  ctx.beginPath();
  ctx.roundRect(6, 6, cv.width - 12, cv.height - 12, 28);
  ctx.fill();
  ctx.strokeStyle = "#ffffff44";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 58px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#00000066";
  ctx.shadowBlur = 10;
  ctx.fillText(text, cv.width / 2, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(4.5, 1.1, 1);
  return spr;
}

// ─── 3D Scene ──────────────────────────────────────────────────────────────────
function CubeScene({ a, b, mode, showLabels, mainColor, altColor }) {
  const mountRef = useRef(null);
  const sr = useRef({
    renderer: null,
    scene: null,
    camera: null,
    raf: null,
    rotY: 0,
    orbitR: 14,
    cubes: [],
  });
  const clock = useRef(new THREE.Clock());

  // Initial THREE setup (runs once)
  useEffect(() => {
    const el = mountRef.current;
    const W = el.clientWidth,
      H = el.clientHeight;
    const state = sr.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    state.renderer = renderer;

    const scene = new THREE.Scene();
    state.scene = scene;

    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 400);
    state.camera = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(12, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048;
    ["left", "right", "top", "bottom"].forEach(
      (k, i) => (sun.shadow.camera[k] = [-35, 35, 35, -35][i]),
    );
    sun.shadow.camera.far = 120;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaaccff, 0.35);
    fill.position.set(-8, 6, -8);
    scene.add(fill);

    const gnd = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0c0c1e, roughness: 1 }),
    );
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -0.58;
    gnd.receiveShadow = true;
    scene.add(gnd);
    camera.position.set(0, 13, 13);

    const animate = () => {
      state.raf = requestAnimationFrame(animate);
      const t = clock.current.getElapsedTime();
      state.cubes.forEach((cube) => {
        const { st } = cube.userData;
        const dt = Math.max(0, t - st);
        const p = Math.min(1, dt / 0.55);
        const e =
          p < 1 ? 1 - Math.pow(1 - p, 3) + Math.sin(p * Math.PI) * 0.07 : 1;
        cube.position.y = THREE.MathUtils.lerp(-12, 0, Math.min(e, 1));
      });
      state.rotY += 0.0038;
      const R = state.orbitR;
      //   camera.position.set(
      //     Math.sin(state.rotY) * R * 0.65,
      //     R * 0.62,
      //     Math.cos(state.rotY) * R * 0.88,
      //   );
      camera.lookAt(0, 0, 0);
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
      cancelAnimationFrame(state.raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // Rebuild scene content on param change
  useEffect(() => {
    const state = sr.current;
    if (!state.scene) return;
    const { scene, camera } = state;

    // Remove all removable objects
    const toRemove = scene.children.filter((o) => o.userData.rm);
    toRemove.forEach((o) => scene.remove(o));
    state.cubes = [];

    const { cubes, meta } = buildLayout(a, b, mode);
    const t0 = clock.current.getElapsedTime();

    // Group floor mats
    if (mode !== "none") {
      Object.entries(meta).forEach(([gid, m]) => {
        const g = parseInt(gid);
        const col =
          g === 0
            ? parseInt(mainColor.replace("#", ""), 16)
            : parseInt(
                (GRP[g % GRP.length].hex || mainColor).replace("#", ""),
                16,
              );
        const pw = m.x1 - m.x0,
          pd = m.z1 - m.z0;
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          transparent: true,
          opacity: 0.07,
          roughness: 1,
          side: THREE.DoubleSide,
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), mat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(m.cx, -0.508, m.cz);
        plane.receiveShadow = true;
        plane.userData.rm = true;
        scene.add(plane);
        // Border
        const bm = new THREE.LineBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.35,
        });
        const border = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(pw, 0.01, pd)),
          bm,
        );
        border.position.set(m.cx, -0.5, m.cz);
        border.userData.rm = true;
        scene.add(border);
      });
    }

    // Cubes
    cubes.forEach(({ x, z, g }, idx) => {
      const gHex = g === 0 ? mainColor : GRP[g % GRP.length].hex || mainColor;
      const col = new THREE.Color(gHex);
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.28,
        metalness: 0.18,
        emissive: col,
        emissiveIntensity: 0.07,
      });
      const cube = new THREE.Mesh(geo, mat);
      cube.position.set(x, -12, z);
      cube.castShadow = cube.receiveShadow = true;
      cube.userData = { st: t0 + idx * 0.022, rm: true };
      cube.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({
            color: new THREE.Color(gHex).multiplyScalar(0.5),
            transparent: true,
            opacity: 0.45,
          }),
        ),
      );
      scene.add(cube);
      state.cubes.push(cube);
    });

    // Label sprites
    if (showLabels && mode !== "none") {
      Object.entries(meta).forEach(([gid, m]) => {
        const g = parseInt(gid);
        const bg = g === 0 ? mainColor : GRP[g % GRP.length].hex || mainColor;
        if (!m.label) return;
        const spr = makeSprite(m.label, bg);
        spr.position.set(m.cx, 2.4, m.cz);
        spr.userData.rm = true;
        scene.add(spr);
      });
    }

    // Fit camera
    const xs = cubes.map((c) => c.x),
      zs = cubes.map((c) => c.z);
    const spanX = Math.max(...xs) - Math.min(...xs) + 1;
    const spanZ = Math.max(...zs) - Math.min(...zs) + 1;
    const fovR = camera.fov * (Math.PI / 180);
    state.orbitR = (Math.max(spanX, spanZ) / 2 / Math.tan(fovR / 2)) * 1.6;
  }, [a, b, mode, showLabels, mainColor, altColor]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
    />
  );
}

// ─── Mode config ───────────────────────────────────────────────────────────────
const MODES = [
  {
    id: "none",
    icon: "⊞",
    label: "Sin agrupar",
    desc: "Vista libre de la multiplicación",
  },
  {
    id: "col5",
    icon: "✋",
    label: "De 5 en 5",
    desc: "Grupos de 5 en cada fila",
  },
  {
    id: "row5",
    icon: "☰",
    label: "Filas de 5",
    desc: "Cada 5 filas forman un bloque",
  },
  {
    id: "smart",
    icon: "÷",
    label: "Descomponer",
    desc: "Divide el factor en 5 + resto",
  },
];

function randomMult() {
  return {
    a: Math.floor(Math.random() * 12) + 1,
    b: Math.floor(Math.random() * 15) + 1,
  };
}

// ─── Group summary bar ─────────────────────────────────────────────────────────
function GroupSummary({ a, b, mode, mainColor }) {
  if (mode === "none") return null;
  const { meta } = buildLayout(a, b, mode);
  const groups = Object.entries(meta).sort(([i], [j]) => i - j);
  return (
    <div style={S.summary}>
      {groups.map(([gid, m]) => {
        const g = parseInt(gid);
        const hex = g === 0 ? mainColor : GRP[g % GRP.length].hex || mainColor;
        return (
          <div
            key={gid}
            style={{
              ...S.sumCard,
              borderColor: hex + "66",
              background: hex + "12",
            }}
          >
            <div style={{ ...S.sumDot, background: hex }} />
            <div style={S.sumBody}>
              <span style={S.sumLabel}>{m.label}</span>
              <span style={S.sumCubes}>{m.n} cubos</span>
            </div>
          </div>
        );
      })}
      <div style={S.sumTotal}>
        <span style={S.sumTotalLbl}>Total</span>
        <span style={{ ...S.sumTotalVal, color: mainColor }}>{a * b}</span>
      </div>
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [mult, setMult] = useState({ a: 7, b: 8 });
  const [mode, setMode] = useState("none");
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

  const newQ = useCallback(() => {
    const m = randomMult();
    setMult(m);
    setAnswer("");
    setFeedback(null);
    setRevealed(false);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

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

  return (
    <div style={S.root}>
      <div style={S.bgDots} />

      {/* Header */}
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
          ].map(([lbl, val, col]) => (
            <div key={lbl} style={S.statChip}>
              <span style={S.sLbl}>{lbl}</span>
              <span style={{ ...S.sVal, color: col }}>{val}</span>
            </div>
          ))}
          {streak >= 3 && <div style={S.fire}>🔥 {streak}</div>}
        </div>
      </header>

      {/* Body */}
      <div style={S.body}>
        {/* LEFT */}
        <div style={S.left}>
          {/* 3D canvas */}
          <div
            style={{
              ...S.canvas3d,
              boxShadow: `0 0 80px ${color.main}1a, 0 24px 64px #00000088`,
            }}
          >
            <CubeScene
              key={`${a}-${b}-${mode}-${showLabels}-${color.main}`}
              a={a}
              b={b}
              mode={mode}
              showLabels={showLabels}
              mainColor={color.main}
              altColor={color.alt}
            />
            <div style={{ ...S.tag, background: color.main + "dd" }}>
              Tabla del <b>{a}</b> · {color.name}
            </div>
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
          <GroupSummary a={a} b={b} mode={mode} mainColor={color.main} />

          {/* Mode selector */}
          <div style={S.modePanel}>
            <div style={S.mpTop}>
              <span style={S.mpTitle}>MODO DE AGRUPACIÓN</span>
              <button
                onClick={() => setShowLabels((v) => !v)}
                style={{
                  ...S.lblBtn,
                  borderColor: showLabels ? color.main + "88" : "#333",
                  color: showLabels ? color.main : "#555",
                }}
              >
                {showLabels ? "🏷 Ocultar sumas" : "🏷 Mostrar sumas"}
              </button>
            </div>
            <div style={S.modeGrid}>
              {MODES.map((m) => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    style={{
                      ...S.mBtn,
                      borderColor: active ? color.main : "#ffffff15",
                      background: active ? color.main + "1e" : "transparent",
                    }}
                  >
                    <span style={S.mIcon}>{m.icon}</span>
                    <div style={S.mText}>
                      <span
                        style={{
                          ...S.mLabel,
                          color: active ? color.main : "#aaa",
                        }}
                      >
                        {m.label}
                      </span>
                      <span style={S.mDesc}>{m.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mode explainer */}
            {mode !== "none" && (
              <div
                style={{
                  ...S.explainer,
                  borderColor: color.main + "33",
                  background: color.main + "0a",
                }}
              >
                {mode === "col5" && (
                  <>
                    <b style={{ color: color.main }}>De 5 en 5:</b> Cada grupo
                    muestra cuántas veces cabe el 5 en una fila. El sobrante
                    forma el último grupo. Suma los grupos para obtener el
                    total.
                  </>
                )}
                {mode === "row5" && (
                  <>
                    <b style={{ color: color.main }}>Filas de 5:</b> Agrupa las
                    filas de 5 en 5. Ideal cuando el multiplicador es grande —
                    reconoces bloques de 5×{a} = {5 * a}.
                  </>
                )}
                {mode === "smart" && (
                  <>
                    <b style={{ color: color.main }}>Descomposición:</b> El
                    factor más grande se divide en <b>5 + resto</b>. Calcula
                    cada parte por separado y súmalas. ¡Multiplica fácil!
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div style={S.right}>
          {/* Question card */}
          <div style={{ ...S.qCard, borderColor: color.main + "44" }}>
            <div style={S.qTop}>
              <span style={S.qLbl}>¿Cuánto es?</span>
              {streak >= 2 && (
                <span style={S.qStreak}>🔥 {streak} seguidas</span>
              )}
            </div>
            <div style={S.qDisplay}>
              <span style={{ ...S.qN, color: color.main }}>{a}</span>
              <span style={S.qOp}>×</span>
              <span style={{ ...S.qN, color: color.alt }}>{b}</span>
              <span style={S.qOp}>=</span>
              <span style={S.qSlot}>?</span>
            </div>

            {/* Mini grid with grouping colors */}
            <div style={S.miniWrap}>
              {Array.from({ length: b }).map((_, r) => (
                <div key={r} style={S.miniRow}>
                  {Array.from({ length: a }).map((_, c) => {
                    const g =
                      mode === "col5"
                        ? Math.floor(c / 5)
                        : mode === "row5"
                          ? Math.floor(r / 5)
                          : mode === "smart"
                            ? a > 5
                              ? c < 5
                                ? 0
                                : 1
                              : b > 5
                                ? r < 5
                                  ? 0
                                  : 1
                                : 0
                            : 0;
                    const hex =
                      g === 0
                        ? color.main
                        : GRP[g % GRP.length].hex || color.main;
                    return (
                      <div
                        key={c}
                        style={{
                          ...S.mCube,
                          background: hex,
                          boxShadow: `0 1px 5px ${hex}99`,
                          marginRight:
                            mode === "col5" && c < a - 1 && (c + 1) % 5 === 0
                              ? 5
                              : 0,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Input */}
          <div style={S.inputGroup}>
            <input
              ref={inputRef}
              type="number"
              min={0}
              max={999}
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
                {feedback === "correct" && "✓ ¡Correcto! Siguiente pregunta…"}
                {feedback === "wrong" &&
                  `✗ Mira los grupos — cuenta paso a paso`}
                {feedback === "revealed" &&
                  `La respuesta era ${correct} — ¡suma los grupos!`}
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
                background: answer !== "" ? color.main : "#1e1e30",
                cursor: answer !== "" ? "pointer" : "not-allowed",
                boxShadow:
                  answer !== "" ? `0 6px 24px ${color.main}44` : "none",
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
                { k: "b", label: "Veces", max: 15 },
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
                    min={1}
                    max={max}
                    value={mult[k]}
                    onChange={(e) => {
                      setMult((m) => ({ ...m, [k]: parseInt(e.target.value) }));
                      setAnswer("");
                      setFeedback(null);
                      setRevealed(false);
                    }}
                    style={{ ...S.slider, accentColor: color.main }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Color chips */}
          <div style={S.colorBox}>
            <span style={S.cTitle}>TABLA DEL COLOR</span>
            <div style={S.chips}>
              {Object.entries(TABLE_COLORS).map(([k, v]) => (
                <button
                  key={k}
                  title={`Tabla del ${k} · ${v.name}`}
                  onClick={() => {
                    setMult((m) => ({ ...m, a: parseInt(k) }));
                    setAnswer("");
                    setFeedback(null);
                    setRevealed(false);
                  }}
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
    padding: "13px 24px",
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
    gap: 20,
    padding: "18px 22px",
    flexWrap: "wrap",
  },
  left: {
    flex: "1 1 440px",
    display: "flex",
    flexDirection: "column",
    gap: 13,
  },
  canvas3d: {
    height: 400,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
    border: "1px solid #ffffff10",
    background: "#0e0e22",
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
  summary: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" },
  sumCard: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1.5px solid",
    borderRadius: 12,
    padding: "7px 13px",
  },
  sumDot: { width: 11, height: 11, borderRadius: 3, flexShrink: 0 },
  sumBody: { display: "flex", flexDirection: "column", gap: 1 },
  sumLabel: { fontSize: 13, fontWeight: 800, color: "#ddd" },
  sumCubes: { fontSize: 11, color: "#666" },
  sumTotal: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#ffffff08",
    borderRadius: 12,
    padding: "7px 14px",
    border: "1px solid #ffffff10",
  },
  sumTotalLbl: {
    fontSize: 11,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  },
  sumTotalVal: { fontSize: 24, fontWeight: 900 },
  modePanel: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 16,
    padding: "15px 17px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  mpTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mpTitle: {
    fontSize: 10,
    color: "#555",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  lblBtn: {
    fontSize: 12,
    fontWeight: 700,
    border: "1.5px solid",
    borderRadius: 10,
    padding: "5px 12px",
    background: "transparent",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  modeGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 },
  mBtn: {
    display: "flex",
    alignItems: "flex-start",
    gap: 9,
    padding: "10px 11px",
    borderRadius: 12,
    border: "1.5px solid",
    cursor: "pointer",
    transition: "all 0.18s",
    textAlign: "left",
  },
  mIcon: { fontSize: 19, lineHeight: 1, marginTop: 1, flexShrink: 0 },
  mText: { display: "flex", flexDirection: "column", gap: 2 },
  mLabel: { fontSize: 13, fontWeight: 800 },
  mDesc: { fontSize: 11, color: "#555", lineHeight: 1.3 },
  explainer: {
    fontSize: 12,
    lineHeight: 1.6,
    color: "#999",
    border: "1px solid",
    borderRadius: 10,
    padding: "10px 13px",
  },
  right: {
    flex: "0 0 310px",
    display: "flex",
    flexDirection: "column",
    gap: 13,
  },
  qCard: {
    background: "#131325",
    border: "1.5px solid",
    borderRadius: 18,
    padding: "17px 19px",
    display: "flex",
    flexDirection: "column",
    gap: 11,
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
  qSlot: { fontSize: 50, fontWeight: 900, color: "#1e1e38", lineHeight: 1 },
  miniWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 2.5,
    alignItems: "center",
    maxHeight: 96,
    overflow: "hidden",
  },
  miniRow: { display: "flex", gap: 2.5 },
  mCube: {
    width: 9,
    height: 9,
    borderRadius: 2,
    flexShrink: 0,
    transition: "background 0.25s",
  },
  inputGroup: { display: "flex", flexDirection: "column", gap: 8 },
  input: {
    background: "#181830",
    border: "2px solid",
    borderRadius: 13,
    padding: "12px 16px",
    fontSize: 30,
    fontWeight: 900,
    color: "#fff",
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "border-color 0.2s, box-shadow 0.2s",
    MozAppearance: "textfield",
  },
  shakeAnim: { animation: "shake 0.4s ease" },
  fb: {
    borderRadius: 10,
    border: "1.5px solid",
    padding: "8px 13px",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
  },
  btns: { display: "flex", gap: 7 },
  btnP: {
    flex: 2,
    padding: "12px 0",
    borderRadius: 13,
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
    borderRadius: 13,
    border: "1.5px solid #ffffff16",
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
    borderRadius: 13,
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
    borderRadius: 15,
    padding: "14px 17px",
    display: "flex",
    flexDirection: "column",
    gap: 11,
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
    borderRadius: 14,
    padding: "12px 15px",
    display: "flex",
    flexDirection: "column",
    gap: 9,
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
    transition: "all 0.15s ease",
    boxShadow: "0 2px 6px #00000050",
  },
};
