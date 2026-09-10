import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../src/db";
import { createInsight } from "../src/engine/discovery/insights";
import { createConcept } from "../src/engine/concepts";
import { writeContent } from "../src/agents/writer";
import { applyReviewAction } from "../src/engine/review";
import {
  publishContent,
  getPublisherStatuses,
} from "../src/engine/publishing";
import { getPublisher } from "../src/providers/publishers";
import { POST as postPublish, GET as getPublishers } from "../src/app/api/publish/route";

async function makeQueuedAsset(label: string) {
  const insight = await createInsight({
    statement: `TEST-P8-${label}: Recognition costs more when you pretend you never needed it.`,
    observation:
      "People deny wanting applause while measuring every quiet room for applause.",
    desire: "To be seen without asking to be seen.",
    hiddenFear: "That asking would confirm they were never chosen.",
    contradictoryBehavior:
      "Dismissing praise while replaying it alone for hours.",
    cost: "A private hunger that rewrites intimacy as performance.",
    status: "approved",
    sourceType: "test-phase8",
    primaryConflictId: "SELF/authenticity",
  });

  const concept = await createConcept({
    insightId: insight.id,
    title: `P8 ${label}`,
    angle: "recognition vs denial",
    hook: "You called it humility when it was hunger.",
    thesis: "Denied need still keeps score.",
    metadata: {
      format: "hard_truth",
      lens: "existential",
      metaphor: "empty applause",
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

  const approved = await applyReviewAction({
    contentAssetId: written.contentAssetId!,
    action: "approve",
    notes: "phase8-queue",
  });
  expect(approved.ok).toBe(true);
  expect(approved.queueItemId).toBeTruthy();

  return {
    contentAssetId: written.contentAssetId!,
    queueId: approved.queueItemId!,
    insightId: insight.id,
  };
}

describe("Phase 8 — Distribution", () => {
  beforeAll(async () => {
    process.env.HNE_PROVIDER = "fixture";
    // Ensure live credentials are absent for dry-run tests
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    delete process.env.FACEBOOK_PAGE_ID;
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    delete process.env.WP_URL;
    delete process.env.WP_USERNAME;
    delete process.env.WP_APP_PASSWORD;
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1. fixture publish creates publication_record and marks asset published", async () => {
    const { contentAssetId } = await makeQueuedAsset("fixture-direct");

    const outcome = await publishContent({
      contentAssetId,
      platform: "fixture",
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.mode).toBe("fixture");
    expect(outcome.publicationRecordId).toBeTruthy();
    expect(outcome.externalId).toMatch(/^fixture_/);
    expect(outcome.url).toContain("fixture.local");

    const asset = await prisma.contentAsset.findUnique({
      where: { id: contentAssetId },
    });
    expect(asset?.status).toBe("published");
    expect(asset?.publishedAt).toBeTruthy();

    const record = await prisma.publicationRecord.findUnique({
      where: { id: outcome.publicationRecordId },
    });
    expect(record?.platform).toBe("fixture");
    expect(record?.contentAssetId).toBe(contentAssetId);
    expect(record?.externalId).toBe(outcome.externalId);

    const feedback = await prisma.feedbackEvent.findFirst({
      where: {
        objectId: contentAssetId,
        action: "publish",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(feedback).toBeTruthy();
    expect(feedback?.notes).toContain("fixture");
  });

  it("2. queue item publish flow", async () => {
    const { contentAssetId, queueId } = await makeQueuedAsset("queue-flow");

    const outcome = await publishContent({
      queueId,
      platform: "fixture",
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.queueId).toBe(queueId);
    expect(outcome.contentAssetId).toBe(contentAssetId);

    const queueItem = await prisma.contentQueue.findUnique({
      where: { id: queueId },
    });
    expect(queueItem?.status).toBe("published");

    const asset = await prisma.contentAsset.findUnique({
      where: { id: contentAssetId },
    });
    expect(asset?.status).toBe("published");

    // API path
    const { contentAssetId: a2, queueId: q2 } =
      await makeQueuedAsset("queue-api");
    const apiRes = await postPublish(
      new NextRequest("http://localhost/api/publish", {
        method: "POST",
        body: JSON.stringify({
          queueId: q2,
          assetId: a2,
          platform: "fixture",
        }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(apiRes.status).toBe(200);
    const apiBody = await apiRes.json();
    expect(apiBody.ok).toBe(true);
    expect(apiBody.publicationRecordId).toBeTruthy();
  });

  it("3. missing live credentials → safe dry-run/fixture path (no throw leaking secrets)", async () => {
    const { contentAssetId } = await makeQueuedAsset("dry-run");

    // Plant fake-looking values then clear — adapters must not require them
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "";
    process.env.FACEBOOK_PAGE_ID = "";

    const fb = await publishContent({
      contentAssetId,
      platform: "facebook",
    });
    expect(fb.ok).toBe(true);
    expect(fb.mode).toBe("dry-run");
    expect(fb.platform).toBe("facebook");
    expect(JSON.stringify(fb)).not.toMatch(/EAA[A-Za-z0-9]+/);
    expect(fb.raw.reason).toMatch(/missing/i);

    const igPublisher = getPublisher("instagram");
    const igResult = await igPublisher.publish(
      {
        id: contentAssetId,
        title: "dry",
        format: "hard_truth",
        body: "body",
      },
      null
    );
    expect(igResult.mode).toBe("dry-run");
    expect(igResult.platform).toBe("instagram");

    const wp = await publishContent({
      contentAssetId,
      platform: "wordpress",
    });
    expect(wp.mode).toBe("dry-run");
    expect(wp.ok).toBe(true);

    const statuses = getPublisherStatuses();
    const fbStatus = statuses.find((s) => s.platform === "facebook")!;
    expect(fbStatus.configured).toBe(false);
    expect(fbStatus.mode).toBe("fixture");
    // Status lists env KEY names only (e.g. WP_APP_PASSWORD) — never VALUES
    expect(JSON.stringify(statuses)).not.toMatch(/EAA[A-Za-z0-9]{10,}/);
    expect(JSON.stringify(statuses)).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
    for (const s of statuses) {
      expect(s.presentEnv.every((k) => /^[A-Z0-9_]+$/.test(k))).toBe(true);
    }

    const statusApi = await getPublishers();
    expect(statusApi.status).toBe(200);
    const statusBody = await statusApi.json();
    expect(statusBody.ok).toBe(true);
    expect(statusBody.publishers.length).toBeGreaterThanOrEqual(4);
  });

  it("4. multi-platform record possible for same asset", async () => {
    const { contentAssetId } = await makeQueuedAsset("multi-plat");

    const a = await publishContent({
      contentAssetId,
      platform: "fixture",
    });
    const b = await publishContent({
      contentAssetId,
      platform: "facebook",
    });
    const c = await publishContent({
      contentAssetId,
      platform: "instagram",
    });

    expect(a.publicationRecordId).not.toBe(b.publicationRecordId);
    expect(b.publicationRecordId).not.toBe(c.publicationRecordId);

    const records = await prisma.publicationRecord.findMany({
      where: { contentAssetId },
      orderBy: { publishedAt: "asc" },
    });
    const platforms = records.map((r) => r.platform);
    expect(platforms).toEqual(
      expect.arrayContaining(["fixture", "facebook", "instagram"])
    );
    expect(new Set(platforms).size).toBeGreaterThanOrEqual(3);

    const asset = await prisma.contentAsset.findUnique({
      where: { id: contentAssetId },
    });
    expect(asset?.status).toBe("published");
    expect(asset?.publishedAt).toBeTruthy();
  });
});
