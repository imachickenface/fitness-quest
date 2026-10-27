/** A compact two-way unit choice (g | ml, kg | lb), built on the segmented radio style. */
export function UnitSwitch<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    // a labelled radiogroup, not a fieldset: a visually hidden <legend> still widens the box
    <div className="segmented unit-switch" role="radiogroup" aria-label={legend}>
      {options.map(([v, label]) => (
        <label key={v}>
          <input
            type="radio"
            name={name}
            value={v}
            checked={value === v}
            onChange={() => onChange(v)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
