"use client";

import {
  Gauge,
  LoaderCircle,
  Pause,
  RotateCcw,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConversationApiError } from "@/lib/conversation";
import type { TargetLanguage } from "@/lib/learner";
import { getCachedSpeechObjectUrl, synthesizeSpeech } from "@/lib/speech";

type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";

export function SpeechPlayback({
  text,
  language,
  accessToken,
  enabled,
  label = "Ouvir",
  onUpgrade,
}: {
  text: string;
  language: TargetLanguage;
  accessToken: string;
  enabled: boolean;
  label?: string;
  onUpgrade?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ownedObjectUrlRef = useRef<string | null>(null);
  const [state, setState] = useState<PlaybackState>("idle");
  const [speakingRate, setSpeakingRate] = useState<1 | 0.85>(1);
  const [errorMessage, setErrorMessage] = useState("");

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    // Shared cache owns object URLs; only revoke if this instance created an orphan.
    ownedObjectUrlRef.current = null;
  };

  useEffect(() => stopAudio, []);

  const playFromUrl = async (objectUrl: string) => {
    stopAudio();
    const audio = new Audio(objectUrl);
    audioRef.current = audio;
    audio.onended = () => setState("idle");
    audio.onpause = () => {
      if (!audio.ended) setState("paused");
    };
    audio.onplay = () => setState("playing");
    await audio.play();
  };

  const loadAndPlay = async (rate: 1 | 0.85) => {
    if (!enabled) {
      onUpgrade?.();
      return;
    }
    if (!text.trim() || !accessToken) return;

    setErrorMessage("");
    const localCached = getCachedSpeechObjectUrl(text, language, rate);
    if (localCached) {
      setState("loading");
      try {
        await playFromUrl(localCached);
      } catch {
        setState("error");
        setErrorMessage("Não foi possível reproduzir o áudio.");
      }
      return;
    }

    setState("loading");
    try {
      const { objectUrl } = await synthesizeSpeech(accessToken, {
        text,
        language,
        speakingRate: rate,
      });
      await playFromUrl(objectUrl);
    } catch (error) {
      stopAudio();
      setState("error");
      if (error instanceof ConversationApiError && error.status === 403 && onUpgrade) {
        setErrorMessage("Disponível no Premium.");
      } else {
        setErrorMessage(
          error instanceof ConversationApiError
            ? error.message
            : "Não foi possível reproduzir o áudio.",
        );
      }
    }
  };

  const togglePlayback = () => {
    if (state === "playing") {
      audioRef.current?.pause();
      setState("paused");
      return;
    }
    if (state === "paused" && audioRef.current) {
      void audioRef.current.play().then(() => setState("playing"));
      return;
    }
    void loadAndPlay(speakingRate);
  };

  const replay = () => {
    if (!enabled) {
      onUpgrade?.();
      return;
    }
    const localCached = getCachedSpeechObjectUrl(text, language, speakingRate);
    if (localCached && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().then(() => setState("playing"));
      return;
    }
    void loadAndPlay(speakingRate);
  };

  const toggleSpeed = () => {
    const nextRate = speakingRate === 1 ? 0.85 : 1;
    setSpeakingRate(nextRate);
    if (state === "playing" || state === "paused") {
      void loadAndPlay(nextRate);
    }
  };

  return (
    <div className="speech-playback">
      <button
        type="button"
        className={`speech-playback-main${state === "playing" ? " active" : ""}`}
        disabled={state === "loading" || !text.trim()}
        aria-label={state === "playing" ? "Pausar áudio" : label}
        title={enabled ? label : "Disponível no Premium"}
        onClick={togglePlayback}
      >
        {state === "loading" ? (
          <LoaderCircle aria-hidden="true" className="spin" />
        ) : state === "playing" ? (
          <Pause aria-hidden="true" />
        ) : (
          <Volume2 aria-hidden="true" />
        )}
        {state === "loading" ? "Gerando..." : state === "playing" ? "Pausar" : label}
      </button>
      {(state === "playing" || state === "paused" || state === "idle") && enabled && (
        <>
          <button
            type="button"
            className="speech-playback-secondary"
            aria-label="Repetir áudio"
            onClick={replay}
          >
            <RotateCcw aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`speech-playback-secondary${speakingRate === 0.85 ? " active" : ""}`}
            aria-label={speakingRate === 1 ? "Velocidade lenta" : "Velocidade normal"}
            onClick={toggleSpeed}
          >
            <Gauge aria-hidden="true" />
            <span>{speakingRate === 1 ? "Normal" : "Lenta"}</span>
          </button>
        </>
      )}
      {state === "error" && errorMessage && (
        <small className="speech-playback-error" role="alert">
          {errorMessage}
        </small>
      )}
    </div>
  );
}
