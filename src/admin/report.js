// Rebuilds a person's PDF report from a stored record, on the admin's device, with the same
// generateReport() the person used. The record holds the bank as they saw it and their answers,
// so the questions, scores and crosswalk match. Two differences, both from the record: the firm
// name is the client's registered name, and the date is when the record was saved (the download).
import config from '../content/config.json';
import { buildResults } from '../scoring.js';
import { api } from './api.js';
import { reportInput } from './record.js';

// Fetches the record (logged as a download) and saves the PDF.
export async function downloadReport(id) {
  const { submission } = await api.submission(id, 'download');
  const input = reportInput(submission);
  const results = buildResults({ bank: input.bank, answers: input.answers }, config.knowledgeBands);
  // jsPDF is loaded only when needed.
  const { generateReport } = await import('../pdf.js');
  await generateReport(input, results);
}
