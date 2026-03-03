import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  playerName: string;
  setPlayerName: (name: string) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      playerName: '',
      setPlayerName: (name) => set({ playerName: name }),
    }),
    {
      name: 'mathblox-user', // clave en localStorage
    }
  )
);