import {
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  CfnOutput,
  Tags,
} from 'aws-cdk-lib';
import {
  DatabaseCluster,
  DatabaseClusterEngine,
  AuroraPostgresEngineVersion,
  ClusterInstance,
  Credentials,
  ParameterGroup,
} from 'aws-cdk-lib/aws-rds';
import { Vpc, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { PlatformRegion } from '../config/environments';

export interface DatabaseStackProps extends StackProps {
  /** Platform region identifier */
  readonly platformRegion: PlatformRegion;
  /** Platform name for resource naming */
  readonly platformName: string;
  /** VPC to deploy the Aurora cluster into */
  readonly vpc: Vpc;
  /** Security group for the Aurora cluster */
  readonly auroraSecurityGroup: SecurityGroup;
  /** KMS key for encrypting the database at rest */
  readonly databaseEncryptionKey: Key;
}

/**
 * Database stack deploying Aurora PostgreSQL Serverless v2 cluster
 * with IAM authentication, automated backups, and encryption at rest.
 *
 * The cluster is placed in private subnets and uses the database-specific
 * KMS key from SharedResourcesStack for encryption.
 */
export class DatabaseStack extends Stack {
  /** The Aurora PostgreSQL Serverless v2 cluster */
  public readonly cluster: DatabaseCluster;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const {
      platformRegion,
      platformName,
      vpc,
      auroraSecurityGroup,
      databaseEncryptionKey,
    } = props;
    const prefix = `${platformName}-${platformRegion}`;

    // Parameter group for Aurora PostgreSQL 16
    const parameterGroup = new ParameterGroup(this, 'ParameterGroup', {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_16_4,
      }),
      description: `Parameter group for ${prefix} Aurora PostgreSQL cluster`,
      parameters: {
        // Enable logical replication for future CDC needs
        'rds.logical_replication': '1',
        // Enforce SSL connections
        'rds.force_ssl': '1',
      },
    });

    // Aurora PostgreSQL Serverless v2 cluster
    this.cluster = new DatabaseCluster(this, 'AuroraCluster', {
      clusterIdentifier: `${prefix}-aurora-cluster`,
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_16_4,
      }),
      credentials: Credentials.fromGeneratedSecret('platform_admin', {
        secretName: `${prefix}/aurora/credentials`,
      }),
      defaultDatabaseName: 'travel_policy',
      vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [auroraSecurityGroup],
      parameterGroup,
      writer: ClusterInstance.serverlessV2('Writer', {
        publiclyAccessible: false,
      }),
      readers: [],
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      storageEncrypted: true,
      storageEncryptionKey: databaseEncryptionKey,
      iamAuthentication: true,
      backup: {
        retention: Duration.days(7),
        preferredWindow: '03:00-04:00',
      },
      removalPolicy: RemovalPolicy.RETAIN,
      deletionProtection: true,
      copyTagsToSnapshot: true,
    });

    // Tags
    Tags.of(this).add('Platform', platformName);
    Tags.of(this).add('Region', platformRegion);
    Tags.of(this).add('Stack', 'Database');

    // Outputs
    new CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint.hostname,
      description: 'Aurora cluster writer endpoint',
      exportName: `${prefix}-aurora-cluster-endpoint`,
    });

    new CfnOutput(this, 'ClusterReaderEndpoint', {
      value: this.cluster.clusterReadEndpoint.hostname,
      description: 'Aurora cluster reader endpoint',
      exportName: `${prefix}-aurora-reader-endpoint`,
    });

    new CfnOutput(this, 'ClusterSecretArn', {
      value: this.cluster.secret?.secretArn ?? '',
      description: 'ARN of the Secrets Manager secret containing database credentials',
      exportName: `${prefix}-aurora-secret-arn`,
    });
  }
}
