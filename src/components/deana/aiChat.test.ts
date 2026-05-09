import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import type { ChatRetrievalTrace } from "../../types";
import { compactChatMessagesForRequest, generatingStatusDetail, messageReasoningBlocks, searchMoreFollowUpFromTrace, shouldAutoContinueAfterSearchTool, threadTitleRequestBody, traceFindingSummary, type SearchStatus } from "./aiChat";

const emptySearchTrace: ChatRetrievalTrace = {
  searchedAt: "2026-05-01T12:00:00.000Z",
  scannedCategories: ["medical"],
  searchedTerms: ["zymase"],
  relatedTerms: [],
  resultCount: 0,
  returnedFindings: [],
  rationale: "No saved report findings matched.",
};

describe("generatingStatusDetail", () => {
  it("uses a generic thinking label until report context search is requested", () => {
    expect(generatingStatusDetail({ status: "idle" })).toBe("Thinking…");
  });

  it("uses context-specific labels for report finding search states", () => {
    const readyStatus: SearchStatus = {
      status: "ready",
      trace: {
        searchedAt: "2026-05-01T12:00:00.000Z",
        scannedCategories: ["medical"],
        searchedTerms: ["factor v"],
        relatedTerms: [],
        resultCount: 3,
        returnedFindings: [],
        rationale: "Matched medical findings.",
      },
    };

    expect(generatingStatusDetail({ status: "searching" })).toBe("Searching saved report findings...");
    expect(generatingStatusDetail(readyStatus)).toBe("Interpreting 3 matched findings...");
    expect(generatingStatusDetail({ status: "error", message: "Search failed." })).toBe("Search failed.");
  });

  it("uses a neutral label when local report search finds nothing", () => {
    expect(generatingStatusDetail({
      status: "ready",
      trace: emptySearchTrace,
    })).toBe("No matching saved findings found...");
  });
});

describe("threadTitleRequestBody", () => {
  it("sends only the prompt when BYOK is not configured", () => {
    expect(threadTitleRequestBody("Will I go bald?", {
      byokEnabled: false,
      byokApiKey: "sk-test",
      byokBaseUrl: "https://openrouter.ai/api/v1",
      byokModelId: "openai/gpt-4o-mini",
    })).toEqual({ prompt: "Will I go bald?" });
  });

  it("includes trimmed BYOK fields when BYOK is configured", () => {
    expect(threadTitleRequestBody("Will I go bald?", {
      byokEnabled: true,
      byokApiKey: " sk-test ",
      byokBaseUrl: " https://openrouter.ai/api/v1 ",
      byokModelId: " openai/gpt-4o-mini ",
    })).toEqual({
      prompt: "Will I go bald?",
      byokApiKey: "sk-test",
      byokBaseUrl: "https://openrouter.ai/api/v1",
      byokModelId: "openai/gpt-4o-mini",
    });
  });
});

describe("compactChatMessagesForRequest", () => {
  it("keeps only visible text and strips reasoning, tool outputs, and hidden follow-ups", () => {
    expect(compactChatMessagesForRequest([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Compare these findings" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "private model reasoning" },
          { type: "tool-searchReportFindings", state: "output-available", toolCallId: "tool-1", input: {}, output: { findings: [{ detail: "large finding payload" }] } },
          { type: "text", text: 'Here is the comparison.\n<!-- deana-follow-ups: [{"title":"Next","body":"Ask next"}] -->' },
        ],
      },
    ])).toEqual([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Compare these findings" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Here is the comparison." }],
      },
    ]);
  });

  it("keeps the latest completed tool output so automatic continuation can see empty search results", () => {
    const completedToolPart: UIMessage["parts"][number] = {
      type: "tool-searchReportFindings",
      state: "output-available",
      toolCallId: "tool-empty",
      input: {
        query: "zymase tolerance",
        categories: [],
        genes: [],
        rsids: [],
        topics: [],
        conditions: [],
        relatedTerms: ["zymase"],
        evidence: [],
        rationale: "Search report terms from the prompt.",
      },
      output: {
        findings: [],
        trace: emptySearchTrace,
        resultCount: 0,
        message: "No saved report findings matched this local browser search.",
      },
    };

    expect(compactChatMessagesForRequest([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Anything about zymase tolerance?" }],
      },
      {
        id: "assistant-tool-1",
        role: "assistant",
        parts: [completedToolPart],
      },
    ])).toEqual([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Anything about zymase tolerance?" }],
      },
      {
        id: "assistant-tool-1",
        role: "assistant",
        parts: [completedToolPart],
      },
    ]);
  });

  it("strips old tool-only messages after the assistant has answered", () => {
    const oldToolPart: UIMessage["parts"][number] = {
      type: "tool-searchReportFindings",
      state: "output-available",
      toolCallId: "tool-old",
      input: {},
      output: {
        findings: [{ detail: "old compact finding payload" }],
        resultCount: 1,
      },
    };

    expect(compactChatMessagesForRequest([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Anything about factor v?" }],
      },
      {
        id: "assistant-tool-1",
        role: "assistant",
        parts: [oldToolPart],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "I found one matching saved finding." }],
      },
    ])).toEqual([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Anything about factor v?" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "I found one matching saved finding." }],
      },
    ]);
  });

  it("does not keep latest errored tool output for automatic continuation", () => {
    expect(compactChatMessagesForRequest([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Anything about zymase tolerance?" }],
      },
      {
        id: "assistant-tool-1",
        role: "assistant",
        parts: [{
          type: "tool-searchReportFindings",
          state: "output-error",
          toolCallId: "tool-error",
          input: {},
          errorText: "AI report search is unavailable right now.",
        }],
      },
    ])).toEqual([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Anything about zymase tolerance?" }],
      },
    ]);
  });
});

