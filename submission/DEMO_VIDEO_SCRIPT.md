# PropMatch — three-minute core demo segment

The briefing says video “duration: 30mins”; confirm whether this is a limit or required length. This is only the core demo segment, not the complete submission video. Use the model and data labels visible in the product; do not hide them.

**0:00–0:20 — Problem.** “Property agents reconcile a buyer's budget, travel needs and lifestyle, then keep the shortlist valid as requirements and listings change. PropMatch keeps the buyer brief, evidence and human decision together.”

**0:20–0:55 — Actual model and memory.** Click Load Demo Scenario. “This is a real model call through the provider shown on screen. It extracts the couple's budget, bedrooms, two destinations and preferences into validated state. The trace records the actual tools and model token usage. Hard limits are checked by code.”

**0:55–1:15 — Evidence boundary.** Expand HDB market reference. “We connected 7,295 official HDB historical transaction records, with source IDs and retrieval metadata. They provide historical research context. They do not prove a unit is for sale today. Listing inventory and transport examples are explicitly simulated.”

**1:15–1:40 — Adapt.** Click the S$1.7M / MRT-five-minute update and open buyer state. “The budget and walking limit change. The two destinations and lifestyle preferences remain. The agent retrieves and filters again, presenting a new shortlist with trade-offs.”

**1:40–2:15 — A changing world.** Approve the shortlist, then click Simulate top listing withdrawn. “This injects a simulated source event into this session. The system removes the unavailable candidate, revokes the previous approval, finds a replacement and records what changed. It reuses the saved brief without an unnecessary model call. The agent must approve the revised shortlist.”

**2:15–2:40 — Failure handled correctly.** Enter `Budget SGD 100k, 4 bedrooms.` “When there is no match, the system asks which requirement can change. It does not increase the budget on its own.”

**2:40–3:00 — Evidence and next step.** “We passed 47 automated tests, 15 deterministic evaluation cases and eight small live-mode scenarios, including Chinese updates. These results show the tested behaviors, not market accuracy or measured productivity. Our next pilot needs a current listing feed and measured agent feedback; a source adapter is already in place.”

Use the actual selected provider label and its own saved evaluation report. The organiser gateway and direct AWS Converse use different credentials and protocols. Do not show secrets, private account pages or fabricated deployment evidence. A narration script is not a recorded video.
