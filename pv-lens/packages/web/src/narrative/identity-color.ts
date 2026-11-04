/**
 * 身份色：按身份标识稳定生成，保证同一画布内不同身份不同色。
 *
 * 值身份色取高明度、低饱和，保证深色文字可读；消息身份色取中明度、高饱和，
 * 保证细线与柱可辨。颜色只是识别通道，序号才是权威标识；本模块不假设身份数量
 * 不超过八个，超过时继续生成，直到容量上限。
 */

/** 消息色前八个 token 沿用既有视觉基准；超过八个时由生成器补足。 */
export const MESSAGE_COLOR_TOKENS = [
  '#2563EB',
  '#0891B2',
  '#16A34A',
  '#D97706',
  '#DC2626',
  '#7C3AED',
  '#DB2777',
  '#475569',
] as const;

const VALUE_LIGHTNESS = [86, 78, 70] as const;
const MESSAGE_LIGHTNESS = [44, 54] as const;
const VALUE_SATURATION = 62;
const MESSAGE_SATURATION = 70;

/** 值身份色容量：360 个色相 × 3 个明度档。 */
export const VALUE_COLOR_CAPACITY = 360 * VALUE_LIGHTNESS.length;
/** 消息身份色容量：前八个固定 token 之外，再生成 360 个色相 × 2 个明度档。 */
export const MESSAGE_COLOR_CAPACITY = MESSAGE_COLOR_TOKENS.length + 360 * MESSAGE_LIGHTNESS.length;

export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** HSL → sRGB 十六进制，输入为 0–360 度、0–100 百分比。 */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = ((hue % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (segment < 1) [r, g, b] = [chroma, x, 0];
  else if (segment < 2) [r, g, b] = [x, chroma, 0];
  else if (segment < 3) [r, g, b] = [0, chroma, x];
  else if (segment < 4) [r, g, b] = [0, x, chroma];
  else if (segment < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  const m = l - chroma / 2;
  const channel = (value: number): string => {
    const byte = Math.round((value + m) * 255);
    return Math.max(0, Math.min(255, byte)).toString(16).padStart(2, '0').toUpperCase();
  };
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function paletteColorAt(slot: number, kind: 'value' | 'message'): string {
  const hue = slot % 360;
  const band = Math.floor(slot / 360);
  if (kind === 'value') {
    return hslToHex(hue, VALUE_SATURATION, VALUE_LIGHTNESS[band % VALUE_LIGHTNESS.length] ?? VALUE_LIGHTNESS[0]);
  }
  return hslToHex(hue, MESSAGE_SATURATION, MESSAGE_LIGHTNESS[band % MESSAGE_LIGHTNESS.length] ?? MESSAGE_LIGHTNESS[0]);
}

/**
 * 为一批身份分配颜色。排序后逐个放置，哈希给出首选色；若与已用色冲突，
 * 以固定步长探测下一个槽位。输出只依赖身份集合，不依赖输入顺序。
 */
export function buildIdentityPalette(
  identityIds: Iterable<string>,
  kind: 'value' | 'message',
): Map<string, string> {
  const ids = [...new Set(identityIds)].sort();
  const capacity = kind === 'value' ? VALUE_COLOR_CAPACITY : 360 * MESSAGE_LIGHTNESS.length;
  const used = new Set<string>();
  const colors = new Map<string, string>();
  for (const id of ids) {
    const base = fnv1a(id);
    for (let attempt = 0; attempt < capacity; attempt += 1) {
      const slot = (base + attempt * 97) % capacity;
      const color = paletteColorAt(slot, kind);
      if (used.has(color)) continue;
      used.add(color);
      colors.set(id, color);
      break;
    }
    if (!colors.has(id)) {
      // 容量耗尽属于不可达路径；保留兜底以避免返回缺色。
      const fallback = paletteColorAt(base % capacity, kind);
      used.add(fallback);
      colors.set(id, fallback);
    }
  }
  return colors;
}

export function valueColorsOf(identityIds: Iterable<string>): Map<string, string> {
  return buildIdentityPalette(identityIds, 'value');
}

/**
 * 消息色按序号生成：前八个沿用既有 token，之后继续生成并避开前八个。
 * 消息序号由布局分配，序号稳定则颜色稳定。
 */
export function buildMessagePalette(count: number): string[] {
  const palette: string[] = [...MESSAGE_COLOR_TOKENS.slice(0, Math.max(0, Math.min(count, MESSAGE_COLOR_TOKENS.length)))];
  const used = new Set<string>(palette);
  const capacity = 360 * MESSAGE_LIGHTNESS.length;
  for (let index = MESSAGE_COLOR_TOKENS.length; index < count; index += 1) {
    const base = fnv1a(`message-${String(index + 1)}`);
    let color = '';
    for (let attempt = 0; attempt < capacity; attempt += 1) {
      const slot = (base + attempt * 97) % capacity;
      const candidate = paletteColorAt(slot, 'message');
      if (used.has(candidate)) continue;
      color = candidate;
      break;
    }
    if (color.length === 0) color = paletteColorAt(base % capacity, 'message');
    used.add(color);
    palette.push(color);
  }
  return palette;
}
