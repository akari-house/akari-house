export function validEvidenceReference(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 3 && trimmed.length <= 500 && !/[\r\n]/.test(trimmed);
}

export function launchGateDecision(status: string, evidenceReference: string) {
  if (status === "passed" && !validEvidenceReference(evidenceReference)) {
    return { valid: false, message: "Passed checks require an evidence reference." };
  }
  return { valid: true, message: "" };
}
