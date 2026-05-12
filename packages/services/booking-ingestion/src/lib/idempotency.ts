/**
 * Idempotency checking and recording for webhook events.
 * Uses DynamoDB WebhookIdempotency table to prevent duplicate processing.
 */
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';

const dynamoClient = new DynamoDBClient({});

const TABLE_NAME = process.env.WEBHOOK_IDEMPOTENCY_TABLE ?? 'WebhookIdempotency';
const TTL_DAYS = 7;

/**
 * Checks whether a webhook event has already been processed.
 *
 * @param integrationId - The integration source identifier (partition key)
 * @param idempotencyKey - The provider-supplied idempotency key (sort key)
 * @returns true if the event has already been processed, false otherwise
 */
export async function checkIdempotency(
  integrationId: string,
  idempotencyKey: string
): Promise<boolean> {
  const result = await dynamoClient.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: {
        integrationId: { S: integrationId },
        idempotencyKey: { S: idempotencyKey },
      },
    })
  );

  return !!result.Item;
}

/**
 * Records a webhook event as processed with a 7-day TTL.
 *
 * @param integrationId - The integration source identifier (partition key)
 * @param idempotencyKey - The provider-supplied idempotency key (sort key)
 * @throws if the record already exists (conditional check failure)
 */
export async function recordIdempotency(
  integrationId: string,
  idempotencyKey: string
): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + TTL_DAYS * 24 * 60 * 60;

  try {
    await dynamoClient.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          integrationId: { S: integrationId },
          idempotencyKey: { S: idempotencyKey },
          processedAt: { S: new Date().toISOString() },
          ttl: { N: ttl.toString() },
        },
        ConditionExpression:
          'attribute_not_exists(integrationId) AND attribute_not_exists(idempotencyKey)',
      })
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      // Already recorded — treat as duplicate
      return;
    }
    throw error;
  }
}
