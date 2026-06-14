"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/handlers/evaluate-batch.ts
var evaluate_batch_exports = {};
__export(evaluate_batch_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(evaluate_batch_exports);

// src/engine/bundle-loader.ts
var import_client_s3 = require("@aws-sdk/client-s3");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var DEFAULT_CONFIG = {
  s3Bucket: process.env["POLICY_BUNDLE_BUCKET"] ?? "travel-policy-bundles",
  s3KeyPrefix: process.env["POLICY_BUNDLE_PREFIX"] ?? "bundles/",
  dynamoTableName: process.env["POLICY_BUNDLE_TABLE"] ?? "PolicyBundleCache",
  cacheTtlMs: Number(process.env["BUNDLE_CACHE_TTL_MS"] ?? 3e5),
  // 5 minutes default
  region: process.env["AWS_REGION"] ?? "eu-west-2"
};
var bundleCache = /* @__PURE__ */ new Map();
var s3Client = null;
var dynamoClient = null;
function getS3Client(config) {
  if (!s3Client) {
    s3Client = new import_client_s3.S3Client({ region: config.region });
  }
  return s3Client;
}
function getDynamoClient(config) {
  if (!dynamoClient) {
    dynamoClient = new import_client_dynamodb.DynamoDBClient({ region: config.region });
  }
  return dynamoClient;
}
async function loadPolicyGraph(tenantId, config = DEFAULT_CONFIG) {
  const cached = bundleCache.get(tenantId);
  if (cached && !isCacheExpired(cached, config.cacheTtlMs)) {
    return cached.graph;
  }
  const bundleMetadata = await getBundleMetadata(tenantId, config);
  if (cached && bundleMetadata && cached.version === bundleMetadata.version) {
    cached.loadedAt = Date.now();
    return cached.graph;
  }
  const s3Key = bundleMetadata?.s3Key ?? `${config.s3KeyPrefix}${tenantId}/latest.json`;
  const graph = await loadGraphFromS3(s3Key, config);
  bundleCache.set(tenantId, {
    graph,
    loadedAt: Date.now(),
    version: bundleMetadata?.version ?? graph.version.toString(),
    checksum: bundleMetadata?.checksum ?? graph.metadata.checksum
  });
  return graph;
}
function isCacheExpired(entry, ttlMs) {
  return Date.now() - entry.loadedAt > ttlMs;
}
async function getBundleMetadata(tenantId, config) {
  try {
    const client = getDynamoClient(config);
    const response = await client.send(
      new import_client_dynamodb.GetItemCommand({
        TableName: config.dynamoTableName,
        Key: {
          tenantId: { S: tenantId },
          bundleVersion: { S: "LATEST" }
        }
      })
    );
    if (!response.Item) {
      return null;
    }
    return {
      version: response.Item["bundleVersion"]?.S ?? "0",
      s3Key: response.Item["bundleS3Key"]?.S ?? "",
      checksum: response.Item["checksum"]?.S ?? ""
    };
  } catch (error) {
    console.warn(`Failed to get bundle metadata for tenant ${tenantId}:`, error);
    return null;
  }
}
async function loadGraphFromS3(s3Key, config) {
  const client = getS3Client(config);
  const response = await client.send(
    new import_client_s3.GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: s3Key
    })
  );
  const body = await response.Body?.transformToString();
  if (!body) {
    throw new Error(`Empty policy bundle at s3://${config.s3Bucket}/${s3Key}`);
  }
  const graph = JSON.parse(body);
  if (!graph.graphId || !graph.rootNodeId || !graph.nodes || !graph.edges) {
    throw new Error(`Invalid policy graph structure at s3://${config.s3Bucket}/${s3Key}`);
  }
  return graph;
}

