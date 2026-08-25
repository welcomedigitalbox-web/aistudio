import pdf from "pdf-parse";

/**
 * Extract raw text from a PDF buffer.
 *
 * This handles text-layer PDFs only. Scanned books come back nearly empty --
 * we detect that and fail loudly rather than storing a useless source.
 */
export async function extractText(buffer: Buffer): Promise<string> {
  const result = await pdf(buffer);
  const text = (result.text ?? "").trim();

  const perPage = result.numpages > 0 ? text.length / result.numpages : 0;
  if (perPage < 100) {
    throw new Error(
      "This PDF has almost no selectable text — it is probably a scan. Run OCR on it first."
    );
  }

  return text;
}
