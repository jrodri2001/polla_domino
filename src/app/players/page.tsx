import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RegisteredUser {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export default async function UsersPage() {
  let users: RegisteredUser[] = [];
  let dbError = "";

  try {
    const supabase = await createClient();

    // Query players that are linked to a profile (registered users)
    const { data, error } = await supabase
      .from("players")
      .select("id, name, email, created_at, profiles!player_id(role)")
      .not("profiles", "is", null)
      .order("name");

    if (error) dbError = error.message;

    users = (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      created_at: p.created_at,
      role: (p.profiles as unknown as { role: string }[])?.[0]?.role ?? "player",
    }));
  } catch {
    dbError = "No se pudo conectar a Supabase.";
  }

  const roleLabel: Record<string, string> = {
    admin: "Admin",
    player: "Jugador",
  };
  const roleColor: Record<string, string> = {
    admin: "bg-primary/20 text-primary",
    player: "bg-accent/20 text-accent",
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Usuarios Registrados</h1>
        <p className="text-sm text-muted">
          Los jugadores se registran creando una cuenta. Aquí puedes ver todos los usuarios del sistema.
        </p>
      </div>

      {dbError && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {dbError}
        </div>
      )}

      {users.length === 0 ? (
        <p className="text-muted">No hay usuarios registrados.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Registrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-muted">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColor[u.role] ?? "text-muted"}`}
                    >
                      {roleLabel[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(u.created_at).toLocaleDateString("es-VE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
