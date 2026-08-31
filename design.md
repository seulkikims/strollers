# Recommendation and evidence design

- Status: Algorithm v2 implemented
- Audience: Engineers and product designers
- Last updated: 2026-08-30

## 1. Product boundary

First Stroll is a deterministic, local stroller matcher for one fixed profile:

- Central Richmond, San Francisco, CA
- Frequent loading into a generic Tesla SUV
- Newborn use only

The catalog contains 35 active US models from Bugaboo, CYBEX, Joolz, Nuna, Thule, and UPPAbaby. Each product has a manufacturer-approved newborn configuration. Convertible doubles, twin strollers, unsupported newborn modes, exact Tesla cargo claims, analytics, server-side ranking, and learned recommendations are out of scope.

The generic vehicle profile adds preference weight for lifting and car-seat integration. It is not a trunk-fit guarantee.

## 2. Runtime data

The direct-open app has four sources:

1. The inline catalog in `index.html` supplies product identity, eligibility, display facts, and six editorial fit scores.
2. `recommendation.js` supplies the versioned answer contract and pure ranking logic.
3. `reviews.json` supplies independent verdicts, confidence, reviewed setup, safety checks, and sources.
4. `forums.json` supplies sampled exact-model community coverage, sentiment labels, recurring themes, and thread references.

`scripts/build-insights.mjs` deterministically reduces the two research files into `insights.js`. The browser loads this classic script without `fetch`, so opening `index.html` from `file://` continues to work. Tests require a one-to-one product-ID mapping across all four data sources.

### Evidence boundary

Manufacturer information controls newborn approval, component compatibility, and other safety facts. Independent testing may describe performance. Forums are anecdotal ownership experience.

Review confidence and forum sentiment never:

- change compatibility or eligibility;
- add or remove fit points;
- act as a quality, popularity, or safety score;
- break ranking ties.

Sparse or insufficient evidence is displayed neutrally rather than treated as negative evidence.

## 3. Adaptive question flow

The five core questions are:

1. Main weekly routine plus one optional secondary routine.
2. Stroller role: all-rounder, walking-first, or compact companion.
3. Newborn setup: flat seat, bassinet, infant car seat, or flexible.
4. Lifting frequency: daily, sometimes, or rarely.
5. Exactly two priorities from fold and carry, ride, trail, basket, car-seat ease, and finish.

If either routine includes hills/rough paths, or trail is selected as a priority, a sixth question asks whether to include powered hill assist. Including it compares standard products and the powered CYBEX e-Priam in one needs-based pool. Power itself adds no points.

The answer contract is:

```ts
type Dimension = "lift" | "ride" | "trail" | "basket" | "car" | "finish";
type Routine = "sidewalks" | "car" | "transit" | "rough";

interface RecommendationAnswersV2 {
  routines: { primary: Routine; secondary: Routine | null };
  role: "all-rounder" | "walking-primary" | "compact-companion";
  setup: "flat" | "bassinet" | "car" | "flexible";
  lifting: "daily" | "sometimes" | "rarely";
  priorities: [Dimension, Dimension];
  includePowered: boolean;
}
```

Unknown values, repeated routines, duplicate priorities, and incomplete answers are rejected rather than coerced.

## 4. Weighting and fit

All six dimensions start at weight 1. Apply the fixed profile first:

| Context | Delta |
| --- | --- |
| Central Richmond | `ride +2`, `trail +1`, `basket +1` |
| Tesla SUV | `car +2`, `lift +1` |

Apply the primary routine at full strength and the optional secondary at half strength:

| Routine | Delta |
| --- | --- |
| Neighborhood walks | `ride +4`, `basket +2` |
| Car errands | `car +4`, `lift +2` |
| Transit and travel | `lift +6` |
| Hills and rough paths | `trail +4`, `ride +2` |

Then apply the selected role:

