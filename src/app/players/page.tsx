"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { deactivatePlayer, reactivatePlayer } from "@/lib/actions";
import type { UserRole } from "@/lib/auth";

interface RegisteredUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  created_at: string;
}

const roleLabel: Record<string, string> = {
  admin: "Admin",
  player: "Jugador",
};
const roleColor: Record<string, string> = {
  admin: "bg-primary/20 text-primary",
  player: "bg-accent/20 text-accent",
};

export default function UsersPage() {
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [dbError, setDbError] = useState("");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const supabase = createClient();

      // Check current user role
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: me } = await supabase
          .from("players")
          .select("role")
          .eq("auth_id", user.id)
          .single();
        setUserRole((me?.role as UserRole) ?? "player");
      }

      const { data, error } = await supabase
        .from("players")
        .select("id, name, email, active, role, created_at")
        .not("auth_id", "is", null)
        .order("name");

      if (error) {
        setDbError(error.message);
        return;
      }

      setUsers(
        (data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          active: p.active,
          created_at: p.created_at,
          role: p.role ?? "player",
        })),
      );
    } catch {
      setDbError("No se pudo conectar a Supabase.");
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleDeactivate(playerId: string) {
    if (loadingId) return;
    if (!confirm("¿Estás seguro de que deseas eliminar este usuario? Su historial se mantendrá.")) return;
    setLoadingId(playerId);
    const res = await deactivatePlayer(playerId);
    if (res.error) {
      setLoadingId(null);
      alert(res.error);
    } else {
      await fetchUsers();
      setLoadingId(null);
    }
  }

  async function handleReactivate(playerId: string) {
    if (loadingId) return;
    setLoadingId(playerId);
    const res = await reactivatePlayer(playerId);
    if (res.error) {
      setLoadingId(null);
      alert(res.error);
    } else {
      await fetchUsers();
      setLoadingId(null);
    }
  }

  const isAdmin = userRole === "admin";
  const activeUsers = users.filter((u) => u.active);
  const inactiveUsers = users.filter((u) => !u.active);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Usuarios Registrados</h1>
        <p className="text-sm text-muted">
          Los jugadores se registran creando una cuenta. Aquí puedes ver todos
          los usuarios del sistema.
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
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[500px] text-sm">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-3 py-3 font-medium sm:px-4">Nombre</th>
                <th className="px-3 py-3 font-medium sm:px-4">Email</th>
                <th className="px-3 py-3 font-medium sm:px-4">Rol</th>
                <th className="px-3 py-3 font-medium sm:px-4">Registrado</th>
                {isAdmin && (
                  <th className="px-3 py-3 font-medium sm:px-4">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activeUsers.map((u) => (
                <tr key={u.id} className="hover:bg-surface-hover">
                  <td className="whitespace-nowrap px-3 py-3 font-medium sm:px-4">{u.name}</td>
                  <td className="px-3 py-3 text-muted sm:px-4">{u.email}</td>
                  <td className="px-3 py-3 sm:px-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColor[u.role] ?? "text-muted"}`}
                    >
                      {roleLabel[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted sm:px-4">
                    {new Date(u.created_at).toLocaleDateString("es-VE")}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-3 sm:px-4">
                      {u.role !== "admin" && (
                        <button
                          onClick={() => handleDeactivate(u.id)}
                          disabled={loadingId === u.id}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
                        >
                          {loadingId === u.id ? "…" : "Eliminar"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {inactiveUsers.map((u) => (
                <tr key={u.id} className="opacity-50 hover:bg-surface-hover">
                  <td className="whitespace-nowrap px-3 py-3 font-medium sm:px-4">
                    {u.name}
                    <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                      Inactivo
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted sm:px-4">{u.email}</td>
                  <td className="px-3 py-3 sm:px-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColor[u.role] ?? "text-muted"}`}
                    >
                      {roleLabel[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted sm:px-4">
                    {new Date(u.created_at).toLocaleDateString("es-VE")}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-3 sm:px-4">
                      <button
                        onClick={() => handleReactivate(u.id)}
                        disabled={loadingId === u.id}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
                      >
                        {loadingId === u.id ? "…" : "Reactivar"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
