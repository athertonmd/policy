# @travel-policy/connector-sabre

Sabre GDS connector for the Travel Policy Platform. Integrates Sabre Dev Studio REST APIs with our Policy Decision API to provide real-time compliance evaluation at search, pre-ticketing, and post-booking stages.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Travel Agent / OBT                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Sabre Dev Studio   │
                    │   (BFM / GetRes)     │
                    └──────────┬──────────┘
                               │
              ┌────────────────▼────────────────┐
              │     @travel-policy/connector-sabre     │
              │                                        │
              │  ┌──────────────────────────────────┐  │
              │  │  1. Search Interceptor           │  │
              │  │     BFM Response → Fare Mapper   │  │
              │  │     → Policy API → Annotator     │  │
              │  └──────────────────────────────────┘  │
              │                                        │
              │  ┌──────────────────────────────────┐  │
              │  │  2. Pre-Ticket Validator         │  │
              │  │     GetReservation → Mapper      │  │
              │  │     → Policy API → Proceed/Hold  │  │
              │  └──────────────────────────────────┘  │
              │                                        │
              │  ┌──────────────────────────────────┐  │
              │  │  3. PNR Webhook Handler          │  │
              │  │     Notification → Parser        │  │
              │  │     → Booking Ingestion API      │  │
              │  └──────────────────────────────────┘  │
              └────────────────┬────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Policy Decision API │
                    │  POST /v1/policies/  │
                    │       evaluate       │
                    └─────────────────────┘
```

## Prerequisites

1. **Sabre Dev Studio Account** — Register at [developer.sabre.com](https://developer.sabre.com)
2. **API Credentials** — Obtain client_id and client_secret from your Sabre project
3. **PCC (Pseudo City Code)** — Your agency's Sabre PCC
4. **Travel Policy Platform** — Running instance with Policy Decision API accessible

## Configuration

Set the following environment variables:

```bash
# Sabre API Configuration
SABRE_ENVIRONMENT=cert              # 'cert' for sandbox, 'production' for live
SABRE_CLIENT_ID=your-client-id
SABRE_CLIENT_SECRET=your-client-secret
SABRE_PCC=A1B2

# Policy Platform Configuration
POLICY_API_BASE_URL=https://api.yourplatform.com
POLICY_API_KEY=your-policy-api-key
TENANT_ID=your-tenant-id

# Webhook Configuration
BOOKING_INGESTION_WEBHOOK_URL=https://api.yourplatform.com/v1/bookings/ingest
WEBHOOK_SIGNING_SECRET=your-webhook-signing-secret

# Optional
SABRE_REQUEST_TIMEOUT_MS=10000      # Default: 10000
SEARCH_POLICY_BUDGET_MS=2000        # Default: 2000
LOG_LEVEL=info                       # debug | info | warn | error
```

## Usage

### 1. Search-Time Policy Filtering (Priority Use Case)

Annotate Sabre BFM search results with compliance status in real-time:

```typescript
import {
  loadConfigFromEnv,
  createSabreAuth,
  createSabreClient,
  createPolicyApiClient,
  interceptSearchResults,
} from '@travel-policy/connector-sabre';

// Initialize
const config = loadConfigFromEnv();
const auth = createSabreAuth(config);
const sabreClient = createSabreClient(config, auth);
const policyClient = createPolicyApiClient(config);

// After receiving BFM response from Sabre
const annotatedResults = await interceptSearchResults(
  bfmResponse,
  {
    tenantId: config.tenantId,
    traveller: {
      travellerId: 'trav-001',
      employeeId: 'emp-001',
      department: 'Engineering',
      costCentre: 'CC-100',
      seniorityLevel: 'senior',
      region: 'US',
    },
    tripPurpose: 'client meeting',
  },
  policyClient,
  config
);

// Each fare now has compliance annotations:
// ✓ Green (compliant) — within policy
// ⚠ Amber (needs_approval) — requires manager approval
// ✗ Red (non_compliant) — out of policy
console.log(annotatedResults.summary);
// { totalFares: 50, compliant: 35, needsApproval: 10, nonCompliant: 5 }
```

### 2. Pre-Ticketing Compliance Check

Validate a booking against policy before issuing the ticket:

```typescript
import {
  loadConfigFromEnv,
  createSabreAuth,
  createSabreClient,
  validatePreTicket,
} from '@travel-policy/connector-sabre';

const config = loadConfigFromEnv();
const auth = createSabreAuth(config);
const sabreClient = createSabreClient(config, auth);

const result = await validatePreTicket('ABCDEF', {
  sabreClient,
  config,
  traveller: {
    travellerId: 'trav-001',
    employeeId: 'emp-001',
    department: 'Engineering',
    costCentre: 'CC-100',
    seniorityLevel: 'senior',
    region: 'US',
  },
});

