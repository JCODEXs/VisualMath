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
//   §5  Line-clear engine
//   §6  Three.js scene
//   §7  Input handling hook
//   §8  App root & game loop
//   §9  UI components
//   §10 Styles
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
  S: { W: 9, D: 9, H: 20, label: "9 × 9 × 30" },
  L: { W: 20, D: 20, H: 30, label: "20 × 20 × 30" },
};

const CUBE_SIZE = 0.92; // < 1.0 → visible rivet groove between cubes
const MAX_PIECE_CELLS = 64;
const VERT_THRESH_RATIO = 0.45; // vertical column clears below H × this
const GHOST_OPACITY = 0.59;

// ms between automatic drops, indexed by level (clamped at level 10)
const DROP_SPEEDS = [1900, 720, 570, 450, 350, 270, 200, 145, 100, 70];
const dropSpeed = (level) =>
  DROP_SPEEDS[Math.min(level - 1, DROP_SPEEDS.length - 1)];

// Points awarded per clear event
const SCORE = {
  layer: (W, D) => W * D * 10,
  diagonal: (W) => W * 25,
  column: (thresh) => thresh * 8,
  harddrop: (dist) => dist,
};

// Rotation axis cycle order
const AXES = ["Y", "X", "Z"];

// =============================================================================
// §2 — PIECE LIBRARY
//
//   ╔══════════════════════════════════════════════════════════════════════╗
//   ║  INSERT YOUR PIECES HERE                                            ║
//   ║                                                                     ║
//   ║  Format:                                                            ║
//   ║    { id: "unique_id",                                               ║
//   ║      name: "Display Name",                                          ║
//   ║      color: "#rrggbb",                                              ║
//   ║      cells: [[x, y, z], ...]  }                                     ║
//   ║                                                                     ║
//   ║  Same cells format as Stage 2.                                      ║
//   ║  y = vertical axis (0 = bottom of piece, grows upward).            ║
//   ╚══════════════════════════════════════════════════════════════════════╝
const USER_PIECES = [
  // Add your pieces here, e.g.:
  // { id: "my_I4", name: "Barra", color: "#E84040",
  //   cells: [[0,0,0],[1,0,0],[2,0,0],[3,0,0]] },
];

// Fallback set — used only when USER_PIECES is empty
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
//
// The grid is a flat Uint8Array (0 = empty) plus a parallel color array.
// Index: x + z * W + y * W * D
// =============================================================================

function gIdx(x, z, y, W, D) {
  return x + z * W + y * W * D;
}

function createGrid(W, D, H) {
  return {
    filled: new Uint8Array(W * D * H), // 1 if occupied
    colors: new Array(W * D * H).fill(null), // "#hex" or null
  };
}

function cloneGrid(g) {
  return { filled: g.filled.slice(), colors: [...g.colors] };
}

function cellOccupied(grid, x, z, y, W, D, H) {
  if (x < 0 || x >= W || z < 0 || z >= D || y < 0 || y >= H) return true; // wall
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

/** Normalize a cells array so its min-x, min-y, min-z are all 0. */
function normalizeCells(cells) {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  const minZ = Math.min(...cells.map((c) => c[2]));
  return cells.map(([x, y, z]) => [x - minX, y - minY, z - minZ]);
}

/** Spawn a random piece, centered in XZ, positioned near the top. */
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

/**
 * Rotate cells 90° around the given axis.
 * dir = 1 → CW when viewed from positive axis, -1 → CCW.
 */
function rotateCells(cells, axis, dir) {
  const xs = cells.map((c) => c[0]),
    ys = cells.map((c) => c[1]),
    zs = cells.map((c) => c[2]);
  // Rotate around the bounding-box center
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
      // Z
      rx = dir > 0 ? -ly : ly;
      ry = dir > 0 ? lx : -lx;
      rz = lz;
    }
    return [Math.round(rx + cx), Math.round(ry + cy), Math.round(rz + cz)];
  });
}

/**
 * Try to rotate the active piece. Returns new cells on success or null.
 * Applies a basic wall-kick (tries offsets in XZ if direct rotation fails).
 */
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

/** Project the active piece straight down to find ghost landing position. */
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
  ) {
    drop++;
  }
  return cells.map(([x, y, z]) => [x, y - drop, z]);
}

// =============================================================================
// §5 — LINE-CLEAR ENGINE
// =============================================================================

