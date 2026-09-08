import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
type IncomingMail = { id: string; threadId?: string; from: string; subject: string; text?: string; receivedAt?: string };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const text = (value?: string) => value?.replace(/\s+/g, " ").trim() || null;

function parse(mail: IncomingMail) {
  const content = text(`${mail.subject}\n${mail.text || ""}`) || "";
  const trusted = /linkedin\s+sales\s+navigator/i.test(mail.from) || (/linkedin/i.test(mail.from) && /sales\s+navigator|posibles clientes|cuentas nuevas/i.test(content));
  if (!trusted) return { eventType: "unknown", confidence: 0, reject: true };
  const job = content.match(/([A-ZÁÉÍÓÚÜÑ][\p{L}'’.-]+(?:\s+[A-ZÁÉÍÓÚÜÑ][\p{L}'’.-]+){1,3})\s+(?:started a new position as|ha empezado un nuevo puesto como)\s+(.+?)\s+(?:at|en)\s+([^,.!]+)/iu);
  if (job) return { eventType: "job_change", personName: text(job[1]), currentTitle: text(job[2]), companyName: text(job[3]), confidence: .95 };
  if (/nuev[oa]s? posibles clientes|new leads?/i.test(content)) return { eventType: "new_lead", confidence: .7 };
  if (/cuentas nuevas|new accounts?/i.test(content)) return { eventType: "new_account", confidence: .7 };
  return { eventType: "unknown", confidence: .2 };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  const mail = await request.json() as IncomingMail;
  if (!mail.id || !mail.from || !mail.subject) return json({ error: "id, from and subject are required" }, 400);
  const event = parse(mail);
  if (event.reject) return json({ ignored: true, reason: "not_sales_navigator" });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: saved, error } = await supabase.from("lead_signal_events").upsert({
    source: "sales_navigator_email", source_message_id: mail.id, source_thread_id: mail.threadId,
    detected_at: mail.receivedAt || new Date().toISOString(), event_type: event.eventType,
    person_name: event.personName, company_name: event.companyName, current_title: event.currentTitle,
    confidence: event.confidence, raw_email: { from: mail.from, subject: mail.subject, text: mail.text }
  }, { onConflict: "source,source_message_id" }).select("id").single();
  if (error) return json({ error: "persistence_failed" }, 500);
  const score = Math.min(100, Math.round(event.confidence * 25) + (event.eventType === "job_change" ? 35 : 0) + (/\b(CIO|CTO|CISO|CEO|VP|Director)\b/i.test(event.currentTitle || "") ? 25 : 0));
  await supabase.from("lead_opportunities").upsert({ event_id: saved.id, opportunity_score: score,
    buyer_persona: { role: event.currentTitle || "Unknown", seniority: /CIO|CTO|CISO|CEO/i.test(event.currentTitle || "") ? "C-suite" : "Unknown" },
    score_reasons: ["Sales Navigator email", event.eventType],
    next_best_action: { action: score >= 70 ? "Contactar en 48 horas" : "Revisar y enriquecer", priority: score >= 70 ? "high" : "normal" }
  }, { onConflict: "event_id" });
  // Providers are explicit records: unavailable credentials never block event persistence.
  await supabase.from("lead_signal_enrichments").upsert(["apollo", "clay", "predictleads", "crunchbase"].map(provider => ({ event_id: saved.id, provider, status: "pending" })), { onConflict: "event_id,provider" });
  return json({ accepted: true, eventId: saved.id, event, opportunityScore: score }, 202);
});
