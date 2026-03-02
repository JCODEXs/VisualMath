import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ScoreEntry {
  id: string;
  playerName: string;
  score: number;
  mode?: string;      // opcional: 'estudio', 'desafío', 'libre'
  date: number;       // timestamp
}

interface LeaderboardState {
  scores: ScoreEntry[];
  addScore: (entry: Omit<ScoreEntry, 'id' | 'date'>) => void;
  clearScores: () => void;
  getTopScores: (limit?: number) => ScoreEntry[];
}

// Datos por defecto (tal como los mostrabas)
const defaultScores: ScoreEntry[] = [
  {
    id: '1',
    playerName: 'NEON',
    score: 12450,
    mode: 'desafío',
    date: Date.now() - 86400000 * 2, // hace 2 días
  },
  {
    id: '2',
    playerName: 'CYBER',
    score: 10230,
    mode: 'desafío',
    date: Date.now() - 86400000,     // hace 1 día
  },
  {
    id: '3',
    playerName: 'TRON',
    score: 9870,
    mode: 'estudio',
    date: Date.now() - 86400000 * 3, // hace 3 días
  },
];

export const useLeaderboardStore = create<LeaderboardState>()(
  persist(
    (set, get) => ({
      scores: defaultScores,
      addScore: (entry) => {
        const newEntry: ScoreEntry = {
          ...entry,
          id: Math.random().toString(36).substring(2, 9),
          date: Date.now(),
        };
        set((state) => ({ scores: [...state.scores, newEntry] }));
      },
      clearScores: () => set({ scores: [] }),
      getTopScores: (limit = 10) => {
        const sorted = [...get().scores].sort((a, b) => b.score - a.score);
        return sorted.slice(0, limit);
      },
    }),
    {
      name: 'mathblox-leaderboard', // clave en localStorage
    }
  )
);