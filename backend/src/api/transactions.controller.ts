import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser, PublicUser } from '../auth/auth.guard';
import { parse } from '../common/util';
import { PrismaService } from '../prisma.service';

const SORTABLE = ['transaction_timestamp', 'transaction_amount', 'merchant_id', 'transaction_id'] as const;

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  payment_status: z.string().optional(),
  risk_status: z.string().optional(),
  control: z.string().optional(),
  test_status: z.string().optional(),
  has_exception: z.string().optional(),
  sort: z.string().optional(),
  direction: z.string().optional(),
});

@Controller('api/transactions')
export class TransactionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: PublicUser, @Query() query: unknown) {
    const q = parse(ListQuery, query);
    const where: Prisma.PaymentTransactionWhereInput = { organization_id: user.organization_id };
    if (q.search) {
      where.OR = [
        { transaction_id: { contains: q.search, mode: 'insensitive' } },
        { merchant_id: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.payment_status) where.payment_status = q.payment_status;
    if (q.risk_status) where.risk_status = q.risk_status;
    if (q.control) where.failed_controls = { has: q.control.toUpperCase() };
    if (q.test_status) where.test_status = q.test_status;
    if (q.has_exception === 'true' || q.has_exception === 'false') where.has_exception = q.has_exception === 'true';

    const sortField = (SORTABLE as readonly string[]).includes(q.sort ?? '') ? q.sort! : 'transaction_timestamp';
    const dir: Prisma.SortOrder = q.direction === 'asc' ? 'asc' : 'desc';

    const [total, transactions] = await Promise.all([
      this.prisma.paymentTransaction.count({ where }),
      this.prisma.paymentTransaction.findMany({
        where,
        orderBy: [{ [sortField]: dir }, { transaction_id: 'asc' }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
      }),
    ]);
    return { transactions, total, page: q.page, page_size: q.page_size, pages: Math.ceil(total / q.page_size) };
  }

  @Get(':transactionId')
  async detail(@Param('transactionId') transactionId: string, @CurrentUser() user: PublicUser) {
    const orgId = user.organization_id;
    const transaction = await this.prisma.paymentTransaction.findFirst({ where: { organization_id: orgId, transaction_id: transactionId } });
    if (!transaction) throw new NotFoundException(`Transaction ${transactionId} not found.`);
    const exceptions = await this.prisma.controlException.findMany({
      where: { organization_id: orgId, transaction_id: transactionId },
      take: 50,
    });
    // Reconstruct which controls evaluated this transaction and their result.
    const control_results = ['CTRL-005', 'CTRL-002', 'CTRL-004'].map((code) => {
      const failed = transaction.failed_controls.includes(code);
      const result =
        code === 'CTRL-005' && transaction.payment_status !== 'SETTLED'
          ? 'NOT_TESTABLE'
          : failed
            ? code === 'CTRL-004' ? 'WARNING' : 'FAIL'
            : 'PASS';
      return { control_code: code, result };
    });
    return { transaction, exceptions, control_results };
  }
}
