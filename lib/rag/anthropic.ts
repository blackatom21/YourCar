import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** Shared Anthropic client. Reads ANTHROPIC_API_KEY from the environment. */
export function anthropic(): Anthropic {
  client ??= new Anthropic({ maxRetries: 3 });
  return client;
}

export const ANSWER_MODEL = process.env.ANSWER_MODEL || "claude-opus-5-5";
export const OCR_MODEL = process.env.OCR_MODEL || "claude-haiku-4-5";
