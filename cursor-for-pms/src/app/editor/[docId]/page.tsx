import { redirect } from "next/navigation";

// Route moved to /projects/[projectId]/docs/[docId]
export default function OldEditorRedirect() {
  redirect("/projects");
}
