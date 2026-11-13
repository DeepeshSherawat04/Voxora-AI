// frontend/src/components/ui.jsx
// Small shared pieces, so every screen looks like one product.
import { memo } from "react";
import { initialsOf } from "../lib/format";
import { TONE_STYLES, statusTone } from "../lib/statusTheme";

const BAR_HEIGHTS = [38, 72, 100, 58, 30];

const MARK_SIZES = {
  sm: { box: "size-8 rounded-lg", bars: "h-3.5 gap-[2px]", bar: "w-[2px]" },
  md: { box: "size-9 rounded-[10px]", bars: "h-4 gap-[2.5px]", bar: "w-[2.5px]" },
  lg: { box: "size-14 rounded-2xl", bars: "h-6 gap-[3.5px]", bar: "w-[3.5px]" },
};

/**
 * Logo mark: five bars on the brand gradient.
 * animate: "hover" (move when a parent with `group/brand` is hovered), "always", or "none".
 */
export function BrandMark({ size = "md", animate = "hover" }) {
  const s = MARK_SIZES[size] || MARK_SIZES.md;
  const anim =
    animate === "always" ? "animate-eq" : animate === "hover" ? "group-hover/brand:animate-eq" : "";
  return (
    <span
      className={`bg-brand-gradient relative grid shrink-0 place-items-center shadow-[0_1px_2px_rgb(76_29_149/0.35),inset_0_1px_0_rgb(255_255_255/0.2)] ${s.box}`}
    >
      <span className={`flex items-end ${s.bars}`} aria-hidden>
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className={`origin-bottom rounded-full bg-white ${s.bar} ${anim}`}
            style={{ height: `${h}%`, animationDelay: `${i * 0.11}s` }}
          />
        ))}
      </span>
    </span>
  );
}

/** "Voxora" in the brand gradient, "AI" in grey. Use onDark on black backgrounds. */
export function Wordmark({ className = "text-[1.25rem]", onDark = false }) {
  return (
    <span className={`leading-none tracking-[-0.03em] ${className}`}>
      <span className={`${onDark ? "text-gradient-light" : "text-gradient"} font-semibold`}>Voxora</span>
      <span className={`ml-1 font-light ${onDark ? "text-zinc-400" : "text-zinc-500"}`}>AI</span>
    </span>
  );
}

const AVATAR_SIZES = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-11 text-sm" };

/** Photo if there is one, otherwise initials. `dark` gives the black variant. */
export function Avatar({ name, src, size = "md", dark = false }) {
  const cls = AVATAR_SIZES[size] || AVATAR_SIZES.md;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        className={`${cls} shrink-0 rounded-full object-cover ring-1 ring-zinc-200`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${cls} grid shrink-0 place-items-center rounded-full font-semibold ${
        dark ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-200"
      }`}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Coloured pill for a sales status. Colour comes from the status text. */
export const StatusBadge = memo(function StatusBadge({ status, className = "" }) {
  const t = TONE_STYLES[statusTone(status)];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${t.pill} ${className}`}
    >
      <span className={`size-1.5 rounded-full ${t.dot}`} />
      {status}
    </span>
  );
});

/** Generic pill with an explicit tone from TONE_STYLES. */
export function TonePill({ tone = "neutral", dot = true, children, className = "" }) {
  const t = TONE_STYLES[tone] || TONE_STYLES.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${t.pill} ${className}`}
    >
      {dot && <span className={`size-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  );
}

/** Title row used at the top of every panel. */
export function PanelHeader({ title, description, right }) {
  return (
    <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-zinc-950">{title}</h2>
        {description && <p className="truncate text-xs text-zinc-500">{description}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-8 text-center ${className}`}>
      {Icon && (
        <span className="grid size-12 place-items-center rounded-full border border-zinc-200 bg-zinc-50">
          <Icon className="size-5 text-zinc-500" strokeWidth={1.5} />
        </span>
      )}
      <div>
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        {children && <p className="mx-auto mt-1 max-w-[18rem] text-sm leading-relaxed text-zinc-500">{children}</p>}
      </div>
    </div>
  );
}

/**
 * One chat bubble. AI = soft violet on the left, customer = black on the right.
 * Memoized, so a new message does not re-render the whole history.
 */
export const ChatBubble = memo(function ChatBubble({
  isAi,
  name,
  time,
  text,
  partial = false,
  animate = true,
}) {
  const meta = [name, time].filter(Boolean).join(" · ");
  return (
    <div className={`${animate ? "animate-fade-up" : ""} flex items-end gap-2.5 ${isAi ? "" : "flex-row-reverse"}`}>
      {isAi ? <BrandMark size="sm" animate="none" /> : <Avatar name={name} size="sm" dark />}
      <div className={`flex min-w-0 max-w-[82%] flex-col ${isAi ? "items-start" : "items-end"}`}>
        {meta && <p className="mb-1 px-0.5 text-[11px] text-zinc-500">{meta}</p>}
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isAi
              ? "rounded-bl-md bg-violet-50 text-zinc-900 ring-1 ring-inset ring-violet-100"
              : "rounded-br-md bg-zinc-950 text-white"
          } ${partial ? "opacity-70" : ""}`}
        >
          {text}
        </div>
      </div>
    </div>
  );
});
