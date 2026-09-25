"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Building2, Search, LoaderCircle, Heart, ChevronLeft, ChevronRight } from "lucide-react";
import { ResaleFilterSchema, type ResaleFilters, type ResaleMetadata, type ResaleResult, type ResaleRow } from "../lib/resale-schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
const defaults = ResaleFilterSchema.parse({});
const money = (n: number) => `S$${n.toLocaleString("en-SG")}`;
type Info = { dataset: ResaleMetadata; towns: string[]; model: { mode: string; configured: boolean } };
export default function HomeFinder() {
  const [info,setInfo] = useState<Info | null>(null), [filters,setFilters] = useState<ResaleFilters>(defaults);
  const [result,setResult] = useState<ResaleResult | null>(null), [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false), [error,setError] = useState(""), [selected,setSelected] = useState<ResaleRow | null>(null);
  const [conversation,setConversation] = useState<{ message: string; summary: string }[]>([]);
  const [saved, setSaved] = useState<ResaleRow[]>([]);
  const [comparing, setComparing] = useState(false);
  function toggleSaved(row: ResaleRow) { setSaved(items => items.some(item=>item.id===row.id) ? items.filter(item=>item.id!==row.id) : [...items, row]); }
  const serial = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    async function init() {
      try {
        const response = await fetch("/api/homes", { signal: controller.signal });
        const value = await response.json() as Info & { error?: string };
        if (!response.ok) throw new Error(value.error || "Unable to load dataset.");
        setInfo(value);
      } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
    }
    void init();
    return () => { controller.abort(); };
  }, []);
  async function search(next = filters, text = "") {
    const validation = ResaleFilterSchema.safeParse(next);
    if (!validation.success) { setError(validation.error.issues[0].message); return; }
    const requestId = ++serial.current;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/homes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filters: validation.data, message: text }) });
      const value = await response.json() as ResaleResult & { error?: string };
      if (requestId !== serial.current) return;
      if (!response.ok) throw new Error(value.error);
      setResult(value); setFilters(value.filters); setSelected(null);
      if (text) {
        setConversation(items => [...items.slice(-4), { message: text, summary: `${value.count.toLocaleString()} matching homes found. ${value.warnings.join(" ")}` }]);
        setMessage("");
      }
    } catch (e) { if (requestId === serial.current) { setError((e as Error).message); setResult(null); } }
    finally { if (requestId === serial.current) setBusy(false); }
  }
  function submit(e: FormEvent) { e.preventDefault(); void search({ ...filters, page: 1 },message); }
  function numberField(key: "minPrice"|"maxPrice"|"minArea"|"maxArea", label: string) {
    return <label className="brief-field"><span>{label}</span><input type="number" min="0" step="any" value={filters[key] ?? ""}
      placeholder="Any" onChange={e=>setFilters({ ...filters, [key]: e.target.value === "" ? null : Number(e.target.value) })} /></label>;
  }
  const applied = result?.filters;
  return <div className="application resale-app">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark"><Building2 size={23}/></span>PropMatch</Link>
      <div className="topbar-right"><span className="resale-badge">Home finder · Simulation</span><button className="button ghost" disabled={!saved.length} onClick={()=>setComparing(true)}><Heart size={15}/> Saved homes ({saved.length})</button></div></header>
    <div className="workspace-heading"><div><h1>Find a home that fits you</h1><p>Tell us what matters. Explore homes within your budget.</p></div></div>
    <div className="data-caption">Simulated homes, grounded in HDB data. Prices are reference prices; availability is simulated.</div>
    <main className="workspace-grid">
      <section className="conversation panel"><div className="conversation-header"><span className="section-step">01</span><div><h2>Buyer conversation</h2><p>Your budget, your space, your preferences.</p></div></div>
        <form className="conversation-composer" onSubmit={submit}><fieldset className="brief-form-fields" disabled={busy || !info}>
          <div className="brief-input-grid">
            <fieldset className="brief-group"><legend>Your budget · SGD</legend><div className="brief-range">{numberField("minPrice","Minimum price")}{numberField("maxPrice","Maximum price")}</div></fieldset>
            <fieldset className="brief-group"><legend>Floor area · m²</legend><div className="brief-range">{numberField("minArea","Minimum area")}{numberField("maxArea","Maximum area")}</div></fieldset>
            <div className="brief-range"><label className="brief-field"><span>Town</span><select value={filters.town} onChange={e=>setFilters({...filters,town:e.target.value})}><option value="">All towns</option>{info?.towns.map(t=><option key={t}>{t}</option>)}</select></label>
            <label className="brief-field"><span>HDB flat type</span><select value={filters.flatType} onChange={e=>setFilters({...filters,flatType:e.target.value as ResaleFilters["flatType"]})}>{["","1 ROOM","2 ROOM","3 ROOM","4 ROOM","5 ROOM","EXECUTIVE","MULTI-GENERATION"].map(t=><option key={t} value={t}>{t || "All types"}</option>)}</select></label></div>
            <label className="brief-field"><span>Street name</span><input value={filters.street} maxLength={100} placeholder="e.g. ANG MO KIO AVE" onChange={e=>setFilters({...filters,street:e.target.value})}/></label>
            <label className="brief-field"><span>What else matters to you? <small>Optional</small></span><textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={4000} placeholder="e.g. I’m looking for a 4 ROOM home in Clementi, under SGD 800k" rows={3}/></label>
          </div>
          <div className="resale-model-note">{!info ? "Waiting for dataset connection." : info.model.mode === "demo" ? "Basic language matching · no live AI connected." : `${info.model.mode} language matching${info.model.configured ? "" : " · credentials missing"}`}</div>
          <div className="brief-submit"><span>Filled filters take priority over your message.</span><button className="button primary" type="submit">{busy ? <LoaderCircle size={16} className="spin"/> : <Search size={16}/>} {busy ? "Searching…" : "Find homes"}</button></div>
          <button type="button" className="resale-clear" onClick={()=>{setFilters(defaults);setMessage("");setResult(null);setError("");setConversation([]);}}>Clear filters</button>
        </fieldset></form>
        {conversation.length > 0 && <details className="resale-conversation"><summary>Our conversation ({conversation.length})</summary>{conversation.map((item,i)=><div key={i}><strong>You</strong><p>{item.message}</p><strong>PropMatch</strong><p>{item.summary}</p></div>)}</details>}
      </section>
      <section className="recommendations" aria-label="Matching homes"><div className="results-top"><div><h2><span className="section-step">02</span> Matching homes</h2><p>{result ? `${result.count.toLocaleString()} matching homes` : "Homes selected for your requirements."}</p></div>
        <label className="resale-sort">Sort<select value={result?.filters.sort ?? filters.sort} disabled={busy || !info} onChange={e=>{const next={...(applied ?? filters),sort:e.target.value as ResaleFilters["sort"],page:1};void search(next);}}><option value="newest">Latest reference</option><option value="price-asc">Lowest price</option><option value="price-desc">Highest price</option><option value="area-desc">Largest area</option></select></label></div>
        {error && <div className="error-banner" role="alert">{error}<p>Numeric filters work without an AI service. Clear the message to search using filters only.</p></div>}
        {result && <div className="resale-applied" aria-label="Applied search filters">{[applied?.town || "All towns", applied?.flatType || "All flat types", applied?.minPrice !== null && applied?.minPrice !== undefined ? `From ${money(applied.minPrice)}` : null, applied?.maxPrice !== null && applied?.maxPrice !== undefined ? `Up to ${money(applied.maxPrice)}` : null, applied?.minArea !== null && applied?.minArea !== undefined ? `From ${applied.minArea.toFixed(1)} m²` : null, applied?.maxArea !== null && applied?.maxArea !== undefined ? `Up to ${applied.maxArea.toFixed(1)} m²` : null, applied?.fromMonth, applied?.toMonth,applied?.street].filter(Boolean).map((s,i)=><span key={i}>{s}</span>)}</div>}
        {result?.warnings.map(w=><p className="resale-warning" key={w}>{w}</p>)}
        <div aria-live="polite" aria-busy={busy}>
          {busy ? <div className="resale-empty"><LoaderCircle className="spin" size={24}/><h3>Finding homes for you…</h3></div> : !result ? <div className="resale-empty home-welcome"><div className="home-welcome-image" role="img" aria-label="Illustrative residential building"/><span className="home-image-note">Illustration</span><h3>A place for your next chapter.</h3><p>Set your budget and preferred area, or describe the home you have in mind.</p><p>Browse home details, save your favourites and compare them side by side.</p></div> : result.rows.length === 0 ? <div className="resale-empty"><h3>No matching homes</h3><p>Try a wider budget, a different town or more flexible space requirements.</p></div> : <>
            <div className="home-grid">{result.rows.map(row=><article className="home-card" key={row.id}>
              <div className="home-card-top"><span>{row.town}</span><button className="home-save" aria-label={`${saved.some(s=>s.id===row.id) ? "Unsave" : "Save"} ${row.block} ${row.street_name}`} aria-pressed={saved.some(s=>s.id===row.id)} onClick={()=>toggleSaved(row)}><Heart size={19} fill={saved.some(s=>s.id===row.id) ? "currentColor" : "none"}/></button></div>
              <h3>{row.block} {row.street_name}</h3><p className="home-type">HDB · {row.flat_type}</p>
              <div className="home-price">{money(row.resale_price)}<span>Simulation price</span></div>
              <div className="home-facts"><span>{row.floor_area_sqm} m²</span><span>Storeys {row.storey_range}</span></div>
              <div className="home-card-bottom"><span>Matches your filters</span><button className="button" onClick={()=>setSelected(row)}>View home</button></div>
            </article>)}</div>
            <div className="resale-pagination"><span>Page {result.page} of {result.pages.toLocaleString()}</span><div><button className="button" disabled={busy || result.page===1} onClick={()=>search({...result.filters,page:result.page-1})}><ChevronLeft size={16}/>Previous</button><button className="button" disabled={busy || result.page>=result.pages} onClick={()=>search({...result.filters,page:result.page+1})}>Next<ChevronRight size={16}/></button></div></div>
          </>}
        </div>
        {info && <details className="resale-source"><summary>About this simulation</summary><p>These representative homes are built from HDB records, grouping the same address, flat type, floor range and size. The latest matching record supplies each simulation price. They are not identified individual units or live listings.</p><p>Prices are historical references, not current valuations. Bedrooms, photos and travel times are not supplied by this dataset. No real seller or viewing is connected.</p><p><a href={info.dataset.sourceUrl} target="_blank" rel="noreferrer">Kaggle source ↗</a> · {info.dataset.firstMonth}–{info.dataset.lastMonth} · License: {info.dataset.license}</p></details>}

      </section>
    </main>
    <Dialog open={!!selected} onOpenChange={open=>!open && setSelected(null)}><DialogContent className="detail-dialog"><DialogHeader><DialogTitle>{selected?.block} {selected?.street_name}</DialogTitle><DialogDescription>{selected?.town} · HDB {selected?.flat_type} · Simulated home</DialogDescription></DialogHeader>{selected && <>
      <div className="home-price">{money(selected.resale_price)}<span>Simulation price</span></div>
      <dl className="resale-record">{[["Floor area", `${selected.floor_area_sqm} m²`],["Floor range",selected.storey_range],["Flat model",selected.flat_model],["Lease started",selected.lease_commence_date],["Remaining lease at reference date",selected.remaining_lease]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <button className="button primary" onClick={()=>toggleSaved(selected)}>{saved.some(s=>s.id===selected.id) ? "Remove from saved" : "Save this home"}</button>
      <details className="resale-source"><summary>Price reference</summary><p>Based on a {selected.month} recorded sale. Source CSV row {selected.id+1}. This is a representative simulated home, not a live listing or current valuation.</p></details>
    </>}</DialogContent></Dialog>
    <Dialog open={comparing} onOpenChange={setComparing}><DialogContent className="home-compare-dialog"><DialogHeader><DialogTitle>Your saved homes</DialogTitle><DialogDescription>Compare simulation prices and space. Saved for this visit.</DialogDescription></DialogHeader>{saved.length ? <div className="resale-table-wrap"><table className="resale-table"><thead><tr><th>Home</th><th>Simulation price</th><th>Size</th><th>Floor range</th><th/></tr></thead><tbody>{saved.map(row=><tr key={row.id}><td><strong>{row.block} {row.street_name}</strong><span>{row.town} · {row.flat_type}</span></td><td>{money(row.resale_price)}</td><td>{row.floor_area_sqm} m²</td><td>{row.storey_range}</td><td><button className="resale-record-link" onClick={()=>toggleSaved(row)}>Remove</button></td></tr>)}</tbody></table></div> : <p>No saved homes yet.</p>}</DialogContent></Dialog>
  </div>;
}
