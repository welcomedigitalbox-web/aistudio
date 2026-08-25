import { createServiceClient } from "@/lib/supabase/server";

/**
 * Split a book into chapter-sized chunks.
 *
 * Chapter detection is deliberately loose -- real PDFs label chapters a dozen
 * different ways. When no headings are found we fall back to fixed-size
 * splitting so the pipeline never stalls on an unusual layout.
 */
const HEADING = /^\s*(chapter\s+[\divxlcdm]+|အခန်း\s*[\u1040-\u1049\d]+|part\s+[\divxlcdm]+|[IVXLCDM]{1,6}\.)\s*(.*)$/im;

const MAX_CHARS = 12000;

export interface Chunk {
  n: number;
  label: string | null;
  body: string;
}

export function splitIntoChunks(text: string): Chunk[] {
  const lines = text.split(/\r?\n/);
  const chunks: Chunk[] = [];

  let current: string[] = [];
  let label: string | null = null;
  let n = 1;

  const flush = () => {
    const body = current.join("\n").trim();
    if (body.length < 200) return; // front matter, page numbers, noise
    chunks.push({ n: n++, label, body });
    current = [];
  };

  for (const line of lines) {
    const m = line.match(HEADING);
    if (m) {
      flush();
      label = line.trim().slice(0, 120);
      continue;
    }
    current.push(line);

    // Guard against books with no detectable headings at all.
    if (current.join("\n").length > MAX_CHARS) {
      flush();
      label = label ? `${label} (cont.)` : null;
    }
  }
  flush();

  return chunks;
}

export async function storeChunks(sourceId: string, chunks: Chunk[]) {
  const db = createServiceClient();
  const rows = chunks.map((c) => ({
    source_id: sourceId,
    n: c.n,
    label: c.label,
    body: c.body,
    chars: c.body.length,
  }));

  // Insert in batches; a long novel can produce a few hundred chunks.
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await db.from("source_chunks").insert(rows.slice(i, i + 50));
    if (error) throw new Error(`chunk insert failed at ${i}: ${error.message}`);
  }
}