/**
 * Scan the grid for all completable lines and remove them.
 * Returns { newGrid, clears[], totalScore }.
 *
 * Clear types and their mechanics:
 *   "layer"   — full XZ slice at y=k; entire layer removed, grid shifts down.
 *   "diag"    — full main/anti diagonal in XZ at y=k (square boxes only);
 *               those cells are zeroed, no shift.
 *   "column"  — full vertical column (x,z) from y=0 to VERT_THRESH;
 *               that column is zeroed, no shift.
 */
function checkAndClear(grid, W, D, H) {
  const VERT_THRESH = Math.floor(H * VERT_THRESH_RATIO);
  let g = cloneGrid(grid);
  const clears = [];

  // ── Layer clears ────────────────────────────────────────────────────────
  // Iterate bottom to top; re-check after every clear (grid shifts).
  let y = 0;
  while (y < H) {
    let count = 0;
    for (let x = 0; x < W; x++)
      for (let z = 0; z < D; z++) if (g.filled[gIdx(x, z, y, W, D)]) count++;

    if (count === W * D) {
      clears.push({ type: "layer", y });
      // Shift everything above y down by 1
      for (let sy = y; sy < H - 1; sy++) {
        for (let x = 0; x < W; x++) {
          for (let z = 0; z < D; z++) {
            const from = gIdx(x, z, sy + 1, W, D);
            const to = gIdx(x, z, sy, W, D);
            g.filled[to] = g.filled[from];
            g.colors[to] = g.colors[from];
          }
        }
      }
      // Clear top row
      for (let x = 0; x < W; x++)
        for (let z = 0; z < D; z++) {
          const i = gIdx(x, z, H - 1, W, D);
          g.filled[i] = 0;
          g.colors[i] = null;
        }
      // Don't increment y — re-check same row (new content shifted down)
    } else {
      y++;
    }
  }

  // ── Diagonal clears (square boxes only) ─────────────────────────────────
  //   if (W === D) {
  //     for (let ky = 0; ky < H; ky++) {
  //       // Main diagonal: x === z
  //       let mainFull = true;
  //       for (let i = 0; i < W; i++) {
  //         if (!g.filled[gIdx(i, i, ky, W, D)]) { mainFull = false; break; }
  //       }
  //       if (mainFull) {
  //         clears.push({ type: "diag_main", y: ky });
  //         for (let i = 0; i < W; i++) {
  //           const idx = gIdx(i, i, ky, W, D);
  //           g.filled[idx] = 0; g.colors[idx] = null;
  //         }
  //       }

  //       // Anti-diagonal: x + z === W - 1
  //       let antiFull = true;
  //       for (let i = 0; i < W; i++) {
  //         if (!g.filled[gIdx(i, W - 1 - i, ky, W, D)]) { antiFull = false; break; }
  //       }
  //       if (antiFull) {
  //         clears.push({ type: "diag_anti", y: ky });
  //         for (let i = 0; i < W; i++) {
  //           const idx = gIdx(i, W - 1 - i, ky, W, D);
  //           g.filled[idx] = 0; g.colors[idx] = null;
  //         }
  //       }
  //     }
  //   }

  // ── Vertical column clears ───────────────────────────────────────────────
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      let full = true;
      for (let cy = 0; cy <= VERT_THRESH; cy++) {
        if (!g.filled[gIdx(x, z, cy, W, D)]) {
          full = false;
          break;
        }
      }
      if (full) {
        clears.push({ type: "column", x, z });
        for (let cy = 0; cy <= VERT_THRESH; cy++) {
          const i = gIdx(x, z, cy, W, D);
          g.filled[i] = 0;
          g.colors[i] = null;
        }
      }
    }
  }

  // ── Score ────────────────────────────────────────────────────────────────
  const totalScore = clears.reduce((acc, c) => {
    if (c.type === "layer") return acc + SCORE.layer(W, D);
    if (c.type.startsWith("diag")) return acc + SCORE.diagonal(W);
    if (c.type === "column")
      return acc + SCORE.column(Math.floor(H * VERT_THRESH_RATIO) + 1);
    return acc;
  }, 0);

  return { newGrid: g, clears, totalScore };
}

// =============================================================================
// §6 — THREE.JS SCENE
// =============================================================================

// Converts grid position to world position (centered on X and Z axes)
function worldPos(gx, gy, gz, W, D) {
  return [gx - (W - 1) / 2, gy, gz - (D - 1) / 2];
}

