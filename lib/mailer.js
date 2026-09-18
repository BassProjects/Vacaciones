import nodemailer from "nodemailer";

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, html }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass || !to) return { skipped: true };

  const from = process.env.MAIL_FROM || `Sepiamary Vacaciones <${user}>`;

  try {
    await getTransporter().sendMail({ from, to, subject, html });
    return { skipped: false, ok: true };
  } catch (err) {
    console.error("Error enviando email:", err);
    return { skipped: false, ok: false };
  }
}
