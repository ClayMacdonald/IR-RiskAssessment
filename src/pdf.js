import { jsPDF } from 'jspdf';
import config from './content/config.json';
import { QUESTIONS, SECTIONS, band, maxPoints, examinedRecently } from './scoring.js';
import { loadLogoForPdf } from './logo.js';

const PAGE_W = 612;
const MARGIN = 54;
const RIGHT = PAGE_W - MARGIN;
const CONTENT_W = RIGHT - MARGIN;
const BAND_1 = 84;
const BAND_N = 40;
const TOP_1 = 116;
const TOP_N = 72;
const BOTTOM = 732;
const SECTION_STATUS = { success: 'Exam-ready', warning: 'Gaps noted', danger: 'High exposure' };

// Colors come from src/styles/brand.css so the PDF never drifts from the site.
function brandColors() {
  const css = getComputedStyle(document.documentElement);
  const get = (name) => css.getPropertyValue(`--ad-${name}`).trim();
  const tone = (t) => ({ 700: get(`${t}-700`), 200: get(`${t}-200`), 50: get(`${t}-50`) });
  return {
    navy800: get('navy-800'),
    navy700: get('navy-700'),
    navy200: get('navy-200'),
    navy100: get('navy-100'),
    navy50: get('navy-50'),
    blue600: get('blue-600'),
    ink: get('ink'),
    body: get('text-body'),
    muted: get('text-muted'),
    border: get('border'),
    borderSubtle: get('border-subtle'),
    white: get('surface'),
    success: tone('success'),
    warning: tone('warning'),
    danger: tone('danger'),
  };
}

function today() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function slug(value) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'Firm';
}

