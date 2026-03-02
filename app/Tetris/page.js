"use client";
// =============================================================================
// MathCubes — Etapa 3: Tetris 3D
//
// 3D Tetris in a tall box. Pieces fall along Y. Player moves pieces in XZ,
// rotates on any axis. Three line-clear types:
//   · Layer    — full XZ plane at height y
//   · Diagonal — full XZ diagonal across the box at height y (square boxes)
//   · Column   — full vertical (x,z) column up to VERT_THRESH
//
// Sections:
//   §1  Configuration & scoring
//   §2  Piece library (USER PLACEHOLDER + fallbacks)
//   §3  Grid data model
//   §4  Piece physics (spawn, move, rotate, ghost)
//   §5  Line-clear engine  ← column gravity here
//   §6  Three.js scene
//   §7  Input handling hook
//   §8  Leaderboard (localStorage, zustand mathblox-leaderboard compatible)
//   §9  App root & game loop
//   §10 UI components
//   §11 Styles
// =============================================================================

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";

// =============================================================================
// §1 — CONFIGURATION & SCORING
// =============================================================================

export const BOX_PRESETS = {
  S: { W: 9, D: 9, H: 20, label: "9 × 9 × 20" },
  L: { W: 20, D: 20, H: 30, label: "20 × 20 × 30" },
};

const CUBE_SIZE = 0.92;
const MAX_PIECE_CELLS = 64;
const VERT_THRESH_RATIO = 0.45;
const GHOST_OPACITY = 0.59;
const DEFAULT_PLAYER = "JUGADOR";

const DROP_SPEEDS = [1900, 720, 570, 450, 350, 270, 200, 145, 100, 70];
const dropSpeed = (level) =>
  DROP_SPEEDS[Math.min(level - 1, DROP_SPEEDS.length - 1)];

const SCORE = {
  layer: (W, D) => W * D * 10,
  diagonal: (W) => W * 25,
  column: (h) => h * 8, // h = cells cleared per column
  harddrop: (dist) => dist,
};

const AXES = ["Y", "X", "Z"];

// =============================================================================
// §2 — PIECE LIBRARY
//
//   ╔══════════════════════════════════════════════════════════════════════╗
//   ║  INSERT YOUR PIECES HERE                                            ║
//   ║  Format: { id, name, color, cells: [[x,y,z], ...] }                ║
//   ║  y = vertical axis (0 = bottom of piece, grows upward)             ║
//   ╚══════════════════════════════════════════════════════════════════════╝
const USER_PIECES = [
  // { id: "my_I4", name: "Barra", color: "#E84040",
  //   cells: [[0,0,0],[1,0,0],[2,0,0],[3,0,0]] },
];

const FALLBACK_PIECES = [
  {
    id: "I2",
    color: "#E84040",
    name: "Dominó",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
    ],
  },
  {
    id: "I3",
    color: "#F0A500",
    name: "Trío",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ],
  },
  {
    id: "I4",
    color: "#22C55E",
    name: "Barra 4",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ],
  },
  {
    id: "L4",
    color: "#3B9EFF",
    name: "Ele",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [2, 0, 1],
    ],
  },
  {
    id: "J4",
    color: "#A855F7",
    name: "J",
    cells: [
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
      [0, 0, 0],
    ],
  },
  {
    id: "SQ",
    color: "#EC4899",
    name: "Cuadrado",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
    ],
  },
  {
    id: "T4",
    color: "#06B6D4",
    name: "T",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [1, 0, 1],
    ],
  },
  {
    id: "S4",
    color: "#EAB308",
    name: "S",
    cells: [
      [1, 0, 0],
      [2, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
    ],
  },
  {
    id: "Z4",
    color: "#FF6B6B",
    name: "Z",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [2, 0, 1],
    ],
  },
  {
    id: "TP",
    color: "#48CA8B",
    name: "Torre P",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
    ],
  },
  {
    id: "C8",
    color: "#F97316",
    name: "Cubo 2³",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
    ],
  },
  {
    id: "CR",
    color: "#8B5CF6",
    name: "Cruz",
    cells: [
      [1, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
      [1, 0, 2],
    ],
  },
  {
    id: "SK",
    color: "#0EA5E9",
    name: "Escalera",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [2, 0, 1],
      [2, 0, 2],
    ],
  },
  {
    id: "LT",
    color: "#D946EF",
    name: "Ele 3D",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
    ],
  },
];

const PIECE_POOL = USER_PIECES.length > 0 ? USER_PIECES : FALLBACK_PIECES;
function randomPiece() {
  return PIECE_POOL[Math.floor(Math.random() * PIECE_POOL.length)];
}

// =============================================================================
// §3 — GRID DATA MODEL
// Index: x + z * W + y * W * D
// =============================================================================

function gIdx(x, z, y, W, D) {
  return x + z * W + y * W * D;
}
function createGrid(W, D, H) {
  return {
    filled: new Uint8Array(W * D * H),
    colors: new Array(W * D * H).fill(null),
  };
}
function cloneGrid(g) {
  return { filled: g.filled.slice(), colors: [...g.colors] };
}

function cellOccupied(grid, x, z, y, W, D, H) {
  if (x < 0 || x >= W || z < 0 || z >= D || y < 0 || y >= H) return true;
  return grid.filled[gIdx(x, z, y, W, D)] === 1;
}
function canPlace(grid, cells, W, D, H) {
  return cells.every(([x, y, z]) => !cellOccupied(grid, x, z, y, W, D, H));
}
function stampCells(grid, cells, color, W, D) {
  cells.forEach(([x, y, z]) => {
    const i = gIdx(x, z, y, W, D);
    grid.filled[i] = 1;
    grid.colors[i] = color;
  });
}

// =============================================================================
// §4 — PIECE PHYSICS
// =============================================================================

function normalizeCells(cells) {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  const minZ = Math.min(...cells.map((c) => c[2]));
  return cells.map(([x, y, z]) => [x - minX, y - minY, z - minZ]);
}

function spawnPiece(W, D, H) {
  const template = randomPiece();
  const norm = normalizeCells(template.cells);
  const spanX = Math.max(...norm.map((c) => c[0]));
  const spanY = Math.max(...norm.map((c) => c[1]));
  const spanZ = Math.max(...norm.map((c) => c[2]));
  const ox = Math.floor((W - spanX - 1) / 2);
  const oz = Math.floor((D - spanZ - 1) / 2);
  const oy = H - spanY - 2;
  return {
    cells: norm.map(([x, y, z]) => [x + ox, y + oy, z + oz]),
    color: template.color,
    name: template.name,
    id: template.id,
  };
}

