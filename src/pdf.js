// Builds a light, print-style PDF of the client's planning guide in the browser.
// The guide is rendered off-screen in "pdf mode" (white page, Fitler type), then cut into
// A4 pages at section boundaries so headings and list items are not split mid-line.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { FC_WORDMARK } from './brand.js';

const RENDER_WIDTH = 860; // px width the guide is laid out at for the PDF
const SCALE = 2;

// html2canvas draws complex SVG paths poorly, so rasterise the wordmark with the browser first.
async function wordmarkPng() {
  const svg = FC_WORDMARK.replace('fill="currentColor"', 'fill="#151515"').replace('<svg ', '<svg width="680" height="155" ');
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 680; c.height = 155;
  c.getContext('2d').drawImage(img, 0, 0, 680, 155);
  return c.toDataURL('image/png');
}

export async function buildGuidePdf(root, { title = 'Event guide', contactName = '' } = {}) {
  if (!root) throw new Error('Nothing to export');
  const logo = await wordmarkPng().catch(() => null);
  let breaks = [];
  const canvas = await html2canvas(root, {
    backgroundColor: '#ffffff',
    scale: SCALE,
    useCORS: true,
    logging: false,
    windowWidth: 1100,
    onclone: async (doc, el) => {
      doc.documentElement.classList.add('pdf-mode');
      el.style.width = `${RENDER_WIDTH}px`;
      el.style.padding = '28px 30px 10px';
      el.style.background = '#ffffff';
      const head = doc.createElement('div');
      head.className = 'pdf-head';
      if (logo) {
        const img = doc.createElement('img');
        img.src = logo; img.alt = 'Fitler Club'; img.className = 'pdf-wordmark';
        head.appendChild(img);
      }
      const meta = doc.createElement('div');
      meta.className = 'pdf-meta';
      meta.textContent = `Event planning guide · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
      head.appendChild(meta);
      el.insertBefore(head, el.firstChild);
      // Wait for the copy's fonts so measurements match the final render.
      try { await doc.fonts.ready; } catch {}
      await new Promise((r) => setTimeout(r, 60));
      // Record safe places to start a new page, measured in the cloned layout: a cut is safe
      // when it does not pass through any line of text in either column.
      const top = el.getBoundingClientRect().top;
      const rect = (n) => { const r = n.getBoundingClientRect(); return [r.top - top, r.bottom - top]; };
      const atoms = [...el.querySelectorAll('h1, h3, p, li, .check, .opt, .estimate, .eyebrow, .gsec > .muted, .gsec .spread, .small, .pdf-head')].map(rect);
      // Keep each section heading with the first thing under it (no orphaned headings).
      for (const h of el.querySelectorAll('.gsec h3, .gsec .spread')) {
        const next = h.closest('.spread')?.nextElementSibling || h.nextElementSibling;
        const first = next?.firstElementChild?.matches('li, .check, .opt') ? next.firstElementChild : next;
        if (first) { const [a] = rect(h); const [, b] = rect(first); atoms.push([a - 30, Math.min(b, a + 160)]); }
      }
      const blocks = [...el.querySelectorAll('.guide-hero, .gsec')].map(rect);
      const candidates = [...new Set([...atoms, ...blocks].flatMap(([a, b]) => [a - 8, b + 2]).map(Math.round))];
      breaks = candidates
        .filter((y) => y > 0 && !atoms.some(([a, b]) => y > a + 1 && y < b - 1))
        .map((y) => y * SCALE)
        .sort((a, b) => a - b);
    },
  });

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const footer = 26;
  const usableW = pageW - margin * 2;
  const pxPerPt = canvas.width / usableW;
  const sliceMax = Math.floor((pageH - margin - footer) * pxPerPt);

  // Choose page cuts: the latest safe break that fits, otherwise a hard cut.
  const cuts = [0];
  while (cuts[cuts.length - 1] + sliceMax < canvas.height) {
    const from = cuts[cuts.length - 1];
    const limit = from + sliceMax;
    const ok = breaks.filter((b) => b > from + sliceMax * 0.35 && b <= limit);
    cuts.push(ok.length ? ok[ok.length - 1] : limit);
  }
  cuts.push(canvas.height);

  const pages = cuts.length - 1;
  for (let i = 0; i < pages; i++) {
    const y0 = cuts[i];
    const h = cuts[i + 1] - y0;
    const part = document.createElement('canvas');
    part.width = canvas.width;
    part.height = h;
    const ctx = part.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, part.width, h);
    ctx.drawImage(canvas, 0, y0, canvas.width, h, 0, 0, canvas.width, h);
    if (i > 0) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.86), 'JPEG', margin, margin, usableW, h / pxPerPt, undefined, 'FAST');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(120);
    pdf.text('Indicative information only. Your coordinator confirms dates, pricing and vendors in your proposal and contract.', margin, pageH - 14);
    pdf.text(`Fitler Club · ${i + 1} / ${pages}`, pageW - margin, pageH - 14, { align: 'right' });
  }
  pdf.setProperties({ title: `Fitler Club · ${title}`, author: 'Fitler Club Events', subject: 'Event planning guide' });
  return pdf;
}

export const pdfFilename = (title) => `fitler-club-${String(title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'event'}-guide.pdf`;

export function pdfToBase64(pdf) {
  return pdf.output('datauristring').split(',')[1];
}
