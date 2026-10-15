import { redirect } from "next/navigation";

// Initiatives and groups start in one place; the purpose is chosen there.
export default function NewInitiative() {
  redirect("/new/group?purpose=demand");
}