function rotateCells(cells, axis, dir) {
  const xs = cells.map((c) => c[0]),
    ys = cells.map((c) => c[1]),
    zs = cells.map((c) => c[2]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  return cells.map(([x, y, z]) => {
    const lx = x - cx,
      ly = y - cy,
      lz = z - cz;
    let rx, ry, rz;
    if (axis === "Y") {
      rx = dir > 0 ? lz : -lz;
      ry = ly;
      rz = dir > 0 ? -lx : lx;
    } else if (axis === "X") {
      rx = lx;
      ry = dir > 0 ? -lz : lz;
      rz = dir > 0 ? ly : -ly;
    } else {
      rx = dir > 0 ? -ly : ly;
      ry = dir > 0 ? lx : -lx;
      rz = lz;
    }
    return [Math.round(rx + cx), Math.round(ry + cy), Math.round(rz + cz)];
  });
}

function tryRotate(grid, cells, axis, dir, W, D, H) {
  const rotated = rotateCells(cells, axis, dir);
  const kicks = [
    [0, 0, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
    [2, 0, 0],
    [-2, 0, 0],
    [0, 0, 2],
    [0, 0, -2],
  ];
  for (const [kx, ky, kz] of kicks) {
    const kicked = rotated.map(([x, y, z]) => [x + kx, y + ky, z + kz]);
    if (canPlace(grid, kicked, W, D, H)) return kicked;
  }
  return null;
}

function computeGhost(grid, cells, W, D, H) {
  let drop = 0;
  while (
    canPlace(
      grid,
      cells.map(([x, y, z]) => [x, y - drop - 1, z]),
      W,
      D,
      H,
    )
  )
    drop++;
  return cells.map(([x, y, z]) => [x, y - drop, z]);
}

// =============================================================================
// §5 — LINE-CLEAR ENGINE
// =============================================================================

/**
 * Scan the grid for all completable lines and remove them.
 * Returns { newGrid, clears[], layerCount, columnCount, totalScore }.
 *
 * COLUMN GRAVITY — what happens when a column (x,z) is cleared:
 *   1. The segment y=0…VERT_THRESH is removed (the completed part).
 *   2. All cells that were above VERT_THRESH in that same column are
 *      collected as "survivors" (they are NOT part of the clear).
 *   3. The ENTIRE column is wiped to empty.
 *   4. Survivors are re-stamped compacted from y=0 upward, so they
 *      fall to the lowest available position — no floating cubes.
 *
 * Both layer clears and column clears increment the "lines" counter
 * and contribute to the score.
 */
function checkAndClear(grid, W, D, H) {
  const VERT_THRESH = Math.floor(H * VERT_THRESH_RATIO);
  let g = cloneGrid(grid);
  const clears = [];

  // ── Layer clears ──────────────────────────────────────────────────────────
  let y = 0;
  while (y < H) {
    let count = 0;
    for (let x = 0; x < W; x++)
      for (let z = 0; z < D; z++) if (g.filled[gIdx(x, z, y, W, D)]) count++;

    if (count === W * D) {
      clears.push({ type: "layer", y });
      // Shift everything above y down by 1
      for (let sy = y; sy < H - 1; sy++)
        for (let x = 0; x < W; x++)
          for (let z = 0; z < D; z++) {
            const from = gIdx(x, z, sy + 1, W, D);
            const to = gIdx(x, z, sy, W, D);
            g.filled[to] = g.filled[from];
            g.colors[to] = g.colors[from];
          }
      // Clear top row
      for (let x = 0; x < W; x++)
        for (let z = 0; z < D; z++) {
          const i = gIdx(x, z, H - 1, W, D);
          g.filled[i] = 0;
          g.colors[i] = null;
        }
      // Re-check same y after the shift
    } else {
      y++;
    }
  }

  // ── Column clears + gravity ───────────────────────────────────────────────
  //
  // A column (x,z) completes when every cell y=0…VERT_THRESH is occupied.
  // On clear:
  //   a) Collect survivors: filled cells above VERT_THRESH in this column.
  //   b) Wipe the whole column (0…H-1).
  //   c) Re-stamp survivors packed from y=0 upward (gravity drop).
  //
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      // Check completion of the lower segment
      let full = true;
      for (let cy = 0; cy <= VERT_THRESH; cy++) {
        if (!g.filled[gIdx(x, z, cy, W, D)]) {
          full = false;
          break;
        }
      }
      if (!full) continue;

      clears.push({ type: "column", x, z });

      // Collect cells above the threshold that will fall down
      const survivors = [];
      for (let cy = VERT_THRESH + 1; cy < H; cy++) {
        const i = gIdx(x, z, cy, W, D);
        if (g.filled[i]) survivors.push(g.colors[i]);
      }

      // Wipe entire column
      for (let cy = 0; cy < H; cy++) {
        const i = gIdx(x, z, cy, W, D);
        g.filled[i] = 0;
        g.colors[i] = null;
      }

      // Re-stamp survivors packed from y=0 (gravity)
      survivors.forEach((color, idx) => {
        const i = gIdx(x, z, idx, W, D);
        g.filled[i] = 1;
        g.colors[i] = color;
      });
    }
  }

  // ── Tallies ───────────────────────────────────────────────────────────────
  const layerCount = clears.filter((c) => c.type === "layer").length;
  // Each column clear counts as one "line"
  const columnCount = clears.filter((c) => c.type === "column").length;

  const totalScore = clears.reduce((acc, c) => {
    if (c.type === "layer") return acc + SCORE.layer(W, D);
    if (c.type.startsWith("diag")) return acc + SCORE.diagonal(W);
    if (c.type === "column") return acc + SCORE.column(VERT_THRESH + 1);
    return acc;
  }, 0);

  return { newGrid: g, clears, layerCount, columnCount, totalScore };
}

// =============================================================================
// §6 — THREE.JS SCENE
// =============================================================================

function worldPos(gx, gy, gz, W, D) {
  return [gx - (W - 1) / 2, gy, gz - (D - 1) / 2];
}

