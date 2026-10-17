# Vargly: Codebase Audit & Phased Remediation Plan

**Audit date:** 2026-09-23 · **Baseline commit:** `ffd331c` (main)

At the baseline, `tsc --noEmit` is clean and all 162 unit tests pass. The module layout, dependency injection and adapter boundaries are consistent. The problems are in runtime behaviour: several guarantees described in `IMPLEMENTATION_PLAN.md` and the ADD are not enforced by the code.

This document lists every finding, ranks it, and assigns it to a remediation phase. Each phase has exit criteria that must pass before the next phase starts, following the phase-gate rule in `.agents/AGENTS.md`.

Status legend: ✅ fixed · 🚧 in progress · ⬜ not started

> **Scope decision (2026-10-17):** Razorpay is used only for Vargly subscriptions and AI-credit purchases (the `billing` module). Coaching fees are recorded by the owner marking installments paid in the dashboard. The fee payment-link endpoint and the public `/fees/webhook` route were removed, so findings and phase items above that mention fee webhooks (C6, C8 and the Phase 3 fee-webhook bullets) describe code that no longer exists. Manual payments keep the row lock, exact decimals, gap-free receipts and the optional `transactionRef` duplicate check.

> **Operations console (2026-10-17):** dead events and unapplied subscription payments now have an admin console (`/app/admin`, `SUPER_ADMIN` only) and an email alert (`OPS_ALERT_EMAIL`); payments that cannot be applied are stored as `NEEDS_REVIEW` instead of living only in logs. This closes the Phase 3/4 follow-ups about `RECONCILE` payments and `DEAD` events being visible only in logs. Found on the way: `user_roles.coaching_id` was NOT NULL while a `SUPER_ADMIN` has no coaching, so the role could never be assigned; it is nullable now. See [RUNBOOK.md](RUNBOOK.md) §4.

> **Follow-ups closed (2026-10-17):** (1) tests no longer pick up real provider keys from `apps/api/.env` (Prisma loads that file into `process.env`): `vitest.config.ts` blanks them first and `test-isolation.spec.ts` guards it; (2) `GET /batches` now lists only a teacher's own batches (students and parents already did), and marks can only be uploaded for students enrolled in the test's batch (`STUDENT_NOT_IN_BATCH`); (3) a password change or reset ends the user's earlier access tokens at once (`users.tokens_valid_after`, checked against the token's millisecond `issuedAtMs` claim) instead of leaving them valid for up to 15 minutes. These remove the matching items from the Phase 2 "known limitations".

> **Paper studio (2026-10-18):** AI-generated or uploaded question papers shared with a batch by link (see [RUNBOOK.md](RUNBOOK.md) §7). Found on the way: `batch:<id>:students` messaged only the students' own numbers, so homework alerts reached nobody when students had no phone; homework alerts now use `batch:<id>:contacts` (all linked parents plus the student, each phone once).

---

## 1. Findings

### 🔴 Critical

