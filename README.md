# First Stroll

A static, evidence-aware newborn-stroller matcher tuned for Central Richmond, San Francisco, and loading into a Tesla SUV. Open `index.html` directly in a browser; there is no install, server, build, or runtime dependency.

Catalog `2026-08-30.1` covers 35 newborn-ready US models from Bugaboo, CYBEX, Joolz, Nuna, Thule, and UPPAbaby. Algorithm v2 ranks verified compatibility and user fit, then presents review confidence and sampled forum experience as a separate evidence layer. Anecdotal sentiment never changes eligibility, safety, or fit.

## Maintenance

- `reviews.json` and `forums.json` are the research sources.
- `npm run build:insights` regenerates the compact browser bundle used by the direct-open app.
- `npm run check:data` verifies that the generated bundle is current.
- `npm test` runs data-integrity, algorithm, and exhaustive scenario tests with Node's built-in test runner.

See `design.md` for the question flow, weighting, shortlist roles, evidence boundary, and presentation rules.
