import { useState } from "react";

/**
 * O retrato de um brawler, ou as iniciais dele se a imagem não vier.
 *
 * As imagens vêm de um CDN de fora. Quando falhavam (sem rede, bloqueio, um
 * brawler novo ainda sem imagem) ficava um quadrado vazio ou o nome solto do
 * `alt`; só a primeira sugestão, por acaso, mostrava as iniciais. Agora
 * qualquer falha mostra as iniciais, no mesmo sítio.
 *
 * Devolve só o `<img>` ou o `<span>`, sem embrulho: o CSS de cada sítio
 * (`.relation-avatar img`, `.relation-avatar span`…) continua a servir.
 */
export function Retrato({ src, nome, alt = "", loading }: { src?: string | null; nome: string; alt?: string; loading?: "lazy" | "eager" }) {
  const [falhou, setFalhou] = useState<string | null>(null);
  if (src && falhou !== src) {
    return <img src={src} alt={alt} loading={loading} decoding="async" onError={() => setFalhou(src)} />;
  }
  return <span className="retrato-iniciais">{nome.slice(0, 2).toUpperCase()}</span>;
}
