"use client";
/**
 * MathCubes — multiplicación visual 3D
 *
 * Principio central: COLOR = CANTIDAD de cubos en el grupo.
 * El mismo tamaño de grupo siempre recibe el mismo tono,
 * así el ojo asocia color con cantidad automáticamente.
 *
 * Características:
 *  - Grupos iguales se apilan en el eje Y (torres)
 *  - Grupos-residuo se ubican en zona Z separada (y = 0)
 *  - Cuadrícula dimensional numerada debajo de los cubos
 *  - Cámara ortogonal inicial, rotar con mouse / touch
 *  - Agrupación libre: cualquier tamaño, con o sin divisores
 *
 * Organización del código:
 *  §1  Sistema de color por cantidad
 *  §2  Matemáticas de divisores
 *  §3  Motor de layout 3D
 *  §4  Utilidades Three.js (sprites de texto)
 *  §5  Construcción de la escena (funciones puras)
 *  §6  Componente React — Escena 3D
 *  §7  Componentes de interfaz
 *  §8  App principal
 *  §9  Estilos
 */

import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// §1 · SISTEMA DE COLOR POR CANTIDAD
// ─────────────────────────────────────────────────────────────────────────────

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const ch = (n) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(0)}${ch(8)}${ch(4)}`;
}

const _qColorCache = {};

/** Devuelve el color primario para un grupo de `n` cubos (ángulo dorado). */
function quantityColor(n) {
  if (_qColorCache[n]) return _qColorCache[n];
  const h = (n * 137.508) % 360;
  return (_qColorCache[n] = hslToHex(h, 72 - (n % 5) * 2, 52 + (n % 7) * 2.2));
}

/** Versión oscura del mismo color (bordes, pilares, decoraciones). */
function quantityColorDark(n) {
  const h = (n * 137.508) % 360;
  return hslToHex(h, 58 - (n % 5) * 2, 28 + (n % 7) * 1.4);
}

/** Nombre aproximado del tono para mostrar en la leyenda. */
function quantityColorName(n) {
  const h = (n * 137.508) % 360;
  const buckets = [
    [15, "Rojo"],
    [45, "Naranja"],
    [75, "Amarillo"],
    [120, "Verde"],
    [165, "Menta"],
    [195, "Cian"],
    [240, "Azul"],
    [280, "Violeta"],
    [320, "Púrpura"],
    [360, "Rosa"],
  ];
  for (const [max, name] of buckets) if (h <= max) return name;
  return "Rojo";
}

// Colores de acento para la IU (tabla × selector)
// NO se usan para colorear cubos
const TABLE_ACCENT = {
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

// ─────────────────────────────────────────────────────────────────────────────
// §2 · MATEMÁTICAS DE DIVISORES
// ─────────────────────────────────────────────────────────────────────────────

function getDivisors(n) {
  const result = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) result.push(i);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 · MOTOR DE LAYOUT 3D
// ─────────────────────────────────────────────────────────────────────────────

// Constantes de espaciado
const CUBE_GAP = 1.28; // distancia entre centros de cubos adyacentes
const ROW_MICRO = 0.38; // margen Z extra cada 2 filas (legibilidad)
const COL_SEP = 1.9; // separación X entre tiras de columnas completas
const REM_XSEP = 2.8; // separación X adicional antes de la tira-residuo
const REM_ZSEP = 3.0; // separación Z antes de la zona de fila-residuo
const STACK_GAP = 0.6; // espacio visual entre pisos apilados en Y

/** Posición Z local de la fila `lr` dentro de su grupo (incluye micro-margen). */
const localRowZ = (lr) => lr * CUBE_GAP + Math.floor(lr / 2) * ROW_MICRO;

/** Span Z total de un bloque de `rows` filas. */
const groupZSpan = (rows) => localRowZ(rows - 1) + CUBE_GAP;

/**
 * buildLayout — construye el layout 3D completo.
 *
 * El espacio se divide en 4 regiones según tipo de grupo:
 *  "full"   — gcols×grows, apilados en Y por tira-X       (color dominante)
 *  "remcol" — rc×grows,    misma lógica de pisos, tira-X separada
 *  "remrow" — gcols×rr,    y=0, zona Z separada
 *  "corner" — rc×rr,       y=0, tira-X y zona Z separadas
 *
 * @returns {LayoutResult}
 */
function buildLayout(a, b, gcols, grows) {
  const nfc = Math.floor(a / gcols); // tiras-col completas
  const rc = a % gcols; // residuo de columnas
  const nfr = Math.floor(b / grows); // pisos (stacks en Y)
  const rr = b % grows; // residuo de filas

  const stackYStep = groupZSpan(grows) + STACK_GAP;
  const remRowZBase = groupZSpan(grows) + REM_ZSEP;

  // X de cada tira de columnas
  const colStripX = (cg) =>
    cg < nfc
      ? cg * (gcols * CUBE_GAP + COL_SEP)
      : nfc * (gcols * CUBE_GAP + COL_SEP) + REM_XSEP;

  // Acumular cubos
  const cubes = [];

  function addBlock({ type, cg, rg, w, h, xBase, yBase, zBase }) {
    for (let lr = 0; lr < h; lr++)
      for (let lc = 0; lc < w; lc++)
        cubes.push({
          x: xBase + lc * CUBE_GAP,
          y: yBase,
          z: zBase + localRowZ(lr),
          cg,
          rg,
          lc,
          lr,
          type,
          w,
          h,
        });
  }

  for (let rg = 0; rg < nfr; rg++)
    for (let cg = 0; cg < nfc; cg++)
      addBlock({
        type: "full",
        cg,
        rg,
        w: gcols,
        h: grows,
        xBase: colStripX(cg),
        yBase: rg * stackYStep,
        zBase: 0,
      });

  if (rc > 0)
    for (let rg = 0; rg < nfr; rg++)
      addBlock({
        type: "remcol",
        cg: nfc,
        rg,
        w: rc,
        h: grows,
        xBase: colStripX(nfc),
        yBase: rg * stackYStep,
        zBase: 0,
      });

  if (rr > 0)
    for (let cg = 0; cg < nfc; cg++)
      addBlock({
        type: "remrow",
        cg,
        rg: nfr,
        w: gcols,
        h: rr,
        xBase: colStripX(cg),
        yBase: 0,
        zBase: remRowZBase,
      });

  if (rc > 0 && rr > 0)
    addBlock({
      type: "corner",
      cg: nfc,
      rg: nfr,
      w: rc,
      h: rr,
      xBase: colStripX(nfc),
      yBase: 0,
      zBase: remRowZBase,
    });

  if (!cubes.length)
    return {
      cubes: [],
      groups: {},
      nfc,
      rc,
      nfr,
      rr,
      stackYStep,
      centroid: { x: 0, y: 0, z: 0 },
      bbox: { dx: 2, dy: 1, dz: 2 },
      gridLines: null,
    };

  // Centrar en XZ
  const allX = cubes.map((c) => c.x),
    allZ = cubes.map((c) => c.z),
    allY = cubes.map((c) => c.y);
  const cxMid = (Math.min(...allX) + Math.max(...allX)) / 2;
  const czMid = (Math.min(...allZ) + Math.max(...allZ)) / 2;
  cubes.forEach((c) => {
    c.x -= cxMid;
    c.z -= czMid;
  });

  // Metadatos por grupo
  const groups = {};
  cubes.forEach(({ x, y, z, cg, rg, type, w, h }) => {
    const key = `${type}_${cg}_${rg}`;
    if (!groups[key])
      groups[key] = { type, cg, rg, w, h, xs: [], ys: [], zs: [], n: 0 };
    const g = groups[key];
    g.xs.push(x);
    g.ys.push(y);
    g.zs.push(z);
    g.n++;
  });
  for (const g of Object.values(groups)) {
    g.x0 = Math.min(...g.xs) - 0.65;
    g.x1 = Math.max(...g.xs) + 0.65;
    g.y0 = Math.min(...g.ys);
    g.z0 = Math.min(...g.zs) - 0.65;
    g.z1 = Math.max(...g.zs) + 0.65;
    g.cx = (g.x0 + g.x1) / 2;
    g.cz = (g.z0 + g.z1) / 2;
    g.size = g.w * g.h;
  }

  // Datos para la cuadrícula dimensional
  const xMin = Math.min(...cubes.map((c) => c.x)) - 0.65;
  const xMax = Math.max(...cubes.map((c) => c.x)) + 0.65;
  const zMin = Math.min(...cubes.map((c) => c.z)) - 0.65;
  const zMax = Math.max(...cubes.map((c) => c.z)) + 0.65;

  // Fronteras X con su conteo acumulado de columnas
  const xFrontiers = [{ wx: xMin, label: 0 }];
  for (let cg = 0; cg < nfc; cg++) {
    const wx =
      Math.max(
        ...cubes
          .filter((c) => c.cg === cg && c.type === "full")
          .map((c) => c.x),
      ) + 0.65;
    xFrontiers.push({ wx, label: (cg + 1) * gcols });
  }
  if (rc > 0) xFrontiers.push({ wx: xMax, label: a });

  // Fronteras Z con su conteo acumulado de filas
  const mainZMax =
    Math.max(
      ...cubes
        .filter((c) => c.type === "full" || c.type === "remcol")
        .map((c) => c.z),
    ) + 0.65;
  const zFrontiers = [
    { wz: zMin, label: 0 },
    { wz: mainZMax, label: grows },
  ];
  if (rr > 0) zFrontiers.push({ wz: zMax, label: b });

  return {
    cubes,
    groups,
    nfc,
    rc,
    nfr,
    rr,
    stackYStep,
    centroid: { x: 0, y: (Math.min(...allY) + Math.max(...allY)) / 2, z: 0 },
    bbox: {
      dx: Math.max(...allX) - Math.min(...allX) + 1,
      dy: Math.max(...allY) - Math.min(...allY) + 1,
      dz: Math.max(...allZ) - Math.min(...allZ) + 1,
    },
    gridLines: { xMin, xMax, zMin, zMax, xFrontiers, zFrontiers },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 · UTILIDADES THREE.JS (sprites de texto)
// ─────────────────────────────────────────────────────────────────────────────

/** Sprite de texto con fondo coloreado, para etiquetas de grupos. */
function makeGroupSprite(text, hexColor) {
  const cv = document.createElement("canvas");
  cv.width = 380;
  cv.height = 96;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = hexColor + "cc";
  ctx.beginPath();
  ctx.roundRect(4, 4, 372, 88, 18);
  ctx.fill();
  ctx.strokeStyle = "#ffffff44";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 46px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#00000077";
  ctx.shadowBlur = 7;
  ctx.fillText(text, 190, 48);
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      depthTest: false,
    }),
  );
  spr.scale.set(3.8, 0.96, 1);
  return spr;
}

/** Sprite pequeño para etiquetas de la cuadrícula dimensional. */
function makeAxisLabel(text, color) {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 64;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = color + "18";
  ctx.beginPath();
  ctx.roundRect(4, 8, 120, 48, 8);
  ctx.fill();
  ctx.fillStyle = color + "cc";
  ctx.font = "bold 30px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 32);
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      depthTest: false,
    }),
  );
  spr.scale.set(0.8, 0.4, 1);
  return spr;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 · CONSTRUCCIÓN DE LA ESCENA (funciones puras)
// ─────────────────────────────────────────────────────────────────────────────

const GRID_Y = -0.5; // altura de la cuadrícula (justo bajo los cubos)

function sceneLine(scene, x0, y0, z0, x1, y1, z1, hexColor, opacity) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x0, y0, z0),
      new THREE.Vector3(x1, y1, z1),
    ]),
    new THREE.LineBasicMaterial({
      color: new THREE.Color(hexColor),
      transparent: true,
      opacity,
    }),
  );
  line.userData.rm = true;
  scene.add(line);
}

/**
 * Cuadrícula dimensional con contorno, fronteras de grupo, y etiquetas
 * acumulativas en los ejes X y Z.
 */
function buildDimensionGrid(scene, gridLines) {
  if (!gridLines) return;
  const { xMin, xMax, zMin, zMax, xFrontiers, zFrontiers } = gridLines;
  const Y = GRID_Y;

  // Contorno del footprint total
  [
    [xMin, Y, zMin, xMax, Y, zMin],
    [xMax, Y, zMin, xMax, Y, zMax],
    [xMax, Y, zMax, xMin, Y, zMax],
    [xMin, Y, zMax, xMin, Y, zMin],
  ].forEach(([x0, y0, z0, x1, y1, z1]) =>
    sceneLine(scene, x0, y0, z0, x1, y1, z1, "#9999cc", 0.4),
  );

  // Líneas de frontera en X (columnas)
  xFrontiers.forEach(({ wx }) =>
    sceneLine(scene, wx, Y, zMin, wx, Y, zMax, "#7777aa", 0.26),
  );

  // Líneas de frontera en Z (filas)
  zFrontiers.forEach(({ wz }) =>
    sceneLine(scene, xMin, Y, wz, xMax, Y, wz, "#7777aa", 0.26),
  );

  // Etiquetas eje X (conteo acumulado de columnas)
  xFrontiers.forEach(({ wx, label }) => {
    const spr = makeAxisLabel(`${label}`, "#aabbdd");
    spr.position.set(wx, Y + 0.14, zMin - 1.0);
    spr.userData.rm = true;
    scene.add(spr);
  });

  // Etiquetas eje Z (conteo acumulado de filas)
  zFrontiers
    .filter(({ label }) => label > 0)
    .forEach(({ wz, label }) => {
      const spr = makeAxisLabel(`${label}`, "#aaddbb");
      spr.position.set(xMin - 1.1, Y + 0.14, wz);
      spr.userData.rm = true;
      scene.add(spr);
    });
}

/**
 * Plataformas bajo cada grupo, con bordes, marca-X para residuos,
 * esfera indicadora de esquina, y pilares para torres apiladas.
 */
function buildGroupPlatforms(scene, groups, nfr) {
  for (const g of Object.values(groups)) {
    const hex = quantityColor(g.size);
    const col = new THREE.Color(hex);
    const isRem = g.type !== "full";
    const pw = g.x1 - g.x0,
      pd = g.z1 - g.z0;

    // Slab de plataforma
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(pw, 0.16, pd),
      new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.9,
        transparent: true,
        opacity: isRem ? 0.09 : 0.2,
      }),
    );
    slab.position.set(g.cx, g.y0 - 0.56, g.cz);
    slab.receiveShadow = true;
    slab.userData.rm = true;
    scene.add(slab);

    // Borde del slab
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(pw, 0.16, pd)),
      new THREE.LineBasicMaterial({
        color: col,
        transparent: true,
        opacity: isRem ? 0.65 : 0.45,
      }),
    );
    border.position.copy(slab.position);
    border.userData.rm = true;
    scene.add(border);

    // Marca en X para residuos (distingue visualmente la zona irregular)
    if (isRem) {
      const xGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(g.x0, GRID_Y + 0.04, g.z0),
        new THREE.Vector3(g.x1, GRID_Y + 0.04, g.z1),
        new THREE.Vector3(g.x1, GRID_Y + 0.04, g.z0),
        new THREE.Vector3(g.x0, GRID_Y + 0.04, g.z1),
      ]);
      const xMark = new THREE.LineSegments(
        xGeo,
        new THREE.LineBasicMaterial({
          color: new THREE.Color(quantityColorDark(g.size)),
          transparent: true,
          opacity: 0.48,
        }),
      );
      xMark.userData.rm = true;
      scene.add(xMark);
    }

    // Esfera indicadora de esquina
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 8, 8),
      new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.55,
      }),
    );
    knob.position.set(g.x0, g.y0 - 0.5, g.z0);
    knob.userData.rm = true;
    scene.add(knob);

    // Pilares verticales entre pisos (sólo en grupos full apilados)
    if (nfr > 1 && g.type === "full" && g.rg > 0) {
      [
        [g.x0, g.z0],
        [g.x1, g.z0],
        [g.x0, g.z1],
        [g.x1, g.z1],
      ].forEach(([px, pz]) => {
        sceneLine(scene, px, GRID_Y + 0.02, pz, px, g.y0 - 0.58, pz, hex, 0.2);
      });
    }
  }
}

/**
 * Crea un Mesh por cubo con animación de entrada.
 * Devuelve el array de meshes para que el loop de animación pueda actualizarlos.
 */
function buildCubeMeshes(scene, cubes, startTime) {
  return cubes.map(({ x, y, z, w, h, type }, idx) => {
    const size = w * h;
    const hex = quantityColor(size);
    const col = new THREE.Color(hex);
    const isRem = type !== "full";

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.26,
      metalness: 0.18,
      emissive: col,
      emissiveIntensity: 0.08,
      transparent: isRem,
      opacity: isRem ? 0.82 : 1.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { animStart: startTime + idx * 0.013, finalY: y, rm: true };

    // Aristas visibles
    mesh.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(hex).multiplyScalar(0.42),
          transparent: true,
          opacity: 0.38,
        }),
      ),
    );

    scene.add(mesh);
    return mesh;
  });
}

/**
 * Etiqueta flotante con el tamaño del grupo sobre cada tira (una por columna).
 * Muestra la etiqueta en el piso más alto de la tira.
 */
function buildGroupLabels(scene, groups) {
  const renderedStrips = new Set();
  const byYDesc = Object.values(groups).sort((a, b) => b.y0 - a.y0);

  for (const g of byYDesc) {
    const key = `${g.type}_${g.cg}`;
    if (renderedStrips.has(key)) continue;
    renderedStrips.add(key);
    const spr = makeGroupSprite(`${g.size}`, quantityColor(g.size));
    spr.position.set(g.cx, g.y0 + 2.0, g.cz);
    spr.userData.rm = true;
    scene.add(spr);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 · COMPONENTE REACT — ESCENA 3D
// ─────────────────────────────────────────────────────────────────────────────

function CubeScene({ a, b, gcols, grows, showLabels }) {
  const containerRef = useRef(null);
  const clock = useRef(new THREE.Clock());

  // Todos los refs de Three.js en un solo objeto estable (no dispara re-renders)
  const three = useRef({
    renderer: null,
    scene: null,
    camera: null,
    raf: null,
    animMeshes: [],
    orbitR: 10,
    rotY: 0.0, // ángulo azimutal (0 = frente)
    rotX: 0.5, // ángulo de elevación (~29°)
    target: new THREE.Vector3(),
    drag: { active: false, lastX: 0, lastY: 0 },
  });

  // ── Montaje: renderer, cámara, luces, loop de animación ───────────────────
  useEffect(() => {
    const el = containerRef.current;
    const t = three.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    t.renderer = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      100,
      el.clientWidth / el.clientHeight / 1.3,
      0.6,
      200,
    );
    t.scene = scene;
    t.camera = camera;

    // Luces: ambiente + sol direccional + dos rellenos
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(12, 22, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 300;
    ["left", "right", "top", "bottom"].forEach((k, i) => {
      sun.shadow.camera[k] = [-60, 60, 60, -60][i];
    });
    scene.add(sun);
    const fill1 = new THREE.DirectionalLight(0xaaddff, 0.28);
    fill1.position.set(-10, 8, -8);
    scene.add(fill1);
    const fill2 = new THREE.DirectionalLight(0xffeedd, 0.16);
    fill2.position.set(0, -6, 0);
    scene.add(fill2);

    // Loop de animación
    const animate = () => {
      t.raf = requestAnimationFrame(animate);
      const now = clock.current.getElapsedTime();

      // Bounce-in de cubos
      t.animMeshes.forEach((mesh) => {
        const { animStart, finalY } = mesh.userData;
        const p = Math.min(1, Math.max(0, now - animStart) / 0.5);
        const eased = 1 - Math.pow(1 - p, 3) + Math.sin(p * Math.PI) * 0.062;
        mesh.position.y = THREE.MathUtils.lerp(
          finalY - 14,
          finalY,
          Math.min(eased, 1),
        );
      });

      // Posición de cámara orbital (coordenadas esféricas)
      const { orbitR: R, rotX, rotY, target } = t;
      const desired = new THREE.Vector3(
        target.x + R * Math.cos(rotX) * Math.sin(rotY),
        target.y + R * Math.sin(rotX),
        target.z + R * Math.cos(rotX) * Math.cos(rotY),
      );
      camera.position.lerp(desired, t.drag.active ? 1.0 : 0.055);
      camera.lookAt(target);

      renderer.render(scene, camera);
    };
    animate();

    // Controles de órbita (mouse y touch)
    const startDrag = (x, y) => {
      t.drag.active = true;
      t.drag.lastX = x;
      t.drag.lastY = y;
      el.style.cursor = "grabbing";
    };
    const moveDrag = (x, y) => {
      if (!t.drag.active) return;
      t.rotY += (x - t.drag.lastX) * 0.012;
      t.rotX = Math.max(
        0.08,
        Math.min(1.45, t.rotX - (y - t.drag.lastY) * 0.008),
      );
      t.drag.lastX = x;
      t.drag.lastY = y;
    };
    const endDrag = () => {
      t.drag.active = false;
      el.style.cursor = "grab";
    };

    const onMouseDown = (e) => startDrag(e.clientX, e.clientY);
    const onMouseMove = (e) => moveDrag(e.clientX, e.clientY);
    const onTouchStart = (e) => {
      const p = e.touches[0];
      startDrag(p.clientX, p.clientY);
    };
    const onTouchMove = (e) => {
      const p = e.touches[0];
      moveDrag(p.clientX, p.clientY);
    };

    el.style.cursor = "grab";
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", endDrag);
    window.addEventListener("resize", () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    return () => {
      cancelAnimationFrame(t.raf);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", endDrag);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // ── Reconstruir escena cuando cambian los parámetros ─────────────────────
  useEffect(() => {
    const t = three.current;
    if (!t.scene) return;
    const { scene, camera } = t;

    // Limpiar objetos de la escena anterior
    scene.children.filter((o) => o.userData.rm).forEach((o) => scene.remove(o));
    t.animMeshes = [];

    // Suelo
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0b0b1a, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.52;
    ground.receiveShadow = true;
    ground.userData.rm = true;
    scene.add(ground);

    // Layout y escena
    const layout = buildLayout(a, b, gcols, grows);
    const { cubes, groups, bbox, centroid, gridLines, nfr } = layout;
    if (!cubes.length) return;

    const isGrouped = gcols < a || grows < b;
    const t0 = clock.current.getElapsedTime();

    buildDimensionGrid(scene, gridLines);
    if (isGrouped) buildGroupPlatforms(scene, groups, nfr);
    t.animMeshes = buildCubeMeshes(scene, cubes, t0);
    if (isGrouped && showLabels) buildGroupLabels(scene, groups);

    // Ajustar radio orbital al tamaño de la escena
    const maxSpan = Math.max(bbox.dx, bbox.dz, bbox.dy * 1.4);
    const fovRad = camera.fov * (Math.PI / 180);
    t.orbitR = (maxSpan / 2 / Math.tan(fovRad / 2)) * 1.75;
    t.target.set(centroid.x, centroid.y, centroid.z);
  }, [a, b, gcols, grows, showLabels]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
    >
      <span style={S.orbitHint}>↔ Arrastra para rotar</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 · COMPONENTES DE INTERFAZ
// ─────────────────────────────────────────────────────────────────────────────

/** Leyenda de color-por-cantidad: swatch + nombre + contribución al total. */
function QuantityLegend({ a, b, gcols, grows }) {
  const { nfc, rc, nfr, rr } = buildLayout(a, b, gcols, grows);

  // Construir entradas únicas por tamaño
  const seen = new Set();
  const entries = [
    {
      size: gcols * grows,
      count: nfc * nfr,
      label: `${gcols}×${grows}`,
      show: nfc > 0 && nfr > 0,
    },
    {
      size: rc * grows,
      count: nfr,
      label: `${rc}×${grows}`,
      show: rc > 0 && nfr > 0,
    },
    {
      size: gcols * rr,
      count: nfc,
      label: `${gcols}×${rr}`,
      show: rr > 0 && nfc > 0,
    },
    { size: rc * rr, count: 1, label: `${rc}×${rr}`, show: rc > 0 && rr > 0 },
  ].filter(
    (e) => e.show && e.size > 0 && !seen.has(e.size) && seen.add(e.size),
  );

  if (!entries.length) return null;
  const total = entries.reduce((s, e) => s + e.count * e.size, 0);

  return (
    <div style={S.legend}>
      <div style={S.legendHead}>
        <span style={S.legendTitle}>COLOR = CANTIDAD DE CUBOS</span>
        <span style={S.legendSubtitle}>
          mismo color → mismo tamaño de grupo
        </span>
      </div>

      {entries.map((e) => {
        const hex = quantityColor(e.size);
        return (
          <div
            key={e.size}
            style={{
              ...S.legendRow,
              borderColor: hex + "55",
              background: hex + "12",
            }}
          >
            <div style={{ ...S.legendSwatch, background: hex }}>
              <span style={S.legendSwatchNum}>{e.size}</span>
            </div>
            <div style={S.legendInfo}>
              <span style={{ color: hex, fontWeight: 900, fontSize: 17 }}>
                {e.size} cubos
              </span>
              <span style={S.legendColorLabel}>
                {quantityColorName(e.size)} · {e.label}
              </span>
            </div>
            <div style={S.legendContrib}>
              <span style={{ color: hex, fontWeight: 900, fontSize: 15 }}>
                {e.count > 1 ? `${e.count}×${e.size} = ` : ""}
                {e.count * e.size}
              </span>
              <span style={S.legendGroupCount}>
                {e.count} {e.count === 1 ? "grupo" : "grupos"}
              </span>
            </div>
          </div>
        );
      })}

      {entries.length > 1 && (
        <div style={S.legendSumLine}>
          {entries.map((e, i) => {
            const hex = quantityColor(e.size);
            return (
              <span
                key={e.size}
                style={{ display: "flex", alignItems: "center", gap: 3 }}
              >
                <span style={{ color: hex, fontWeight: 800 }}>
                  {e.count * e.size}
                </span>
                {i < entries.length - 1 && (
                  <span style={{ color: "#444" }}>+</span>
                )}
              </span>
            );
          })}
          <span style={{ color: "#444" }}>=</span>
          <span
            style={{
              color: quantityColor(gcols * grows),
              fontWeight: 900,
              fontSize: 18,
            }}
          >
            {total}
          </span>
        </div>
      )}
    </div>
  );
}

/** Fila de píldoras de divisores con previsualización del color resultante. */
function DivisorRow({ n, gcols, grows, axis, onSelect }) {
  const current = axis === "col" ? gcols : grows;
  return (
    <div style={S.divisorRow}>
      {getDivisors(n).map((d) => {
        const rem = n % d;
        const size = axis === "col" ? d * grows : gcols * d;
        const hex = quantityColor(size);
        const active = d === current;
        const perfect = rem === 0;
        return (
          <button
            key={d}
            onClick={() => onSelect(d)}
            style={{
              ...S.divisorPill,
              borderColor: active ? hex : perfect ? "#ffffff22" : "#ffffff0d",
              background: active ? hex + "28" : "transparent",
            }}
          >
            <div
              style={{
                ...S.divisorDot,
                background: hex,
                opacity: active ? 1 : 0.55,
              }}
            />
            <span
              style={{
                ...S.divisorNum,
                color: active ? hex : perfect ? "#ccc" : "#555",
              }}
            >
              {d}
            </span>
            {rem > 0 && <span style={S.divisorRem}>+{rem}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Slider de agrupación con swatch de color y divisores rápidos. */
function GroupSlider({ n, gcols, grows, axis, onChange }) {
  const value = axis === "col" ? gcols : grows;
  const groups = Math.floor(n / value);
  const rem = n % value;
  const size = axis === "col" ? value * grows : gcols * value;
  const hex = quantityColor(size);

  return (
    <div style={S.groupSlider}>
      <div style={S.groupSliderTop}>
        <span style={S.groupSliderLabel}>
          {axis === "col" ? "Columnas por grupo" : "Filas por grupo"}
        </span>
        <div style={S.groupSliderValue}>
          <div style={{ ...S.groupSliderSwatch, background: hex }}>
            <span style={S.groupSliderSwatchNum}>{size}</span>
          </div>
          <span style={{ color: hex, fontWeight: 900, fontSize: 15 }}>
            {value}
          </span>
          <span style={S.groupSliderMeta}>
            → {groups}gr
            {rem > 0 && (
              <span style={{ color: hex, opacity: 0.65 }}> +{rem}</span>
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
        onSelect={onChange}
      />
    </div>
  );
}

/** Cuadrícula 2D miniatura coloreada por tamaño de grupo. */
function MiniGrid({ a, b, gcols, grows }) {
  const nfc = Math.floor(a / gcols);
  const nfr = Math.floor(b / grows);
  const maxCols = Math.min(a, 18);
  const maxRows = Math.min(b, 16);

  return (
    <div style={S.miniGrid}>
      {Array.from({ length: maxRows }).map((_, r) => {
        const rg = Math.floor(r / grows);
        const lr = r % grows;
        const isRemRow = rg >= nfr;
        const isNewGroup = lr === 0 && r > 0;
        const isBigGap = isNewGroup && isRemRow && r === nfr * grows;

        return (
          <div key={r}>
            {isNewGroup && (
              <div style={{ height: isBigGap ? 7 : lr % 2 === 0 ? 3 : 0 }} />
            )}
            <div style={S.miniGridRow}>
              {Array.from({ length: maxCols }).map((_, c) => {
                const cg = Math.floor(c / gcols);
                const lc = c % gcols;
                const isRemCol = cg >= nfc;
                const isRem = isRemCol || isRemRow;

                const sz =
                  !isRemCol && !isRemRow
                    ? gcols * grows
                    : isRemCol && !isRemRow
                      ? (a % gcols) * grows
                      : !isRemCol && isRemRow
                        ? gcols * (b % grows)
                        : (a % gcols) * (b % grows);

                const hex = quantityColor(sz);
                const newCol = lc === 0 && c > 0;
                const bigCol = newCol && isRemCol && c === nfc * gcols;

                return (
                  <div
                    key={c}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    {newCol && <div style={{ width: bigCol ? 6 : 2 }} />}
                    <div
                      style={{
                        ...S.miniCube,
                        background: hex,
                        opacity: isRem ? 0.62 : 1,
                        outline: isRem ? `1px dashed ${hex}77` : "none",
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

// ─────────────────────────────────────────────────────────────────────────────
// §8 · APP PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

function randomQuestion() {
  return {
    a: Math.floor(Math.random() * 11) + 2,
    b: Math.floor(Math.random() * 11) + 2,
  };
}

export default function App() {
  const [mult, setMult] = useState({ a: 6, b: 8 });
  const [gcols, setGcols] = useState(6);
  const [grows, setGrows] = useState(8);
  const [showLabels, setShowLabels] = useState(true);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null); // null | "correct" | "wrong" | "revealed"
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  // Valores derivados
  const { a, b } = mult;
  const correct = a * b;
  const tableAccent = TABLE_ACCENT[a] || "#54A0FF";
  const domColor = quantityColor(gcols * grows);
  const isGrouped = gcols < a || grows < b;
  const accuracy =
    score.total > 0 ? Math.round((score.ok / score.total) * 100) : 0;

  const { nfc, rc, nfr, rr } = buildLayout(a, b, gcols, grows);

  // Partes de la descomposición para mostrar en la pregunta
  const parts = [
    nfc > 0 && nfr > 0 && { size: gcols * grows, count: nfc * nfr },
    rc > 0 && nfr > 0 && { size: rc * grows, count: nfr },
    rr > 0 && nfc > 0 && { size: gcols * rr, count: nfc },
    rc > 0 && rr > 0 && { size: rc * rr, count: 1 },
  ].filter(Boolean);

  // Acciones
  const applyNewMult = useCallback((na, nb) => {
    setMult({ a: na, b: nb });
    setGcols(na);
    setGrows(nb);
    setAnswer("");
    setFeedback(null);
    setRevealed(false);
  }, []);

  const nextQuestion = useCallback(() => {
    const q = randomQuestion();
    applyNewMult(q.a, q.b);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [applyNewMult]);

  const checkAnswer = () => {
    const n = parseInt(answer, 10),
      ok = n === correct;
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }));
    if (ok) {
      setFeedback("correct");
      setStreak((s) => s + 1);
      setTimeout(nextQuestion, 1400);
    } else {
      setFeedback("wrong");
      setStreak(0);
      setShake(true);
      setTimeout(() => setShake(false), 450);
    }
  };

  const revealAnswer = () => {
    setRevealed(true);
    setFeedback("revealed");
    setStreak(0);
    setScore((s) => ({ ...s, total: s.total + 1 }));
    setTimeout(nextQuestion, 2800);
  };

  return (
    <div style={S.root}>
      <div style={S.bgPattern} />

      {/* ── Encabezado ─────────────────────────────────────────────────── */}
      <header style={S.header}>
        <div style={S.logoGroup}>
          {[2, 5, 9].map((k) => (
            <span
              key={k}
              style={{
                ...S.logoCube,
                background: `hsl(${(k * 137.508 * 3) % 360},70%,55%)`,
              }}
            />
          ))}
          <span style={S.logoText}>MathCubes</span>
          {isGrouped && (
            <span style={{ ...S.logoMode, color: domColor }}>
              grupos de {gcols * grows}
            </span>
          )}
        </div>
        <div style={S.statsRow}>
          {[
            ["✓", score.ok, "#48CA8B"],
            ["Total", score.total, "#ccc"],
            [
              "%",
              accuracy,
              accuracy > 70 ? "#48CA8B" : accuracy > 40 ? "#FECA57" : "#FF6B6B",
            ],
          ].map(([lbl, val, col]) => (
            <div key={lbl} style={S.statBadge}>
              <span style={S.statLabel}>{lbl}</span>
              <span style={{ ...S.statValue, color: col }}>{val}</span>
            </div>
          ))}
          {streak >= 3 && <div style={S.streakBadge}>🔥 {streak}</div>}
        </div>
      </header>

      {/* ── Cuerpo ─────────────────────────────────────────────────────── */}
      <div style={S.body}>
        {/* Columna izquierda */}
        <div style={S.colLeft}>
          {/* Canvas 3D */}
          <div
            style={{
              ...S.canvas3d,
              boxShadow: `0 0 90px ${domColor}16, 0 20px 60px #00000090`,
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
            <div style={{ ...S.canvasTag, background: tableAccent + "dd" }}>
              <b>{a}</b>×<b>{b}</b> = <b>{correct}</b>
            </div>
            {nfr > 1 && (
              <div
                style={{
                  ...S.stackBadge,
                  borderColor: domColor + "55",
                  background: domColor + "18",
                }}
              >
                <span style={{ color: domColor }}>🗼 {nfr} pisos</span>
              </div>
            )}
            {revealed && (
              <div style={S.revealOverlay}>
                <span style={{ ...S.revealNumber, color: domColor }}>
                  {correct}
                </span>
                <span style={S.revealLabel}>cubos en total</span>
              </div>
            )}
          </div>

          {/* Leyenda de color-por-cantidad */}
          <QuantityLegend a={a} b={b} gcols={gcols} grows={grows} />

          {/* Controles de agrupación */}
          <div style={S.controlPanel}>
            <div style={S.controlHeader}>
              <span style={S.controlTitle}>AGRUPACIÓN LIBRE</span>
              <div style={{ display: "flex", gap: 5 }}>
                <button
                  onClick={() => setShowLabels((v) => !v)}
                  style={{
                    ...S.smallBtn,
                    borderColor: showLabels ? domColor + "66" : "#333",
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

            {/* Barra de estado: división euclidiana */}
            <div style={S.statusBar}>
              {[
                { lbl: "Col", n: a, val: gcols, grps: nfc, rem: rc },
                { lbl: "Fil", n: b, val: grows, grps: nfr, rem: rr },
              ].map(({ lbl, n, val, grps, rem }) => {
                const hex = quantityColor(gcols * grows);
                return (
                  <div key={lbl} style={S.statusSection}>
                    <span style={S.statusAxisLabel}>{lbl}</span>
                    <span style={{ color: "#ddd", fontWeight: 800 }}>{n}</span>
                    <span style={S.statusOp}>=</span>
                    <span style={{ color: hex, fontWeight: 700 }}>{val}</span>
                    <span style={S.statusOp}>×</span>
                    <span style={{ color: "#bbb" }}>{grps}</span>
                    {rem > 0 && (
                      <>
                        <span style={S.statusOp}>+</span>
                        <span
                          style={{ color: hex, fontWeight: 800, opacity: 0.75 }}
                        >
                          {rem}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
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

        {/* Columna derecha */}
        <div style={S.colRight}>
          {/* Tarjeta de pregunta */}
          <div style={{ ...S.questionCard, borderColor: tableAccent + "44" }}>
            <div style={S.questionTop}>
              <span style={S.questionLabel}>¿CUÁNTO ES?</span>
              {streak >= 2 && <span style={S.streakLabel}>🔥 {streak}</span>}
            </div>

            <div style={S.questionEq}>
              <span style={{ ...S.qNum, color: tableAccent }}>{a}</span>
              <span style={S.qOp}>×</span>
              <span style={{ ...S.qNum, color: tableAccent + "aa" }}>{b}</span>
              <span style={S.qOp}>=</span>
              <span style={S.qSlot}>?</span>
            </div>

            {/* Descomposición con color */}
            {isGrouped && parts.length > 0 && (
              <div style={S.decomp}>
                {parts.map((p, i) => {
                  const hex = quantityColor(p.size);
                  return (
                    <span
                      key={i}
                      style={{ display: "flex", alignItems: "center", gap: 3 }}
                    >
                      <div style={{ ...S.decompDot, background: hex }} />
                      <span
                        style={{ color: hex, fontWeight: 800, fontSize: 12 }}
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
                <span style={{ color: "#444" }}>=</span>
                <span style={{ color: domColor, fontWeight: 900 }}>
                  {correct}
                </span>
              </div>
            )}

            <MiniGrid a={a} b={b} gcols={gcols} grows={grows} />
          </div>

          {/* Input de respuesta */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
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
              onKeyDown={(e) =>
                e.key === "Enter" && answer !== "" && checkAnswer()
              }
              style={{
                ...S.answerInput,
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
                  ...S.feedbackBanner,
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
                {feedback === "wrong" && "✗ Suma los colores de la leyenda"}
                {feedback === "revealed" && `Respuesta: ${correct}`}
              </div>
            )}
          </div>

          {/* Botones */}
          <div style={S.actionBtns}>
            <button
              onClick={checkAnswer}
              disabled={answer === ""}
              style={{
                ...S.btnPrimary,
                background: answer !== "" ? domColor : "#1a1a2e",
                cursor: answer !== "" ? "pointer" : "not-allowed",
                boxShadow: answer !== "" ? `0 6px 22px ${domColor}44` : "none",
              }}
            >
              Verificar ↵
            </button>
            <button onClick={revealAnswer} style={S.btnSecondary}>
              Ver ✦
            </button>
            <button onClick={nextQuestion} style={S.btnTertiary}>
              Nueva ↺
            </button>
          </div>

          {/* Sliders de multiplicación */}
          <div style={S.multPanel}>
            <span style={S.panelTitle}>MULTIPLICACIÓN</span>
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { k: "a", label: "Tabla", max: 19 },
                { k: "b", label: "Veces", max: 19 },
              ].map(({ k, label, max }) => (
                <div
                  key={k}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                  }}
                >
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span
                      style={{ fontSize: 11, color: "#666", fontWeight: 600 }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 900,
                        color: tableAccent,
                      }}
                    >
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

          {/* Selector de tabla por acento */}
          <div style={S.tableChipPanel}>
            <span style={S.panelTitle}>TABLA</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {Object.entries(TABLE_ACCENT).map(([k, color]) => (
                <button
                  key={k}
                  onClick={() => applyNewMult(parseInt(k), b)}
                  title={`Tabla del ${k}`}
                  style={{
                    ...S.tableChip,
                    background: color,
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

// ─────────────────────────────────────────────────────────────────────────────
// §9 · ESTILOS
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  // Raíz y fondo
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
    backgroundImage: "radial-gradient(circle,#ffffff06 1px,transparent 1px)",
    backgroundSize: "28px 28px",
  },

  // Header
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
  logoGroup: { display: "flex", alignItems: "center", gap: 5 },
  logoCube: { width: 11, height: 11, borderRadius: 3 },
  logoText: {
    fontSize: 20,
    fontWeight: 900,
    color: "#fff",
    marginLeft: 6,
    letterSpacing: "-0.5px",
  },
  logoMode: {
    fontSize: 11,
    fontWeight: 700,
    marginLeft: 8,
    letterSpacing: "0.3px",
  },
  statsRow: { display: "flex", alignItems: "center", gap: 5 },
  statBadge: {
    display: "flex",
    gap: 5,
    alignItems: "center",
    background: "#ffffff0b",
    border: "1px solid #ffffff12",
    borderRadius: 20,
    padding: "4px 11px",
  },
  statLabel: {
    fontSize: 11,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  },
  statValue: { fontSize: 14, fontWeight: 800 },
  streakBadge: {
    background: "linear-gradient(135deg,#FF6B6B,#FF9F43)",
    borderRadius: 20,
    padding: "4px 11px",
    fontSize: 13,
    fontWeight: 800,
    color: "#fff",
  },

  // Body y columnas
  body: {
    position: "relative",
    zIndex: 5,
    flex: 1,
    display: "flex",
    gap: 16,
    padding: "14px 18px",
    flexWrap: "wrap",
  },
  colLeft: {
    flex: "1 1 440px",
    display: "flex",
    flexDirection: "column",
    gap: 11,
  },
  colRight: {
    flex: "0 0 308px",
    display: "flex",
    flexDirection: "column",
    gap: 11,
  },

  // Canvas 3D
  canvas3d: {
    height: 420,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
    border: "1px solid #ffffff0f",
    background: "#0d0d20",
  },
  orbitHint: {
    position: "absolute",
    bottom: 10,
    right: 12,
    fontSize: 11,
    color: "#ffffff30",
    pointerEvents: "none",
    userSelect: "none",
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
  stackBadge: {
    position: "absolute",
    top: 11,
    right: 11,
    borderRadius: 9,
    padding: "4px 10px",
    border: "1px solid",
    fontSize: 11,
    fontWeight: 700,
    backdropFilter: "blur(6px)",
  },
  revealOverlay: {
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
  revealNumber: { fontSize: 50, fontWeight: 900, lineHeight: 1 },
  revealLabel: { fontSize: 11, color: "#777", marginTop: 2 },

  // Leyenda
  legend: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 14,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  legendHead: { display: "flex", flexDirection: "column", gap: 1 },
  legendTitle: {
    fontSize: 10,
    color: "#555",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  legendSubtitle: { fontSize: 11, color: "#3a3a55", fontStyle: "italic" },
  legendRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    border: "1px solid",
    borderRadius: 10,
    padding: "7px 11px",
  },
  legendSwatch: {
    width: 38,
    height: 38,
    borderRadius: 7,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  legendSwatchNum: {
    fontSize: 13,
    fontWeight: 900,
    color: "#fff",
    textShadow: "0 1px 4px #00000077",
  },
  legendInfo: { display: "flex", flexDirection: "column", gap: 1, flex: 1 },
  legendColorLabel: { fontSize: 10, color: "#555" },
  legendContrib: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 1,
  },
  legendGroupCount: { fontSize: 10, color: "#555" },
  legendSumLine: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    borderTop: "1px solid #ffffff0a",
    paddingTop: 7,
  },

  // Panel de controles
  controlPanel: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 14,
    padding: "13px 15px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  controlHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 5,
  },
  controlTitle: {
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
    gap: 10,
    flexWrap: "wrap",
  },
  statusSection: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 13,
    fontWeight: 700,
  },
  statusAxisLabel: {
    fontSize: 10,
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  },
  statusOp: { color: "#333", fontWeight: 300 },

  // GroupSlider
  groupSlider: { display: "flex", flexDirection: "column", gap: 6 },
  groupSliderTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  groupSliderLabel: { fontSize: 11, color: "#666", fontWeight: 700 },
  groupSliderValue: { display: "flex", alignItems: "center", gap: 5 },
  groupSliderSwatch: {
    width: 24,
    height: 24,
    borderRadius: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  groupSliderSwatchNum: {
    fontSize: 9,
    fontWeight: 900,
    color: "#fff",
    textShadow: "0 1px 3px #00000066",
  },
  groupSliderMeta: { fontSize: 11, color: "#555" },

  // Divisor row
  divisorRow: { display: "flex", flexWrap: "wrap", gap: 4 },
  divisorPill: {
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
  divisorDot: { width: 7, height: 7, borderRadius: 2, flexShrink: 0 },
  divisorNum: { fontSize: 13, fontWeight: 900, lineHeight: 1 },
  divisorRem: { fontSize: 9, color: "#888", fontWeight: 700 },

  // Tarjeta de pregunta
  questionCard: {
    background: "#131325",
    border: "1.5px solid",
    borderRadius: 17,
    padding: "15px 17px",
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },
  questionTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  questionLabel: {
    fontSize: 10,
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    fontWeight: 800,
  },
  streakLabel: { fontSize: 12, fontWeight: 800, color: "#FF9F43" },
  questionEq: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  qNum: { fontSize: 50, fontWeight: 900, lineHeight: 1 },
  qOp: { fontSize: 32, fontWeight: 300, color: "#333" },
  qSlot: { fontSize: 50, fontWeight: 900, color: "#1c1c38", lineHeight: 1 },

  // Descomposición
  decomp: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
    justifyContent: "center",
    background: "#0e0e26",
    borderRadius: 8,
    padding: "6px 9px",
  },
  decompDot: { width: 8, height: 8, borderRadius: 2, flexShrink: 0 },

  // Mini grid
  miniGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    alignItems: "center",
    maxHeight: 108,
    overflow: "hidden",
  },
  miniGridRow: { display: "flex", gap: 2 },
  miniCube: {
    width: 8,
    height: 8,
    borderRadius: 2,
    flexShrink: 0,
    transition: "background 0.2s",
  },

  // Input y feedback
  answerInput: {
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
  feedbackBanner: {
    borderRadius: 9,
    border: "1.5px solid",
    padding: "7px 11px",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
  },

  // Botones
  actionBtns: { display: "flex", gap: 6 },
  btnPrimary: {
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
  btnSecondary: {
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
  btnTertiary: {
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

  // Paneles de multiplicación y tabla
  multPanel: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 13,
    padding: "12px 15px",
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },
  tableChipPanel: {
    background: "#131325",
    border: "1px solid #ffffff0d",
    borderRadius: 12,
    padding: "10px 13px",
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },
  panelTitle: {
    fontSize: 10,
    color: "#444",
    fontWeight: 800,
    letterSpacing: "0.8px",
  },
  tableChip: {
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
  slider: { width: "100%", cursor: "pointer" },
};
