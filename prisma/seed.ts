import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();

async function main() {
  const clave = process.env.CLAVE_ADMIN ?? "cambiala-ya-123";
  await db.usuario.upsert({
    where: { usuario: "admin" },
    update: {},
    create: { usuario: "admin", nombre: "Administración", rol: "ADMIN", hash: await bcrypt.hash(clave, 12) },
  });
  console.log("Usuario admin listo. Contraseña:", clave, "- cambiala apenas entres.");
}
main().finally(() => db.$disconnect());
