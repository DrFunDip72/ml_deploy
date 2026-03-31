const DEFAULT_ADMIN_PASSCODE = "admin123";

export function hasValidAdminPasscode(
  providedPasscode: string | null | undefined,
) {
  const expected = process.env.ADMIN_DEMO_PASSCODE ?? DEFAULT_ADMIN_PASSCODE;
  return Boolean(providedPasscode && providedPasscode === expected);
}
