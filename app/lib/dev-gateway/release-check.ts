import { getServerSecretAsync, readStoredSettingsAsync } from "@/app/lib/server-secrets";

export type ReleaseCheckDecision = "SAFE TO MERGE" | "NEEDS FIXES" | "BLOCK MERGE";
export type ReleaseCheckRiskLevel = "low" | "medium" | "high" | "blocker";

export type ReleaseCheckResult = {
  releaseSummary: string;
  riskLevel: ReleaseCheckRiskLevel;
  decision: ReleaseCheckDecision;
  changedAreas: string[];
  risks: string[];
  smokeTests: string[];
  regressionTests: string[];
  edgeCases: string[];
  adminChecks: string[];
  thirdPartyChecks: string[];
  rollbackPlan: {
    rollbackSteps: string[];
    affectedSystems: string[];
    databaseChanges: string[];
    environmentChanges: string[];
  };
  audit: {
    featureBranch: string;
    changedFiles: string[];
    testResults: string[];
    approvalRequired: string[];
  };
  cursorFixPrompt: string;
};

export const EMPTY_RELEASE_CHECK_RESULT: ReleaseCheckResult = {
  releaseSummary: "",
  riskLevel: "medium",
  decision: "NEEDS FIXES",
  changedAreas: [],
  risks: [],
  smokeTests: [],
  regressionTests: [],
  edgeCases: [],
  adminChecks: [],
  thirdPartyChecks: [],
  rollbackPlan: {
    rollbackSteps: [],
    affectedSystems: [],
    databaseChanges: [],
    environmentChanges: [],
  },
  audit: {
    featureBranch: "",
    changedFiles: [],
    testResults: [],
    approvalRequired: ["tests pass", "OpenAI review passes", "Bazza approves"],
  },
  cursorFixPrompt: "",
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (item && typeof item === "object" ? JSON.stringify(item) : String(item)).trim()).filter(Boolean);
}

function normalizeDecision(value: unknown): ReleaseCheckDecision {
  if (value === "SAFE TO MERGE" || value === "NEEDS FIXES" || value === "BLOCK MERGE") return value;
  if (value === "SAFE TO TEST") return "SAFE TO MERGE";
  if (value === "NEEDS FIXES BEFORE TESTING") return "NEEDS FIXES";
  if (value === "BLOCK RELEASE") return "BLOCK MERGE";
  return "NEEDS FIXES";
}

function normalizeRiskLevel(value: unknown): ReleaseCheckRiskLevel {
  if (value === "low" || value === "medium" || value === "high" || value === "blocker") return value;
  return "medium";
}

export function normalizeReleaseCheckResult(value: unknown): ReleaseCheckResult {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rollback = row.rollbackPlan && typeof row.rollbackPlan === "object" && !Array.isArray(row.rollbackPlan)
    ? (row.rollbackPlan as Record<string, unknown>)
    : {};
  const audit = row.audit && typeof row.audit === "object" && !Array.isArray(row.audit)
    ? (row.audit as Record<string, unknown>)
    : {};
  return {
    releaseSummary: String(row.releaseSummary ?? "").trim(),
    riskLevel: normalizeRiskLevel(row.riskLevel),
    decision: normalizeDecision(row.decision),
    changedAreas: asStringArray(row.changedAreas),
    risks: asStringArray(row.risks),
    smokeTests: asStringArray(row.smokeTests),
    regressionTests: asStringArray(row.regressionTests),
    edgeCases: asStringArray(row.edgeCases),
    adminChecks: asStringArray(row.adminChecks ?? row.adminSecurityChecks),
    thirdPartyChecks: asStringArray(row.thirdPartyChecks),
    rollbackPlan: {
      rollbackSteps: asStringArray(rollback.rollbackSteps ?? row.rollbackPlan),
      affectedSystems: asStringArray(rollback.affectedSystems),
      databaseChanges: asStringArray(rollback.databaseChanges),
      environmentChanges: asStringArray(rollback.environmentChanges),
    },
    audit: {
      featureBranch: String(audit.featureBranch ?? "").trim(),
      changedFiles: asStringArray(audit.changedFiles),
      testResults: asStringArray(audit.testResults),
      approvalRequired: asStringArray(audit.approvalRequired),
    },
    cursorFixPrompt: String(row.cursorFixPrompt ?? "").trim(),
  };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    throw new Error("OpenAI returned invalid JSON.");
  }
}

function buildPrompt(input: string): string {
  return [
    "You are Plexa Dev Gateway Release Check / QA Review.",
    "Review the supplied release notes, git diff, changed files, Cursor plan or deployment notes before any merge to main.",
    "",
    "Important rules:",
    "- Do not approve production deployment or merge automatically.",
    "- Only advise, flag risks and produce test steps. Bazza approval is still required.",
    "- Cursor must never push directly to main; all work must be on a feature branch.",
    "- No unrelated refactors during bug fixes.",
    "- Be conservative with admin/auth, data-store, OpenAI/API, environment-variable and deployment risk.",
    "- If evidence is incomplete, say so in risks and choose NEEDS FIXES or BLOCK MERGE if risk is severe.",
    "- Every blocking risk must identify a concrete defect or a specific missing piece of evidence in the supplied material. Name the affected file/flow and what must be fixed or verified.",
    "- Consider supplied test results when assessing each risk. Do not report category headings alone as findings.",
    "- For NEEDS FIXES or BLOCK MERGE, cursorFixPrompt must contain actionable remediation or the exact evidence required. Do not leave it empty.",
    "- SAFE TO MERGE is a technical recommendation only; it never replaces the separate human approval or executes a merge.",
    "- Return strict JSON only, no markdown.",
    "",
    "Check these areas:",
    "1. What changed: feature, API, UI, data/store, schema and third-party API changes.",
    "2. Risk areas: broken routes, auth/admin leaks, OpenAI API issues, env vars, data loss, prompt/context bugs, performance, mobile/responsive.",
    "3. Test plan: TypeScript, lint, build, unit tests, API route tests, smoke, regression, edge cases, admin-only, third-party API, env/store/context/responsive and rollback.",
    "4. Release decision: SAFE TO MERGE, NEEDS FIXES, or BLOCK MERGE.",
    "",
    "Output exactly this JSON shape:",
    JSON.stringify(EMPTY_RELEASE_CHECK_RESULT, null, 2),
    "",
    "Release material:",
    input.slice(0, 24000),
  ].join("\n");
}

export function validateReleaseCheckResult(result: ReleaseCheckResult): ReleaseCheckResult {
  if (!result.releaseSummary || (result.decision !== "SAFE TO MERGE" && (!result.risks.length || !result.cursorFixPrompt.trim()))) {
    throw new Error("Release review incomplete: blocking reviews must identify risks and provide actionable fixes or missing evidence. Merge remains blocked.");
  }
  return result;
}

export async function runReleaseCheck(input: string): Promise<{ result: ReleaseCheckResult; model: string }> {
  const key = await getServerSecretAsync("OPENAI_API_KEY");
  if (!key) throw new Error("OpenAI API key is not configured.");
  const settings = await readStoredSettingsAsync();
  const model = settings.languageOpenaiModel?.trim() || process.env.LANGUAGE_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a senior release QA reviewer for a Next.js editorial AI platform. Return strict JSON only.",
        },
        { role: "user", content: buildPrompt(input) },
      ],
    }),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(json.error?.message || `OpenAI release check failed (${response.status}).`);
  const content = json.choices?.[0]?.message?.content ?? "{}";
  return { result: validateReleaseCheckResult(normalizeReleaseCheckResult(extractJsonObject(content))), model };
}
