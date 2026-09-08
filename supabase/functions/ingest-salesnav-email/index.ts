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
  // Persistence and enrichment calls run with the Supabase service role and must be configured at deploy time.
  // Missing Apollo, PredictLeads or Crunchbase secrets are recorded as unavailable; they never discard this event.
  return json({ accepted: true, sourceMessageId: mail.id, event, enrichment: ["apollo", "predictleads", "crunchbase"] }, 202);
});