/**
 * TetrisScene — the Three.js rendering component.
 * Exposes { updateGrid, updatePiece, updateGhost, reinit } via ref.
 */
const TetrisScene = forwardRef(function TetrisScene({ preset }, ref) {
  const mountRef = useRef(null);
  const threeRef = useRef(null); // Three.js objects

  // ── Shared matrix / color temporaries ───────────────────────────────────
  const _mat = new THREE.Matrix4();
  const _color = new THREE.Color();

  function applyInstances(mesh, items) {
    // items: Array of { wx, wy, wz, hex }
    // instanceColor was pre-initialized in makeInstanced, so it is never null.
    items.forEach(({ wx, wy, wz, hex }, i) => {
      _mat.makeTranslation(wx, wy, wz);
      mesh.setMatrixAt(i, _mat);
      _color.set(hex);
      mesh.setColorAt(i, _color);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true; // always safe — pre-initialized
  }

  // ── Exposed API (called from game loop) ─────────────────────────────────
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
        // Update the material's emissive to match the piece color for a glow effect.
        // All cells of the active piece share one color, so a single material update works.
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

      /** Rebuild static box geometry when preset changes */
      reinit(W, D, H) {
        const t = threeRef.current;
        if (!t) return;
        t.W = W;
        t.D = D;
        t.H = H;

        // Remove old static objects
        t.statics.forEach((o) => t.scene.remove(o));
        t.statics = [];

        buildStatics(t, W, D, H);

        // Resize instanced meshes
        rebuildInstancedMeshes(t, W, D, H);

        // Reset camera
        fitCamera(t.camera, t.orbitState, W, D, H);
      },
    }),
    [],
  );

  // ── One-time Three.js initialization ────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    const W = BOX_PRESETS[preset].W;
    const D = BOX_PRESETS[preset].D;
    const H = BOX_PRESETS[preset].H;

    // Renderer
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

    // ── Lighting ─────────────────────────────────────────────────────────────
    // Design goals:
    //   · Colors must be vivid — keep ambient dim so direct light does the work.
    //   · Multiple fill lights prevent any face from going pure black.
    //   · sRGB output encoding ensures browser-correct gamma (no washed-out look).
    //
    // NOTE: Object.assign cannot set THREE.Object3D.position (it's a getter).
    //       Every light is configured with explicit .position.set() calls.

    // renderer.outputEncoding = THREE.sRGBEncoding; // vivid, gamma-correct colors

    // Soft global fill — just enough to prevent black shadows on back faces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.28);
    scene.add(ambientLight);

    // Primary sun — strong, casts shadows, slightly warm
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 400;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
    sun.shadow.camera.right = sun.shadow.camera.top = 80;
    scene.add(sun);

    // Cool-blue rim from the back-left — separates pieces from background
    const rimLight = new THREE.DirectionalLight(0x88bbff, 0.85);
    rimLight.position.set(-18, 12, -18);
    scene.add(rimLight);

    // Warm fill from the right — reduces harsh shadows on the Z face
    const fillRight = new THREE.DirectionalLight(0xffddaa, 0.95);
    fillRight.position.set(18, 6, -10);
    scene.add(fillRight);

    // Bounce light from below — lifts shadow on bottom faces of cubes
    const bounce = new THREE.DirectionalLight(0xaaccff, 0.2);
    bounce.position.set(0, -8, 0);
    scene.add(bounce);
    const bounce2 = new THREE.DirectionalLight(0xaaccff, 0.85);
    bounce2.position.set(-10, 4, 10);
    bounce2.target.position.set(0, 1, 0);
    // Helpers
    // const helper0 = new THREE.DirectionalLightHelper(bounce2, 1);
    // const helper1 = new THREE.DirectionalLightHelper(sun, 1);
    // scene.add(helper1, helper0);
    // const helper2 = new THREE.DirectionalLightHelper(rimLight, 1);
    // scene.add(helper2);
    // const helper3 = new THREE.DirectionalLightHelper(fillRight, 1);
    // scene.add(helper3);
    // const helper4 = new THREE.DirectionalLightHelper(bounce, 1);
    // scene.add(helper4);

    // Orbit state
    const orbitState = {
      rotY: -0.55,
      rotX: 0.38,
      radius: 0,
      dragging: false,
      lastMX: 0,
      lastMY: 0,
    };

    // Storage on the ref
    const t = { renderer, scene, camera, orbitState, W, D, H, statics: [] };
    threeRef.current = t;

    buildStatics(t, W, D, H);
    rebuildInstancedMeshes(t, W, D, H);
    fitCamera(camera, orbitState, W, D, H);

    // Render loop
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

    // Mouse orbit
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
      cancelAnimationFrame(rafId);
      el.removeEventListener("mousedown", pointerDown);
      el.removeEventListener("touchstart", pointerDown);
      window.removeEventListener("mousemove", pointerMove);
      window.removeEventListener("touchmove", pointerMove);
      window.removeEventListener("mouseup", pointerUp);
      window.removeEventListener("touchend", pointerUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={mountRef} style={S.canvas} />;
});

