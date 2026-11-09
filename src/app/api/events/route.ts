import { NextRequest } from "next/server";
import { eventBus } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tournamentId = searchParams.get("tournamentId");

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(data: string) {
        controller.enqueue(encoder.encode(data));
      }

      // Initial connection established comment
      send(": connected\n\n");

      const onUpdate = () => {
        send(`data: ${JSON.stringify({ type: "update", tournamentId })}\n\n`);
      };

      const eventName = tournamentId ? `tournament:${tournamentId}` : "tournaments_all";
      eventBus.on(eventName, onUpdate);

      // Keep-alive heartbeat every 15s
      const interval = setInterval(() => {
        send(": ping\n\n");
      }, 15000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        eventBus.off(eventName, onUpdate);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
