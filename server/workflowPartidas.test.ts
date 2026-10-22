import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const temporarios: string[] = [];
afterEach(() => { for (const pasta of temporarios.splice(0)) rmSync(pasta, { recursive: true, force: true }); });

function executar(corpo: string, codigo: number) {
  const pasta = mkdtempSync(join(tmpdir(), "brawl-workflow-"));
  temporarios.push(pasta);
  writeFileSync(join(pasta, "curl"), '#!/bin/bash\nprintf "%s" "$CURL_BODY" > "${@: -1}"\nexit "$CURL_EXIT"\n', { mode: 0o700 });
  const yaml = readFileSync(resolve(process.cwd(), ".github/workflows/recolher-partidas.yml"), "utf8");
  const script = yaml.split("run: |\n")[1].split("\n").map((linha) => linha.replace(/^          /, "")).join("\n");
  return spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${pasta}${delimiter}${process.env.PATH}`, CURL_BODY: corpo, CURL_EXIT: String(codigo), GITHUB_STEP_SUMMARY: join(pasta, "summary") },
  });
}

describe("workflow real com respostas HTTP simuladas", () => {
  it("mostra o motivo sanitizado do HTTP 500 sem transformar a falha em sucesso", () => {
    const resultado = executar(JSON.stringify({ ok: false, errorCode: "DATABASE_WRITE_BLOCKED", error: "Escrita bloqueada", etapa: "reserva" }), 22);
    expect(resultado.status).toBe(22);
    expect(resultado.stdout).toContain("DATABASE_WRITE_BLOCKED");
    expect(resultado.stdout).toContain("Escrita bloqueada");
  });

  it("não despeja consultas antigas ou HTML e preserva o código original", () => {
    for (const corpo of ['{"error":"Failed query: segredo params: chave"}', "<html>erro privado</html>"]) {
      const resultado = executar(corpo, 22);
      expect(resultado.status).toBe(22);
      expect(resultado.stdout).not.toMatch(/segredo|chave|erro privado/);
    }
  });

  it("continua a aceitar recolhas concluídas e janelas já atendidas", () => {
    expect(executar('{"ok":true,"battlesInserted":7}', 0).status).toBe(0);
    expect(executar('{"saltada":true,"motivo":"Janela já atendida"}', 0).status).toBe(0);
  });

  it("uma falha de rede continua a falhar com o código do curl", () => {
    expect(executar("", 6).status).toBe(6);
  });
});
