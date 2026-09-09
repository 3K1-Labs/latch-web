"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import styles from "./waitlist-confirmation.module.css";

type ConfirmationState = "ready" | "loading" | "success" | "error";
type Theme = "light" | "dark";

const INVALID_LINK_MESSAGE = "This confirmation link is invalid or expired.";
const UNAVAILABLE_MESSAGE = "We could not confirm your subscription right now. Please try again.";

function getSavedTheme(): Theme {
  const savedTheme = window.localStorage.getItem("latch-theme");

  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeToTheme(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  window.addEventListener("storage", onStoreChange);
  mediaQuery.addEventListener("change", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    mediaQuery.removeEventListener("change", onStoreChange);
  };
}

export function WaitlistConfirmation({ token }: { token: string }) {
  const hasToken = token.length > 0;
  const theme = useSyncExternalStore<Theme>(subscribeToTheme, getSavedTheme, () => "light");
  const [confirmationState, setConfirmationState] = useState<ConfirmationState>(
    hasToken ? "ready" : "error",
  );
  const [message, setMessage] = useState(
    hasToken
      ? "Confirm your email to complete your Latch waitlist signup."
      : INVALID_LINK_MESSAGE,
  );

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor =
      theme === "dark" ? "#020202" : "#fff8e1";
    document.body.style.backgroundColor = theme === "dark" ? "#020202" : "#fff8e1";
  }, [theme]);

  async function confirmEmail() {
    if (!hasToken || confirmationState === "loading") return;

    setConfirmationState("loading");
    setMessage("Confirming your email…");

    try {
      const response = await fetch("/api/waitlist/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = (await response.json()) as { ok?: boolean; message?: unknown };
      const responseMessage =
        typeof result.message === "string" ? result.message : UNAVAILABLE_MESSAGE;

      if (!response.ok || result.ok !== true) {
        setConfirmationState("error");
        setMessage(responseMessage);
        return;
      }

      setConfirmationState("success");
      setMessage(responseMessage);
    } catch {
      setConfirmationState("error");
      setMessage(UNAVAILABLE_MESSAGE);
    }
  }

  const logoAsset = theme === "dark" ? "logo-dark.svg" : "logo-light.svg";
  const heading =
    confirmationState === "success"
      ? "You’re confirmed!"
      : confirmationState === "error"
        ? "We couldn’t confirm your email"
        : "Confirm your email";

  return (
    <main className={styles.page} data-theme={theme}>
      <section className={styles.content} aria-labelledby="confirmation-heading">
        <Image
          alt="Latch"
          className={styles.logo}
          height={29.7612}
          priority
          src={`/waitlist-assets/${logoAsset}`}
          width={152.416}
        />

        <h1 id="confirmation-heading">{heading}</h1>
        <p
          className={confirmationState === "error" ? styles.errorMessage : undefined}
          role={confirmationState === "error" ? "alert" : "status"}
        >
          {message}
        </p>

        {confirmationState !== "success" && hasToken ? (
          <button
            className={styles.confirmButton}
            disabled={confirmationState === "loading"}
            onClick={confirmEmail}
            type="button"
          >
            {confirmationState === "loading" ? "Confirming…" : "Confirm email"}
          </button>
        ) : null}

        <Link className={styles.backLink} href="/">
          Back to Latch
        </Link>
      </section>
    </main>
  );
}
