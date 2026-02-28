import { useEffect } from "react";
import confetti from "canvas-confetti";

export function ConfettiEffect() {
  useEffect(() => {
    const duration = 1500;
    const end = Date.now() + duration;

    const interval = setInterval(() => {
      if (Date.now() > end) {
        clearInterval(interval);
        return;
      }

      confetti({
        particleCount: 40,
        spread: 70,
        origin: { y: 0.6 },
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return null;
}
