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

// src/handlers/bundle-refresh.ts
var bundle_refresh_exports = {};
__export(bundle_refresh_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(bundle_refresh_exports);

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
function invalidateCache(tenantId) {
  bundleCache.delete(tenantId);
}
function invalidateAllCaches() {
  bundleCache = /* @__PURE__ */ new Map();
}

// src/handlers/bundle-refresh.ts
async function handler(event) {
  try {
    const detailType = event["detail-type"];
    const tenantId = event.detail?.tenantId;
    console.info("Received event:", {
      detailType,
      tenantId,
      correlationId: event.detail?.correlationId,
      bundleVersion: event.detail?.payload?.bundleVersion
    });
    if (detailType === "PolicyBundleUpdated") {
      if (tenantId) {
        invalidateCache(tenantId);
        console.info(`Cache invalidated for tenant: ${tenantId}`);
      } else {
        invalidateAllCaches();
        console.warn("No tenantId in event, invalidated all caches");
      }
    } else if (detailType === "PolicyBundleInvalidateAll") {
      invalidateAllCaches();
      console.info("All caches invalidated");
    } else {
      console.warn(`Unhandled event type: ${detailType}`);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Cache invalidation processed",
        tenantId: tenantId ?? "all",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      })
    };
  } catch (error) {
    console.error("Bundle refresh handler failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to process cache invalidation",
        error: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=bundle-refresh.js.map
