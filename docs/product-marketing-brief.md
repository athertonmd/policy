# Product Marketing Brief: Travel Policy Platform

## From: Product Management
## To: Product Marketing
## Date: May 2026
## Product: mytravelprofile.info — Corporate Travel Policy & Approvals Platform

---

## Executive Summary

The Travel Policy Platform is a standalone, API-first SaaS product that acts as the **policy intelligence and governance layer** between corporate travellers, booking tools, finance teams, and TMC operations. It is not a booking engine — it is the control plane that ensures every trip is compliant, approved, and auditable across any booking channel.

**Positioning:** "The Stripe for Corporate Travel Policy and Approvals."

---

## The Problem We Solve

Corporate travel programmes today face a structural gap:

- **Policy fragmentation** — Rules are scattered across booking tools, spreadsheets, and email chains
- **Inconsistent enforcement** — Different booking channels apply different rules (or none at all)
- **Manual approval bottlenecks** — Managers approve via email with no SLA tracking or escalation
- **Compliance blind spots** — Finance discovers out-of-policy spend weeks after the trip
- **No cross-system visibility** — Policy logic is locked inside individual OBTs, invisible to other tools

Existing solutions bundle policy inside broader travel-and-expense suites. Buyers who use multiple booking tools, TMCs, or payment systems have no way to enforce consistent policy across all of them.

---

## What the Platform Does

The Travel Policy Platform provides **portable, real-time policy decisioning** that any booking tool, TMC desktop, or payment system can call. It answers one question consistently across all channels:

> "Is this traveller allowed to book this trip, through this payment method, under which approval path, and with what audit outcome?"

---

## Target Market

### Primary
- **Mid-market corporates** (500–5,000 employees) with multi-entity governance complexity
- **Travel Management Companies (TMCs)** needing configurable policy/approval logic across client programmes
- **Travel technology providers** wanting to embed policy controls without building them

### Secondary
- Expense management platforms, HR/workforce platforms, procurement teams

### Geographic Focus
- UK, Europe, North America, Australia/New Zealand

---

## Core Features

### 1. Policy Engine
**What it does:** Evaluates trip requests against configurable rules in real-time (<200ms).

**Key capabilities:**
- Customer-facing policy DSL (human-readable rule language)
- Visual drag-and-drop policy builder (no code required)
- Rules by: traveller seniority, department, cost centre, region, trip type, supplier, cabin class, lead time, carbon footprint, booking value
- Hard rules (block), soft guidance (warn), and optimisation hints (suggest alternatives)
- Policy simulation — test changes against historical data before activation
- Version history with one-click rollback

**Marketing angle:** "Write policy rules in plain English. Test them against real data. Deploy without downtime."

### 2. Approval Workflows
**What it does:** Routes trips requiring approval through configurable multi-stage workflows with SLA enforcement.

**Key capabilities:**
- Single-stage, multi-stage sequential, parallel (quorum), and conditional branching
- Auto-approval for compliant trips (no human needed)
- Escalation on SLA breach (configurable timeouts)
- Delegation for out-of-office approvers
- Email-based approval (approve/reject directly from inbox)
- Mobile-first approval experience

**Marketing angle:** "Approvals that happen in minutes, not days. From any device, any inbox."

### 3. Booking Ingestion
**What it does:** Receives bookings from any external system via webhooks and evaluates them against policy.

**Key capabilities:**
- Pluggable connector framework (OBT, GDS, TMC, custom)
- Configurable payload mapping per integration source
- HMAC-SHA256 signature validation
- Idempotent processing with retry and dead-letter queues
- Integration health monitoring dashboard

**Marketing angle:** "Connect any booking tool in days, not months. One policy across all channels."

### 4. Reporting & Analytics
**What it does:** Provides real-time visibility into travel spend, compliance, carbon, and approval performance.

**Reports include:**
- Financial spend by department, supplier, trip type, time period
- Carbon emissions with target tracking and offset monitoring
- Approval analytics with bottleneck identification
- Budget utilisation with threshold alerts
- Policy compliance rates with trend analysis
- Policy effectiveness (most/least triggered rules, override frequency)

**Marketing angle:** "Know your compliance rate right now, not at quarter-end."

### 5. Budget Controls
**What it does:** Tracks travel budgets in real-time and triggers finance approval when limits are approached.

**Key capabilities:**
- Budgets at tenant, department, cost centre, and project levels
- Monthly, quarterly, and annual periods
- Warning threshold alerts (default 80%)
- Automatic finance approval trigger at 100%
- Near-real-time utilisation updates (within 60 seconds of approval)

**Marketing angle:** "Proactive budget control, not reactive surprise."

### 6. AI-Powered Insights
**What it does:** Uses Amazon Bedrock (Claude) to provide intelligent policy recommendations and natural language queries.

**Key capabilities:**
- Policy optimisation recommendations (rules with high override rates, unused rules, cost-saving opportunities)
- Approval prediction scoring (will this trip be approved?)
- Spend anomaly detection (unusual patterns flagged automatically)
- Natural language queries ("What's our compliance rate this quarter?")

