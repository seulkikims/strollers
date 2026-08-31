const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const insights = require("../insights.js");
const { loadCatalog } = require("./catalog-helper.cjs");

const root = path.resolve(__dirname, "..");
const reviews = JSON.parse(fs.readFileSync(path.join(root, "reviews.json"), "utf8"));
const forums = JSON.parse(fs.readFileSync(path.join(root, "forums.json"), "utf8"));

function sorted(values) {
  return values.slice().sort();
}

function collectValuesByKey(value, key, result = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectValuesByKey(item, key, result));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([entryKey, entryValue]) => {
      if (entryKey === key && Array.isArray(entryValue)) {
        result.push(...entryValue);
      } else {
        collectValuesByKey(entryValue, key, result);
      }
    });
  }
  return result;
}

test("catalog, review, forum, and generated insight IDs match one-to-one", () => {
  const catalog = loadCatalog();
  const catalogIds = sorted(catalog.products.map((product) => product.id));
  assert.equal(catalogIds.length, 35);
  assert.deepEqual(sorted(reviews.products.map((product) => product.productId)), catalogIds);
  assert.deepEqual(sorted(forums.productFindings.map((finding) => finding.catalogProductId)), catalogIds);
  assert.deepEqual(sorted(Object.keys(insights.products)), catalogIds);
  assert.equal(insights.catalogVersion, catalog.version);
  catalog.products.forEach((product) => {
    assert.equal(insights.products[product.id].productName, product.name);
  });
});

test("all review source references resolve", () => {
  const sourceIds = new Set(reviews.sources.map((source) => source.id));
  const references = collectValuesByKey(reviews.products, "sourceIds");
  const checkedReferences = collectValuesByKey(reviews.products, "checkedSourceIds");
  [...references, ...checkedReferences].forEach((id) => assert.ok(sourceIds.has(id), `Missing review source ${id}`));
});

test("forum evidence threads and coverage counts resolve", () => {
  const threadToForum = new Map();
  forums.forums.forEach((forum) => {
    forum.threads.forEach((thread) => threadToForum.set(thread.id, forum.id));
  });
  forums.productFindings.forEach((finding) => {
    finding.evidenceThreadIds.forEach((id) => assert.ok(threadToForum.has(id), `Missing forum thread ${id}`));
    assert.equal(finding.coverage.threadCount, finding.evidenceThreadIds.length, `${finding.catalogProductId} thread coverage`);
    const forumCount = new Set(finding.evidenceThreadIds.map((id) => threadToForum.get(id))).size;
    assert.equal(finding.coverage.forumCount, forumCount, `${finding.catalogProductId} forum coverage`);
  });
  forums.crossForumThemes.forEach((theme) => {
    theme.threadIds.forEach((id) => assert.ok(threadToForum.has(id), `Missing theme thread ${id}`));
  });
});

test("generated evidence preserves neutral sparse coverage and related notices", () => {
  const generatedProducts = Object.values(insights.products);
  assert.equal(generatedProducts.filter((product) => product.review.safety.status === "notice-found").length, 4);
  assert.equal(generatedProducts.filter((product) => product.community.sentiment === "insufficient").length, 29);
  assert.equal(generatedProducts.filter((product) => product.review.confidence === "low").length, 10);
});

test("runtime catalog no longer carries baseline or value scoring fields", () => {
  const catalog = loadCatalog();
  catalog.products.forEach((product) => {
    assert.equal("baselineFit" in product, false);
    assert.equal("value" in product.scores, false);
  });
});
