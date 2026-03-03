// components/layout/Sidebar.tsx
"use client";

import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="hidden w-64 flex-col border-r border-slate-800 bg-slate-900 p-6 md:flex">
      <h2 className="mb-8 text-xl font-bold text-amber-400">🧠 Math Engine</h2>

      <nav className="flex flex-col gap-4 text-slate-300">
        <Link href="/" className="hover:text-white">
          Inicio
        </Link>
        <Link href="/visualMath" className="hover:text-white">
          Practicar
        </Link>
        <Link href="/Tetris" className="hover:text-white">
          Tetris 3D
        </Link>
        <Link href="/tetrisChallenge" className="hover:text-white">
          Tetris Desafio matematico
        </Link>
        <Link href="/shapesGame" className="hover:text-white">
          Formas
        </Link>
        <Link href="/leaderboard" className="hover:text-white">
          Puntajes
        </Link>
      </nav>
    </aside>
  );
}
