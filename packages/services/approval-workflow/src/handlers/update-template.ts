/**
 * Lambda handler: Update workflow template.
 * PUT /v1/approvals/templates/{templateId}
 *
 * Re-exports the configure-template handler which handles both
 * POST (create) and PUT (update) based on HTTP method.
 */
export { handler } from './configure-template.js';
