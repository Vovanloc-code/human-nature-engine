import { prisma } from "@/db";
import type { FeedbackAction } from "@prisma/client";
import { learnFromFeedback } from "./learning";

export type RecordFeedbackInput = {
  objectType: string;
  objectId: string;
  action: FeedbackAction;
  reason?: string;
  notes?: string;
  insightId?: string;
  /** When true (default for content_asset), update preference weights. */
  learn?: boolean;
  pageId?: string;
  previousCaption?: string | null;
  newCaption?: string | null;
};

export async function recordFeedback(input: RecordFeedbackInput) {
  if (!input.objectType?.trim()) throw new Error("objectType is required");
  if (!input.objectId?.trim()) throw new Error("objectId is required");
  if (!input.action) throw new Error("action is required");

  const event = await prisma.feedbackEvent.create({
    data: {
      objectType: input.objectType.trim(),
      objectId: input.objectId.trim(),
      action: input.action,
      reason: input.reason,
      notes: input.notes,
      insightId: input.insightId,
    },
  });

  const shouldLearn =
    input.learn !== false && input.objectType.trim() === "content_asset";

  if (shouldLearn) {
    await learnFromFeedback({
      contentAssetId: input.objectId.trim(),
      action: input.action,
      pageId: input.pageId,
      previousCaption: input.previousCaption,
      newCaption: input.newCaption,
    });
  }

  return event;
}

export * from "./preferences";
export * from "./learning";
