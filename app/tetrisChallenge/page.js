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
import { useUserStore } from "../store/userStore";

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
// §1b — QUIZ CONFIGURATION
// =============================================================================

/** How many pieces must land before the next quiz.
 *  Level 1–3 → every 3 · Level 4–6 → every 2 · Level 7+ → every 1 */
const quizInterval = (level) => (level <= 3 ? 3 : level <= 6 ? 2 : 1);

const QUIZ_FAST_SEC = 3; // seconds threshold for speed bonus
const QUIZ_BASE_MULT = 30; // pts per cell × per level
const QUIZ_SPEED_MULT = 20; // extra pts per level for answering quickly

// =============================================================================
// §2 — PIECE LIBRARY
//
//   ╔══════════════════════════════════════════════════════════════════════╗
//   ║  INSERT YOUR PIECES HERE                                            ║
//   ║  Format: { id, name, color, cells: [[x,y,z], ...] }                ║
//   ║  y = vertical axis (0 = bottom of piece, grows upward)             ║
//   ╚══════════════════════════════════════════════════════════════════════╝
function makeGrid(w, h, z = 0) {
  const cubes = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) cubes.push([x, y, z]);
  return cubes;
}

function makeTriangle(base, z = 0) {
  const cubes = [];
  for (let i = 0; i < base; i++)
    for (let j = 0; j <= i; j++) cubes.push([j, base - 1 - i, z]); // filas decrecientes en y
  return cubes;
}

