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

## 7. Known gaps

Tracked in [AUDIT_AND_REMEDIATION_PLAN.md](AUDIT_AND_REMEDIATION_PLAN.md). Notably: database backups and point-in-time recovery are outside this repository, and there is no refund automation: refunds are made in the Razorpay dashboard.
