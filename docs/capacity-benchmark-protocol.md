# Capacity Benchmark Protocol

Do not publish a user-capacity number until this protocol runs against a
production-like staging stack: Vercel-equivalent web runtime, Railway worker,
TLS Redis, private R2, and a separate Supabase project.

## Measurements

| Area | Measure | Pass criterion to record |
|---|---|---|
| API | RPS, p50/p95/p99 latency, 4xx/5xx rate | Record load shape and error rate |
| Canvas autosave | concurrent editors, draft sync p95, conflicts | No data loss and conflict rate |
| Upload | MB/s, p95 duration, failure rate | Valid type/size rejection still works |
| Asset delivery | image p95/throughput/403 refresh recovery | No permanent/private R2 URL exposed |
| Queue | wait p50/p95, active count, retry rate | Queue wait remains below agreed SLO |
| Generation | end-to-end duration, completion rate, provider/R2 failures | Use simulation first; paid-provider run separately |

## Safe run order

1. Run autosave and asset benchmarks from internal Field Notes dashboards.
2. Run AI simulation scenarios (`success`, `slow_success`, transient failure,
   permanent failure) without OpenAI cost.
3. Load API/upload/asset endpoints only with dedicated staging test users.
4. Increase concurrent users in steps: 1, 5, 10, 25, 50. Stop on sustained
   errors, queue wait SLO breach, Supabase saturation, or budget threshold.
5. Run a small paid OpenAI validation sample only after the simulation pipeline
   is healthy; record cost per successful image job separately.

## Report template

- environment revision and worker concurrency;
- Redis/Supabase/R2 plans and regions;
- user count, ramp duration, request mix, test data size;
- p50/p95/p99 latency, error rate, queue wait, completion rate;
- OpenAI request count and spend;
- limiting dependency and next scaling action.

The existing benchmark dashboards are browser-local instrumentation, useful for
autosave request suppression and simulated job reliability. They are not a
substitute for a multi-user load test.
