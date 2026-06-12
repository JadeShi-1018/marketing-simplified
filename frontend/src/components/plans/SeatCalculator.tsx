'use client';

import { useState } from 'react';

interface SeatCalculatorProps {
  basePriceCents: number;
  includedSeats: number;
  extraSeatPriceCents: number;
  /** Called whenever the seat count changes. Receives new seat count. */
  onSeatsChange?: (seats: number) => void;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function SeatCalculator({
  basePriceCents,
  includedSeats,
  extraSeatPriceCents,
  onSeatsChange,
}: SeatCalculatorProps) {
  const [seats, setSeats] = useState(includedSeats);

  const extraSeats = Math.max(0, seats - includedSeats);
  const totalCents = basePriceCents + extraSeats * extraSeatPriceCents;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Math.max(1, parseInt(e.target.value, 10) || 1);
    setSeats(next);
    onSeatsChange?.(next);
  };

  return (
    <div className="space-y-3 py-3">
      <div className="flex items-center justify-between text-sm text-gray-600">
        <label htmlFor="seat-slider" className="font-medium">
          Seats
        </label>
        <span className="font-semibold text-gray-900">{seats}</span>
      </div>

      <input
        id="seat-slider"
        type="range"
        min={1}
        max={50}
        value={seats}
        onChange={handleChange}
        className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[#3CCED7] focus:outline-none focus:ring-2 focus:ring-[#3CCED7] focus:ring-offset-2"
      />

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{includedSeats} included</span>
        {extraSeats > 0 && (
          <span>
            +{extraSeats} extra × {formatDollars(extraSeatPriceCents)}/seat
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1 pt-1">
        <span className="text-xl font-semibold text-gray-900">
          {formatDollars(totalCents)}
        </span>
        <span className="text-sm text-gray-500">/mo</span>
      </div>
    </div>
  );
}
