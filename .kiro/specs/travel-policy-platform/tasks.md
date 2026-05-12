# Implementation Plan: Corporate Travel Policy and Approvals Platform

## Overview

This implementation plan delivers the platform incrementally, starting with foundational infrastructure (IaC, multi-tenant data layer, authentication), then building core services (policy engine, approval workflows, booking ingestion), followed by supporting services (notifications, audit, reporting), and finally advanced capabilities (AI recommendations, compliance monitoring). All code is TypeScript on AWS serverless (Lambda, Step Functions, Aurora PostgreSQL, DynamoDB, EventBridge).

## Tasks

- [x] 1. Project scaffolding and shared infrastructure
  - [x] 1.1 Initialise monorepo structure with shared TypeScript configuration
    - Create monorepo with packages: `infra`, `shared`, `services/*`, `frontend`
    - Configure TypeScript project references, ESLint, Prettier
    - Set up shared types package with core interfaces from design (Tenant, PolicyDecision, TravellerContext, etc.)
    - _Requirements: 18.1, 18.3_

  - [x] 1.2 Define CDK infrastructure stack for networking and shared resources
    - Create CDK app with environment-aware configuration (uk, eu, us, anz regions)
    - Define VPC, subnets, security groups for Aurora connectivity
    - Create shared KMS keys for platform-level encryption
    - Define Route 53 hosted zone and CloudFront distribution
    - _Requirements: 1.1, 23.1, 20.6_

  - [x] 1.3 Deploy Aurora PostgreSQL Serverless v2 cluster with platform schema
    - Create Aurora Serverless v2 cluster with CDK
    - Create `platform` schema with `tenants` table as defined in design
    - Configure automated backups, encryption at rest with KMS
    - Set up IAM authentication for Lambda access
    - _Requirements: 1.1, 23.1, 23.3_

  - [x] 1.4 Deploy DynamoDB tables for operational data
    - Create AuditLog table with GSIs (tenantId-actionType-index, tenantId-userId-index) and TTL
    - Create WebhookIdempotency table with TTL (7 days)
    - Create PolicyBundleCache table
    - Configure encryption and point-in-time recovery
    - _Requirements: 11.3, 7.6, 23.1_

  - [x] 1.5 Set up EventBridge event bus and schema registry
    - Create custom event bus `travel-policy-platform`
    - Register event schemas for all DomainEvent types from design
    - Create dead-letter queue for failed event deliveries
    - _Requirements: 17.1, 17.2, 17.4, 17.5_

  - [ ]* 1.6 Write integration tests for infrastructure deployment
    - Verify Aurora connectivity and schema creation
    - Verify DynamoDB table creation and access patterns
    - Verify EventBridge event publishing and delivery
    - _Requirements: 1.1, 17.1_

- [x] 2. Checkpoint - Ensure infrastructure deploys successfully
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Multi-tenant provisioning service
  - [x] 3.1 Implement Tenant Management Service Lambda functions
    - Implement `provisionTenant` handler: create schema, KMS key, Cognito user pool, store in platform.tenants
    - Implement `updateTenantConfig` handler with validation
    - Implement `decommissionTenant` handler with soft-delete and resource cleanup
    - Implement `getTenant` and `listTenants` handlers with pagination
    - Add rollback logic for partial provisioning failures
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 3.2 Create per-tenant schema provisioning logic
    - Implement SQL migration runner that creates all per-tenant tables from design
    - Create schema isolation enforcement (row-level security, connection scoping)
    - Implement tenant context middleware that resolves tenantId from JWT and scopes DB connections
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 3.3 Deploy API Gateway endpoints for tenant management
    - Create REST API with `/v1/tenants` resource
    - Configure WAF rules, throttling, and API key authentication for platform operators
    - Generate OpenAPI 3.0 spec
    - _Requirements: 18.1, 18.3, 18.6, 1.4_

  - [ ]* 3.4 Write unit tests for tenant provisioning
    - Test successful provisioning flow
    - Test rollback on partial failure
    - Test tenant isolation enforcement
    - Test concurrent tenant limit (500+)
    - _Requirements: 1.1, 1.4, 1.5_

