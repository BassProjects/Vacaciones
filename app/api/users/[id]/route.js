import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function PATCH(req, { params }) {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { name, email, department, role, allowanceOverride, active, birthDate } = body;

  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  const current = rows[0];
  if (!current) {
    return NextResponse.json({ error: "Trabajador no encontrado" }, { status: 404 });
  }
  if (role !== undefined && !["worker", "manager", "admin"].includes(role)) {
    return NextResponse.json({ error: "Rol no válido" }, { status: 400 });
  }
  if (birthDate !== undefined && birthDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return NextResponse.json({ error: "Fecha de nacimiento no válida" }, { status: 400 });
  }

  const next = {
    name: name !== undefined && name !== "" ? name : current.name,
    email: email !== undefined ? email || null : current.email,
    department: department !== undefined ? department || null : current.department,
    role: role !== undefined ? role : current.role,
    allowance_override:
      allowanceOverride !== undefined
        ? allowanceOverride === "" || allowanceOverride == null
          ? null
          : Number(allowanceOverride)
        : current.allowance_override,
    active: active !== undefined ? !!active : current.active,
    birth_date: birthDate !== undefined ? birthDate || null : current.birth_date,
  };

  await pool.query(
    `UPDATE users SET name=$1, email=$2, department=$3, role=$4, allowance_override=$5, active=$6, birth_date=$7
     WHERE id=$8`,
    [
      next.name,
      next.email,
      next.department,
      next.role,
      next.allowance_override,
      next.active,
      next.birth_date,
      id,
    ]
  );

  return NextResponse.json({ ok: true });
}
