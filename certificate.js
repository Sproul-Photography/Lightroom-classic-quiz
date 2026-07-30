/* =============================================================================
   LIGHTROOM CLASSIC ASSESSMENT — CERTIFICATE GENERATOR
   -----------------------------------------------------------------------------
   Stamps the candidate name, score, date and signature onto the Canva
   certificate template.

   The template keeps its own text and artwork untouched, so the output is the
   real design rather than a reconstruction of it. Everything stays vector, so it
   prints sharply at any size.

   Assets expected alongside this file on the host:
     cert-template.pdf     the certificate with the name and score removed
     cert-name.ttf         Pinyon Script, matching the template's original name
     cert-body.ttf         Quattrocento Bold, matching the template's body text
     cert-sign.ttf         Mrs Saint Delafield, the signature
     pdf-lib.min.js        PDF writer
     fontkit.umd.min.js    font embedder, required by pdf-lib for custom fonts

   Everything is served from your own host rather than a CDN, so the certificate
   still works if a CDN is slow, blocked or down. None of it is fetched until
   somebody actually passes, so people who fail never pay the download.
   ============================================================================= */

const CERT = {
  template: 'cert-template.pdf',
  nameFont: 'cert-name.ttf',
  bodyFont: 'cert-body.ttf',
  signFont: 'cert-sign.ttf',
  pdfLib:   'pdf-lib.min.js',
  fontkit:  'fontkit.umd.min.js'
};

/* -----------------------------------------------------------------------------
   Layout constants, all in PDF points, measured from the template itself.
   Origin is bottom left. Change these only if the template is re-exported.
   -------------------------------------------------------------------------- */
const L = {
  pageW: 842.25,
  pageH: 595.5,

  nameCentreX: 421.10,   // centre of the navy rule beneath the name
  nameBaseline: 266.50,  // sits the script comfortably above that rule
  nameSize: 46,
  nameMinSize: 24,       // long names step down rather than overrun
  nameMaxWidth: 430,     // the navy rule is 440.8 wide, leave a little air

  bodyCentreX: 428.30,   // the template's body text is centred here, not on the page
  bodySize: 15.61,       // identical to the template's own body size

  // The score is set on the same line as "Sproul.Photography". The template's
  // own copy of that word is painted out first so the whole line can be
  // re-centred, otherwise adding the score would push it off centre.
  line2Baseline: 193.90,
  line2Gold: 'Sproul.Photography',
  cover: { x: 349, y: 187, w: 158, h: 21 },

  dateCentreX: 271.90,   // centre of the DATE COMPLETED rule
  dateBaseline: 150.00,
  dateSize: 10.39,

  sigText: 'M. Sproul',
  sigCentreX: 582.85,    // centre of the signature rule
  sigBaseline: 158.00,
  sigSize: 32            // sized so it sits within the rule and clears the score line
};

const INK       = { r: 0.06, g: 0.07, b: 0.09 };  // near black, matches the template
const INK_BODY  = { r: 0,    g: 0,    b: 0    };
const GOLD      = { r: 0.800, g: 0.596, b: 0.243 };  // sampled from the template

/* -------------------------------------------------------------------------- */

let _scriptCache = {};
function loadScript(url) {
  if (_scriptCache[url]) return _scriptCache[url];
  _scriptCache[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + url));
    document.head.appendChild(s);
  });
  return _scriptCache[url];
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' returned HTTP ' + res.status);
  return new Uint8Array(await res.arrayBuffer());
}

/* ==========================================================================
   generateCertificate — builds the PDF and hands the bytes back
   ========================================================================== */
