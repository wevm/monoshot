---
'monoshot': patch
---

Added gradient backgrounds, automatic syntax themes, and grammar-free languages to shared rendering interfaces.

```ts
const html = await Frame.create().toDocument({
  background: 'gradient:#3F37C9:#8C87DF',
  code: 'Hello, world.',
  lang: 'text',
  padding: 64,
  radius: 12,
  theme: 'vitesse-dark',
  title: '',
  titleBar: false,
  width: 640,
})
```
