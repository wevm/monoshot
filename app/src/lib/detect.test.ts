import { detect, languages, title, typed } from './detect.js'

const python = `import json
from dataclasses import dataclass

@dataclass
class Point:
    x: float
    y: float

def load(path: str) -> list[Point]:
    with open(path) as handle:
        return [Point(**row) for row in json.load(handle)]
`

const rust = `use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct Cache<T> {
    entries: HashMap<String, T>,
}

impl<T: Clone> Cache<T> {
    pub fn get(&self, key: &str) -> Option<T> {
        self.entries.get(key).cloned()
    }
}
`

const typescript = `import { createHighlighter } from 'shiki'

const highlighter = await createHighlighter({
  langs: ['tsx'],
  themes: ['vitesse-dark'],
})

export function render(code: string): string {
  return highlighter.codeToHtml(code, { lang: 'tsx', theme: 'vitesse-dark' })
}
`

const ambiguousTypescript = `class Client {
  public async request() {
    const result = await fetch('/api')
    return new Response(result)
  }
}
`

const javascript = `const users = await fetch('/api/users').then((response) => response.json())

export function activeUsers() {
  return users.filter((user) => user.active)
}
`

const go = `package main

import "fmt"

type Point struct {
	X float64
	Y float64
}

func main() {
	p := Point{X: 1, Y: 2}
	fmt.Printf("%+v\\n", p)
}
`

const php = `<?php

namespace App\\Http;

class Router
{
    private array $routes = [];

    public function add(string $path, callable $handler): void
    {
        $this->routes[$path] = $handler;
    }
}
`

const sql = `select account_id, sum(amount) as total
from payments
where created_at >= now() - interval '30 days'
group by account_id
having sum(amount) > 1000
order by total desc;
`

describe('detect', () => {
  test('reads a snippet as the language it is written in', () => {
    expect({
      go: detect(go),
      php: detect(php),
      python: detect(python),
      rust: detect(rust),
      sql: detect(sql),
      typescript: detect(typescript),
    }).toMatchInlineSnapshot(`
      {
        "go": "go",
        "php": "php",
        "python": "python",
        "rust": "rust",
        "sql": "sql",
        "typescript": "typescript",
      }
    `)
  })

  test('prefers TypeScript when another language has the same score', () => {
    expect(detect(ambiguousTypescript)).toBe('typescript')
  })

  test('prefers TypeScript for compatible JavaScript', () => {
    expect(detect(javascript)).toBe('typescript')
  })

  test('declines a snippet too slight to call', () => {
    expect([detect(''), detect('x = 1'), detect('hello world')]).toMatchInlineSnapshot(`
      [
        undefined,
        undefined,
        undefined,
      ]
    `)
  })
})

describe('typed', () => {
  test('covers the TypeScript family only', () => {
    expect({ jsx: typed('jsx'), python: typed('python'), tsx: typed('tsx') })
      .toMatchInlineSnapshot(`
      {
        "jsx": true,
        "python": false,
        "tsx": true,
      }
    `)
  })
})

describe('languages', () => {
  test('covers ray.so and names every id detection can return', () => {
    const titles = new Set(languages.map((language) => language.title))
    const named = [
      'Astro',
      'Elixir',
      'Gleam',
      'Nix',
      'Prisma',
      'Solidity',
      'Svelte',
      'Text',
      'Vue',
      'Zig',
    ]
    expect({
      count: languages.length,
      // A detected id with no entry here would show as a raw id in the picker.
      missing: named.filter((title) => !titles.has(title)),
      unique: new Set(languages.map((language) => language.id)).size,
    }).toMatchInlineSnapshot(`
      {
        "count": 61,
        "missing": [],
        "unique": 61,
      }
    `)
  })
})

describe('title', () => {
  test('names a language id', () => {
    expect([title('tsx'), title('html'), title('cpp'), title('text')]).toMatchInlineSnapshot(`
      [
        "TSX",
        "HTML",
        "C++",
        "Text",
      ]
    `)
  })
})