| ID | Finding | Location | Phase | Status |
|----|---------|----------|-------|--------|
| C1 | About 75 async controller handlers never forward rejected promises. On Express 4 with Node 22 and no `unhandledRejection` handler, one failed login (`AppError` thrown) crashes the process. | `modules/*/**.controller.ts`, `main.ts` | 0 | ✅ |
| C2 | `POST /api/v1/whatsapp-assistant/inbound` has no authentication and takes the sender phone from the request body. Anyone can read any parent's fee and attendance data and spend the coaching's AI credits. | `whatsapp-assistant.routes.ts` | 0 | ✅ |
| C3 | The RS256 JWT private key is committed (`apps/api/.keys/`, first added in `95c30cd`). Anyone with repo access can forge tokens. | `apps/api/.keys/` | 0 | ✅ (history purge pending) |
| C4 | OTP codes and password-reset tokens are logged in plaintext in every environment. Email delivery is not implemented, so logs are the only place they go. `send-otp` / `verify-otp` are public. OTPs have no attempt limit. | `otp.service.ts`, `auth.service.ts` | 0 | ✅ |
| C5 | Tenant isolation fails open. With no `coachingId` in context (workers, cron jobs, webhooks, public routes), the Prisma extension applies no tenant filter. The RLS SQL is never applied and `withTenantRlsContext` is unused (and interpolates SQL). `findUnique` rewriting drops `select`/`include`. `aggregate`, `groupBy`, `*OrThrow` and the update branch of `upsert` are unscoped. Knowledge-base, `AiUsageLog` and `Role` models are not tenant-registered. The "cross-tenant isolation" test runs against a mocked client, not a database. | `tenant-prisma.extension.ts`, `rls-init.sql` | 1 | ✅ |
| C6 | Webhooks: the WhatsApp HMAC check passes everything when `WHATSAPP_APP_SECRET` is unset. The Razorpay fee and billing webhooks are not idempotent, so provider retries double-record payments, upgrades and credit purchases. | `notification.controller.ts`, `fee.service.ts`, `billing.service.ts` | 0 (fail-closed) / 3 (idempotency) | ✅ |

| C7 | Found in Phase 3: `POST /billing/upgrade`, `POST /billing/credits/purchase` and `POST /ai/wallet/add-credits` granted paid plans and AI credits with no payment, and `createOrder` took the price from the client. Any owner could self-upgrade to Enterprise and mint AI credits. | `billing.*`, `ai.*` | 3 | ✅ |
| C8 | Found in Phase 3: fee webhook errors were swallowed and acknowledged with 200, so Razorpay never retried and the payment was lost. | `fee.service.ts` | 3 | ✅ |

### 🟠 High

| ID | Finding | Phase | Status |
|----|---------|-------|--------|
| H1 | Fee payments: installment balance is read outside a row lock, and money is summed as JS `Number`. Receipt numbers are `date + random(4)` and globally unique, so they collide and are not sequential per coaching. | 3 | ✅ |
| H2 | The login lockout key trusts the client-supplied `X-Forwarded-For`. `trust proxy` is not set. No rate limiting exists on auth, OTP, registration or AI. | 0 | ✅ |
| H3 | `requireBatchAccess` only checks `batchId` from params or body. `PUT /homework/:id`, `POST /tests/:id/marks`, `GET /attendance/sessions/:id` and `GET /tests/student/:id` bypass it. | 2 | ✅ |
| H4 | Permissions are frozen in the JWT, so revocation waits for token expiry. `features` is always `[]`. `requireFeature` is only on the AI and risk-engine routes, so an expired subscription doesn't block the rest of the product. | 2 | ✅ |
| H5 | Reset tokens are HS256 with the access secret and reusable. `verifyEmail` accepts any such token and never persists verification. | 2 | ✅ |
| H6 | The in-process event bus is not durable. The standalone worker process registers **zero** subscribers, so events it publishes (e.g. fee reminders) are dropped. | 4 | ✅ |
| H7 | Fee reminders re-send daily to every overdue installment with no limit, use UTC instead of the coaching's timezone, and load all tenants' installments into memory in one query. | 4 | ✅ |
| H8 | WhatsApp assistant: conversation state lives in an in-process `Map`. Parents are resolved by `phone contains last-10-digits` across all tenants. No WABA `phone_number_id` → coaching mapping exists. Dedupe via `jobId` is defeated by `removeOnComplete: true`. | 4 | ✅ |
| H9 | `SmtpEmailAdapter` never sends mail: it returns `SENT` with a fabricated ID even when SMTP is configured. | 5 | ✅ |

### 🟡 Medium