export async function generateReport(state, results) {
  const c = brandColors();
  const logo = await loadLogoForPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const firm = state.details.firmName;
  let y = TOP_1;

  doc.setProperties({
    title: `${firm}: Reg S-P Readiness Report`,
    author: 'AdvisorDefense',
    subject: 'Reg S-P Readiness Score',
    creator: 'AdvisorDefense Reg S-P Readiness Score',
  });

  // ---------- primitives ----------
  function font(size, style = 'normal', color = c.body) {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color);
  }

  function lines(text, size, width, style = 'normal') {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    return doc.splitTextToSize(text, width);
  }

  // Draws wrapped text at the current font settings. Returns the height used.
  function block(text, x, top, { size, width, lh, style = 'normal', color = c.body }) {
    const ls = lines(text, size, width, style);
    font(size, style, color);
    ls.forEach((line, i) => doc.text(line, x, top + size * 0.78 + i * lh));
    return ls.length * lh;
  }

  function height(text, size, width, lh, style) {
    return lines(text, size, width, style).length * lh;
  }

  function logoAt(x, top, h) {
    if (logo) {
      // The alias embeds the image once and reuses it on every page.
      doc.addImage(logo.dataUrl, 'PNG', x, top, (logo.width / logo.height) * h, h, 'ad-logo', 'FAST');
    } else {
      font(h * 0.9, 'bold', c.white);
      doc.text('Advisor', x, top + h * 0.8);
      doc.setTextColor(c.navy200);
      doc.text('Defense', x + doc.getTextWidth('Advisor'), top + h * 0.8);
    }
  }

  function firstBand() {
    doc.setFillColor(c.navy800);
    doc.rect(0, 0, PAGE_W, BAND_1, 'F');
    logoAt(MARGIN, 31, 22);
    font(8, 'bold', c.white);
    doc.text('REG S-P READINESS REPORT', RIGHT, 46, { align: 'right', charSpace: 1.2 });
  }

  function runningBand() {
    doc.setFillColor(c.navy800);
    doc.rect(0, 0, PAGE_W, BAND_N, 'F');
    logoAt(MARGIN, 13, 14);
    font(8, 'normal', c.white);
    let name = firm;
    while (doc.getTextWidth(name) > 260 && name.length > 4) name = name.slice(0, -2);
    if (name !== firm) name = `${name.trimEnd()}...`;
    doc.text(`Reg S-P Readiness Report · ${name}`, RIGHT, 24, { align: 'right' });
  }

  function newPage() {
    doc.addPage();
    runningBand();
    y = TOP_N;
  }

  function ensure(space) {
    if (y + space > BOTTOM) newPage();
  }

  function chip(xRight, top, label, tone, h = 14) {
    font(8, 'bold', tone[700]);
    const w = doc.getTextWidth(label) + 14;
    doc.setFillColor(tone[50]);
    doc.setDrawColor(tone[200]);
    doc.setLineWidth(0.5);
    doc.roundedRect(xRight - w, top, w, h, h / 2, h / 2, 'FD');
    doc.text(label, xRight - w / 2, top + h / 2 + 2.8, { align: 'center' });
    return w;
  }

  // keepWith: height of the first block after the heading, so a heading never sits alone at a page bottom.
  function sectionHeading(text, keepWith = 40) {
    ensure(42 + keepWith);
    y += 8;
    font(13, 'bold', c.navy800);
    doc.text(text, MARGIN, y + 10);
    y += 20;
    doc.setDrawColor(c.navy800);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, y, RIGHT, y);
    y += 14;
  }

  const toneOf = (pct) => c[band(pct).tone];

  // ---------- page 1: cover ----------
  firstBand();
  const titleH = block(firm, MARGIN, y, { size: 24, width: CONTENT_W, lh: 30, style: 'bold', color: c.navy800 });
  y += titleH + 2;
  font(12, 'normal', c.muted);
  doc.text('Reg S-P Readiness Score', MARGIN, y + 10);
  y += 18 + 20;

  // Meta grid: 2 columns x 3 rows
  const meta = [
    ['Prepared for', `${state.lead.name}${state.lead.role ? `, ${state.lead.role}` : ''}`],
    ['Report date', today()],
    ['Regulatory AUM', state.details.aum],
    ['Reg S-P compliance date', results.complianceDate],
    ['Examined since compliance date', state.details.examined],
    ['', ''],
  ];
  const cellW = CONTENT_W / 2;
  const rowH = 40;
  doc.setDrawColor(c.border);
  doc.setLineWidth(0.75);
  doc.roundedRect(MARGIN, y, CONTENT_W, rowH * 3, 4, 4, 'S');
  doc.setDrawColor(c.borderSubtle);
  doc.setLineWidth(0.5);
  doc.line(MARGIN + cellW, y, MARGIN + cellW, y + rowH * 3);
  doc.line(MARGIN, y + rowH, RIGHT, y + rowH);
  doc.line(MARGIN, y + rowH * 2, RIGHT, y + rowH * 2);
  meta.forEach(([k, v], i) => {
    if (!k) return;
    const cx = MARGIN + (i % 2) * cellW + 12;
    const cy = y + Math.floor(i / 2) * rowH;
    font(7, 'bold', c.muted);
    doc.text(k.toUpperCase(), cx, cy + 14, { charSpace: 0.6 });
    font(10.5, 'normal', c.ink);
    doc.text(doc.splitTextToSize(String(v), cellW - 24)[0], cx, cy + 29);
  });
  y += rowH * 3 + 20;

  // Score panel
  const panelH = 128;
  const t = c[results.band.tone];
  doc.setFillColor(c.navy50);
  doc.setDrawColor(c.navy100);
  doc.setLineWidth(0.75);
  doc.roundedRect(MARGIN, y, CONTENT_W, panelH, 6, 6, 'FD');

  const lx = MARGIN + 20;
  font(7, 'bold', c.muted);
  doc.text('OVERALL SCORE', lx, y + 24, { charSpace: 0.8 });
  font(52, 'bold', c.navy800);
  const scoreStr = String(results.score);
  doc.text(scoreStr, lx, y + 78);
  const sw = doc.getTextWidth(scoreStr);
  font(14, 'normal', c.muted);
  doc.text('/ 100', lx + sw + 6, y + 78);
  font(9, 'bold', c.white);
  const badgeW = doc.getTextWidth(results.band.label) + 20;
  doc.setFillColor(t[700]);
  doc.roundedRect(lx, y + 92, badgeW, 20, 10, 10, 'F');
  doc.text(results.band.label, lx + 10, y + 105);

  const sx = MARGIN + 220;
  const sW = RIGHT - 20 - sx;
  font(7, 'bold', c.muted);
  doc.text('WHERE YOUR SCORE FALLS', sx, y + 24, { charSpace: 0.8 });
  const zones = [
    [0, 60, c.danger[200]],
    [60, 85, c.warning[200]],
    [85, 100, c.success[200]],
  ];
  zones.forEach(([a, b, col]) => {
    doc.setFillColor(col);
    doc.rect(sx + (sW * a) / 100, y + 46, (sW * (b - a)) / 100, 8, 'F');
  });
  const mx = sx + (sW * results.score) / 100;
  doc.setFillColor(c.navy800);
  doc.rect(mx - 1, y + 42, 2, 16, 'F');
  font(8, 'bold', c.navy800);
  doc.text(scoreStr, Math.min(Math.max(mx, sx + 6), sx + sW - 6), y + 38, { align: 'center' });
  const legend = [
    [c.danger[200], '0 to 59', 'High exposure'],
    [c.warning[200], '60 to 84', 'Gaps an examiner would note'],
    [c.success[200], '85 to 100', 'Exam-ready'],
  ];
  legend.forEach(([col, range, label], i) => {
    const ly = y + 76 + i * 13;
    doc.setFillColor(col);
    doc.rect(sx, ly - 6, 6, 6, 'F');
    font(7.5, 'bold', c.body);
    doc.text(range, sx + 12, ly);
    font(7.5, 'normal', c.body);
    doc.text(label, sx + 56, ly);
  });
  y += panelH + 20;

  // Section table
  sectionHeading('Score by section');
  doc.setFillColor(c.navy50);
  doc.rect(MARGIN, y, CONTENT_W, 20, 'F');
  font(7, 'bold', c.muted);
  doc.text('SECTION', MARGIN + 8, y + 13, { charSpace: 0.6 });
  doc.text('SCORE', MARGIN + 250, y + 13, { charSpace: 0.6 });
  doc.text('STATUS', RIGHT - 8, y + 13, { align: 'right', charSpace: 0.6 });
  y += 20;
  results.sections.forEach((s) => {
    const tone = toneOf(s.percent);
    font(10, 'bold', c.ink);
    doc.text(s.name, MARGIN + 8, y + 16.5);
    doc.setFillColor(c.navy100);
    doc.roundedRect(MARGIN + 250, y + 10.5, 140, 5, 2.5, 2.5, 'F');
    if (s.percent > 0) {
      doc.setFillColor(tone[700]);
      doc.roundedRect(MARGIN + 250, y + 10.5, Math.max((140 * s.percent) / 100, 5), 5, 2.5, 2.5, 'F');
    }
    font(10, 'bold', c.ink);
    doc.text(`${s.percent}%`, MARGIN + 426, y + 16.5, { align: 'right' });
    chip(RIGHT - 4, y + 6, SECTION_STATUS[band(s.percent).tone], tone);
    y += 26;
    doc.setDrawColor(c.borderSubtle);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, RIGHT, y);
  });
  y += 12;

  // Priority findings
  const textW = RIGHT - 12 - (MARGIN + 36);
  const findingCardH = (q) => 12 + 15 + height(q.exam_finding, 10, textW, 14.5) + 4 + 12 + 10;
  sectionHeading('What an examiner would likely note', results.findings.length ? findingCardH(results.findings[0]) : 50);
  if (results.findings.length) {
    results.findings.forEach((q, i) => {
      const cardH = findingCardH(q);
      ensure(cardH + 10);
      doc.setDrawColor(c.border);
      doc.setLineWidth(0.75);
      doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 4, 4, 'S');
      doc.setFillColor(c.navy800);
      doc.circle(MARGIN + 20, y + 20, 8, 'F');
      font(8.5, 'bold', c.white);
      doc.text(String(i + 1), MARGIN + 20, y + 23, { align: 'center' });
      font(11, 'bold', c.navy800);
      doc.text(q.title, MARGIN + 36, y + 23);
      const used = block(q.exam_finding, MARGIN + 36, y + 30, { size: 10, width: textW, lh: 14.5 });
      const sy = y + 30 + used + 12;
      font(8.5, 'normal', c.muted);
      const lbl = 'Related AdvisorDefense service: ';
      const lblW = doc.getTextWidth(lbl);
      doc.text(lbl, MARGIN + 36, sy);
      font(8.5, 'bold', c.navy700);
      doc.text(q.mapped_service, MARGIN + 36 + lblW, sy);
      y += cardH + 10;
    });
  } else {
    const msg = 'Based on your answers, an examiner would not likely note gaps in these areas. Keep the evidence current.';
    const h = height(msg, 10, CONTENT_W - 28, 14.5) + 24;
    doc.setFillColor(c.success[50]);
    doc.setDrawColor(c.success[200]);
    doc.setLineWidth(0.75);
    doc.roundedRect(MARGIN, y, CONTENT_W, h, 4, 4, 'FD');
    block(msg, MARGIN + 14, y + 12, { size: 10, width: CONTENT_W - 28, lh: 14.5, color: c.success[700] });
    y += h + 10;
  }
  if (examinedRecently(state.details.examined)) {
    const msg = 'Compare these findings against any deficiency letter or document request you received.';
    const h = height(msg, 9.5, CONTENT_W - 28, 13.5, 'bold') + 20;
    ensure(h);
    doc.setFillColor(c.navy50);
    doc.roundedRect(MARGIN, y, CONTENT_W, h, 4, 4, 'F');
    block(msg, MARGIN + 14, y + 10, { size: 9.5, width: CONTENT_W - 28, lh: 13.5, style: 'bold', color: c.ink });
    y += h + 10;
  }

  // ---------- question by question ----------
  newPage();
  sectionHeading('Your answers, question by question');
  const qx = MARGIN + 16;
  const qW = RIGHT - qx;
  results.sections.forEach((section, si) => {
    ensure(22 + 14 + 90);
    doc.setFillColor(c.navy800);
    doc.roundedRect(MARGIN, y, CONTENT_W, 22, 3, 3, 'F');
    font(8.5, 'bold', c.white);
    doc.text(section.name.toUpperCase(), MARGIN + 10, y + 14.5, { charSpace: 0.8 });
    font(8.5, 'bold', c.navy200);
    doc.text(`SECTION SCORE ${section.percent}%`, RIGHT - 10, y + 14.5, { align: 'right' });
    y += 22 + 14;

    const qs = QUESTIONS.filter((q) => q.section === SECTIONS[si].id);
    qs.forEach((q, qi) => {
      const answer = q.options[state.answers[q.id]];
      const max = maxPoints(q);
      const full = answer.points === max;
      const tone = full ? c.success : answer.points === 0 ? c.danger : c.warning;
      const qH = height(q.question, 10, qW, 14);
      const aH = height(answer.label, 10, qW - 90, 14);
      const fH = full ? 0 : height(q.exam_finding, 9.5, qW - 20, 13.5);
      const gapH = full ? 14 : 8 + 10 + fH + 6 + 10 + 8;
      const total = 15 + qH + 4 + 10 + aH + 6 + gapH;
      ensure(total);

      doc.setFillColor(tone[700]);
      doc.circle(MARGIN + 3, y + 7, 3, 'F');
      font(11, 'bold', c.ink);
      doc.text(q.title, qx, y + 10);
      y += 15;
      y += block(q.question, qx, y, { size: 10, width: qW, lh: 14 }) + 4;
      font(7, 'bold', c.muted);
      doc.text('YOUR ANSWER', qx, y + 6, { charSpace: 0.6 });
      font(8.5, 'normal', c.muted);
      doc.text(`${answer.points} of ${max} points`, RIGHT, y + 6, { align: 'right' });
      y += 10;
      y += block(answer.label, qx, y, { size: 10, width: qW - 90, lh: 14, color: c.ink }) + 6;

      if (full) {
        font(9, 'normal', c.muted);
        doc.text('No gap noted for this question.', qx, y + 8);
        y += 14;
      } else {
        const boxH = gapH - 2;
        doc.setFillColor(tone[50]);
        doc.roundedRect(qx, y, qW, boxH, 3, 3, 'F');
        font(7, 'bold', tone[700]);
        doc.text('LIKELY EXAM FINDING', qx + 10, y + 14, { charSpace: 0.6 });
        const used = block(q.exam_finding, qx + 10, y + 18, { size: 9.5, width: qW - 20, lh: 13.5, color: c.ink });
        font(8.5, 'normal', c.muted);
        doc.text(`Related AdvisorDefense service: ${q.mapped_service}`, qx + 10, y + 18 + used + 10);
        y += boxH;
      }

      if (qi < qs.length - 1) {
        y += 12;
        doc.setDrawColor(c.borderSubtle);
        doc.setLineWidth(0.5);
        doc.line(qx, y, RIGHT, y);
        y += 12;
      } else {
        y += 18;
      }
    });
  });

  // ---------- next steps, contact, disclaimer ----------
  const stepsH = config.nextSteps.reduce((h, s) => h + height(s, 10, RIGHT - (MARGIN + 24), 14.5) + 6, 0);
  ensure(60 + stepsH + 90 + 40);
  sectionHeading('Next steps');
  config.nextSteps.forEach((step, i) => {
    doc.setFillColor(c.navy50);
    doc.setDrawColor(c.navy100);
    doc.setLineWidth(0.5);
    doc.circle(MARGIN + 7, y + 7, 7, 'FD');
    font(8, 'bold', c.navy800);
    doc.text(String(i + 1), MARGIN + 7, y + 10, { align: 'center' });
    y += block(step, MARGIN + 24, y, { size: 10, width: RIGHT - (MARGIN + 24), lh: 14.5 }) + 6;
  });
  y += 12;

  const boxH = 76;
  doc.setFillColor(c.navy50);
  doc.setDrawColor(c.navy100);
  doc.setLineWidth(0.75);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 4, 4, 'FD');
  font(11, 'bold', c.navy800);
  doc.text('Talk to AdvisorDefense', MARGIN + 14, y + 22);
  font(10, 'normal', c.ink);
  doc.text(`${config.phone}  ·  ${config.email}`, MARGIN + 14, y + 40);
  font(10, 'normal', c.blue600);
  doc.textWithLink('Book a 30-minute review', MARGIN + 14, y + 58, { url: config.bookingUrl });
  y += boxH + 16;

  block(config.disclaimer, MARGIN, y, { size: 8, width: CONTENT_W, lh: 11, color: c.muted });

  // ---------- footer on every page ----------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(c.border);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, 750, RIGHT, 750);
    font(7.5, 'normal', c.muted);
    doc.text(`AdvisorDefense · ${config.tagline} · ${config.phone} · ${config.email}`, MARGIN, 762);
    doc.text(`Confidential. Prepared for ${firm}.`, MARGIN, 773);
    font(7.5, 'bold', c.muted);
    doc.text(`Page ${p} of ${pages}`, RIGHT, 762, { align: 'right' });
  }

  doc.save(`Reg-S-P-Readiness-${slug(firm)}.pdf`);
}
