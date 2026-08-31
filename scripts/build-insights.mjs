import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const reviewsPath = path.join(repositoryRoot, "reviews.json");
const forumsPath = path.join(repositoryRoot, "forums.json");
const outputPath = path.join(repositoryRoot, "insights.js");

const reviews = JSON.parse(fs.readFileSync(reviewsPath, "utf8"));
const forums = JSON.parse(fs.readFileSync(forumsPath, "utf8"));

const reviewSources = new Map(reviews.sources.map((source) => [source.id, source]));
const forumThreads = new Map();
forums.forums.forEach((forum) => {
  forum.threads.forEach((thread) => {
    forumThreads.set(thread.id, {
      id: thread.id,
      title: thread.title,
      url: thread.url,
      publishedOn: thread.publishedOn,
      forumName: forum.name,
      platform: forum.platform
    });
  });
});

const productFindings = new Map(
  forums.productFindings.map((finding) => [finding.catalogProductId, finding])
);

function textOf(item) {
  return item && item.text ? item.text : "";
}

function sourceIdsFrom(item) {
  return item && Array.isArray(item.sourceIds) ? item.sourceIds : [];
}

function compactSource(source) {
  return {
    id: source.id,
    type: source.type,
    publisher: source.publisher,
    title: source.title,
    url: source.url,
    market: source.market,
    accessedOn: source.accessedOn
  };
}

function buildReviewInsight(product) {
  const bestFor = product.bestFor[0] || null;
  const avoidIf = product.avoidIf[0] || null;
  const sourceIds = new Set([
    ...sourceIdsFrom(product.verdict),
    ...sourceIdsFrom(bestFor),
    ...sourceIdsFrom(avoidIf),
    ...sourceIdsFrom(product.safetyCheck.summary),
    ...(product.safetyCheck.checkedSourceIds || [])
  ]);

  const sources = [...sourceIds]
    .map((id) => reviewSources.get(id))
    .filter(Boolean)
    .map(compactSource)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    status: product.reviewStatus,
    confidence: product.confidence,
    reviewedSetup: product.reviewedSetup,
    verdict: textOf(product.verdict),
    bestFor: textOf(bestFor),
    avoidIf: textOf(avoidIf),
    safety: {
      status: product.safetyCheck.status,
      summary: textOf(product.safetyCheck.summary),
      applicability: product.safetyCheck.applicability,
      action: product.safetyCheck.action
    },
    sources
  };
}

function buildCommunityInsight(productId) {
  const finding = productFindings.get(productId);
  if (!finding) {
    throw new Error(`Missing forum finding for ${productId}`);
  }
  return {
    sentiment: finding.sentiment,
    threadCount: finding.coverage.threadCount,
    forumCount: finding.coverage.forumCount,
    positiveThemes: finding.positiveThemes,
    concerns: finding.concerns,
    threads: finding.evidenceThreadIds
      .map((id) => forumThreads.get(id))
      .filter(Boolean)
      .sort((a, b) => a.id.localeCompare(b.id))
  };
}

const products = {};
reviews.products
  .slice()
  .sort((a, b) => a.productId.localeCompare(b.productId))
  .forEach((product) => {
    products[product.productId] = {
      productName: product.productName,
      review: buildReviewInsight(product),
      community: buildCommunityInsight(product.productId)
    };
  });

const bundle = {
  schemaVersion: 1,
  reviewSetVersion: reviews.reviewSetVersion,
  catalogVersion: reviews.catalogVersion,
  researchedOn: {
    reviews: reviews.researchedOn,
    forums: forums.researchedOn
  },
  evidenceBoundary: forums.methodology.authorityBoundary,
  maxForumThreadCount: Math.max(...forums.productFindings.map((finding) => finding.coverage.threadCount)),
  crossForumThemes: forums.crossForumThemes.map((theme) => ({
    id: theme.id,
    title: theme.title,
    summary: theme.summary
  })),
  products
};

const serialized = JSON.stringify(bundle, null, 2);
const output = `(function (root, factory) {\n` +
  `  "use strict";\n` +
  `  var data = factory();\n` +
  `  if (typeof module === "object" && module.exports) { module.exports = data; }\n` +
  `  if (root) { root.FIRST_STROLL_INSIGHTS = data; }\n` +
  `}(typeof globalThis !== "undefined" ? globalThis : this, function () {\n` +
  `  "use strict";\n` +
  `  return ${serialized};\n` +
  `}));\n`;

if (process.argv.includes("--check")) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== output) {
    console.error("insights.js is stale. Run npm run build:insights.");
    process.exit(1);
  }
  console.log("insights.js matches reviews.json and forums.json.");
} else {
  fs.writeFileSync(outputPath, output);
  console.log(`Wrote ${path.relative(repositoryRoot, outputPath)}.`);
}
