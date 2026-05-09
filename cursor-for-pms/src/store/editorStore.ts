import { create } from "zustand";

interface EditorStore {
  applyFn: ((suggestion: string) => Promise<void>) | null;
  getText: (() => string) | null;
  docTitle: string | null;
  registerEditor: (
    applyFn: (suggestion: string) => Promise<void>,
    getText: () => string,
    docTitle?: string,
  ) => void;
  setDocTitle: (title: string | null) => void;
  unregisterEditor: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  applyFn: null,
  getText: null,
  docTitle: null,
  registerEditor: (applyFn, getText, docTitle) =>
    set({ applyFn, getText, docTitle: docTitle ?? null }),
  setDocTitle: (docTitle) => set({ docTitle }),
  unregisterEditor: () => set({ applyFn: null, getText: null, docTitle: null }),
}));
