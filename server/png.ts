/**
 * Um leitor de PNG pequeno, só com o `zlib` do Node.
 *
 * Existe para ler as imagens dos mapas da Brawlify casa a casa (ver
 * `terrenoDoMapa.ts`) sem acrescentar uma dependência nativa ao alojamento.
 * Lê o que essas imagens usam: 8 bits por canal, cinzento, RGB, paleta (com
 * transparência), cinzento com alfa e RGBA, sem entrelaçamento.
 */
import { inflateSync } from "node:zlib";

export type ImagemRGBA = { largura: number; altura: number; dados: Uint8Array };

const ASSINATURA = [137, 80, 78, 71, 13, 10, 26, 10];
const CANAIS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function lerPng(ficheiro: Uint8Array): ImagemRGBA {
  if (ficheiro.length < 33 || ASSINATURA.some((byte, i) => ficheiro[i] !== byte)) throw new Error("Não é um PNG.");
  const vista = new DataView(ficheiro.buffer, ficheiro.byteOffset, ficheiro.byteLength);
  let largura = 0, altura = 0, profundidade = 0, tipo = 0, entrelacado = 0;
  let paleta: Uint8Array | null = null;
  let transparencia: Uint8Array | null = null;
  const partes: Uint8Array[] = [];
  for (let pos = 8; pos + 8 <= ficheiro.length;) {
    const tamanho = vista.getUint32(pos);
    const nome = String.fromCharCode(...ficheiro.subarray(pos + 4, pos + 8));
    const corpo = ficheiro.subarray(pos + 8, pos + 8 + tamanho);
    if (nome === "IHDR") {
      largura = vista.getUint32(pos + 8);
      altura = vista.getUint32(pos + 12);
      profundidade = corpo[8];
      tipo = corpo[9];
      entrelacado = corpo[12];
    } else if (nome === "PLTE") paleta = corpo;
    else if (nome === "tRNS") transparencia = corpo;
    else if (nome === "IDAT") partes.push(corpo);
    else if (nome === "IEND") break;
    pos += 12 + tamanho;
  }
  if (profundidade !== 8 || !(tipo in CANAIS) || entrelacado) throw new Error(`PNG não suportado (profundidade ${profundidade}, tipo ${tipo}).`);
  if (!largura || !altura || largura * altura > 16_000_000) throw new Error("PNG com tamanho inválido.");
  if (tipo === 3 && !paleta) throw new Error("PNG de paleta sem paleta.");

  const canais = CANAIS[tipo];
  const linha = largura * canais;
  const cru = inflateSync(Buffer.concat(partes));
  if (cru.length < altura * (linha + 1)) throw new Error("PNG truncado.");
  const px = new Uint8Array(altura * linha);
  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (linha + 1)];
    const origem = y * (linha + 1) + 1;
    const destino = y * linha;
    for (let x = 0; x < linha; x++) {
      const bruto = cru[origem + x];
      const a = x >= canais ? px[destino + x - canais] : 0;
      const b = y > 0 ? px[destino - linha + x] : 0;
      const c = x >= canais && y > 0 ? px[destino - linha + x - canais] : 0;
      let valor: number;
      if (filtro === 0) valor = bruto;
      else if (filtro === 1) valor = bruto + a;
      else if (filtro === 2) valor = bruto + b;
      else if (filtro === 3) valor = bruto + ((a + b) >> 1);
      else if (filtro === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        valor = bruto + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`Filtro PNG desconhecido: ${filtro}.`);
      px[destino + x] = valor & 255;
    }
  }

  const dados = new Uint8Array(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) {
    const o = i * 4;
    if (tipo === 6) { dados.set(px.subarray(i * 4, i * 4 + 4), o); continue; }
    if (tipo === 2) { dados[o] = px[i * 3]; dados[o + 1] = px[i * 3 + 1]; dados[o + 2] = px[i * 3 + 2]; dados[o + 3] = 255; continue; }
    if (tipo === 0 || tipo === 4) {
      const g = px[i * canais];
      dados[o] = dados[o + 1] = dados[o + 2] = g;
      dados[o + 3] = tipo === 4 ? px[i * 2 + 1] : 255;
      continue;
    }
    const indice = px[i];
    dados[o] = paleta![indice * 3];
    dados[o + 1] = paleta![indice * 3 + 1];
    dados[o + 2] = paleta![indice * 3 + 2];
    dados[o + 3] = transparencia && indice < transparencia.length ? transparencia[indice] : 255;
  }
  return { largura, altura, dados };
}