- [x] 4. Authentication and authorisation
  - [x] 4.1 Implement Cognito user pool federation with SAML/OIDC
    - Create Cognito user pool per tenant during provisioning
    - Configure SAML 2.0 and OIDC identity provider federation
    - Implement OAuth 2.0 client credentials flow for API clients
    - Configure MFA enforcement for administrative operations
    - Implement account lockout after 3 failed attempts within 5 minutes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [x] 4.2 Implement Cedar authorisation layer
    - Define Cedar policy schema with entity types (User, Role, Resource, Action)
    - Create predefined roles: Traveller, Approver, Travel_Arranger, TMC_Agent, Policy_Administrator, Tenant_Administrator, Finance_Viewer
    - Implement authorisation middleware that evaluates Cedar policies on each request
    - Support custom role creation per tenant
    - Log all access control decisions to audit trail
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 4.3 Implement SCIM 2.0 endpoint for user provisioning
    - Create SCIM endpoint for user create/update/deactivate events
    - Map SCIM attributes to traveller profile fields
    - Process events within 30-second SLA
    - _Requirements: 2.5, 26.1, 26.2_

  - [ ]* 4.4 Write unit tests for authentication and authorisation
    - Test SAML/OIDC federation flows
    - Test Cedar policy evaluation for each predefined role
    - Test account lockout logic
    - Test SCIM event processing
    - _Requirements: 2.1, 2.4, 2.6, 3.1_

- [x] 5. Checkpoint - Ensure tenant provisioning and auth work end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Policy DSL parser and compiler
  - [x] 6.1 Implement PEG grammar parser using Peggy.js
    - Define full PEG grammar from design (PolicyDocument, Rule, ConditionBlock, ActionBlock)
    - Generate TypeScript parser from grammar
    - Implement error reporting with line/column positions and expected tokens
    - Support all DSL constructs: conditionals, arithmetic, set membership, date/time, regex, logical operators
    - _Requirements: 22.1, 22.2, 22.5, 22.6, 4.1_

  - [x] 6.2 Implement DSL-to-PolicyGraph compiler
    - Transform parsed AST into PolicyGraph DAG structure (nodes, edges)
    - Implement semantic validation (undefined references, type checking)
    - Generate unique node/edge IDs and wire condition/action/terminal nodes
    - _Requirements: 22.1, 4.1, 4.3_

  - [x] 6.3 Implement pretty printer (PolicyGraph to DSL)
    - Convert PolicyGraph back to formatted DSL text
    - Ensure round-trip consistency: parse(prettyPrint(graph)) ≡ graph
    - Apply consistent formatting rules (indentation, spacing)
    - _Requirements: 22.3, 22.4_

  - [x] 6.4 Implement PolicyGraph-to-OPA Rego compiler
    - Transform PolicyGraph into Rego modules per rule
    - Generate OPA bundle structure with manifest
    - Store compiled bundles in S3 with versioning
    - Publish bundle update events to EventBridge
    - _Requirements: 4.1, 5.3_

  - [ ]* 6.5 Write unit tests for DSL parser and compiler
    - Test parsing of valid DSL documents
    - Test error reporting for syntax errors
    - Test semantic error detection
    - Test round-trip property (parse → prettyPrint → parse)
    - Test Rego generation correctness
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.6_

