# Vargly Runbook

For whoever deploys and operates the Vargly API. Commands assume the Kubernetes manifests in `infra/k8s`.

## 1. Deploying a release

1. **Build and push the image** (`infra/docker/api.Dockerfile`; one image runs the API, the worker and migrations). Tag it with the git SHA.
2. **Set the tag** in `infra/k8s/kustomization.yaml` (`images[0].newTag`).
3. **Run migrations first**, before any new pod starts:
   ```bash
   kubectl kustomize infra/k8s > release.yaml
   kubectl delete job vargly-migrate --ignore-not-found
   kubectl apply -f release.yaml -l vargly/stage=pre      # config + migration job only
   kubectl wait --for=condition=complete job/vargly-migrate --timeout=10m
   ```
   The job applies migrations and re-seeds roles, permissions and plans as the schema owner. It is idempotent.
4. **Rollout.** `kubectl apply -f release.yaml` updates the API (3+ replicas, no downtime: `maxUnavailable: 0`) and the worker. Watch `kubectl rollout status deploy/vargly-api` and `deploy/vargly-worker`.
5. **Check the startup log** of both: `[Api] Integrations: …` and `[WorkerRunner] Integrations: …` show which integrations are live. Anything `OFF` in production is logged as a warning with what stops working.

If a migration fails the rollout must not continue: the old version keeps running on the old schema.

## 2. Configuration

Non-secret settings: `infra/k8s/configmap.yaml`. Secrets: create `vargly-secrets` from `infra/k8s/secret.example.yaml` (never commit it). The API **refuses to start** in production when:

- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` are missing (every replica must share one keypair)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_ENCRYPTION_KEY` or `WHATSAPP_WEBHOOK_VERIFY_TOKEN` are shorter than 32 characters or a known default
- the database user is a superuser or has `BYPASSRLS`, which would silently disable tenant row-level security

Two database users: `DATABASE_URL` is the application role (`vargly_app`, created by `infra/docker/postgres/create-app-role.sql`); `MIGRATION_DATABASE_URL` is the schema owner, used only by the migration job.

`TRUST_PROXY` must equal the number of proxies in front of the API (1 behind a single ingress). If it is too high, clients can spoof their IP and evade rate limits and login lockout.

## 3. Monitoring and alerts

`GET /metrics` (Prometheus) requires `Authorization: Bearer <METRICS_TOKEN>`; without a token it is disabled in production. Suggested alerts:

| Metric | Alert when | Means |
| --- | --- | --- |
| `vargly_domain_events{status="DEAD"}` | `> 0` | An event's handlers failed 10 times; see §4 |
| `vargly_domain_events{status="FAILED"}` | rising for 30 min | Handlers keep failing (a dependency is down) |
| `vargly_payment_reconcile_total` | any increase | Money was taken but could not be applied; see §5 |
| `vargly_notifications_failed_24h` | above normal | WhatsApp/email delivery failing (credentials, provider outage) |
| `vargly_http_request_duration_seconds` | p95 > 1 s | API slow; check database and Redis |

Health: `/health/live` (process up) and `/health/ready` (database and Redis reachable) drive the Kubernetes probes.

## 4. The operations console (`/app/admin`)

Platform administrators see what needs a person: payments that arrived but were not applied, and events that failed ten times. The console shows the counts, lists both, and lets you retry a dead event or mark a payment resolved (with a note). It is reached only by users with the `SUPER_ADMIN` role; institute owners are refused even though they hold the `*` permission.

**Create the first administrator** (there is no sign-up route for this role). Run `db:seed:rbac` first, then:

```bash
SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD='at least 12 characters'   pnpm --filter @vargly/api admin:create:dev      # from a built API: admin:create
```

Use an email no institute owner uses, because sign-in without an institute code refuses an email that matches several accounts. Running the command again resets that administrator's password.

**Alerts.** Every 10 minutes the worker looks for dead events and unresolved review payments and emails `OPS_ALERT_EMAIL` once per distinct set of problems (and again after 24 hours if they are still open). This needs `SMTP_*`. Without `OPS_ALERT_EMAIL` the problem is only logged and shown in the console; the startup log lists it among the integrations. The Prometheus alerts in section 3 still apply.

### Dead events

Every domain event is stored in `domain_events` with the handlers that completed. Failed handlers are retried by the worker (30 s, doubling, up to 1 h, 10 attempts), then the event becomes `DEAD`. Fix the cause (a provider outage, bad credentials), then press **Retry** in the console; only handlers that have not succeeded run again. The same by hand, as the schema owner or with `SELECT set_config('app.rls_bypass','on',true)` in the same transaction:

