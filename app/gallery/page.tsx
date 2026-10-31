import { redirect } from "next/navigation";

// The gallery now lives inside Projects; keep old links working.
export default function GalleryPage() {
  redirect("/projects");
}
