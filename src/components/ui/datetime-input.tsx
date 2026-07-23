import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { CalendarDays, Clock } from "lucide-react";

import { cn } from "@/lib/utils";

const wrapperClass =
  "flex h-11 w-full overflow-hidden rounded-xl border border-[#d6e2de] bg-white text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_20px_-20px_rgba(18,49,54,0.5)] transition-[border-color,box-shadow] focus-within:border-[#6da69b] focus-within:ring-4 focus-within:ring-[#0d7774]/10";

const textInputClass =
  "min-w-0 flex-1 border-none bg-transparent px-3.5 py-2 text-sm text-[#17343a] outline-none placeholder:text-[#92a1a4] disabled:cursor-not-allowed";

const pickerButtonClass =
  "grid size-10 shrink-0 place-items-center rounded-lg text-[#71868a] transition hover:bg-[#edf5f2] hover:text-[#0d6665] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7774]/25 disabled:cursor-not-allowed disabled:opacity-50";

interface BaseInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "onChange"
  > {
  value?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
}

export function DateInput({
  value = "",
  onChange,
  min,
  max,
  placeholder = "YYYY-MM-DD",
  className,
  disabled,
  id,
  ...rest
}: BaseInputProps) {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  function updateText(nextValue: string) {
    setText(nextValue);

    if (
      /^\d{4}-\d{2}-\d{2}$/.test(nextValue) ||
      nextValue === ""
    ) {
      onChange?.(nextValue);
    }
  }

  function openPicker() {
    hiddenInputRef.current?.showPicker?.();
    hiddenInputRef.current?.click();
  }

  return (
    <div
      className={cn(
        wrapperClass,
        disabled && "cursor-not-allowed bg-[#f3f6f5] opacity-65",
        className,
      )}
    >
      <input
        id={id}
        type="text"
        className={textInputClass}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => updateText(event.target.value)}
        {...rest}
      />

      <div className="relative flex items-center pr-1">
        <button
          type="button"
          className={pickerButtonClass}
          disabled={disabled}
          aria-label="Open date picker"
          onClick={openPicker}
        >
          <CalendarDays className="size-4" />
        </button>

        <input
          ref={hiddenInputRef}
          type="date"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute size-px opacity-0"
          onChange={(event) => {
            setText(event.target.value);
            onChange?.(event.target.value);
          }}
        />
      </div>
    </div>
  );
}

export function TimeInput({
  value = "",
  onChange,
  min,
  max,
  placeholder = "HH:MM",
  className,
  disabled,
  id,
  ...rest
}: BaseInputProps) {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  function updateText(nextValue: string) {
    setText(nextValue);

    if (
      /^\d{2}:\d{2}$/.test(nextValue) ||
      nextValue === ""
    ) {
      onChange?.(nextValue);
    }
  }

  function openPicker() {
    hiddenInputRef.current?.showPicker?.();
    hiddenInputRef.current?.click();
  }

  return (
    <div
      className={cn(
        wrapperClass,
        disabled && "cursor-not-allowed bg-[#f3f6f5] opacity-65",
        className,
      )}
    >
      <input
        id={id}
        type="text"
        className={textInputClass}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => updateText(event.target.value)}
        {...rest}
      />

      <div className="relative flex items-center pr-1">
        <button
          type="button"
          className={pickerButtonClass}
          disabled={disabled}
          aria-label="Open time picker"
          onClick={openPicker}
        >
          <Clock className="size-4" />
        </button>

        <input
          ref={hiddenInputRef}
          type="time"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute size-px opacity-0"
          onChange={(event) => {
            setText(event.target.value);
            onChange?.(event.target.value);
          }}
        />
      </div>
    </div>
  );
}

export function DateTimeInput({
  value = "",
  onChange,
  min,
  max,
  placeholder = "YYYY-MM-DD HH:MM",
  className,
  disabled,
  id,
  ...rest
}: BaseInputProps) {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(
    value ? value.replace("T", " ") : "",
  );

  useEffect(() => {
    setText(value ? value.replace("T", " ") : "");
  }, [value]);

  function updateText(nextValue: string) {
    setText(nextValue);

    if (nextValue === "") {
      onChange?.("");
      return;
    }

    const normalizedValue = nextValue.replace(" ", "T");

    if (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(
        normalizedValue,
      )
    ) {
      onChange?.(normalizedValue);
    }
  }

  function openPicker() {
    hiddenInputRef.current?.showPicker?.();
    hiddenInputRef.current?.click();
  }

  return (
    <div
      className={cn(
        wrapperClass,
        disabled && "cursor-not-allowed bg-[#f3f6f5] opacity-65",
        className,
      )}
    >
      <input
        id={id}
        type="text"
        className={textInputClass}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => updateText(event.target.value)}
        {...rest}
      />

      <div className="relative flex items-center pr-1">
        <button
          type="button"
          className={pickerButtonClass}
          disabled={disabled}
          aria-label="Open date and time picker"
          onClick={openPicker}
        >
          <CalendarDays className="size-4" />
        </button>

        <input
          ref={hiddenInputRef}
          type="datetime-local"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute size-px opacity-0"
          onChange={(event) => {
            setText(event.target.value.replace("T", " "));
            onChange?.(event.target.value);
          }}
        />
      </div>
    </div>
  );
}