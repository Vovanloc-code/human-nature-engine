/** Prompt registry — versions live in DB (prompt_versions) and here as defaults. */

export const PROMPT_LAW_VERSION = "1.0.0";

export function getDefaultPrompt(agent: string): string {
  return `You are the ${agent} agent for the Human Nature Content Engine. Follow PRODUCT-LAW and PROMPT-LAW. Never generate content without parent Human Insights.`;
}

export { PROMPT_V1 } from "./bodies";
export {
  getActivePrompt,
  getPromptVersion,
  ensurePromptVersion,
  seedPhase2Prompts,
  seedPhase3Prompts,
  seedPhase4Prompts,
  seedPhase5Prompts,
} from "./registry";
