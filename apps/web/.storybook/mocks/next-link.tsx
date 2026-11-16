import type { ComponentProps } from 'react'
import { action } from 'storybook/actions'

type LinkProps = ComponentProps<'a'> & {
  href: string
  prefetch?: boolean | null
  replace?: boolean
  scroll?: boolean
}

const navigate = action('navigate')

/** `next/link` の代わり。遷移先を Actions に記録し、Storybook の iframe は遷移させない。 */
export default function Link({ href, onClick, prefetch, replace, scroll, ...props }: LinkProps) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault()
        onClick?.(event)
        navigate(href)
      }}
    />
  )
}
