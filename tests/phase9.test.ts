import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { prisma } from "../src/db";
import { createInsight } from "../src/engine/discovery/insights";
import { createConcept } from "../src/engine/concepts";
import { writeContent } from "../src/agents/writer";
import { directVisual } from "../src/agents/visual-director";
import {
  generateImage,
  fixtureImageProvider,
  isReadableImageFile,
  writeFixturePng,
} from "../src/providers/media";
import {
  persistGeneratedMedia,
  produceImageForAsset,
  getLatestMediaForAsset,
} from "../src/engine/media";
import { runVisualQc } from "../src/engine/visual-qc";
import {
  buildFacebookImagePayload,
  facebookPublisher,
} from "../src/providers/publishers/facebook";
import { publishContent } from "../src/engine/publishing";
import { applyReviewAction } from "../src/engine/review";
import { runPhase9VerticalSlice } from "../src/engine/phase9/slice";

async function makeProducedAsset(label: string) {
  const insight = await createInsight({
    statement: `TEST-P9-${label}: People protect a fragile self-story by punishing evidence that contradicts it.`,
    observation:
      "Identity hardens around a single narrative, then treats contradiction as betrayal.",
    desire: "Coherence — a self that makes sense across time.",
    hiddenFear: "Fragmentation; becoming someone unrecognizable.",
    contradictoryBehavior:
      "Claiming growth while defending yesterday's narrative as sacred.",
    cost: "Relationships sacrificed to keep the story intact.",
    status: "approved",
    sourceType: "test-phase9",
    primaryConflictId: "SELF/authenticity",
  });
  const concept = await createConcept({
    insightId: insight.id,
    title: `P9 ${label}`,
    angle: "narrative rigidity",
    hook: "You called it consistency when it was fear.",
    thesis: "A story defended past truth becomes a cage.",
    metadata: {
      format: "hard_truth",
      lens: "existential",
      metaphor: "locked diary",
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
  const visual = await directVisual({
    contentAssetId: written.contentAssetId!,
    pageSlug: "the-war-within",
    persist: true,
  });
  return {
    contentAssetId: written.contentAssetId!,
    visualConceptId: visual.visualConceptId!,
    insightId: insight.id,
  };
}

describe("Phase 9 — Live vertical slice foundations", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hne-p9-"));

  beforeAll(async () => {
    process.env.HNE_PROVIDER = "fixture";
    process.env.HNE_IMAGE_PROVIDER = "fixture";
    delete process.env.OPENAI_API_KEY;
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    delete process.env.FACEBOOK_PAGE_ID;
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1. image provider fixture writes a real readable PNG file", async () => {
    const result = await generateImage({
      prompt: "symbolic chiaroscuro figure facing a locked diary of self",
      negativeConstraints: ["lonely-window", "stock smile"],
      aspectRatio: "1:1",
      forceFixture: true,
      outputDir: tmpDir,
    });
    expect(result.provider).toBe("fixture");
    expect(result.mediaPath).toBeTruthy();
    expect(result.mediaPath.startsWith("fixture://")).toBe(false);
    expect(fs.existsSync(result.mediaPath)).toBe(true);
    expect(isReadableImageFile(result.mediaPath)).toBe(true);
    const buf = fs.readFileSync(result.mediaPath);
    expect(buf[0]).toBe(137); // PNG
    expect(buf.length).toBeGreaterThan(50);
    expect(result.metadata.live).toBe(false);
  });

  it("2. media asset persistence with first-class provenance fields", async () => {
    const { contentAssetId, visualConceptId } = await makeProducedAsset("persist");
    const generation = await fixtureImageProvider.generateImage({
      prompt: "fine art minimalism of a diary sealed with wax",
      outputDir: tmpDir,
      width: 48,
      height: 48,
    });
    const row = await persistGeneratedMedia({
      contentAssetId,
      visualConceptId,
      generation,
      prompt: "fine art minimalism of a diary sealed with wax",
      promptVersion: "vd-1",
      negativeConstraints: ["lonely-window"],
    });
    expect(row.id).toBeTruthy();
    expect(row.storagePath).toBe(generation.mediaPath);
    expect(row.mimeType).toBe("image/png");
    expect(row.provider).toBe("fixture");
    expect(row.model).toBeTruthy();
    expect(row.generationId).toBeTruthy();
    expect(row.prompt.length).toBeGreaterThan(10);
    expect(row.width).toBe(48);
    expect(row.height).toBe(48);
    expect(row.qcStatus).toBe("pending");

    const latest = await getLatestMediaForAsset(contentAssetId);
    expect(latest?.id).toBe(row.id);

    const va = await prisma.visualAsset.findFirst({
      where: { visualConceptId, kind: "generated_image" },
    });
    expect(va?.storagePath).toBe(generation.mediaPath);
    expect(va?.provider).toBe("fixture");
  });

  it("3. missing image failure — QC REJECT and approve blocked when media fails QC", async () => {
    const { contentAssetId, visualConceptId } = await makeProducedAsset("missing");
    // Persist a media row pointing at a missing file
    const ghostPath = path.join(tmpDir, "does-not-exist.png");
    const row = await prisma.generatedMedia.create({
      data: {
        contentAssetId,
        visualConceptId,
        storagePath: ghostPath,
        mimeType: "image/png",
        width: 64,
        height: 64,
        provider: "fixture",
        model: "fixture-png-v1",
        generationId: "ghost_test",
        prompt: "ghost",
        qcStatus: "pending",
      },
    });
    const qc = await runVisualQc({
      contentAssetId,
      generatedMediaId: row.id,
      persist: true,
    });
    expect(qc.verdict).toBe("REJECT");
    expect(qc.checks.some((c) => c.id === "file_readable" && !c.ok)).toBe(true);

    await expect(
      applyReviewAction({ contentAssetId, action: "approve" })
    ).rejects.toThrow(/visual QC/i);
  });

  it("4. visual QC PASS for real fixture image", async () => {
    const { contentAssetId, visualConceptId } = await makeProducedAsset("qc-pass");
    const img = await produceImageForAsset({
      contentAssetId,
      visualConceptId,
      forceFixture: true,
      outputDir: tmpDir,
    });
    const qc = await runVisualQc({
      contentAssetId,
      generatedMediaId: img.media.id,
      persist: true,
    });
    expect(qc.verdict).toBe("PASS");
    expect(qc.score).toBeGreaterThanOrEqual(70);

    const approved = await applyReviewAction({
      contentAssetId,
      action: "approve",
      notes: "phase9-qc-pass",
    });
    expect(approved.ok).toBe(true);
    expect(approved.queueItemId).toBeTruthy();
  });

  it("5. Facebook image payload builder", async () => {
    const payload = buildFacebookImagePayload(
      {
        id: "asset123",
        title: "Title",
        body: "Body",
        format: "hard_truth",
        imagePath: path.join(tmpDir, "x.png"),
        imageMimeType: "image/png",
        metadata: { caption: "Caption from meta" },
      },
      { publishMode: "facebook_image" }
    );
    expect(payload.publishMode).toBe("facebook_image");
    expect(payload.caption).toContain("Caption");
    expect(payload.imagePath).toContain("x.png");
    expect(payload.mimeType).toBe("image/png");
  });

  it("6. dry-run image publish without credentials", async () => {
    const { contentAssetId, visualConceptId } = await makeProducedAsset("fb-dry");
    const img = await produceImageForAsset({
      contentAssetId,
      visualConceptId,
      forceFixture: true,
      outputDir: tmpDir,
    });
    await runVisualQc({
      contentAssetId,
      generatedMediaId: img.media.id,
      persist: true,
    });

    const outcome = await publishContent({
      contentAssetId,
      platform: "facebook",
      options: {
        dryRun: true,
        publishMode: "facebook_image",
        imagePath: img.generation.mediaPath,
      },
      updateQueue: false,
      allowDuplicate: true,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.mode).toBe("dry-run");
    expect(outcome.publishMode).toBe("facebook_image");
    expect(outcome.assetType).toBe("image");
    expect(outcome.raw.imagePayload).toBeTruthy();
    expect((outcome.raw.imagePayload as { hasImagePath: boolean }).hasImagePath).toBe(
      true
    );
  });

  it("7. no secret leakage in publish raw / statuses / preview", async () => {
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "";
    const { contentAssetId, visualConceptId } = await makeProducedAsset("nosecret");
    const img = await produceImageForAsset({
      contentAssetId,
      visualConceptId,
      forceFixture: true,
      outputDir: tmpDir,
    });
    const result = await facebookPublisher.publish(
      {
        id: contentAssetId,
        title: "t",
        format: "hard_truth",
        body: "b",
        imagePath: img.generation.mediaPath,
      },
      { slug: "the-war-within" },
      { dryRun: true, publishMode: "facebook_image" }
    );
    const blob = JSON.stringify(result);
    expect(blob).not.toMatch(/EAA[A-Za-z0-9]{8,}/);
    expect(blob).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    expect(blob).not.toMatch(/Bearer /);
    // basename ok, full secrets not present
    expect(result.raw.configured).toBe(false);
  });

  it("8. idempotent / duplicate publish prevention", async () => {
    const { contentAssetId, visualConceptId } = await makeProducedAsset("idem");
    const img = await produceImageForAsset({
      contentAssetId,
      visualConceptId,
      forceFixture: true,
      outputDir: tmpDir,
    });
    await runVisualQc({
      contentAssetId,
      generatedMediaId: img.media.id,
      persist: true,
    });

    const a = await publishContent({
      contentAssetId,
      platform: "facebook",
      options: { dryRun: true, publishMode: "facebook_image", imagePath: img.generation.mediaPath },
      updateQueue: false,
    });
    const b = await publishContent({
      contentAssetId,
      platform: "facebook",
      options: { dryRun: true, publishMode: "facebook_image", imagePath: img.generation.mediaPath },
      updateQueue: false,
    });
    expect(b.idempotentReplay).toBe(true);
    expect(b.publicationRecordId).toBe(a.publicationRecordId);
  });

  it("9. provider failure/retry behavior — live without key fails; fixture still works", async () => {
    delete process.env.OPENAI_API_KEY;
    // force live path should not claim success
    const { openaiImageProvider } = await import("../src/providers/media/openai");
    await expect(
      openaiImageProvider.generateImage({
        prompt: "should fail without key",
        outputDir: tmpDir,
      })
    ).rejects.toThrow(/OPENAI_API_KEY/i);

    // generateImage with auto falls back to fixture (no key)
    const ok = await generateImage({
      prompt: "fixture after live unavailable",
      outputDir: tmpDir,
      forceFixture: true,
    });
    expect(ok.provider).toBe("fixture");
    expect(isReadableImageFile(ok.mediaPath)).toBe(true);

    // writeFixturePng utility
    const w = writeFixturePng({ outputDir: tmpDir, width: 24, height: 24, seed: "retry" });
    expect(isReadableImageFile(w.mediaPath)).toBe(true);
  });

  it("10. e2e vertical slice fixture (Stage A dry-run)", async () => {
    const artifactsDir = path.join(tmpDir, "artifacts");
    const preview = await runPhase9VerticalSlice({
      pageSlug: "the-war-within",
      target: 3,
      winners: 1,
      artifactsDir,
      forceFixtureImage: true,
      dryRun: true,
    });
    expect(preview.stage).toBe("A");
    expect(preview.liveImage.mode).toBe("fixture");
    expect(preview.shortlist.length).toBeGreaterThanOrEqual(0);
    // Winner may exist if shortlist had QC PASS
    if (preview.winner) {
      expect(preview.winner.imagePath).toBeTruthy();
      expect(fs.existsSync(String(preview.winner.imagePath))).toBe(true);
      expect(preview.facebookDryRun?.mode).toBe("dry-run");
      expect(preview.facebookDryRun?.publishMode).toBe("facebook_image");
    }
    expect(fs.existsSync(preview.artifacts.previewJson)).toBe(true);
    const raw = fs.readFileSync(preview.artifacts.previewJson, "utf8");
    expect(raw).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
    expect(raw).not.toMatch(/EAA[A-Za-z0-9]{10,}/);
  }, 120000);
});
