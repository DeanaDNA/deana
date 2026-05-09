import { describe, expect, it } from "vitest";
import { chatModelFromEnv, DEANA_MODELS } from "../src/lib/ai/models.js";
import { CHAT_SEARCH_TOOL_PART_TYPE, MAX_CHAT_USER_TEXT_LENGTH, normalizeByokAiError, normalizeByokBaseUrl } from "../src/lib/aiChat.js";
import { buildSystemPrompt, repairSearchToolCallInput, shouldRequireReportSearch, trimMessagesToRecentWindow, validateUserText } from "./chat.js";

type ChatContext = Parameters<typeof buildSystemPrompt>[0];

function buildMessages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `m-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    parts: [{ type: "text", text: `message-${index}` }],
  }));
}

function buildChatContext(): ChatContext {
  return {
    contextVersion: 1,
    report: {
      provider: "23andMe",
      build: "GRCh37",
      markerCount: 10,
      coverageScore: 90,
      evidencePackVersion: "test-pack",
      evidenceStatus: "complete",
      evidenceMatchedFindings: 1,
      localEvidenceEntryMatches: 1,
      warnings: [],
      categoryCounts: [],
    },
    findings: [],
  };
}

describe("trimMessagesToRecentWindow", () => {
  it("keeps payload unchanged when messages are at or under max", () => {
    const payload = {
      consent: { accepted: true, version: "v1" },
      context: { contextVersion: "v1" },
      messages: buildMessages(12),
    };

    expect(trimMessagesToRecentWindow(payload)).toEqual(payload);
  });

  it("trims to the most recent message window", () => {
    const payload = {
      consent: { accepted: true, version: "v1" },
      context: { contextVersion: "v1" },
      messages: buildMessages(16),
    };

    expect(trimMessagesToRecentWindow(payload)).toEqual({
      ...payload,
      messages: payload.messages.slice(-12),
    });
  });

  it("ignores non-object payloads", () => {
    expect(trimMessagesToRecentWindow(null)).toBeNull();
    expect(trimMessagesToRecentWindow("not-an-object")).toBe("not-an-object");
  });
});

describe("chatModelFromEnv", () => {
  it("uses the configured chat model when present", () => {
    expect(chatModelFromEnv({ DEANA_LLM_MODEL: "openai/gpt-4o-mini" })).toBe("openai/gpt-4o-mini");
  });

  it("falls back to the default chat model for missing or empty values", () => {
    expect(chatModelFromEnv({})).toBe(DEANA_MODELS.default);
    expect(chatModelFromEnv({ DEANA_LLM_MODEL: " " })).toBe(DEANA_MODELS.default);
  });
});

describe("shouldRequireReportSearch", () => {
  it("requires local search for phenotype lookup questions", () => {
    expect(shouldRequireReportSearch([
      { id: "u1", role: "user", parts: [{ type: "text", text: "Will I go bald?" }] },
    ], buildChatContext())).toBe(true);
  });

  it("keeps normal text answers for explanation follow-ups", () => {
    expect(shouldRequireReportSearch([
      { id: "u1", role: "user", parts: [{ type: "text", text: "What does coverage score mean?" }] },
    ], buildChatContext())).toBe(false);
  });

  it("does not require another search while returning completed tool output", () => {
    expect(shouldRequireReportSearch([
      { id: "u1", role: "user", parts: [{ type: "text", text: "Will I go bald?" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: CHAT_SEARCH_TOOL_PART_TYPE, state: "output-available", toolCallId: "tool-1", input: {}, output: { findings: [] } }],
      },
    ], buildChatContext())).toBe(false);
  });
});

describe("validateUserText", () => {
  it("keeps the built-in chat message length cap by default", () => {
    expect(validateUserText([
      { id: "u1", role: "user", parts: [{ type: "text", text: "x".repeat(MAX_CHAT_USER_TEXT_LENGTH) }] },
    ])).toBe(true);
    expect(validateUserText([
      { id: "u1", role: "user", parts: [{ type: "text", text: "x".repeat(MAX_CHAT_USER_TEXT_LENGTH + 1) }] },
    ])).toBe(false);
  });

  it("allows BYOK callers to use a larger configured message length", () => {
    expect(validateUserText([
      { id: "u1", role: "user", parts: [{ type: "text", text: "x".repeat(MAX_CHAT_USER_TEXT_LENGTH + 1) }] },
    ], MAX_CHAT_USER_TEXT_LENGTH + 1)).toBe(true);
  });
});

describe("normalizeByokBaseUrl", () => {
  it("allows local HTTP endpoints for OpenAI-compatible providers", () => {
    expect(normalizeByokBaseUrl(" http://localhost:11434/v1 ")).toBe("http://localhost:11434/v1");
  });

  it("keeps HTTPS endpoints valid and rejects non-HTTP protocols", () => {
    expect(normalizeByokBaseUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
    expect(normalizeByokBaseUrl("file:///tmp/socket")).toBeNull();
    expect(normalizeByokBaseUrl("not-a-url")).toBeNull();
  });
});

describe("repairSearchToolCallInput", () => {
  it("repairs partial search tool input without another model call", () => {
    expect(repairSearchToolCallInput({
      type: "tool-call",
      toolCallId: "tool-1",
      toolName: "searchReportFindings",
      input: "{\"query\":\"Factor V\",\"rsids\":[\"RS6025\"],\"categories\":[\"medical\",\"bad\"]}",
    }, "Anything about clotting?")).toEqual({
      type: "tool-call",
      toolCallId: "tool-1",
      toolName: "searchReportFindings",
      input: JSON.stringify({
        query: "Factor V",
        categories: ["medical"],
        genes: [],
        rsids: ["rs6025"],
        topics: [],
        conditions: [],
        relatedTerms: [],
        evidence: [],
        rationale: "Searched the local report for terms from your prompt.",
      }),
    });
  });

  it("repairs obvious search tool name variants and falls back to the prompt", () => {
    expect(repairSearchToolCallInput({
      type: "tool-call",
      toolCallId: "tool-1",
      toolName: "search_report_findings",
      input: "",
    }, "Anything about rs1799963?")).toEqual({
      type: "tool-call",
      toolCallId: "tool-1",
      toolName: "searchReportFindings",
      input: JSON.stringify({
        query: "Anything about rs1799963?",
        categories: [],
        genes: [],
        rsids: ["rs1799963"],
        topics: [],
        conditions: [],
        relatedTerms: [],
        evidence: [],
        rationale: "Searched the local report for terms from your prompt.",
      }),
    });
  });

  it("ignores unrelated tool names", () => {
    expect(repairSearchToolCallInput({
      type: "tool-call",
      toolCallId: "tool-1",
      toolName: "webSearch",
      input: "{}",
    }, "Anything about rs6025?")).toBeNull();
  });
});

describe("BYOK errors", () => {
  it("normalizes common custom provider errors", () => {
    expect(normalizeByokAiError(new Error("401 unauthorized"))).toBe("Custom provider authentication failed. Check your API key in Settings.");
    expect(normalizeByokAiError(new Error("model not found"))).toBe("The selected custom model was not found. Check the model ID in Settings.");
    expect(normalizeByokAiError(new Error("tools unsupported"))).toBe("The selected custom model does not support report-search tool calls. Try a model or provider with tool-call support.");
    expect(normalizeByokAiError(new Error("fetch failed"))).toBe("Could not reach the custom provider. Check the base URL and that the provider is running.");
  });
});

describe("buildSystemPrompt", () => {
  it("keeps the report interpretation contract structured and privacy scoped", () => {
    const prompt = buildSystemPrompt(buildChatContext());

    expect(prompt).toContain("<!-- deana-follow-ups:");
    expect(prompt).toContain("\"title\":\"Short button label\"");
    expect(prompt).toContain("\"body\":\"Full follow-up prompt to send\"");
    expect(prompt).toContain("Do not include profile names, uploaded file names, raw DNA");
    expect(prompt).toContain("browser-local search");
    expect(prompt).toContain("Role: You are Deana's report interpreter");
    expect(prompt).toContain("Answer contract: Start with the direct answer or conclusion");
    expect(prompt).toContain("Do not narrate search planning");
    expect(prompt).toContain("Local search: Use the searchReportFindings tool only");
    expect(prompt).toContain("do not say you can search or offer to search");
    expect(prompt).toContain("call searchReportFindings immediately when needed");
    expect(prompt).toContain("Make at most one local search for a user question");
    expect(prompt).toContain("If searchReportFindings returns no findings");
    expect(prompt).toContain("Interpretation rules: Distinguish what the report observed from what it may imply");
    expect(prompt).toContain("Use evidenceTier, coverage, confidenceNote, warnings, source notes, and disclaimers");
    expect(prompt).toContain("Do not imply deterministic risk from associations");
    expect(prompt).toContain("cite at most 5 representative findings");
    expect(prompt).toContain("Do not assume the repute field means beneficial or harmful");
    expect(prompt).toContain("Medical boundaries: Do not provide a medical diagnosis or treatment advice");
    expect(prompt).toContain("do not recommend medication changes");
    expect(prompt).toContain("drug-response findings");
    expect(prompt).toContain("The visible answer must come first and the optional hidden comment must be last");
    expect(prompt).toContain("include at most 2 useful follow-up suggestions");
    expect(prompt).not.toContain("currentTab");
    expect(prompt).not.toContain("activeFilters");
    expect(prompt).not.toContain("selectedFindingId");
    expect(prompt).not.toContain("\"q\"");
    expect(prompt).not.toContain("\"sort\"");
  });

});
