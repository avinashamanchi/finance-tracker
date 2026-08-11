import type { Ledger, Transaction } from '../domain/types';
import { transactionCsvHeader, transactionToCsvRow } from './csv';
import type { ArtifactStore } from './artifacts';
import {
  BACKUP_PAGE_SIZE,
  type ArtifactReceipt,
  type StableBackupRepository,
} from './backupExporter';

const encoder = new TextEncoder();

export async function exportCsv(options: Readonly<{
  repository: StableBackupRepository;
  artifacts: Pick<ArtifactStore, 'createBinary' | 'remove'>;
}>): Promise<ArtifactReceipt> {
  const artifact = await options.artifacts.createBinary('finova-transactions', 'csv');
  try {
    const receipt = await options.repository.withStableBackupSnapshot(async (source) => {
      const counts = await source.countRecords();
      if (counts.ledger !== 1) throw new Error('Finova ledger is unavailable for CSV export.');
      const ledgerPage = await source.readRecordPage('ledger', null, 2);
      const record = ledgerPage.records[0];
      if (ledgerPage.records.length !== 1 || record?.kind !== 'ledger' || ledgerPage.nextCursor !== null) {
        throw new Error('Finova ledger is unavailable for CSV export.');
      }
      const ledger: Ledger = {
        id: record.id,
        name: record.name,
        currencyCode: record.currencyCode,
        currencyMinorUnit: record.currencyMinorUnit as Ledger['currencyMinorUnit'],
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
      await artifact.write(encoder.encode(transactionCsvHeader(ledger)));
      let cursor: number | null = null;
      let recordCount = 0;
      do {
        const page = await source.readRecordPage('transaction', cursor, BACKUP_PAGE_SIZE);
        if (page.records.length > BACKUP_PAGE_SIZE) {
          throw new Error('Finova CSV source exceeded its page bound.');
        }
        const rows: string[] = [];
        for (const supplied of page.records) {
          if (supplied.kind !== 'transaction') throw new Error('Finova CSV source is invalid.');
          const transaction: Transaction = {
            id: supplied.id,
            kind: supplied.transactionKind,
            amountMinor: supplied.amountMinor,
            categoryId: supplied.categoryId as Transaction['categoryId'],
            description: supplied.description,
            occurredOn: supplied.occurredOn,
            isRecurring: supplied.isRecurring,
            createdAt: supplied.createdAt,
            updatedAt: supplied.updatedAt,
          };
          rows.push(transactionToCsvRow(transaction, ledger));
          recordCount += 1;
        }
        if (rows.length > 0) await artifact.write(encoder.encode(rows.join('')));
        if (
          page.nextCursor !== null
          && (!Number.isSafeInteger(page.nextCursor) || page.nextCursor < 1 || page.nextCursor === cursor)
        ) throw new Error('Finova CSV cursor is invalid.');
        cursor = page.nextCursor;
      } while (cursor !== null);
      if (recordCount !== counts.transaction) {
        throw new Error('Finova transactions changed during CSV export.');
      }
      return { uri: artifact.uri, byteCount: artifact.size, recordCount };
    });
    await artifact.close();
    return receipt;
  } catch (error) {
    await artifact.close().catch(() => undefined);
    await options.artifacts.remove(artifact.uri).catch(() => undefined);
    throw error;
  }
}
