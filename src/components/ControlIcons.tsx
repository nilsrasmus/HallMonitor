import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  crossed?: boolean;
  dimmed?: boolean;
  variant?: "default" | "record-idle" | "recording" | "mic-on";
  children: ReactNode;
}

export function IconButton({
  label,
  active = false,
  crossed = false,
  dimmed = false,
  variant = "default",
  className = "",
  children,
  ...props
}: IconButtonProps) {
  const classes = [
    "icon-btn",
    active ? "icon-btn-active" : "",
    crossed ? "icon-btn-crossed" : "",
    dimmed ? "icon-btn-dimmed" : "",
    variant !== "default" ? `icon-btn-${variant}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}

export function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M4 8h4l2-2h4l2 2h4v10H4V8z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function RecordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="6" fill="currentColor" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  );
}

export function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M5 10v4h4l5 4V6l-5 4H5z" strokeLinejoin="round" />
      <path d="M16 9a4 4 0 010 6" />
      <path d="M18 7a7 7 0 010 10" />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0012 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
    </svg>
  );
}

export function ZoomInIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="10" cy="10" r="5.5" />
      <path d="M14.5 14.5L19 19" strokeLinecap="round" />
      <path d="M8 10h4" strokeLinecap="round" />
      <path d="M10 8v4" strokeLinecap="round" />
    </svg>
  );
}

export function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="10" cy="10" r="5.5" />
      <path d="M14.5 14.5L19 19" strokeLinecap="round" />
      <path d="M8 10h4" strokeLinecap="round" />
    </svg>
  );
}

export function ResetZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M4 12a8 8 0 0113.7-5.7" strokeLinecap="round" />
      <path d="M4 4v5h5" strokeLinejoin="round" />
      <path d="M20 12a8 8 0 01-13.7 5.7" strokeLinecap="round" />
      <path d="M20 20v-5h-5" strokeLinejoin="round" />
    </svg>
  );
}
