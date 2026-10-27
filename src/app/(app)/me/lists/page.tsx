import { redirect } from "next/navigation";

// Lists are notes with tasks now: the old address leads to them.
export default function MineLists() {
  redirect("/me/notes?f=tasks");
}
