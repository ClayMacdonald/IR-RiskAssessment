import { jsPDF } from 'jspdf';
import config from './content/config.json';
import { correctIndex, isCorrect, knowledgeBand, maxPoints, readinessBand } from './scoring.js';
import { loadLogoForPdf } from './logo.js';
import { shortRule } from './screens/question.js';
import { formatWhen } from './util.js';

const PAGE_W = 612;
const MARGIN = 54;
const RIGHT = PAGE_W - MARGIN;
const CONTENT_W = RIGHT - MARGIN;
const BAND_1 = 84;
const BAND_N = 40;
const TOP_1 = 116;
const TOP_N = 72;
const BOTTOM = 732;

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

function slug(value) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'Firm';
}

export async function generateReport(state, results) {
  const c = brandColors();
  const logo = await loadLogoForPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const { details, answers, bank } = state;
  const firm = details.firmName;
  const when = state.completedAt || new Date();
  let y = TOP_1;

  doc.setProperties({
    title: `${firm}: IRP and Reg S-P Readiness Report`,
    author: 'AdvisorDefense',
    subject: `IRP and Reg S-P readiness record for ${details.name}`,
    creator: `AdvisorDefense ${config.productName}`,
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
    return doc.splitTextToSize(String(text), width);
  }

  // Draws wrapped text. Returns the height used.
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
    doc.text(config.reportTitle, RIGHT, 46, { align: 'right', charSpace: 1.2 });
  }

  function runningBand() {
    doc.setFillColor(c.navy800);
    doc.rect(0, 0, PAGE_W, BAND_N, 'F');
    logoAt(MARGIN, 13, 14);
    font(8, 'normal', c.white);
    let name = firm;
    while (doc.getTextWidth(name) > 220 && name.length > 4) name = name.slice(0, -2);
    if (name !== firm) name = `${name.trimEnd()}...`;
    doc.text(`IRP and Reg S-P Readiness Report · ${name}`, RIGHT, 24, { align: 'right' });
  }

  function newPage() {
    doc.addPage();
    runningBand();
    y = TOP_N;
  }

  function ensure(space) {
    if (y + space > BOTTOM) newPage();
  }

  function chip(x, top, label, tone, h = 14) {
    font(8, 'bold', tone[700]);
    const w = doc.getTextWidth(label) + 14;
    doc.setFillColor(tone[50]);
    doc.setDrawColor(tone[200]);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, top, w, h, h / 2, h / 2, 'FD');
    doc.text(label, x + w / 2, top + h / 2 + 2.8, { align: 'center' });
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

  function subHeading(text, keepWith = 40) {
    ensure(24 + keepWith);
    font(10.5, 'bold', c.navy700);
    doc.text(text, MARGIN, y + 10);
    y += 20;
  }

  const refLine = (q) => `Your IRP: ${q.irp_ref}   ·   Reg S-P: ${shortRule(q.regsp_ref)}`;

  // ---------- page 1: cover ----------
  firstBand();
  y += block(firm, MARGIN, y, { size: 24, width: CONTENT_W, lh: 30, style: 'bold', color: c.navy800 }) + 2;
  font(12, 'normal', c.muted);
  doc.text('IRP knowledge and Reg S-P readiness record', MARGIN, y + 10);
  y += 38;

  const shown = results.questions;
  const meta = [
    ['Completed by', details.name],
    ['Role', details.role],
    ['Completed', formatWhen(when)],
    ['Sections', `${bank.sections.length} incident response lifecycle sections`],
    ['IRP version', bank.irpVersion],
    ['Questions answered', `${shown.filter((q) => answers[q.id] != null).length} of ${shown.length}`],
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
    const cx = MARGIN + (i % 2) * cellW + 12;
    const cy = y + Math.floor(i / 2) * rowH;
    font(7, 'bold', c.muted);
    doc.text(k.toUpperCase(), cx, cy + 14, { charSpace: 0.6 });
    font(10, 'normal', c.ink);
    doc.text(doc.splitTextToSize(String(v), cellW - 24)[0], cx, cy + 29);
  });
  y += rowH * 3 + 20;

  // Score panels: Program Readiness and IRP Knowledge side by side (Knowledge alone only if an override hides every readiness question).
  const panels = [];
  if (results.readiness) {
    panels.push({
      label: 'PROGRAM READINESS',
      result: results.readiness,
      note: 'How an examiner would likely see the program. 85 and up Exam-ready, 60 to 84 Gaps an examiner would note, below 60 High exposure.',
    });
  }
  const kb = config.knowledgeBands;
  panels.push({
    label: 'IRP KNOWLEDGE',
    result: results.knowledge,
    note: `${results.knowledge.correct} of ${results.knowledge.total} answered the way the IRP says. ${kb.ready} and up Ready to respond, ${kb.refresher} to ${kb.ready - 1} Refresher recommended, below ${kb.refresher} Retraining needed.`,
  });
  const gap = 16;
  const pW = panels.length === 2 ? (CONTENT_W - gap) / 2 : CONTENT_W;
  const noteH = Math.max(...panels.map((p) => height(p.note, 8, pW - 32, 11)));
  const panelH = 116 + noteH;
  panels.forEach((p, i) => {
    const px = MARGIN + i * (pW + gap);
    const t = c[p.result.band.tone];
    doc.setFillColor(c.navy50);
    doc.setDrawColor(c.navy100);
    doc.setLineWidth(0.75);
    doc.roundedRect(px, y, pW, panelH, 6, 6, 'FD');
    font(7, 'bold', c.muted);
    doc.text(p.label, px + 16, y + 22, { charSpace: 0.8 });
    font(44, 'bold', c.navy800);
    const s = String(p.result.score);
    doc.text(s, px + 16, y + 68);
    const sw = doc.getTextWidth(s);
    font(13, 'normal', c.muted);
    doc.text('/ 100', px + 16 + sw + 6, y + 68);
    font(9, 'bold', c.white);
    const bw = doc.getTextWidth(p.result.band.label) + 20;
    doc.setFillColor(t[700]);
    doc.roundedRect(px + 16, y + 80, bw, 20, 10, 10, 'F');
    doc.text(p.result.band.label, px + 26, y + 93);
    block(p.note, px + 16, y + 108, { size: 8, width: pW - 32, lh: 11, color: c.body });
  });
  y += panelH + 20;

  // ---------- crosswalk ----------
  const cols = [
    { title: 'LIFECYCLE SECTION', w: 104 },
    { title: 'YOUR IRP', w: 150 },
    { title: 'REG S-P REQUIREMENT', w: 150 },
    { title: 'YOUR RESULT', w: CONTENT_W - 404 },
  ];
  const resultLines = (row) =>
    [
      row.knowledge ? `Knowledge: ${row.knowledge.correct} of ${row.knowledge.total}` : null,
      row.readiness ? `Readiness: ${row.readiness.percent}%` : null,
    ].filter(Boolean);
  const cells = (row) => [row.name, row.irp_sections, row.regsp_requirement, resultLines(row).join('\n')];
  const rowHeight = (row) =>
    Math.max(...cells(row).map((txt, i) => height(txt, 8.5, cols[i].w - 10, 11.5, i === 0 ? 'bold' : 'normal'))) + 14;

  function crosswalkHeader() {
    doc.setFillColor(c.navy50);
    doc.rect(MARGIN, y, CONTENT_W, 20, 'F');
    font(7, 'bold', c.muted);
    let x = MARGIN + 6;
    cols.forEach((col) => {
      doc.text(col.title, x, y + 13, { charSpace: 0.5 });
      x += col.w;
    });
    y += 20;
  }

  const xwIntro = 'Each part of the incident response lifecycle, the sections of the firm\'s IRP that cover it, the Reg S-P requirement those sections satisfy, and this person\'s result. This is how the IRP shows the firm meets Reg S-P.';
  sectionHeading('How the IRP meets Reg S-P', height(xwIntro, 9.5, CONTENT_W, 13.5) + 30 + rowHeight(results.crosswalk[0]));
  y += block(xwIntro, MARGIN, y, { size: 9.5, width: CONTENT_W, lh: 13.5 }) + 8;
  crosswalkHeader();
  results.crosswalk.forEach((row) => {
    const h = rowHeight(row);
    if (y + h > BOTTOM) {
      newPage();
      crosswalkHeader();
    }
    let x = MARGIN + 6;
    cells(row).forEach((txt, i) => {
      if (i === 3) {
        const lns = resultLines(row);
        lns.forEach((ln, li) => {
          const isK = ln.startsWith('Knowledge');
          const tone = isK
            ? c[knowledgeBand(Math.round((row.knowledge.correct / row.knowledge.total) * 100), kb).tone]
            : c[readinessBand(row.readiness.percent).tone];
          doc.setFillColor(tone[700]);
          doc.circle(x + 3, y + 10.5 + li * 11.5, 2.5, 'F');
          font(8.5, 'normal', c.ink);
          doc.text(ln, x + 10, y + 13.5 + li * 11.5);
        });
      } else {
        block(txt, x, y + 7, { size: 8.5, width: cols[i].w - 10, lh: 11.5, style: i === 0 ? 'bold' : 'normal', color: i === 0 ? c.navy800 : c.body });
      }
      x += cols[i].w;
    });
    y += h;
    doc.setDrawColor(c.borderSubtle);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, RIGHT, y);
  });
  y += 16;

  // ---------- findings ----------
  const fx = MARGIN + 36;
  const fW = RIGHT - 12 - fx;

  function card(title, rowsOf, mark, tone) {
    const rows = rowsOf.filter(Boolean);
    const rowsH = rows.reduce((h, r) => h + height(r.text, r.size || 9.5, fW, 13.5, r.style) + (r.gap ?? 4), 0);
    const cardH = 12 + 15 + rowsH + 10;
    ensure(cardH + 10);
    doc.setDrawColor(c.border);
    doc.setLineWidth(0.75);
    doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 4, 4, 'S');
    doc.setFillColor(tone);
    doc.circle(MARGIN + 20, y + 20, 8, 'F');
    font(8.5, 'bold', c.white);
    doc.text(mark, MARGIN + 20, y + 23, { align: 'center' });
    font(11, 'bold', c.navy800);
    doc.text(lines(title, 11, fW, 'bold')[0], fx, y + 23);
    let ry = y + 30;
    rows.forEach((r) => {
      ry += block(r.text, fx, ry, { size: r.size || 9.5, width: fW, lh: 13.5, style: r.style, color: r.color || c.body }) + (r.gap ?? 4);
    });
    y += cardH + 10;
    return cardH;
  }

  const cardHeightGuess = 120;
  if (results.readiness) {
    sectionHeading('Program readiness gaps', results.gaps.length ? cardHeightGuess : 40);
    if (results.gaps.length) {
      results.gaps.forEach(({ q }, i) =>
        card(
          q.title,
          [
            { text: `Answer given: ${q.options[answers[q.id]]?.label ?? 'Not answered'}`, color: c.muted },
            { text: q.exam_finding, color: c.ink },
            { text: refLine(q), size: 8.5, color: c.muted },
            { text: `Related AdvisorDefense service: ${q.mapped_service}`, size: 8.5, color: c.navy700, style: 'bold' },
          ],
          String(i + 1),
          c.navy800
        )
      );
    } else {
      y += block('No readiness gaps from these answers. Keep the evidence current.', MARGIN, y, { size: 10, width: CONTENT_W, lh: 14.5, color: c.success[700] }) + 10;
    }
  }

  sectionHeading('Knowledge to review', results.missed.length ? cardHeightGuess + 20 : 40);
  if (results.missed.length) {
    results.missedBySection.forEach((g) => {
      subHeading(g.section.name, cardHeightGuess);
      g.questions.forEach((q) =>
        card(
          q.title,
          [
            { text: q.question, color: c.ink },
            { text: `Answer given: ${q.options[answers[q.id]]?.label ?? 'Not answered'}`, color: c.muted },
            { text: `IRP answer: ${q.options[correctIndex(q)].label}`, style: 'bold', color: c.success[700] },
            { text: q.explanation },
            { text: refLine(q), size: 8.5, color: c.muted },
          ],
          '!',
          c.warning[700]
        )
      );
    });
  } else {
    y += block('Every knowledge question was answered the way the IRP says.', MARGIN, y, { size: 10, width: CONTENT_W, lh: 14.5, color: c.success[700] }) + 10;
  }

  // ---------- question by question ----------
  newPage();
  sectionHeading('Every question and answer');
  const qx = MARGIN + 16;
  const qW = RIGHT - qx;
  results.crosswalk.forEach((section) => {
    ensure(22 + 14 + 100);
    doc.setFillColor(c.navy800);
    doc.roundedRect(MARGIN, y, CONTENT_W, 22, 3, 3, 'F');
    font(8.5, 'bold', c.white);
    doc.text(section.name.toUpperCase(), MARGIN + 10, y + 14.5, { charSpace: 0.8 });
    font(8, 'bold', c.navy200);
    doc.text(resultLines(section).join('   ·   ').toUpperCase(), RIGHT - 10, y + 14.5, { align: 'right' });
    y += 22 + 14;

    const qs = shown.filter((q) => q.section === section.id);
    qs.forEach((q, qi) => {
      const ans = answers[q.id];
      const answer = q.options[ans];
      const knowledge = q.type === 'knowledge';
      const good = knowledge ? isCorrect(q, ans) : answer?.points === maxPoints(q);
      const tone = good ? c.success : knowledge || !answer || answer.points === 0 ? c.danger : c.warning;
      const status = knowledge ? (good ? 'Matches the IRP' : 'Differs from the IRP') : `${answer?.points ?? 0} of ${maxPoints(q)} points`;
      const answerLabel = answer?.label ?? 'Not answered';
      const boxText = knowledge ? q.options[correctIndex(q)].label : q.exam_finding;
      const boxNote = knowledge ? q.explanation : `Related AdvisorDefense service: ${q.mapped_service}`;

      const qH = height(q.question, 10, qW, 14);
      const aH = height(answerLabel, 10, qW - 110, 14);
      const bH = good ? 0 : height(boxText, 9.5, qW - 20, 13.5, knowledge ? 'bold' : 'normal') + height(boxNote, 8.5, qW - 20, 12) + 34;
      const rH = height(refLine(q), 8, qW, 11);
      const tH = height(`How it ties together: ${q.tie_in}`, 8, qW, 11);
      const total = 15 + qH + 4 + 10 + aH + 6 + (good ? 0 : bH + 6) + rH + 2 + tH;
      ensure(total + 12);

      doc.setFillColor(tone[700]);
      doc.circle(MARGIN + 3, y + 7, 3, 'F');
      font(11, 'bold', c.ink);
      doc.text(lines(q.title, 11, qW - 120, 'bold')[0], qx, y + 10);
      font(7, 'bold', c.muted);
      doc.text(knowledge ? 'IRP KNOWLEDGE' : 'PROGRAM READINESS', RIGHT, y + 10, { align: 'right', charSpace: 0.5 });
      y += 15;
      y += block(q.question, qx, y, { size: 10, width: qW, lh: 14 }) + 4;
      font(7, 'bold', c.muted);
      doc.text('ANSWER GIVEN', qx, y + 6, { charSpace: 0.6 });
      font(8.5, 'bold', tone[700]);
      doc.text(status, RIGHT, y + 6, { align: 'right' });
      y += 10;
      y += block(answerLabel, qx, y, { size: 10, width: qW - 110, lh: 14, color: c.ink }) + 6;

      if (!good) {
        doc.setFillColor(tone[50]);
        doc.roundedRect(qx, y, qW, bH, 3, 3, 'F');
        font(7, 'bold', tone[700]);
        doc.text(knowledge ? 'IRP ANSWER' : 'LIKELY EXAM FINDING', qx + 10, y + 14, { charSpace: 0.6 });
        let by = y + 18;
        by += block(boxText, qx + 10, by, { size: 9.5, width: qW - 20, lh: 13.5, style: knowledge ? 'bold' : 'normal', color: c.ink }) + 4;
        block(boxNote, qx + 10, by, { size: 8.5, width: qW - 20, lh: 12, color: c.body });
        y += bH + 6;
      }
      y += block(refLine(q), qx, y, { size: 8, width: qW, lh: 11, color: c.muted }) + 2;
      y += block(`How it ties together: ${q.tie_in}`, qx, y, { size: 8, width: qW, lh: 11, color: c.muted });

      if (qi < qs.length - 1) {
        y += 10;
        doc.setDrawColor(c.borderSubtle);
        doc.setLineWidth(0.5);
        doc.line(qx, y, RIGHT, y);
        y += 12;
      } else {
        y += 18;
      }
    });
  });

  // ---------- next steps, record statement, contact, disclaimer ----------
  const steps = config.nextSteps;
  const stepsH = steps.reduce((h, s) => h + height(s, 10, RIGHT - (MARGIN + 24), 14.5) + 6, 0);
  ensure(60 + stepsH);
  sectionHeading('Next steps', stepsH);
  steps.forEach((step, i) => {
    doc.setFillColor(c.navy50);
    doc.setDrawColor(c.navy100);
    doc.setLineWidth(0.5);
    doc.circle(MARGIN + 7, y + 7, 7, 'FD');
    font(8, 'bold', c.navy800);
    doc.text(String(i + 1), MARGIN + 7, y + 10, { align: 'center' });
    y += block(step, MARGIN + 24, y, { size: 10, width: RIGHT - (MARGIN + 24), lh: 14.5 }) + 6;
  });
  y += 12;

  const record = `This report records the answers ${details.name} (${details.role}) gave on ${formatWhen(when)}, against ${bank.irpVersion}. AdvisorDefense keeps these answers for ${config.retentionYears} years to review results with the firm.`;
  const recordH = height(record, 9, CONTENT_W - 28, 13) + 44;
  const contactH = 58;
  ensure(recordH + contactH + 60);
  doc.setFillColor(c.navy50);
  doc.setDrawColor(c.navy100);
  doc.setLineWidth(0.75);
  doc.roundedRect(MARGIN, y, CONTENT_W, recordH, 4, 4, 'FD');
  font(11, 'bold', c.navy800);
  doc.text('About this record', MARGIN + 14, y + 22);
  block(record, MARGIN + 14, y + 32, { size: 9, width: CONTENT_W - 28, lh: 13, color: c.ink });
  y += recordH + 12;

  doc.setDrawColor(c.border);
  doc.roundedRect(MARGIN, y, CONTENT_W, contactH, 4, 4, 'S');
  font(11, 'bold', c.navy800);
  doc.text('Questions about this report', MARGIN + 14, y + 22);
  font(10, 'normal', c.ink);
  doc.text(`AdvisorDefense  ·  ${config.phone}  ·  ${config.email}`, MARGIN + 14, y + 40);
  y += contactH + 16;

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

  const date = when.toLocaleDateString('en-CA');
  doc.save(`IRP-Readiness-${slug(firm)}-${slug(details.name)}-${date}.pdf`);
}
