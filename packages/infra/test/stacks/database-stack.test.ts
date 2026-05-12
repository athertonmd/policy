import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Key } from 'aws-cdk-lib/aws-kms';
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { DatabaseStack } from '../../src/stacks/database-stack';

describe('DatabaseStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();

    // Create a prerequisite stack with VPC, security group, and KMS key
    const prereqStack = new Stack(app, 'PrereqStack', {
      env: { account: '123456789012', region: 'eu-west-2' },
    });

    const vpc = new Vpc(prereqStack, 'Vpc', {
      maxAzs: 3,
    });

    const auroraSecurityGroup = new SecurityGroup(prereqStack, 'AuroraSG', {
      vpc,
      description: 'Aurora security group',
    });

    const databaseEncryptionKey = new Key(prereqStack, 'DbKey', {
      enableKeyRotation: true,
    });

    const stack = new DatabaseStack(app, 'TestDatabase', {
      env: { account: '123456789012', region: 'eu-west-2' },
      platformRegion: 'uk',
      platformName: 'travel-policy-platform',
      vpc,
      auroraSecurityGroup,
      databaseEncryptionKey,
    });

    template = Template.fromStack(stack);
  });

  it('creates an Aurora PostgreSQL Serverless v2 cluster', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      EngineVersion: '16.4',
      ServerlessV2ScalingConfiguration: {
        MinCapacity: 0.5,
        MaxCapacity: 16,
      },
    });
  });

  it('configures the cluster with the correct identifier', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      DBClusterIdentifier: 'travel-policy-platform-uk-aurora-cluster',
    });
  });

  it('sets the default database name', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      DatabaseName: 'travel_policy',
    });
  });

  it('enables storage encryption with KMS', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      StorageEncrypted: true,
      KmsKeyId: Match.anyValue(),
    });
  });

  it('enables IAM authentication', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      EnableIAMDatabaseAuthentication: true,
    });
  });

  it('configures automated backups with 7-day retention', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      BackupRetentionPeriod: 7,
      PreferredBackupWindow: '03:00-04:00',
    });
  });

  it('enables deletion protection', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      DeletionProtection: true,
    });
  });

  it('enables copy tags to snapshot', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      CopyTagsToSnapshot: true,
    });
  });

  it('creates writer and reader DB instances as Serverless v2', () => {
    template.resourceCountIs('AWS::RDS::DBInstance', 2);
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DBInstanceClass: 'db.serverless',
      PubliclyAccessible: false,
    });
  });

  it('stores credentials in Secrets Manager', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'travel-policy-platform-uk/aurora/credentials',
    });
  });

  it('creates a parameter group with SSL enforcement', () => {
    template.hasResourceProperties('AWS::RDS::DBClusterParameterGroup', {
      Family: 'aurora-postgresql16',
      Parameters: Match.objectLike({
        'rds.force_ssl': '1',
      }),
    });
  });

  it('exports cluster endpoint', () => {
    template.hasOutput('ClusterEndpoint', {
      Export: { Name: 'travel-policy-platform-uk-aurora-cluster-endpoint' },
    });
  });

  it('exports cluster reader endpoint', () => {
    template.hasOutput('ClusterReaderEndpoint', {
      Export: { Name: 'travel-policy-platform-uk-aurora-reader-endpoint' },
    });
  });

  it('exports cluster secret ARN', () => {
    template.hasOutput('ClusterSecretArn', {
      Export: { Name: 'travel-policy-platform-uk-aurora-secret-arn' },
    });
  });
});
