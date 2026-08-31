# Inventory and recommendation design

- Status: Current implementation documented; versioned JSON architecture proposed
- Audience: Engineers
- Last updated: 2026-08-30

## 1. Summary

First Stroll is a static, client-side stroller matcher. Today, its versioned runtime catalog, questions, scoring data, and recommendation logic all live in `index.html`. This document records that behavior and specifies a future external JSON catalog and recommendation algorithm.

The target design keeps ranking deterministic, local, auditable, and explainable. It does not introduce a service, database, user tracking, learned model, budget input, or automated catalog refresh.

This deployment has one fixed recommendation profile:

- Primary location: Central Richmond, San Francisco, CA
- Primary vehicle: Tesla SUV

The profile is visible in the UI and contributes versioned, explicit context weights. Because the vehicle model is not specified, the design makes no Model X/Model Y cargo-dimension claim and applies no hard trunk-fit filter.

The future sources of truth are:

- `data/inventory.v1.json` for active product facts, newborn configurations, prices, and evidence.
- `data/recommendation.v2.json` for questions, answer weights, rubric thresholds, labels, and algorithm metadata.
- JSON Schema plus semantic validation for both files.

Those files are proposed interfaces, not part of the current implementation. There is intentionally no parallel `products.md`; maintaining the same product facts in Markdown and JSON would create competing sources of truth.

## 2. Goals and non-goals

### Goals

- Maintain a complete, active catalog within an explicit premium-brand and product-scope policy.
- Represent every supported newborn setup and its actual day-one US list-price total.
- Derive every recommendation score from documented facts and a versioned rubric.
- Make eligibility, weighting, sorting, rounding, and explanations reproducible.
- Incorporate the Central Richmond and Tesla SUV profile without hiding its effect on ranking.
- Fail clearly when input or catalog data is invalid instead of silently producing questionable results.
- Keep catalog updates manual and reviewable.

### Non-goals

- Cover non-premium brands or the entire US stroller market.
- Recommend convertible doubles, sibling configurations, or twin configurations.
- Optimize for a user's budget or use price as a ranking signal.
- Infer newborn safety from marketing language, recline angle, or third-party opinion.
- Infer an exact Tesla model, cargo opening, trunk volume, or fit guarantee from the generic vehicle label.
- Scrape, schedule, auto-refresh, or auto-merge product changes.
- Add server-side ranking, personalization, analytics, experimentation, or machine learning.

## 3. Current implementation

### 3.1 Inventory

`index.html` currently contains catalog version `2026-08-30.1`, reviewed August 30, 2026, with 35 inline stroller objects across the six approved brands:

- Bugaboo (3): Butterfly 2 Plus, Dragonfly Plus, and Fox 5 Renew.
- CYBEX (8): Coya, Libelle, Beezy, Balios S Lux, Priam, Mios, Avi Spin, and e-Priam.
- Joolz (5): Aer², Aer+ Newborn Bundle, Hub², Hub+, and Day+.
- Nuna (12): VIAA cabn, DEMI icon, SWIV, TRIV lx, TRIV next, MIXX next, TRVL lx, TRVL + PIPA rx, TAVO next, TAVO, IVVI totl, and PIPA urbn flex system.
- Thule (4): Urban Glide 3, Urban Glide 4-wheel, Glide 3, and Spring 2.
- UPPAbaby (3): Cruz V3, Minu V3, and Ridge V2.

Mockingbird and Chicco were removed because they fall outside the approved-brand boundary. Convertible-double and side-by-side models remain excluded. The powered CYBEX e-Priam shares the catalog but is isolated from standard strollers during recommendation.

Each object contains identity and display fields, one representative `price`, one listed `weight`, a primary newborn setup, a support level for each newborn mode, a `baselineFit`, seven editorial 1–5 scores, and a tradeoff.

The current structure has four material limitations:

1. Product data and executable UI code change together.
2. A single price cannot represent optional flat-seat, bassinet, and car-seat configurations with different required components.
3. The 1–5 scores and `baselineFit` values are assertions without a machine-checkable rubric or field-level evidence.
4. Product facts have manufacturer detail URLs but not yet the field-level evidence map required by the target schema.

