// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { funnelBuckets } from './funnel';

const NONE = 1e6;
const row = (samples: number, real_loads: number, pickers: number, failures = 0, samples_at_first_real = NONE) => ({
  samples,
  real_loads,
  pickers,
  failures,
  samples_at_first_real,
});

describe('funnelBuckets', () => {
  it('sorts each session into exactly one of the five buckets', () => {
    const b = funnelBuckets([
      row(0, 1, 1, 0, 0), // real_only
      row(2, 1, 0, 0, 2), // sample_then_real
      row(1, 0, 1, 1), // tried_but_no_real_load (landed in the picker, failed)
      row(0, 0, 2), // tried_but_no_real_load (a landing visitor who never opened an example)
      row(3, 0, 0), // sample_only
      row(0, 0, 0), // no_user_load
    ]);
    expect(b).toEqual({
      sessions: 6,
      real_only: 1,
      sample_then_real: 1,
      tried_but_no_real_load: 2,
      sample_only: 1,
      no_user_load: 1,
      opened_sample: 3,
      with_failed_load: 1,
    });
    expect(b.real_only + b.sample_then_real + b.tried_but_no_real_load + b.sample_only + b.no_user_load).toBe(b.sessions);
  });

  it('counts an example opened after the own structure as real_only, not sample_then_real', () => {
    // Uploaded a file (no example yet), then clicked a sample
    const b = funnelBuckets([row(1, 1, 1, 0, 0)]);
    expect(b).toMatchObject({ real_only: 1, sample_then_real: 0, opened_sample: 1 });
  });

  it('reads the numbers the SQL API returns as strings', () => {
    expect(funnelBuckets([{ samples: '1', real_loads: '0', pickers: '0', failures: '0', samples_at_first_real: '1000000' }]).sample_only).toBe(1);
  });
});