// src/engine/condition-evaluator.ts
function resolveField(input, field) {
  const parts = field.split(".");
  const rootKey = parts[0];
  let current;
  if (rootKey === "traveller") {
    current = input.traveller;
  } else if (rootKey === "trip") {
    current = input.trip;
  } else if (rootKey === "offer") {
    current = input.offer;
  } else if (rootKey === "metadata") {
    current = input.metadata;
  } else {
    current = input.traveller[rootKey] ?? input.trip[rootKey] ?? input.offer[rootKey] ?? input.metadata?.[rootKey];
    if (current !== void 0 && parts.length === 1) {
      return current;
    }
    if (current === void 0) {
      return void 0;
    }
  }
  for (let i = 1; i < parts.length; i++) {
    if (current === null || current === void 0) {
      return void 0;
    }
    if (typeof current === "object") {
      current = current[parts[i]];
    } else {
      return void 0;
    }
  }
  return current;
}
function evaluateCondition(condition, input) {
  const fieldValue = resolveField(input, condition.field);
  const targetValue = condition.value;
  return compareValues(fieldValue, condition.operator, targetValue);
}
function compareValues(fieldValue, operator, targetValue) {
  switch (operator) {
    case "eq":
      return isEqual(fieldValue, targetValue);
    case "neq":
      return !isEqual(fieldValue, targetValue);
    case "gt":
      return toNumber(fieldValue) > toNumber(targetValue);
    case "gte":
      return toNumber(fieldValue) >= toNumber(targetValue);
    case "lt":
      return toNumber(fieldValue) < toNumber(targetValue);
    case "lte":
      return toNumber(fieldValue) <= toNumber(targetValue);
    case "in":
      return isIn(fieldValue, targetValue);
    case "not_in":
      return !isIn(fieldValue, targetValue);
    case "contains":
      return doesContain(fieldValue, targetValue);
    case "matches":
      return doesMatch(fieldValue, targetValue);
    case "between":
      return isBetween(fieldValue, targetValue);
    default:
      return false;
  }
}
function isEqual(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "string") return a === Number(b);
  if (typeof a === "string" && typeof b === "number") return Number(a) === b;
  return String(a) === String(b);
}
function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}
function isIn(fieldValue, targetValue) {
  if (!Array.isArray(targetValue)) return false;
  return targetValue.some((item) => isEqual(fieldValue, item));
}
function doesContain(fieldValue, targetValue) {
  if (typeof fieldValue === "string" && typeof targetValue === "string") {
    return fieldValue.includes(targetValue);
  }
  if (Array.isArray(fieldValue)) {
    return fieldValue.some((item) => isEqual(item, targetValue));
  }
  return false;
}
function doesMatch(fieldValue, targetValue) {
  if (typeof fieldValue !== "string" || typeof targetValue !== "string") {
    return false;
  }
  try {
    const regex = new RegExp(targetValue);
    return regex.test(fieldValue);
  } catch {
    return false;
  }
}
function isBetween(fieldValue, targetValue) {
  if (!Array.isArray(targetValue) || targetValue.length !== 2) {
    return false;
  }
  const numValue = toNumber(fieldValue);
  const lower = toNumber(targetValue[0]);
  const upper = toNumber(targetValue[1]);
  return numValue >= lower && numValue <= upper;
}

