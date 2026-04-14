import { stripCdkHash, parseArnName } from './utils';

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