const TetrisScene = forwardRef(function TetrisScene({ preset }, ref) {
  const mountRef = useRef(null);
  const threeRef = useRef(null);
  const _mat = new THREE.Matrix4();
  const _color = new THREE.Color();

  function applyInstances(mesh, items) {
    items.forEach(({ wx, wy, wz, hex }, i) => {
      _mat.makeTranslation(wx, wy, wz);
      mesh.setMatrixAt(i, _mat);
      _color.set(hex);
      mesh.setColorAt(i, _color);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  useImperativeHandle(
    ref,
    () => ({
      updateGrid(grid, W, D, H) {
        const t = threeRef.current;
        if (!t) return;
        const items = [];
        for (let x = 0; x < W; x++)
          for (let z = 0; z < D; z++)
            for (let y = 0; y < H; y++) {
              const i = gIdx(x, z, y, W, D);
              if (grid.filled[i]) {
                const [wx, wy, wz] = worldPos(x, y, z, W, D);
                items.push({ wx, wy, wz, hex: grid.colors[i] || "#888" });
              }
            }
        applyInstances(t.gridMesh, items);
      },

      updatePiece(cells, color) {
        const t = threeRef.current;
        if (!t || !cells) {
          if (t) t.pieceMesh.count = 0;
          return;
        }
        t.pieceMesh.material.emissive.set(color || "#ffffff");
        const items = cells.map(([x, y, z]) => {
          const [wx, wy, wz] = worldPos(x, y, z, t.W, t.D);
          return { wx, wy, wz, hex: color };
        });
        applyInstances(t.pieceMesh, items);
      },

      updateGhost(cells, color) {
        const t = threeRef.current;
        if (!t || !cells) {
          if (t) t.ghostMesh.count = 0;
          return;
        }
        const items = cells.map(([x, y, z]) => {
          const [wx, wy, wz] = worldPos(x, y, z, t.W, t.D);
          return { wx, wy, wz, hex: color };
        });
        applyInstances(t.ghostMesh, items);
      },

      reinit(W, D, H) {
        const t = threeRef.current;
        if (!t) return;
        t.W = W;
        t.D = D;
        t.H = H;
        t.statics.forEach((o) => t.scene.remove(o));
        t.statics = [];
        buildStatics(t, W, D, H);
        rebuildInstancedMeshes(t, W, D, H);
        fitCamera(t.camera, t.orbitState, W, D, H);
      },
    }),
    [],
  );

  useEffect(() => {
    const el = mountRef.current;
    const W = BOX_PRESETS[preset].W;
    const D = BOX_PRESETS[preset].D;
    const H = BOX_PRESETS[preset].H;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      42,
      el.clientWidth / el.clientHeight,
      0.1,
      800,
    );

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.28);
    scene.add(ambientLight);

    const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 400;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
    sun.shadow.camera.right = sun.shadow.camera.top = 80;
    scene.add(sun);

    const rimLight = new THREE.DirectionalLight(0x88bbff, 0.85);
    rimLight.position.set(-18, 12, -18);
    scene.add(rimLight);

    const fillRight = new THREE.DirectionalLight(0xffddaa, 0.95);
    fillRight.position.set(18, 6, -10);
    scene.add(fillRight);

    const bounce = new THREE.DirectionalLight(0xaaccff, 0.2);
    bounce.position.set(0, -8, 0);
    scene.add(bounce);

    const bounce2 = new THREE.DirectionalLight(0xaaccff, 0.85);
    bounce2.position.set(-10, 4, 10);
    scene.add(bounce2);

    const orbitState = {
      rotY: -0.55,
      rotX: 0.38,
      radius: 0,
      dragging: false,
      lastMX: 0,
      lastMY: 0,
    };
    const t = { renderer, scene, camera, orbitState, W, D, H, statics: [] };
    threeRef.current = t;

    buildStatics(t, W, D, H);
    rebuildInstancedMeshes(t, W, D, H);
    fitCamera(camera, orbitState, W, D, H);

    let rafId;
    const render = () => {
      rafId = requestAnimationFrame(render);
      const { rotX, rotY, radius } = orbitState;
      const tgt = new THREE.Vector3(0, H / 2, 0);
      const desired = new THREE.Vector3(
        tgt.x + radius * Math.cos(rotX) * Math.sin(rotY),
        tgt.y + radius * Math.sin(rotX),
        tgt.z + radius * Math.cos(rotX) * Math.cos(rotY),
      );
      if (orbitState.dragging) camera.position.copy(desired);
      else camera.position.lerp(desired, 0.06);
      camera.lookAt(tgt);
      renderer.render(scene, camera);
    };
    render();

    const pointerDown = ({ clientX, clientY }) => {
      orbitState.dragging = true;
      orbitState.lastMX = clientX;
      orbitState.lastMY = clientY;
      el.style.cursor = "grabbing";
    };
    const pointerMove = ({ clientX, clientY }) => {
      if (!orbitState.dragging) return;
      orbitState.rotY += (clientX - orbitState.lastMX) * 0.013;
      orbitState.rotX = Math.max(
        -0.1,
        Math.min(1.5, orbitState.rotX - (clientY - orbitState.lastMY) * 0.009),
      );
      orbitState.lastMX = clientX;
      orbitState.lastMY = clientY;
    };
    const pointerUp = () => {
      orbitState.dragging = false;
      el.style.cursor = "grab";
    };

    el.style.cursor = "grab";
    el.addEventListener("mousedown", pointerDown);
    el.addEventListener("touchstart", (e) => pointerDown(e.touches[0]), {
      passive: true,
    });
    window.addEventListener("mousemove", pointerMove);
    window.addEventListener("touchmove", (e) => pointerMove(e.touches[0]), {
      passive: true,
    });
    window.addEventListener("mouseup", pointerUp);
    window.addEventListener("touchend", pointerUp);
    window.addEventListener("resize", () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("mousedown", pointerDown);
      el.removeEventListener("touchstart", pointerDown);
      window.removeEventListener("mousemove", pointerMove);
      window.removeEventListener("touchmove", pointerMove);
      window.removeEventListener("mouseup", pointerUp);
      window.removeEventListener("touchend", pointerUp);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={mountRef} style={S.canvas} />;
});

function buildStatics(t, W, D, H) {
  const { scene } = t;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.52;
  floor.receiveShadow = true;
  scene.add(floor);
  t.statics.push(floor);

  const boxEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)),
    new THREE.LineBasicMaterial({ color: 0x334477, opacity: 0.38 }),
  );
  boxEdge.position.set(0, H / 2 - 0.5, 0);
  scene.add(boxEdge);
  t.statics.push(boxEdge);

  const makeRing = (yLevel, color, opacity) => {
    const pts = [
      new THREE.Vector3(-W / 2, yLevel, -D / 2),
      new THREE.Vector3(W / 2, yLevel, -D / 2),
      new THREE.Vector3(W / 2, yLevel, D / 2),
      new THREE.Vector3(-W / 2, yLevel, D / 2),
      new THREE.Vector3(-W / 2, yLevel, -D / 2),
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    scene.add(line);
    t.statics.push(line);
  };
  makeRing(H - 4, 0xff4444, 0.35);
  makeRing(Math.floor(H * VERT_THRESH_RATIO), 0xffaa00, 0.3);
}

function rebuildInstancedMeshes(t, W, D, H) {
  const { scene } = t;

  ["gridMesh", "pieceMesh", "ghostMesh"].forEach((key) => {
    if (t[key]) {
      t[key].geometry.dispose();
      t[key].material.dispose();
      scene.remove(t[key]);
    }
  });

  const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

  function makeInstanced(mat, maxCount) {
    const mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < maxCount; i++) mesh.setColorAt(i, white);
    mesh.instanceColor.needsUpdate = true;
    mesh.count = 0;
    return mesh;
  }

  const gridMat = new THREE.MeshStandardMaterial({
    roughness: 0.28,
    metalness: 0.12,
    transparent: true,
    opacity: 0.8,
    // depthWrite: false,
  });
  t.gridMesh = makeInstanced(gridMat, W * D * H);
  t.gridMesh.castShadow = t.gridMesh.receiveShadow = true;
  scene.add(t.gridMesh);

  const pieceMat = new THREE.MeshStandardMaterial({
    roughness: 0.18,
    metalness: 0.25,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.18,
  });
  t.pieceMesh = makeInstanced(pieceMat, MAX_PIECE_CELLS);
  t.pieceMesh.castShadow = true;
  scene.add(t.pieceMesh);

  const ghostMat = new THREE.MeshStandardMaterial({
    roughness: 0.55,
    metalness: 0.0,
    transparent: true,
    opacity: GHOST_OPACITY,
    depthWrite: false,
  });
  t.ghostMesh = makeInstanced(ghostMat, MAX_PIECE_CELLS);
  scene.add(t.ghostMesh);
}

function fitCamera(camera, orbitState, W, D, H) {
  const span = Math.max(W, D, H * 0.55);
  const fovR = camera.fov * (Math.PI / 180);
  orbitState.radius = (span / 2 / Math.tan(fovR / 2)) * 2.1;
  camera.far = orbitState.radius * 6;
  camera.updateProjectionMatrix();
}

// =============================================================================
// §7 — INPUT HANDLING HOOK
// =============================================================================

function useGameInput({
  onMove,
  onRotate,
  onCycleAxis,
  onHardDrop,
  onTogglePause,
  onSoftDrop,
}) {
  const held = useRef({});
  useEffect(() => {
    const down = (e) => {
      if (held.current[e.code]) return;
      held.current[e.code] = true;
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          onMove(-1, 0);
          break;
        case "ArrowRight":
        case "KeyD":
          onMove(1, 0);
          break;
        case "ArrowUp":
        case "KeyW":
          onMove(0, -1);
          break;
        case "ArrowDown":
        case "KeyS":
          onMove(0, 1);
          break;
        case "KeyQ":
        case "KeyL":
          onRotate(-1);
          break;
        case "KeyE":
          onRotate(1);
          break;
        case "Tab":
          e.preventDefault();
          onHardDrop();
          break;
        case "Space":
          e.preventDefault();
          onCycleAxis();
          break;
        case "KeyP":
        case "Escape":
          onTogglePause();
          break;
      }
    };
    const up = (e) => {
      held.current[e.code] = false;
      if (e.code === "ArrowDown" || e.code === "KeyS") onSoftDrop(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onMove, onRotate, onCycleAxis, onHardDrop, onTogglePause, onSoftDrop]);
}

// =============================================================================
// §8 — LEADERBOARD
//
// Reads/writes localStorage key "mathblox-leaderboard" in the same format
// as the zustand persist middleware:
//   { state: { scores: ScoreEntry[] }, version: 0 }
//
// This means scores saved here appear in the zustand store and vice versa.
// Default player name is used when no name is provided.
// =============================================================================

const LS_KEY = "mathblox-leaderboard";

/** Read scores from localStorage, handling both raw and zustand-wrapped formats. */
function lsRead() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // zustand persist wraps as { state: { scores: [] }, version: 0 }
    return parsed?.state?.scores ?? parsed?.scores ?? [];
  } catch {
    return [];
  }
}