| ID | Finding | Phase |
|----|---------|-------|
| M1 | No Prisma migrations (`db push` only). RLS, pgvector and a vector (HNSW) index are not part of deploys. | 1 ✅ |
| M2 | Schema gaps: `Salary` has no teacher FK and no unique `(teacher, month, year)`. `FeePlan`, `Salary` and `Expense` lack a `Coaching` FK. No billing invoice/payment table. `AiUsageLog` has no `coachingId`. Nothing enforces a single active subscription. | 3 🚧 (FKs, salary, billing tables done; usage-log coachingId and single active subscription open) |
| M3 | Insecure defaults are accepted in production. Without `JWT_*_KEY`, each pod generates its own key, so multi-replica deploys return random 401s. | 0 |
| M4 | Workers start inside the API process as well as in the worker container. | 4 ✅ |
| M5 | Gemini 768-d embeddings are zero-padded to 1536. Switching provider silently corrupts retrieval. | 5 ✅ |
| M6 | Hard-coded default AI model IDs are outdated. | 5 ✅ |
| M7 | 10 MB global JSON limit, base64 uploads, no file-type or size validation. | 2 ✅ |
| M8 | 15 `*.cron.ts` files are stubs that only log. | 5 ✅ |

### ⚙️ Infra, CI & frontend

| ID | Finding | Phase |
|----|---------|-------|
| I1 | `docker-compose.yml` sets `JWT_SECRET` (not a config key) with `NODE_ENV=production`, so env validation fails and the API and worker containers don't boot. | 6 ✅ |
| I2 | k8s: `:latest` image, no probes or resource limits, no worker deployment, no migration job. | 6 ✅ |
| I3 | CI: no ESLint config, no DB-backed tests, no Docker build, no dependency audit or secret scanning. | 6 ✅ |
| I4 | No README or runbook. | 6 ✅ |
| I5 | Web is a single static dashboard with hard-coded data. Mobile is one `App.tsx`. | 7 |

---

## 2. Phases

### Phase 0: Stop the bleeding
- [x] Central async error forwarding for every router, plus process-level `unhandledRejection` / `uncaughtException` handlers (C1)
- [x] Remove the committed JWT keypair from the repo, ignore `.keys/`, refuse key generation in production (C3, M3)
- [x] Stop logging OTPs and reset tokens outside development. Limit OTP verification attempts (C4)
- [x] Remove the unauthenticated WhatsApp inbound route (C2)
- [x] Fail-closed webhook signature checks in production (C6, part 1)
- [x] `TRUST_PROXY` config, trusted client IP for lockout, Redis-backed rate limiting on public auth routes (H2)
- [x] Reject insecure default secrets in production (M3)
- [ ] **Manual:** rotate any environment that ever used the committed key, and purge `apps/api/.keys` from git history (requires a force-push; coordinate with all clones)

**Exit criteria:** a failed login returns 401 and the process stays up; the inbound route returns 404; the production config refuses default secrets; all unit tests pass.

