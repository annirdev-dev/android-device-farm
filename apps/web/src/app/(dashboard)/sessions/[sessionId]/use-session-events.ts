"use client";

import * as React from "react";
import { API_BASE_URL, api } from "@/lib/api-client";
import { SESSION_PROGRESS_LABELS, type SessionProgressEvent, type SessionProgressStep } from "@devicefarm/shared";

export function useSessionEvents(sessionId: string) {
  const [step, setStep] = React.useState<SessionProgressStep>("QUEUED");
  const [progressPercent, setProgressPercent] = React.useState(5);
  const [message, setMessage] = React.useState<string | undefined>();

  React.useEffect(() => {
    let ws: WebSocket | undefined;
    let cancelled = false;

    api.get<{ token: string }>("/api/auth/ws-token").then(({ token }) => {
      if (cancelled) return;
      const wsUrl = API_BASE_URL.replace(/^http/, "ws");
      ws = new WebSocket(`${wsUrl}/ws/sessions/${sessionId}/events?token=${token}`);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data) as SessionProgressEvent & { type?: string; status?: string };
        if (data.step) {
          setStep(data.step);
          setProgressPercent(data.progressPercent);
          setMessage(data.message);
        } else if (data.type === "snapshot" && data.status) {
          if (data.status === "RUNNING") {
            setStep("READY");
            setProgressPercent(100);
          } else if (data.status === "FAILED") {
            setStep("FAILED");
          }
        }
      };
    });

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [sessionId]);

  return { step, label: SESSION_PROGRESS_LABELS[step], progressPercent, message };
}
