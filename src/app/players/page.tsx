"use client";

import { useEffect, useState, useCallback } from "react";
import {
  deactivatePlayer,
  reactivatePlayer,
  deletePlayer,
  getRegisteredUsers,
} from "@/lib/actions";
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
  const [userToDelete, setUserToDelete] = useState<RegisteredUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await getRegisteredUsers();
      setUserRole(res.currentUserRole as UserRole);
      setUsers(res.users);
    } catch {
      setDbError("No se pudieron cargar los usuarios.");
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleDeactivate(playerId: string) {
    if (loadingId) return;
    if (
      !confirm(
        "¿Deseas desactivar a este usuario? Pasará a la lista de inactivos y no aparecerá en la tabla de la liga."
      )
    ) {
      return;
    }
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

  async function confirmDeleteUser() {
    if (!userToDelete || deleting) return;
    setDeleting(true);
    const res = await deletePlayer(userToDelete.id);
    if (res.error) {
      alert(res.error);
      setDeleting(false);
    } else {
      setUserToDelete(null);
      setDeleting(false);
      await fetchUsers();
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
          Los jugadores se registran creando una cuenta. Aquí puedes ver y administrar todos
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
                  <td className="whitespace-nowrap px-3 py-3 font-medium sm:px-4">
                    {u.name}
                  </td>
                  <td className="px-3 py-3 text-muted sm:px-4">{u.email}</td>
                  <td className="px-3 py-3 sm:px-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        roleColor[u.role] ?? "text-muted"
                      }`}
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeactivate(u.id)}
                            disabled={loadingId === u.id}
                            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
                            title="Desactivar usuario (se excluye de la liga)"
                          >
                            {loadingId === u.id ? "…" : "Desactivar"}
                          </button>
                          <button
                            onClick={() => setUserToDelete(u)}
                            disabled={loadingId === u.id}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
                            title="Eliminar permanentemente"
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {inactiveUsers.map((u) => (
                <tr key={u.id} className="opacity-60 hover:bg-surface-hover">
                  <td className="whitespace-nowrap px-3 py-3 font-medium sm:px-4">
                    {u.name}
                    <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                      Inactivo
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted sm:px-4">{u.email}</td>
                  <td className="px-3 py-3 sm:px-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        roleColor[u.role] ?? "text-muted"
                      }`}
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReactivate(u.id)}
                            disabled={loadingId === u.id}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
                          >
                            {loadingId === u.id ? "…" : "Reactivar"}
                          </button>
                          <button
                            onClick={() => setUserToDelete(u)}
                            disabled={loadingId === u.id}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modal for Permanent Deletion */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-danger">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-6 w-6 shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                  clipRule="evenodd"
                />
              </svg>
              <h3 className="text-lg font-bold">¿Eliminar usuario permanentemente?</h3>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              Estás a punto de eliminar a{" "}
              <strong className="text-foreground">{userToDelete.name}</strong> (
              {userToDelete.email}).
            </p>
            <p className="text-xs text-muted leading-relaxed">
              Esta acción no se puede deshacer. Se eliminarán su cuenta y credenciales.
              Si participó en partidas pasadas, su nombre se mostrará como &quot;[Eliminado]&quot;
              para no alterar las estadísticas de los demás jugadores.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={deleting}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                disabled={deleting}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Sí, Eliminar Usuario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
