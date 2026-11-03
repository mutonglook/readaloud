/**
 * 句子切分：朗读的最小单位。
 * 中文按 。！？；… 切，英文按 .!? 切，保留引号与右括号，避免出现空洞的短句。
 */

const CLOSERS = '"\'”’）)】》」』';

/** 单句超过该长度就按逗号再切一刀，避免一句话念太久无法暂停/跳转 */
const SOFT_LIMIT = 90;

export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const out: string[] = [];
  let buf = '';

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    buf += ch;

    const isCjkStop = '。！？；…'.includes(ch);
    const isAsciiStop = ch === '.' || ch === '!' || ch === '?';
    // 英文句点要排除 3.14 / Mr. 这类情况
    const prev = normalized[i - 1] ?? '';
    const next = normalized[i + 1] ?? '';
    const asciiOk =
      isAsciiStop && !(ch === '.' && /\d/.test(prev) && /\d/.test(next)) && !(ch === '.' && /\w/.test(prev) && /\w/.test(next));

    if (isCjkStop || asciiOk) {
      // 把紧跟的引号、括号收回本句
      while (i + 1 < normalized.length && CLOSERS.includes(normalized[i + 1])) {
        buf += normalized[++i];
      }
      const s = buf.trim();
      if (s) out.push(s);
      buf = '';
    }
  }

  const tail = buf.trim();
  if (tail) out.push(tail);

  return out.flatMap(splitLongSentence);
}

function splitLongSentence(sentence: string): string[] {
  if (sentence.length <= SOFT_LIMIT) return [sentence];

  const parts: string[] = [];
  let buf = '';
  for (const ch of sentence) {
    buf += ch;
    if ('，,、：:'.includes(ch) && buf.length >= SOFT_LIMIT * 0.6) {
      parts.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.filter(Boolean);
}

/** 去掉标题里常见的编号噪声，用于自动识别章节名 */
export function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 60);
}