### 3.2 Questions and weights

The current quiz has five questions: route, newborn setup, propulsion, lifting frequency, and two priorities. The algorithm uses seven dimensions:

`lift`, `ride`, `trail`, `basket`, `car`, `value`, and `finish`.

Every dimension starts with weight 1. The current application then applies a fixed deployment profile before route, lifting, and priority answers:

| Profile context | Weight deltas |
| --- | --- |
| Central Richmond, San Francisco, CA | `ride +2`, `trail +1`, `basket +1` |
| Tesla SUV | `car +2`, `lift +1` |

The location profile represents urban ride comfort, rough-patch tolerance, and neighborhood storage. The vehicle profile represents repeated car-seat use and lifting into an SUV. These are preference weights, not dimensional-fit guarantees.

Route and lifting answers then apply these deltas:

| Answer | Weight deltas |
| --- | --- |
| Sidewalks & shops | `ride +2`, `basket +1` |
| Car errands | `car +3`, `lift +2` |
| Transit & travel | `lift +4`, `car +1` |
| Parks & rough paths | `trail +4`, `ride +2` |
| Lift every day | `lift +4` |
| Lift a few times a week | `lift +2` |
| Lift rarely | `ride +1`, `basket +1` |

The user must also choose exactly two priorities. Each chosen dimension receives `+3`.

For product \(p\), the current dimension fit is:

```text
dimensionFit(p) = sum(score[p,d] * weight[d]) / (5 * sum(weight[d]))
```

Propulsion is an eligibility filter rather than a score: standard and powered products never share a recommendation pool. When the user chooses a specific newborn mode, products that mark it `unsupported` are also removed before ranking. A flexible setup uses every product in the selected propulsion pool.

For eligible products, the selected newborn mode produces a second factor:

| Mode support | `modeFit` |
| --- | ---: |
| Primary | 1.00 |
| Optional | 0.75 |
| User selected flexible | 1.00 |

The displayed match is:

```text
match = round(100 * (0.72 * dimensionFit + 0.20 * modeFit + 0.08 * baselineFit))
```

Products are sorted by displayed match descending, price ascending, then weight ascending. If the selected propulsion and newborn setup have no compatible product, the UI returns an explicit no-match state instead of inserting an incompatible stroller.

Recommendation reasons are based on `score * weight` contributions. The implementation sorts contributions descending, takes up to two dimensions with a score of at least 4, and fills any remaining reason slots with the next highest contributions.

### 3.3 Current-state risks

- `baselineFit` adds opaque product-level bias.
- Price influences ties even though the quiz does not ask for a budget.
- The `value` dimension indirectly reintroduces price without a stable definition.
- Sorting uses rounded scores, so products with different raw fits can tie unnecessarily.
- Optional configurations display a representative listed price rather than the selected configuration's exact total.
- There is no catalog or algorithm version in a recommendation result.
- The current profile is an inline JavaScript constant rather than independently versioned configuration.

## 4. Target inventory design

### 4.1 Inclusion policy

The catalog aims to include every product that satisfies all of the following at the time of an on-demand review:

1. The brand is Bugaboo, CYBEX, Joolz, Nuna, Thule, or UPPAbaby.
2. The model is currently sold in the US by the manufacturer or an authorized retailer.
3. The manufacturer explicitly approves at least one configuration for use from birth or the newborn stage.
4. The model is marketed only as a single stroller. Any model marketed as convertible to double, sibling, or twin use is excluded even if it has a single-seat configuration.
5. The required safety, compatibility, pricing, and scoring facts can be supported under the source policy below.

"Premium" is defined only by the brand allowlist. There is no price floor, feature threshold, or recommendation score required for inclusion. Full-size, compact/travel, and all-terrain single strollers are eligible.

Standard and powered strollers share the catalog, but `propulsion` separates their recommendation pools. A powered product does not receive a scoring bonus.

The JSON contains active products only. At the next on-demand review, remove a model that is discontinued or no longer available from the manufacturer and authorized US retailers. Git history provides removal traceability; inactive records do not remain in the runtime catalog.

### 4.2 Source policy

Source authority depends on the fact being recorded:

