// components/layout/Header.tsx
"use client";

import { useRewardStore } from "../store/reward";

export default function Header() {
  const { streak, correct } = useRewardStore();

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900 px-6">
      <div className="text-lg font-semibold text-slate-200">
        Área Model Visualizer
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div className="text-orange-400">
          🔥 Racha: <span className="font-bold">{streak}</span>
        </div>
        <div className="text-green-400">
          ✅ Correctas: <span className="font-bold">{correct}</span>
        </div>
      </div>
    </header>
  );
}
