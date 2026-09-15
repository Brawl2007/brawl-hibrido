import { getSetting, setSetting } from "./appSettings";
import { setDraftRoleOverrides, type RoleOverride } from "../shared/draftRoleOverrides";
const KEY = "draftRoleOverrides";
let writes: Promise<unknown> = Promise.resolve();
export async function readDraftRoles(): Promise<Record<string, RoleOverride>> {
  const raw = await getSetting(KEY);
  const parsed = raw ? JSON.parse(raw) : {};
  const roles = Object.fromEntries(Object.entries(parsed).filter(([, value]) => ["mid", "side", "flex"].includes(value as string))) as Record<string, RoleOverride>;
  setDraftRoleOverrides(roles);
  return roles;
}
export function saveDraftRole(brawler: string, role: RoleOverride | null) {
  const operation = writes.then(async () => {
    const roles = await readDraftRoles();
    const name = brawler.trim().toLowerCase();
    if (role === null) delete roles[name];
    else Object.defineProperty(roles, name, { value: role, enumerable: true, configurable: true, writable: true });
    await setSetting(KEY, JSON.stringify(roles));
    setDraftRoleOverrides(roles);
    return roles;
  });
  writes = operation.catch(() => {});
  return operation;
}
