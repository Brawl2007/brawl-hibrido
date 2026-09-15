export type SpokenBrawlerResolution =
  | { status: "matched"; brawler: string; transcript: string; match: "exact" | "contains" | "fuzzy" }
  | { status: "ambiguous"; transcript: string; candidates: string[] }
  | { status: "unmatched"; transcript: string };

const spokenAliases: Record<string, string> = {
  "8 bit": "8-Bit",
  "eight bit": "8-Bit",
  "mister p": "Mr. P",
  "mr p": "Mr. P",
  "larry and lawrie": "Larry & Lawrie",
  "larry e lawrie": "Larry & Lawrie",
  "lawrie and larry": "Larry & Lawrie",
  "lari e lori": "Larry & Lawrie",
  "lari lori": "Larry & Lawrie",
  "larry lori": "Larry & Lawrie",
  "oito bit": "8-Bit",
  "oito bits": "8-Bit",
  "8 bits": "8-Bit",
  "senhor p": "Mr. P",
  "mister pea": "Mr. P",
  "rufis": "Ruffs",
  "rufs": "Ruffs",
  "r t": "R-T",
  "jae yong": "Jae-yong",
};

export function normalizeSpokenBrawlerName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getSpokenPhrases(normalizedTranscript: string) {
  const words = normalizedTranscript.split(" ").filter(Boolean);
  const phrases = new Set([normalizedTranscript]);
  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 1; end <= Math.min(words.length, start + 4); end += 1) {
      phrases.add(words.slice(start, end).join(" "));
    }
  }
  return Array.from(phrases);
}

function levenshteinDistance(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = a[row - 1] === b[column - 1]
        ? previous[column - 1]
        : Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + 1);
    }
    for (let column = 0; column <= b.length; column += 1) previous[column] = current[column];
  }
  return previous[b.length];
}

function similarity(a: string, b: string) {
  const compactA = a.replace(/\s/g, "");
  const compactB = b.replace(/\s/g, "");
  const longest = Math.max(compactA.length, compactB.length);
  return longest === 0 ? 0 : 1 - levenshteinDistance(compactA, compactB) / longest;
}

export function resolveSpokenBrawler(transcript: string, brawlerNames: readonly string[]): SpokenBrawlerResolution {
  const normalizedTranscript = normalizeSpokenBrawlerName(transcript);
  if (!normalizedTranscript) return { status: "unmatched", transcript };
  const phrases = getSpokenPhrases(normalizedTranscript);

  for (const phrase of phrases) {
    const alias = spokenAliases[phrase];
    if (alias && brawlerNames.includes(alias)) {
      return { status: "matched", brawler: alias, transcript, match: phrase === normalizedTranscript ? "exact" : "contains" };
    }
  }

  const exactMatches = brawlerNames.filter((name) => phrases.includes(normalizeSpokenBrawlerName(name)));
  if (exactMatches.length === 1) {
    return { status: "matched", brawler: exactMatches[0], transcript, match: normalizedTranscript === normalizeSpokenBrawlerName(exactMatches[0]) ? "exact" : "contains" };
  }

  const containedMatches = brawlerNames.filter((name) => {
    const normalizedName = normalizeSpokenBrawlerName(name);
    return normalizedName.length > 1 && normalizedTranscript.includes(normalizedName);
  });
  if (containedMatches.length === 1) {
    return { status: "matched", brawler: containedMatches[0], transcript, match: "contains" };
  }
  if (containedMatches.length > 1) {
    return { status: "ambiguous", transcript, candidates: containedMatches.slice(0, 4) };
  }

  const fuzzyMatches = brawlerNames
    .map((name) => ({
      name,
      score: Math.max(...phrases.map((phrase) => similarity(phrase, normalizeSpokenBrawlerName(name)))),
    }))
    .filter(({ name, score }) => normalizeSpokenBrawlerName(name).replace(/\s/g, "").length >= 4 && score >= 0.72)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const bestFuzzyMatch = fuzzyMatches[0];
  const secondFuzzyMatch = fuzzyMatches[1];
  if (bestFuzzyMatch && (!secondFuzzyMatch || bestFuzzyMatch.score - secondFuzzyMatch.score >= 0.08)) {
    return { status: "matched", brawler: bestFuzzyMatch.name, transcript, match: "fuzzy" };
  }
  if (bestFuzzyMatch) {
    return { status: "ambiguous", transcript, candidates: fuzzyMatches.slice(0, 4).map(({ name }) => name) };
  }

  return { status: "unmatched", transcript };
}
