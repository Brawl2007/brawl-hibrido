import { avancarVersaoDoMotor } from "./versaoDoMotor";
export type RoleOverride = "mid" | "side" | "flex";
let overrides: Record<string, RoleOverride> = {};
const key = (name: string) => name.trim().toLowerCase();
export function setDraftRoleOverrides(values: Record<string, RoleOverride>) {
  overrides = Object.fromEntries(Object.entries(values)
    .filter(([, role]) => ["mid", "side", "flex"].includes(role))
    .map(([name, role]) => [key(name), role]));
  avancarVersaoDoMotor();
}
export function getDraftRoleOverride(name: string): RoleOverride | undefined {
  return Object.hasOwn(overrides, key(name)) ? overrides[key(name)] : undefined;
}
