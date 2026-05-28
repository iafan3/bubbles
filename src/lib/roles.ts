export type ServerRole = {
  id: string;
  server_id: string;
  name: string;
  color: string;
  sort_order: number | null;
  created_at?: string;
};

export type ResolvedRole = {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
};

export const DEFAULT_SERVER_ROLES: ResolvedRole[] = [
  {
    id: "owner",
    name: "Owner",
    color: "#d68b63",
    isDefault: true,
  },
  {
    id: "member",
    name: "Member",
    color: "#8a9a90",
    isDefault: true,
  },
];

export const DEFAULT_MEMBER_ROLE_ID = "member";
export const DEFAULT_NEW_ROLE_COLOR = "#b994c7";

export function cleanRoleName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 32);
}

export function isValidRoleColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color.trim());
}

export function normalizeRoleColor(color: string) {
  const cleanColor = color.trim();

  return isValidRoleColor(cleanColor)
    ? cleanColor.toLowerCase()
    : DEFAULT_NEW_ROLE_COLOR;
}

export function getDefaultRole(roleId: string | null | undefined) {
  return (
    DEFAULT_SERVER_ROLES.find((role) => role.id === roleId) ??
    DEFAULT_SERVER_ROLES.find((role) => role.id === DEFAULT_MEMBER_ROLE_ID)!
  );
}

export function resolveServerRole(
  roleId: string | null | undefined,
  customRoles: ServerRole[]
) {
  const customRole = customRoles.find((role) => role.id === roleId);

  if (customRole) {
    return {
      id: customRole.id,
      name: customRole.name,
      color: normalizeRoleColor(customRole.color),
      isDefault: false,
    };
  }

  return getDefaultRole(roleId);
}

export function getRoleOptions(customRoles: ServerRole[]) {
  return [
    DEFAULT_SERVER_ROLES[0],
    ...customRoles.map((role) => ({
      id: role.id,
      name: role.name,
      color: normalizeRoleColor(role.color),
      isDefault: false,
    })),
    DEFAULT_SERVER_ROLES[1],
  ];
}
