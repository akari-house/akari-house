export function isValidDecisionNote(note: string) {
  const length = note.trim().length;
  return length >= 5 && length <= 500;
}
