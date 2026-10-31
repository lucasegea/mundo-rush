// Native button with the HUD tokens. Touch target ≥ 44 px (D-047): min-h-11 = 2.75rem, which also grows
// with the text size. Nothing depends on hover. Plan estetica-c M4 ("paper and ink", proposal C §8): the primary is
// the dark button (paper on ink, ≥ 7:1 in check:contrast) and the corners are those of the cards.
import type { ComponentPropsWithRef } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper border-ink",
  secondary: "bg-surface text-ink border-line",
  ghost: "bg-transparent text-ink border-transparent underline-offset-4 hover:underline",
};

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: Variant;
}

export function Button({ variant = "secondary", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-card border-2 px-4 py-2 text-left text-base font-semibold aria-disabled:opacity-70 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
