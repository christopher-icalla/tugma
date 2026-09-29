import { Injectable, Logger } from '@nestjs/common';
import { hashPassword, verifyPassword } from '../auth/auth.controller';
import { config, DEMO_ORG_ID } from '../config';
import { EngineService } from '../engine/engine.service';
import { PrismaService } from '../prisma.service';
import { generateTransactions, TOTAL } from './dataset';
import {
  CONTROL_TESTS, CONTROLS, DEMO_USERS, organization, REGULATORY_REQUIREMENTS, regulatorySources, vendors,
} from './reference-data';

const CHUNK = 1_000;

/**
 * Idempotent startup seeding: users, static reference data, the 10k synthetic
 * dataset and a baseline control run. Safe to run on every boot.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger('Seed');

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: EngineService,
  ) {}

  async run() {
    await this.seedStatic();
    await this.seedUsers();
    const regenerated = await this.ensureDataset();
    const hasRuns = (await this.prisma.controlTestRun.count()) > 0;
    if (regenerated || !hasRuns) {
      const result = await this.engine.runAllControls('startup');
      this.logger.log(`Control engine baseline run: ${result.exceptions} exceptions detected.`);
    } else {
      await this.engine.buildDraftPackage(new Date());
    }
    this.logger.log('Startup complete: users, reference data, 10k dataset and control results ready.');
  }

  async seedStatic() {
    const now = new Date();
    const org = organization(now);
    await this.prisma.organization.upsert({ where: { id: org.id }, update: org, create: org });
    for (const s of regulatorySources(now)) {
      await this.prisma.regulatorySource.upsert({ where: { id: s.id }, update: s, create: s });
    }
    for (const r of REGULATORY_REQUIREMENTS) {
      await this.prisma.regulatoryRequirement.upsert({ where: { id: r.id }, update: r, create: r });
    }
    for (const c of CONTROLS) {
      const id = `ctl-${c.control_code.toLowerCase()}`;
      const data = {
        ...c, id, organization_id: DEMO_ORG_ID, primary: c.control_code === 'CTRL-005',
        created_at: new Date(now.getTime() - 90 * 86_400_000), updated_at: new Date(now.getTime() - 86_400_000),
      };
      await this.prisma.control.upsert({ where: { id }, update: data, create: data });
      const test = CONTROL_TESTS[c.control_code];
      if (test) {
        const t = { id: `tst-${c.control_code.toLowerCase()}`, control_id: id, ...test };
        await this.prisma.controlTest.upsert({ where: { id: t.id }, update: t, create: t });
      }
    }
    for (const v of vendors(now)) {
      await this.prisma.vendor.upsert({ where: { id: v.id }, update: v, create: v });
    }
  }

  async seedUsers() {
    const { ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_USER_PASSWORD } = config();
    const adminEmail = ADMIN_EMAIL.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      // Rename the single existing demo-org ADMIN instead of creating a duplicate.
      const admins = await this.prisma.user.findMany({ where: { organization_id: DEMO_ORG_ID, role: 'ADMIN' }, take: 2 });
      if (admins.length === 1) {
        await this.prisma.user.update({
          where: { id: admins[0].id },
          data: { email: adminEmail, password_hash: hashPassword(ADMIN_PASSWORD), token_version: { increment: 1 } },
        });
      } else {
        await this.prisma.user.create({
          data: {
            email: adminEmail, password_hash: hashPassword(ADMIN_PASSWORD), name: 'TUGMA Administrator',
            role: 'ADMIN', title: 'Administrator', organization_id: DEMO_ORG_ID,
          },
        });
      }
    } else if (!verifyPassword(ADMIN_PASSWORD, existing.password_hash)) {
      await this.prisma.user.update({ where: { email: adminEmail }, data: { password_hash: hashPassword(ADMIN_PASSWORD) } });
    }

    for (const u of DEMO_USERS) {
      if (await this.prisma.user.findUnique({ where: { email: u.email } })) continue;
      await this.prisma.user.create({
        data: { ...u, password_hash: hashPassword(DEMO_USER_PASSWORD), organization_id: DEMO_ORG_ID },
      });
    }
  }

  /** (Re)generate the dataset only when the table doesn't hold exactly 10,000 rows. */
  async ensureDataset(): Promise<boolean> {
    const count = await this.prisma.paymentTransaction.count({ where: { organization_id: DEMO_ORG_ID } });
    if (count === TOTAL) return false;
    const txns = generateTransactions();
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.deleteMany({ where: { organization_id: DEMO_ORG_ID } });
      for (let i = 0; i < txns.length; i += CHUNK) {
        await tx.paymentTransaction.createMany({ data: txns.slice(i, i + CHUNK) });
      }
    }, { timeout: 120_000 });
    this.logger.log(`Generated ${txns.length} synthetic transactions.`);
    return true;
  }
}