- [x] 7. Policy Decision Service
  - [x] 7.1 Implement OPA evaluation engine in Lambda
    - Embed OPA (via @open-policy-agent/opa-wasm or opa-eval) in Lambda
    - Load policy bundles from S3 on cold start, cache in memory
    - Implement bundle refresh on EventBridge notification
    - Evaluate policy with full TravellerContext, TripContext, and Offers
    - Return PolicyDecision with result, winning rules, reasons, obligations, alternatives
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 7.2 Implement batch evaluation and conflict resolution
    - Implement `evaluateBatch` for multiple offers in single request
    - Apply rule priority ordering and tenant-configured conflict resolution
    - Calculate budget status and carbon impact in decision response
    - _Requirements: 5.3, 13.1, 14.3_

  - [x] 7.3 Implement Policy Configuration Service endpoints
    - Create `compileDSL`, `saveRule`, `activateVersion`, `listVersions`, `rollbackVersion` handlers
    - Store policy rules with version history in per-tenant schema
    - Validate rules before activation
    - Apply changes without restart (hot reload via bundle update)
    - _Requirements: 4.1, 4.3, 4.6, 4.7_

  - [x] 7.4 Deploy Policy Decision API Gateway endpoints
    - Create `/v1/policies/evaluate` (POST) endpoint with <200ms p95 target
    - Create `/v1/policies/rules` CRUD endpoints
    - Configure provisioned concurrency for cold-start mitigation
    - Add structured error responses for missing fields
    - _Requirements: 5.1, 5.5, 5.6, 18.1_

  - [ ]* 7.5 Write unit tests for policy evaluation
    - Test single rule evaluation
    - Test multi-rule conflict resolution
    - Test budget threshold flagging
    - Test error handling for missing data
    - Test evaluation latency under load
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 14.3_

- [x] 8. Policy simulation service
  - [x] 8.1 Implement simulation engine
    - Implement `runSimulation` handler that evaluates draft rules against historical trips
    - Generate comparison report: trips affected, approval/rejection rate changes, cost impact
    - Support A/B comparison between active and proposed rules
    - Store simulation results for 90 days
    - Ensure simulation does not affect live decisions
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 8.2 Write unit tests for simulation
    - Test simulation with sample historical data
    - Test A/B comparison output
    - Test isolation from live policy decisions
    - _Requirements: 6.1, 6.3, 6.5_

- [x] 9. Checkpoint - Ensure policy engine evaluates correctly
  - Ensure all tests pass, ask the user if questions arise.


- [x] 10. Approval Workflow Service
  - [x] 10.1 Define Step Functions state machines for approval workflows
    - Create state machine definitions for: single-stage, multi-stage sequential, multi-stage parallel, conditional branching
    - Implement callback token pattern for human approval tasks
    - Configure timeout, retry, and escalation transitions
    - Deploy state machines via CDK
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 10.2 Implement approval workflow orchestration handlers
    - Implement `initiateWorkflow` handler: resolve template, start Step Function execution, store workflow record
    - Implement `submitAction` handler: validate action, send task success/failure to Step Functions, advance workflow
    - Implement escalation handler: detect SLA breach, route to next approver in chain
    - Implement auto-approval evaluation against configured conditions
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 10.3 Implement delegation and workflow template management
    - Implement `configureDelegation` handler with date-range-based substitution
    - Implement `configureTemplate` handler for tenant-specific workflow templates
    - Implement `listPendingApprovals` with filtering by approver
    - Handle unavailable approvers: notify tenant admin, hold in pending state
    - _Requirements: 8.6, 8.7_

  - [x] 10.4 Deploy Approval Workflow API endpoints
    - Create `/v1/approvals/workflows` CRUD endpoints
    - Create `/v1/approvals/actions` endpoint for submitting decisions
    - Create `/v1/approvals/templates` management endpoints
    - Wire policy decision obligations to workflow initiation via EventBridge
    - _Requirements: 8.1, 8.3, 18.1_

  - [ ]* 10.5 Write unit tests for approval workflows
    - Test single-stage approval flow
    - Test multi-stage sequential flow with escalation
    - Test parallel approval with quorum
    - Test delegation substitution
    - Test auto-approval conditions
    - Test SLA breach escalation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 11. Booking Ingestion Service
  - [x] 11.1 Implement webhook receiver and validation
    - Create Lambda handler for webhook ingestion endpoint
    - Validate event signature (HMAC-SHA256) and parse payload
    - Acknowledge receipt within 2-second SLA
    - Check idempotency key against DynamoDB WebhookIdempotency table
    - Return HTTP 400 with structured errors for validation failures
    - _Requirements: 7.1, 7.3, 7.6_

  - [x] 11.2 Implement asynchronous webhook processing pipeline
    - Queue validated events to SQS for async processing
    - Implement payload mapping engine (configurable per integration source)
    - Trigger policy evaluation within 30 seconds of receipt
    - Implement retry with exponential backoff (5 attempts) and DLQ routing
    - Publish BookingReceived and BookingValidated events to EventBridge
    - _Requirements: 7.2, 7.4, 7.5_

  - [x] 11.3 Implement integration configuration and health monitoring
    - Implement `configureIntegration` handler with auth config and payload mapping
    - Implement `testIntegration` handler for connectivity validation
    - Implement `getIntegrationHealth` handler with throughput, error rate, latency metrics
    - Store integration configs in per-tenant schema (encrypted auth details)
    - _Requirements: 25.1, 25.3, 25.5, 25.6_

  - [ ]* 11.4 Write unit tests for booking ingestion
    - Test signature validation (valid and invalid)
    - Test idempotency deduplication
    - Test payload mapping for different source types
    - Test retry and DLQ routing on failure
    - _Requirements: 7.1, 7.3, 7.5, 7.6_