function makeBox(w, d, h) {
  const cubes = [];
  for (let x = 0; x < w; x++)
    for (let y = 0; y < d; y++)
      for (let z = 0; z < h; z++) cubes.push([x, y, z]);
  return cubes;
}
const USER_PIECES = [
  // ── 1. Figuras originales (15) ───────────────────────────────────────────
  {
    id: "unit",
    name: "Unidad",
    count: 1,
    color: "#FF6B6B", // count 1 → key 1
    cells: [[0, 0, 0]],
  },
  {
    id: "domino",
    name: "Dominó",
    count: 2,
    color: "#FF9F43", // count 2 → key 2
    cells: [
      [0, 0, 0],
      [1, 0, 0],
    ],
  },
  {
    id: "trio",
    name: "Trío",
    count: 3,
    color: "#FECA57", // count 3 → key 3
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ],
  },
  {
    id: "square4",
    name: "Cuadrado 2×2",
    count: 4,
    color: "#48CA8B", // count 4 → key 4
    cells: makeGrid(2, 2),
  },
  {
    id: "lshape",
    name: "Ele (L)",
    count: 4,
    color: "#48CA8B", // count 4 → key 4
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [2, 0, 1],
    ],
  },
  {
    id: "Ishape",
    name: "I",
    count: 4,
    color: "#48CA8B", // count 4 → key 4
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ],
  },
  {
    id: "Ishape5",
    name: "I",
    count: 5,
    color: "#48CA8B", // count 4 → key 4
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
    ],
  },
  {
    id: "lshape2",
    name: "Ele (L2)",
    count: 8,
    color: "#FF6EB4", // count 8 → key 8
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [2, 0, 1],
      [0, 1, 0],
      [1, 1, 0],
      [2, 1, 0],
      [2, 1, 1],
    ],
  },
  {
    id: "cross",
    name: "Cruz  T",
    count: 5,
    color: "#00D2D3", // count 5 → key 5
    cells: [
      [0, 0, 1],
      [0, 0, 0],
      [1, 0, 1],
      [2, 0, 1],
      [0, 0, 2],
    ],
  },
  {
    id: "cross",
    name: "Cruz  T2u",
    count: 10,
    color: "#E74C3C", // count 10 → key 10
    cells: [
      [0, 0, 1],
      [0, 0, 0],
      [1, 0, 1],
      [2, 0, 1],
      [0, 0, 2],
      [0, 1, 1],
      [0, 1, 0],
      [1, 1, 1],
      [2, 1, 1],
      [0, 1, 2],
    ],
  },
  //   {
  //     id: "crosser",
  //     name: "Cruz  T3",
  //     count: 15,
  //     color: "#9B59B6", // count 15 → (15-1)%12+1 = 3 → key 3? (15 mod 12 = 3) → #FECA57
  //     // Nota: 15 % 12 = 3, pero ajustamos: ((15-1)%12)+1 = 3, correcto.
  //     color: "#FECA57",
  //     cells: [
  //       [0, 0, 1],
  //       [0, 0, 0],
  //       [1, 0, 1],
  //       [2, 0, 1],
  //       [0, 0, 2],
  //       [0, 1, 1],
  //       [0, 1, 0],
  //       [1, 1, 1],
  //       [2, 1, 1],
  //       [0, 1, 2],
  //       [0, 2, 1],
  //       [0, 2, 0],
  //       [1, 2, 1],
  //       [2, 2, 1],
  //       [0, 2, 2],
  //     ],
  //   },
  //   {
  //     id: "pyramid",
  //     name: "Pirámide",
  //     count: 5,
  //     color: "#00D2D3", // count 5 → key 5
  //     cells: [
  //       [0, 0, 0],
  //       [1, 0, 0],
  //       [0, 0, 1],
  //       [1, 0, 1],
  //       [0, 1, 0],
  //     ],
  //   },
  {
    id: "rect6",
    name: "Rectángulo 2×3",
    count: 6,
    color: "#54A0FF", // count 6 → key 6
    cells: makeGrid(3, 2),
  },
  // {
  //   id: "stair6",
  //   name: "Escalera 1+2+3",
  //   count: 6,
  //   color: "#54A0FF", // count 6 → key 6
  //   cells: [
  //     [0, 0, 2],
  //     [0, 0, 1],
  //     [1, 0, 1],
  //     [0, 0, 0],
  //     [1, 0, 0],
  //     [2, 0, 0],
  //   ],
  // },
  {
    id: "arch",
    name: "Arco ∪",
    count: 7,
    color: "#5F27CD", // count 7 → key 7
    cells: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
      [1, 2, 0],
      [2, 2, 0],
      [2, 1, 0],
      [2, 0, 0],
    ],
  },
  //   {
  //     id: "arch3",
  //     name: "Arco 3∪",
  //     count: 21,
  //     color: "#F39C12", // count 21 → (21-1)%12+1 = 9? 21 mod 12 = 9 → #2ECC71? No: ((21-1)%12)+1 = 9, key 9 → #2ECC71
  //     // Recalculemos: (21-1)=20, 20%12=8, +1=9 → key 9: #2ECC71
  //     color: "#2ECC71",
  //     cells: [
  //       [0, 0, 0],
  //       [0, 1, 0],
  //       [0, 2, 0],
  //       [1, 2, 0],
  //       [2, 2, 0],
  //       [2, 1, 0],
  //       [2, 0, 0],
  //       [0, 0, 1],
  //       [0, 1, 1],
  //       [0, 2, 1],
  //       [1, 2, 1],
  //       [2, 2, 1],
  //       [2, 1, 1],
  //       [2, 0, 1],
  //       [0, 0, 2],
  //       [0, 1, 2],
  //       [0, 2, 2],
  //       [1, 2, 2],
  //       [2, 2, 2],
  //       [2, 1, 2],
  //       [2, 0, 2],
  //     ],
  //   },
  {
    id: "arch2",
    name: "Arco 2∪",
    count: 14,
    color: "#FF9F43", // count 14 → (14-1)%12+1 = 2 → key 2: #FF9F43
    cells: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
      [1, 2, 0],
      [2, 2, 0],
      [2, 1, 0],
      [2, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 2, 1],
      [1, 2, 1],
      [2, 2, 1],
      [2, 1, 1],
      [2, 0, 1],
    ],
  },
  {
    id: "zigzag",
    name: "Zigzag 3D",
    count: 7,
    color: "#5F27CD", // count 7 → key 7
    cells: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
      [0, 3, 0],
      [0, 4, 0],
      [0, 5, 0],
      [0, 6, 0],
    ],
  },
  {
    id: "cube8",
    name: "Cubo 2³",
    count: 8,
    color: "#FF6EB4", // count 8 → key 8
    cells: makeBox(2, 2, 2),
  },
  {
    id: "square9",
    name: "Cuadrado 3×3",
    count: 9,
    color: "#2ECC71", // count 9 → key 9
    cells: makeGrid(3, 3),
  },
  {
    id: "triangle10",
    name: "Triángulo T₄",
    count: 10,
    color: "#E74C3C", // count 10 → key 10
    cells: makeTriangle(4),
  },
  {
    id: "dozen",
    name: "Docena 3×4",
    count: 12,
    color: "#F39C12", // count 12 → key 12
    cells: makeGrid(4, 3),
  },
  {
    id: "dozen",
    name: "Docena 2×6",
    count: 12,
    color: "#F39C12", // count 12 → key 12
    cells: makeGrid(2, 6),
  },

  // ── 2. Nuevas figuras (35) ───────────────────────────────────────────────
  //   {
  //     id: "esquina4",
  //     name: "Esquina 3D",
  //     count: 4,
  //     color: "#48CA8B", // count 4 → key 4
  //     cells: [
  //       [0, 0, 0],
  //       [1, 0, 0],
  //       [1, 1, 0],
  //       [1, 1, 1],
  //     ],
  //   },
  {
    id: "tee5",
    name: "T 3D",
    count: 5,
    color: "#00D2D3", // count 5 → key 5
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [1, 1, 0],
      [1, 0, 1],
    ],
  },
  //   {
  //     id: "tee6",
  //     name: "T 3D L",
  //     count: 6,
  //     color: "#54A0FF", // count 6 → key 6
  //     cells: [
  //       [0, 0, 0],
  //       [1, 0, 0],
  //       [2, 0, 0],
  //       [1, 1, 0],
  //       [1, 0, 1],
  //       [1, 0, 2],
  //     ],
  //   },
  //   {
  //     id: "tee7",
  //     name: "3D axis",
  //     count: 7,
  //     color: "#5F27CD", // count 7 → key 7
  //     cells: [
  //       [0, 0, 0],
  //       [-1, 0, 0],
  //       [1, 0, 0],
  //       [1, 2, 0],
  //       [1, 1, 0],
  //       [1, 0, 1],
  //       [1, 0, 2],
  //     ],
  //   },
  //   {
  //     id: "cruz3d6",
  //     name: "Cruz 3D",
  //     count: 6,
  //     color: "#54A0FF", // count 6 → key 6
  //     cells: [
  //       [1, 1, 1],
  //       [0, 1, 1],
  //       [2, 1, 1],
  //       [1, 0, 1],
  //       [1, 2, 1],
  //       [1, 1, 2],
  //     ],
  //   },
  // {
  //   id: "escalera7",
  //   name: "Escalera 7",
  //   count: 7,
  //   color: "#5F27CD", // count 7 → key 7
  //   cells: [
  //     [0, 0, 0],
  //     [1, 0, 0],
  //     [1, 1, 0],
  //     [2, 1, 0],
  //     [2, 1, 1],
  //     [3, 1, 1],
  //     [3, 2, 1],
  //   ],
  // },
  {
    id: "anillo8",
    name: "Anillo",
    count: 8,
    color: "#FF6EB4", // count 8 → key 8
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [2, 1, 0],
      [2, 2, 0],
      [1, 2, 0],
      [0, 2, 0],
      [0, 1, 0],
    ],
  },
  {
    id: "anillo16",
    name: "Anillox2",
    count: 16,
    color: "#F39C12", // count 16 → (16-1)%12+1 = 4 → key 4? (16 mod 12 = 4) → #48CA8B? Recalcular: (16-1)=15, 15%12=3, +1=4 → key 4: #48CA8B
    color: "#48CA8B",
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [2, 1, 0],
      [2, 2, 0],
      [1, 2, 0],
      [0, 2, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
      [2, 1, 1],
      [2, 2, 1],
      [1, 2, 1],
      [0, 2, 1],
      [0, 1, 1],
    ],
  },
  //   {
  //     id: "corner_3d",
  //     name: "esquina  ",
  //     count: 10,
  //     color: "#E74C3C", // count 10 → key 10
  //     cells: [
  //       [0, 0, 0],
  //       [0, 1, 0],
  //       [1, 1, 1],
  //       [0, 0, 1],
  //       [-1, 0, 0],
  //       [1, 0, 0],
  //       [1, 2, 0],
  //       [1, 1, 0],
  //       [1, 0, 1],
  //       [1, 0, 2],
  //     ],
  //   },
  // {
  //   id: "corner_3d F",
  //   name: "esquina Completa  ",
  //   count: 11,
  //   color: "#9B59B6", // count 11 → key 11
  //   cells: [
  //     [0, 0, 0],
  //     [0, 1, 0],
  //     [1, 1, 1],
  //     [0, 0, 1],
  //     [0, 1, 1],
  //     [-1, 0, 0],
  //     [1, 0, 0],
  //     [1, 2, 0],
  //     [1, 1, 0],
  //     [1, 0, 1],
  //     [1, 0, 2],
  //   ],
  // },
  // 22 omitido (estaba comentado)
  // 23
  {
    id: "rect11_falta",
    name: "Rectángulo 3×4 incompleto",
    count: 11,
    color: "#9B59B6", // count 11 → key 11
    cells: (() => {
      const c = makeGrid(3, 4); // 12 cubos
      return c.filter(([x, y]) => !(x === 2 && y === 3)); // quita (2,3,0)
    })(),
  },
  // 24
  {
    id: "cajon12",
    name: "Cajón 2×2×3",
    count: 12,
    color: "#F39C12", // count 12 → key 12
    cells: makeBox(2, 2, 3),
  },
  //   {
  //     id: "cajon18B",
  //     name: "Cajón 4×4 +2",
  //     count: 18,
  //     color: "#00D2D3", // count 18 → (18-1)%12+1 = 6 → key 6: #54A0FF? (18%12=6) → key 6: #54A0FF
  //     color: "#54A0FF",
  //     cells: (() => [...makeGrid(4, 4), [0, 0, 1], [1, 0, 1]])(),
  //   },
  // 25
  //   {
  //     id: "shape13",
  //     name: "13 plano",
  //     count: 13,
  //     color: "#FF6B6B", // count 13 → (13-1)%12+1 = 1 → key 1: #FF6B6B
  //     cells: (() => [
  //       ...makeGrid(3, 3),
  //       [0, 0, 1],
  //       [1, 0, 1],
  //       [2, 0, 1],
  //       [2, 1, 1],
  //     ])(),
  //   },
  // 26
  {
    id: "rect14",
    name: "Rectángulo 2×7",
    count: 14,
    color: "#FF9F43", // count 14 → key 2: #FF9F43
    cells: makeGrid(7, 2),
  },
  {
    id: "3x3+5",
    name: "Rectángulo 3x3+5",
    count: 14,
    color: "#FF9F43", // count 14 → key 2: #FF9F43
    cells: (() => [
      ...makeGrid(3, 3),
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
    ])(),
  },
  // 27
  //   {
  //     id: "triang15",
  //     name: "Triángulo T₅",
  //     count: 15,
  //     color: "#FECA57", // count 15 → key 3: #FECA57
  //     cells: makeTriangle(5),
  //   },
  // 28
  {
    id: "cuadrado16",
    name: "Cuadrado 4×4",
    count: 16,
    color: "#48CA8B", // count 16 → key 4: #48CA8B
    cells: makeGrid(4, 4),
  },
  {
    id: "prisma16",
    name: "Prisma 4×2x2",
    count: 16,
    color: "#48CA8B", // count 16 → key 4: #48CA8B
    cells: makeBox(4, 2, 2),
  },
  // 29
  //   {
  //     id: "primo17",
  //     name: "Línea 17",
  //     count: 17,
  //     color: "#00D2D3", // count 17 → key 5: #00D2D3
  //     cells: (() => [...makeGrid(5, 3), [0, 0, 1], [1, 0, 1]])(),
  //   },
  //   {
  //     id: "primo17sq",
  //     name: "cuadrado 17",
  //     count: 17,
  //     color: "#00D2D3", // count 17 → key 5: #00D2D3
  //     cells: (() => [...makeGrid(5, 3), [0, 0, 1], [1, 0, 1]])(),
  //   },
  {
    id: "anillo16",
    name: "Anillox2 +1 ",
    count: 17,
    color: "#00D2D3", // count 17 → key 5: #00D2D3
    cells: [
      [0, 0, 0],
      [1, 1, 0],
      [1, 0, 0],
      [2, 0, 0],
      [2, 1, 0],
      [2, 2, 0],
      [1, 2, 0],
      [0, 2, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
      [2, 1, 1],
      [2, 2, 1],
      [1, 2, 1],
      [0, 2, 1],
      [0, 1, 1],
    ],
  },
  // 30
  {
    id: "cajon18",
    name: "Cajón 2×3×3",
    count: 18,
    color: "#54A0FF", // count 18 → key 6: #54A0FF
    cells: makeBox(2, 3, 3),
  },
  // 31
  //   {
  //     id: "primo19",
  //     name: "Línea 19",
  //     count: 19,
  //     color: "#5F27CD", // count 19 → key 7: #5F27CD
  //     cells: (() => [...makeBox(3, 2, 2), [1, 1, 2]])(),
  //   },
  //   {
  //     id: "primo19B",
  //     name: "rectangulo 5x3 + 4 ",
  //     count: 19,
  //     color: "#5F27CD", // count 19 → key 7: #5F27CD
  //     cells: (() => [
  //       ...makeGrid(5, 3),
  //       [0, 0, 1],
  //       [1, 0, 1],
  //       [2, 0, 1],
  //       [3, 0, 1],
  //     ])(),
  //   },
  {
    id: "primo19a",
    name: "Prisma 3x3x2 + 1 ",
    count: 19,
    color: "#5F27CD", // count 19 → key 7: #5F27CD
    cells: (() => [...makeBox(3, 3, 2), [1, 1, 2]])(),
  },
  // 32
  {
    id: "cajon20",
    name: "Cajón 2×2×5",
    count: 20,
    color: "#FF6EB4", // count 20 → key 8: #FF6EB4
    cells: makeBox(2, 2, 5),
  },
  {
    id: "cajon20A",
    name: "Cudrado 4×5",
    count: 20,
    color: "#FF6EB4", // count 20 → key 8: #FF6EB4
    cells: makeGrid(4, 5),
  },
  // 33
  {
    id: "triang21",
    name: "Triángulo T₆",
    count: 21,
    color: "#2ECC71", // count 21 → key 9: #2ECC71
    cells: makeTriangle(6),
  },
  {
    id: "Prisma21",
    name: "cuadrado 21",
    count: 21,
    color: "#2ECC71", // count 21 → key 9: #2ECC71
    cells: makeGrid(3, 7),
  },
  //   {
  //     id: "Prisma21S",
  //     name: "suma de dos rectangulos",
  //     count: 21,
  //     color: "#2ECC71", // count 21 → key 9: #2ECC71
  //     cells: (() => [
  //       ...makeGrid(3, 4).map(([x, y]) => [x, y, 0]),
  //       ...makeGrid(3, 3).map(([x, y]) => [x, y, 1]),
  //     ])(),
  //   },
  // 34
  {
    id: "rect22",
    name: "Rectángulo 2×11",
    count: 22,
    color: "#E74C3C", // count 22 → key 10: #E74C3C
    cells: (() => [
      ...makeGrid(9, 2).map(([x, y]) => [x, y, 0]),
      ...makeGrid(2, 2).map(([x, y]) => [x, y, 1]),
    ])(),
  },
  {
    id: "Cajon22",
    name: "cajon 2×5X2",
    count: 22,
    color: "#E74C3C", // count 22 → key 10: #E74C3C
    cells: (() => [...makeBox(2, 5, 2), [0, 0, 2], [1, 0, 2]])(),
  },
  // 35
  {
    id: "cajon24",
    name: "Cajón 2×3×4",
    count: 24,
    color: "#F39C12", // count 24 → key 12: #F39C12? (24 mod 12 = 0) → key 12: #F39C12
    cells: makeBox(2, 3, 4),
  },
  // 36
  {
    id: "cuadrado25",
    name: "Cuadrado 5×5",
    count: 25,
    color: "#FF6B6B", // count 25 → (25-1)%12+1 = 1 → key 1: #FF6B6B
    cells: makeGrid(5, 5),
  },

  {
    id: "cubo27",
    name: "Cubo 3³",
    count: 27,
    color: "#FECA57", // count 27 → key 3: #FECA57
    cells: makeBox(3, 3, 3),
  },
  // 39
  {
    id: "cajon28",
    name: "Cajón 2×2×7",
    count: 28,
    color: "#48CA8B", // count 28 → key 4: #48CA8B
    cells: makeBox(2, 2, 7),
  },
  // 40
  {
    id: "cajon30",
    name: "Cajón 2×3×5",
    count: 30,
    color: "#54A0FF", // count 30 → key 6: #54A0FF? (30%12=6)
    cells: makeBox(2, 3, 5),
  },
  // 41
  {
    id: "cajon32",
    name: "Cajón 2×4×4",
    count: 32,
    color: "#FF6EB4", // count 32 → key 8: #FF6EB4
    cells: makeBox(2, 4, 4),
  },
  // 42
  {
    id: "cajon36",
    name: "Cajón 3×3×4",
    count: 36,
    color: "#2ECC71", // count 36 → key 9? (36%12=0 → key 12: #F39C12? Recalcular: (36-1)=35, 35%12=11, +1=12 → key 12: #F39C12)
    color: "#F39C12",
    cells: makeBox(3, 3, 4),
  },
  // 43
  {
    id: "cajon40",
    name: "Cajón 2×4×5",
    count: 40,
    color: "#E74C3C", // count 40 → key 10: #E74C3C? (40%12=4 → key 4? No, (40-1)=39, 39%12=3, +1=4 → key 4: #48CA8B)
    // Corrijo: 40-1=39, 39%12=3, +1=4 → key 4
    color: "#48CA8B",
    cells: makeBox(2, 4, 5),
  },
  // 44
  {
    id: "cajon42",
    name: "Cajón 2×3×7",
    count: 42,
    color: "#9B59B6", // count 42 → key 11? (42%12=6 → key 6? No: (42-1)=41, 41%12=5, +1=6 → key 6: #54A0FF)
    color: "#54A0FF",
    cells: makeBox(2, 3, 7),
  },
  // 45
  {
    id: "cajon48",
    name: "Cajón 3×4×4",
    count: 48,
    color: "#F39C12", // count 48 → key 12? (48%12=0 → key 12: #F39C12)
    cells: makeBox(3, 4, 4),
  },
  // 46
  {
    id: "cajon50",
    name: "Cajón 2×5×5",
    count: 50,
    color: "#FF6B6B", // count 50 → key 2? (50-1)=49, 49%12=1, +1=2 → key 2: #FF9F43
    color: "#FF9F43",
    cells: makeBox(2, 5, 5),
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

// Axis identity
const AXIS_COLOR = { X: "#ff4444", Y: "#44ff88", Z: "#4488ff" };
const AXIS_THREE = { X: 0xff4444, Y: 0x44ff88, Z: 0x4488ff };
const AXIS_LABEL = { X: "← X →", Y: "↕ Y ↕", Z: "← Z →" };

/**
 * Draw the XYZ orientation gizmo on a small 2D canvas.
 * Uses the same spherical angles as the Three.js orbit so it always matches.
 *
 *  Camera right  = [ cos(rotY),                  0,               -sin(rotY)           ]
 *  Camera up     = [-sin(rotY)*sin(rotX),  cos(rotX), -cos(rotY)*sin(rotX)             ]
 *
 * Projecting world vector [wx,wy,wz] to 2-D:
 *   sx =  dot([wx,wy,wz], right)
 *   sy = -dot([wx,wy,wz], up)      (flip Y for screen-space)
 */
function drawGizmo(canvas, rotX, rotY, activeAxis) {
  const CW = canvas.width,
    CH = canvas.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, CW, CH);

  const cx = CW / 2,
    cy = CH / 2;
  const SCALE = Math.min(CW, CH) * 0.3;

  const sinY = Math.sin(rotY),
    cosY = Math.cos(rotY);
  const sinX = Math.sin(rotX),
    cosX = Math.cos(rotX);

  const project = (wx, wy, wz) => ({
    sx: (wx * cosY - wz * sinY) * SCALE,
    sy: -(-wx * sinY * sinX - wz * cosY * sinX + wy * cosX) * SCALE,
  });

  const axes = [
    { id: "X", dir: [1, 0, 0] },
    { id: "Y", dir: [0, 1, 0] },
    { id: "Z", dir: [0, 0, 1] },
  ].map((a) => ({ ...a, ...project(...a.dir) }));

  // Depth-sort: draw back-to-front so near axes paint over far ones
  axes.sort((a, b) => {
    const depth = ([wx, wy, wz]) =>
      wx * (-sinY * cosX) + wy * sinX + wz * (-cosY * cosX);
    return depth(a.dir) - depth(b.dir);
  });

  // Background disc
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#060614";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(CW, CH) / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Thin border ring
  ctx.strokeStyle = "#ffffff12";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(CW, CH) / 2 - 1, 0, Math.PI * 2);
  ctx.stroke();

  axes.forEach(({ id, sx, sy }) => {
    const active = id === activeAxis;
    const hex = AXIS_COLOR[id];
    const alpha = active ? 1.0 : 0.45;
    const lw = active ? 2.5 : 1.4;
    const dotR = active ? 5 : 3;
    const ex = cx + sx,
      ey = cy + sy;
    const lx = cx + sx * 1.42,
      ly = cy + sy * 1.42;

    ctx.globalAlpha = alpha;

    // Axis line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = hex;
    ctx.lineWidth = lw;
    ctx.setLineDash(active ? [] : [3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Endpoint dot
    ctx.beginPath();
    ctx.arc(ex, ey, dotR, 0, Math.PI * 2);
    ctx.fillStyle = hex;
    ctx.fill();

    // Label
    ctx.fillStyle = active ? "#fff" : hex;
    ctx.font = `${active ? "bold " : ""}${active ? 11 : 9}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(id, lx, ly);
  });

  ctx.globalAlpha = 1;
}

/**
 * Build a Three.js Line that runs through the bounding center of the active piece
 * along the given rotation axis. Used as an in-scene visual hint.
 */
function buildAxisLine(cells, axis, W, D) {
  const xs = cells.map((c) => c[0]),
    ys = cells.map((c) => c[1]),
    zs = cells.map((c) => c[2]);
  const bcx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const bcy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const bcz = (Math.min(...zs) + Math.max(...zs)) / 2;

  const [wcx, wcy, wcz] = worldPos(bcx, bcy, bcz, W, D);

  // Extend 2.5 units beyond the bounding box along the chosen axis
  const halfSpan =
    Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      Math.max(...zs) - Math.min(...zs),
    ) /
      2 +
    2.5;

  const [dx, dy, dz] =
    axis === "X" ? [1, 0, 0] : axis === "Y" ? [0, 1, 0] : [0, 0, 1];

  const pts = [
    new THREE.Vector3(
      wcx - dx * halfSpan,
      wcy - dy * halfSpan,
      wcz - dz * halfSpan,
    ),
    new THREE.Vector3(
      wcx + dx * halfSpan,
      wcy + dy * halfSpan,
      wcz + dz * halfSpan,
    ),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: AXIS_THREE[axis],
    transparent: true,
    opacity: 0.92,
    linewidth: 2, // only >1 on WebGL2 with line ext
    depthTest: false, // always visible, even inside geometry
  });
  return new THREE.Line(geo, mat);
}

/**
 * TetrisScene
 * Props:
 *   preset        — "S" | "L"
 *   onTouchRotate — called with dir (+1|-1) when a swipe gesture is detected
 *   onTouchMove   — called with (dx, dz) for swipe-to-move (optional, for future use)
 *
 * Ref methods (via useImperativeHandle):
 *   updateGrid(grid, W, D, H)
 *   updatePiece(cells, color)
 *   updateGhost(cells, color)
 *   showAxisLine(cells, axis)   — shows the axis line inside the piece
 *   hideAxisLine()              — removes it from scene
 *   setRotAxis(axis)            — updates gizmo highlight without showing line
 *   reinit(W, D, H)
 */
const TetrisScene = forwardRef(function TetrisScene(
  { preset, onTouchRotate, onTouchMove },
  ref,
) {
  const mountRef = useRef(null);
  const gizmoRef = useRef(null); // <canvas> for the XYZ gizmo overlay
  const threeRef = useRef(null);
  const callbackRef = useRef({ onTouchRotate, onTouchMove });
  const _mat = new THREE.Matrix4();
  const _color = new THREE.Color();

  // Keep callbacks fresh without re-running the heavy useEffect
  useEffect(() => {
    callbackRef.current = { onTouchRotate, onTouchMove };
  }, [onTouchRotate, onTouchMove]);

  // ── Instance helper ────────────────────────────────────────────────────────
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

  // ── Public API ─────────────────────────────────────────────────────────────
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
        applyInstances(
          t.pieceMesh,
          cells.map(([x, y, z]) => {
            const [wx, wy, wz] = worldPos(x, y, z, t.W, t.D);
            return { wx, wy, wz, hex: color };
          }),
        );
      },

      updateGhost(cells, color) {
        const t = threeRef.current;
        if (!t || !cells) {
          if (t) t.ghostMesh.count = 0;
          return;
        }
        applyInstances(
          t.ghostMesh,
          cells.map(([x, y, z]) => {
            const [wx, wy, wz] = worldPos(x, y, z, t.W, t.D);
            return { wx, wy, wz, hex: color };
          }),
        );
      },

      /** Draw the rotation-axis line through the active piece, then remove after 1 s. */
      showAxisLine(cells, axis) {
        const t = threeRef.current;
        if (!t) return;
        // Remove previous
        if (t.axisLine) {
          t.scene.remove(t.axisLine);
          t.axisLine.geometry.dispose();
          t.axisLine = null;
        }
        const line = buildAxisLine(cells, axis, t.W, t.D);
        t.scene.add(line);
        t.axisLine = line;
      },

      hideAxisLine() {
        const t = threeRef.current;
        if (!t || !t.axisLine) return;
        t.scene.remove(t.axisLine);
        t.axisLine.geometry.dispose();
        t.axisLine = null;
      },

      /** Update which axis is highlighted in the gizmo without touching the scene line. */
      setRotAxis(axis) {
        const t = threeRef.current;
        if (t) t.activeAxis = axis;
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
  ); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Three.js init ─────────────────────────────────────────────────────────
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

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.28));
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
    const t = {
      renderer,
      scene,
      camera,
      orbitState,
      W,
      D,
      H,
      statics: [],
      axisLine: null,
      activeAxis: "Y",
    };
    threeRef.current = t;

    buildStatics(t, W, D, H);
    rebuildInstancedMeshes(t, W, D, H);
    fitCamera(camera, orbitState, W, D, H);

    // ── Render loop ─────────────────────────────────────────────────────────
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
      // Redraw gizmo overlay every frame so it tracks the camera
      if (gizmoRef.current)
        drawGizmo(gizmoRef.current, rotX, rotY, t.activeAxis || "Y");
    };
    render();

    // ── Mouse orbit ─────────────────────────────────────────────────────────
    const mouseDown = ({ clientX, clientY }) => {
      orbitState.dragging = true;
      orbitState.lastMX = clientX;
      orbitState.lastMY = clientY;
      el.style.cursor = "grabbing";
    };
    const mouseMove = ({ clientX, clientY }) => {
      if (!orbitState.dragging) return;
      orbitState.rotY += (clientX - orbitState.lastMX) * 0.013;
      orbitState.rotX = Math.max(
        -0.1,
        Math.min(1.5, orbitState.rotX - (clientY - orbitState.lastMY) * 0.009),
      );
      orbitState.lastMX = clientX;
      orbitState.lastMY = clientY;
    };
    const mouseUp = () => {
      orbitState.dragging = false;
      el.style.cursor = "grab";
    };

    // ── Touch: 1 finger = rotate piece swipe, 2 fingers = orbit camera ──────
    const SWIPE_THRESH = 28; // px minimum travel to register swipe
    const touch = {
      fingers: 0,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      fired: false,
    };

    const touchStart = (e) => {
      const tc = e.touches;
      touch.fingers = tc.length;
      touch.fired = false;
      if (tc.length === 1) {
        touch.startX = tc[0].clientX;
        touch.startY = tc[0].clientY;
        touch.lastX = tc[0].clientX;
        touch.lastY = tc[0].clientY;
      } else if (tc.length === 2) {
        // 2-finger orbit: track midpoint
        orbitState.dragging = true;
        const mx = (tc[0].clientX + tc[1].clientX) / 2;
        const my = (tc[0].clientY + tc[1].clientY) / 2;
        orbitState.lastMX = mx;
        orbitState.lastMY = my;
      }
    };

    const touchMove = (e) => {
      const tc = e.touches;
      if (tc.length === 2) {
        // 2-finger orbit
        const mx = (tc[0].clientX + tc[1].clientX) / 2;
        const my = (tc[0].clientY + tc[1].clientY) / 2;
        orbitState.rotY += (mx - orbitState.lastMX) * 0.013;
        orbitState.rotX = Math.max(
          -0.1,
          Math.min(1.5, orbitState.rotX - (my - orbitState.lastMY) * 0.009),
        );
        orbitState.lastMX = mx;
        orbitState.lastMY = my;
        return;
      }
      if (tc.length === 1 && !touch.fired) {
        const dx = tc[0].clientX - touch.startX;
        const dy = tc[0].clientY - touch.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > SWIPE_THRESH) {
          const isHoriz = Math.abs(dx) >= Math.abs(dy);
          const dir = isHoriz ? (dx > 0 ? 1 : -1) : dy > 0 ? 1 : -1;
          callbackRef.current.onTouchRotate?.(dir);
          touch.fired = true;
        }
        touch.lastX = tc[0].clientX;
        touch.lastY = tc[0].clientY;
      }
    };

    const touchEnd = () => {
      orbitState.dragging = false;
      touch.fingers = 0;
    };

    el.style.cursor = "grab";
    el.addEventListener("mousedown", mouseDown);
    el.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("mousemove", mouseMove);
    window.addEventListener("touchmove", touchMove, { passive: true });
    window.addEventListener("mouseup", mouseUp);
    window.addEventListener("touchend", touchEnd);

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
      el.removeEventListener("mousedown", mouseDown);
      el.removeEventListener("touchstart", touchStart);
      window.removeEventListener("mousemove", mouseMove);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("mouseup", mouseUp);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "inherit",
        position: "relative",
      }}
    >
      {/* XYZ orientation gizmo — 2D canvas, bottom-left corner */}
      <canvas ref={gizmoRef} width={96} height={96} style={S.gizmoCanvas} />
    </div>
  );
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
    // depthWrite: false,
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
  const { playerName } = useUserStore();

  const addScore = useCallback(
    (score, mode) => {
      const updated = addLeaderboardEntry(score, mode, playerName);
      setScores(updated);
      return updated;
    },
    [playerName],
  );

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
    fullscreen: false,
    quiz: null, // { piece, correctAnswer, level } | null
  });

  const sceneRef = useRef(null);
  const dropTimerRef = useRef(null);
  const softDropRef = useRef(false);
  const rotAxisRef = useRef("Y");
  const axisTimerRef = useRef(null); // auto-hide timer for axis line

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
      g.pieceCount++;

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

      // ── Quiz check ─────────────────────────────────────────────────────────
      // Every quizInterval(level) pieces, pause and show the counting quiz
      if (g.pieceCount % quizInterval(g.level) === 0) {
        clearInterval(dropTimerRef.current);
        g.status = "quiz";
        const quizPiece = { ...g.piece }; // snapshot before it moves
        setUi((u) => ({
          ...u,
          score: g.score,
          lines: g.lines,
          level: g.level,
          lastClears: clears.map((c) => c.type),
          nextPiece: g.nextPiece,
          quiz: {
            piece: quizPiece,
            correctAnswer: quizPiece.cells.length,
            level: g.level,
          },
        }));
        syncScene();
        return; // timer resumes when quiz closes
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
        pieceCount: 0, // tracks how many pieces have landed (used for quiz cadence)
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
        fullscreen: ui.fullscreen,
        quiz: null,
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
    // Show axis line through current piece, update gizmo highlight
    const g = game.current;
    if (g?.piece) sceneRef.current?.showAxisLine(g.piece.cells, next);
    sceneRef.current?.setRotAxis(next);
    // Auto-hide the axis line after 1.2 s
    if (axisTimerRef.current) clearTimeout(axisTimerRef.current);
    axisTimerRef.current = setTimeout(
      () => sceneRef.current?.hideAxisLine(),
      1200,
    );
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

  /**
   * Called when the quiz overlay closes.
   * @param {number} bonus — bonus points earned (0 if wrong/skipped)
   */
  const onQuizClose = useCallback(
    (bonus) => {
      const g = game.current;
      if (!g || g.status !== "quiz") return; // already closed / game over
      g.score += bonus;
      g.status = "playing";
      setUi((u) => ({ ...u, quiz: null, score: g.score }));
      startDropTimer(g.level);
      syncScene();
    },
    [startDropTimer, syncScene],
  );

  // Touch-swipe rotates the piece using the currently selected axis
  const handleTouchRotate = useCallback(
    (dir) => rotatePiece(dir),
    [rotatePiece],
  );

  // Fullscreen toggle using the Fullscreen API
  const containerRef = useRef(null);
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!document.fullscreenElement) {
      el?.requestFullscreen?.()
        .then(() => setUi((u) => ({ ...u, fullscreen: true })))
        .catch(() => {});
    } else {
      document
        .exitFullscreen?.()
        .then(() => setUi((u) => ({ ...u, fullscreen: false })))
        .catch(() => {});
    }
  }, []);

  useGameInput({
    onMove: movePiece,
    onRotate: rotatePiece,
    onCycleAxis: cycleAxis,
    onHardDrop: hardDrop,
    onTogglePause: togglePause,
    onSoftDrop: softDrop,
  });

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement)
        setUi((u) => ({ ...u, fullscreen: false }));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      clearInterval(dropTimerRef.current);
      clearTimeout(axisTimerRef.current);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, []);

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
    fullscreen,
    quiz,
  } = ui;
  const isPlaying = status === "playing" || status === "quiz";
  const isPaused = status === "paused";
  const isOver = status === "over";
  const isIdle = status === "idle";
  const topScores = [...scores].sort((a, b) => b.score - a.score).slice(0, 8);
  const axisHex =
    { X: "#ff4444", Y: "#44ff88", Z: "#4488ff" }[rotAxis] || "#fff";

  return (
    <div
      ref={containerRef}
      style={{ ...S.root, ...(fullscreen ? S.rootFullscreen : {}) }}
    >
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
          <button
            onClick={toggleFullscreen}
            style={{
              ...S.headerBtn,
              borderColor: fullscreen ? "#22C55E" : "#ffffff18",
              color: fullscreen ? "#22C55E" : "#556",
            }}
          >
            {fullscreen ? "⛶" : "⛶"} {fullscreen ? "Salir" : "Full"}
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
            <TetrisScene
              ref={sceneRef}
              preset={preset}
              onTouchRotate={handleTouchRotate}
            />

            {/* Axis HUD — current rotation axis indicator */}
            {isPlaying && (
              <div style={S.axisHud}>
                <span
                  style={{
                    color: "#888",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.6px",
                  }}
                >
                  EJE
                </span>
                <span
                  style={{
                    color: axisHex,
                    fontSize: 20,
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  {rotAxis}
                </span>
                <span style={{ color: axisHex, fontSize: 9, opacity: 0.7 }}>
                  {{ X: "←→", Y: "↕", Z: "↙↗" }[rotAxis]}
                </span>
              </div>
            )}

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
                      borderColor: axisHex,
                      color: axisHex,
                      background: axisHex + "18",
                      boxShadow: `0 0 8px ${axisHex}44`,
                    }}
                  >
                    <span style={{ fontSize: 10, opacity: 0.7 }}>Eje</span>{" "}
                    <span style={{ fontSize: 18, fontWeight: 900 }}>
                      {rotAxis}
                    </span>
                    <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 3 }}>
                      TAP
                    </span>
                  </button>
                  <button
                    onClick={() => rotatePiece(-1)}
                    style={{
                      ...S.rotBtn,
                      borderColor: axisHex + "66",
                      color: axisHex,
                    }}
                  >
                    ↺ CCW
                  </button>
                  <button
                    onClick={() => rotatePiece(1)}
                    style={{
                      ...S.rotBtn,
                      borderColor: axisHex + "66",
                      color: axisHex,
                    }}
                  >
                    ↻ CW
                  </button>
                </div>
                {/* Mobile swipe hint */}
                <div
                  style={{
                    fontSize: 9,
                    color: "#334",
                    textAlign: "center",
                    marginTop: 2,
                  }}
                >
                  📱 Deslizar ← → para rotar · 2 dedos para orbitar
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

      {/* ── Quiz overlay — rendered on top of everything ─────────────── */}
      {quiz && <QuizOverlay quiz={quiz} onClose={onQuizClose} />}
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
// §10b — QUIZ OVERLAY COMPONENTS
// =============================================================================

/**
 * PieceViewer — renders a polycube piece using Three.js.
 *
 * WebGL context safety: on every unmount we call
 *   renderer.forceContextLoss() → immediately frees the GPU context
 *   renderer.dispose()          → releases GPU buffers/textures
 *
 * This avoids the browser's ~8-context limit that was crashing the main
 * Tetris canvas after several quiz rounds.
 */
function PieceViewer({ piece, size = 200 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    if (!piece || !mountRef.current) return;
    const el = mountRef.current;

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    // ── Scene / camera ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);

    // ── Lighting ──────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.55);
    sun.position.set(6, 10, 8);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x88bbff, 0.55);
    rim.position.set(-5, 4, -6);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffddaa, 0.35);
    fill.position.set(5, -3, 5);
    scene.add(fill);

    // ── Piece geometry ────────────────────────────────────────────────────────
    const cells = piece.cells;
    const xs = cells.map((c) => c[0]),
      ys = cells.map((c) => c[1]),
      zs = cells.map((c) => c[2]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span =
      Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
        Math.max(...zs) - Math.min(...zs),
      ) + 1;

    const group = new THREE.Group();
    const toDispose = []; // every geo/mat/tex to free on cleanup

    // Shared geometry (one BoxGeometry reused across all cube meshes)
    const boxGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    const edgeGeo = new THREE.EdgesGeometry(boxGeo);
    toDispose.push(boxGeo, edgeGeo);

    cells.forEach(([x, y, z], i) => {
      // Golden-angle hue spread so each cube has a distinct color
      const hsl = `hsl(${(i * 137.5) % 360}, 82%, 62%)`;
      const col = new THREE.Color(hsl);

      const mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.22,
        metalness: 0.2,
        emissive: col,
        emissiveIntensity: 0.08,
      });
      toDispose.push(mat);

      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(x - cx, y - cy, z - cz);

      // Rivet-groove dark edge
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.4,
      });
      toDispose.push(edgeMat);
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));

      // Number sprite so the player can count each cube
      const sprite = makePieceNumberSprite(i + 1, hsl);
      toDispose.push(sprite.material.map, sprite.material);
      sprite.position.set(0, 0, CUBE_SIZE * 0.58);
      sprite.scale.setScalar(0.52);
      mesh.add(sprite);

      group.add(mesh);
    });

    scene.add(group);

    // Position camera to frame the whole piece
    camera.position.set(span * 1.3, span * 0.9, span * 1.6);
    camera.lookAt(0, 0, 0);

    // ── Render loop ───────────────────────────────────────────────────────────
    let rafId;
    const loop = () => {
      rafId = requestAnimationFrame(loop);
      group.rotation.y += 0.013;
      renderer.render(scene, camera);
    };
    loop();

    // ── Cleanup — MUST free the GL context explicitly ─────────────────────────
    return () => {
      cancelAnimationFrame(rafId);

      // Dispose every geo / mat / tex we created
      toDispose.forEach((obj) => {
        try {
          obj?.dispose();
        } catch (_) {}
      });

      // forceContextLoss() tells the browser to free the WebGL context NOW
      // instead of waiting for GC.  This is what prevents the ~8-context limit
      // from being hit after multiple quiz rounds.
      renderer.forceContextLoss();
      renderer.dispose();

      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [piece, size]);

  return (
    <div
      ref={mountRef}
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        overflow: "hidden",
      }}
    />
  );
}

/** Canvas sprite with a number label — used inside each cube in PieceViewer. */
function makePieceNumberSprite(n, hslColor) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.beginPath();
  ctx.arc(32, 32, 24, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = hslColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(32, 32, 24, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 32, 33);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    transparent: true,
  });
  return new THREE.Sprite(mat);
}

// Point feedback messages

// Point feedback messages by correctness + speed
const QUIZ_MSG_CORRECT_FAST = ["¡PERFECTO! ⚡", "¡VELOZ! 🚀", "¡EXACTO! ⭐"];
const QUIZ_MSG_CORRECT = ["¡CORRECTO! ✓", "¡MUY BIEN! 👍", "¡EXACTO! ✓"];
const QUIZ_MSG_WRONG = ["Casi…", "¡Inténtalo!", "No era esa"];

/**
 * QuizOverlay — full-screen overlay that appears over the game.
 *
 * Props:
 *   quiz    — { piece, correctAnswer, level }
 *   onClose — callback(bonus: number)
 */
function QuizOverlay({ quiz, onClose }) {
  const { piece, correctAnswer, level } = quiz;

  const [input, setInput] = useState("");
  const [phase, setPhase] = useState("asking");
  const [elapsed, setElapsed] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [message, setMessage] = useState("");
  const startTime = useRef(Date.now());
  const timerRef = useRef(null);
  const closedRef = useRef(false); // guard: onClose fires exactly once

  const safeClose = useCallback(
    (pts) => {
      if (closedRef.current) return;
      closedRef.current = true;
      clearInterval(timerRef.current);
      onClose(pts);
    },
    [onClose],
  );

  // Tick elapsed time
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 500);
    return () => clearInterval(timerRef.current);
  }, []);

  const submit = useCallback(
    (val) => {
      if (closedRef.current) return;
      const guess = parseInt(val, 10);
      const secs = (Date.now() - startTime.current) / 1000;
      clearInterval(timerRef.current);

      if (guess === correctAnswer) {
        const base = correctAnswer * QUIZ_BASE_MULT * level;
        const speed = secs < QUIZ_FAST_SEC ? QUIZ_SPEED_MULT * level : 0;
        const total = base + speed;
        const msg =
          secs < QUIZ_FAST_SEC
            ? QUIZ_MSG_CORRECT_FAST[
                Math.floor(Math.random() * QUIZ_MSG_CORRECT_FAST.length)
              ]
            : QUIZ_MSG_CORRECT[
                Math.floor(Math.random() * QUIZ_MSG_CORRECT.length)
              ];
        setBonus(total);
        setMessage(msg);
        setPhase("correct");
        setTimeout(() => safeClose(total), 1600);
      } else {
        const msg =
          QUIZ_MSG_WRONG[Math.floor(Math.random() * QUIZ_MSG_WRONG.length)];
        setMessage(msg);
        setPhase("wrong");
        setTimeout(() => safeClose(0), 2000);
      }
    },
    [correctAnswer, level, safeClose],
  );

  const handleKey = (e) => {
    if (e.key === "Enter" && input.trim()) submit(input);
  };

  const isAsking = phase === "asking";
  const isCorrect = phase === "correct";
  const isWrong = phase === "wrong";

  // Urgency color for the timer — green → yellow → red
  const timerColor =
    elapsed < 4 ? "#44ff88" : elapsed < 8 ? "#F0A500" : "#ff4444";

  return (
    <div style={SQ.backdrop}>
      <div style={SQ.card}>
        {/* Header */}
        <div style={SQ.header}>
          <span style={SQ.label}>CUENTA LOS CUBOS</span>
          {isAsking && (
            <span style={{ ...SQ.timer, color: timerColor }}>{elapsed}s</span>
          )}
        </div>

        {/* 3D piece viewer */}
        <div style={SQ.viewer}>
          <PieceViewer piece={piece} size={200} />
          {/* Cube count dots */}
          <div style={SQ.dots}>
            {piece.cells.map((_, i) => (
              <div
                key={i}
                style={{
                  ...SQ.dot,
                  background: `hsl(${(i * 137.5) % 360}, 80%, 58%)`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Question */}
        <div style={SQ.question}>¿Cuántos cubos tiene esta figura?</div>

        {/* Input / feedback */}
        {isAsking ? (
          <div style={SQ.inputRow}>
            <input
              autoFocus
              type="number"
              min={1}
              max={64}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              style={SQ.numInput}
              placeholder="?"
            />
            <button
              onClick={() => input.trim() && submit(input)}
              style={SQ.submitBtn}
            >
              ✓
            </button>
          </div>
        ) : (
          <div
            style={{
              ...SQ.feedback,
              color: isCorrect ? "#44ff88" : "#ff4444",
              borderColor: isCorrect ? "#44ff8844" : "#ff444444",
            }}
          >
            <span style={SQ.feedbackMsg}>{message}</span>
            {isCorrect && (
              <span style={SQ.feedbackBonus}>
                +{bonus.toLocaleString()} pts
              </span>
            )}
            {isWrong && (
              <span style={{ fontSize: 13, color: "#aaa" }}>
                La respuesta era{" "}
                <strong style={{ color: "#44ff88" }}>{correctAnswer}</strong>
              </span>
            )}
          </div>
        )}

        {/* Piece name + level hint */}
        <div style={SQ.footer}>
          <span style={{ color: piece.color, fontWeight: 800 }}>
            {piece.name}
          </span>
          <span style={SQ.footerLevel}>
            Nivel {level} · +{correctAnswer * QUIZ_BASE_MULT * level} pts base
          </span>
        </div>

        {/* Skip button */}
        {isAsking && (
          <button onClick={() => safeClose(0)} style={SQ.skipBtn}>
            Saltar →
          </button>
        )}
      </div>
    </div>
  );
}

// Quiz overlay styles
const SQ = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#000000dd",
    backdropFilter: "blur(14px)",
    animation: "fadeIn 0.18s ease",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
    background: "#0f0f26",
    border: "1.5px solid #ffffff14",
    borderRadius: 22,
    padding: "24px 28px",
    minWidth: 300,
    maxWidth: 380,
    boxShadow: "0 32px 80px #000000cc, 0 0 0 1px #ffffff08",
    position: "relative",
  },
  header: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 10,
    fontWeight: 800,
    color: "#445",
    letterSpacing: "1px",
  },
  timer: {
    fontSize: 16,
    fontWeight: 900,
    fontFamily: "monospace",
    transition: "color 0.4s",
  },
  viewer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "4px",
    borderRadius: 16,
    background: "#060614",
    border: "1px solid #ffffff0a",
  },
  dots: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    maxWidth: 200,
    justifyContent: "center",
    paddingBottom: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    flexShrink: 0,
  },
  question: {
    fontSize: 16,
    fontWeight: 800,
    color: "#dde0f0",
    textAlign: "center",
  },
  inputRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  numInput: {
    width: 80,
    padding: "10px 12px",
    fontSize: 28,
    fontWeight: 900,
    textAlign: "center",
    background: "#181830",
    border: "2px solid #3B9EFF66",
    borderRadius: 11,
    color: "#fff",
    fontFamily: "inherit",
    outline: "none",
    MozAppearance: "textfield",
  },
  submitBtn: {
    width: 44,
    height: 44,
    borderRadius: 11,
    border: "none",
    background: "#3B9EFF",
    color: "#fff",
    fontSize: 20,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  feedback: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "14px 0",
    borderRadius: 12,
    border: "1.5px solid",
    background: "#ffffff06",
  },
  feedbackMsg: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: "0.5px",
  },
  feedbackBonus: {
    fontSize: 18,
    fontWeight: 900,
    color: "#F0A500",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    fontSize: 11,
    marginTop: -4,
  },
  footerLevel: {
    fontSize: 10,
    color: "#445",
    fontFamily: "monospace",
  },
  skipBtn: {
    position: "absolute",
    bottom: 14,
    right: 18,
    fontSize: 10,
    color: "#334",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 700,
    padding: "2px 4px",
  },
};

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
  rootFullscreen: { position: "fixed", inset: 0, zIndex: 9999 },
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

  // Gizmo: XYZ orientation canvas, bottom-left corner of the scene
  gizmoCanvas: {
    position: "absolute",
    bottom: 10,
    left: 10,
    width: 96,
    height: 96,
    borderRadius: "50%",
    pointerEvents: "none",
    zIndex: 5,
  },

  // Axis HUD: top-right inside the scene showing current rotation axis
  axisHud: {
    position: "absolute",
    top: 12,
    right: 12,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 1,
    background: "#000000bb",
    borderRadius: 10,
    padding: "6px 10px",
    backdropFilter: "blur(6px)",
    border: "1px solid #ffffff12",
    pointerEvents: "none",
    zIndex: 5,
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
