export async function sendMail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return { skipped: true };

  const from = process.env.MAIL_FROM || "Electropolis Vacaciones <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Error enviando email:", res.status, text);
      return { skipped: false, ok: false };
    }
    return { skipped: false, ok: true };
  } catch (err) {
    console.error("Error enviando email:", err);
    return { skipped: false, ok: false };
  }
}
