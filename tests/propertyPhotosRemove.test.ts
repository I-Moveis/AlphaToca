import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma BEFORE importing propertyService — the service imports prisma
// at module load. The $transaction mock proxies the same mocks into the tx
// object so assertions like `prisma.propertyImage.deleteMany` catch both the
// pre-tx and inside-tx calls consistently.
vi.mock('../src/config/db', () => {
  const property = {
    findUnique: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  };
  const propertyImage = {
    deleteMany: vi.fn(),
    update: vi.fn(),
    createMany: vi.fn(),
  };

  const $transaction = vi.fn(async (fn: (tx: any) => Promise<any>) =>
    fn({ property, propertyImage }),
  );

  return {
    default: { property, propertyImage, $transaction },
  };
});

// Storage is mocked — no disk I/O. savePropertyImages returns deterministic
// fake URLs so we can assert the cover rule on insert; cleanupPropertyImages
// resolves empty so the post-commit path is exercised without touching the fs.
const mockSavePropertyImages = vi.hoisted(() => vi.fn());
const mockCleanupPropertyImages = vi.hoisted(() => vi.fn());
vi.mock('../src/services/propertyImageStorageService', () => ({
  savePropertyImages: mockSavePropertyImages,
  cleanupPropertyImages: mockCleanupPropertyImages,
}));

import prisma from '../src/config/db';
import { propertyService, PropertyError } from '../src/services/propertyService';

const PROPERTY_ID = '33333333-3333-3333-3333-333333333333';
const OTHER_PROPERTY_ID = '44444444-4444-4444-4444-444444444444';
const LANDLORD_ID = '11111111-1111-1111-1111-111111111111';

function makeImage(overrides: Partial<any> = {}) {
  return {
    id: overrides.id ?? `img-${Math.random().toString(36).slice(2, 10)}`,
    propertyId: PROPERTY_ID,
    url: overrides.url ?? `/uploads/${PROPERTY_ID}/${Math.random().toString(36).slice(2)}.jpg`,
    isCover: overrides.isCover ?? false,
    caption: null,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
  };
}

function makePropertyRow(overrides: Partial<any> = {}) {
  return {
    id: PROPERTY_ID,
    landlordId: LANDLORD_ID,
    title: 'Test Property',
    description: 'Description',
    price: 3000,
    status: 'AVAILABLE',
    address: 'Rua X, 123',
    images: [],
    ...overrides,
  };
}

// Minimal Multer-file shape for the `files` arg.
function makeFile(name = 'new.jpg') {
  return {
    fieldname: 'photos',
    originalname: name,
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 4,
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  } as unknown as Express.Multer.File;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: findUniqueOrThrow returns whatever the test seeds via findUnique
  // unless overridden — keeps the "return value of updateProperty" path happy.
  (prisma.property.findUniqueOrThrow as any).mockImplementation(async () => ({
    id: PROPERTY_ID,
    landlordId: LANDLORD_ID,
    title: 'Test Property',
    description: 'Description',
    price: 3000,
    status: 'AVAILABLE',
    address: 'Rua X, 123',
    images: [],
  }));
  (prisma.property.update as any).mockResolvedValue({ id: PROPERTY_ID });
  (prisma.propertyImage.deleteMany as any).mockResolvedValue({ count: 0 });
  (prisma.propertyImage.update as any).mockResolvedValue({});
  (prisma.propertyImage.createMany as any).mockResolvedValue({ count: 0 });
  mockSavePropertyImages.mockResolvedValue([]);
  mockCleanupPropertyImages.mockResolvedValue(undefined);
});

