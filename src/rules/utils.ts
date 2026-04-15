export function stripCdkHash(logicalId: string): string {
  return logicalId.replace(/[A-F0-9]{8}$/, '');
}

export function parseArnName(arn: string): string | undefined {
  const name = arn.split(':').at(-1);
  return name || undefined;
}

// Parses a CDK cross-stack Fn::ImportValue string and returns the exporting stack name
// and the construct ID that was exported. Handles both ExportsOutputRef and ExportsOutputFnGetAtt formats.
export function parseCrossStackRef(importValue: string): { stackName: string; constructId: string } | undefined {
  const colonIdx = importValue.indexOf(':');
  if (colonIdx < 0) return undefined;
  const stackName = importValue.slice(0, colonIdx);
  const exportName = importValue.slice(colonIdx + 1);

  // ExportsOutputRef{ConstructId}{8-char-hash}{8-char-hash}
  const refMatch = exportName.match(/ExportsOutputRef([A-Za-z0-9]+?)[A-F0-9]{8}[A-F0-9]{8}$/);
  if (refMatch) return { stackName, constructId: refMatch[1] };

  // ExportsOutputFnGetAtt{ConstructId}{8-char-hash}{AttrName}{8-char-hash}
  const getAttMatch = exportName.match(/ExportsOutputFnGetAtt([A-Za-z0-9]+?)[A-F0-9]{8}[A-Za-z0-9]+[A-F0-9]{8}$/);
  if (getAttMatch) return { stackName, constructId: getAttMatch[1] };

  return undefined;
}
