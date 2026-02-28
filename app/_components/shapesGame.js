"use client";
// =============================================================================
// MathCubes — Etapa 2: Formas de Cantidad
//
// Cada número se visualiza como una figura 3D hecha de cubos unitarios.
// Los cubos se tocan entre sí con un grosor visible (rivet/lego).
// Los colores codifican "grupos de 5" para enseñar a estimar cantidades.
//
// Sections:
//   1. Count-band color system
//   2. Shape library (15 polycube pieces)
//   3. Three.js scene helpers
//   4. CubeScene component
//   5. Pedagogical UI components
//   6. App root
//   7. Styles
// =============================================================================

import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

// =============================================================================
// 1. COUNT-BAND COLOR SYSTEM
//    Every 5 cubes gets a distinct color. The color encodes the group index,
//    teaching children to count in fives through color recognition.
// =============================================================================

const BANDS = [
  { hex: "#E84040", label: "1–5" }, // red
  { hex: "#F0A500", label: "6–10" }, // amber
  { hex: "#22C55E", label: "11–15" }, // green
  { hex: "#3B9EFF", label: "16–20" }, // blue
  { hex: "#A855F7", label: "21–25" }, // purple
  { hex: "#EC4899", label: "26–30" }, // pink
  { hex: "#06B6D4", label: "31–35" }, // cyan
  { hex: "#EAB308", label: "36–40" }, // yellow
];

/** Return the hex color for the cube at position `idx` (0-indexed). */
function bandColor(idx) {
  return BANDS[Math.floor(idx / 5) % BANDS.length].hex;
}

/** How many full 5-groups and remainder cubes are in n. */
function groupsOf5(n) {
  return { full: Math.floor(n / 5), remainder: n % 5 };
}

// =============================================================================
// 2. SHAPE LIBRARY — 15 polycube pieces
//    Each piece is defined by a list of integer [x, y, z] positions.
//    Multiple pieces can share the same cube count (same quantity, different
//    form) which is itself a key pedagogical insight.
// =============================================================================

// /** Generate a flat M-wide × N-deep grid of cubes in the XZ plane at height y. */
// function makeGrid(cols, rows, y = 0) {
//   return Array.from({ length: cols * rows }, (_, i) => [
//     i % cols,
//     y,
//     Math.floor(i / cols),
//   ]);
// }

// /** Triangular number T(n) = 1+2+…+n cubes, arranged in a right triangle. */
// function makeTriangle(n) {
//   const cubes = [];
//   for (let row = 0; row < n; row++)
//     for (let col = 0; col <= row; col++) cubes.push([col, 0, n - 1 - row]);
//   return cubes;
// }
// Funciones auxiliares (asume que ya existen makeGrid y makeTriangle)
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

