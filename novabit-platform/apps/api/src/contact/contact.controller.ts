import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequestSecurityService } from '../security/request-security.service';
import { ContactService } from './contact.service';
import type { ContactResponse } from './contact.service';

@Controller('contact')
export class ContactController {
  constructor(
    private readonly contactService: ContactService,
    private readonly requestSecurityService: RequestSecurityService,
  ) {}

  @Post()
  async submit(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<ContactResponse> {
    await this.requestSecurityService.protectRequest({
      request,
      payload: body,
      scope: 'contact-submit',
      actionLabel: 'contact',
      limit: 6,
      windowMs: 15 * 60 * 1000,
    });

    return this.contactService.submit(body);
  }
}
