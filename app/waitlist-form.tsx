'use client';

import { useEffect, useRef } from 'react';

const KIT_FORM_UID = '797156a490';
const KIT_FORM_SRC = 'https://latch-2.kit.com/797156a490/index.js';

export function WaitlistForm() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    let script: HTMLScriptElement | null = null;
    const timeoutId = window.setTimeout(() => {
      if (!container.isConnected || container.childElementCount > 0) return;

      script = document.createElement('script');
      script.async = true;
      script.dataset.uid = KIT_FORM_UID;
      script.src = KIT_FORM_SRC;
      script.onerror = () => {
        const message = document.createElement('p');
        message.className = 'waitlist-form-error';
        message.setAttribute('role', 'alert');
        message.textContent = 'The signup form could not load. Please try again.';
        container.replaceChildren(message);
      };

      container.replaceChildren(script);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);

      if (script) script.onerror = null;
      container.replaceChildren();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="waitlist-form"
      data-kit-form-container
      aria-label="Email signup form"
    />
  );
}
