// Text extraction only. Scanned PDFs remain needs_ocr; OCR is never silently approved.
export async function convertDocument(kind: string, bytes: Uint8Array) {
  if (kind === 'pdf') {
    const { extractText, getDocumentProxy } = await import('npm:unpdf@1.9.1');
    const pdf = await getDocumentProxy(bytes.slice(), {
      isEvalSupported: false, maxImageSize: 16_777_216, disableFontFace: true,
      disableAutoFetch: true, useSystemFonts: false,
    });
    try {
      if (pdf.numPages > 30) throw new Error('PDF exceeds the automatic 30-page limit');
      const result = await extractText(pdf, { mergePages: true });
      if (result.text.length > 5 * 1024 * 1024) throw new Error('Extracted PDF text is too large');
      return { text: result.text, warnings: [] };
    } finally { await pdf.destroy?.(); }
  }
  if (kind === 'docx') {
    const { unzipSync, strFromU8 } = await import('npm:fflate@0.8.2');
    const files = unzipSync(bytes, { filter: entry => {
      if (entry.name !== 'word/document.xml') return false;
      if (entry.originalSize > 30 * 1024 * 1024) throw new Error('Expanded Word text exceeds 30 MB');
      return true;
    } });
    if (!files['word/document.xml']) throw new Error('Word document text is missing');
    const text = strFromU8(files['word/document.xml'])
      .replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return { text, warnings: [] };
  }
  throw new Error('This document format needs the external converter');
}
convertDocument.supports = ['pdf', 'docx'];
