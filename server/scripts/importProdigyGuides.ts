interface ProdigyImportReport {
  totalBrawlersChecked: number;
  successfullyImported: number;
  missingGuides: string[];
  errors: { brawler: string; error: string }[];
}

export async function auditProdigyCoverage(brawlerNames: string[]): Promise<ProdigyImportReport> {
  const report: ProdigyImportReport = {
    totalBrawlersChecked: brawlerNames.length,
    successfullyImported: 0,
    missingGuides: [],
    errors: [],
  };

  for (const brawler of brawlerNames) {
    const slug = brawler.toLowerCase().replace(/[^a-z0-9]/g, "");
    const url = `https://powerleagueprodigy.com/${slug}`;

    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) {
        report.missingGuides.push(brawler);
        continue;
      }

      const html = await response.text();
      if (!html.includes("Counters") && !html.includes("Counter")) {
        report.missingGuides.push(brawler);
        continue;
      }

      report.successfullyImported++;
    } catch (err: any) {
      report.errors.push({ brawler, error: err.message ?? String(err) });
      report.missingGuides.push(brawler);
    }
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[Prodigy Importer] A iniciar auditoria de cobertura dos guias...");
  auditProdigyCoverage(["Willow", "Clancy", "Kenji", "Spike", "Shelly"])
    .then((report) => {
      console.log("[Prodigy Importer] Relatório:", JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      console.error("[Prodigy Importer] Erro na auditoria:", err);
    });
}
