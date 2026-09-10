/** Analytics helpers — Phase 7 performance + lightweight event stub. */

export async function trackEvent(
  _name: string,
  _props?: Record<string, unknown>
): Promise<void> {
  // optional future sink
}

export * from "./performance";
