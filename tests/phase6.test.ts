import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../src/db";
import { createInsight } from "../src/engine/discovery/insights";
import { createConcept } from "../src/engine/concepts";
import { writeContent } from "../src/agents/writer";
import { directVisual } from "../src/agents/visual-director";
import { runEditorRank } from "../src/agents/editor-chief";
import { runTodayPipeline } from "../src/engine/editorial";
import { getIdeaVaultMetrics } from "../src/engine/idea-vault";
import {
  applyReviewAction,
  listCandidates,
  getCandidateDetail,
  listQueue,
  shapeTodayResult,
} from "../src/engine/review";
import { GET as getVaultMetrics } from "../src/app/api/idea-vault/metrics/route";
import { POST as postCandidateAction } from "../src/app/api/candidates/[id]/action/route";
import { POST as postGenerateToday } from "../src/app/api/today/generate/route";
import { GET as getCandidates } from "../src/app/api/candidates/route";

async function makeReviewableAsset(label: string) {
  const insight = await createInsight({
    statement: `TEST-P6-${label}: People polish the mask until they forget the face underneath.`,
    observation:
      "Self-presentation becomes so practiced that private honesty feels like betrayal of the brand.",
    desire: "To be known without the costume collapsing.",
    hiddenFear: "That without the mask there is nothing worth knowing.",
    contradictoryBehavior:
      "Craving intimacy while editing every message for brand consistency.",
    cost: "Loneliness inside a well-managed persona.",
    status: "approved",
    sourceType: "test-phase6",
    primaryConflictId: "SELF/authenticity",
  });

  const concept = await createConcept({
    insightId: insight.id,
    title: `Mask Polish ${label}`,
    angle: "persona vs presence",
    hook: "You practiced being seen until you disappeared.",
    thesis: "The mask can become the only face people trust.",
    metadata: {
      format: "hard_truth",
      lens: "existential",
      metaphor: "polished mask",
      structure: "recognition-twist-cost",
      ending: "open_recognition",
    },
  });

  const written = await writeContent({
    conceptId: concept.id,
    pageSlug: "the-war-within",
    format: "hard_truth",
    persist: true,
  });
  expect(written.contentAssetId).toBeTruthy();

  await directVisual({
    contentAssetId: written.contentAssetId!,
    pageSlug: "the-war-within",
    persist: true,
  });

  await runEditorRank({
    contentAssetIds: [written.contentAssetId!],
    pageSlug: "the-war-within",
    target: 1,
    floor: 50,
    persist: true,
    markReviewing: true,
  });

  return {
    insightId: insight.id,
    contentAssetId: written.contentAssetId!,
  };
}

