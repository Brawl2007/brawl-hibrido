import { describe, expect, it } from "vitest";
import { resolveSpokenBrawler } from "@shared/brawlerVoice";
import { brawlerClassCatalog } from "@shared/draft";

const roster = ["Chester", "Surge", "Mr. P", "8-Bit", "Larry & Lawrie", "Pearl"];

describe("resolução de brawler falado", () => {
  it("resolve um nome falado literalmente", () => {
    expect(resolveSpokenBrawler("Chester", roster)).toMatchObject({ status: "matched", brawler: "Chester", match: "exact" });
  });

  it("aceita nomes pronunciados com pontuação e números", () => {
    expect(resolveSpokenBrawler("mister p", roster)).toMatchObject({ status: "matched", brawler: "Mr. P" });
    expect(resolveSpokenBrawler("eight bit", roster)).toMatchObject({ status: "matched", brawler: "8-Bit" });
    expect(resolveSpokenBrawler("larry e lawrie", roster)).toMatchObject({ status: "matched", brawler: "Larry & Lawrie" });
  });

  it("resolve variações frequentes de transcrição e pronúncia sem exigir escrita exata", () => {
    const voiceRoster = ["8-Bit", "Mr. P", "Larry & Lawrie", "Ruffs", "Squeak", "R-T", "Jae-yong", "Starr Nova"];
    expect(resolveSpokenBrawler("oito bits", voiceRoster)).toMatchObject({ status: "matched", brawler: "8-Bit" });
    expect(resolveSpokenBrawler("senhor p", voiceRoster)).toMatchObject({ status: "matched", brawler: "Mr. P" });
    expect(resolveSpokenBrawler("escolhe lari e lori", voiceRoster)).toMatchObject({ status: "matched", brawler: "Larry & Lawrie" });
    expect(resolveSpokenBrawler("rufis", voiceRoster)).toMatchObject({ status: "matched", brawler: "Ruffs" });
    expect(resolveSpokenBrawler("squeek", voiceRoster)).toMatchObject({ status: "matched", brawler: "Squeak", match: "fuzzy" });
    expect(resolveSpokenBrawler("starnova", voiceRoster)).toMatchObject({ status: "matched", brawler: "Starr Nova", match: "fuzzy" });
  });

  it("reconhece todos os nomes canónicos do catálogo disponível", () => {
    const fullRoster = Object.keys(brawlerClassCatalog);
    for (const brawler of fullRoster) {
      expect(resolveSpokenBrawler(brawler, fullRoster)).toMatchObject({ status: "matched", brawler });
    }
  });

  it("encontra um nome dentro de uma frase de voz", () => {
    expect(resolveSpokenBrawler("escolhe a Pearl", roster)).toMatchObject({ status: "matched", brawler: "Pearl", match: "contains" });
  });

  it("não preenche o slot quando não há brawler reconhecido", () => {
    expect(resolveSpokenBrawler("escolhe o melhor", roster)).toEqual({ status: "unmatched", transcript: "escolhe o melhor" });
  });
});
