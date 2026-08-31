(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.FirstStrollRecommendation = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ALGORITHM_VERSION = 2;
  var DIMENSIONS = ["lift", "ride", "trail", "basket", "car", "finish"];
  var ALTERNATIVE_BAND = 0.08;

  var DEFAULT_PROFILE = {
    id: "central-richmond-tesla-suv",
    version: 1,
    locationDelta: { ride: 2, trail: 1, basket: 1 },
    vehicleDelta: { car: 2, lift: 1 }
  };

  var ROUTINE_DELTAS = {
    sidewalks: { ride: 4, basket: 2 },
    car: { car: 4, lift: 2 },
    transit: { lift: 6 },
    rough: { trail: 4, ride: 2 }
  };

  var ROLE_DELTAS = {
    "all-rounder": { ride: 2, basket: 2, car: 1, lift: 1 },
    "walking-primary": { ride: 3, trail: 2, basket: 1 },
    "compact-companion": { lift: 4, car: 2 }
  };

  var LIFTING_DELTAS = {
    daily: { lift: 4 },
    sometimes: { lift: 2 },
    rarely: { ride: 1, basket: 1 }
  };

  var FORM_FACTOR_PORTABILITY = {
    "compact-travel": 5,
    "full-size": 3,
    "all-terrain": 1
  };

  var REASON_LABELS = {
    lift: "Easy fold & carry",
    ride: "Cushioned ride",
    trail: "Rough-path ready",
    basket: "Roomy storage",
    car: "Easy car transfers",
    finish: "Premium finish"
  };

  function applyDelta(weights, delta, multiplier) {
    if (!delta) { return; }
    var scale = multiplier === undefined ? 1 : multiplier;
    Object.keys(delta).forEach(function (dimension) {
      weights[dimension] += delta[dimension] * scale;
    });
  }

  function isOneOf(value, values) {
    return values.indexOf(value) !== -1;
  }

  function validateAnswers(answers) {
    var errors = [];
    var routines = answers && answers.routines;
    var routineValues = Object.keys(ROUTINE_DELTAS);

    if (!answers || typeof answers !== "object") {
      return ["Answers are required."];
    }
    if (!routines || !isOneOf(routines.primary, routineValues)) {
      errors.push("A valid primary routine is required.");
    }
    if (routines && routines.secondary !== null && routines.secondary !== undefined) {
      if (!isOneOf(routines.secondary, routineValues)) {
        errors.push("The secondary routine is invalid.");
      } else if (routines.secondary === routines.primary) {
        errors.push("Primary and secondary routines must be different.");
      }
    }
    if (!isOneOf(answers.role, Object.keys(ROLE_DELTAS))) {
      errors.push("A valid stroller role is required.");
    }
    if (!isOneOf(answers.setup, ["flat", "bassinet", "car", "flexible"])) {
      errors.push("A valid newborn setup is required.");
    }
    if (!isOneOf(answers.lifting, Object.keys(LIFTING_DELTAS))) {
      errors.push("A valid lifting frequency is required.");
    }
    if (!Array.isArray(answers.priorities) || answers.priorities.length !== 2) {
      errors.push("Exactly two priorities are required.");
    } else {
      if (answers.priorities[0] === answers.priorities[1]) {
        errors.push("Priorities must be distinct.");
      }
      answers.priorities.forEach(function (priority) {
        if (!isOneOf(priority, DIMENSIONS)) {
          errors.push("Unknown priority: " + priority + ".");
        }
      });
    }
    if (typeof answers.includePowered !== "boolean") {
      errors.push("includePowered must be a boolean.");
    }
    return errors;
  }

  function shouldAskPowered(answers) {
    if (!answers || !answers.routines) { return false; }
    return answers.routines.primary === "rough" ||
      answers.routines.secondary === "rough" ||
      (Array.isArray(answers.priorities) && answers.priorities.indexOf("trail") !== -1);
  }

  function buildWeights(answers, profile) {
    var errors = validateAnswers(answers);
    if (errors.length) {
      throw new Error(errors.join(" "));
    }

    var activeProfile = profile || DEFAULT_PROFILE;
    var weights = {};
    DIMENSIONS.forEach(function (dimension) { weights[dimension] = 1; });
    applyDelta(weights, activeProfile.locationDelta || DEFAULT_PROFILE.locationDelta);
    applyDelta(weights, activeProfile.vehicleDelta || DEFAULT_PROFILE.vehicleDelta);
    applyDelta(weights, ROUTINE_DELTAS[answers.routines.primary]);
    if (answers.routines.secondary) {
      applyDelta(weights, ROUTINE_DELTAS[answers.routines.secondary], 0.5);
    }
    applyDelta(weights, ROLE_DELTAS[answers.role]);
    applyDelta(weights, LIFTING_DELTAS[answers.lifting]);
    answers.priorities.forEach(function (dimension) {
      weights[dimension] += 3;
    });
    return weights;
  }

  function isEligible(product, answers) {
    if (product.propulsion === "powered" && !answers.includePowered) {
      return false;
    }
    if (product.propulsion !== "standard" && product.propulsion !== "powered") {
      return false;
    }
    return answers.setup === "flexible" || product.modes[answers.setup] !== "unsupported";
  }

  function rawFitForProduct(product, weights) {
    var totalWeight = DIMENSIONS.reduce(function (sum, dimension) {
      return sum + weights[dimension];
    }, 0);
    var weightedScore = DIMENSIONS.reduce(function (sum, dimension) {
      return sum + (product.scores[dimension] * weights[dimension]);
    }, 0);
    return weightedScore / (5 * totalWeight);
  }

  function walkingCapability(product) {
    return (product.scores.ride * 0.50) +
      (product.scores.trail * 0.35) +
      (product.scores.basket * 0.15);
  }

  function portability(product) {
    var formFactorScore = FORM_FACTOR_PORTABILITY[product.formFactor] || 1;
    return (product.scores.lift * 0.70) + (formFactorScore * 0.30);
  }

  function getReasonDimensions(product, weights, count) {
    var limit = count || 2;
    var contributions = DIMENSIONS.map(function (dimension, index) {
      return {
        dimension: dimension,
        contribution: product.scores[dimension] * weights[dimension],
        score: product.scores[dimension],
        stableIndex: index
      };
    }).sort(function (a, b) {
      return b.contribution - a.contribution || b.score - a.score || a.stableIndex - b.stableIndex;
    });

    var reasons = contributions.filter(function (item) {
      return item.score >= 4;
    }).slice(0, limit);

    if (reasons.length < limit) {
      contributions.forEach(function (item) {
        if (reasons.length < limit && !reasons.some(function (reason) {
          return reason.dimension === item.dimension;
        })) {
          reasons.push(item);
        }
      });
    }
    return reasons.map(function (item) { return item.dimension; });
  }

  function rankProducts(products, answers, profile) {
    var weights = buildWeights(answers, profile);
    return products.filter(function (product) {
      return isEligible(product, answers);
    }).map(function (product) {
      var rawFit = rawFitForProduct(product, weights);
      return {
        product: product,
        productId: product.id,
        rawFit: rawFit,
        fitScore: Math.round(rawFit * 100),
        walkingCapability: walkingCapability(product),
        portability: portability(product),
        reasonDimensions: getReasonDimensions(product, weights, 2)
      };
    }).sort(function (a, b) {
      return b.rawFit - a.rawFit || a.productId.localeCompare(b.productId);
    });
  }

  function sortSpecialists(candidates, metric) {
    return candidates.slice().sort(function (a, b) {
      return b[metric] - a[metric] || b.rawFit - a.rawFit || a.productId.localeCompare(b.productId);
    });
  }

  function selectShortlist(ranked) {
    if (!ranked.length) { return []; }

    var chosen = [];
    var overall = ranked[0];
    chosen.push(Object.assign({}, overall, { shortlistRole: "overall" }));

    var band = ranked.slice(1).filter(function (candidate) {
      return overall.rawFit - candidate.rawFit <= ALTERNATIVE_BAND;
    });
    var rideFirst = sortSpecialists(band, "walkingCapability")[0];
    if (rideFirst) {
      chosen.push(Object.assign({}, rideFirst, { shortlistRole: "ride-first" }));
    }

    var usedIds = chosen.map(function (item) { return item.productId; });
    var portabilityCandidates = band.filter(function (candidate) {
      return usedIds.indexOf(candidate.productId) === -1;
    });
    var portabilityFirst = sortSpecialists(portabilityCandidates, "portability")[0];
    if (portabilityFirst) {
      chosen.push(Object.assign({}, portabilityFirst, { shortlistRole: "portability-first" }));
    }

    ranked.forEach(function (candidate) {
      if (chosen.length >= 3) { return; }
      if (!chosen.some(function (item) { return item.productId === candidate.productId; })) {
        chosen.push(Object.assign({}, candidate, { shortlistRole: "next-closest" }));
      }
    });
    return chosen;
  }

  function recommend(products, answers, profile) {
    var activeProfile = Object.assign({}, DEFAULT_PROFILE, profile || {});
    var errors = validateAnswers(answers);
    if (errors.length) {
      return { ok: false, errors: errors, recommendations: [] };
    }
    var weights = buildWeights(answers, activeProfile);
    var ranked = rankProducts(products, answers, activeProfile);
    var recommendations = selectShortlist(ranked);
    return {
      ok: true,
      algorithmVersion: ALGORITHM_VERSION,
      catalogVersion: activeProfile.catalogVersion || null,
      profileId: activeProfile.id,
      profileVersion: activeProfile.version,
      weights: weights,
      ranked: ranked,
      recommendations: recommendations,
      emptyReason: ranked.length ? null : "no-compatible-products"
    };
  }

  return {
    ALGORITHM_VERSION: ALGORITHM_VERSION,
    ALTERNATIVE_BAND: ALTERNATIVE_BAND,
    DIMENSIONS: DIMENSIONS,
    DEFAULT_PROFILE: DEFAULT_PROFILE,
    ROUTINE_DELTAS: ROUTINE_DELTAS,
    ROLE_DELTAS: ROLE_DELTAS,
    LIFTING_DELTAS: LIFTING_DELTAS,
    REASON_LABELS: REASON_LABELS,
    validateAnswers: validateAnswers,
    shouldAskPowered: shouldAskPowered,
    buildWeights: buildWeights,
    rawFitForProduct: rawFitForProduct,
    walkingCapability: walkingCapability,
    portability: portability,
    getReasonDimensions: getReasonDimensions,
    rankProducts: rankProducts,
    selectShortlist: selectShortlist,
    recommend: recommend
  };
}));
