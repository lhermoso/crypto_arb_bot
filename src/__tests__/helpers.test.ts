/**
 * Unit tests for helpers.ts utility functions
 */

import {
  sleep,
  retry,
  roundToDecimals,
  formatPercent,
  formatCurrency,
  debounce,
  throttle,
  deepClone,
  isValidNumber,
  clamp,
  generateId,
  getTimeDiff,
  safeJsonParse,
  safeJsonStringify,
  hasRequiredProperties,
  createTimeout,
  withTimeout,
  chunk,
  uniqueBy,
  groupBy,
  average,
  median,
  standardDeviation,
  MovingAverage,
} from '@utils/helpers';

describe('helpers.ts', () => {
  describe('sleep', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should resolve after specified time', async () => {
      const promise = sleep(100);
      jest.advanceTimersByTime(100);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should not resolve before specified time', () => {
      const mockFn = jest.fn();
      sleep(100).then(mockFn);

      jest.advanceTimersByTime(50);
      expect(mockFn).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    afterEach(() => {
      jest.useFakeTimers();
    });

    it('should return result on first successful attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await retry(operation, 3, 10, 100);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockResolvedValue('success');

      const result = await retry(operation, 3, 10, 100);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      const error = new Error('persistent failure');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(retry(operation, 3, 10, 100)).rejects.toThrow('persistent failure');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');

      const start = Date.now();
      await retry(operation, 3, 10, 1000);
      const elapsed = Date.now() - start;

      // First retry: 10ms, second retry: 20ms
      expect(elapsed).toBeGreaterThanOrEqual(25);
    });

    it('should cap delay at maxDelay', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const start = Date.now();
      await retry(operation, 3, 100, 50); // maxDelay is less than baseDelay
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('roundToDecimals', () => {
    it('should round to specified decimals', () => {
      expect(roundToDecimals(1.23456, 2)).toBe(1.23);
      expect(roundToDecimals(1.23456, 3)).toBe(1.235);
      expect(roundToDecimals(1.23456, 0)).toBe(1);
    });

    it('should handle rounding up', () => {
      expect(roundToDecimals(1.235, 2)).toBe(1.24);
      expect(roundToDecimals(1.999, 2)).toBe(2);
    });

    it('should handle negative numbers', () => {
      expect(roundToDecimals(-1.23456, 2)).toBe(-1.23);
    });
  });

  describe('formatPercent', () => {
    it('should format as percentage string', () => {
      expect(formatPercent(1.23456)).toBe('1.23%');
      expect(formatPercent(1.23456, 3)).toBe('1.235%');
    });

    it('should use default decimals of 2', () => {
      expect(formatPercent(5.555)).toBe('5.56%');
    });
  });

  describe('formatCurrency', () => {
    it('should format as USD by default', () => {
      const result = formatCurrency(1234.56);
      expect(result).toBe('$1,234.56');
    });

    it('should format with specified currency', () => {
      const result = formatCurrency(1234.56, 'EUR');
      expect(result).toContain('1,234.56');
    });

    it('should use specified decimals', () => {
      const result = formatCurrency(1234.5678, 'USD', 4);
      expect(result).toBe('$1,234.5678');
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should delay function execution', () => {
      const func = jest.fn();
      const debounced = debounce(func, 100);

      debounced();
      expect(func).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on subsequent calls', () => {
      const func = jest.fn();
      const debounced = debounce(func, 100);

      debounced();
      jest.advanceTimersByTime(50);
      debounced();
      jest.advanceTimersByTime(50);
      expect(func).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to function', () => {
      const func = jest.fn();
      const debounced = debounce(func, 100);

      debounced('arg1', 'arg2');
      jest.advanceTimersByTime(100);

      expect(func).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should execute immediately on first call', () => {
      const func = jest.fn();
      const throttled = throttle(func, 100);

      throttled();
      expect(func).toHaveBeenCalledTimes(1);
    });

    it('should ignore calls within throttle window', () => {
      const func = jest.fn();
      const throttled = throttle(func, 100);

      throttled();
      throttled();
      throttled();

      expect(func).toHaveBeenCalledTimes(1);
    });

    it('should allow calls after throttle window', () => {
      const func = jest.fn();
      const throttled = throttle(func, 100);

      throttled();
      jest.advanceTimersByTime(100);
      throttled();

      expect(func).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments to function', () => {
      const func = jest.fn();
      const throttled = throttle(func, 100);

      throttled('arg1', 'arg2');
      expect(func).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('deepClone', () => {
    it('should clone primitive values', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('string')).toBe('string');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBeNull();
    });

    it('should clone arrays', () => {
      const arr = [1, 2, [3, 4]];
      const cloned = deepClone(arr);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[2]).not.toBe(arr[2]);
    });

    it('should clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });

    it('should clone Date objects', () => {
      const date = new Date('2024-01-01');
      const cloned = deepClone(date);

      expect(cloned.getTime()).toBe(date.getTime());
      expect(cloned).not.toBe(date);
    });

    it('should handle nested structures', () => {
      const obj = {
        arr: [1, { nested: true }],
        date: new Date(),
        inner: { deep: { value: 42 } },
      };
      const cloned = deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned.arr[1]).not.toBe(obj.arr[1]);
      expect(cloned.inner.deep).not.toBe(obj.inner.deep);
    });
  });

  describe('isValidNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isValidNumber(42)).toBe(true);
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(-42)).toBe(true);
      expect(isValidNumber(3.14)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isValidNumber(NaN)).toBe(false);
    });

    it('should return false for Infinity', () => {
      expect(isValidNumber(Infinity)).toBe(false);
      expect(isValidNumber(-Infinity)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isValidNumber('42')).toBe(false);
      expect(isValidNumber(null)).toBe(false);
      expect(isValidNumber(undefined)).toBe(false);
      expect(isValidNumber({})).toBe(false);
    });
  });

  describe('clamp', () => {
    it('should return value within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('should clamp to minimum', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('should clamp to maximum', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should handle equal min and max', () => {
      expect(clamp(5, 5, 5)).toBe(5);
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate string IDs', () => {
      expect(typeof generateId()).toBe('string');
    });

    it('should generate non-empty IDs', () => {
      expect(generateId().length).toBeGreaterThan(0);
    });
  });

  describe('getTimeDiff', () => {
    it('should format milliseconds', () => {
      expect(getTimeDiff(1000, 500)).toBe('500ms');
    });

    it('should format seconds', () => {
      expect(getTimeDiff(10000, 5000)).toBe('5.0s');
    });

    it('should format minutes', () => {
      expect(getTimeDiff(180000, 0)).toBe('3.0m');
    });

    it('should format hours', () => {
      expect(getTimeDiff(7200000, 0)).toBe('2.0h');
    });

    it('should handle negative difference', () => {
      expect(getTimeDiff(0, 1000)).toBe('1.0s');
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"a": 1}', {})).toEqual({ a: 1 });
    });

    it('should return fallback for invalid JSON', () => {
      expect(safeJsonParse('invalid', { default: true })).toEqual({ default: true });
    });

    it('should return fallback for empty string', () => {
      expect(safeJsonParse('', [])).toEqual([]);
    });
  });

  describe('safeJsonStringify', () => {
    it('should stringify objects', () => {
      expect(safeJsonStringify({ a: 1 })).toBe('{"a":1}');
    });

    it('should handle circular references', () => {
      const obj: any = { a: 1 };
      obj.self = obj;
      expect(safeJsonStringify(obj)).toBe('{}');
    });

    it('should format with spaces', () => {
      expect(safeJsonStringify({ a: 1 }, 2)).toBe('{\n  "a": 1\n}');
    });
  });

  describe('hasRequiredProperties', () => {
    it('should return true when all properties exist', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(hasRequiredProperties<{ a: number; b: number }>(obj, ['a', 'b'])).toBe(true);
    });

    it('should return false when property is missing', () => {
      const obj = { a: 1 };
      expect(hasRequiredProperties<{ a: number; b: number }>(obj, ['a', 'b'])).toBe(false);
    });

    it('should return false for null', () => {
      expect(hasRequiredProperties(null, ['a'])).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(hasRequiredProperties(undefined, ['a'])).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(hasRequiredProperties('string', ['length'])).toBe(false);
    });
  });

  describe('createTimeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should reject after specified time', async () => {
      const promise = createTimeout(100);
      jest.advanceTimersByTime(100);
      await expect(promise).rejects.toThrow('Operation timed out');
    });

    it('should use custom message', async () => {
      const promise = createTimeout(100, 'Custom timeout');
      jest.advanceTimersByTime(100);
      await expect(promise).rejects.toThrow('Custom timeout');
    });
  });

  describe('withTimeout', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    afterEach(() => {
      jest.useFakeTimers();
    });

    it('should resolve with promise result before timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise, 1000);
      expect(result).toBe('success');
    });

    it('should reject with timeout error after timeout', async () => {
      const promise = new Promise(resolve => setTimeout(resolve, 1000));
      await expect(withTimeout(promise, 10, 'Timed out!')).rejects.toThrow('Timed out!');
    });
  });

  describe('chunk', () => {
    it('should split array into chunks', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle empty array', () => {
      expect(chunk([], 2)).toEqual([]);
    });

    it('should handle array smaller than chunk size', () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });

    it('should handle chunk size of 1', () => {
      expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
    });
  });

  describe('uniqueBy', () => {
    it('should remove duplicates based on key', () => {
      const items = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 1, name: 'c' },
      ];
      const result = uniqueBy(items, item => item.id);
      expect(result).toEqual([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ]);
    });

    it('should handle empty array', () => {
      expect(uniqueBy([], item => item)).toEqual([]);
    });

    it('should preserve order', () => {
      const items = [3, 1, 2, 1, 3];
      expect(uniqueBy(items, x => x)).toEqual([3, 1, 2]);
    });
  });

  describe('groupBy', () => {
    it('should group items by key', () => {
      const items = [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 },
      ];
      const result = groupBy(items, item => item.type);
      expect(result).toEqual({
        a: [{ type: 'a', value: 1 }, { type: 'a', value: 3 }],
        b: [{ type: 'b', value: 2 }],
      });
    });

    it('should handle empty array', () => {
      expect(groupBy([], item => item)).toEqual({});
    });
  });

  describe('average', () => {
    it('should calculate average', () => {
      expect(average([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should return 0 for empty array', () => {
      expect(average([])).toBe(0);
    });

    it('should handle single element', () => {
      expect(average([42])).toBe(42);
    });

    it('should handle negative numbers', () => {
      expect(average([-2, -1, 0, 1, 2])).toBe(0);
    });
  });

  describe('median', () => {
    it('should calculate median for odd length array', () => {
      expect(median([1, 3, 5, 7, 9])).toBe(5);
    });

    it('should calculate median for even length array', () => {
      expect(median([1, 2, 3, 4])).toBe(2.5);
    });

    it('should return 0 for empty array', () => {
      expect(median([])).toBe(0);
    });

    it('should handle unsorted array', () => {
      expect(median([3, 1, 2])).toBe(2);
    });
  });

  describe('standardDeviation', () => {
    it('should calculate standard deviation', () => {
      const result = standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(result).toBeCloseTo(2, 0);
    });

    it('should return 0 for empty array', () => {
      expect(standardDeviation([])).toBe(0);
    });

    it('should return 0 for single element', () => {
      expect(standardDeviation([42])).toBe(0);
    });

    it('should return 0 for array of same values', () => {
      expect(standardDeviation([5, 5, 5, 5])).toBe(0);
    });
  });

  describe('MovingAverage', () => {
    it('should calculate moving average', () => {
      const ma = new MovingAverage(3);
      expect(ma.add(1)).toBe(1);
      expect(ma.add(2)).toBe(1.5);
      expect(ma.add(3)).toBe(2);
      expect(ma.add(4)).toBe(3); // [2, 3, 4]
    });

    it('should return current average', () => {
      const ma = new MovingAverage(3);
      ma.add(1);
      ma.add(2);
      expect(ma.getAverage()).toBe(1.5);
    });

    it('should return values', () => {
      const ma = new MovingAverage(3);
      ma.add(1);
      ma.add(2);
      expect(ma.getValues()).toEqual([1, 2]);
    });

    it('should clear values', () => {
      const ma = new MovingAverage(3);
      ma.add(1);
      ma.add(2);
      ma.clear();
      expect(ma.getValues()).toEqual([]);
      expect(ma.getAverage()).toBe(0);
    });

    it('should maintain window size', () => {
      const ma = new MovingAverage(2);
      ma.add(1);
      ma.add(2);
      ma.add(3);
      expect(ma.getValues()).toEqual([2, 3]);
    });
  });
});
