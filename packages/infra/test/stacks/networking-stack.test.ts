import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkingStack } from '../../src/stacks/networking-stack';

describe('NetworkingStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new NetworkingStack(app, 'TestNetworking', {
      env: { account: '123456789012', region: 'eu-west-2' },
      platformRegion: 'uk',
      platformName: 'travel-policy-platform',
    });
    template = Template.fromStack(stack);
  });

  it('creates a VPC with the correct CIDR', () => {
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/16',
    });
  });

  it('creates public, private, and isolated subnets across 3 AZs', () => {
    // 3 AZs × 3 subnet types = 9 subnets
    template.resourceCountIs('AWS::EC2::Subnet', 9);
  });

  it('creates NAT gateways for private subnet egress', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 2);
  });

  it('creates Aurora security group allowing PostgreSQL port', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security group for Aurora PostgreSQL Serverless v2 cluster',
    });
  });

  it('creates Lambda security group', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security group for Lambda functions with Aurora access',
    });
  });

  it('creates security group ingress rule for PostgreSQL port 5432', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 5432,
      ToPort: 5432,
    });
  });

  it('creates VPC flow logs', () => {
    template.hasResourceProperties('AWS::EC2::FlowLog', {
      TrafficType: 'REJECT',
    });
  });

  it('exports VPC ID', () => {
    template.hasOutput('VpcId', {
      Export: { Name: 'travel-policy-platform-uk-vpc-id' },
    });
  });
});
