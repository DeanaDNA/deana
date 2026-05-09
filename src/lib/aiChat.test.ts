import { describe, expect, it } from "vitest";
import {
  buildChatContext,
  buildGatewayProviderOptions,
  byokProviderPresetFromBaseUrl,
  byokProviderPresetFromId,
  byokProviderPresetsForHost,
  coerceChatSearchPlan,
  extractChatFollowUps,
  mergeChatFindings,
  MAX_BYOK_CONTEXT_FINDINGS,
  MAX_BYOK_CONTEXT_FINDINGS_LIMIT,
  MAX_BYOK_USER_TEXT_LENGTH,
  MAX_CHAT_CONTEXT_FINDINGS,
  MAX_CHAT_USER_TEXT_LENGTH,
  normalizeByokMaxFindings,
  normalizeByokMaxMessageLength,
  normalizeChatFollowUps,
  shouldSearchReportForPrompt,
} from "./aiChat";
import { DEANA_MODELS } from "./ai/models";
import { makeProfileMeta, makeStoredReportEntries } from "../test/fixtures";

describe("buildChatContext", () => {
  it("redacts profile identity and raw DNA data from chat context", () => {
    const profile = makeProfileMeta({
      id: "profile-secret-id",
      name: "Private Profile Name",
      fileName: "private-raw-dna.txt",
    });
    const entries = makeStoredReportEntries(profile.id);
    const context = buildChatContext({
      profile,
      visibleEntries: entries,
      selectedEntry: entries[0],
    });
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain("Private Profile Name");
    expect(serialized).not.toContain("private-raw-dna.txt");
    expect(serialized).not.toContain("profile-secret-id");
    expect(serialized).not.toContain(String(profile.dna.markers[0][2]));
    expect(serialized).not.toContain("currentTab");
    expect(serialized).not.toContain("activeFilters");
    expect(serialized).not.toContain("selectedFindingId");
    expect(serialized).not.toContain("\"q\"");
    expect(serialized).not.toContain("\"sort\"");
    expect(context.report.provider).toBe(profile.dna.provider);
    expect(context.findings[0].markers[0].rsid).toMatch(/^rs\d+$/);
  });

  it("caps and deduplicates findings with the selected finding first", () => {
    const profile = makeProfileMeta();
    const template = makeStoredReportEntries(profile.id)[0];
    const entries = Array.from({ length: MAX_CHAT_CONTEXT_FINDINGS + 5 }, (_, index) => ({
      ...template,
      id: `finding-${index}`,
      title: `Finding ${index}`,
    }));
    const context = buildChatContext({
      profile,
      visibleEntries: entries,
      selectedEntry: entries[4],
    });

    expect(context.findings).toHaveLength(MAX_CHAT_CONTEXT_FINDINGS);
    expect(context.findings[0].id).toBe("finding-4");
    expect(new Set(context.findings.map((finding) => finding.id)).size).toBe(context.findings.length);
  });

  it("uses an explicit max findings override when provided", () => {
    const profile = makeProfileMeta();
    const template = makeStoredReportEntries(profile.id)[0];
    const entries = Array.from({ length: MAX_BYOK_CONTEXT_FINDINGS + 5 }, (_, index) => ({
      ...template,
      id: `finding-${index}`,
      title: `Finding ${index}`,
    }));
    const context = buildChatContext({
      profile,
      visibleEntries: entries,
      selectedEntry: null,
      maxFindings: MAX_BYOK_CONTEXT_FINDINGS,
    });

    expect(context.findings).toHaveLength(MAX_BYOK_CONTEXT_FINDINGS);
  });

  it("keeps current findings before prior retrieved findings for follow-ups", () => {
    const profile = makeProfileMeta();
    const entries = makeStoredReportEntries(profile.id);
    const priorContext = buildChatContext({
      profile,
      visibleEntries: [],
      selectedEntry: null,
      retrievedFindings: entries.slice(1, 3).map((entry) => ({
        ...buildChatContext({
          profile,
          visibleEntries: [entry],
          selectedEntry: entry,
        }).findings[0],
      })),
    });
    const context = buildChatContext({
      profile,
      visibleEntries: entries,
      selectedEntry: entries[0],
      retrievedFindings: priorContext.findings,
    });

    expect(context.findings[0].id).toBe(entries[0].id);
    expect(context.findings.map((finding) => finding.id)).toContain(entries[1].id);
    expect(new Set(context.findings.map((finding) => finding.id)).size).toBe(context.findings.length);
  });
});

describe("mergeChatFindings", () => {
  it("deduplicates and caps persisted chat findings", () => {
    const profile = makeProfileMeta();
    const template = buildChatContext({
      profile,
      visibleEntries: makeStoredReportEntries(profile.id),
      selectedEntry: null,
    }).findings[0];
    const findings = Array.from({ length: MAX_CHAT_CONTEXT_FINDINGS + 3 }, (_, index) => ({
      ...template,
      id: index === 2 ? "finding-1" : `finding-${index}`,
    }));

    const merged = mergeChatFindings(findings);

    expect(merged).toHaveLength(MAX_CHAT_CONTEXT_FINDINGS);
    expect(merged.filter((finding) => finding.id === "finding-1")).toHaveLength(1);
  });
});

