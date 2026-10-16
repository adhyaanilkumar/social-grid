// Layout adapted from 21st.dev "Login Form" (socolled/login-form).
// Changes: our logo, social-login buttons and "Reset password" link removed (we have neither yet),
// username-or-email field, inline errors and alert matching the register page (AD-264).
import { useMutation } from '@tanstack/react-query'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, type Location } from 'react-router'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/auth-context'
import { describedBy, Field } from '@/components/form-field'
import Logo from '@/components/landing/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type LoginField = 'identifier' | 'password'
type Values = Record<LoginField, string>
type Errors = Partial<Record<LoginField, string>>

const FIELDS: LoginField[] = ['identifier', 'password']
const REQUIRED: Record<LoginField, string> = {
  identifier: 'Username or email is required',
  password: 'Password is required',
}

// registered/username: set by the register page after sign-up. from: set by RequireAuth, the members-only
// page the visitor was trying to open.
interface LoginState {
  registered?: boolean
  username?: string
  from?: Location
}

export default function Login() {
  const navigate = useNavigate()
  const state = useLocation().state as LoginState | null
  const { login } = useAuth()

  // Just signed up: their username is already filled in, so the cursor starts in the password field.
  const [values, setValues] = useState<Values>({ identifier: state?.username ?? '', password: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string>()
  const inputs = useRef<Partial<Record<LoginField, HTMLInputElement | null>>>({})
  const alertRef = useRef<HTMLParagraphElement>(null)
  // isPending only updates after a re-render, so a fast double click could slip past it; a ref can't.
  const submitting = useRef(false)

  // Move focus to a new form error so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (formError) alertRef.current?.focus()
  }, [formError])

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: () => {
      const from = state?.from
      // replace: Back from the members page shouldn't land on the login form again.
      navigate(from ? `${from.pathname}${from.search}` : '/home', { replace: true })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        setFormError(error.body?.message ?? 'Invalid username/email or password')
      } else if (error instanceof ApiError && error.body?.fieldErrors) {
        setErrors(error.body.fieldErrors as Errors)
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

  function handleChange(field: LoginField, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field] && value.trim() !== '') setErrors((e) => ({ ...e, [field]: undefined }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    setFormError(undefined)

    const found: Errors = {}
    for (const field of FIELDS) if (values[field].trim() === '') found[field] = REQUIRED[field]
    setErrors(found)
    const first = FIELDS.find((f) => found[f])
    if (first) {
      inputs.current[first]?.focus()
      return
    }

    submitting.current = true
    mutation.mutate({ identifier: values.identifier.trim(), password: values.password })
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 px-4 py-16">
      <div>
        <Logo />
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      </div>

      {state?.registered && (
        <p role="status" className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
          Account created{state.username && <> for <strong>{state.username}</strong></>} — log in to continue.
        </p>
      )}

      {/* noValidate: our own messages replace the browser's popups. */}
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Field id="identifier" label="Username or email" error={errors.identifier}>
          <Input
            id="identifier"
            ref={(el) => {
              inputs.current.identifier = el
            }}
            value={values.identifier}
            onChange={(e) => handleChange('identifier', e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={!state?.username}
            aria-invalid={!!errors.identifier}
            aria-describedby={describedBy('identifier', false, errors.identifier)}
          />
        </Field>

        <Field id="password" label="Password" error={errors.password}>
          <Input
            id="password"
            ref={(el) => {
              inputs.current.password = el
            }}
            type="password"
            value={values.password}
            onChange={(e) => handleChange('password', e.target.value)}
            autoComplete="current-password"
            autoFocus={!!state?.username}
            aria-invalid={!!errors.password}
            aria-describedby={describedBy('password', false, errors.password)}
          />
        </Field>

        {formError && (
          <p
            ref={alertRef}
            role="alert"
            tabIndex={-1}
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive outline-none"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </p>
        )}

        <Button type="submit" className="h-10 text-base" aria-disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden />
              Logging in…
            </>
          ) : (
            'Log in'
          )}
        </Button>
      </form>

      <Link to="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
    </main>
  )
}