- [x] 12. Notification Service
  - [x] 12.1 Implement multi-channel notification delivery
    - Implement `sendApprovalNotification` with SES email delivery
    - Generate secure, time-limited action links (approve/reject/request-info) with JWT tokens
    - Implement reminder scheduling at configurable intervals
    - Implement `sendNotification` for generic platform notifications
    - Send notifications within 60-second SLA
    - _Requirements: 9.1, 9.4, 9.5_

  - [x] 12.2 Implement email-based approval actions
    - Implement `processEmailAction` handler: validate link token, check expiry, execute action
    - Implement reply-based approval parsing (APPROVE/REJECT/INFO keywords)
    - Verify sender email matches designated approver
    - Display expiry message and redirect to UI for expired links
    - _Requirements: 9.2, 27.1, 27.2, 27.3, 27.4, 27.5_

  - [x] 12.3 Implement notification preferences and escalation notifications
    - Implement `configurePreferences` handler per user
    - Send escalation notifications to both original approver and escalation target
    - Notify traveller on workflow completion with outcome details
    - _Requirements: 9.3, 9.5_

  - [ ]* 12.4 Write unit tests for notification service
    - Test email delivery with action links
    - Test token validation and expiry
    - Test reply-based approval parsing
    - Test reminder scheduling
    - _Requirements: 9.1, 9.2, 27.1, 27.2_

- [x] 13. Checkpoint - Ensure core workflow (policy → approval → notification) works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Audit Service
  - [x] 14.1 Implement immutable audit logging
    - Implement `recordEvent` handler writing to DynamoDB AuditLog table
    - Calculate SHA-256 chain hash (integrityHash) linking to previous entry (previousHash)
    - Include all required fields: timestamp, tenantId, userId, actionType, resourceType, resourceId, outcome, sourceIp, correlationId
    - Subscribe to EventBridge events for automatic audit capture
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 14.2 Implement audit query and export
    - Implement `queryLogs` handler with pagination, filtering by date range, action type, user
    - Return results within 5-second SLA for 90-day queries
    - Implement `exportLogs` handler generating JSON/CSV exports to S3
    - Implement `verifyIntegrity` handler that validates hash chain
    - _Requirements: 11.4, 11.5, 11.6_

  - [ ]* 14.3 Write unit tests for audit service
    - Test hash chain integrity
    - Test query performance with large datasets
    - Test export format correctness
    - _Requirements: 11.3, 11.4, 11.6_

- [x] 15. Traveller Profile Service
  - [x] 15.1 Implement profile CRUD with field-level access control
    - Implement `getProfile` handler with Cedar-based field-level access control
    - Implement `updateProfile` handler respecting role-based field restrictions
    - Encrypt PII fields (passport, emergency contact) with tenant-specific KMS keys
    - Allow travellers to self-manage preferences and loyalty programmes
    - _Requirements: 15.1, 15.3, 15.4, 15.5_

  - [x] 15.2 Implement HR sync and GDPR data subject rights
    - Implement `syncFromSCIM` handler updating profiles within 30-second SLA
    - Implement `bulkSync` handler for scheduled organisational data sync
    - Implement `exportPersonalData` handler (DSAR) producing machine-readable export within 72 hours
    - Implement `erasePersonalData` handler anonymising data within 30 days while preserving audit records
    - _Requirements: 15.2, 26.2, 26.3, 20.3, 20.4_

  - [ ]* 15.3 Write unit tests for traveller profiles
    - Test field-level access control per role
    - Test PII encryption/decryption
    - Test SCIM sync processing
    - Test data export and erasure
    - _Requirements: 15.4, 15.5, 20.3, 20.4_

