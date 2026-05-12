import {
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  CfnOutput,
  Tags,
} from 'aws-cdk-lib';
import { Key, KeySpec, KeyUsage } from 'aws-cdk-lib/aws-kms';
import {
  PublicHostedZone,
  ARecord,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import {
  Distribution,
  ViewerProtocolPolicy,
  AllowedMethods,
  CachePolicy,
  PriceClass,
  SecurityPolicyProtocol,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Bucket, BlockPublicAccess, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { UserPool, Mfa, AccountRecovery } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { PlatformRegion } from '../config/environments';

export interface SharedResourcesStackProps extends StackProps {
  /** Platform region identifier */
  readonly platformRegion: PlatformRegion;
  /** Platform name for resource naming */
  readonly platformName: string;
  /** Root domain for the platform */
  readonly rootDomain: string;
  /** Whether this region hosts global resources (CloudFront, Route 53) */
  readonly isPrimary: boolean;
}

/**
 * Shared resources stack providing KMS keys, Route 53 hosted zone,
 * and CloudFront distribution for the platform.
 *
 * KMS keys are region-specific for data residency compliance.
 * Route 53 and CloudFront are only created in the primary region.
 */
export class SharedResourcesStack extends Stack {
  /** Platform-level KMS key for encrypting shared resources */
  public readonly platformEncryptionKey: Key;
  /** KMS key specifically for Aurora database encryption */
  public readonly databaseEncryptionKey: Key;
  /** Route 53 hosted zone (only in primary region) */
  public hostedZone: PublicHostedZone | undefined;
  /** CloudFront distribution (only in primary region) */
  public distribution: Distribution | undefined;
  /** S3 bucket for frontend assets (only in primary region) */
  public frontendBucket: Bucket | undefined;
  /** Cognito user pool for tenant user authentication */
  public readonly cognitoUserPool: UserPool;

  constructor(scope: Construct, id: string, props: SharedResourcesStackProps) {
    super(scope, id, props);

    const { platformRegion, platformName, rootDomain, isPrimary } = props;
    const prefix = `${platformName}-${platformRegion}`;

    // Platform-level KMS key for general encryption (secrets, config, etc.)
    this.platformEncryptionKey = new Key(this, 'PlatformEncryptionKey', {
      alias: `${prefix}-platform-key`,
      description: `Platform encryption key for ${platformRegion} region`,
      enableKeyRotation: true,
      keySpec: KeySpec.SYMMETRIC_DEFAULT,
      keyUsage: KeyUsage.ENCRYPT_DECRYPT,
      removalPolicy: RemovalPolicy.RETAIN,
      pendingWindow: Duration.days(30),
    });

    // Dedicated KMS key for Aurora database encryption
    this.databaseEncryptionKey = new Key(this, 'DatabaseEncryptionKey', {
      alias: `${prefix}-database-key`,
      description: `Database encryption key for Aurora in ${platformRegion} region`,
      enableKeyRotation: true,
      keySpec: KeySpec.SYMMETRIC_DEFAULT,
      keyUsage: KeyUsage.ENCRYPT_DECRYPT,
      removalPolicy: RemovalPolicy.RETAIN,
      pendingWindow: Duration.days(30),
    });

    // Cognito User Pool for tenant user authentication
    this.cognitoUserPool = new UserPool(this, 'TenantUserPool', {
      userPoolName: `${prefix}-tenant-users`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      mfa: Mfa.OPTIONAL,
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Global resources only in the primary region
    if (isPrimary) {
      this.createGlobalResources(prefix, rootDomain);
    }

    // Tags
    Tags.of(this).add('Platform', platformName);
    Tags.of(this).add('Region', platformRegion);
    Tags.of(this).add('Stack', 'SharedResources');

    // Outputs
    new CfnOutput(this, 'PlatformEncryptionKeyArn', {
      value: this.platformEncryptionKey.keyArn,
      description: 'ARN of the platform encryption KMS key',
      exportName: `${prefix}-platform-key-arn`,
    });

    new CfnOutput(this, 'DatabaseEncryptionKeyArn', {
      value: this.databaseEncryptionKey.keyArn,
      description: 'ARN of the database encryption KMS key',
      exportName: `${prefix}-database-key-arn`,
    });
  }

  private createGlobalResources(prefix: string, rootDomain: string): void {
    // Route 53 hosted zone for the platform domain
    const hostedZone = new PublicHostedZone(this, 'HostedZone', {
      zoneName: rootDomain,
      comment: 'Hosted zone for the Travel Policy Platform',
    });
    this.hostedZone = hostedZone;

    // S3 bucket for frontend static assets
    const frontendBucket = new Bucket(this, 'FrontendBucket', {
      bucketName: `${prefix}-frontend-assets`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
    });
    this.frontendBucket = frontendBucket;

    // CloudFront distribution serving the frontend globally
    const distribution = new Distribution(this, 'Distribution', {
      comment: 'Travel Policy Platform frontend distribution',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
      ],
      priceClass: PriceClass.PRICE_CLASS_ALL,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
    });
    this.distribution = distribution;

    // DNS record pointing to CloudFront
    new ARecord(this, 'CloudFrontARecord', {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      recordName: rootDomain,
    });

    // Outputs for global resources
    new CfnOutput(this, 'HostedZoneId', {
      value: hostedZone.hostedZoneId,
      description: 'Route 53 hosted zone ID',
      exportName: `${prefix}-hosted-zone-id`,
    });

    new CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: `${prefix}-distribution-id`,
    });

    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: `${prefix}-distribution-domain`,
    });

    new CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket for frontend assets',
      exportName: `${prefix}-frontend-bucket`,
    });
  }
}
