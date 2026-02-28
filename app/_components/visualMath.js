"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

// ─── Color palette per table (1–12) ───────────────────────────────────────────
const TABLE_COLORS = {
  1: { main: "#FF6B6B", light: "#FF8E8E", name: "Rojo Coral" },
  2: { main: "#FF9F43", light: "#FFB86C", name: "Naranja Cálido" },
  3: { main: "#FECA57", light: "#FFD97D", name: "Amarillo Sol" },
  4: { main: "#48CA8B", light: "#6EDA9E", name: "Verde Menta" },
  5: { main: "#00D2D3", light: "#33DCDC", name: "Cian Turquesa" },
  6: { main: "#54A0FF", light: "#74B3FF", name: "Azul Cielo" },
  7: { main: "#5F27CD", light: "#7D4EE8", name: "Violeta Índigo" },
  8: { main: "#FF6EB4", light: "#FF8EC4", name: "Rosa Fucsia" },
  9: { main: "#2ECC71", light: "#52D68A", name: "Verde Esmeralda" },
  10: { main: "#E74C3C", light: "#EC7063", name: "Rojo Tomate" },
  11: { main: "#9B59B6", light: "#AF7AC5", name: "Púrpura Lavanda" },
  12: { main: "#F39C12", light: "#F7B731", name: "Naranja Dorado" },
};

function randomMult() {
  const a = Math.floor(Math.random() * 12) + 1;
  const b = Math.floor(Math.random() * 15) + 1;
  return { a, b };
}