// ── Three.js build helpers ────────────────────────────────────────────────────

/** Build the static scene elements: box wireframe, floor, danger zone line. */
function buildStatics(t, W, D, H) {
  const { scene } = t;

  // Transparent floor plane
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.52;
  floor.receiveShadow = true;
  scene.add(floor);
  t.statics.push(floor);

  // Box wireframe (4 edges per face → 12 edges total)
  const boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D));
  const boxEdge = new THREE.LineSegments(
    boxGeo,
    new THREE.LineBasicMaterial({
      color: 0x334477,
      //   transparent: true,
      opacity: 0.38,
    }),
  );
  boxEdge.position.set(0, H / 2 - 0.5, 0);
  scene.add(boxEdge);
  t.statics.push(boxEdge);

  // "Danger zone" — horizontal ring at spawn height (H - 4)
  const dangerY = H - 4;
  const dangerGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-W / 2, dangerY, -D / 2),
    new THREE.Vector3(W / 2, dangerY, -D / 2),
    new THREE.Vector3(W / 2, dangerY, D / 2),
    new THREE.Vector3(-W / 2, dangerY, D / 2),
    new THREE.Vector3(-W / 2, dangerY, -D / 2),
  ]);
  const dangerLine = new THREE.Line(
    dangerGeo,
    new THREE.LineBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.35,
    }),
  );
  scene.add(dangerLine);
  t.statics.push(dangerLine);

  // VERT_THRESH line (vertical column clear threshold)
  const vtY = Math.floor(H * VERT_THRESH_RATIO);
  const vtGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-W / 2, vtY, -D / 2),
    new THREE.Vector3(W / 2, vtY, -D / 2),
    new THREE.Vector3(W / 2, vtY, D / 2),
    new THREE.Vector3(-W / 2, vtY, D / 2),
    new THREE.Vector3(-W / 2, vtY, -D / 2),
  ]);
  const vtLine = new THREE.Line(
    vtGeo,
    new THREE.LineBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.22,
    }),
  );
  scene.add(vtLine);
  t.statics.push(vtLine);
}

/**
 * (Re)create instanced meshes sized for the current box dimensions.
 *
 * COLOR NOTE — Three.js r128 InstancedMesh:
 *   · Do NOT set vertexColors:true. That flag makes the shader look for a
 *     per-vertex "color" attribute on the geometry (which BoxGeometry doesn't
 *     have), completely bypassing the per-instance color system.
 *   · setColorAt() writes to the internal `instanceColor` InstancedBufferAttribute.
 *   · We pre-fill all slots with white so instanceColor is never null, avoiding
 *     silent failures when count drops to 0 and needsUpdate is called.
 */
