import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ActiveProjectStore {
  projectId: string | null;
  projectName: string;
  setActiveProject: (id: string, name: string) => void;
  clearActiveProject: () => void;
}

export const useActiveProject = create<ActiveProjectStore>()(
  persist(
    (set) => ({
      projectId: null,
      projectName: "",
      setActiveProject: (id, name) => set({ projectId: id, projectName: name }),
      clearActiveProject: () => set({ projectId: null, projectName: "" }),
    }),
    { name: "active-project" }
  )
);