// src/engine/policy-evaluator.ts
function evaluatePolicy(request, graph) {
  const startTime = Date.now();
  const nodeMap = /* @__PURE__ */ new Map();
  for (const node of graph.nodes) {
    nodeMap.set(node.nodeId, node);
  }
  const edgesBySource = /* @__PURE__ */ new Map();
  for (const edge of graph.edges) {
    const existing = edgesBySource.get(edge.fromNodeId) ?? [];
    existing.push(edge);
    edgesBySource.set(edge.fromNodeId, existing);
  }
  const allResults = [];
  for (const offer of request.offers) {
    const input = {
      traveller: flattenObject(request.traveller),
      trip: flattenObject(request.trip),
      offer: flattenObject(offer),
      metadata: request.metadata
    };
    const result = walkGraph(graph.rootNodeId, nodeMap, edgesBySource, input, graph);
    allResults.push(result);
  }
  const mergedResult = mergeResults(allResults);
  const alternatives = findAlternatives(request.offers, allResults);
  const evaluatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const durationMs = Date.now() - startTime;
  return {
    decisionId: generateDecisionId(),
    tenantId: request.tenantId,
    result: mergedResult.result,
    winningRules: mergedResult.winningRules,
    reasons: mergedResult.reasons,
    obligations: mergedResult.obligations,
    alternatives: [...mergedResult.alternatives, ...alternatives],
    evaluatedAt,
    expiresAt: new Date(Date.now() + 30 * 60 * 1e3).toISOString(),
    // 30 min expiry
    durationMs
  };
}
function walkGraph(nodeId, nodeMap, edgesBySource, input, graph) {
  const node = nodeMap.get(nodeId);
  if (!node) {
    return defaultResult();
  }
  switch (node.type) {
    case "terminal":
      return terminalToResult(node, graph);
    case "condition": {
      const conditionMet = node.condition ? evaluateCondition(node.condition, input) : false;
      const edges = edgesBySource.get(nodeId) ?? [];
      const nextEdge = findMatchingEdge(edges, conditionMet);
      if (nextEdge) {
        return walkGraph(nextEdge.toNodeId, nodeMap, edgesBySource, input, graph);
      }
      return defaultResult();
    }
    case "gate": {
      return evaluateGate(node, nodeMap, edgesBySource, input, graph);
    }
    case "action": {
      const actionResult = evaluateAction(node, graph);
      const edges = edgesBySource.get(nodeId) ?? [];
      if (edges.length > 0) {
        const nextResult = walkGraph(edges[0].toNodeId, nodeMap, edgesBySource, input, graph);
        return mergeResults([actionResult, nextResult]);
      }
      return actionResult;
    }
    default:
      return defaultResult();
  }
}
function evaluateGate(node, nodeMap, edgesBySource, input, graph) {
  const edges = edgesBySource.get(node.nodeId) ?? [];
  if (edges.length === 0) {
    return defaultResult();
  }
  const sortedEdges = [...edges].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  const childResults = [];
  for (const edge of sortedEdges) {
    const result = walkGraph(edge.toNodeId, nodeMap, edgesBySource, input, graph);
    childResults.push(result);
  }
  switch (node.operator) {
    case "and": {
      const hasReject = childResults.some((r) => r.result === "reject");
      if (hasReject) {
        return mergeResults(childResults.filter((r) => r.result === "reject"));
      }
      const hasReview = childResults.some((r) => r.result === "review");
      if (hasReview) {
        return mergeResults(childResults.filter((r) => r.result === "review"));
      }
      return mergeResults(childResults);
    }
    case "or": {
      const hasApprove = childResults.some((r) => r.result === "approve");
      if (hasApprove) {
        return mergeResults(childResults.filter((r) => r.result === "approve"));
      }
      const hasReview = childResults.some((r) => r.result === "review");
      if (hasReview) {
        return mergeResults(childResults.filter((r) => r.result === "review"));
      }
      return mergeResults(childResults);
    }
    case "not": {
      if (childResults.length > 0) {
        const inverted = { ...childResults[0] };
        if (inverted.result === "approve") {
          inverted.result = "reject";
        } else if (inverted.result === "reject") {
          inverted.result = "approve";
        }
        return inverted;
      }
      return defaultResult();
    }
    default:
      return mergeResults(childResults);
  }
}
function evaluateAction(node, graph) {
  if (!node.action) {
    return defaultResult();
  }
  const action = node.action;
  const result = {
    result: "approve",
    winningRules: [],
    reasons: [],
    obligations: [],
    alternatives: []
  };
  switch (action.type) {
    case "approve":
      result.result = "approve";
      break;
    case "reject":
      result.result = "reject";
      if (action.params["reason"]) {
        result.reasons.push(String(action.params["reason"]));
      }
      break;
    case "review":
      result.result = "review";
      if (action.params["reason"]) {
        result.reasons.push(String(action.params["reason"]));
      }
      break;
    case "add_obligation":
      result.obligations.push({
        type: action.params["obligationType"] ?? "require_approval",
        description: String(action.params["description"] ?? "Approval required"),
        metadata: action.params["metadata"]
      });
      result.result = "review";
      break;
    case "suggest_alternative":
      result.alternatives.push({
        offerId: String(action.params["offerId"] ?? ""),
        reason: String(action.params["reason"] ?? "A cheaper alternative is available"),
        savingsAmount: action.params["savingsAmount"],
        carbonSavingsKg: action.params["carbonSavingsKg"]
      });
      break;
    case "warn":
      if (action.params["reason"]) {
        result.reasons.push(String(action.params["reason"]));
      }
      break;
  }
  if (action.params["ruleName"]) {
    result.winningRules.push({
      ruleId: String(action.params["ruleId"] ?? node.nodeId),
      ruleName: String(action.params["ruleName"]),
      priority: Number(action.params["priority"] ?? 100),
      outcome: result.result
    });
  }
  return result;
}
function terminalToResult(node, graph) {
  const terminal = node.terminal;
  if (!terminal) {
    return defaultResult();
  }
  const ruleMetadata = graph.metadata.rules?.find((r) => {
    return r.entryNodeId === node.nodeId;
  });
  const winningRules = [];
  if (ruleMetadata) {
    winningRules.push({
      ruleId: ruleMetadata.entryNodeId,
      ruleName: ruleMetadata.name,
      priority: ruleMetadata.priority ?? 100,
      outcome: terminal.result
    });
  }
  return {
    result: terminal.result,
    winningRules,
    reasons: [...terminal.reasons],
    obligations: [...terminal.obligations],
    alternatives: []
  };
}
function findMatchingEdge(edges, conditionMet) {
  const conditionLabel = conditionMet ? "true" : "false";
  const matchingEdge = edges.find((e) => e.condition === conditionLabel);
  if (matchingEdge) return matchingEdge;
  const defaultEdge = edges.find((e) => e.condition === "default" || !e.condition);
  return defaultEdge;
}
function mergeResults(results) {
  if (results.length === 0) return defaultResult();
  if (results.length === 1) return results[0];
  const merged = {
    result: "approve",
    winningRules: [],
    reasons: [],
    obligations: [],
    alternatives: []
  };
  for (const r of results) {
    if (resultPriority(r.result) > resultPriority(merged.result)) {
      merged.result = r.result;
    }
    merged.winningRules.push(...r.winningRules);
    merged.reasons.push(...r.reasons);
    merged.obligations.push(...r.obligations);
    merged.alternatives.push(...r.alternatives);
  }
  merged.reasons = [...new Set(merged.reasons)];
  return merged;
}
function resultPriority(result) {
  switch (result) {
    case "reject":
      return 3;
    case "review":
      return 2;
    case "approve":
      return 1;
    default:
      return 0;
  }
}
function findAlternatives(offers, results) {
  const alternatives = [];
  for (let i = 0; i < offers.length; i++) {
    if (results[i]?.result === "approve") {
      for (let j = 0; j < offers.length; j++) {
        if (i !== j && results[j]?.result === "reject") {
          const approvedPrice = offers[i].totalPrice.amount;
          const rejectedPrice = offers[j].totalPrice.amount;
          if (approvedPrice < rejectedPrice) {
            alternatives.push({
              offerId: offers[i].offerId,
              reason: `Compliant alternative saving ${offers[j].totalPrice.currency} ${(rejectedPrice - approvedPrice).toFixed(2)}`,
              savingsAmount: {
                amount: rejectedPrice - approvedPrice,
                currency: offers[j].totalPrice.currency
              }
            });
          }
        }
      }
    }
  }
  return alternatives;
}
function flattenObject(obj) {
  if (obj === null || obj === void 0) return {};
  if (typeof obj !== "object") return {};
  return obj;
}
function defaultResult() {
  return {
    result: "approve",
    winningRules: [],
    reasons: [],
    obligations: [],
    alternatives: []
  };
}
function generateDecisionId() {
  return `dec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// src/engine/conflict-resolver.ts
function resolveConflicts(outcomes, strategy = "highest_priority") {
  if (outcomes.length === 0) {
    return {
      result: "approve",
      winningRule: {
        ruleId: "default",
        ruleName: "Default (no rules matched)",
        priority: Number.MAX_SAFE_INTEGER,
        result: "approve",
        reasons: ["No rules matched; default approve"]
      },
      strategy,
      conflictsDetected: false
    };
  }
  if (outcomes.length === 1) {
    return {
      result: outcomes[0].result,
      winningRule: outcomes[0],
      strategy,
      conflictsDetected: false
    };
  }
  const uniqueResults = new Set(outcomes.map((o) => o.result));
  const conflictsDetected = uniqueResults.size > 1;
  const winner = selectWinner(outcomes, strategy);
  return {
    result: winner.result,
    winningRule: winner,
    strategy,
    conflictsDetected
  };
}
function selectWinner(outcomes, strategy) {
  switch (strategy) {
    case "highest_priority":
      return selectByPriority(outcomes);
    case "most_restrictive":
      return selectMostRestrictive(outcomes);
    case "most_permissive":
      return selectMostPermissive(outcomes);
    default:
      return selectByPriority(outcomes);
  }
}
function selectByPriority(outcomes) {
  const sorted = [...outcomes].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return restrictiveness(b.result) - restrictiveness(a.result);
  });
  return sorted[0];
}
function selectMostRestrictive(outcomes) {
  const sorted = [...outcomes].sort((a, b) => {
    const restrictDiff = restrictiveness(b.result) - restrictiveness(a.result);
    if (restrictDiff !== 0) return restrictDiff;
    return a.priority - b.priority;
  });
  return sorted[0];
}
function selectMostPermissive(outcomes) {
  const sorted = [...outcomes].sort((a, b) => {
    const restrictDiff = restrictiveness(a.result) - restrictiveness(b.result);
    if (restrictDiff !== 0) return restrictDiff;
    return a.priority - b.priority;
  });
  return sorted[0];
}
function restrictiveness(result) {
  switch (result) {
    case "reject":
      return 3;
    case "review":
      return 2;
    case "approve":
      return 1;
    default:
      return 0;
  }
}
function winningRulesToOutcomes(winningRules, reasonsByRule) {
  return winningRules.map((rule) => ({
    ruleId: rule.ruleId,
    ruleName: rule.ruleName,
    priority: rule.priority,
    result: rule.outcome,
    reasons: reasonsByRule?.get(rule.ruleId) ?? []
  }));
}

// src/engine/budget-calculator.ts
function calculateBudgetStatus(input) {
  const { offers, budgetConfig } = input;
  if (!budgetConfig) {
    return void 0;
  }
  const totalOfferCost = offers.reduce((sum, offer) => sum + offer.totalPrice.amount, 0);
  const currency = budgetConfig.totalBudget.currency;
  const currentAmount = budgetConfig.currentUtilisation.amount;
  const projectedAmount = currentAmount + totalOfferCost;
  const totalBudgetAmount = budgetConfig.totalBudget.amount;
  const percentUsed = totalBudgetAmount > 0 ? Math.round(projectedAmount / totalBudgetAmount * 1e4) / 100 : 0;
  return {
    budgetId: budgetConfig.budgetId,
    budgetName: budgetConfig.budgetName,
    totalBudget: budgetConfig.totalBudget,
    currentUtilisation: { amount: currentAmount, currency },
    projectedUtilisation: { amount: projectedAmount, currency },
    percentUsed,
    warningThreshold: budgetConfig.warningThreshold
  };
}
async function loadBudgetConfig(tenantId, traveller) {
  void tenantId;
  void traveller;
  return void 0;
}

// src/engine/carbon-calculator.ts
var EMISSION_FACTORS = {
  air: 0.255,
  // kg CO2 per passenger-km (average)
  rail: 0.041,
  // kg CO2 per passenger-km
  car: 0.171,
  // kg CO2 per km (average occupancy)
  hotel: 20
  // kg CO2 per night (average)
};
var CABIN_CLASS_MULTIPLIERS = {
  economy: 1,
  premium_economy: 1.5,
  business: 2.9,
  first: 4
};
var DEFAULT_DISTANCES = {
  domestic: 500,
  international: 3e3,
  "multi-city": 5e3
};
function calculateCarbonImpact(input) {
  const { offers, tripType, distanceKm } = input;
  let totalEstimatedKg = 0;
  let totalAverageKg = 0;
  let hasLowerCarbonAlternative = false;
  const offerEmissions = [];
  for (const offer of offers) {
    const estimatedKg = estimateOfferEmissions(offer, tripType, distanceKm);
    offerEmissions.push(estimatedKg);
    totalEstimatedKg += estimatedKg;
    const averageKg = estimateAverageEmissions(offer.productType, tripType, distanceKm);
    totalAverageKg += averageKg;
  }
  if (offerEmissions.length > 1) {
    const minEmission = Math.min(...offerEmissions);
    const maxEmission = Math.max(...offerEmissions);
    hasLowerCarbonAlternative = maxEmission > minEmission * 1.1;
  }
  const comparisonToAverage = totalAverageKg > 0 ? Math.round(totalEstimatedKg / totalAverageKg * 100) / 100 : 1;
  return {
    estimatedKg: Math.round(totalEstimatedKg * 10) / 10,
    comparisonToAverage,
    lowerCarbonAlternativeAvailable: hasLowerCarbonAlternative
  };
}
function estimateOfferEmissions(offer, tripType, distanceKm) {
  if (offer.carbonFootprintKg !== void 0 && offer.carbonFootprintKg > 0) {
    return offer.carbonFootprintKg;
  }
  const productType = offer.productType;
  if (productType === "hotel") {
    return EMISSION_FACTORS["hotel"] ?? 20;
  }
  const distance = distanceKm ?? getDefaultDistance(tripType);
  const baseFactor = EMISSION_FACTORS[productType] ?? EMISSION_FACTORS["air"];
  const cabinMultiplier = getCabinClassMultiplier(offer.cabinClass);
  return distance * baseFactor * cabinMultiplier;
}
function estimateAverageEmissions(productType, tripType, distanceKm) {
  if (productType === "hotel") {
    return EMISSION_FACTORS["hotel"] ?? 20;
  }
  const distance = distanceKm ?? getDefaultDistance(tripType);
  const baseFactor = EMISSION_FACTORS[productType] ?? EMISSION_FACTORS["air"];
  return distance * baseFactor;
}
function getCabinClassMultiplier(cabinClass) {
  if (!cabinClass) return 1;
  return CABIN_CLASS_MULTIPLIERS[cabinClass.toLowerCase()] ?? 1;
}
function getDefaultDistance(tripType) {
  if (!tripType) return DEFAULT_DISTANCES["domestic"];
  return DEFAULT_DISTANCES[tripType] ?? DEFAULT_DISTANCES["domestic"];
}

// src/handlers/evaluate-batch.ts
var CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Tenant-Id"
};
async function handler(event) {
  const requestId = event.requestContext?.requestId ?? generateRequestId();
  const startTime = Date.now();
  try {
    if (!event.body) {
      return errorResponse(400, "MISSING_BODY", "Request body is required", requestId);
    }
    let request;
    try {
      request = JSON.parse(event.body);
    } catch {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON", requestId);
    }
    const validationError = validateBatchRequest(request);
    if (validationError) {
      return errorResponse(400, "VALIDATION_ERROR", validationError, requestId);
    }
    const graph = await loadPolicyGraph(request.tenantId);
    const conflictStrategy = request.conflictResolution ?? "highest_priority";
    const budgetConfig = await loadBudgetConfig(request.tenantId, request.traveller);
    const decisions = [];
    for (const offer of request.offers) {
      const singleRequest = {
        tenantId: request.tenantId,
        decisionPoint: request.decisionPoint,
        traveller: request.traveller,
        trip: request.trip,
        offers: [offer]
      };
      const decision = evaluatePolicy(singleRequest, graph);
      const enrichedDecision = applyConflictResolution(decision, conflictStrategy);
      const budgetStatus = calculateBudgetStatus({
        tenantId: request.tenantId,
        traveller: request.traveller,
        offers: [offer],
        budgetConfig
      });
      if (budgetStatus) {
        enrichedDecision.budgetStatus = budgetStatus;
      }
      const carbonImpact = calculateCarbonImpact({
        offers: [offer],
        tripType: request.trip.tripType
      });
      enrichedDecision.carbonImpact = carbonImpact;
      decisions.push(enrichedDecision);
    }
    const totalDurationMs = Date.now() - startTime;
    const evaluatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const batchDecision = {
      decisions,
      evaluatedAt,
      totalDurationMs
    };
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        data: batchDecision,
        metadata: {
          requestId,
          timestamp: evaluatedAt,
          version: "v1"
        }
      })
    };
  } catch (error) {
    console.error("Batch policy evaluation failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return errorResponse(500, "EVALUATION_ERROR", message, requestId);
  }
}
function applyConflictResolution(decision, strategy) {
  if (decision.winningRules.length <= 1) {
    return decision;
  }
  const outcomes = winningRulesToOutcomes(decision.winningRules);
  const resolution = resolveConflicts(outcomes, strategy);
  return {
    ...decision,
    result: resolution.result
  };
}
function validateBatchRequest(request) {
  const missingFields = [];
  if (!request.tenantId) missingFields.push("tenantId");
  if (!request.decisionPoint) missingFields.push("decisionPoint");
  if (!request.traveller) missingFields.push("traveller");
  if (!request.trip) missingFields.push("trip");
  if (!request.offers || !Array.isArray(request.offers) || request.offers.length === 0) {
    missingFields.push("offers");
  }
  if (missingFields.length > 0) {
    return `Missing required fields: ${missingFields.join(", ")}`;
  }
  if (!request.traveller.travellerId) missingFields.push("traveller.travellerId");
  if (!request.traveller.department) missingFields.push("traveller.department");
  if (!request.trip.tripId) missingFields.push("trip.tripId");
  if (!request.trip.tripType) missingFields.push("trip.tripType");
  if (missingFields.length > 0) {
    return `Missing required fields: ${missingFields.join(", ")}`;
  }
  return null;
}
function errorResponse(statusCode, code, message, requestId) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      code,
      message,
      requestId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    })
  };
}
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=evaluate-batch.js.map