const SHAPES = [
  // ── 1. Figuras originales (15) ───────────────────────────────────────────
  {
    id: "unit",
    name: "Unidad",
    count: 1,
    insight: "1 × 1 = 1",
    hint: "El número base. Todo número es múltiplo de 1.",
    cubes: [[0, 0, 0]],
  },
  {
    id: "domino",
    name: "Dominó",
    count: 2,
    insight: "2 = 2 × 1",
    hint: "El único número que es par y primo a la vez.",
    cubes: [
      [0, 0, 0],
      [1, 0, 0],
    ],
  },
  {
    id: "trio",
    name: "Trío",
    count: 3,
    insight: "3 = 3 × 1 (primo)",
    hint: "Tres en línea. El primer número primo impar.",
    cubes: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ],
  },
  {
    id: "square4",
    name: "Cuadrado 2×2",
    count: 4,
    insight: "4 = 2 × 2 = 2²",
    hint: "El primer cuadrado perfecto. Compacto y simétrico.",
    cubes: makeGrid(2, 2),
  },
  {
    id: "lshape",
    name: "Ele (L)",
    count: 4,
    insight: "¡Mismo volumen que el cuadrado!",
    hint: "4 cubos en L. Misma cantidad, forma diferente.",
    cubes: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [2, 0, 1],
    ],
  },
  {
    id: "lshape2",
    name: "Ele (L2)",
    count: 8,
    insight: "Doble el volumen que el cuadrado!",
    hint: "4 cubos en L. Misma cantidad, forma diferente dos niveles.",
    cubes: [
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
    name: "Cruz  ＋",
    count: 5,
    insight: "5 = 5 × 1 (primo)",
    hint: "5 es primo. Un centro y cuatro brazos.",
    cubes: [
      [1, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
      [1, 0, 2],
    ],
  },
  {
    id: "cross",
    name: "Cruz  ＋2u",
    count: 10,
    insight: "5 = 5 × 1 ",
    hint: "5 es primo. Un centro y cuatro brazos.",
    cubes: [
      [1, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
      [1, 0, 2],
      [1, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [2, 1, 1],
      [1, 1, 2],
    ],
  },
  {
    id: "cross",
    name: "Cruz  ＋ 3u",
    count: 15,
    insight: "5 = 5 × 3 ",
    hint: "5 es primo. Un centro y cuatro brazos.",
    cubes: [
      [1, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
      [1, 0, 2],
      [1, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [2, 1, 1],
      [1, 1, 2],
      [1, 2, 0],
      [0, 2, 1],
      [1, 2, 1],
      [2, 2, 1],
      [1, 2, 2],
    ],
  },
  {
    id: "pyramid",
    name: "Pirámide",
    count: 5,
    insight: "5 = 4 + 1 (base + cima)",
    hint: "Base 2×2 (4 cubos) más una cima. ¡Igual que la Cruz!",
    cubes: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 0],
    ],
  },
  {
    id: "rect6",
    name: "Rectángulo 2×3",
    count: 6,
    insight: "6 = 2 × 3",
    hint: "El primer número con dos factorizaciones distintas.",
    cubes: makeGrid(3, 2),
  },
  {
    id: "stair6",
    name: "Escalera 1+2+3",
    count: 6,
    insight: "6 = 1 + 2 + 3 (triangular)",
    hint: "Número triangular: filas de 1, 2 y 3 cubos.",
    cubes: [
      [0, 0, 2],
      [0, 0, 1],
      [1, 0, 1],
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ],
  },
  {
    id: "arch",
    name: "Arco ∪",
    count: 7,
    insight: "7 = 7 × 1 (primo)",
    hint: "7 es primo. Forma de U, indivisible en grupos iguales.",
    cubes: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
      [1, 2, 0],
      [2, 2, 0],
      [2, 1, 0],
      [2, 0, 0],
    ],
  },
  {
    id: "arch3",
    name: "Arco 3∪",
    count: 21,
    insight: "7 = 7 × 3 ",
    hint: "7 es primo. Forma de U, indivisible en grupos iguales.",
    cubes: [
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
      [0, 0, 2],
      [0, 1, 2],
      [0, 2, 2],
      [1, 2, 2],
      [2, 2, 2],
      [2, 1, 2],
      [2, 0, 2],
    ],
  },
  {
    id: "arch2",
    name: "Arco 2∪",
    count: 14,
    insight: "7 = 7 × 2 ",
    hint: "7 es primo. Forma de U, indivisible en grupos iguales.",
    cubes: [
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
    insight: "¡También 7 cubos, en tres dimensiones!",
    hint: "Mismo volumen que el Arco pero completamente diferente en 3D.",
    cubes: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [2, 1, 0],
      [2, 2, 0],
      [3, 2, 0],
      [3, 2, 1],
    ],
  },
  {
    id: "cube8",
    name: "Cubo 2³",
    count: 8,
    insight: "8 = 2 × 2 × 2 = 2³",
    hint: "El primer cubo perfecto tridimensional.",
    cubes: makeBox(2, 2, 2),
  },
  {
    id: "square9",
    name: "Cuadrado 3×3",
    count: 9,
    insight: "9 = 3 × 3 = 3²",
    hint: "El segundo cuadrado perfecto.",
    cubes: makeGrid(3, 3),
  },
  {
    id: "triangle10",
    name: "Triángulo T₄",
    count: 10,
    insight: "10 = 1 + 2 + 3 + 4 (triangular)",
    hint: "Número triangular. Filas de 4, 3, 2 y 1.",
    cubes: makeTriangle(4),
  },
  {
    id: "dozen",
    name: "Docena 3×4",
    count: 12,
    insight: "12 = 3×4 = 2×6 = 4×3",
    hint: "El más divisible hasta 12. Una docena completa.",
    cubes: makeGrid(4, 3),
  },

  // ── 2. Nuevas figuras (35) ───────────────────────────────────────────────
  // 16
  {
    id: "esquina4",
    name: "Esquina 3D",
    count: 4,
    insight: "4 cubos en 3D: una esquina.",
    hint: "Mismo volumen que el cuadrado, pero en tres dimensiones.",
    cubes: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
  },
  // 17
  {
    id: "tee5",
    name: "T 3D",
    count: 5,
    insight: "5 = 3 + 2",
    hint: "Una T tridimensional: línea de 3 con dos cubos apilados en el centro.",
    cubes: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [1, 1, 0],
      [1, 0, 1],
    ],
  },
  {
    id: "tee6",
    name: "T 3D L",
    count: 6,
    insight: "5 = 3 + 3",
    hint: "Una T tridimensional: línea de 3 con dos cubos apilados en el centro.",
    cubes: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [1, 1, 0],
      [1, 0, 1],
      [1, 0, 2],
    ],
  },
  {
    id: "tee7",
    name: "3D axis",
    count: 7,
    insight: "5 = 3 + 4",
    hint: "Una T tridimensional: línea de 3 con dos cubos apilados en el centro.",
    cubes: [
      [0, 0, 0],
      [-1, 0, 0],
      [1, 0, 0],
      [1, 2, 0],
      [1, 1, 0],
      [1, 0, 1],
      [1, 0, 2],
    ],
  },
  // 18
  {
    id: "cruz3d6",
    name: "Cruz 3D",
    count: 6,
    insight: "6 = 1 + 4 + 1",
    hint: "Centro con cuatro brazos en el plano y uno hacia arriba.",
    cubes: [
      [1, 1, 1],
      [0, 1, 1],
      [2, 1, 1],
      [1, 0, 1],
      [1, 2, 1],
      [1, 1, 2],
    ],
  },
  // 19
  {
    id: "escalera7",
    name: "Escalera 7",
    count: 7,
    insight: "7 cubos en escalera 3D.",
    hint: "Un camino que sube y gira.",
    cubes: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [2, 1, 0],
      [2, 1, 1],
      [3, 1, 1],
      [3, 2, 1],
    ],
  },
  // 20
  {
    id: "anillo8",
    name: "Anillo",
    count: 8,
    insight: "8 = perímetro de un cuadrado 3×3",
    hint: "Solo el borde, el centro vacío.",
    cubes: [
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
    insight: "8 = perímetro de un cuadrado 3×3x2",
    hint: "Solo el borde, el centro vacío.",
    cubes: [
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
  // 21
  {
    id: "corner_3d",
    name: "esquina  ",
    count: 10,
    insight: "10 = 7+3",
    hint: ".",
    cubes: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 1],
      [-1, 0, 0],
      [1, 0, 0],
      [1, 2, 0],
      [1, 1, 0],
      [1, 0, 1],
      [1, 0, 2],
    ],
  },
  {
    id: "corner_3d F",
    name: "esquina Completa  ",
    count: 11,
    insight: "11 = 7+4 o 8+3 ",
    hint: "esquina simple mas 4 o cubo 8 mas 3 .",
    cubes: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 1],
      [0, 1, 1],
      [-1, 0, 0],
      [1, 0, 0],
      [1, 2, 0],
      [1, 1, 0],
      [1, 0, 1],
      [1, 0, 2],
    ],
  },
  // 22
  //   {
  //     id: "escalera10",
  //     name: "Escalera 10",
  //     count: 10,
  //     insight: "10 cubos en escalera 3D.",
  //     hint: "Una escalera de cuatro peldaños.",
  //     cubes: [
  //       [0, 0, 0],
  //       [1, 0, 0],
  //       [1, 1, 0],
  //       [2, 1, 0],
  //       [2, 1, 1],
  //       [3, 1, 1],
  //       [3, 2, 1],
  //       [4, 2, 1],
  //       [4, 2, 2],
  //       [5, 2, 2],
  //     ],
  //   },
  // 23
  {
    id: "rect11_falta",
    name: "Rectángulo 3×4 incompleto",
    count: 11,
    insight: "11 = 12 - 1",
    hint: "Un rectángulo 3×4 al que le falta una esquina.",
    cubes: (() => {
      const c = makeGrid(3, 4); // 12 cubos
      return c.filter(([x, y]) => !(x === 2 && y === 3)); // quita (2,3,0)
    })(),
  },
  // 24
  {
    id: "cajon12",
    name: "Cajón 2×2×3",
    count: 12,
    insight: "12 = 2 × 2 × 3",
    hint: "Un prisma rectangular tridimensional.",
    cubes: makeBox(2, 2, 3),
  },
  {
    id: "cajon18B",
    name: "Cajón 4×4 +2",
    count: 18,
    insight: "18 = 4 × 4 + 2",
    hint: "cuadrado 4x4 con 2 cubos arriba.",
    cubes: (() => [...makeGrid(4, 4), [0, 0, 1], [1, 0, 1]])(),
  },
  // 25
  {
    id: "shape13",
    name: "13 plano",
    count: 13,
    insight: "13 es primo, tambien la suma de 9 + 4.",
    hint: " un cuadrado de 3x3 con 4 cubos arriba.",
    cubes: (() => [
      ...makeGrid(3, 3),
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
      [2, 1, 1],
    ])(),
  },
  // 26
  {
    id: "rect14",
    name: "Rectángulo 2×7",
    count: 14,
    insight: "14 = 2 × 7",
    hint: "Una fila larga de 7 pares.",
    cubes: makeGrid(7, 2),
  },
  // 27
  {
    id: "triang15",
    name: "Triángulo T₅",
    count: 15,
    insight: "15 = 1+2+3+4+5 (triangular)",
    hint: "El quinto número triangular.",
    cubes: makeTriangle(5),
  },
  // 28
  {
    id: "cuadrado16",
    name: "Cuadrado 4×4",
    count: 16,
    insight: "16 = 4 × 4 = 4²",
    hint: "Un cuadrado grande y plano.",
    cubes: makeGrid(4, 4),
  },
  {
    id: "prisma16",
    name: "Prisma 4×2x2",
    count: 16,
    insight: "16 = 4 × 2 x 2 = 4²",
    hint: "una caja de 4 de frente y 2 de alto y 2 de profundo.",
    cubes: makeBox(4, 2, 2),
  },
  // 29
  {
    id: "primo17",
    name: "Línea 17",
    count: 17,
    insight: "17 es primo",
    hint: "Una larga línea recta de 17 cubos.",
    cubes: Array.from({ length: 17 }, (_, i) => [i, 0, 0]),
  },
  {
    id: "primo17sq",
    name: "cuadrado 17",
    count: 17,
    insight: "17 es primo",
    hint: "15 + 2 .",
    cubes: (() => [...makeGrid(5, 3), [0, 0, 1], [1, 0, 1]])(),
  },
  {
    id: "anillo16",
    name: "Anillox2 +1 ",
    count: 17,
    insight: "8 = perímetro de un cuadrado 3×3x2",
    hint: "Solo el borde, el centro vacío + 1.",
    cubes: [
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
    insight: "18 = 2 × 3 × 3",
    hint: "Un prisma de 2 capas de 3×3.",
    cubes: makeBox(2, 3, 3),
  },
  // 31
  {
    id: "primo19",
    name: "Línea 19",
    count: 19,
    insight: "19 es primo",
    hint: "Otra larga línea.",
    cubes: Array.from({ length: 19 }, (_, i) => [i, 0, 0]),
  },
  {
    id: "primo19B",
    name: "rectangulo 5x3 + 4 ",
    count: 19,
    insight: "19 es primo",
    hint: "un rectangulo de 5x3 con 4 cubos arriba.",
    cubes: (() => [
      ...makeGrid(5, 3),
      [0, 0, 1],
      [1, 0, 1],
      [2, 0, 1],
      [3, 0, 1],
    ])(),
  },
  {
    id: "primo19a",
    name: "Prisma 3x3x2 + 1 ",
    count: 19,
    insight: "19 es primo",
    hint: "un prisma de 3x3x2 con 1 cubo arriba.",
    cubes: (() => [...makeBox(3, 3, 2), [1, 1, 2]])(),
  },
  // 32
  {
    id: "cajon20",
    name: "Cajón 2×2×5",
    count: 20,
    insight: "20 = 2 × 2 × 5",
    hint: "Cinco capas de 2×2.",
    cubes: makeBox(2, 2, 5),
  },
  {
    id: "cajon20A",
    name: "Cudrado 4×5",
    count: 20,
    insight: "20 = 4 × 5",
    hint: "un cuadrado de 5x4 .",
    cubes: makeGrid(4, 5),
  },
  // 33
  {
    id: "triang21",
    name: "Triángulo T₆",
    count: 21,
    insight: "21 = 1+2+3+4+5+6",
    hint: "El sexto número triangular.",
    cubes: makeTriangle(6),
  },
  {
    id: "Prisma21",
    name: "cuadrado 21",
    count: 21,
    insight: "21 = 7X3 ",
    hint: "un cuadrado de 7x3.",
    cubes: makeGrid(3, 7),
  },
  {
    id: "Prisma21S",
    name: "suma de dos rectangulos",
    count: 21,
    insight: "21 = 4X3 + 3X3",
    hint: "un cuadrado de 3x3 y un rectangulo de 4x3.",
    cubes: (() => [
      ...makeGrid(3, 4).map(([x, y]) => [x, y, 0]),
      ...makeGrid(3, 3).map(([x, y]) => [x, y, 1]),
    ])(),
  },
  // 34
  {
    id: "rect22",
    name: "Rectángulo 2×11",
    count: 22,
    insight: "22 = 2 × 11",
    hint: "Dos filas de 11.",
    cubes: makeGrid(11, 2),
  },
  // 35
  {
    id: "cajon24",
    name: "Cajón 2×3×4",
    count: 24,
    insight: "24 = 2 × 3 × 4",
    hint: "Muchas combinaciones: 2×3×4.",
    cubes: makeBox(2, 3, 4),
  },
  // 36
  {
    id: "cuadrado25",
    name: "Cuadrado 5×5",
    count: 25,
    insight: "25 = 5 × 5 = 5²",
    hint: "El tercer cuadrado perfecto impar.",
    cubes: makeGrid(5, 5),
  },
  // 37
  {
    id: "rect26",
    name: "Rectángulo 2×13",
    count: 26,
    insight: "26 = 2 × 13",
    hint: "Dos filas de 13.",
    cubes: makeGrid(13, 2),
  },
  // 38
  {
    id: "cubo27",
    name: "Cubo 3³",
    count: 27,
    insight: "27 = 3 × 3 × 3 = 3³",
    hint: "El cubo perfecto de 3.",
    cubes: makeBox(3, 3, 3),
  },
  // 39
  {
    id: "cajon28",
    name: "Cajón 2×2×7",
    count: 28,
    insight: "28 = 2 × 2 × 7",
    hint: "Siete capas de 2×2.",
    cubes: makeBox(2, 2, 7),
  },
  // 40
  {
    id: "cajon30",
    name: "Cajón 2×3×5",
    count: 30,
    insight: "30 = 2 × 3 × 5",
    hint: "Producto de los tres primeros primos.",
    cubes: makeBox(2, 3, 5),
  },
  // 41
  {
    id: "cajon32",
    name: "Cajón 2×4×4",
    count: 32,
    insight: "32 = 2 × 4 × 4",
    hint: "Dos capas de 4×4.",
    cubes: makeBox(2, 4, 4),
  },
  // 42
  {
    id: "cajon36",
    name: "Cajón 3×3×4",
    count: 36,
    insight: "36 = 3 × 3 × 4",
    hint: "Cuatro capas de 3×3.",
    cubes: makeBox(3, 3, 4),
  },
  // 43
  {
    id: "cajon40",
    name: "Cajón 2×4×5",
    count: 40,
    insight: "40 = 2 × 4 × 5",
    hint: "Cinco capas de 2×4.",
    cubes: makeBox(2, 4, 5),
  },
  // 44
  {
    id: "cajon42",
    name: "Cajón 2×3×7",
    count: 42,
    insight: "42 = 2 × 3 × 7",
    hint: "Siete capas de 2×3.",
    cubes: makeBox(2, 3, 7),
  },
  // 45
  {
    id: "cajon48",
    name: "Cajón 3×4×4",
    count: 48,
    insight: "48 = 3 × 4 × 4",
    hint: "Cuatro capas de 3×4.",
    cubes: makeBox(3, 4, 4),
  },
  // 46
  {
    id: "cajon50",
    name: "Cajón 2×5×5",
    count: 50,
    insight: "50 = 2 × 5 × 5",
    hint: "Cinco capas de 2×5.",
    cubes: makeBox(2, 5, 5),
  },
  // 47
  {
    id: "arco3d7",
    name: "cruz 3D axis",
    count: 7,
    insight: " cruz 3D con eje central.",
    hint: " una cruz con un eje central.",
    cubes: [
      [1, 1, 0],
      [0, 1, 0],
      [1, 1, -1],
      [1, 2, 0],
      [1, 1, 1],
      [2, 1, 0],
      [1, 0, 0],
    ],
  },
  // 48
  {
    id: "cuadrado9_3d",
    name: "esquina 3×3 con centro alto",
    count: 9,
    insight: "9 cubos, la esquina de un cubo 3×3×3.",
    hint: "Misma cantidad que el cuadrado 3×3, pero en 3D.",
    cubes: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 1],
      [-1, 0, 0],
      [1, 0, 0],
      [1, 2, 0],
      [1, 1, 0],
      [1, 0, 1],
      [1, 0, 2],
    ],
  },
  // 49
  //   {
  //     id: "triang10_3d",
  //     name: "Triángulo T₄ con cima alta",
  //     count: 10,
  //     insight: "10 cubos, la punta del triángulo está elevada.",
  //     hint: "Triángulo de base 4 con el vértice superior en z=1.",
  //     cubes: (() => {
  //       const base = 4;
  //       const cubes = [];
  //       for (let i = 0; i < base; i++) {
  //         // filas de abajo arriba
  //         const y = base - 1 - i;
  //         for (let x = 0; x <= i; x++) {
  //           const z = i === base - 1 ? 1 : 0; // la última fila (la punta) en z=1
  //           cubes.push([x, y, z]);
  //         }
  //       }
  //       return cubes;
  //     })(),
  //   },
  // 50
  {
    id: "serpiente8",
    name: "Serpiente 8",
    count: 8,
    insight: "8 cubos en una serpiente 3D.",
    hint: "Un camino que sube y gira.",
    cubes: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [2, 1, 1],
      [2, 2, 1],
      [2, 2, 2],
      [3, 2, 2],
    ],
  },
];

