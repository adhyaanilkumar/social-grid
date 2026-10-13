// Browser-side copy of the rules in com.socialgrid.dto.RegisterRequest, with the same messages.
// These only give quicker feedback; the backend still checks everything (and alone knows if a name is taken).

export type RegisterField = 'username' | 'email' | 'password'

// Form order: used to decide which broken field gets focus first.
export const REGISTER_FIELDS: RegisterField[] = ['username', 'email', 'password']

export const PASSWORD_MIN = 8

// Loose on purpose, like the backend's @Email: something@something, no spaces.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/

// Returns the error message for a field, or undefined when the value is fine.
export function checkField(field: RegisterField, value: string): string | undefined {
  switch (field) {
    case 'username':
      if (value.trim() === '') return 'Username is required'
      if (value.length < 3 || value.length > 30) return 'Username must be 3–30 characters'
      return undefined
    case 'email':
      if (value.trim() === '') return 'Email is required'
      if (!EMAIL_PATTERN.test(value)) return 'Enter a valid email address'
      return undefined
    case 'password':
      if (value.trim() === '') return 'Password is required'
      if (value.length < PASSWORD_MIN || value.length > 72) return 'Password must be 8–72 characters'
      return undefined
  }
}
