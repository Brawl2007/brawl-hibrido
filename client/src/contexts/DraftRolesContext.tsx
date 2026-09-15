import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { setDraftRoleOverrides } from "@shared/draftRoleOverrides";
const Context = createContext(0);
export function DraftRolesProvider({ children }: { children: ReactNode }) {
  const query = trpc.draftRoles.list.useQuery(undefined, { staleTime: 15_000, refetchInterval: 30_000, retry: 1 });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!query.data) return;
    setDraftRoleOverrides(query.data);
    setVersion(value => value + 1);
  }, [query.data]);
  return <Context.Provider value={version}>{children}</Context.Provider>;
}
export const useDraftRolesVersion = () => useContext(Context);