```sql
SELECT id, event_name, coaching_id, attempts, last_error, updated_at
FROM domain_events WHERE status = 'DEAD' ORDER BY updated_at DESC LIMIT 50;

UPDATE domain_events SET status = 'FAILED', attempts = 0, next_attempt_at = now()
WHERE id = '<event id>' AND status = 'DEAD';
```

## 5. Payments needing review

Razorpay is used only for Vargly's own subscriptions and AI-credit packs; institutes record the fees they collect by marking installments paid in the dashboard.

When the amount paid differs from the order's price, nothing is granted. The payment is kept with the status `NEEDS_REVIEW` and a note saying what was expected and what arrived, is counted by `vargly_payment_reconcile_total` and appears in the console. Look the payment up in Razorpay (the console shows its order and payment ids and the institute's contact details), then either refund it or settle the order by hand, and press **Mark resolved** with a note of what you did. Resolving is recorded (who, when, what) and the payment leaves the queue.

Webhook retries and duplicate deliveries are safe: each gateway payment is recorded once, and a retry of a flagged payment does not flag it again.

## 6. Routine operations

- **Rotate JWT keys:** generate a new keypair, update the secret, restart the API. Access tokens signed with the old key stop working at once; clients get a new one with their refresh token (refresh tokens are stored server-side and are not affected). To force everyone to sign in again, also revoke refresh tokens: `UPDATE refresh_tokens SET is_revoked = true`.
- **Change an AI or embedding model:** set `AI_MODEL_*` / `*_EMBEDDING_MODEL`. After an embedding model change, re-sync each coaching's knowledge base: search only compares vectors produced by the current model.
- **Scale workers:** increase `vargly-worker` replicas. Jobs, notification sends and the event relay are safe on several replicas.
- **Upgrade a database created with `prisma db push`** (before migrations existed): `prisma migrate resolve --applied 20260923000000_init`, then deploy migrations as usual.

## 7. Paper studio (AI question papers)

Teachers generate a question paper with AI at `/app/papers`, keep the questions they want, and share it with a batch: parents (every linked parent) and students get a WhatsApp message with a download link. A teacher can also upload their own PDF and share that.

**AI provider.** Set `GROQ_API_KEY` (free Llama models at console.groq.com, no card); when it is set it is used ahead of Gemini, OpenAI and Claude. The model is `AI_MODEL_GROQ` (default `openai/gpt-oss-120b`; Groq retires models, `llama-3.3-70b-versatile` is already gone, so list what your key can use with `GET https://api.groq.com/openai/v1/models`; `qwen/qwen3.8-27b` is limited to 1,000 output tokens a minute on the free tier, too little for a paper). Without any key, development answers with clearly marked sample questions so the screens can be tried; production refuses instead. Groq's free limits (requests, tokens a minute and tokens a day, which differ per model) are **shared by every institute using the key**; when they are hit the teacher is told the AI is busy and to try again in a minute (`AI_BUSY`, HTTP 429), and is not charged: check your account's limits page, and move to a paid model through the same two settings when it stops being enough.

**Cost to the institute.** A paper costs 5 AI credits, one question or a small top-up 1. If the model's reply cannot be read twice in a row nothing is charged. Generating needs the plan feature `ai.papers` (the free trial and Pro plans have it; run `db:seed:rbac` after upgrading to add it to existing plans). Sharing a paper of your own needs no AI feature. The permission is `papers:manage` (owners and teachers).

**Links.** Parents open `API_BASE_URL/api/v1/papers/dl/<token>` with no login: the token is 192 random bits, the endpoint is rate limited (60 a minute per address), a paper is rendered on request for the students (never with answers), and the browser is told to download it. Each open is counted for the teacher. Deleting a paper stops its links. The answer key exists only for the teacher (`/papers/:id/pdf?answers=true`). Once a paper is shared it cannot be edited (the link would change under parents); the teacher makes a copy.

**WhatsApp templates to submit in WhatsApp Manager** (category Utility, English, footer "Reply STOP to stop these messages"; the exact text is in `whatsapp-templates.ts`):
- `homework_with_file`: used when a homework has a file or paper attached (it replaces `homework_assigned` for those).
- `paper_shared`: a practice or test paper shared without a homework entry.
Both carry the link as a variable inside the sentence, so no document header is needed. Until they are approved, messages to anyone outside the 24-hour reply window fail. Meta's test number reaches only 5 verified recipients.

