import { INSIGHT_CATEGORIES, type ChatFollowUpSuggestion, type ChatSearchPlan, type EvidenceTier, type ExplorerTab, type InsightCategory, type ProfileMeta, type ReportEntry, type StoredReportEntry } from "../types.js";
export type { ChatFollowUpSuggestion, ChatSearchPlan } from "../types.js";

export const CHAT_CONTEXT_VERSION = 1;
export const CHAT_CONSENT_VERSION = 1;
export const MAX_CHAT_USER_TEXT_LENGTH = 2_000;
export const MAX_CHAT_CONTEXT_FINDINGS = 18;
export const MAX_BYOK_CONTEXT_FINDINGS = 50;
export const MAX_BYOK_CONTEXT_FINDINGS_LIMIT = 200;
export const MIN_BYOK_CONTEXT_FINDINGS = 1;
export const MAX_BYOK_USER_TEXT_LENGTH = 50_000;
export const MIN_BYOK_USER_TEXT_LENGTH = 1;
export const MAX_CHAT_SEARCH_RESULTS = 8;
export const MAX_CHAT_FOLLOW_UPS = 3;
export const CHAT_SEARCH_TOOL_NAME = "searchReportFindings";
export const CHAT_SEARCH_TOOL_PART_TYPE = `tool-${CHAT_SEARCH_TOOL_NAME}`;
export const DEFAULT_BYOK_MODEL_ID = "gpt-4o-mini";
const MAX_CHAT_FOLLOW_UP_TITLE_LENGTH = 44;
const MAX_CHAT_FOLLOW_UP_BODY_LENGTH = 220;
const openAiReasoningModelPattern = /^openai\/(?:gpt-5(?:[.-]|$)|o[1-9](?:[.-]|$))/;
const deepSeekReasoningModelPattern = /^deepseek\/deepseek-(?:r\d|v\d.*-pro)/;
export const CHAT_SEARCH_EVIDENCE_TIERS = ["high", "moderate", "emerging", "preview", "supplementary"] as const satisfies readonly EvidenceTier[];
const explicitSearchIntentPattern = /\b(search|find|look up|lookup|check|scan|show|list)\b/;
const reportSubjectPattern = /\b(report|finding|findings|marker|markers|gene|genes|variant|variants|snp|snps|rs\d+|risk|trait|drug|condition|evidence)\b/;
const phenotypeQuestionPattern = /\b(will i|am i|do i|could i|would i|likely to|chance of|risk of|prone to|predisposed to|carrier for|anything about)\b/;
const reportTopicPattern = /\b(bald|baldness|hair loss|alopecia|cancer|diabetes|alzheimer|heart|cholesterol|celiac|lactose|coffee|caffeine|alcohol|drug|medicine|medication|warfarin|statin|clopidogrel)\b/;

export interface ByokProviderPreset {
  providerId: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
}

export const OPENAI_BYOK_PROVIDER_PRESET: ByokProviderPreset = {
  providerId: "openai",
  label: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  defaultModel: DEFAULT_BYOK_MODEL_ID,
};

export const OPENROUTER_BYOK_PROVIDER_PRESET: ByokProviderPreset = {
  providerId: "openrouter",
  label: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  defaultModel: "openai/gpt-4o-mini",
};

export const OLLAMA_BYOK_PROVIDER_PRESET: ByokProviderPreset = {
  providerId: "ollama",
  label: "Ollama",
  baseUrl: "http://localhost:11434/v1",
  defaultModel: "llama3.1",
};

export const CUSTOM_BYOK_PROVIDER_PRESET: ByokProviderPreset = {
  providerId: "custom",
  label: "Custom URL",
  baseUrl: "",
  defaultModel: DEFAULT_BYOK_MODEL_ID,
};

export const REMOTE_BYOK_PROVIDER_PRESETS: ByokProviderPreset[] = [
  OPENAI_BYOK_PROVIDER_PRESET,
  OPENROUTER_BYOK_PROVIDER_PRESET,
  CUSTOM_BYOK_PROVIDER_PRESET,
];

