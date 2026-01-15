/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { Model } from 'mongoose';

import { safeUnlinkByRelativePath } from '../common/utils/file.utils';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ProductsService {
  // Inject Product Model เข้ามาใช้งาน โดยเก็บไว้ในตัวแปรชื่อ productModel
  constructor(
    @InjectModel(Product.name) private productModel: Model<Product>,
  ) {}

  private toPublicImagePath(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/'); // กัน Windows path
    // ตัด 'uploads/' หรือ './uploads/' ออกให้หมด
    return normalized.replace(/^\.?\/?uploads\//, '').replace(/^uploads\//, '');
  }

  // --- สร้างสินค้า (Create) ---
  async create(dto: CreateProductDto, file?: Express.Multer.File) {
    const diskPath = file?.path?.replace(/\\/g, '/'); // เช่น uploads/products/uuid.jpg
    const imageUrl = diskPath ? this.toPublicImagePath(diskPath) : undefined; // products/uuid.jpg

    try {
      return await this.productModel.create({
        ...dto,
        ...(imageUrl ? { imageUrl } : {}),
      });
    } catch (err) {
      if (diskPath) await safeUnlinkByRelativePath(diskPath); // ลบ “disk path” เท่านั้น
      throw new InternalServerErrorException('Create product failed');
    }
  }

  // --- ดึงสินค้าทั้งหมด (Read All) ---
  // async = ฟังก์ชันแบบอะซิงโครนัส เพื่อไม่ต้องรอการทำงานของ Database
  async findAll(query: any): Promise<Product[]> {
    const validParams = [
      'name',
      'color',
      'minPrice',
      'maxPrice',
      'sortBy',
      'orderBy',
    ];

    // 1. Validate query keys
    for (const key of Object.keys(query)) {
      if (!validParams.includes(key)) {
        throw new BadRequestException(`Invalid query parameter: ${key}`);
      }
    }

    const { name, color, minPrice, maxPrice, sortBy, orderBy } = query;
    const filters: any = {};

    // 2. Name search
    if (name) {
      filters.name = { $regex: name, $options: 'i' };
    }

    // 3. Color (single / multiple)
    if (color) {
      let colors: string[] = [];

      if (Array.isArray(color)) {
        colors = color;
      } else if (typeof color === 'string') {
        colors = color.split(',');
      }

      filters.color = {
        $in: colors.map((c) => c.trim().toLowerCase()),
      };
    }

    // 4. Price range
    if (minPrice || maxPrice) {
      filters.price = {};
      if (minPrice) filters.price.$gte = Number(minPrice);
      if (maxPrice) filters.price.$lte = Number(maxPrice);
    }

    // 5. Sorting
    const allowedSort = ['name', 'price', 'color', 'createdAt'];
    const sortField = allowedSort.includes(sortBy) ? sortBy : 'createdAt';
    let order = 'asc';

    if (orderBy) {
      order = orderBy.toLowerCase();
      if (!['asc', 'desc'].includes(order)) {
        throw new BadRequestException('orderBy must be asc or desc');
      }
    }

    const sortOrder = order === 'desc' ? -1 : 1;

    return this.productModel
      .find(filters)
      .sort({ [sortField]: sortOrder })
      .exec();
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productModel.findById(id).exec();

    if (!product) {
      throw new Error('Product not found');
    }
    return product;
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    file?: Express.Multer.File,
  ) {
    // 1. เตรียมข้อมูลที่จะอัปเดต
    const dataToUpdate: any = { ...updateProductDto };

    // 2. เช็คว่ามีไฟล์ส่งมาไหม
    if (file) {
      // แปลง path ตามสูตรเดิมของพู่กัน (ใช้ toPublicImagePath หรือ replace เองก็ได้)
      const diskPath = file.path.replace(/\\/g, '/');
      const imagePath = this.toPublicImagePath(diskPath); // เรียกใช้ฟังก์ชันตัด path ที่มีอยู่แล้ว

      dataToUpdate.image = imagePath;
    }

    // 3. สั่ง Update
    const updatedProduct = await this.productModel.findByIdAndUpdate(
      id,
      dataToUpdate,
      { new: true },
    );

    if (!updatedProduct) {
      // ถ้าหาไม่เจอ และอัปไฟล์ไปแล้ว ควรลบทิ้งด้วย (Optional)
      if (file) await safeUnlinkByRelativePath(file.path);
      throw new NotFoundException(`Product #${id} not found`);
    }

    return updatedProduct;
  }

  async remove(id: string): Promise<Product> {
    // 1. ลบข้อมูลออกจาก Database ก่อน
    const deletedProduct = await this.productModel.findByIdAndDelete(id).exec();

    // 2. ถ้าหาไม่เจอ หรือลบไม่ได้ ให้แจ้ง Error
    if (!deletedProduct) {
      throw new NotFoundException(`Product id: ${id} not found`);
    }

    // 3. ⭐ จุดสำคัญ: ลบไฟล์รูปภาพออกจากเครื่อง (ถ้ามีรูป)
    if (deletedProduct.imageUrl) {
      // Path ใน DB อาจจะเป็น "products/xxx.jpg"
      // แต่ไฟล์จริงอยู่ที่ "uploads/products/xxx.jpg"
      // เลยต้องต่อ string ให้ถูก path จริง

      // เช็คว่า path ใน db มีคำว่า uploads หรือยัง ถ้ายังให้เติม
      const imagePath = deletedProduct.imageUrl.startsWith('uploads/')
        ? deletedProduct.imageUrl
        : `uploads/${deletedProduct.imageUrl}`;

      // เรียกฟังก์ชันลบไฟล์ (ที่คุณ import เข้ามาแล้วข้างบน)
      await safeUnlinkByRelativePath(imagePath);

      console.log('🗑️ Deleted image file:', imagePath);
    }

    return deletedProduct;
  }
}
