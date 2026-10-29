import { describe, expect, it } from 'vitest';
import { apiUrlProblem } from './api-url';

describe('the deployed backend address', () => {
  it('must be set and https', () => {
    expect(apiUrlProblem('https://api.example.com/api')).toBeNull();
    expect(apiUrlProblem(undefined)).toMatch(/not set/);
    expect(apiUrlProblem('  ')).toMatch(/not set/);
    expect(apiUrlProblem('http://localhost:8787/api')).toMatch(/https/);
    expect(apiUrlProblem('api.example.com')).toMatch(/not an address/);
  });
});