export const LOCAL_BYOK_PROVIDER_PRESETS: ByokProviderPreset[] = [
  OPENAI_BYOK_PROVIDER_PRESET,
  OPENROUTER_BYOK_PROVIDER_PRESET,
  OLLAMA_BYOK_PROVIDER_PRESET,
  CUSTOM_BYOK_PROVIDER_PRESET,
];

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function byokProviderPresetsForHost(hostname: string): ByokProviderPreset[] {
  return isLocalHostname(hostname) ? LOCAL_BYOK_PROVIDER_PRESETS : REMOTE_BYOK_PROVIDER_PRESETS;
}

export function byokProviderPresetFromId(providerId: unknown, presets = REMOTE_BYOK_PROVIDER_PRESETS): ByokProviderPreset {
  const id = typeof providerId === "string" ? providerId.trim() : "";
  return presets.find((preset) => preset.providerId === id) ?? presets[presets.length - 1];
}

export function byokProviderPresetFromBaseUrl(baseUrl: string | undefined, presets = REMOTE_BYOK_PROVIDER_PRESETS): ByokProviderPreset {
  const normalized = normalizeByokBaseUrl(baseUrl);
  return presets.find((preset) => preset.baseUrl && normalizeByokBaseUrl(preset.baseUrl) === normalized)
    ?? byokProviderPresetFromId("custom", presets);
}

function normalizePositiveInteger(value: unknown, fallback: number, min: number, max: number): number {
  let parsed = fallback;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string" && value.trim()) {
    parsed = Number(value);
  }
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function normalizeByokMaxMessageLength(value: unknown): number {
  return normalizePositiveInteger(
    value,
    MAX_CHAT_USER_TEXT_LENGTH,
    MIN_BYOK_USER_TEXT_LENGTH,
    MAX_BYOK_USER_TEXT_LENGTH,
  );
}

export function normalizeByokMaxFindings(value: unknown): number {
  return normalizePositiveInteger(
    value,
    MAX_BYOK_CONTEXT_FINDINGS,
    MIN_BYOK_CONTEXT_FINDINGS,
    MAX_BYOK_CONTEXT_FINDINGS_LIMIT,
  );
}

export function shouldSearchReportForPrompt(prompt: string, contextFindingCount = 0): boolean {
  const text = prompt.toLowerCase().trim();
  if (!text) return false;

  const explicitSearchIntent = explicitSearchIntentPattern.test(text) && reportSubjectPattern.test(text);
  const phenotypeQuestion = phenotypeQuestionPattern.test(text);
  const domainTopic = reportTopicPattern.test(text);

  return explicitSearchIntent || (phenotypeQuestion && (domainTopic || contextFindingCount === 0));
}

export function normalizeByokAiError(error: unknown, fallback = "AI chat is unavailable. Check your API key and model ID in Settings."): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const lower = message.toLowerCase();

  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("invalid api key") || lower.includes("incorrect api key")) {
    return "Custom provider authentication failed. Check your API key in Settings.";
  }
  if (lower.includes("404") || (lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist") || lower.includes("unknown")))) {
    return "The selected custom model was not found. Check the model ID in Settings.";
  }
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return "The custom provider is rate limiting requests. Wait a moment and try again.";
  }
  if (lower.includes("tool") && (lower.includes("unsupported") || lower.includes("not support") || lower.includes("invalid"))) {
    return "The selected custom model does not support report-search tool calls. Try a model or provider with tool-call support.";
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted")) {
    return "The custom provider took too long to respond. Try again or choose a smaller model.";
  }
  if (lower.includes("fetch failed") || lower.includes("failed to fetch") || lower.includes("network") || lower.includes("econnrefused") || lower.includes("connection refused")) {
    return "Could not reach the custom provider. Check the base URL and that the provider is running.";
  }
  if (lower.includes("invalid") && (lower.includes("json") || lower.includes("stream") || lower.includes("response"))) {
    return "The custom provider returned an invalid OpenAI-compatible response.";
  }

  return message || fallback;
}

