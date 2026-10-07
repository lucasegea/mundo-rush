// Interruptor = checkbox nativo con su etiqueta (lectores de pantalla y teclado sin código extra).
export interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  description?: string;
}

export function Toggle({ id, label, checked, onChange, description }: ToggleProps) {
  const descId = description ? `${id}-desc` : undefined;
  return (
    <div className="flex min-h-11 items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-6 shrink-0 accent-accent"
        checked={checked}
        aria-describedby={descId}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <div>
        <label htmlFor={id} className="font-semibold">{label}</label>
        {description ? <p id={descId} className="text-sm text-ink-muted">{description}</p> : null}
      </div>
    </div>
  );
}