**Marketing angle:** "AI that makes your travel programme smarter every day."

### 7. Duty of Care
**What it does:** Feeds traveller itinerary data to duty-of-care systems and handles disruption alerts.

**Key capabilities:**
- Automatic itinerary publishing on approval (within 60 seconds)
- Updates on modification/cancellation
- Disruption alert escalation to travel risk managers
- Traveller location dashboard

**Marketing angle:** "Know where your people are. React in seconds, not hours."

### 8. Exception Handling & Overrides
**What it does:** Provides a structured, auditable process for legitimate policy exceptions.

**Key capabilities:**
- Structured justification (reason category + free text)
- Dedicated override approval workflow
- Frequency limits per traveller/department
- Full audit trail with approver identity and timestamp
- Override dashboard with filtering and analytics

**Marketing angle:** "Flexibility when you need it. Accountability always."

---

## Key Workflows

### Workflow 1: Trip Policy Check (Search Time)
```
Booking Tool → Policy Decision API → Returns: allowed cabins, price caps, preferred suppliers
```
The booking tool calls the platform at search time to pre-filter results. Travellers only see compliant options.

### Workflow 2: Pre-Booking Approval
```
Traveller selects trip → Policy evaluates → Compliant? Auto-approve → Non-compliant? Route to approver → Approver acts via email/mobile → Booking proceeds or is rejected
```

### Workflow 3: Post-Booking Compliance
```
Booking confirmed → Webhook received → Policy evaluated → Compliant? Log and report → Non-compliant? Flag for review, update compliance metrics
```

### Workflow 4: Budget Breach
```
Trip approved → Budget utilisation updated → Threshold crossed → Alert sent to budget owner → Next trip triggers finance approval requirement
```

### Workflow 5: Policy Change
```
Admin writes new rule in DSL → Simulates against 90 days of history → Reviews impact report → Activates → All future evaluations use new rule (no restart needed)
```

---

## Differentiation

| Capability | Incumbents (Concur, Navan, etc.) | Our Platform |
|-----------|----------------------------------|--------------|
| Policy scope | Embedded in their booking tool only | Works across ANY booking tool |
| Integration | Closed ecosystem | API-first, pluggable connectors |
| Policy language | GUI-only, limited | DSL + visual builder + simulation |
| Deployment | Months of implementation | Days to first policy evaluation |
| AI | Limited or none | Bedrock-powered recommendations |
| Neutrality | Vendor lock-in | Booking-tool agnostic |
| Approval channels | In-app only | Email, mobile, Slack, Teams |

---

## Technical Highlights (for technical buyers)

- **API-first:** REST APIs with OpenAPI 3.0 documentation, webhook subscriptions, OAuth 2.0
- **Multi-tenant SaaS:** Schema-per-tenant isolation, tenant-specific encryption keys
- **Enterprise security:** SAML/OIDC SSO, SCIM provisioning, Cedar RBAC, MFA, WAF
- **GDPR compliant:** Data residency (UK/EU/US/ANZ), DSAR export, right to erasure, configurable retention
- **Immutable audit:** SHA-256 hash chain, 7-year retention, tamper-evident verification
- **Scalable:** 1,000+ policy decisions/second, 10,000+ concurrent workflows, auto-scaling
- **99.9% SLA target**

---

## Commercial Model

Hybrid SaaS pricing aligned with value delivered:

- **Platform fee** — base access to the control plane
- **Active traveller bands** — scales with programme size
- **Legal entity complexity** — additional entities/policies
- **Evaluated trip volume** — usage-based above included threshold
- **OEM/white-label** — for TMCs and technology partners

---

## Key Metrics to Highlight

- Policy decision latency: <200ms (p95)
- Approval notification delivery: <60 seconds
- Budget utilisation update: <60 seconds after approval
- Simulation: evaluate 1,000+ historical trips in seconds
- Onboarding: first policy evaluation within days, not months

---

## Suggested Messaging Themes

1. **"One policy, every channel"** — Consistent enforcement regardless of where the booking happens
2. **"Approvals at the speed of travel"** — Mobile-first, email-based, SLA-tracked
3. **"Compliance you can see"** — Real-time dashboards, not quarterly surprises
4. **"Policy that learns"** — AI recommendations that improve over time
5. **"Connect, don't replace"** — Works with existing booking tools, not against them

---

## Appendix: Feature Availability by Phase

| Phase | Features | Status |
|-------|----------|--------|
| Phase 1 (MVP) | Policy engine, approvals, booking ingestion, notifications, audit, profiles, overrides | ✅ Built |
| Phase 2 | Budgets, reporting, carbon, duty of care, GDPR, monitoring, TMC dashboard, integrations, compliance, scalability | ✅ Built |
| Phase 3 | AI recommendations, full frontend application | ✅ Built |

---

*Document prepared by Product Management. For questions, contact the product team.*
