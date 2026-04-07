import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  LevelFormat,
  convertInchesToTwip,
  Packer,
} from 'docx';

function parseResumeToDocx(resumeText, contactLine) {
  const lines = resumeText.split('\n');
  const children = [];

  // Contact header
  if (contactLine) {
    const parts = contactLine.split('|').map((s) => s.trim());
    const name = parts[0] || 'Paul Butcher';
    const rest = parts.slice(1).join(' | ');

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: name, font: 'Arial', size: 28, bold: true })],
      })
    );
    if (rest) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: rest, font: 'Arial', size: 20 })],
        })
      );
    }
  }

  const sectionHeaderPattern = /^[A-Z][A-Z\s/&]+$/;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      children.push(new Paragraph({ spacing: { after: 80 } }));
      continue;
    }

    // Skip the contact line if it appears in the resume body
    if (trimmed.includes('Paul Butcher') && trimmed.includes('|')) {
      continue;
    }

    // Section headers (ALL CAPS lines)
    if (sectionHeaderPattern.test(trimmed) && trimmed.length > 2) {
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 120 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
          },
          children: [
            new TextRun({
              text: trimmed,
              font: 'Arial',
              size: 22,
              bold: true,
            }),
          ],
        })
      );
      continue;
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      children.push(
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: trimmed.slice(2),
              font: 'Arial',
              size: 21,
            }),
          ],
        })
      );
      continue;
    }

    // Role/company lines (heuristic: contains date patterns or titles)
    const isRoleLine =
      /\d{4}/.test(trimmed) &&
      (trimmed.includes('–') || trimmed.includes('-') || trimmed.includes('|'));
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: trimmed,
            font: 'Arial',
            size: 21,
            bold: isRoleLine,
          }),
        ],
      })
    );
  }

  return children;
}

export async function generateDocx(resumeText) {
  const contactLine =
    'Paul Butcher | Salt Lake City, UT | 216-903-5833 | hello@paulb.pro | paulb.pro | LinkedIn: /in/pabutcher';

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(0.5),
                    hanging: convertInchesToTwip(0.25),
                  },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.75),
            },
          },
        },
        children: parseResumeToDocx(resumeText, contactLine),
      },
    ],
  });

  return Packer.toBuffer(doc);
}
