const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../recommendation.js");
const { loadCatalog } = require("./catalog-helper.cjs");

function answers(overrides = {}) {
  return {
    routines: { primary: "sidewalks", secondary: null },
    role: "all-rounder",
    setup: "flexible",
    lifting: "sometimes",
    priorities: ["lift", "ride"],
    includePowered: false,
    ...overrides
  };
}

function product(id, options = {}) {
  return {
    id,
    propulsion: options.propulsion || "standard",
    formFactor: options.formFactor || "full-size",
    modes: options.modes || { flat: "primary", bassinet: "optional", car: "optional" },
    scores: options.scores || { lift: 3, ride: 3, trail: 3, basket: 3, car: 3, finish: 3 },
    price: options.price || 100,
    evidence: options.evidence || { confidence: "low" }
  };
}

test("validates the v2 answer contract", () => {
  assert.deepEqual(engine.validateAnswers(answers()), []);
  assert.match(engine.validateAnswers(answers({ priorities: ["ride", "ride"] })).join(" "), /distinct/);
  assert.match(engine.validateAnswers(answers({ routines: { primary: "rough", secondary: "rough" } })).join(" "), /different/);
  assert.match(engine.validateAnswers(answers({ includePowered: "yes" })).join(" "), /boolean/);
});

test("applies profile, primary, half-secondary, role, lifting, and priority weights", () => {
  const weights = engine.buildWeights(answers({
    routines: { primary: "sidewalks", secondary: "car" },
    lifting: "daily"
  }));
  assert.deepEqual(weights, {
    lift: 11,
    ride: 12,
    trail: 2,
    basket: 6,
    car: 6,
    finish: 1
  });
});

test("asks the powered follow-up only for rough routes or trail priority", () => {
  assert.equal(engine.shouldAskPowered(answers()), false);
  assert.equal(engine.shouldAskPowered(answers({ routines: { primary: "rough", secondary: null } })), true);
  assert.equal(engine.shouldAskPowered(answers({ routines: { primary: "car", secondary: "rough" } })), true);
  assert.equal(engine.shouldAskPowered(answers({ priorities: ["trail", "finish"] })), true);
});

test("uses setup compatibility as a gate without primary-mode bonuses", () => {
  const products = [
    product("a-primary", { modes: { flat: "primary", bassinet: "unsupported", car: "unsupported" } }),
    product("b-optional", { modes: { flat: "optional", bassinet: "unsupported", car: "unsupported" } }),
    product("c-unsupported", { modes: { flat: "unsupported", bassinet: "primary", car: "unsupported" } })
  ];
  const ranked = engine.rankProducts(products, answers({ setup: "flat" }));
  assert.deepEqual(ranked.map((item) => item.productId), ["a-primary", "b-optional"]);
  assert.equal(ranked[0].rawFit, ranked[1].rawFit);
});

test("includes powered products only when comparison is enabled", () => {
  const products = [product("standard"), product("powered", { propulsion: "powered" })];
  assert.deepEqual(engine.rankProducts(products, answers()).map((item) => item.productId), ["standard"]);
  assert.deepEqual(engine.rankProducts(products, answers({ includePowered: true })).map((item) => item.productId), ["powered", "standard"]);
});

test("price, legacy baseline, value, and evidence cannot alter fit or ties", () => {
  const first = product("a", { price: 5000, evidence: { confidence: "low" } });
  first.baselineFit = 0;
  first.scores.value = 1;
  const second = product("b", { price: 1, evidence: { confidence: "high" } });
  second.baselineFit = 1;
  second.scores.value = 5;
  const ranked = engine.rankProducts([second, first], answers());
  assert.deepEqual(ranked.map((item) => item.productId), ["a", "b"]);
  assert.equal(ranked[0].rawFit, ranked[1].rawFit);
});

test("selects an overall, ride-first, and portability-first shortlist inside the fit band", () => {
  const ranked = [
    { productId: "overall", rawFit: 0.90, walkingCapability: 4, portability: 4 },
    { productId: "ride", rawFit: 0.86, walkingCapability: 5, portability: 2 },
    { productId: "portable", rawFit: 0.85, walkingCapability: 2, portability: 5 },
    { productId: "outside", rawFit: 0.81, walkingCapability: 5, portability: 5 }
  ];
  const shortlist = engine.selectShortlist(ranked);
  assert.deepEqual(shortlist.map((item) => [item.productId, item.shortlistRole]), [
    ["overall", "overall"],
    ["ride", "ride-first"],
    ["portable", "portability-first"]
  ]);
});

test("labels out-of-band fillers as next closest instead of specialists", () => {
  const ranked = [
    { productId: "overall", rawFit: 0.90, walkingCapability: 4, portability: 4 },
    { productId: "near", rawFit: 0.85, walkingCapability: 5, portability: 2 },
    { productId: "far", rawFit: 0.70, walkingCapability: 2, portability: 5 }
  ];
  const shortlist = engine.selectShortlist(ranked);
  assert.deepEqual(shortlist.map((item) => item.shortlistRole), ["overall", "ride-first", "next-closest"]);
});

test("every valid real-catalog scenario produces eligible, unique, deterministic results", () => {
  const catalog = loadCatalog();
  const routines = Object.keys(engine.ROUTINE_DELTAS);
  const roles = Object.keys(engine.ROLE_DELTAS);
  const setups = ["flat", "bassinet", "car", "flexible"];
  const lifting = Object.keys(engine.LIFTING_DELTAS);
  const priorityPairs = [];
  for (let first = 0; first < engine.DIMENSIONS.length; first += 1) {
    for (let second = first + 1; second < engine.DIMENSIONS.length; second += 1) {
      priorityPairs.push([engine.DIMENSIONS[first], engine.DIMENSIONS[second]]);
    }
  }

  let scenarioCount = 0;
  routines.forEach((primary) => {
    [null, ...routines.filter((value) => value !== primary)].forEach((secondary) => {
      roles.forEach((role) => {
        setups.forEach((setup) => {
          lifting.forEach((liftingFrequency) => {
            priorityPairs.forEach((priorities) => {
              const base = answers({ routines: { primary, secondary }, role, setup, lifting: liftingFrequency, priorities });
              const powerChoices = engine.shouldAskPowered(base) ? [false, true] : [false];
              powerChoices.forEach((includePowered) => {
                const currentAnswers = { ...base, includePowered };
                const result = engine.recommend(catalog.products, currentAnswers, { catalogVersion: catalog.version });
                assert.equal(result.ok, true);
                assert.ok(result.recommendations.length >= 1 && result.recommendations.length <= 3);
                assert.equal(new Set(result.recommendations.map((item) => item.productId)).size, result.recommendations.length);
                assert.equal(result.recommendations[0].productId, result.ranked[0].productId);
                result.ranked.forEach((item) => {
                  assert.ok(includePowered || item.product.propulsion === "standard");
                  assert.ok(setup === "flexible" || item.product.modes[setup] !== "unsupported");
                });
                scenarioCount += 1;
              });
            });
          });
        });
      });
    });
  });
  assert.equal(scenarioCount, 14040);
});