const SHAPES_BY_COUNT = {};
SHAPES.forEach((s) => (SHAPES_BY_COUNT[s.count] ??= []).push(s));

// Sorted counts for composite lookup
const SORTED_COUNTS = Object.keys(SHAPES_BY_COUNT)
  .map(Number)
  .sort((a, b) => b - a);

/**
 * Compact grid fill for N cubes (fallback for numbers without a library shape).
 * Fills a W=5 column grid row by row, stacking layers as needed.
 */
function fillCubes(n) {
  const W = Math.min(5, n);
  return Array.from({ length: n }, (_, i) => {
    const layer = Math.floor(i / (W * 5));
    const rem = i % (W * 5);
    return [rem % W, layer, Math.floor(rem / W)];
  });
}

/**
 * Find how to represent number `n`:
 * - Exact library match → { exact: Shape, cubes }
 * - Composite (base + remainder) → { base: Shape, remainder: n–base, cubes, remCubes }
 * - Pure fill → { cubes }
 */
function findRepresentation(n) {
  if (n <= 0) return null;

  // Exact library shape
  if (SHAPES_BY_COUNT[n]) {
    return {
      type: "exact",
      shape: SHAPES_BY_COUNT[n][0],
      altShapes: SHAPES_BY_COUNT[n],
    };
  }

  // Composite: largest base ≤ n
  for (const base of SORTED_COUNTS) {
    if (base < n) {
      const shape = SHAPES_BY_COUNT[base][0];
      const remainder = n - base;
      return {
        type: "composite",
        shape,
        remainder,
        altShapes: SHAPES_BY_COUNT[base],
      };
    }
  }

  // Pure fill (shouldn't happen with n ≥ 1 and library starting at 1)
  return { type: "fill" };
}

