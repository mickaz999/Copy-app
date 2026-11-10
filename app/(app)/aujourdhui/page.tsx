import { redirect } from "next/navigation";

// La to-do du jour est une vue du Planning (mêmes tâches, même fonctionnement)
export default function Today() {
  redirect("/planning?view=today");
}