// ─── Three.js Scene Component ──────────────────────────────────────────────────
function CubeScene({ multiplicand, multiplier, revealed }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cubesRef = useRef([]);
  const animFrameRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());

  const color = TABLE_COLORS[multiplicand] || TABLE_COLORS[1];

  const buildScene = useCallback(() => {
    const w = mountRef.current.clientWidth;
    const h = mountRef.current.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    cameraRef.current = camera;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(8, 12, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Ground plane (subtle)
    const planeGeo = new THREE.PlaneGeometry(60, 60);
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.3,
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.51;
    plane.receiveShadow = true;
    scene.add(plane);

    return { scene, camera, renderer };
  }, []);

  const spawnCubes = useCallback((scene, a, b, colorHex) => {
    cubesRef.current.forEach((c) => scene.remove(c));
    cubesRef.current = [];

    const GAP = 1.3;
    const totalW = (a - 1) * GAP;
    const totalH = (b - 1) * GAP;

    const mainColor = new THREE.Color(colorHex);
    const edgeColor = new THREE.Color(colorHex).multiplyScalar(0.6);

    for (let row = 0; row < b; row++) {
      for (let col = 0; col < a; col++) {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshStandardMaterial({
          color: mainColor,
          roughness: 0.35,
          metalness: 0.15,
          emissive: mainColor,
          emissiveIntensity: 0.08,
        });
        const cube = new THREE.Mesh(geo, mat);

        const x = col * GAP - totalW / 2;
        const z = row * GAP - totalH / 2;
        const targetY = 0;

        cube.position.set(x, targetY - 8, z); // start below
        cube.castShadow = true;
        cube.receiveShadow = true;

        // Store animation metadata
        cube.userData = {
          targetY,
          delay: (row * a + col) * 0.04,
          born: clockRef.current.getElapsedTime(),
          row,
          col,
          totalCubes: a * b,
          index: row * a + col,
        };

        scene.add(cube);
        cubesRef.current.push(cube);

        // Edge helper for definition
        const edges = new THREE.EdgesGeometry(geo);
        const lineMat = new THREE.LineBasicMaterial({
          color: edgeColor,
          transparent: true,
          opacity: 0.5,
        });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        cube.add(wireframe);
      }
    }
  }, []);

  // Compute ideal camera position
  const positionCamera = useCallback((camera, a, b) => {
    const GAP = 1.3;
    const maxDim = Math.max(a * GAP, b * GAP);
    const dist = maxDim * 1.8 + 5;
    camera.position.set(dist * 0.6, dist * 0.8, dist * 0.9);
    camera.lookAt(0, 0, 0);
  }, []);

  useEffect(() => {
    const { scene, camera, renderer } = buildScene();
    positionCamera(camera, multiplicand, multiplier);
    spawnCubes(scene, multiplicand, multiplier, color.main);

    let rotY = 0;
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsed = clockRef.current.getElapsedTime();

      // Animate cubes falling into place
      cubesRef.current.forEach((cube) => {
        const { targetY, delay, born } = cube.userData;
        const t = Math.max(0, elapsed - born - delay);
        const progress = Math.min(1, t / 0.6);
        // Ease out bounce
        const ease = progress < 1 ? 1 - Math.pow(1 - progress, 3) : 1;
        cube.position.y = THREE.MathUtils.lerp(targetY - 8, targetY, ease);
      });

      // Slow auto-rotation
      rotY += 0.003;
      const r = positionCamera.length; // just auto-orbit
      const R = Math.max(multiplicand, multiplier) * 1.3 * 1.8 + 5;
      camera.position.x = Math.sin(rotY) * R * 0.6;
      camera.position.z = Math.cos(rotY) * R * 0.9;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = mountRef.current?.clientWidth;
      const h = mountRef.current?.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (
        mountRef.current &&
        renderer.domElement.parentNode === mountRef.current
      ) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [multiplicand, multiplier]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
    />
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [mult, setMult] = useState({ a: 3, b: 4 });
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null); // null | "correct" | "wrong"
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const [shake, setShake] = useState(false);
  const [pulse, setPulse] = useState(false);
  const inputRef = useRef(null);

  const color = TABLE_COLORS[mult.a] || TABLE_COLORS[1];
  const correctAnswer = mult.a * mult.b;

  const newQuestion = useCallback(() => {
    const m = randomMult();
    setMult(m);
    setAnswer("");
    setFeedback(null);
    setRevealed(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const checkAnswer = useCallback(() => {
    const num = parseInt(answer, 10);
    const isCorrect = num === correctAnswer;
    setScore((s) => ({
      correct: s.correct + (isCorrect ? 1 : 0),
      total: s.total + 1,
    }));

    if (isCorrect) {
      setFeedback("correct");
      setStreak((s) => s + 1);
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
      setTimeout(() => newQuestion(), 1200);
    } else {
      setFeedback("wrong");
      setStreak(0);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }, [answer, correctAnswer, newQuestion]);

  const handleKey = (e) => {
    if (e.key === "Enter") checkAnswer();
  };

  const reveal = () => {
    setRevealed(true);
    setFeedback("revealed");
    setStreak(0);
    setScore((s) => ({ ...s, total: s.total + 1 }));
    setTimeout(() => newQuestion(), 2500);
  };

  const accuracy =
    score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

  return (
    <div style={styles.root}>
      {/* ── Background decoration ─────────────────────────────── */}
      <div style={styles.bgDots} />

      {/* ── Header ────────────────────────────────────────────── */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={{ ...styles.logoDot, background: "#FF6B6B" }} />
          <span style={{ ...styles.logoDot, background: "#FECA57" }} />
          <span style={{ ...styles.logoDot, background: "#48CA8B" }} />
          <span style={styles.logoText}>MathCubes</span>
        </div>
        <div style={styles.stats}>
          <div style={styles.statPill}>
            <span style={styles.statLabel}>Correctas</span>
            <span style={{ ...styles.statValue, color: "#48CA8B" }}>
              {score.correct}
            </span>
          </div>
          <div style={styles.statPill}>
            <span style={styles.statLabel}>Total</span>
            <span style={styles.statValue}>{score.total}</span>
          </div>
          <div style={styles.statPill}>
            <span style={styles.statLabel}>Precisión</span>
            <span
              style={{
                ...styles.statValue,
                color:
                  accuracy >= 70
                    ? "#48CA8B"
                    : accuracy >= 40
                      ? "#FECA57"
                      : "#FF6B6B",
              }}
            >
              {accuracy}%
            </span>
          </div>
          {streak >= 3 && <div style={styles.streakBadge}>🔥 {streak}</div>}
        </div>
      </header>

      {/* ── Main layout ───────────────────────────────────────── */}
      <main style={styles.main}>
        {/* Canvas */}
        <div style={styles.canvasWrap}>
          <div
            style={{
              ...styles.canvasInner,
              boxShadow: `0 0 60px ${color.main}33, 0 20px 60px #00000080`,
            }}
          >
            <CubeScene
              multiplicand={mult.a}
              multiplier={mult.b}
              revealed={revealed}
            />

            {/* Color legend overlay */}
            <div
              style={{
                ...styles.colorTag,
                background: color.main + "DD",
              }}
            >
              Tabla del <strong>{mult.a}</strong> · {color.name}
            </div>

            {/* Result overlay when revealed */}
            {revealed && (
              <div style={styles.revealOverlay}>
                <span style={styles.revealNum}>{correctAnswer}</span>
                <span style={styles.revealLabel}>cubos en total</span>
              </div>
            )}
          </div>

          {/* Cube count legend */}
          <div style={styles.legend}>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: color.main }} />
              <span>
                {mult.b} {mult.b === 1 ? "fila" : "filas"} × {mult.a} cubos
              </span>
            </div>
            <span style={styles.legendEq}>
              = <strong>{correctAnswer}</strong> cubos
            </span>
          </div>
        </div>

        {/* Controls */}
        <div style={styles.controls}>
          {/* Question card */}
          <div
            style={{
              ...styles.questionCard,
              borderColor: color.main + "66",
              ...(pulse ? styles.pulse : {}),
            }}
          >
            <div style={styles.questionTop}>
              <span style={styles.questionLabel}>¿Cuánto es?</span>
              {streak >= 2 && (
                <span style={styles.streakMini}>🔥×{streak}</span>
              )}
            </div>
            <div style={styles.questionDisplay}>
              <span style={{ ...styles.qNum, color: color.main }}>
                {mult.a}
              </span>
              <span style={styles.qOp}>×</span>
              <span style={{ ...styles.qNum, color: color.light }}>
                {mult.b}
              </span>
              <span style={styles.qOp}>=</span>
              <span style={styles.qAnswer}>?</span>
            </div>

            {/* Visual rows hint */}
            <div style={styles.rowsHint}>
              {Array.from({ length: Math.min(mult.b, 15) }).map((_, ri) => (
                <div key={ri} style={styles.rowHint}>
                  {Array.from({ length: Math.min(mult.a, 12) }).map((_, ci) => (
                    <div
                      key={ci}
                      style={{
                        ...styles.miniCube,
                        background: color.main,
                        boxShadow: `0 1px 4px ${color.main}88`,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Answer input */}
          <div style={styles.inputWrap}>
            <input
              ref={inputRef}
              type="number"
              min={0}
              max={200}
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                setFeedback(null);
              }}
              onKeyDown={handleKey}
              placeholder="Tu respuesta…"
              style={{
                ...styles.input,
                ...(shake ? styles.shake : {}),
                borderColor:
                  feedback === "correct"
                    ? "#48CA8B"
                    : feedback === "wrong"
                      ? "#FF6B6B"
                      : color.main + "88",
                outline: `0px solid ${color.main}`,
                boxShadow: `0 0 0 ${feedback === null ? "0" : "3"}px ${
                  feedback === "correct"
                    ? "#48CA8B66"
                    : feedback === "wrong"
                      ? "#FF6B6B66"
                      : "transparent"
                }`,
              }}
            />

            {/* Feedback banner */}
            {feedback && (
              <div
                style={{
                  ...styles.feedbackBanner,
                  background:
                    feedback === "correct"
                      ? "#48CA8B22"
                      : feedback === "revealed"
                        ? "#FECA5722"
                        : "#FF6B6B22",
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
                {feedback === "correct" && "✓ ¡Correcto! Muy bien 🎉"}
                {feedback === "wrong" &&
                  `✗ Intenta de nuevo — cuenta los cubos`}
                {feedback === "revealed" &&
                  `La respuesta es ${correctAnswer} — ¡cuenta los cubos!`}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div style={styles.btnRow}>
            <button
              onClick={checkAnswer}
              disabled={answer === ""}
              style={{
                ...styles.btnPrimary,
                background: answer !== "" ? color.main : "#333",
                cursor: answer !== "" ? "pointer" : "not-allowed",
                boxShadow:
                  answer !== "" ? `0 4px 20px ${color.main}66` : "none",
              }}
            >
              Verificar
            </button>
            <button onClick={reveal} style={styles.btnSecondary}>
              Ver respuesta
            </button>
            <button onClick={newQuestion} style={styles.btnGhost}>
              Nueva ↺
            </button>
          </div>

          {/* Manual multiplier controls */}
          <div style={styles.manualSection}>
            <div style={styles.manualLabel}>O elige tú mismo:</div>
            <div style={styles.manualRow}>
              <div style={styles.manualGroup}>
                <label style={styles.sliderLabel}>
                  Tabla: <strong style={{ color: color.main }}>{mult.a}</strong>
                </label>
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={mult.a}
                  onChange={(e) => {
                    setMult((m) => ({ ...m, a: parseInt(e.target.value) }));
                    setAnswer("");
                    setFeedback(null);
                    setRevealed(false);
                  }}
                  style={{ ...styles.slider, accentColor: color.main }}
                />
              </div>
              <div style={styles.manualGroup}>
                <label style={styles.sliderLabel}>
                  Por: <strong style={{ color: color.light }}>{mult.b}</strong>
                </label>
                <input
                  type="range"
                  min={1}
                  max={15}
                  value={mult.b}
                  onChange={(e) => {
                    setMult((m) => ({ ...m, b: parseInt(e.target.value) }));
                    setAnswer("");
                    setFeedback(null);
                    setRevealed(false);
                  }}
                  style={{ ...styles.slider, accentColor: color.light }}
                />
              </div>
            </div>
          </div>

          {/* Color table reference */}
          <div style={styles.colorRef}>
            <div style={styles.colorRefTitle}>Tablas disponibles</div>
            <div style={styles.colorRefGrid}>
              {Object.entries(TABLE_COLORS).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => {
                    const newA = parseInt(k);
                    setMult((m) => ({ ...m, a: newA }));
                    setAnswer("");
                    setFeedback(null);
                    setRevealed(false);
                  }}
                  style={{
                    ...styles.colorChip,
                    background: v.main,
                    outline:
                      mult.a === parseInt(k) ? `2px solid white` : "none",
                    transform:
                      mult.a === parseInt(k) ? "scale(1.2)" : "scale(1)",
                  }}
                  title={`Tabla del ${k} · ${v.name}`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: "100vh",
    background: "#0d0d1a",
    fontFamily: "'Nunito', 'Quicksand', sans-serif",
    color: "#e8e8f0",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
  },
  bgDots: {
    position: "fixed",
    inset: 0,
    backgroundImage: "radial-gradient(circle, #ffffff08 1px, transparent 1px)",
    backgroundSize: "32px 32px",
    pointerEvents: "none",
    zIndex: 0,
  },
  header: {
    position: "relative",
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 28px",
    borderBottom: "1px solid #ffffff12",
    backdropFilter: "blur(8px)",
    background: "#0d0d1add",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    display: "inline-block",
  },
  logoText: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.5px",
    color: "#fff",
    marginLeft: 4,
    fontFamily: "'Nunito', sans-serif",
  },
  stats: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  statPill: {
    background: "#ffffff0f",
    border: "1px solid #ffffff18",
    borderRadius: 20,
    padding: "4px 14px",
    display: "flex",
    gap: 6,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 11,
    color: "#88889a",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  statValue: {
    fontSize: 16,
    fontWeight: 800,
    color: "#fff",
  },
  streakBadge: {
    background: "linear-gradient(135deg, #FF6B6B, #FF9F43)",
    borderRadius: 20,
    padding: "4px 14px",
    fontSize: 14,
    fontWeight: 800,
    color: "#fff",
    animation: "pulse 0.6s ease",
  },
  main: {
    position: "relative",
    zIndex: 5,
    flex: 1,
    display: "flex",
    gap: 24,
    padding: "24px 28px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  canvasWrap: {
    flex: "1 1 400px",
    minHeight: 420,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  canvasInner: {
    flex: 1,
    minHeight: 400,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
    border: "1px solid #ffffff15",
    background: "#111127",
  },
  colorTag: {
    position: "absolute",
    top: 14,
    left: 14,
    borderRadius: 10,
    padding: "5px 12px",
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    backdropFilter: "blur(6px)",
    letterSpacing: "0.2px",
  },
  revealOverlay: {
    position: "absolute",
    bottom: 20,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#000000cc",
    borderRadius: 16,
    padding: "10px 28px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    backdropFilter: "blur(10px)",
    border: "1px solid #ffffff20",
  },
  revealNum: {
    fontSize: 48,
    fontWeight: 900,
    color: "#FECA57",
    lineHeight: 1,
  },
  revealLabel: {
    fontSize: 13,
    color: "#aaa",
  },
  legend: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#ffffff08",
    border: "1px solid #ffffff10",
    borderRadius: 12,
    padding: "8px 16px",
    fontSize: 14,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#aaa",
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendEq: {
    color: "#ccc",
    fontSize: 15,
  },
  controls: {
    flex: "0 0 340px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  questionCard: {
    background: "#161629",
    border: "1.5px solid",
    borderRadius: 20,
    padding: "20px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    transition: "all 0.3s ease",
  },
  questionTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  questionLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "1px",
    color: "#666",
    fontWeight: 700,
  },
  streakMini: {
    fontSize: 13,
    fontWeight: 800,
    color: "#FF9F43",
  },
  questionDisplay: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: "8px 0",
  },
  qNum: {
    fontSize: 56,
    fontWeight: 900,
    lineHeight: 1,
    fontFamily: "'Nunito', sans-serif",
  },
  qOp: {
    fontSize: 40,
    fontWeight: 300,
    color: "#555",
  },
  qAnswer: {
    fontSize: 56,
    fontWeight: 900,
    color: "#333",
    lineHeight: 1,
  },
  rowsHint: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    alignItems: "center",
    maxHeight: 90,
    overflow: "hidden",
  },
  rowHint: {
    display: "flex",
    gap: 3,
  },
  miniCube: {
    width: 10,
    height: 10,
    borderRadius: 2,
    transition: "all 0.2s",
  },
  inputWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  input: {
    background: "#1c1c30",
    border: "2px solid",
    borderRadius: 14,
    padding: "14px 18px",
    fontSize: 28,
    fontWeight: 800,
    color: "#fff",
    textAlign: "center",
    fontFamily: "'Nunito', sans-serif",
    transition: "all 0.2s ease",
    width: "100%",
    boxSizing: "border-box",
    MozAppearance: "textfield",
  },
  feedbackBanner: {
    borderRadius: 10,
    border: "1.5px solid",
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    textAlign: "center",
    transition: "all 0.3s ease",
  },
  btnRow: {
    display: "flex",
    gap: 8,
  },
  btnPrimary: {
    flex: 2,
    padding: "14px 0",
    borderRadius: 14,
    border: "none",
    fontSize: 16,
    fontWeight: 800,
    color: "#fff",
    transition: "all 0.2s ease",
    fontFamily: "'Nunito', sans-serif",
    letterSpacing: "0.3px",
  },
  btnSecondary: {
    flex: 1,
    padding: "14px 0",
    borderRadius: 14,
    border: "1.5px solid #ffffff20",
    background: "transparent",
    fontSize: 13,
    fontWeight: 700,
    color: "#aaa",
    cursor: "pointer",
    fontFamily: "'Nunito', sans-serif",
    transition: "all 0.2s",
  },
  btnGhost: {
    flex: 1,
    padding: "14px 0",
    borderRadius: 14,
    border: "1.5px solid #ffffff14",
    background: "transparent",
    fontSize: 13,
    fontWeight: 700,
    color: "#777",
    cursor: "pointer",
    fontFamily: "'Nunito', sans-serif",
    transition: "all 0.2s",
  },
  manualSection: {
    background: "#161629",
    borderRadius: 16,
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    border: "1px solid #ffffff0f",
  },
  manualLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "#555",
    fontWeight: 700,
  },
  manualRow: {
    display: "flex",
    gap: 16,
  },
  manualGroup: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  sliderLabel: {
    fontSize: 13,
    color: "#888",
    fontWeight: 600,
  },
  slider: {
    width: "100%",
    appearance: "auto",
    height: 4,
    cursor: "pointer",
  },
  colorRef: {
    background: "#161629",
    borderRadius: 16,
    padding: "14px 18px",
    border: "1px solid #ffffff0f",
  },
  colorRefTitle: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "#555",
    fontWeight: 700,
    marginBottom: 10,
  },
  colorRefGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  colorChip: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
    color: "#fff",
    transition: "all 0.15s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px #00000040",
  },
  // Animations (applied conditionally)
  pulse: {
    animation: "pulse 0.6s ease",
    transform: "scale(1.02)",
  },
  shake: {
    animation: "shake 0.4s ease",
  },
};