export function normalizeByokBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstTextValue(values: unknown[], maxLength: number): string {
  for (const value of values) {
    const text = typeof value === "string" || typeof value === "number" ? compactText(String(value), maxLength) : "";
    if (text) return text;
  }
  return "";
}

function valuesFromField(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.includes(",") ? value.split(",") : [value];
  if (typeof value === "number") return [value];
  return [];
}

function normalizedStringList(values: unknown[], maxItems: number, maxLength: number): string[] {
  const normalized = values
    .map((value) => typeof value === "string" || typeof value === "number" ? compactText(String(value), maxLength) : "")
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, maxItems);
}

function normalizedEnumList<T extends string>(values: unknown[], allowed: readonly T[], maxItems: number): T[] {
  const allowedValues = new Set<string>(allowed);
  return normalizedStringList(values, maxItems * 2, 100)
    .map((value) => value.toLowerCase())
    .filter((value): value is T => allowedValues.has(value))
    .slice(0, maxItems);
}

function rsidsFromText(value: string): string[] {
  return Array.from(value.matchAll(/\brs\d+\b/gi), (match) => match[0].toLowerCase());
}

export function coerceChatSearchPlan(input: unknown, fallbackPrompt = ""): ChatSearchPlan {
  const record = isRecord(input) ? input : {};
  const query = firstTextValue([
    record.query,
    record.searchQuery,
    record.search,
    record.prompt,
    record.term,
    typeof input === "string" || typeof input === "number" ? input : undefined,
    fallbackPrompt,
  ], 160) || "report findings";
  const relatedTerms = normalizedStringList([
    ...valuesFromField(record.relatedTerms),
    ...valuesFromField(record.related_terms),
    ...valuesFromField(record.terms),
  ], 18, 100);
  const rsids = normalizedStringList([
    ...valuesFromField(record.rsids),
    ...valuesFromField(record.rsid),
    ...rsidsFromText(query),
    ...rsidsFromText(fallbackPrompt),
  ], 12, 24)
    .map((rsid) => rsid.toLowerCase())
    .filter((rsid) => /^rs\d+$/.test(rsid));

  return {
    query,
    categories: normalizedEnumList<InsightCategory>(valuesFromField(record.categories), INSIGHT_CATEGORIES, 3),
    genes: normalizedStringList(valuesFromField(record.genes), 12, 80),
    rsids: Array.from(new Set(rsids)).slice(0, 12),
    topics: normalizedStringList(valuesFromField(record.topics), 12, 100),
    conditions: normalizedStringList(valuesFromField(record.conditions), 12, 100),
    relatedTerms,
    evidence: normalizedEnumList<EvidenceTier>(valuesFromField(record.evidence), CHAT_SEARCH_EVIDENCE_TIERS, 5),
    rationale: firstTextValue([record.rationale], 220) || "Searched the local report for terms from your prompt.",
  };
}

export interface ChatConsent {
  accepted: true;
  version: typeof CHAT_CONSENT_VERSION;
}

export interface ChatContextMarker {
  rsid: string;
  genotype: string | null;
  gene?: string;
  matchedAllele?: string;
  matchedAlleleCount?: number | null;
}

export interface ChatContextFinding {
  id: string;
  link: string;
  category: ReportEntry["category"];
  title: string;
  summary: string;
  detail: string;
  whyItMatters: string;
  genotypeSummary: string;
  genes: string[];
  topics: string[];
  conditions: string[];
  warnings: string[];
  sourceNotes: string[];
  markers: ChatContextMarker[];
  evidenceTier: ReportEntry["evidenceTier"];
  clinicalSignificance: string | null;
  normalizedClinicalSignificance: string | null;
  repute: ReportEntry["repute"];
  coverage: ReportEntry["coverage"];
  confidenceNote: string;
  disclaimer: string;
  frequencyNote: string;
  sourceGenotype: string;
  pharmgkbLevel?: string;
  clingenClassification?: string;
  publicationCount: number;
  sourceNames: string[];
  sourceUrls: string[];
}