/** Write scores to localStorage in zustand persist format. */
function lsWrite(scores) {
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        ...existing,
        state: { ...existing?.state, scores },
        version: existing?.version ?? 0,
      }),
    );
  } catch {}
}

/** Add a new score entry, keep top 50 sorted, and persist. */
function addLeaderboardEntry(
  score,
  mode = "desafío",
  playerName = DEFAULT_PLAYER,
) {
  const current = lsRead();
  const newEntry = {
    id: Math.random().toString(36).substring(2, 9),
    playerName,
    score,
    mode,
    date: Date.now(),
  };
  const updated = [...current, newEntry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
  lsWrite(updated);
  return updated;
}

/** React hook — exposes scores list and addScore action. */
function useLeaderboard() {
  const [scores, setScores] = useState(() => lsRead());

  const addScore = useCallback((score, mode) => {
    const updated = addLeaderboardEntry(score, mode);
    setScores(updated);
    return updated;
  }, []);

  const refresh = useCallback(() => setScores(lsRead()), []);

  return { scores, addScore, refresh };
}

// =============================================================================
// §9 — APP ROOT & GAME LOOP
// =============================================================================

export default function TetrisApp() {
  const game = useRef(null);

  const [ui, setUi] = useState({
    score: 0,
    lines: 0,
    level: 1,
    status: "idle",
    preset: "S",
    rotAxis: "Y",
    lastClears: [],
    nextPiece: null,
    showBoard: false,
  });

  const sceneRef = useRef(null);
  const dropTimerRef = useRef(null);
  const softDropRef = useRef(false);
  const rotAxisRef = useRef("Y");

  const { scores, addScore, refresh } = useLeaderboard();

  // ── Scene sync ─────────────────────────────────────────────────────────────
  const syncScene = useCallback(() => {
    const sc = sceneRef.current;
    const g = game.current;
    if (!sc || !g) return;
    sc.updateGrid(g.grid, g.W, g.D, g.H);
    if (g.piece) {
      const ghost = computeGhost(g.grid, g.piece.cells, g.W, g.D, g.H);
      sc.updatePiece(g.piece.cells, g.piece.color);
      sc.updateGhost(ghost, g.piece.color);
    } else {
      sc.updatePiece(null, null);
      sc.updateGhost(null, null);
    }
  }, []);

  // ── Drop timer ─────────────────────────────────────────────────────────────
  const startDropTimer = useCallback((level) => {
    if (dropTimerRef.current) clearInterval(dropTimerRef.current);
    const interval = softDropRef.current
      ? Math.min(dropSpeed(level), 80)
      : dropSpeed(level);
    dropTimerRef.current = setInterval(() => tick(), interval); // eslint-disable-line no-use-before-define
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core tick (gravity) ───────────────────────────────────────────────────
  const tick = useCallback(() => {
    const g = game.current;
    if (!g || g.status !== "playing") return;

    const fallen = g.piece.cells.map(([x, y, z]) => [x, y - 1, z]);

    if (canPlace(g.grid, fallen, g.W, g.D, g.H)) {
      g.piece = { ...g.piece, cells: fallen };
    } else {
      // Piece lands
      stampCells(g.grid, g.piece.cells, g.piece.color, g.W, g.D);

      const { newGrid, clears, layerCount, columnCount, totalScore } =
        checkAndClear(g.grid, g.W, g.D, g.H);

      g.grid = newGrid;
      g.score += totalScore;
      // Both layer and column clears count as lines
      g.lines += layerCount + columnCount;
      g.level = 1 + Math.floor(g.lines / 10);

      const next = g.nextPiece;
      g.piece = next;
      g.nextPiece = spawnPiece(g.W, g.D, g.H);

      if (!canPlace(g.grid, g.piece.cells, g.W, g.D, g.H)) {
        g.status = "over";
        clearInterval(dropTimerRef.current);
        // Auto-save score to leaderboard
        addScore(g.score, g.W > 10 ? "grande" : "pequeño");
        setUi((u) => ({
          ...u,
          status: "over",
          score: g.score,
          lines: g.lines,
          level: g.level,
        }));
        syncScene();
        return;
      }

      startDropTimer(g.level);
      setUi((u) => ({
        ...u,
        score: g.score,
        lines: g.lines,
        level: g.level,
        lastClears: clears.map((c) => c.type),
        nextPiece: g.nextPiece,
      }));
    }
    syncScene();
  }, [syncScene, startDropTimer, addScore]);

  // ── Start / restart ────────────────────────────────────────────────────────
  const startGame = useCallback(
    (presetKey) => {
      clearInterval(dropTimerRef.current);
      const { W, D, H } = BOX_PRESETS[presetKey];
      const firstPiece = spawnPiece(W, D, H);
      const nextPiece = spawnPiece(W, D, H);

      game.current = {
        grid: createGrid(W, D, H),
        piece: firstPiece,
        nextPiece,
        status: "playing",
        score: 0,
        lines: 0,
        level: 1,
        W,
        D,
        H,
      };

      sceneRef.current?.reinit(W, D, H);
      syncScene();
      startDropTimer(1);
      setUi({
        score: 0,
        lines: 0,
        level: 1,
        status: "playing",
        preset: presetKey,
        rotAxis: rotAxisRef.current,
        lastClears: [],
        nextPiece,
        showBoard: false,
      });
    },
    [syncScene, startDropTimer],
  );

  // ── Player actions ─────────────────────────────────────────────────────────
  const movePiece = useCallback(
    (dx, dz) => {
      const g = game.current;
      if (!g || g.status !== "playing") return;
      const shifted = g.piece.cells.map(([x, y, z]) => [x + dx, y, z + dz]);
      if (canPlace(g.grid, shifted, g.W, g.D, g.H)) {
        g.piece = { ...g.piece, cells: shifted };
        syncScene();
      }
    },
    [syncScene],
  );

  const rotatePiece = useCallback(
    (dir) => {
      const g = game.current;
      if (!g || g.status !== "playing") return;
      const newCells = tryRotate(
        g.grid,
        g.piece.cells,
        rotAxisRef.current,
        dir,
        g.W,
        g.D,
        g.H,
      );
      if (newCells) {
        g.piece = { ...g.piece, cells: newCells };
        syncScene();
      }
    },
    [syncScene],
  );

  const cycleAxis = useCallback(() => {
    const next = AXES[(AXES.indexOf(rotAxisRef.current) + 1) % AXES.length];
    rotAxisRef.current = next;
    setUi((u) => ({ ...u, rotAxis: next }));
  }, []);

  const hardDrop = useCallback(() => {
    const g = game.current;
    if (!g || g.status !== "playing") return;
    const ghost = computeGhost(g.grid, g.piece.cells, g.W, g.D, g.H);
    const dist = g.piece.cells[0][1] - ghost[0][1];
    g.score += SCORE.harddrop(dist);
    g.piece = { ...g.piece, cells: ghost };
    syncScene();
    setTimeout(() => tick(), 10);
  }, [syncScene, tick]);

  const togglePause = useCallback(() => {
    const g = game.current;
    if (!g || g.status === "over" || g.status === "idle") return;
    if (g.status === "playing") {
      g.status = "paused";
      clearInterval(dropTimerRef.current);
    } else {
      g.status = "playing";
      startDropTimer(g.level);
    }
    setUi((u) => ({ ...u, status: g.status }));
  }, [startDropTimer]);

  const softDrop = useCallback(
    (active) => {
      softDropRef.current = active;
      const g = game.current;
      if (g && g.status === "playing") startDropTimer(g.level);
    },
    [startDropTimer],
  );

  useGameInput({
    onMove: movePiece,
    onRotate: rotatePiece,
    onCycleAxis: cycleAxis,
    onHardDrop: hardDrop,
    onTogglePause: togglePause,
    onSoftDrop: softDrop,
  });

  useEffect(() => () => clearInterval(dropTimerRef.current), []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const {
    score,
    lines,
    level,
    status,
    preset,
    rotAxis,
    lastClears,
    nextPiece,
    showBoard,
  } = ui;
  const isPlaying = status === "playing";
  const isPaused = status === "paused";
  const isOver = status === "over";
  const isIdle = status === "idle";
  const topScores = [...scores].sort((a, b) => b.score - a.score).slice(0, 8);

  return (
    <div style={S.root}>
      <div style={S.bgGrid} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={S.header}>
        <div style={S.logoRow}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              style={{
                ...S.logoPip,
                background: [
                  "#E84040",
                  "#F0A500",
                  "#22C55E",
                  "#3B9EFF",
                  "#A855F7",
                ][i],
              }}
            />
          ))}
          <span style={S.logoText}>MathCubes</span>
          <span style={S.logoStage}>Etapa 3 · Tetris 3D</span>
        </div>
        <div style={S.headerControls}>
          <button
            onClick={() => {
              refresh();
              setUi((u) => ({ ...u, showBoard: !u.showBoard }));
            }}
            style={{
              ...S.headerBtn,
              borderColor: showBoard ? "#F0A500" : "#ffffff18",
              color: showBoard ? "#F0A500" : "#556",
            }}
          >
            🏆 Tabla
          </button>
          <span style={S.headerHint}>
            WASD · Spc=eje · Tab=drop · Q/E=rotar
          </span>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div style={S.body}>
        {/* LEFT — 3D scene */}
        <div style={S.leftCol}>
          <div style={S.sceneBox}>
            <TetrisScene ref={sceneRef} preset={preset} />

            {(isIdle || isPaused || isOver) && (
              <div style={S.overlay}>
                {isIdle && <span style={S.overlayTitle}>Tetris 3D</span>}
                {isPaused && <span style={S.overlayTitle}>PAUSA</span>}
                {isOver && (
                  <span style={{ ...S.overlayTitle, color: "#E84040" }}>
                    FIN
                  </span>
                )}
                {isOver && <span style={S.overlayScore}>{score} pts</span>}
                {isOver && (
                  <span style={S.overlaySub}>guardado en tabla ✓</span>
                )}
                <button
                  onClick={() => startGame(preset)}
                  style={{ ...S.btnBig, background: "#E84040" }}
                >
                  {isIdle
                    ? "▶ INICIAR"
                    : isOver
                      ? "↺ REINICIAR"
                      : "▶ CONTINUAR"}
                </button>
                {isPaused && (
                  <button
                    onClick={togglePause}
                    style={{ ...S.btnBig, background: "#334" }}
                  >
                    ▶ Reanudar
                  </button>
                )}
              </div>
            )}

            {lastClears.length > 0 && isPlaying && (
              <ClearFlash clears={lastClears} key={score} />
            )}

            <span style={S.orbitHint}>↔ Arrastrar</span>
          </div>

          {/* Box size selector */}
          <div style={S.presetRow}>
            <span style={S.presetLabel}>CAJA</span>
            {Object.entries(BOX_PRESETS).map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => startGame(key)}
                style={{
                  ...S.presetBtn,
                  borderColor: preset === key ? "#3B9EFF" : "#ffffff1a",
                  color: preset === key ? "#3B9EFF" : "#556",
                  background: preset === key ? "#3B9EFF22" : "transparent",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT — info panel */}
        <div style={S.rightCol}>
          {/* Score card */}
          <div style={S.scoreCard}>
            {[
              ["PUNTOS", score, "#E84040"],
              ["LÍNEAS", lines, "#22C55E"],
              ["NIVEL", level, "#3B9EFF"],
            ].map(([label, val, col]) => (
              <div key={label} style={S.scoreItem}>
                <span style={S.scoreItemLabel}>{label}</span>
                <span style={{ ...S.scoreItemVal, color: col }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Leaderboard panel (toggle) */}
          {showBoard ? (
            <Leaderboard
              scores={topScores}
              currentScore={isOver ? score : -1}
            />
          ) : (
            <>
              {nextPiece && (
                <div style={S.nextCard}>
                  <span style={S.sectionTitle}>SIGUIENTE</span>
                  <NextPieceDisplay piece={nextPiece} />
                </div>
              )}

              <div style={S.controlsCard}>
                <span style={S.sectionTitle}>MOVER</span>
                <div style={S.dpad}>
                  <div style={S.dpadRow}>
                    <button onClick={() => movePiece(0, -1)} style={S.dpadBtn}>
                      ▲
                    </button>
                  </div>
                  <div style={S.dpadRow}>
                    <button onClick={() => movePiece(-1, 0)} style={S.dpadBtn}>
                      ◀
                    </button>
                    <button
                      onClick={hardDrop}
                      style={{ ...S.dpadBtn, ...S.dpadCenter }}
                    >
                      ⬇
                    </button>
                    <button onClick={() => movePiece(1, 0)} style={S.dpadBtn}>
                      ▶
                    </button>
                  </div>
                  <div style={S.dpadRow}>
                    <button onClick={() => movePiece(0, 1)} style={S.dpadBtn}>
                      ▼
                    </button>
                  </div>
                </div>
              </div>

              <div style={S.controlsCard}>
                <span style={S.sectionTitle}>ROTAR · EJE ACTIVO</span>
                <div style={S.rotRow}>
                  <button
                    onClick={cycleAxis}
                    style={{
                      ...S.rotAxisBtn,
                      borderColor: "#ffffff44",
                      color: "#fff",
                      background: "#334",
                    }}
                  >
                    Eje:{" "}
                    <span style={{ color: "#F0A500", fontWeight: 900 }}>
                      {rotAxis}
                    </span>
                  </button>
                  <button onClick={() => rotatePiece(-1)} style={S.rotBtn}>
                    ↺ CCW
                  </button>
                  <button onClick={() => rotatePiece(1)} style={S.rotBtn}>
                    ↻ CW
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 7 }}>
                <button
                  onClick={hardDrop}
                  style={{ ...S.actionBtn, background: "#E84040", flex: 2 }}
                >
                  ⬇ Drop
                </button>
                <button
                  onClick={togglePause}
                  style={{ ...S.actionBtn, background: "#334", flex: 1 }}
                >
                  {isPaused ? "▶" : "⏸"}
                </button>
              </div>

              <LineLegend />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// §10 — UI COMPONENTS
// =============================================================================

function ClearFlash({ clears }) {
  const labels = {
    layer: "LÍNEA COMPLETA",
    diag_main: "DIAGONAL ↘",
    diag_anti: "DIAGONAL ↗",
    column: "COLUMNA ↑",
  };
  const colors = {
    layer: "#22C55E",
    diag_main: "#3B9EFF",
    diag_anti: "#A855F7",
    column: "#F0A500",
  };
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1400);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div style={S.clearFlash}>
      {[...new Set(clears)].map((type) => (
        <div
          key={type}
          style={{
            ...S.clearFlashItem,
            borderColor: colors[type] || "#fff",
            color: colors[type] || "#fff",
          }}
        >
          {labels[type] || type.toUpperCase()}
        </div>
      ))}
    </div>
  );
}

function NextPieceDisplay({ piece }) {
  if (!piece) return null;
  const cells = piece.cells;
  const minX = Math.min(...cells.map((c) => c[0]));
  const minZ = Math.min(...cells.map((c) => c[2]));
  const maxX = Math.max(...cells.map((c) => c[0])) - minX;
  const maxZ = Math.max(...cells.map((c) => c[2])) - minZ;
  const CELL = 13;
  const placed = new Set(cells.map((c) => `${c[0] - minX},${c[2] - minZ}`));
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div
        style={{
          position: "relative",
          width: (maxX + 1) * (CELL + 2),
          height: (maxZ + 1) * (CELL + 2),
        }}
      >
        {Array.from({ length: maxZ + 1 }, (_, z) =>
          Array.from({ length: maxX + 1 }, (_, x) => {
            const fill = placed.has(`${x},${z}`);
            return (
              <div
                key={`${x},${z}`}
                style={{
                  position: "absolute",
                  left: x * (CELL + 2),
                  top: z * (CELL + 2),
                  width: CELL,
                  height: CELL,
                  borderRadius: 2,
                  background: fill ? piece.color : "transparent",
                  border: fill ? "none" : "1px solid #ffffff08",
                  boxShadow: fill ? `0 0 4px ${piece.color}66` : "none",
                }}
              />
            );
          }),
        )}
      </div>
      <span style={{ fontSize: 10, color: piece.color, fontWeight: 800 }}>
        {piece.name}
      </span>
    </div>
  );
}

function LineLegend() {
  const items = [
    {
      label: "Capa completa",
      sub: "W × D cubos → layer clear",
      color: "#22C55E",
    },
    {
      label: "Columna vertical",
      sub: "Columna llena hasta umbral amarillo",
      color: "#F0A500",
    },
  ];
  return (
    <div style={S.legendCard}>
      <span style={S.sectionTitle}>LÍNEAS</span>
      {items.map(({ label, sub, color }) => (
        <div key={label} style={S.legendRow}>
          <div style={{ ...S.legendDot, background: color }} />
          <div style={S.legendText}>
            <span style={{ color, fontWeight: 800, fontSize: 12 }}>
              {label}
            </span>
            <span style={{ fontSize: 10, color: "#556" }}>{sub}</span>
          </div>
        </div>
      ))}
      <div style={S.keyRow}>
        {[
          ["WASD", "mover XZ"],
          ["Q/E", "rotar"],
          ["Tab", "drop"],
          ["Spc", "eje"],
          ["P", "pausa"],
        ].map(([k, v]) => (
          <div key={k} style={S.keyItem}>
            <span style={S.keyChip}>{k}</span>
            <span style={S.keyLabel}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Leaderboard panel — reads from localStorage (same key as zustand store). */
function Leaderboard({ scores, currentScore }) {
  const formatDate = (ts) => {
    const d = new Date(ts);
    return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const modeColor = {
    desafío: "#E84040",
    estudio: "#22C55E",
    libre: "#3B9EFF",
    grande: "#A855F7",
    pequeño: "#06B6D4",
  };

  return (
    <div style={S.leaderboard}>
      <div style={S.lbHeader}>
        <span style={S.sectionTitle}>🏆 TABLA DE PUNTAJES</span>
        <span style={{ fontSize: 9, color: "#334" }}>top 8</span>
      </div>
      {scores.length === 0 && (
        <div
          style={{
            color: "#334",
            fontSize: 12,
            textAlign: "center",
            padding: "12px 0",
          }}
        >
          Sin registros — ¡juega una partida!
        </div>
      )}
      {scores.map((entry, idx) => {
        const isCurrent = entry.score === currentScore;
        const rankColor =
          idx === 0
            ? "#F0A500"
            : idx === 1
              ? "#aaa"
              : idx === 2
                ? "#c87533"
                : "#334";
        return (
          <div
            key={entry.id}
            style={{
              ...S.lbRow,
              background: isCurrent ? "#ffffff0a" : "transparent",
              borderColor: isCurrent ? "#F0A500" : "#ffffff08",
            }}
          >
            <span style={{ ...S.lbRank, color: rankColor }}>#{idx + 1}</span>
            <div style={S.lbInfo}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#ccc" }}>
                {entry.playerName}
              </span>
              {entry.mode && (
                <span
                  style={{
                    fontSize: 9,
                    color: modeColor[entry.mode] || "#556",
                    fontWeight: 700,
                  }}
                >
                  {entry.mode}
                </span>
              )}
            </div>
            <div style={S.lbScoreCol}>
              <span
                style={{
                  ...S.lbScore,
                  color: isCurrent ? "#F0A500" : "#22C55E",
                }}
              >
                {entry.score.toLocaleString()}
              </span>
              <span style={S.lbDate}>{formatDate(entry.date)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// §11 — STYLES
// =============================================================================

const CARD = {
  background: "#131325",
  border: "1px solid #ffffff0d",
  borderRadius: 13,
  padding: "11px 13px",
};

const S = {
  root: {
    minHeight: "100vh",
    background: "#0a0a18",
    fontFamily: "'Nunito','Trebuchet MS',sans-serif",
    color: "#dde0f0",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
  },
  bgGrid: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
    backgroundImage: "radial-gradient(circle, #ffffff04 1px, transparent 1px)",
    backgroundSize: "22px 22px",
  },

  header: {
    zIndex: 10,
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 20px",
    background: "#0a0a18f2",
    borderBottom: "1px solid #ffffff0f",
    backdropFilter: "blur(10px)",
  },
  logoRow: { display: "flex", alignItems: "center", gap: 5 },
  logoPip: { width: 9, height: 9, borderRadius: 2 },
  logoText: {
    fontSize: 19,
    fontWeight: 900,
    color: "#fff",
    marginLeft: 7,
    letterSpacing: "-0.5px",
  },
  logoStage: {
    fontSize: 11,
    fontWeight: 700,
    color: "#E84040",
    marginLeft: 8,
    letterSpacing: "0.2px",
  },
  headerControls: { display: "flex", alignItems: "center", gap: 8 },
  headerHint: {
    fontSize: 10,
    color: "#445",
    background: "#ffffff09",
    padding: "3px 9px",
    borderRadius: 7,
    border: "1px solid #ffffff0f",
    fontFamily: "monospace",
  },
  headerBtn: {
    fontSize: 11,
    fontWeight: 700,
    border: "1px solid",
    borderRadius: 8,
    padding: "3px 10px",
    cursor: "pointer",
    background: "transparent",
    transition: "all 0.12s",
    fontFamily: "inherit",
  },

  body: {
    position: "relative",
    zIndex: 5,
    flex: 1,
    display: "flex",
    gap: 14,
    padding: "13px 17px",
    flexWrap: "wrap",
  },
  leftCol: {
    flex: "1 1 460px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  rightCol: {
    flex: "0 0 260px",
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },

  canvas: { width: "100%", height: "100%", borderRadius: "inherit" },
  sceneBox: {
    flex: 1,
    minHeight: 480,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    border: "1px solid #ffffff0d",
    background: "#0c0c1e",
    boxShadow: "0 20px 60px #00000099",
  },
  orbitHint: {
    position: "absolute",
    bottom: 9,
    right: 11,
    fontSize: 10,
    color: "#ffffff22",
    pointerEvents: "none",
    userSelect: "none",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background: "#000000cc",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backdropFilter: "blur(10px)",
  },
  overlayTitle: {
    fontSize: 38,
    fontWeight: 900,
    color: "#fff",
    letterSpacing: "2px",
  },
  overlayScore: { fontSize: 22, fontWeight: 700, color: "#22C55E" },
  overlaySub: { fontSize: 12, color: "#F0A500", fontWeight: 700 },
  btnBig: {
    padding: "11px 32px",
    borderRadius: 12,
    border: "none",
    fontSize: 15,
    fontWeight: 800,
    color: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.5px",
  },
  clearFlash: {
    position: "absolute",
    top: 18,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    alignItems: "center",
    pointerEvents: "none",
  },
  clearFlashItem: {
    padding: "5px 16px",
    borderRadius: 8,
    border: "1.5px solid",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "1px",
    background: "#000000aa",
    backdropFilter: "blur(6px)",
  },

  presetRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 10,
    padding: "8px 13px",
  },
  presetLabel: {
    fontSize: 10,
    color: "#445",
    fontWeight: 800,
    letterSpacing: "0.8px",
    marginRight: 4,
  },
  presetBtn: {
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid",
    borderRadius: 7,
    padding: "4px 11px",
    cursor: "pointer",
    background: "transparent",
    transition: "all 0.12s",
    fontFamily: "inherit",
  },

  scoreCard: {
    ...CARD,
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
  },
  scoreItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    alignItems: "center",
  },
  scoreItemLabel: {
    fontSize: 9,
    color: "#445",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  scoreItemVal: { fontSize: 22, fontWeight: 900, lineHeight: 1 },
  nextCard: {
    ...CARD,
    display: "flex",
    flexDirection: "column",
    gap: 9,
    alignItems: "center",
  },
  controlsCard: { ...CARD, display: "flex", flexDirection: "column", gap: 9 },
  sectionTitle: {
    fontSize: 9,
    color: "#445",
    fontWeight: 800,
    letterSpacing: "0.9px",
  },

  dpad: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
  },
  dpadRow: { display: "flex", gap: 3 },
  dpadBtn: {
    width: 44,
    height: 44,
    borderRadius: 9,
    border: "1px solid #ffffff18",
    background: "#1a1a30",
    color: "#aab",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.1s",
    fontFamily: "inherit",
  },
  dpadCenter: { background: "#2a1a30", color: "#E84040" },
  rotRow: { display: "flex", gap: 5 },
  rotAxisBtn: {
    flex: 1,
    padding: "8px 0",
    borderRadius: 8,
    border: "1px solid",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.12s",
  },
  rotBtn: {
    flex: 1,
    padding: "8px 0",
    borderRadius: 8,
    border: "1px solid #3B9EFF44",
    background: "#3B9EFF15",
    color: "#3B9EFF",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  actionBtn: {
    padding: "10px 0",
    borderRadius: 10,
    border: "none",
    color: "#fff",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.12s",
  },

  legendCard: { ...CARD, display: "flex", flexDirection: "column", gap: 8 },
  legendRow: { display: "flex", alignItems: "flex-start", gap: 8 },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    flexShrink: 0,
    marginTop: 2,
  },
  legendText: { display: "flex", flexDirection: "column", gap: 1 },
  keyRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
    borderTop: "1px solid #ffffff08",
    paddingTop: 8,
  },
  keyItem: { display: "flex", alignItems: "center", gap: 4 },
  keyChip: {
    background: "#1e1e3a",
    border: "1px solid #ffffff18",
    borderRadius: 5,
    padding: "1px 5px",
    fontSize: 9,
    fontFamily: "monospace",
    color: "#aab",
    fontWeight: 700,
  },
  keyLabel: { fontSize: 9, color: "#445" },

  // Leaderboard
  leaderboard: {
    ...CARD,
    display: "flex",
    flexDirection: "column",
    gap: 7,
    flex: 1,
    overflow: "auto",
  },
  lbHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  lbRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid",
    borderRadius: 8,
    padding: "6px 9px",
    transition: "background 0.15s",
  },
  lbRank: {
    fontSize: 13,
    fontWeight: 900,
    width: 22,
    flexShrink: 0,
    textAlign: "center",
  },
  lbInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    flex: 1,
    overflow: "hidden",
  },
  lbScoreCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 1,
    flexShrink: 0,
  },
  lbScore: { fontSize: 14, fontWeight: 900 },
  lbDate: { fontSize: 9, color: "#334" },
};