async function generateCertificate({ firstName, lastName, percent, dateObj }) {
  await loadScript(CERT.pdfLib);
  await loadScript(CERT.fontkit);

  const { PDFDocument, rgb, degrees } = window.PDFLib;

  const [templateBytes, nameFontBytes, bodyFontBytes, signFontBytes] = await Promise.all([
    fetchBytes(CERT.template),
    fetchBytes(CERT.nameFont),
    fetchBytes(CERT.bodyFont),
    fetchBytes(CERT.signFont)
  ]);

  const pdf = await PDFDocument.load(templateBytes);
  pdf.registerFontkit(window.fontkit);

  const scriptFont = await pdf.embedFont(nameFontBytes, { subset: true });
  const bodyFont   = await pdf.embedFont(bodyFontBytes, { subset: true });
  const signFont   = await pdf.embedFont(signFontBytes, { subset: true });
  const page = pdf.getPages()[0];

  /* --- Candidate name, stepped down if it would run past the rule --------- */
  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();
  let nameSize = L.nameSize;
  while (nameSize > L.nameMinSize &&
         scriptFont.widthOfTextAtSize(fullName, nameSize) > L.nameMaxWidth) {
    nameSize -= 0.5;
  }
  const nameWidth = scriptFont.widthOfTextAtSize(fullName, nameSize);
  page.drawText(fullName, {
    x: L.nameCentreX - nameWidth / 2,
    y: L.nameBaseline,
    size: nameSize,
    font: scriptFont,
    color: rgb(INK.r, INK.g, INK.b)
  });

  /* --- Score, set on the same line as Sproul.Photography ------------------ */
  // Paint out the template's own "Sproul.Photography". The panel behind it is
  // pure white, so the patch is invisible.
  page.drawRectangle({
    x: L.cover.x, y: L.cover.y, width: L.cover.w, height: L.cover.h,
    color: rgb(1, 1, 1)
  });

  const tail = ` achieving a score of ${Math.round(percent)}%`;
  const goldWidth = bodyFont.widthOfTextAtSize(L.line2Gold, L.bodySize);
  const tailWidth = bodyFont.widthOfTextAtSize(tail, L.bodySize);
  const lineStart = L.bodyCentreX - (goldWidth + tailWidth) / 2;

  page.drawText(L.line2Gold, {
    x: lineStart,
    y: L.line2Baseline,
    size: L.bodySize,
    font: bodyFont,
    color: rgb(GOLD.r, GOLD.g, GOLD.b)
  });
  page.drawText(tail, {
    x: lineStart + goldWidth,
    y: L.line2Baseline,
    size: L.bodySize,
    font: bodyFont,
    color: rgb(INK_BODY.r, INK_BODY.g, INK_BODY.b)
  });

  /* --- Date, above the DATE COMPLETED rule -------------------------------- */
  const when = (dateObj || new Date()).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  const dateWidth = bodyFont.widthOfTextAtSize(when, L.dateSize);
  page.drawText(when, {
    x: L.dateCentreX - dateWidth / 2,
    y: L.dateBaseline,
    size: L.dateSize,
    font: bodyFont,
    color: rgb(INK.r, INK.g, INK.b)
  });

  /* --- Signature, above its own rule -------------------------------------- */
  const sigWidth = signFont.widthOfTextAtSize(L.sigText, L.sigSize);
  page.drawText(L.sigText, {
    x: L.sigCentreX - sigWidth / 2,
    y: L.sigBaseline,
    size: L.sigSize,
    font: signFont,
    color: rgb(INK.r, INK.g, INK.b)
  });

  pdf.setTitle('Lightroom Classic Assessment Certificate');
  pdf.setAuthor('Martin Sproul, Sproul Photography');
  pdf.setSubject(`Awarded to ${fullName} with a score of ${Math.round(percent)}%`);
  pdf.setCreator('sproul.photography');

  return { bytes: await pdf.save(), fullName };
}

/* Browser entry point, called from the results screen. */
async function downloadCertificate() {
  const btn = document.getElementById('certBtn');
  const original = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Preparing your certificate…'; }
  try {
    const { bytes, fullName } = await generateCertificate({
      firstName: candidateFirstName,
      lastName: candidateLastName,
      percent: lastPct
    });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fullName.replace(/\s+/g, '_')}_Lightroom_Classic_Certificate.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (err) {
    console.error('[Certificate]', err);
    alert('The certificate could not be created just now. Please try again, and do let me know at martin@sproul.photography if it keeps happening.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}