- [x] 16. Exception handling and policy overrides
  - [x] 16.1 Implement policy override request and approval flow
    - Implement override request handler requiring structured justification (reason category + free text)
    - Route override requests through dedicated approval workflow per tenant config
    - Record approved overrides in audit trail with full context
    - Enforce override frequency limits per traveller/department
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

  - [x] 16.2 Implement override dashboard data endpoints
    - Create API endpoints for active/historical overrides with filtering
    - Support filtering by tenant, time period, override type, approver
    - _Requirements: 10.4_

  - [ ]* 16.3 Write unit tests for policy overrides
    - Test justification validation
    - Test override frequency limit enforcement
    - Test audit trail recording
    - _Requirements: 10.1, 10.3, 10.5_

- [x] 17. Checkpoint - Ensure all Phase 1 services are functional
  - Ensure all tests pass, ask the user if questions arise.


- [x] 18. Budget tracking and financial controls
  - [x] 18.1 Implement budget management and real-time tracking
    - Implement budget CRUD at tenant, department, cost centre, and project levels
    - Support monthly, quarterly, and annual period types
    - Update budget utilisation in near-real-time (within 60 seconds of approval) via EventBridge subscription
    - Implement warning threshold logic (default 80%) included in policy decision responses
    - Trigger finance approval when utilisation would exceed 100%
    - Send notifications to budget owners on threshold breach
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 18.2 Write unit tests for budget tracking
    - Test utilisation calculation accuracy
    - Test threshold breach detection and notification
    - Test finance approval trigger at 100%
    - _Requirements: 14.2, 14.3, 14.5_

- [x] 19. Reporting and analytics service
  - [x] 19.1 Implement financial spend reporting
    - Implement `generateSpendReport` handler with aggregation by tenant, department, cost centre, supplier, trip type, cabin class, region, time period
    - Calculate: total spend, average trip cost, compliance rate, savings, budget variance
    - Implement cost allocation rules for multi-cost-centre trips
    - Generate reports within 60-second SLA for 12-month datasets
    - _Requirements: 12.1, 12.2, 12.4, 12.5_

  - [x] 19.2 Implement carbon reporting
    - Implement `generateCarbonReport` with emission factor calculations per transport mode, distance, cabin class
    - Aggregate by department, trip type, transport mode, route, time period
    - Compare against tenant-configured carbon budgets and targets
    - Track carbon offset purchases
    - _Requirements: 13.1, 13.2, 13.3, 13.5_

  - [x] 19.3 Implement approval analytics and compliance metrics
    - Implement `getApprovalAnalytics`: average approval time, SLA compliance, escalation frequency, rejection rate, auto-approval rate
    - Identify bottlenecks: highest queue depth, longest response time, most escalations per approver
    - Implement `getComplianceMetrics`: compliance rates segmented by department, traveller, trip type, supplier, channel
    - Generate alerts when SLA compliance or policy compliance falls below thresholds
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 28.1, 28.3_

  - [x] 19.4 Implement scheduled report generation and distribution
    - Implement `scheduleReport` handler with cron-based scheduling
    - Distribute reports via email to configured recipients
    - Support export in structured formats (JSON, CSV)
    - _Requirements: 12.6, 24.5_

  - [ ]* 19.5 Write unit tests for reporting
    - Test spend aggregation accuracy
    - Test carbon calculation with known emission factors
    - Test approval analytics calculations
    - _Requirements: 12.1, 13.1, 24.1_

