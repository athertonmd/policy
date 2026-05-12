/**
 * Amazon Bedrock integration wrapper for AI-powered policy recommendations.
 * Provides a typed interface for invoking Claude models via Bedrock Runtime.
 */
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BedrockInvokeOptions {
  messages: BedrockMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface BedrockResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}

const DEFAULT_MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-sonnet-20240229-v1:0';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.3;

let clientInstance: BedrockRuntimeClient | null = null;

/**
 * Returns a singleton Bedrock Runtime client.
 */
export function getBedrockClient(): BedrockRuntimeClient {
  if (!clientInstance) {
    clientInstance = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
    });
  }
  return clientInstance;
}

/**
 * Invokes a Claude model via Amazon Bedrock with the Messages API format.
 */
export async function invokeModel(options: BedrockInvokeOptions): Promise<BedrockResponse> {
  const client = getBedrockClient();

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    top_p: options.topP ?? 0.9,
    system: options.systemPrompt ?? '',
    messages: options.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const command = new InvokeModelCommand({
    modelId: DEFAULT_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  return {
    content: responseBody.content?.[0]?.text ?? '',
    inputTokens: responseBody.usage?.input_tokens ?? 0,
    outputTokens: responseBody.usage?.output_tokens ?? 0,
    stopReason: responseBody.stop_reason ?? 'unknown',
  };
}

/**
 * Convenience function for single-turn queries with a system prompt.
 */
export async function queryBedrock(
  question: string,
  systemPrompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const response = await invokeModel({
    messages: [{ role: 'user', content: question }],
    systemPrompt,
    maxTokens: options?.maxTokens,
    temperature: options?.temperature,
  });
  return response.content;
}
