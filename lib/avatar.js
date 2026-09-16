import crypto from "crypto";

// Genera la URL de avatar de Gravatar a partir del correo del trabajador.
// d=404 hace que Gravatar devuelva un 404 si esa persona no tiene avatar
// registrado, para que el cliente pueda mostrar sus iniciales en su lugar
// sin depender de un identicon genérico.
export function gravatarUrl(email, size = 80) {
  if (!email) return null;
  const normalized = String(email).trim().toLowerCase();
  if (!normalized) return null;
  const hash = crypto.createHash("sha256").update(normalized).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}
