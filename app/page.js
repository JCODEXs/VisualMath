import Image from "next/image";
import VisualMath from "./_components/visualMath5";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <VisualMath />
    </div>
  );
}
