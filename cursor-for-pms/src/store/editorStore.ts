import { create } from "zustand";

interface EditorStore {
  applyFn: ((suggestion: string) => Promise<void>) | null;
  getText: (() => string) | null;
  setContent: ((content: Record<string, unknown>) => void) | null;
  activeDocId: string | null;
  docTitle: string | null;
  registerEditor: (
    applyFn: (suggestion: string) => Promise<void>,
    getText: () => string,
    docTitle?: string,
    setContent?: (content: Record<string, unknown>) => void,
    docId?: string,
  ) => void;
  setDocTitle: (title: string | null) => void;
  unregisterEditor: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  applyFn: null,
  getText: null,
  setContent: null,
  activeDocId: null,
  docTitle: null,
  registerEditor: (applyFn, getText, docTitle, setContent, docId) =>
    set({
      applyFn,
      getText,
      docTitle: docTitle ?? null,
      setContent: setContent ?? null,
      activeDocId: docId ?? null,
    }),
  setDocTitle: (docTitle) => set({ docTitle }),
  unregisterEditor: () =>
    set({ applyFn: null, getText: null, setContent: null, activeDocId: null, docTitle: null }),
}));
