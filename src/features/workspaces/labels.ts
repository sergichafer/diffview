/** First letter of the repository name; `owner/repo` uses `repo`. */
export function repoInitial(name: string): string {
  const trimmed = (name.split("/").pop() ?? "").trim();
  return (trimmed[0] ?? "?").toUpperCase();
}
