import { describe, expect, it } from "vitest";
import { buildPrompt, normalizeReleaseCheckResult, validateReleaseCheckResult } from "@/app/lib/dev-gateway/release-check";

describe("normalizeReleaseCheckResult", () => {
  it("normalizes release QA output and defaults unsafe enums", () => {
    const result = normalizeReleaseCheckResult({
      releaseSummary: "Added release QA",
      riskLevel: "unknown",
      decision: "SHIP IT",
      changedAreas: ["UI", 123],
      risks: ["Missing env var"],
      smokeTests: "not-array",
      cursorFixPrompt: "Fix the env check",
    });

    expect(result.riskLevel).toBe("medium");
    expect(result.decision).toBe("NEEDS FIXES");
    expect(result.changedAreas).toEqual(["UI", "123"]);
    expect(result.smokeTests).toEqual([]);
    expect(result.adminChecks).toEqual([]);
    expect(result.rollbackPlan.rollbackSteps).toEqual([]);
    expect(result.audit.approvalRequired).toEqual([]);
    expect(result.cursorFixPrompt).toBe("Fix the env check");
  });

  it("maps old release-check decisions into merge-gate decisions", () => {
    expect(normalizeReleaseCheckResult({ decision: "SAFE TO TEST" }).decision).toBe("SAFE TO MERGE");
    expect(normalizeReleaseCheckResult({ decision: "BLOCK RELEASE" }).decision).toBe("BLOCK MERGE");
  });
});

it("rejects an incomplete blocking review without weakening the merge gate", () => {
  const review = normalizeReleaseCheckResult({releaseSummary: "Reviewed", decision: "NEEDS FIXES", risks: ["auth"]});
  expect(() => validateReleaseCheckResult(review)).toThrow("Merge remains blocked");
  expect(validateReleaseCheckResult({...review,cursorFixPrompt:"Supply anonymous route verification for /api/costs."}).decision).toBe("NEEDS FIXES");
});

it("preserves structured reviewer findings instead of hiding their details", () => {
 const finding={file:"app/api/costs/route.ts",reason:"Missing verification",fix:"Supply authenticated evidence"};
 expect(normalizeReleaseCheckResult({risks:[finding]}).risks).toEqual([JSON.stringify(finding)]);
});

it("fails closed for missing summary, risks or remediation", () => {
 for (const decision of ["NEEDS FIXES", "BLOCK MERGE"] as const) {
  const base=normalizeReleaseCheckResult({releaseSummary:"Reviewed",decision,risks:["Missing route proof"],cursorFixPrompt:"Supply route proof"});
  expect(validateReleaseCheckResult(base).decision).toBe(decision);
  for(const invalid of [{...base,releaseSummary:""},{...base,risks:[]},{...base,cursorFixPrompt:"  "}]) expect(()=>validateReleaseCheckResult(invalid)).toThrow();
 }
 const safe=normalizeReleaseCheckResult({releaseSummary:"Verified",decision:"SAFE TO MERGE"});
 expect(validateReleaseCheckResult(safe).decision).toBe("SAFE TO MERGE");
 expect(()=>validateReleaseCheckResult({...safe,releaseSummary:""})).toThrow();
});

it('never silently truncates release evidence',()=>{
 const complete='x'.repeat(23980)+'END OF EVIDENCE';
 expect(buildPrompt(complete)).toContain(complete);
 expect(()=>buildPrompt('x'.repeat(24001))).toThrow('evidence must not be silently truncated');
});
