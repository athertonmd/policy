/**
 * Database connection helper for Tenant Management Service.
 * Resolves credentials from AWS Secrets Manager and provides
 * a query interface for the platform schema.
 */
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

export interface DatabaseCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  dbname: string;
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
  end(): Promise<void>;
}

const secretsClient = new SecretsManagerClient({});

let cachedCredentials: DatabaseCredentials | null = null;
let credentialsCacheExpiry = 0;

const CREDENTIALS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Retrieves database credentials from Secrets Manager with caching.
 */
export async function getDatabaseCredentials(): Promise<DatabaseCredentials> {
  const now = Date.now();
  if (cachedCredentials && now < credentialsCacheExpiry) {
    return cachedCredentials;
  }

  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new Error('DB_SECRET_ARN environment variable is not set');
  }

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  if (!response.SecretString) {
    throw new Error('Database secret has no string value');
  }

  const secret = JSON.parse(response.SecretString) as DatabaseCredentials;
  cachedCredentials = secret;
  credentialsCacheExpiry = now + CREDENTIALS_CACHE_TTL_MS;

  return secret;
}

/**
 * Creates a database client using pg.
 * In production, this connects to Aurora PostgreSQL.
 */
export async function createDatabaseClient(): Promise<DatabaseClient> {
  const credentials = await getDatabaseCredentials();

  // Dynamic import to allow pg to be optional in test environments
  const { Client } = await import('pg');

  const client = new Client({
    host: credentials.host,
    port: credentials.port,
    user: credentials.username,
    password: credentials.password,
    database: credentials.dbname,
    ssl: process.env.DB_SSL_ENABLED !== 'false' ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      const result = await client.query(sql, params);
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? 0,
      };
    },
    async end(): Promise<void> {
      await client.end();
    },
  };
}

/**
 * Executes a function with a database client, ensuring cleanup.
 */
export async function withDatabase<T>(
  fn: (client: DatabaseClient) => Promise<T>
): Promise<T> {
  const client = await createDatabaseClient();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
