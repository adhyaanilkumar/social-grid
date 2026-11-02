import { Search } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// A form that goes to the results page on Enter or button press. The URL keeps the query, so Back and refresh work.
export default function SearchBar({ autoFocus = false, className }: { autoFocus?: boolean; className?: string }) {
  const id = useId()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const urlQuery = params.get('q') ?? ''
  const [value, setValue] = useState(urlQuery)
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery)

  // Keeps the box in step when the URL changes without typing, such as pressing Back.
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery)
    setValue(urlQuery)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = value.trim()
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn('flex items-center gap-2', className)}>
      <label htmlFor={id} className="sr-only">
        Search users by username
      </label>
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search users by username"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus={autoFocus}
      />
      <Button type="submit" variant="outline" size="icon" className="size-10" aria-label="Search">
        <Search />
      </Button>
    </form>
  )
}
