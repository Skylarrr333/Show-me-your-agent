"use client";
import Link from "next/link";
import PropertyComparison from "./property-comparison";
import BuyerBriefForm from "./buyer-brief-form";
import BuyerMessage from "./buyer-message";
import { briefMessage, hasConstraints, type BriefConstraints } from "../lib/brief-input";
import { readRunStream } from "../lib/run-stream";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  Activity,
  Building2,
  Check,
  CheckCheck,
  Clock3,
  Code2,
  GitCompareArrows,
  LoaderCircle,
  MapPin,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrainFront,
  Users,
  Bookmark,
  TriangleAlert,
  SlidersHorizontal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Checkbox } from "./ui/checkbox";
import { Skeleton } from "./ui/skeleton";
import { Session, Trace, Ranked, DEMO } from "../schemas";
import type { z } from "zod";
import type { ComparisonSchema } from "../tools";
const money = (n: number) => "S$" + n.toLocaleString("en-SG");
const stageLabel = (stage: Trace["stage"]) =>
  stage === "STATE"
    ? "Memory"
    : stage.charAt(0) + stage.slice(1).toLowerCase();
type Comparison = z.infer<typeof ComparisonSchema>;
async function api(path: string, data?: unknown) {
  const r = await fetch(path, {
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = (await r.json()) as {
    session: Session;
    comparison: Comparison;
    error?: string;
    changed?: boolean;
    checkedAt?: string;
  };
  if (!r.ok) throw new Error(result.error ?? "Request failed");
  return result;
}
export default function Workspace() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [pendingAction, setPendingAction] = useState(""),
    [live, setLive] = useState<Trace[]>([]),
    [compareIds, setCompareIds] = useState<string[]>([]),
    [comparison, setComparison] = useState<Comparison | null>(null),
    [detail, setDetail] = useState<Ranked | null>(null),
    [tab, setTab] = useState("recommendations"),
    [profileOpen, setProfileOpen] = useState(false),
    [briefView, setBriefView] = useState("requirements"),
    [activityOpen, setActivityOpen] = useState(false),
    [autoRefresh, setAutoRefresh] = useState(false),
    [lastChecked, setLastChecked] = useState(""),
    [sourceStatus, setSourceStatus] = useState<{ data: { mode: string; count: number; ready: boolean; note: string }; model: { mode: string; configured: boolean } } | null>(null),
    [pending, setPending] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const previousMessageCount = useRef<number | null>(null);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((data) => setSourceStatus(data as typeof sourceStatus)).catch(() => {});
    api("/api/session")
      .then((r) => (r.session ? r : api("/api/session", {})))
      .then((r) => {
        setSession(r.session);
        setReady(true);
      })
      .catch((e) => {
        setError(e.message);
        setReady(true);
      });
  }, []);
  const refreshSources = useCallback(async (kind?: "withdraw" | "raise-price") => {
    if (!session || busy || session.profile.unknownFields.length || ["empty", "clarification"].includes(session.status)) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/refresh", { version: session.version,
        ...(kind ? { demoEvent: { kind, propertyId: session.shortlist[0] } } : {}),
      });
      if (r.changed) { setSession(r.session); setComparison(null); setDetail(null); setCompareIds([]); setLive([]); }
      setLastChecked(r.checkedAt ?? new Date().toISOString());
    } catch (e) { setError((e as Error).message); setAutoRefresh(false); }
    finally { setBusy(false); }
  }, [session, busy]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => { if (!document.hidden) void refreshSources(); }, 30000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refreshSources]);
  useEffect(() => {
    const count = session?.messages.length;
    if (count === undefined) return;
    if (pending || (previousMessageCount.current !== null && count > previousMessageCount.current))
      end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    previousMessageCount.current = count;
  }, [session?.messages.length, pending]);
  async function reset() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/session", {});
      setSession(r.session);
      setLive([]);
      setCompareIds([]);
      setComparison(null);
      setDetail(null);
      setProfileOpen(false);
      setBriefView("requirements");
      setText("");
      setAutoRefresh(false);
      setLastChecked("");
      setTab("recommendations");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run(message: string, baseSession = session, constraints?: BriefConstraints) {
    if ((!message.trim() && !hasConstraints(constraints)) || busy || !baseSession) return;
    setBusy(true);
    setError("");
    setBriefView("conversation");
    setPending(briefMessage(message, constraints));
    setText("");
    setComparison(null);
    setDetail(null);
    setLive([]);
    setCompareIds([]);
    setTab("recommendations");
    try {
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, version: baseSession.version, constraints }),
      });
      if (!r.ok) {
        const j = (await r.json()) as { error: string };
        throw new Error(j.error);
      }
      if (!r.body) throw new Error("No run response. Reload the session.");
      const completed = await readRunStream(r.body, (t) =>
        setLive((events) => [...events, t]),
      );
      setSession(completed);
      setLive([]);
    } catch (e) {
      setText(message);
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setPending("");
    }
  }
  async function loadDemo() {
    if (busy) return;
    setError("");
    try {
      const r = await api("/api/session", {});
      setSession(r.session);
      await run(DEMO, r.session);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function action(action: string, propertyId?: string) {
    if (!session || busy) return;
    setBusy(true);
    setPendingAction(action);
    setError("");
    try {
      const r = await api("/api/action", {
        action,
        propertyId,
        version: session.version,
      });
      setSession(r.session);
      if (action === "alternative") {
        setTab("shortlist");
        setCompareIds([]);
        setComparison(null);
        setDetail(null);
      }
      if (action === "reject")
        setCompareIds((ids) => ids.filter((id) => id !== propertyId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setPendingAction("");
    }
  }
  async function compare() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/compare", {
        propertyIds: compareIds,
        version: session.version,
      });
      setComparison(r.comparison);
      setSession(r.session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const p = session?.profile;
  const all = session?.recommendations ?? [];
  const alternativeCount = all.filter(
    (r) => !session?.rejected.includes(r.property.id) &&
      !session?.shortlist.includes(r.property.id),
  ).length;
  const rows = all.filter(
    (r) =>
      !session?.rejected.includes(r.property.id) &&
      (tab !== "shortlist" || session?.shortlist.includes(r.property.id)),
  );
  const currentTrace = live.length
    ? live
    : (session?.trace ?? []).filter((t) => t.runId === session?.lastRunId);
  const grouped = currentTrace.reduce<Trace[]>((acc, t) => {
    const index =
      t.stage === "TOOL"
        ? acc.findIndex((e) => e.stage === "TOOL" && e.summary === t.summary)
        : -1;
    if (index >= 0) {
      const prior = acc[index];
      const count = ((prior.data as { calls?: number })?.calls ?? 1) + 1;
      acc[index] = {
        ...prior,
        data: {
          calls: count,
          first: (prior.data as { first?: unknown })?.first ?? prior.data,
          last: t.data,
        },
      };
    } else acc.push(t);
    return acc;
  }, []);
  const hasResults = all.length > 0;
  const activeStatus =
    session?.status === "approved"
      ? "Approved"
      : busy
        ? "Working through the brief"
        : session?.status === "no-match"
          ? "Review constraints"
          : session?.status === "clarification"
            ? "Clarification needed"
            : session?.status === "error"
              ? "Run stopped safely"
              : session?.status === "waiting"
                ? "Waiting for your review"
              : "Ready for a buyer brief";
  return (
    <div className="application">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Building2 size={23} />
          </span>
          PropMatch<span className="brand-agent">AGENT</span>
        </Link>
        <div className="topbar-right">
          <span className="demo-pill">
            {session?.mode === "gateway" ? "CLAUDE · AWS GATEWAY" : session?.mode === "deepseek" ? "DEEPSEEK" : session?.mode === "bedrock" ? "BEDROCK" : "DEMO MODE"}
          </span>
<button className="button ghost" onClick={() => setActivityOpen(true)}><Activity size={16} />Activity{busy && <span className="running-dot" />}</button>
        </div>
      </header>
      <div className="workspace-heading">
        <div>
          <h1>Buyer workspace</h1>
          <p>Find a home that fits.</p>
        </div>
        <div className="heading-actions">
          <button className="button ghost" onClick={reset} disabled={busy}>
            <RotateCcw size={15} />
            New buyer
          </button>
          <button
            className="button primary"
            onClick={loadDemo}
            disabled={busy || !ready || !session}
          >
            <Sparkles size={16} />
            Try an example
          </button>
        </div>
      </div>
      <div className="data-caption"><span className="data-dot" />
        {sourceStatus?.data.mode === "file" ? "Imported evidence snapshots" : "Demo inventory · fictional homes and routes"}
      </div>
      {sourceStatus && sourceStatus.model.mode !== "demo" && !sourceStatus.model.configured && (
        <div className="error-banner" role="status">Model access needs setup. Add your API key to the private local configuration before running a live buyer brief.</div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <TriangleAlert size={17} />
          {error}
          <button
            onClick={() => {
              api("/api/session")
                .then((r) => {
                  setSession(r.session);
                  setError("");
                })
                .catch(() => setError("Connection unavailable. Try again."));
            }}
          >
            Reload session
          </button>
        </div>
      )}
      <main className="workspace-grid">
        <section className="conversation panel" aria-label="Buyer conversation">
          <div className="conversation-header">
            <span className="section-step">01</span>
            <div><h2>Buyer conversation</h2><p>Your requirements, in one place.</p></div>
            {p?.budget.max != null && <button className="icon-button" onClick={() => setProfileOpen(true)} aria-label="View saved buyer profile"><SlidersHorizontal size={18} /></button>}
          </div>
          <Tabs value={briefView} onValueChange={setBriefView} className="buyer-view-tabs">
            <TabsList className="buyer-view-switch">
              <TabsTrigger value="requirements">Requirements</TabsTrigger>
              <TabsTrigger value="conversation">Conversation{session?.messages.length ? <span>{session.messages.filter(m => m.role === "user").length}</span> : null}</TabsTrigger>
            </TabsList>
            <TabsContent value="requirements" className="brief-tab-intro"><p>Set the essentials. Add anything else in your message.</p></TabsContent>
            <TabsContent value="conversation">
              <div className="chat-scroll" role="log" aria-label="Buyer messages" aria-live="polite">
                {!session?.messages.length && <div className="chat-welcome"><MessageSquare size={26} /><h3>Let’s find the right fit.</h3><p>Tell me about your budget, commute or what matters at home.</p></div>}
                {session?.messages.map((m, i) => <div key={i} className={m.role === "user" ? "user-message" : "assistant-message"}>
                  <span className="message-author">{m.role === "user" ? "You" : "PropMatch"}</span>
                  <BuyerMessage content={m.content} />
                </div>)}
                {pending && <div className="user-message"><span className="message-author">You</span><BuyerMessage content={pending} /></div>}
                {busy && pending && <div className="thinking"><LoaderCircle size={14} className="spin" />Finding your matches…</div>}
                <div ref={end} />
              </div>
            </TabsContent>
          </Tabs>
          <BuyerBriefForm
            key={`${session?.id ?? "loading"}:${JSON.stringify(session?.profile)}`}
            profile={session?.profile} message={text} onMessage={setText}
            onSubmit={(message, constraints) => run(message, session, constraints)}
            disabled={busy || !ready || !session} busy={busy}
            showConstraints={briefView === "requirements"}
            onShowConstraints={() => setBriefView("requirements")}
          />
        </section>
        <section className="recommendations">
          <div className="results-top">
            <div>
              <h2><span className="section-step">02</span> Matching homes</h2>
              <p>
                {hasResults
                  ? `${all.length} homes match your requirements`
                  : "Your results will appear here."}
              </p>
            </div>
            <div className="result-tools">
              {hasResults && (
                <button
                  className="button"
                  disabled={
                    busy ||
                    alternativeCount === 0 ||
                    !["waiting", "approved"].includes(session?.status ?? "")
                  }
                  title="Choose a different shortlist from current matches"
                  onClick={() => action("alternative")}
                >
                  {pendingAction === "alternative" && <LoaderCircle size={14} className="spin" />}
                  {pendingAction === "alternative" ? "Choosing alternatives…" : "Other options"}
                </button>
              )}
            </div>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <div className="results-toolbar">
              <TabsList className="result-tabs">
                <TabsTrigger value="recommendations">
                  Matches <span>{all.length}</span>
                </TabsTrigger>
                <TabsTrigger value="shortlist">
                  Shortlist <span>{session?.shortlist.length ?? 0}</span>
                </TabsTrigger>
              </TabsList>
              <button
                className="button compare-button"
                disabled={busy || compareIds.length < 2}
                onClick={compare}
              >
                <GitCompareArrows size={15} />
                Compare{compareIds.length > 0 ? ` (${compareIds.length})` : ""}
              </button>
            </div>
            <TabsContent value="recommendations" />
            <TabsContent value="shortlist" />
          </Tabs>
          <div className="cards-scroll">
            {!ready || (busy && pending) ? (
              <div
                className="loading-cards"
                aria-label="Loading recommendations"
              >
                {[0, 1].map((i) => (
                  <div className="skeleton-card" key={i}>
                    <Skeleton className="h-36 w-full" />
                    <Skeleton className="mt-5 h-6 w-3/4" />
                    <Skeleton className="mt-3 h-4 w-1/2" />
                    <Skeleton className="mt-6 h-20 w-full" />
                  </div>
                ))}
              </div>
            ) : session?.status === "no-match" ? (
              <div className="no-match empty">
                <span className="empty-symbol">
                  <SlidersHorizontal size={30} />
                </span>
                <h3>No listing currently satisfies all hard constraints.</h3>
                <p>
                  Your buyer’s limits are unchanged. Choose a constraint to
                  discuss, then submit the exact revised requirement.
                </p>
                <div className="conflict-list">
                  {Object.entries(
                    (
                      currentTrace.find(
                        (t) =>
                          t.stage === "HUMAN" &&
                          (t.data as { conflicts?: unknown })?.conflicts,
                      )?.data as { conflicts?: Record<string, number> }
                    )?.conflicts ?? {},
                  ).map(([key, count]) => (
                    <div key={key}>
                      <span>{key}</span>
                      <strong>{count} listings</strong>
                    </div>
                  ))}
                </div>
                <button
                  className="button primary"
                  onClick={() =>
                    setBriefView("requirements")
                  }
                >
                  Edit budget
                </button>
                <button
                  className="button"
                  onClick={() => setBriefView("requirements")}
                >
                  Edit MRT distance
                </button>
              </div>
            ) : !hasResults ? (
              <div className="empty">
                <div className="empty-photo">
                  <Image
                    unoptimized
                    width={1536}
                    height={1024}
                    src="/images/residence.png"
                    alt="Illustration of a fictional Singapore condominium"
                  />
                  <span>Illustrative property image</span>
                </div>
                <div className="empty-content">
                  <h3>
                    {session?.status === "clarification"
                      ? "Let’s make the brief a little clearer."
                      : session?.status === "error"
                        ? "The run stopped safely."
                        : "A place that fits your life."}
                  </h3>
                  <p>
                    {session?.status === "clarification" ||
                    session?.status === "error"
                      ? session.notice
                      : "Start with your requirements on the left. We’ll handle the matching."}
                  </p>
                </div>
              </div>
            ) : rows.length === 0 ? (
              <div className="empty empty-content">
                <h3>No properties in this view</h3>
                <p>
                  Add a verified recommendation to your shortlist, or request an
                  alternative.
                </p>
                <button
                  className="button"
                  onClick={() => setTab("recommendations")}
                >
                  View all matches
                </button>
              </div>
            ) : (
              <>
                {session?.status === "approved" && (
                  <div className="approved-banner">
                    <CheckCheck size={19} />
                    <div>
                      <strong>Shortlist approved</strong>
                      <span>Your decision is saved in the audit trail.</span>
                    </div>
                  </div>
                )}
                {rows.map((r, i) => (
                  <article className="property-card" key={r.property.id}>
                    <div className="property-visual">
                      <Image
                        unoptimized
                        width={1536}
                        height={1024}
                        src={r.property.image}
                        alt={`Illustrative condominium image for fictional ${r.property.name}`}
                        style={{
                          objectPosition: `${35 + (i % 3) * 15}% ${40 + (i % 3) * 10}%`,
                        }}
                      />
                      <div className="photo-top">
                        <span className="rank-label">
                          {tab === "shortlist"
                            ? "Shortlisted"
                            : i === 0
                            ? "Best match"
                            : `Match ${String(i + 1).padStart(2, "0")}`}
                        </span>
                        <button
                          className={
                            "bookmark " +
                            (session?.shortlist.includes(r.property.id)
                              ? "saved"
                              : "")
                          }
                          aria-label={`${session?.shortlist.includes(r.property.id) ? "Remove" : "Add"} ${r.property.name} ${session?.shortlist.includes(r.property.id) ? "from" : "to"} shortlist`}
                          onClick={() => action("shortlist", r.property.id)}
                          disabled={busy}
                        >
                          <Bookmark size={17} />
                        </button>
                      </div>
                      <span className="photo-caption">
                        Illustrative image · {r.property.isSynthetic ? "synthetic listing" : "source snapshot"}
                      </span>
                      <div className="match-score">
                        <strong>
                          {r.score}
                          <small>%</small>
                        </strong>
                        <span>fit score</span>
                      </div>
                    </div>
                    <div className="property-body">
                      <div className="property-name-row">
                        <div>
                          <h3>{r.property.name}</h3>
                          <p>
                            <MapPin size={13} />
                            {r.property.area} · {r.property.propertyType}
                          </p>
                        </div>
                        <div className="price">
                          <strong>{money(r.property.price)}</strong>
                          <span>
                            {r.property.bedrooms} beds · {r.property.bathrooms}{" "}
                            baths · {r.property.sizeSqft.toLocaleString()} sqft
                          </span>
                        </div>
                      </div>
                      <div className="fact-strip">
                        <span>
                          <TrainFront size={15} />
                          {r.property.mrtWalkingMinutes === null ? "MRT walk unverified" : `${r.property.mrtWalkingMinutes} min to ${r.property.nearestMrt}`}
                        </span>
                        {r.commutes.slice(0, 2).map((c) => (
                          <span key={c.destination}>
                            <Clock3 size={15} />
                            {c.destination} <strong>~{c.travelMinutes}m</strong>
                          </span>
                        ))}
                      </div>
                      <div className="constraint-pass"><ShieldCheck size={14} />Meets your requirements</div>
                      <div className="card-footer">
                        <label className="compare-check">
                          <Checkbox
                            checked={compareIds.includes(r.property.id)}
                            disabled={
                              busy ||
                              (!compareIds.includes(r.property.id) &&
                                compareIds.length >= 4)
                            }
                            onCheckedChange={(v) =>
                              setCompareIds((ids) =>
                                v === true
                                  ? [...ids, r.property.id]
                                  : ids.filter((id) => id !== r.property.id),
                              )
                            }
                          />
                          Compare
                        </label>
                        <button
                          onClick={() => action("reject", r.property.id)}
                          disabled={busy}
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => setDetail(r)}
                          className="detail-link"
                        >
                          View details <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </>
            )}
          </div>
          {hasResults &&
            !busy &&
            ["waiting", "approved"].includes(session?.status ?? "") && (
              <div className="approval-bar">
                <div>
                  <span
                    className={
                      session?.status === "approved"
                        ? "approved-dot"
                        : "approval-dot"
                    }
                  />
                  <strong>
                    {session?.status === "approved"
                      ? "Approved by property agent"
                      : "Ready for review"}
                  </strong>
                  <span>{session?.shortlist.length} selected</span>
                </div>
                <button
                  className="button primary"
                  disabled={
                    session?.status === "approved" || !session?.shortlist.length
                  }
                  onClick={() => action("approve")}
                >
                  <Check size={15} />
                  Approve shortlist
                </button>
              </div>
            )}
        </section>
      </main>
      <details className="workspace-tools">
        <summary><ShieldCheck size={15} /> Data sources & tools <span>Source checks, market context and demo controls</span></summary>
      {session && !session.profile.unknownFields.length && !["empty", "clarification"].includes(session.status) && (
        <div className="refresh-bar">
          <button className="button" disabled={busy} onClick={() => refreshSources()}><RotateCcw size={14} /> Recheck sources</button>
          <label><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> Watch while this page is open · every 30s</label>
          {session.dataMode !== "file" && session.shortlist.length > 0 && <>
            <button className="button ghost" disabled={busy} onClick={() => refreshSources("withdraw")}>Simulate top listing withdrawn</button>
            <button className="button ghost" disabled={busy} onClick={() => refreshSources("raise-price")}>Simulate price above budget</button>
          </>}
          <small>{lastChecked ? `Checked ${new Date(lastChecked).toLocaleTimeString("en-SG")}` : "Refresh preserves the buyer brief; changed evidence requires a new approval."}</small>
        </div>
      )}
      {session?.marketEvidence && (
        <section className="market-panel" aria-label="Official HDB historical evidence">
          <div><span className="eyebrow">Official public data · historical transactions</span>
            <h2>HDB market reference</h2>
            <p>Historical HDB sales only. Current availability and condo / landed values are outside this dataset.</p>
            <p>{session.marketEvidence.count.toLocaleString()} records match the stated budget, area and size filters · {session.marketEvidence.months.slice().sort().join(" / ")}</p>
          </div>
          <strong className="market-median">{session.marketEvidence.medianPrice === null ? "No matching records" : money(session.marketEvidence.medianPrice)}<small>Median of this filtered sample</small></strong>
          <details><summary>Inspect source records and limitations</summary>
            <p>{session.marketEvidence.filterSummary}</p><p>{session.marketEvidence.boundary}</p>
            <div className="market-table-wrap"><table><thead><tr><th>Record</th><th>Month / town</th><th>Flat type / floor area</th><th>Historical price</th></tr></thead><tbody>
              {session.marketEvidence.examples.map((r) => <tr key={r.id}><td>#{r.id}<br />{r.address}</td><td>{r.month}<br />{r.town}</td><td>{r.flatType} · {r.floorAreaSqm} m²</td><td>{money(r.resalePrice)}</td></tr>)}
            </tbody></table></div>
            <a href={session.marketEvidence.sourceUrl} target="_blank" rel="noreferrer">Open HDB dataset on data.gov.sg ↗</a>
            <p className="micro">Snapshot retrieved {new Date(session.marketEvidence.retrievedAt).toLocaleString("en-SG")}. Source records are evidence for research, not homes confirmed for sale.</p>
          </details>
        </section>
      )}
        <Link href="/debug">Open full audit trail <ArrowUpRight size={14} /></Link>
      </details>
      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="activity-dialog"><DialogHeader><DialogTitle>Activity</DialogTitle><DialogDescription>Evidence checks and recommendation history.</DialogDescription></DialogHeader>
        <div className="activity activity-dialog-body">
          <div className="panel-title">
            <div>
              <Activity size={17} />
              <h2>Agent activity</h2>
            </div>
            <span className="live-badge">{busy ? "Running" : "Trace"}</span>
          </div>
          <div className="agent-status">
            <span className={"status-icon " + (busy ? "running" : "")}>
              <Sparkles size={18} />
            </span>
            <div>
              <strong>{activeStatus}</strong>
              <span>Single orchestrator · typed tools</span>
            </div>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
          </div>
          <div className="trace-scroll">
            {!currentTrace.length ? (
              <>
                <div className="trace-empty">
                  <h3>A clear record, step by step.</h3>
                  <p>
                    Follow the agent as it understands, retrieves, checks and
                    ranks.
                  </p>
                </div>
                <div className="workflow-preview">
                  {[
                    ["01", "Understand", "Extract & update the buyer profile"],
                    ["02", "Plan & retrieve", "Select tools for this brief"],
                    [
                      "03",
                      "Verify & rank",
                      "Enforce limits, score the evidence",
                    ],
                    ["04", "Human review", "Your approval. Your decision."],
                  ].map(([n, title, copy]) => (
                    <div key={n}>
                      <span>{n}</span>
                      <div>
                        <strong>{title}</strong>
                        <p>{copy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="trace-list">
                {grouped.map((t) => (
                  <details
                    key={t.id}
                    className={"trace-item trace-" + t.stage.toLowerCase()}
                  >
                    <summary>
                      <span className="trace-node">
                        {t.stage === "TOOL" ? (
                          <Code2 size={12} />
                        ) : t.stage === "HUMAN" ? (
                          <Users size={12} />
                        ) : t.stage === "ERROR" || t.stage === "GUARDRAIL" ? (
                          <TriangleAlert size={12} />
                        ) : (
                          <Check size={12} />
                        )}
                      </span>
                      <div>
                        <div className="trace-meta">
                          <strong>
                            {stageLabel(t.stage)}
                          </strong>
                          <time>
                            {new Date(t.timestamp).toLocaleTimeString("en-SG", {
                              hour12: false,
                            })}
                          </time>
                        </div>
                        <p>
                          {t.summary}
                          {((t.data as { calls?: number })?.calls ?? 0) > 1 && (
                            <span className="call-count">
                              {(t.data as { calls: number }).calls} calls
                            </span>
                          )}
                        </p>
                      </div>
                    </summary>
                    {t.data !== undefined && (
                      <pre>{JSON.stringify(t.data, null, 2)}</pre>
                    )}
                  </details>
                ))}
              </div>
            )}
          </div>
          <div className="trace-footer">
            <ShieldCheck size={15} />
            <span>
              Action summaries only.
              <br />
              No private reasoning.
            </span>
            <Link href="/debug" aria-label="Open structured trace">
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="detail-dialog">
          <DialogHeader>
            <DialogTitle>{detail?.property.name}</DialogTitle>
            <DialogDescription>
              Evidence, match components and trade-offs. Check source type and verification times.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <>
              <div className="detail-hero">
                <strong>{money(detail.property.price)}</strong>
                <span>{detail.score}% fit score</span>
              </div>
              <div className="score-breakdown">
                {Object.entries(detail.components)
                  .filter(([k]) => detail.weights[k] > 0)
                  .map(([k, v]) => (
                    <div key={k}>
                      <span>
                        {k}
                        <small>weight {detail.weights[k]}</small>
                      </span>
                      <div className="score-track">
                        <span style={{ width: v + "%" }} />
                      </div>
                      <strong>{v}%</strong>
                    </div>
                  ))}
              </div>
              <p className="micro">
                Match score = weighted mean of the displayed components, rounded
                to a whole number. It is not a probability or a model confidence
                estimate.
              </p>
              <h4>Why recommended</h4>
              <ul>
                {detail.why.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <h4>Trade-offs & verification</h4>
              <ul>
                {detail.tradeoffs.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <h4>Source evidence</h4>
              {detail.property.sourceUrl && <a href={detail.property.sourceUrl} target="_blank" rel="noreferrer">Open original listing source ↗</a>}
              <div className="evidence-list">
                {detail.evidence.map((e) => (
                  <code key={e}>{e}</code>
                ))}
              </div>
              <div className="detail-actions">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    action("override", detail.property.id);
                    setDetail(null);
                  }}
                >
                  <ArrowUp size={15} />
                  Move to first · human override
                </button>
                <button
                  className="button primary"
                  onClick={() => {
                    action("shortlist", detail.property.id);
                    setDetail(null);
                  }}
                  disabled={busy}
                >
                  <Bookmark size={15} />
                  Toggle shortlist
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!comparison}
        onOpenChange={(o) => !o && setComparison(null)}
      >
        <DialogContent className="compare-dialog">
          <DialogHeader>
            <DialogTitle>Compare the full picture</DialogTitle>
            <DialogDescription>
              Same buyer, same rules. A side-by-side view of verified
              candidates.
            </DialogDescription>
          </DialogHeader>
          {comparison && p && (
            <PropertyComparison comparison={comparison} profile={p} />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="detail-dialog">
          <DialogHeader>
            <DialogTitle>
              Buyer profile · version {session?.version}
            </DialogTitle>
            <DialogDescription>
              Validated structured memory, carried across conversation turns.
            </DialogDescription>
          </DialogHeader>
          <pre className="profile-json">{JSON.stringify(p, null, 2)}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
