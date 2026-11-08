export function canManageFrames(input: {
  signedIn: boolean
  roleConfigured: boolean
  hasRole: boolean
}): boolean {
  return input.signedIn && (!input.roleConfigured || input.hasRole)
}
