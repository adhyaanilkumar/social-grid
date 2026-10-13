import { useMutation } from '@tanstack/react-query'
import { Check, CircleAlert, LoaderCircle } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { register } from '@/api/auth'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { checkField, PASSWORD_MIN, REGISTER_FIELDS, type RegisterField } from '@/lib/registerRules'
import { cn } from '@/lib/utils'

type Values = Record<RegisterField, string>
type Errors = Partial<Record<RegisterField, string>>

// Sign-up form (AD-263). A field is checked when the user leaves it; once it shows an error it re-checks
// on every keystroke so the error disappears as soon as it's fixed. The server's answer is final:
// its fieldErrors are shown under the matching inputs, anything else in an alert above the button.
export default function Register() {
  const navigate = useNavigate()
  const [values, setValues] = useState<Values>({ username: '', email: '', password: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string>()
  const inputs = useRef<Partial<Record<RegisterField, HTMLInputElement | null>>>({})
  // isPending only updates after a re-render, so a fast double click could slip past it; a ref can't.
  const submitting = useRef(false)

  const mutation = useMutation({
    mutationFn: register,
    onSuccess: (user) => navigate('/login', { state: { registered: true, username: user.username } }),
    onError: (error) => {
      const fieldErrors = pickFieldErrors(error)
      if (fieldErrors) {
        setErrors(fieldErrors)
        focusFirst(fieldErrors)
      } else {
        setFormError(
          error instanceof ApiError
            ? 'Something went wrong on our side. Please try again.'
            : "Couldn't reach the server. Check your connection and try again.",
        )
      }
    },
    onSettled: () => {
      submitting.current = false
    },
  })

  function focusFirst(found: Errors) {
    const first = REGISTER_FIELDS.find((f) => found[f])
    if (first) inputs.current[first]?.focus()
  }

  function handleChange(field: RegisterField, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: checkField(field, value) }))
  }

  // Leaving an empty field isn't an error yet: the user may just be tabbing through.
  function handleBlur(field: RegisterField) {
    if (values[field] !== '') setErrors((e) => ({ ...e, [field]: checkField(field, values[field]) }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    setFormError(undefined)

    const found: Errors = {}
    for (const field of REGISTER_FIELDS) found[field] = checkField(field, values[field])
    setErrors(found)
    if (REGISTER_FIELDS.some((f) => found[f])) {
      focusFirst(found)
      return
    }

    submitting.current = true
    mutation.mutate(values)
  }

  const passwordLongEnough = values.password.length >= PASSWORD_MIN

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-8 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>

      {/* noValidate: our own messages replace the browser's popups. */}
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Field id="username" label="Username" hint="3–30 characters" error={errors.username}>
          <Input
            id="username"
            ref={(el) => {
              inputs.current.username = el
            }}
            value={values.username}
            onChange={(e) => handleChange('username', e.target.value)}
            onBlur={() => handleBlur('username')}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            aria-invalid={!!errors.username}
            aria-describedby={describedBy('username', true, errors.username)}
          />
        </Field>

        <Field id="email" label="Email" error={errors.email}>
          <Input
            id="email"
            ref={(el) => {
              inputs.current.email = el
            }}
            type="email"
            value={values.email}
            onChange={(e) => handleChange('email', e.target.value)}
            onBlur={() => handleBlur('email')}
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={describedBy('email', false, errors.email)}
          />
        </Field>

        <Field
          id="password"
          label="Password"
          hint={
            <span className={cn('flex items-center gap-1', passwordLongEnough && 'text-primary')}>
              {passwordLongEnough && <Check className="size-3.5" aria-hidden />}
              At least {PASSWORD_MIN} characters
            </span>
          }
          hintBelow
          error={errors.password}
        >
          <PasswordInput
            id="password"
            ref={(el) => {
              inputs.current.password = el
            }}
            value={values.password}
            onChange={(e) => handleChange('password', e.target.value)}
            onBlur={() => handleBlur('password')}
            autoComplete="new-password"
            maxLength={72}
            aria-invalid={!!errors.password}
            aria-describedby={describedBy('password', true, errors.password)}
          />
        </Field>

        {formError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </p>
        )}

        <Button
          type="submit"
          className="h-10 text-base"
          aria-disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden />
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>

      <div className="flex flex-col gap-4 text-sm">
        <Link to="/login" className="underline underline-offset-4">
          Already have an account? Log in
        </Link>
        <Link to="/" className="underline underline-offset-4">
          Back to home
        </Link>
      </div>
    </main>
  )
}

// Hint and error ids for aria-describedby, so screen readers read them along with the label.
function describedBy(id: RegisterField, hasHint: boolean, error: string | undefined) {
  return [hasHint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
}

// Label above, hint under the label (or under the input when hintBelow), error under the input.
function Field({
  id,
  label,
  hint,
  hintBelow = false,
  error,
  children,
}: {
  id: RegisterField
  label: string
  hint?: ReactNode
  hintBelow?: boolean
  error?: string
  children: ReactNode
}) {
  const hintEl = hint && (
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">
      {hint}
    </p>
  )
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {!hintBelow && hintEl}
      {children}
      {hintBelow && hintEl}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-sm text-destructive">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

// The backend's per-field messages, limited to the fields this form has; undefined if there are none.
function pickFieldErrors(error: unknown): Errors | undefined {
  if (!(error instanceof ApiError) || !error.body?.fieldErrors) return undefined
  const picked: Errors = {}
  for (const field of REGISTER_FIELDS) {
    const message = error.body.fieldErrors[field]
    if (message) picked[field] = message
  }
  return Object.keys(picked).length > 0 ? picked : undefined
}
