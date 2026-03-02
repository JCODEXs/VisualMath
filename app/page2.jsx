"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import Link from "next/link";
import LeaderboardWidget from "./_components/leaderboardWiget";

export default function HomePage() {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // --- Configuración básica ---
    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510); // Azul muy oscuro

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 5, 15);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // --- Luces ---
    const ambientLight = new THREE.AmbientLight(0x404060);
    scene.add(ambientLight);

    const light1 = new THREE.PointLight(0x00ffff, 1, 30);
    light1.position.set(5, 5, 5);
    scene.add(light1);

    const light2 = new THREE.PointLight(0xff00ff, 1, 30);
    light2.position.set(-5, 3, 5);
    scene.add(light2);

    const light3 = new THREE.PointLight(0xffff00, 0.5, 30);
    light3.position.set(0, 8, -5);
    scene.add(light3);

    // --- Neblina ---
    scene.fog = new THREE.FogExp2(0x050510, 0.03);

    // --- Cuadrículas ---
    const gridHelper = new THREE.GridHelper(60, 40, 0x00ffff, 0x3366ff);
    gridHelper.position.y = -1;
    scene.add(gridHelper);

    const gridHelper2 = new THREE.GridHelper(60, 40, 0xff00ff, 0xaa44aa);
    gridHelper2.rotation.x = Math.PI / 2;
    gridHelper2.position.z = -10;
    gridHelper2.position.y = 2;
    scene.add(gridHelper2);

    // --- Líneas verticales de neón ---
    const neonLineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff });
    const neonLineMaterial2 = new THREE.LineBasicMaterial({ color: 0xff00ff });

    for (let i = -8; i <= 8; i += 4) {
      const points = [];
      points.push(new THREE.Vector3(i, -2, -10));
      points.push(new THREE.Vector3(i, 8, -10));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, neonLineMaterial);
      scene.add(line);
    }

    for (let i = -6; i <= 6; i += 4) {
      const points = [];
      points.push(new THREE.Vector3(i, -2, 5));
      points.push(new THREE.Vector3(i, 8, 5));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, neonLineMaterial2);
      scene.add(line);
    }

    // --- Partículas flotantes ---
    const particleCount = 800;
    const particlesGeo = new THREE.BufferGeometry();
    const particlesPos = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      particlesPos[i * 3] = (Math.random() - 0.5) * 40;
      particlesPos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      particlesPos[i * 3 + 2] = (Math.random() - 0.5) * 40 - 5;

      const color = new THREE.Color().setHSL(0.6 + Math.random() * 0.3, 1, 0.5);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    particlesGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(particlesPos, 3),
    );
    particlesGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particlesMat = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particles);

    // --- Cubos flotantes ---
    const cubeMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x004444,
    });
    const cube1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cubeMat);
    cube1.position.set(3, 1, -3);
    scene.add(cube1);

    const cube2 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0x440044 }),
    );
    cube2.position.set(-2, 2, 2);
    scene.add(cube2);

    const cube3 = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0x444400 }),
    );
    cube3.position.set(0, 3, -5);
    scene.add(cube3);

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const cube = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.8, 0.8),
          new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x004444,
          }),
        );
        cube.position.set(i * 1.2 - 1, j * 1.2 + 1, 0);
        scene.add(cube);
      }
    }

    // --- Animación ---
    let clock = new THREE.Clock();
    let animationId;

    function animate() {
      const delta = clock.getDelta();
      const elapsedTime = performance.now() * 0.001;

      // Rotar partículas
      particles.rotation.y += 0.0005;
      particles.rotation.x += 0.0002;

      // Mover luces
      light1.position.x = 5 * Math.sin(elapsedTime * 0.5);
      light1.position.z = 5 * Math.cos(elapsedTime * 0.3);
      light2.position.x = -5 * Math.sin(elapsedTime * 0.7);
      light2.position.z = 5 * Math.cos(elapsedTime * 0.4);

      // Mover cubos
      cube1.position.y = 1 + Math.sin(elapsedTime * 2) * 0.5;
      cube2.position.x = -2 + Math.sin(elapsedTime * 1.5) * 1;
      cube3.rotation.y += 0.01;
      cube3.rotation.x += 0.005;

      // Movimiento de cámara suave
      camera.position.x = Math.sin(elapsedTime * 0.2) * 2;
      camera.position.y = 5 + Math.sin(elapsedTime * 0.4) * 0.5;
      camera.lookAt(0, 2, 0);

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    }

    animate();

    // --- Manejo de resize ---
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // --- Limpieza al desmontar ---
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      // Opcional: eliminar objetos de la escena para liberar memoria
    };
  }, []);

  return (
    <>
      <div
        style={{
          position: "relative",
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />

        {/* Información superior izquierda */}
        <div style={styles.info}>
          <h1 style={styles.title}>MATH BLOX</h1>
        </div>

        {/* Menú principal */}
        <div style={styles.menu}>
          <Link
            href="/visualMath"
            style={{ ...styles.menuBtn, ...styles.menuBtnPrimary }}
          >
            <button style={{ ...styles.menuBtn, ...styles.menuBtnPrimary }}>
              MODO ESTUDIO
            </button>
          </Link>
          <Link
            href="/Tetris"
            style={{ ...styles.menuBtn, ...styles.menuBtnSecondary }}
          >
            <button style={{ ...styles.menuBtn, ...styles.menuBtnSecondary }}>
              MODO DESAFÍO
            </button>
          </Link>
          <Link
            href="/shapesGame"
            style={{ ...styles.menuBtn, ...styles.menuBtnPrimary }}
          >
            <button style={{ ...styles.menuBtn, ...styles.menuBtnPrimary }}>
              MODO LIBRE
            </button>
          </Link>
        </div>

        {/* Leaderboard reducido */}
        <div style={styles.leaderboard}>
          <LeaderboardWidget limit={3} showViewAll />
        </div>

        {/* Pie de página */}
        <div style={styles.footer}>⚡ VISUAL MATH // NEON EDITION ⚡</div>

        {/* Línea de escaneo animada */}
        <div style={styles.scanLine}></div>
      </div>

      <style jsx>{`
        @import url("https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap");

        .scan-line {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            to bottom,
            transparent,
            rgba(0, 255, 255, 0.1),
            transparent
          );
          pointer-events: none;
          z-index: 5;
          animation: scan 8s linear infinite;
        }

        @keyframes scan {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(200%);
          }
        }
      `}</style>
    </>
  );
}

// Estilos en línea (también podrían ir en styled-jsx, pero por simplicidad los dejamos como objeto)
const styles = {
  info: {
    position: "absolute",
    top: "20px",
    left: "20px",
    zIndex: 10,
    background: "rgba(0, 0, 0, 0.7)",
    padding: "15px 25px",
    borderRadius: "30px",
    border: "1px solid #0ff",
    boxShadow: "0 0 20px rgba(0, 255, 255, 0.5)",
    backdropFilter: "blur(5px)",
  },
  title: {
    margin: 0,
    fontSize: "2rem",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "5px",
    background: "linear-gradient(45deg, #0ff, #f0f)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    textShadow: "0 0 20px #0ff",
  },
  menu: {
    position: "absolute",
    bottom: "15%",
    left: "10%",
    zIndex: 20,
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  menuBtn: {
    background: "transparent",
    border: "2px solid",
    fontFamily: '"Orbitron", sans-serif',
    fontSize: "1.8rem",
    fontWeight: 700,
    padding: "15px 40px",
    borderRadius: "50px",
    cursor: "pointer",
    transition: "all 0.3s ease",
    textTransform: "uppercase",
    letterSpacing: "3px",
    boxShadow: "0 0 15px",
    backdropFilter: "blur(5px)",
    background: "rgba(0, 255, 255, 0.1)",
  },
  menuBtnPrimary: {
    borderColor: "#0ff",
    color: "#0ff",
    boxShadow: "0 0 15px #0ff",
  },
  menuBtnSecondary: {
    borderColor: "#f0f",
    color: "#f0f",
    boxShadow: "0 0 15px #f0f",
    background: "rgba(255, 0, 255, 0.1)",
  },
  leaderboard: {
    position: "absolute",
    top: "20px",
    right: "20px",
    zIndex: 30,
    background: "rgba(0, 0, 0, 0.8)",
    border: "1px solid #f0f",
    borderRadius: "15px",
    padding: "20px",
    boxShadow: "0 0 30px #f0f",
    backdropFilter: "blur(5px)",
    minWidth: "250px",
    color: "#fff",
  },
  leaderboardTitle: {
    margin: "0 0 15px 0",
    fontSize: "1.5rem",
    textAlign: "center",
    color: "#f0f",
    textShadow: "0 0 10px #f0f",
    letterSpacing: "2px",
    borderBottom: "1px solid #f0f",
    paddingBottom: "5px",
  },
  scoreItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: "5px 0",
    fontSize: "1.2rem",
    borderBottom: "1px dashed #0ff",
  },
  scoreItemHighlight: {
    textShadow: "0 0 8px #0ff",
  },
  viewAll: {
    marginTop: "10px",
    textAlign: "center",
    fontSize: "0.9rem",
    color: "#0ff",
    cursor: "pointer",
  },
  footer: {
    position: "absolute",
    bottom: "20px",
    right: "20px",
    zIndex: 10,
    color: "rgba(255,255,255,0.5)",
    fontSize: "0.8rem",
    letterSpacing: "1px",
  },
  scanLine: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background:
      "linear-gradient(to bottom, transparent, rgba(0, 255, 255, 0.1), transparent)",
    pointerEvents: "none",
    zIndex: 5,
    animation: "scan 8s linear infinite",
  },
};
