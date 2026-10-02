import { useMemo } from 'react';
import { useRows } from '@/data/hooks';
import type { Car } from '@/types';

/** The car marked as current (or the first one when none is marked). */
export function useCurrentCar() {
  const { rows: cars, isLoading } = useRows('cars');
  const current: Car | null = useMemo(() => cars.find(c => c.is_current) ?? cars[0] ?? null, [cars]);
  return { cars, current, isLoading };
}
