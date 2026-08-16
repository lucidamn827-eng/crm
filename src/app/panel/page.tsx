import { leerSesion } from "@/lib/auth";
import { redirect } from "next/navigation";
import Panel from "./Panel";

export default async function PaginaPanel() {
  const s = await leerSesion();
  if (!s) redirect("/");
  return <Panel sesion={s} />;
}
