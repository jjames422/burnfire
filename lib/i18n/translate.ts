export type Dictionary = Readonly<Record<string, string>>;
export type TranslationValues = Readonly<Record<string, string | number>>;

const templateCache = new WeakMap<Dictionary, {
  expression: RegExp;
  keys: string[];
  translated: string;
}[]>();

function templates(dictionary: Dictionary) {
  const cached = templateCache.get(dictionary);
  if (cached) return cached;
  const entries = Object.entries(dictionary).flatMap(([source, translated]) => {
    const keys: string[] = [];
    let cursor = 0;
    let pattern = "^";
    for (const match of source.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) {
      pattern += source.slice(cursor, match.index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(.+?)";
      keys.push(match[1]);
      cursor = match.index + match[0].length;
    }
    if (!keys.length) return [];
    // A standalone placeholder is not a recognizable system message.
    if (!source.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, "").trim()) return [];
    pattern += source.slice(cursor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
    return [{ expression: new RegExp(pattern), keys, translated }];
  });
  templateCache.set(dictionary, entries);
  return entries;
}

export function translate(source: string, dictionary: Dictionary, values: TranslationValues = {}): string {
  let message = Object.hasOwn(dictionary, source) ? dictionary[source] : source;
  let substitutions = values;
  if (message === source && !Object.hasOwn(dictionary, source) && source.length <= 4096) {
    for (const template of templates(dictionary)) {
      const match = template.expression.exec(source);
      if (!match) continue;
      message = template.translated;
      substitutions = { ...Object.fromEntries(template.keys.map((key, index) => [key, match[index + 1]])), ...values };
      break;
    }
  }
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, key: string) =>
    Object.hasOwn(substitutions, key) ? String(substitutions[key]) : placeholder);
}
