/**
 * Lambda handler: Configure workflow templates.
 * POST /v1/approvals/templates — Create a new workflow template
 * PUT /v1/approvals/templates/{templateId} — Update an existing template
 *
 * Allows tenant administrators to define and manage workflow templates
 * including stages, escalation rules, auto-approval conditions, and SLA config.
 *
 * Requirements: 8.6, 8.7
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { randomUUID } from 'node:crypto';

import { withDatabase } from '../lib/database.js';
import type { DatabaseClient } from '../lib/database.js';
import { extractTenantId, extractUserId, successResponse, errorResponse } from './shared.js';

export interface TemplateRecord {
  templateId: string;
  tenantId: string;
  name: string;
  description: string | null;
  stagesJson: string;
  escalationRulesJson: string;
  autoApprovalConditionsJson: string | null;
  slaConfigJson: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface StageDefinitionInput {
  stageNumber: number;
  type: 'single' | 'parallel' | 'conditional';
  approverRules: Array<{
    type: 'role' | 'specific_user' | 'manager' | 'cost_centre_owner';
    value: string;
  }>;
  requiredApprovals: number;
  slaHours: number;
}

interface EscalationRuleInput {
  triggerAfterHours: number;
  escalateTo: {
    type: 'role' | 'specific_user' | 'manager' | 'cost_centre_owner';
    value: string;
  };
  notifyOriginalApprover: boolean;
}

interface AutoApprovalConditionInput {
  field: string;
  operator: string;
  value: unknown;
}

interface SLAConfigInput {
  defaultSlaHours: number;
  urgentSlaHours: number;
  reminderIntervalHours: number;
  maxEscalations: number;
}

interface TemplateBody {
  name?: string;
  description?: string;
  stages?: StageDefinitionInput[];
  escalationRules?: EscalationRuleInput[];
  autoApprovalConditions?: AutoApprovalConditionInput[];
  slaConfig?: SLAConfigInput;
}

/**
 * Validate the template structure.
 */
function validateTemplate(body: TemplateBody): string | null {
  if (!body.name || body.name.trim().length === 0) {
    return 'name is required and must be non-empty';
  }

  if (!body.stages || !Array.isArray(body.stages) || body.stages.length === 0) {
    return 'stages must be a non-empty array';
  }

  // Validate each stage
  for (const stage of body.stages) {
    if (typeof stage.stageNumber !== 'number' || stage.stageNumber < 1) {
      return 'Each stage must have a valid stageNumber (>= 1)';
    }
    if (!['single', 'parallel', 'conditional'].includes(stage.type)) {
      return `Invalid stage type: ${stage.type}. Must be single, parallel, or conditional`;
    }
    if (!Array.isArray(stage.approverRules) || stage.approverRules.length === 0) {
      return `Stage ${stage.stageNumber} must have at least one approverRule`;
    }
    if (typeof stage.requiredApprovals !== 'number' || stage.requiredApprovals < 1) {
      return `Stage ${stage.stageNumber} must have requiredApprovals >= 1`;
    }
    if (typeof stage.slaHours !== 'number' || stage.slaHours <= 0) {
      return `Stage ${stage.stageNumber} must have slaHours > 0`;
    }
  }

  // Validate escalation rules if provided
  if (body.escalationRules) {
    if (!Array.isArray(body.escalationRules)) {
      return 'escalationRules must be an array';
    }
    for (const rule of body.escalationRules) {
      if (typeof rule.triggerAfterHours !== 'number' || rule.triggerAfterHours <= 0) {
        return 'Each escalation rule must have triggerAfterHours > 0';
      }
      if (!rule.escalateTo || !rule.escalateTo.type || !rule.escalateTo.value) {
        return 'Each escalation rule must have a valid escalateTo target';
      }
    }
  }

  // Validate SLA config
  if (!body.slaConfig) {
    return 'slaConfig is required';
  }
  if (typeof body.slaConfig.defaultSlaHours !== 'number' || body.slaConfig.defaultSlaHours <= 0) {
    return 'slaConfig.defaultSlaHours must be > 0';
  }
  if (typeof body.slaConfig.urgentSlaHours !== 'number' || body.slaConfig.urgentSlaHours <= 0) {
    return 'slaConfig.urgentSlaHours must be > 0';
  }
  if (typeof body.slaConfig.reminderIntervalHours !== 'number' || body.slaConfig.reminderIntervalHours <= 0) {
    return 'slaConfig.reminderIntervalHours must be > 0';
  }
  if (typeof body.slaConfig.maxEscalations !== 'number' || body.slaConfig.maxEscalations < 0) {
    return 'slaConfig.maxEscalations must be >= 0';
  }

  return null;
}

