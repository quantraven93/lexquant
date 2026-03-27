import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string
): Promise<boolean> {
  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: `"LexQuant" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html: htmlBody,
    });
    return true;
  } catch (error) {
    console.error("[Email] Send failed:", error);
    return false;
  }
}

export function formatCaseUpdateEmail(
  caseTitle: string,
  updateType: string,
  oldValue: string | null,
  newValue: string,
  courtName?: string
): string {
  const typeLabel = updateType.replace(/_/g, " ").toUpperCase();

  return `<!DOCTYPE html>
<html>
<body style="font-family: 'Consolas', 'SF Mono', 'Fira Code', monospace; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0e17; color: #e8eaed;">
  <div style="background: #0c1018; border-bottom: 2px solid #FFA028; padding: 16px 20px;">
    <div style="font-size: 11px; font-weight: 700; color: #FFA028; letter-spacing: 2px; text-transform: uppercase;">LEXQUANT</div>
    <div style="font-size: 14px; font-weight: 600; color: #e8eaed; margin-top: 6px;">CASE UPDATE: ${typeLabel}</div>
  </div>
  <div style="background: #0f1318; border: 1px solid #1a2030; border-top: none; padding: 20px;">
    <p style="margin: 8px 0; font-size: 13px;"><span style="color: #6b7685; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">CASE</span><br/><strong style="color: #e8eaed;">${caseTitle}</strong></p>
    ${courtName ? `<p style="margin: 8px 0; font-size: 13px;"><span style="color: #6b7685; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">COURT</span><br/><strong style="color: #e8eaed;">${courtName}</strong></p>` : ""}
    ${oldValue ? `<p style="margin: 8px 0; font-size: 13px;"><span style="color: #6b7685; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">PREVIOUS</span><br/><span style="color: #ff3b3b;">${oldValue}</span></p>` : ""}
    <p style="margin: 8px 0; font-size: 13px;"><span style="color: #6b7685; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">CURRENT</span><br/><span style="color: #00d26a; font-weight: 600;">${newValue}</span></p>
    <hr style="border: none; border-top: 1px solid #1a2030; margin: 16px 0;">
    <p style="color: #6b7685; font-size: 10px; letter-spacing: 1px; text-transform: uppercase;">LexQuant — Indian Court Case Intelligence Terminal</p>
  </div>
</body>
</html>`;
}
