export type Format = 'limited' | 'standard';

interface FormatPickerProps {
  format: Format;
  onChange: (format: Format) => void;
}

/** Format selector: Limited (pick a set, browse its printed pool) or
 * Standard (the current constructed-legal pool, no set to pick). Sibling
 * to SetPicker, which only renders in Limited mode. */
export function FormatPicker({ format, onChange }: FormatPickerProps) {
  return (
    <section className="format-picker">
      <label htmlFor="format-picker-select">Format</label>
      <select
        id="format-picker-select"
        value={format}
        onChange={(event) => onChange(event.target.value as Format)}
      >
        <option value="limited">Limited (by set)</option>
        <option value="standard">Standard</option>
      </select>
    </section>
  );
}
