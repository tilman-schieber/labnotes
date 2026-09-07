// Analytical data on a product batch — TLC, NMR, MS, HPLC, melting point, appearance — written
// as a block in the experiment (so it is signed and exported with the entry) and mirrored onto
// the batch entity on save. Pure; explicit .ts imports.

export const ANALYTICS_TECHNIQUES = ['TLC', '1H NMR', '13C NMR', '19F NMR', 'MS', 'HRMS', 'HPLC', 'LCMS', 'GC', 'IR', 'UV-Vis', 'mp', 'optical rotation', 'appearance', 'purity', 'other'] as const;

export type AnalyticsTechnique = (typeof ANALYTICS_TECHNIQUES)[number];

export type AnalyticsEntry = {
  id: string;
  technique: AnalyticsTechnique;
  // The observation as a chemist writes it: "δ 8.05 (d, 2H), …", "m/z 137 [M+H]+", "white solid"
  result: string;
  // TLC only
  eluent?: string;
  rf?: number | null;
  // Spectra and traces uploaded to the experiment, linked to this entry
  attachmentIds: string[];
};

export type AnalyticsBlock = {
  batchId: string | null;
  entries: AnalyticsEntry[];
};

type JsonNode = { type?: string; attrs?: Record<string, unknown>; content?: JsonNode[] };

export function createAnalyticsEntry(technique: AnalyticsTechnique = 'TLC'): AnalyticsEntry {
  return { id: `a-${Math.random().toString(36).slice(2, 9)}`, technique, result: '', attachmentIds: [] };
}

function normaliseEntry(raw: unknown): AnalyticsEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const technique = (ANALYTICS_TECHNIQUES as readonly string[]).includes(String(entry.technique)) ? (entry.technique as AnalyticsTechnique) : 'other';
  const rf = typeof entry.rf === 'number' && Number.isFinite(entry.rf) ? entry.rf : null;
  return {
    id: String(entry.id ?? ''),
    technique,
    result: typeof entry.result === 'string' ? entry.result : '',
    eluent: typeof entry.eluent === 'string' && entry.eluent ? entry.eluent : undefined,
    rf,
    attachmentIds: Array.isArray(entry.attachmentIds) ? entry.attachmentIds.map(String) : []
  };
}

// Every analytics block in a document, in order, with the batch it describes.
export function extractAnalytics(content: JsonNode | null | undefined): AnalyticsBlock[] {
  const blocks: AnalyticsBlock[] = [];
  const visit = (node: JsonNode) => {
    if (node.type === 'analytics') {
      const entries = Array.isArray(node.attrs?.entries) ? (node.attrs?.entries as unknown[]).map(normaliseEntry).filter((entry): entry is AnalyticsEntry => entry !== null) : [];
      blocks.push({ batchId: typeof node.attrs?.batchId === 'string' && node.attrs.batchId ? node.attrs.batchId : null, entries });
      return;
    }
    (node.content ?? []).forEach(visit);
  };
  if (content) {
    visit(content);
  }
  return blocks;
}

// One line per entry, the way it would appear in an experimental section.
export function describeEntry(entry: AnalyticsEntry): string {
  const parts: string[] = [entry.technique];
  if (entry.technique === 'TLC') {
    const tlc = [entry.rf !== null && entry.rf !== undefined ? `Rf ${entry.rf}` : null, entry.eluent ? `(${entry.eluent})` : null].filter(Boolean).join(' ');
    if (tlc) {
      parts.push(tlc);
    }
  }
  if (entry.result.trim()) {
    parts.push(entry.result.trim());
  }
  return parts.join(': ').replace(': Rf', ' Rf');
}
