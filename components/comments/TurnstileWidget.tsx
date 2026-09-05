"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire: () => void;
}

/**
 * To get a fresh challenge (e.g. after a successful submit — tokens are
 * single-use), give this a new `key` prop from the parent rather than
 * exposing an imperative reset handle.
 */
export function TurnstileWidget({ siteKey, onVerify, onExpire }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;

    function renderWidget() {
      if (cancelled || !containerRef.current || widgetIdRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        "expired-callback": onExpire,
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      // The api.js script may still be loading (Next's <Script> dedupes
      // across mounts, so onLoad won't necessarily fire again here).
      pollId = setInterval(() => {
        if (window.turnstile) {
          if (pollId) clearInterval(pollId);
          renderWidget();
        }
      }, 100);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div ref={containerRef} />
    </>
  );
}
