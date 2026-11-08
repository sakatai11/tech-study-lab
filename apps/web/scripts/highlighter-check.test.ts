import { describe, expect, it } from 'vitest'

import { findHighlighterArtifact } from './highlighter-check'

describe('findHighlighterArtifact [#284]', () => {
  it('rejects any WASM artifact even without highlighter names', () => {
    const wasmHeader = String.fromCharCode(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0)

    expect(findHighlighterArtifact('assets/engine.wasm', () => wasmHeader)).toBeDefined()
  })

  it('rejects scripts that bundle the highlighter', () => {
    expect(findHighlighterArtifact('chunk.js', () => 'import("shiki")')).toBeDefined()
    expect(findHighlighterArtifact('worker.mjs', () => 'createHighlighter()')).toBeDefined()
  })

  it('accepts scripts without the highlighter and ignores other assets', () => {
    expect(findHighlighterArtifact('chunk.js', () => 'console.log(1)')).toBeUndefined()
    expect(findHighlighterArtifact('style.css', () => '.shiki{}')).toBeUndefined()
  })
})
