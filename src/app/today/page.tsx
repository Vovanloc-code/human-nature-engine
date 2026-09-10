import { listPages } from "@/engine/review";
import { TodayClient } from "@/components/TodayClient";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const pages = await listPages();
  return (
    <TodayClient
      initialPages={pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
      }))}
    />
  );
}
