import { Duration, Tags } from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/**
 * Properties for the ApprovalStateMachine construct.
 */
export interface ApprovalStateMachineProps {
  /** Platform name for resource naming */
  readonly platformName: string;
  /** Platform region identifier */
  readonly platformRegion: string;
  /** The ASL definition object for the state machine */
  readonly definition: object;
  /** Workflow type identifier (e.g., 'single-stage', 'multi-stage-sequential') */
  readonly workflowType: string;
  /** Optional suffix for unique naming when deploying multiple machines of same type */
  readonly nameSuffix?: string;
  /** Lambda function ARNs that the state machine needs to invoke */
  readonly lambdaArns: string[];
  /** Whether to enable CloudWatch logging (default: true) */
  readonly enableLogging?: boolean;
  /** Log retention in days (default: 30) */
  readonly logRetentionDays?: number;
}

/**
 * CDK Construct that deploys an AWS Step Functions Standard Workflow
 * for approval orchestration.
 *
 * Uses Standard Workflows (not Express) because approvals are long-running
 * human tasks that may take hours or days to complete.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 */
export class ApprovalStateMachine extends Construct {
  /** The Step Functions state machine */
  public readonly stateMachine: sfn.CfnStateMachine;
  /** The IAM role for the state machine */
  public readonly role: iam.Role;
  /** The CloudWatch log group (if logging enabled) */
  public readonly logGroup?: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ApprovalStateMachineProps) {
    super(scope, id);

    const {
      platformName,
      platformRegion,
      definition,
      workflowType,
      nameSuffix,
      lambdaArns,
      enableLogging = true,
      logRetentionDays = 30,
    } = props;

    const prefix = `${platformName}-${platformRegion}`;
    const machineName = nameSuffix
      ? `${prefix}-approval-${workflowType}-${nameSuffix}`
      : `${prefix}-approval-${workflowType}`;

    // IAM Role for the state machine
    this.role = new iam.Role(this, 'Role', {
      roleName: `${machineName}-role`,
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      description: `Execution role for ${workflowType} approval state machine`,
    });

    // Grant Lambda invoke permissions
    if (lambdaArns.length > 0) {
      this.role.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:InvokeFunction'],
          resources: lambdaArns,
        }),
      );
    }

    // CloudWatch Logs configuration
    let loggingConfiguration: sfn.CfnStateMachine.LoggingConfigurationProperty | undefined;

    if (enableLogging) {
      this.logGroup = new logs.LogGroup(this, 'LogGroup', {
        logGroupName: `/aws/stepfunctions/${machineName}`,
        retention: logRetentionDays as logs.RetentionDays,
        removalPolicy: undefined, // Use default (retain)
      });

      // Grant logging permissions
      this.role.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogDelivery',
            'logs:GetLogDelivery',
            'logs:UpdateLogDelivery',
            'logs:DeleteLogDelivery',
            'logs:ListLogDeliveries',
            'logs:PutResourcePolicy',
            'logs:DescribeResourcePolicies',
            'logs:DescribeLogGroups',
            'logs:PutLogEvents',
            'logs:CreateLogStream',
          ],
          resources: ['*'],
        }),
      );

      loggingConfiguration = {
        destinations: [
          {
            cloudWatchLogsLogGroup: {
              logGroupArn: this.logGroup.logGroupArn,
            },
          },
        ],
        includeExecutionData: true,
        level: 'ALL',
      };
    }

    // State Machine (Standard Workflow for long-running human tasks)
    this.stateMachine = new sfn.CfnStateMachine(this, 'StateMachine', {
      stateMachineName: machineName,
      stateMachineType: 'STANDARD',
      definitionString: JSON.stringify(definition),
      roleArn: this.role.roleArn,
      loggingConfiguration,
      tracingConfiguration: {
        enabled: true,
      },
    });

    // Tags
    Tags.of(this).add('Platform', platformName);
    Tags.of(this).add('Region', platformRegion);
    Tags.of(this).add('WorkflowType', workflowType);
    Tags.of(this).add('Component', 'ApprovalWorkflow');
  }
}
