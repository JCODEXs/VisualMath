"use client";

import React from "react";
import { useLeaderboardStore } from "../store/leaderboardStore";
import { useRouter } from "next/navigation";

export default function LeaderboardPage() {
  const scores = useLeaderboardStore((state) => state.scores);
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);

  return (
    <div
      style={{
        padding: "2rem",
        color: "#fff",
        background: "#0a0a1a",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ textAlign: "center", color: "#0ff" }}>
        🏆 TABLA DE CAMPEONES
      </h1>
      <table
        style={{
          width: "100%",
          maxWidth: "600px",
          margin: "2rem auto",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #f0f" }}>
            <th>#</th>
            <th>Jugador</th>
            <th>Puntaje</th>
            <th>Modo</th>
          </tr>
        </thead>
        <tbody>
          {sortedScores.map((entry, index) => (
            <tr
              key={entry.id}
              style={{ textAlign: "center", borderBottom: "1px solid #336" }}
            >
              <td>{index + 1}</td>
              <td>{entry.playerName}</td>
              <td>{entry.score.toLocaleString()}</td>
              <td>{entry.mode || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
