# Connector K-line Request Limits

The chart's viewport history target and a connector's HTTP page size are
different quantities. A wide or zoomed-out viewport can need up to 5,000 bars,
while GOTDX accepts at most 798 bars per request. Sending the whole target as
one HTTP request causes a deterministic 400, including on retry.

`BarCapability.maxBarsPerRequest` declares the connector's per-request bound in
source probes and instrument catalogs. The protocol provider applies the tighter
of the current source and instrument bounds before invoking its transport. A
source probe also protects restored layouts whose stored instrument predates
this field. Sources without a declared bound keep their existing request behavior;
the chart must not impose GOTDX's limit on unrelated providers.

The existing history batch loop owns the total target, exclusive timestamp
cursors, exhaustion, cancellation and the single buffer update. Limiting a page
does not reduce that target or pretend history is exhausted. No extra pagination
loop or provider-specific branch is added to the chart.

Regression coverage sends actual protocol HTTP envelopes through the chart for
799, 3,099 and 5,000-bar targets. Oversized requests are rejected by the transport
fixture, matching the production connector. The tests verify exact chronological
data, cursor boundaries and legal page sizes. Provider tests cover single-bar
and 798/799 boundaries, undeclared bounds, tighter instrument bounds and signals.

The existing 5,000-bar and eight-page values bound one scheduling turn, not total
history or a supported viewport size. Hitting either budget preserves the
provider's history state and cursor. Subsequent viewport demand continues from
that cursor. Tests cover an exaggerated 100-million-slot demand without allocating
that many bars, a provider whose small pages need multiple turns, runtime probe
limit changes, and disposal during an in-flight page.

A connector derives its `maxBarsPerRequest` declaration from the same constant
its request validation uses, so the frontend carries no connector-specific
numeric limit. A canonical incremental-loading regression drives the real
protocol provider with a two-bar source bound and an older instrument snapshot,
and verifies continued pages, exact exclusive cursors, ordered data and
source-reported exhaustion.
