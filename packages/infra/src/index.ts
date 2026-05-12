/**
 * CDK Infrastructure for the Travel Policy Platform.
 *
 * Exports all stacks and configuration for use by the CDK app entry point
 * and for cross-stack references.
 */
export * from './config/index';
export * from './stacks/index';
export { ApprovalStateMachine } from './constructs/approval-state-machine';
export type { ApprovalStateMachineProps } from './constructs/approval-state-machine';
export {
  LambdaProvisionedConcurrency,
  AuroraAutoScaling,
  ApiGatewayThrottling,
  PlatformAutoScaling,
} from './constructs/auto-scaling';
export type {
  LambdaProvisionedConcurrencyProps,
  AuroraAutoScalingProps,
  ApiGatewayThrottlingProps,
  PlatformAutoScalingProps,
  TenantThrottleConfig,
  MethodThrottleConfig,
  ScheduledScalingConfig,
} from './constructs/auto-scaling';
