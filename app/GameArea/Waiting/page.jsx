"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/Context/contextapi.js";

const SEATS = [
  { key: "Player-1", suit: "♠", label: "Player-1", pos: { top: "-8%", left: "50%", transform: "translateX(-50%)" } },
  { key: "Player-2", suit: "♥", label: "Player-2", pos: { top: "50%", right: "-2%", transform: "translateY(-50%)" } },
  { key: "Player-3", suit: "♦", label: "Player-3", pos: { bottom: "-8%", left: "50%", transform: "translateX(-50%)" } },
  { key: "Player-4", suit: "♣", label: "Player-4", pos: { top: "50%", left: "-2%", transform: "translateY(-50%)" } },
];

function Seat({ seat, player }) {
  const filled = Boolean(player);
  return (
    <div className="absolute flex flex-col items-center gap-2" style={seat.pos}>
      <span className="text-[10px] tracking-[0.3em] uppercase text-[#C9A227AA] font-mono">
        {seat.label}
      </span>
      <AnimatePresence mode="wait">
        <motion.div
          key={filled ? `${seat.key}-filled` : `${seat.key}-empty`}
          initial={{ opacity: 0, rotateY: -70, scale: 0.85 }}
          animate={{ opacity: 1, rotateY: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformStyle: "preserve-3d", perspective: 600 }}
          className="w-[86px] h-[118px] rounded-lg border-2 relative overflow-hidden shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
        >
          {filled ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 relative bg-[#F3EFE3] border-[#C9A227]">
              <span className="absolute top-1.5 left-2 text-xs font-semibold text-[#B23A48] font-mono">
                {seat.suit}
              </span>
              <span className="text-2xl font-semibold text-[#171412]" style={{ fontFamily: "Georgia, serif" }}>
                {player.charAt(0).toUpperCase()}
              </span>
              <span className="text-[10px] px-2 text-center leading-tight text-[#171412CC]">
                {player}
              </span>
              <span className="absolute bottom-1.5 right-2 text-xs font-semibold text-[#B23A48] font-mono rotate-180">
                {seat.suit}
              </span>
            </div>
          ) : (
            <div
              className="w-full h-full flex items-center justify-center border-[#C9A22766]"
              style={{
                background:
                  "repeating-linear-gradient(45deg, #0B3D2E 0px, #0B3D2E 6px, #0A3327 6px, #0A3327 12px)",
              }}
            >
              <span className="text-2xl opacity-40 text-[#C9A227]" style={{ fontFamily: "Georgia, serif" }}>
                {seat.suit}
              </span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const WaitingPage = () => {
  const socket = useSocket();
  const router = useRouter();
  const [players, setPlayers] = useState([]);
  const [roomCode, setRoomCode] = useState(null);
  const [status, setStatus] = useState("Waiting for players");

  useEffect(() => {
    if (!socket) return undefined;

    socket.emit("room:sync", (payload) => {
      if (payload?.success) {
        setRoomCode(payload.roomId ?? null);
        setPlayers(payload.players ?? []);
        setStatus(payload.started ? "Game started" : "Waiting for players");

        if (payload.started) {
          router.replace("/GameArea/StartGame");
        }
      }
    });

    const handleRoomData = (roomPlayers) => {
      setPlayers(roomPlayers || []);
    };

    const handleJoinSuccess = (payload) => {
      if (payload?.success && payload.roomcode) {
        setRoomCode(payload.roomcode);
        localStorage.setItem("cassino-room-code", String(payload.roomcode));
      }
    };

    const handleWaiting = (payload) => {
      if (payload?.message) {
        setStatus(payload.message);
      }
    };

    const handleGameStart = (payload) => {
      if (payload?.message) {
        setStatus(payload.message);
      }

      router.replace("/GameArea/StartGame");
    };

    socket.on("roomdata", handleRoomData);
    socket.on("join-success", handleJoinSuccess);
    socket.on("waiting", handleWaiting);
    socket.on("game_start", handleGameStart);

    return () => {
      socket.off("roomdata", handleRoomData);
      socket.off("join-success", handleJoinSuccess);
      socket.off("waiting", handleWaiting);
      socket.off("game_start", handleGameStart);
    };
  }, [router, socket]);

  const filledCount = players.length;

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{
        background: "radial-gradient(ellipse at 50% 30%, #0d2e22 0%, #061a12 70%, #030f0a 100%)",
      }}
    >
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <div className="text-[11px] tracking-[0.34em] uppercase mb-2 text-[#C9A227] font-mono">
               Lobby
            </div>
            <h1
              className="text-4xl sm:text-5xl font-semibold text-[#F3EFE3]"
              style={{ fontFamily: "Georgia, serif" }}
            >
              Taking your <em className="text-[#C9A227] not-italic italic">seats</em>
            </h1>
          </div>
          <div className="rounded-md border px-4 py-2 text-center shrink-0 border-[#C9A22788] bg-black/20">
            <div className="text-[9px] tracking-[0.28em] uppercase mb-0.5 text-[#C9A227AA] font-mono">
              Table
            </div>
            <div className="text-lg tracking-widest text-[#F3EFE3] font-mono">
              {roomCode ?? "----"}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="relative mx-auto" style={{ width: "min(100%, 460px)", aspectRatio: "16 / 11" }}>
          <div
            className="absolute inset-[10%] rounded-[50%] border-[3px] border-[#C9A227]"
            style={{
              background: "radial-gradient(ellipse at 50% 40%, #0f4331 0%, #0B3D2E 55%, #072a1e 100%)",
              boxShadow: "inset 0 0 40px rgba(0,0,0,0.5), 0 0 30px rgba(201,162,39,0.15)",
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#F3EFE3AA] font-mono">
                {status}
              </div>
              <div className="flex items-center justify-center gap-2.5 mt-2">
                {SEATS.map((s, i) => (
                  <span
                    key={s.key}
                    className="text-base transition-colors duration-300"
                    style={{ color: i < filledCount ? "#C9A227" : "#F3EFE333", fontFamily: "Georgia, serif" }}
                  >
                    {s.suit}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {SEATS.map((seat, i) => (
            <Seat key={seat.key} seat={seat} player={players[i]}  />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-14 flex items-center justify-between gap-4">
          <p className="text-xl leading-relaxed max-w-xs text-[#F3EFE388]">
            A hand can only be dealt once all four seats are occupied.
          </p>
         
        </div>
      </div>
    </div>
  );
};

export default WaitingPage;