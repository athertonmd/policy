import {
  Stack,
  StackProps,
  CfnOutput,
  Tags,
} from 'aws-cdk-lib';
import {
  Vpc,
  SubnetType,
  SecurityGroup,
  Port,
  Peer,
  IpAddresses,
  FlowLogDestination,
  FlowLogTrafficType,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { PlatformRegion } from '../config/environments';

export interface NetworkingStackProps extends StackProps {
  /** Platform region identifier */
  readonly platformRegion: PlatformRegion;
  /** Platform name for resource naming */
  readonly platformName: string;
}

/**
 * Networking stack providing VPC, subnets, and security groups
 * for Aurora connectivity and Lambda execution.
 *
 * Each region gets its own isolated VPC with:
 * - Private subnets for Aurora PostgreSQL
 * - Isolated subnets for Lambda functions (no internet access)
 * - Public subnets for NAT Gateways (outbound internet for private subnets)
 */
export class NetworkingStack extends Stack {
  /** The VPC for this region */
  public readonly vpc: Vpc;
  /** Security group for Aurora PostgreSQL cluster */
  public readonly auroraSecurityGroup: SecurityGroup;
  /** Security group for Lambda functions that access Aurora */
  public readonly lambdaSecurityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkingStackProps) {
    super(scope, id, props);

    const { platformRegion, platformName } = props;
    const prefix = `${platformName}-${platformRegion}`;

    // VPC with private subnets for Aurora, isolated subnets for Lambda
    this.vpc = new Vpc(this, 'Vpc', {
      vpcName: `${prefix}-vpc`,
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 3,
      natGateways: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'Isolated',
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      flowLogs: {
        default: {
          destination: FlowLogDestination.toCloudWatchLogs(),
          trafficType: FlowLogTrafficType.REJECT,
        },
      },
    });

    // Security group for Aurora PostgreSQL
    this.auroraSecurityGroup = new SecurityGroup(this, 'AuroraSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `${prefix}-aurora-sg`,
      description: 'Security group for Aurora PostgreSQL Serverless v2 cluster',
      allowAllOutbound: false,
    });

    // Security group for Lambda functions accessing Aurora
    this.lambdaSecurityGroup = new SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `${prefix}-lambda-sg`,
      description: 'Security group for Lambda functions with Aurora access',
      allowAllOutbound: true,
    });

    // Allow Lambda to connect to Aurora on PostgreSQL port
    this.auroraSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      Port.tcp(5432),
      'Allow Lambda functions to connect to Aurora PostgreSQL',
    );

    // Allow Aurora to respond to Lambda (stateful, but explicit for clarity)
    this.lambdaSecurityGroup.addIngressRule(
      Peer.ipv4(this.vpc.vpcCidrBlock),
      Port.tcp(5432),
      'Allow responses from Aurora within VPC',
    );

    // Tags for cost allocation and identification
    Tags.of(this).add('Platform', platformName);
    Tags.of(this).add('Region', platformRegion);
    Tags.of(this).add('Stack', 'Networking');

    // Outputs
    new CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID for the platform networking stack',
      exportName: `${prefix}-vpc-id`,
    });

    new CfnOutput(this, 'AuroraSecurityGroupId', {
      value: this.auroraSecurityGroup.securityGroupId,
      description: 'Security group ID for Aurora PostgreSQL',
      exportName: `${prefix}-aurora-sg-id`,
    });

    new CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      description: 'Security group ID for Lambda functions',
      exportName: `${prefix}-lambda-sg-id`,
    });
  }
}
