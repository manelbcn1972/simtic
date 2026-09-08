import test from "node:test";
import assert from "node:assert/strict";
import { isSalesNavigatorEmail, parseSalesNavigatorEmail, scoreOpportunity } from "../parser.mjs";

test("parses English job-change alert", () => {
  const result = parseSalesNavigatorEmail({ from: "LinkedIn Sales Navigator <messages-noreply@linkedin.com>", subject: "Ana García started a new position as CIO at Acme Corp" });
  assert.deepEqual(result, { eventType: "job_change", personName: "Ana García", currentTitle: "CIO", companyName: "Acme Corp", confidence: 0.95 });
});
test("recognizes Sales Navigator account alert", () => {
  assert.equal(isSalesNavigatorEmail({ from: "LinkedIn Sales Navigator <messages-noreply@linkedin.com>", subject: "22 cuentas nuevas" }), true);
  assert.equal(parseSalesNavigatorEmail({ from: "LinkedIn Sales Navigator <messages-noreply@linkedin.com>", subject: "22 cuentas nuevas" }).eventType, "new_account");
});
test("does not process ordinary LinkedIn mail", () => {
  assert.equal(isSalesNavigatorEmail({ from: "messages-noreply@linkedin.com", subject: "Tu perfil" }), false);
});
test("scores a C-suite company change", () => {
  const scored = scoreOpportunity({ eventType: "job_change", currentTitle: "CIO", confidence: .95 }, { employeeCount: 1200 });
  assert.equal(scored.score, 99);
  assert.equal(scored.nextBestAction.startsWith("Contactar"), true);
});
