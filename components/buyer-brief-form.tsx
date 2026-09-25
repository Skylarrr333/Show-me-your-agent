"use client";
import { useState, type FormEvent } from "react";
import { Send, LoaderCircle } from "lucide-react";
import { emptyProfile, type BuyerProfile, type Property } from "../schemas";
import { RunInputSchema, applyBriefConstraints, type BriefConstraints } from "../lib/brief-input";
import { profileConflict } from "../lib/profile";

type Props = {
  profile?: BuyerProfile;
  message: string;
  onMessage: (value: string) => void;
  onSubmit: (message: string, constraints: BriefConstraints) => void;
  disabled: boolean;
  busy: boolean;
  showConstraints: boolean;
  onShowConstraints: () => void;
};
export default function BuyerBriefForm({ profile = emptyProfile(), message, onMessage, onSubmit, disabled, busy, showConstraints, onShowConstraints }: Props) {
  const initial = { min: profile.budget.min, max: profile.budget.max,
    minBedrooms: profile.property.minBedrooms, minSize: profile.property.minSize,
    maxSize: profile.property.maxSize, maxMrtWalkingMinutes: profile.transport.maxMrtWalkingMinutes };
  const [values, setValues] = useState(() => Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, value?.toString() ?? ""])));
  const [types, setTypes] = useState(profile.property.propertyTypes);
  const [error, setError] = useState("");
  function numeric(key: keyof typeof initial) {
    return values[key] === "" ? (initial[key] === null ? undefined : null) : Number(values[key]);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    // Omitted empty fields allow language-only entry; clearing a saved value removes it.
    const clean = <T extends Record<string, unknown>>(group: T) => Object.fromEntries(Object.entries(group).filter(([, value]) => value !== undefined));
    const constraints = {
      budget: clean({ min: numeric("min"), max: numeric("max") }),
      property: clean({ minBedrooms: numeric("minBedrooms"), minSize: numeric("minSize"), maxSize: numeric("maxSize"),
        propertyTypes: types.length || profile.property.propertyTypes.length ? types : undefined }),
      transport: clean({ maxMrtWalkingMinutes: numeric("maxMrtWalkingMinutes") }),
    };
    const result = RunInputSchema.safeParse({ message, constraints, version: 0 });
    if (!result.success) { setError("Add a requirement and check that numeric limits are valid."); return; }
    const conflict = profileConflict(applyBriefConstraints(profile, result.data.constraints));
    if (conflict) { onShowConstraints(); setError(conflict); return; }
    setError("");
    onSubmit(result.data.message, result.data.constraints!);
  }
  function field(key: keyof typeof initial, label: string, placeholder: string, max?: number) {
    return <label className="brief-field" htmlFor={`brief-${key}`}><span>{label}</span>
      <input id={`brief-${key}`} type="number" min="0" max={max} step={key === "minBedrooms" ? "1" : "any"}
        value={values[key]} placeholder={placeholder}
        onChange={(e) => { setValues({ ...values, [key]: e.target.value }); setError(""); }} />
    </label>;
  }
  return <form className="conversation-composer" onSubmit={submit} aria-label="Send buyer requirements">
      <fieldset disabled={disabled} className="brief-form-fields" onInvalid={onShowConstraints}>
        <div id="conversation-conditions" hidden={!showConstraints}>
        <div className="brief-input-grid">
          <fieldset className="brief-group"><legend>Budget · SGD</legend><div className="brief-range">
            {field("min", "Minimum price", "No minimum")}{field("max", "Maximum price", "e.g. 1600000")}
          </div></fieldset>
          <fieldset className="brief-group"><legend>Floor area · sqft</legend><div className="brief-range">
            {field("minSize", "Minimum area", "No minimum")}{field("maxSize", "Maximum area", "No maximum")}
          </div></fieldset>
          <div className="brief-range brief-other">
            {field("minBedrooms", "Minimum bedrooms", "e.g. 2", 20)}
            {field("maxMrtWalkingMinutes", "MRT walk · max minutes", "No limit", 120)}
          </div>
        </div>
        <fieldset className="brief-types"><legend>Property type <span>Optional · choose one or more</span></legend>
          <div>{(["Condo", "HDB", "Landed"] as Property["propertyType"][]).map((type) =>
            <label key={type} className={types.includes(type) ? "brief-type selected" : "brief-type"}>
              <input type="checkbox" checked={types.includes(type)} onChange={() => setTypes(types.includes(type) ? types.filter((t) => t !== type) : [...types, type])} />{type}
            </label>)}</div>
        </fieldset>
        </div>
        <label className="brief-field brief-message" htmlFor="buyer-message"><span>{showConstraints ? "Anything else?" : "Your message"}<small>Optional</small></span>
          <textarea id="buyer-message" value={message} onChange={(e) => onMessage(e.target.value)} maxLength={4000}
            placeholder="e.g. We work at NUS, don’t drive, and love nearby parks." rows={3} />
        </label>
        <div className="brief-submit"><span>{showConstraints ? "Filled conditions take priority." : "Your saved conditions still apply."}</span>
          <button className="button primary" type="submit">{busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}{busy ? "Finding homes…" : showConstraints ? "Find homes" : "Send"}</button>
        </div>
      </fieldset>
      {error && <p className="brief-form-error" role="alert">{error}</p>}
  </form>;
}