**More templates for the owner and parent features** (same category, language and footer; copy the text from `whatsapp-templates.ts` exactly):
- `material_shared`: study material (notes) shared with a batch, the same way as a paper.
- `student_panel_ready`: sent to the parent when the owner makes a student's login. It carries only the sign-in link, never the Student ID or password. Body: `Student panel update from {{1}}: the panel is ready for {{2}}. Attendance, homework and results can be seen here: {{3}} Sign in with the Student ID and password given by the institute.`
- `new_enquiry`: tells the owner someone filled in the public enquiry page (`FRONTEND_URL/enquire/<institute code>`).
- `owner_daily_summary`: the owner's 8:00 morning message (absent yesterday, overdue fees, calls due). Sent only when there is something to report.
- `survey_invite`: a parent's own feedback link (`FRONTEND_URL/feedback/<token>`).
- `fee_payment_confirmation` now ends with a receipt link (`API_BASE_URL/api/v1/fees/receipt/<payment id>/<signature>`, a PDF). The signature is an HMAC made with `JWT_ACCESS_SECRET`, so rotating that secret also invalidates old receipt links.
- `test_score_update` is unchanged, but its result line now adds "Rank 3 of 25, class average 61%" when at least three students sat the test.

**Public pages and links** (no login, rate limited, nothing indexed): `/enquire/<code>`, `/feedback/<token>`, the papers link and the receipt link. They need `FRONTEND_URL` and `API_BASE_URL` to be the real public addresses.

**Student panel** (`/student`, API `/api/v1/student-portal/*`). A student signs in with a Student ID (e.g. `RIYA-4821`), a password and the institute code. The ID is the account's email column written as `riya-4821@students.vargly.local`, a name at a domain that cannot receive mail, so students need no email. The owner makes logins under Student logins (one, or a whole batch of up to 100 at a time); each gets a temporary password, shown once and printable as cards (`POST /student-logins/cards`, stateless: the page sends back what it was just shown). Until the student chooses their own password the API refuses everything except `/api/v1/auth/*` (`PASSWORD_CHANGE_REQUIRED`). Resetting or switching off a login ends its sessions at once; a student marked as left loses access on the next request. A student has one permission, `portal:student`, and the portal routes also check the STUDENT role (owners hold every permission). Fees are hidden from students unless the owner turns them on (`studentPortal.showFees` in settings); `studentPortal.enabled` switches the whole panel. Run `db:seed:rbac` after deploying: it adds the STUDENT role and the two permissions. `route-access.spec.ts` fails if a new route opens to every signed-in person, so a student can never reach one unnoticed. **AI doubt help** (`POST /student-portal/doubts`) is off until the owner turns on `studentPortal.doubts`; it needs the `ai.doubts` plan feature (in PRO_AI and above, and during a trial; seeded by `db:seed:rbac`), costs the institute one AI credit per answer, and is limited to 20 a day per student. A student is never shown the institute's credit balance. **Install on a phone**: `/student` has a web manifest (`public/student.webmanifest`, icons `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`) so the browser offers Add to Home screen; there is deliberately no service worker, so nothing private is cached on the device.

**Excel exports** (`/api/v1/exports/<kind>`, permission `exports:read`, owners only) are built on the server with `exceljs`: students, attendance register, attendance summary, fees, profit and loss, test marks, enquiries and staff attendance. Limits: 20 downloads a minute per institute; payment, expense and enquiry lists are capped at 20,000 rows.

**Recipients.** `batch:<id>:contacts` reaches every linked parent and the student's own number, each phone once (the older `:students` token reached only the students' own numbers, which are often empty). The daily per-institute limit (`WHATSAPP_DAILY_LIMIT_PER_COACHING`) applies as for every automatic message.

**PDFs and Hindi.** PDFs are drawn with Noto Sans and Noto Sans Devanagari from `apps/api/assets/fonts` (SIL Open Font License, licences alongside); the Docker image copies that folder. If the fonts are missing, Hindi text will not render and a warning is logged at the first PDF.

## 8. Known gaps

Tracked in [AUDIT_AND_REMEDIATION_PLAN.md](AUDIT_AND_REMEDIATION_PLAN.md). Notably: database backups and point-in-time recovery are outside this repository, and there is no refund automation: refunds are made in the Razorpay dashboard.
