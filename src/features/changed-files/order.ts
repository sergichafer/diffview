import { treePaths } from "./treePaths";

type DirNode = {
  dirs: Map<string, DirNode>;
  files: string[];
};

type SegmentSortKey = {
  lowerValue: string;
  tokens: readonly (string | number)[];
};

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

function isDigitCode(characterCode: number): boolean {
  return characterCode >= 48 && characterCode <= 57;
}

/** Mirrors @pierre/trees path-store natural segment sort (Square30 < Square44 < Square310). */
function splitIntoNaturalTokens(value: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  let tokenStart = 0;
  let index = 0;

  while (index < value.length) {
    while (index < value.length && !isDigitCode(value.charCodeAt(index))) {
      index += 1;
    }
    if (index >= value.length) break;

    if (index > tokenStart) {
      tokens.push(value.slice(tokenStart, index));
    }

    let numberValue = 0;
    while (index < value.length && isDigitCode(value.charCodeAt(index))) {
      numberValue = numberValue * 10 + (value.charCodeAt(index) - 48);
      index += 1;
    }
    tokens.push(numberValue);
    tokenStart = index;
  }

  if (tokenStart < value.length || tokens.length === 0) {
    tokens.push(value.slice(tokenStart));
  }

  return tokens;
}

function createSegmentSortKey(value: string): SegmentSortKey {
  const lowerValue = value.toLowerCase();
  return {
    lowerValue,
    tokens: splitIntoNaturalTokens(lowerValue),
  };
}

function compareNaturalTokens(
  leftTokens: readonly (string | number)[],
  rightTokens: readonly (string | number)[],
): number {
  const tokenCount = Math.min(leftTokens.length, rightTokens.length);
  for (let index = 0; index < tokenCount; index++) {
    const leftToken = leftTokens[index]!;
    const rightToken = rightTokens[index]!;
    if (leftToken === rightToken) continue;

    if (typeof leftToken === "number" && typeof rightToken === "number") {
      return leftToken < rightToken ? -1 : 1;
    }

    const leftString = String(leftToken);
    const rightString = String(rightToken);
    if (leftString !== rightString) {
      return leftString < rightString ? -1 : 1;
    }
  }

  if (leftTokens.length !== rightTokens.length) {
    return leftTokens.length < rightTokens.length ? -1 : 1;
  }
  return 0;
}

function compareSegmentSortKeys(leftKey: SegmentSortKey, rightKey: SegmentSortKey): number {
  if (
    leftKey.tokens.length === 1 &&
    rightKey.tokens.length === 1 &&
    typeof leftKey.tokens[0] === "string" &&
    typeof rightKey.tokens[0] === "string"
  ) {
    if (leftKey.lowerValue === rightKey.lowerValue) return 0;
    return leftKey.lowerValue < rightKey.lowerValue ? -1 : 1;
  }

  const tokenComparison = compareNaturalTokens(leftKey.tokens, rightKey.tokens);
  if (tokenComparison !== 0) return tokenComparison;

  if (leftKey.lowerValue !== rightKey.lowerValue) {
    return leftKey.lowerValue < rightKey.lowerValue ? -1 : 1;
  }
  return 0;
}

/** Matches @pierre/trees path-store segment ordering within a sibling group. */
function compareSegmentNames(a: string, b: string): number {
  const aDot = a.charCodeAt(0) === 46;
  const bDot = b.charCodeAt(0) === 46;
  if (aDot !== bDot) return aDot ? -1 : 1;

  const comparison = compareSegmentSortKeys(
    createSegmentSortKey(a),
    createSegmentSortKey(b),
  );
  if (comparison !== 0) return comparison;

  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function getOrCreateDir(parent: DirNode, name: string): DirNode {
  let node = parent.dirs.get(name);
  if (node == null) {
    node = { dirs: new Map(), files: [] };
    parent.dirs.set(name, node);
  }
  return node;
}

function addPath(root: DirNode, path: string): void {
  const parts = path.split("/");
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    node = getOrCreateDir(node, parts[i]);
  }
  node.files.push(path);
}

function walkDir(node: DirNode, out: string[]): void {
  const dirNames = [...node.dirs.keys()].toSorted(compareSegmentNames);
  const files = node.files.toSorted((a, b) =>
    compareSegmentNames(basename(a), basename(b)),
  );

  for (const name of dirNames) {
    const child = node.dirs.get(name);
    if (child != null) walkDir(child, out);
  }
  for (const path of files) {
    out.push(path);
  }
}

/**
 * Depth-first file order aligned with @pierre/trees (folders before files at each
 * level, then natural segment sort). Diff list uses this instead of full-path
 * lexicographic sort so tree and CodeView stay in sync.
 * Invariant: applies treePaths first; order stable for the same set.
 */
export function orderedPaths(paths: readonly string[]): string[] {
  const filtered = treePaths(paths);
  const root: DirNode = { dirs: new Map(), files: [] };

  for (const path of filtered) {
    addPath(root, path);
  }

  const ordered: string[] = [];
  walkDir(root, ordered);
  return ordered;
}