describe("shouldAutoContinueAfterSearchTool", () => {
  it("continues after successful browser search output", () => {
    expect(shouldAutoContinueAfterSearchTool({
      messages: [{
        id: "assistant-tool-1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-searchReportFindings",
            state: "output-available",
            toolCallId: "tool-1",
            input: {},
            output: { findings: [], resultCount: 0 },
          },
        ],
      }],
    })).toBe(true);
  });

  it("does not continue after search tool errors", () => {
    expect(shouldAutoContinueAfterSearchTool({
      messages: [{
        id: "assistant-tool-1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-searchReportFindings",
            state: "output-error",
            toolCallId: "tool-1",
            input: {},
            errorText: "AI report search is unavailable right now.",
          },
        ],
      }],
    })).toBe(false);
  });
});

describe("messageReasoningBlocks", () => {
  it("keeps separate reasoning parts as separate blocks", () => {
    const blocks = messageReasoningBlocks({
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "First thought. " },
        { type: "text", text: "Visible answer." },
        { type: "reasoning", text: "Second thought." },
      ],
    }, "2026-05-09T12:00:00.000Z");

    expect(blocks).toEqual([
      { id: "assistant-1-reasoning-0", text: "First thought.", createdAt: "2026-05-09T12:00:00.000Z" },
      { id: "assistant-1-reasoning-1", text: "Second thought.", createdAt: "2026-05-09T12:00:00.000Z" },
    ]);
  });
});

describe("traceFindingSummary", () => {
  it("shows interpreted findings and remaining local matches instead of the candidate window ratio", () => {
    expect(traceFindingSummary({
      searchedAt: "2026-05-01T12:00:00.000Z",
      scannedCategories: ["medical"],
      searchedTerms: ["factor v"],
      relatedTerms: [],
      resultCount: 18,
      sentCount: 18,
      candidateWindowCount: 180,
      remainingCandidateCount: 162,
      returnedFindings: [],
      rationale: "Matched medical findings.",
    }, 18)).toBe("18 findings interpreted · 162 remaining");
  });

  it("omits the remaining count when there are no more local matches in the window", () => {
    expect(traceFindingSummary({
      searchedAt: "2026-05-01T12:00:00.000Z",
      scannedCategories: ["traits"],
      searchedTerms: ["baldness"],
      relatedTerms: [],
      resultCount: 1,
      sentCount: 1,
      remainingCandidateCount: 0,
      returnedFindings: [],
      rationale: "Matched trait findings.",
    }, 1)).toBe("1 finding interpreted");
  });
});

describe("searchMoreFollowUpFromTrace", () => {
  it("builds the local search-more follow-up only when more findings remain", () => {
    expect(searchMoreFollowUpFromTrace({
      searchedAt: "2026-05-01T12:00:00.000Z",
      scannedCategories: ["medical"],
      searchedTerms: ["factor v"],
      relatedTerms: [],
      resultCount: 8,
      sentCount: 8,
      remainingCandidateCount: 12,
      returnedFindings: [],
      rationale: "Matched medical findings.",
      searchPlan: {
        query: "Factor V",
        categories: ["medical"],
        genes: [],
        rsids: [],
        topics: [],
        conditions: [],
        relatedTerms: [],
        evidence: [],
        rationale: "Find Factor V entries.",
      },
      retrievalCursor: {
        hasMore: true,
        nextOffset: 8,
        sentFindingIds: ["medical-1"],
      },
    })).toEqual({
      title: "Search more findings",
      body: "Show me more local findings for Factor V.",
    });

    expect(searchMoreFollowUpFromTrace({
      searchedAt: "2026-05-01T12:00:00.000Z",
      scannedCategories: ["traits"],
      searchedTerms: ["hair"],
      relatedTerms: [],
      resultCount: 1,
      returnedFindings: [],
      rationale: "Matched trait findings.",
      retrievalCursor: {
        hasMore: false,
        nextOffset: 1,
        sentFindingIds: ["traits-1"],
      },
    })).toBeNull();
  });
});
