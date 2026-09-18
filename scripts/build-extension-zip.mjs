/**
 * Reconstrói `client/public/brawlscope-helper.zip` a partir da pasta ao lado.
 *
 * POR QUE ISTO EXISTE
 *
 * O ZIP é um ficheiro gravado no repositório, não é gerado no build: é o que a
 * pessoa descarrega e instala no Chrome. Corrigir a extensão e esquecer o ZIP
 * entrega a versão antiga com os testes todos verdes — já aconteceu, e o que o
 * apanhou foi `server/extensaoEmpacotada.test.ts`.
 *
 * Esse teste diz que o ZIP está velho. Não o reconstrói. Reconstruí-lo à mão é
 * precisamente o passo que se esquece, por isso passa a ser um comando:
 *
 *     npm run build:extensao
 *
 * Grava sem compressão (método 0). O conteúdo da extensão são uns 40 KB de
 * texto; o que se ganha em bytes perde-se em ter de confiar num compressor para
 * reproduzir o mesmo ficheiro.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { crc32 } from "node:zlib";

const pasta = resolve(process.cwd(), "client/public/brawlscope-helper");
const destino = resolve(process.cwd(), "client/public/brawlscope-helper.zip");

const nomes = readdirSync(pasta).filter((nome) => !nome.startsWith(".")).sort();

const locais = [];
const central = [];
let deslocamento = 0;

for (const nome of nomes) {
  const conteudo = readFileSync(resolve(pasta, nome));
  const nomeBytes = Buffer.from(nome, "utf8");
  const soma = crc32(conteudo) >>> 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // assinatura
  local.writeUInt16LE(20, 4);         // versão necessária
  local.writeUInt16LE(0, 6);          // sinalizadores
  local.writeUInt16LE(0, 8);          // método: guardado
  local.writeUInt16LE(0, 10);         // hora
  local.writeUInt16LE(0x0021, 12);    // data fixa: 1980-01-01
  local.writeUInt32LE(soma, 14);
  local.writeUInt32LE(conteudo.length, 18);
  local.writeUInt32LE(conteudo.length, 22);
  local.writeUInt16LE(nomeBytes.length, 26);
  local.writeUInt16LE(0, 28);         // extra
  locais.push(local, nomeBytes, conteudo);

  const entrada = Buffer.alloc(46);
  entrada.writeUInt32LE(0x02014b50, 0);
  entrada.writeUInt16LE(20, 4);       // versão de quem gravou
  entrada.writeUInt16LE(20, 6);
  entrada.writeUInt16LE(0, 8);
  entrada.writeUInt16LE(0, 10);
  entrada.writeUInt16LE(0, 12);
  entrada.writeUInt16LE(0x0021, 14);
  entrada.writeUInt32LE(soma, 16);
  entrada.writeUInt32LE(conteudo.length, 20);
  entrada.writeUInt32LE(conteudo.length, 24);
  entrada.writeUInt16LE(nomeBytes.length, 28);
  entrada.writeUInt16LE(0, 30);       // extra
  entrada.writeUInt16LE(0, 32);       // comentário
  entrada.writeUInt16LE(0, 34);       // disco
  entrada.writeUInt16LE(0, 36);       // atributos internos
  entrada.writeUInt32LE(0, 38);       // atributos externos
  entrada.writeUInt32LE(deslocamento, 42);
  central.push(entrada, nomeBytes);

  deslocamento += 30 + nomeBytes.length + conteudo.length;
}

const corpo = Buffer.concat(locais);
const diretorio = Buffer.concat(central);

const fim = Buffer.alloc(22);
fim.writeUInt32LE(0x06054b50, 0);
fim.writeUInt16LE(0, 4);
fim.writeUInt16LE(0, 6);
fim.writeUInt16LE(nomes.length, 8);
fim.writeUInt16LE(nomes.length, 10);
fim.writeUInt32LE(diretorio.length, 12);
fim.writeUInt32LE(corpo.length, 16);
fim.writeUInt16LE(0, 20);

writeFileSync(destino, Buffer.concat([corpo, diretorio, fim]));
console.log(`brawlscope-helper.zip: ${nomes.length} ficheiros — ${nomes.join(", ")}`);
