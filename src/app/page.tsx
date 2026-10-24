import Dashboard from "@/components/dashboard";
import { requireStaff } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Home() {
  try {
    await requireStaff();
  } catch {
    redirect("/login");
  }
  return <Dashboard />;
}
