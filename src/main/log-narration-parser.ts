/**
 * Line-buffered parser for chunked runner output that classifies
 * [INTENT] / [FINDINGS] markers as a distinct 'thought' stream.
 *
 * Design contract:
 *   - Chunks can split lines ANYWHERE — mid-marker, mid-word.
 *   - The parser buffers per-stream until it sees a line terminator,
 *     then classifies the complete line.
 *   - Line terminator is \n or \r\n (Windows stderr). Output always
 *     uses \n.
 *   - One instance per deployment. No global state.
 */

export type SourceStream = 'stdout' | 'stderr' | 'system'

export interface ParsedChunk {
  stream: SourceStream | 'thought'
  text: string
  thoughtKind?: 'intent' | 'findings'
}

const MARKER_RE = /^(?:\[(intent|findings)\]:?|▸\s*(intent):|◆\s*(findings):)\s*/i

export class NarrationParser {
  private buffers: Record<SourceStream, string> = {
    stdout: '',
    stderr: '',
    system: ''
  }

  feed(chunk: { stream: SourceStream; text: string }): ParsedChunk[] {
    this.buffers[chunk.stream] += chunk.text.replace(/\r\n/g, '\n')

    const out: ParsedChunk[] = []
    let buf = this.buffers[chunk.stream]
    let nlIdx = buf.indexOf('\n')
    while (nlIdx !== -1) {
      const rawLine = buf.slice(0, nlIdx + 1)
      buf = buf.slice(nlIdx + 1)
      out.push(this.classify(chunk.stream, rawLine))
      nlIdx = buf.indexOf('\n')
    }
    this.buffers[chunk.stream] = buf
    return out
  }

  flush(): ParsedChunk[] {
    const out: ParsedChunk[] = []
    for (const stream of ['stdout', 'stderr', 'system'] as SourceStream[]) {
      const buf = this.buffers[stream]
      if (buf.length > 0) {
        out.push({ stream, text: buf })
        this.buffers[stream] = ''
      }
    }
    return out
  }

  private classify(stream: SourceStream, line: string): ParsedChunk {
    const match = line.match(MARKER_RE)
    if (!match) return { stream, text: line }
    const kind = (match[1] ?? match[2] ?? match[3]).toLowerCase() as 'intent' | 'findings'
    return {
      stream: 'thought',
      text: line.slice(match[0].length),
      thoughtKind: kind
    }
  }
}
