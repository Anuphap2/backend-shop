import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { PRODUCT_IMAGE } from './products.constants';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('image')) // ชื่อฟิลด์ที่รับไฟล์จาก form-data “image”
  create(
    @Body() dto: CreateProductDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: PRODUCT_IMAGE.MAX_SIZE }),
        ],
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.productsService.create(dto, file);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('image')) // 1. ต้องมีตัวนี้เพื่อดักจับไฟล์จาก FormData
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    // 2. รับไฟล์เข้ามา (ตั้ง fileIsRequired: false เพราะการแก้ไขอาจจะไม่เปลี่ยนรูปก็ได้)
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: PRODUCT_IMAGE.MAX_SIZE }),
        ],
      }),
    )
    file?: Express.Multer.File, // 3. ตัวแปรรับไฟล์
  ) {
    console.log('ไฟล์ที่ส่งมา:', file); // ลอง log ดูว่าไฟล์มาไหม
    // 4. ส่งไฟล์ต่อไปให้ Service
    return this.productsService.update(id, updateProductDto, file);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
