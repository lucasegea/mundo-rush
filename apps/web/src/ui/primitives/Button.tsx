// Botón nativo con los tokens del HUD. Objetivo táctil ≥ 44 px (D-047): min-h-11 = 2,75rem, que además crece
// con el tamaño de texto. Nada depende de hover.
import type { ComponentPropsWithRef } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent border-accent",
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
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border-2 px-4 py-2 text-left text-base font-semibold aria-disabled:opacity-70 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
