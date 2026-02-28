"use client";
import { useEffect } from "react";
import { useRewardStore } from "../store/reward";
import { ConfettiEffect } from "./ConfettiEffect";

export default function RewardOverlay() {
  const { show, streak, correct, hide } = useRewardStore();

  useEffect(() => {
    if (!show) return;

    // const audio = new Audio("/sounds/reward.mp3");
    // audio.volume = 0.7;
    // audio.play();

    const timeout = setTimeout(() => {
      hide();
    }, 2000);

    return () => clearTimeout(timeout);
  }, [show, hide]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center pointer-events-none">
      {/* Fondo translúcido */}
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/30 via-pink-500/30 to-blue-500/30 backdrop-blur-md animate-pulse" />

      {/* Contenido central */}
      <div className="relative z-10 text-center text-white animate-scaleIn">
        <h1 className="text-5xl font-extrabold drop-shadow-lg">
          🎉 ¡Correcto!
        </h1>

        <div className="mt-6 space-y-2 text-2xl font-semibold">
          <div>🔥 Racha actual: {streak}</div>
          <div>✅ Respuestas correctas: {correct}</div>
        </div>
      </div>

      <ConfettiEffect />
    </div>
  );
}