| Fact | Required authority | Fallback |
| --- | --- | --- |
| Newborn approval and restrictions | Manufacturer product page or manual | None |
| Mode and component compatibility | Manufacturer product page or manual | None |
| Safety warnings | Manufacturer manual | None |
| Product specifications | Manufacturer page or manual | Authorized retailer when the manufacturer omits the field |
| US list price | Manufacturer US list price | Regular, non-promotional price from an authorized US retailer |
| Current US availability | Manufacturer or authorized US retailer | None |

Retailer content never overrides manufacturer safety or compatibility instructions. A discrepancy is resolved manually before publication and explained in a source note.

Official manufacturer catalogs are starting points, including the [CYBEX US stroller catalog](https://www.cybex-online.com/en/us/cybex-strollers-us.html) and [Joolz newborn stroller catalog](https://www.joolz.com/us/en/newborn-stroller). Product and manual URLs, rather than a search or category page alone, must support published facts.

Every source records its access date. Dates are informational: there is no review cadence, automatic expiration, scheduled fetch, scraper, or background refresh. A maintainer starts each update on demand.

### 4.3 Price semantics

`totalMsrpUsd` is the sum of the regular US list-price contributions required to make one configuration newborn-ready.

- Exclude sales, coupons, taxes, shipping, and optional accessories.
- Represent a manufacturer bundle as one component at the bundle list price.
- Represent an accessory included in that bundle with a zero additional contribution when listing it separately for clarity.
- Represent a separately required insert, bassinet, adapter, infant car seat, or base at its own list price.
- Keep one configuration for each supported mode: `flat`, `bassinet`, or `car`.
- Designate exactly one configuration as the default used when the user selects `flexible`.

Price is displayed with a recommendation but never affects eligibility, fit, explanations, sorting, or ties.

### 4.4 Catalog interface

The normative shape of `data/inventory.v1.json` is represented below. Type names are explanatory; JSON Schema is authoritative when implemented.

```ts
type ISODate = string; // YYYY-MM-DD

type Brand =
  | "Bugaboo"
  | "CYBEX"
  | "Joolz"
  | "Nuna"
  | "Thule"
  | "UPPAbaby";

type NewbornMode = "flat" | "bassinet" | "car";
type FormFactor = "full-size" | "compact-travel" | "all-terrain";
type Propulsion = "standard" | "powered";

interface InventoryCatalogV1 {
  schemaVersion: 1;
  catalogVersion: string;
  market: "US";
  currency: "USD";
  reviewedOn: ISODate;
  approvedBrands: Brand[];
  products: ProductV1[];
}

interface ProductV1 {
  id: string;
  brand: Brand;
  model: string;
  displayName: string;
  formFactor: FormFactor;
  propulsion: Propulsion;
  childCapacity: "single";
  officialUrl: string;
  description: string;
  tradeoff: string;
  listedStrollerWeightLb: number;
  defaultConfigurationId: string;
  configurations: NewbornConfigurationV1[];
  rubricFacts: RubricFactsV1;
  powerDetails?: PowerDetailsV1;
  sources: SourceV1[];
  evidence: Record<string, string[]>;
}

interface NewbornConfigurationV1 {
  id: string;
  mode: NewbornMode;
  components: PriceComponentV1[];
  totalMsrpUsd: number;
  carryWeightLb: number;
  foldHands: 1 | 2;
  foldPieces: 1 | 2;
  selfStandingFold: boolean;
  newbornApprovalSourceIds: string[];
}

interface PriceComponentV1 {
  id: string;
  label: string;
  kind: "stroller" | "bundle" | "insert" | "bassinet" | "adapter" | "car-seat" | "base";
  priceContributionUsd: number;
  sourceIds: string[];
}

interface RubricFactsV1 {
  ride: {
    suspension: "none" | "partial" | "all-wheel-or-frame";
    tires: "hard-or-eva" | "foam-or-rubber" | "air-filled";
  };
  trail: {
    frontWheelDiameterIn: number;
    rearWheelDiameterIn: number;
    hasTerrainControl: boolean;
  };
  basket: {
    capacityLb: number | null;
  };
  car: {
    integration:
      | "none"
      | "adapter-sold-separately"
      | "adapter-included"
      | "adapter-free"
      | "adapter-free-seat-included";
  };
  finish: {
    documentedMetalFinish: boolean;
    premiumTouchpoints: boolean;
    certifiedTextiles: boolean;
    extendedSupport: boolean;
  };
}

interface PowerDetailsV1 {
  assistFeatures: string[];
  requiresAppForCoreOperation: boolean;
  manualPushAvailable: boolean;
  batteryRemovable: boolean;
}

interface SourceV1 {
  id: string;
  kind: "manufacturer-product" | "manufacturer-manual" | "authorized-retailer";
  url: string;
  accessedOn: ISODate;
  note?: string;
}
```

`evidence` maps JSON Pointer-style field paths to source IDs. For example, `/rubricFacts/ride/suspension` identifies the evidence behind the suspension classification. Every positive feature claim, numeric fact, configuration component, and compatibility claim must have evidence.

`powerDetails` is required exactly when `propulsion` is `powered` and forbidden otherwise. These fields support clear product tradeoffs; v2 uses only `propulsion` for filtering.

### 4.5 Catalog validation

JSON Schema validates structure. A semantic validator handles cross-field rules that JSON Schema cannot express cleanly.

Publication must fail when any of these invariants is violated:

- `schemaVersion` is not supported or IDs are not unique stable slugs.
- `approvedBrands` differs from the six-brand policy or a product uses another brand.
- A product is not a single stroller or lacks at least one newborn configuration.
- A product has duplicate modes, an unknown mode, or an invalid `defaultConfigurationId`.
- A configuration's `totalMsrpUsd` differs from the sum of its component contributions to the cent.
- Currency, market, units, dates, URLs, or enum values are invalid.
- Newborn approval or compatibility relies only on a retailer.
- A required scoring fact is absent. `basket.capacityLb` may be `null` only when a checked source does not publish a weight capacity; the rubric deliberately assigns the minimum score.
- A fact or component references a missing source.
- Powered metadata is missing for a powered product or present for a standard product.

Validation is allowed in local tooling and continuous integration because it checks committed data without fetching or changing external inventory. It is not an automatic refresh mechanism.

## 5. Recommendation algorithm v2

### 5.1 Deployment profile

`data/recommendation.v2.json` contains the fixed context separately from user answers:

```ts
interface RecommendationProfileV2 {
  id: "central-richmond-tesla-suv";
  version: 1;
  primaryLocation: "Central Richmond, San Francisco, CA";
  primaryVehicle: "Tesla SUV";
  locationDelta: { ride: 2; trail: 1; basket: 1 };
  vehicleDelta: { car: 2; lift: 1 };
}
```

Apply these deltas after initializing base dimension weights and before applying answers. The location delta favors urban ride comfort, tolerance for rough patches, and storage. The vehicle delta favors car-seat integration and lifting. The generic vehicle label does not authorize dimensional filtering; an exact Tesla model and measured cargo constraints would require a new profile version and evidence.

The profile label and its influence must be visible before the quiz and on results. It is fixed deployment configuration, not a sixth question or a user answer inferred from device location.

### 5.2 Input contract

V2 has five required questions, in this order:

1. Route
2. Newborn setup
3. Lifting frequency
4. Propulsion
5. Two priorities

```ts
type Dimension = "lift" | "ride" | "trail" | "basket" | "car" | "finish";

interface RecommendationAnswersV2 {
  route: "sidewalks" | "car" | "transit" | "rough";
  setup: "flat" | "bassinet" | "car" | "flexible";
  lifting: "daily" | "sometimes" | "rarely";
  propulsion: "standard" | "powered";
  priorities: [Dimension, Dimension];
}
```

Priorities must contain exactly two distinct values. `value` is removed. There is no budget field, price range, affordability score, implicit price preference, or price-based fallback.

The propulsion question asks the user to choose a standard stroller or powered assistance. It is an eligibility decision, not a scored preference. Selecting powered never causes standard products to fill an undersized result set, and selecting standard excludes powered products.

### 5.3 Eligibility and configuration selection

Eligibility happens before scoring:

1. Select products whose `propulsion` exactly matches the answer.
2. When `setup` is `flat`, `bassinet`, or `car`, keep only products with that configuration and use it for scoring and display.
3. When `setup` is `flexible`, keep every product with a valid default configuration and use that configuration.

Unsupported modes are never shown as alternatives. If one or two products are eligible, return only those products. If none are eligible, return an empty result with reason `no-compatible-products`; the UI should explain that the premium catalog has no match for the selected propulsion and newborn setup.

### 5.4 Dimension rubrics

Each dimension produces an integer from 1 through 5. Scores are derived at recommendation time from catalog facts and the selected configuration. All additions below are clamped to that range.

#### Lift

Start from the selected configuration's `carryWeightLb`:

| Carry weight | Base score |
| --- | ---: |
| 15 lb or less | 5 |
| Over 15 through 20 lb | 4 |
| Over 20 through 25 lb | 3 |
| Over 25 through 30 lb | 2 |
| Over 30 lb | 1 |

Add 1 only when the fold is one-hand, one-piece, and self-standing. Subtract 1 when the normal fold requires two pieces. Clamp to 1–5.

`carryWeightLb` means the heaviest stroller piece a caregiver must lift during a normal trunk, stair, or storage transfer after removing the child and any child-carrying car seat or bassinet.

#### Ride

```text
ride = 1 + suspensionPoints + tirePoints
```

| Suspension | Points |
| --- | ---: |
| None | 0 |
| Partial, axle, or front/rear only | 1 |
| All-wheel or frame suspension | 2 |

| Tire construction | Points |
| --- | ---: |
| Hard plastic or EVA | 0 |
| Foam-filled or rubber | 1 |
| Air-filled | 2 |

#### Trail

```text
trail = 1 + tirePoints + largeWheelPoint + terrainControlPoint
```

Use the ride rubric's tire points. Add 1 when the front wheel is at least 8 inches and the rear wheel is at least 11 inches. Add 1 when the stroller has at least one documented terrain control, defined as a lockable or fixed front wheel or a hand brake.

#### Basket

Use published basket weight capacity:

| Capacity | Score |
| --- | ---: |
| Missing or under 10 lb | 1 |
| 10 through under 15 lb | 2 |
| 15 through under 20 lb | 3 |
| 20 through under 25 lb | 4 |
| 25 lb or more | 5 |

Do not convert dimensions or volume into a weight capacity. A missing published capacity receives 1 rather than an inferred value.

#### Car

Map the best manufacturer-approved infant car-seat integration directly:

| Integration | Score |
| --- | ---: |
| No supported infant car seat | 1 |
| Adapter sold separately | 2 |
| Adapter included | 3 |
| Adapter-free attachment | 4 |
| Adapter-free attachment and infant seat included in the car configuration | 5 |

#### Finish

Start at 1 and add 1 for each evidence-backed marker:

1. A metal chassis with a documented anodized, powder-coated, painted, or equivalent finish.
2. Leather, leatherette, cork, or comparable stitched premium material on caregiver touchpoints.
3. Textiles carrying an independent material or chemical certification such as OEKO-TEX, GOTS, GREENGUARD Gold, or an equivalent standard.
4. A warranty of at least three years, a transferable warranty, or a documented manufacturer repair/spare-parts program.

Unpublished or unevidenced claims count as false. Brand membership alone never awards finish points.

### 5.5 Preference weights

V2 removes `value`; the remaining six dimensions start at weight 1. Apply the fixed deployment profile first:

| Profile context | Weight deltas |
| --- | --- |
| Central Richmond, San Francisco, CA | `ride +2`, `trail +1`, `basket +1` |
| Tesla SUV | `car +2`, `lift +1` |

Then apply the preserved route, lifting, and priority deltas:

| Answer | Weight deltas |
| --- | --- |
| `route = sidewalks` | `ride +2`, `basket +1` |
| `route = car` | `car +3`, `lift +2` |
| `route = transit` | `lift +4`, `car +1` |
| `route = rough` | `trail +4`, `ride +2` |
| `lifting = daily` | `lift +4` |
| `lifting = sometimes` | `lift +2` |
| `lifting = rarely` | `ride +1`, `basket +1` |
| Each selected priority | Selected dimension `+3` |

Setup and propulsion do not change weights. They only select a configuration and candidate pool. The profile and answer deltas are additive; answers never replace the fixed context.

### 5.6 Fit score and ranking

For eligible product \(p\), selected configuration \(c\), and dimension \(d\):

```text
rawFit(p,c) = sum(score[p,c,d] * weight[d]) / (5 * sum(weight[d]))
fitScore(p,c) = round(100 * rawFit(p,c))
```

`rawFit` is in `[0.2, 1]`; `fitScore` is therefore in `[20, 100]`. The displayed number is an explainable fit score, not a probability, confidence, quality grade, or claim that the product is objectively better.

Sort eligible results by:

1. Unrounded `rawFit` descending.
2. Stable product `id` ascending.

Round only for display after sorting. Price, weight, brand, primary/default mode, and inventory order are not tie-breakers. Do not diversify by brand or form factor. Return the first three results or the entire eligible set when it contains fewer than three.

### 5.7 Worked v2 example

Consider these answers:

- `route = rough`
- `setup = bassinet`
- `lifting = rarely`
- `propulsion = standard`
- `priorities = [trail, finish]`

After eligibility filtering, the weights are:

| Dimension | Calculation | Weight |
| --- | --- | ---: |
| Lift | Base + vehicle 1 | 2 |
| Ride | Base + location 2 + rough 2 + rarely 1 | 6 |
| Trail | Base + location 1 + rough 4 + priority 3 | 9 |
| Basket | Base + location 1 + rarely 1 | 3 |
| Car | Base + vehicle 2 | 3 |
| Finish | Base + priority 3 | 4 |

The total weight is 27. For a compatible product with scores `lift 2`, `ride 5`, `trail 5`, `basket 4`, `car 3`, and `finish 5`:

```text
weighted sum = 2*2 + 5*6 + 5*9 + 4*3 + 3*3 + 5*4
             = 120

rawFit  = 120 / (5 * 27) = 0.8888...
fitScore = round(100 * 0.8888...) = 89
```

The location and vehicle context contribute weights. The bassinet and standard-propulsion answers affect eligibility but contribute no points.

### 5.8 Explanation selection

For each ranked result:

1. Calculate `contribution[d] = score[d] * weight[d]`.
2. Sort dimensions by contribution descending, raw score descending, then this stable dimension order: `lift`, `ride`, `trail`, `basket`, `car`, `finish`.
3. Select up to two dimensions whose raw score is at least 4.
4. If fewer than two qualify, fill from the remaining sorted dimensions.
5. Map them through versioned reason labels.

This retains the current contribution-based explanation behavior while making the final tie deterministic. Explanations state why a product fit the answers; they do not restate eligibility gates or hide tradeoffs.

### 5.9 Recommendation interface

```ts
interface RecommendationResultV2 {
  algorithmVersion: 2;
  catalogVersion: string;
  profileId: "central-richmond-tesla-suv";
  profileVersion: 1;
  recommendations: RankedRecommendationV2[];
  emptyReason?: "no-compatible-products";
}

interface RankedRecommendationV2 {
  rank: number;
  productId: string;
  configurationId: string;
  rawFit: number;
  fitScore: number;
  reasons: [string, string];
}
```

An eligible product always has six validated scores, so it always has two reasons. Rendering joins product identity, description, tradeoff, configuration total, and official URL from the catalog rather than duplicating those fields in the result.

Invalid answers are not coerced. A missing answer, unknown enum, duplicate priority, or priority count other than two returns an input-validation error and performs no ranking. An invalid catalog or unsupported algorithm/schema version makes the matcher unavailable; it must not silently rank a partial catalog.

## 6. Versioning and maintenance

### 6.1 Versions

- `schemaVersion` changes when the inventory wire shape changes incompatibly.
- `algorithmVersion` changes when eligibility, rubrics, weights, sorting, rounding, or explanation logic changes.
- `profileVersion` changes when the fixed location, vehicle, or context deltas change. A changed profile ID represents a different deployment context.
- `catalogVersion` changes for every published product, price, source, or fact update. A date-based version with a sequence suffix, such as `2026-08-30.1`, is sufficient.
- Recommendation results carry catalog, algorithm, and profile identifiers and versions so a result can be reproduced.

Text-only corrections that cannot affect parsed data or results do not require an algorithm version change.

### 6.2 On-demand update workflow

1. Review every current US model from each approved brand, not only previously cataloged models.
2. Apply inclusion rules and remove unavailable or discontinued records.
3. Verify newborn approval and configurations from manufacturer sources.
4. Record product facts, per-mode components, regular US list prices, sources, access dates, and evidence paths.
5. Run schema and semantic validation locally.
6. Recompute rubric scores and the recommendation scenario suite.
7. Review the catalog and result diffs in code review.
8. Publish by merging the approved static files.

No step fetches or publishes on a schedule. Future validation tooling may read local committed files but must not mutate catalog facts or access external sources during routine builds.

## 7. Safety and presentation requirements

- Show only manufacturer-approved newborn configurations.
- Preserve a visible reminder to follow the selected product's current manual.
- Do not imply that stroller eligibility means a newborn may jog or run in it; jogging requires the manufacturer's age guidance and pediatric guidance.
- Label prices as approximate US list-price totals and show the catalog review date.
- Label the numeric output as a fit score, never a success probability or safety score.
- Show Central Richmond, San Francisco, CA and Tesla SUV as the fixed profile wherever its weighted result is presented.
- Do not claim compatibility with a particular Tesla cargo opening until an exact model and measured constraints are configured.
- Present the selected configuration and its required components so optional accessories are not mistaken for included equipment.
- Continue showing a concrete tradeoff for every recommendation.

## 8. Test strategy

### 8.1 Catalog validation cases

- Accept one product with each supported form factor and propulsion type.
- Reject an unapproved brand, convertible-double product, non-US record, or product without a manufacturer-approved newborn mode.
- Reject duplicate product/configuration IDs, duplicate configuration modes, and missing defaults.
- Reject totals that do not equal component contributions to the cent.
- Reject retailer-only newborn approval or component compatibility.
- Reject missing evidence and invalid units, dates, currencies, URLs, or enums.
- Accept `basket.capacityLb = null` and verify it yields basket score 1.
- Require `powerDetails` only for powered products.

### 8.2 Rubric boundary cases

- Test every lift weight boundary and both fold adjustments, including clamping at 1 and 5.
- Test every suspension, tire, basket, and car-integration band.
- Test the exact 8-inch front and 11-inch rear trail thresholds.
- Test each finish marker independently and all four together.
- Verify missing or unsupported evidence never awards a point.

### 8.3 Recommendation cases

- Reject incomplete answers, unknown values, duplicate priorities, and the wrong priority count.
- Verify the Central Richmond deltas are `ride +2`, `trail +1`, and `basket +1`.
- Verify the Tesla SUV deltas are `car +2` and `lift +1`, with no dimensional eligibility filter.
- Verify every route and lifting delta independently.
- Verify answer deltas add to, rather than replace, fixed profile deltas.
- Verify explicit setup excludes unsupported products rather than penalizing them.
- Verify `flexible` uses the default configuration.
- Verify standard and powered pools never mix.
- Verify ranking uses raw fit before rounding and product ID for an exact tie.
- Verify price changes cannot affect fit, reasons, or order.
- Verify pure top-three behavior permits repeated brands and form factors.
- Return one or two results without incompatible fillers, and return `no-compatible-products` for an empty pool.
- Verify reason selection, stable dimension ties, and the worked example's score of 89.

### 8.4 Acceptance criteria for a future implementation

- The inline catalog and scoring constants can be removed without changing the specified v2 behavior.
- Every active catalog record passes schema, semantic, evidence, and rubric validation.
- A fixed answer set plus catalog, algorithm, and profile versions always returns byte-for-byte equivalent ranked identifiers and scores.
- The UI identifies the Central Richmond and Tesla SUV profile, chosen configuration, day-one total, fit reasons, tradeoff, and official source link.
- No budget, value dimension, baseline fit, mode bonus, price tie-break, diversity rule, or automated refresh remains.
