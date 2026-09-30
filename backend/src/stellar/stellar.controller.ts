import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public, PublicUser, RequirePerm } from '../auth/auth.guard';
import { parse } from '../common/util';
import { PrismaService } from '../prisma.service';
import { AttestationService } from './attestation.service';

const ChallengeInput = z.object({ address: z.string().trim() });
const LinkInput = z.object({ challenge: z.string(), signature: z.string().min(1) });
const SubmitInput = z.object({ pending_id: z.string().uuid(), signed_xdr: z.string().min(1) });

@Controller('api/stellar')
export class StellarController {
  constructor(
    private readonly attestations: AttestationService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('config')
  config() {
    return this.attestations.publicConfig();
  }

  /** Public: anyone holding a package hash can check it against the contract. */
  @Public()
  @Get('verify/:hash')
  verify(@Param('hash') hash: string) {
    return this.attestations.verifyHash(hash);
  }

  @Get('attestations')
  async list(@CurrentUser() user: PublicUser) {
    const attestations = await this.prisma.stellarAttestation.findMany({
      where: { organization_id: user.organization_id },
      orderBy: [{ submitted_at: 'desc' }, { version: 'desc' }],
    });
    return { attestations };
  }

  // ------------------------------------------------------------- wallet

  @Get('wallet')
  wallet(@CurrentUser() user: PublicUser) {
    return this.attestations.walletStatus(user);
  }

  @Post('wallet/challenge')
  @HttpCode(200)
  challenge(@CurrentUser() user: PublicUser, @Body() body: unknown) {
    return this.attestations.challenge(user, parse(ChallengeInput, body).address);
  }

  @Post('wallet/link')
  @HttpCode(200)
  link(@CurrentUser() user: PublicUser, @Body() body: unknown) {
    const input = parse(LinkInput, body);
    return this.attestations.link(user, input.challenge, input.signature);
  }

  @Delete('wallet')
  unlink(@CurrentUser() user: PublicUser) {
    return this.attestations.unlink(user);
  }

  @Get('signers')
  @RequirePerm('signers:manage')
  signers(@CurrentUser() user: PublicUser) {
    return this.attestations.signerOverview(user);
  }

  // ------------------------------------------------------- attestations

  @Post('packages/:id/attest/prepare')
  @HttpCode(200)
  @RequirePerm('package:attest')
  prepareAttest(@CurrentUser() user: PublicUser, @Param('id') id: string) {
    return this.attestations.prepareAttest(user, id);
  }

  @Post('packages/:id/countersign/prepare')
  @HttpCode(200)
  @RequirePerm('package:countersign')
  prepareCountersign(@CurrentUser() user: PublicUser, @Param('id') id: string) {
    return this.attestations.prepareCountersign(user, id);
  }

  @Post('packages/:id/sync')
  @HttpCode(200)
  @RequirePerm('package:attest')
  sync(@CurrentUser() user: PublicUser, @Param('id') id: string) {
    return this.attestations.sync(user, id);
  }

  /** Role is re-checked through the pending transaction, which only its preparer can submit. */
  @Post('submit')
  @HttpCode(200)
  submit(@CurrentUser() user: PublicUser, @Body() body: unknown) {
    const input = parse(SubmitInput, body);
    return this.attestations.submit(user, input.pending_id, input.signed_xdr);
  }
}
