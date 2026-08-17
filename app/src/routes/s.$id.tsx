import { createFileRoute, redirect } from '@tanstack/react-router'

import * as Shared from '#/lib/shared.functions.js'
import { card } from '#/lib/shared.js'
import * as Site from '#/lib/site.js'
import { Page } from './-components/Page.js'

export const Route = createFileRoute('/s/$id')({
  loader: async ({ params }) => {
    const link = await Shared.load({ data: { id: params.id } })
    if (!link) throw redirect({ to: '/' })
    return link
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {}
    const url = Site.url(`/s/${params.id}`)
    const image = `${url}/og.png?v=${card.version}`
    const height = String(card.height * card.scale)
    const width = String(card.width * card.scale)
    return {
      meta: [
        { title: loaderData.title },
        { name: 'description', content: loaderData.description },
        { property: 'og:type', content: 'article' },
        { property: 'og:site_name', content: 'monoshot' },
        { property: 'og:title', content: loaderData.title },
        { property: 'og:description', content: loaderData.description },
        { property: 'og:url', content: url },
        { property: 'og:image', content: image },
        { property: 'og:image:width', content: width },
        { property: 'og:image:height', content: height },
        { property: 'og:image:alt', content: loaderData.title },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: loaderData.title },
        { name: 'twitter:description', content: loaderData.description },
        { name: 'twitter:image', content: image },
      ],
    }
  },
  component: SharedPage,
})

function SharedPage() {
  return <Page state={Route.useLoaderData().state} />
}