| Role | Delta |
| --- | --- |
| All-rounder | `ride +2`, `basket +2`, `car +1`, `lift +1` |
| Walking-first | `ride +3`, `trail +2`, `basket +1` |
| Compact companion | `lift +4`, `car +2` |

Lifting applies `lift +4` for daily, `lift +2` for sometimes, or `ride +1` and `basket +1` for rarely. Each of the two priorities receives `+3`.

### Eligibility

Eligibility is evaluated before scoring:

1. Standard products are eligible; powered products join only when `includePowered` is true.
2. An explicit newborn setup excludes products that mark that mode unsupported.
3. Flexible setup uses each product's listed primary setup.

Primary and optional supported modes rank equally. An unsupported mode is never shown as a filler.

### Score and ordering

For eligible product `p` and dimension `d`:

```text
rawFit(p) = sum(score[p,d] * weight[d]) / (5 * sum(weight[d]))
fitScore(p) = round(100 * rawFit(p))
```

Sort by unrounded `rawFit` descending, then stable product ID ascending. The displayed percentage is a fit score, not a probability, confidence level, or quality grade.

Algorithm v2 does not use the former baseline fit, newborn-mode bonus, value dimension, price tie-break, brand diversification, or evidence adjustment.

Reasons are the two highest weighted contributions with product scores of at least 4, filled from the next contributions when needed. Stable dimension order resolves exact ties.

## 5. Purposeful shortlist

The first recommendation is always the highest raw fit. Two alternatives are selected from products no more than eight raw-fit points behind it:

```text
walkingCapability = 0.50*ride + 0.35*trail + 0.15*basket
portability = 0.70*lift + 0.30*formFactorPortability
```

Form-factor portability is 5 for compact/travel, 3 for full-size, and 1 for all-terrain.

The highest walking capability becomes the ride-first alternative. The highest portability among remaining products becomes the portability-first alternative. Ties use raw fit and then product ID. If the eight-point band cannot supply a distinct specialist, the next raw-fit product fills the slot and is labeled “next closest” rather than given a misleading specialist label.

The result interface carries algorithm, catalog, and profile versions plus the stable roles `overall`, `ride-first`, `portability-first`, and `next-closest`.

## 6. Result presentation

Results avoid duplicating the winner in a second top-three list. The layout contains:

- three role-labeled shortlist cards;
- fit reasons, listed-from price, and stroller weight;
- separate review-confidence segments and exact-model forum coverage;
- a neutral positive, mixed, negative, or insufficient community label;
- a visible badge when a related safety notice requires details;
- a walking-capability versus portability chart;
- comparative price and weight bars;
- an icon-based hands-on testing checklist.

An accessible modal drawer provides the longer review verdict, best-for and avoid-if guidance, reviewed-setup caveat, sampled community themes, dated safety action, and source links. It supports Escape, close-button operation, modal focus handling, and focus restoration.

Charts include accessible names and text descriptions. Role labels and point letters ensure that color is not the only differentiator. Mobile results stack cards and convert the evidence drawer into a bottom sheet.

Prices remain display-only “listed from” comparisons because required newborn accessories can change the real total. Used-market advice is limited to testing the exact model and serial number; volatile resale data is not scored.

## 7. Validation and tests

`npm test` verifies:

- answer validation and every profile, routine, role, lifting, and priority delta;
- primary/optional setup parity and exclusion of unsupported modes;
- contextual powered-model inclusion;
- raw-fit ordering and stable ties;
- independence from price, legacy value/baseline fields, review confidence, and sentiment;
- role selection, eight-point bands, and honest fallbacks;
- all 14,040 valid catalog/answer scenarios;
- one-to-one IDs, source and thread references, coverage counts, and notice counts;
- deterministic agreement between the research JSON and `insights.js`.

Browser verification covers direct `file://` loading, five- and six-step paths, evidence drawer keyboard behavior, desktop and mobile layouts, and console errors.
