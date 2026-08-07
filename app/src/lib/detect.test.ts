import { detect, title, typed } from './detect.js'

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
        "typescript": "tsx",
      }
    `)
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

describe('title', () => {
  test('names a language id', () => {
    expect([title('tsx'), title('html'), title('cpp')]).toMatchInlineSnapshot(`
      [
        "TypeScript",
        "HTML",
        "C++",
      ]
    `)
  })
})