- [x] 20. Duty of care integration
  - [x] 20.1 Implement itinerary publishing to duty-of-care systems
    - Subscribe to approval workflow completion events
    - Publish traveller itinerary to configured duty-of-care systems within 60 seconds
    - Publish updates on itinerary modification or cancellation
    - Support webhook and EventBridge delivery patterns
    - Handle disruption alerts from duty-of-care systems with escalation notifications
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [ ]* 20.2 Write unit tests for duty of care integration
    - Test itinerary publishing on approval
    - Test update publishing on modification
    - Test disruption alert handling
    - _Requirements: 16.1, 16.2, 16.4_

- [x] 21. Data retention and GDPR compliance
  - [x] 21.1 Implement configurable data retention and purging
    - Implement retention policy configuration per tenant and data category
    - Create scheduled Lambda that purges/anonymises expired data within 24 hours
    - Maintain record of processing activities per tenant
    - Enforce data residency by routing all operations to tenant's configured region
    - _Requirements: 20.1, 20.2, 20.5, 20.6_

  - [ ]* 21.2 Write unit tests for data retention
    - Test purge scheduling and execution
    - Test anonymisation preserves audit integrity
    - Test data residency enforcement
    - _Requirements: 20.1, 20.2, 20.6_

- [x] 22. Checkpoint - Ensure Phase 2 services are functional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 23. Platform monitoring and observability
  - [x] 23.1 Implement structured logging, tracing, and health checks
    - Add structured JSON logging with correlation IDs across all services
    - Integrate AWS X-Ray for distributed tracing across service boundaries
    - Implement `/health` endpoints for all services (respond within 1 second)
    - Create CloudWatch dashboards: API response times (p50/p95/p99), error rates, policy throughput, workflow durations, queue depths
    - Configure alarms: health check failures (alert within 60s), response time breaches (3 min threshold → auto-scale + notify)
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6_

  - [ ]* 23.2 Write integration tests for observability
    - Test health check endpoints
    - Test correlation ID propagation across services
    - Test alarm triggering on simulated failures
    - _Requirements: 21.2, 21.3, 21.4_

- [x] 24. TMC operations dashboard API
  - [x] 24.1 Implement TMC dashboard backend endpoints
    - Create API endpoints for unified queue view: pending approvals, exceptions, overrides, SLA breaches
    - Implement real-time updates via WebSocket (update within 5 seconds)
    - Implement queue assignment and workload distribution with configurable routing
    - Provide contextual data per queue item: traveller details, trip summary, policy results, approval history
    - Implement bulk actions (approve, reject, reassign) with audit logging
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [ ]* 24.2 Write unit tests for TMC dashboard
    - Test queue filtering and sorting
    - Test bulk action execution
    - Test workload distribution routing
    - _Requirements: 19.1, 19.3, 19.5_

- [x] 25. OBT/GDS integration framework
  - [x] 25.1 Implement modular integration framework
    - Create integration framework with pluggable adapters (auth, protocol, payload mapping)
    - Implement at least one OBT connector and one GDS connector
    - Support synchronous (request/response) and asynchronous (webhook/event) patterns
    - Implement automated connectivity and payload mapping test suite for new integrations
    - Queue operations when source unavailable, retry with backoff, notify after 3 failures
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5_

  - [ ]* 25.2 Write unit tests for integration framework
    - Test adapter registration and payload mapping
    - Test connectivity validation
    - Test retry and queue behaviour on source unavailability
    - _Requirements: 25.1, 25.3, 25.5_

- [x] 26. Policy compliance monitoring
  - [x] 26.1 Implement real-time compliance monitoring
    - Calculate compliance rates in real-time segmented by department, traveller, trip type, supplier, channel
    - Detect and report policy leakage (out-of-channel bookings)
    - Generate alerts when department compliance falls below threshold
    - Produce trend analysis with statistically significant change detection
    - Generate policy effectiveness report: most/least triggered rules, override frequency, estimated savings
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_

  - [ ]* 26.2 Write unit tests for compliance monitoring
    - Test compliance rate calculation
    - Test leakage detection logic
    - Test threshold alerting
    - _Requirements: 28.1, 28.2, 28.3_

