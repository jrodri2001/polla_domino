export interface Player {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface Tournament {
  id: string;
  name: string;
  table_count: number;
  status: "setup" | "active" | "completed";
  created_at: string;
}

export interface Round {
  id: string;
  tournament_id: string;
  round_number: number;
}

export interface Game {
  id: string;
  round_id: string;
  table_number: number;
  team1_player1: string;
  team1_player2: string;
  team2_player1: string;
  team2_player2: string;
  team1_score: number | null;
  team2_score: number | null;
  status: "pending" | "in_progress" | "completed";
}

export interface Bye {
  round_id: string;
  player_id: string;
}

export interface RoundWithGames extends Round {
  games: Game[];
  byes: Bye[];
}

export interface LeaderboardEntry {
  player: Player;
  wins: number;
  losses: number;
  gamesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
  differential: number;
}
