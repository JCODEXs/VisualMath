"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLeaderboardStore } from "../store/leaderboardStore";
import { useMemo } from "react";

const LeaderboardWidget = ({ limit = 3, showViewAll = true }) => {
  const router = useRouter();
  const scores = useLeaderboardStore((state) => state.scores);
  const topScores = useMemo(() => {
    return [...scores].sort((a, b) => b.score - a.score).slice(0, limit);
  }, [scores, limit]);

  // Formatear número con separador de miles
  const formatScore = (score) => score.toLocaleString("es-ES");

  return (
    <div style={styles.leaderboard}>
      <h2 style={styles.leaderboardTitle}>🏆 TOP SCORES</h2>
      {topScores.map((entry, index) => {
        const isSecond = index === 1; // para resaltar el segundo (CYBER)
        return (
          <div
            key={entry.id}
            style={{
              ...styles.scoreItem,
              ...(isSecond ? styles.scoreItemHighlight : {}),
            }}
          >
            <span>
              {index + 1}. {entry.playerName}
            </span>
            <span>{formatScore(entry.score)}</span>
          </div>
        );
      })}
      {showViewAll && (
        <div onClick={() => router.push("/leaderboard")} style={styles.viewAll}>
          VER TODOS →
        </div>
      )}
    </div>
  );
};

// Estilos (puedes moverlos a tu hoja de estilos global o módulo)
const styles = {
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
    transition: "opacity 0.2s",
  },
};

export default LeaderboardWidget;
