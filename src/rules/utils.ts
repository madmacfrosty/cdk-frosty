export function stripCdkHash(logicalId: string): string {
  return logicalId.replace(/[A-F0-9]{8}$/, '');
}

export function parseArnName(arn: string): string | undefined {
  const name = arn.split(':').at(-1);
  return name || undefined;
}
