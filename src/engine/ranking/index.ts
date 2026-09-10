import { compositeInsightScore } from "../scoring";

export function rankByCompositeScore<
  T extends {
    universalityScore?: number | null;
    depthScore?: number | null;
    noveltyScore?: number | null;
    recognitionScore?: number | null;
  },
>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => compositeInsightScore(b) - compositeInsightScore(a)
  );
}

export * from "./editorial";
export * from "./learning-overlay";
