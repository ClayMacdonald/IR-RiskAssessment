# Design Spec (from the Reg S-P Readiness Score, v2)

**IRP assessment changes (2026-10-30).** This app reuses the spec below unchanged except: the landing screen is an intro behind sign-in (same hero, with a "How your IRP meets Reg S-P" card in place of the sample results and no facts section); the gate is a report screen with no lead form; results show two score rings side by side, a crosswalk table (stacked rows under 720px) and findings grouped by section, with nothing locked; results always show two score rings (the assessment is CSIRT only since 2026-11-02; there is no staff path); the PDF title band reads IRP AND REG S-P READINESS REPORT and the score panel is two panels; the login page reuses the same tokens through copies in public/login/. Forced-colors rules were added for selection, progress, status and the footer logo. The QA checklist item on lead notifications now applies to the completion notice (report screen disclosure, intro trust strip, details privacy row).


This is the reference for the v2 redesign. It was produced by a design review of the v1 screens and implemented in this repo.

**Deviations from this spec in the build.** (Update: the question context callout was later replaced by a small muted "Why this matters:" help line under the answers, one per question, from the `help` field in questions.json.) These were kept to match the original product requirements:
- The question screen keeps the percent (now based on answered questions) and the "Section X of 4 · Question Y of Z" meta line.
- The "Step N of 3" eyebrows stay on the details and results screens.
- Results keeps "Back" rather than "Review answers".
- The mobile stepper shows only the current step's label, with no "Step N of 3" prefix, because the eyebrow already says it.
- On phones under 480px, section status chips are hidden. Status is carried by bar color and the accessible label.
- Question-by-question in the PDF uses the same section band, status dots and tinted gap boxes as described here.

---

## 1. Problems fixed from v1

1. The real logo was missing, so a text wordmark with cyan "Defense" stood in for the brand.
2. Three unrelated blues (royal `#003087`, `#2563EB`, cyan `#00A4E4`) were used, plus Tailwind default grays. None of them came from the logo.
3. The hero was a floating, rounded, gradient navy box with empty space and sticker-like white cards.
4. The left-border accent bar was used for three different meanings.
5. Too many uppercase tracked labels flattened the hierarchy.
6. Disabled buttons looked broken and gave no reason for being disabled.
7. Progress counters competed, and the percent was based on the question index, not answers.
8. The option check sat far from the label, and the focus and selected rings stacked.
9. Results bars were all the same blue, the empty state was weak, CTAs floated, and "Back" was orphaned.
10. The PDF had a cyan stripe, a logo "sticker", mixed heading colors and orphaned headings.

## 2. Direction

Quiet, editorial and institutional: an audit workpaper that happens to be software.
- Slate navy from the logo carries the brand. One action blue is reserved for anything clickable. Green, amber and red appear only where they carry meaning.
- Left-aligned layouts on a 4px spacing grid, with 1px borders and restrained shadows.
- Data visuals (score ring, section bars, segmented progress) do the decorative work, so there are no ornaments.

## 3. Tokens

See `src/styles/brand.css` for the full set with contrast notes.

| Group | Tokens |
|---|---|
| Navy | 950 `#0F2338`, 900 `#152F4C`, **800 `#1B3F62` (brand)**, 700 `#2B5279`, 600 `#45698F`, 300 `#A9BBCF`, 200 `#CBD6E2`, 100 `#E4EBF2`, 50 `#F2F5F9` |
| Logo | navy `#1B3F62`, navy text `#1A3E62`, gray `#D3D3D3`, gray mark `#D2D2D2` |
| Action blue | 600 `#1F5FAD` (6.37:1 on white), 700 `#194F91`, 800 `#143F74`, 100 `#BFD3EC`, 50 `#EAF1FA` |
| Neutrals | ink `#18222E`, body `#3A4654`, muted `#5A6573` (5.93:1), border-strong `#7B8794`, gray-400 `#9AA4AF`, border `#D8DEE5`, border-subtle `#E6EAEF`, bg `#F5F7FA`, surface `#FFFFFF` |
| Success | 700 `#17683F`, 200 `#B5D9C4`, 50 `#E7F3EC` |
| Warning | 700 `#8F5200`, 200 `#EBCB94`, 50 `#FBF1E0` |
| Danger | 700 `#B42318`, 200 `#F1B9B3`, 50 `#FCEBE9` |
| Radius | 4, 6, 8, 12, pill |
| Motion | 120ms (fast), 180ms (base), 320ms (slow), 700ms (score); ease `cubic-bezier(0.2, 0, 0, 1)` |

