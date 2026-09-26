import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { inferDraftRole, draftRoleLabels, type DraftRole } from "@shared/draft";
import { useDraftRolesVersion } from "@/contexts/DraftRolesContext";

/**
 * Editar a função (Mid, Lane, Flex) de cada brawler. Só o dono vê.
 *
 * `noPainel`: dentro do painel de ajustes do Draft já se clicou para o abrir,
 * por isso aparece logo a lista — pequena, uma linha por brawler.
 */
export function DraftRoleEditor({ names, noPainel = false }: { names: string[]; noPainel?: boolean }) {
  useDraftRolesVersion();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const save = trpc.draftRoles.set.useMutation({
    onSuccess: async (roles) => {
      utils.draftRoles.list.setData(undefined, roles);
      setStatus("Função guardada. Draft e perfis atualizados.");
    },
    onError: error => setStatus(error.message),
  });
  if (auth.data?.role !== "admin") return null;
  const lista = <>
    {names.length > 1 && <input className="funcoes-procurar" aria-label="Buscar brawler para editar função" placeholder="Procurar brawler…" value={query} onChange={event => setQuery(event.target.value)} />}
    <div className="funcoes-lista" style={noPainel ? undefined : { maxHeight: 320, overflowY: "auto" }}>
      {[...new Set(names)].sort().filter(name => name.toLowerCase().includes(query.toLowerCase())).map(name => <div key={name} className="funcoes-linha" style={noPainel ? undefined : { display: "flex", gap: 12, alignItems: "center", paddingBlock: 8 }}>
        <label style={{ flex: 1 }}>{name} <select aria-label={`Função de ${name}`} value={inferDraftRole(name)} disabled={save.isPending} onChange={event => save.mutate({ brawler: name, role: event.target.value as DraftRole })}>
          {(["mid", "side", "flex"] as const).map(role => <option key={role} value={role}>{draftRoleLabels[role]}</option>)}
        </select></label>
        <button type="button" disabled={save.isPending} title="Voltar à função de origem" aria-label={`Restaurar a função de origem de ${name}`} onClick={() => save.mutate({ brawler: name, role: null })}>{noPainel ? "↺" : "Restaurar padrão"}</button>
      </div>)}
    </div>
    <p role="status">{save.isPending ? "A guardar…" : status}</p>
  </>;
  if (noPainel) return <div className="funcoes-painel">{lista}</div>;
  return <details className="draft-rules-panel" style={{ padding: 16, marginBlock: 16 }}>
    <summary>Editar funções · Mid / Lane / Flex</summary>
    <p>As escolhas ficam guardadas no site e alteram os filtros, a composição e os bônus de função do Draft.</p>
    {lista}
  </details>;
}
