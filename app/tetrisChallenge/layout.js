// components/layout/AppLayout.tsx
"use client";
import { useRef, useEffect } from "react";

import Sidebar from "../_components/Sidebar";
import Header from "../_components/Header2";

export default function AppLayout({ children }) {
  //   const audioRef = useRef(null);

  //   useEffect(() => {
  //     const audio = audioRef.current;

  //     // Algunos navegadores requieren interacción antes de reproducir
  //     const startAudio = () => {
  //       audio.volume = 0.5;
  //       audio.play().catch(() => {});
  //       window.removeEventListener("click", startAudio);
  //     };

  //     window.addEventListener("click", startAudio);
  //   }, []);
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      {/* <audio
        ref={audioRef}
        src="/audio/FJ Project - Electro Punk.mp3"
        loop
        preload="auto"
      /> */}

      <div className="flex flex-1 flex-col">
        {/* <Header /> */}

        <main className="relative flex-1 overflow-auto bg-gradient-to-br from-slate-900 via-slate-950 to-black">
          {children}
        </main>
      </div>
    </div>
  );
}
