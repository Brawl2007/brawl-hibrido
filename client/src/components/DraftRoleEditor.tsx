import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { inferDraftRole, draftRoleLabels, type DraftRole } from "@shared/draft";
import { useDraftRolesVersion } from "@/contexts/DraftRolesContext";

export function DraftRoleEditor({ names }: { names: string[] }) {
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
  return <details className="draft-rules-panel" style={{ padding: 16, marginBlock: 16 }}>
    <summary>Editar funções · Mid / Lane / Flex</summary>
    <p>As escolhas ficam guardadas no site e alteram os filtros, a composição e os bônus de função do Draft.</p>
    {names.length > 1 && <input aria-label="Buscar brawler para editar função" placeholder="Buscar brawler…" value={query} onChange={event => setQuery(event.target.value)} />}
    <div style={{ maxHeight: 320, overflowY: "auto" }}>
      {[...new Set(names)].sort().filter(name => name.toLowerCase().includes(query.toLowerCase())).map(name => <div key={name} style={{ display: "flex", gap: 12, alignItems: "center", paddingBlock: 8 }}>
        <label style={{ flex: 1 }}>{name} <select aria-label={`Função de ${name}`} value={inferDraftRole(name)} disabled={save.isPending} onChange={event => save.mutate({ brawler: name, role: event.target.value as DraftRole })}>
          {(["mid", "side", "flex"] as const).map(role => <option key={role} value={role}>{draftRoleLabels[role]}</option>)}
        </select></label>
        <button type="button" disabled={save.isPending} onClick={() => save.mutate({ brawler: name, role: null })}>Restaurar padrão</button>
      </div>)}
    </div>
    <p role="status">{save.isPending ? "Guardando…" : status}</p>
  </details>;
}