/** Build the full cube list for a representation, with a remainder offset. */
function buildCubeList(repr, n) {
  if (!repr) return [];

  if (repr.type === "fill")
    return fillCubes(n).map((pos, i) => ({ pos, idx: i, isRem: false }));

  const mainCubes = repr.shape.cubes;

  if (repr.type === "exact") {
    return mainCubes.map((pos, i) => ({ pos, idx: i, isRem: false }));
  }

  // Composite: main shape + remainder line
  const maxX = Math.max(...mainCubes.map((p) => p[0]));
  const remX0 = maxX + 2;
  const remList = Array.from({ length: repr.remainder }, (_, i) => [
    remX0 + i,
    0,
    0,
  ]);

  return [
    ...mainCubes.map((pos, i) => ({ pos, idx: i, isRem: false })),
    ...remList.map((pos, i) => ({
      pos,
      idx: mainCubes.length + i,
      isRem: true,
    })),
  ];
}

// =============================================================================
// 3. THREE.JS SCENE HELPERS
// =============================================================================

// Rivet (LEGO-like) cube dimensions
const CUBE_SIZE = 0.95; // < 1.0 leaves a visible groove between touching cubes
const GROOVE_W = 1 - CUBE_SIZE; // 0.14 — the groove width

/** Build a single rivet cube mesh at grid position [gx, gy, gz]. */
function makeRivetCube(hex, emissive = false) {
  const col = new THREE.Color(hex);
  const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

  // Main cube
  const mat = new THREE.MeshStandardMaterial({
    color: col,
    roughness: 0.32,
    metalness: 0.12,
    emissive: col,
    emissiveIntensity: emissive ? 0.06 : 0.03,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;

  // Dark groove edges (the "rivet" separation detail)
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.5,
  });
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));

  // Subtle bright highlight on top face edges only
  const topHighlight = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(CUBE_SIZE * 0.97, CUBE_SIZE * 0.97, CUBE_SIZE * 0.97),
  );
  const hlMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.08,
  });
  mesh.add(new THREE.LineSegments(topHighlight, hlMat));

  return mesh;
}

