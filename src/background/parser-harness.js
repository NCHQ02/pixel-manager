import { validateParsedSignal } from "../shared/tracking-catalog.js";
import { parseGoogleRequest } from "./parsers/google.js";
import { parseMetaRequest } from "./parsers/meta.js";
import { parseTikTokRequest } from "./parsers/tiktok.js";

const PARSERS = Object.freeze([
  { name: "meta", parse: parseMetaRequest },
  { name: "tiktok", parse: parseTikTokRequest },
  { name: "google", parse: parseGoogleRequest },
]);

export function normalizeParserResults(rawResults) {
  return (Array.isArray(rawResults) ? rawResults : [rawResults])
    .filter(Boolean)
    .map((signal) => validateParsedSignal(signal));
}

export function parseTrackingRequest(url, details) {
  for (const parser of PARSERS) {
    const rawResults = parser.parse(url, details);
    if (!rawResults) continue;
    return normalizeParserResults(rawResults).map((signal) => ({
      ...signal,
      sourceParser: signal.sourceParser || parser.name,
    }));
  }
  return [];
}
