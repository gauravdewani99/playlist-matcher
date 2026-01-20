import { useRef, useEffect, useState } from "react";
import "./Stepper.css";

interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
  suffix?: string;
  compact?: boolean;
}

export function Stepper({ value, min, max, onChange, label, suffix, compact }: StepperProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startX, setStartX] = useState(0);
  const [startValue, setStartValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    const newValue = Math.max(min, Math.min(max, value + delta));
    onChange(newValue);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartY(e.clientY);
    setStartX(e.clientX);
    setStartValue(value);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
    setStartX(e.touches[0].clientX);
    setStartValue(value);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      // For compact mode, use horizontal drag; for normal, use vertical
      const delta = compact
        ? Math.round((e.clientX - startX) / 10)
        : Math.round((startY - e.clientY) / 10);
      const newValue = Math.max(min, Math.min(max, startValue + delta));
      onChange(newValue);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const delta = compact
        ? Math.round((e.touches[0].clientX - startX) / 10)
        : Math.round((startY - e.touches[0].clientY) / 10);
      const newValue = Math.max(min, Math.min(max, startValue + delta));
      onChange(newValue);
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, startY, startX, startValue, min, max, onChange, compact]);

  const increment = () => {
    if (value < max) onChange(value + 1);
  };

  const decrement = () => {
    if (value > min) onChange(value - 1);
  };

  if (compact) {
    return (
      <div className="stepper-wrapper stepper-wrapper-compact">
        {label && <span className="stepper-label">{label}</span>}
        <div
          ref={containerRef}
          className={`stepper-container stepper-compact ${isDragging ? "dragging" : ""}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <button
            className="stepper-btn stepper-btn-left"
            onClick={decrement}
            disabled={value <= min}
            aria-label="Decrease"
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M10 4l-4 4 4 4V4z" />
            </svg>
          </button>

          <div className="stepper-display-compact">
            <span className="stepper-value">{value}</span>
            {suffix && <span className="stepper-suffix">{suffix}</span>}
          </div>

          <button
            className="stepper-btn stepper-btn-right"
            onClick={increment}
            disabled={value >= max}
            aria-label="Increase"
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 4l4 4-4 4V4z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stepper-wrapper">
      {label && <span className="stepper-label">{label}</span>}
      <div
        ref={containerRef}
        className={`stepper-container ${isDragging ? "dragging" : ""}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <button
          className="stepper-btn stepper-btn-up"
          onClick={increment}
          disabled={value >= max}
          aria-label="Increase"
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4l4 4H4l4-4z" />
          </svg>
        </button>

        <div className="stepper-display">
          <div className="stepper-value-container">
            <span className="stepper-value">{value}</span>
            {suffix && <span className="stepper-suffix">{suffix}</span>}
          </div>
          <div className="stepper-track">
            <div
              className="stepper-progress"
              style={{ height: `${((value - min) / (max - min)) * 100}%` }}
            />
          </div>
        </div>

        <button
          className="stepper-btn stepper-btn-down"
          onClick={decrement}
          disabled={value <= min}
          aria-label="Decrease"
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 12l-4-4h8l-4 4z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface TimePickerProps {
  hours: number;
  minutes: number;
  onHoursChange: (hours: number) => void;
  onMinutesChange: (minutes: number) => void;
  compact?: boolean;
}

export function TimePicker({ hours, minutes, onHoursChange, onMinutesChange, compact }: TimePickerProps) {
  // Toggle between 0 and 30 for minutes
  const toggleMinutes = () => {
    onMinutesChange(minutes === 0 ? 30 : 0);
  };

  if (compact) {
    return (
      <div className="time-picker time-picker-compact">
        <Stepper
          value={hours}
          min={0}
          max={23}
          onChange={onHoursChange}
          compact
        />
        <span className="time-separator">:</span>
        <button
          className="minute-toggle"
          onClick={toggleMinutes}
          aria-label="Toggle minutes between 00 and 30"
        >
          {minutes.toString().padStart(2, "0")}
        </button>
      </div>
    );
  }

  return (
    <div className="time-picker">
      <Stepper
        value={hours}
        min={0}
        max={23}
        onChange={onHoursChange}
      />
      <span className="time-separator">:</span>
      <button
        className="minute-toggle minute-toggle-vertical"
        onClick={toggleMinutes}
        aria-label="Toggle minutes between 00 and 30"
      >
        {minutes.toString().padStart(2, "0")}
      </button>
    </div>
  );
}