/** Add a subtle dot-grid on the ground plane showing integer XZ positions. */
function buildGroundGrid(scene, xMin, xMax, zMin, zMax, yLevel) {
  const dotGeo = new THREE.SphereGeometry(0.035, 4, 4);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x334455 });

  for (let x = Math.floor(xMin); x <= Math.ceil(xMax); x++) {
    for (let z = Math.floor(zMin); z <= Math.ceil(zMax); z++) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(x, yLevel, z);
      dot.userData.rm = true;
      scene.add(dot);
    }
  }
}

/** Thin axis ruler line along X at the front edge. */
function addRuler(scene, cubes, yLevel) {
  if (!cubes.length) return;
  const allX = cubes.map((c) => c.pos[0]);
  const allZ = cubes.map((c) => c.pos[2]);
  const xMin = Math.min(...allX) - 0.5;
  const xMax = Math.max(...allX) + 0.5;
  const zMin = Math.min(...allZ) - 0.5;
  const zMax = Math.max(...allZ) + 0.5;

  // Ground dot grid
  buildGroundGrid(scene, xMin, xMax, zMin, zMax, yLevel - 0.01);

  // Border outline
  const corners = [
    [xMin, zMin, xMax, zMin],
    [xMax, zMin, xMax, zMax],
    [xMax, zMax, xMin, zMax],
    [xMin, zMax, xMin, zMin],
  ];
  corners.forEach(([x0, z0, x1, z1]) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x0, yLevel, z0),
      new THREE.Vector3(x1, yLevel, z1),
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x334466,
        transparent: true,
        opacity: 0.45,
      }),
    );
    line.userData.rm = true;
    scene.add(line);
  });
}

// =============================================================================
// 4. CUBE SCENE COMPONENT
// =============================================================================

