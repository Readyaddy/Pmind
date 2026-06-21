// Design-sync entry — only includes components safe for browser bundling
// (no next/navigation, @clerk/nextjs, or Node.js-only imports)
export { ThemeProvider } from '../src/components/ThemeProvider';
export { ThemeToggle } from '../src/components/ThemeToggle';
export { default as ConfirmDialog } from '../src/components/ConfirmDialog';
export { FileTreeItem } from '../src/components/FileTreeItem';
export { default as CitationChip } from '../src/components/agent/CitationChip';
export { default as CritiqueCard } from '../src/components/agent/CritiqueCard';
export { default as DesignBriefCard } from '../src/components/agent/DesignBriefCard';
export { default as ToolCallBlock } from '../src/components/agent/ToolCallBlock';
export { default as PermissionPrompt } from '../src/components/agent/PermissionPrompt';
export { default as MentionPicker } from '../src/components/agent/MentionPicker';
export { default as DesignViewer } from '../src/components/agent/DesignViewer';
