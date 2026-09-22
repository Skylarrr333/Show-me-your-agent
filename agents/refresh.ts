import { z } from "zod";
import { SessionSchema, PropertySchema, type Session, type Trace } from "../schemas";
import { dataMode, dataRevision, getDataProviders } from "../providers/evidence";
import { runAgent, event } from "./orchestrator";

export const RefreshInput = z.object({
  version: z.number().int().nonnegative(),
  demoEvent: z.object({
    kind: z.enum(["withdraw", "raise-price"]),
    propertyId: PropertySchema.shape.id,
  }).strict().optional(),
}).strict();

export async function refreshAgent(old: Session, demoEvent?: z.infer<typeof RefreshInput>["demoEvent"], emit: (trace: Trace) => void = () => {}) {
  const input = SessionSchema.parse(structuredClone(old));
  if (input.profile.unknownFields.length || ["empty", "clarification"].includes(input.status))
    throw new Error("Complete the buyer brief before refreshing");
  if (demoEvent) {
    const row = input.recommendations.find((r) => r.property.id === demoEvent.propertyId);
    if (dataMode() !== "synthetic" || !row?.property.isSynthetic || !input.shortlist.includes(demoEvent.propertyId))
      throw new Error("Simulation is available only for shortlisted synthetic properties");
    const previous = input.demoChanges?.find((c) => c.id === demoEvent.propertyId);
    const change = { ...previous, id: demoEvent.propertyId,
      ...(demoEvent.kind === "withdraw" ? { availability: "unavailable" as const }
        : { price: Math.max(row.property.price, input.profile.budget.max ?? row.property.price) + 100000 }),
    };
    input.demoChanges = [...(input.demoChanges ?? []).filter((c) => c.id !== change.id), change];
  }
  let revision: string;
  try { revision = await dataRevision(input); }
  catch {
    const failed = SessionSchema.parse({ ...input, status: "error", recommendations: [], shortlist: [], lastRunId: crypto.randomUUID(),
      notice: "Source could not be verified. Previous approval revoked; check the evidence file and refresh.", updatedAt: new Date().toISOString() });
    event(failed, "ERROR", failed.notice, { category: "SOURCE_UNAVAILABLE" });
    return { changed: true, session: failed };
  }
  if (!demoEvent && old.dataRevision === revision)
    return { changed: false, session: old };
  const source = getDataProviders(input).listings;
  const changedFacts = await Promise.all(old.shortlist.map(async (id) => {
    const before = old.recommendations.find((r) => r.property.id === id)?.property;
    const after = await source.get(id);
    return { id, before: before ? { price: before.price, availability: before.availability } : null,
      after: after ? { price: after.price, availability: after.availability } : null };
  }));
  const result = await runAgent(input, "", emit, {}, { refresh: true });
  const prior = new Map(old.recommendations.map((r) => [r.property.id, r]));
  const current = new Map(result.recommendations.map((r) => [r.property.id, r]));
  const removed = old.shortlist.filter((id) => !current.has(id));
  const added = result.shortlist.filter((id) => !old.shortlist.includes(id));
  const priceChanges = result.recommendations.flatMap((r) => {
    const before = prior.get(r.property.id)?.property.price;
    return before !== undefined && before !== r.property.price ? [{ id: r.property.id, before, after: r.property.price }] : [];
  });
  const details = { trigger: demoEvent ? `simulation:${demoEvent.kind}` : "source-recheck",
    simulatedChange: demoEvent ?? null, before: old.shortlist, after: result.shortlist,
    removed, added, priceChanges, changedFacts, approvalRevoked: old.status === "approved", previousRevision: old.dataRevision ?? null, revision };
  if (result.status === "waiting")
    result.notice = `Source change detected. Shortlist recomputed: ${removed.length} removed, ${added.length} added. ${old.status === "approved" ? "Previous approval revoked. " : ""}Review and approve the updated shortlist.`;
  const lastMessage = result.messages.at(-1);
  if (lastMessage?.role === "assistant") lastMessage.content = result.notice;
  const t = event(result, "VERIFY", "Source change caused a fresh recommendation decision", details);
  emit(t);
  return { changed: true, session: SessionSchema.parse(result) };
}
