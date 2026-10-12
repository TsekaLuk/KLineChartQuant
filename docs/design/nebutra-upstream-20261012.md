# Nebutra upstream integration (2026-10-12)

Base: `196d0fcc00f2910f5be37510c91cc39d9c418f9a`.

Nebutra consumes public chart APIs. The integration retains the host-managed
Agent provider, canonical wordmark, batched history loading, silent prefetch
and resolved instrument identity from the previous product revision.

The upstream MarketRuntime replaces BarsLiveSubscription. Live bars now receive
the ready session's instrument ID and respect the instrument's explicit opt-out.
Both explicit and automatic source selections are covered by regression tests.
History batching retains upstream source readiness and stale-load guards, so
trade subscription still waits for the resolved source and precision.

The public market-data entry exports the canonical trade-source factory. Hosts
can configure same-origin HTTP and SSE without duplicating chart data internals.

Account pages read settings from the active layout archive through
`readActiveLayoutSettings`, sharing the layout manager's persistence factory and
scope. Reading does not mount a chart or save an archive. The host normalizes
these settings with the same public chart resolver.

Screenshots keep token-based fonts and the host's Noto Sans SC, avoiding an
inlined complete CJK font. Token generation and font contract tests own this
choice.
