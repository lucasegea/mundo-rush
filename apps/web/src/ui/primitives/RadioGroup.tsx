// Grupo de opciones = fieldset + radios nativos (flechas dentro del grupo, Tab entre grupos).
export interface RadioOption<T extends string> {
  value: T;
  label: string;
}

export interface RadioGroupProps<T extends string> {
  name: string;
  legend: string;
  options: readonly RadioOption<T>[];
  value: T;
  onChange(value: T): void;
  description?: string;
  disabled?: boolean;
}

export function RadioGroup<T extends string>({ name, legend, options, value, onChange, description, disabled = false }: RadioGroupProps<T>) {
  const descId = description ? `${name}-desc` : undefined;
  return (
    <fieldset className="flex flex-col gap-1" aria-describedby={descId} disabled={disabled}>
      <legend className="mb-1 font-semibold">{legend}</legend>
      {description ? <p id={descId} className="mb-1 text-sm text-ink-muted">{description}</p> : null}
      {options.map((o) => {
        const id = `${name}-${o.value}`;
        return (
          <div key={o.value} className="flex min-h-11 items-center gap-3">
            <input
              id={id}
              type="radio"
              name={name}
              className="size-6 shrink-0 accent-accent"
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            <label htmlFor={id}>{o.label}</label>
          </div>
        );
      })}
    </fieldset>
  );
}
