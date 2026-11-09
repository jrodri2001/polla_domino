import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { Tournament } from "@/lib/types";
import DeleteTournamentButton from "@/components/DeleteTournamentButton";

export const dynamic = "force-dynamic";

interface TournamentWithPlayerCount extends Tournament {
  playerCount: number;
}

export default async function Home() {
  const session = await getSession();
  const isAdmin = session?.role === "admin";

  let tournaments: TournamentWithPlayerCount[] = [];
  try {
    if (isAdmin) {
      tournaments = db
        .prepare(`
          SELECT t.*,
            (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) as playerCount
          FROM tournaments t
          ORDER BY t.created_at DESC
        `)
        .all() as TournamentWithPlayerCount[];
    } else if (session?.playerId) {
      tournaments = db
        .prepare(`
          SELECT t.*,
            (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) as playerCount
          FROM tournaments t
          JOIN tournament_players me ON me.tournament_id = t.id
          WHERE me.player_id = ?
          ORDER BY t.created_at DESC
        `)
        .all(session.playerId) as TournamentWithPlayerCount[];
    }
  } catch (err) {
    console.error("Error loading tournaments:", err);
  }

  const statusLabel: Record<string, string> = {
    setup: "Configurando",
    active: "En Juego",
    completed: "Finalizado",
  };
  const statusColor: Record<string, string> = {
    setup: "bg-amber-500/20 text-amber-400",
    active: "bg-primary/20 text-primary",
    completed: "bg-muted/20 text-muted",
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">
          {isAdmin ? "Torneos de Dominó" : "Mis Torneos"}
        </h1>
        <p className="text-muted">
          {isAdmin
            ? "Genera emparejamientos justos, lleva el marcador en vivo y consulta la tabla de posiciones al instante."
            : "Consulta tus torneos activos y anteriores."}
        </p>
      </div>

      {isAdmin && (
        <div className="flex gap-3">
          <Link
            href="/admin"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-background hover:bg-primary-hover"
          >
            + Nuevo Torneo
          </Link>
          <Link
            href="/players"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
          >
            Usuarios
          </Link>
        </div>
      )}

      <TournamentSections
        tournaments={tournaments}
        statusLabel={statusLabel}
        statusColor={statusColor}
        isAdmin={isAdmin}
      />
    </div>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

function TournamentSections({
  tournaments,
  statusLabel,
  statusColor,
  isAdmin,
}: {
  tournaments: TournamentWithPlayerCount[];
  statusLabel: Record<string, string>;
  statusColor: Record<string, string>;
  isAdmin: boolean;
}) {
  const active = tournaments.filter((t) => t.status === "active");
  const setup = tournaments.filter((t) => t.status === "setup");
  const completed = tournaments.filter((t) => t.status === "completed");

  if (tournaments.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-12 text-center">
        <p className="text-lg text-muted">No hay torneos todavía.</p>
        <p className="mt-1 text-sm text-muted">
          Registra jugadores y crea tu primer torneo para comenzar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Active tournaments — highlighted */}
      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-primary">En Juego</h2>
          {active.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              statusLabel={statusLabel}
              statusColor={statusColor}
              isAdmin={isAdmin}
              highlight
            />
          ))}
        </section>
      )}

      {/* Setup tournaments */}
      {setup.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-amber-400">
            Configurando
          </h2>
          {setup.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              statusLabel={statusLabel}
              statusColor={statusColor}
              isAdmin={isAdmin}
            />
          ))}
        </section>
      )}

      {/* Past tournaments */}
      {completed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted">
            Torneos Anteriores
          </h2>
          {completed.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              statusLabel={statusLabel}
              statusColor={statusColor}
              isAdmin={isAdmin}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function TournamentCard({
  tournament: t,
  statusLabel,
  statusColor,
  isAdmin,
  highlight,
}: {
  tournament: TournamentWithPlayerCount;
  statusLabel: Record<string, string>;
  statusColor: Record<string, string>;
  isAdmin: boolean;
  highlight?: boolean;
}) {
  const href =
    t.status === "setup" && isAdmin
      ? `/admin/tournament/${t.id}`
      : `/leaderboard/${t.id}`;

  const canDelete = isAdmin;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-4 transition ${
        highlight
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-surface"
      }`}
    >
      <Link href={href} className="flex flex-1 items-center justify-between hover:opacity-80">
        <div>
          <h3 className="font-semibold">{t.name}</h3>
          <p className="text-sm text-muted">
            {t.playerCount} jugador{t.playerCount !== 1 ? "es" : ""} &middot;{" "}
            {t.table_count} mesa{t.table_count > 1 ? "s" : ""} &middot;{" "}
            {new Date(t.created_at).toLocaleDateString("es-VE")}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor[t.status]}`}
        >
          {statusLabel[t.status]}
        </span>
      </Link>
      {canDelete && (
        <DeleteTournamentButton
          tournamentId={t.id}
          tournamentName={t.name}
        />
      )}
    </div>
  );
}
