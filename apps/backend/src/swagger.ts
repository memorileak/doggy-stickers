import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function initializeSwagger(
  configService: ConfigService,
  app: INestApplication,
): void {
  const config = new DocumentBuilder()
    .setTitle('Ecommerce User service')
    .setDescription('Ecommerce SSO')
    .setVersion('1.0')
    .addTag('Auth')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(configService.get('SWAGGER_PATH'), app, document, {
    swaggerOptions: { displayOperationId: true },
  });
}
