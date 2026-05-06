import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProductBrainStore {
  contexts: Record<string, string>;
  getContext: (projectId: string) => string;
  setContext: (projectId: string, value: string) => void;
}

export const useProductBrain = create<ProductBrainStore>()(
  persist(
    (set, get) => ({
      contexts: {},
      getContext: (projectId) => get().contexts[projectId] ?? "",
      setContext: (projectId, value) =>
        set((state) => ({
          contexts: { ...state.contexts, [projectId]: value },
        })),
    }),
    { name: "product-brain-v2" }
  )
);
