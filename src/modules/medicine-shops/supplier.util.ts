import { AppDataSource } from '../../config/database';
import { MedicineShopSupplier } from '../../entities/MedicineShopSupplier';
import { AppError } from '../../utils/app-error';

export interface SupplierInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export function extractSupplierFieldsFromBody(
  body: Record<string, unknown>,
): SupplierInput {
  const fields: SupplierInput = {};
  if (typeof body.name === 'string') fields.name = body.name;
  if ('phone' in body) fields.phone = (body.phone as string | null) ?? null;
  if ('email' in body) fields.email = (body.email as string | null) ?? null;
  if ('notes' in body) fields.notes = (body.notes as string | null) ?? null;
  if (typeof body.isActive === 'boolean') fields.isActive = body.isActive;
  return fields;
}

function applySupplierFields(
  supplier: MedicineShopSupplier,
  data: SupplierInput,
): void {
  if (data.name !== undefined) supplier.name = data.name;
  if (data.phone !== undefined) supplier.phone = data.phone ?? undefined;
  if (data.email !== undefined) supplier.email = data.email ?? undefined;
  if (data.notes !== undefined) supplier.notes = data.notes ?? undefined;
  if (data.isActive !== undefined) supplier.isActive = data.isActive;
}

export async function listSuppliers(shopId: string): Promise<MedicineShopSupplier[]> {
  return AppDataSource.getRepository(MedicineShopSupplier).find({
    where: { shopId },
    order: { name: 'ASC' },
  });
}

export async function createSupplier(
  shopId: string,
  tenantId: string,
  data: SupplierInput,
): Promise<MedicineShopSupplier> {
  if (!data.name) throw AppError.badRequest('name is required');
  const repo = AppDataSource.getRepository(MedicineShopSupplier);
  const supplier = repo.create({ shopId, tenantId, name: data.name });
  applySupplierFields(supplier, data);
  return repo.save(supplier);
}

export async function updateSupplier(
  shopId: string,
  supplierId: string,
  data: SupplierInput,
): Promise<MedicineShopSupplier> {
  const repo = AppDataSource.getRepository(MedicineShopSupplier);
  const supplier = await repo.findOne({ where: { id: supplierId, shopId } });
  if (!supplier) throw AppError.notFound('Supplier');
  applySupplierFields(supplier, data);
  return repo.save(supplier);
}

export async function deleteSupplier(shopId: string, supplierId: string): Promise<void> {
  const repo = AppDataSource.getRepository(MedicineShopSupplier);
  const result = await repo.delete({ id: supplierId, shopId });
  if (!result.affected) throw AppError.notFound('Supplier');
}
