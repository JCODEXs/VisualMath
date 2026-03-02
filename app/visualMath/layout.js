// components/layout/AppLayout.tsx
"use client";

import Sidebar from "../_components/Sidebar";
import Header from "../_components/Header2";

export default function AppLayout({ children }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        {/* <Header /> */}

        <main className="relative flex-1 overflow-auto bg-gradient-to-br from-slate-900 via-slate-950 to-black">
          {children}
        </main>
      </div>
    </div>
  );
}