/**
 * Create a new workflow template.
 */
async function createTemplate(
  db: DatabaseClient,
  tenantId: string,
  templateId: string,
  body: TemplateBody,
  createdBy: string
): Promise<TemplateRecord> {
  const now = new Date().toISOString();

  const result = await db.query<TemplateRecord>(
    `INSERT INTO "${tenantId}".workflow_templates
      (template_id, tenant_id, name, description, stages_json, escalation_rules_json,
       auto_approval_conditions_json, sla_config_json, is_active, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING
       template_id AS "templateId",
       tenant_id AS "tenantId",
       name,
       description,
       stages_json AS "stagesJson",
       escalation_rules_json AS "escalationRulesJson",
       auto_approval_conditions_json AS "autoApprovalConditionsJson",
       sla_config_json AS "slaConfigJson",
       is_active AS "isActive",
       created_by AS "createdBy",
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
    [
      templateId,
      tenantId,
      body.name!,
      body.description ?? null,
      JSON.stringify(body.stages),
      JSON.stringify(body.escalationRules ?? []),
      body.autoApprovalConditions ? JSON.stringify(body.autoApprovalConditions) : null,
      JSON.stringify(body.slaConfig),
      true,
      createdBy,
      now,
      now,
    ]
  );

  return result.rows[0];
}

/**
 * Update an existing workflow template.
 */
async function updateTemplate(
  db: DatabaseClient,
  tenantId: string,
  templateId: string,
  body: TemplateBody
): Promise<TemplateRecord | null> {
  const now = new Date().toISOString();

  const result = await db.query<TemplateRecord>(
    `UPDATE "${tenantId}".workflow_templates
     SET name = $2,
         description = $3,
         stages_json = $4,
         escalation_rules_json = $5,
         auto_approval_conditions_json = $6,
         sla_config_json = $7,
         updated_at = $8
     WHERE template_id = $1 AND is_active = true
     RETURNING
       template_id AS "templateId",
       tenant_id AS "tenantId",
       name,
       description,
       stages_json AS "stagesJson",
       escalation_rules_json AS "escalationRulesJson",
       auto_approval_conditions_json AS "autoApprovalConditionsJson",
       sla_config_json AS "slaConfigJson",
       is_active AS "isActive",
       created_by AS "createdBy",
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
    [
      templateId,
      body.name!,
      body.description ?? null,
      JSON.stringify(body.stages),
      JSON.stringify(body.escalationRules ?? []),
      body.autoApprovalConditions ? JSON.stringify(body.autoApprovalConditions) : null,
      JSON.stringify(body.slaConfig),
      now,
    ]
  );

  return result.rows[0] ?? null;
}

/**
 * Format a template record into a response object.
 */
function formatTemplateResponse(record: TemplateRecord) {
  return {
    templateId: record.templateId,
    tenantId: record.tenantId,
    name: record.name,
    description: record.description,
    stages: JSON.parse(record.stagesJson),
    escalationRules: JSON.parse(record.escalationRulesJson),
    autoApprovalConditions: record.autoApprovalConditionsJson
      ? JSON.parse(record.autoApprovalConditionsJson)
      : null,
    slaConfig: JSON.parse(record.slaConfigJson),
    isActive: record.isActive,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = _context.awsRequestId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    const body = JSON.parse(event.body) as TemplateBody;
    const httpMethod = event.httpMethod.toUpperCase();

    // Validate template structure
    const validationError = validateTemplate(body);
    if (validationError) {
      return errorResponse(400, 'INVALID_TEMPLATE', validationError, requestId);
    }

    const userId = extractUserId(event);

    if (httpMethod === 'POST') {
      // Create new template
      const templateId = randomUUID();

      const record = await withDatabase(async (db) => {
        return createTemplate(db, tenantId, templateId, body, userId);
      });

      return successResponse(201, formatTemplateResponse(record), requestId);
    } else if (httpMethod === 'PUT') {
      // Update existing template
      const templateId = event.pathParameters?.templateId;
      if (!templateId) {
        return errorResponse(400, 'MISSING_TEMPLATE_ID', 'templateId path parameter is required', requestId);
      }

      const record = await withDatabase(async (db) => {
        return updateTemplate(db, tenantId, templateId, body);
      });

      if (!record) {
        return errorResponse(
          404,
          'TEMPLATE_NOT_FOUND',
          `Template ${templateId} not found or inactive`,
          requestId
        );
      }

      return successResponse(200, formatTemplateResponse(record), requestId);
    } else {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', `Method ${httpMethod} not allowed`, requestId);
    }
  } catch (error) {
    console.error('Configure template failed:', error);
    return errorResponse(
      500,
      'TEMPLATE_CONFIGURATION_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}