export function formatChatTitle(value: string): string {
  const title = value.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim();
  return title.length > 52 ? `${title.slice(0, 49)}...` : title;
}

function followUpMarkerPattern(): RegExp {
  return /<!--\s*deana-follow-ups\s*:\s*([\s\S]*?)\s*-->/gi;
}

function normalizeFollowUpText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

export function normalizeChatFollowUps(value: unknown): ChatFollowUpSuggestion[] {
  const candidates = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "followUps" in value && Array.isArray(value.followUps)
      ? value.followUps
      : [];
  const seenBodies = new Set<string>();
  const followUps: ChatFollowUpSuggestion[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const title = normalizeFollowUpText("title" in candidate ? candidate.title : null, MAX_CHAT_FOLLOW_UP_TITLE_LENGTH);
    const body = normalizeFollowUpText("body" in candidate ? candidate.body : null, MAX_CHAT_FOLLOW_UP_BODY_LENGTH);
    const bodyKey = body.toLocaleLowerCase();
    if (!title || !body || seenBodies.has(bodyKey)) continue;
    seenBodies.add(bodyKey);
    followUps.push({ title, body });
    if (followUps.length >= MAX_CHAT_FOLLOW_UPS) break;
  }

  return followUps;
}

export function extractChatFollowUps(content: string): { content: string; followUps: ChatFollowUpSuggestion[] } {
  const followUps: ChatFollowUpSuggestion[] = [];
  const strippedContent = content.replace(followUpMarkerPattern(), (_match, payload: string) => {
    try {
      followUps.push(...normalizeChatFollowUps(JSON.parse(payload)));
    } catch {
      // Invalid model metadata should not leak into the visible chat.
    }
    return "";
  }).trim();

  return {
    content: strippedContent,
    followUps: normalizeChatFollowUps(followUps),
  };
}

export function buildGatewayProviderOptions(model: string, includeThoughts = false) {
  const isGeminiGatewayModel = model.startsWith("google/gemini-");
  const isOpenAiReasoningGatewayModel = openAiReasoningModelPattern.test(model);
  const isDeepSeekReasoningModel = deepSeekReasoningModelPattern.test(model);

  return {
    // Gemma routes use only gateway privacy flags; no Gemini/OpenAI/DeepSeek provider options.
    ...(isGeminiGatewayModel
      ? {
          google: {
            thinkingLevel: "low",
            includeThoughts,
          },
        }
      : {}),
    ...(isOpenAiReasoningGatewayModel
      ? {
          openai: {
            reasoningEffort: "low",
          },
        }
      : {}),
    ...(isDeepSeekReasoningModel
      ? {
          deepseek: {
            thinkingBudgetTokens: 1000,
          },
        }
      : {}),
    gateway: {
      zeroDataRetention: true,
      disallowPromptTraining: true,
      ...(isGeminiGatewayModel ? { only: ["vertex"] } : {}),
    },
  };
}

export interface ChatReportContext {
  contextVersion: typeof CHAT_CONTEXT_VERSION;
  report: {
    provider: string;
    build: string;
    markerCount: number;
    coverageScore: number;
    evidencePackVersion: string;
    evidenceStatus: string;
    evidenceMatchedFindings: number;
    localEvidenceEntryMatches: number;
    warnings: string[];
    categoryCounts: Array<{ tab: ExplorerTab; label: string; count: number }>;
  };
  findings: ChatContextFinding[];
}

interface BuildChatContextOptions {
  profile: ProfileMeta;
  visibleEntries: StoredReportEntry[];
  selectedEntry: StoredReportEntry | null;
  retrievedFindings?: ChatContextFinding[];
  maxFindings?: number;
}

