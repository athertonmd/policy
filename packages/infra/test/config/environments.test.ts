import { getEnvironments, getPlatformConfig } from '../../src/config/environments';

describe('Environment Configuration', () => {
  it('returns configurations for all 4 platform regions', () => {
    const envs = getEnvironments();
    expect(Object.keys(envs)).toEqual(['uk', 'eu', 'us', 'anz']);
  });

  it('maps UK to eu-west-2', () => {
    const envs = getEnvironments();
    expect(envs.uk.env.region).toBe('eu-west-2');
  });

  it('maps EU to eu-central-1', () => {
    const envs = getEnvironments();
    expect(envs.eu.env.region).toBe('eu-central-1');
  });

  it('maps US to us-east-1', () => {
    const envs = getEnvironments();
    expect(envs.us.env.region).toBe('us-east-1');
  });

  it('maps ANZ to ap-southeast-2', () => {
    const envs = getEnvironments();
    expect(envs.anz.env.region).toBe('ap-southeast-2');
  });

  it('marks UK as the primary region', () => {
    const envs = getEnvironments();
    expect(envs.uk.isPrimary).toBe(true);
    expect(envs.eu.isPrimary).toBe(false);
    expect(envs.us.isPrimary).toBe(false);
    expect(envs.anz.isPrimary).toBe(false);
  });

  it('returns platform config with default values', () => {
    const config = getPlatformConfig();
    expect(config.platformName).toBe('travel-policy-platform');
    expect(config.rootDomain).toBeDefined();
    expect(config.accountId).toBeDefined();
  });
});