function CubeScene({ cubeList }) {
  const mountRef = useRef(null);
  const clock = useRef(new THREE.Clock());
  const sceneRef = useRef({
    renderer: null,
    scene: null,
    camera: null,
    raf: null,
    animMeshes: [],
    rotY: 0.4, // azimuth  — slight angle from front
    rotX: 0.38, // elevation ≈ 22°
    orbitR: 12,
    target: new THREE.Vector3(),
    dragging: false,
    lastMX: 0,
    lastMY: 0,
  });

  // ── One-time Three.js setup ──────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    const ss = sceneRef.current;
    const W = el.clientWidth,
      H = el.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    ss.renderer = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 400);
    ss.scene = scene;
    ss.camera = camera;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(10, 18, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
    sun.shadow.camera.right = sun.shadow.camera.top = 30;
    scene.add(sun);

    // scene.add(
    //   Object.assign(new THREE.DirectionalLight(0xaaccff, 0.22), {
    //     position: new THREE.Vector3(-8, 6, -8),
    //   }),
    // );
    // scene.add(
    //   Object.assign(new THREE.DirectionalLight(0xffeedd, 0.15), {
    //     position: new THREE.Vector3(0, -4, 0),
    //   }),
    // );

    // Animation loop
    const animate = () => {
      ss.raf = requestAnimationFrame(animate);
      const t = clock.current.getElapsedTime();

      // Drop-in cube animation
      ss.animMeshes.forEach((m) => {
        const { startT, targetY } = m.userData;
        const p = Math.min(1, Math.max(0, (t - startT) / 0.45));
        const ease = 1 - Math.pow(1 - p, 3) + Math.sin(p * Math.PI) * 0.055;
        m.position.y = THREE.MathUtils.lerp(
          targetY - 12,
          targetY,
          Math.min(ease, 1),
        );
      });

      // Orbit camera
      const { rotX, rotY, orbitR, target, dragging } = ss;
      const desired = new THREE.Vector3(
        target.x + orbitR * Math.cos(rotX) * Math.sin(rotY),
        target.y + orbitR * Math.sin(rotX),
        target.z + orbitR * Math.cos(rotX) * Math.cos(rotY),
      );
      if (dragging) camera.position.copy(desired);
      else camera.position.lerp(desired, 0.06);
      camera.lookAt(target);
      renderer.render(scene, camera);
    };
    animate();

    // Mouse/touch orbit
    const down = ({ clientX: mx, clientY: my }) => {
      ss.dragging = true;
      ss.lastMX = mx;
      ss.lastMY = my;
      el.style.cursor = "grabbing";
    };
    const move = ({ clientX: mx, clientY: my }) => {
      if (!ss.dragging) return;
      ss.rotY += (mx - ss.lastMX) * 0.013;
      ss.rotX = Math.max(
        0.06,
        Math.min(1.48, ss.rotX - (my - ss.lastMY) * 0.009),
      );
      ss.lastMX = mx;
      ss.lastMY = my;
    };
    const up = () => {
      ss.dragging = false;
      el.style.cursor = "grab";
    };

    el.style.cursor = "grab";
    el.addEventListener("mousedown", down);
    el.addEventListener("touchstart", (e) => down(e.touches[0]), {
      passive: true,
    });
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", (e) => move(e.touches[0]), {
      passive: true,
    });
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    window.addEventListener("resize", () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    return () => {
      cancelAnimationFrame(ss.raf);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // ── Rebuild cubes when cubeList changes ─────────────────────────────────
  useEffect(() => {
    const ss = sceneRef.current;
    if (!ss.scene || !cubeList?.length) return;
    const { scene, camera } = ss;

    scene.children.filter((o) => o.userData.rm).forEach((o) => scene.remove(o));
    ss.animMeshes = [];

    const t0 = clock.current.getElapsedTime();

    // Ground plane
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0x0c0c1c, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.52;
    ground.receiveShadow = true;
    ground.userData.rm = true;
    scene.add(ground);

    // Center the cube list in XZ
    const allX = cubeList.map((c) => c.pos[0]);
    const allZ = cubeList.map((c) => c.pos[2]);
    const allY = cubeList.map((c) => c.pos[1]);
    const cx = (Math.min(...allX) + Math.max(...allX)) / 2;
    const cz = (Math.min(...allZ) + Math.max(...allZ)) / 2;
    const cy = (Math.min(...allY) + Math.max(...allY)) / 2;

    // Reference grid below the shape
    const centeredList = cubeList.map((c) => ({
      ...c,
      wx: c.pos[0] - cx,
      wy: c.pos[1],
      wz: c.pos[2] - cz,
    }));
    addRuler(
      scene,
      centeredList.map((c) => ({ pos: [c.wx, c.wy, c.wz] })),
      -0.5,
    );

    // Build cube meshes
    centeredList.forEach(({ idx, isRem, wx, wy, wz }) => {
      const hex = bandColor(idx);
      const mesh = makeRivetCube(hex, !isRem);

      // Dim remainder cubes slightly
      if (isRem) {
        mesh.material.opacity = 0.62;
        mesh.material.transparent = true;
      }

      mesh.position.set(wx, wy, wz);
      mesh.userData = { startT: t0 + idx * 0.016, targetY: wy, rm: true };
      scene.add(mesh);
      ss.animMeshes.push(mesh);
    });

    // Fit camera
    const spanX = Math.max(...allX) - Math.min(...allX) + 1;
    const spanY = Math.max(...allY) - Math.min(...allY) + 1;
    const spanZ = Math.max(...allZ) - Math.min(...allZ) + 1;
    const maxSpan = Math.max(spanX, spanZ, spanY * 1.4);
    const fovRad = camera.fov * (Math.PI / 180);
    ss.orbitR = (maxSpan / 2 / Math.tan(fovRad / 2)) * 1.85;
    ss.target.set(0, cy, 0);
  }, [cubeList]);

  return (
    <div ref={mountRef} style={S.canvas}>
      <span style={S.orbitHint}>↔ Arrastrar</span>
    </div>
  );
}

// =============================================================================
// 5. PEDAGOGICAL UI COMPONENTS
// =============================================================================

// ── Dot pips display (groups of 5, like counting beads) ─────────────────────

function PipDisplay({ n }) {
  const pips = Array.from({ length: Math.min(n, 40) }, (_, i) => i);
  const { full, remainder } = groupsOf5(n);
  const truncated = n > 40;

  return (
    <div style={S.pipSection}>
      <div style={S.pipTitle}>GRUPOS DE 5</div>
      <div style={S.pipGrid}>
        {pips.map((i) => (
          <div key={i} style={{ ...S.pip, background: bandColor(i) }} />
        ))}
        {truncated && <span style={S.pipMore}>+{n - 40}</span>}
      </div>
      <div style={S.pipCaption}>
        {full > 0 && (
          <span>
            <span style={{ color: BANDS[0].hex, fontWeight: 800 }}>{full}</span>
            <span style={S.pipOp}> grupo{full !== 1 ? "s" : ""} de 5</span>
          </span>
        )}
        {full > 0 && remainder > 0 && <span style={S.pipOp}> + </span>}
        {remainder > 0 && (
          <span>
            <span style={{ color: bandColor(full * 5), fontWeight: 800 }}>
              {remainder}
            </span>
            <span style={S.pipOp}> suelto{remainder !== 1 ? "s" : ""}</span>
          </span>
        )}
        {remainder === 0 && full > 0 && (
          <span style={{ color: "#48CA8B", fontWeight: 700 }}>
            {" "}
            — múltiplo exacto de 5
          </span>
        )}
      </div>
    </div>
  );
}

// ── Layer breakdown (cubes per Y level) ─────────────────────────────────────

function LayerBreakdown({ cubeList }) {
  const layers = {};
  cubeList.forEach(({ pos }) => {
    const y = pos[1];
    layers[y] = (layers[y] || 0) + 1;
  });
  const keys = Object.keys(layers)
    .map(Number)
    .sort((a, b) => a - b);
  if (keys.length <= 1) return null;

  return (
    <div style={S.layerSection}>
      <div style={S.layerTitle}>POR CAPAS</div>
      {keys.map((y) => {
        const count = layers[y];
        const barW = Math.round(
          (count / Math.max(...Object.values(layers))) * 100,
        );
        return (
          <div key={y} style={S.layerRow}>
            <span style={S.layerLabel}>y={y}</span>
            <div style={S.layerBarBg}>
              <div
                style={{
                  ...S.layerBar,
                  width: `${barW}%`,
                  background: bandColor(y * 5),
                }}
              />
            </div>
            <span style={{ ...S.layerCount, color: bandColor(y * 5) }}>
              {count}
            </span>
          </div>
        );
      })}
      <div style={S.layerTotal}>
        {keys.map((k) => layers[k]).join(" + ")} = {cubeList.length}
      </div>
    </div>
  );
}

// ── Alternate shape picker (when multiple shapes share the same count) ───────

function AltShapePicker({ shapes, selected, onSelect }) {
  if (shapes.length <= 1) return null;
  return (
    <div style={S.altSection}>
      <div style={S.altTitle}>MISMA CANTIDAD, OTRA FORMA</div>
      <div style={S.altRow}>
        {shapes.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            style={{
              ...S.altPill,
              borderColor: s.id === selected.id ? "#aabbff" : "#ffffff18",
              background: s.id === selected.id ? "#aabbff22" : "transparent",
              color: s.id === selected.id ? "#aabbff" : "#555",
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Reference gallery strip (mini thumbnails of all 15 shapes) ──────────────

function ShapeGallery({ currentCount, onPick }) {
  // Unique counts, sorted
  const counts = [...new Set(SHAPES.map((s) => s.count))].sort((a, b) => a - b);
  return (
    <div style={S.gallery}>
      <div style={S.galleryTitle}>BIBLIOTECA DE FIGURAS</div>
      <div style={S.galleryGrid}>
        {counts.map((c) => {
          const shape = SHAPES_BY_COUNT[c][0];
          const isActive = c === currentCount;
          return (
            <button
              key={c}
              onClick={() => onPick(c)}
              style={{
                ...S.galleryItem,
                borderColor: isActive ? bandColor(0) : "#ffffff15",
                background: isActive ? bandColor(0) + "18" : "transparent",
              }}
            >
              <span style={{ ...S.galleryCount, color: bandColor(0) }}>
                {c}
              </span>
              <span style={S.galleryName}>{shape.name.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// 6. APP ROOT
// =============================================================================

export default function ShapesGame() {
  const [inputVal, setInputVal] = useState("8");
  const [n, setN] = useState(8);
  const [repr, setRepr] = useState(() => findRepresentation(8));
  const [shape, setShape] = useState(() => findRepresentation(8).shape);
  const [cubeList, setCubeList] = useState(() =>
    buildCubeList(findRepresentation(8), 8),
  );
  const inputRef = useRef(null);

  // Commit the entered number
  const commit = useCallback((raw) => {
    const num = Math.max(1, Math.min(50, parseInt(raw) || 1));
    const rep = findRepresentation(num);
    const sh = rep?.shape || null;
    setN(num);
    setRepr(rep);
    setShape(sh);
    setCubeList(buildCubeList(rep, num));
  }, []);

  const handleInput = (e) => {
    setInputVal(e.target.value);
    if (e.target.value !== "") commit(e.target.value);
  };

  const handleAltShape = useCallback((s) => {
    setShape(s);
    setCubeList(s.cubes.map((pos, i) => ({ pos, idx: i, isRem: false })));
  }, []);

  const handleGalleryPick = useCallback(
    (count) => {
      setInputVal(String(count));
      commit(count);
    },
    [commit],
  );

  // Current insight / hint from shape
  const mainColor = bandColor(0);
  const isComposite = repr?.type === "composite";
  const altShapes =
    repr?.type === "exact" || repr?.type === "composite"
      ? SHAPES_BY_COUNT[shape?.count] || []
      : [];

  return (
    <div style={S.root}>
      <div style={S.bgPattern} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={S.header}>
        <div style={S.logoRow}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ ...S.logoPip, background: bandColor(i) }} />
          ))}
          <span style={S.logoText}>MathCubes</span>
          <span style={S.logoStage}>Etapa 2 · Formas</span>
        </div>
        <div style={S.headerRight}>
          <span style={S.headerHint}>1 cubo = 1 unidad</span>
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div style={S.body}>
        {/* Left — 3D scene */}
        <div style={S.leftCol}>
          <div style={S.canvasBox}>
            <CubeScene key={JSON.stringify(cubeList)} cubeList={cubeList} />

            {/* Floating count badge */}
            <div style={{ ...S.countBadge, background: mainColor + "dd" }}>
              <span style={S.countBadgeN}>{n}</span>
              <span style={S.countBadgeLabel}>cubos</span>
            </div>

            {/* Composite annotation */}
            {isComposite && (
              <div style={S.compositeBadge}>
                <span style={{ color: mainColor, fontWeight: 800 }}>
                  {repr.shape.count}
                </span>
                <span style={S.compositeOp}> + </span>
                <span
                  style={{
                    color: bandColor(repr.shape.count),
                    fontWeight: 800,
                  }}
                >
                  {repr.remainder}
                </span>
                <span style={S.compositeOp}> = {n}</span>
              </div>
            )}

            <span style={S.orbitCaption}>
              ↔ Arrastrar para rotar · 1 cubo = 1 unidad
            </span>
          </div>

          {/* Shape gallery strip */}
          <ShapeGallery
            currentCount={shape?.count}
            onPick={handleGalleryPick}
          />
        </div>

        {/* Right — info + pedagogy */}
        <div style={S.rightCol}>
          {/* Number input card */}
          <div style={S.inputCard}>
            <div style={S.inputLabel}>¿CUÁNTOS CUBOS?</div>
            <input
              ref={inputRef}
              type="number"
              min={1}
              max={50}
              value={inputVal}
              onChange={handleInput}
              style={{ ...S.numberInput, borderColor: mainColor + "88" }}
            />
            <div style={S.inputRange}>
              <input
                type="range"
                min={1}
                max={50}
                value={n}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  commit(e.target.value);
                }}
                style={{ ...S.rangeSlider, accentColor: mainColor }}
              />
              <div style={S.rangeLabels}>
                <span>1</span>
                <span>25</span>
                <span>50</span>
              </div>
            </div>
          </div>

          {/* Shape identity card */}
          {shape && (
            <div style={{ ...S.identityCard, borderColor: mainColor + "44" }}>
              <div style={S.identityTop}>
                <span style={{ ...S.identityName, color: mainColor }}>
                  {shape.name}
                </span>
                <div
                  style={{
                    ...S.identityCountChip,
                    background: mainColor + "22",
                    borderColor: mainColor + "55",
                  }}
                >
                  <span style={{ color: mainColor, fontWeight: 900 }}>{n}</span>
                </div>
              </div>
              <div
                style={{
                  ...S.insightBox,
                  borderColor: mainColor + "33",
                  background: mainColor + "0d",
                }}
              >
                <span style={{ color: mainColor, fontWeight: 800 }}>
                  {shape.insight}
                </span>
              </div>
              <p style={S.hintText}>{shape.hint}</p>
              {isComposite && (
                <div style={S.compositeHint}>
                  <span style={{ color: "#aaa" }}>Descomposición: </span>
                  <span style={{ color: mainColor, fontWeight: 800 }}>
                    {shape.count}
                  </span>
                  <span style={{ color: "#555" }}> ({shape.name}) + </span>
                  <span
                    style={{ color: bandColor(shape.count), fontWeight: 800 }}
                  >
                    {repr.remainder}
                  </span>
                  <span style={{ color: "#555" }}> = {n}</span>
                </div>
              )}
            </div>
          )}

          {/* Alternate shape selector */}
          {shape && (
            <AltShapePicker
              shapes={altShapes}
              selected={shape}
              onSelect={handleAltShape}
            />
          )}

          {/* Counting pedagogy */}
          <PipDisplay n={n} />
          <LayerBreakdown cubeList={cubeList} />

          {/* Quick number buttons for landmark values */}
          <div style={S.quickSection}>
            <div style={S.quickTitle}>NÚMEROS ESPECIALES</div>
            <div style={S.quickGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map((v) => {
                const isActive = n === v;
                const bc = bandColor(v - 1);
                return (
                  <button
                    key={v}
                    onClick={() => {
                      setInputVal(String(v));
                      commit(v);
                    }}
                    style={{
                      ...S.quickBtn,
                      background: isActive ? bc + "28" : "transparent",
                      borderColor: isActive ? bc : "#ffffff15",
                      color: isActive ? bc : "#555",
                    }}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 7. STYLES
// =============================================================================

const CARD = {
  background: "#131325",
  border: "1px solid #ffffff0d",
  borderRadius: 14,
  padding: "12px 14px",
};

const S = {
  // ── Root ──────────────────────────────────────────────────────────────────
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
  bgPattern: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
    backgroundImage: "radial-gradient(circle, #ffffff05 1px, transparent 1px)",
    backgroundSize: "24px 24px",
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    position: "relative",
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "11px 20px",
    background: "#0b0b18f2",
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
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  headerHint: {
    fontSize: 11,
    color: "#334",
    background: "#ffffff0a",
    padding: "3px 10px",
    borderRadius: 8,
    border: "1px solid #ffffff0f",
  },

  // ── Layout ────────────────────────────────────────────────────────────────
  body: {
    position: "relative",
    zIndex: 5,
    flex: 1,
    display: "flex",
    gap: 16,
    padding: "14px 18px",
    flexWrap: "wrap",
  },
  leftCol: {
    flex: "1 1 440px",
    display: "flex",
    flexDirection: "column",
    gap: 11,
  },
  rightCol: {
    flex: "0 0 300px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  // ── Canvas ────────────────────────────────────────────────────────────────
  canvas: {
    width: "100%",
    height: "100%",
    borderRadius: "inherit",
    cursor: "grab",
  },
  canvasBox: {
    height: 440,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
    border: "1px solid #ffffff0f",
    background: "#0d0d1e",
    boxShadow: "0 20px 60px #00000088",
  },
  orbitHint: { display: "none" },
  orbitCaption: {
    position: "absolute",
    bottom: 10,
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: 10,
    color: "#ffffff28",
    pointerEvents: "none",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  countBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    borderRadius: 10,
    padding: "6px 14px",
    display: "flex",
    alignItems: "baseline",
    gap: 5,
    backdropFilter: "blur(8px)",
  },
  countBadgeN: { fontSize: 26, fontWeight: 900, color: "#fff", lineHeight: 1 },
  countBadgeLabel: { fontSize: 11, fontWeight: 700, color: "#ffffffcc" },
  compositeBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "#000000aa",
    borderRadius: 9,
    padding: "5px 11px",
    fontSize: 13,
    fontWeight: 700,
    backdropFilter: "blur(8px)",
    border: "1px solid #ffffff12",
  },
  compositeOp: { color: "#555" },

  // ── Gallery strip ────────────────────────────────────────────────────────
  gallery: { ...CARD, display: "flex", flexDirection: "column", gap: 8 },
  galleryTitle: {
    fontSize: 10,
    color: "#444",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  galleryGrid: { display: "flex", flexWrap: "wrap", gap: 4 },
  galleryItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    padding: "5px 8px",
    borderRadius: 8,
    border: "1px solid",
    cursor: "pointer",
    transition: "all 0.13s",
    background: "transparent",
    minWidth: 40,
  },
  galleryCount: { fontSize: 14, fontWeight: 900, lineHeight: 1 },
  galleryName: { fontSize: 9, color: "#555", fontWeight: 600 },

  // ── Number input card ────────────────────────────────────────────────────
  inputCard: {
    ...CARD,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  inputLabel: {
    fontSize: 10,
    color: "#555",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  numberInput: {
    background: "#181830",
    border: "2px solid",
    borderRadius: 11,
    padding: "10px 14px",
    fontSize: 36,
    fontWeight: 900,
    color: "#fff",
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "border-color 0.2s",
    MozAppearance: "textfield",
  },
  inputRange: { display: "flex", flexDirection: "column", gap: 4 },
  rangeSlider: { width: "100%", cursor: "pointer" },
  rangeLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10,
    color: "#444",
  },

  // ── Identity card ────────────────────────────────────────────────────────
  identityCard: {
    ...CARD,
    border: "1.5px solid",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  identityTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  identityName: { fontSize: 17, fontWeight: 900, lineHeight: 1 },
  identityCountChip: {
    border: "1px solid",
    borderRadius: 8,
    padding: "3px 10px",
    fontSize: 18,
    fontWeight: 900,
  },
  insightBox: {
    border: "1px solid",
    borderRadius: 8,
    padding: "7px 11px",
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "monospace",
  },
  hintText: { fontSize: 12, color: "#667", margin: 0, lineHeight: 1.5 },
  compositeHint: {
    fontSize: 12,
    background: "#0e0e26",
    borderRadius: 7,
    padding: "6px 10px",
  },

  // ── Alt shape picker ──────────────────────────────────────────────────────
  altSection: { ...CARD, display: "flex", flexDirection: "column", gap: 7 },
  altTitle: {
    fontSize: 10,
    color: "#555",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  altRow: { display: "flex", gap: 5, flexWrap: "wrap" },
  altPill: {
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid",
    borderRadius: 8,
    padding: "4px 11px",
    cursor: "pointer",
    transition: "all 0.13s",
    background: "transparent",
  },

  // ── Pip display ───────────────────────────────────────────────────────────
  pipSection: { ...CARD, display: "flex", flexDirection: "column", gap: 7 },
  pipTitle: {
    fontSize: 10,
    color: "#555",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  pipGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 3,
    maxHeight: 72,
    overflow: "hidden",
  },
  pip: {
    width: 11,
    height: 11,
    borderRadius: 2,
    flexShrink: 0,
    transition: "background 0.2s",
  },
  pipMore: {
    fontSize: 11,
    color: "#555",
    alignSelf: "center",
    marginLeft: 4,
    fontWeight: 700,
  },
  pipCaption: { fontSize: 12, fontWeight: 700, color: "#ccc" },
  pipOp: { color: "#555", fontWeight: 400 },

  // ── Layer breakdown ───────────────────────────────────────────────────────
  layerSection: { ...CARD, display: "flex", flexDirection: "column", gap: 6 },
  layerTitle: {
    fontSize: 10,
    color: "#555",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  layerRow: { display: "flex", alignItems: "center", gap: 7 },
  layerLabel: {
    fontSize: 10,
    color: "#555",
    fontFamily: "monospace",
    width: 28,
    flexShrink: 0,
  },
  layerBarBg: {
    flex: 1,
    height: 8,
    background: "#ffffff0a",
    borderRadius: 4,
    overflow: "hidden",
  },
  layerBar: { height: "100%", borderRadius: 4, transition: "width 0.3s" },
  layerCount: {
    fontSize: 12,
    fontWeight: 800,
    width: 22,
    textAlign: "right",
    flexShrink: 0,
  },
  layerTotal: {
    fontSize: 11,
    color: "#667",
    textAlign: "right",
    fontFamily: "monospace",
  },

  // ── Quick number buttons ──────────────────────────────────────────────────
  quickSection: { ...CARD, display: "flex", flexDirection: "column", gap: 8 },
  quickTitle: {
    fontSize: 10,
    color: "#444",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  quickGrid: { display: "flex", flexWrap: "wrap", gap: 5 },
  quickBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1px solid",
    cursor: "pointer",
    transition: "all 0.13s",
    fontSize: 13,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