**Rules**
- Sky accent (update 2026-10-29, owner decision): v2 dropped cyan entirely. The owner reversed that to align the look with the IR Tabletop platform. Tokens: sky-700 `#0077A8`, 500 `#00A4E4`, 400 `#33B6EA`, 300 `#5CC5EE`, 50 `#E5F6FC`. Use sky only on navy surfaces or as decoration (rules, icon tiles, the accent button). Never white text on sky (2.83:1). Text on a sky fill is navy-950 (5.64:1). Sky text on light surfaces uses sky-700. Action blue stays the only color for buttons and links on light surfaces. The PDF does not use sky.
- Color tokens stay plain hex because the PDF reads them with `getComputedStyle`.

## 4. Type scale (Open Sans 400/600/700, tabular numbers on all figures)

| Use | Mobile | Desktop (768px and up) | Weight | Tracking |
|---|---|---|---|---|
| Landing H1 | 36/44 | 52/60 | 700 | -0.02em |
| Screen H1 | 28/36 | 36/44 | 700 | -0.015em |
| Question title (H1) | 22/30 | 28/36 | 700 | -0.01em |
| H2 | 20/28 | 22/30 | 700 | -0.01em |
| H3 | 17/26 | 18/26 | 600 | 0 |
| Lead | 18/28 | 20/32 | 400 | 0 |
| Body | 16/26 | 16/26 | 400 | 0 |
| Label | 15/22 | 15/22 | 600 | 0 |
| Small (hints, meta, disclaimer) | 14/22 | 14/22 | 400 | 0 |
| Eyebrow (one per screen) | 13/16 | 13/16 | 700 | 0.08em, uppercase |
| Chip | 13/16 | 13/16 | 600 | 0.01em |

## 5. Screens

- **Shell**
  - Header: white, 64px tall (56px on mobile), with the horizontal logo and the product name at 900px and up.
  - Stepper strip (52px): "Your firm / Assessment / Results", shown on every screen except landing.
  - Footer: navy, with the reversed logo, contact links with icons, disclaimer and copyright.
- **Landing** (updated 2026-10-29 to match the IR Tabletop look)
  - A full-bleed navy gradient hero on a 7/5 two-column grid. Copy column: sky rule, white H1, lead, large sky accent button, three stat tiles (questions, sections, approximate time), trust strip.
  - The header is sticky with a small shadow. The footer and the results CTA panel carry a sky top rule.
  - A static results preview card labeled "Sample results" and "Example", hidden under 640px.
  - A "Why it matters now" facts section with icon tiles.
- **Details**
  - Name fields in two columns, AUM and the examined question full width.
  - A privacy row with a lock icon.
  - A card footer with Back and Continue, and a hint shown while Continue is disabled.
- **Question**
  - The counter and percent above a segmented bar (one segment per section, one tick per question), then the section eyebrow and name.
  - The question card with option cards and an optional "Why this matters" callout.
  - On mobile, a sticky bottom nav bar.
- **Results**
  - Title block with the compliance date.
  - Score card: an animated SVG ring with a solid band badge, plus section rows with status chips and band-colored bars.
  - Numbered findings with a "Top N" chip and the exam callout.
  - A navy CTA panel listing what the report contains, with "Get the full report" and "Book a 30-minute review".
  - Back, then a quiet disclaimer.
- **Gate**
  - The form card next to a "What's in the report" aside, which has a page thumbnail and the line "PDF generated on your device".
  - While the PDF builds, the button shows a spinner and "Preparing your report".
  - After download, a success notice appears at the top of the form with "Book a 30-minute review" and "Download again", and focus moves to it.

## 6. Components

**Buttons (pill)**

| Variant | Default | Hover | Active | Disabled |
|---|---|---|---|---|
| Primary | blue-600 | blue-700 | blue-800, 1px press | navy-100 fill, muted text |
| Secondary | white, navy-800 text, border | navy-50, border-strong | none | none |
| Text | blue-600 | underline | none | none |
| On-dark | white, navy-800 text | none | none | none |
| On-dark secondary | transparent, white text, navy-300 border | none | none | none |

