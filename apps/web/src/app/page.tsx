import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/current-session";

export default async function Home() {
  redirect((await getCurrentSession()) ? "/app" : "/login");
}