### Phase 1: Tenant isolation ✅
- [x] Fail-closed tenant extension: tenant-scoped queries with no tenant throw `TENANT_CONTEXT_REQUIRED`; explicit `RequestContextService.runForTenant()` / `runAsSystem()` contexts
- [x] Every Prisma operation scoped (incl. `aggregate`, `groupBy`, `*OrThrow`, `upsert`); writes naming another coaching are refused; `findUnique` keeps `select`/`include`; knowledge-base models registered
- [x] Prisma migrations introduced (baseline + RLS). RLS policies on all 29 tenant tables, `FORCE`d, set per transaction with parameterised `set_config`; interactive transactions keep atomicity (tenant set once on the transaction's connection); HNSW index for RAG search
- [x] Startup refuses (production) or warns (dev) when the DB role is a superuser/BYPASSRLS, since RLS would be skipped; `infra/docker/postgres/create-app-role.sql` creates the application role
- [x] Entrypoints declare their tenant: queue jobs (from `job.data.coachingId`), event subscribers (from `event.coachingId`), payment webhooks (signed notes), WhatsApp inbound (after parent lookup); identity lookup at login, coaching provisioning, delivery receipts and schedulers run as system
- [x] Real-database tests: 14-case isolation suite (both layers, transactions, role check) and an HTTP end-to-end suite; CI `integration` job with Postgres + Redis

**Exit:** met. The isolation suite passes against a real database, and runs in CI.

**Upgrading an existing database** (created with `prisma db push`), as the schema owner:
1. `prisma migrate resolve --applied 20260923000000_init` (mark the baseline as already present)
2. `pnpm prisma:migrate:deploy` (applies RLS and the HNSW index)
3. `psql "$OWNER_URL" -v app_password=... -f infra/docker/postgres/create-app-role.sql`, then point the API's `DATABASE_URL` at `vargly_app`

**Known limitations, tracked for later phases:**
- Relation `connect` to another tenant's row by id is not blocked by RLS (the policy checks the written row, not the referenced one); services must validate referenced ids (Phase 2)
- The WhatsApp parent lookup still matches phone numbers across all tenants (H8, Phase 4)
- Each statement outside an interactive transaction now runs as a small transaction (`set_config` + statement); measure latency under load before scaling (Phase 6)
- `app.rls_bypass` is a session setting: code able to run arbitrary SQL as the app role can set it. RLS guards against missing filters in application code, not against SQL injection

### Phase 2: AuthN / AuthZ correctness ✅
- [x] Teachers confined to their batches on every route that identifies a record: homework, tests and marks, attendance sessions, students, timeline, AI student/teacher endpoints. A teacher request whose batch cannot be determined is refused (was: allowed)
- [x] Roles and permissions re-read from the database on each request (60 s Redis cache, dropped on role assignment and teacher (de)activation); deactivated users get 401 and deactivated teachers lose the teaching role immediately
- [x] One subscription rule (`evaluateSubscriptionAccess`) applied to 20 business modules; lapsed trials and periods get 402 even when the status column was not updated. Auth, coaching profile and billing stay open so a lapsed coaching can pay. Subscription cache is now invalidated on upgrade and expiry (was never invalidated)
- [x] Password reset and email verification use random single-use tokens stored as SHA-256 hashes (`auth_action_tokens`), consumed atomically; email verification is recorded (`users.email_verified_at`); registration issues a verification token. Reset passwords now need 8+ characters, matching registration
- [x] Uploads: per-category type and size limits, content signature check, SVG/HTML refused, file names sanitised; default JSON body limit lowered from 10 MB to 1 MB (uploads 15 MB, bulk import 10 MB)
- [x] Same-tenant references: 23 database triggers reject any link to another coaching's record (Phase 1 leftover)
- [x] Five permission codes used by routes were never seeded (`dashboard:*`, `audit:read`, `ai:manage_credits`, `ai:view_logs`); teachers now receive `dashboard:teacher`
- [x] Prisma not-found / duplicate / invalid-reference errors now return 404 / 409 / 400 instead of 500

**Bugs found and fixed along the way:** batch-wide notifications (homework and test alerts) always failed, and `GET /tests/student/:id` always returned 500. Both queries filtered on a `deletedAt` column those tables do not have.

**Exit:** met. Tests prove a teacher gets 403 on another batch's homework, tests and students; a deactivated teacher loses access on the next request with the same token; a lapsed trial gets 402 while sign-in and billing work; a reset link works once, including under 8 concurrent attempts.

**Upgrading an existing database:** `pnpm prisma:migrate:deploy`, then re-run `pnpm --filter @vargly/api db:seed:rbac` to add the new permissions.

**Known limitations, tracked for later phases:**
- List endpoints (`GET /students`, `/batches`, `/parents`) still return coaching-wide lists to teachers; per-batch filtering belongs in the services
- Marks upload checks the test's batch, but not that each student in the payload belongs to it
- After a password reset, existing access tokens keep working until they expire (up to 15 min); refresh tokens are revoked
- Reset and verification tokens are only printed on a development terminal until email delivery exists (Phase 5)
- Presigned (direct-to-Cloudinary) uploads are checked by declared type only, at the time the URL is issued
- Knowledge-base sync calls the real Gemini API from tests when a key is present in `.env` (Phase 6: stub external providers in tests)

### Phase 3: Money & data integrity ✅
- [x] Fee payments lock the installment row and validate the balance inside the transaction; exact decimal arithmetic throughout (plans, discounts, payments, balances); amounts validated as whole paise
- [x] Gap-free receipt numbers per coaching and invoice numbers for Vargly, per Indian financial year (`RCT/2026-27/00001`, `INV/2026-27/00001`), issued inside the payment transaction (`document_sequences`)
- [x] A gateway payment id is recorded once per coaching (unique `(coachingId, transactionRef)`): webhook retries and the paired `payment.captured` / `payment_link.paid` events collapse to one payment. Unique receipt numbers are now per coaching instead of global
- [x] Fee webhooks: transient failures return 500 so Razorpay retries; payments that cannot be applied (e.g. installment already paid) are logged as `RECONCILE` instead of being silently dropped
- [x] Vargly billing reworked: the three free-grant endpoints are removed; `POST /billing/orders` prices plans and credit packs on the server and records a `billing_payments` row; the webhook settles it at most once, only for the recorded amount, and applies plan, period and credits in one transaction. ₹0 plans (the trial plan) cannot be bought. AI credit price is configurable (`AI_CREDIT_PRICE_PAISE`, default ₹1)
- [x] AI credits are reserved atomically before a provider call and refunded if it fails; concurrent requests cannot overdraw a wallet. Removed dormant event subscribers that would have double-credited purchases
- [x] Salaries: one per teacher per month (unique constraint, 409 on repeat); paying is a conditional update, so concurrent payments succeed once. Waivers race safely with payments
- [x] Missing foreign keys added (`FeePlan`, `Salary`, `Expense` to `Coaching`; `Salary` to `Teacher`)

**Bugs found and fixed along the way:** the expiry scheduler checked `trialEndsAt` for paid subscriptions and would have expired paying customers right after they upgraded; waiving an installment with remarks always failed (missing column); monthly and annual cycles used different names in the two billing paths, so annual orders never matched a price.

**Exit:** met. Real-database tests prove: 10 concurrent payments on one installment record exactly 5 of 1,000 with an exact total; receipts are gap-free per coaching under concurrency; one gateway payment delivered 6 times is recorded once; a billing order settled by 6 concurrent webhooks grants credits once; a wrong amount grants nothing; salaries pay once; AI reservations never go negative.

**Upgrading an existing database:** `pnpm prisma:migrate:deploy`. The new unique rules fail the migration if duplicates already exist (repeated receipt numbers or gateway payment ids within a coaching, or two salaries for the same teacher and month); resolve those first.

**Known limitations, tracked for later phases:**
- Fee payment links are created on Vargly's Razorpay account; collecting fees into each coaching's own account needs Razorpay Route or per-coaching keys
- Payments logged as `RECONCILE` (money taken but not applicable) need a review screen and refund flow; today they exist only in logs
- Nothing enforces a single active subscription per coaching at the database level; settlement updates the current one
- AI usage logs still carry no `coachingId` (they are reached through the wallet)
- Paid periods use calendar months and years; proration on plan changes is not implemented

### Phase 4: Reliable async ✅
- [x] Durable events: every published event is recorded in `domain_events` before its handlers run, with the outcome per handler. Failed handlers are retried with backoff (30 s doubling, up to 1 h, 10 attempts, then `DEAD`) by an event relay worker; events interrupted by a crash are recovered; only handlers that have not succeeded are re-run. Relays lease events with `FOR UPDATE SKIP LOCKED`, so several workers never process the same one
- [x] One composition root (`bootstrap/modules.ts`) used by the API and the worker process: the worker now registers all 69 subscribers (it had none, so events published by jobs were dropped) and the WhatsApp assistant gets its AI and knowledge-base services. Modules initialise once per process
- [x] Workers no longer run inside the API in staging/production (`RUN_WORKERS_IN_API`, on by default only in development)
- [x] Notifications are sent once: workers atomically claim a notification (`SENDING`) before sending, instead of reading its status; a claim abandoned by a crashed worker can be retaken after 10 minutes. `READ` notifications are no longer resent
- [x] Fee reminders: one reminder per stage (7 and 3 days before, due day, 3/7/14 days overdue, then stop) instead of every day forever; sent at 10:00 in each coaching's own time zone; coachings and installments are processed in pages
- [x] WhatsApp assistant: conversation state in Redis (shared across processes, survives restarts, 24 h); inbound messages claimed once in Redis across workers and released if handling fails; parents matched by exact phone number instead of substring; a parent registered at several institutes is asked which one and the choice is remembered

**Exit:** met. Real-database tests prove: a failed handler is retried alone and the event ends dispatched; an event left by a crashed process is recovered with its dates intact; concurrent relays never take the same event; 8 concurrent workers claim a notification once and a sent one is never re-claimed; a WhatsApp message delivered 6 times is claimed once; conversation state is shared between processes. Both processes were started for real: 69 subscribers each, event relay running, API ready.

**Known limitations, tracked for later phases:**
- Events are recorded right after the business change commits, not in the same transaction, so a crash in that instant can still lose one; a full transactional outbox needs services to write events through their repository transaction
- Handlers must tolerate re-running after a failure; handlers that write rows (timeline, audit) could duplicate a row if they fail after writing
- `DEAD` events and payments marked `RECONCILE` are only visible in logs and the database; they need alerting and an admin view (Phase 6)
- One Vargly WhatsApp number serves every institute; routing by per-coaching WhatsApp numbers is not implemented
- The reminder hour (10:00 local) is fixed, not configurable per coaching
- Notification sending is at-least-once: a worker that crashes after sending but before recording it can cause one resend after 10 minutes

### Phase 5: Real integrations ✅
- [x] Email is really sent: `SmtpEmailAdapter` uses nodemailer (host, port, TLS and auth from `SMTP_*`) and reports the transport's message id or the actual error. Previously it returned `SENT` with an invented id even when SMTP was configured
- [x] Password reset and email verification links are emailed (`FRONTEND_URL/reset-password?token=…`, `/verify-email?token=…`); a failed send is logged but never changes the reply, so it cannot reveal whether an account exists
- [x] Missing credentials fail instead of pretending: in production, unconfigured WhatsApp and SMTP return `FAILED` (outside production they still simulate); AI chat providers without a key throw in production instead of returning mock text that would be shown to parents and charged as credits (the Phase 3 reservation refunds them)
- [x] AI model names are configuration (`AI_MODEL_CLAUDE` default `claude-sonnet-5`, `AI_MODEL_OPENAI`, `AI_MODEL_GEMINI`), replacing retired hard-coded defaults; Claude replies join all text blocks
- [x] Embeddings: each chunk records the model that produced it (`embedding_model`) and search compares only vectors from the current model, so switching provider can no longer mix incomparable vectors; Gemini uses `gemini-embedding-001` at 1536 dimensions natively (no zero-padding) and wrong-sized vectors are rejected; embedding adapters no longer fall back silently to mock vectors
- [x] Gemini API keys are sent in the `x-goog-api-key` header instead of the URL, where they could leak into proxy or error logs
- [x] Startup reports which integrations are configured (warnings in production), in both the API and the worker
- [x] The 23 stub `*.cron.ts` files no longer claim to register jobs that do not exist; they are documented as intentionally empty (the module layout allows this)

**Exit:** met. Tests prove: SMTP sends through a real nodemailer transport and reports failures; production refuses to fake WhatsApp, email and AI; reset links are emailed with the same token that was stored; Gemini keys never appear in URLs; wrong-sized embeddings are rejected; search ignores chunks from another embedding model, both in memory and against real pgvector. API startup was smoke-tested with the integration report.

**Upgrading:** `pnpm install` (adds nodemailer), `pnpm prisma:migrate:deploy`, then re-sync each coaching's knowledge base: chunks created before this release have no recorded model and are skipped by search. Set `SMTP_*` and `FRONTEND_URL` in production.

**Known limitations and follow-ups:**
- Verify the OpenAI and Gemini default model names against the providers' current catalogues before deploying; they are configurable, so no code change is needed
- Scheduled features the old stub crons implied do not exist yet: attendance, homework and test reminders, and audit log archival
- Account emails are sent inline from the request; moving them to the email queue would add retries
- `.env.example` still documents S3 variables, but storage uses Cloudinary (`CLOUDINARY_*`)

### Phase 6: Quality gates & delivery ✅
- [x] ESLint (typescript-eslint) enforced in CI, including type-aware `no-floating-promises` / `no-misused-promises` (the class of bug behind the Phase 0 crash) and the architecture rule that services import neither Express nor Prisma. The 11 existing violations were fixed
- [x] CI: lint; a security job (gitleaks over full history, with the three commits of the already-rotated Phase 0 key allowlisted; an audit that blocks on high/critical advisories in the API's production dependencies); a delivery job (Docker image build, image contents check, docker-compose validation, Kubernetes manifest rendering)
- [x] Docker: one image runs the API, the worker and migrations. Fixed a build that could never succeed (it copied a non-existent `tsconfig.json`); added `.dockerignore` so host `node_modules` and `.env` secrets never enter the build context; pnpm store cached across builds
- [x] docker-compose rebuilt and verified end to end in production mode: generated secrets (`pnpm docker:env`, git-ignored), app role created on first start, a one-shot `migrate` service (7 migrations + RBAC seed) before the API and worker, localhost-only configurable ports, fresh volume names so an existing local database is not reused. Checked: register, login, create/list student, events recorded and dispatched, worker with all 69 subscribers
- [x] Kubernetes (Kustomize): migration Job staged before rollout, API Deployment (startup/readiness/liveness probes, resource requests/limits, non-root, read-only filesystem, zero-downtime rolling update, PodDisruptionBudget, HPA), a new worker Deployment, ConfigMap and secret template, image pinned in one place
- [x] Alerting: `/metrics` now requires `METRICS_TOKEN` (was public; disabled in production without it) and labels requests by route pattern (raw paths made unbounded series); new `vargly_domain_events{status}`, `vargly_notifications_failed_24h` and `vargly_payment_reconcile_total`
- [x] Tests never load the developer's `.env` (real keys there made test runs call Gemini); client-supplied trace ids are validated before being logged; the `uuid` dependency was replaced by `crypto.randomUUID`
- [x] README and operations runbook (`docs/RUNBOOK.md`)

**Exit:** met. Lint is clean; 234 unit and 51 integration tests pass; the image built and the compose stack ran end to end in production mode as the non-superuser role; manifests render. (The final image build, after adding the pnpm cache mount and removing `uuid`, timed out locally on the network and is verified by the CI delivery job.)

**Known limitations and follow-ups:**
- No test-coverage floor yet (needs `@vitest/coverage-v8`)
- The web and mobile apps carry 38 dependency advisories (mostly Expo tooling); they are not in the API image but need their own upgrade pass
- The Kubernetes manifests were rendered and reviewed, not applied to a live cluster; there is no Redis or PostgreSQL manifest (use managed services) and no Ingress/TLS
- The per-statement RLS transaction has not been load-tested
- Database backups and point-in-time recovery are outside this repository

### Phase 7: Frontend
Typed API client on `@vargly/types`, real authentication flow, replace mocked dashboard data.
