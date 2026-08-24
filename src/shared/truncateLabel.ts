export function truncateLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label;
  return `${label.slice(0, maxChars - 1)}…`;
}
