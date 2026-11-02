import { createContext, useContext } from 'react'

// Lets anything inside AppShell open the New post dialog, such as an empty feed's "New post" button.
export const ComposerContext = createContext<() => void>(() => {})

export function useOpenComposer() {
  return useContext(ComposerContext)
}
