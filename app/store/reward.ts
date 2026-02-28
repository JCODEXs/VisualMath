// store/reward.ts
import { create } from "zustand";

interface RewardState {
  show: boolean;
  streak: number;
  correct: number;
  trigger: (streak: number, correct: number) => void;
  hide: () => void;
}

export const useRewardStore = create<RewardState>((set) => ({
  show: false,
  streak: 0,
  correct: 0,
  trigger: (streak, correct) =>
    set({ show: true, streak, correct }),
  hide: () => set({ show: false }),
}));