function rebuildInstancedMeshes(t, W, D, H) {
  const { scene } = t;

  // Dispose & remove old instanced meshes
  ["gridMesh", "pieceMesh", "ghostMesh"].forEach((key) => {
    if (t[key]) {
      t[key].geometry.dispose();
      t[key].material.dispose();
      scene.remove(t[key]);
    }
  });

  // Shared geometry (same shape for all three meshes)
  const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

  // Helper: create an InstancedMesh with instanceColor pre-initialized to white.
  // This prevents the "instanceColor is null" crash when count fluctuates to 0.
  function makeInstanced(mat, maxCount) {
    const mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < maxCount; i++) mesh.setColorAt(i, white);
    mesh.instanceColor.needsUpdate = true;
    mesh.count = 0;
    return mesh;
  }

  // ── Grid mesh (settled pieces) ─────────────────────────────────────────────
  // Semi-transparent so pieces behind the front face are still readable.
  const gridMat = new THREE.MeshStandardMaterial({
    roughness: 0.28,
    metalness: 0.12,
    // transparent: true,
    opacity: 0.8,
    // depthWrite: false, // keeps transparency sorting stable
  });
  t.gridMesh = makeInstanced(gridMat, W * D * H);
  t.gridMesh.castShadow = true;
  t.gridMesh.receiveShadow = true;
  scene.add(t.gridMesh);

  // ── Active piece mesh (falling piece) ─────────────────────────────────────
  // Fully opaque + stronger emissive so it pops against the settled grid.
  const pieceMat = new THREE.MeshStandardMaterial({
    roughness: 0.18,
    metalness: 0.25,
    emissive: new THREE.Color(0xffffff), // tinted by instance color below
    emissiveIntensity: 0.18,
  });
  t.pieceMesh = makeInstanced(pieceMat, MAX_PIECE_CELLS);
  t.pieceMesh.castShadow = true;
  scene.add(t.pieceMesh);

  // ── Ghost mesh (landing preview) ──────────────────────────────────────────
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

/**
 * Bind keyboard controls and expose action handlers.
 * Actions are passed in from the game loop as callbacks.
 */