describe("Phase 6 — UI / review workflow", () => {
  beforeAll(async () => {
    process.env.HNE_PROVIDER = "fixture";
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1. approve → content_queue + feedback_events + asset queued", async () => {
    const { contentAssetId, insightId } = await makeReviewableAsset("approve");

    const result = await applyReviewAction({
      contentAssetId,
      action: "approve",
      notes: "phase6-test-approve",
    });

    expect(result.ok).toBe(true);
    expect(result.queueItemId).toBeTruthy();
    expect(result.feedbackEventId).toBeTruthy();
    expect(result.assetStatus).toBe("queued");

    const queue = await prisma.contentQueue.findUnique({
      where: { id: result.queueItemId! },
    });
    expect(queue?.contentAssetId).toBe(contentAssetId);
    expect(queue?.status).toBe("queued");

    const fb = await prisma.feedbackEvent.findUnique({
      where: { id: result.feedbackEventId! },
    });
    expect(fb?.action).toBe("approve");
    expect(fb?.objectType).toBe("content_asset");
    expect(fb?.objectId).toBe(contentAssetId);
    expect(fb?.insightId).toBe(insightId);

    const asset = await prisma.contentAsset.findUnique({
      where: { id: contentAssetId },
    });
    expect(asset?.status).toBe("queued");

    const queued = await listQueue({ status: "queued" });
    expect(queued.some((q) => q.contentAssetId === contentAssetId)).toBe(true);
  });

  it("2. reject → feedback_events + asset rejected", async () => {
    const { contentAssetId } = await makeReviewableAsset("reject");

    const result = await applyReviewAction({
      contentAssetId,
      action: "reject",
      reason: "off-voice",
      notes: "phase6-test-reject",
    });

    expect(result.ok).toBe(true);
    expect(result.feedbackEventId).toBeTruthy();
    expect(result.assetStatus).toBe("rejected");
    expect(result.queueItemId).toBeUndefined();

    const fb = await prisma.feedbackEvent.findFirst({
      where: {
        objectId: contentAssetId,
        action: "reject",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(fb).toBeTruthy();
    expect(fb?.reason).toBe("off-voice");

    const asset = await prisma.contentAsset.findUnique({
      where: { id: contentAssetId },
    });
    expect(asset?.status).toBe("rejected");
  });

  it("3. idea vault metrics endpoint returns inventory shape", async () => {
    const direct = await getIdeaVaultMetrics();
    expect(direct).toMatchObject({
      total: expect.any(Number),
      approved: expect.any(Number),
      unused: expect.any(Number),
      used: expect.any(Number),
      exceptional: expect.any(Number),
      needs_research: expect.any(Number),
      rejected: expect.any(Number),
      retired: expect.any(Number),
    });
    expect(direct.total).toBeGreaterThan(0);

    const res = await getVaultMetrics();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(direct.total);
    expect(body.approved).toBe(direct.approved);
    expect(body.unused).toBeDefined();
    expect(body.exceptional).toBeDefined();
  });

  it("4. generate-today returns ranked shortlist shape (+ thin API)", async () => {
    // Ensure at least one draft/reviewing asset exists for the page
    const { contentAssetId } = await makeReviewableAsset("today");

    const engineResult = await runTodayPipeline({
      pageSlug: "the-war-within",
      target: 3,
      minPool: 1,
      produceLimit: 0,
      contentAssetIds: [contentAssetId],
      persist: true,
      markReviewing: true,
    });

    expect(engineResult.editorial.shortlist.length).toBeGreaterThanOrEqual(1);
    expect(engineResult.editorial.best).toBeTruthy();
    expect(
      engineResult.editorial.shortlist.every((s) => s.WHY_THIS_WAS_SELECTED)
    ).toBe(true);

    const cards = await listCandidates({
      status: "reviewing",
      pageSlug: "the-war-within",
    });
    const shaped = shapeTodayResult(engineResult, cards);
    expect(shaped.runId).toBeTruthy();
    expect(shaped.shortlist.length).toBeGreaterThanOrEqual(1);
    expect(shaped.shortlist[0]).toMatchObject({
      title: expect.any(String),
      format: expect.any(String),
      rankScore: expect.any(Number),
      scores: { total: expect.any(Number) },
      verdict: expect.any(String),
    });
    expect(shaped.candidates.length).toBeGreaterThanOrEqual(1);

    const detail = await getCandidateDetail(contentAssetId);
    expect(detail.id).toBe(contentAssetId);
    expect(detail.humanInsight?.statement).toContain("TEST-P6-today");
    expect(detail.whySelected || detail.score != null).toBeTruthy();

    // Thin API handler: list candidates
    const listRes = await getCandidates(
      new NextRequest(
        "http://localhost/api/candidates?status=reviewing&page=the-war-within"
      )
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(Array.isArray(listBody.candidates)).toBe(true);

    // Thin API handler: approve via REST
    const { contentAssetId: approveId } = await makeReviewableAsset("api-approve");
    const actionRes = await postCandidateAction(
      new NextRequest(`http://localhost/api/candidates/${approveId}/action`, {
        method: "POST",
        body: JSON.stringify({ action: "approve", notes: "api-test" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: approveId }) }
    );
    expect(actionRes.status).toBe(200);
    const actionBody = await actionRes.json();
    expect(actionBody.ok).toBe(true);
    expect(actionBody.queueItemId).toBeTruthy();

    // generate-today API (may produce more; keep target small)
    const genRes = await postGenerateToday(
      new NextRequest("http://localhost/api/today/generate", {
        method: "POST",
        body: JSON.stringify({
          pageSlug: "the-war-within",
          target: 2,
          depth: "balanced",
          minPool: 1,
          produceLimit: 0,
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    // May 200 with shortlist from existing pool
    const genBody = await genRes.json();
    if (genRes.status === 200) {
      expect(genBody.shortlist).toBeDefined();
      expect(Array.isArray(genBody.shortlist)).toBe(true);
      expect(genBody.candidates).toBeDefined();
      expect(genBody.runId).toBeTruthy();
    } else {
      // If pool empty and produceLimit 0, still should not crash unexpectedly —
      // surface error for debugging but allow empty-pool message
      expect(genBody.error).toBeTruthy();
    }
  });

  it("5. edit / favorite / save_for_later leave feedback trails", async () => {
    const { contentAssetId } = await makeReviewableAsset("edit");

    const edited = await applyReviewAction({
      contentAssetId,
      action: "edit",
      edits: {
        title: "Edited title P6",
        caption: "Edited caption",
        imageText: "Edited image text",
      },
    });
    expect(edited.feedbackEventId).toBeTruthy();

    const asset = await prisma.contentAsset.findUnique({
      where: { id: contentAssetId },
    });
    expect(asset?.title).toBe("Edited title P6");
    const meta = (asset?.metadata ?? {}) as Record<string, unknown>;
    expect(meta.caption).toBe("Edited caption");
    expect(meta.image_text).toBe("Edited image text");

    const fav = await applyReviewAction({
      contentAssetId,
      action: "favorite",
    });
    expect(fav.feedbackEventId).toBeTruthy();

    const later = await applyReviewAction({
      contentAssetId,
      action: "save_for_later",
    });
    expect(later.assetStatus).toBe("draft");
    expect(later.feedbackEventId).toBeTruthy();
  });
});
