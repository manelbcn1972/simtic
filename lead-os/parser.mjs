const clean = (value) => value?.replace(/\s+/g, " ").trim() || null;

export function isSalesNavigatorEmail({ from = "", subject = "", text = "" }) {
  return /linkedin\s+sales\s+navigator/i.test(from) ||
    (/linkedin/i.test(from) && /sales\s+navigator|posibles clientes|cuentas nuevas/i.test(`${subject} ${text}`));
}

export function parseSalesNavigatorEmail(message) {
  const text = clean(`${message.subject || ""}\n${message.text || ""}`) || "";
  if (!isSalesNavigatorEmail(message)) return { eventType: "unknown", confidence: 0, reason: "not_sales_navigator" };

  const job = text.match(/([A-ZÁÉÍÓÚÜÑ][\p{L}'’.-]+(?:\s+[A-ZÁÉÍÓÚÜÑ][\p{L}'’.-]+){1,3})\s+(?:started a new position as|ha empezado un nuevo puesto como)\s+(.+?)\s+(?:at|en)\s+([^,.!]+)/iu);
  if (job) return { eventType: "job_change", personName: clean(job[1]), currentTitle: clean(job[2]), companyName: clean(job[3]), confidence: 0.95 };

  const role = text.match(/([A-ZÁÉÍÓÚÜÑ][\p{L}'’.-]+(?:\s+[A-ZÁÉÍÓÚÜÑ][\p{L}'’.-]+){1,3})\s+(?:changed role|ha cambiado de cargo)\s+(?:to|a)\s+(.+?)(?:\s+(?:at|en)\s+([^,.!]+))?(?:[,.!]|$)/iu);
  if (role) return { eventType: "role_change", personName: clean(role[1]), currentTitle: clean(role[2]), companyName: clean(role[3]), confidence: 0.88 };

  if (/nuev[oa]s? posibles clientes|new leads?/i.test(text)) return { eventType: "new_lead", confidence: 0.7 };
  if (/cuentas nuevas|new accounts?/i.test(text)) return { eventType: "new_account", confidence: 0.7 };
  return { eventType: "unknown", confidence: 0.2, reason: "unrecognized_salesnav_alert" };
}

export function scoreOpportunity(event, enrichment = {}) {
  let score = Math.round(event.confidence * 25);
  const reasons = [];
  if (event.eventType === "job_change") { score += 35; reasons.push("Cambio de empresa detectado"); }
  if (/\b(CIO|CTO|CISO|CEO|VP|Director)\b/i.test(event.currentTitle || "")) { score += 25; reasons.push("Cargo decisor"); }
  if ((enrichment.employeeCount || 0) >= 500) { score += 15; reasons.push("Cuenta objetivo de tamaño relevante"); }
  score = Math.min(100, score);
  return { score, reasons, nextBestAction: score >= 70 ? "Contactar en 48 horas con mensaje de felicitación y caso de uso relevante." : "Revisar y completar enriquecimiento antes de contactar." };
}