describe("BYOK chat cap normalization", () => {
  it("uses BYOK defaults for missing or invalid values", () => {
    expect(normalizeByokMaxMessageLength(undefined)).toBe(MAX_CHAT_USER_TEXT_LENGTH);
    expect(normalizeByokMaxMessageLength("not-a-number")).toBe(MAX_CHAT_USER_TEXT_LENGTH);
    expect(normalizeByokMaxFindings(undefined)).toBe(MAX_BYOK_CONTEXT_FINDINGS);
    expect(normalizeByokMaxFindings("not-a-number")).toBe(MAX_BYOK_CONTEXT_FINDINGS);
  });

  it("floors decimals and clamps values to the hard range", () => {
    expect(normalizeByokMaxMessageLength(12.9)).toBe(12);
    expect(normalizeByokMaxMessageLength(-5)).toBe(1);
    expect(normalizeByokMaxMessageLength(MAX_BYOK_USER_TEXT_LENGTH + 1)).toBe(MAX_BYOK_USER_TEXT_LENGTH);
    expect(normalizeByokMaxFindings(50.8)).toBe(50);
    expect(normalizeByokMaxFindings(-10)).toBe(1);
    expect(normalizeByokMaxFindings(MAX_BYOK_CONTEXT_FINDINGS_LIMIT + 1)).toBe(MAX_BYOK_CONTEXT_FINDINGS_LIMIT);
  });
});

describe("BYOK provider normalization", () => {
  it("uses provider defaults for known providers", () => {
    expect(byokProviderPresetFromId("openai").defaultModel).toBe("gpt-4o-mini");
    expect(byokProviderPresetFromId("openrouter").defaultModel).toBe("openai/gpt-4o-mini");
    expect(byokProviderPresetFromBaseUrl("http://localhost:11434/v1", byokProviderPresetsForHost("localhost")).providerId).toBe("ollama");
    expect(byokProviderPresetFromBaseUrl("https://unknown.example/v1").providerId).toBe("custom");
  });

  it("includes Ollama only for local app hosts", () => {
    expect(byokProviderPresetsForHost("localhost").map((preset) => preset.label)).toContain("Ollama");
    expect(byokProviderPresetsForHost("deana.example").map((preset) => preset.label)).not.toContain("Ollama");
  });
});

describe("shouldSearchReportForPrompt", () => {
  it("requires search for explicit report searches and phenotype questions without context", () => {
    expect(shouldSearchReportForPrompt("Search my report for rs6025", 5)).toBe(true);
    expect(shouldSearchReportForPrompt("Will I go bald?", 0)).toBe(true);
  });

  it("does not require search for ordinary follow-ups with existing context", () => {
    expect(shouldSearchReportForPrompt("Explain the first finding in simpler terms", 3)).toBe(false);
  });
});

describe("coerceChatSearchPlan", () => {
  it("fills missing fields and uses the latest user prompt as the fallback query", () => {
    expect(coerceChatSearchPlan({}, "Anything about rs6025 clotting?")).toEqual({
      query: "Anything about rs6025 clotting?",
      categories: [],
      genes: [],
      rsids: ["rs6025"],
      topics: [],
      conditions: [],
      relatedTerms: [],
      evidence: [],
      rationale: "Searched the local report for terms from your prompt.",
    });
  });

  it("normalizes partial BYOK tool input and discards invalid values", () => {
    expect(coerceChatSearchPlan({
      query: " Factor V Leiden ",
      categories: ["medical", "bad-category", "drug", "medical"],
      genes: "F5, ",
      rsids: ["RS6025", "not-rsid", "rs1799963"],
      evidence: ["high", "weak"],
      related_terms: [" clotting ", ""],
      rationale: " Search local clotting findings. ",
    })).toEqual({
      query: "Factor V Leiden",
      categories: ["medical", "drug"],
      genes: ["F5"],
      rsids: ["rs6025", "rs1799963"],
      topics: [],
      conditions: [],
      relatedTerms: ["clotting"],
      evidence: ["high"],
      rationale: "Search local clotting findings.",
    });
  });
});

describe("extractChatFollowUps", () => {
  it("extracts hidden follow-up suggestions and strips the marker from assistant content", () => {
    const result = extractChatFollowUps([
      "Here is the answer.",
      '<!-- deana-follow-ups: [{"title":"Explain coverage","body":"What does coverage mean in this report?"},{"title":"Compare findings","body":"Compare the medical and drug findings in this report."}] -->',
    ].join("\n"));

    expect(result.content).toBe("Here is the answer.");
    expect(result.followUps).toEqual([
      { title: "Explain coverage", body: "What does coverage mean in this report?" },
      { title: "Compare findings", body: "Compare the medical and drug findings in this report." },
    ]);
  });

  it("hides malformed follow-up metadata without returning suggestions", () => {
    const result = extractChatFollowUps("Answer. <!-- deana-follow-ups: not-json -->");

    expect(result.content).toBe("Answer.");
    expect(result.followUps).toEqual([]);
  });
});

describe("normalizeChatFollowUps", () => {
  it("trims, deduplicates, and caps follow-up suggestions", () => {
    const result = normalizeChatFollowUps([
      { title: "  A useful follow-up title that is longer than the button limit  ", body: "  Explain the first finding.  " },
      { title: "Duplicate", body: "Explain the first finding." },
      { title: "Second", body: "Explain the second finding." },
      { title: "Third", body: "Explain the third finding." },
      { title: "Fourth", body: "Explain the fourth finding." },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      title: "A useful follow-up title that is longer than",
      body: "Explain the first finding.",
    });
    expect(result.map((followUp) => followUp.title)).toEqual([
      "A useful follow-up title that is longer than",
      "Second",
      "Third",
    ]);
  });
});

describe("buildGatewayProviderOptions", () => {
  it("does not send OpenAI reasoning options to non-reasoning OpenAI models", () => {
    expect(buildGatewayProviderOptions("openai/gpt-4o-mini")).not.toHaveProperty("openai");
  });

  it("keeps OpenAI reasoning options for reasoning models", () => {
    expect(buildGatewayProviderOptions(DEANA_MODELS.strongFallback)).toHaveProperty("openai.reasoningEffort", "low");
  });
});