describe('propertyService.updateProperty — photosToRemove (US-007)', () => {
  it('removes one of three existing photos, promotes oldest remaining to cover, and cleans storage after commit', async () => {
    const cover = makeImage({
      id: 'img-cover',
      url: '/uploads/prop/cover.jpg',
      isCover: true,
      createdAt: new Date('2026-01-03T00:00:00Z'),
    });
    const middle = makeImage({
      id: 'img-middle',
      url: '/uploads/prop/middle.jpg',
      isCover: false,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });
    const oldest = makeImage({
      id: 'img-oldest',
      url: '/uploads/prop/oldest.jpg',
      isCover: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    (prisma.property.findUnique as any).mockResolvedValue(
      makePropertyRow({ images: [cover, middle, oldest] }),
    );

    await propertyService.updateProperty(PROPERTY_ID, {
      photosToRemove: [cover.url],
    } as any);

    // Removed exactly the requested URL (and only from this property)
    expect(prisma.propertyImage.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.propertyImage.deleteMany).toHaveBeenCalledWith({
      where: { propertyId: PROPERTY_ID, url: { in: [cover.url] } },
    });

    // Cover reassigned to the oldest remaining image (by createdAt)
    expect(prisma.propertyImage.update).toHaveBeenCalledTimes(1);
    expect(prisma.propertyImage.update).toHaveBeenCalledWith({
      where: { id: 'img-oldest' },
      data: { isCover: true },
    });

    // Scalar update still ran (transaction commits)
    expect(prisma.property.update).toHaveBeenCalledTimes(1);

    // No new photos → createMany NOT called
    expect(prisma.propertyImage.createMany).not.toHaveBeenCalled();

    // Post-commit storage cleanup invoked with exactly the removed URLs
    expect(mockCleanupPropertyImages).toHaveBeenCalledTimes(1);
    expect(mockCleanupPropertyImages).toHaveBeenCalledWith(PROPERTY_ID, [cover.url]);
  });

  it('throws PropertyError(400, VALIDATION_ERROR) when a photosToRemove URL does not belong to the property and never opens a transaction', async () => {
    const ownImage = makeImage({
      id: 'img-own',
      url: '/uploads/prop/own.jpg',
      isCover: true,
    });
    (prisma.property.findUnique as any).mockResolvedValue(
      makePropertyRow({ images: [ownImage] }),
    );

    const foreignUrl = `/uploads/${OTHER_PROPERTY_ID}/foreign.jpg`;

    await expect(
      propertyService.updateProperty(PROPERTY_ID, {
        photosToRemove: [foreignUrl],
      } as any),
    ).rejects.toMatchObject({
      name: 'PropertyError',
      httpStatus: 400,
      code: 'VALIDATION_ERROR',
    });

    // No writes of any kind; no tx opened
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.propertyImage.deleteMany).not.toHaveBeenCalled();
    expect(prisma.propertyImage.update).not.toHaveBeenCalled();
    expect(prisma.property.update).not.toHaveBeenCalled();
    expect(mockCleanupPropertyImages).not.toHaveBeenCalled();
  });

  it('applies removals AND new-photo inserts atomically in a single PUT (combined flow)', async () => {
    const cover = makeImage({
      id: 'img-cover',
      url: '/uploads/prop/cover.jpg',
      isCover: true,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });
    const other = makeImage({
      id: 'img-other',
      url: '/uploads/prop/other.jpg',
      isCover: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    (prisma.property.findUnique as any).mockResolvedValue(
      makePropertyRow({ images: [cover, other] }),
    );

    mockSavePropertyImages.mockResolvedValue([
      { url: '/uploads/prop/new-a.jpg', isCover: true },
      { url: '/uploads/prop/new-b.jpg', isCover: false },
    ]);

    await propertyService.updateProperty(
      PROPERTY_ID,
      {
        title: 'Updated title via combined PUT',
        photosToRemove: [other.url],
      } as any,
      [makeFile('new-a.jpg'), makeFile('new-b.jpg')],
    );

    // Exactly one tx boundary wraps delete + update + insert
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Removal happened
    expect(prisma.propertyImage.deleteMany).toHaveBeenCalledWith({
      where: { propertyId: PROPERTY_ID, url: { in: [other.url] } },
    });

    // Cover was NOT promoted — the removed photo wasn't the cover
    expect(prisma.propertyImage.update).not.toHaveBeenCalled();

    // Scalar update included the title change
    expect(prisma.property.update).toHaveBeenCalledWith({
      where: { id: PROPERTY_ID },
      data: { title: 'Updated title via combined PUT' },
    });

    // New photos persisted with isCover=false for BOTH (property already has
    // a cover that survived removal — no silent cover replacement)
    expect(prisma.propertyImage.createMany).toHaveBeenCalledTimes(1);
    const createManyArg = (prisma.propertyImage.createMany as any).mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(2);
    expect(createManyArg.data[0]).toMatchObject({
      propertyId: PROPERTY_ID,
      url: '/uploads/prop/new-a.jpg',
      isCover: false,
    });
    expect(createManyArg.data[1]).toMatchObject({
      propertyId: PROPERTY_ID,
      url: '/uploads/prop/new-b.jpg',
      isCover: false,
    });

    // Storage: both the new-photo save AND the post-commit removal cleanup ran
    expect(mockSavePropertyImages).toHaveBeenCalledTimes(1);
    expect(mockCleanupPropertyImages).toHaveBeenCalledWith(PROPERTY_ID, [other.url]);
  });

  it('promotes the first new photo to cover when the cover is removed AND no existing image remains', async () => {
    const cover = makeImage({
      id: 'img-only',
      url: '/uploads/prop/only.jpg',
      isCover: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    (prisma.property.findUnique as any).mockResolvedValue(
      makePropertyRow({ images: [cover] }),
    );

    mockSavePropertyImages.mockResolvedValue([
      { url: '/uploads/prop/replacement.jpg', isCover: true },
    ]);

    await propertyService.updateProperty(
      PROPERTY_ID,
      { photosToRemove: [cover.url] } as any,
      [makeFile('replacement.jpg')],
    );

    // No existing image to promote — tx does NOT call propertyImage.update
    expect(prisma.propertyImage.update).not.toHaveBeenCalled();

    // Incoming single photo becomes the new cover (no cover after removal)
    const createManyArg = (prisma.propertyImage.createMany as any).mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(1);
    expect(createManyArg.data[0]).toMatchObject({
      url: '/uploads/prop/replacement.jpg',
      isCover: true,
    });
  });

  it('dedupes repeated URLs in photosToRemove so deleteMany runs once and cleanup fires once', async () => {
    const cover = makeImage({
      id: 'img-cover',
      url: '/uploads/prop/cover.jpg',
      isCover: true,
    });
    (prisma.property.findUnique as any).mockResolvedValue(
      makePropertyRow({ images: [cover] }),
    );

    await propertyService.updateProperty(PROPERTY_ID, {
      photosToRemove: [cover.url, cover.url, cover.url],
    } as any);

    const deleteArg = (prisma.propertyImage.deleteMany as any).mock.calls[0][0];
    expect(deleteArg.where.url.in).toHaveLength(1);
    expect(deleteArg.where.url.in[0]).toBe(cover.url);

    expect(mockCleanupPropertyImages).toHaveBeenCalledTimes(1);
    const cleanupUrls = mockCleanupPropertyImages.mock.calls[0][1];
    expect(cleanupUrls).toHaveLength(1);
  });

  it('returns null when the property does not exist (no validation, no tx)', async () => {
    (prisma.property.findUnique as any).mockResolvedValue(null);

    const result = await propertyService.updateProperty(
      PROPERTY_ID,
      { photosToRemove: ['/uploads/prop/anything.jpg'] } as any,
    );

    expect(result).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT invoke post-commit storage cleanup when the tx fails mid-flight (rollback path)', async () => {
    const cover = makeImage({
      id: 'img-cover',
      url: '/uploads/prop/cover.jpg',
      isCover: true,
    });
    (prisma.property.findUnique as any).mockResolvedValue(
      makePropertyRow({ images: [cover] }),
    );

    // Simulate the scalar update failing inside the tx — $transaction throws.
    (prisma.property.update as any).mockRejectedValueOnce(
      new Error('simulated DB failure'),
    );

    await expect(
      propertyService.updateProperty(PROPERTY_ID, {
        photosToRemove: [cover.url],
      } as any),
    ).rejects.toThrow('simulated DB failure');

    // Because the tx threw, we never reached the post-commit cleanup block.
    expect(mockCleanupPropertyImages).not.toHaveBeenCalled();
  });
});

describe('propertyService.PropertyError export', () => {
  it('exposes PropertyError as a distinct class with httpStatus + code', () => {
    const err = new PropertyError(400, 'VALIDATION_ERROR', 'example');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PropertyError);
    expect(err.httpStatus).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('PropertyError');
  });
});