- [x] 27. Scalability and performance hardening
  - [x] 27.1 Implement auto-scaling and performance optimisation
    - Configure Lambda provisioned concurrency for policy decision path
    - Implement Aurora auto-scaling for read replicas
    - Configure API Gateway throttling per tenant and per API client
    - Validate 1000 decisions/second/tenant at p95 <200ms
    - Validate 10,000 concurrent active approval workflows per tenant
    - Configure scale-down within 15 minutes on traffic decrease
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 18.6_

  - [ ]* 27.2 Write load tests for performance validation
    - Test policy decision throughput under load
    - Test concurrent approval workflow capacity
    - Test auto-scaling behaviour
    - _Requirements: 29.1, 29.2, 29.3_

- [x] 28. Checkpoint - Ensure Phase 2 and scalability targets are met
  - Ensure all tests pass, ask the user if questions arise.

- [x] 29. AI-powered policy recommendations (Phase 3)
  - [x] 29.1 Implement AI recommendation engine
    - Integrate Amazon Bedrock for policy analysis
    - Implement policy optimisation recommendations based on spending patterns, override frequency, compliance trends (requires minimum 1000 evaluated trips)
    - Present recommendations with: projected cost impact, affected population, confidence score, supporting evidence
    - Implement approval prediction scoring based on historical patterns
    - Implement spend anomaly detection comparing against historical baselines
    - Support natural language policy queries via Bedrock
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5_

  - [ ]* 29.2 Write unit tests for AI recommendations
    - Test recommendation generation with sample data
    - Test anomaly detection with known anomalous patterns
    - Test prediction scoring accuracy
    - _Requirements: 30.1, 30.3, 30.4_

- [x] 30. Frontend application (Next.js)
  - [x] 30.1 Set up Next.js application with authentication
    - Create Next.js app with Tailwind CSS, deploy to CloudFront + S3
    - Integrate Cognito authentication (SSO, MFA)
    - Implement role-based UI rendering based on Cedar permissions
    - Create shared layout with navigation, tenant context, and user profile
    - _Requirements: 2.1, 2.3, 3.1_

  - [x] 30.2 Implement policy administration UI
    - Build visual policy rule builder (drag-and-drop conditions/actions)
    - Integrate DSL editor with syntax highlighting and error display
    - Build simulation interface with comparison reports
    - Build policy version history and rollback UI
    - _Requirements: 4.2, 4.6, 6.1, 6.2_

  - [x] 30.3 Implement approval and TMC operations UI
    - Build approval queue with pending items, contextual details, and action buttons
    - Build TMC operations dashboard with unified queue view
    - Implement real-time updates via WebSocket
    - Build bulk action interface
    - _Requirements: 19.1, 19.2, 19.4, 19.5_

  - [x] 30.4 Implement reporting and analytics dashboards
    - Build spend reporting dashboard with charts and filters
    - Build carbon reporting dashboard with targets visualisation
    - Build approval analytics dashboard with bottleneck identification
    - Build budget tracking dashboard with utilisation gauges
    - Build compliance monitoring dashboard with trend analysis
    - _Requirements: 12.1, 13.2, 14.2, 24.1, 28.1_

  - [x] 30.5 Implement traveller profile and override management UI
    - Build traveller profile view/edit with field-level access control
    - Build policy override request form with justification
    - Build override history dashboard
    - Build traveller location dashboard for duty of care
    - _Requirements: 15.1, 15.3, 10.1, 10.4, 16.5_

  - [ ]* 30.6 Write frontend component tests
    - Test policy rule builder interactions
    - Test approval action flows
    - Test role-based rendering
    - _Requirements: 4.2, 8.3, 3.1_

- [x] 31. Final checkpoint - Ensure all tests pass and platform is fully integrated
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Phase 1 (Tasks 1–17): Core platform — tenants, auth, policy engine, approvals, notifications, audit, profiles, overrides
- Phase 2 (Tasks 18–28): Extended capabilities — budgets, reporting, carbon, duty of care, GDPR, monitoring, TMC dashboard, integrations, compliance, scalability
- Phase 3 (Tasks 29–31): Advanced features — AI recommendations, full frontend, final integration
- All services use TypeScript on AWS Lambda with shared type definitions
- Infrastructure is defined as CDK (TypeScript) in the `infra` package