function useGameInput({
  onMove,
  onRotate,
  onCycleAxis,
  onHardDrop,
  onTogglePause,
  onSoftDrop,
}) {
  // Track which keys are held for soft-drop
  const held = useRef({});

  useEffect(() => {
    const down = (e) => {
      if (held.current[e.code]) return; // ignore auto-repeat except soft drop
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
          //   onSoftDrop(true);
          onMove(0, 1);
          break;
        case "KeyQ":
        case "KeyL":
          onRotate(-1);
          break;
        case "KeyE":
        case "KeyÑ":
          onRotate(1);
          break;
        case "Tab":
          e.preventDefault();
          //   onCycleAxis();
          onHardDrop();
          break;
        case "Space":
          e.preventDefault();
          //   onHardDrop();
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
// §8 — APP ROOT & GAME LOOP
// =============================================================================

export default function TetrisApp() {
  // ── Game state ────────────────────────────────────────────────────────────
  // Mutable game state lives in a ref (no re-renders on every tick)
  const game = useRef(null);

  // ── UI state (triggers re-renders only for panel updates) ─────────────────
  const [ui, setUi] = useState({
    score: 0,
    lines: 0,
    level: 1,
    status: "idle", // "idle" | "playing" | "paused" | "over"
    preset: "S",
    rotAxis: "Y",
    lastClears: [], // recent clear types for display
    nextPiece: null,
  });

  // Refs
  const sceneRef = useRef(null); // TetrisScene handle
  const dropTimerRef = useRef(null);
  const softDropRef = useRef(false);
  const rotAxisRef = useRef("Y");

  // ── Sync Three.js scene from current game state ──────────────────────────
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

  // ── Drop timer ────────────────────────────────────────────────────────────
  const startDropTimer = useCallback((level) => {
    if (dropTimerRef.current) clearInterval(dropTimerRef.current);
    const interval = softDropRef.current
      ? Math.min(dropSpeed(level), 80)
      : dropSpeed(level);
    dropTimerRef.current = setInterval(() => {
      tick(); // eslint-disable-line no-use-before-define
    }, interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core tick (gravity) ───────────────────────────────────────────────────
  const tick = useCallback(() => {
    const g = game.current;
    if (!g || g.status !== "playing") return;

    const fallen = g.piece.cells.map(([x, y, z]) => [x, y - 1, z]);

    if (canPlace(g.grid, fallen, g.W, g.D, g.H)) {
      // Piece moves down one step
      g.piece = { ...g.piece, cells: fallen };
    } else {
      // Piece lands — stamp to grid
      stampCells(g.grid, g.piece.cells, g.piece.color, g.W, g.D);

      // Check and clear lines
      const { newGrid, clears, totalScore } = checkAndClear(
        g.grid,
        g.W,
        g.D,
        g.H,
      );
      g.grid = newGrid;
      g.score += totalScore;
      g.lines += clears.filter((c) => c.type === "layer").length;
      g.level = 1 + Math.floor(g.lines / 10);

      // Spawn next piece
      const next = g.nextPiece;
      g.piece = next;
      g.nextPiece = spawnPiece(g.W, g.D, g.H); // pre-generate

      // Game over if spawn position is blocked
      if (!canPlace(g.grid, g.piece.cells, g.W, g.D, g.H)) {
        g.status = "over";
        clearInterval(dropTimerRef.current);
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

      // Update timer for new level
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
  }, [syncScene, startDropTimer]);

  // ── Start / restart game ──────────────────────────────────────────────────
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
      });
    },
    [syncScene, startDropTimer],
  );

  // ── Player actions ────────────────────────────────────────────────────────

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
    setTimeout(() => tick(), 10); // brief visual flash then lock
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

  // ── Keyboard binding ──────────────────────────────────────────────────────
  useGameInput({
    onMove: movePiece,
    onRotate: rotatePiece,
    onCycleAxis: cycleAxis,
    onHardDrop: hardDrop,
    onTogglePause: togglePause,
    onSoftDrop: softDrop,
  });

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => clearInterval(dropTimerRef.current);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const {
    score,
    lines,
    level,
    status,
    preset,
    rotAxis,
    lastClears,
    nextPiece,
  } = ui;
  const isPlaying = status === "playing";
  const isPaused = status === "paused";
  const isOver = status === "over";
  const isIdle = status === "idle";

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
          <span style={S.headerHint}>
            WASD · Tab={rotAxis} · Q/E=rotar · Spc=drop
          </span>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div style={S.body}>
        {/* LEFT — 3D scene */}
        <div style={S.leftCol}>
          <div style={S.sceneBox}>
            <TetrisScene ref={sceneRef} preset={preset} />

            {/* Overlay when paused / over / idle */}
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

            {/* Clear flash */}
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

          {/* Next piece preview */}
          {nextPiece && (
            <div style={S.nextCard}>
              <span style={S.sectionTitle}>SIGUIENTE</span>
              <NextPieceDisplay piece={nextPiece} />
            </div>
          )}

          {/* On-screen controls */}
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

          {/* Pause / hard drop buttons */}
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

          {/* Legend */}
          <LineLegend />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// §9 — UI COMPONENTS
// =============================================================================

/** Brief animated banner when lines are cleared. */
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

/** Mini flat preview of the next piece shape (2D top-down view). */
function NextPieceDisplay({ piece }) {
  if (!piece) return null;
  const cells = piece.cells;
  const minX = Math.min(...cells.map((c) => c[0]));
  const minZ = Math.min(...cells.map((c) => c[2]));
  const maxX = Math.max(...cells.map((c) => c[0])) - minX;
  const maxZ = Math.max(...cells.map((c) => c[2])) - minZ;
  const CELL = 13;
  const GRID_W = (maxX + 1) * (CELL + 2);
  const GRID_H = (maxZ + 1) * (CELL + 2);

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
      <div style={{ position: "relative", width: GRID_W, height: GRID_H }}>
        {Array.from({ length: maxZ + 1 }, (_, z) =>
          Array.from({ length: maxX + 1 }, (_, x) => {
            const key = `${x},${z}`;
            const fill = placed.has(key);
            return (
              <div
                key={key}
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

/** Legend explaining the three clear types. */
function LineLegend() {
  const items = [
    {
      label: "Capa completa",
      sub: `W × D cubos → layer clear`,
      color: "#22C55E",
    },
    // {
    //   label: "Diagonal",
    //   sub: `W cubos en diagonal (caja cuadrada)`,
    //   color: "#3B9EFF",
    // },
    {
      label: "Columna vertical",
      sub: `Columna llena hasta umbral amarillo`,
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
          ["Tab", "eje rot."],
          ["Spc", "drop"],
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

// =============================================================================
// §10 — STYLES
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

  // Header
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
  headerControls: { display: "flex", alignItems: "center" },
  headerHint: {
    fontSize: 10,
    color: "#445",
    background: "#ffffff09",
    padding: "3px 9px",
    borderRadius: 7,
    border: "1px solid #ffffff0f",
    fontFamily: "monospace",
  },

  // Layout
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

  // Scene
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
    animation: "flashIn 0.2s ease",
  },

  // Preset row
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

  // Score
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

  // Next piece
  nextCard: {
    ...CARD,
    display: "flex",
    flexDirection: "column",
    gap: 9,
    alignItems: "center",
  },

  // Controls
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
    ":hover": { background: "#2a2a40" },
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

  // Legend
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
};
