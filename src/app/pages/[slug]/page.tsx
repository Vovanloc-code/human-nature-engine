import Link from "next/link";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/engine/review";
import { PageDnaEditor } from "@/components/PageDnaEditor";

export const dynamic = "force-dynamic";

export default async function PageDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  const dnaJson = JSON.stringify(
    page.dna
      ? {
          topics: page.dna.topics,
          voice: page.dna.voice,
          visualMix: page.dna.visualMix,
          formatMix: page.dna.formatMix,
          weights: page.dna.weights,
        }
      : { topics: {}, voice: {}, visualMix: {}, formatMix: {}, weights: {} },
    null,
    2
  );

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        <Link href="/pages">← Pages</Link>
      </p>
      <div>
        <h1>{page.name}</h1>
        <p className="lead">
          <span className="mono">{page.slug}</span> — {page.description}
        </p>
      </div>
      <PageDnaEditor slug={page.slug} initialJson={dnaJson} />
    </div>
  );
}
