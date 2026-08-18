function hexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
}

function parseRgbChannels(color: string): [number, number, number] | null {
  const trimmed = color.trim();
  const hex = trimmed.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hex?.[1]) {
    const body = hex[1];
    return [
      Number.parseInt(body.slice(0, 2), 16),
      Number.parseInt(body.slice(2, 4), 16),
      Number.parseInt(body.slice(4, 6), 16),
    ];
  }

  const rgb = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }

  return null;
}

/** Replace alpha on a parsed color. Unparseable input is returned unchanged. */
export function withHexAlpha(color: string, alphaByte: number): string {
  const rgb = parseRgbChannels(color);
  if (!rgb) return color;
  const [r, g, b] = rgb;
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}${hexByte(alphaByte)}`;
}
