import { create } from "zustand";

interface EditorStore {
  applyFn: ((suggestion: string) => Promise<void>) | null;
  getText: (() => string) | null;
  registerEditor: (
    applyFn: (suggestion: string) => Promise<void>,
    getText: () => string
  ) => void;
  unregisterEditor: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  applyFn: null,
  getText: null,
  registerEditor: (applyFn, getText) => set({ applyFn, getText }),
  unregisterEditor: () => set({ applyFn: null, getText: null }),
}));