function compactText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function compactList(values: string[], maxItems: number, maxLength = 80): string[] {
  return values
    .map((value) => compactText(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function safeSourceUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function findingToChatContext(entry: StoredReportEntry): ChatContextFinding {
  return {
    id: entry.id,
    link: `deana://entry/${encodeURIComponent(entry.id)}`,
    category: entry.category,
    title: compactText(entry.title, 140),
    summary: compactText(entry.summary, 900),
    detail: compactText(entry.detail, 1_400),
    whyItMatters: compactText(entry.whyItMatters, 900),
    genotypeSummary: compactText(entry.genotypeSummary, 700),
    genes: compactList(entry.genes, 10),
    topics: compactList(entry.topics, 10),
    conditions: compactList(entry.conditions, 10),
    warnings: compactList(entry.warnings, 8, 220),
    sourceNotes: compactList(entry.sourceNotes, 8, 220),
    markers: entry.matchedMarkers.slice(0, 8).map((marker) => ({
      rsid: marker.rsid,
      genotype: marker.genotype,
      gene: marker.gene,
      matchedAllele: marker.matchedAllele,
      matchedAlleleCount: marker.matchedAlleleCount,
    })),
    evidenceTier: entry.evidenceTier,
    clinicalSignificance: entry.clinicalSignificance,
    normalizedClinicalSignificance: entry.normalizedClinicalSignificance,
    repute: entry.repute,
    coverage: entry.coverage,
    confidenceNote: compactText(entry.confidenceNote, 500),
    disclaimer: compactText(entry.disclaimer, 500),
    frequencyNote: compactText(entry.frequencyNote ?? "", 300),
    sourceGenotype: compactText(entry.sourceGenotype ?? "", 120),
    pharmgkbLevel: compactText(entry.pharmgkbLevel ?? "", 60),
    clingenClassification: compactText(entry.clingenClassification ?? "", 120),
    publicationCount: entry.publicationCount,
    sourceNames: entry.sources.map((source) => compactText(source.name, 100)).filter(Boolean).slice(0, 5),
    sourceUrls: entry.sources.map((source) => safeSourceUrl(source.url)).filter((url): url is string => Boolean(url)).slice(0, 5),
  };
}

function rankedEntries(selectedEntry: StoredReportEntry | null, visibleEntries: StoredReportEntry[], maxFindings: number): StoredReportEntry[] {
  const entries = selectedEntry ? [selectedEntry, ...visibleEntries] : visibleEntries;
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).slice(0, maxFindings);
}

export function mergeChatFindings(findings: ChatContextFinding[], maxFindings = MAX_CHAT_CONTEXT_FINDINGS): ChatContextFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  }).slice(0, maxFindings);
}

export function buildChatContext({
  profile,
  visibleEntries,
  selectedEntry,
  retrievedFindings,
  maxFindings = MAX_CHAT_CONTEXT_FINDINGS,
}: BuildChatContextOptions): ChatReportContext {
  const currentFindings = rankedEntries(selectedEntry, visibleEntries, maxFindings).map(findingToChatContext);

  return {
    contextVersion: CHAT_CONTEXT_VERSION,
    report: {
      provider: profile.dna.provider,
      build: profile.dna.build,
      markerCount: profile.dna.markerCount,
      coverageScore: profile.report.overview.coverageScore,
      evidencePackVersion: profile.report.overview.evidencePackVersion,
      evidenceStatus: profile.report.overview.evidenceStatus,
      evidenceMatchedFindings: profile.report.overview.evidenceMatchedFindings,
      localEvidenceEntryMatches: profile.report.overview.localEvidenceEntryMatches,
      warnings: compactList(profile.report.overview.warnings, 8, 220),
      categoryCounts: profile.report.tabs.map((tab) => ({
        tab: tab.tab,
        label: tab.label,
        count: tab.count,
      })),
    },
    findings: mergeChatFindings([
      ...currentFindings,
      ...(retrievedFindings ?? []),
    ], maxFindings),
  };
}
