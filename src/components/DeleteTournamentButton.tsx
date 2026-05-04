"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteTournament } from "@/lib/actions";

export default function DeleteTournamentButton({
  tournamentId,
  tournamentName,
}: {
  tournamentId: string;
  tournamentName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const res = await deleteTournament(tournamentId);
    if (res.error) {
      alert(res.error);
      setDeleting(false);
      setConfirming(false);
    } else {
      router.refresh();
    }
  }

  if (confirming) {
    return (
      <div
        className="flex items-center gap-2"
        onClick={(e) => e.preventDefault()}
      >
        <span className="text-xs text-danger">
          Eliminar &ldquo;{tournamentName}&rdquo;?
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded bg-danger px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {deleting ? "..." : "Sí"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded px-2 py-1 text-xs text-muted hover:text-foreground"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        setConfirming(true);
      }}
      className="rounded border border-border px-2 py-1 text-xs text-muted hover:border-danger hover:text-danger"
      title="Eliminar torneo"
    >
      Eliminar
    </button>
  );
}
