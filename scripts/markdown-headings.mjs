/** Repository ATX headings and GitHub-style duplicate anchors. */
export function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')
}

export function headingSections(markdown) {
  const lines = markdown.split('\n')
  const used = new Set()
  const headings = []
  let fence = null
  lines.forEach((line, index) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
      return
    }
    if (fence) return
    const match = line.match(/^(#{1,6}) (.+?)\s*$/)
    if (!match) return
    const base = slugify(match[2])
    let anchor = base
    let counter = 0
    while (used.has(anchor)) anchor = `${base}-${++counter}`
    used.add(anchor)
    headings.push({
      title: match[2],
      depth: match[1].length,
      anchor,
      line: index + 1,
      number:
        match[1].length >= 2 && match[1].length <= 4
          ? match[2].match(/^([0-9]+(?:\.[0-9]+)*)[.．\s]/)?.[1]
          : undefined,
    })
  })
  return headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.depth <= heading.depth)
    const endLine = next ? next.line - 1 : lines.length
    return {
      ...heading,
      endLine,
      text: lines
        .slice(heading.line - 1, endLine)
        .join('\n')
        .trim(),
    }
  })
}