- Height 48px, or 52px for large. Icons are 18px. Arrows nudge 2px on hover.
- **Fields:** 48px tall, 1px border-strong, 8px radius. Focus: a blue-600 border plus a 3px blue-100 halo. Selects use a CSS chevron.
- **Errors:** danger-700 border and message with an alert icon. Shown on blur, cleared on input.
- **Option cards:** indicator on the left (22px circle). The selected state is a blue-600 border with an inset 1px ring, blue-50 fill and a 600-weight label. The focus outline is offset 3px so it never stacks with the selection ring.
- **Chips:** band-50 fill, band-200 border, band-700 text. Section labels: "Exam-ready", "Gaps noted", "High exposure".
- **Badge:** solid band-700 with a white dot.
- **Score ring:** circle r=68 with stroke 12. The value is drawn with stroke-dashoffset and animates over 700ms with a count-up, both disabled under reduced motion.
- **Focus:** a 2px blue-600 outline offset 2px, or white on navy.
- **Reduced motion:** a global `prefers-reduced-motion` override.
- **Icons:** a 24px stroke set in `src/components/icons.js`.

## 7. Logo usage

| Variant | Fills | Use |
|---|---|---|
| Horizontal, full color | official | Header: 32px tall, 22px on mobile |
| Horizontal, reversed | white plus logo gray | Footer at 28px. PDF bands at 22pt on page 1 and 14pt on later pages |
| Mark only, reversed on navy-800 | white plus logo gray | Favicon |

- **Construction:** the mark is scaled to 112 units; the wordmark (70 units) is centered beside it with a gap of half the wordmark height. viewBox 881 x 112.
- **CSP:** fills are presentation attributes, never a `<style>` block.
- **Clear space:** at least half the lockup height on all sides.
- **Minimum heights:** 20px on screen, 14pt in print.
- **Header gray:** the official light gray "Defense" is kept on white. Logotypes are exempt from text contrast rules. If it ever needs darkening, only `#8A939C` (3.12:1) is acceptable, and only with written brand-owner sign-off.

## 8. PDF (jsPDF, Helvetica, letter)

- **Page 1:** an 84pt navy band with the reversed logo and "REG S-P READINESS REPORT". Then the firm name in 24pt bold navy and a 2 x 3 meta grid.
- **Score panel:** the score at 52pt, a band chip, and a "where your score falls" scale with a marker and a legend.
- **Section table:** a bar and a status chip for each section.
- **Findings:** cards with numbered discs. Findings headings are kept with their first card.
- **Question by question:** starts on a new page. Each section opens with a navy band showing the section score. Each question has a status dot, its text, "YOUR ANSWER" and points. Gaps get a tinted box with "LIKELY EXAM FINDING" and the related service.
- **Closing:** numbered next steps, a contact box with a booking link, and the disclaimer.
- **Running elements:** a 40pt band on later pages. Every page has a footer with the contact line, "Confidential. Prepared for {Firm}." and "Page X of Y".
- **Page breaks:** all blocks are measured before drawing so none split.
- **Logo image:** embedded once with an alias, which brings a typical report to about 110 KB.

## 9. QA checklist

- An axe scan on every screen state.
- A keyboard-only run of the whole flow.
- 200% zoom and a 320px width.
- Windows forced-colors mode.
- Reduced motion.
- No `style=""` and no `<style>` in HTML strings.
- The copy lint in `tests/smoke.mjs`.
- The PDF opened in Acrobat and the macOS Preview app.
- **Lead notifications (2026-10-29):** the gate shows a disclosure line naming what is sent (name, work email, role, firm name, score). The landing trust strip, the details privacy row and the gate aside stay accurate because the answers never leave the browser and the PDF is still generated on the device. Re-check all four if the payload ever changes.
- **Stored assessments (2026-11-02):** the completion now sends name, work email, role and answers, and AdvisorDefense keeps them for the retention period in `config.json`. The report disclosure names those fields and the period. The landing trust strip says "Shared only with AdvisorDefense", and the details privacy row says nothing is saved until download. The gate aside ("PDF generated on your device") is still accurate. Re-check all four if the payload or the retention period changes.
