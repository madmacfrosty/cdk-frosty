import { stripCdkHash, parseArnName, parseCrossStackRef } from './utils';

describe('stripCdkHash', () => {
  it('strips an 8-char uppercase hex suffix', () => {
    expect(stripCdkHash('MyTableABCDEF12')).toBe('MyTable');
  });

  it('leaves the string unchanged when there is no hash suffix', () => {
    expect(stripCdkHash('MyTable')).toBe('MyTable');
  });

  it('does not strip lowercase hex', () => {
    expect(stripCdkHash('MyTableabcdef12')).toBe('MyTableabcdef12');
  });

  it('does not strip a 7-char suffix', () => {
    expect(stripCdkHash('MyTableABCDEF1')).toBe('MyTableABCDEF1');
  });
});

describe('parseArnName', () => {
  it('extracts the last colon-delimited segment', () => {
    expect(parseArnName('arn:aws:states:us-east-1:123456789:stateMachine:MyStateMachine')).toBe('MyStateMachine');
  });

  it('returns undefined for an empty trailing segment', () => {
    expect(parseArnName('arn:aws:states:us-east-1:')).toBeUndefined();
  });

  it('returns the whole string when there is no colon', () => {
    expect(parseArnName('MyStateMachine')).toBe('MyStateMachine');
  });
});

describe('parseCrossStackRef', () => {
  it('parses an ExportsOutputRef import value', () => {
    expect(parseCrossStackRef('InfraStack:ExportsOutputRefAgentCoreRuntimeABCDEF1234567890')).toEqual({
      stackName: 'InfraStack',
      constructId: 'AgentCoreRuntime',
    });
  });

  it('parses an ExportsOutputFnGetAtt import value', () => {
    expect(parseCrossStackRef('InfraStack:ExportsOutputFnGetAttMyBucketABCDEF12Arn34567890')).toEqual({
      stackName: 'InfraStack',
      constructId: 'MyBucket',
    });
  });

  it('returns undefined when there is no colon separator', () => {
    expect(parseCrossStackRef('NoColonHere')).toBeUndefined();
  });

  it('returns undefined when the export name does not match known patterns', () => {
    expect(parseCrossStackRef('InfraStack:SomeRandomExportName')).toBeUndefined();
  });
});