switch (result.action) {
  case 'proceed':
    // Issue ticket
    console.log('Ticketing approved:', result.message);
    break;
  case 'hold':
    // Wait for approval
    console.log('Ticketing held:', result.message);
    console.log('Approval workflow:', result.approvalWorkflowId);
    break;
  case 'block':
    // Reject ticketing
    console.log('Ticketing blocked:', result.message);
    console.log('Reasons:', result.blockReasons);
    break;
}
```

### 3. Post-Booking Webhook (PNR Notifications)

Receive and process Sabre PNR change notifications:

```typescript
import express from 'express';
import { loadConfigFromEnv, createPnrWebhookRouter } from '@travel-policy/connector-sabre';

const app = express();
app.use(express.json());

const config = loadConfigFromEnv();
const webhookRouter = createPnrWebhookRouter(config);

// Mount the webhook handler
app.use('/webhooks', webhookRouter);
// Endpoint: POST /webhooks/sabre/pnr-notifications

app.listen(3000, () => {
  console.log('Sabre webhook handler listening on port 3000');
});
```

#### Standalone Lambda Handler

```typescript
import { handlePnrWebhook, loadConfigFromEnv } from '@travel-policy/connector-sabre';

export async function handler(event: APIGatewayProxyEvent) {
  const config = loadConfigFromEnv();

  // Adapt API Gateway event to Express-like request
  const req = {
    headers: event.headers,
    body: JSON.parse(event.body ?? '{}'),
  } as any;

  const result = await handlePnrWebhook(req, config);

  return {
    statusCode: result.success ? 200 : 500,
    body: JSON.stringify(result),
  };
}
```

## Testing Against Sabre Certification Environment

1. Set `SABRE_ENVIRONMENT=cert` to use Sabre's certification (sandbox) environment
2. Use test credentials from your Sabre Dev Studio project
3. Sabre's cert environment uses: `https://api-crt.cert.havail.sabre.com`

### Running Unit Tests

```bash
npm run test
```

### Integration Testing

```bash
# Set cert environment variables
export SABRE_ENVIRONMENT=cert
export SABRE_CLIENT_ID=your-cert-client-id
export SABRE_CLIENT_SECRET=your-cert-client-secret

# Run integration tests (requires network access to Sabre cert)
npm run test -- --testPathPattern=integration
```

## Deployment Options

### AWS Lambda

Deploy the search interceptor and pre-ticket validator as Lambda functions behind API Gateway. The webhook handler can be a separate Lambda triggered by API Gateway.

```typescript
// lambda.ts
import { interceptSearchResults, loadConfigFromEnv, createPolicyApiClient } from '@travel-policy/connector-sabre';

export async function searchHandler(event: any) {
  const config = loadConfigFromEnv();
  const policyClient = createPolicyApiClient(config);
  // ... handle search interception
}
```

### Express Middleware

Mount the connector as middleware in an existing Express application:

```typescript
import { createPnrWebhookRouter, loadConfigFromEnv } from '@travel-policy/connector-sabre';

const config = loadConfigFromEnv();
app.use('/api/sabre', createPnrWebhookRouter(config));
```

### Sabre Red App

For integration within Sabre Red Workspace (agent desktop):
1. Package the pre-ticket validator as a Red App plugin
2. Hook into the TKT command workflow
3. Display compliance annotations in the Red App UI

## Performance

- **Search interception**: Target < 2 seconds total (mapping + policy API + annotation)
- **Policy API call**: < 200ms (p99)
- **Pre-ticket validation**: < 5 seconds (includes Sabre GetReservation call)
- **Webhook processing**: < 1 second

## Error Handling

The connector implements graceful degradation:
- If the Policy API is unavailable, search results are returned without annotations
- If pre-ticket validation fails, the system defaults to fail-open (configurable)
- Webhook processing failures are logged and can be retried

## Project Structure

```
src/
├── index.ts                    # Barrel export
├── config.ts                   # Configuration and credentials
├── auth/
│   └── sabre-auth.ts          # OAuth2 client credentials flow
├── search/
│   ├── search-interceptor.ts  # BFM response interception
│   ├── fare-mapper.ts         # Sabre → PolicyDecisionRequest mapping
│   └── compliance-annotator.ts # Policy decision → visual annotations
├── booking/
│   ├── pre-ticket-validator.ts # Pre-ticketing compliance check
│   └── booking-mapper.ts      # PNR → PolicyDecisionRequest mapping
├── webhook/
│   ├── pnr-webhook-handler.ts # Express handler for PNR notifications
│   └── pnr-parser.ts         # PNR notification → canonical format
├── types/
│   ├── sabre-types.ts         # Sabre API response types
│   └── compliance-types.ts    # Compliance annotation types
└── utils/
    ├── sabre-client.ts        # HTTP client with retry/auth refresh
    └── logger.ts              # Structured JSON logging
```
