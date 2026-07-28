import { useId, useState } from "react";

type PasswordStatus = {
  tone: "neutral" | "success" | "error";
  message: string;
};

type PasswordFieldProps = {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  error?: string;
  hint?: string;
  status?: PasswordStatus;
  onValueChange?: (value: string) => void;
};

export function PasswordField({
  name,
  label,
  autoComplete,
  minLength,
  maxLength = 128,
  required = true,
  error,
  hint,
  status,
  onValueChange,
}: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = `${name}-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const statusId = `${inputId}-status`;
  const errorId = `${inputId}-error`;
  const [visible, setVisible] = useState(false);
  const describedBy = [
    hint ? hintId : null,
    status ? statusId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="password-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-input-shell">
        <input
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          required={required}
          aria-invalid={Boolean(error) || status?.tone === "error"}
          aria-describedby={describedBy || undefined}
          onChange={(event) => {
            event.currentTarget.setCustomValidity("");
            onValueChange?.(event.currentTarget.value);
          }}
          onInvalid={(event) => {
            const input = event.currentTarget;
            if (input.validity.valueMissing) {
              input.setCustomValidity(`Enter ${label.toLowerCase()}.`);
            } else if (minLength && input.validity.tooShort) {
              input.setCustomValidity(
                `Use at least ${minLength} characters for ${label.toLowerCase()}.`,
              );
            }
          }}
        />
        <button
          className="password-visibility-toggle"
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {visible ? (
              <>
                <path d="M3 3l18 18" />
                <path d="M10.6 10.7a2 2 0 002.7 2.7" />
                <path d="M9.9 4.3A10.8 10.8 0 0112 4c5.3 0 9 5.1 9 8a8.7 8.7 0 01-2.1 3.8" />
                <path d="M6.6 6.7C4.3 8.2 3 10.4 3 12c0 2.9 3.7 8 9 8 1.2 0 2.3-.3 3.3-.7" />
              </>
            ) : (
              <>
                <path d="M3 12c0-2.9 3.7-8 9-8s9 5.1 9 8-3.7 8-9 8-9-5.1-9-8z" />
                <circle cx="12" cy="12" r="2.5" />
              </>
            )}
          </svg>
          <span>{visible ? "Hide" : "Show"}</span>
        </button>
      </div>
      {hint && (
        <small id={hintId} className="password-hint">
          {hint}
        </small>
      )}
      {status && (
        <small
          id={statusId}
          className="password-status"
          data-tone={status.tone}
          aria-live="polite"
        >
          {status.message}
        </small>
      )}
      {error && (
        <small id={errorId} className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
