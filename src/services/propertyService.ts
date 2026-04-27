import prisma from '../config/db';
import { Property, PropertyStatus, PropertyType, Prisma } from '@prisma/client';
import { CreatePropertyInput, UpdatePropertyInput } from '../utils/propertyValidation';

export interface PropertySearchParams {
  type?: PropertyType;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  minParkingSpots?: number;
  minArea?: number;
  maxArea?: number;
  isFurnished?: boolean;
  petsAllowed?: boolean;
  nearSubway?: boolean;
  isFeatured?: boolean;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  orderBy?: 'createdAt' | 'views' | 'priceAsc' | 'priceDesc' | 'isFeatured' | 'nearest';
  page?: number;
  limit?: number;
}

export const propertyService = {
  async createProperty(data: CreatePropertyInput): Promise<Property> {
    return prisma.property.create({
      data,
    });
  },

  async listProperties(): Promise<Property[]> {
    return prisma.property.findMany({
      orderBy: { id: 'asc' },
    });
  },

  async searchProperties(params: PropertySearchParams) {
    const {
      type,
      minPrice,
      maxPrice,
      minBedrooms,
      minBathrooms,
      minParkingSpots,
      minArea,
      maxArea,
      isFurnished,
      petsAllowed,
      nearSubway,
      isFeatured,
      city,
      state,
      lat,
      lng,
      radius,
      orderBy = 'isFeatured',
      page = 1,
      limit = 10,
    } = params;

    const skip = (page - 1) * limit;

    const where: Prisma.PropertyWhereInput = {
      status: PropertyStatus.AVAILABLE,
      ...(type && { type }),

      ...((minPrice || maxPrice) && {
        price: {
          ...(minPrice && { gte: minPrice }),
          ...(maxPrice && { lte: maxPrice }),
        },
      }),

      ...(minBedrooms && { bedrooms: { gte: minBedrooms } }),
      ...(minBathrooms && { bathrooms: { gte: minBathrooms } }),
      ...(minParkingSpots && { parkingSpots: { gte: minParkingSpots } }),

      ...((minArea || maxArea) && {
        area: {
          ...(minArea && { gte: minArea }),
          ...(maxArea && { lte: maxArea }),
        },
      }),

      ...(isFurnished !== undefined && { isFurnished }),
      ...(petsAllowed !== undefined && { petsAllowed }),
      ...(nearSubway !== undefined && { nearSubway }),
      ...(isFeatured !== undefined && { isFeatured }),
      ...(city && { city: { equals: city, mode: 'insensitive' } }),
      ...(state && { state: { equals: state, mode: 'insensitive' } }),
    };

    let sort: Prisma.PropertyOrderByWithRelationInput = { isFeatured: 'desc' };
    if (orderBy === 'createdAt') sort = { createdAt: 'desc' };
    else if (orderBy === 'views') sort = { views: 'desc' };
    else if (orderBy === 'priceAsc') sort = { price: 'asc' };
    else if (orderBy === 'priceDesc') sort = { price: 'desc' };


    const hasLocation = lat !== undefined && lng !== undefined;


    const finalOrderBy = (orderBy === 'nearest' && !hasLocation) ? 'isFeatured' : orderBy;

    if (hasLocation || finalOrderBy === 'nearest') {
      const radiusFilter = radius ? Prisma.sql`AND (6371 * acos(cos(radians(${lat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lng})) + sin(radians(${lat})) * sin(radians(latitude)))) <= ${radius}` : Prisma.empty;
      
      const cityFilter = city ? Prisma.sql`AND city ILIKE ${city}` : Prisma.empty;
      const stateFilter = state ? Prisma.sql`AND state ILIKE ${state}` : Prisma.empty;

      const distanceSql = hasLocation
        ? Prisma.sql`(6371 * acos(cos(radians(${lat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lng})) + sin(radians(${lat})) * sin(radians(latitude))))`
        : Prisma.sql`0`;

      const orderBySql = finalOrderBy === 'nearest'
        ? Prisma.sql`distance ASC`
        : finalOrderBy === 'priceAsc' ? Prisma.sql`price ASC`
          : finalOrderBy === 'priceDesc' ? Prisma.sql`price DESC`
            : finalOrderBy === 'views' ? Prisma.sql`views DESC`
              : Prisma.sql`is_featured DESC, created_at DESC`;


      const properties = await prisma.$queryRaw<any[]>`
        SELECT *, ${distanceSql} as distance
        FROM "properties"
        WHERE status = 'AVAILABLE'
        ${radiusFilter}
        ${cityFilter}
        ${stateFilter}
        ORDER BY ${orderBySql}
        LIMIT ${limit} OFFSET ${skip}
      `;

      const totalResult = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count FROM "properties" WHERE status = 'AVAILABLE' ${radiusFilter} ${cityFilter} ${stateFilter}
      `;
      const total = Number(totalResult[0].count);

      return {
        data: properties,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const [total, properties] = await Promise.all([
      prisma.property.count({ where }),
      prisma.property.findMany({
        where,
        orderBy: [sort, { id: 'asc' }],
        skip,
        take: limit,
        include: {
          images: {
            where: { isCover: true },
            take: 1
          }
        }
      }),
    ]);

    return {
      data: properties,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getPropertyById(id: string): Promise<Property | null> {
    return prisma.property.findUnique({
      where: { id },
      include: { images: true }
    });
  },

  async updateProperty(id: string, data: UpdatePropertyInput): Promise<Property | null> {
    const exists = await prisma.property.findUnique({ where: { id } });
    if (!exists) return null;

    return prisma.property.update({
      where: { id },
      data,
    });
  },

  async deleteProperty(id: string): Promise<boolean> {
    try {
      await prisma.property.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      return false;
    }
  }
};
