import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SharedResourcesStack } from '../../src/stacks/shared-resources-stack';

describe('SharedResourcesStack', () => {
  describe('in primary region', () => {
    let template: Template;

    beforeAll(() => {
      const app = new App();
      const stack = new SharedResourcesStack(app, 'TestSharedPrimary', {
        env: { account: '123456789012', region: 'eu-west-2' },
        platformRegion: 'uk',
        platformName: 'travel-policy-platform',
        rootDomain: 'travel-policy.example.com',
        isPrimary: true,
      });
      template = Template.fromStack(stack);
    });

    it('creates platform encryption KMS key with rotation enabled', () => {
      template.hasResourceProperties('AWS::KMS::Key', {
        EnableKeyRotation: true,
        Description: Match.stringLikeRegexp('Platform encryption key'),
      });
    });

    it('creates database encryption KMS key with rotation enabled', () => {
      template.hasResourceProperties('AWS::KMS::Key', {
        EnableKeyRotation: true,
        Description: Match.stringLikeRegexp('Database encryption key'),
      });
    });

    it('creates Route 53 hosted zone', () => {
      template.hasResourceProperties('AWS::Route53::HostedZone', {
        Name: 'travel-policy.example.com.',
      });
    });

    it('creates CloudFront distribution with HTTPS redirect', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          DefaultCacheBehavior: Match.objectLike({
            ViewerProtocolPolicy: 'redirect-to-https',
          }),
          DefaultRootObject: 'index.html',
        }),
      });
    });

    it('creates S3 bucket for frontend assets with public access blocked', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'travel-policy-platform-uk-frontend-assets',
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    it('creates DNS A record pointing to CloudFront', () => {
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Type: 'A',
        Name: 'travel-policy.example.com.',
      });
    });

    it('exports KMS key ARNs', () => {
      template.hasOutput('PlatformEncryptionKeyArn', {
        Export: { Name: 'travel-policy-platform-uk-platform-key-arn' },
      });
      template.hasOutput('DatabaseEncryptionKeyArn', {
        Export: { Name: 'travel-policy-platform-uk-database-key-arn' },
      });
    });
  });

  describe('in non-primary region', () => {
    let template: Template;

    beforeAll(() => {
      const app = new App();
      const stack = new SharedResourcesStack(app, 'TestSharedSecondary', {
        env: { account: '123456789012', region: 'eu-central-1' },
        platformRegion: 'eu',
        platformName: 'travel-policy-platform',
        rootDomain: 'travel-policy.example.com',
        isPrimary: false,
      });
      template = Template.fromStack(stack);
    });

    it('creates KMS keys', () => {
      template.resourceCountIs('AWS::KMS::Key', 2);
    });

    it('does not create Route 53 hosted zone', () => {
      template.resourceCountIs('AWS::Route53::HostedZone', 0);
    });

    it('does not create CloudFront distribution', () => {
      template.resourceCountIs('AWS::CloudFront::Distribution', 0);
    });

    it('does not create S3 bucket for frontend', () => {
      template.resourceCountIs('AWS::S3::Bucket', 0);
    });
  });
});
