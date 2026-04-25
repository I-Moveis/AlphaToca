import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetProcessInsights } = vi.hoisted(() => ({
  mockGetProcessInsights: vi.fn(),
}));

vi.mock('../src/services/rentalProcessService', () => ({
  getProcessInsights: mockGetProcessInsights,
}));

import { rentalProcessController } from '../src/controllers/rentalProcessController';
import type { Request, Response, NextFunction } from 'express';

function mockRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

const mockNext: NextFunction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rentalProcessController.getInsights', () => {
  it('returns 200 with the list of insights', async () => {
    const fakeInsights = [
      { id: 'i-1', insightKey: 'budget', insightValue: 'R$ 2.500' },
      { id: 'i-2', insightKey: 'intent', insightValue: 'search' },
    ];
    mockGetProcessInsights.mockResolvedValueOnce({
      processId: '11111111-1111-1111-1111-111111111111',
      status: 'TRIAGE',
      insights: fakeInsights,
    });

    const req = {
      params: { id: '11111111-1111-1111-1111-111111111111' },
    } as unknown as Request;
    const res = mockRes();

    await rentalProcessController.getInsights(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as any).mock.calls[0][0];
    expect(payload.insights).toEqual(fakeInsights);
    expect(payload.status).toBe('TRIAGE');
  });

  it('returns 404 when rental process is not found', async () => {
    mockGetProcessInsights.mockResolvedValueOnce(null);

    const req = {
      params: { id: '11111111-1111-1111-1111-111111111111' },
    } as unknown as Request;
    const res = mockRes();

    await rentalProcessController.getInsights(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when id is not a uuid', async () => {
    const req = {
      params: { id: 'not-a-uuid' },
    } as unknown as Request;
    const res = mockRes();

    await rentalProcessController.getInsights(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockGetProcessInsights).not.toHaveBeenCalled();
  });

  it('forwards unexpected errors to next()', async () => {
    mockGetProcessInsights.mockRejectedValueOnce(new Error('db exploded'));

    const req = {
      params: { id: '11111111-1111-1111-1111-111111111111' },
    } as unknown as Request;
    const res = mockRes();

    await rentalProcessController.getInsights(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});
