import { z } from "zod";
import { Session, SessionSchema, PropertySchema } from "../schemas";
import { event } from "./orchestrator";
import { check_constraints } from "../tools";
export const ActionSchema = z
  .object({
    action: z.enum([
      "approve",
      "reject",
      "override",
      "shortlist",
      "alternative",
    ]),
    propertyId: PropertySchema.shape.id.optional(),
    version: z.number().int().nonnegative(),
  })
  .strict();
export function humanAction(old: Session, raw: z.infer<typeof ActionSchema>) {
  const i = ActionSchema.parse(raw),
    s = SessionSchema.parse(structuredClone(old));
  if (i.version !== s.version) throw new Error("CONFLICT");
  if (!["waiting", "approved"].includes(s.status))
    throw new Error("No current recommendations to review.");
  const row = s.recommendations.find((r) => r.property.id === i.propertyId);
  if (["reject", "override", "shortlist"].includes(i.action) && !row)
    throw new Error("Unsupported property ID");
  if (i.action === "approve") {
    if (!s.shortlist.length) throw new Error("Shortlist is empty");
    for (const id of s.shortlist) {
      const r = s.recommendations.find((r) => r.property.id === id);
      if (
        !r ||
        s.rejected.includes(id) ||
        !check_constraints({
          property: r.property,
          profile: s.profile,
          commutes: r.commutes,
        }).passed
      )
        throw new Error("Invalid shortlist");
    }
    s.status = "approved";
    s.notice =
      "Shortlist approved by the property agent. No client message or transaction has been sent.";
    event(s, "HUMAN", "Human approved shortlist", { listingIds: s.shortlist });
  } else {
    if (i.action === "reject") {
      s.rejected.push(i.propertyId!);
      s.shortlist = s.shortlist.filter((id) => id !== i.propertyId);
      s.notice = `${row!.property.name} rejected.`;
      event(s, "HUMAN", "Human rejected recommendation", {
        listingId: i.propertyId,
      });
    }
    if (i.action === "shortlist") {
      if (s.rejected.includes(i.propertyId!))
        throw new Error("Rejected property cannot be shortlisted");
      s.shortlist = s.shortlist.includes(i.propertyId!)
        ? s.shortlist.filter((id) => id !== i.propertyId)
        : [...s.shortlist, i.propertyId!];
      s.notice = "Shortlist updated; approval required.";
      event(s, "HUMAN", "Human edited shortlist", { listingIds: s.shortlist });
    }
    if (i.action === "override") {
      if (s.rejected.includes(i.propertyId!))
        throw new Error("Rejected property cannot be ranked first");
      const prior = s.recommendations[0];
      s.recommendations = [
        row!,
        ...s.recommendations.filter((r) => r.property.id !== i.propertyId),
      ];
      if (!s.shortlist.includes(i.propertyId!))
        s.shortlist = [i.propertyId!, ...s.shortlist.slice(0, 2)];
      else
        s.shortlist = [
          i.propertyId!,
          ...s.shortlist.filter((id) => id !== i.propertyId),
        ];
      s.notice = `Human override: ${row!.property.name} moved above ${prior.property.name}.`;
      event(s, "HUMAN", s.notice, {
        moved: i.propertyId,
        above: prior.property.id,
        originalScore: row!.score,
      });
    }
    if (i.action === "alternative") {
      const ids = s.recommendations
        .filter(
          (r) =>
            !s.rejected.includes(r.property.id) &&
            !s.shortlist.includes(r.property.id),
        )
        .slice(0, 3)
        .map((r) => r.property.id);
      if (!ids.length)
        throw new Error(
          "No additional verified candidates. Update your buyer requirements.",
        );
      s.shortlist = ids;
      s.notice =
        "Alternative shortlist selected from already verified candidates.";
      event(s, "HUMAN", "Human requested alternative shortlist", {
        listingIds: ids,
      });
    }
    s.status = "waiting";
  }
  s.updatedAt = new Date().toISOString();
  return SessionSchema.parse(s);
}
