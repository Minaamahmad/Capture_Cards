"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useSocket } from "@/Context/contextapi.js";

const cardRankLabel = (rank) => (rank === "10" ? "10" : rank);
const isRed = (suit) => suit === "♥" || suit === "♦";

function Card({
  card,
  faceDown = false,
  className = "",
  onClick,
  isSelected = false,
  isInteractive = false,
  style,
  liftZ = 0,
  restRotateX = 6,
}) {
  const flipTransform = faceDown ? "rotateY(180deg)" : "rotateY(0deg)";
  const poseTransform = isSelected
    ? `translateZ(${44 + liftZ}px) translateY(-24px) rotateX(0deg)` // /// newly added: adjusted translateY for better 3D pop
    : `translateZ(${liftZ}px) rotateX(${restRotateX}deg)`;

  return (
    <div
      onClick={onClick}
      style={{ perspective: "900px", ...style }}
      className={[
        "relative w-14 h-20 select-none",
        isInteractive ? "cursor-pointer card-3d-interactive" : "",
        className,
      ].join(" ")}
    >
      <div
        className="card-3d-pose"
        style={{ transform: poseTransform }}
      >
        <div
          className="card-3d-flip"
          style={{ transform: flipTransform }}
        >
          {/* Back face */}
          <div
            className={[
              "card-3d-face rounded-lg border shadow-[0_6px_18px_rgba(0,0,0,0.5)]",
              isSelected
                ? "border-[#c9a227] ring-2 ring-[#c9a227]/60 shadow-[0_0_16px_rgba(201,162,39,0.35)]"
                : "border-[#c9a227]/30",
            ].join(" ")}
            style={{ transform: "rotateY(180deg)" }}
          >
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-[#0f4a34] to-[#062318] flex items-center justify-center">
              <div className="absolute inset-1 rounded-md border border-[#c9a227]/40" />
              <span className="text-[10px] font-bold tracking-widest text-[#c9a227]/70">C</span>
            </div>
          </div>

          {/* Front face */}
          <div
            className={[
              "card-3d-face rounded-lg border shadow-[0_6px_18px_rgba(0,0,0,0.5)] font-serif overflow-hidden",
              isSelected
                ? "border-[#c9a227] ring-2 ring-[#c9a227]/60 shadow-[0_0_16px_rgba(201,162,39,0.35)]"
                : "border-[#c9a227]/30",
            ].join(" ")}
          >
            <div className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#fbf6e8] to-[#efe4c4]">
              <div className="flex flex-col h-full items-center justify-center">
                <span className={`text-sm font-black leading-none ${isRed(card?.suit) ? "text-[#a3312c]" : "text-[#1a1a1a]"}`}>
                  {cardRankLabel(card?.rank)}
                </span>
                <span className={`text-xs mt-1 ${isRed(card?.suit) ? "text-[#a3312c]" : "text-[#1a1a1a]"}`}>
                  {card?.suit}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const Startgame = () => {
  const socket = useSocket();
  const router = useRouter();
  const [gameState, setGameState] = useState(null);
  const [selectedCardId, setSelectedCardId] = useState(null);

  useEffect(() => {
    if (!socket) return undefined;

    const syncRoom = () => socket.emit("room:sync", (payload) => {
      if (!payload?.success || !payload.started) {
        router.replace("/GameArea/Waiting");
        return;
      }

      if (payload.gameState) {
        setGameState(payload.gameState);
      } else {
        router.replace("/GameArea/Waiting");
      }
    });

    const handleJoinSuccess = (payload) => {
      if (payload?.success) syncRoom();
    };

    socket.on("join-success", handleJoinSuccess);

    const roomCode = localStorage.getItem("cassino-room-code");
    let reconnectToken = localStorage.getItem("cassino-reconnect-token");
    if (!reconnectToken) {
      reconnectToken = crypto.randomUUID();
      localStorage.setItem("cassino-reconnect-token", reconnectToken);
    }
    const rejoinRoom = () => {
      if (roomCode) {
        socket.emit("roomid", { roomcode: roomCode, reconnectToken });
      } else {
        syncRoom();
      }
    };

    if (socket.connected) rejoinRoom();
    else socket.once("connect", rejoinRoom);

    const handleGameState = (state) => {
      setGameState(state);
    };

    socket.on("game_state", handleGameState);

    return () => {
      socket.off("join-success", handleJoinSuccess);
      socket.off("connect", rejoinRoom);
      socket.off("game_state", handleGameState);
    };
  }, [router, socket]);

  const currentPlayerId = gameState?.players?.[gameState?.turnIndex] ?? null;
  const myId = socket?.id ?? null;
  const isMyTurn = currentPlayerId === myId;
  const myHand = useMemo(
    () => gameState?.hands?.[myId] ?? [],
    [gameState, myId]
  );
  const selectedCard = useMemo(
    () => myHand.find((c) => c.id === selectedCardId) ?? null,
    [myHand, selectedCardId]
  );

  // Reset selection whenever active turn changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setSelectedCardId(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [gameState?.turnIndex, currentPlayerId]);

  const roomScore = useMemo(() => {
    if (!gameState?.captureStacks) return {};
    return Object.entries(gameState.captureStacks).reduce((acc, [playerId, stack]) => {
      acc[playerId] = (stack || []).reduce((total, card) => total + (card.points ?? 0), 0);
      return acc;
    }, {});
  }, [gameState]);

  const drawFromDeck = () => {
    if (!socket || !gameState) return;

    socket.emit("game:draw", (response) => {
      if (!response?.success) {
        console.warn(response?.error || "Draw failed");
      }
    });
  };

  const throwCard = (cardId) => {
    if (!socket || !gameState || !cardId) return;

    socket.emit("game:throw", cardId, (response) => {
      if (response?.success) {
        setSelectedCardId(null);
      } else {
        console.warn(response?.error || "Throw failed");
      }
    });
  };

  const captureCard = (cardId) => {
    if (!socket || !gameState || !cardId) return;

    socket.emit("game:capture", cardId, (response) => {
      if (response?.success) {
        setSelectedCardId(null);
      } else {
        console.warn(response?.error || "Capture failed");
      }
    });
  };

  const stealCard = (cardId, targetPlayerId) => {
    if (!socket || !gameState || !cardId) return;

    socket.emit("game:steal", cardId, targetPlayerId, (response) => {
      if (response?.success) {
        setSelectedCardId(null);
      } else {
        console.warn(response?.error || "Steal failed");
      }
    });
  };

  const handleHandCardClick = (cardId) => {
    if (!isMyTurn) return;
    setSelectedCardId((prev) => (prev === cardId ? null : cardId));
  };

  const handleTableAreaClick = () => {
    if (selectedCardId && isMyTurn) {
      throwCard(selectedCardId);
    }
  };

  const handleTableCardClick = (e) => {
    e.stopPropagation();
    if (!selectedCardId || !isMyTurn) return;
    captureCard(selectedCardId);
  };

  const handleStackClick = (e, targetPlayerId) => {
    e.stopPropagation();
    if (!selectedCardId || !isMyTurn || targetPlayerId === myId) return;
    stealCard(selectedCardId, targetPlayerId);
  };

  // fan geometry for the first-person hand — now with 3D depth (rotateY + translateZ)
  const fanTransform = (idx, total) => {
    const mid = (total - 1) / 2;
    const offset = idx - mid;
    const rotZ = offset * 9;
    const rotY = offset * 6;
    const x = offset * 34;
    const y = Math.abs(offset) * 10;
    const z = -Math.abs(offset) * 14;
    return {
      transform: `translateX(${x}px) translateY(${y}px) translateZ(${z}px) rotateZ(${rotZ}deg) rotateY(${rotY}deg)`,
      transformOrigin: "bottom center",
    };
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#07120d] font-serif text-[#e8d9a0]">
      <style jsx global>{`
        .card-3d-pose {
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .card-3d-flip {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .card-3d-face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .card-3d-interactive:hover .card-3d-pose {
          transform: translateZ(25px) rotateX(0deg) !important;
        }
        .table-3d-perspective {
          perspective: 2000px; /// newly added: increased perspective for deeper 3D effect
        }
        .table-3d-plane {
          transform-style: preserve-3d;
          transform: rotateX(25deg); /// newly added: steeper tilt for 3D table feel
        }
        /// newly added: 3D Felt Table Effect
        .table-rim {
          box-shadow: 0 20px 50px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,0,0,0.5);
          border: 12px solid #2a1a0a;
        }
        .hand-3d-perspective {
          perspective: 1100px;
        }
        .hand-3d-plane {
          transform-style: preserve-3d;
        }
        .stack-3d-perspective {
          perspective: 800px;
        }
      `}</style>

      {/* felt backdrop + vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 15%, rgba(15,74,52,0.55) 0%, rgba(7,18,13,1) 72%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: "inset 0 0 180px 70px rgba(0,0,0,0.75)" }}
      />

      <div className="relative max-w-7xl mx-auto p-6 z-10">
        {/* /// newly added: Adjusted Header for clean 3D space */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-[0.4em] text-[#e8d9a0] drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]">
              Cassino
            </h1>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#c9a227]/50 font-sans mt-1">
              {gameState ? `Table · ${gameState.roomId || "In Game"}` : "Waiting for room"}
            </div>
          </div>
          
          {/* /// newly added: 3D Deck Mockup to replace simple button */}
          <div className="relative group" onClick={drawFromDeck}>
             <div className="absolute -inset-2 bg-[#c9a227]/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
             <button
              className="relative rounded-lg border-2 border-[#c9a227]/60 bg-gradient-to-br from-[#0f4a34] to-[#062318] w-16 h-24 shadow-[0_10px_20px_rgba(0,0,0,0.5)] transform hover:-translate-y-2 transition-transform disabled:opacity-50 flex items-center justify-center overflow-hidden"
              disabled={!gameState || !isMyTurn || myHand.length >= 5}
            >
              <div className="absolute inset-1 border border-[#c9a227]/20 rounded" />
              <span className="text-[9px] font-bold uppercase tracking-tighter text-[#c9a227] leading-none text-center">
                Draw<br/>Card
              </span>
              {/* Stacked effect */}
              <div className="absolute right-0 top-0 bottom-0 w-1 bg-[#c9a227]/30 border-l border-black/50" />
            </button>
          </div>
        </div>

        {!gameState ? (
          <div className="rounded-2xl border border-[#c9a227]/20 p-10 text-[#e8d9a0]/40 text-center font-sans text-sm tracking-widest uppercase">
            Waiting for game state...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Players Status Header */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {gameState.players?.map((playerId) => (
                <div
                  key={playerId}
                  className={`rounded-xl border p-3 transition-all ${
                    currentPlayerId === playerId
                      ? "border-[#c9a227]/70 bg-[#c9a227]/[0.06] shadow-[0_0_20px_rgba(201,162,39,0.08)] scale-105"
                      : "border-[#c9a227]/15 bg-black/20 opacity-80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#e8d9a0]/60 font-sans truncate">
                      {playerId === myId ? `YOU` : `P: ${playerId.slice(0,4)}`}
                    </span>
                    {currentPlayerId === playerId && (
                      <div className="w-2 h-2 rounded-full bg-[#c9a227] animate-pulse" />
                    )}
                  </div>
                  <div className="mt-1 flex gap-2 items-baseline">
                    <span className="text-lg font-black text-[#e8d9a0]">{roomScore[playerId] ?? 0}</span>
                    <span className="text-[8px] text-[#e8d9a0]/40 font-sans uppercase">Points</span>
                  </div>
                </div>
              ))}
            </section>

            {/* /// newly added: 3D Table Container with Rim and Felt texture */}
            <section className="table-3d-perspective py-8">
              <div
                onClick={handleTableAreaClick}
                className={`table-3d-plane table-rim relative mx-auto max-w-5xl min-h-[400px] rounded-[50%] transition-all p-12 overflow-hidden ${
                  selectedCardId && isMyTurn
                    ? "bg-[#11402e] cursor-pointer ring-4 ring-[#c9a227]/30"
                    : "bg-gradient-to-b from-[#134e35] to-[#0a2b1d]"
                }`}
              >
                {/* /// newly added: Table texture pattern */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '24px 24px'}} />
                
                <div className="relative z-10 flex flex-wrap gap-6 justify-center items-center min-h-[300px]">
                  <AnimatePresence>
                    {(gameState.table ?? []).map((card, tIdx) => {
                      const isMatchingRank = selectedCard && selectedCard.rank === card.rank;
                      return (
                        <motion.div
                          layout
                          key={card.id}
                          initial={{ opacity: 0, scale: 0.5, z: 100 }}
                          animate={{ opacity: 1, scale: 1, z: 0 }}
                          exit={{ opacity: 0, scale: 0.2, y: -100 }}
                          transition={{ type: "spring", stiffness: 200, damping: 20 }}
                          onClick={handleTableCardClick}
                        >
                          <Card
                            card={card}
                            isInteractive={Boolean(selectedCardId && isMyTurn)}
                            isSelected={Boolean(isMatchingRank && isMyTurn)}
                            liftZ={(tIdx % 3) * 2}
                            restRotateX={0} // /// newly added: lying flat on table
                          />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {selectedCardId && isMyTurn && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="border-4 border-dashed border-[#c9a227]/20 rounded-xl w-20 h-28 flex items-center justify-center text-[#c9a227]/40 text-xs font-black uppercase tracking-widest text-center p-2 font-sans"
                    >
                      Play Card
                    </motion.div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-20">
              {/* Your Hand — first-person 3D fan */}
              <section className="bg-transparent p-2">
                <div className="text-center mb-6">
                  <span className="text-[10px] uppercase tracking-[0.5em] text-[#c9a227] font-bold">Your Hand</span>
                </div>

                <div className="hand-3d-perspective relative flex justify-center min-h-[10rem]">
                  <div className="hand-3d-plane relative w-full flex justify-center">
                    <AnimatePresence mode="popLayout">
                      {(myHand || []).map((card, idx) => {
                        const fan = fanTransform(idx, myHand.length);
                        const selected = selectedCardId === card.id;
                        return (
                          <motion.div
                            layout
                            key={card.id}
                            initial={{ opacity: 0, y: 100, rotateX: 45 }}
                            animate={{ opacity: 1, y: 0, rotateX: 0 }}
                            exit={{ opacity: 0, scale: 0 }}
                            className="absolute bottom-0"
                            style={fan}
                          >
                            <Card
                              card={card}
                              isInteractive={isMyTurn}
                              isSelected={selected}
                              onClick={() => handleHandCardClick(card.id)}
                              restRotateX={15}
                            />
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              </section>

              {/* Capture Stacks — piled up in 3D */}
              <section className="rounded-[2rem] border border-[#c9a227]/10 bg-black/40 p-6 shadow-2xl">
                <div className="text-[10px] uppercase tracking-[0.35em] text-[#c9a227]/50 font-sans mb-4">Capture Stacks</div>
                <div className="grid grid-cols-2 gap-4">
                  {(gameState.players ?? []).map((playerId) => {
                    const stack = gameState.captureStacks?.[playerId] ?? [];
                    const topCard = stack[stack.length - 1];
                    const canSteal =
                      selectedCard &&
                      topCard &&
                      selectedCard.rank === topCard.rank &&
                      playerId !== myId;

                    return (
                      <div
                        key={playerId}
                        onClick={(e) => handleStackClick(e, playerId)}
                        className={`rounded-xl border p-3 transition-all ${
                          canSteal && isMyTurn
                            ? "border-[#c9784f] bg-[#c9784f]/10 cursor-pointer scale-105 shadow-[0_0_15px_rgba(201,120,79,0.3)]"
                            : "border-[#c9a227]/5 bg-black/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <span className="text-[8px] font-bold uppercase tracking-tighter text-[#e8d9a0]/50 font-sans truncate">
                            {playerId === myId ? `Your Stack` : `P:${playerId.slice(0,4)}`}
                          </span>
                          <span className="text-[8px] text-[#c9a227] font-bold">{stack.length}</span>
                        </div>
                        <div className="stack-3d-perspective flex justify-center min-h-[60px]">
                          {stack.length > 0 ? (
                            <div className="relative">
                               {stack.slice(-3).map((stackCard, idx) => (
                                <div
                                  key={`${playerId}-${stackCard.id}-${idx}`}
                                  className="absolute top-0 left-1/2 -translate-x-1/2"
                                  style={{
                                    transformStyle: "preserve-3d",
                                    transform: `translateZ(${idx * 5}px) translateY(${-idx * 2}px) rotateZ(${idx * 2}deg)`,
                                  }}
                                >
                                  <Card card={stackCard} className="w-10 h-14 text-[9px]" restRotateX={0} />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="w-10 h-14 rounded border border-dashed border-white/5 flex items-center justify-center text-[8px] text-white/5 uppercase">Empty</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default Startgame;