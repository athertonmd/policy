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

// src/handlers/shared.ts
var shared_exports = {};
__export(shared_exports, {
  CORS_HEADERS: () => CORS_HEADERS,
  errorResponse: () => errorResponse,
  extractTenantId: () => extractTenantId,
  extractUserId: () => extractUserId,
  successResponse: () => successResponse
});
module.exports = __toCommonJS(shared_exports);
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Tenant-Id",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Content-Type": "application/json"
};
function extractTenantId(event) {
  const headerTenantId = event.headers?.["x-tenant-id"] ?? event.headers?.["X-Tenant-Id"];
  if (headerTenantId) {
    return headerTenantId;
  }
  const authContext = event.requestContext?.authorizer;
  if (authContext && typeof authContext === "object" && "tenantId" in authContext) {
    return authContext.tenantId;
  }
  return null;
}
function extractUserId(event) {
  const authContext = event.requestContext?.authorizer;
  if (authContext && typeof authContext === "object" && "userId" in authContext) {
    return authContext.userId;
  }
  return event.requestContext?.authorizer?.claims?.sub ?? "system";
}
function successResponse(statusCode, data, requestId) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      data,
      metadata: {
        requestId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        version: "v1"
      }
    })
  };
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CORS_HEADERS,
  errorResponse,
  extractTenantId,
  extractUserId,
  successResponse
});
//# sourceMappingURL=shared.js.map
