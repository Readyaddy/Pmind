"use client";

import { useState, useEffect } from "react";
import GlobalSearch from "./GlobalSearch";

export default function ProjectsShortcutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {children}
      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
    </>
  );
}
